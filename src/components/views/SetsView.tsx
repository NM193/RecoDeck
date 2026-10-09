import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { confirm } from '@tauri-apps/plugin-dialog'
import { SetPage, type SetOpening } from '../sets/SetPage'
import { SetsBox } from '../sets/SetsBox'
import { SetsLibrary } from '../sets/SetsLibrary'
import { SetsFollowing } from '../sets/SetsFollowing'
import { SetsSaved } from '../sets/SetsSaved'
import { SetsStats } from '../sets/SetsStats'
import { SetsTabBar } from '../sets/SetsTabBar'
import { channelNewsCount, useChannelNews } from '../../store/channelNewsStore'
import { tauriApi } from '../../lib/tauri-api'
import { analyse, type Track, type TracklistResult } from '../../lib/tracklist'
import { storeParsedSet } from '../../lib/tracklist/importSet'
import { matchTracklist, type MatchSummary } from '../../lib/tracklist/match'
import { describePreview, previewSet } from '../../lib/tracklist/preview'
import { removeQuestion } from '../../lib/sets/setPage'
import type { Track as LibraryTrack } from '../../types/track'
import { getErrorMessage, isAppError } from '../../types/ai'
import { useSetPlayer } from '../../store/setPlayerStore'
import { useSetsView } from '../../store/setsViewStore'
import { dismissToast, toast } from '../../lib/toast'
import type {
  RawSet,
  SavedTrack,
  YouTubeQuotaStatus,
  YtSetSummary,
  YtStats,
  YtTrackHit,
  SetSearchHit,
  TrackEcho,
  FollowedChannel,
  WatchedDj,
} from '../../types/youtube'
import type { NewDjFind } from '../../types/home'
import './SetsView.css'

/** The new finds the library shows, newest first. */
const NEW_FINDS_MAX = 20

const trackKey = (t: { video_id?: string; cue_ms?: number; title: string }) =>
  `${t.video_id ?? ''}|${t.cue_ms ?? 0}|${t.title}`

interface SetsViewProps {
  onPlayTrack: (track: LibraryTrack, queue: LibraryTrack[], index: number) => void
  /**
   * A set to open on its page on arrival: Back from a DJ page opened from it,
   * a DJ page's set card, Home, Search, the set bar. Read once — App remounts
   * the view (`key`) to change it.
   */
  openVideoId?: string | null
  /**
   * Put in the box on arrival, not searched: a DJ page's Find more. Its free
   * results show; YouTube is searched only from the dropdown's last row,
   * which says what it costs.
   */
  initialQuery?: string
  /** Each DJ on the set's page opens their page; Back reopens this set. */
  onOpenDj?: (name: string, openVideoId: string | null) => void
  /** Opens on the Library tab: Home's Needs you, its New sets row. Read once, as openVideoId. */
  initialTab?: 'library'
}

export function SetsView({
  onPlayTrack,
  openVideoId,
  initialQuery,
  onOpenDj,
  initialTab,
}: SetsViewProps) {
  // Sets opens on its library, as it was left (tab, grouping, scroll); a set
  // opens on a page of its own over it, and Back returns to the library.
  const tab = useSetsView((s) => s.tab)
  const setTab = useSetsView((s) => s.setTab)
  const grouping = useSetsView((s) => s.grouping)
  const setGrouping = useSetsView((s) => s.setGrouping)
  const [view, setView] = useState<'library' | 'set'>(openVideoId ? 'set' : 'library')
  /** The set being read, or one that could not be; null once it is shown. */
  const [opening, setOpening] = useState<SetOpening | null>(
    openVideoId ? { videoId: openVideoId, title: null, error: null } : null,
  )
  /** Opened at a track (a hit, an echo): the cue its row is scrolled to. */
  const [focusCue, setFocusCue] = useState<number | null>(null)
  const [lookingAgain, setLookingAgain] = useState(false)
  const libraryScroll = useRef<HTMLDivElement>(null)
  /** The last "Couldn't read this set" toast: a retry replaces it rather than adding one. */
  const readError = useRef<number | null>(null)
  const [input, setInput] = useState(initialQuery ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<TracklistResult | null>(null)
  const [currentSet, setCurrentSet] = useState<RawSet | null>(null)
  const [quota, setQuota] = useState<YouTubeQuotaStatus | null>(null)
  const [sets, setSets] = useState<YtSetSummary[]>([])
  const [saved, setSaved] = useState<SavedTrack[]>([])
  /** Unseen finds of watched DJs' searches (Home's New sets), and how many in all. */
  const [newFinds, setNewFinds] = useState<{ finds: NewDjFind[]; total: number } | null>(null)
  const [stats, setStats] = useState<YtStats | null>(null)
  const [found, setFound] = useState<SetSearchHit[] | null>(null)
  /** What YouTube was searched for, for the results' heading. */
  const [foundQuery, setFoundQuery] = useState('')
  /** Counts the YouTube searches: one answering after Esc, or a newer one, is dropped. */
  const searchClaim = useRef(0)
  const [channels, setChannels] = useState<FollowedChannel[]>([])
  /**
   * Where else this set's records turn up, by row.
   *
   * Read from what is already stored, so it costs nothing and gets better every
   * time another set is saved.
   */
  const [echoes, setEchoes] = useState<Map<number, TrackEcho>>(new Map())
  /** What the last re-fetch changed, said plainly because it cost something. */
  const [reanalysed, setReanalysed] = useState<string | null>(null)
  /** Counts the sets opened: one arriving late yields to a newer one. */
  const shownSets = useRef(0)
  const [djs, setDjs] = useState<WatchedDj[]>([])
  /**
   * The whole library, loaded here rather than taken from the main view.
   *
   * App's track list holds whatever is on screen — one folder, one playlist —
   * so matching against it answered "do I have this in the folder I happen to
   * be looking at", which is not the question.
   */
  const [libraryTracks, setLibraryTracks] = useState<LibraryTrack[]>([])

  const refreshQuota = useCallback(() => {
    tauriApi.getYouTubeQuota().then(setQuota).catch(() => {})
  }, [])

  const refreshLibrary = useCallback(() => {
    tauriApi.listYouTubeSets().then(setSets).catch(() => {})
    tauriApi.getNewDjFinds(NEW_FINDS_MAX).then(setNewFinds).catch(() => {})
    tauriApi.listSavedYouTubeTracks().then(setSaved).catch(() => {})
    tauriApi.listYouTubeChannels().then(setChannels).catch(() => {})
    tauriApi.listYouTubeDjs().then(setDjs).catch(() => {})
  }, [])

  useEffect(() => {
    refreshQuota()
    refreshLibrary()
  }, [refreshQuota, refreshLibrary])

  /**
   * Opens a set on its page: at once with what is known (its title, its
   * thumbnail) and skeleton rows while it is read. A set that is not stored —
   * YouTube Music's Open in Sets, a new find, one deleted since — is fetched
   * (5–7 units) and stored, as a pasted link is; a stored one has its rows
   * filled in again (sets stored before the tracks table, or reparsed by a
   * better parser). At a track (a hit, an echo) it plays from that cue,
   * replacing the set playing, and scrolls to the row. A read that fails says
   * so on the page, with Try again, and in an error toast. Late, it gives way
   * to whatever was opened since.
   */
  const openSet = useCallback(
    async (videoId: string, how: { cueMs?: number; title?: string | null } = {}) => {
      const claim = ++shownSets.current
      const current = () => shownSets.current === claim
      setView('set')
      setOpening({ videoId, title: how.title ?? null, error: null })
      setFocusCue(how.cueMs ?? null)
      setReanalysed(null)
      let fetched = false
      try {
        let raw: RawSet
        try {
          raw = await tauriApi.getYouTubeSet(videoId)
        } catch (err) {
          if (!isAppError(err) || err.kind !== 'NotFound') throw err
          // Given up for a newer open: do not spend 5–7 units on it.
          if (!current()) return
          fetched = true
          raw = await tauriApi.fetchYouTubeSet(videoId)
        }
        const parsed = analyse(raw.video, raw.comments)
        if (current()) {
          setCurrentSet(raw)
          setResult(parsed)
          setOpening(null)
          if (how.cueMs !== undefined) useSetPlayer.getState().play(parsed, how.cueMs)
        }
        await storeParsedSet(raw, parsed)
        refreshLibrary()
      } catch (err) {
        if (!current()) return
        const message = getErrorMessage(err)
        setOpening({ videoId, title: how.title ?? null, error: message })
        if (readError.current !== null) dismissToast(readError.current)
        readError.current = toast(`Couldn't read this set: ${message}`, { kind: 'error' })
      } finally {
        if (fetched) refreshQuota()
      }
    },
    [refreshLibrary, refreshQuota],
  )

  // Arriving on a set: opened as from the library.
  useEffect(() => {
    if (openVideoId) void openSet(openVideoId)
    // Read once, when the view mounts (App remounts it for another start).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Home's New sets row opens the Library tab, before the first paint.
  useLayoutEffect(() => {
    if (initialTab) setTab(initialTab)
  }, [initialTab, setTab])

  /** Back to the library; a set still being read for the page is given up. */
  const showLibrary = useCallback(() => {
    shownSets.current++
    setView('library')
  }, [])

  // The sidebar's Sets, pressed while a set's page shows.
  useEffect(
    () =>
      useSetsView.subscribe((state, before) => {
        if (state.libraryRequests !== before.libraryRequests) showLibrary()
      }),
    [showLibrary],
  )

  // Back: the library where it was scrolled to, once its list is there to
  // scroll (on a fresh mount the list is still loading).
  const libraryLoaded = sets.length > 0 && newFinds !== null
  useLayoutEffect(() => {
    if (view === 'library' && libraryLoaded && libraryScroll.current) {
      libraryScroll.current.scrollTop = useSetsView.getState().scrollTop
    }
  }, [view, libraryLoaded])

  // A set shown here, however it was opened (the library, a link, a search
  // hit, a DJ page, Home), is no longer news on Home's New sets.
  const shownVideoId = currentSet?.video.id
  useEffect(() => {
    if (!shownVideoId) return
    tauriApi
      .markDjFindsSeen([shownVideoId])
      // Read again after the mark, so the library's card goes with it.
      .then(() => tauriApi.getNewDjFinds(NEW_FINDS_MAX))
      .then(setNewFinds)
      .catch(() => {})
  }, [shownVideoId])

  // Reloaded whenever the set changes, and whenever the library of sets grows —
  // a record with nowhere to go today may have somewhere tomorrow.
  useEffect(() => {
    const videoId = result?.video.id
    if (!videoId) {
      setEchoes(new Map())
      return
    }
    let live = true
    tauriApi
      .youtubeTrackEchoes(videoId)
      .then((rows) => {
        if (live) setEchoes(new Map(rows.map((echo) => [echo.position, echo])))
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [result?.video.id, sets.length])

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

  // The automatic check runs whether or not this view is open: App keeps the
  // channels' news (the channel news store) and the DJs' finds are stored, so
  // here the lists and the quota are only read again.
  useEffect(() => {
    const stop = listen('yt-new-sets', () => {
      refreshLibrary()
      refreshQuota()
    })
    return () => {
      void stop.then((unlisten) => unlisten())
    }
  }, [refreshLibrary, refreshQuota])

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
  // Hearts being taken off (unheart): a second press waits for the first.
  const unhearting = useRef(new Set<string>())

  /**
   * A set just fetched, on its page — unless something else was opened, or
   * Back pressed, since it was asked for (`claim`).
   */
  function show(raw: RawSet, claim: number): TracklistResult {
    const parsed = analyse(raw.video, raw.comments)
    if (shownSets.current !== claim) return parsed
    setReanalysed(null)
    setCurrentSet(raw)
    setResult(parsed)
    setOpening(null)
    setFocusCue(null)
    setView('set')
    return parsed
  }

  async function handleSearchSets(query: string) {
    if (loading) return
    const quotaLeft = quota?.remaining ?? 0
    // 100 for the search, and 1 more for the descriptions of everything it
    // returns — which is what lets the results say whether they hold a list.
    if (quotaLeft < 101) {
      setError(
        `Searching by name costs 101 units and only ${quotaLeft.toLocaleString()} are left today.`,
      )
      return
    }

    setLoading(true)
    setError(null)
    const claim = ++searchClaim.current
    try {
      const hits = await tauriApi.searchYouTubeSets(query)
      // Esc, an opened set or a newer search since: not shown.
      if (searchClaim.current !== claim) return
      setFound(hits)
      setFoundQuery(query)
    } catch (err) {
      if (searchClaim.current !== claim) return
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
    const claim = ++shownSets.current
    try {
      const raw = await tauriApi.fetchYouTubeSet(hit.videoId)
      const parsed = show(raw, claim)
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

  /** Fetches one upload and, when it came from a check, marks it as seen. */
  /**
   * `channelId` moves the channel's last-seen marker. A watched DJ has none —
   * its news comes from a dated search, not from a position in a listing.
   */
  async function importUpload(videoId: string, channelId?: string): Promise<boolean> {
    const claim = ++shownSets.current
    try {
      const raw = await tauriApi.fetchYouTubeSet(videoId)
      const parsed = show(raw, claim)
      await storeParsed(raw, parsed)
      if (channelId) await tauriApi.markYouTubeChannelSeen(channelId, videoId).catch(() => {})
      refreshLibrary()
      return true
    } catch (err) {
      toast(`Couldn't read this set: ${getErrorMessage(err)}`, { kind: 'error' })
      return false
    } finally {
      refreshQuota()
    }
  }

  /** Reopening a stored set never touches the network. */
  /**
   * Fetches the set again and parses what comes back.
   *
   * Reopening a stored set costs nothing and reparses the copy taken on the
   * day — which is the right thing when the parser has improved and the wrong
   * thing when the set itself has. Comments keep arriving: a set with nothing
   * on Monday can have somebody's full tracklist under it by Friday, and no
   * amount of reparsing the old copy will find it.
   *
   * So this is the one that spends: 5-7 units for a fresh fetch, and it says so
   * on the button.
   */
  async function reanalyse() {
    if (!result || lookingAgain) return
    const before = result.trackCount

    const quotaLeft = quota?.remaining ?? 0
    if (quotaLeft < 7) {
      toast(`Fetching a set again costs 5–7 units and only ${quotaLeft} are left today.`, {
        kind: 'warning',
      })
      return
    }

    setLookingAgain(true)
    setReanalysed(null)
    // Look again never takes the page: if another set was opened, or Back
    // pressed, by the time it answers, it is stored and said in a toast.
    const claim = shownSets.current
    const { id: videoId, title } = result.video
    try {
      const raw = await tauriApi.fetchYouTubeSet(videoId)
      const parsed = analyse(raw.video, raw.comments)
      // Playing, it plays on with the new rows.
      useSetPlayer.getState().replaceResult(parsed)
      // What it was worth saying plainly, since it just cost something.
      const said =
        parsed.trackCount === before
          ? `Nothing new — still ${before} ${before === 1 ? 'track' : 'tracks'}.`
          : `${before} → ${parsed.trackCount} tracks.`
      if (shownSets.current === claim) {
        setCurrentSet(raw)
        setResult(parsed)
        setReanalysed(said)
      } else {
        toast(`Looked again at ${title}: ${said}`, { kind: 'info' })
      }
      await storeParsed(raw, parsed)
      refreshLibrary()
    } catch (err) {
      toast(`Couldn't read this set again: ${getErrorMessage(err)}`, { kind: 'error' })
    } finally {
      setLookingAgain(false)
      refreshQuota()
    }
  }

  /**
   * Opens the set the record was found in, at the moment it was played there.
   *
   * The stored copy is reused, so this costs nothing — which is the whole point
   * of keeping the raw fetch.
   */
  function followEcho(echo: TrackEcho) {
    void openSet(echo.video_id, { cueMs: echo.cue_ms, title: echo.set_title })
  }

  /** Writes the parsed result next to the stored fetch. Costs no quota. */
  /** Shared with the automatic import, so both store a set the same way. */
  async function storeParsed(raw: RawSet, parsed: TracklistResult) {
    await storeParsedSet(raw, parsed)
  }

  /** Opens the set a search hit came from and jumps to the moment. */
  function openHit(hit: YtTrackHit) {
    void openSet(hit.video_id, { cueMs: hit.cue_ms, title: hit.set_title })
  }

  /**
   * Removes a set from the library, after asking: it has no Undo. The page's
   * menu asks in its place (`asked`); elsewhere a dialog asks. A set that is
   * playing stops first; its page, if open, goes back to the library.
   */
  async function removeSet(videoId: string, title: string, asked = false) {
    if (!asked) {
      const sure = await confirm(removeQuestion(title), {
        title: 'Remove from library',
        kind: 'warning',
      }).catch(() => false)
      if (!sure) return
    }
    if (useSetPlayer.getState().playing?.result.video.id === videoId) useSetPlayer.getState().stop()
    try {
      await tauriApi.deleteYouTubeSet(videoId)
    } catch (err) {
      toast(`Couldn't remove it: ${getErrorMessage(err)}`, { kind: 'error' })
      return
    }
    // Its page goes back to the library — also when the page could not read it.
    if (currentSet?.video.id === videoId || opening?.videoId === videoId) {
      setCurrentSet(null)
      setResult(null)
      setOpening(null)
      showLibrary()
    }
    refreshLibrary()
    toast('Removed from your library')
  }

  /**
   * Takes a heart off, with an Undo that hearts it again at its old
   * `saved_at`, so it goes back to its place in Saved tracks. A second press
   * before the list reads again is dropped (one toast, one Undo).
   */
  async function unheart(track: SavedTrack) {
    const key = trackKey(track)
    if (unhearting.current.has(key)) return
    unhearting.current.add(key)
    try {
      await tauriApi.deleteSavedYouTubeTrack(track.video_id, track.cue_ms, track.title)
    } catch (err) {
      unhearting.current.delete(key)
      toast(`Couldn't remove it: ${getErrorMessage(err)}`, { kind: 'error' })
      return
    }
    // The list without it, before another press could find it there again.
    await tauriApi.listSavedYouTubeTracks().then(setSaved).catch(() => {})
    unhearting.current.delete(key)
    refreshLibrary()
    toast(`Removed "${track.title}" from Saved tracks`, {
      action: {
        label: 'Undo',
        run: () =>
          void tauriApi
            .saveYouTubeTrack(track)
            .then(refreshLibrary)
            .catch((err) => toast(`Couldn't undo: ${getErrorMessage(err)}`, { kind: 'error' })),
      },
    })
  }

  async function toggleSave(track: Track) {
    if (!currentSet) return
    const key = trackKey({ video_id: currentSet.video.id, cue_ms: track.cueMs, title: track.title })

    const hearted = saved.find((t) => trackKey(t) === key)
    if (hearted) {
      await unheart(hearted)
      return
    }
    await tauriApi
      .saveYouTubeTrack({
        video_id: currentSet.video.id,
        cue_ms: track.cueMs,
        cue: track.cue,
        artist: track.artist ?? undefined,
        title: track.title,
        mix: track.mix ?? undefined,
      })
      .catch((err) => toast(`Couldn't save it: ${getErrorMessage(err)}`, { kind: 'error' }))
    refreshLibrary()
  }

  function playFromSet(track: LibraryTrack) {
    const index = ownedQueue.findIndex((t) => t.id === track.id)
    onPlayTrack(track, ownedQueue, index < 0 ? 0 : index)
  }

  /**
   * The tempo of each record the user owns, so the strip can carry the shape of
   * the set rather than a row of equal blocks.
   *
   * Read off the matched library file: 97% of the library is analysed, and the
   * record's own tempo is the only figure that exists without decoding the
   * video. A DJ pitches, so this is the record's tempo, not the night's.
   */
  const bpmByIndex = useMemo(() => {
    const byIndex = new Map<number, number>()
    if (!matches) return byIndex
    for (const [index, match] of matches.byIndex) {
      const bpm = match.track.bpm
      if (typeof bpm === 'number' && bpm > 0) byIndex.set(index, bpm)
    }
    return byIndex
  }, [matches])

  /** Following's badge: the channels' news only — DJs' finds show in the Library. */
  const newsByChannel = useChannelNews((state) => state.byChannel)
  const channelNews = useMemo(
    () => channelNewsCount(newsByChannel, new Set(channels.map((c) => c.channel_id))),
    [newsByChannel, channels],
  )

  /**
   * Mark all seen on the library's new finds, as on Home: its Undo marks
   * exactly the rows it changed unseen again.
   */
  async function markAllFindsSeen() {
    try {
      const rows = await tauriApi.markAllDjFindsSeen()
      refreshLibrary()
      const count = new Set(rows.map((row) => row.videoId)).size
      if (count === 0) return
      toast(`${count.toLocaleString('en-US')} ${count === 1 ? 'set' : 'sets'} marked seen`, {
        action: {
          label: 'Undo',
          run: () => {
            tauriApi
              .markDjFindsUnseen(rows)
              .then(refreshLibrary)
              .catch((err) => toast(`Couldn't undo: ${getErrorMessage(err)}`, { kind: 'error' }))
          },
        },
      })
    } catch (err) {
      toast(`Couldn't mark the sets seen: ${getErrorMessage(err)}`, { kind: 'error' })
    }
  }

  /** The box cleared: YouTube's results go and the library is back. */
  function clearBox() {
    searchClaim.current++
    setInput('')
    setFound(null)
    setError(null)
  }

  if (view === 'set') {
    const shownId = opening?.videoId ?? currentSet?.video.id ?? null
    const summary = shownId ? sets.find((s) => s.video_id === shownId) : undefined
    return (
      <div className="sets-view">
        <SetPage
          // Another set is another page: its filter starts on All.
          key={shownId ?? ''}
          result={opening ? null : result}
          // While it reads, the title the library knows, if the opener did not.
          opening={opening && !opening.title && summary ? { ...opening, title: summary.title } : opening}
          savedAt={summary?.added_at ?? null}
          matches={opening ? null : matches}
          echoes={echoes}
          isSaved={(track) =>
            savedKeys.has(trackKey({ video_id: currentSet?.video.id, cue_ms: track.cueMs, title: track.title }))
          }
          bpmByIndex={bpmByIndex}
          notice={reanalysed}
          lookingAgain={lookingAgain}
          focusCue={focusCue}
          onBack={showLibrary}
          onRetry={() => opening && void openSet(opening.videoId, { title: opening.title })}
          onOpenDj={onOpenDj ? (name) => onOpenDj(name, currentSet?.video.id ?? null) : undefined}
          onPlayFile={playFromSet}
          onToggleSave={toggleSave}
          onFollowEcho={followEcho}
          onLookAgain={() => void reanalyse()}
          // A set in the library can be removed even when it cannot be read.
          onRemove={summary ? (asked) => void removeSet(summary.video_id, summary.title, asked) : null}
        />
      </div>
    )
  }

  return (
    <div className="sets-view">
      <div
        className="sets-view__scroll"
        ref={libraryScroll}
        onScroll={(e) => useSetsView.getState().setScrollTop(e.currentTarget.scrollTop)}
      >
        <div className="sets-view__container">
          <SetsBox
            value={input}
            onChange={(value) => {
              setInput(value)
              setError(null)
              // Clearing the box returns to the library.
              if (!value.trim()) setFound(null)
            }}
            sets={sets}
            quota={quota}
            busy={loading}
            error={error}
            autoFocus={Boolean(initialQuery)}
            onOpenSet={(videoId, title) => {
              clearBox()
              void openSet(videoId, { title })
            }}
            onOpenHit={(hit) => {
              clearBox()
              openHit(hit)
            }}
            onSearchYouTube={(query) => void handleSearchSets(query)}
            onClear={clearBox}
          />

          {/* YouTube's results replace the page below the box, until it is
              cleared (Esc, or emptied). */}
          {found ? (
            <>
              <div className="sets-home__found-head">
                <span>
                  {found.length === 0
                    ? `No long videos found for “${foundQuery}”.`
                    : `${found.length} ${found.length === 1 ? 'set' : 'sets'} found on YouTube for “${foundQuery}” — opening one costs 5–7 units`}
                </span>
                <button type="button" className="link-btn" onClick={clearBox}>
                  Back to your library
                </button>
              </div>
            {found.map((hit) => {
              // Read from the description that came back with the search,
              // by the same rules that parse a stored set.
              const preview = previewSet(hit)
              const stored = sets.some((s) => s.video_id === hit.videoId)
              return (
                <button
                  type="button"
                  className="sets-found"
                  key={hit.videoId}
                  // A set already in the library opens at no cost.
                  onClick={() =>
                    stored ? void openSet(hit.videoId, { title: hit.title }) : processFound(hit)
                  }
                >
                  {hit.thumbnail && (
                    <img className="sets-found__thumb" src={hit.thumbnail} alt="" />
                  )}
                  <span className="sets-found__text">
                    <span className="sets-stored__title">{hit.title}</span>
                    <span className="sets-stored__meta">
                      {hit.channel} · {hit.publishedAt.slice(0, 10)}
                      {preview.durationMs
                        ? ` · ${Math.round(preview.durationMs / 60000)} min`
                        : ''}
                    </span>
                    <span
                      className={`sets-found__promise ${
                        preview.trackCount > 0 ? 'sets-found__promise--found' : ''
                      }`}
                    >
                      {stored ? 'in your library' : describePreview(preview)}
                    </span>
                  </span>
                </button>
              )
            })}
            </>
          ) : (
            <>
              <div className="sets-home__tabs">
                <SetsTabBar
                  tab={tab}
                  onTab={(t) => {
                    setTab(t)
                    // Another tab starts at its top.
                    if (libraryScroll.current) libraryScroll.current.scrollTop = 0
                  }}
                  library={sets.length}
                  newFinds={newFinds?.total ?? 0}
                  saved={saved.length}
                  channelNews={channelNews}
                />
                {tab === 'library' && sets.length > 0 && (
                  <>
                    <span className="sets-home__spacer" />
                    <button
                      type="button"
                      className="sets-home__group-btn"
                      aria-pressed={grouping === 'dj'}
                      onClick={() => setGrouping('dj')}
                    >
                      By DJ
                    </button>
                    <button
                      type="button"
                      className="sets-home__group-btn"
                      aria-pressed={grouping === 'recent'}
                      onClick={() => setGrouping('recent')}
                    >
                      Newest
                    </button>
                  </>
                )}
              </div>

              <div role="tabpanel" id="sets-panel" aria-labelledby={`sets-tab-${tab}`}>
                {tab === 'library' && (
                  <SetsLibrary
                    sets={sets}
                    newFinds={newFinds?.finds ?? []}
                    grouping={grouping}
                    onOpenSet={(videoId, title) => void openSet(videoId, { title })}
                    onOpenDj={onOpenDj ? (name) => onOpenDj(name, null) : undefined}
                    onMarkAllSeen={() => void markAllFindsSeen()}
                  />
                )}

                {tab === 'channels' && (
                  <SetsFollowing
                    djs={djs}
                    channels={channels}
                    quota={quota}
                    onChanged={refreshLibrary}
                    onQuotaChanged={refreshQuota}
                    onPatchDj={(nameKey, patch) =>
                      setDjs((current) => current.map((d) => (d.name_key === nameKey ? { ...d, ...patch } : d)))
                    }
                    onPatchChannel={(channelId, patch) =>
                      setChannels((current) =>
                        current.map((c) => (c.channel_id === channelId ? { ...c, ...patch } : c)),
                      )
                    }
                    onOpenSet={(videoId, title) => void openSet(videoId, { title })}
                    onImport={importUpload}
                    onOpenDj={onOpenDj ? (name) => onOpenDj(name, null) : undefined}
                  />
                )}

                {tab === 'stats' && (
                  <SetsStats
                    stats={stats}
                    quota={quota}
                    onOpenSet={(videoId, title) => void openSet(videoId, { title })}
                  />
                )}

                {tab === 'saved' && (
                  <SetsSaved
                    saved={saved}
                    onOpenAt={(videoId, cueMs, title) => void openSet(videoId, { cueMs, title })}
                    onRemove={(track) => void unheart(track)}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
