mod deep_link;
mod export_file;
mod meet_file;
mod publish;
mod store;
mod timing;
mod update;

use tauri_plugin_deep_link::DeepLinkExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let context = tauri::generate_context!();
    let updates = update::enabled(context.config());

    // Single-instance goes first: on Windows a `lane4://` link launches a
    // second copy, which hands the link to this one and exits.
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            deep_link::focus_main_window(app);
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init());
    if updates {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .manage(timing::TimingState::default())
        .manage(publish::SignInState::default())
        .manage(update::UpdateState::new(updates))
        .setup(|app| {
            // Installers register the scheme; dev builds on Windows register here.
            #[cfg(all(debug_assertions, windows))]
            app.deep_link().register_all()?;
            let handle = app.handle().clone();
            app.deep_link()
                .on_open_url(move |event| deep_link::handle(&handle, event.urls()));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            meet_file::read_meet_file,
            export_file::write_export_file,
            export_file::open_report,
            store::store_list_meets,
            store::store_load_meet,
            store::store_save_meet,
            store::store_delete_meet,
            store::store_append_capture,
            store::store_import_backup,
            timing::timing_list_ports,
            timing::timing_open,
            timing::timing_close,
            timing::timing_connected_port,
            timing::timing_request,
            publish::publish_get_settings,
            publish::publish_set_settings,
            publish::publish_probe,
            publish::publish_post,
            publish::account_start_sign_in,
            publish::account_poll_sign_in,
            publish::account_cancel_sign_in,
            publish::account_reopen_sign_in,
            publish::account_me,
            publish::account_sign_out,
            publish::account_open_sign_up,
            update::app_update_check,
            update::app_update_install,
        ])
        .run(context)
        .expect("error while running Lane4 desktop");
}
