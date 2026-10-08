// src/components/sets/SetsBox.tsx
// Sets' one box (Sets redesign spec, Sets home): "Paste a set link, or type a
// DJ's name", the quota under it, and a dropdown under it that offers what
// fits what is typed — a link opens its set; text finds the stored sets and
// the tracks in them as you type, free, and ends with the one row that
// spends quota, a YouTube search (101 units). ↑ / ↓ move, Enter opens, Esc
// closes the dropdown, then clears the box. The dropdown stays inside the
// main area, so it never reaches the set video in the bar.
import { useEffect, useId, useMemo, useState } from 'react'
import { Icon } from '../Icon'
import { tauriApi } from '../../lib/tauri-api'
import { TRACK_HITS_MAX, boxOffer, matchingSets } from '../../lib/sets/box'
import type { YouTubeQuotaStatus, YtSetSummary, YtTrackHit } from '../../types/youtube'
import './SetsHome.css'

interface SetsBoxProps {
  value: string
  onChange: (value: string) => void
  /** The library: what is stored, and what the text is matched against. */
  sets: YtSetSummary[]
  quota: YouTubeQuotaStatus | null
  /** A set being fetched or YouTube being searched. */
  busy: boolean
  error: string | null
  autoFocus?: boolean
  /** A stored set, or a link: opens the set's page (fetching it first if it is not stored). */
  onOpenSet: (videoId: string, title: string | null) => void
  /** A track in a stored set: its set, playing from there. */
  onOpenHit: (hit: YtTrackHit) => void
  /** The one that spends: 101 units. */
  onSearchYouTube: (query: string) => void
  /** Esc on a closed dropdown: the box is cleared and YouTube's results go. */
  onClear: () => void
}

type Row =
  | { kind: 'link'; videoId: string; stored: boolean }
  | { kind: 'set'; set: YtSetSummary }
  | { kind: 'hit'; hit: YtTrackHit }
  | { kind: 'youtube'; query: string }

export function SetsBox({
  value,
  onChange,
  sets,
  quota,
  busy,
  error,
  autoFocus,
  onOpenSet,
  onOpenHit,
  onSearchYouTube,
  onClear,
}: SetsBoxProps) {
  const listId = useId()
  const [open, setOpen] = useState(Boolean(autoFocus))
  const [active, setActive] = useState(0)
  const [hits, setHits] = useState<{ query: string; rows: YtTrackHit[] }>({ query: '', rows: [] })

  const storedIds = useMemo(() => new Set(sets.map((s) => s.video_id)), [sets])
  const offer = boxOffer(value, storedIds)
  const query = offer.kind === 'text' ? offer.query : ''
  /** The free track search has not answered this text yet. */
  const pending = query !== '' && hits.query !== query
  const tooFewUnits = quota !== null && quota.remaining < 101

  // The tracks in the stored sets: never the network, so as you type; a short
  // wait only spares the database.
  useEffect(() => {
    if (!query) return
    let live = true
    const timer = setTimeout(() => {
      tauriApi
        .searchYouTubeTracks(query)
        .then((rows) => {
          if (live) setHits({ query, rows: rows.slice(0, TRACK_HITS_MAX) })
        })
        .catch(() => {})
    }, 200)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [query])

  const yourSets = useMemo(() => (query ? matchingSets(sets, query) : []), [sets, query])
  // The last answer stays until the next one comes, so the rows (and the
  // paid row under them) do not jump while you type.
  const trackHits = query ? hits.rows : []
  const rows: Row[] =
    offer.kind === 'link'
      ? [offer]
      : offer.kind === 'text'
        ? [
            ...yourSets.map((set): Row => ({ kind: 'set', set })),
            ...trackHits.map((hit): Row => ({ kind: 'hit', hit })),
            { kind: 'youtube', query },
          ]
        : []
  const showing = open && rows.length > 0
  const current = Math.min(active, rows.length - 1)

  // The lit row stays in view as ↑ / ↓ move through a long list.
  useEffect(() => {
    if (showing) document.getElementById(`${listId}-${current}`)?.scrollIntoView({ block: 'nearest' })
  }, [showing, current, listId])

  const choose = (row: Row) => {
    // One YouTube search at a time.
    if (row.kind === 'youtube' && busy) return
    setOpen(false)
    if (row.kind === 'link') onOpenSet(row.videoId, null)
    else if (row.kind === 'set') onOpenSet(row.set.video_id, row.set.title)
    else if (row.kind === 'hit') onOpenHit(row.hit)
    else onSearchYouTube(row.query)
  }

  const optionId = (i: number) => `${listId}-${i}`
  const firstHit = yourSets.length

  return (
    <div className="sets-box">
      <div className="sets-box__field">
        <Icon name="Search" size={16} className="sets-box__icon" />
        <input
          className="sets-box__input"
          placeholder="Paste a set link, or type a DJ's name"
          value={value}
          autoFocus={autoFocus}
          role="combobox"
          aria-label="Paste a set link, or type a DJ's name"
          aria-expanded={showing}
          aria-controls={showing ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={showing ? optionId(current) : undefined}
          onChange={(e) => {
            onChange(e.target.value)
            setActive(0)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            // A key that finishes an input method's composition is not ours.
            if (e.nativeEvent.isComposing) return
            if (e.key === 'ArrowDown' && rows.length > 0) {
              e.preventDefault()
              setOpen(true)
              setActive((i) => (Math.min(i, rows.length - 1) + 1) % rows.length)
            } else if (e.key === 'ArrowUp' && rows.length > 0) {
              e.preventDefault()
              setOpen(true)
              setActive((i) => (Math.min(i, rows.length - 1) - 1 + rows.length) % rows.length)
            } else if (e.key === 'Enter' && rows.length > 0 && !busy) {
              e.preventDefault()
              // A closed list only opens: nothing happens out of sight.
              if (!showing) setOpen(true)
              // The paid row waits for the free results, so Enter on a name
              // typed fast does not spend 101 units before they show.
              else if (rows[current].kind === 'youtube' && pending) return
              else choose(rows[current])
            } else if (e.key === 'Escape') {
              if (showing) setOpen(false)
              else onClear()
            }
          }}
        />
        {busy && <span className="sets-box__busy">Reading…</span>}
      </div>

      {showing && (
        <div
          className="sets-box__menu"
          id={listId}
          role="listbox"
          aria-label="Sets and tracks"
          // A press anywhere in the list (a heading, the scrollbar) keeps the box focused.
          onMouseDown={(e) => e.preventDefault()}
        >
          {rows.map((row, i) => (
            <div key={i}>
              {row.kind === 'set' && i === 0 && (
                <div className="sets-box__group" role="presentation">
                  Your sets
                </div>
              )}
              {row.kind === 'hit' && i === firstHit && (
                <div className="sets-box__group" role="presentation">
                  Tracks in your sets
                </div>
              )}
              <div
                id={optionId(i)}
                role="option"
                aria-selected={i === current}
                className={`sets-box__row${i === current ? ' sets-box__row--active' : ''}${
                  row.kind === 'youtube' ? ' sets-box__row--youtube' : ''
                }`}
                // Chosen on press, before the box's blur closes the list.
                onMouseDown={(e) => {
                  e.preventDefault()
                  choose(row)
                }}
                onMouseEnter={() => setActive(i)}
              >
                {row.kind === 'link' && (
                  <>
                    <Icon name="Play" size={14} />
                    <span className="sets-box__text">
                      {row.stored ? 'In your library' : 'Open this set'}
                    </span>
                    <span className="sets-box__cost">{row.stored ? 'free' : '5–7 units'}</span>
                  </>
                )}
                {row.kind === 'set' && (
                  <>
                    <Icon name="Disc3" size={14} />
                    <span className="sets-box__text">
                      <span className="sets-box__title">{row.set.title}</span>
                      {row.set.channel && <span className="sets-box__meta">{row.set.channel}</span>}
                    </span>
                  </>
                )}
                {row.kind === 'hit' && (
                  <>
                    <span className="sets-box__cue">{row.hit.cue}</span>
                    <span className="sets-box__text">
                      <span className="sets-box__title">
                        {row.hit.artist ? `${row.hit.artist} — ${row.hit.title}` : row.hit.title}
                      </span>
                      {row.hit.set_title && <span className="sets-box__meta">{row.hit.set_title}</span>}
                    </span>
                  </>
                )}
                {row.kind === 'youtube' && (
                  <>
                    <Icon name="Search" size={14} />
                    <span className="sets-box__text">Search YouTube for sets by &ldquo;{row.query}&rdquo;</span>
                    <span className="sets-box__cost">
                      {tooFewUnits ? `101 units · ${quota.remaining.toLocaleString('en-US')} left` : '101 units'}
                    </span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {quota && (
        <p className="sets-box__quota">
          {quota.remaining.toLocaleString('en-US')} units left today · a set costs 5–7 · reopening one
          costs nothing
        </p>
      )}
      {error && <div className="sets-error">{error}</div>}
    </div>
  )
}
