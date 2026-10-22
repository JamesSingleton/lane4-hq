use std::sync::OnceLock;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

static APP: OnceLock<AppHandle> = OnceLock::new();

/// What the webview may forward. The panic payload and the file path stay here.
#[derive(Serialize, Clone)]
pub struct AnalyticsException {
    pub source: &'static str,
    pub code: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line: Option<u32>,
}

/// File name only. An absolute path can include a home directory or a meet name.
pub fn exception_file(path: &str) -> String {
    let name = path.rsplit(['/', '\\']).next().unwrap_or(path);
    if name.is_empty() {
        "unknown".to_string()
    } else {
        name.to_string()
    }
}

pub fn export_write_failed() -> AnalyticsException {
    AnalyticsException {
        source: "command",
        code: "export_write_failed",
        file: None,
        line: None,
    }
}

pub fn emit_exception(app: &AppHandle, exception: AnalyticsException) {
    let _ = app.emit("analytics-exception", exception);
}

/// Remember the app, then report panics as an exception event before abort.
pub fn install(handle: AppHandle) {
    let _ = APP.set(handle);
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        if let Some(app) = APP.get() {
            let (file, line) = info
                .location()
                .map(|location| (exception_file(location.file()), location.line()))
                .unwrap_or_else(|| ("unknown".to_string(), 0));
            emit_exception(
                app,
                AnalyticsException {
                    source: "panic",
                    code: "panic",
                    file: Some(file),
                    line: Some(line),
                },
            );
        }
        previous(info);
    }));
}

#[cfg(test)]
mod tests {
    use super::exception_file;

    #[test]
    fn panic_files_are_base_names() {
        assert_eq!(exception_file("src/export_file.rs"), "export_file.rs");
        assert_eq!(
            exception_file(r"C:\Users\coach\meets\main.rs"),
            "main.rs"
        );
        assert_eq!(exception_file(""), "unknown");
        assert_eq!(exception_file("/"), "unknown");
    }
}
