// Waveform data cache — module-level cache following artworkCache.ts pattern.
// Caches deserialized waveform data per track to avoid repeated IPC + deserialization.

import { tauriApi } from './tauri-api'
import { deserializeWaveform, type WaveformData } from './waveform'

// Map: trackId -> WaveformData
const waveformCache = new Map<number, WaveformData>()

// Map: trackId -> Promise for in-flight analysis (deduplicates concurrent requests)
const pendingAnalysis = new Map<number, Promise<WaveformData | null>>()

/**
 * Get waveform data for a track.
 * If not yet analyzed, runs analysis and returns data once ready.
 * Concurrent calls for the same trackId share the same in-flight promise.
 */
export async function getTrackWaveform(
  trackId: number,
): Promise<WaveformData | null> {
  // 1. Check memory cache
  const cached = waveformCache.get(trackId)
  if (cached) return cached

  // 2. Check if analysis is already in-flight — share the same promise
  const pending = pendingAnalysis.get(trackId)
  if (pending) return pending

  // 3. Try fetching from DB (already analyzed in a previous session)
  try {
    const blob = await tauriApi.getWaveform(trackId, 'overview')
    if (blob !== null) {
      const data = deserializeWaveform(blob)
      waveformCache.set(trackId, data)
      return data
    }
  } catch {
    // DB fetch failed — fall through to analysis
  }

  // 4. Not analyzed yet — run analysis, then fetch the result
  const analysisPromise = (async (): Promise<WaveformData | null> => {
    try {
      await tauriApi.analyzeWaveform(trackId)
      const blob = await tauriApi.getWaveform(trackId, 'overview')
      if (blob !== null) {
        const data = deserializeWaveform(blob)
        waveformCache.set(trackId, data)
        return data
      }
      return null
    } catch (err) {
      console.warn(`[waveformCache] Analysis failed for track ${trackId}:`, err)
      return null
    } finally {
      pendingAnalysis.delete(trackId)
    }
  })()

  pendingAnalysis.set(trackId, analysisPromise)
  return analysisPromise
}

/**
 * Evict a single track from the cache.
 */
export function evictWaveformCache(trackId: number): void {
  waveformCache.delete(trackId)
}

/**
 * Clear the entire waveform cache.
 */
export function clearWaveformCache(): void {
  waveformCache.clear()
}
