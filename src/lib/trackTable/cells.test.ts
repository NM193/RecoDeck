// src/lib/trackTable/cells.test.ts
import { describe, expect, it } from 'vitest'
import { formatAdded, formatFormat, formatTime, titleGradient } from './cells'

// The stored form of a local time: SQLite's UTC "YYYY-MM-DD HH:MM:SS".
const stored = (local: Date) => local.toISOString().slice(0, 19).replace('T', ' ')

describe('the Added column', () => {
  const now = new Date(2026, 9, 4, 0, 30).getTime() // 00:30 local, Oct 4

  it('says today for the same local day', () => {
    expect(formatAdded(stored(new Date(2026, 9, 4, 0, 5)), now)).toBe('today')
  })

  it('says yesterday for the local day before, even minutes ago', () => {
    expect(formatAdded(stored(new Date(2026, 9, 3, 23, 50)), now)).toBe('yesterday')
    expect(formatAdded(stored(new Date(2026, 9, 3, 0, 1)), now)).toBe('yesterday')
  })

  it('gives the month and day earlier this year', () => {
    expect(formatAdded(stored(new Date(2026, 9, 2, 12, 0)), now)).toBe('Oct 2')
  })

  it('adds the year for another year', () => {
    expect(formatAdded(stored(new Date(2025, 9, 2, 12, 0)), now)).toBe('Oct 2, 2025')
  })

  it('shows a dash with no date', () => {
    expect(formatAdded(undefined, now)).toBe('—')
  })
})

describe('the other cells', () => {
  it('shows the time as m:ss', () => {
    expect(formatTime(392_000)).toBe('6:32')
    expect(formatTime(65_400)).toBe('1:05')
    expect(formatTime(undefined)).toBe('—')
  })

  it('shows the format and bitrate', () => {
    expect(formatFormat('MP3', 320)).toBe('mp3 · 320')
    expect(formatFormat('wav', undefined)).toBe('wav')
    expect(formatFormat(undefined, 320)).toBe('—')
  })

  it('gives the same title the same cover, and others another', () => {
    expect(titleGradient('Juz Listen')).toBe(titleGradient('Juz Listen'))
    expect(titleGradient('Juz Listen')).not.toBe(titleGradient('Voayeur'))
    expect(titleGradient(undefined)).toMatch(/^linear-gradient\(135deg/)
  })
})
