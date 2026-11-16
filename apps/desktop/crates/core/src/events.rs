use crate::download::Job;
use crate::ffmpeg::Conversion;
use serde::Serialize;

/// Everything the engine tells the UI. The Tauri layer forwards these as
/// window events and turns `Notice`s into native notifications.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum Event {
    Job { job: Job },
    JobRemoved { id: String },
    Conversion { conversion: Conversion },
    /// A browser asked to pair; the user must approve or deny.
    PairRequest { request_id: String, origin: String, client_name: String },
    PairingChanged,
    BrowserConnection { connected: bool },
    Notice(Notice),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum NoticeKind {
    DownloadComplete,
    DownloadFailed,
    ConversionComplete,
    LowStorage,
    BrowserLost,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Notice {
    pub kind: NoticeKind,
    pub title: String,
    pub body: String,
}
