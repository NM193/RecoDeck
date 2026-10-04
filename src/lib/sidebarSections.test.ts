import { describe, expect, it } from 'vitest'
import { MIN_BODY_HEIGHT, distributeHeights } from './sidebarSections'

describe('sharing the sidebar between open sections', () => {
  it('gives every list its whole height when they all fit', () => {
    expect(distributeHeights(800, [300, 120, 200])).toEqual([300, 120, 200])
  })

  it('lets a short list keep its height and gives a long one the rest', () => {
    expect(distributeHeights(500, [1000, 120])).toEqual([380, 120])
  })

  it('shares what the short lists leave equally between the long ones', () => {
    expect(distributeHeights(600, [900, 800, 100])).toEqual([250, 250, 100])
  })

  it('keeps a list that fits its equal share, even when it is not the shortest', () => {
    // 700 / 3 = 233: 100 and 200 fit; 400 is left for the 2000 list.
    expect(distributeHeights(700, [2000, 200, 100])).toEqual([400, 200, 100])
  })

  it('never shrinks a list below three rows', () => {
    expect(distributeHeights(150, [900, 800])).toEqual([
      MIN_BODY_HEIGHT,
      MIN_BODY_HEIGHT,
    ])
  })

  it('does not stretch a list shorter than three rows to three rows', () => {
    expect(distributeHeights(100, [900, 40])).toEqual([MIN_BODY_HEIGHT, 40])
  })

  it('gives whole pixels', () => {
    expect(distributeHeights(500, [900, 900, 900])).toEqual([166, 166, 166])
  })

  it('handles no open sections and no space', () => {
    expect(distributeHeights(500, [])).toEqual([])
    expect(distributeHeights(0, [300])).toEqual([MIN_BODY_HEIGHT])
    expect(distributeHeights(-20, [50])).toEqual([50])
  })
})
