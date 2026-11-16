// App commands are declared here so they need an explicit permission in
// capabilities/default.json — nothing is callable from the UI by default.
const COMMANDS: &[&str] = &[
    "app_info", "get_settings", "update_settings", "storage_info",
    "pick_folder", "pick_media_files",
    "analyze_url", "add_download", "list_downloads", "pause_download", "resume_download", "cancel_download",
    "retry_download", "remove_download", "clear_finished_downloads", "open_download", "reveal_download",
    "open_download_folder", "download_thumbnail",
    "probe_file", "convert", "list_conversions", "cancel_conversion", "clear_conversions", "reveal_conversion",
    "start_pairing", "cancel_pairing", "decide_pairing", "list_browsers", "revoke_browser",
];

fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)))
        .expect("tauri build");
}
