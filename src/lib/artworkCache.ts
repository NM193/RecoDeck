// Artwork cache utility — module-level cache, NOT React state or Zustand store.
// Provides blob URLs for track artwork, with caching to avoid repeated IPC calls.

import { tauriApi } from './tauri-api'

// Map: trackId -> blob URL (string) or null (no artwork found)
const artworkCache = new Map<number, string | null>()

/**
 * Get the artwork blob URL for a track.
 * Returns null if no artwork exists.
 * Caches results so each track is only fetched once.
 */
export async function getTrackArtworkUrl(trackId: number): Promise<string | null> {
  if (artworkCache.has(trackId)) {
    return artworkCache.get(trackId)!
  }

  try {
    const buffer = await tauriApi.getTrackArtwork(trackId)
    const bytes = new Uint8Array(buffer)
    const blob = new Blob([bytes])
    const url = URL.createObjectURL(blob)
    artworkCache.set(trackId, url)
    return url
  } catch {
    // "no_artwork" error or any other failure — cache null to avoid retrying
    artworkCache.set(trackId, null)
    return null
  }
}

/**
 * Evict a single track from the cache (e.g. after metadata update).
 * Also revokes the blob URL to free memory.
 */
export function evictArtworkCache(trackId: number): void {
  const existing = artworkCache.get(trackId)
  if (existing) {
    URL.revokeObjectURL(existing)
  }
  artworkCache.delete(trackId)
}

/**
 * Clear the entire artwork cache and revoke all blob URLs.
 * Call this when the library is fully rescanned.
 */
export function clearArtworkCache(): void {
  for (const url of artworkCache.values()) {
    if (url) {
      URL.revokeObjectURL(url)
    }
  }
  artworkCache.clear()
}
