//! Local HTTP fixture server and helpers shared by the integration tests.
#![allow(dead_code)]

use axum::body::Body;
use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::Router;
use downora_core::download::Manager;
use downora_core::events::Event;
use downora_core::settings::Settings;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use tokio::sync::{broadcast, RwLock};
use tokio::time::{timeout, Duration};

pub fn samples() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../web/public/samples")
}
pub fn sample(name: &str) -> Vec<u8> {
    std::fs::read(samples().join(name)).unwrap()
}

#[derive(Default)]
pub struct Seen {
    pub ranges: Mutex<Vec<String>>,
    pub flaky_dropped: AtomicBool,
    pub requests: AtomicUsize,
}

pub struct Fixture {
    pub base: String,
    pub seen: Arc<Seen>,
}

async fn media(State(seen): State<Arc<Seen>>, Path(file): Path<String>, Query(q): Query<HashMap<String, String>>, headers: HeaderMap) -> Response {
    seen.requests.fetch_add(1, Ordering::SeqCst);
    serve(&seen, &file, &q, &headers, false).await
}

async fn flaky(State(seen): State<Arc<Seen>>, Path(file): Path<String>, Query(q): Query<HashMap<String, String>>, headers: HeaderMap) -> Response {
    let first = !seen.flaky_dropped.swap(true, Ordering::SeqCst);
    serve(&seen, &file, &q, &headers, first).await
}

async fn serve(seen: &Seen, file: &str, q: &HashMap<String, String>, headers: &HeaderMap, drop_half: bool) -> Response {
    let Ok(bytes) = std::fs::read(samples().join(file)) else { return StatusCode::NOT_FOUND.into_response() };
    let no_ranges = q.contains_key("noranges");
    let rate: usize = q.get("rate").and_then(|r| r.parse().ok()).unwrap_or(0);
    let ctype = match file.rsplit('.').next() {
        Some("mp4") => "video/mp4",
        Some("webm") => "video/webm",
        Some("mp3") => "audio/mpeg",
        Some("wav") => "audio/wav",
        Some("m4a") => "audio/mp4",
        _ => "application/octet-stream",
    };
    let mut start = 0usize;
    let mut status = StatusCode::OK;
    if let Some(r) = headers.get("range").and_then(|v| v.to_str().ok()) {
        seen.ranges.lock().unwrap().push(r.to_string());
        if !no_ranges {
            start = r.trim_start_matches("bytes=").split('-').next().unwrap().parse().unwrap();
            status = StatusCode::PARTIAL_CONTENT;
        }
    }
    let body = bytes[start..].to_vec();
    let total = bytes.len();
    let len = body.len();
    let stream = async_stream(body, rate, drop_half);
    let etag = format!("\"{}-{}\"", file, q.get("v").map(String::as_str).unwrap_or("1"));
    if let Some(ir) = headers.get("if-range").and_then(|v| v.to_str().ok()) {
        if ir != etag && status == StatusCode::PARTIAL_CONTENT {
            // File changed: send the whole new file.
            return Response::builder().status(StatusCode::OK).header("content-type", ctype).header("content-length", total).header("etag", &etag).body(Body::from(bytes)).unwrap();
        }
    }
    let mut resp = Response::builder().status(status).header("content-type", ctype).header("content-length", len).header("etag", &etag);
    if !no_ranges {
        resp = resp.header("accept-ranges", "bytes");
    }
    if status == StatusCode::PARTIAL_CONTENT {
        resp = resp.header("content-range", format!("bytes {start}-{}/{total}", total - 1));
    }
    resp.body(Body::from_stream(stream)).unwrap()
}

fn async_stream(body: Vec<u8>, rate: usize, drop_half: bool) -> impl futures_util::Stream<Item = Result<Vec<u8>, std::io::Error>> {
    let chunk = if rate > 0 { (rate / 10).max(1024) } else { 64 * 1024 };
    let limit = if drop_half { body.len() / 2 } else { body.len() };
    futures_util::stream::unfold((body, 0usize), move |(body, pos)| async move {
        if pos == usize::MAX {
            return None;
        }
        if pos >= limit {
            if drop_half {
                return Some((Err(std::io::Error::other("dropped")), (body, usize::MAX)));
            }
            return None;
        }
        if rate > 0 {
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
        let end = (pos + chunk).min(limit);
        let piece = body[pos..end].to_vec();
        Some((Ok(piece), (body, end)))
    })
}

/// Claims to honour Range (206 + Content-Range) but sends bytes from the start.
async fn liar(State(seen): State<Arc<Seen>>, Path(file): Path<String>, headers: HeaderMap) -> Response {
    let bytes = std::fs::read(samples().join(&file)).unwrap();
    let total = bytes.len();
    if let Some(r) = headers.get("range").and_then(|v| v.to_str().ok()) {
        seen.ranges.lock().unwrap().push(r.to_string());
        let start: usize = r.trim_start_matches("bytes=").split('-').next().unwrap().parse().unwrap();
        // Wrong: header says `start`, body starts at 0.
        return Response::builder().status(StatusCode::PARTIAL_CONTENT).header("content-type", "video/mp4")
            .header("content-range", format!("bytes 0-{}/{total}", total - start - 1)).header("content-length", total - start)
            .body(Body::from(bytes[..total - start].to_vec())).unwrap();
    }
    let first = !seen.flaky_dropped.swap(true, Ordering::SeqCst);
    let body = if first { async_stream(bytes, 500_000, true) } else { async_stream(bytes, 0, false) };
    Response::builder().status(StatusCode::OK).header("content-type", "video/mp4").header("content-length", total).header("accept-ranges", "bytes").body(Body::from_stream(body)).unwrap()
}

pub async fn fixture() -> Fixture {
    let seen = Arc::new(Seen::default());
    let app = Router::new()
        .route("/media/{file}", get(media))
        .route("/flaky/{file}", get(flaky))
        .route("/liar/{file}", get(liar))
        .route("/forbidden.mp4", get(|| async { StatusCode::FORBIDDEN }))
        .route("/page.mp4", get(|| async { ([("content-type", "text/html")], "<!doctype html><p>hi") }))
        .route("/fake.mp4", get(|| async { ([("content-type", "video/mp4")], "<!doctype html><p>not a video at all, just text padding") }))
        .with_state(seen.clone());
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    Fixture { base: format!("http://{addr}"), seen }
}

pub struct Env {
    pub dir: tempfile::TempDir,
    pub settings: Arc<RwLock<Settings>>,
    pub events: broadcast::Sender<Event>,
    pub manager: Manager,
}

impl Env {
    pub fn downloads(&self) -> PathBuf {
        self.dir.path().join("Downloads")
    }
}

pub async fn env_with(f: impl FnOnce(&mut Settings)) -> Env {
    let dir = tempfile::tempdir().unwrap();
    let mut s = Settings::default();
    s.download_dir = dir.path().join("Downloads");
    f(&mut s);
    let settings = Arc::new(RwLock::new(s));
    let (events, _) = broadcast::channel(4096);
    let ff = downora_core::ffmpeg::Ffmpeg::discover(None).await;
    let manager = Manager::new(&dir.path().join("data"), &dir.path().join("cache"), settings.clone(), events.clone(), ff);
    Env { dir, settings, events, manager }
}

pub async fn env() -> Env {
    env_with(|_| {}).await
}

/// Waits for an event matching `pred`, failing after `secs`.
pub async fn wait_for<T>(rx: &mut broadcast::Receiver<Event>, secs: u64, mut pred: impl FnMut(&Event) -> Option<T>) -> T {
    timeout(Duration::from_secs(secs), async {
        loop {
            match rx.recv().await {
                Ok(e) => {
                    if let Some(v) = pred(&e) {
                        return v;
                    }
                }
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(e) => panic!("event channel closed: {e}"),
            }
        }
    })
    .await
    .expect("timed out waiting for event")
}
