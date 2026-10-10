// src/components/dj/DjOverviewCards.tsx
// The overview's cards (the approved mockup's first section): a title that
// leads to its tab ("all 9 →"), then a few rows drawn by the tabs' own
// components. While customizing, a card has a grip and × instead, and its
// rows show ghosted.
import { useRef, useState, type CSSProperties } from 'react'
import { Icon, type IconName } from '../Icon'
import { SkeletonRows } from '../Skeleton'
import { GigRow, RaLinkCard } from './DjGigsTab'
import { PlayBar, PlayStatus } from './DjPlaysTab'
import { SetCard } from './DjSetsTab'
import { DjTrackRow, StatusChips } from './DjTracksTab'
import {
  filterRows,
  type SpotifyRow,
  type StatusFilter,
} from '../../lib/spotify/rows'
import { playText, type Play } from '../../lib/dj/plays'
import { ownedQueue, type TracksTabState } from '../../lib/dj/tabs'
import {
  CARD_ROWS,
  CARD_TRACK_FILTERS,
  cardMore,
  cardTarget,
  type DjPhoto,
  type OverviewCounts,
} from '../../lib/dj/cards'
import {
  overviewCard,
  type DjTab,
  type OverviewCardId,
} from '../../lib/dj/overview'
import type { GigsState } from '../../lib/dj/page'
import type { Ownership } from '../../lib/spotify/ownership'
import type { DjGig } from '../../types/dj'
import type { LibraryTrack } from '../../lib/tracklist/match'
import type { Verdict } from '../../types/spotify'
import type { YtSetSummary } from '../../types/youtube'
import { GLIDE } from '../../lib/glide/glide'
import { useHoverGlide } from '../../lib/glide/useGlide'

/** What the cards show — DjView's own memoised values, never classified again here. */
export interface OverviewData {
  /** The DJ's name as the page shows it. */
  name: string
  /** djKey of the page's name: in a lineup, this DJ is plain text. */
  pageKey: string
  /** Null until the page and the day are known. */
  gigs: { state: GigsState; upcoming: DjGig[]; past: DjGig[] } | null
  raUrl: string | null
  /** The Tracks tab's state (tracksTabState), shared by the Tracks and Missing cards. */
  tracksState: TracksTabState
  /** Why there are no tracks (tracksEmptyText), for `empty`. */
  tracksEmpty: string
  /** DjView's trackRows: newest first, Owned / Maybe / Missing. */
  rows: SpotifyRow[]
  /** countByStatus(rows), for the Tracks card's chips. */
  trackCounts: Record<StatusFilter, number>
  /** Null while read. */
  sets: YtSetSummary[] | null
  /** Most played first; null while read. */
  plays: Play[] | null
  /** DjView's playsOwnership. */
  playsOwnership: Map<string, Ownership>
  photos: DjPhoto[]
  /** The library has not arrived yet: statuses are not known. */
  checking: boolean
}

export interface OverviewActions {
  onVerdict: (row: SpotifyRow, verdict: Verdict) => Promise<void>
  /** Plays library files, queued: the file at `index` first. */
  onPlayFiles: (queue: LibraryTrack[], index: number) => void
  onOpenSettings: () => void
  onOpenSet: (videoId: string) => void
  /** A lineup name: that DJ's page. */
  onOpenDj: (name: string) => void
}

const CARD_ICONS: Record<OverviewCardId, IconName> = {
  'upcoming-gigs': 'CalendarDays',
  plays: 'ListMusic',
  tracks: 'Music',
  sets: 'Radio',
  photos: 'Image',
  'past-gigs': 'History',
  missing: 'CircleDashed',
}

const MISSING: Ownership = { kind: 'missing' }

function Note({ children }: { children: string }) {
  return <p className="dj-note">{children}</p>
}

function GigsBody({
  kind,
  data,
  actions,
}: {
  kind: 'upcoming' | 'past'
  data: OverviewData
  actions: OverviewActions
}) {
  if (!data.gigs) return <Note>Reading the gigs…</Note>
  const { state, upcoming, past } = data.gigs
  // Design decision 8: RA failed or has no such artist, and nothing is cached.
  if (state === 'link') return <RaLinkCard raUrl={data.raUrl} />
  if (state === 'searching') return <Note>Looking on Resident Advisor…</Note>
  if (state === 'none') return <Note>No gigs listed on Resident Advisor.</Note>
  // Every gig, in a box the height of three that scrolls.
  const shown = kind === 'upcoming' ? upcoming : past
  if (shown.length === 0)
    return (
      <Note>
        {kind === 'upcoming'
          ? 'No upcoming gigs listed.'
          : 'No past gigs listed.'}
      </Note>
    )
  return (
    <div className="dj-gigs dj-gigs--scroll">
      {shown.map((gig) => (
        <GigRow
          key={gig.raEventId}
          gig={gig}
          pageKey={data.pageKey}
          onOpenDj={actions.onOpenDj}
        />
      ))}
    </div>
  )
}

function PlaysBody({ data }: { data: OverviewData }) {
  if (data.sets === null || data.plays === null)
    return <Note>Reading your saved sets…</Note>
  const sets = data.sets.length
  if (sets === 0) return <Note>{`No saved sets of ${data.name} yet.`}</Note>
  if (data.plays.length === 0)
    return <Note>Their saved sets name no tracks yet.</Note>
  return (
    <div className="dj-card__plays">
      {data.plays.slice(0, CARD_ROWS.plays).map((play) => {
        const text = playText(play)
        return (
          <div key={play.key} className="dj-card-play">
            <span className="dj-card-play__text" data-tip={text} data-tip-overflow>
              {text}
            </span>
            <PlayBar
              count={play.count}
              sets={sets}
              label={`${play.count} of ${sets}`}
            />
            <PlayStatus
              play={play}
              ownership={data.playsOwnership.get(play.key) ?? MISSING}
              checking={data.checking}
            />
          </div>
        )
      })}
    </div>
  )
}

/** The Tracks card (newest 3 under its chip) and the Missing card (newest 5 Missing). */
function TracksBody({
  filter,
  limit,
  scroll = false,
  data,
  actions,
}: {
  filter: StatusFilter
  /** The first rows only; without it, every row. */
  limit?: number
  /** Every row, in a box the height of six that scrolls. */
  scroll?: boolean
  data: OverviewData
  actions: OverviewActions
}) {
  // The hover slides from row to row (Micro-interactions spec, Rows).
  const tableRef = useRef<HTMLDivElement>(null)
  const glideRef = useRef<HTMLSpanElement>(null)
  useHoverGlide(tableRef, glideRef, '.spotify-row--data', GLIDE.row)
  if (data.tracksState === 'notConnected') {
    return (
      <div className="dj-connect">
        Connect Spotify to see their tracks
        <button type="button" className="btn btn--sm" onClick={actions.onOpenSettings}>
          Settings → Spotify
        </button>
      </div>
    )
  }
  if (data.tracksState === 'skeleton') return <SkeletonRows rows={4} label="Loading their tracks" />
  if (data.tracksState === 'empty') return <Note>{data.tracksEmpty}</Note>
  const shown = filterRows(data.rows, filter, '').slice(0, limit)
  if (shown.length === 0) {
    return (
      <Note>
        {filter === 'owned'
          ? 'You own none of their tracks yet.'
          : 'Nothing missing.'}
      </Note>
    )
  }
  // Double-click an Owned row: its file plays, queued with the card's other Owned rows.
  const playOwned = (row: SpotifyRow) => {
    const start = ownedQueue(
      shown.map((shownRow) => shownRow.ownership),
      row.ownership,
    )
    if (start) actions.onPlayFiles(start.queue, start.index)
  }
  return (
    <div
      ref={tableRef}
      className={`glide-track spotify-table dj-table dj-card__table content-in${scroll ? ' dj-card__table--scroll' : ''}`}
      role="table"
    >
      <span ref={glideRef} className="glide" aria-hidden="true" />
      {shown.map((row, index) => (
        <DjTrackRow
          key={row.track.spotifyId}
          row={row}
          number={index + 1}
          checking={data.checking}
          onVerdict={actions.onVerdict}
          onPlay={playOwned}
        />
      ))}
    </div>
  )
}

function SetsBody({
  data,
  actions,
}: {
  data: OverviewData
  actions: OverviewActions
}) {
  if (data.sets === null) return <Note>Reading your saved sets…</Note>
  if (data.sets.length === 0)
    return <Note>{`No saved sets of ${data.name} yet.`}</Note>
  return (
    <div className="dj-sets dj-sets--card">
      {data.sets.slice(0, CARD_ROWS.sets).map((set) => (
        <SetCard key={set.video_id} set={set} onOpen={actions.onOpenSet} />
      ))}
    </div>
  )
}

function PhotosBody({ data }: { data: OverviewData }) {
  if (data.photos.length === 0)
    return (
      <Note>Neither Spotify nor Resident Advisor has a photo of them.</Note>
    )
  return (
    <div className="dj-photos">
      {data.photos.map((photo) => (
        <figure key={photo.url} className="dj-photo">
          <img
            src={photo.url}
            alt={`${data.name} on ${photo.source}`}
            loading="lazy"
          />
          <figcaption>{photo.source}</figcaption>
        </figure>
      ))}
    </div>
  )
}

function CardBody({
  id,
  filter,
  data,
  actions,
}: {
  id: OverviewCardId
  /** The Tracks card's chip. */
  filter: StatusFilter
  data: OverviewData
  actions: OverviewActions
}) {
  switch (id) {
    case 'upcoming-gigs':
      return <GigsBody kind="upcoming" data={data} actions={actions} />
    case 'past-gigs':
      return <GigsBody kind="past" data={data} actions={actions} />
    case 'plays':
      return <PlaysBody data={data} />
    case 'tracks':
      return (
        <TracksBody filter={filter} scroll data={data} actions={actions} />
      )
    case 'missing':
      return (
        <TracksBody
          filter="missing"
          limit={CARD_ROWS.missing}
          data={data}
          actions={actions}
        />
      )
    case 'sets':
      return <SetsBody data={data} actions={actions} />
    case 'photos':
      return <PhotosBody data={data} />
  }
}

interface OverviewCardProps {
  id: OverviewCardId
  data: OverviewData
  actions: OverviewActions
  counts: OverviewCounts
  /** A title was clicked: its tab, on that chip for Tracks. */
  onOpenTab: (tab: DjTab, filter: StatusFilter) => void
  /** Its place in the two-column grid (cardPlacement). */
  style: CSSProperties
}

/** A card as the overview shows it normally: the title leads to its tab. */
export function OverviewCard({
  id,
  data,
  actions,
  counts,
  onOpenTab,
  style,
}: OverviewCardProps) {
  const [filter, setFilter] = useState<StatusFilter>('all')
  const card = overviewCard(id)
  const target = cardTarget(id)
  const more = cardMore(id, counts)
  // The Tracks card opens its tab on the chip it shows.
  const open = target
    ? () => onOpenTab(target.tab, id === 'tracks' ? filter : target.filter)
    : null
  return (
    <section className="dj-card" style={style} aria-label={card.title}>
      <h4 className="dj-card__head">
        <Icon name={CARD_ICONS[id]} size={14} />
        {open ? (
          <button
            type="button"
            className="dj-card__title dj-card__title--link"
            onClick={open}
          >
            {card.title}
          </button>
        ) : (
          <span className="dj-card__title">{card.title}</span>
        )}
        {id === 'tracks' && data.tracksState === 'list' && (
          <span className="dj-card__chips">
            <StatusChips
              counts={data.trackCounts}
              filter={filter}
              onFilter={setFilter}
              filters={CARD_TRACK_FILTERS}
              checking={data.checking}
            />
          </span>
        )}
        {open && more && (
          <button type="button" className="dj-card__more" onClick={open}>
            {more}
          </button>
        )}
      </h4>
      <CardBody id={id} filter={filter} data={data} actions={actions} />
    </section>
  )
}

interface EditCardProps {
  id: OverviewCardId
  data: OverviewData
  actions: OverviewActions
  onRemove: (id: OverviewCardId) => void
}

/** A card while customizing: dragged by its grip, removed with ×, its rows ghosted and inert. */
export function EditCard({ id, data, actions, onRemove }: EditCardProps) {
  const card = overviewCard(id)
  return (
    <section className="dj-card dj-card--edit" aria-label={card.title}>
      <h4 className="dj-card__head">
        <span className="dj-card__grip" data-tip="Drag to move" aria-label="Drag to move">
          <Icon name="GripVertical" size={14} />
        </span>
        <Icon name={CARD_ICONS[id]} size={14} />
        <span className="dj-card__title">{card.title}</span>
        <button
          type="button"
          className="dj-card__remove"
          data-tip={`Remove ${card.title}`}
          aria-label={`Remove ${card.title}`}
          onClick={() => onRemove(id)}
        >
          <Icon name="X" size={14} />
        </button>
      </h4>
      <div className="dj-card__ghost" aria-hidden="true" inert>
        <CardBody id={id} filter="all" data={data} actions={actions} />
      </div>
    </section>
  )
}
