import { describe, expect, it } from 'vitest'
import { OFFSCREEN, barShows, panelBounds, panelBox, sameBounds } from './panelBounds'

describe('which box the panel sits in', () => {
  it('is the set page’s while it is mounted, else the bar’s', () => {
    expect(panelBox('page', 'bar')).toBe('page')
    expect(panelBox(null, 'bar')).toBe('bar')
    expect(panelBox(null, null)).toBeNull()
  })

  it('shows the bar exactly while a set plays off its page', () => {
    expect(barShows(true, false)).toBe(true)
    expect(barShows(true, true)).toBe(false)
    expect(barShows(false, false)).toBe(false)
  })
})

describe('panelBounds', () => {
  const rect = { left: 240.4, top: 96.6, width: 440, height: 247.5 }

  it('is the box, in whole pixels', () => {
    expect(panelBounds(rect, false)).toEqual({ x: 240, y: 97, width: 440, height: 248 })
  })

  it('is off the window, at the same size, while an overlay is open', () => {
    expect(panelBounds(rect, true)).toEqual({ x: OFFSCREEN, y: OFFSCREEN, width: 440, height: 248 })
  })

  it('is off the window with no box to sit in', () => {
    expect(panelBounds(null, false)).toEqual({ x: OFFSCREEN, y: OFFSCREEN, width: 320, height: 180 })
    expect(panelBounds({ left: 0, top: 0, width: 0, height: 0 }, false).x).toBe(OFFSCREEN)
  })

  it('compares bounds', () => {
    const b = panelBounds(rect, false)
    expect(sameBounds(b, { ...b })).toBe(true)
    expect(sameBounds(b, { ...b, x: b.x + 1 })).toBe(false)
    expect(sameBounds(null, b)).toBe(false)
  })
})
