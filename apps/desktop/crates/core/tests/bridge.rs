mod common;

use common::*;
use downora_core::bridge::{canonical, sign, Bridge};
use downora_core::download::Status;
use downora_core::events::Event;
use downora_core::secrets::MemoryStore;
use base64::Engine;
use std::sync::Arc;

const EXT: &str = "chrome-extension://abcdefghijklmnopabcdefghijklmnop";
const OTHER_EXT: &str = "chrome-extension://ponmlkjihgfedcbaponmlkjihgfedcba";

struct Harness {
    env: Env,
    bridge: Arc<Bridge>,
    base: String,
    http: reqwest::Client,
}

async fn harness() -> Harness {
    let env = env().await;
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    drop(listener);
    let bridge = Bridge::new(&env.dir.path().join("data"), Arc::new(MemoryStore::default()), env.manager.clone(), env.settings.clone(), env.events.clone(), port);
    bridge.clone().serve().await.unwrap();
    Harness { env, bridge, base: format!("http://127.0.0.1:{port}"), http: reqwest::Client::new() }
}

impl Harness {
    async fn pair_request(&self, origin: &str, code: &str) -> reqwest::Response {
        self.http.post(format!("{}/v1/pair", self.base)).header("origin", origin).json(&serde_json::json!({ "code": code, "clientName": "Chrome" })).send().await.unwrap()
    }

    /// Full happy-path pairing, approving in "the app".
    async fn pair(&self) -> (String, Vec<u8>) {
        let code = self.bridge.start_pairing().code;
        let mut rx = self.env.events.subscribe();
        let bridge = self.bridge.clone();
        tokio::spawn(async move {
            let id = wait_for(&mut rx, 10, |e| match e {
                Event::PairRequest { request_id, origin, .. } if origin == EXT => Some(request_id.clone()),
                _ => None,
            })
            .await;
            assert!(bridge.decide(&id, true));
        });
        let r = self.pair_request(EXT, &code).await;
        assert_eq!(r.status(), 200);
        let v: serde_json::Value = r.json().await.unwrap();
        (v["keyId"].as_str().unwrap().into(), base64::engine::general_purpose::STANDARD.decode(v["secret"].as_str().unwrap()).unwrap())
    }

    async fn signed(&self, method: &str, path: &str, body: &str, key: &str, secret: &[u8], f: impl FnOnce(&mut Headers)) -> reqwest::Response {
        let mut h = Headers {
            origin: EXT.into(),
            ts: chrono::Utc::now().timestamp_millis().to_string(),
            nonce: hex::encode(rand_bytes()),
            host: None,
            sig: None,
        };
        f(&mut h);
        let sig = h.sig.clone().unwrap_or_else(|| sign(secret, &canonical(method, path, &h.ts, &h.nonce, body.as_bytes())));
        let mut req = self.http.request(method.parse().unwrap(), format!("{}{path}", self.base));
        req = req.header("origin", &h.origin).header("x-downora-key", key).header("x-downora-timestamp", &h.ts).header("x-downora-nonce", &h.nonce).header("x-downora-signature", sig);
        if let Some(host) = h.host {
            req = req.header("host", host);
        }
        if !body.is_empty() {
            req = req.header("content-type", "application/json").body(body.to_string());
        }
        req.send().await.unwrap()
    }
}

struct Headers {
    origin: String,
    ts: String,
    nonce: String,
    host: Option<String>,
    sig: Option<String>,
}

fn rand_bytes() -> [u8; 16] {
    let mut b = [0u8; 16];
    for (i, x) in b.iter_mut().enumerate() {
        *x = (uuid::Uuid::new_v4().as_bytes()[i]) ^ (i as u8);
    }
    b
}

#[tokio::test]
async fn nothing_works_before_pairing() {
    let h = harness().await;
    assert_eq!(h.http.post(format!("{}/v1/status", h.base)).header("origin", EXT).send().await.unwrap().status(), 401);
    assert_eq!(h.http.post(format!("{}/v1/jobs", h.base)).header("origin", EXT).body("{}").send().await.unwrap().status(), 401);
    // No pairing window open: the code is irrelevant.
    let r = h.pair_request(EXT, "123456").await;
    assert_eq!(r.status(), 403);
    assert!(r.text().await.unwrap().contains("isn’t waiting to pair"));
    // Web pages and other origins can't pair at all, and get no CORS headers.
    h.bridge.start_pairing();
    let r = h.pair_request("https://evil.example", "000000").await;
    assert_eq!(r.status(), 403);
    assert!(r.headers().get("access-control-allow-origin").is_none());
}

#[tokio::test]
async fn pairing_needs_the_code_and_explicit_approval() {
    let h = harness().await;
    let code = h.bridge.start_pairing().code;
    let wrong = if code == "000000" { "111111" } else { "000000" };
    let r = h.pair_request(EXT, wrong).await;
    assert_eq!(r.status(), 401);
    assert!(r.text().await.unwrap().contains("4 tries left"));

    // Correct code, but the user presses Deny.
    let mut rx = h.env.events.subscribe();
    let b = h.bridge.clone();
    tokio::spawn(async move {
        let id = wait_for(&mut rx, 10, |e| match e {
            Event::PairRequest { request_id, .. } => Some(request_id.clone()),
            _ => None,
        })
        .await;
        b.decide(&id, false);
    });
    assert_eq!(h.pair_request(EXT, &code).await.status(), 403);
    // The code was single-use.
    assert_eq!(h.pair_request(EXT, &code).await.status(), 403);
    assert!(h.bridge.clients().is_empty());
}

#[tokio::test]
async fn too_many_wrong_codes_close_the_window() {
    let h = harness().await;
    let code = h.bridge.start_pairing().code;
    let wrong = if code == "000000" { "111111" } else { "000000" };
    for _ in 0..5 {
        h.pair_request(EXT, wrong).await;
    }
    let r = h.pair_request(EXT, &code).await;
    assert_eq!(r.status(), 403, "window closed after 5 wrong attempts");
}

#[tokio::test]
async fn signed_requests_work_and_tampering_fails() {
    let h = harness().await;
    let (key, secret) = h.pair().await;
    assert_eq!(h.bridge.clients()[0].origin, EXT);
    assert_eq!(h.signed("POST", "/v1/status", "", &key, &secret, |_| {}).await.status(), 200);
    assert!(h.bridge.connected());

    // Wrong secret.
    assert_eq!(h.signed("POST", "/v1/status", "", &key, b"not-the-secret", |_| {}).await.status(), 401);
    // Stale timestamp.
    let old = (chrono::Utc::now().timestamp_millis() - 60_000).to_string();
    assert_eq!(h.signed("POST", "/v1/status", "", &key, &secret, |x| x.ts = old.clone()).await.status(), 401);
    // Replay: same nonce twice.
    let n = hex::encode(rand_bytes());
    assert_eq!(h.signed("POST", "/v1/status", "", &key, &secret, |x| x.nonce = n.clone()).await.status(), 200);
    assert_eq!(h.signed("POST", "/v1/status", "", &key, &secret, |x| x.nonce = n.clone()).await.status(), 401);
    // Another extension can't reuse the key.
    assert_eq!(h.signed("POST", "/v1/status", "", &key, &secret, |x| x.origin = OTHER_EXT.into()).await.status(), 403);
    // DNS rebinding: wrong Host header.
    assert_eq!(h.signed("POST", "/v1/status", "", &key, &secret, |x| x.host = Some("evil.example:47913".into())).await.status(), 421);
    // Body tampering: signature covers the body.
    let body = r#"{"url":"http://127.0.0.1:1/a.mp4","title":"x","container":"mp4"}"#;
    let sig = sign(&secret, &canonical("POST", "/v1/jobs", "0", "00", b"{}"));
    assert_eq!(h.signed("POST", "/v1/jobs", body, &key, &secret, |x| x.sig = Some(sig.clone())).await.status(), 401);
}

#[tokio::test]
async fn paired_browser_sends_a_real_download() {
    let fx = fixture().await;
    let h = harness().await;
    let (key, secret) = h.pair().await;
    let body = serde_json::json!({ "url": format!("{}/media/downora-sample-tone.mp3", fx.base), "title": "Podcast: Ep 1/2", "container": "mp3" }).to_string();
    let r = h.signed("POST", "/v1/jobs", &body, &key, &secret, |_| {}).await;
    assert_eq!(r.status(), 201);
    let v: serde_json::Value = r.json().await.unwrap();
    let id = v["jobId"].as_str().unwrap().to_string();
    assert_eq!(v["fileName"], "Podcast Ep 1 2.mp3");

    let mut rx = h.env.events.subscribe();
    wait_for(&mut rx, 20, |e| matches!(e, Event::Job { job } if job.id == id && job.status == Status::Completed).then_some(())).await;
    let s: serde_json::Value = h.signed("POST", &format!("/v1/jobs/{id}"), "", &key, &secret, |_| {}).await.json().await.unwrap();
    assert_eq!(s["status"], "completed");
    assert_eq!(s["done"], true);
    let saved = h.env.manager.get(&id).await.unwrap().path.unwrap();
    assert_eq!(std::fs::read(saved).unwrap(), sample("downora-sample-tone.mp3"));

    // Jobs the app added itself are invisible to the browser.
    let own = h.env.manager.add(downora_core::download::AddRequest { url: format!("{}/media/downora-sample-tone.wav", fx.base), title: None, container: None, quality: None, dir: None, source: None }).await.unwrap();
    assert_eq!(h.signed("POST", &format!("/v1/jobs/{}", own.id), "", &key, &secret, |_| {}).await.status(), 404);
}

#[tokio::test]
async fn browser_jobs_are_validated() {
    let h = harness().await;
    let (key, secret) = h.pair().await;
    for body in [
        r#"{"url":"file:///etc/passwd","title":"x","container":"mp4"}"#,
        r#"{"url":"https://x.example/a.exe","title":"x","container":"mkv"}"#,
        r#"{"url":"javascript:alert(1)","title":"x","container":"mp4"}"#,
        r#"{"url":"https://x.example/a.mp4","title":"x","container":"exe"}"#,
        r#"{"nope":true}"#,
    ] {
        let s = h.signed("POST", "/v1/jobs", body, &key, &secret, |_| {}).await.status();
        assert!(s == 400 || s == 422, "{body} → {s}");
    }
    assert!(h.env.manager.list().await.is_empty());
}

#[tokio::test]
async fn rotation_issues_a_new_secret_with_a_short_grace_period() {
    let h = harness().await;
    let (key, old) = h.pair().await;
    let v: serde_json::Value = h.signed("POST", "/v1/rotate", "", &key, &old, |_| {}).await.json().await.unwrap();
    let new = base64::engine::general_purpose::STANDARD.decode(v["secret"].as_str().unwrap()).unwrap();
    assert_ne!(new, old);
    assert_eq!(h.signed("POST", "/v1/status", "", &key, &new, |_| {}).await.status(), 200);
    assert_eq!(h.signed("POST", "/v1/status", "", &key, &old, |_| {}).await.status(), 200, "old secret valid during grace");
}

#[tokio::test]
async fn revoking_and_disabling_cut_the_browser_off() {
    let h = harness().await;
    let (key, secret) = h.pair().await;
    h.env.settings.write().await.browser_bridge = false;
    assert_eq!(h.signed("POST", "/v1/status", "", &key, &secret, |_| {}).await.status(), 503);
    h.env.settings.write().await.browser_bridge = true;
    h.bridge.revoke(&key);
    assert_eq!(h.signed("POST", "/v1/status", "", &key, &secret, |_| {}).await.status(), 401);
}
