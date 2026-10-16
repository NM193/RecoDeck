import { describe, it, expect, beforeEach } from 'vitest'
import { HttpStatusError } from '../src/lib/http-api'
import {
  SHARE_SESSION_KEY,
  clearSessionShare,
  formatShareUntil,
  formatTotalLength,
  formatTrackCount,
  formatTrackLength,
  isShareTokenShaped,
  isUnauthorized,
  pickShareToken,
  readSessionShare,
  saveSessionShare,
  shareFromLink,
} from './share'

const TOKEN = 'a'.repeat(64)
const OTHER = 'b'.repeat(64)

describe('shareFromLink', () => {
  it('reads share from the query', () => {
    expect(shareFromLink({ search: `?share=${TOKEN}`, hash: '' })).toBe(TOKEN)
  })

  it('reads share from the hash, with or without a leading ?', () => {
    expect(shareFromLink({ search: '', hash: `#share=${TOKEN}` })).toBe(TOKEN)
    expect(shareFromLink({ search: '', hash: `#?share=${TOKEN}` })).toBe(TOKEN)
  })

  it('reads the server-injected global', () => {
    expect(shareFromLink({ search: '', hash: '', injected: TOKEN })).toBe(TOKEN)
  })

  it('prefers the query, then the hash, then the global', () => {
    expect(
      shareFromLink({
        search: `?share=${TOKEN}`,
        hash: `#share=${OTHER}`,
        injected: OTHER,
      }),
    ).toBe(TOKEN)
    expect(
      shareFromLink({ search: '', hash: `#share=${TOKEN}`, injected: OTHER }),
    ).toBe(TOKEN)
  })

  it('ignores empty values and a global that is not a string', () => {
    expect(shareFromLink({ search: '?share=', hash: '#share=%20' })).toBe(
      undefined,
    )
    expect(shareFromLink({ search: '', hash: '', injected: 42 })).toBe(
      undefined,
    )
    expect(shareFromLink({ search: '', hash: '', injected: '  ' })).toBe(
      undefined,
    )
  })

  it('finds no share in an old-style token link', () => {
    expect(
      shareFromLink({
        search: `?token=${TOKEN}&playlist=3&name=Mix`,
        hash: '',
      }),
    ).toBe(undefined)
  })
})

describe('pickShareToken', () => {
  it('uses the share from the link over the session one', () => {
    expect(pickShareToken({ share: TOKEN }, OTHER)).toBe(TOKEN)
  })

  it('is not share mode when the link carries a companion token', () => {
    expect(pickShareToken({ token: TOKEN }, OTHER)).toBe(undefined)
  })

  it('keeps the session share when the link has neither', () => {
    expect(pickShareToken({}, OTHER)).toBe(OTHER)
  })

  it('is not share mode without any share', () => {
    expect(pickShareToken({}, null)).toBe(undefined)
    expect(pickShareToken({}, '')).toBe(undefined)
  })
})

describe('isShareTokenShaped', () => {
  it('accepts 64 lowercase hex characters only', () => {
    expect(isShareTokenShaped('0123456789abcdef'.repeat(4))).toBe(true)
    expect(isShareTokenShaped('A'.repeat(64))).toBe(false)
    expect(isShareTokenShaped('a'.repeat(63))).toBe(false)
    expect(isShareTokenShaped('</script>')).toBe(false)
  })
})

describe('isUnauthorized', () => {
  it('is true for a 401 only', () => {
    expect(isUnauthorized(new HttpStatusError(401, 'Unauthorized'))).toBe(true)
    expect(isUnauthorized(new HttpStatusError(403, 'Forbidden'))).toBe(false)
  })

  it('is false for a network error', () => {
    expect(isUnauthorized(new TypeError('Failed to fetch'))).toBe(false)
    expect(isUnauthorized(new Error('Unauthorized'))).toBe(false)
  })
})

describe('formatShareUntil', () => {
  it('gives the month and day', () => {
    const noonOct23 = new Date(2026, 9, 23, 12, 0).getTime() / 1000
    expect(formatShareUntil(noonOct23)).toBe('Oct 23')
    const jan1 = new Date(2027, 0, 1, 9, 30).getTime() / 1000
    expect(formatShareUntil(jan1)).toBe('Jan 1')
  })
})

describe('formatTrackCount', () => {
  it('uses the singular for one track', () => {
    expect(formatTrackCount(1)).toBe('1 track')
    expect(formatTrackCount(0)).toBe('0 tracks')
    expect(formatTrackCount(4)).toBe('4 tracks')
  })
})

describe('formatTrackLength', () => {
  it('gives m:ss, or dashes when unknown', () => {
    expect(formatTrackLength(185_400)).toBe('3:05')
    expect(formatTrackLength(undefined)).toBe('--:--')
    expect(formatTrackLength(0)).toBe('--:--')
  })
})

describe('formatTotalLength', () => {
  it('sums the durations as m:ss', () => {
    expect(
      formatTotalLength([
        { duration_ms: 35_000 },
        { duration_ms: 30_000 },
        { duration_ms: 40_000 },
        { duration_ms: 25_400 },
      ]),
    ).toBe('2:10')
  })

  it('shows hours as h:mm:ss', () => {
    expect(
      formatTotalLength([{ duration_ms: 3_600_000 }, { duration_ms: 125_000 }]),
    ).toBe('1:02:05')
  })

  it('is unknown for an empty list or a track without a duration', () => {
    expect(formatTotalLength([])).toBe(undefined)
    expect(formatTotalLength([{ duration_ms: 30_000 }, {}])).toBe(undefined)
    expect(formatTotalLength([{ duration_ms: 0 }])).toBe(undefined)
  })
})

describe('session share', () => {
  beforeEach(() => {
    sessionStorage.clear()
    localStorage.clear()
  })

  it('keeps the share token in sessionStorage, never in localStorage', () => {
    saveSessionShare(TOKEN)
    expect(readSessionShare()).toBe(TOKEN)
    expect(sessionStorage.getItem(SHARE_SESSION_KEY)).toBe(TOKEN)
    expect(localStorage.length).toBe(0)
  })

  it('clears it', () => {
    saveSessionShare(TOKEN)
    clearSessionShare()
    expect(readSessionShare()).toBe(null)
  })
})
