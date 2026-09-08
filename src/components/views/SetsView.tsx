import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { openUrl } from '@tauri-apps/plugin-opener'
import { Icon } from '../Icon'
import { SetTimeline } from './SetTimeline'
import { tauriApi } from '../../lib/tauri-api'
import { analyse, type Track, type TracklistResult } from '../../lib/tracklist'
import { storeParsedSet } from '../../lib/tracklist/importSet'
import { matchTracklist, type LibraryMatch, type MatchSummary } from '../../lib/tracklist/match'
import { extractDjName, groupByDj } from '../../lib/tracklist/djName'
import { playerPageUrl, watchUrl } from '../../lib/youtubeWindow'
import type { Track as LibraryTrack } from '../../types/track'
import { getErrorMessage } from '../../types/ai'
import type {
  RawSet,
  SavedTrack,
  YouTubeQuotaStatus,
  YtSetSummary,
  YtStats,
  YtTrackHit,
  SetSearchHit,
  ChannelNews,
  ChannelUpload,
  FollowedChannel,
  WatchedDj,
} from '../../types/youtube'
import { CHECK_INTERVALS } from '../../types/youtube'
import './SetsView.css'

type Tab = 'set' | 'library' | 'saved' | 'channels' | 'stats'

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

/**
 * A link or a bare id can be fetched directly; anything else is a name, and
 * finding sets by name is the one call that costs 100 units.
 */
function looksLikeLink(input: string): boolean {
  const text = input.trim()
  if (/^[A-Za-z0-9_-]{11}$/.test(text)) return true
  return /(?:v=|youtu\.be\/|\/embed\/|\/live\/|\/shorts\/)[A-Za-z0-9_-]{11}/.test(text)
}

const trackKey = (t: { video_id?: string; cue_ms?: number; title: string }) =>
  `${t.video_id ?? ''}|${t.cue_ms ?? 0}|${t.title}`

/** Where a DJ would go looking for a record they do not own yet. */
function storeLinks(artist: string | null | undefined, title: string, mix?: string | null) {
  const query = encodeURIComponent([artist, title, mix].filter(Boolean).join(' '))
  return [
    { name: 'Spotify', url: `https://open.spotify.com/search/${query}` },
    { name: 'Beatport', url: `https://www.beatport.com/search?q=${query}` },
    { name: 'Discogs', url: `https://www.discogs.com/search/?q=${query}&type=release` },
    { name: 'Bandcamp', url: `https://bandcamp.com/search?q=${query}` },
  ]
}

/** Kept out of the way until the row is hovered, so 42 rows stay readable. */
function StoreLinks({
  artist,
  title,
  mix,
  className = '',
}: {
  artist: string | null | undefined
  title: string
  mix?: string | null
  className?: string
}) {
  return (
    <span className={`sets-stores ${className}`}>
      {storeLinks(artist, title, mix).map((link) => (
        <button
          key={link.name}
          type="button"
          className="sets-store-link"
          onClick={(e) => {
            e.stopPropagation()
            void openUrl(link.url)
          }}
        >
          {link.name}
        </button>
      ))}
    </span>
  )
}

function TrackRow({
  track,
  onSeek,
  match,
  onPlay,
  saved,
  onToggleSave,
  untimed,
}: {
  track: Track
  onSeek: (cueMs: number) => void
  match?: LibraryMatch
  onPlay?: (libraryTrack: LibraryTrack) => void
  saved: boolean
  onToggleSave: (track: Track) => void
  /** The list carries no timestamps, so there is nowhere to send the player. */
  untimed?: boolean
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
        <StoreLinks
          artist={track.artist}
          title={track.title}
          mix={track.mix}
          className="sets-stores--hover"
        />
      )}

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

      {!untimed && (
        <button
          type="button"
          className="sets-track__play"
          onClick={() => onSeek(track.cueMs)}
          title="Play the set from this point"
        >
          <Icon name="Play" size={12} />
        </button>
      )}
    </div>
  )
}

export function SetsView({
  onPlayTrack,
}: {
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
  const [search, setSearch] = useState('')
  const [hits, setHits] = useState<YtTrackHit[]>([])
  const [stats, setStats] = useState<YtStats | null>(null)
  const [found, setFound] = useState<SetSearchHit[] | null>(null)
  const [channels, setChannels] = useState<FollowedChannel[]>([])
  const [channelInput, setChannelInput] = useState('')
  const [djs, setDjs] = useState<WatchedDj[]>([])
  const [djInput, setDjInput] = useState('')
  const [news, setNews] = useState<ChannelNews[] | null>(null)
  const [uploads, setUploads] = useState<{
    channel: FollowedChannel
    items: ChannelUpload[]
    /** What an empty list actually means here — see showDjFinds. */
    emptyNote?: string
  } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  /**
   * The whole library, loaded here rather than taken from the main view.
   *
   * App's track list holds whatever is on screen — one folder, one playlist —
   * so matching against it answered "do I have this in the folder I happen to
   * be looking at", which is not the question.
   */
  const [libraryTracks, setLibraryTracks] = useState<LibraryTrack[]>([])
  const [grouping, setGrouping] = useState<'dj' | 'recent'>('dj')
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
    tauriApi.listYouTubeChannels().then(setChannels).catch(() => {})
    tauriApi.listYouTubeDjs().then(setDjs).catch(() => {})
  }, [])

  useEffect(() => {
    refreshQuota()
    refreshLibrary()
  }, [refreshQuota, refreshLibrary])

  // Scanning or adding files changes what counts as owned, so the match has to
  // be recomputed — otherwise a track added a minute ago still reads "missing".
  useEffect(() => {
    const load = () => {
      tauriApi.getAllTracks().then(setLibraryTracks).catch(() => {})
    }
    load()

    const stop = listen('library-changed', load)
    return () => {
      void stop.then((unlisten) => unlisten())
    }
  }, [])

  // The automatic check runs whether or not this view is open, so what it found
  // is taken from the event rather than checked for again — a second check would
  // cost quota to learn what the app already knows.
  useEffect(() => {
    const stop = listen<ChannelNews[]>('yt-new-sets', (event) => {
      setNews(event.payload)
      refreshLibrary()
      refreshQuota()
    })
    return () => {
      void stop.then((unlisten) => unlisten())
    }
  }, [refreshLibrary, refreshQuota])

  // Searching the stored sets never touches the network, so it can run as the
  // user types; a short debounce is only to spare the database.
  useEffect(() => {
    if (search.trim().length < 2) {
      setHits([])
      return
    }
    const timer = setTimeout(() => {
      tauriApi.searchYouTubeTracks(search).then(setHits).catch(() => {})
    }, 200)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    if (tab !== 'stats') return
    tauriApi.youtubeStats().then(setStats).catch(() => {})
  }, [tab, sets.length])

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

  function show(raw: RawSet): TracklistResult {
    const parsed = analyse(raw.video, raw.comments)
    setCurrentSet(raw)
    setResult(parsed)
    setTab('set')
    return parsed
  }

  async function handleProcess() {
    if (!input.trim() || loading) return

    if (!looksLikeLink(input)) {
      await handleSearchSets()
      return
    }

    setLoading(true)
    setError(null)
    setFound(null)
    try {
      const raw = await tauriApi.fetchYouTubeSet(input.trim())
      const parsed = analyse(raw.video, raw.comments)
      setCurrentSet(raw)
      setResult(parsed)
      setInput('')
      setTab('set')

      // Kept for good: reopening it later costs nothing.
      await storeParsed(raw, parsed)
      refreshLibrary()
    } catch (err) {
      setError(getErrorMessage(err))
      setResult(null)
    } finally {
      setLoading(false)
      refreshQuota()
    }
  }

  /** Finds a DJ's sets by name. The expensive call, hence the confirmation. */
  async function handleSearchSets() {
    const quotaLeft = quota?.remaining ?? 0
    if (quotaLeft < 100) {
      setError(
        `Searching by name costs 100 units and only ${quotaLeft.toLocaleString()} are left today.`,
      )
      return
    }

    setLoading(true)
    setError(null)
    try {
      setFound(await tauriApi.searchYouTubeSets(input.trim()))
    } catch (err) {
      setError(getErrorMessage(err))
      setFound(null)
    } finally {
      setLoading(false)
      refreshQuota()
    }
  }

  /** Fetches one of the found sets: back to the ordinary 5-7 unit path. */
  async function processFound(hit: SetSearchHit) {
    setLoading(true)
    setError(null)
    try {
      const raw = await tauriApi.fetchYouTubeSet(hit.videoId)
      const parsed = show(raw)
      await storeParsed(raw, parsed)
      setFound(null)
      setInput('')
      refreshLibrary()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
      refreshQuota()
    }
  }

  /** Adds a channel to follow. A handle or a link costs 2 units; a bare name
      falls through to search, which costs 100 — so paste a link where you can. */
  async function addChannel() {
    if (!channelInput.trim() || loading) return
    setLoading(true)
    setError(null)
    try {
      const channel = await tauriApi.resolveYouTubeChannel(channelInput.trim())
      await tauriApi.followYouTubeChannel(channel)
      setChannelInput('')
      refreshLibrary()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
      refreshQuota()
    }
  }

  /** What a channel has put out lately, long videos only. */
  async function showUploads(channel: FollowedChannel) {
    if (!channel.uploads_id) return
    setBusy(channel.channel_id)
    setError(null)
    try {
      const items = await tauriApi.listYouTubeChannelUploads(channel.uploads_id, 25)
      setUploads({ channel, items })
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(null)
      refreshQuota()
    }
  }

  /** One or two units per channel — the cheap way to keep up. */
  /**
   * How often this channel is checked without being asked.
   *
   * Written straight through and reflected locally, so the row does not flicker
   * back to its old value while the list is being read again.
   */
  async function setCheckInterval(channelId: string, hours: number) {
    setChannels((current) =>
      current.map((c) =>
        c.channel_id === channelId ? { ...c, check_interval_hours: hours } : c,
      ),
    )
    await tauriApi.setYouTubeChannelInterval(channelId, hours).catch((err) => {
      setError(getErrorMessage(err))
      refreshLibrary()
    })
  }

  async function addDj() {
    const name = djInput.trim()
    if (name.length < 2) return
    setError(null)
    try {
      await tauriApi.watchYouTubeDj(name)
      setDjInput('')
      refreshLibrary()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  /**
   * What has already been found for a DJ, read back from disk.
   *
   * Free, and the reason every hit is recorded: a set found last week and never
   * imported is still here, even though it stopped being news the moment it was
   * first shown.
   */
  async function showDjFinds(dj: WatchedDj) {
    setError(null)
    try {
      const items = await tauriApi.listYouTubeDjFinds(dj.name_key)
      setUploads({
        channel: {
          channel_id: `dj:${dj.name_key}`,
          title: `${dj.display_name} — everything found so far`,
          check_interval_hours: dj.check_interval_hours,
        },
        items,
        // "Nothing found" and "never looked" are not the same answer, and
        // showing the first when the second is true is how a name that was
        // never searched reads as a name with no sets.
        emptyNote: dj.last_checked
          ? 'Searched, and nothing new has turned up yet.'
          : `Not searched yet — ${
              dj.check_interval_hours === 0
                ? 'set an interval, or press Search now'
                : 'the next automatic search will pick this up'
            }.`,
      })
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  async function setDjAutoImport(nameKey: string, enabled: boolean) {
    setDjs((current) =>
      current.map((d) => (d.name_key === nameKey ? { ...d, auto_import: enabled } : d)),
    )
    await tauriApi.setYouTubeDjAutoImport(nameKey, enabled).catch((err) => {
      setError(getErrorMessage(err))
      refreshLibrary()
    })
  }

  async function setDjInterval(nameKey: string, hours: number) {
    setDjs((current) =>
      current.map((d) => (d.name_key === nameKey ? { ...d, check_interval_hours: hours } : d)),
    )
    await tauriApi.setYouTubeDjInterval(nameKey, hours).catch((err) => {
      setError(getErrorMessage(err))
      refreshLibrary()
    })
  }

  /**
   * Searching for every watched DJ, at 100 units each.
   *
   * The button refuses rather than half-finishing: spending a chunk of the day
   * and then stopping is worse than saying so before the click.
   */
  async function checkDjs() {
    const cost = djs.length * 100
    const quotaLeft = quota?.remaining ?? 0
    if (quotaLeft < cost) {
      setError(
        `Searching for ${djs.length} ${djs.length === 1 ? 'DJ' : 'DJs'} costs ${cost.toLocaleString()} units and only ${quotaLeft.toLocaleString()} are left today.`,
      )
      return
    }
    setLoading(true)
    setError(null)
    try {
      setNews(await tauriApi.checkYouTubeDjs())
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
      refreshLibrary()
      refreshQuota()
    }
  }

  async function checkChannels() {
    setLoading(true)
    setError(null)
    try {
      setNews(await tauriApi.checkYouTubeChannels())
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
      refreshQuota()
    }
  }

  /** Fetches one upload and, when it came from a check, marks it as seen. */
  /**
   * `channelId` moves the channel's last-seen marker. A watched DJ has none —
   * its news comes from a dated search, not from a position in a listing.
   */
  async function importUpload(videoId: string, channelId?: string) {
    setBusy(videoId)
    setError(null)
    try {
      const raw = await tauriApi.fetchYouTubeSet(videoId)
      const parsed = show(raw)
      await storeParsed(raw, parsed)
      if (channelId) await tauriApi.markYouTubeChannelSeen(channelId, videoId).catch(() => {})
      setNews(null)
      setUploads(null)
      refreshLibrary()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(null)
      refreshQuota()
    }
  }

  /** Reopening a stored set never touches the network. */
  async function openStored(videoId: string) {
    try {
      setError(null)
      const raw = await tauriApi.getYouTubeSet(videoId)
      const parsed = show(raw)

      // Sets stored before the tracks table existed have no rows in it, and so
      // would be invisible to search and statistics. Reopening one fills them
      // in — and a set reparsed by an improved parser is refreshed the same way.
      await storeParsed(raw, parsed)
      refreshLibrary()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  /** Writes the parsed result next to the stored fetch. Costs no quota. */
  /** Shared with the automatic import, so both store a set the same way. */
  async function storeParsed(raw: RawSet, parsed: TracklistResult) {
    await storeParsedSet(raw, parsed)
  }

  /** Opens the set a search hit came from and jumps to the moment. */
  async function openHit(hit: YtTrackHit) {
    try {
      setError(null)
      const raw = await tauriApi.getYouTubeSet(hit.video_id)
      const parsed = show(raw)
      const row = parsed.tracks.find((t) => t.cueMs === hit.cue_ms)
      seekTo(raw.video.id, raw.video.url, hit.cue_ms, row?.index ?? null)
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

  /** The library, filed under whoever played each set. */
  const byDj = useMemo(() => groupByDj(sets), [sets])

  /** How many unseen sets the last check turned up, for the tab badge. */
  const newCount = news?.reduce((total, item) => total + item.new_sets.length, 0) ?? 0

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

  /** One stored set, whichever way the library is grouped. */
  function StoredSet({ set }: { set: YtSetSummary }) {
    return (
      <div className="sets-stored">
        <button
          type="button"
          className="sets-stored__main"
          onClick={() => openStored(set.video_id)}
        >
          <span className="sets-stored__title">{set.title}</span>
          <span className="sets-stored__meta">
            {set.channel} · {set.track_count ?? 0} tracks
            {set.status === 'assembled' ? ' · assembled from comments' : ''}
          </span>
        </button>
        <button
          type="button"
          className="sets-stored__remove"
          onClick={() => removeStored(set.video_id)}
          title="Remove from the library"
        >
          <Icon name="Trash2" size={14} />
        </button>
      </div>
    )
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
            {(['set', 'library', 'saved', 'channels', 'stats'] as const).map((t) => (
              <button
                key={t}
                type="button"
                className={`sets-tab ${tab === t ? 'sets-tab--active' : ''}`}
                onClick={() => setTab(t)}
              >
                {t === 'set'
                  ? 'Set'
                  : t === 'library'
                    ? `Library (${sets.length})`
                    : t === 'saved'
                      ? `Saved (${saved.length})`
                      : t === 'channels'
                        ? `Following (${channels.length})`
                        : 'Stats'}
                {t === 'channels' && newCount > 0 && (
                  <span className="sets-tab__badge">{newCount}</span>
                )}
              </button>
            ))}
          </div>

          {tab === 'set' && (
            <>
              <div className="sets-form">
                <input
                  className="sets-form__input"
                  placeholder="Paste a set link, or type a DJ's name"
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
                  {loading
                    ? 'Reading...'
                    : looksLikeLink(input)
                      ? 'Process'
                      : 'Search · 100 units'}
                </button>
              </div>

              {quota && (
                <p className="sets-quota">
                  {quota.remaining.toLocaleString()} of {quota.daily_limit.toLocaleString()} quota
                  units left today · a set costs 5–7 · reopening a saved set costs nothing
                </p>
              )}

              {error && <div className="sets-error">{error}</div>}

              {found && (
                <>
                  <p className="sets-summary">
                    {found.length === 0
                      ? 'No long videos found for that name.'
                      : `${found.length} sets found — opening one costs 5–7 units`}
                  </p>
                  {found.map((hit) => (
                    <button
                      type="button"
                      className="sets-found"
                      key={hit.videoId}
                      onClick={() => processFound(hit)}
                    >
                      {hit.thumbnail && (
                        <img className="sets-found__thumb" src={hit.thumbnail} alt="" />
                      )}
                      <span className="sets-found__text">
                        <span className="sets-stored__title">{hit.title}</span>
                        <span className="sets-stored__meta">
                          {hit.channel} · {hit.publishedAt.slice(0, 10)}
                        </span>
                      </span>
                    </button>
                  ))}
                </>
              )}

              {result && !found && (
                <>
                  <div className="sets-result__header">
                    <h2 className="sets-result__title">{result.video.title}</h2>
                    <div className="sets-result__meta">
                      <span className="sets-dj__chip">
                        {extractDjName(result.video.title, result.video.channel)}
                      </span>
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

                  {result.untimed ? (
                    <p className="sets-view__subtitle">
                      This list came with no timestamps, so there is nothing to seek to — the
                      order is the uploader's numbering. Everything else works: what you own is
                      marked, and the tracks are searchable and can be saved.
                    </p>
                  ) : (
                    <SetTimeline
                      tracks={result.tracks}
                      durationMs={result.video.durationMs}
                      onSeek={(cueMs) => seekTo(result.video.id, result.video.url, cueMs, null)}
                    />
                  )}

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
                        untimed={result.untimed}
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

              <div className="sets-form">
                <input
                  className="sets-form__input"
                  placeholder="Where did I hear this? — search every stored set"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              {search.trim().length >= 2 && (
                <>
                  <p className="sets-summary">
                    {hits.length === 0
                      ? 'Nothing found in the stored sets.'
                      : `${hits.length} ${hits.length === 1 ? 'hit' : 'hits'}`}
                  </p>
                  {hits.map((hit) => (
                    <button
                      type="button"
                      className="sets-hit"
                      key={`${hit.video_id}-${hit.cue_ms}-${hit.title}`}
                      onClick={() => openHit(hit)}
                    >
                      <span className="sets-track__cue">{hit.cue}</span>
                      <span className="sets-track__name">
                        {hit.artist && <span className="sets-track__artist">{hit.artist} — </span>}
                        {hit.title}
                        <span className="sets-track__extra">{hit.set_title}</span>
                      </span>
                    </button>
                  ))}
                </>
              )}
              {sets.length === 0 && <p className="sets-empty">Nothing processed yet.</p>}

              {sets.length > 0 && (
                <div className="sets-filter">
                  <button
                    type="button"
                    className={`sets-filter__btn ${grouping === 'dj' ? 'sets-filter__btn--active' : ''}`}
                    onClick={() => setGrouping('dj')}
                  >
                    By DJ ({byDj.length})
                  </button>
                  <button
                    type="button"
                    className={`sets-filter__btn ${grouping === 'recent' ? 'sets-filter__btn--active' : ''}`}
                    onClick={() => setGrouping('recent')}
                  >
                    Newest first
                  </button>
                </div>
              )}

              {grouping === 'recent' && sets.map((s) => <StoredSet key={s.video_id} set={s} />)}

              {grouping === 'dj' &&
                byDj.map((group) => (
                  <div className="sets-dj" key={group.dj}>
                    <h3 className="sets-dj__name">
                      {group.dj}
                      <span className="sets-dj__count">
                        {group.sets.length} {group.sets.length === 1 ? 'set' : 'sets'}
                      </span>
                    </h3>
                    {group.sets.map((s) => (
                      <StoredSet key={s.video_id} set={s} />
                    ))}
                  </div>
                ))}
            </>
          )}

          {tab === 'channels' && (
            <>
              <p className="sets-view__subtitle">
                Following a channel is the cheap way to keep up — a check costs a unit or two,
                where searching by name costs a hundred.
              </p>

              <div className="sets-form">
                <input
                  className="sets-form__input"
                  placeholder="@cercle, a channel link, or a link to one of its videos"
                  value={channelInput}
                  onChange={(e) => setChannelInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addChannel()
                  }}
                />
                <button
                  type="button"
                  className="btn-primary"
                  onClick={addChannel}
                  disabled={loading || !channelInput.trim()}
                >
                  Follow
                </button>
              </div>
              <p className="sets-quota">
                A handle or a link resolves for 2 units. A bare name has to be searched for, which
                costs 100 — paste a link where you can.
              </p>
              <p className="sets-quota">
                Set a channel to Daily or Weekly and the app checks it on its own, telling you when
                a set turns up. A check is a unit or two, so ten channels daily is about twenty
                units of the ten thousand a day. New channels start at Never.
              </p>

              {error && <div className="sets-error">{error}</div>}

              {channels.length > 0 && (
                <div className="sets-filter">
                  <button
                    type="button"
                    className="sets-filter__btn"
                    onClick={checkChannels}
                    disabled={loading}
                  >
                    {loading ? 'Checking...' : 'Check for new sets'}
                  </button>
                </div>
              )}

              {channels.length === 0 && <p className="sets-empty">Not following anyone yet.</p>}

              {channels.map((channel) => (
                <div className="sets-stored" key={channel.channel_id}>
                  <button
                    type="button"
                    className="sets-stored__main"
                    onClick={() => showUploads(channel)}
                    disabled={busy === channel.channel_id}
                  >
                    <span className="sets-stored__title">{channel.title ?? channel.channel_id}</span>
                    <span className="sets-stored__meta">
                      {channel.handle ? `@${channel.handle} · ` : ''}
                      {busy === channel.channel_id
                        ? 'reading uploads...'
                        : channel.last_checked
                          ? `checked ${channel.last_checked.slice(0, 10)}`
                          : 'show recent sets'}
                    </span>
                  </button>
                  <select
                    className="sets-interval"
                    value={channel.check_interval_hours}
                    onChange={(e) => setCheckInterval(channel.channel_id, Number(e.target.value))}
                    title="How often the app checks this channel on its own"
                  >
                    {CHECK_INTERVALS.map((option) => (
                      <option key={option.hours} value={option.hours}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="sets-stored__remove"
                    onClick={async () => {
                      await tauriApi.unfollowYouTubeChannel(channel.channel_id).catch(() => {})
                      refreshLibrary()
                    }}
                    title="Stop following"
                  >
                    <Icon name="X" size={14} />
                  </button>
                </div>
              ))}

              <div className="sets-djs">
                <h3 className="sets-loose__title">Watch a DJ</h3>
                <p className="sets-view__subtitle">
                  A DJ is not a channel. Their sets land on Cercle, Boiler Room and Mixmag, so
                  the only way to catch one on a channel you do not follow is to search by name —
                  and a search is 100 units, a hundred times a channel check. Weekly is usually
                  the honest setting. New names start at Never.
                </p>

                <div className="sets-form">
                  <input
                    className="sets-form__input"
                    placeholder="Solomun, Hot Since 82, Priku..."
                    value={djInput}
                    onChange={(e) => setDjInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') addDj()
                    }}
                  />
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={addDj}
                    disabled={djInput.trim().length < 2}
                  >
                    Watch
                  </button>
                </div>

                {djs.length > 0 && (
                  <div className="sets-filter">
                    <button
                      type="button"
                      className="sets-filter__btn"
                      onClick={checkDjs}
                      disabled={loading}
                    >
                      {loading
                        ? 'Searching...'
                        : `Search now · ${(djs.length * 100).toLocaleString()} units`}
                    </button>
                  </div>
                )}

                {djs.length === 0 && <p className="sets-empty">No DJs watched yet.</p>}

                {djs.map((dj) => (
                  <div className="sets-stored" key={dj.name_key}>
                    <button
                      type="button"
                      className="sets-stored__main"
                      onClick={() => showDjFinds(dj)}
                    >
                      <span className="sets-stored__title">{dj.display_name}</span>
                      <span className="sets-stored__meta">
                        {dj.check_interval_hours === 0
                          ? 'not searched for on its own'
                          : `100 units a search${
                              dj.auto_import ? ' · new sets fetched automatically' : ''
                            }${dj.last_checked ? ` · last ${dj.last_checked.slice(0, 10)}` : ''}`}
                      </span>
                    </button>
                    <label
                      className="sets-autoimport"
                      title="Fetch and store new sets without asking — another 5-7 units each, at most five at a time"
                    >
                      <input
                        type="checkbox"
                        checked={dj.auto_import}
                        onChange={(e) => setDjAutoImport(dj.name_key, e.target.checked)}
                      />
                      get them
                    </label>
                    <select
                      className="sets-interval"
                      value={dj.check_interval_hours}
                      onChange={(e) => setDjInterval(dj.name_key, Number(e.target.value))}
                      title="How often the app searches for this DJ on its own — 100 units a time"
                    >
                      {CHECK_INTERVALS.map((option) => (
                        <option key={option.hours} value={option.hours}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="sets-stored__remove"
                      onClick={async () => {
                        await tauriApi.unwatchYouTubeDj(dj.name_key).catch(() => {})
                        refreshLibrary()
                      }}
                      title="Stop watching"
                    >
                      <Icon name="X" size={14} />
                    </button>
                  </div>
                ))}
              </div>

              {news && (
                <div className="sets-loose">
                  <h3 className="sets-loose__title">
                    {newCount === 0 ? 'Nothing new' : `${newCount} new ${newCount === 1 ? 'set' : 'sets'}`}
                  </h3>
                  {news.map((item) => (
                    <div key={item.channel_id}>
                      <p className="sets-loose__hint">
                        {item.title}
                        {item.source === 'dj' ? ' · found by name' : ''}
                      </p>
                      {item.new_sets.map((set) => (
                        <button
                          type="button"
                          className="sets-hit"
                          key={set.video_id}
                          onClick={() =>
                            importUpload(
                              set.video_id,
                              item.source === 'channel' ? item.channel_id : undefined,
                            )
                          }
                          disabled={busy === set.video_id}
                        >
                          <span className="sets-track__name">
                            {set.title}
                            <span className="sets-track__extra">
                              {set.published_at.slice(0, 10)}
                              {set.duration_ms
                                ? ` · ${Math.round(set.duration_ms / 60000)} min`
                                : ''}
                            </span>
                          </span>
                          <span className="sets-track__votes">
                            {busy === set.video_id ? 'reading...' : 'get it'}
                          </span>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}

              {uploads && (
                <div className="sets-loose">
                  <h3 className="sets-loose__title">{uploads.channel.title}</h3>
                  <p className="sets-loose__hint">
                    {uploads.channel.channel_id.startsWith('dj:')
                      ? 'Everything the searches have turned up. Reading this costs nothing.'
                      : 'Long uploads only — promo clips under twenty minutes are not sets.'}
                  </p>
                  {uploads.items.length === 0 && (
                    <p className="sets-empty">
                      {uploads.emptyNote ?? 'No long uploads found.'}
                    </p>
                  )}
                  {uploads.items.map((item) => (
                    <button
                      type="button"
                      className="sets-hit"
                      key={item.video_id}
                      onClick={() =>
                        item.already_stored
                          ? openStored(item.video_id)
                          : importUpload(
                              item.video_id,
                              uploads.channel.channel_id.startsWith('dj:')
                                ? undefined
                                : uploads.channel.channel_id,
                            )
                      }
                      disabled={busy === item.video_id}
                    >
                      <span className="sets-track__name">
                        {item.title}
                        <span className="sets-track__extra">
                          {item.published_at.slice(0, 10)}
                          {item.duration_ms ? ` · ${Math.round(item.duration_ms / 60000)} min` : ''}
                        </span>
                      </span>
                      <span className="sets-track__votes">
                        {busy === item.video_id
                          ? 'reading...'
                          : item.already_stored
                            ? 'in library'
                            : 'get it'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === 'stats' && (
            <>
              {!stats && <p className="sets-empty">Nothing processed yet.</p>}
              {stats && (
                <>
                  <p className="sets-summary">
                    {stats.sets} {stats.sets === 1 ? 'set' : 'sets'} · {stats.tracks} named tracks ·{' '}
                    {stats.unknowns} still unidentified
                  </p>

                  <div className="sets-stats">
                    <div className="sets-stats__block">
                      <h3 className="sets-loose__title">Most played</h3>
                      {stats.top_artists.length === 0 && <p className="sets-empty">—</p>}
                      {stats.top_artists.map(([artist, count]) => (
                        <div className="sets-track" key={artist}>
                          <span className="sets-track__name">{artist}</span>
                          <span className="sets-track__votes">{count}</span>
                        </div>
                      ))}
                    </div>

                    <div className="sets-stats__block">
                      <h3 className="sets-loose__title">Doing the rounds</h3>
                      <p className="sets-loose__hint">Records that turn up in more than one set.</p>
                      {stats.shared_tracks.length === 0 && <p className="sets-empty">—</p>}
                      {stats.shared_tracks.map(([title, artist, count]) => (
                        <div className="sets-track" key={`${artist}-${title}`}>
                          <span className="sets-track__name">
                            {artist && <span className="sets-track__artist">{artist} — </span>}
                            {title}
                          </span>
                          <span className="sets-track__votes">{count} sets</span>
                        </div>
                      ))}
                    </div>

                    <div className="sets-stats__block">
                      <h3 className="sets-loose__title">Most gaps</h3>
                      <p className="sets-loose__hint">
                        Where digging through the comments would pay off most.
                      </p>
                      {stats.most_unknowns.length === 0 && <p className="sets-empty">—</p>}
                      {stats.most_unknowns.map(([videoId, title, count]) => (
                        <button
                          type="button"
                          className="sets-hit"
                          key={videoId}
                          onClick={() => openStored(videoId)}
                        >
                          <span className="sets-track__name">{title}</span>
                          <span className="sets-track__votes">{count} IDs</span>
                        </button>
                      ))}
                    </div>

                    <div className="sets-stats__block">
                      <h3 className="sets-loose__title">Quota</h3>
                      <p className="sets-loose__hint">
                        {stats.quota.spent.toLocaleString()} of{' '}
                        {stats.quota.daily_limit.toLocaleString()} units spent today ·{' '}
                        {stats.quota.remaining.toLocaleString()} left · resets in{' '}
                        {Math.floor(stats.quota.seconds_until_reset / 3600)}h{' '}
                        {Math.floor((stats.quota.seconds_until_reset % 3600) / 60)}m
                      </p>
                    </div>
                  </div>
                </>
              )}
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
                      <StoreLinks artist={t.artist} title={t.title} mix={t.mix} />
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
