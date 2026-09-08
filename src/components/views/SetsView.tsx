import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { Icon } from '../Icon'
import { SetTimeline } from './SetTimeline'
import { tauriApi } from '../../lib/tauri-api'
import { analyse, type Track, type TracklistResult } from '../../lib/tracklist'
import { matchTracklist, type LibraryMatch, type MatchSummary } from '../../lib/tracklist/match'
import { playerPageUrl, watchUrl } from '../../lib/youtubeWindow'
import type { Track as LibraryTrack } from '../../types/track'
import { getErrorMessage } from '../../types/ai'
import type { RawSet, SavedTrack, YouTubeQuotaStatus, YtSetSummary } from '../../types/youtube'
import './SetsView.css'

type Tab = 'set' | 'library' | 'saved'

/** The escape hatch: the user's own browser, with their account and history. */
function openInBrowser(url: string, cueMs = 0) {
  void openUrl(watchUrl(url, cueMs))
}

function statusLabel(result: TracklistResult): { text: string; kind: string } {
  switch (result.status) {
    case 'ok':
      return {
        text: `${result.sourceCount} ${result.sourceCount === 1 ? 'list' : 'lists'} found`,
        kind: 'ok',
      }
    case 'assembled':
      return { text: 'assembled from comments', kind: 'assembled' }
    case 'low_confidence':
      return { text: 'low confidence', kind: 'weak' }
    default:
      return { text: 'no tracklist found', kind: 'weak' }
  }
}

const trackKey = (t: { video_id?: string; cue_ms?: number; title: string }) =>
  `${t.video_id ?? ''}|${t.cue_ms ?? 0}|${t.title}`

/** Where a DJ would go looking for a record they do not own yet. */
function storeLinks(artist: string | null | undefined, title: string) {
  const query = encodeURIComponent([artist, title].filter(Boolean).join(' '))
  return [
    { name: 'Beatport', url: `https://www.beatport.com/search?q=${query}` },
    { name: 'Discogs', url: `https://www.discogs.com/search/?q=${query}&type=release` },
    { name: 'Bandcamp', url: `https://bandcamp.com/search?q=${query}` },
  ]
}

function TrackRow({
  track,
  onSeek,
  match,
  onPlay,
  saved,
  onToggleSave,
}: {
  track: Track
  onSeek: (cueMs: number) => void
  match?: LibraryMatch
  onPlay?: (libraryTrack: LibraryTrack) => void
  saved: boolean
  onToggleSave: (track: Track) => void
}) {
  const name = track.artist ? (
    <>
      <span className="sets-track__artist">{track.artist}</span> — {track.title}
    </>
  ) : (
    track.title
  )

  const suggestion = track.suggestions?.[0]

  return (
    <div className={`sets-track ${track.isUnknown ? 'sets-track--unknown' : ''}`}>
      <span className="sets-track__index">{track.index}</span>
      <span className="sets-track__cue">{track.cue}</span>

      <span className="sets-track__name">
        {track.isUnknown ? (
          <>
            ID{track.asks ? ` — asked ${track.asks}×, no answer` : ''}
            {suggestion && (
              <span className="sets-track__extra">
                maybe: {suggestion.artist ? `${suggestion.artist} — ` : ''}
                {suggestion.title}
              </span>
            )}
          </>
        ) : (
          <>
            {name}
            {track.mix && <span className="sets-track__artist"> ({track.mix})</span>}
            {track.uncertain && ' ?'}
            {track.disagree.length > 0 && (
              <span className="sets-track__extra">
                or:{' '}
                {track.disagree
                  .map(
                    (d) =>
                      `${d.artist ? `${d.artist} — ${d.title}` : d.title} · ${d.votes} ${
                        d.votes === 1 ? 'list' : 'lists'
                      }`,
                  )
                  .join('   ')}
              </span>
            )}
          </>
        )}
      </span>

      {!track.isUnknown && (
        <button
          type="button"
          className={`sets-track__heart ${saved ? 'sets-track__heart--on' : ''}`}
          onClick={() => onToggleSave(track)}
          title={saved ? 'Remove from Saved' : 'Save this track'}
        >
          <Icon name="Heart" size={13} />
        </button>
      )}

      {/* Owned copy of this record, if the library has one. */}
      {match ? (
        <button
          type="button"
          className="sets-track__own sets-track__own--have"
          onClick={() => onPlay?.(match.track as LibraryTrack)}
          title={`Play your file: ${match.track.artist ?? ''} — ${match.track.title ?? ''}`}
        >
          <Icon name="Play" size={11} /> have it
        </button>
      ) : (
        !track.isUnknown && <span className="sets-track__own">missing</span>
      )}

      {/* Agreement between independently typed lists: 4/4 is a fact, 1/4 a guess. */}
      {!track.isUnknown && track.sourceCount > 0 && (
        <span
          className={`sets-track__votes ${
            track.votes <= 1 && track.sourceCount > 1 ? 'sets-track__votes--lonely' : ''
          }`}
        >
          {track.votes}/{track.sourceCount}
        </span>
      )}
      {track.fromComments && !track.isUnknown && (
        <span className="sets-track__votes">from comments</span>
      )}

      <button
        type="button"
        className="sets-track__play"
        onClick={() => onSeek(track.cueMs)}
        title="Play the set from this point"
      >
        <Icon name="Play" size={12} />
      </button>
    </div>
  )
}

export function SetsView({
  libraryTracks,
  onPlayTrack,
}: {
  libraryTracks: LibraryTrack[]
  onPlayTrack: (track: LibraryTrack, queue: LibraryTrack[], index: number) => void
}) {
  const [tab, setTab] = useState<Tab>('set')
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<TracklistResult | null>(null)
  const [currentSet, setCurrentSet] = useState<RawSet | null>(null)
  const [quota, setQuota] = useState<YouTubeQuotaStatus | null>(null)
  const [filter, setFilter] = useState<'all' | 'have' | 'missing'>('all')
  const [sets, setSets] = useState<YtSetSummary[]>([])
  const [saved, setSaved] = useState<SavedTrack[]>([])
  const [playing, setPlaying] = useState<{ videoId: string; url: string; cueMs: number } | null>(
    null,
  )
  /** Collapsed into the bar, still playing. */
  const [mini, setMini] = useState(false)
  /** Which row the player was last sent to, for the bar and for prev/next. */
  const [playingIndex, setPlayingIndex] = useState<number | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const refreshQuota = useCallback(() => {
    tauriApi.getYouTubeQuota().then(setQuota).catch(() => {})
  }, [])

  const refreshLibrary = useCallback(() => {
    tauriApi.listYouTubeSets().then(setSets).catch(() => {})
    tauriApi.listSavedYouTubeTracks().then(setSaved).catch(() => {})
  }, [])

  useEffect(() => {
    refreshQuota()
    refreshLibrary()
  }, [refreshQuota, refreshLibrary])

  // The library is already fully in memory, so this is a loop, not a query.
  const matches: MatchSummary | null = useMemo(
    () => (result ? matchTracklist(result.tracks, libraryTracks) : null),
    [result, libraryTracks],
  )

  // Playing one row starts a queue of everything you own from this set, in the
  // order the DJ played it.
  const ownedQueue = useMemo(() => {
    if (!result || !matches) return []
    return result.tracks
      .map((t) => matches.byIndex.get(t.index)?.track)
      .filter((t): t is LibraryTrack => Boolean(t))
  }, [result, matches])

  const savedKeys = useMemo(() => new Set(saved.map((t) => trackKey(t))), [saved])

  // The panel is a second webview laid over the page, so the page has to tell
  // it where to sit and keep telling it whenever the layout moves.
  // Opening is keyed on the video, not the cue: moving inside the same set is a
  // seek, and reloading it would rebuffer for no reason.
  useEffect(() => {
    const el = panelRef.current
    if (!playing || !el) return

    const bounds = () => {
      const r = el.getBoundingClientRect()
      return { x: r.left, y: r.top, width: r.width, height: r.height }
    }

    const open = async () => {
      // The player page needs a real http origin, which the companion server
      // provides. It is normally already running; start it if it is not.
      let status = await tauriApi.getCompanionStatus()
      if (!status.running || !status.port) status = await tauriApi.startCompanionServer()
      if (!status.port) throw new Error('The local server could not be started')

      const b = bounds()
      await tauriApi.openYouTubePanel(
        playerPageUrl(status.port, playing.videoId, playing.cueMs),
        b.x,
        b.y,
        b.width,
        b.height,
      )
    }

    void open().catch((err) => {
      // If the in-window panel cannot be shown, the browser still can.
      console.error('[Sets] panel failed, falling back to the browser', err)
      openInBrowser(playing.url, playing.cueMs)
      setPlaying(null)
    })

    const sync = () => {
      const next = bounds()
      void tauriApi.setYouTubePanelBounds(next.x, next.y, next.width, next.height).catch(() => {})
    }
    const observer = new ResizeObserver(sync)
    observer.observe(el)
    window.addEventListener('resize', sync)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', sync)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing?.videoId])

  // Moving the panel between the big box and the bar changes its position
  // without changing its size, which no observer reports.
  useEffect(() => {
    const el = panelRef.current
    if (!playing || !el) return
    const r = el.getBoundingClientRect()
    void tauriApi.setYouTubePanelBounds(r.left, r.top, r.width, r.height).catch(() => {})
  }, [mini, playing])

  // Leaving the Sets view must not leave a video playing over another screen.
  useEffect(() => {
    return () => {
      void tauriApi.closeYouTubePanel().catch(() => {})
    }
  }, [])

  // The panel is an overlay: it would sit on top of the library list too.
  useEffect(() => {
    if (tab !== 'set' && playing) {
      setPlaying(null)
      void tauriApi.closeYouTubePanel().catch(() => {})
    }
  }, [tab, playing])

  /** Sends the player to a point in the set, opening it first if need be. */
  function seekTo(videoId: string, url: string, cueMs: number, index: number | null) {
    setPlayingIndex(index)
    if (playing?.videoId === videoId) {
      void tauriApi.seekYouTubePanel(Math.floor(cueMs / 1000)).catch(() => {})
      return
    }
    setPlaying({ videoId, url, cueMs })
  }

  function show(raw: RawSet) {
    setCurrentSet(raw)
    setResult(analyse(raw.video, raw.comments))
    setTab('set')
  }

  async function handleProcess() {
    if (!input.trim() || loading) return
    setLoading(true)
    setError(null)
    try {
      const raw = await tauriApi.fetchYouTubeSet(input.trim())
      const parsed = analyse(raw.video, raw.comments)
      setCurrentSet(raw)
      setResult(parsed)
      setInput('')
      setTab('set')

      // Kept for good: reopening it later costs nothing.
      await tauriApi.saveYouTubeSet({
        raw,
        status: parsed.status,
        confidence: parsed.confidence,
        source_count: parsed.sourceCount,
        track_count: parsed.trackCount,
      })
      refreshLibrary()
    } catch (err) {
      setError(getErrorMessage(err))
      setResult(null)
    } finally {
      setLoading(false)
      refreshQuota()
    }
  }

  /** Reopening a stored set never touches the network. */
  async function openStored(videoId: string) {
    try {
      setError(null)
      show(await tauriApi.getYouTubeSet(videoId))
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  async function removeStored(videoId: string) {
    await tauriApi.deleteYouTubeSet(videoId).catch(() => {})
    if (currentSet?.video.id === videoId) {
      setCurrentSet(null)
      setResult(null)
    }
    refreshLibrary()
  }

  async function toggleSave(track: Track) {
    if (!currentSet) return
    const key = trackKey({ video_id: currentSet.video.id, cue_ms: track.cueMs, title: track.title })

    if (savedKeys.has(key)) {
      await tauriApi
        .deleteSavedYouTubeTrack(currentSet.video.id, track.cueMs, track.title)
        .catch(() => {})
    } else {
      await tauriApi
        .saveYouTubeTrack({
          video_id: currentSet.video.id,
          cue_ms: track.cueMs,
          cue: track.cue,
          artist: track.artist ?? undefined,
          title: track.title,
          mix: track.mix ?? undefined,
        })
        .catch(() => {})
    }
    refreshLibrary()
  }

  function playFromSet(track: LibraryTrack) {
    const index = ownedQueue.findIndex((t) => t.id === track.id)
    onPlayTrack(track, ownedQueue, index < 0 ? 0 : index)
  }

  function copySavedList() {
    const text = saved
      .map((t) => (t.artist ? `${t.artist} - ${t.title}` : t.title))
      .join('\n')
    void navigator.clipboard.writeText(text)
  }

  const nowPlaying =
    playingIndex != null ? (result?.tracks.find((t) => t.index === playingIndex) ?? null) : null

  /** Walks to the neighbouring track in the set, in the order it was played. */
  function step(direction: 1 | -1) {
    if (!result || !playing || playingIndex == null) return
    const position = result.tracks.findIndex((t) => t.index === playingIndex)
    const next = result.tracks[position + direction]
    if (!next) return
    seekTo(playing.videoId, playing.url, next.cueMs, next.index)
  }

  function canStep(direction: 1 | -1) {
    if (!result || playingIndex == null) return false
    const position = result.tracks.findIndex((t) => t.index === playingIndex)
    return Boolean(result.tracks[position + direction])
  }

  const badge = result ? statusLabel(result) : null
  const unknownCount = result?.tracks.filter((t) => t.isUnknown).length ?? 0

  return (
    <div className="sets-view">
      {playing && tab === 'set' && (
        <div className={`sets-player ${mini ? 'sets-player--mini' : ''}`}>
          <div className="sets-player__bar">
            {/* Collapsed: the video shrinks into the bar and keeps playing —
                only its box moves, so nothing reloads. */}
            {mini && <div className="sets-player__surface--mini" ref={panelRef} />}

            <span className="sets-player__label">
              {mini && nowPlaying ? (
                <>
                  <span className="sets-player__cue">{nowPlaying.cue}</span>{' '}
                  {nowPlaying.artist ? `${nowPlaying.artist} — ${nowPlaying.title}` : nowPlaying.title}
                </>
              ) : (
                (result?.video.title ?? 'YouTube')
              )}
            </span>

            <div className="sets-player__controls">
              {mini && (
                <>
                  <button
                    type="button"
                    className="sets-player__ctrl"
                    onClick={() => step(-1)}
                    disabled={!canStep(-1)}
                    title="Previous track"
                  >
                    <Icon name="SkipBack" size={14} />
                  </button>
                  <button
                    type="button"
                    className="sets-player__ctrl"
                    onClick={() => step(1)}
                    disabled={!canStep(1)}
                    title="Next track"
                  >
                    <Icon name="SkipForward" size={14} />
                  </button>
                </>
              )}
              <button
                type="button"
                className="sets-player__close"
                onClick={() => setMini(!mini)}
              >
                {mini ? (
                  <>
                    <Icon name="Maximize2" size={13} /> video
                  </>
                ) : (
                  <>
                    <Icon name="Minimize2" size={13} /> minimise
                  </>
                )}
              </button>
              <button
                type="button"
                className="sets-player__close"
                onClick={() => {
                  setPlaying(null)
                  setMini(false)
                  setPlayingIndex(null)
                  void tauriApi.closeYouTubePanel().catch(() => {})
                }}
              >
                <Icon name="X" size={14} /> close
              </button>
            </div>
          </div>

          {/* Deliberately empty: the webview covers exactly this box. */}
          {!mini && <div className="sets-player__surface" ref={panelRef} />}
        </div>
      )}

      <div className="sets-view__scroll">
        <div className="sets-view__container">
          <div className="sets-tabs">
            {(['set', 'library', 'saved'] as const).map((t) => (
              <button
                key={t}
                type="button"
                className={`sets-tab ${tab === t ? 'sets-tab--active' : ''}`}
                onClick={() => setTab(t)}
              >
                {t === 'set' ? 'Set' : t === 'library' ? `Library (${sets.length})` : `Saved (${saved.length})`}
              </button>
            ))}
          </div>

          {tab === 'set' && (
            <>
              <div className="sets-form">
                <input
                  className="sets-form__input"
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleProcess()
                  }}
                />
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleProcess}
                  disabled={loading || !input.trim()}
                >
                  {loading ? 'Reading...' : 'Process'}
                </button>
              </div>

              {quota && (
                <p className="sets-quota">
                  {quota.remaining.toLocaleString()} of {quota.daily_limit.toLocaleString()} quota
                  units left today · a set costs 5–7 · reopening a saved set costs nothing
                </p>
              )}

              {error && <div className="sets-error">{error}</div>}

              {result && (
                <>
                  <div className="sets-result__header">
                    <h2 className="sets-result__title">{result.video.title}</h2>
                    <div className="sets-result__meta">
                      <span>{result.video.channel}</span>
                      <span className={`sets-badge sets-badge--${badge!.kind}`}>{badge!.text}</span>
                      <span>{result.trackCount} tracks</span>
                      {matches && (
                        <span>
                          you have {matches.owned} of {matches.owned + matches.missing}
                        </span>
                      )}
                      <button
                        type="button"
                        className="sets-track__cue-btn"
                        onClick={() => seekTo(result.video.id, result.video.url, 0, null)}
                      >
                        <Icon name="Play" size={12} /> play here
                      </button>
                      <button
                        type="button"
                        className="sets-track__cue-btn"
                        onClick={() => openInBrowser(result.video.url)}
                      >
                        <Icon name="ExternalLink" size={12} /> open in browser
                      </button>
                    </div>
                  </div>

                  <p className="sets-summary">
                    {result.trackCount} tracks from {result.sourceCount}{' '}
                    {result.sourceCount === 1 ? 'list' : 'crossed lists'}
                    {unknownCount > 0 && ` · ${unknownCount} unidentified`}
                    {result.sourceMeta && (
                      <>
                        {' · strongest source: '}
                        {result.source === 'description' ? 'the description' : 'comment'}{' '}
                        {result.sourceMeta.author}
                      </>
                    )}
                  </p>

                  <SetTimeline
                    tracks={result.tracks}
                    durationMs={result.video.durationMs}
                    onSeek={(cueMs) => seekTo(result.video.id, result.video.url, cueMs, null)}
                  />

                  {matches && matches.owned + matches.missing > 0 && (
                    <div className="sets-filter">
                      {(['all', 'have', 'missing'] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          className={`sets-filter__btn ${filter === mode ? 'sets-filter__btn--active' : ''}`}
                          onClick={() => setFilter(mode)}
                        >
                          {mode === 'all' ? 'All' : mode === 'have' ? 'In library' : 'Missing'}
                        </button>
                      ))}
                    </div>
                  )}

                  {result.tracks
                    .filter((track) => {
                      if (filter === 'all') return true
                      // An unnamed slot is neither owned nor missing, so it
                      // belongs only in the unfiltered view.
                      if (track.isUnknown) return false
                      const owned = matches?.byIndex.has(track.index) ?? false
                      return filter === 'have' ? owned : !owned
                    })
                    .map((track) => (
                      <TrackRow
                        key={track.index}
                        track={track}
                        onSeek={(cueMs) =>
                          seekTo(result.video.id, result.video.url, cueMs, track.index)
                        }
                        match={matches?.byIndex.get(track.index)}
                        onPlay={playFromSet}
                        saved={savedKeys.has(
                          trackKey({
                            video_id: currentSet?.video.id,
                            cue_ms: track.cueMs,
                            title: track.title,
                          }),
                        )}
                        onToggleSave={toggleSave}
                      />
                    ))}

                  {result.tracks.length === 0 && (
                    <p className="sets-empty">
                      Nothing in the description and nothing usable in the comments. On a fresh set
                      this is worth retrying in a few days — tracklists arrive slowly.
                    </p>
                  )}

                  {result.loose.length > 0 && (
                    <div className="sets-loose">
                      <h3 className="sets-loose__title">Named without a timestamp</h3>
                      <p className="sets-loose__hint">
                        Mentioned in the comments, but nobody said where in the set.
                      </p>
                      {result.loose.map((item) => (
                        <div className="sets-track" key={item.key ?? item.title}>
                          <span className="sets-track__cue">—</span>
                          <span className="sets-track__name">
                            <span className="sets-track__artist">{item.artist}</span> — {item.title}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {!result && !error && (
                <p className="sets-empty">
                  A popular set has four to seven tracklists typed out by different people. What one
                  of them marks as ID, another one names.
                </p>
              )}
            </>
          )}

          {tab === 'library' && (
            <>
              <p className="sets-view__subtitle">
                Every set you have processed, kept whole. Opening one costs no quota.
              </p>
              {sets.length === 0 && <p className="sets-empty">Nothing processed yet.</p>}
              {sets.map((s) => (
                <div className="sets-stored" key={s.video_id}>
                  <button type="button" className="sets-stored__main" onClick={() => openStored(s.video_id)}>
                    <span className="sets-stored__title">{s.title}</span>
                    <span className="sets-stored__meta">
                      {s.channel} · {s.track_count ?? 0} tracks
                      {s.status === 'assembled' ? ' · assembled from comments' : ''}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="sets-stored__remove"
                    onClick={() => removeStored(s.video_id)}
                    title="Remove from the library"
                  >
                    <Icon name="Trash2" size={14} />
                  </button>
                </div>
              ))}
            </>
          )}

          {tab === 'saved' && (
            <>
              <div className="sets-saved__head">
                <p className="sets-view__subtitle">
                  Hearted tracks from every set — the shopping list.
                </p>
                {saved.length > 0 && (
                  <button type="button" className="sets-filter__btn" onClick={copySavedList}>
                    Copy list
                  </button>
                )}
              </div>
              {saved.length === 0 && <p className="sets-empty">Nothing saved yet.</p>}
              {saved.map((t) => (
                <div className="sets-track" key={t.id ?? trackKey(t)}>
                  <span className="sets-track__cue">{t.cue}</span>
                  <span className="sets-track__name">
                    {t.artist && <span className="sets-track__artist">{t.artist} — </span>}
                    {t.title}
                    {t.mix && <span className="sets-track__artist"> ({t.mix})</span>}
                    <span className="sets-track__extra">
                      {t.set_title}
                      {storeLinks(t.artist, t.title).map((link) => (
                        <button
                          key={link.name}
                          type="button"
                          className="sets-store-link"
                          onClick={() => void openUrl(link.url)}
                        >
                          {link.name}
                        </button>
                      ))}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="sets-track__heart sets-track__heart--on"
                    onClick={async () => {
                      await tauriApi
                        .deleteSavedYouTubeTrack(t.video_id, t.cue_ms, t.title)
                        .catch(() => {})
                      refreshLibrary()
                    }}
                    title="Remove from Saved"
                  >
                    <Icon name="Heart" size={13} />
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
