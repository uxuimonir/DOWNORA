/**
 * @downora/media-engine — FFmpeg / FFprobe processing.
 *
 * STATUS: contract only. Nothing in this package runs yet; the implementation
 * lands in Phase 4 (see docs/roadmap.md). The interfaces are defined now so the
 * API and desktop app can be written against a stable shape.
 */
import type { Container, MediaKind } from '@downora/types';

export interface ProbeResult {
  kind: MediaKind;
  container: string;
  durationSec?: number;
  sizeBytes?: number;
  video?: { codec: string; width: number; height: number; frameRate?: number; bitRate?: number };
  audio?: { codec: string; sampleRate?: number; channels?: number; bitRate?: number };
}

export interface TranscodeRequest {
  inputPath: string;
  outputPath: string;
  container: Container;
  /** Target short-side resolution. Never above the source resolution. */
  maxShortSide?: number;
  audioOnly?: boolean;
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
}

export interface MediaEngine {
  /** Reads stream metadata with FFprobe. */
  probe(inputPath: string): Promise<ProbeResult>;
  /** Lists the containers a given source can be converted to without upscaling. */
  conversionsFor(probe: ProbeResult): Container[];
  transcode(request: TranscodeRequest): Promise<void>;
}

export const MEDIA_ENGINE_IMPLEMENTED = false as const;
