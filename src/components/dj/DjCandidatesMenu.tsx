// src/components/dj/DjCandidatesMenu.tsx
// The hero's ⋯ menu: "Not this artist?". Per source, the artists its search
// finds for this name, the one the page uses checked, and "None". The Spotify
// part shows only while Spotify is connected.
import { useEffect, useRef, useState } from 'react'
import { Icon } from '../Icon'
import { useOverlay } from '../../lib/overlays'
import { raPick } from '../../lib/dj/page'
import type { ArtistCandidate, DjCandidates, RaPick } from '../../types/dj'
import { GLIDE } from '../../lib/glide/glide'
import { useHoverGlide } from '../../lib/glide/useGlide'

interface DjCandidatesMenuProps {
  candidates: DjCandidates | null
  loading: boolean
  error: string | null
  /** The artists the page uses now. */
  spotifyArtistId: string | null
  raArtistId: string | null
  /** The current match was picked by hand: a manual "None" is already recorded. */
  spotifyManual: boolean
  raManual: boolean
  /** Spotify is connected: without it there is no Spotify part. */
  spotifyConnected: boolean
  /** Called as the menu opens: the candidates are searched for then, not before. */
  onOpen: () => void
  onPickSpotify: (artistId: string | null) => void
  onPickRa: (pick: RaPick | null) => void
}

function Choice({
  candidate,
  checked,
  disabled,
  onPick,
}: {
  candidate: ArtistCandidate | null
  checked: boolean
  disabled?: boolean
  onPick: () => void
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={checked}
      className="dj-menu__choice"
      disabled={disabled}
      onClick={onPick}
    >
      <span className="dj-menu__photo">
        {candidate?.imageUrl ? (
          <img src={candidate.imageUrl} alt="" />
        ) : (
          <Icon name="User" size={14} />
        )}
      </span>
      <span className="dj-menu__name">
        {candidate ? candidate.name : 'None'}
      </span>
      {checked && (
        <Icon
          name="Check"
          size={14}
          strokeWidth={2.2}
          className="dj-menu__check"
        />
      )}
    </button>
  )
}

export function DjCandidatesMenu({
  candidates,
  loading,
  error,
  spotifyArtistId,
  raArtistId,
  spotifyManual,
  raManual,
  spotifyConnected,
  onOpen,
  onPickSpotify,
  onPickRa,
}: DjCandidatesMenuProps) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  // The hover slides between the choices (Micro-interactions spec, Menus).
  const popRef = useRef<HTMLDivElement>(null)
  const glideRef = useRef<HTMLSpanElement>(null)
  useHoverGlide(popRef, glideRef, '.dj-menu__choice:not(:disabled)', GLIDE.menu)
  // Open, it tells the app (useOverlay): Esc closes it, and the set video steps aside.
  useOverlay(open, () => setOpen(false))

  // A click outside or Escape closes it.
  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node))
        setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // The same artist again changes nothing; but "None" while nothing was
  // resolved is still a choice: it records the manual "none".
  const pickSpotify = (artistId: string | null) => {
    setOpen(false)
    const same =
      artistId === spotifyArtistId && (artistId !== null || spotifyManual)
    if (!same) onPickSpotify(artistId)
  }
  const pickRa = (pick: RaPick | null) => {
    setOpen(false)
    const id = pick?.id ?? null
    const same = id === raArtistId && (id !== null || raManual)
    if (!same) onPickRa(pick)
  }

  return (
    <div className="dj-menu" ref={root}>
      <button
        type="button"
        className="btn btn--icon"
        data-tip="Not this artist?"
        aria-label="More"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          if (!open) onOpen()
          setOpen(!open)
        }}
      >
        <Icon name="Ellipsis" size={14} />
      </button>
      {open && (
        <div ref={popRef} className="glide-track dj-menu__pop" role="menu">
          <span ref={glideRef} className="glide" aria-hidden="true" />
          <div className="dj-menu__title">Not this artist?</div>
          {error && <div className="dj-menu__note">{error}</div>}
          {loading && !candidates && (
            <div className="dj-menu__note">
              {spotifyConnected
                ? 'Searching Spotify and Resident Advisor…'
                : 'Searching Resident Advisor…'}
            </div>
          )}
          {candidates && (
            <>
              {spotifyConnected && (
                <>
                  <div className="dj-menu__source">Spotify</div>
                  {candidates.spotify.map((candidate) => (
                    <Choice
                      key={candidate.id}
                      candidate={candidate}
                      checked={candidate.id === spotifyArtistId}
                      onPick={() => pickSpotify(candidate.id)}
                    />
                  ))}
                  <Choice
                    candidate={null}
                    checked={spotifyArtistId === null}
                    onPick={() => pickSpotify(null)}
                  />
                </>
              )}
              <div className="dj-menu__source">Resident Advisor</div>
              {candidates.ra.map((candidate) => {
                const pick = raPick(candidate)
                return (
                  <Choice
                    key={candidate.id}
                    candidate={candidate}
                    checked={candidate.id === raArtistId}
                    disabled={pick === null}
                    onPick={() => pickRa(pick)}
                  />
                )
              })}
              <Choice
                candidate={null}
                checked={raArtistId === null}
                onPick={() => pickRa(null)}
              />
            </>
          )}
        </div>
      )}
    </div>
  )
}
