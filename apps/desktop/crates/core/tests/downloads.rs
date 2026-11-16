mod common;

use common::*;
use downora_core::download::{AddRequest, Manager, Status};
use downora_core::events::{Event, NoticeKind};
use downora_core::names::Duplicates;

fn add(url: String) -> AddRequest {
    AddRequest { url, title: None, container: None, quality: None, dir: None, source: None }
}

fn job_status(id: &str, want: Status) -> impl FnMut(&Event) -> Option<downora_core::download::Job> + '_ {
    move |e| match e {
        Event::Job { job } if job.id == id && job.status == want => Some(job.clone()),
        _ => None,
    }
}

#[tokio::test]
async fn downloads_a_file_with_real_progress_and_metadata() {
    let fx = fixture().await;
    let env = env().await;
    let mut rx = env.events.subscribe();
    let job = env.manager.add(add(format!("{}/media/downora-sample-1080p.mp4?rate=200000", fx.base))).await.unwrap();

    let mut progress = vec![];
    let done = wait_for(&mut rx, 30, |e| match e {
        Event::Job { job: j } if j.id == job.id => {
            if j.status == Status::Downloading && j.bytes_received > 0 {
                progress.push((j.bytes_received, j.bytes_total, j.speed_bps));
            }
            (j.status == Status::Completed && j.thumbnail.is_some()).then(|| j.clone())
        }
        _ => None,
    })
    .await;

    let expected = sample("downora-sample-1080p.mp4");
    let path = done.path.clone().unwrap();
    assert_eq!(path.file_name().unwrap(), "downora sample 1080p.mp4");
    assert_eq!(std::fs::read(&path).unwrap(), expected, "saved bytes must match the source");
    assert_eq!(done.bytes_total, Some(expected.len() as u64));
    // Progress was reported from real bytes: increasing, below total, with a speed.
    assert!(progress.len() >= 3, "only {} progress events", progress.len());
    assert!(progress.windows(2).all(|w| w[1].0 >= w[0].0));
    assert!(progress.iter().all(|p| p.0 < expected.len() as u64 && p.1 == Some(expected.len() as u64)));
    assert!(progress.iter().any(|p| p.2.is_some()));
    // Metadata comes from FFprobe on the saved file.
    assert_eq!((done.width, done.height), (Some(1920), Some(1080)));
    assert_eq!(done.quality.as_deref(), Some("1080p"));
    assert!(done.thumbnail.as_ref().unwrap().exists());
    // No partial file left behind.
    assert!(!std::fs::read_dir(env.downloads()).unwrap().any(|e| e.unwrap().file_name().to_string_lossy().ends_with(".downora-part")));
}

#[tokio::test]
async fn completion_and_failure_raise_notices() {
    let fx = fixture().await;
    let env = env().await;
    let mut rx = env.events.subscribe();
    env.manager.add(add(format!("{}/media/downora-sample-tone.mp3", fx.base))).await.unwrap();
    wait_for(&mut rx, 20, |e| matches!(e, Event::Notice(n) if n.kind == NoticeKind::DownloadComplete).then_some(())).await;
    env.manager.add(add(format!("{}/forbidden.mp4", fx.base))).await.unwrap();
    let n = wait_for(&mut rx, 20, |e| match e {
        Event::Notice(n) if n.kind == NoticeKind::DownloadFailed => Some(n.clone()),
        _ => None,
    })
    .await;
    assert!(n.body.contains("403"));
}

#[tokio::test]
async fn pause_and_resume_continue_from_the_same_byte() {
    let fx = fixture().await;
    let env = env().await;
    let mut rx = env.events.subscribe();
    let job = env.manager.add(add(format!("{}/media/downora-sample-1080p.mp4?rate=150000", fx.base))).await.unwrap();
    wait_for(&mut rx, 20, |e| matches!(e, Event::Job { job: j } if j.id == job.id && j.bytes_received > 100_000).then_some(())).await;
    env.manager.pause(&job.id).await.unwrap();
    let paused = wait_for(&mut rx, 10, job_status(&job.id, Status::Paused)).await;
    assert_eq!(paused.resumable, Some(true));
    let part = env.downloads().join(format!(".{}.downora-part", job.id));
    let held = std::fs::metadata(&part).unwrap().len();
    assert!(held > 100_000);
    tokio::time::sleep(std::time::Duration::from_millis(400)).await;
    assert_eq!(std::fs::metadata(&part).unwrap().len(), held, "nothing is written while paused");

    env.manager.resume(&job.id).await.unwrap();
    let done = wait_for(&mut rx, 30, job_status(&job.id, Status::Completed)).await;
    assert_eq!(fx.seen.ranges.lock().unwrap().last().unwrap(), &format!("bytes={held}-"));
    assert_eq!(std::fs::read(done.path.unwrap()).unwrap(), sample("downora-sample-1080p.mp4"));
}

#[tokio::test]
async fn resume_restarts_cleanly_when_the_server_ignores_ranges() {
    let fx = fixture().await;
    let env = env().await;
    let mut rx = env.events.subscribe();
    let job = env.manager.add(add(format!("{}/media/downora-sample-1080p.mp4?rate=150000&noranges=1", fx.base))).await.unwrap();
    wait_for(&mut rx, 20, |e| matches!(e, Event::Job { job: j } if j.id == job.id && j.bytes_received > 50_000).then_some(())).await;
    env.manager.pause(&job.id).await.unwrap();
    let paused = wait_for(&mut rx, 10, job_status(&job.id, Status::Paused)).await;
    assert_eq!(paused.resumable, Some(false), "UI shows Restart instead of Resume");
    env.manager.resume(&job.id).await.unwrap();
    let done = wait_for(&mut rx, 30, job_status(&job.id, Status::Completed)).await;
    assert_eq!(std::fs::read(done.path.unwrap()).unwrap(), sample("downora-sample-1080p.mp4"));
}

#[tokio::test]
async fn cancel_deletes_the_partial_file() {
    let fx = fixture().await;
    let env = env().await;
    let mut rx = env.events.subscribe();
    let job = env.manager.add(add(format!("{}/media/downora-sample-1080p.mp4?rate=100000", fx.base))).await.unwrap();
    wait_for(&mut rx, 20, |e| matches!(e, Event::Job { job: j } if j.id == job.id && j.bytes_received > 0).then_some(())).await;
    env.manager.cancel(&job.id).await.unwrap();
    let c = wait_for(&mut rx, 10, job_status(&job.id, Status::Canceled)).await;
    assert_eq!(c.bytes_received, 0);
    assert!(!env.downloads().join(format!(".{}.downora-part", job.id)).exists());
}

#[tokio::test]
async fn a_dropped_connection_fails_and_retry_finishes_from_the_partial() {
    let fx = fixture().await;
    let env = env().await;
    let mut rx = env.events.subscribe();
    let job = env.manager.add(add(format!("{}/flaky/downora-sample-1080p.mp4?rate=500000", fx.base))).await.unwrap();
    let failed = wait_for(&mut rx, 20, job_status(&job.id, Status::Failed)).await;
    assert!(failed.error.unwrap().contains("dropped"));
    assert!(failed.bytes_received > 0);
    env.manager.retry(&job.id).await.unwrap();
    let done = wait_for(&mut rx, 20, job_status(&job.id, Status::Completed)).await;
    assert!(fx.seen.ranges.lock().unwrap().last().unwrap().starts_with("bytes="), "retry resumed with Range");
    assert_eq!(std::fs::read(done.path.unwrap()).unwrap(), sample("downora-sample-1080p.mp4"));
}

#[tokio::test]
async fn rejects_refused_pages_and_fake_media() {
    let fx = fixture().await;
    let env = env().await;
    let mut rx = env.events.subscribe();
    for (path, needle) in [("/forbidden.mp4", "403"), ("/page.mp4", "web page"), ("/fake.mp4", "isn’t a valid media file")] {
        let job = env.manager.add(add(format!("{}{path}", fx.base))).await.unwrap();
        let f = wait_for(&mut rx, 20, job_status(&job.id, Status::Failed)).await;
        assert!(f.error.as_deref().unwrap().contains(needle), "{path}: {:?}", f.error);
    }
    // Nothing was saved, partial or final.
    let leftovers: Vec<_> = std::fs::read_dir(env.downloads()).map(|d| d.flatten().map(|e| e.file_name()).collect()).unwrap_or_default();
    assert!(leftovers.is_empty(), "{leftovers:?}");
}

#[tokio::test]
async fn offline_server_fails_with_a_clear_message() {
    let env = env().await;
    let mut rx = env.events.subscribe();
    let job = env.manager.add(add("http://127.0.0.1:9/clip.mp4".into())).await.unwrap();
    let f = wait_for(&mut rx, 30, job_status(&job.id, Status::Failed)).await;
    assert!(f.error.unwrap().contains("Couldn’t reach the server"));
}

#[tokio::test]
async fn duplicate_names_are_renamed_or_replaced() {
    let fx = fixture().await;
    let env = env().await;
    let mut rx = env.events.subscribe();
    let url = format!("{}/media/downora-sample-tone.wav", fx.base);
    let a = env.manager.add(add(url.clone())).await.unwrap();
    wait_for(&mut rx, 20, job_status(&a.id, Status::Completed)).await;
    let b = env.manager.add(add(url.clone())).await.unwrap();
    let b = wait_for(&mut rx, 20, job_status(&b.id, Status::Completed)).await;
    assert_eq!(b.path.unwrap().file_name().unwrap(), "downora sample tone (1).wav");

    env.settings.write().await.duplicates = Duplicates::Replace;
    let c = env.manager.add(add(url)).await.unwrap();
    let c = wait_for(&mut rx, 20, job_status(&c.id, Status::Completed)).await;
    assert_eq!(c.path.unwrap().file_name().unwrap(), "downora sample tone.wav");
    assert_eq!(std::fs::read_dir(env.downloads()).unwrap().count(), 2);
}

#[tokio::test]
async fn bandwidth_limit_slows_real_transfers() {
    let fx = fixture().await;
    let env = env_with(|s| s.bandwidth_limit_kib = 100).await;
    let mut rx = env.events.subscribe();
    let started = std::time::Instant::now();
    let job = env.manager.add(add(format!("{}/media/downora-sample-tone.wav", fx.base))).await.unwrap(); // ~345 KB
    wait_for(&mut rx, 30, job_status(&job.id, Status::Completed)).await;
    let secs = started.elapsed().as_secs_f64();
    assert!(secs > 2.5, "345 KB at 100 KiB/s took only {secs:.2}s");
}

#[tokio::test]
async fn concurrency_limit_queues_extra_downloads() {
    let fx = fixture().await;
    let env = env_with(|s| s.concurrency = 1).await;
    let a = env.manager.add(add(format!("{}/media/downora-sample-1080p.mp4?rate=100000", fx.base))).await.unwrap();
    let b = env.manager.add(add(format!("{}/media/downora-sample-tone.mp3", fx.base))).await.unwrap();
    assert_eq!(env.manager.get(&a.id).await.unwrap().status, Status::Downloading);
    assert_eq!(env.manager.get(&b.id).await.unwrap().status, Status::Queued);
    env.manager.cancel(&a.id).await.unwrap();
    let mut rx = env.events.subscribe();
    wait_for(&mut rx, 20, job_status(&b.id, Status::Completed)).await;
}

#[tokio::test]
async fn state_survives_a_restart_and_orphans_are_cleaned() {
    let fx = fixture().await;
    let env = env().await;
    let mut rx = env.events.subscribe();
    let job = env.manager.add(add(format!("{}/media/downora-sample-1080p.mp4?rate=100000", fx.base))).await.unwrap();
    wait_for(&mut rx, 20, |e| matches!(e, Event::Job { job: j } if j.id == job.id && j.bytes_received > 0).then_some(())).await;
    env.manager.pause(&job.id).await.unwrap();
    wait_for(&mut rx, 10, job_status(&job.id, Status::Paused)).await;
    std::fs::write(env.downloads().join(".deadbeef.downora-part"), b"orphan").unwrap();

    // "Restart": a fresh manager over the same data folder.
    let again = Manager::new(&env.dir.path().join("data"), &env.dir.path().join("cache"), env.settings.clone(), env.events.clone(), None);
    let restored = again.get(&job.id).await.unwrap();
    assert_eq!(restored.status, Status::Paused);
    assert_eq!(again.cleanup_orphans().await, 1);
    assert!(env.downloads().join(format!(".{}.downora-part", job.id)).exists(), "paused job keeps its partial file");
}

#[tokio::test]
async fn rejects_bad_requests() {
    let env = env().await;
    for url in ["ftp://x/a.mp4", "file:///etc/passwd", "https://u:p@x/a.mp4", "nope"] {
        assert!(env.manager.add(add(url.into())).await.is_err(), "{url}");
    }
    let mut r = add("https://x/a.mp4".into());
    r.dir = Some("relative/dir".into());
    assert!(env.manager.add(r).await.is_err());
}

#[tokio::test]
async fn a_server_that_sends_the_wrong_range_never_produces_a_corrupt_file() {
    let fx = fixture().await;
    let env = env().await;
    let mut rx = env.events.subscribe();
    let job = env.manager.add(add(format!("{}/liar/downora-sample-1080p.mp4", fx.base))).await.unwrap();
    wait_for(&mut rx, 20, job_status(&job.id, Status::Failed)).await; // first attempt drops halfway
    env.manager.retry(&job.id).await.unwrap();
    let f = wait_for(&mut rx, 20, job_status(&job.id, Status::Failed)).await;
    assert!(f.error.unwrap().contains("wrong part"), "rejected the bad range");
    assert_eq!(f.bytes_received, 0);
    assert!(!env.downloads().join(format!(".{}.downora-part", job.id)).exists(), "corrupt partial discarded");
    // Next retry starts clean and succeeds.
    env.manager.retry(&job.id).await.unwrap();
    let done = wait_for(&mut rx, 20, job_status(&job.id, Status::Completed)).await;
    assert_eq!(std::fs::read(done.path.unwrap()).unwrap(), sample("downora-sample-1080p.mp4"));
}

#[tokio::test]
async fn a_file_that_changed_on_the_server_restarts_instead_of_being_stitched() {
    let fx = fixture().await;
    let env = env().await;
    let mut rx = env.events.subscribe();
    let job = env.manager.add(add(format!("{}/media/downora-sample-1080p.mp4?rate=150000", fx.base))).await.unwrap();
    wait_for(&mut rx, 20, |e| matches!(e, Event::Job { job: j } if j.id == job.id && j.bytes_received > 100_000).then_some(())).await;
    env.manager.pause(&job.id).await.unwrap();
    let paused = wait_for(&mut rx, 10, job_status(&job.id, Status::Paused)).await;
    assert_eq!(paused.validator.as_deref(), Some("\"downora-sample-1080p.mp4-1\""));
    // Simulate the file changing: the server's ETag no longer matches.
    let mut jobs = env.manager.list().await;
    let _ = &mut jobs;
    std::fs::write(env.dir.path().join("data/jobs.json"), serde_json::to_vec(&env.manager.list().await.into_iter().map(|mut j| { j.validator = Some("\"old-version\"".into()); j }).collect::<Vec<_>>()).unwrap()).unwrap();
    let again = Manager::new(&env.dir.path().join("data"), &env.dir.path().join("cache"), env.settings.clone(), env.events.clone(), None);
    again.resume(&job.id).await.unwrap();
    let done = wait_for(&mut rx, 30, job_status(&job.id, Status::Completed)).await;
    assert_eq!(std::fs::read(done.path.unwrap()).unwrap(), sample("downora-sample-1080p.mp4"), "full file, not stitched");
    assert!(fx.seen.ranges.lock().unwrap().last().unwrap().starts_with("bytes="));
}
