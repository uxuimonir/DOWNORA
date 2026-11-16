//! Download manager. Every number it reports comes from bytes actually
//! written to disk; nothing is estimated except speed and ETA, and ETA is only
//! given once the total size is known and the speed has settled.

use crate::events::{Event, Notice, NoticeKind};
use crate::ffmpeg::Ffmpeg;
use crate::limiter::Limiter;
use crate::media::{self, Container, Kind};
use crate::names::{self, Duplicates};
use crate::settings::Settings;
use chrono::{DateTime, Utc};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex as StdMutex};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::{broadcast, RwLock};
use tokio::time::{timeout, Duration, Instant};
use tokio_util::sync::CancellationToken;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    Queued,
    Downloading,
    Paused,
    Completed,
    Failed,
    Canceled,
}

impl Status {
    pub fn is_active(self) -> bool {
        matches!(self, Self::Queued | Self::Downloading | Self::Paused)
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Source {
    App,
    Browser { origin: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Job {
    pub id: String,
    pub url: String,
    pub title: String,
    /// File name without extension, already templated and sanitised.
    pub stem: String,
    pub dir: PathBuf,
    /// Set once the file is saved.
    pub path: Option<PathBuf>,
    pub container: Option<Container>,
    pub kind: Option<Kind>,
    pub quality: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub duration_sec: Option<f64>,
    pub thumbnail: Option<PathBuf>,
    pub status: Status,
    pub bytes_received: u64,
    pub bytes_total: Option<u64>,
    pub speed_bps: Option<f64>,
    pub eta_sec: Option<f64>,
    /// Whether the server accepted a Range request. `None` until known.
    pub resumable: Option<bool>,
    /// ETag or Last-Modified from the first response, sent as If-Range on resume
    /// so a file that changed on the server restarts instead of being stitched.
    #[serde(default)]
    pub validator: Option<String>,
    pub error: Option<String>,
    pub source: Source,
    pub created_at: DateTime<Utc>,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
}

impl Job {
    pub fn file_name(&self) -> String {
        match (&self.path, self.container) {
            (Some(p), _) => p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
            (None, Some(c)) => format!("{}.{}", self.stem, c.ext()),
            (None, None) => self.stem.clone(),
        }
    }
    fn part_path(&self) -> PathBuf {
        self.dir.join(format!(".{}.downora-part", self.id))
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddRequest {
    pub url: String,
    pub title: Option<String>,
    pub container: Option<Container>,
    pub quality: Option<String>,
    /// Custom folder for this download (must be absolute).
    pub dir: Option<PathBuf>,
    #[serde(skip)]
    pub source: Option<Source>,
}

#[derive(Debug, thiserror::Error)]
pub enum DownloadError {
    #[error("{0}")]
    Url(#[from] media::UrlError),
    #[error("The folder must be a full path.")]
    BadDir,
    #[error("No download with that id.")]
    NotFound,
    #[error("That can’t be done while the download is {0:?}.")]
    WrongState(Status),
    #[error("Couldn’t save the download list: {0}")]
    Io(#[from] std::io::Error),
}

/// Internal transfer outcome.
#[derive(Debug, thiserror::Error)]
enum TransferError {
    #[error("stopped")]
    Stopped,
    #[error("{0}")]
    User(String),
    #[error("Not enough free space: {need} needed, {free} free.")]
    Storage { need: String, free: String },
}

#[derive(Clone, Copy, PartialEq)]
enum StopReason {
    Pause,
    Cancel,
    Remove,
}

struct Running {
    token: CancellationToken,
    reason: Arc<StdMutex<Option<StopReason>>>,
}

pub struct Inner {
    jobs: RwLock<Vec<Job>>,
    running: StdMutex<HashMap<String, Running>>,
    settings: Arc<RwLock<Settings>>,
    client: reqwest::Client,
    events: broadcast::Sender<Event>,
    limiter: Limiter,
    store: PathBuf,
    cache_dir: PathBuf,
    ffmpeg: RwLock<Option<Ffmpeg>>,
}

#[derive(Clone)]
pub struct Manager(Arc<Inner>);

/// The engine's HTTP client type, re-exported for the app crate.
pub type HttpClient = reqwest::Client;

pub fn http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent(concat!("Downora/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(Duration::from_secs(15))
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .expect("http client")
}

fn human(bytes: u64) -> String {
    let units = ["B", "KB", "MB", "GB", "TB"];
    let mut v = bytes as f64;
    let mut i = 0;
    while v >= 1024.0 && i < units.len() - 1 {
        v /= 1024.0;
        i += 1;
    }
    if i == 0 { format!("{bytes} B") } else { format!("{v:.1} {}", units[i]) }
}

impl Manager {
    /// `data_dir` holds jobs.json; `cache_dir` holds thumbnails.
    pub fn new(data_dir: &Path, cache_dir: &Path, settings: Arc<RwLock<Settings>>, events: broadcast::Sender<Event>, ffmpeg: Option<Ffmpeg>) -> Self {
        let store = data_dir.join("jobs.json");
        let mut jobs: Vec<Job> = std::fs::read(&store).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default();
        // A crash or quit mid-download: keep the partial file, park as paused.
        for j in &mut jobs {
            if j.status == Status::Downloading {
                j.status = Status::Paused;
                j.speed_bps = None;
                j.eta_sec = None;
            }
        }
        let limit = settings.try_read().map(|s| s.bandwidth_limit_kib * 1024).unwrap_or(0);
        let inner = Inner {
            jobs: RwLock::new(jobs),
            running: StdMutex::new(HashMap::new()),
            settings,
            client: http_client(),
            events,
            limiter: Limiter::new(limit),
            store,
            cache_dir: cache_dir.to_path_buf(),
            ffmpeg: RwLock::new(ffmpeg),
        };
        Manager(Arc::new(inner))
    }

    pub async fn set_ffmpeg(&self, ffmpeg: Option<Ffmpeg>) {
        *self.0.ffmpeg.write().await = ffmpeg;
    }

    /// Removes partial files nobody will resume. Call once at startup.
    pub async fn cleanup_orphans(&self) -> usize {
        let jobs = self.0.jobs.read().await;
        let keep: std::collections::HashSet<String> =
            jobs.iter().filter(|j| matches!(j.status, Status::Paused | Status::Queued | Status::Failed)).map(|j| j.id.clone()).collect();
        let mut dirs: std::collections::HashSet<PathBuf> = jobs.iter().map(|j| j.dir.clone()).collect();
        dirs.insert(self.0.settings.read().await.download_dir.clone());
        let mut removed = 0;
        for dir in dirs {
            let Ok(entries) = std::fs::read_dir(&dir) else { continue };
            for e in entries.flatten() {
                let name = e.file_name().to_string_lossy().into_owned();
                if let Some(id) = name.strip_prefix('.').and_then(|n| n.strip_suffix(".downora-part")) {
                    if !keep.contains(id) && std::fs::remove_file(e.path()).is_ok() {
                        removed += 1;
                    }
                }
            }
        }
        removed
    }

    pub async fn list(&self) -> Vec<Job> {
        self.0.jobs.read().await.clone()
    }

    pub async fn get(&self, id: &str) -> Option<Job> {
        self.0.jobs.read().await.iter().find(|j| j.id == id).cloned()
    }

    pub async fn apply_settings(&self) {
        let s = self.0.settings.read().await;
        self.0.limiter.set(s.bandwidth_limit_kib * 1024);
        drop(s);
        self.pump().await;
    }

    pub async fn add(&self, req: AddRequest) -> Result<Job, DownloadError> {
        let (url, container) = media::validate_media_url(&req.url, req.container)?;
        let settings = self.0.settings.read().await.clone();
        let dir = match req.dir {
            Some(d) if d.is_absolute() => d,
            Some(_) => return Err(DownloadError::BadDir),
            None => settings.download_dir.clone(),
        };
        let title = req.title.filter(|t| !t.trim().is_empty()).unwrap_or_else(|| names::title_from_url(&url));
        let title: String = title.chars().take(200).collect();
        let stem = names::apply_template(settings.name_template, &title, req.quality.as_deref(), Utc::now().date_naive());
        let job = Job {
            id: uuid::Uuid::new_v4().to_string(),
            url: url.to_string(),
            title,
            stem,
            dir,
            path: None,
            container,
            kind: container.map(Container::kind),
            quality: req.quality,
            width: None,
            height: None,
            duration_sec: None,
            thumbnail: None,
            status: Status::Queued,
            bytes_received: 0,
            bytes_total: None,
            speed_bps: None,
            eta_sec: None,
            resumable: None,
            validator: None,
            error: None,
            source: req.source.unwrap_or(Source::App),
            created_at: Utc::now(),
            started_at: None,
            completed_at: None,
        };
        self.0.jobs.write().await.insert(0, job.clone());
        self.persist().await?;
        self.emit_job(&job);
        self.pump().await;
        Ok(self.get(&job.id).await.unwrap_or(job))
    }

    pub async fn pause(&self, id: &str) -> Result<(), DownloadError> {
        let status = self.get(id).await.ok_or(DownloadError::NotFound)?.status;
        match status {
            Status::Downloading => self.stop(id, StopReason::Pause),
            Status::Queued => {
                self.update(id, |j| j.status = Status::Paused).await;
                self.persist().await?;
            }
            s => return Err(DownloadError::WrongState(s)),
        }
        Ok(())
    }

    pub async fn resume(&self, id: &str) -> Result<(), DownloadError> {
        let status = self.get(id).await.ok_or(DownloadError::NotFound)?.status;
        if status != Status::Paused {
            return Err(DownloadError::WrongState(status));
        }
        self.update(id, |j| j.status = Status::Queued).await;
        self.persist().await?;
        self.pump().await;
        Ok(())
    }

    pub async fn cancel(&self, id: &str) -> Result<(), DownloadError> {
        let job = self.get(id).await.ok_or(DownloadError::NotFound)?;
        match job.status {
            Status::Downloading => self.stop(id, StopReason::Cancel),
            Status::Queued | Status::Paused => {
                let _ = tokio::fs::remove_file(job.part_path()).await;
                self.update(id, |j| {
                    j.status = Status::Canceled;
                    j.bytes_received = 0;
                })
                .await;
                self.persist().await?;
            }
            s => return Err(DownloadError::WrongState(s)),
        }
        Ok(())
    }

    /// Starts a failed or canceled download again; keeps the partial file if the
    /// server supports resuming.
    pub async fn retry(&self, id: &str) -> Result<(), DownloadError> {
        let job = self.get(id).await.ok_or(DownloadError::NotFound)?;
        if !matches!(job.status, Status::Failed | Status::Canceled) {
            return Err(DownloadError::WrongState(job.status));
        }
        self.update(id, |j| {
            j.status = Status::Queued;
            j.error = None;
        })
        .await;
        self.persist().await?;
        self.pump().await;
        Ok(())
    }

    /// Removes the entry from the list. The saved file is never deleted.
    pub async fn remove(&self, id: &str) -> Result<(), DownloadError> {
        let job = self.get(id).await.ok_or(DownloadError::NotFound)?;
        if job.status == Status::Downloading {
            self.stop(id, StopReason::Remove);
            return Ok(());
        }
        let _ = tokio::fs::remove_file(job.part_path()).await;
        self.0.jobs.write().await.retain(|j| j.id != id);
        self.persist().await?;
        let _ = self.0.events.send(Event::JobRemoved { id: id.into() });
        Ok(())
    }

    pub async fn clear_finished(&self) -> Result<(), DownloadError> {
        let gone: Vec<String> = self.0.jobs.read().await.iter().filter(|j| !j.status.is_active()).map(|j| j.id.clone()).collect();
        for id in gone {
            self.remove(&id).await?;
        }
        Ok(())
    }

    fn stop(&self, id: &str, reason: StopReason) {
        if let Some(r) = self.0.running.lock().unwrap().get(id) {
            *r.reason.lock().unwrap() = Some(reason);
            r.token.cancel();
        }
    }

    async fn update(&self, id: &str, f: impl FnOnce(&mut Job)) -> Option<Job> {
        let mut jobs = self.0.jobs.write().await;
        let job = jobs.iter_mut().find(|j| j.id == id)?;
        f(job);
        let snapshot = job.clone();
        drop(jobs);
        self.emit_job(&snapshot);
        Some(snapshot)
    }

    fn emit_job(&self, job: &Job) {
        let _ = self.0.events.send(Event::Job { job: job.clone() });
    }

    fn notice(&self, kind: NoticeKind, title: &str, body: String) {
        let _ = self.0.events.send(Event::Notice(Notice { kind, title: title.into(), body }));
    }

    async fn persist(&self) -> std::io::Result<()> {
        let bytes = serde_json::to_vec(&*self.0.jobs.read().await)?;
        crate::store::write_atomic(&self.0.store, &bytes)
    }

    /// Starts queued jobs, oldest first, up to the concurrency limit.
    pub fn pump(&self) -> futures_util::future::BoxFuture<'_, ()> {
        Box::pin(async move {
            let limit = self.0.settings.read().await.concurrency;
            let mut to_start = vec![];
            {
                let mut jobs = self.0.jobs.write().await;
                let running = jobs.iter().filter(|j| j.status == Status::Downloading).count();
                let mut slots = limit.saturating_sub(running);
                for j in jobs.iter_mut().rev() {
                    if slots == 0 {
                        break;
                    }
                    if j.status == Status::Queued {
                        j.status = Status::Downloading;
                        j.started_at.get_or_insert_with(Utc::now);
                        to_start.push(j.clone());
                        slots -= 1;
                    }
                }
            }
            for job in to_start {
                self.emit_job(&job);
                let token = CancellationToken::new();
                let reason = Arc::new(StdMutex::new(None));
                self.0.running.lock().unwrap().insert(job.id.clone(), Running { token: token.clone(), reason: reason.clone() });
                let me = self.clone();
                tokio::spawn(async move { me.run(job.id, token, reason).await });
            }
        })
    }

    async fn run(self, id: String, token: CancellationToken, reason: Arc<StdMutex<Option<StopReason>>>) {
        let result = self.transfer(&id, token).await;
        self.0.running.lock().unwrap().remove(&id);
        let stop = *reason.lock().unwrap();
        match result {
            Ok(()) => {
                if let Some(job) = self.get(&id).await {
                    self.notice(NoticeKind::DownloadComplete, "Download finished", job.file_name());
                }
            }
            Err(TransferError::Stopped) => match stop {
                Some(StopReason::Pause) => {
                    self.update(&id, |j| {
                        j.status = Status::Paused;
                        j.speed_bps = None;
                        j.eta_sec = None;
                    })
                    .await;
                }
                Some(StopReason::Remove) => {
                    let _ = self.remove_after_stop(&id).await;
                }
                _ => {
                    if let Some(job) = self.get(&id).await {
                        let _ = tokio::fs::remove_file(job.part_path()).await;
                    }
                    self.update(&id, |j| {
                        j.status = Status::Canceled;
                        j.bytes_received = 0;
                        j.speed_bps = None;
                        j.eta_sec = None;
                    })
                    .await;
                }
            },
            Err(e) => {
                let msg = e.to_string();
                if matches!(e, TransferError::Storage { .. }) {
                    self.notice(NoticeKind::LowStorage, "Not enough storage", msg.clone());
                }
                if let Some(job) = self.update(&id, |j| {
                    j.status = Status::Failed;
                    j.error = Some(msg.clone());
                    j.speed_bps = None;
                    j.eta_sec = None;
                })
                .await
                {
                    self.notice(NoticeKind::DownloadFailed, "Download failed", format!("{}: {msg}", job.file_name()));
                }
            }
        }
        let _ = self.persist().await;
        self.pump().await;
    }

    async fn remove_after_stop(&self, id: &str) -> Result<(), DownloadError> {
        if let Some(job) = self.get(id).await {
            let _ = tokio::fs::remove_file(job.part_path()).await;
        }
        self.0.jobs.write().await.retain(|j| j.id != id);
        let _ = self.0.events.send(Event::JobRemoved { id: id.into() });
        Ok(())
    }

    async fn transfer(&self, id: &str, token: CancellationToken) -> Result<(), TransferError> {
        let job = self.get(id).await.ok_or_else(|| TransferError::User("Download disappeared.".into()))?;
        tokio::fs::create_dir_all(&job.dir)
            .await
            .map_err(|e| TransferError::User(format!("Couldn’t create the folder {}: {e}", job.dir.display())))?;
        let part = job.part_path();
        let existing = match tokio::fs::metadata(&part).await {
            Ok(m) if job.bytes_received > 0 => m.len(),
            _ => 0,
        };

        let mut req = self.0.client.get(&job.url);
        if existing > 0 {
            req = req.header(reqwest::header::RANGE, format!("bytes={existing}-"));
            if let Some(v) = &job.validator {
                req = req.header(reqwest::header::IF_RANGE, v);
            }
        }
        let resp = tokio::select! {
            _ = token.cancelled() => return Err(TransferError::Stopped),
            r = req.send() => r.map_err(|e| TransferError::User(if e.is_connect() || e.is_timeout() {
                "Couldn’t reach the server. Check your connection and try again.".into()
            } else {
                format!("The connection failed: {e}")
            }))?,
        };
        let status = resp.status();
        if status == reqwest::StatusCode::RANGE_NOT_SATISFIABLE {
            let _ = tokio::fs::remove_file(&part).await;
            self.update(id, |j| j.bytes_received = 0).await;
            return Err(TransferError::User("The file changed on the server. Retry to download it again.".into()));
        }
        if !status.is_success() {
            return Err(TransferError::User(match status.as_u16() {
                401 | 403 => format!("The site refused the download (error {}). Downora never signs in for you.", status.as_u16()),
                404 | 410 => "The file is no longer at this address.".into(),
                s => format!("The server answered with error {s}."),
            }));
        }
        let headers = resp.headers().clone();
        let ctype = headers.get(reqwest::header::CONTENT_TYPE).and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
        if ctype.starts_with("text/html") {
            return Err(TransferError::User("This address opens a web page, not a media file.".into()));
        }
        let container = match job.container.or_else(|| Container::from_mime(&ctype)) {
            Some(c) => c,
            None => return Err(TransferError::User("This isn’t a supported media file (MP4, WebM, MP3, M4A or WAV).".into())),
        };
        let resumed = existing > 0 && status == reqwest::StatusCode::PARTIAL_CONTENT;
        if resumed {
            // The server must send exactly the part we asked for.
            let range_start = headers
                .get(reqwest::header::CONTENT_RANGE)
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.strip_prefix("bytes "))
                .and_then(|v| v.split('-').next())
                .and_then(|v| v.parse::<u64>().ok());
            if range_start != Some(existing) {
                let _ = tokio::fs::remove_file(&part).await;
                self.update(id, |j| j.bytes_received = 0).await;
                return Err(TransferError::User("The server sent the wrong part of the file. Retry to start over.".into()));
            }
        }
        let validator = headers
            .get(reqwest::header::ETAG)
            .and_then(|v| v.to_str().ok())
            .filter(|e| !e.starts_with("W/"))
            .or_else(|| headers.get(reqwest::header::LAST_MODIFIED).and_then(|v| v.to_str().ok()))
            .map(str::to_string);
        let start = if resumed { existing } else { 0 };
        let length = headers.get(reqwest::header::CONTENT_LENGTH).and_then(|v| v.to_str().ok()).and_then(|v| v.parse::<u64>().ok());
        let range_total = headers
            .get(reqwest::header::CONTENT_RANGE)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.rsplit('/').next())
            .and_then(|v| v.parse::<u64>().ok());
        let total = if resumed { range_total.or(length.map(|l| l + start)) } else { length };
        let resumable = resumed
            || headers.get(reqwest::header::ACCEPT_RANGES).and_then(|v| v.to_str().ok()).map(|v| v.contains("bytes")).unwrap_or(false);

        if let Some(total) = total {
            let need = total.saturating_sub(start) + crate::disk::SAFETY_MARGIN;
            if let Some(free) = crate::disk::available_space(&job.dir) {
                if free < need {
                    return Err(TransferError::Storage { need: human(need), free: human(free) });
                }
            }
        }

        self.update(id, |j| {
            j.container = Some(container);
            j.kind = Some(container.kind());
            j.bytes_total = total;
            j.bytes_received = start;
            j.resumable = Some(resumable);
            if !resumed {
                j.validator = validator.clone();
            }
        })
        .await;

        let mut file = tokio::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .append(resumed)
            .truncate(!resumed)
            .open(&part)
            .await
            .map_err(|e| TransferError::User(format!("Couldn’t write to {}: {e}", job.dir.display())))?;

        let mut stream = resp.bytes_stream();
        let mut received = start;
        let began = Instant::now();
        let mut last_emit = Instant::now();
        let mut speed: Option<f64> = None;
        loop {
            let next = tokio::select! {
                _ = token.cancelled() => {
                    let _ = file.flush().await;
                    if resumable {
                        self.update(id, |j| j.bytes_received = received).await;
                    }
                    return Err(TransferError::Stopped);
                }
                n = timeout(Duration::from_secs(30), stream.next()) => n,
            };
            let chunk = match next {
                Err(_) => return Err(TransferError::User("The server stopped sending data.".into())),
                Ok(None) => break,
                Ok(Some(Err(_))) => {
                    let _ = file.flush().await;
                    self.update(id, |j| j.bytes_received = received).await;
                    return Err(TransferError::User("The connection dropped during the download.".into()));
                }
                Ok(Some(Ok(c))) => c,
            };
            self.0.limiter.take(chunk.len()).await;
            file.write_all(&chunk).await.map_err(|e| TransferError::User(format!("Couldn’t write the file: {e}")))?;
            received += chunk.len() as u64;
            if let Some(total) = total {
                if received > total {
                    return Err(TransferError::User("The server sent more data than it announced.".into()));
                }
            }
            if last_emit.elapsed() >= Duration::from_millis(250) {
                let elapsed = began.elapsed().as_secs_f64();
                let instant = (received - start) as f64 / elapsed.max(0.001);
                let s = speed.map_or(instant, |p| p * 0.7 + instant * 0.3);
                speed = Some(s);
                let eta = match total {
                    Some(t) if elapsed > 2.0 && s > 0.0 => Some((t - received) as f64 / s),
                    _ => None,
                };
                last_emit = Instant::now();
                self.update(id, |j| {
                    j.bytes_received = received;
                    j.speed_bps = Some(s);
                    j.eta_sec = eta;
                })
                .await;
            }
        }
        file.flush().await.ok();
        file.sync_all().await.ok();
        drop(file);

        if let Some(total) = total {
            if received != total {
                self.update(id, |j| j.bytes_received = received).await;
                return Err(TransferError::User(format!("Only {} of {} arrived.", human(received), human(total))));
            }
        }

        // Validate content: the bytes must really be the media type we expect.
        let mut head = [0u8; 16];
        let n = tokio::fs::File::open(&part).await.map_err(|e| TransferError::User(e.to_string()))?.read(&mut head).await.unwrap_or(0);
        match media::sniff(&head[..n]) {
            Some(found) if media::sniff_matches(container, found) => {}
            _ => {
                let _ = tokio::fs::remove_file(&part).await;
                self.update(id, |j| j.bytes_received = 0).await;
                return Err(TransferError::User("The downloaded data isn’t a valid media file, so it was deleted.".into()));
            }
        }

        let duplicates = self.0.settings.read().await.duplicates;
        let target = match duplicates {
            Duplicates::Rename => names::unique_path(&job.dir, &job.stem, container.ext()),
            Duplicates::Replace => job.dir.join(format!("{}.{}", job.stem, container.ext())),
        };
        tokio::fs::rename(&part, &target).await.map_err(|e| TransferError::User(format!("Couldn’t save the file: {e}")))?;

        let mut job = self
            .update(id, |j| {
                j.status = Status::Completed;
                j.path = Some(target.clone());
                j.bytes_received = received;
                j.bytes_total = Some(received);
                j.speed_bps = None;
                j.eta_sec = None;
                j.completed_at = Some(Utc::now());
            })
            .await
            .ok_or(TransferError::Stopped)?;

        // Real metadata and a thumbnail, when FFmpeg is available.
        if let Some(ff) = self.0.ffmpeg.read().await.clone() {
            if let Ok(info) = ff.probe(&target).await {
                let thumb = if info.width.is_some() {
                    let out = self.0.cache_dir.join("thumbs").join(format!("{}.jpg", job.id));
                    ff.thumbnail(&target, &out, info.duration_sec).await.ok().map(|_| out)
                } else {
                    None
                };
                job = self
                    .update(id, |j| {
                        j.width = info.width;
                        j.height = info.height;
                        j.duration_sec = info.duration_sec;
                        if let (Some(w), Some(h)) = (info.width, info.height) {
                            j.quality.get_or_insert_with(|| media::quality_label(w, h));
                        }
                        j.thumbnail = thumb;
                    })
                    .await
                    .unwrap_or(job);
            }
        }
        let _ = job;
        Ok(())
    }
}

/// What the server says about a link, before downloading it.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Analysis {
    pub url: String,
    pub title: String,
    pub host: String,
    pub container: Option<Container>,
    pub kind: Option<Kind>,
    pub size_bytes: Option<u64>,
    pub resumable: bool,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub quality: Option<String>,
    pub duration_sec: Option<f64>,
}

pub async fn analyze(client: &reqwest::Client, raw: &str, ffmpeg: Option<&Ffmpeg>) -> Result<Analysis, String> {
    let (url, mut container) = media::validate_media_url(raw, None).map_err(|e| e.to_string())?;
    let resp = client
        .head(url.clone())
        .timeout(Duration::from_secs(10))
        .send()
        .await
        .map_err(|_| "Couldn’t reach the server. Check the link and your connection.".to_string())?;
    let status = resp.status();
    if status.as_u16() == 401 || status.as_u16() == 403 {
        return Err(format!("The site refused access (error {}). Downora never signs in for you.", status.as_u16()));
    }
    if status.as_u16() == 404 {
        return Err("Nothing was found at this link (error 404).".into());
    }
    if !status.is_success() && status.as_u16() != 405 {
        return Err(format!("The server answered with error {}.", status.as_u16()));
    }
    let h = resp.headers();
    let ctype = h.get(reqwest::header::CONTENT_TYPE).and_then(|v| v.to_str().ok()).unwrap_or("");
    if ctype.starts_with("text/html") {
        return Err("This link opens a web page, not a media file. Paste the direct link to the file.".into());
    }
    container = container.or_else(|| Container::from_mime(ctype));
    let Some(c) = container else {
        return Err("Downora only downloads direct MP4, WebM, MP3, M4A and WAV files.".into());
    };
    let size = h.get(reqwest::header::CONTENT_LENGTH).and_then(|v| v.to_str().ok()).and_then(|v| v.parse().ok());
    let resumable = h.get(reqwest::header::ACCEPT_RANGES).and_then(|v| v.to_str().ok()).map(|v| v.contains("bytes")).unwrap_or(false);
    let mut a = Analysis {
        title: names::title_from_url(&url),
        host: url.host_str().unwrap_or_default().to_string(),
        url: url.to_string(),
        container: Some(c),
        kind: Some(c.kind()),
        size_bytes: size,
        resumable,
        width: None,
        height: None,
        quality: None,
        duration_sec: None,
    };
    if let Some(ff) = ffmpeg {
        if let Ok(info) = ff.probe_url(url.as_str()).await {
            a.width = info.width;
            a.height = info.height;
            a.duration_sec = info.duration_sec;
            a.quality = match (info.width, info.height) {
                (Some(w), Some(h)) => Some(media::quality_label(w, h)),
                _ => None,
            };
        }
    }
    Ok(a)
}
