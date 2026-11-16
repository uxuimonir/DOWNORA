//! Browser bridge: lets the paired Downora extension hand downloads to the
//! desktop app.
//!
//! Security model
//! - Listens on 127.0.0.1 only. The `Host` header must be the loopback
//!   address and port, which defeats DNS-rebinding attacks.
//! - Only `chrome-extension://` origins are accepted. Web pages can't read
//!   any response (no CORS headers are ever sent).
//! - Nothing works until pairing: the user opens a pairing window in the app
//!   (a 6-digit code, valid 2 minutes, 5 attempts), types the code into the
//!   extension, then approves the request in the app.
//! - Every later request is signed: HMAC-SHA256 over method, path,
//!   timestamp, a one-time nonce and the body hash, with the per-browser
//!   secret. Timestamps older than 30 s and reused nonces are rejected
//!   (replay protection), and the origin must match the paired extension.
//! - Secrets rotate: the extension calls /v1/rotate; the old secret keeps
//!   working for 2 minutes so in-flight requests don't fail.

use crate::download::{AddRequest, Manager, Source, Status};
use crate::events::{Event, Notice, NoticeKind};
use crate::media::{self, Container};
use crate::secrets::SecretStore;
use crate::settings::Settings;
use axum::body::Bytes;
use axum::extract::{Path as AxPath, State};
use axum::http::{HeaderMap, Method, StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use axum::routing::post;
use axum::{Json, Router};
use base64::Engine;
use chrono::{DateTime, Utc};
use hmac::{Hmac, Mac};
use rand::Rng;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use subtle::ConstantTimeEq;
use tokio::sync::{broadcast, oneshot, RwLock};
use tokio::time::{Duration, Instant};

pub const DEFAULT_PORT: u16 = 47913;
const PAIR_WINDOW: Duration = Duration::from_secs(120);
const PAIR_ATTEMPTS: u32 = 5;
const APPROVAL_TIMEOUT: Duration = Duration::from_secs(90);
const CLOCK_SKEW_MS: i64 = 30_000;
const NONCE_TTL: Duration = Duration::from_secs(120);
const ROTATE_GRACE: Duration = Duration::from_secs(120);
const ROTATE_AFTER_SEC: u64 = 12 * 3600;
const CONNECTED_FOR: Duration = Duration::from_secs(150);

type HmacSha256 = Hmac<Sha256>;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Client {
    pub key_id: String,
    pub origin: String,
    pub client_name: String,
    pub paired_at: DateTime<Utc>,
    pub rotated_at: DateTime<Utc>,
    pub last_seen: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingCode {
    pub code: String,
    pub expires_at: DateTime<Utc>,
}

struct Window {
    code: String,
    until: Instant,
    attempts: u32,
}

#[derive(Default)]
struct BridgeState {
    window: Option<Window>,
    pending: HashMap<String, oneshot::Sender<bool>>,
    clients: Vec<Client>,
    nonces: HashMap<String, Instant>,
    previous: HashMap<String, (Vec<u8>, Instant)>,
    last_seen: Option<Instant>,
    connected: bool,
}

pub struct Bridge {
    state: Mutex<BridgeState>,
    secrets: Arc<dyn SecretStore>,
    manager: Manager,
    settings: Arc<RwLock<Settings>>,
    events: broadcast::Sender<Event>,
    clients_file: PathBuf,
    port: u16,
}

#[derive(Debug, Serialize)]
struct ErrorBody {
    error: &'static str,
    message: String,
}

fn err(status: StatusCode, code: &'static str, message: impl Into<String>) -> Response {
    (status, Json(ErrorBody { error: code, message: message.into() })).into_response()
}

/// `chrome-extension://` + 32 letters a–p (Chrome's extension id alphabet).
pub fn valid_extension_origin(origin: &str) -> bool {
    origin.strip_prefix("chrome-extension://").map(|id| id.len() == 32 && id.bytes().all(|b| (b'a'..=b'p').contains(&b))).unwrap_or(false)
}

pub fn canonical(method: &str, path: &str, ts: &str, nonce: &str, body: &[u8]) -> String {
    format!("{method}\n{path}\n{ts}\n{nonce}\n{}", hex::encode(Sha256::digest(body)))
}

pub fn sign(secret: &[u8], canonical: &str) -> String {
    let mut mac = HmacSha256::new_from_slice(secret).expect("hmac key");
    mac.update(canonical.as_bytes());
    hex::encode(mac.finalize().into_bytes())
}

impl Bridge {
    pub fn new(data_dir: &std::path::Path, secrets: Arc<dyn SecretStore>, manager: Manager, settings: Arc<RwLock<Settings>>, events: broadcast::Sender<Event>, port: u16) -> Arc<Self> {
        let clients_file = data_dir.join("browsers.json");
        let clients: Vec<Client> = std::fs::read(&clients_file).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default();
        // Drop records whose secret is gone (e.g. keychain wiped).
        let clients = clients.into_iter().filter(|c| secrets.get(&format!("bridge:{}", c.key_id)).is_some()).collect();
        Arc::new(Self {
            state: Mutex::new(BridgeState { clients, ..Default::default() }),
            secrets,
            manager,
            settings,
            events,
            clients_file,
            port,
        })
    }

    pub fn port(&self) -> u16 {
        self.port
    }
    pub fn secret_storage(&self) -> &'static str {
        self.secrets.describe()
    }

    fn save_clients(&self, clients: &[Client]) {
        if let Ok(b) = serde_json::to_vec_pretty(clients) {
            let _ = crate::store::write_atomic(&self.clients_file, &b);
        }
    }

    // ── controls used by the app UI ──

    pub fn start_pairing(&self) -> PairingCode {
        let code = format!("{:06}", rand::rng().random_range(0..1_000_000u32));
        let expires_at = Utc::now() + chrono::Duration::from_std(PAIR_WINDOW).unwrap();
        self.state.lock().unwrap().window = Some(Window { code: code.clone(), until: Instant::now() + PAIR_WINDOW, attempts: 0 });
        PairingCode { code, expires_at }
    }

    pub fn cancel_pairing(&self) {
        self.state.lock().unwrap().window = None;
    }

    pub fn decide(&self, request_id: &str, approve: bool) -> bool {
        self.state.lock().unwrap().pending.remove(request_id).map(|tx| tx.send(approve).is_ok()).unwrap_or(false)
    }

    pub fn clients(&self) -> Vec<Client> {
        self.state.lock().unwrap().clients.clone()
    }

    pub fn connected(&self) -> bool {
        self.state.lock().unwrap().connected
    }

    pub fn revoke(&self, key_id: &str) {
        self.secrets.delete(&format!("bridge:{key_id}"));
        let clients = {
            let mut st = self.state.lock().unwrap();
            st.clients.retain(|c| c.key_id != key_id);
            st.previous.remove(key_id);
            st.clients.clone()
        };
        self.save_clients(&clients);
        let _ = self.events.send(Event::PairingChanged);
    }

    /// Marks the browser disconnected after a quiet period. Run every ~30 s.
    pub async fn check_connection(&self) {
        let lost = {
            let mut st = self.state.lock().unwrap();
            let quiet = st.last_seen.map(|t| t.elapsed() > CONNECTED_FOR).unwrap_or(true);
            if st.connected && quiet {
                st.connected = false;
                true
            } else {
                false
            }
        };
        if lost {
            let _ = self.events.send(Event::BrowserConnection { connected: false });
            let _ = self.events.send(Event::Notice(Notice {
                kind: NoticeKind::BrowserLost,
                title: "Browser connection lost".into(),
                body: "Downora hasn’t heard from your browser in a while. Chrome may be closed.".into(),
            }));
        }
    }

    // ── HTTP ──

    pub fn router(self: &Arc<Self>) -> Router {
        Router::new()
            .route("/v1/pair", post(pair))
            // Signed endpoints are all POST: Chrome omits the Origin header on
            // extension GET requests, and every request must carry it.
            .route("/v1/status", post(status))
            .route("/v1/jobs", post(create_job))
            .route("/v1/jobs/{id}", post(job_status))
            .route("/v1/rotate", post(rotate))
            .fallback(|| async { err(StatusCode::NOT_FOUND, "not_found", "No such endpoint.") })
            .layer(axum::extract::DefaultBodyLimit::max(16 * 1024))
            .with_state(self.clone())
    }

    /// Binds 127.0.0.1:port and serves until the task is dropped.
    pub async fn serve(self: Arc<Self>) -> std::io::Result<tokio::task::JoinHandle<()>> {
        let listener = tokio::net::TcpListener::bind(("127.0.0.1", self.port)).await?;
        let app = self.router();
        let me = self.clone();
        tokio::spawn(async move {
            let mut tick = tokio::time::interval(Duration::from_secs(30));
            loop {
                tick.tick().await;
                me.check_connection().await;
            }
        });
        Ok(tokio::spawn(async move {
            let _ = axum::serve(listener, app).await;
        }))
    }

    fn check_host(&self, headers: &HeaderMap) -> Result<(), Response> {
        let host = headers.get("host").and_then(|h| h.to_str().ok()).unwrap_or("");
        if host == format!("127.0.0.1:{}", self.port) || host == format!("localhost:{}", self.port) {
            Ok(())
        } else {
            Err(err(StatusCode::MISDIRECTED_REQUEST, "bad_host", "Requests must be addressed to 127.0.0.1."))
        }
    }

    async fn check_enabled(&self) -> Result<(), Response> {
        if self.settings.read().await.browser_bridge {
            Ok(())
        } else {
            Err(err(StatusCode::SERVICE_UNAVAILABLE, "disabled", "Browser connection is turned off in Downora’s settings."))
        }
    }

    /// Verifies a signed request and returns the client it came from.
    fn verify(&self, method: &Method, uri: &Uri, headers: &HeaderMap, body: &[u8]) -> Result<Client, Response> {
        let h = |n: &str| headers.get(n).and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
        let (key_id, ts, nonce, sig, origin) = (h("x-downora-key"), h("x-downora-timestamp"), h("x-downora-nonce"), h("x-downora-signature"), h("origin"));
        let unauthorized = |m: &str| err(StatusCode::UNAUTHORIZED, "unauthorized", m.to_string());
        if key_id.is_empty() || sig.is_empty() {
            return Err(unauthorized("This browser isn’t paired with Downora."));
        }
        let ts_ms: i64 = ts.parse().map_err(|_| unauthorized("Bad timestamp."))?;
        if (Utc::now().timestamp_millis() - ts_ms).abs() > CLOCK_SKEW_MS {
            return Err(unauthorized("Request expired. Check your computer’s clock."));
        }
        if nonce.len() < 16 || nonce.len() > 64 || !nonce.bytes().all(|b| b.is_ascii_hexdigit()) {
            return Err(unauthorized("Bad nonce."));
        }
        let mut st = self.state.lock().unwrap();
        let Some(client) = st.clients.iter().find(|c| c.key_id == key_id).cloned() else {
            return Err(unauthorized("This browser isn’t paired with Downora."));
        };
        if origin != client.origin {
            return Err(err(StatusCode::FORBIDDEN, "bad_origin", "Wrong origin for this pairing."));
        }
        st.nonces.retain(|_, t| t.elapsed() < NONCE_TTL);
        let nonce_key = format!("{key_id}:{nonce}");
        if st.nonces.contains_key(&nonce_key) {
            return Err(unauthorized("Replayed request."));
        }
        let msg = canonical(method.as_str(), uri.path(), &ts, &nonce, body);
        let mut candidates = vec![];
        if let Some(s) = self.secrets.get(&format!("bridge:{key_id}")) {
            candidates.push(s);
        }
        if let Some((s, t)) = st.previous.get(&key_id) {
            if t.elapsed() < ROTATE_GRACE {
                candidates.push(s.clone());
            }
        }
        let ok = candidates.iter().any(|secret| sign(secret, &msg).as_bytes().ct_eq(sig.as_bytes()).into());
        if !ok {
            return Err(unauthorized("Signature doesn’t match."));
        }
        st.nonces.insert(nonce_key, Instant::now());
        st.last_seen = Some(Instant::now());
        let became_connected = !st.connected;
        st.connected = true;
        if let Some(c) = st.clients.iter_mut().find(|c| c.key_id == key_id) {
            c.last_seen = Some(Utc::now());
        }
        drop(st);
        if became_connected {
            let _ = self.events.send(Event::BrowserConnection { connected: true });
        }
        Ok(client)
    }
}

// ───────────────────────── handlers ─────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PairBody {
    code: String,
    client_name: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PairResponse {
    key_id: String,
    secret: String,
    rotate_after_sec: u64,
    app: &'static str,
    version: &'static str,
}

async fn pair(State(b): State<Arc<Bridge>>, headers: HeaderMap, body: Bytes) -> Response {
    if let Err(r) = b.check_host(&headers) {
        return r;
    }
    if let Err(r) = b.check_enabled().await {
        return r;
    }
    let origin = headers.get("origin").and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
    if !valid_extension_origin(&origin) {
        return err(StatusCode::FORBIDDEN, "bad_origin", "Only the Downora browser extension can pair.");
    }
    let Ok(req) = serde_json::from_slice::<PairBody>(&body) else {
        return err(StatusCode::BAD_REQUEST, "bad_request", "Send the 6-digit code shown in Downora.");
    };
    let client_name: String = req.client_name.unwrap_or_else(|| "Chrome".into()).chars().filter(|c| !c.is_control()).take(60).collect();

    let (request_id, rx) = {
        let mut st = b.state.lock().unwrap();
        let Some(w) = st.window.as_mut() else {
            return err(StatusCode::FORBIDDEN, "not_pairing", "Downora isn’t waiting to pair. Open Browser Integration in the app and press Pair a browser.");
        };
        if w.until < Instant::now() {
            st.window = None;
            return err(StatusCode::FORBIDDEN, "expired", "The pairing code expired. Start pairing again in Downora.");
        }
        w.attempts += 1;
        let matches: bool = w.code.as_bytes().ct_eq(req.code.trim().as_bytes()).into();
        if !matches {
            let left = PAIR_ATTEMPTS.saturating_sub(w.attempts);
            if left == 0 {
                st.window = None;
                return err(StatusCode::UNAUTHORIZED, "bad_code", "Too many wrong codes. Start pairing again in Downora.");
            }
            return err(StatusCode::UNAUTHORIZED, "bad_code", format!("That code isn’t right. {left} tries left."));
        }
        st.window = None; // single use
        let id = uuid::Uuid::new_v4().to_string();
        let (tx, rx) = oneshot::channel();
        st.pending.insert(id.clone(), tx);
        (id, rx)
    };
    let _ = b.events.send(Event::PairRequest { request_id: request_id.clone(), origin: origin.clone(), client_name: client_name.clone() });

    let approved = matches!(tokio::time::timeout(APPROVAL_TIMEOUT, rx).await, Ok(Ok(true)));
    b.state.lock().unwrap().pending.remove(&request_id);
    if !approved {
        return err(StatusCode::FORBIDDEN, "denied", "Pairing wasn’t approved in Downora.");
    }

    let key_id = uuid::Uuid::new_v4().to_string();
    let mut secret = [0u8; 32];
    rand::rng().fill(&mut secret);
    if let Err(e) = b.secrets.set(&format!("bridge:{key_id}"), &secret) {
        return err(StatusCode::INTERNAL_SERVER_ERROR, "storage", format!("Couldn’t store the pairing key: {e}"));
    }
    let clients = {
        let mut st = b.state.lock().unwrap();
        // One pairing per extension: replace an older one.
        let old: Vec<String> = st.clients.iter().filter(|c| c.origin == origin).map(|c| c.key_id.clone()).collect();
        for k in &old {
            b.secrets.delete(&format!("bridge:{k}"));
        }
        st.clients.retain(|c| c.origin != origin);
        st.clients.push(Client { key_id: key_id.clone(), origin, client_name, paired_at: Utc::now(), rotated_at: Utc::now(), last_seen: None });
        st.clients.clone()
    };
    b.save_clients(&clients);
    let _ = b.events.send(Event::PairingChanged);
    Json(PairResponse {
        key_id,
        secret: base64::engine::general_purpose::STANDARD.encode(secret),
        rotate_after_sec: ROTATE_AFTER_SEC,
        app: "downora-desktop",
        version: env!("CARGO_PKG_VERSION"),
    })
    .into_response()
}

macro_rules! guard {
    ($b:expr, $method:expr, $uri:expr, $headers:expr, $body:expr) => {{
        if let Err(r) = $b.check_host(&$headers) {
            return r;
        }
        if let Err(r) = $b.check_enabled().await {
            return r;
        }
        match $b.verify(&$method, &$uri, &$headers, &$body) {
            Ok(c) => c,
            Err(r) => return r,
        }
    }};
}

async fn status(State(b): State<Arc<Bridge>>, method: Method, uri: Uri, headers: HeaderMap) -> Response {
    let _client = guard!(b, method, uri, headers, Bytes::new());
    let active = b.manager.list().await.iter().filter(|j| j.status.is_active()).count();
    Json(serde_json::json!({ "app": "downora-desktop", "version": env!("CARGO_PKG_VERSION"), "activeDownloads": active })).into_response()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct JobBody {
    url: String,
    title: String,
    container: Container,
    quality: Option<String>,
}

async fn create_job(State(b): State<Arc<Bridge>>, method: Method, uri: Uri, headers: HeaderMap, body: Bytes) -> Response {
    let client = guard!(b, method, uri, headers, body);
    let Ok(req) = serde_json::from_slice::<JobBody>(&body) else {
        return err(StatusCode::BAD_REQUEST, "bad_request", "Malformed download request.");
    };
    // Browser jobs must name a supported file; MKV is conversion-only.
    if req.container == Container::Mkv || media::validate_media_url(&req.url, Some(req.container)).map(|(_, c)| c.is_none()).unwrap_or(true) {
        return err(StatusCode::UNPROCESSABLE_ENTITY, "unsupported", "That isn’t a supported direct media file.");
    }
    let quality = req.quality.filter(|q| q.len() <= 12 && q.chars().all(|c| c.is_ascii_alphanumeric()));
    match b
        .manager
        .add(AddRequest { url: req.url, title: Some(req.title), container: Some(req.container), quality, dir: None, source: Some(Source::Browser { origin: client.origin }) })
        .await
    {
        Ok(job) => (StatusCode::CREATED, Json(serde_json::json!({ "jobId": job.id, "fileName": job.file_name() }))).into_response(),
        Err(e) => err(StatusCode::UNPROCESSABLE_ENTITY, "rejected", e.to_string()),
    }
}

async fn job_status(State(b): State<Arc<Bridge>>, AxPath(id): AxPath<String>, method: Method, uri: Uri, headers: HeaderMap) -> Response {
    let client = guard!(b, method, uri, headers, Bytes::new());
    match b.manager.get(&id).await {
        // A browser can only see the jobs it sent.
        Some(j) if j.source == (Source::Browser { origin: client.origin }) => Json(serde_json::json!({
            "jobId": j.id,
            "status": j.status,
            "fileName": j.file_name(),
            "bytesReceived": j.bytes_received,
            "bytesTotal": j.bytes_total,
            "error": j.error,
            "done": !matches!(j.status, Status::Queued | Status::Downloading | Status::Paused),
        }))
        .into_response(),
        _ => err(StatusCode::NOT_FOUND, "not_found", "No such download."),
    }
}

async fn rotate(State(b): State<Arc<Bridge>>, method: Method, uri: Uri, headers: HeaderMap) -> Response {
    let client = guard!(b, method, uri, headers, Bytes::new());
    let key = format!("bridge:{}", client.key_id);
    let Some(old) = b.secrets.get(&key) else {
        return err(StatusCode::UNAUTHORIZED, "unauthorized", "Pairing was removed.");
    };
    let mut fresh = [0u8; 32];
    rand::rng().fill(&mut fresh);
    if let Err(e) = b.secrets.set(&key, &fresh) {
        return err(StatusCode::INTERNAL_SERVER_ERROR, "storage", e);
    }
    let clients = {
        let mut st = b.state.lock().unwrap();
        st.previous.insert(client.key_id.clone(), (old, Instant::now()));
        if let Some(c) = st.clients.iter_mut().find(|c| c.key_id == client.key_id) {
            c.rotated_at = Utc::now();
        }
        st.clients.clone()
    };
    b.save_clients(&clients);
    Json(serde_json::json!({ "secret": base64::engine::general_purpose::STANDARD.encode(fresh), "rotateAfterSec": ROTATE_AFTER_SEC })).into_response()
}
