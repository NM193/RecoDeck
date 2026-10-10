import { describe, expect, it } from 'vitest'
import { placeTip, TIP_WARM_MS, tipEntry } from './tooltip'

const viewport = { width: 1000, height: 700 }
const size = { width: 80, height: 26 }

describe('tipEntry: how the next tip comes in', () => {
  it('glides while one is shown', () => {
    expect(tipEntry(true, 0)).toBe('glide')
  })
  it('shows at once while warm, then waits again', () => {
    expect(tipEntry(false, TIP_WARM_MS - 1)).toBe('now')
    expect(tipEntry(false, TIP_WARM_MS)).toBe('wait')
    expect(tipEntry(false, Infinity)).toBe('wait')
  })
})

describe('placeTip', () => {
  it('goes below by default, centred, 6px away', () => {
    expect(
      placeTip(
        { left: 100, top: 100, width: 40, height: 28 },
        size,
        'bottom',
        viewport,
      ),
    ).toEqual({
      side: 'bottom',
      left: 80,
      top: 134,
    })
  })

  it('goes above in the player', () => {
    expect(
      placeTip(
        { left: 500, top: 650, width: 28, height: 28 },
        size,
        'top',
        viewport,
      ),
    ).toEqual({
      side: 'top',
      left: 474,
      top: 618,
    })
  })

  it('flips when its side has no room', () => {
    expect(
      placeTip(
        { left: 500, top: 670, width: 28, height: 28 },
        size,
        'bottom',
        viewport,
      ).side,
    ).toBe('top')
    expect(
      placeTip(
        { left: 500, top: 10, width: 28, height: 20 },
        size,
        'top',
        viewport,
      ).side,
    ).toBe('bottom')
    expect(
      placeTip(
        { left: 940, top: 300, width: 40, height: 36 },
        size,
        'right',
        viewport,
      ),
    ).toEqual({
      side: 'left',
      left: 854,
      top: 305,
    })
  })

  it('stays 8px inside the window', () => {
    expect(
      placeTip(
        { left: 0, top: 100, width: 20, height: 20 },
        size,
        'bottom',
        viewport,
      ).left,
    ).toBe(8)
    expect(
      placeTip(
        { left: 990, top: 100, width: 10, height: 20 },
        size,
        'bottom',
        viewport,
      ).left,
    ).toBe(912)
  })

  it('beside the rail, centred on the item', () => {
    expect(
      placeTip(
        { left: 8, top: 100, width: 40, height: 36 },
        size,
        'right',
        viewport,
      ),
    ).toEqual({
      side: 'right',
      left: 54,
      top: 105,
    })
  })
})
