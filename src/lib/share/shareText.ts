// Texts the playlist share links show (spec 2026-10-16): the share modal and
// Settings → Mobile Companion's Shared playlists. Times are unix seconds,
// written in local time.

import type { ShareLink } from '../../types/track'

const HOUR = 3600
const DAY = 24 * HOUR

/** The choices of "Link works for", in order. */
export const SHARE_DURATIONS: { days: ShareLink['days']; label: string }[] = [
  { days: 1, label: '24 hours' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
]

/** The link a phone opens: the share page with the share token. */
export function shareLinkUrl(companionUrl: string, token: string): string {
  return `${companionUrl.replace(/\/+$/, '')}/?share=${token}`
}

/** "Oct 23". */
export function shortDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

/** "14:05", on a 24-hour clock. */
export function clockTime(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** "Expires Oct 23 at 14:05". */
export function expiresLine(expiresAt: number): string {
  return `Expires ${shortDate(expiresAt)} at ${clockTime(expiresAt)}`
}

/** What is left: "7 days" from a day up (rounded), else "5 hours" (rounded up, at least 1). */
export function timeLeft(expiresAt: number, now: number): string {
  const left = expiresAt - now
  if (left >= DAY) {
    const days = Math.round(left / DAY)
    return `${days} ${days === 1 ? 'day' : 'days'}`
  }
  const hours = Math.max(1, Math.ceil(left / HOUR))
  return `${hours} ${hours === 1 ? 'hour' : 'hours'}`
}

/** Under 24 hours left: the list shows it in amber. */
export function expiresSoon(expiresAt: number, now: number): boolean {
  return expiresAt - now < DAY
}

/** A Shared playlists row: "Shared Oct 14 · expires in 5 days". */
export function sharedLine(
  link: Pick<ShareLink, 'created_at' | 'expires_at'>,
  now: number,
): string {
  return `Shared ${shortDate(link.created_at)} · expires in ${timeLeft(link.expires_at, now)}`
}

/** The current time in unix seconds. */
export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}
