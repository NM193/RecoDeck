// src/components/PlaylistCover.tsx
// A playlist's small square (Home, Search): its own cover when it has one,
// else the background it always had (its gradient), with `children` on it.
import type { ReactNode } from 'react'
import { usePlaylistCover } from '../lib/playlistCovers'

export function PlaylistCover({
  playlist,
  className,
  fallback,
  children,
}: {
  playlist: { id: number; cover_path?: string | null } | null
  className: string
  /** The CSS background without a cover: the playlist's gradient. */
  fallback: string
  children?: ReactNode
}) {
  const url = usePlaylistCover(playlist)
  return (
    <span
      className={className}
      style={{ background: url ? `center / cover no-repeat url("${url}")` : fallback }}
    >
      {url ? null : children}
    </span>
  )
}
