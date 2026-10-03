// src/components/dj/DjGigsTab.tsx
// The Gigs tab: upcoming gigs, then "Past gigs" — or, when RA could not be
// read and nothing is cached, only the link to the DJ's RA page.
// Each name in a gig's lineup opens that DJ's page.
import { Fragment } from 'react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { Icon } from '../Icon'
import { gigDay, gigPlace } from '../../lib/dj/gigs'
import { lineupNames } from '../../lib/dj/cards'
import type { GigsState } from '../../lib/dj/page'
import type { DjGig } from '../../types/dj'

interface DjGigsTabProps {
  state: GigsState
  upcoming: DjGig[]
  past: DjGig[]
  /** The DJ's RA page (stored, or guessed from the name). */
  raUrl: string | null
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

/** "w/ Marco Carola, Loco Dice", each name a link when `onOpenDj` is given. */
function Lineup({
  lineup,
  onOpenDj,
}: {
  lineup: string
  onOpenDj?: (name: string) => void
}) {
  if (!onOpenDj) return <>w/ {lineup}</>
  return (
    <>
      w/{' '}
      {lineupNames(lineup).map((name, i) => (
        <Fragment key={`${i}-${name}`}>
          {i > 0 && ', '}
          <button
            type="button"
            className="dj-gig__dj"
            title={`Open ${name}'s page`}
            onClick={() => onOpenDj(name)}
          >
            {name}
          </button>
        </Fragment>
      ))}
    </>
  )
}

export function GigRow({
  gig,
  onOpenDj,
}: {
  gig: DjGig
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
        {gig.lineup && <Lineup lineup={gig.lineup} onOpenDj={onOpenDj} />}
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
          <GigRow key={gig.raEventId} gig={gig} onOpenDj={onOpenDj} />
        ))
      ) : (
        <p className="dj-note">No upcoming gigs listed.</p>
      )}
      {past.length > 0 && (
        <>
          <h3 className="dj-gigs__heading">Past gigs</h3>
          {past.map((gig) => (
            <GigRow key={gig.raEventId} gig={gig} onOpenDj={onOpenDj} />
          ))}
        </>
      )}
    </div>
  )
}
