//! The deck machine's meet database: one JSON document per meet in the app
//! data directory, written atomically (temp file + fsync + rename) with the
//! previous version kept as `.bak`. Every race pulled from the timer is also
//! appended to a per-meet journal, so raw timing survives even if the meet
//! document is lost.

use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const MAX_MEET_BYTES: u64 = 64 * 1024 * 1024;

#[derive(Debug, thiserror::Error, Serialize)]
#[serde(tag = "kind", content = "message", rename_all = "camelCase")]
pub enum StoreError {
    #[error("Invalid meet id.")]
    BadId,
    #[error("Meet not found.")]
    NotFound,
    #[error("That file isn't a Lane4 meet backup.")]
    NotAMeet,
    #[error("This meet file is already readable.")]
    NotDamaged,
    #[error("{0}")]
    Io(String),
}

impl From<std::io::Error> for StoreError {
    fn from(e: std::io::Error) -> Self {
        if e.kind() == std::io::ErrorKind::NotFound {
            StoreError::NotFound
        } else {
            StoreError::Io(e.to_string())
        }
    }
}

pub fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

fn check_id(id: &str) -> Result<(), StoreError> {
    if valid_id(id) {
        Ok(())
    } else {
        Err(StoreError::BadId)
    }
}

pub fn meets_dir(app: &AppHandle) -> Result<PathBuf, StoreError> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| StoreError::Io(e.to_string()))?
        .join("meets");
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

/// Replace `path` with `contents`, keeping the previous file as `.json.bak`.
pub fn write_atomic(path: &Path, contents: &[u8]) -> std::io::Result<()> {
    write_atomic_with_backup(path, contents, true)
}

/// Replace `path` with `contents` so a crash leaves either the old or the new
/// file. Each write gets its own temp file, so concurrent writes to the same
/// path can't rename each other's temp file away. `backup` copies the current
/// file to `.json.bak` first; restoring a meet passes `false` so the good
/// backup isn't replaced by the damaged file.
pub fn write_atomic_with_backup(path: &Path, contents: &[u8], backup: bool) -> std::io::Result<()> {
    static NEXT: AtomicU64 = AtomicU64::new(0);
    let n = NEXT.fetch_add(1, Ordering::Relaxed);
    let tmp = path.with_extension(format!("{}.{n}.tmp", std::process::id()));
    {
        let mut file = File::create(&tmp)?;
        file.write_all(contents)?;
        file.sync_all()?;
    }
    if backup && path.exists() {
        fs::copy(path, path.with_extension("json.bak"))?;
    }
    fs::rename(&tmp, path)?;
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MeetHeader {
    id: String,
    name: String,
    start_date: Option<String>,
    end_date: Option<String>,
    course: Option<String>,
    updated_at: Option<String>,
    #[serde(default)]
    teams: Vec<serde_json::Value>,
    #[serde(default)]
    events: Vec<serde_json::Value>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeetSummary {
    id: String,
    name: String,
    start_date: Option<String>,
    end_date: Option<String>,
    course: Option<String>,
    updated_at: Option<String>,
    teams: usize,
    events: usize,
    /// The JSON file doesn't parse as this meet. `name` comes from the backup
    /// when there is one.
    corrupt: bool,
    /// A `.json.bak` next to the file parses as this same meet.
    has_backup: bool,
    /// Non-empty lines in the timing journal.
    journal_lines: usize,
}

fn summarize(bytes: &[u8]) -> Option<MeetSummary> {
    let h: MeetHeader = serde_json::from_slice(bytes).ok()?;
    if !valid_id(&h.id) {
        return None;
    }
    Some(MeetSummary {
        id: h.id,
        name: h.name,
        start_date: h.start_date,
        end_date: h.end_date,
        course: h.course,
        updated_at: h.updated_at,
        teams: h.teams.len(),
        events: h.events.len(),
        corrupt: false,
        has_backup: false,
        journal_lines: 0,
    })
}

fn journal_line_count(dir: &Path, id: &str) -> usize {
    let Ok(text) = fs::read_to_string(dir.join(format!("{id}.captures.jsonl"))) else {
        return 0;
    };
    text.lines().filter(|line| !line.trim().is_empty()).count()
}

/// A backup is usable when it parses as this meet id.
fn backup_summary(dir: &Path, id: &str) -> Option<MeetSummary> {
    let bytes = fs::read(dir.join(format!("{id}.json.bak"))).ok()?;
    let summary = summarize(&bytes)?;
    if summary.id != id {
        return None;
    }
    Some(summary)
}

fn corrupt_summary(dir: &Path, id: &str) -> MeetSummary {
    let journal_lines = journal_line_count(dir, id);
    if let Some(mut summary) = backup_summary(dir, id) {
        summary.corrupt = true;
        summary.has_backup = true;
        summary.journal_lines = journal_lines;
        return summary;
    }
    MeetSummary {
        id: id.to_string(),
        name: "Damaged meet".into(),
        start_date: None,
        end_date: None,
        course: None,
        updated_at: None,
        teams: 0,
        events: 0,
        corrupt: true,
        has_backup: false,
        journal_lines,
    }
}

fn list_in(dir: &Path) -> Result<Vec<MeetSummary>, StoreError> {
    let mut out = Vec::new();
    for entry in fs::read_dir(dir)? {
        let path = entry?.path();
        if !path.is_file() {
            continue;
        }
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        if !valid_id(stem) {
            continue;
        }
        let bytes = fs::read(&path).unwrap_or_default();
        match summarize(&bytes).filter(|summary| summary.id == stem) {
            Some(mut summary) => {
                summary.has_backup = backup_summary(dir, stem).is_some();
                summary.journal_lines = journal_line_count(dir, stem);
                out.push(summary);
            }
            None => out.push(corrupt_summary(dir, stem)),
        }
    }
    out.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(out)
}

#[tauri::command]
pub async fn store_list_meets(app: AppHandle) -> Result<Vec<MeetSummary>, StoreError> {
    list_in(&meets_dir(&app)?)
}

/// The meet JSON as stored. A damaged file is returned as-is; the backup is
/// only used by `store_restore_backup`, so a bad write stays visible.
fn load_in(dir: &Path, id: &str) -> Result<String, StoreError> {
    check_id(id)?;
    let bytes = fs::read(dir.join(format!("{id}.json")))?;
    String::from_utf8(bytes).map_err(|_| StoreError::NotAMeet)
}

#[tauri::command]
pub async fn store_load_meet(app: AppHandle, id: String) -> Result<String, StoreError> {
    load_in(&meets_dir(&app)?, &id)
}

fn parsed_as(path: &Path, id: &str) -> bool {
    fs::read(path)
        .ok()
        .and_then(|bytes| summarize(&bytes))
        .is_some_and(|summary| summary.id == id)
}

/// Copy `<id>.json.bak` over the damaged meet. Refuses when the current file
/// already parses, and does not replace the backup with that damaged file.
fn restore_in(dir: &Path, id: &str) -> Result<(), StoreError> {
    check_id(id)?;
    let json_path = dir.join(format!("{id}.json"));
    if parsed_as(&json_path, id) {
        return Err(StoreError::NotDamaged);
    }
    let bak = dir.join(format!("{id}.json.bak"));
    let bytes = fs::read(&bak).map_err(|_| StoreError::NotAMeet)?;
    if !summarize(&bytes).is_some_and(|summary| summary.id == id) {
        return Err(StoreError::NotAMeet);
    }
    write_atomic_with_backup(&json_path, &bytes, false).map_err(|e| StoreError::Io(e.to_string()))
}

#[tauri::command]
pub async fn store_restore_backup(app: AppHandle, id: String) -> Result<(), StoreError> {
    restore_in(&meets_dir(&app)?, &id)
}

fn read_journal_in(dir: &Path, id: &str) -> Result<String, StoreError> {
    check_id(id)?;
    match fs::read_to_string(dir.join(format!("{id}.captures.jsonl"))) {
        Ok(text) => Ok(text),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(e) => Err(e.into()),
    }
}

#[tauri::command]
pub async fn store_read_journal(app: AppHandle, id: String) -> Result<String, StoreError> {
    read_journal_in(&meets_dir(&app)?, &id)
}

fn save_in(dir: &Path, id: &str, json: &str) -> Result<(), StoreError> {
    check_id(id)?;
    let header: MeetHeader = serde_json::from_str(json).map_err(|_| StoreError::NotAMeet)?;
    if header.id != id {
        return Err(StoreError::BadId);
    }
    write_atomic(&dir.join(format!("{id}.json")), json.as_bytes())
        .map_err(|e| StoreError::Io(e.to_string()))
}

/// Deleting moves the meet, its backup, and its journal into `meets/trash`.
fn delete_in(dir: &Path, id: &str) -> Result<(), StoreError> {
    check_id(id)?;
    let trash = dir.join("trash");
    fs::create_dir_all(&trash)?;
    for name in [
        format!("{id}.json"),
        format!("{id}.json.bak"),
        format!("{id}.captures.jsonl"),
    ] {
        let from = dir.join(&name);
        if from.exists() {
            fs::rename(&from, trash.join(&name))?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn store_save_meet(app: AppHandle, id: String, json: String) -> Result<(), StoreError> {
    save_in(&meets_dir(&app)?, &id, &json)
}

/// Deleting moves the meet, its backup, and its journal into `meets/trash`.
#[tauri::command]
pub async fn store_delete_meet(app: AppHandle, id: String) -> Result<(), StoreError> {
    delete_in(&meets_dir(&app)?, &id)
}

fn append_in(dir: &Path, id: &str, line: &str) -> Result<(), StoreError> {
    check_id(id)?;
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join(format!("{id}.captures.jsonl")))?;
    let clean = line.replace(['\r', '\n'], " ");
    file.write_all(clean.as_bytes())?;
    file.write_all(b"\n")?;
    file.sync_data()?;
    Ok(())
}

#[tauri::command]
pub async fn store_append_capture(
    app: AppHandle,
    id: String,
    line: String,
) -> Result<(), StoreError> {
    append_in(&meets_dir(&app)?, &id, &line)
}

/// Import a `.lane4meet` backup chosen by the user. Returns the meet id.
#[tauri::command]
pub async fn store_import_backup(app: AppHandle, path: String) -> Result<String, StoreError> {
    let path = Path::new(&path);
    if path
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
        != Some("lane4meet")
    {
        return Err(StoreError::NotAMeet);
    }
    if fs::metadata(path)?.len() > MAX_MEET_BYTES {
        return Err(StoreError::NotAMeet);
    }
    let json = fs::read_to_string(path).map_err(|_| StoreError::NotAMeet)?;
    let header: MeetHeader = serde_json::from_str(&json).map_err(|_| StoreError::NotAMeet)?;
    save_in(&meets_dir(&app)?, &header.id, &json)?;
    Ok(header.id)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("lane4-store-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    const MEET: &str = r#"{"id":"m-1","name":"Invite","startDate":"2026-09-12","course":"SCY","updatedAt":"2026-09-12T10:00:00Z","teams":[{}],"events":[{},{}]}"#;

    #[test]
    fn validates_ids() {
        assert!(valid_id("0f8c6c1e-7c1a-4d7b-9d0a-2b5c9f8e1a22"));
        assert!(!valid_id("../etc/passwd"));
        assert!(!valid_id(""));
        assert!(!valid_id("a/b"));
        assert!(!valid_id(&"a".repeat(65)));
    }

    #[test]
    fn saves_atomically_with_backup_and_lists() {
        let dir = temp_dir("save");
        save_in(&dir, "m-1", MEET).unwrap();
        save_in(&dir, "m-1", &MEET.replace("Invite", "Invite 2")).unwrap();
        assert!(dir.join("m-1.json.bak").exists());
        assert!(no_temp_files(&dir));
        let list = list_in(&dir).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name, "Invite 2");
        assert_eq!(list[0].teams, 1);
        assert_eq!(list[0].events, 2);
        assert!(!list[0].corrupt);
        assert!(list[0].has_backup);
    }

    fn no_temp_files(dir: &Path) -> bool {
        fs::read_dir(dir)
            .unwrap()
            .all(|e| e.unwrap().path().extension().is_none_or(|x| x != "tmp"))
    }

    #[test]
    fn concurrent_writes_to_one_file_all_succeed() {
        let dir = temp_dir("concurrent");
        let path = dir.join("publish.json");
        let writers: Vec<_> = (0..8)
            .map(|i| {
                let path = path.clone();
                std::thread::spawn(move || write_atomic(&path, format!("{{\"n\":{i}}}").as_bytes()))
            })
            .collect();
        for w in writers {
            w.join().unwrap().unwrap();
        }
        assert!(fs::read_to_string(&path).unwrap().starts_with("{\"n\":"));
        assert!(no_temp_files(&dir));
    }

    #[test]
    fn refuses_mismatched_or_invalid_documents() {
        let dir = temp_dir("bad");
        assert!(matches!(save_in(&dir, "m-2", MEET), Err(StoreError::BadId)));
        assert!(matches!(
            save_in(&dir, "m-1", "not json"),
            Err(StoreError::NotAMeet)
        ));
        assert!(matches!(
            save_in(&dir, "../x", MEET),
            Err(StoreError::BadId)
        ));
        fs::write(dir.join("junk.json"), "{}").unwrap();
        let list = list_in(&dir).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, "junk");
        assert!(list[0].corrupt);
        assert!(!list[0].has_backup);
        assert_eq!(list[0].name, "Damaged meet");
    }

    #[test]
    fn lists_a_damaged_meet_and_restores_its_backup_without_replacing_it() {
        let dir = temp_dir("recover");
        save_in(&dir, "m-1", MEET).unwrap();
        let good = MEET.replace("Invite", "Invite saved");
        save_in(&dir, "m-1", &good).unwrap();
        let bak = fs::read(dir.join("m-1.json.bak")).unwrap();
        fs::write(dir.join("m-1.json"), "{not json").unwrap();
        append_in(&dir, "m-1", "{\"race\":1}").unwrap();
        append_in(&dir, "m-1", "   ").unwrap();

        let loaded = load_in(&dir, "m-1").unwrap();
        assert_eq!(loaded, "{not json");

        let list = list_in(&dir).unwrap();
        assert_eq!(list.len(), 1);
        assert!(list[0].corrupt);
        assert!(list[0].has_backup);
        assert_eq!(list[0].name, "Invite");
        assert_eq!(list[0].journal_lines, 1);

        restore_in(&dir, "m-1").unwrap();
        assert_eq!(fs::read(dir.join("m-1.json.bak")).unwrap(), bak);
        assert_eq!(
            load_in(&dir, "m-1").unwrap(),
            String::from_utf8(bak).unwrap()
        );
        assert!(matches!(
            restore_in(&dir, "m-1"),
            Err(StoreError::NotDamaged)
        ));
        let listed = list_in(&dir).unwrap();
        assert!(!listed[0].corrupt);
        assert_eq!(read_journal_in(&dir, "m-1").unwrap().lines().count(), 2);
        assert_eq!(read_journal_in(&dir, "missing").unwrap(), "");
    }

    #[test]
    fn delete_moves_the_backup_into_trash() {
        let dir = temp_dir("delete");
        save_in(&dir, "m-1", MEET).unwrap();
        save_in(&dir, "m-1", &MEET.replace("Invite", "Invite 2")).unwrap();
        append_in(&dir, "m-1", "{}").unwrap();
        delete_in(&dir, "m-1").unwrap();
        assert!(!dir.join("m-1.json").exists());
        assert!(!dir.join("m-1.json.bak").exists());
        assert!(!dir.join("m-1.captures.jsonl").exists());
        assert!(dir.join("trash/m-1.json").exists());
        assert!(dir.join("trash/m-1.json.bak").exists());
        assert!(dir.join("trash/m-1.captures.jsonl").exists());
    }

    #[test]
    fn restore_refuses_a_backup_for_a_different_meet() {
        let dir = temp_dir("wrong-bak");
        fs::write(dir.join("m-1.json"), "garbage").unwrap();
        fs::write(dir.join("m-1.json.bak"), MEET.replace("m-1", "other")).unwrap();
        assert!(matches!(restore_in(&dir, "m-1"), Err(StoreError::NotAMeet)));
    }

    #[test]
    fn appends_one_line_per_capture() {
        let dir = temp_dir("journal");
        append_in(&dir, "m-1", "{\"a\":1}").unwrap();
        append_in(&dir, "m-1", "{\"b\":\n2}").unwrap();
        let text = fs::read_to_string(dir.join("m-1.captures.jsonl")).unwrap();
        assert_eq!(text.lines().count(), 2);
    }
}
