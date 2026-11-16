//! Downora desktop engine. Pure Rust, no UI: the Tauri app wraps it, and the
//! test suite drives it directly against a local HTTP server and real FFmpeg.

pub mod bridge;
pub mod disk;
pub mod download;
pub mod events;
pub mod ffmpeg;
pub mod limiter;
pub mod media;
pub mod names;
pub mod secrets;
pub mod settings;
pub mod store;

pub use events::{Event, Notice, NoticeKind};
