#!/usr/bin/env bash
# Generates Downora's bundled sample media. Everything here is synthesised by
# FFmpeg (gradient + tone), so the files are original and free to redistribute.
set -euo pipefail
OUT="$(cd "$(dirname "$0")/.." && pwd)/public/samples"
FONT="${DOWNORA_SAMPLE_FONT:-/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf}"
mkdir -p "$OUT"

video_src() { # $1=WxH $2=label $3=seconds
  echo "gradients=s=$1:c0=0x8B5CF6:c1=0x0B0D12:c2=0x38BDF8:c3=0x131720:n=4:speed=0.02:d=$3:r=30,drawtext=fontfile=$FONT:text='DOWNORA SAMPLE  $2':fontcolor=white@0.9:fontsize=h/22:x=w/20:y=h-h/8,drawtext=fontfile=$FONT:text='%{pts\:hms}':fontcolor=white@0.7:fontsize=h/30:x=w/20:y=h-h/8+h/18"
}
TONE="aevalsrc='0.18*sin(2*PI*220*t)+0.12*sin(2*PI*277.18*t)+0.10*sin(2*PI*329.63*t)':s=48000"

# 1080p H.264/AAC MP4 — the most common real-world direct video file.
ffmpeg -y -v error -f lavfi -i "$(video_src 1920x1080 1080p 8)" -f lavfi -i "$TONE:d=8" \
  -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p -c:a aac -b:a 96k -movflags +faststart "$OUT/downora-sample-1080p.mp4"

# 720p VP9/Opus WebM — plays in every Chromium build, including codec-free ones.
ffmpeg -y -v error -f lavfi -i "$(video_src 1280x720 720p 8)" -f lavfi -i "$TONE:d=8" \
  -c:v libvpx-vp9 -b:v 0 -crf 36 -row-mt 1 -c:a libopus -b:a 64k "$OUT/downora-sample-720p.webm"

# Audio: MP3, M4A and WAV.
ffmpeg -y -v error -f lavfi -i "$TONE:d=12" -af "afade=t=in:d=0.4,afade=t=out:st=11.2:d=0.8" -c:a libmp3lame -b:a 128k "$OUT/downora-sample-tone.mp3"
ffmpeg -y -v error -f lavfi -i "$TONE:d=12" -af "afade=t=in:d=0.4,afade=t=out:st=11.2:d=0.8" -c:a aac -b:a 128k "$OUT/downora-sample-tone.m4a"
ffmpeg -y -v error -f lavfi -i "$TONE:d=4" -af "afade=t=in:d=0.3,afade=t=out:st=3.4:d=0.6" -ac 1 -ar 44100 -c:a pcm_s16le "$OUT/downora-sample-tone.wav"

ls -la "$OUT"
