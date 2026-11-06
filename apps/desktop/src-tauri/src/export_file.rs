use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

use crate::analytics::{self, export_write_failed};
use crate::store::write_atomic_with_backup;

/// Extensions the webview may write. Keep in sync with `EXPORT_EXTENSIONS` in
/// `src/lib/native.ts`.
const ALLOWED: &[&str] = &[
    "zip",
    "hy3",
    "cl2",
    "sd3",
    "csv",
    "pdf",
    "lane4meet",
    "json",
];

fn validate(path: &Path) -> Result<(), String> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_ascii_lowercase)
        .ok_or_else(|| "Choose a file name with an extension.".to_string())?;
    if !ALLOWED.contains(&ext.as_str()) {
        return Err(format!("Lane4 can't save \".{ext}\" files."));
    }
    Ok(())
}

/// Write an export the user chose a destination for in the Save dialog.
#[tauri::command]
pub async fn write_export_file(app: AppHandle, path: String, bytes: Vec<u8>) -> Result<(), String> {
    let path = Path::new(&path);
    if let Err(error) = validate(path) {
        analytics::emit_exception(&app, export_write_failed());
        return Err(error);
    }
    // No `.bak`: that's for the meet store, and would litter the user's folder.
    match write_atomic_with_backup(path, &bytes, false) {
        Ok(()) => Ok(()),
        Err(error) => {
            analytics::emit_exception(&app, export_write_failed());
            Err(error.to_string())
        }
    }
}

/// File name for a report: letters, digits, spaces, `-` and `_` only.
fn report_stem(name: &str) -> String {
    let stem: String = name
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, ' ' | '-' | '_'))
        .take(80)
        .collect();
    let stem = stem.trim();
    if stem.is_empty() {
        "Report".to_string()
    } else {
        stem.to_string()
    }
}

/// Write a report. A viewer on Windows may still have the last copy open and
/// locked, so printing again goes to a new file instead of failing.
fn write_report(dir: &Path, stem: &str, bytes: &[u8]) -> std::io::Result<PathBuf> {
    let path = dir.join(format!("{stem}.pdf"));
    if fs::write(&path, bytes).is_ok() {
        return Ok(path);
    }
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let path = dir.join(format!("{stem} {millis}.pdf"));
    fs::write(&path, bytes)?;
    Ok(path)
}

/// Open a printable PDF report in the system viewer. The file goes in the app
/// cache, so the webview never chooses a path or what gets opened.
#[tauri::command]
pub async fn open_report(app: AppHandle, name: String, bytes: Vec<u8>) -> Result<(), String> {
    if !bytes.starts_with(b"%PDF-") {
        return Err("That report isn't a PDF.".to_string());
    }
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("reports");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = write_report(&dir, &report_stem(&name), &bytes).map_err(|e| e.to_string())?;
    app.opener()
        .open_path(path.to_string_lossy(), None::<&str>)
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replacing_an_export_leaves_nothing_beside_it() {
        let dir = std::env::temp_dir().join(format!("lane4-export-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join("Results.zip");
        write_atomic_with_backup(&file, b"one", false).unwrap();
        write_atomic_with_backup(&file, b"two", false).unwrap();
        assert_eq!(fs::read(&file).unwrap(), b"two");
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 1);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_locked_report_goes_to_a_new_file() {
        let dir = std::env::temp_dir().join(format!("lane4-report-{}", std::process::id()));
        // A directory in the way fails the write, as a locked file does.
        fs::create_dir_all(dir.join("Heat sheet.pdf")).unwrap();
        let path = write_report(&dir, "Heat sheet", b"%PDF-1.4").unwrap();
        assert_ne!(path, dir.join("Heat sheet.pdf"));
        assert_eq!(fs::read(&path).unwrap(), b"%PDF-1.4");
        assert_eq!(
            write_report(&dir, "Results", b"%PDF-1.4").unwrap(),
            dir.join("Results.pdf")
        );
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn report_names_are_plain_file_stems() {
        assert_eq!(
            report_stem("Desert Champs Heat sheet"),
            "Desert Champs Heat sheet"
        );
        assert_eq!(report_stem("../../etc/passwd"), "etcpasswd");
        assert_eq!(report_stem("  ///  "), "Report");
    }

    #[test]
    fn only_writes_export_formats() {
        assert!(validate(Path::new(r"C:\Users\coach\MARI-AZ-Results.ZIP")).is_ok());
        assert!(validate(Path::new("/tmp/meet.lane4meet")).is_ok());
        assert!(validate(Path::new("/tmp/Heat sheet.pdf")).is_ok());
        assert!(validate(Path::new("/tmp/Lane4 timer test.json")).is_ok());
        assert!(validate(Path::new("/tmp/evil.sh")).is_err());
        assert!(validate(Path::new("/tmp/noext")).is_err());
    }
}
