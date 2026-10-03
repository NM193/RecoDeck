// src/components/dj/DjGigsTab.tsx
// The Gigs tab: upcoming gigs, then "Past gigs" — or, when RA could not be
// read and nothing is cached, only the link to the DJ's RA page.
// Each name in a gig's lineup opens that DJ's page, b2b names one by one;
// the page's own DJ is plain text.
import { Fragment } from 'react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { Icon } from '../Icon'
import { gigDay, gigPlace } from '../../lib/dj/gigs'
import { lineupNames } from '../../lib/dj/cards'
import { djKey, splitDjNames } from '../../lib/dj/names'
import type { GigsState } from '../../lib/dj/page'
import type { DjGig } from '../../types/dj'

interface DjGigsTabProps {
  state: GigsState
  upcoming: DjGig[]
  past: DjGig[]
  /** The DJ's RA page (stored, or guessed from the name). */
  raUrl: string | null
  /** djKey of the page's DJ: plain text in a lineup, not a link. */
  pageKey?: string
  /** A lineup name was clicked: that DJ's page. */
  onOpenDj?: (name: string) => void
}

/** "Gigs on Resident Advisor ↗": all the tab shows when RA failed and nothing is cached. */
export function RaLinkCard({ raUrl }: { raUrl: string | null }) {
  return (
    <button
      type="button"
      className="dj-ra-link"
      disabled={!raUrl}
      onClick={() => {
        if (raUrl) void openUrl(raUrl)
      }}
    >
      Gigs on Resident Advisor
      <Icon name="ExternalLink" size={14} />
    </button>
  )
}

/** "A b2b B" as its names and the text between them, separators kept. */
function lineupParts(entry: string): { text: string; name: boolean }[] {
  const parts: { text: string; name: boolean }[] = []
  let at = 0
  for (const name of splitDjNames(entry)) {
    const found = entry.indexOf(name, at)
    if (found < 0) continue
    if (found > at) parts.push({ text: entry.slice(at, found), name: false })
    parts.push({ text: name, name: true })
    at = found + name.length
  }
  if (at < entry.length) parts.push({ text: entry.slice(at), name: false })
  return parts
}

/**
 * "w/ Marco Carola, Loco Dice b2b Luciano", each name a link when `onOpenDj`
 * is given — but the page's own DJ (`pageKey`) stays plain text.
 */
function Lineup({
  lineup,
  pageKey,
  onOpenDj,
}: {
  lineup: string
  pageKey?: string
  onOpenDj?: (name: string) => void
}) {
  if (!onOpenDj) return <>w/ {lineup}</>
  return (
    <>
      w/{' '}
      {lineupNames(lineup).map((entry, i) => (
        <Fragment key={`${i}-${entry}`}>
          {i > 0 && ', '}
          {lineupParts(entry).map((part, j) =>
            part.name && djKey(part.text) !== pageKey ? (
              <button
                key={j}
                type="button"
                className="dj-gig__dj"
                title={`Open ${part.text}'s page`}
                onClick={() => onOpenDj(part.text)}
              >
                {part.text}
              </button>
            ) : (
              <Fragment key={j}>{part.text}</Fragment>
            ),
          )}
        </Fragment>
      ))}
    </>
  )
}

export function GigRow({
  gig,
  pageKey,
  onOpenDj,
}: {
  gig: DjGig
  /** djKey of the page's DJ: not a link in the lineup. */
  pageKey?: string
  onOpenDj?: (name: string) => void
}) {
  const { day, month } = gigDay(gig.date)
  const place = gigPlace(gig)
  return (
    <div className="dj-gig">
      <div className="dj-gig__date">
        <b>{day}</b>
        <span>{month}</span>
      </div>
      <div className="dj-gig__where">
        <b>{gig.venue ?? 'Venue to be announced'}</b>
        {place && <span>{place}</span>}
      </div>
      <span className="dj-gig__lineup" title={gig.lineup ?? undefined}>
        {gig.lineup && (
          <Lineup lineup={gig.lineup} pageKey={pageKey} onOpenDj={onOpenDj} />
        )}
      </span>
      {gig.url ? (
        <button
          type="button"
          className="dj-gig__link"
          title="Open on Resident Advisor"
          aria-label="Open on Resident Advisor"
          onClick={() => {
            if (gig.url) void openUrl(gig.url)
          }}
        >
          <Icon name="ExternalLink" size={13} />
        </button>
      ) : (
        <span />
      )}
    </div>
  )
}

export function DjGigsTab({
  state,
  upcoming,
  past,
  raUrl,
  pageKey,
  onOpenDj,
}: DjGigsTabProps) {
  if (state === 'link') return <RaLinkCard raUrl={raUrl} />
  if (state === 'searching')
    return <p className="dj-note">Looking on Resident Advisor…</p>
  if (state === 'none')
    return <p className="dj-note">No gigs listed on Resident Advisor.</p>
  return (
    <div className="dj-gigs">
      {upcoming.length > 0 ? (
        upcoming.map((gig) => (
          <GigRow
            key={gig.raEventId}
            gig={gig}
            pageKey={pageKey}
            onOpenDj={onOpenDj}
          />
        ))
      ) : (
        <p className="dj-note">No upcoming gigs listed.</p>
      )}
      {past.length > 0 && (
        <>
          <h3 className="dj-gigs__heading">Past gigs</h3>
          {past.map((gig) => (
            <GigRow
              key={gig.raEventId}
              gig={gig}
              pageKey={pageKey}
              onOpenDj={onOpenDj}
            />
          ))}
        </>
      )}
    </div>
  )
}
