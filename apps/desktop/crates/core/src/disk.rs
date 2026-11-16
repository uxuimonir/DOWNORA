use std::path::Path;

/// Free bytes on the volume holding `dir` (walks up to the nearest existing folder).
pub fn available_space(dir: &Path) -> Option<u64> {
    let mut p = dir;
    loop {
        if p.exists() {
            return fs2::available_space(p).ok();
        }
        p = p.parent()?;
    }
}

/// Room kept free so Downora never fills a disk to the last byte.
pub const SAFETY_MARGIN: u64 = 64 * 1024 * 1024;
