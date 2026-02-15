// Waveform data structures and rendering utilities

export interface WaveformPoint {
  peak: number; // 0.0-1.0
  low: number;  // 0-255 (red channel - bass)
  mid: number;  // 0-255 (green channel - mids)
  high: number; // 0-255 (blue channel - treble)
}

export interface WaveformData {
  points: WaveformPoint[];
  sampleRate: number;
  durationMs: number;
}

/**
 * Deserialize waveform BLOB from backend
 * Format: [version:u8, sample_rate:u32, duration_ms:u64, points_count:u32, points...]
 * Each point: [peak:f32, low:u8, mid:u8, high:u8]
 */
export function deserializeWaveform(blob: Uint8Array): WaveformData {
  if (blob.length < 17) {
    throw new Error('Invalid waveform BLOB: too short');
  }

  const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  let offset = 0;

  const version = view.getUint8(offset);
  offset += 1;

  if (version !== 1) {
    throw new Error(`Unsupported waveform version: ${version}`);
  }

  const sampleRate = view.getUint32(offset, true);
  offset += 4;

  const durationMs = Number(view.getBigUint64(offset, true));
  offset += 8;

  const pointsCount = view.getUint32(offset, true);
  offset += 4;

  const expectedLen = 17 + pointsCount * 7;
  if (blob.length !== expectedLen) {
    throw new Error(
      `Invalid waveform BLOB: expected ${expectedLen} bytes, got ${blob.length}`
    );
  }

  const points: WaveformPoint[] = [];
  for (let i = 0; i < pointsCount; i++) {
    const peak = view.getFloat32(offset, true);
    offset += 4;

    const low = view.getUint8(offset);
    offset += 1;

    const mid = view.getUint8(offset);
    offset += 1;

    const high = view.getUint8(offset);
    offset += 1;

    points.push({ peak, low, mid, high });
  }

  return { points, sampleRate, durationMs };
}

/**
 * Render waveform to canvas with specified style
 */
export function renderWaveform(
  ctx: CanvasRenderingContext2D,
  waveform: WaveformData,
  width: number,
  height: number,
  position: number, // current position in ms
  duration: number, // track duration in ms
  options: {
    bgColor?: string;
    playedAlpha?: number;
    playheadColor?: string;
    style?: string; // 'traktor_rgb', 'mono_peaks', 'bars'
    monoColor?: string;
  } = {}
): void {
  const {
    bgColor = '#1a1a28',
    playedAlpha = 0.4,
    playheadColor = '#6366f1',
    style = 'traktor_rgb',
    monoColor = '#6366f1',
  } = options;

  // Clear canvas
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);

  if (waveform.points.length === 0) {
    console.log('[renderWaveform] No points to render');
    return;
  }

  console.log('[renderWaveform] Rendering', waveform.points.length, 'points, style:', style);

  const mid = height / 2;
  const progress = duration > 0 ? position / duration : 0;
  const progressX = progress * width;

  // Draw waveform based on selected style
  const pointsPerPixel = waveform.points.length / width;
  
  for (let x = 0; x < width; x++) {
    const pointIdx = Math.floor(x * pointsPerPixel);
    if (pointIdx >= waveform.points.length) break;
    
    const point = waveform.points[pointIdx];
    
    // Amplitude determines height
    const barHeight = Math.max(point.peak * height * 0.8, 2);
    const halfBar = barHeight / 2;
    
    // Played/unplayed overlay
    const alpha = x < progressX ? playedAlpha : 1.0;
    
    if (style === 'traktor_rgb') {
      // RGB color from frequency bands
      const r = point.low;
      const g = point.mid;
      const b = point.high;
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      ctx.fillRect(x, mid - halfBar, 1, barHeight);
    } else if (style === 'mono_peaks') {
      // Single color waveform
      ctx.fillStyle = x < progressX 
        ? `rgba(165, 180, 252, ${alpha})` // played color (light indigo)
        : monoColor;
      ctx.fillRect(x, mid - halfBar, 1, barHeight);
    } else if (style === 'bars') {
      // Simple bars with spacing
      if (x % 3 === 0) {
        ctx.fillStyle = x < progressX 
          ? `rgba(165, 180, 252, ${alpha})`
          : monoColor;
        ctx.fillRect(x, mid - halfBar, 2, barHeight);
      }
    }
  }

  // Draw playhead line
  if (duration > 0 && progressX > 0) {
    ctx.strokeStyle = playheadColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(progressX, 0);
    ctx.lineTo(progressX, height);
    ctx.stroke();
  }
}
