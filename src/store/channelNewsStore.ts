// src/store/channelNewsStore.ts
// Following's state that must outlive the tab (Sets redesign spec,
// Following): the channels' news of this session — the new uploads a check
// turned up, under their channel, until each is opened or the channel's
// news is dismissed — and the check or fetch running now. Kept in App's
// reach, not in Sets, so news from a background check (App's `yt-new-sets`
// listener) is there when the toast says "see Sets › Following", it survives
// tab switches, set pages and trips out of Sets, and a check still running
// keeps its buttons disabled when you come back (a second press would spend
// its units again). A DJ's finds are not kept here: they are stored, and show
// on the library's New from DJs you watch.
import { create } from 'zustand'
import type { ChannelNews, ChannelUpload } from '../types/youtube'

interface ChannelNewsState {
  /** By channel id, newest check's uploads first, each video once. */
  byChannel: Record<string, ChannelUpload[]>
  /** By channel id, the newest upload its checks turned up: what Dismiss marks seen. */
  newest: Record<string, ChannelUpload>
  /** What Following is working on: a row's key, an upload's id, 'djs', 'channels', 'follow'. */
  busy: string | null
  /** A check's news: the channels' is kept; a DJ's is not. */
  add: (news: readonly ChannelNews[]) => void
  /** An upload opened or fetched: it is no longer news. */
  take: (channelId: string, videoId: string) => void
  /** Dismissed, or the channel unfollowed: its news goes. */
  dismiss: (channelId: string) => void
  setBusy: (busy: string | null) => void
}

const later = (a: ChannelUpload, b: ChannelUpload) => (a.published_at > b.published_at ? a : b)

export const useChannelNews = create<ChannelNewsState>((set) => ({
  byChannel: {},
  newest: {},
  busy: null,
  add: (news) =>
    set((state) => {
      const byChannel = { ...state.byChannel }
      const newest = { ...state.newest }
      for (const item of news) {
        if (item.source !== 'channel' || item.new_sets.length === 0) continue
        const before = byChannel[item.channel_id] ?? []
        const fresh = item.new_sets.filter((upload) => !before.some((b) => b.video_id === upload.video_id))
        byChannel[item.channel_id] = [...fresh, ...before]
        newest[item.channel_id] = item.new_sets.reduce(later, newest[item.channel_id] ?? item.new_sets[0])
      }
      return { byChannel, newest }
    }),
  take: (channelId, videoId) =>
    set((state) => {
      const left = (state.byChannel[channelId] ?? []).filter((upload) => upload.video_id !== videoId)
      const byChannel = { ...state.byChannel }
      if (left.length > 0) byChannel[channelId] = left
      else delete byChannel[channelId]
      return { byChannel }
    }),
  dismiss: (channelId) =>
    set((state) => {
      const byChannel = { ...state.byChannel }
      const newest = { ...state.newest }
      delete byChannel[channelId]
      delete newest[channelId]
      return { byChannel, newest }
    }),
  setBusy: (busy) => set({ busy }),
}))

/**
 * How many uploads are news: the Following tab's badge. Only the channels
 * still followed count (`followed`, when given).
 */
export function channelNewsCount(
  byChannel: Record<string, ChannelUpload[]>,
  followed?: ReadonlySet<string>,
): number {
  return Object.entries(byChannel).reduce(
    (total, [channelId, uploads]) => (followed && !followed.has(channelId) ? total : total + uploads.length),
    0,
  )
}
