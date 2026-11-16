//! Downora desktop: wires the engine (downora-core) to the Tauri window, tray,
//! notifications and OS integrations.

mod commands;
mod keychain;

use downora_core::bridge::{Bridge, DEFAULT_PORT};
use downora_core::download::Manager;
use downora_core::events::{Event, NoticeKind};
use downora_core::ffmpeg::{Converter, Ffmpeg};
use downora_core::settings::Settings;
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{Emitter, Manager as _, WindowEvent};
use tauri_plugin_notification::NotificationExt;
use tokio::sync::{broadcast, RwLock};

pub struct AppState {
    pub settings: Arc<RwLock<Settings>>,
    pub settings_path: PathBuf,
    pub manager: Manager,
    pub converter: Arc<Converter>,
    pub bridge: Arc<Bridge>,
    pub bridge_error: Mutex<Option<String>>,
    pub http: reqwest_client::Client,
    /// Files and folders the user explicitly picked in a dialog. The UI can
    /// only convert, open or write to these (plus Downora's own downloads).
    pub granted: Mutex<HashSet<PathBuf>>,
}

/// Re-exported so commands can build requests without a direct reqwest dep.
pub mod reqwest_client {
    pub type Client = downora_core::download::HttpClient;
}

fn notify(app: &tauri::AppHandle, kind: NoticeKind, title: &str, body: &str, settings: &Settings) {
    let n = &settings.notifications;
    let allowed = match kind {
        NoticeKind::DownloadComplete => n.download_complete,
        NoticeKind::DownloadFailed => n.download_failed,
        NoticeKind::ConversionComplete => n.conversion_complete,
        NoticeKind::LowStorage => n.low_storage,
        NoticeKind::BrowserLost => n.browser_lost,
    };
    if allowed {
        let _ = app.notification().builder().title(title).body(body).show();
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--minimized"])))
        .setup(|app| {
            let handle = app.handle().clone();
            let data_dir = app.path().app_data_dir()?;
            let cache_dir = app.path().app_cache_dir()?;
            let config_dir = app.path().app_config_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let settings_path = config_dir.join("settings.json");
            let settings = Settings::load(&settings_path);
            let _ = std::fs::create_dir_all(&settings.download_dir);
            let settings = Arc::new(RwLock::new(settings));
            let (events, _) = broadcast::channel::<Event>(1024);

            let rt = tauri::async_runtime::handle();
            let ffmpeg = rt.block_on(async { Ffmpeg::discover(settings.read().await.ffmpeg_path.as_deref()).await });
            let manager = Manager::new(&data_dir, &cache_dir, settings.clone(), events.clone(), ffmpeg.clone());
            let converter = Converter::new(&data_dir, ffmpeg, events.clone());
            let port = std::env::var("DOWNORA_BRIDGE_PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(DEFAULT_PORT);
            let bridge = Bridge::new(&data_dir, keychain::secret_store(data_dir.clone()), manager.clone(), settings.clone(), events.clone(), port);

            let bridge_error = match rt.block_on(bridge.clone().serve()) {
                Ok(_) => None,
                Err(e) => Some(format!("Couldn’t listen on 127.0.0.1:{port} ({e}). Is another copy of Downora running?")),
            };
            rt.block_on(async {
                manager.cleanup_orphans().await;
                manager.pump().await;
            });

            // Engine events → window + native notifications.
            let mut rx = events.subscribe();
            let app_h = handle.clone();
            let s2 = settings.clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    match rx.recv().await {
                        Ok(Event::Notice(n)) => {
                            let s = s2.read().await.clone();
                            notify(&app_h, n.kind, &n.title, &n.body, &s);
                            let _ = app_h.emit("downora://event", Event::Notice(n));
                        }
                        Ok(e) => {
                            let _ = app_h.emit("downora://event", e);
                        }
                        Err(broadcast::error::RecvError::Lagged(_)) => continue,
                        Err(_) => break,
                    }
                }
            });

            app.manage(AppState {
                settings,
                settings_path,
                manager,
                converter,
                bridge,
                bridge_error: Mutex::new(bridge_error),
                http: downora_core::download::http_client(),
                granted: Mutex::new(HashSet::new()),
            });

            // Tray: reopen the window or quit, so "close to tray" never traps anyone.
            let show = MenuItem::with_id(app, "show", "Show Downora", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit Downora", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            let mut tray = TrayIconBuilder::with_id("main").tooltip("Downora").menu(&menu).on_menu_event(|app, ev| match ev.id().as_ref() {
                "show" => {
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.show();
                        let _ = w.set_focus();
                    }
                }
                "quit" => app.exit(0),
                _ => {}
            });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;

            if std::env::args().any(|a| a == "--minimized") {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.hide();
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let state = window.state::<AppState>();
                let to_tray = state.settings.try_read().map(|s| s.minimize_to_tray).unwrap_or(false);
                if to_tray {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_info,
            commands::get_settings,
            commands::update_settings,
            commands::storage_info,
            commands::pick_folder,
            commands::pick_media_files,
            commands::analyze_url,
            commands::add_download,
            commands::list_downloads,
            commands::pause_download,
            commands::resume_download,
            commands::cancel_download,
            commands::retry_download,
            commands::remove_download,
            commands::clear_finished_downloads,
            commands::open_download,
            commands::reveal_download,
            commands::open_download_folder,
            commands::download_thumbnail,
            commands::probe_file,
            commands::convert,
            commands::list_conversions,
            commands::cancel_conversion,
            commands::clear_conversions,
            commands::reveal_conversion,
            commands::start_pairing,
            commands::cancel_pairing,
            commands::decide_pairing,
            commands::list_browsers,
            commands::revoke_browser,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Downora");
}
