import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { confirm } from '@tauri-apps/plugin-dialog'
import { Icon } from '../Icon'
import { SetPage, type SetOpening } from '../sets/SetPage'
import { StoreLinks } from '../sets/StoreLinks'
import { SetsBox } from '../sets/SetsBox'
import { SetsLibrary } from '../sets/SetsLibrary'
import { tauriApi } from '../../lib/tauri-api'
import { analyse, type Track, type TracklistResult } from '../../lib/tracklist'
import { storeParsedSet } from '../../lib/tracklist/importSet'
import { matchTracklist, type MatchSummary } from '../../lib/tracklist/match'
import { describePreview, previewSet } from '../../lib/tracklist/preview'
import { looksLikeAChannel } from '../../lib/channelInput'
import type { Track as LibraryTrack } from '../../types/track'
import { getErrorMessage, isAppError } from '../../types/ai'
import { useSetPlayer } from '../../store/setPlayerStore'
import { useSetsView, type SetsTab } from '../../store/setsViewStore'
import { dismissToast, toast } from '../../lib/toast'
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
  TrackEcho,
  FollowedChannel,
  WatchedDj,
} from '../../types/youtube'
import { CHECK_INTERVALS } from '../../types/youtube'
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
  const [channelInput, setChannelInput] = useState('')
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
  /** A bare name typed into the Follow box, held back before it costs 100. */
  const [bareName, setBareName] = useState<string | null>(null)
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

  /** Adds a channel to follow. A handle or a link costs 2 units; a bare name
      falls through to search, which costs 100 — so paste a link where you can. */
  async function addChannel() {
    if (!channelInput.trim() || loading) return

    // Resolving a bare name ends in a search — 100 units — and returns the
    // DJ's own channel, where releases live rather than the sets they play.
    // Better to ask than to spend a hundred units on the wrong thing.
    if (!looksLikeAChannel(channelInput)) {
      setBareName(channelInput.trim())
      return
    }

    setLoading(true)
    setError(null)
    setBareName(null)
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
    const claim = ++shownSets.current
    try {
      const raw = await tauriApi.fetchYouTubeSet(videoId)
      const parsed = show(raw, claim)
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
   * Removes a set from the library, after asking: it has no Undo. A set that
   * is playing stops first; its page, if open, goes back to the library.
   */
  async function removeSet(videoId: string, title: string) {
    const sure = await confirm(`Remove "${title}" from your library? Its saved tracks go with it.`, {
      title: 'Remove from library',
      kind: 'warning',
    }).catch(() => false)
    if (!sure) return
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

  /** How many unseen sets the last check turned up (Following's summary). */
  const newCount = news?.reduce((total, item) => total + item.new_sets.length, 0) ?? 0
  /** Following's badge: the channels' news only — DJs' finds show in the Library. */
  const channelNews =
    news?.filter((item) => item.source !== 'dj').reduce((total, item) => total + item.new_sets.length, 0) ?? 0

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
          onRemove={summary ? () => void removeSet(summary.video_id, summary.title) : null}
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
                {(['library', 'saved', 'channels', 'stats'] as const).map((t: SetsTab) => (
                  <button
                    key={t}
                    type="button"
                    className="sets-home__tab"
                    aria-pressed={tab === t}
                    onClick={() => {
                      setTab(t)
                      // Another tab starts at its top.
                      if (libraryScroll.current) libraryScroll.current.scrollTop = 0
                    }}
                  >
                    {t === 'library'
                      ? `Library ${sets.length.toLocaleString('en-US')}${
                          newFinds && newFinds.total > 0 ? ` · ${newFinds.total} new` : ''
                        }`
                      : t === 'saved'
                        ? `Saved tracks ${saved.length.toLocaleString('en-US')}`
                        : t === 'channels'
                          ? 'Following'
                          : 'Stats'}
                    {t === 'channels' && channelNews > 0 && (
                      <span className="sets-home__badge">{channelNews}</span>
                    )}
                  </button>
                ))}
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

                  {bareName && (
                    <div className="sets-notice">
                      <span>
                        “{bareName}” looks like a name, not a channel. Following it would search for a
                        channel — <strong>100 units</strong> — and find their own channel, where
                        releases live rather than the sets they play.
                      </span>
                      <div className="sets-notice__actions">
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={() => {
                            setDjInput(bareName)
                            setChannelInput('')
                            setBareName(null)
                          }}
                        >
                          Watch {bareName} as a DJ
                        </button>
                        <button
                          type="button"
                          className="sets-filter__btn"
                          onClick={() => {
                            setBareName(null)
                            setLoading(true)
                            setError(null)
                            void tauriApi
                              .resolveYouTubeChannel(channelInput.trim())
                              .then((channel) => tauriApi.followYouTubeChannel(channel))
                              .then(() => {
                                setChannelInput('')
                                refreshLibrary()
                              })
                              .catch((err) => setError(getErrorMessage(err)))
                              .finally(() => {
                                setLoading(false)
                                refreshQuota()
                              })
                          }}
                        >
                          Search for a channel anyway · 100 units
                        </button>
                      </div>
                    </div>
                  )}

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
                              ? void openSet(item.video_id, { title: item.title })
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
                              onClick={() => void openSet(videoId, { title })}
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
            </>
          )}
        </div>
      </div>
    </div>
  )
}
