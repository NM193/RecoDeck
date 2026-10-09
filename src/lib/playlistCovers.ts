// src/lib/playlistCovers.ts
// A playlist's own cover (Change cover): read once per cover file and kept as
// a blob URL, as track artwork is. A replaced cover is a new file (a new
// path), so it reads again; the old URL is let go a little later, as a card
// may still show it for a render or two. A read that failed is not kept, so
// the next one tries again.
import { useEffect, useState } from 'react'
import { tauriApi } from './tauri-api'

const covers = new Map<string, Promise<string | null>>()
/** How long an earlier cover's URL stays usable after a new one is asked for. */
const RELEASE_AFTER_MS = 5000

const keyOf = (id: number, path: string) => `${id}\n${path}`

/** The cover's blob URL; null when it cannot be read. */
export function playlistCoverUrl(id: number, path: string): Promise<string | null> {
  const key = keyOf(id, path)
  const known = covers.get(key)
  if (known) return known
  // An earlier cover of this playlist is let go, a little later.
  for (const [old, url] of covers) {
    if (old.startsWith(`${id}\n`)) {
      covers.delete(old)
      setTimeout(() => void url.then((u) => u && URL.revokeObjectURL(u)), RELEASE_AFTER_MS)
    }
  }
  const url = tauriApi
    .getPlaylistCover(id)
    .then((buffer) => URL.createObjectURL(new Blob([new Uint8Array(buffer)])))
    .catch(() => {
      if (covers.get(key) === url) covers.delete(key)
      return null
    })
  covers.set(key, url)
  return url
}

/** The playlist's own cover as a URL, or null: none, or not read yet. */
export function usePlaylistCover(playlist: { id: number; cover_path?: string | null } | null): string | null {
  const id = playlist?.id ?? null
  const path = playlist?.cover_path ?? null
  const [shown, setShown] = useState<{ key: string; url: string | null } | null>(null)
  useEffect(() => {
    if (id === null || path === null) return
    let live = true
    void playlistCoverUrl(id, path).then((url) => {
      if (live) setShown({ key: keyOf(id, path), url })
    })
    return () => {
      live = false
    }
  }, [id, path])
  return id !== null && path !== null && shown?.key === keyOf(id, path) ? shown.url : null
}
