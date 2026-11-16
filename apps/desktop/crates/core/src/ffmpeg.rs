//! FFmpeg / FFprobe integration.
//!
//! - Only the FFmpeg binaries are ever executed, never a shell, and every
//!   argument is built here from validated values.
//! - Output formats are offered only when the installed FFmpeg has the
//!   encoders they need (`ffmpeg -encoders`).
//! - Conversions write to a hidden temp file and are renamed when complete,
//!   so a cancel or crash never leaves a broken file, and an existing file is
//!   only replaced when the caller passes `overwrite: true` (after asking).

use crate::events::{Event, Notice, NoticeKind};
use crate::media::Container;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{Arc, Mutex as StdMutex};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::{broadcast, RwLock};
use tokio::time::{timeout, Duration};
use tokio_util::sync::CancellationToken;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Ffmpeg {
    pub ffmpeg: PathBuf,
    pub ffprobe: PathBuf,
    pub version: String,
    #[serde(skip)]
    encoders: Arc<HashSet<String>>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeInfo {
    pub format_name: String,
    pub duration_sec: Option<f64>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub video_codec: Option<String>,
    pub audio_codec: Option<String>,
    pub size_bytes: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputSupport {
    pub container: Container,
    pub available: bool,
    /// Encoders that would be used, e.g. "libx264 + aac".
    pub encoders: Option<String>,
    pub missing: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Preset {
    High,
    Balanced,
    Small,
}

fn hidden_command(bin: &Path) -> Command {
    let mut c = Command::new(bin);
    c.stdin(Stdio::null()).kill_on_drop(true);
    #[cfg(windows)]
    {
        // CREATE_NO_WINDOW: don't flash a console window.
        c.creation_flags(0x0800_0000);
    }
    c
}

async fn run_capture(bin: &Path, args: &[&str], limit: Duration) -> Option<String> {
    let out = timeout(limit, hidden_command(bin).args(args).stdout(Stdio::piped()).stderr(Stdio::null()).output()).await.ok()?.ok()?;
    out.status.success().then(|| String::from_utf8_lossy(&out.stdout).into_owned())
}

impl Ffmpeg {
    /// Finds FFmpeg: an explicit path from Settings, then PATH, then the usual
    /// install folders. Returns `None` when it isn't installed.
    pub async fn discover(explicit: Option<&Path>) -> Option<Ffmpeg> {
        let exe = if cfg!(windows) { ".exe" } else { "" };
        let mut candidates: Vec<PathBuf> = vec![];
        if let Some(p) = explicit {
            candidates.push(p.to_path_buf());
        }
        if let Ok(p) = which::which("ffmpeg") {
            candidates.push(p);
        }
        for dir in ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "C:\\ffmpeg\\bin", "C:\\Program Files\\ffmpeg\\bin"] {
            candidates.push(Path::new(dir).join(format!("ffmpeg{exe}")));
        }
        for ffmpeg in candidates {
            if !ffmpeg.is_file() {
                continue;
            }
            let ffprobe = ffmpeg.with_file_name(format!("ffprobe{exe}"));
            if !ffprobe.is_file() {
                continue;
            }
            let Some(version) = run_capture(&ffmpeg, &["-hide_banner", "-version"], Duration::from_secs(5)).await else { continue };
            let encoders = run_capture(&ffmpeg, &["-hide_banner", "-encoders"], Duration::from_secs(5)).await.unwrap_or_default();
            return Some(Ffmpeg {
                ffmpeg,
                ffprobe,
                version: version.lines().next().unwrap_or("").replace("ffmpeg version ", "").split(' ').next().unwrap_or("").to_string(),
                encoders: Arc::new(parse_encoders(&encoders)),
            });
        }
        None
    }

    pub fn has(&self, encoder: &str) -> bool {
        self.encoders.contains(encoder)
    }

    fn video_encoder(&self, c: Container) -> Option<&'static str> {
        match c {
            Container::Mp4 | Container::Mkv => ["libx264", "h264_videotoolbox", "h264_mf", "mpeg4"].into_iter().find(|e| self.has(e)),
            Container::Webm => ["libvpx-vp9", "libvpx"].into_iter().find(|e| self.has(e)),
            _ => None,
        }
    }

    fn audio_encoder(&self, c: Container) -> Option<&'static str> {
        match c {
            Container::Mp4 | Container::Mkv | Container::M4a => ["aac", "aac_at"].into_iter().find(|e| self.has(e)),
            Container::Webm => ["libopus", "libvorbis"].into_iter().find(|e| self.has(e)),
            Container::Mp3 => ["libmp3lame"].into_iter().find(|e| self.has(e)),
            Container::Wav => ["pcm_s16le"].into_iter().find(|e| self.has(e)),
        }
    }

    /// Which output formats this FFmpeg can produce, and why not when it can't.
    pub fn outputs(&self) -> Vec<OutputSupport> {
        Container::ALL
            .iter()
            .map(|&c| {
                let a = self.audio_encoder(c);
                let v = if c.kind() == crate::media::Kind::Video { Some(self.video_encoder(c)) } else { None };
                let (available, encoders, missing) = match (v, a) {
                    (Some(Some(v)), Some(a)) => (true, Some(format!("{v} + {a}")), None),
                    (None, Some(a)) => (true, Some(a.to_string()), None),
                    (Some(None), _) => (false, None, Some("a video encoder".to_string())),
                    (_, None) => (false, None, Some("an audio encoder".to_string())),
                };
                OutputSupport { container: c, available, encoders, missing: missing.map(|m| format!("This FFmpeg build has no {m} for {}.", c.ext().to_uppercase())) }
            })
            .collect()
    }

    pub async fn probe(&self, input: &Path) -> Result<ProbeInfo, String> {
        self.probe_raw(&[OsString::from(input)]).await
    }

    /// Probes a remote http(s) file. Only network protocols are allowed, so a
    /// crafted URL can't make FFprobe read local files.
    pub async fn probe_url(&self, url: &str) -> Result<ProbeInfo, String> {
        if !(url.starts_with("http://") || url.starts_with("https://")) {
            return Err("Only http and https links can be probed.".into());
        }
        self.probe_raw(&["-protocol_whitelist".into(), "http,https,tcp,tls".into(), "-rw_timeout".into(), "10000000".into(), url.into()]).await
    }

    async fn probe_raw(&self, input: &[OsString]) -> Result<ProbeInfo, String> {
        let mut args: Vec<OsString> = ["-v", "error", "-print_format", "json", "-show_format", "-show_streams"].iter().map(OsString::from).collect();
        args.extend_from_slice(input);
        let out = timeout(Duration::from_secs(20), hidden_command(&self.ffprobe).args(&args).stdout(Stdio::piped()).stderr(Stdio::piped()).output())
            .await
            .map_err(|_| "FFprobe took too long.".to_string())?
            .map_err(|e| format!("Couldn’t run FFprobe: {e}"))?;
        if !out.status.success() {
            return Err("FFprobe couldn’t read this file. It may be damaged or not a media file.".into());
        }
        parse_probe(&out.stdout)
    }

    /// Writes a 320 px wide JPEG from about 10 % into the video.
    pub async fn thumbnail(&self, input: &Path, out: &Path, duration: Option<f64>) -> Result<(), String> {
        if let Some(d) = out.parent() {
            tokio::fs::create_dir_all(d).await.map_err(|e| e.to_string())?;
        }
        let at = duration.map(|d| (d * 0.1).min(5.0)).unwrap_or(0.0);
        let args: Vec<OsString> = vec![
            "-hide_banner".into(), "-loglevel".into(), "error".into(), "-y".into(),
            "-ss".into(), format!("{at:.2}").into(), "-i".into(), input.into(),
            "-frames:v".into(), "1".into(), "-vf".into(), "scale=320:-2".into(), "-q:v".into(), "4".into(), out.into(),
        ];
        let st = timeout(Duration::from_secs(20), hidden_command(&self.ffmpeg).args(&args).stdout(Stdio::null()).stderr(Stdio::null()).status())
            .await
            .map_err(|_| "Thumbnail timed out".to_string())?
            .map_err(|e| e.to_string())?;
        if st.success() { Ok(()) } else { Err("Couldn’t make a thumbnail.".into()) }
    }

    /// FFmpeg arguments for a conversion. Pure, so it is unit-tested.
    pub fn build_args(&self, input: &Path, output: &Path, format: Container, preset: Preset, info: &ProbeInfo) -> Result<Vec<OsString>, String> {
        let has_video = info.video_codec.is_some();
        let has_audio = info.audio_codec.is_some();
        let video_out = format.kind() == crate::media::Kind::Video;
        if video_out && !has_video {
            return Err(format!("This file has no video, so it can’t become {}. Pick an audio format.", format.ext().to_uppercase()));
        }
        if !video_out && !has_audio {
            return Err("This file has no audio track to extract.".into());
        }
        let support = self.outputs().into_iter().find(|o| o.container == format).expect("all formats listed");
        if !support.available {
            return Err(support.missing.unwrap_or_default());
        }
        let p = |h: &str, b: &str, s: &str| -> String { match preset { Preset::High => h, Preset::Balanced => b, Preset::Small => s }.to_string() };
        let mut a: Vec<String> = vec!["-hide_banner".into(), "-nostdin".into(), "-y".into(), "-i".into()];
        let mut args: Vec<OsString> = a.drain(..).map(OsString::from).collect();
        args.push(input.into());
        let mut rest: Vec<String> = vec!["-map_metadata".into(), "0".into()];

        if video_out {
            rest.extend(["-map".into(), "0:v:0".into(), "-map".into(), "0:a:0?".into()]);
            let venc = self.video_encoder(format).unwrap();
            rest.extend(["-c:v".into(), venc.into()]);
            match venc {
                "libx264" => rest.extend(["-crf".into(), p("20", "23", "28"), "-preset".into(), p("slow", "medium", "veryfast"), "-pix_fmt".into(), "yuv420p".into()]),
                "libvpx-vp9" | "libvpx" => rest.extend(["-b:v".into(), "0".into(), "-crf".into(), p("28", "33", "40"), "-row-mt".into(), "1".into(), "-deadline".into(), "good".into(), "-cpu-used".into(), p("2", "4", "5")]),
                _ => rest.extend(["-b:v".into(), p("8M", "4M", "1500k")]),
            }
            if preset == Preset::Small {
                // Shrink to 720p at most; never upscale.
                rest.extend(["-vf".into(), "scale='min(1280,iw)':-2".into()]);
            }
            if has_audio {
                let aenc = self.audio_encoder(format).unwrap();
                rest.extend(["-c:a".into(), aenc.into(), "-b:a".into(), p("192k", "160k", "96k")]);
            }
            if format == Container::Mp4 {
                rest.extend(["-movflags".into(), "+faststart".into()]);
            }
        } else {
            rest.extend(["-map".into(), "0:a:0".into(), "-vn".into()]);
            match format {
                Container::Mp3 => rest.extend(["-c:a".into(), "libmp3lame".into(), "-q:a".into(), p("0", "2", "5")]),
                Container::Wav => rest.extend(["-c:a".into(), "pcm_s16le".into()]),
                _ => rest.extend(["-c:a".into(), self.audio_encoder(format).unwrap().into(), "-b:a".into(), p("256k", "192k", "128k")]),
            }
        }
        rest.extend(["-f".into(), muxer(format).into(), "-progress".into(), "pipe:1".into(), "-nostats".into()]);
        args.extend(rest.into_iter().map(OsString::from));
        args.push(output.into());
        Ok(args)
    }
}

fn muxer(c: Container) -> &'static str {
    match c {
        Container::Mp4 => "mp4",
        Container::Webm => "webm",
        Container::Mkv => "matroska",
        Container::Mp3 => "mp3",
        Container::Wav => "wav",
        Container::M4a => "ipod",
    }
}

fn parse_encoders(text: &str) -> HashSet<String> {
    // Lines look like " V....D libx264   libx264 H.264 / AVC ..."
    text.lines()
        .filter_map(|l| {
            let mut parts = l.split_whitespace();
            let flags = parts.next()?;
            let name = parts.next()?;
            (flags.len() == 6 && "VAS".contains(&flags[..1]) && name != "=").then(|| name.to_string())
        })
        .collect()
}

fn parse_probe(json: &[u8]) -> Result<ProbeInfo, String> {
    let v: serde_json::Value = serde_json::from_slice(json).map_err(|_| "Unreadable FFprobe output.".to_string())?;
    let mut info = ProbeInfo::default();
    let fmt = &v["format"];
    info.format_name = fmt["format_name"].as_str().unwrap_or("").to_string();
    info.duration_sec = fmt["duration"].as_str().and_then(|d| d.parse().ok());
    info.size_bytes = fmt["size"].as_str().and_then(|d| d.parse().ok());
    for s in v["streams"].as_array().into_iter().flatten() {
        let codec = s["codec_name"].as_str().map(str::to_string);
        match s["codec_type"].as_str() {
            // Cover art in audio files is an attached picture, not video.
            Some("video") if s["disposition"]["attached_pic"].as_i64() != Some(1) && info.video_codec.is_none() => {
                info.video_codec = codec;
                info.width = s["width"].as_u64().map(|w| w as u32);
                info.height = s["height"].as_u64().map(|h| h as u32);
            }
            Some("audio") if info.audio_codec.is_none() => info.audio_codec = codec,
            _ => {}
        }
    }
    if info.video_codec.is_none() && info.audio_codec.is_none() {
        return Err("No audio or video found in this file.".into());
    }
    Ok(info)
}

// ───────────────────────── conversions ─────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ConversionStatus {
    Running,
    Completed,
    Failed,
    Canceled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Conversion {
    pub id: String,
    pub input: PathBuf,
    pub output: PathBuf,
    pub format: Container,
    pub preset: Preset,
    pub status: ConversionStatus,
    /// 0–1, from FFmpeg's own progress output. `None` when duration is unknown.
    pub progress: Option<f64>,
    pub error: Option<String>,
    pub size_bytes: Option<u64>,
    pub started_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConvertRequest {
    pub input: PathBuf,
    pub output_dir: PathBuf,
    pub format: Container,
    pub preset: Preset,
    /// Replace an existing file with the same name. The UI asks first.
    #[serde(default)]
    pub overwrite: bool,
}

#[derive(Debug, thiserror::Error, Serialize)]
#[serde(tag = "code", content = "message", rename_all = "camelCase")]
pub enum ConvertError {
    #[error("FFmpeg isn’t installed, so conversion is unavailable.")]
    NoFfmpeg,
    #[error("{0}")]
    Invalid(String),
    /// The output exists; ask the user before passing `overwrite: true`.
    #[error("{0}")]
    Exists(String),
}

pub struct Converter {
    ffmpeg: RwLock<Option<Ffmpeg>>,
    items: RwLock<Vec<Conversion>>,
    running: StdMutex<HashMap<String, CancellationToken>>,
    events: broadcast::Sender<Event>,
    store: PathBuf,
}

impl Converter {
    pub fn new(data_dir: &Path, ffmpeg: Option<Ffmpeg>, events: broadcast::Sender<Event>) -> Arc<Self> {
        let store = data_dir.join("conversions.json");
        let mut items: Vec<Conversion> = std::fs::read(&store).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default();
        for c in &mut items {
            if c.status == ConversionStatus::Running {
                c.status = ConversionStatus::Failed;
                c.error = Some("Downora was closed before this finished.".into());
            }
        }
        Arc::new(Self { ffmpeg: RwLock::new(ffmpeg), items: RwLock::new(items), running: StdMutex::new(HashMap::new()), events, store })
    }

    pub async fn ffmpeg(&self) -> Option<Ffmpeg> {
        self.ffmpeg.read().await.clone()
    }
    pub async fn set_ffmpeg(&self, f: Option<Ffmpeg>) {
        *self.ffmpeg.write().await = f;
    }
    pub async fn list(&self) -> Vec<Conversion> {
        self.items.read().await.clone()
    }

    async fn save(&self) {
        if let Ok(b) = serde_json::to_vec(&*self.items.read().await) {
            let _ = crate::store::write_atomic(&self.store, &b);
        }
    }

    async fn set(&self, id: &str, f: impl FnOnce(&mut Conversion)) {
        let mut items = self.items.write().await;
        if let Some(c) = items.iter_mut().find(|c| c.id == id) {
            f(c);
            let _ = self.events.send(Event::Conversion { conversion: c.clone() });
        }
    }

    pub async fn start(self: &Arc<Self>, req: ConvertRequest) -> Result<Conversion, ConvertError> {
        let ff = self.ffmpeg().await.ok_or(ConvertError::NoFfmpeg)?;
        let input = req.input.canonicalize().map_err(|_| ConvertError::Invalid("The input file doesn’t exist.".into()))?;
        if !input.is_file() {
            return Err(ConvertError::Invalid("The input must be a file.".into()));
        }
        if !req.output_dir.is_absolute() || !req.output_dir.is_dir() {
            return Err(ConvertError::Invalid("Choose an existing output folder.".into()));
        }
        let info = ff.probe(&input).await.map_err(ConvertError::Invalid)?;
        let stem = crate::names::sanitize_stem(&input.file_stem().unwrap_or_default().to_string_lossy());
        let output = req.output_dir.join(format!("{stem}.{}", req.format.ext()));
        if output.exists() && !req.overwrite {
            let what = if output == input { "This would replace the original file" } else { "A file with this name already exists" };
            return Err(ConvertError::Exists(format!("{what}: {}.", output.display())));
        }
        let temp = req.output_dir.join(format!(".{}.downora-convert.{}", uuid::Uuid::new_v4(), req.format.ext()));
        let args = ff.build_args(&input, &temp, req.format, req.preset, &info).map_err(ConvertError::Invalid)?;

        let conv = Conversion {
            id: uuid::Uuid::new_v4().to_string(),
            input: input.clone(),
            output: output.clone(),
            format: req.format,
            preset: req.preset,
            status: ConversionStatus::Running,
            progress: info.duration_sec.map(|_| 0.0),
            error: None,
            size_bytes: None,
            started_at: Utc::now(),
            completed_at: None,
        };
        self.items.write().await.insert(0, conv.clone());
        let _ = self.events.send(Event::Conversion { conversion: conv.clone() });
        let token = CancellationToken::new();
        self.running.lock().unwrap().insert(conv.id.clone(), token.clone());
        let me = self.clone();
        let id = conv.id.clone();
        tokio::spawn(async move {
            let res = me.run(&id, &ff, args, info.duration_sec, &temp, &output, token).await;
            me.running.lock().unwrap().remove(&id);
            match res {
                Ok(size) => {
                    me.set(&id, |c| {
                        c.status = ConversionStatus::Completed;
                        c.progress = Some(1.0);
                        c.size_bytes = Some(size);
                        c.completed_at = Some(Utc::now());
                    })
                    .await;
                    let name = output.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
                    let _ = me.events.send(Event::Notice(Notice { kind: NoticeKind::ConversionComplete, title: "Conversion finished".into(), body: name }));
                }
                Err(None) => me.set(&id, |c| c.status = ConversionStatus::Canceled).await,
                Err(Some(msg)) => {
                    me.set(&id, |c| {
                        c.status = ConversionStatus::Failed;
                        c.error = Some(msg);
                    })
                    .await
                }
            }
            let _ = tokio::fs::remove_file(&temp).await;
            me.save().await;
        });
        self.save().await;
        Ok(conv)
    }

    /// `Err(None)` = canceled.
    #[allow(clippy::too_many_arguments)]
    async fn run(&self, id: &str, ff: &Ffmpeg, args: Vec<OsString>, duration: Option<f64>, temp: &Path, output: &Path, token: CancellationToken) -> Result<u64, Option<String>> {
        let mut child = hidden_command(&ff.ffmpeg).args(&args).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().map_err(|e| Some(format!("Couldn’t start FFmpeg: {e}")))?;
        let stdout = child.stdout.take().unwrap();
        let mut stderr = child.stderr.take().unwrap();
        let err_task = tokio::spawn(async move {
            let mut s = String::new();
            let _ = tokio::io::AsyncReadExt::read_to_string(&mut stderr, &mut s).await;
            s
        });
        let mut lines = BufReader::new(stdout).lines();
        let mut last = 0.0;
        loop {
            tokio::select! {
                _ = token.cancelled() => {
                    let _ = child.kill().await;
                    return Err(None);
                }
                line = lines.next_line() => match line {
                    Ok(Some(l)) => {
                        if let (Some(us), Some(d)) = (l.strip_prefix("out_time_us=").and_then(|v| v.parse::<f64>().ok()), duration) {
                            let p = (us / 1e6 / d).clamp(0.0, 0.999);
                            if p - last >= 0.01 {
                                last = p;
                                self.set(id, |c| c.progress = Some(p)).await;
                            }
                        }
                    }
                    _ => break,
                }
            }
        }
        let status = child.wait().await.map_err(|e| Some(e.to_string()))?;
        let stderr = err_task.await.unwrap_or_default();
        if !status.success() {
            let reason = stderr.lines().rev().find(|l| !l.trim().is_empty()).unwrap_or("unknown error").to_string();
            return Err(Some(format!("FFmpeg failed: {reason}")));
        }
        tokio::fs::rename(temp, output).await.map_err(|e| Some(format!("Couldn’t save the converted file: {e}")))?;
        Ok(tokio::fs::metadata(output).await.map(|m| m.len()).unwrap_or(0))
    }

    pub fn cancel(&self, id: &str) -> bool {
        self.running.lock().unwrap().get(id).map(|t| t.cancel()).is_some()
    }

    pub async fn clear_finished(&self) {
        self.items.write().await.retain(|c| c.status == ConversionStatus::Running);
        self.save().await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_encoder_list() {
        let text = " V..... = Video\n ------\n V....D libx264              libx264 H.264\n A....D aac                  AAC\n A....D libmp3lame           MP3\n";
        let set = parse_encoders(text);
        assert!(set.contains("libx264") && set.contains("aac") && set.contains("libmp3lame"));
        assert!(!set.contains("="));
    }

    #[test]
    fn ignores_cover_art_as_video() {
        let json = br#"{"format":{"format_name":"mp3","duration":"12.0"},"streams":[{"codec_type":"audio","codec_name":"mp3"},{"codec_type":"video","codec_name":"mjpeg","width":500,"height":500,"disposition":{"attached_pic":1}}]}"#;
        let info = parse_probe(json).unwrap();
        assert_eq!(info.video_codec, None);
        assert_eq!(info.audio_codec.as_deref(), Some("mp3"));
    }
}
