// src/components/views/DjView.tsx
// One DJ's page (the approved mockup's first section): the hero with the
// artist photo, the meta line and the buttons, then the tabs.
import { useMemo, useState } from 'react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { Icon } from '../Icon'
import { SpotifyGlyph } from '../spotify/SpotifyGlyph'
import { useNow } from '../spotify/useNow'
import { useDjPage } from '../dj/useDjPage'
import { DjCandidatesMenu } from '../dj/DjCandidatesMenu'
import { DjSetsTab } from '../dj/DjSetsTab'
import { DjGigsTab } from '../dj/DjGigsTab'
import { cachedOwned } from '../../lib/dj/search'
import { gigLabel, heroMetaParts, localDay, splitGigs } from '../../lib/dj/gigs'
import { djTabs, gigsState, spotifyArtistUrl } from '../../lib/dj/page'
import type { DjTab } from '../../lib/dj/overview'
import type { SpotifyData } from '../spotify/useSpotify'
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
  /** Another DJ's page (Task 16's rows); Back still returns to the first one's origin. */
  onOpenDj: (name: string, spotifyArtistId: string | null) => void
  /** Settings, with its Spotify section open ("Connect Spotify"). */
  onOpenSettings: () => void
}

export function DjView({
  name,
  spotifyArtistId,
  spotify,
  onBack,
  onOpenSets,
  onOpenSettings,
}: DjViewProps) {
  const dj = useDjPage(name, spotifyArtistId)
  const [tab, setTab] = useState<DjTab>('overview')
  /** The overview's editing mode (Task 17), switched on by the sliders button. */
  const [customizing, setCustomizing] = useState(false)

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
  // "You own N", counted as Search's DJ card counts it: Owned only, Yes answers included.
  const owned = useMemo(
    () => cachedOwned(page?.tracks, spotify.index, spotify.library.verdicts),
    [page, spotify.index, spotify.library.verdicts],
  )
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

  return (
    <div className="dj-view">
      <header
        className={`dj-hero${photo ? ' dj-hero--photo' : ''}`}
        style={photo ? { backgroundImage: `url("${photo}")` } : undefined}
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
          <div className="dj-hero__text">
            <div className="dj-hero__kicker">DJ · Producer</div>
            <h1 className="dj-hero__name">{profile?.displayName ?? name}</h1>
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
              onOpen={dj.loadCandidates}
              onPickSpotify={dj.pickSpotify}
              onPickRa={dj.pickRa}
            />
          </div>
        </div>
      </header>

      <nav className="dj-tabs" role="tablist">
        {tabs.map((item) => (
          <button
            type="button"
            role="tab"
            key={item.id}
            aria-selected={tab === item.id}
            className={`dj-tab${tab === item.id ? ' dj-tab--on' : ''}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
            {item.count !== null && <small>{item.count}</small>}
          </button>
        ))}
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
      </nav>

      {dj.loadError && <p className="dj-note dj-note--error">{dj.loadError}</p>}

      <div className="dj-body">
        {/* Overview: Task 17 replaces this placeholder with <DjOverview>. */}
        {tab === 'overview' &&
          (customizing ? (
            <div className="dj-editbar">
              <Icon name="SlidersHorizontal" size={14} />
              Customizing the overview · applies to every DJ page
              <span className="dj-editbar__gap" />
              <button
                type="button"
                className="dj-btn dj-btn--primary"
                onClick={() => setCustomizing(false)}
              >
                Done
              </button>
            </div>
          ) : (
            <p className="dj-note">The overview&apos;s cards come here.</p>
          ))}
        {/* Tracks: Task 16 replaces this placeholder with <DjTracksTab>. */}
        {tab === 'tracks' &&
          (spotify.connected ? (
            <p className="dj-note">
              {page ? `${page.tracks.length} tracks` : 'Reading the tracks…'}
            </p>
          ) : (
            <div className="dj-note">
              Connect Spotify to see their tracks{' '}
              <button type="button" className="dj-btn" onClick={onOpenSettings}>
                Settings → Spotify
              </button>
            </div>
          ))}
        {/* Plays: Task 16 replaces this placeholder with <DjPlaysTab>. */}
        {tab === 'plays' && (
          <p className="dj-note">
            {dj.plays
              ? `${dj.plays.length} tracks in their sets`
              : 'Reading their sets…'}
          </p>
        )}
        {tab === 'sets' && (
          <DjSetsTab
            name={profile?.displayName ?? name}
            sets={dj.sets}
            onOpenSet={(videoId) =>
              onOpenSets({ openVideoId: videoId, initialQuery: '' })
            }
            onFindMore={() =>
              onOpenSets({ openVideoId: null, initialQuery: name })
            }
          />
        )}
        {tab === 'gigs' &&
          (page && today ? (
            <DjGigsTab
              state={gigsState(dj.ra, page.gigs.length)}
              upcoming={gigs.upcoming}
              past={gigs.past}
              raUrl={profile?.raUrl ?? null}
            />
          ) : (
            <p className="dj-note">Reading the gigs…</p>
          ))}
      </div>
    </div>
  )
}
