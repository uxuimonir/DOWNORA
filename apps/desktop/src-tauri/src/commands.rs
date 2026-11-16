//! Commands the UI may call. Every argument is validated here; paths coming
//! from the UI are only accepted when the user picked them in a native dialog
//! (or they are Downora's own downloads/folders).

use crate::AppState;
use base64::Engine;
use downora_core::bridge::{Client, PairingCode};
use downora_core::download::{self, AddRequest, Analysis, Job, Status};
use downora_core::ffmpeg::{Conversion, ConvertError, ConvertRequest, Ffmpeg, OutputSupport, ProbeInfo};
use downora_core::media::Container;
use downora_core::settings::Settings;
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, State};
use tauri_plugin_autostart::ManagerExt as _;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

type R<T> = Result<T, String>;

const MEDIA_EXTS: &[&str] = &["mp4", "m4v", "mov", "webm", "mkv", "avi", "mp3", "m4a", "aac", "wav", "flac", "ogg", "opus"];

fn grant(state: &AppState, p: &Path) {
    if let Ok(c) = p.canonicalize() {
        state.granted.lock().unwrap().insert(c);
    }
}

/// A folder the UI may write to: picked by the user, the download folder, or
/// the folder of a picked file.
async fn writable_dir(state: &AppState, dir: &Path) -> R<PathBuf> {
    let c = dir.canonicalize().map_err(|_| "That folder doesn’t exist.".to_string())?;
    let download_dir = state.settings.read().await.download_dir.canonicalize().ok();
    let g = state.granted.lock().unwrap();
    let ok = download_dir.as_deref() == Some(c.as_path()) || g.contains(&c) || g.iter().any(|p| p.is_file() && p.parent() == Some(c.as_path()));
    if ok { Ok(c) } else { Err("Choose the folder with the folder picker first.".into()) }
}

/// A file the UI may read: picked by the user, or saved by Downora.
async fn readable_file(state: &AppState, file: &Path) -> R<PathBuf> {
    let c = file.canonicalize().map_err(|_| "That file doesn’t exist.".to_string())?;
    if state.granted.lock().unwrap().contains(&c) {
        return Ok(c);
    }
    let ours = state.manager.list().await.into_iter().filter_map(|j| j.path).filter_map(|p| p.canonicalize().ok()).any(|p| p == c);
    if ours { Ok(c) } else { Err("Choose the file with the file picker first.".into()) }
}

// ───────────────────────── app & settings ─────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    version: String,
    platform: &'static str,
    ffmpeg: Option<Ffmpeg>,
    outputs: Vec<OutputSupport>,
    secret_storage: &'static str,
    bridge_port: u16,
    bridge_error: Option<String>,
    browser_connected: bool,
    autostart_supported: bool,
    updates: &'static str,
}

#[tauri::command]
pub async fn app_info(app: AppHandle, state: State<'_, AppState>) -> R<AppInfo> {
    let ffmpeg = state.converter.ffmpeg().await;
    Ok(AppInfo {
        version: app.package_info().version.to_string(),
        platform: std::env::consts::OS,
        outputs: ffmpeg.as_ref().map(|f| f.outputs()).unwrap_or_default(),
        ffmpeg,
        secret_storage: state.bridge.secret_storage(),
        bridge_port: state.bridge.port(),
        bridge_error: state.bridge_error.lock().unwrap().clone(),
        browser_connected: state.bridge.connected(),
        autostart_supported: cfg!(any(target_os = "macos", target_os = "windows", target_os = "linux")),
        updates: "Automatic updates aren’t set up yet: they need a signed release channel. Download new versions from the Downora releases page.",
    })
}

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> R<Settings> {
    Ok(state.settings.read().await.clone())
}

#[tauri::command]
pub async fn update_settings(app: AppHandle, state: State<'_, AppState>, settings: Settings) -> R<Settings> {
    let current = state.settings.read().await.clone();
    let mut next = settings.normalized();

    if next.download_dir != current.download_dir {
        next.download_dir = writable_dir(&state, &next.download_dir).await?;
    }
    if next.ffmpeg_path != current.ffmpeg_path {
        if let Some(p) = &next.ffmpeg_path {
            let stem = p.file_stem().map(|s| s.to_string_lossy().to_lowercase());
            if stem.as_deref() != Some("ffmpeg") || !p.is_file() {
                return Err("Point to the ffmpeg program itself (ffmpeg or ffmpeg.exe).".into());
            }
        }
    }
    if next.launch_at_startup != current.launch_at_startup {
        let al = app.autolaunch();
        let r = if next.launch_at_startup { al.enable() } else { al.disable() };
        r.map_err(|e| format!("Couldn’t change the startup setting: {e}"))?;
    }
    next.save(&state.settings_path).map_err(|e| format!("Couldn’t save settings: {e}"))?;
    *state.settings.write().await = next.clone();

    if next.ffmpeg_path != current.ffmpeg_path {
        let ff = Ffmpeg::discover(next.ffmpeg_path.as_deref()).await;
        state.converter.set_ffmpeg(ff.clone()).await;
        state.manager.set_ffmpeg(ff).await;
    }
    state.manager.apply_settings().await;
    Ok(next)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageInfo {
    download_dir: PathBuf,
    free_bytes: Option<u64>,
    total_bytes: Option<u64>,
}

#[tauri::command]
pub async fn storage_info(state: State<'_, AppState>) -> R<StorageInfo> {
    let dir = state.settings.read().await.download_dir.clone();
    let probe = std::iter::successors(Some(dir.as_path()), |p| p.parent()).find(|p| p.exists()).map(Path::to_path_buf);
    Ok(StorageInfo {
        free_bytes: probe.as_deref().and_then(|p| fs2::available_space(p).ok()),
        total_bytes: probe.as_deref().and_then(|p| fs2::total_space(p).ok()),
        download_dir: dir,
    })
}

// ───────────────────────── dialogs ─────────────────────────

#[tauri::command]
pub async fn pick_folder(app: AppHandle, state: State<'_, AppState>, title: Option<String>) -> R<Option<PathBuf>> {
    let title: String = title.unwrap_or_else(|| "Choose a folder".into()).chars().take(80).collect();
    let picked = tauri::async_runtime::spawn_blocking(move || app.dialog().file().set_title(title).blocking_pick_folder())
        .await
        .map_err(|e| e.to_string())?;
    let Some(p) = picked.and_then(|p| p.into_path().ok()) else { return Ok(None) };
    grant(&state, &p);
    Ok(Some(p))
}

#[tauri::command]
pub async fn pick_media_files(app: AppHandle, state: State<'_, AppState>) -> R<Vec<PathBuf>> {
    let picked = tauri::async_runtime::spawn_blocking(move || {
        app.dialog().file().set_title("Choose media files to convert").add_filter("Audio and video", MEDIA_EXTS).blocking_pick_files()
    })
    .await
    .map_err(|e| e.to_string())?;
    let files: Vec<PathBuf> = picked.unwrap_or_default().into_iter().filter_map(|p| p.into_path().ok()).collect();
    for f in &files {
        grant(&state, f);
    }
    Ok(files)
}

// ───────────────────────── downloads ─────────────────────────

fn check_id(id: &str) -> R<()> {
    if id.len() == 36 && id.chars().all(|c| c.is_ascii_hexdigit() || c == '-') { Ok(()) } else { Err("Invalid id.".into()) }
}

#[tauri::command]
pub async fn analyze_url(state: State<'_, AppState>, url: String) -> R<Analysis> {
    if url.len() > 4096 {
        return Err("That link is too long.".into());
    }
    let ff = state.converter.ffmpeg().await;
    download::analyze(&state.http, &url, ff.as_ref()).await
}

#[tauri::command]
pub async fn add_download(
    state: State<'_, AppState>,
    url: String,
    title: Option<String>,
    container: Option<Container>,
    quality: Option<String>,
    dir: Option<PathBuf>,
) -> R<Job> {
    if url.len() > 4096 {
        return Err("That link is too long.".into());
    }
    let dir = match dir {
        Some(d) => Some(writable_dir(&state, &d).await?),
        None => None,
    };
    let quality = quality.filter(|q| q.len() <= 12 && q.chars().all(|c| c.is_ascii_alphanumeric()));
    let title = title.map(|t| t.chars().take(200).collect());
    state.manager.add(AddRequest { url, title, container, quality, dir, source: None }).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_downloads(state: State<'_, AppState>) -> R<Vec<Job>> {
    Ok(state.manager.list().await)
}

#[tauri::command]
pub async fn pause_download(state: State<'_, AppState>, id: String) -> R<()> {
    check_id(&id)?;
    state.manager.pause(&id).await.map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn resume_download(state: State<'_, AppState>, id: String) -> R<()> {
    check_id(&id)?;
    state.manager.resume(&id).await.map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn cancel_download(state: State<'_, AppState>, id: String) -> R<()> {
    check_id(&id)?;
    state.manager.cancel(&id).await.map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn retry_download(state: State<'_, AppState>, id: String) -> R<()> {
    check_id(&id)?;
    state.manager.retry(&id).await.map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn remove_download(state: State<'_, AppState>, id: String) -> R<()> {
    check_id(&id)?;
    state.manager.remove(&id).await.map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn clear_finished_downloads(state: State<'_, AppState>) -> R<()> {
    state.manager.clear_finished().await.map_err(|e| e.to_string())
}

async fn saved_file(state: &AppState, id: &str) -> R<PathBuf> {
    check_id(id)?;
    let job = state.manager.get(id).await.ok_or("No such download.")?;
    match (job.status, job.path) {
        (Status::Completed, Some(p)) if p.exists() => Ok(p),
        (Status::Completed, _) => Err("The file was moved or deleted.".into()),
        _ => Err("This download hasn’t finished.".into()),
    }
}

#[tauri::command]
pub async fn open_download(app: AppHandle, state: State<'_, AppState>, id: String) -> R<()> {
    let p = saved_file(&state, &id).await?;
    app.opener().open_path(p.to_string_lossy(), None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn reveal_download(app: AppHandle, state: State<'_, AppState>, id: String) -> R<()> {
    let p = saved_file(&state, &id).await?;
    app.opener().reveal_item_in_dir(p).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn open_download_folder(app: AppHandle, state: State<'_, AppState>) -> R<()> {
    let dir = state.settings.read().await.download_dir.clone();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    app.opener().open_path(dir.to_string_lossy(), None::<&str>).map_err(|e| e.to_string())
}

/// Thumbnail as a data URL, so the webview needs no file access.
#[tauri::command]
pub async fn download_thumbnail(state: State<'_, AppState>, id: String) -> R<Option<String>> {
    check_id(&id)?;
    let Some(p) = state.manager.get(&id).await.and_then(|j| j.thumbnail) else { return Ok(None) };
    let bytes = tokio::fs::read(p).await.ok();
    Ok(bytes.filter(|b| b.len() < 512 * 1024).map(|b| format!("data:image/jpeg;base64,{}", base64::engine::general_purpose::STANDARD.encode(b))))
}

// ───────────────────────── converter ─────────────────────────

#[tauri::command]
pub async fn probe_file(state: State<'_, AppState>, path: PathBuf) -> R<ProbeInfo> {
    let p = readable_file(&state, &path).await?;
    let ff = state.converter.ffmpeg().await.ok_or("FFmpeg isn’t installed.")?;
    ff.probe(&p).await
}

#[derive(Serialize)]
#[serde(tag = "result", rename_all = "camelCase")]
pub enum ConvertResult {
    Started { conversion: Conversion },
    /// The output exists: ask the user, then call again with overwrite = true.
    NeedsConfirmation { message: String },
}

#[tauri::command]
pub async fn convert(state: State<'_, AppState>, mut request: ConvertRequest) -> R<ConvertResult> {
    request.input = readable_file(&state, &request.input).await?;
    request.output_dir = writable_dir(&state, &request.output_dir).await?;
    match state.converter.start(request).await {
        Ok(c) => Ok(ConvertResult::Started { conversion: c }),
        Err(ConvertError::Exists(message)) => Ok(ConvertResult::NeedsConfirmation { message }),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub async fn list_conversions(state: State<'_, AppState>) -> R<Vec<Conversion>> {
    Ok(state.converter.list().await)
}

#[tauri::command]
pub async fn cancel_conversion(state: State<'_, AppState>, id: String) -> R<bool> {
    check_id(&id)?;
    Ok(state.converter.cancel(&id))
}

#[tauri::command]
pub async fn clear_conversions(state: State<'_, AppState>) -> R<()> {
    state.converter.clear_finished().await;
    Ok(())
}

#[tauri::command]
pub async fn reveal_conversion(app: AppHandle, state: State<'_, AppState>, id: String) -> R<()> {
    check_id(&id)?;
    let c = state.converter.list().await.into_iter().find(|c| c.id == id).ok_or("No such conversion.")?;
    if !c.output.exists() {
        return Err("The converted file was moved or deleted.".into());
    }
    app.opener().reveal_item_in_dir(c.output).map_err(|e| e.to_string())
}

// ───────────────────────── browser bridge ─────────────────────────

#[tauri::command]
pub async fn start_pairing(state: State<'_, AppState>) -> R<PairingCode> {
    if !state.settings.read().await.browser_bridge {
        return Err("Turn on Browser connection in Settings first.".into());
    }
    if let Some(e) = state.bridge_error.lock().unwrap().clone() {
        return Err(e);
    }
    Ok(state.bridge.start_pairing())
}

#[tauri::command]
pub async fn cancel_pairing(state: State<'_, AppState>) -> R<()> {
    state.bridge.cancel_pairing();
    Ok(())
}

#[tauri::command]
pub async fn decide_pairing(state: State<'_, AppState>, request_id: String, approve: bool) -> R<bool> {
    check_id(&request_id)?;
    Ok(state.bridge.decide(&request_id, approve))
}

#[tauri::command]
pub async fn list_browsers(state: State<'_, AppState>) -> R<Vec<Client>> {
    Ok(state.bridge.clients())
}

#[tauri::command]
pub async fn revoke_browser(state: State<'_, AppState>, key_id: String) -> R<()> {
    check_id(&key_id)?;
    state.bridge.revoke(&key_id);
    Ok(())
}
