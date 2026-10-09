import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../Icon'
import { useDjSearch } from '../dj/useDjSearch'
import { CustomizeSections } from '../search/CustomizeSections'
import { SearchSections } from '../search/SearchSections'
import { sectionsEmpty } from '../search/sectionContent'
import { useSectionsData } from '../search/useSectionsData'
import { djHue } from '../../lib/search/labels'
import { forgetSearch, rememberSearch } from '../../lib/search/recentSearches'
import {
  loadRecentSearches,
  loadSectionPrefs,
  saveRecentSearches,
  saveSectionPrefs,
} from '../../lib/search/storage'
import type { SectionPref } from '../../lib/search/sections'
import type { TrackFilter } from '../../lib/trackTable/filter'
import type { SpotifyData } from '../spotify/useSpotify'
import type { Track, Playlist } from '../../types/track'
import { PlaylistCover } from '../PlaylistCover'
import './SearchView.css'

/** A query is remembered when it stays unchanged this long while it has results. */
const REMEMBER_AFTER_MS = 2000

// Reuse the same gradient helper as HomeView (copied — do not import from HomeView)
function getPlaylistGradient(name: string): string {
  const gradients = [
    'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
    'linear-gradient(135deg, #ec4899 0%, #f43f5e 100%)',
    'linear-gradient(135deg, #14b8a6 0%, #0ea5e9 100%)',
    'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
    'linear-gradient(135deg, #22c55e 0%, #14b8a6 100%)',
    'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
    'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)',
    'linear-gradient(135deg, #f97316 0%, #eab308 100%)',
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff
  }
  return gradients[Math.abs(hash) % gradients.length]
}

interface SearchViewProps {
  tracks: Track[]
  playlists: Playlist[]
  onTrackPlay: (track: Track, tracks: Track[], index: number) => void
  onPlaylistSelect: (id: number) => void
  /** Held by App, so Back from a DJ page finds the same query and results. */
  query: string
  onQueryChange: (query: string) => void
  /** Opens a DJ page from the DJs row; a Spotify card passes its artist id. */
  onOpenDj: (name: string, spotifyArtistId: string | null) => void
  /** App's Spotify data: whether to ask Spotify, and the index "you own N" is counted with. */
  spotify: SpotifyData
  /** Opens All Tracks with this filter (a genre tile). */
  onOpenAllTracks: (filter: TrackFilter) => void
  /** Opens a saved set in Sets. */
  onOpenSet: (videoId: string) => void
  /** Raised after each play: Recently played reads again. */
  playVersion: number
}

export function SearchView({
  tracks,
  playlists,
  onTrackPlay,
  onPlaylistSelect,
  query,
  onQueryChange,
  onOpenDj,
  spotify,
  onOpenAllTracks,
  onOpenSet,
  playVersion,
}: SearchViewProps) {
  const djCards = useDjSearch(query, spotify)
  const [prefs, setPrefs] = useState<SectionPref[]>(loadSectionPrefs)
  const [customizing, setCustomizing] = useState(false)
  const [recentSearches, setRecentSearches] = useState<string[]>(loadRecentSearches)
  const customizeButton = useRef<HTMLButtonElement>(null)
  const shownSections = useMemo(
    () => prefs.filter((pref) => pref.on).map((pref) => pref.id),
    [prefs],
  )

  const filteredTracks = useMemo(() => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    return tracks.filter(t =>
      [t.title, t.artist, t.album, t.genre].some(f => f?.toLowerCase().includes(q))
    )
  }, [tracks, query])

  const filteredPlaylists = useMemo(() => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    // Every playlist but a folder: manual and AI-made ('ai_generated') alike
    return playlists.filter(p =>
      p.playlist_type !== 'folder' &&
      p.name.toLowerCase().includes(q)
    )
  }, [playlists, query])

  const hasResults = djCards.length > 0 || filteredTracks.length > 0 || filteredPlaylists.length > 0
  const hasQuery = query.trim().length > 0
  // Not read while results show; read again when the field is cleared.
  const sectionsData = useSectionsData(shownSections, playVersion, !hasQuery)

  // Kept on this machine as the list changes.
  useEffect(() => {
    saveRecentSearches(recentSearches)
  }, [recentSearches])

  // Search spec, Recent searches: a query is remembered when one of its
  // results is opened or played, or when it rests 2 seconds with results.
  function rememberQuery() {
    setRecentSearches((list) => rememberSearch(list, query))
  }

  useEffect(() => {
    if (!query.trim() || !hasResults) return
    const timer = window.setTimeout(() => {
      setRecentSearches((list) => rememberSearch(list, query))
    }, REMEMBER_AFTER_MS)
    return () => window.clearTimeout(timer)
  }, [query, hasResults])

  // Done and Cancel give the focus back to the button that opened Customize.
  function closeCustomize() {
    setCustomizing(false)
    customizeButton.current?.focus()
  }

  function saveSections(next: SectionPref[]) {
    setPrefs(next)
    saveSectionPrefs(next)
    closeCustomize()
  }

  // Format duration from ms to MM:SS
  function formatDuration(ms?: number) {
    if (!ms) return '--:--'
    const minutes = Math.floor(ms / 60000)
    const seconds = Math.floor((ms % 60000) / 1000)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  function formatKey(key?: string) {
    return key ?? '—'
  }

  return (
    <div className="search-view">
      {/* Prominent search input: it stays put while what is under it scrolls */}
      <div className="search-view__top">
        <div className="search-view__input-wrapper">
          <Icon name="Search" size={20} className="search-view__input-icon" />
          <input
            type="text"
            className="search-view__input"
            placeholder="Search tracks, playlists, artists..."
            data-page-search
            value={query}
            onChange={(e) => {
              // Typing leaves Customize unsaved, as Cancel does.
              setCustomizing(false)
              onQueryChange(e.target.value)
            }}
            autoFocus
          />
          {query ? (
            <button className="search-view__input-clear" onClick={() => onQueryChange('')} type="button">
              <Icon name="X" size={16} />
            </button>
          ) : (
            <button
              ref={customizeButton}
              className="search-view__input-clear"
              onClick={() => setCustomizing((open) => !open)}
              type="button"
              aria-label="Customize Search"
              aria-pressed={customizing}
              title="Customize Search"
            >
              <Icon name="SlidersHorizontal" size={16} />
            </button>
          )}
        </div>
      </div>

      {/* No query: the sections, scrolling under the field as one page */}
      {!hasQuery && (
        <div className="search-view__home">
          {customizing ? (
            <CustomizeSections
              prefs={prefs}
              onDone={saveSections}
              onCancel={closeCustomize}
            />
          ) : sectionsData === null ? null : sectionsEmpty(prefs, sectionsData, recentSearches) ? (
            // An empty library and no history: the page as it was.
            <div className="search-view__empty">
              <Icon name="Search" size={48} className="search-view__empty-icon" />
              <h2 className="search-view__empty-title">Search your library</h2>
              <p className="search-view__empty-subtitle">Find tracks, playlists, artists, and more</p>
            </div>
          ) : (
            <SearchSections
              prefs={prefs}
              data={sectionsData}
              recentSearches={recentSearches}
              onSearch={onQueryChange}
              onForgetSearch={(q) => setRecentSearches((list) => forgetSearch(list, q))}
              onClearSearches={() => setRecentSearches([])}
              onPlay={onTrackPlay}
              onOpenDj={(name) => onOpenDj(name, null)}
              onOpenFilter={onOpenAllTracks}
              onOpenSet={onOpenSet}
            />
          )}
        </div>
      )}

      {/* No results state */}
      {hasQuery && !hasResults && (
        <div className="search-view__empty">
          <Icon name="SearchX" size={48} className="search-view__empty-icon" />
          <h2 className="search-view__empty-title">No results for "{query}"</h2>
          <p className="search-view__empty-subtitle">Try a different search term</p>
        </div>
      )}

      {/* Results: the DJs, the playlists and the Tracks heading stay put; only the track rows scroll */}
      {hasQuery && hasResults && (
        <div className="search-view__results">

          {/* DJs: the ones the user knows, then Spotify's — each opens a DJ page */}
          {djCards.length > 0 && (
            <div className="search-view__section">
              <div className="search-view__section-header">
                <h3 className="search-view__section-title">DJs</h3>
                <span className="search-view__section-count">{djCards.length}</span>
              </div>
              <div className="search-view__card-row">
                {djCards.map((dj) => (
                  <button
                    key={dj.key}
                    type="button"
                    className="search-view__dj-card"
                    onClick={() => {
                      rememberQuery()
                      onOpenDj(dj.name, dj.spotifyArtistId)
                    }}
                  >
                    <span
                      className="search-view__dj-photo"
                      style={dj.imageUrl ? undefined : { filter: `hue-rotate(${djHue(dj.name)}deg)` }}
                    >
                      {dj.imageUrl ? (
                        <img src={dj.imageUrl} alt="" loading="lazy" />
                      ) : (
                        <span className="search-view__dj-initial">{dj.name.charAt(0).toUpperCase()}</span>
                      )}
                    </span>
                    <span className="search-view__dj-name">{dj.name}</span>
                    <span className="search-view__dj-subtitle">{dj.subtitle}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Playlists: a row of small cards, above the tracks, so nothing sits below the rows */}
          {filteredPlaylists.length > 0 && (
            <div className="search-view__section">
              <div className="search-view__section-header">
                <h3 className="search-view__section-title">Playlists</h3>
                <span className="search-view__section-count">{filteredPlaylists.length}</span>
              </div>
              <div className="search-view__card-row">
                {filteredPlaylists.map((playlist) => (
                  <button
                    key={playlist.id}
                    className="search-view__playlist-card"
                    onClick={() => {
                      rememberQuery()
                      onPlaylistSelect(playlist.id)
                    }}
                    type="button"
                  >
                    <PlaylistCover
                      playlist={playlist}
                      className="search-view__playlist-art"
                      fallback={getPlaylistGradient(playlist.name)}
                    >
                      <Icon name="Music" size={20} style={{ color: 'rgba(255,255,255,0.7)' }} />
                    </PlaylistCover>
                    <span className="search-view__playlist-text">
                      <span className="search-view__dj-name">{playlist.name}</span>
                      <span className="search-view__dj-subtitle">{playlist.track_count} tracks</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tracks: the heading stays, the rows scroll in their own area */}
          {filteredTracks.length > 0 && (
            <div className="search-view__section search-view__section--tracks">
              <div className="search-view__section-header">
                <h3 className="search-view__section-title">Tracks</h3>
                <span className="search-view__section-count">{filteredTracks.length}</span>
              </div>
              <div className="search-view__track-list">
                {filteredTracks.map((track, index) => (
                  <div
                    key={track.id}
                    className="search-view__track-row"
                    onDoubleClick={() => {
                      rememberQuery()
                      onTrackPlay(track, filteredTracks, index)
                    }}
                  >
                    <div className="search-view__track-index">
                      <span className="search-view__track-number">{index + 1}</span>
                      <span className="search-view__track-play">
                        <Icon name="Play" size={13} />
                      </span>
                    </div>
                    <div className="search-view__track-title-cell">
                      <span className="search-view__track-title">{track.title || 'Untitled'}</span>
                      <span className="search-view__track-artist">{track.artist || 'Unknown Artist'}</span>
                    </div>
                    <span className="search-view__track-bpm">{track.bpm ? track.bpm.toFixed(1) : '—'}</span>
                    <span className="search-view__track-key">{formatKey(track.musical_key)}</span>
                    <span className="search-view__track-genre">{track.genre || '—'}</span>
                    <span className="search-view__track-duration">{formatDuration(track.duration_ms)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  )
}
