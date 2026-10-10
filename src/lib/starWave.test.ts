import { describe, expect, it } from 'vitest'
import { STAR_STEP_MS, starsToPulse } from './starWave'

describe('starsToPulse: the stars that pulse as they light', () => {
  it('from 2 to 4: stars 3 and 4 (indexes 2 and 3), one step apart, the first at once', () => {
    expect(starsToPulse(2, 4)).toEqual([
      { index: 2, delay: 0 },
      { index: 3, delay: STAR_STEP_MS },
    ])
  })

  it('from none to five: all of them, in a wave', () => {
    expect(starsToPulse(0, 5).map((p) => p.delay)).toEqual([0, 24, 48, 72, 96])
  })

  it('none when the stars dim or stay', () => {
    expect(starsToPulse(4, 2)).toEqual([])
    expect(starsToPulse(3, 3)).toEqual([])
  })
})
