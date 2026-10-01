//! `lane4://` links. Admin's `/device` page opens `lane4://sign-in/approved`
//! after a coach approves this computer, so the app comes forward and finishes
//! signing in without waiting for its next poll. Links carry no secrets: the
//! token still comes from polling with the device code only this app holds.

use tauri::{AppHandle, Emitter, Manager, Url};

/// The webview listens for this to poll for the session right away.
pub const SIGN_IN_RETURNED: &str = "sign-in-returned";

pub fn is_sign_in_return(url: &Url) -> bool {
    url.scheme() == "lane4"
        && url.host_str() == Some("sign-in")
        && url.path().trim_end_matches('/') == "/approved"
}

pub fn focus_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub fn handle(app: &AppHandle, urls: Vec<Url>) {
    if urls.iter().any(is_sign_in_return) {
        focus_main_window(app);
        let _ = app.emit(SIGN_IN_RETURNED, ());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn url(s: &str) -> Url {
        Url::parse(s).unwrap()
    }

    #[test]
    fn recognizes_only_the_sign_in_return_link() {
        assert!(is_sign_in_return(&url("lane4://sign-in/approved")));
        assert!(is_sign_in_return(&url("lane4://sign-in/approved/")));
        assert!(!is_sign_in_return(&url("lane4://sign-in/denied")));
        assert!(!is_sign_in_return(&url("lane4://other/approved")));
        assert!(!is_sign_in_return(&url("https://sign-in/approved")));
    }
}
