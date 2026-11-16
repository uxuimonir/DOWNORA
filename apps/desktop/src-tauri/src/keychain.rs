//! OS keychain storage for pairing secrets, with a user-only file fallback.

use downora_core::secrets::{FileStore, SecretStore};
use std::path::PathBuf;

const SERVICE: &str = "app.downora.desktop";

pub struct Keychain;

impl SecretStore for Keychain {
    fn get(&self, key: &str) -> Option<Vec<u8>> {
        keyring::Entry::new(SERVICE, key).ok()?.get_secret().ok()
    }
    fn set(&self, key: &str, value: &[u8]) -> Result<(), String> {
        keyring::Entry::new(SERVICE, key).and_then(|e| e.set_secret(value)).map_err(|e| e.to_string())
    }
    fn delete(&self, key: &str) {
        if let Ok(e) = keyring::Entry::new(SERVICE, key) {
            let _ = e.delete_credential();
        }
    }
    fn describe(&self) -> &'static str {
        if cfg!(target_os = "macos") {
            "the macOS Keychain"
        } else if cfg!(windows) {
            "Windows Credential Manager"
        } else {
            "your system keyring"
        }
    }
}

/// Uses the keychain when it works on this machine, otherwise a file only the
/// current user can read.
pub fn secret_store(data_dir: PathBuf) -> std::sync::Arc<dyn SecretStore> {
    let probe = format!("probe-{}", std::process::id());
    let k = Keychain;
    if k.set(&probe, b"ok").is_ok() && k.get(&probe).as_deref() == Some(b"ok".as_slice()) {
        k.delete(&probe);
        return std::sync::Arc::new(k);
    }
    std::sync::Arc::new(FileStore::new(data_dir.join("secrets.json")))
}
