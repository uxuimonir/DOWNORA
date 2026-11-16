//! Development/test harness: runs the real download engine and browser
//! bridge without a window. Prints engine events as JSON lines on stdout.
//! Commands on stdin: `pair` (prints the code), `approve-next`, `deny-next`.
//!
//!   cargo run -p downora-core --bin downora-bridge-dev -- --port 47913 --data /tmp/x

use downora_core::bridge::Bridge;
use downora_core::download::Manager;
use downora_core::events::Event;
use downora_core::secrets::FileStore;
use downora_core::settings::Settings;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::{broadcast, RwLock};

#[tokio::main]
async fn main() -> std::io::Result<()> {
    let args: Vec<String> = std::env::args().collect();
    let arg = |name: &str| args.iter().position(|a| a == name).and_then(|i| args.get(i + 1)).cloned();
    let port: u16 = arg("--port").and_then(|p| p.parse().ok()).unwrap_or(downora_core::bridge::DEFAULT_PORT);
    let data = PathBuf::from(arg("--data").expect("--data <dir> is required"));
    std::fs::create_dir_all(&data)?;

    let mut s = Settings::default();
    s.download_dir = data.join("Downloads");
    let settings = Arc::new(RwLock::new(s));
    let (events, _) = broadcast::channel(1024);
    let manager = Manager::new(&data, &data.join("cache"), settings.clone(), events.clone(), None);
    let bridge = Bridge::new(&data, Arc::new(FileStore::new(data.join("secrets.json"))), manager, settings, events.clone(), port);
    bridge.clone().serve().await?;
    println!("{}", serde_json::json!({ "type": "ready", "port": port }));

    // 0 = ask (print only), 1 = approve next, 2 = deny next
    let decision = Arc::new(AtomicU8::new(0));
    let (b, d) = (bridge.clone(), decision.clone());
    let mut rx = events.subscribe();
    tokio::spawn(async move {
        while let Ok(e) = rx.recv().await {
            if let Event::PairRequest { request_id, .. } = &e {
                match d.swap(0, Ordering::SeqCst) {
                    1 => {
                        b.decide(request_id, true);
                    }
                    2 => {
                        b.decide(request_id, false);
                    }
                    _ => {}
                }
            }
            println!("{}", serde_json::to_string(&e).unwrap_or_default());
        }
    });

    let mut lines = BufReader::new(tokio::io::stdin()).lines();
    while let Ok(Some(line)) = lines.next_line().await {
        match line.trim() {
            "pair" => println!("{}", serde_json::json!({ "type": "code", "code": bridge.start_pairing().code })),
            "approve-next" => decision.store(1, Ordering::SeqCst),
            "deny-next" => decision.store(2, Ordering::SeqCst),
            _ => {}
        }
    }
    Ok(())
}
