// src/components/dj/DjCandidatesMenu.tsx
// The hero's ⋯ menu: "Not this artist?". Per source, the artists its search
// finds for this name, the one the page uses checked, and "None".
import { useEffect, useRef, useState } from 'react'
import { Icon } from '../Icon'
import { raPick } from '../../lib/dj/page'
import type { ArtistCandidate, DjCandidates, RaPick } from '../../types/dj'

interface DjCandidatesMenuProps {
  candidates: DjCandidates | null
  loading: boolean
  error: string | null
  /** The artists the page uses now. */
  spotifyArtistId: string | null
  raArtistId: string | null
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
  onOpen,
  onPickSpotify,
  onPickRa,
}: DjCandidatesMenuProps) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

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

  const pickSpotify = (artistId: string | null) => {
    setOpen(false)
    if (artistId !== spotifyArtistId) onPickSpotify(artistId)
  }
  const pickRa = (pick: RaPick | null) => {
    setOpen(false)
    if ((pick?.id ?? null) !== raArtistId) onPickRa(pick)
  }

  return (
    <div className="dj-menu" ref={root}>
      <button
        type="button"
        className="dj-btn dj-btn--icon"
        title="Not this artist?"
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
        <div className="dj-menu__pop" role="menu">
          <div className="dj-menu__title">Not this artist?</div>
          {error && <div className="dj-menu__note">{error}</div>}
          {loading && !candidates && (
            <div className="dj-menu__note">
              Searching Spotify and Resident Advisor…
            </div>
          )}
          {candidates && (
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
