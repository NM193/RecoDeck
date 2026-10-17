import { describe, expect, it } from 'vitest'
import {
  SHARE_DURATIONS,
  clockTime,
  expiresLine,
  expiresSoon,
  shareLinkUrl,
  sharedLine,
  shortDate,
  timeLeft,
} from './shareText'

// Local time, so the tests pass in any time zone.
function at(
  year: number,
  month: number,
  day: number,
  hours = 0,
  minutes = 0,
): number {
  return Math.floor(
    new Date(year, month - 1, day, hours, minutes).getTime() / 1000,
  )
}

const HOUR = 3600
const DAY = 24 * HOUR

describe('shareLinkUrl', () => {
  it('opens the share page with the share token', () => {
    expect(shareLinkUrl('http://192.168.1.20:8384', 'ab12')).toBe(
      'http://192.168.1.20:8384/?share=ab12',
    )
  })
  it('does not double a trailing slash', () => {
    expect(shareLinkUrl('http://192.168.1.20:8384/', 'ab12')).toBe(
      'http://192.168.1.20:8384/?share=ab12',
    )
  })
})

describe('SHARE_DURATIONS', () => {
  it('offers 24 hours, 7 days and 30 days', () => {
    expect(SHARE_DURATIONS).toEqual([
      { days: 1, label: '24 hours' },
      { days: 7, label: '7 days' },
      { days: 30, label: '30 days' },
    ])
  })
})

describe('shortDate and clockTime', () => {
  it('writes the day as Mon D', () => {
    expect(shortDate(at(2026, 10, 23, 14, 5))).toBe('Oct 23')
    expect(shortDate(at(2026, 1, 3))).toBe('Jan 3')
  })
  it('writes the time as HH:MM on a 24-hour clock', () => {
    expect(clockTime(at(2026, 10, 23, 14, 5))).toBe('14:05')
    expect(clockTime(at(2026, 10, 23, 9, 0))).toBe('09:00')
    expect(clockTime(at(2026, 10, 23, 0, 30))).toBe('00:30')
  })
})

describe('expiresLine', () => {
  it('says the day and the time the link stops', () => {
    expect(expiresLine(at(2026, 10, 23, 14, 5))).toBe('Expires Oct 23 at 14:05')
  })
})

describe('timeLeft', () => {
  const now = at(2026, 10, 16, 12, 0)

  it('counts days from a day up', () => {
    expect(timeLeft(now + 30 * DAY - 5, now)).toBe('30 days')
    expect(timeLeft(now + 7 * DAY - 5, now)).toBe('7 days')
    expect(timeLeft(now + 2 * DAY + 3 * HOUR, now)).toBe('2 days')
    expect(timeLeft(now + DAY + 2 * HOUR, now)).toBe('1 day')
  })
  it('counts hours under a day, rounding up', () => {
    expect(timeLeft(now + DAY - 5, now)).toBe('24 hours')
    expect(timeLeft(now + 5 * HOUR + 10 * 60, now)).toBe('6 hours')
    expect(timeLeft(now + 2 * HOUR, now)).toBe('2 hours')
  })
  it('says 1 hour for the last hour and after', () => {
    expect(timeLeft(now + 20 * 60, now)).toBe('1 hour')
    expect(timeLeft(now - 60, now)).toBe('1 hour')
  })
})

describe('expiresSoon', () => {
  const now = at(2026, 10, 16, 12, 0)

  it('is true under 24 hours', () => {
    expect(expiresSoon(now + DAY - 1, now)).toBe(true)
    expect(expiresSoon(now + HOUR, now)).toBe(true)
  })
  it('is false from 24 hours up', () => {
    expect(expiresSoon(now + DAY, now)).toBe(false)
    expect(expiresSoon(now + 7 * DAY, now)).toBe(false)
  })
})

describe('sharedLine', () => {
  it('says when it was shared and how long it has left', () => {
    const now = at(2026, 10, 16, 12, 0)
    expect(
      sharedLine(
        { created_at: at(2026, 10, 14, 9, 30), expires_at: now + 5 * DAY - 60 },
        now,
      ),
    ).toBe('Shared Oct 14 · expires in 5 days')
    expect(
      sharedLine({ created_at: now - HOUR, expires_at: now + 3 * HOUR }, now),
    ).toBe('Shared Oct 16 · expires in 3 hours')
  })
})
