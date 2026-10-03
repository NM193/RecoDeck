// src/components/views/DjView.tsx
// One DJ's page (the approved mockup's first section): the hero with the
// artist photo, the meta line and the buttons, then the tabs.
import { useMemo, useState, type CSSProperties } from 'react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { Icon } from '../Icon'
import { SpotifyGlyph } from '../spotify/SpotifyGlyph'
import { useNow } from '../spotify/useNow'
import { useDjPage } from '../dj/useDjPage'
import { DjCandidatesMenu } from '../dj/DjCandidatesMenu'
import { DjSetsTab } from '../dj/DjSetsTab'
import { DjGigsTab } from '../dj/DjGigsTab'
import { DjTracksTab } from '../dj/DjTracksTab'
import { DjPlaysTab } from '../dj/DjPlaysTab'
import { DjOverview } from '../dj/DjOverview'
import { useOverviewLayout } from '../dj/useOverviewLayout'
import { classifyTracks } from '../../lib/spotify/ownership'
import { asSpotifyTrack, djRows, ownedCount } from '../../lib/dj/tracks'
import { playOwnership } from '../../lib/dj/plays'
import { gigLabel, heroMetaParts, localDay, splitGigs } from '../../lib/dj/gigs'
import { djTabs, gigsState, spotifyArtistUrl } from '../../lib/dj/page'
import { tracksEmptyText, tracksTabState } from '../../lib/dj/tabs'
import { djPhotos } from '../../lib/dj/cards'
import { djKey } from '../../lib/dj/names'
import {
  countByStatus,
  type SpotifyRow,
  type StatusFilter,
} from '../../lib/spotify/rows'
import type { DjTab } from '../../lib/dj/overview'
import type { LibraryTrack } from '../../lib/tracklist/match'
import type { SpotifyData } from '../spotify/useSpotify'
import type { Track } from '../../types/track'
import type { Verdict } from '../../types/spotify'
import './DjView.css'

interface DjViewProps {
  /** The name as it was clicked; the page's key is djKey(name). */
  name: string
  /** From a Spotify search card: stored as the manual match on opening. */
  spotifyArtistId: string | null
  /** App's Spotify data: the shared library index, verdicts, connection. */
  spotify: SpotifyData
  /** Back to where the first DJ page was opened from (Search or Sets). */
  onBack: () => void
  /** Sets, arriving on a set or with the Set tab's box filled in. */
  onOpenSets: (start: {
    openVideoId: string | null
    initialQuery: string
  }) => void
  /** Another DJ's page (a gig's lineup); Back still returns to the first one's origin. */
  onOpenDj: (name: string, spotifyArtistId: string | null) => void
  /** Settings, with its Spotify section open ("Connect Spotify"). */
  onOpenSettings: () => void
  /** App's player: double-clicking an Owned row plays its library file. */
  onPlayTrack: (track: Track, queue: Track[], index: number) => void
}

/** The tab a key moves to (arrows wrap, Home / End), or null for other keys. */
function tabKeyTarget(key: string, at: number, count: number): number | null {
  if (key === 'ArrowRight') return (at + 1) % count
  if (key === 'ArrowLeft') return (at - 1 + count) % count
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  return null
}

export function DjView({
  name,
  spotifyArtistId,
  spotify,
  onBack,
  onOpenSets,
  onOpenDj,
  onOpenSettings,
  onPlayTrack,
}: DjViewProps) {
  const dj = useDjPage(name, spotifyArtistId)
  const overview = useOverviewLayout()
  const [tab, setTab] = useState<DjTab>('overview')
  /** The overview's editing mode, switched on by the sliders button. */
  const [customizing, setCustomizing] = useState(false)
  /** The chip the Tracks tab opens on: Missing from the overview's Missing card. */
  const [tracksFilter, setTracksFilter] = useState<StatusFilter>('all')

  // Gigs are upcoming or past by the local day; the clock is read in a timer.
  const now = useNow(60_000)
  const today = now === null ? null : localDay(new Date(now))

  const page = dj.page
  const profile = page?.profile ?? null
  const gigs = useMemo(
    () =>
      page && today ? splitGigs(page.gigs, today) : { upcoming: [], past: [] },
    [page, today],
  )
  // One classification for the Tracks tab, the hero's "You own N" and (Task 17) the overview:
  // the shared library index, Maybe's Yes / No answers included.
  const trackRows = useMemo(() => {
    const tracks = page?.tracks ?? []
    return djRows(
      tracks,
      classifyTracks(
        tracks.map(asSpotifyTrack),
        spotify.index,
        spotify.library.verdicts,
      ),
    )
  }, [page, spotify.index, spotify.library.verdicts])
  // Counted as Search's DJ card counts it (cachedOwned): Owned only, and no
  // number while the library index is still empty (everything would read Missing).
  const owned =
    trackRows.length > 0 && spotify.index.entries.length > 0
      ? ownedCount(trackRows)
      : null
  const trackCounts = useMemo(() => countByStatus(trackRows), [trackRows])
  // Plays: the same matcher, no verdicts (they are keyed by Spotify track id).
  const playsOwnership = useMemo(
    () =>
      new Map(
        (dj.plays ?? []).map((play) => [
          play.key,
          playOwnership(play, spotify.index),
        ]),
      ),
    [dj.plays, spotify.index],
  )
  // The Gigs tab and the overview's gig cards; null until the page and the day are known.
  const gigList =
    page && today
      ? { state: gigsState(dj.ra, page.gigs.length), ...gigs }
      : null
  const connected = spotify.status === null ? null : spotify.connected
  const answer = (row: SpotifyRow, verdict: Verdict) =>
    row.ownership.file
      ? spotify.setVerdict(row.track.spotifyId, row.ownership.file.id, verdict)
      : Promise.resolve()

  // The player wants full Tracks: look the matched files up in the loaded library.
  const tracksById = useMemo(
    () => new Map(spotify.libraryTracks.map((track) => [track.id, track])),
    [spotify.libraryTracks],
  )
  const playFiles = (files: LibraryTrack[], index: number) => {
    const queue = files.flatMap((file) => {
      const track = tracksById.get(file.id)
      return track ? [track] : []
    })
    const first = files[index] ? tracksById.get(files[index].id) : undefined
    const at = first ? queue.indexOf(first) : -1
    if (at >= 0) onPlayTrack(queue[at], queue, at)
  }
  const checking = !spotify.libraryLoaded

  const meta = heroMetaParts({
    owned,
    tracks: page && page.tracks.length > 0 ? page.tracks.length : null,
    sets: dj.sets?.length ?? 0,
    nextGig:
      gigs.upcoming.length > 0 && today
        ? gigLabel(gigs.upcoming[0].date, today)
        : null,
  })
  const tabs = djTabs({
    tracks: page ? page.tracks.length : null,
    plays: dj.plays?.length ?? null,
    sets: dj.sets?.length ?? null,
    gigs: page && today ? gigs.upcoming.length : null,
  })

  const photo = profile?.spotifyImageUrl ?? null
  const displayName = profile?.displayName ?? name

  // A tab, or a card title leading to one. Leaving the overview ends customizing (unsaved).
  const openTab = (next: DjTab, filter: StatusFilter = 'all') => {
    setTab(next)
    setTracksFilter(filter)
    if (next !== 'overview') setCustomizing(false)
  }
  const openSet = (videoId: string) =>
    onOpenSets({ openVideoId: videoId, initialQuery: '' })
  // A lineup name: that DJ's page, matched on Spotify by name as from a Sets chip.
  const openDj = (other: string) => onOpenDj(other, null)

  return (
    <div className="dj-view">
      <header
        className={`dj-hero${photo ? ' dj-hero--photo' : ''}`}
        style={
          photo
            ? ({ '--dj-photo': `url("${photo}")` } as CSSProperties)
            : undefined
        }
      >
        <button
          type="button"
          className="dj-hero__back"
          onClick={onBack}
          title="Back"
        >
          <Icon name="ArrowLeft" size={16} />
          Back
        </button>
        <div className="dj-hero__in">
          {photo && <img className="dj-hero__portrait" src={photo} alt="" />}
          <div className="dj-hero__text">
            <div className="dj-hero__kicker">DJ · Producer</div>
            <h1 className="dj-hero__name">{displayName}</h1>
            {meta.length > 0 && (
              <div className="dj-hero__meta">
                {meta.map((part, i) => (
                  <span key={part.bold}>
                    {i > 0 && ' · '}
                    {part.lead}
                    <b>{part.bold}</b>
                    {part.tail}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="dj-hero__acts">
            <button
              type="button"
              className={`dj-btn${dj.watched ? ' dj-btn--on' : ''}`}
              disabled={dj.watched === null}
              onClick={dj.toggleWatch}
              title={
                dj.watched
                  ? 'Stop watching for new sets'
                  : 'Look for new sets of this DJ on YouTube'
              }
            >
              <Icon name={dj.watched ? 'BellRing' : 'Bell'} size={14} />
              {dj.watched ? 'Watching' : 'Watch for sets'}
            </button>
            {profile?.spotifyArtistId && (
              <button
                type="button"
                className="dj-btn"
                title="Open on Spotify"
                onClick={() => {
                  if (profile.spotifyArtistId)
                    void openUrl(spotifyArtistUrl(profile.spotifyArtistId))
                }}
              >
                <SpotifyGlyph
                  size={14}
                  style={{ color: 'var(--color-success)' }}
                />
                Spotify
              </button>
            )}
            {profile && (
              <button
                type="button"
                className="dj-btn"
                title="Open on Resident Advisor"
                onClick={() => void openUrl(profile.raUrl)}
              >
                <Icon name="ExternalLink" size={14} />
                RA
              </button>
            )}
            <DjCandidatesMenu
              candidates={dj.candidates}
              loading={dj.candidatesLoading}
              error={dj.candidatesError}
              spotifyArtistId={profile?.spotifyArtistId ?? null}
              raArtistId={profile?.raArtistId ?? null}
              spotifyManual={profile?.spotifyManual ?? false}
              raManual={profile?.raManual ?? false}
              spotifyConnected={spotify.connected}
              onOpen={dj.loadCandidates}
              onPickSpotify={dj.pickSpotify}
              onPickRa={dj.pickRa}
            />
          </div>
        </div>
      </header>

      <div className="dj-tabs-row">
        <div className="dj-tabs" role="tablist" aria-label="DJ page">
          {tabs.map((item, i) => (
            <button
              type="button"
              role="tab"
              key={item.id}
              id={`dj-tab-${item.id}`}
              aria-controls="dj-panel"
              aria-selected={tab === item.id}
              tabIndex={tab === item.id ? 0 : -1}
              className={`dj-tab${tab === item.id ? ' dj-tab--on' : ''}`}
              onClick={() => openTab(item.id)}
              onKeyDown={(event) => {
                const next = tabKeyTarget(event.key, i, tabs.length)
                if (next === null) return
                event.preventDefault()
                const id = tabs[next].id
                openTab(id)
                document.getElementById(`dj-tab-${id}`)?.focus()
              }}
            >
              {item.label}
              {item.count !== null && <small>{item.count}</small>}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={`dj-tabs__customize${customizing ? ' dj-tabs__customize--on' : ''}`}
          title="Customize overview"
          aria-label="Customize overview"
          aria-pressed={customizing}
          onClick={() => {
            setTab('overview')
            setCustomizing(true)
          }}
        >
          <Icon name="SlidersHorizontal" size={16} />
        </button>
      </div>

      {dj.loadError && <p className="dj-note dj-note--error">{dj.loadError}</p>}

      <div
        className="dj-body"
        role="tabpanel"
        id="dj-panel"
        aria-labelledby={`dj-tab-${tab}`}
      >
        {tab === 'overview' && (
          <DjOverview
            ids={overview.ids}
            customizing={customizing}
            onDone={(ids) => {
              overview.save(ids)
              setCustomizing(false)
            }}
            data={{
              name: displayName,
              pageKey: djKey(name),
              gigs: gigList,
              raUrl: profile?.raUrl ?? null,
              tracksState: tracksTabState({
                connected,
                loaded: page !== null,
                tracks: trackRows.length,
                spotify: dj.spotify,
              }),
              tracksEmpty: tracksEmptyText(
                dj.spotify,
                Boolean(profile?.spotifyArtistId),
              ),
              rows: trackRows,
              trackCounts,
              sets: dj.sets,
              plays: dj.plays,
              playsOwnership,
              photos: djPhotos(profile),
              checking,
            }}
            actions={{
              onVerdict: answer,
              onPlayFiles: playFiles,
              onOpenSettings,
              onOpenSet: openSet,
              onOpenDj: openDj,
            }}
            onOpenTab={openTab}
          />
        )}
        {tab === 'tracks' && (
          <DjTracksTab
            connected={connected}
            page={page}
            rows={trackRows}
            spotify={dj.spotify}
            progress={dj.progress}
            loadingOlder={dj.loadingOlder}
            onLoadOlder={dj.loadOlder}
            checking={checking}
            onVerdict={answer}
            onPlayFiles={playFiles}
            onOpenSettings={onOpenSettings}
            initialFilter={tracksFilter}
          />
        )}
        {tab === 'plays' && (
          <DjPlaysTab
            name={displayName}
            sets={dj.sets?.length ?? null}
            plays={dj.plays}
            ownership={playsOwnership}
            checking={checking}
            onPlayFiles={playFiles}
          />
        )}
        {tab === 'sets' && (
          <DjSetsTab
            name={displayName}
            sets={dj.sets}
            onOpenSet={openSet}
            onFindMore={() =>
              onOpenSets({ openVideoId: null, initialQuery: name })
            }
          />
        )}
        {tab === 'gigs' &&
          (gigList ? (
            <DjGigsTab
              state={gigList.state}
              upcoming={gigList.upcoming}
              past={gigList.past}
              raUrl={profile?.raUrl ?? null}
              pageKey={djKey(name)}
              onOpenDj={openDj}
            />
          ) : (
            <p className="dj-note">Reading the gigs…</p>
          ))}
      </div>
    </div>
  )
}
