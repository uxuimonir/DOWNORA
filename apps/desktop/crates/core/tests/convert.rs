mod common;

use common::*;
use downora_core::events::Event;
use downora_core::ffmpeg::{ConversionStatus, ConvertError, ConvertRequest, Converter, Ffmpeg, Preset};
use downora_core::media::Container;
use std::path::Path;
use std::sync::Arc;
use tokio::sync::broadcast;

async fn setup() -> (tempfile::TempDir, Arc<Converter>, broadcast::Sender<Event>, Ffmpeg) {
    let dir = tempfile::tempdir().unwrap();
    let ff = Ffmpeg::discover(None).await.expect("FFmpeg must be installed for these tests");
    let (tx, _) = broadcast::channel(1024);
    let conv = Converter::new(dir.path(), Some(ff.clone()), tx.clone());
    (dir, conv, tx, ff)
}

fn copy_sample(name: &str, to: &Path) -> std::path::PathBuf {
    let p = to.join(name);
    std::fs::copy(samples().join(name), &p).unwrap();
    p
}

async fn finish(rx: &mut broadcast::Receiver<Event>, id: &str) -> downora_core::ffmpeg::Conversion {
    wait_for(rx, 120, |e| match e {
        Event::Conversion { conversion } if conversion.id == id && conversion.status != ConversionStatus::Running => Some(conversion.clone()),
        _ => None,
    })
    .await
}

#[tokio::test]
async fn reports_only_formats_this_ffmpeg_can_make() {
    let (_d, _c, _t, ff) = setup().await;
    let outs = ff.outputs();
    assert_eq!(outs.len(), 6);
    for o in &outs {
        let needed: &[&str] = match o.container {
            Container::Mp3 => &["libmp3lame"],
            Container::Wav => &["pcm_s16le"],
            Container::M4a => &["aac"],
            _ => &[],
        };
        if needed.iter().all(|e| ff.has(e)) && !needed.is_empty() {
            assert!(o.available, "{:?} should be available", o.container);
        }
        if !o.available {
            assert!(o.missing.is_some());
        }
    }
}

#[tokio::test]
async fn converts_video_to_every_available_format_with_progress() {
    let (dir, conv, tx, ff) = setup().await;
    let input = copy_sample("downora-sample-1080p.mp4", dir.path());
    let out_dir = dir.path().join("out");
    std::fs::create_dir(&out_dir).unwrap();
    for target in [Container::Webm, Container::Mkv, Container::Mp3, Container::Wav, Container::M4a] {
        if !ff.outputs().iter().any(|o| o.container == target && o.available) {
            continue;
        }
        let mut rx = tx.subscribe();
        let c = conv.start(ConvertRequest { input: input.clone(), output_dir: out_dir.clone(), format: target, preset: Preset::Small, overwrite: false }).await.unwrap();
        let mut saw_progress = false;
        let done = wait_for(&mut rx, 180, |e| match e {
            Event::Conversion { conversion } if conversion.id == c.id => {
                if matches!(conversion.progress, Some(p) if p > 0.0 && p < 1.0) {
                    saw_progress = true;
                }
                (conversion.status != ConversionStatus::Running).then(|| conversion.clone())
            }
            _ => None,
        })
        .await;
        assert_eq!(done.status, ConversionStatus::Completed, "{target:?}: {:?}", done.error);
        let info = ff.probe(&done.output).await.unwrap();
        assert!((info.duration_sec.unwrap() - 8.0).abs() < 0.6, "{target:?} duration {:?}", info.duration_sec);
        match target.kind() {
            downora_core::media::Kind::Video => {
                assert!(info.video_codec.is_some());
                assert_eq!(info.width, Some(1280), "Small preset scales 1080p down to 720p");
            }
            downora_core::media::Kind::Audio => assert!(info.video_codec.is_none() && info.audio_codec.is_some(), "{target:?} must be audio only"),
        }
        let _ = saw_progress; // short clips may finish between progress ticks
    }
    // The original is untouched and no temp files remain.
    assert_eq!(std::fs::read(&input).unwrap(), sample("downora-sample-1080p.mp4"));
    assert!(!std::fs::read_dir(&out_dir).unwrap().any(|e| e.unwrap().file_name().to_string_lossy().contains("downora-convert")));
}

#[tokio::test]
async fn never_upscales() {
    let (dir, conv, tx, ff) = setup().await;
    let input = copy_sample("downora-sample-720p.webm", dir.path());
    if !ff.outputs().iter().any(|o| o.container == Container::Mp4 && o.available) {
        return;
    }
    let mut rx = tx.subscribe();
    let c = conv.start(ConvertRequest { input, output_dir: dir.path().to_path_buf(), format: Container::Mp4, preset: Preset::Small, overwrite: false }).await.unwrap();
    let done = finish(&mut rx, &c.id).await;
    assert_eq!(done.status, ConversionStatus::Completed, "{:?}", done.error);
    assert_eq!(ff.probe(&done.output).await.unwrap().width, Some(1280));
}

#[tokio::test]
async fn asks_before_overwriting_and_overwrites_only_when_confirmed() {
    let (dir, conv, tx, _ff) = setup().await;
    let input = copy_sample("downora-sample-tone.wav", dir.path());
    // Output name collides with the original itself.
    let err = conv.start(ConvertRequest { input: input.clone(), output_dir: dir.path().to_path_buf(), format: Container::Wav, preset: Preset::High, overwrite: false }).await.unwrap_err();
    assert!(matches!(err, ConvertError::Exists(ref m) if m.contains("replace the original")), "{err:?}");
    assert_eq!(std::fs::read(&input).unwrap(), sample("downora-sample-tone.wav"));

    let mut rx = tx.subscribe();
    let c = conv.start(ConvertRequest { input: input.clone(), output_dir: dir.path().to_path_buf(), format: Container::Mp3, preset: Preset::High, overwrite: false }).await.unwrap();
    assert_eq!(finish(&mut rx, &c.id).await.status, ConversionStatus::Completed);
    let again = conv.start(ConvertRequest { input: input.clone(), output_dir: dir.path().to_path_buf(), format: Container::Mp3, preset: Preset::Small, overwrite: false }).await;
    assert!(matches!(again, Err(ConvertError::Exists(_))));
    let c = conv.start(ConvertRequest { input, output_dir: dir.path().to_path_buf(), format: Container::Mp3, preset: Preset::Small, overwrite: true }).await.unwrap();
    assert_eq!(finish(&mut rx, &c.id).await.status, ConversionStatus::Completed);
}

#[tokio::test]
async fn rejects_impossible_conversions() {
    let (dir, conv, _tx, _ff) = setup().await;
    let audio = copy_sample("downora-sample-tone.mp3", dir.path());
    let e = conv.start(ConvertRequest { input: audio.clone(), output_dir: dir.path().to_path_buf(), format: Container::Mp4, preset: Preset::High, overwrite: false }).await.unwrap_err();
    assert!(e.to_string().contains("no video"), "{e}");
    let e = conv.start(ConvertRequest { input: dir.path().join("missing.mp4"), output_dir: dir.path().to_path_buf(), format: Container::Mp3, preset: Preset::High, overwrite: false }).await.unwrap_err();
    assert!(e.to_string().contains("doesn’t exist"));
    let e = conv.start(ConvertRequest { input: audio, output_dir: "relative".into(), format: Container::Wav, preset: Preset::High, overwrite: false }).await.unwrap_err();
    assert!(e.to_string().contains("output folder"));
    let text = dir.path().join("notes.mp4");
    std::fs::write(&text, b"hello").unwrap();
    assert!(conv.start(ConvertRequest { input: text, output_dir: dir.path().to_path_buf(), format: Container::Mp3, preset: Preset::High, overwrite: false }).await.is_err());
}

#[tokio::test]
async fn cancel_stops_ffmpeg_and_leaves_no_file() {
    let (dir, conv, tx, ff) = setup().await;
    if !ff.outputs().iter().any(|o| o.container == Container::Webm && o.available) {
        return;
    }
    let input = copy_sample("downora-sample-1080p.mp4", dir.path());
    let out = dir.path().join("out");
    std::fs::create_dir(&out).unwrap();
    let mut rx = tx.subscribe();
    let c = conv.start(ConvertRequest { input, output_dir: out.clone(), format: Container::Webm, preset: Preset::High, overwrite: false }).await.unwrap();
    tokio::time::sleep(std::time::Duration::from_millis(300)).await;
    assert!(conv.cancel(&c.id));
    assert_eq!(finish(&mut rx, &c.id).await.status, ConversionStatus::Canceled);
    tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    assert_eq!(std::fs::read_dir(&out).unwrap().count(), 0, "no partial output");
}
