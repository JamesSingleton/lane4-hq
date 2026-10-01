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

/// Replace `path` with `contents` so a crash leaves either the old or the new
/// file. Each write gets its own temp file, so concurrent writes to the same
/// path can't rename each other's temp file away.
pub fn write_atomic(path: &Path, contents: &[u8]) -> std::io::Result<()> {
    static NEXT: AtomicU64 = AtomicU64::new(0);
    let n = NEXT.fetch_add(1, Ordering::Relaxed);
    let tmp = path.with_extension(format!("{}.{n}.tmp", std::process::id()));
    {
        let mut file = File::create(&tmp)?;
        file.write_all(contents)?;
        file.sync_all()?;
    }
    if path.exists() {
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
    })
}

fn list_in(dir: &Path) -> Result<Vec<MeetSummary>, StoreError> {
    let mut out = Vec::new();
    for entry in fs::read_dir(dir)? {
        let path = entry?.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        if let Some(summary) = fs::read(&path).ok().and_then(|b| summarize(&b)) {
            out.push(summary);
        }
    }
    out.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(out)
}

#[tauri::command]
pub async fn store_list_meets(app: AppHandle) -> Result<Vec<MeetSummary>, StoreError> {
    list_in(&meets_dir(&app)?)
}

#[tauri::command]
pub async fn store_load_meet(app: AppHandle, id: String) -> Result<String, StoreError> {
    check_id(&id)?;
    let bytes = fs::read(meets_dir(&app)?.join(format!("{id}.json")))?;
    String::from_utf8(bytes).map_err(|_| StoreError::NotAMeet)
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

#[tauri::command]
pub async fn store_save_meet(app: AppHandle, id: String, json: String) -> Result<(), StoreError> {
    save_in(&meets_dir(&app)?, &id, &json)
}

/// Deleting moves the meet (and its journal) into `meets/trash`; nothing is erased.
#[tauri::command]
pub async fn store_delete_meet(app: AppHandle, id: String) -> Result<(), StoreError> {
    check_id(&id)?;
    let dir = meets_dir(&app)?;
    let trash = dir.join("trash");
    fs::create_dir_all(&trash)?;
    for name in [format!("{id}.json"), format!("{id}.captures.jsonl")] {
        let from = dir.join(&name);
        if from.exists() {
            fs::rename(&from, trash.join(&name))?;
        }
    }
    Ok(())
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
        assert!(list_in(&dir).unwrap().is_empty());
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
