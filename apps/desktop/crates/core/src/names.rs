//! Safe file names, name templates and duplicate handling.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

const RESERVED: [&str; 22] = [
    "con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9", "lpt1", "lpt2",
    "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
];

/// A file name stem that is valid on Windows, macOS and Linux.
pub fn sanitize_stem(input: &str) -> String {
    let cleaned: String = input
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => ' ',
            c if c.is_control() => ' ',
            c => c,
        })
        .collect();
    let collapsed = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
    let trimmed = collapsed.trim_matches(|c: char| c == '.' || c.is_whitespace());
    let mut stem: String = trimmed.chars().take(100).collect();
    stem = stem.trim_end_matches(['.', ' ']).to_string();
    if stem.is_empty() {
        return "download".into();
    }
    if RESERVED.contains(&stem.to_ascii_lowercase().as_str()) {
        stem = format!("downora-{stem}");
    }
    stem
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum NameTemplate {
    #[default]
    Title,
    TitleQuality,
    TitleDate,
}

pub fn apply_template(template: NameTemplate, title: &str, quality: Option<&str>, date: chrono::NaiveDate) -> String {
    let base = sanitize_stem(title);
    match (template, quality) {
        (NameTemplate::TitleQuality, Some(q)) => sanitize_stem(&format!("{base}-{q}")),
        (NameTemplate::TitleDate, _) => sanitize_stem(&format!("{base}-{}", date.format("%Y-%m-%d"))),
        _ => base,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum Duplicates {
    /// "clip (1).mp4", "clip (2).mp4", …
    #[default]
    Rename,
    /// Replace the existing file.
    Replace,
}

/// First free path for `stem.ext` in `dir` ("name (1).ext" style).
pub fn unique_path(dir: &Path, stem: &str, ext: &str) -> PathBuf {
    let first = dir.join(format!("{stem}.{ext}"));
    if !first.exists() {
        return first;
    }
    (1..10_000)
        .map(|n| dir.join(format!("{stem} ({n}).{ext}")))
        .find(|p| !p.exists())
        .unwrap_or_else(|| dir.join(format!("{stem}-{}.{ext}", uuid::Uuid::new_v4())))
}

/// Title from a URL's last path segment ("launch-day_v2.mp4" → "launch day v2").
pub fn title_from_url(url: &url::Url) -> String {
    let last = url.path_segments().and_then(|mut s| s.next_back()).unwrap_or("");
    let decoded = percent_decode(last);
    let stem = decoded.rsplit_once('.').map(|(s, _)| s).unwrap_or(&decoded);
    let t = stem.replace(['-', '_'], " ").split_whitespace().collect::<Vec<_>>().join(" ");
    if t.is_empty() { "Untitled media".into() } else { t }
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(b) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(b);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitizes() {
        assert_eq!(sanitize_stem("My clip: part 1/2"), "My clip part 1 2");
        assert_eq!(sanitize_stem("../../etc/passwd"), "etc passwd");
        assert_eq!(sanitize_stem("CON"), "downora-CON");
        assert_eq!(sanitize_stem("  ...  "), "download");
        assert_eq!(sanitize_stem("a\u{0}b\nc"), "a b c");
        assert!(sanitize_stem(&"x".repeat(500)).len() <= 100);
    }

    #[test]
    fn templates() {
        let d = chrono::NaiveDate::from_ymd_opt(2026, 11, 16).unwrap();
        assert_eq!(apply_template(NameTemplate::Title, "Clip", Some("1080p"), d), "Clip");
        assert_eq!(apply_template(NameTemplate::TitleQuality, "Clip", Some("1080p"), d), "Clip-1080p");
        assert_eq!(apply_template(NameTemplate::TitleQuality, "Clip", None, d), "Clip");
        assert_eq!(apply_template(NameTemplate::TitleDate, "Clip", None, d), "Clip-2026-11-16");
    }

    #[test]
    fn unique_paths() {
        let dir = tempfile::tempdir().unwrap();
        let a = unique_path(dir.path(), "clip", "mp4");
        std::fs::write(&a, b"x").unwrap();
        let b = unique_path(dir.path(), "clip", "mp4");
        assert_eq!(b.file_name().unwrap(), "clip (1).mp4");
    }

    #[test]
    fn titles_from_urls() {
        let u = url::Url::parse("https://x/media/launch-day_v2%20final.mp4").unwrap();
        assert_eq!(title_from_url(&u), "launch day v2 final");
    }
}
