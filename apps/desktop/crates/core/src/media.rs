//! Which files Downora handles, mirroring packages/source-adapters.

use serde::{Deserialize, Serialize};
use url::Url;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Container {
    Mp4,
    Webm,
    Mkv,
    Mp3,
    Wav,
    M4a,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Video,
    Audio,
}

impl Container {
    pub const ALL: [Container; 6] = [Self::Mp4, Self::Webm, Self::Mkv, Self::Mp3, Self::Wav, Self::M4a];

    pub fn ext(self) -> &'static str {
        match self {
            Self::Mp4 => "mp4",
            Self::Webm => "webm",
            Self::Mkv => "mkv",
            Self::Mp3 => "mp3",
            Self::Wav => "wav",
            Self::M4a => "m4a",
        }
    }
    pub fn kind(self) -> Kind {
        match self {
            Self::Mp4 | Self::Webm | Self::Mkv => Kind::Video,
            _ => Kind::Audio,
        }
    }
    pub fn from_ext(ext: &str) -> Option<Self> {
        match ext.to_ascii_lowercase().as_str() {
            "mp4" | "m4v" => Some(Self::Mp4),
            "webm" => Some(Self::Webm),
            "mkv" => Some(Self::Mkv),
            "mp3" => Some(Self::Mp3),
            "wav" => Some(Self::Wav),
            "m4a" => Some(Self::M4a),
            _ => None,
        }
    }
    /// Only formats Downora *downloads* (MKV is a conversion target only).
    pub fn downloadable_from_ext(ext: &str) -> Option<Self> {
        Self::from_ext(ext).filter(|c| *c != Self::Mkv)
    }
    pub fn from_mime(mime: &str) -> Option<Self> {
        let m = mime.split(';').next().unwrap_or("").trim().to_ascii_lowercase();
        match m.as_str() {
            "video/mp4" => Some(Self::Mp4),
            "video/webm" => Some(Self::Webm),
            "audio/mpeg" | "audio/mp3" => Some(Self::Mp3),
            "audio/wav" | "audio/x-wav" | "audio/wave" | "audio/vnd.wave" => Some(Self::Wav),
            "audio/mp4" | "audio/x-m4a" | "audio/m4a" | "audio/aac" => Some(Self::M4a),
            _ => None,
        }
    }
}

#[derive(Debug, thiserror::Error, PartialEq)]
pub enum UrlError {
    #[error("That isn't a valid link.")]
    Malformed,
    #[error("Only http and https links are supported.")]
    Scheme,
    #[error("Links with a username or password aren't allowed.")]
    Credentials,
    #[error("Downora only downloads direct MP4, WebM, MP3, M4A and WAV files.")]
    Unsupported,
}

/// Validates a download link. `hint` is a container the caller already knows
/// (e.g. from the extension, which read the page's `type` attribute).
pub fn validate_media_url(raw: &str, hint: Option<Container>) -> Result<(Url, Option<Container>), UrlError> {
    let url = Url::parse(raw.trim()).map_err(|_| UrlError::Malformed)?;
    if url.scheme() != "http" && url.scheme() != "https" {
        return Err(UrlError::Scheme);
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err(UrlError::Credentials);
    }
    if url.host_str().is_none() {
        return Err(UrlError::Malformed);
    }
    let from_path = url
        .path_segments()
        .and_then(|mut s| s.next_back())
        .and_then(|last| last.rsplit_once('.').map(|(_, e)| e.to_string()))
        .and_then(|e| Container::downloadable_from_ext(&e));
    Ok((url, from_path.or(hint.filter(|c| *c != Container::Mkv))))
}

/// Checks the first bytes of a finished file really are the media type we
/// expect, so an HTML error page saved as `.mp4` is caught.
pub fn sniff(head: &[u8]) -> Option<Container> {
    if head.len() >= 12 && &head[4..8] == b"ftyp" {
        let brand = &head[8..12];
        return Some(if brand.starts_with(b"M4A") { Container::M4a } else { Container::Mp4 });
    }
    if head.len() >= 4 && head[..4] == [0x1A, 0x45, 0xDF, 0xA3] {
        return Some(Container::Webm); // EBML: WebM or MKV
    }
    if head.len() >= 12 && &head[..4] == b"RIFF" && &head[8..12] == b"WAVE" {
        return Some(Container::Wav);
    }
    if head.len() >= 3 && (&head[..3] == b"ID3" || (head[0] == 0xFF && head[1] & 0xE0 == 0xE0)) {
        return Some(Container::Mp3);
    }
    None
}

/// MP4 and M4A share a container; WebM and MKV too.
pub fn sniff_matches(expected: Container, found: Container) -> bool {
    use Container::*;
    matches!(
        (expected, found),
        (Mp4 | M4a, Mp4 | M4a) | (Webm | Mkv, Webm | Mkv) | (Mp3, Mp3) | (Wav, Wav)
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_urls() {
        assert_eq!(validate_media_url("https://cdn.x/a/clip.MP4?t=1", None).unwrap().1, Some(Container::Mp4));
        assert_eq!(validate_media_url("https://cdn.x/stream", Some(Container::Mp3)).unwrap().1, Some(Container::Mp3));
        assert_eq!(validate_media_url("https://cdn.x/page", None).unwrap().1, None);
        assert_eq!(validate_media_url("ftp://x/a.mp4", None).unwrap_err(), UrlError::Scheme);
        assert_eq!(validate_media_url("file:///etc/passwd", None).unwrap_err(), UrlError::Scheme);
        assert_eq!(validate_media_url("https://u:p@x/a.mp4", None).unwrap_err(), UrlError::Credentials);
        assert_eq!(validate_media_url("not a url", None).unwrap_err(), UrlError::Malformed);
    }

    #[test]
    fn sniffs_real_headers() {
        assert_eq!(sniff(b"\0\0\0\x20ftypisom\0\0"), Some(Container::Mp4));
        assert_eq!(sniff(b"\0\0\0\x20ftypM4A \0\0"), Some(Container::M4a));
        assert_eq!(sniff(&[0x1A, 0x45, 0xDF, 0xA3, 0]), Some(Container::Webm));
        assert_eq!(sniff(b"RIFF\0\0\0\0WAVEfmt "), Some(Container::Wav));
        assert_eq!(sniff(b"ID3\x04"), Some(Container::Mp3));
        assert_eq!(sniff(b"<!doctype html>"), None);
    }
}

/// Same tiers as the web app's `qualityLabelFor`: named by the shorter side.
pub fn quality_label(width: u32, height: u32) -> String {
    let short = width.min(height) as f64;
    for (label, side) in [("8K", 4320.0), ("4K", 2160.0), ("2K", 1440.0), ("1080p", 1080.0), ("720p", 720.0), ("480p", 480.0)] {
        if short >= side * 0.94 {
            return label.into();
        }
    }
    format!("{}p", width.min(height))
}
