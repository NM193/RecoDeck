// src/lib/sets/following.ts
// The words on Sets' Following tab (Sets redesign spec, Following): when a
// channel or a DJ was last checked, and what a check found, said in a toast.
import { playedLabel } from '../home/labels'
import type { ChannelNews } from '../../types/youtube'

/** "checked 09:05" today, "checked yesterday", "checked Oct 2"; "never checked". */
export function checkedLabel(lastChecked: string | null | undefined, now: Date): string {
  const time = lastChecked ? Date.parse(lastChecked) : NaN
  if (Number.isNaN(time)) return 'never checked'
  return `checked ${playedLabel(time / 1000, now)}`
}

const sets = (n: number) => `${n.toLocaleString('en-US')} new ${n === 1 ? 'set' : 'sets'}`

/** How many new uploads a check's news holds. */
export function newSetCount(news: readonly ChannelNews[]): number {
  return news.reduce((total, item) => total + item.new_sets.length, 0)
}

/**
 * What a DJ search found, for its toast: a DJ's finds land on the library's
 * New from DJs you watch, so the toast points there. `who` is the one DJ
 * searched, or null for all of them.
 */
export function djCheckMessage(news: readonly ChannelNews[], who: string | null): string {
  const found = newSetCount(news)
  if (who) return found === 0 ? `Nothing new from ${who}` : `${sets(found)} from ${who} — see Library`
  if (found === 0) return 'Nothing new from your DJs'
  const djs = news.filter((item) => item.new_sets.length > 0).length
  return `${sets(found)} from ${djs} ${djs === 1 ? 'DJ' : 'DJs'} — see Library`
}

/** What a channel check found, for its toast: the news shows under each channel. */
export function channelCheckMessage(news: readonly ChannelNews[], who: string | null): string {
  const found = newSetCount(news)
  if (who) return found === 0 ? `Nothing new on ${who}` : `${sets(found)} on ${who}`
  if (found === 0) return 'Nothing new on your channels'
  const channels = news.filter((item) => item.new_sets.length > 0).length
  return `${sets(found)} on ${channels} ${channels === 1 ? 'channel' : 'channels'}`
}
