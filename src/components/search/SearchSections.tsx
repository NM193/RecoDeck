// src/components/search/SearchSections.tsx
// The Search page before you type (Search spec, Sections): the switched-on
// sections in the chosen order. A section with nothing to show is left out.
import { useEffect, useState, type ReactNode } from 'react'
import { Icon } from '../Icon'
import { TrackCover } from '../track-table/TrackCover'
import { getTrackArtworkUrl } from '../../lib/artworkCache'
import {
  daysAgoLabel,
  djHue,
  djInitials,
  djLine,
} from '../../lib/search/labels'
import type { SearchSectionId, SectionPref } from '../../lib/search/sections'
import type { TrackFilter } from '../../lib/trackTable/filter'
import type { Track } from '../../types/track'
import { genreTiles, hasContent } from './sectionContent'
import type { SectionsData } from './useSectionsData'
import { HoverGlide } from '../HoverGlide'
import './SearchSections.css'

export interface SectionActions {
  /** Runs a recent search again. */
  onSearch: (query: string) => void
  onForgetSearch: (query: string) => void
  onClearSearches: () => void
  onPlay: (track: Track, list: Track[], index: number) => void
  onOpenDj: (name: string) => void
  /** Opens All Tracks with this filter. */
  onOpenFilter: (filter: TrackFilter) => void
  onOpenSet: (videoId: string) => void
}

interface SearchSectionsProps extends SectionActions {
  prefs: SectionPref[]
  data: SectionsData
  recentSearches: string[]
}

export function SearchSections({
  prefs,
  data,
  recentSearches,
  ...actions
}: SearchSectionsProps) {
  return (
    <div className="search-sections">
      {prefs
        .filter((pref) => pref.on && hasContent(pref.id, data, recentSearches))
        .map((pref) => (
          <Section
            key={pref.id}
            id={pref.id}
            data={data}
            recentSearches={recentSearches}
            {...actions}
          />
        ))}
    </div>
  )
}

function Section({
  id,
  data,
  recentSearches,
  ...actions
}: {
  id: SearchSectionId
  data: SectionsData
  recentSearches: string[]
} & SectionActions) {
  switch (id) {
    case 'recent-searches':
      return (
        <SectionFrame
          title="Recent searches"
          action={
            <button
              type="button"
              className="link-btn"
              onClick={actions.onClearSearches}
            >
              Clear
            </button>
          }
        >
          <div className="search-chips">
            {recentSearches.map((query) => (
              <span key={query} className="search-chip">
                <button
                  type="button"
                  className="search-chip__run"
                  onClick={() => actions.onSearch(query)}
                >
                  {query}
                </button>
                <button
                  type="button"
                  className="search-chip__x"
                  aria-label={`Remove ${query}`}
                  onClick={() => actions.onForgetSearch(query)}
                >
                  <Icon name="X" size={12} />
                </button>
              </span>
            ))}
          </div>
        </SectionFrame>
      )
    case 'recently-played':
      return (
        <SectionFrame title="Recently played">
          <HoverGlide className="search-tiles" item=".search-tile" kind="card">
            {data.recentlyPlayed.map((track, index) => (
              <TrackTile
                key={track.id}
                track={track}
                onPlay={() => actions.onPlay(track, data.recentlyPlayed, index)}
              />
            ))}
          </HoverGlide>
        </SectionFrame>
      )
    case 'your-djs':
      return (
        <SectionFrame title="Your DJs">
          <HoverGlide className="search-djs" item=".search-dj" kind="card">
            {data.djs.map((dj) => {
              const line = djLine(dj, data.today)
              return (
                <button
                  key={dj.nameKey}
                  type="button"
                  className="search-dj"
                  onClick={() => actions.onOpenDj(dj.displayName)}
                >
                  <span
                    className="search-dj__photo"
                    style={
                      dj.imageUrl
                        ? undefined
                        : { filter: `hue-rotate(${djHue(dj.displayName)}deg)` }
                    }
                  >
                    {dj.imageUrl ? (
                      <img
                        src={dj.imageUrl}
                        alt=""
                        loading="lazy"
                        draggable={false}
                      />
                    ) : (
                      <span className="search-dj__initials">
                        {djInitials(dj.displayName)}
                      </span>
                    )}
                  </span>
                  <span className="search-dj__name">{dj.displayName}</span>
                  {line && <span className="search-dj__line">{line}</span>}
                </button>
              )
            })}
          </HoverGlide>
        </SectionFrame>
      )
    case 'genres':
      return (
        <SectionFrame title="Your library by genre">
          <div className="search-genres">
            {genreTiles(data).map((tile) => (
              <button
                key={tile.key}
                type="button"
                className="search-genre"
                style={{ background: tile.colour }}
                onClick={() => actions.onOpenFilter(tile.filter)}
              >
                <span className="search-genre__name">{tile.name}</span>
                <span className="search-genre__count">{tile.count}</span>
              </button>
            ))}
          </div>
        </SectionFrame>
      )
    case 'recently-added':
      return (
        <SectionFrame title="Recently added">
          <HoverGlide className="search-rows" item=".search-row" kind="row">
            {data.recentlyAdded.map((track, index) => (
              <button
                key={track.id}
                type="button"
                className="search-row"
                onClick={() => actions.onPlay(track, data.recentlyAdded, index)}
              >
                <TrackCover
                  key={`${track.id}\n${track.file_path}`}
                  track={track}
                />
                <span className="search-row__text">
                  <span className="search-row__title">
                    {track.title || 'Untitled'}
                  </span>
                  <span className="search-row__sub">
                    {track.artist || 'Unknown Artist'}
                  </span>
                </span>
                <span className="search-row__meta">
                  {daysAgoLabel(track.date_added, new Date())}
                </span>
              </button>
            ))}
          </HoverGlide>
        </SectionFrame>
      )
    case 'saved-sets':
      return (
        <SectionFrame title="Sets you saved lately">
          <HoverGlide className="search-rows" item=".search-row" kind="row">
            {data.savedSets.map((set) => (
              <button
                key={set.video_id}
                type="button"
                className="search-row"
                onClick={() => actions.onOpenSet(set.video_id)}
              >
                <span className="search-row__icon">
                  <Icon name="Radio" size={16} />
                </span>
                <span className="search-row__text">
                  <span className="search-row__title">{set.title}</span>
                  {set.channel && (
                    <span className="search-row__sub">{set.channel}</span>
                  )}
                </span>
                <span className="search-row__meta">
                  {daysAgoLabel(set.added_at, new Date())}
                </span>
              </button>
            ))}
          </HoverGlide>
        </SectionFrame>
      )
  }
}

function SectionFrame({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="search-section">
      <div className="search-section__head">
        <h3 className="search-section__title">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

/**
 * A Recently played tile: the file's artwork, else a quiet square with a
 * small music note (the user, 2026-10-04: a large empty square looks broken).
 * The tile is wider than the table's 72px thumbnail, so it shows the full
 * picture, which the now-playing bar caches too.
 */
function TrackTile({ track, onPlay }: { track: Track; onPlay: () => void }) {
  // undefined while it is read, null for none.
  const [art, setArt] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    let current = true
    getTrackArtworkUrl(track.id).then((url) => {
      if (current) setArt(url)
    })
    return () => {
      current = false
    }
  }, [track.id])

  return (
    <button type="button" className="search-tile" onClick={onPlay}>
      <span className="search-tile__art">
        {art ? (
          <img
            className="search-tile__img"
            src={art}
            alt=""
            draggable={false}
          />
        ) : art === null ? (
          <Icon name="Music" size={28} />
        ) : null}
        <span className="search-tile__play" aria-hidden="true">
          <Icon name="Play" size={16} />
        </span>
      </span>
      <span className="search-tile__title">{track.title || 'Untitled'}</span>
      <span className="search-tile__artist">
        {track.artist || 'Unknown Artist'}
      </span>
    </button>
  )
}
