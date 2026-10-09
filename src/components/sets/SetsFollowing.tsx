// src/components/sets/SetsFollowing.tsx
// Sets' Following tab (Sets redesign spec, Following): one box to follow a
// channel or watch a DJ by name, then the DJs you watch and the channels you
// follow, each row with its check interval, Check now and a way to stop; a
// row opens to what has been found for it. A DJ's finds land on the
// library's New from DJs you watch; a channel's news shows under its row for
// this session (the channel news store), until opened or dismissed.
import { useEffect, useRef, useState } from 'react'
import { Icon } from '../Icon'
import { SelectMenu } from '../SelectMenu'
import { ToggleSwitch } from '../settings/ToggleSwitch'
import { tauriApi } from '../../lib/tauri-api'
import { looksLikeAChannel } from '../../lib/channelInput'
import { localDay } from '../../lib/dj/gigs'
import { djHue, djInitials } from '../../lib/search/labels'
import { channelCheckMessage, checkedLabel, djCheckMessage } from '../../lib/sets/following'
import { toast } from '../../lib/toast'
import { useChannelNews } from '../../store/channelNewsStore'
import { getErrorMessage } from '../../types/ai'
import {
  CHECK_INTERVALS,
  type ChannelUpload,
  type FollowedChannel,
  type WatchedDj,
  type YouTubeQuotaStatus,
} from '../../types/youtube'
import './SetsTabs.css'

const INTERVAL_OPTIONS = CHECK_INTERVALS.map((option) => ({ value: String(option.hours), label: option.label }))

interface SetsFollowingProps {
  djs: WatchedDj[]
  channels: FollowedChannel[]
  quota: YouTubeQuotaStatus | null
  /** Something was followed, watched, checked or let go: read the lists (and the library's finds) again. */
  onChanged: () => void
  onQuotaChanged: () => void
  /** Shown at once while the write goes through, so a row does not flicker back. */
  onPatchDj: (nameKey: string, patch: Partial<WatchedDj>) => void
  onPatchChannel: (channelId: string, patch: Partial<FollowedChannel>) => void
  /** A stored set: its page. */
  onOpenSet: (videoId: string, title: string) => void
  /**
   * Not stored: fetched (5–7 units), stored and opened; from a channel, its
   * last-seen marker moves there. Answers whether it worked.
   */
  onImport: (videoId: string, channelId?: string) => Promise<boolean>
  onOpenDj?: (name: string) => void
}

/** A row opened to what has been found for it; `items` is null while it reads. */
interface Opened {
  key: string
  items: ChannelUpload[] | null
}

export function SetsFollowing({
  djs,
  channels,
  quota,
  onChanged,
  onQuotaChanged,
  onPatchDj,
  onPatchChannel,
  onOpenSet,
  onImport,
  onOpenDj,
}: SetsFollowingProps) {
  const [input, setInput] = useState('')
  /** A bare name in the box: watch it as a DJ, or pay 100 units to look for a channel. */
  const [bareName, setBareName] = useState<string | null>(null)
  // What is being worked on lives in the store, so a check still running
  // keeps its buttons disabled after a trip to another tab.
  const busy = useChannelNews((s) => s.busy)
  const setBusy = useChannelNews((s) => s.setBusy)
  const [opened, setOpenedState] = useState<Opened | null>(null)
  /** Counts the rows opened and closed: an answer for a row since closed, or replaced, is dropped. */
  const openClaim = useRef(0)
  const openedKey = useRef<string | null>(null)
  const setOpened = (next: Opened | null) => {
    openedKey.current = next?.key ?? null
    setOpenedState(next)
  }
  const [photos, setPhotos] = useState<Map<string, string>>(new Map())
  const news = useChannelNews((s) => s.byChannel)

  // The DJs' photos, as Search and Home show them (read-only: no profile is made).
  const djKeys = djs.map((dj) => dj.name_key).join('\n')
  useEffect(() => {
    if (!djKeys) return
    let live = true
    tauriApi
      .getKnownDjs(localDay(new Date()))
      .then((known) => {
        if (live) setPhotos(new Map(known.flatMap((dj) => (dj.imageUrl ? [[dj.nameKey, dj.imageUrl]] : []))))
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [djKeys])

  const left = quota?.remaining ?? 0
  const failed = (what: string) => (err: unknown) => toast(`${what}: ${getErrorMessage(err)}`, { kind: 'error' })

  async function follow() {
    const text = input.trim()
    if (!text || busy) return
    // A bare name would be searched for — 100 units — and find the DJ's own
    // channel, where releases live rather than the sets they play: ask first.
    if (!looksLikeAChannel(text)) {
      setBareName(text)
      return
    }
    await followChannel(text)
  }

  async function followChannel(text: string) {
    setBusy('follow')
    setBareName(null)
    try {
      const channel = await tauriApi.resolveYouTubeChannel(text)
      // Following again would reset its interval and its last-seen marker.
      if (channels.some((c) => c.channel_id === channel.channelId)) {
        toast(`Already following ${channel.title ?? channel.channelId}`, { kind: 'info' })
        setInput('')
        return
      }
      await tauriApi.followYouTubeChannel(channel)
      setInput('')
      onChanged()
    } catch (err) {
      failed("Couldn't follow it")(err)
    } finally {
      setBusy(null)
      onQuotaChanged()
    }
  }

  /** A bare name looked up as a channel: 100 units, so the quota is checked first. */
  async function searchChannelAnyway(name: string) {
    if (left < 100) {
      toast(`Searching for a channel costs 100 units and only ${left.toLocaleString('en-US')} are left today.`, {
        kind: 'warning',
      })
      return
    }
    await followChannel(name)
  }

  async function watchDj(name: string) {
    setBareName(null)
    // Watching again would reset their interval, auto-import and last check.
    if (djs.some((dj) => dj.name_key === name.trim().toLowerCase())) {
      toast(`Already watching ${name}`, { kind: 'info' })
      setInput('')
      return
    }
    try {
      await tauriApi.watchYouTubeDj(name)
      setInput('')
      onChanged()
    } catch (err) {
      failed("Couldn't watch them")(err)
    }
  }

  async function checkDjs(dj: WatchedDj | null) {
    const count = dj ? 1 : djs.length
    if (left < count * 100) {
      toast(
        `Searching for ${count} ${count === 1 ? 'DJ' : 'DJs'} costs ${(count * 100).toLocaleString('en-US')} units and only ${left.toLocaleString('en-US')} are left today.`,
        { kind: 'warning' },
      )
      return
    }
    setBusy(dj ? dj.name_key : 'djs')
    try {
      const found = dj ? await tauriApi.checkYouTubeDj(dj.name_key) : await tauriApi.checkYouTubeDjs()
      toast(djCheckMessage(found, dj?.display_name ?? null), { kind: 'info' })
      // Its row, if it is open now, shows what this search added.
      if (dj && openedKey.current === dj.name_key) void openDj(dj)
      onChanged()
    } catch (err) {
      failed("Couldn't search")(err)
    } finally {
      setBusy(null)
      onQuotaChanged()
    }
  }

  async function checkChannels(channel: FollowedChannel | null) {
    setBusy(channel ? channel.channel_id : 'channels')
    try {
      const found = channel
        ? await tauriApi.checkYouTubeChannel(channel.channel_id)
        : await tauriApi.checkYouTubeChannels()
      useChannelNews.getState().add(found)
      toast(channelCheckMessage(found, channel ? (channel.title ?? channel.channel_id) : null), { kind: 'info' })
      onChanged()
    } catch (err) {
      failed("Couldn't check")(err)
    } finally {
      setBusy(null)
      onQuotaChanged()
    }
  }

  function closeRow() {
    openClaim.current++
    setOpened(null)
  }

  /** Everything a DJ's searches have turned up, seen or not: free, read from disk. */
  async function openDj(dj: WatchedDj) {
    const claim = ++openClaim.current
    // Already open (a search just ended): its rows stay until the new ones come.
    if (openedKey.current !== dj.name_key) setOpened({ key: dj.name_key, items: null })
    try {
      const items = await tauriApi.listYouTubeDjFinds(dj.name_key)
      if (openClaim.current === claim) setOpened({ key: dj.name_key, items })
    } catch (err) {
      if (openClaim.current !== claim) return
      setOpened(null)
      failed("Couldn't read what was found")(err)
    }
  }

  /** A channel's recent long uploads (one to two units). */
  async function openChannel(channel: FollowedChannel) {
    if (!channel.uploads_id) return
    const claim = ++openClaim.current
    setOpened({ key: channel.channel_id, items: null })
    try {
      const items = await tauriApi.listYouTubeChannelUploads(channel.uploads_id, 25)
      if (openClaim.current === claim) setOpened({ key: channel.channel_id, items })
    } catch (err) {
      if (openClaim.current !== claim) return
      setOpened(null)
      failed("Couldn't read its uploads")(err)
    } finally {
      onQuotaChanged()
    }
  }

  async function take(upload: ChannelUpload, channelId?: string) {
    if (upload.already_stored) {
      onOpenSet(upload.video_id, upload.title)
      return
    }
    setBusy(upload.video_id)
    try {
      // A fetch that failed leaves it in the news, to try again.
      if ((await onImport(upload.video_id, channelId)) && channelId) {
        useChannelNews.getState().take(channelId, upload.video_id)
      }
    } finally {
      setBusy(null)
    }
  }

  /**
   * Dismissed: the channel is marked seen up to the newest upload its checks
   * turned up, as today — never an older one than a set already opened.
   */
  async function dismiss(channelId: string, uploads: ChannelUpload[]) {
    const newest = useChannelNews.getState().newest[channelId] ?? uploads[0]
    useChannelNews.getState().dismiss(channelId)
    if (newest) await tauriApi.markYouTubeChannelSeen(channelId, newest.video_id).catch(failed("Couldn't dismiss it"))
  }

  /** What an opened row says when nothing is there: "nothing found" and "never looked" are different answers. */
  function emptyNote(key: string): string {
    const dj = djs.find((d) => d.name_key === key)
    if (!dj) return 'No long uploads found.'
    if (dj.last_checked) return 'Searched, and nothing has turned up yet.'
    return `Not searched yet — ${
      dj.check_interval_hours === 0 ? 'set how often, or press Check now' : 'the next automatic search will pick this up'
    }.`
  }

  function setAutoImport(dj: WatchedDj, checked: boolean) {
    onPatchDj(dj.name_key, { auto_import: checked })
    void tauriApi.setYouTubeDjAutoImport(dj.name_key, checked).catch((err) => {
      failed("Couldn't change it")(err)
      onChanged()
    })
  }

  const uploadRows = (items: ChannelUpload[], channelId?: string) =>
    items.map((item) => (
      <button
        key={item.video_id}
        type="button"
        className="follow-upload"
        // One fetch at a time: 5–7 units each.
        disabled={busy !== null}
        onClick={() => void take(item, channelId)}
      >
        <span className="follow-upload__title" title={item.title}>
          {item.title}
        </span>
        <span className="follow-upload__meta">
          {item.published_at.slice(0, 10)}
          {item.duration_ms ? ` · ${Math.round(item.duration_ms / 60000)} min` : ''}
        </span>
        <span className="follow-upload__side">
          {busy === item.video_id ? 'reading…' : item.already_stored ? 'in your library' : 'get it · 5–7 units'}
        </span>
      </button>
    ))

  const openedRows = (key: string, channelId?: string) =>
    opened?.key === key && (
      <div className="follow-row__opened">
        {opened.items === null ? (
          <p className="follow-note">Reading…</p>
        ) : opened.items.length === 0 ? (
          <p className="follow-note">{emptyNote(key)}</p>
        ) : (
          uploadRows(opened.items, channelId)
        )}
      </div>
    )

  const now = new Date()

  return (
    <div className="follow">
      <div className="follow-box">
        <input
          className="follow-box__input"
          placeholder="Follow a channel, or watch a DJ by name"
          aria-label="Follow a channel, or watch a DJ by name"
          value={input}
          onChange={(e) => {
            setInput(e.target.value)
            setBareName(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) void follow()
          }}
        />
        <button type="button" className="btn btn--primary" disabled={!input.trim() || busy !== null} onClick={() => void follow()}>
          {busy === 'follow' ? 'Following…' : 'Follow'}
        </button>
      </div>
      <p className="follow-note">
        A channel link or @handle follows the channel (2 units). A name watches a DJ: their sets land on
        other people&apos;s channels, so they are searched for by name (100 units a search).
      </p>
      {bareName && (
        <div className="follow-choice">
          <span>&ldquo;{bareName}&rdquo; looks like a name, not a channel.</span>
          <button type="button" className="btn btn--primary" onClick={() => void watchDj(bareName)}>
            Watch &ldquo;{bareName}&rdquo; as a DJ
          </button>
          <button type="button" className="btn" disabled={busy !== null} onClick={() => void searchChannelAnyway(bareName)}>
            Search for a channel anyway · 100 units
          </button>
        </div>
      )}

      <section className="follow-section">
        <div className="sets-home__head">
          <h2 className="sets-home__heading">DJs you watch</h2>
          {djs.length > 0 && (
            <button type="button" className="btn btn--sm" disabled={busy !== null} onClick={() => void checkDjs(null)}>
              {busy === 'djs' ? 'Searching…' : `Search all now · ${(djs.length * 100).toLocaleString('en-US')} units`}
            </button>
          )}
        </div>
        {djs.length === 0 && <p className="follow-note">No DJs watched yet — type a name in the box above.</p>}
        {djs.map((dj) => {
          const photo = photos.get(dj.name_key)
          return (
            <div className="follow-row" key={dj.name_key}>
              <div className="follow-row__main">
                <span
                  className="follow-row__photo"
                  aria-hidden="true"
                  style={photo ? undefined : { filter: `hue-rotate(${djHue(dj.display_name)}deg)` }}
                >
                  {photo ? <img src={photo} alt="" loading="lazy" draggable={false} /> : djInitials(dj.display_name)}
                </span>
                <span className="follow-row__text">
                  {onOpenDj ? (
                    <button type="button" className="follow-row__name" onClick={() => onOpenDj(dj.display_name)}>
                      {dj.display_name}
                    </button>
                  ) : (
                    <span className="follow-row__name">{dj.display_name}</span>
                  )}
                  <span className="follow-row__meta">{checkedLabel(dj.last_checked, now)}</span>
                </span>
                <button
                  type="button"
                  className="btn btn--sm"
                  aria-label={`Search for ${dj.display_name} now, 100 units`}
                  disabled={busy !== null}
                  onClick={() => void checkDjs(dj)}
                >
                  {busy === dj.name_key ? 'Searching…' : 'Check now · 100 units'}
                </button>
                <button
                  type="button"
                  className="btn btn--sm follow-row__icon"
                  aria-expanded={opened?.key === dj.name_key}
                  aria-label={`Everything found for ${dj.display_name}`}
                  onClick={() => (opened?.key === dj.name_key ? closeRow() : void openDj(dj))}
                >
                  <Icon name={opened?.key === dj.name_key ? 'ChevronUp' : 'ChevronDown'} size={14} />
                </button>
                <button
                  type="button"
                  className="btn btn--sm follow-row__icon"
                  aria-label={`Stop watching ${dj.display_name}`}
                  disabled={busy === dj.name_key}
                  onClick={() => void tauriApi.unwatchYouTubeDj(dj.name_key).then(onChanged, failed("Couldn't stop watching"))}
                >
                  <Icon name="X" size={14} />
                </button>
              </div>
              <div className="follow-row__settings">
                <span className="follow-row__label">checks</span>
                <SelectMenu
                  label={`How often ${dj.display_name} is searched for`}
                  value={String(dj.check_interval_hours)}
                  options={INTERVAL_OPTIONS}
                  onChange={(value) => {
                    if (Number(value) === dj.check_interval_hours) return
                    onPatchDj(dj.name_key, { check_interval_hours: Number(value) })
                    void tauriApi.setYouTubeDjInterval(dj.name_key, Number(value)).catch((err) => {
                      failed("Couldn't change it")(err)
                      onChanged()
                    })
                  }}
                />
                <ToggleSwitch
                  checked={dj.auto_import}
                  label={`Fetch ${dj.display_name}'s new sets automatically`}
                  onChange={(checked) => setAutoImport(dj, checked)}
                />
                {/* The words toggle it too; the switch carries the name for screen readers. */}
                <span
                  className="follow-row__label follow-row__label--click"
                  aria-hidden="true"
                  onClick={() => setAutoImport(dj, !dj.auto_import)}
                >
                  fetch new sets automatically
                </span>
              </div>
              {openedRows(dj.name_key)}
            </div>
          )
        })}
      </section>

      <section className="follow-section">
        <div className="sets-home__head">
          <h2 className="sets-home__heading">Channels you follow</h2>
          {channels.length > 0 && (
            <button type="button" className="btn btn--sm" disabled={busy !== null} onClick={() => void checkChannels(null)}>
              {busy === 'channels' ? 'Checking…' : 'Check all · 1–2 units each'}
            </button>
          )}
        </div>
        {channels.length === 0 && <p className="follow-note">Not following a channel yet — paste one in the box above.</p>}
        {channels.map((channel) => {
          const name = channel.title ?? channel.channel_id
          const fresh = news[channel.channel_id] ?? []
          return (
            <div className="follow-row follow-row--channel" key={channel.channel_id}>
              <div className="follow-row__main">
                <span className="follow-row__text">
                  <span className="follow-row__name">{name}</span>
                  <span className="follow-row__meta">
                    {channel.handle ? `@${channel.handle} · ` : ''}
                    {checkedLabel(channel.last_checked, now)}
                  </span>
                </span>
                <button
                  type="button"
                  className="btn btn--sm"
                  aria-label={`Check ${name} now, 1–2 units`}
                  disabled={busy !== null}
                  onClick={() => void checkChannels(channel)}
                >
                  {busy === channel.channel_id ? 'Checking…' : 'Check now · 1–2 units'}
                </button>
                <button
                  type="button"
                  className="btn btn--sm follow-row__icon"
                  aria-expanded={opened?.key === channel.channel_id}
                  aria-label={`${name}'s recent uploads (1–2 units)`}
                  disabled={!channel.uploads_id}
                  onClick={() => (opened?.key === channel.channel_id ? closeRow() : void openChannel(channel))}
                >
                  <Icon name={opened?.key === channel.channel_id ? 'ChevronUp' : 'ChevronDown'} size={14} />
                </button>
                <button
                  type="button"
                  className="btn btn--sm follow-row__icon"
                  aria-label={`Stop following ${name}`}
                  disabled={busy === channel.channel_id}
                  onClick={() => {
                    // Its news goes with it.
                    useChannelNews.getState().dismiss(channel.channel_id)
                    void tauriApi.unfollowYouTubeChannel(channel.channel_id).then(onChanged, failed("Couldn't stop following"))
                  }}
                >
                  <Icon name="X" size={14} />
                </button>
              </div>
              <div className="follow-row__settings">
                <span className="follow-row__label">checks</span>
                <SelectMenu
                  label={`How often ${name} is checked`}
                  value={String(channel.check_interval_hours)}
                  options={INTERVAL_OPTIONS}
                  onChange={(value) => {
                    if (Number(value) === channel.check_interval_hours) return
                    onPatchChannel(channel.channel_id, { check_interval_hours: Number(value) })
                    void tauriApi.setYouTubeChannelInterval(channel.channel_id, Number(value)).catch((err) => {
                      failed("Couldn't change it")(err)
                      onChanged()
                    })
                  }}
                />
              </div>
              {fresh.length > 0 && (
                <div className="follow-row__news">
                  <div className="follow-row__news-head">
                    <span className="follow-row__news-count">
                      {fresh.length} new {fresh.length === 1 ? 'set' : 'sets'}
                    </span>
                    <button type="button" className="link-btn" onClick={() => void dismiss(channel.channel_id, fresh)}>
                      Dismiss
                    </button>
                  </div>
                  {uploadRows(fresh, channel.channel_id)}
                </div>
              )}
              {openedRows(channel.channel_id, channel.channel_id)}
            </div>
          )
        })}
      </section>
    </div>
  )
}
