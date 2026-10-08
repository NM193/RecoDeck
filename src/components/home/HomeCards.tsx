// src/components/home/HomeCards.tsx
// Home's cards (Home cards spec, The grid and Cards in detail): each card's
// frame and what it shows. A card with nothing to show says so in one line;
// one whose data is still being read shows nothing yet.
import type { ReactNode } from 'react'
import { Icon, type IconName } from '../Icon'
import {
  count,
  gigDay,
  gigLine,
  gigWhere,
  libraryStats,
  needsYouRows,
  playedLabel,
  type NeedsYouRow,
  type StreamNews,
} from '../../lib/home/labels'
import { homeCard } from '../../lib/home/cards'
import type { TrackFilter } from '../../lib/trackTable/filter'
import type { Playlist } from '../../types/track'
import { homeGenreTiles, playlistGradient, userPlaylists } from './content'
import { HomeTrackRows, type TrackRowActions } from './HomeTrackRows'
import type { HomeData } from './useHomeData'

/** What the cards act through; App passes them to HomeView. */
export interface HomeActions extends TrackRowActions {
  /** Plays the playlist from its first track, the playlist as the queue. */
  onPlayPlaylist: (id: number) => void
  onOpenPlaylist: (id: number) => void
  onOpenDj: (name: string) => void
  onOpenSets: () => void
  /** All Tracks, with this filter or none. */
  onOpenAllTracks: (filter: TrackFilter | null) => void
  onOpenStreamList: (
    service: 'spotify' | 'youtube-music',
    listId: string,
  ) => void
  /** Analyzes exactly these tracks (Home's are the ones without a BPM). */
  onAnalyzeTracks: (ids: number[]) => void
  onCreatePlaylist: () => void
  /** Settings, with its Library section open. */
  onImportFolder: () => void
}

/** What the cards show beyond what they read themselves. */
export interface HomeFacts {
  playlists: Playlist[]
  totalTrackCount: number
  folderCount: number
  /** New likes not owned; null when the service is not shown in the sidebar. */
  spotify: StreamNews | null
  youtubeMusic: StreamNews | null
}

interface HomeCardProps {
  id: string
  /** The card's width in columns. */
  columns: number
  editing: boolean
  onRemove: (id: string) => void
  data: HomeData
  facts: HomeFacts
  actions: HomeActions
}

export function HomeCard({
  id,
  columns,
  editing,
  onRemove,
  data,
  facts,
  actions,
}: HomeCardProps) {
  const title = homeCard(id)?.title ?? id
  const link = editing ? null : headerLink(id, facts, actions)
  return (
    <section className={editing ? 'home-card home-card--editing' : 'home-card'}>
      <div className="home-card__head">
        <h3 className="home-card__title">{title}</h3>
        {editing ? (
          <button
            type="button"
            className="home-card__remove"
            aria-label={`Remove ${title}`}
            onClick={() => onRemove(id)}
          >
            <Icon name="X" size={14} />
          </button>
        ) : (
          link
        )}
      </div>
      <div className="home-card__body">
        <CardBody
          id={id}
          columns={columns}
          data={data}
          facts={facts}
          actions={actions}
        />
      </div>
    </section>
  )
}

function headerLink(
  id: string,
  facts: HomeFacts,
  actions: HomeActions,
): ReactNode {
  if (id === 'library-by-genre' && facts.totalTrackCount > 0) {
    return (
      <button
        type="button"
        className="link-btn"
        onClick={() => actions.onOpenAllTracks(null)}
      >
        {count(facts.totalTrackCount)} tracks
      </button>
    )
  }
  return null
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="home-empty">{children}</p>
}

function CardBody({
  id,
  columns,
  data,
  facts,
  actions,
}: {
  id: string
  columns: number
  data: HomeData
  facts: HomeFacts
  actions: HomeActions
}) {
  switch (id) {
    case 'needs-you':
      return <NeedsYou data={data} facts={facts} actions={actions} />
    case 'recently-played': {
      if (data.recentlyPlayed === null) return null
      if (data.recentlyPlayed.length === 0)
        return <Empty>Nothing played yet</Empty>
      const now = new Date()
      return (
        <HomeTrackRows
          table="home:recently-played"
          tracks={data.recentlyPlayed}
          last={(track) => playedLabel(track.played_at, now)}
          onPlay={actions.onPlay}
          onAddToPlaylist={actions.onAddToPlaylist}
          onMoveToFolder={actions.onMoveToFolder}
        />
      )
    }
    case 'upcoming-gigs':
      if (data.gigs === null) return null
      if (data.gigs.length === 0) return <Empty>No upcoming gigs</Empty>
      return (
        <div className="home-list">
          {data.gigs.map((gig) => {
            const day = gigDay(gig.date)
            const where = gigWhere(gig)
            return (
              <button
                key={`${gig.nameKey}\n${gig.eventId}`}
                type="button"
                className="home-gig"
                onClick={() => actions.onOpenDj(gig.displayName)}
              >
                <span className="home-gig__date">
                  {day?.day}
                  <small>{day?.month}</small>
                </span>
                <span className="home-gig__text">
                  <span className="home-gig__line">{gigLine(gig)}</span>
                  {where && <span className="home-gig__where">{where}</span>}
                </span>
              </button>
            )
          })}
        </div>
      )
    case 'library-by-genre': {
      if (data.groups === null) return null
      const tiles = homeGenreTiles(data.groups)
      if (tiles.length === 0) return <Empty>No genres yet</Empty>
      return (
        <div className="home-genres">
          {tiles.map((tile) => (
            <button
              key={tile.key}
              type="button"
              className="home-genre"
              style={{ background: tile.colour }}
              onClick={() => actions.onOpenAllTracks(tile.filter)}
            >
              <span className="home-genre__name">{tile.name}</span>
              <span className="home-genre__count">{tile.count}</span>
            </button>
          ))}
        </div>
      )
    }
    case 'playlists': {
      const playlists = userPlaylists(facts.playlists)
      if (playlists.length === 0) return <Empty>No playlists yet</Empty>
      return (
        <div className="home-playlists">
          {playlists.map((playlist) => (
            <div key={playlist.id} className="home-playlist">
              <button
                type="button"
                className="home-playlist__open"
                onClick={() => actions.onOpenPlaylist(playlist.id)}
              >
                <span
                  className="home-playlist__cover"
                  style={{ background: playlistGradient(playlist.name) }}
                />
                <span className="home-playlist__text">
                  <span className="home-playlist__name">{playlist.name}</span>
                  <span className="home-playlist__count">
                    {count(playlist.track_count)}{' '}
                    {playlist.track_count === 1 ? 'track' : 'tracks'}
                  </span>
                </span>
              </button>
              {playlist.track_count > 0 && (
                <button
                  type="button"
                  className="home-playlist__play"
                  aria-label={`Play ${playlist.name}`}
                  onClick={() => actions.onPlayPlaylist(playlist.id)}
                >
                  <Icon name="Play" size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      )
    }
    case 'library-stats': {
      if (facts.totalTrackCount === 0) return <Empty>No tracks yet</Empty>
      const stats = libraryStats(columns, {
        tracks: facts.totalTrackCount,
        playlists: userPlaylists(facts.playlists).length,
        folders: facts.folderCount,
        addedLately: data.groups?.addedRecently ?? null,
        neverPlayed: data.groups?.neverPlayed ?? null,
      })
      if (stats.figures.length === 1) {
        const [tracks] = stats.figures
        return (
          <div className="home-stat">
            <span className="home-big">{tracks.value}</span>
            <span className="home-sub">
              {[tracks.label, stats.line].filter(Boolean).join(' · ')}
            </span>
          </div>
        )
      }
      return (
        <div className="home-stat">
          <span className="home-figures">
            {stats.figures.map((figure) => (
              <span key={figure.label} className="home-figure">
                <span className="home-big">{figure.value}</span>
                <span className="home-sub">{figure.label}</span>
              </span>
            ))}
          </span>
          {stats.line && <span className="home-sub">{stats.line}</span>}
        </div>
      )
    }
    case 'not-analyzed': {
      const ids = data.withoutBpm
      if (ids === null) return null
      if (ids.length === 0) return <Empty>Everything is analyzed</Empty>
      return (
        <div className="home-stat home-stat--action">
          <span className="home-stat__figure">
            <span className="home-big home-big--accent">
              {count(ids.length)}
            </span>
            <span className="home-sub">no BPM yet</span>
          </span>
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => actions.onAnalyzeTracks(ids)}
          >
            Analyze all
          </button>
        </div>
      )
    }
    case 'quick-actions':
      return (
        <div className="home-actions">
          <QuickAction
            icon="FolderPlus"
            label="Import folder"
            onClick={actions.onImportFolder}
          />
          <QuickAction
            icon="AudioWaveform"
            label="Analyze all"
            // Before Home has read them, there is nothing to send yet.
            onClick={() => data.withoutBpm && actions.onAnalyzeTracks(data.withoutBpm)}
          />
          <QuickAction
            icon="Radio"
            label="Open Sets"
            onClick={actions.onOpenSets}
          />
          <QuickAction
            icon="ListPlus"
            label="New playlist"
            onClick={actions.onCreatePlaylist}
          />
        </div>
      )
    default:
      return null
  }
}

function QuickAction({
  icon,
  label,
  onClick,
}: {
  icon: IconName
  label: string
  onClick: () => void
}) {
  return (
    <button type="button" className="home-action" onClick={onClick}>
      <Icon name={icon} size={16} />
      {label}
    </button>
  )
}

function NeedsYou({
  data,
  facts,
  actions,
}: {
  data: HomeData
  facts: HomeFacts
  actions: HomeActions
}) {
  if (data.gigs === null || data.withoutBpm === null) return null
  const withoutBpm = data.withoutBpm
  const rows = needsYouRows({
    spotify: facts.spotify,
    youtubeMusic: facts.youtubeMusic,
    notAnalyzed: withoutBpm.length,
    nextGig: data.gigs[0] ?? null,
    today: data.today,
  })
  if (rows.length === 0) return <Empty>Nothing new</Empty>

  const open = (row: NeedsYouRow) => {
    switch (row.kind) {
      case 'spotify':
      case 'youtube-music':
        actions.onOpenStreamList(row.kind, row.listId)
        break
      case 'not-analyzed':
        actions.onAnalyzeTracks(withoutBpm)
        break
      case 'next-gig':
        actions.onOpenDj(row.djName)
        break
    }
  }

  return (
    <div className="home-list">
      {rows.map((row) => (
        <button
          key={row.kind}
          type="button"
          className={`home-news home-news--${row.kind}`}
          onClick={() => open(row)}
        >
          <span className="home-news__number">{row.number}</span>
          <span className="home-news__text">{row.text}</span>
          <span className="home-news__place">
            <span className="home-news__place-name">{row.place}</span>
            <Icon name="ChevronRight" size={12} />
          </span>
        </button>
      ))}
    </div>
  )
}
