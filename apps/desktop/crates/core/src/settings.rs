//! User settings, stored as JSON in the app's config folder. Every value is
//! clamped on load, so a hand-edited file can't put the app in a bad state.

use crate::names::{Duplicates, NameTemplate};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Notifications {
    pub download_complete: bool,
    pub download_failed: bool,
    pub conversion_complete: bool,
    pub low_storage: bool,
    pub browser_lost: bool,
}

impl Default for Notifications {
    fn default() -> Self {
        Self { download_complete: true, download_failed: true, conversion_complete: true, low_storage: true, browser_lost: false }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub download_dir: PathBuf,
    /// Ask for a location for downloads added in the app.
    pub ask_where_to_save: bool,
    pub name_template: NameTemplate,
    pub duplicates: Duplicates,
    /// 1–6 transfers at once.
    pub concurrency: usize,
    /// Total download speed cap in KiB/s. 0 = unlimited.
    pub bandwidth_limit_kib: u64,
    pub notifications: Notifications,
    pub launch_at_startup: bool,
    pub minimize_to_tray: bool,
    /// Accept jobs from paired browsers.
    pub browser_bridge: bool,
    /// Optional explicit FFmpeg binary; otherwise found on PATH.
    pub ffmpeg_path: Option<PathBuf>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            download_dir: default_download_dir(),
            ask_where_to_save: false,
            name_template: NameTemplate::Title,
            duplicates: Duplicates::Rename,
            concurrency: 2,
            bandwidth_limit_kib: 0,
            notifications: Notifications::default(),
            launch_at_startup: false,
            minimize_to_tray: true,
            browser_bridge: true,
            ffmpeg_path: None,
        }
    }
}

pub fn default_download_dir() -> PathBuf {
    let home = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")).map(PathBuf::from).unwrap_or_else(|| ".".into());
    home.join("Downloads").join("Downora")
}

impl Settings {
    pub fn normalized(mut self) -> Self {
        self.concurrency = self.concurrency.clamp(1, 6);
        self.bandwidth_limit_kib = self.bandwidth_limit_kib.min(10 * 1024 * 1024);
        if !self.download_dir.is_absolute() {
            self.download_dir = default_download_dir();
        }
        if let Some(p) = &self.ffmpeg_path {
            if !p.is_absolute() {
                self.ffmpeg_path = None;
            }
        }
        self
    }

    pub fn load(path: &Path) -> Self {
        std::fs::read(path)
            .ok()
            .and_then(|b| serde_json::from_slice::<Settings>(&b).ok())
            .unwrap_or_default()
            .normalized()
    }

    pub fn save(&self, path: &Path) -> std::io::Result<()> {
        crate::store::write_atomic(path, &serde_json::to_vec_pretty(self)?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clamps_bad_values() {
        let s: Settings = serde_json::from_str(r#"{"concurrency":99,"downloadDir":"relative/dir","ffmpegPath":"ffmpeg"}"#).unwrap();
        let s = s.normalized();
        assert_eq!(s.concurrency, 6);
        assert!(s.download_dir.is_absolute());
        assert_eq!(s.ffmpeg_path, None);
    }

    #[test]
    fn round_trips() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        let mut s = Settings::default();
        s.bandwidth_limit_kib = 512;
        s.save(&path).unwrap();
        assert_eq!(Settings::load(&path), s);
        std::fs::write(&path, b"{garbage").unwrap();
        assert_eq!(Settings::load(&path), Settings::default().normalized());
    }
}
