use std::fs;
use std::path::Path;

use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

use crate::store::write_atomic;

/// Extensions the webview may write. Keep in sync with `EXPORT_EXTENSIONS` in
/// `src/lib/native.ts`.
const ALLOWED: &[&str] = &["zip", "hy3", "cl2", "sd3", "csv", "pdf", "lane4meet"];

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
pub async fn write_export_file(path: String, bytes: Vec<u8>) -> Result<(), String> {
    let path = Path::new(&path);
    validate(path)?;
    write_atomic(path, &bytes).map_err(|e| e.to_string())
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
    let path = dir.join(format!("{}.pdf", report_stem(&name)));
    fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    app.opener()
        .open_path(path.to_string_lossy(), None::<&str>)
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

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
        assert!(validate(Path::new("/tmp/evil.sh")).is_err());
        assert!(validate(Path::new("/tmp/noext")).is_err());
    }
}
