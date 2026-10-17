const COMMANDS: &[&str] = &[
    "read_meet_file",
    "write_export_file",
    "open_report",
    "store_list_meets",
    "store_load_meet",
    "store_save_meet",
    "store_delete_meet",
    "store_append_capture",
    "store_import_backup",
    "store_restore_backup",
    "store_read_journal",
    "timing_list_ports",
    "timing_open",
    "timing_close",
    "timing_connected_port",
    "timing_request",
    "publish_get_settings",
    "publish_set_settings",
    "publish_probe",
    "publish_post",
    "account_start_sign_in",
    "account_poll_sign_in",
    "account_cancel_sign_in",
    "account_reopen_sign_in",
    "account_me",
    "account_sign_out",
    "account_open_sign_up",
    "app_update_check",
    "app_update_install",
];

fn main() {
    // `publish.rs` bakes these in with `option_env!`.
    println!("cargo:rerun-if-env-changed=LANE4_API_URL");
    println!("cargo:rerun-if-env-changed=LANE4_ADMIN_URL");
    // Declaring the app's commands makes each one deny-by-default; the
    // capability in `capabilities/default.json` grants them to the main window.
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("failed to run tauri-build");
}
