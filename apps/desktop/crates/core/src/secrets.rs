//! Where pairing secrets live. The desktop app uses the OS keychain (macOS
//! Keychain, Windows Credential Manager, Secret Service on Linux) and falls
//! back to `FileStore` — a file only the current user can read — when no
//! keychain is available.

use base64::Engine;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

pub trait SecretStore: Send + Sync {
    fn get(&self, key: &str) -> Option<Vec<u8>>;
    fn set(&self, key: &str, value: &[u8]) -> Result<(), String>;
    fn delete(&self, key: &str);
    /// Shown in the UI so users know where their secrets are.
    fn describe(&self) -> &'static str;
}

#[derive(Default)]
pub struct MemoryStore(Mutex<HashMap<String, Vec<u8>>>);

impl SecretStore for MemoryStore {
    fn get(&self, key: &str) -> Option<Vec<u8>> {
        self.0.lock().unwrap().get(key).cloned()
    }
    fn set(&self, key: &str, value: &[u8]) -> Result<(), String> {
        self.0.lock().unwrap().insert(key.into(), value.to_vec());
        Ok(())
    }
    fn delete(&self, key: &str) {
        self.0.lock().unwrap().remove(key);
    }
    fn describe(&self) -> &'static str {
        "memory (tests only)"
    }
}

pub struct FileStore {
    path: PathBuf,
    lock: Mutex<()>,
}

impl FileStore {
    pub fn new(path: PathBuf) -> Self {
        Self { path, lock: Mutex::new(()) }
    }
    fn read(&self) -> HashMap<String, String> {
        std::fs::read(&self.path).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
    }
    fn write(&self, map: &HashMap<String, String>) -> Result<(), String> {
        crate::store::write_atomic(&self.path, &serde_json::to_vec(map).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&self.path, std::fs::Permissions::from_mode(0o600)).map_err(|e| e.to_string())?;
        }
        Ok(())
    }
}

impl SecretStore for FileStore {
    fn get(&self, key: &str) -> Option<Vec<u8>> {
        let _g = self.lock.lock().unwrap();
        self.read().get(key).and_then(|v| base64::engine::general_purpose::STANDARD.decode(v).ok())
    }
    fn set(&self, key: &str, value: &[u8]) -> Result<(), String> {
        let _g = self.lock.lock().unwrap();
        let mut m = self.read();
        m.insert(key.into(), base64::engine::general_purpose::STANDARD.encode(value));
        self.write(&m)
    }
    fn delete(&self, key: &str) {
        let _g = self.lock.lock().unwrap();
        let mut m = self.read();
        m.remove(key);
        let _ = self.write(&m);
    }
    fn describe(&self) -> &'static str {
        "a file only your user account can read"
    }
}
