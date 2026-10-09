// src/lib/trackTable/reorder.test.ts
import { describe, expect, it } from 'vitest'
import { reorderIds } from './reorder'

describe('reordering a playlist by dragging', () => {
  const order = [1, 2, 3, 4, 5]

  it('moves a track down to the gap', () => {
    expect(reorderIds(order, new Set([2]), 4)).toEqual([1, 3, 4, 2, 5])
  })

  it('moves a track up, and to either end', () => {
    expect(reorderIds(order, new Set([4]), 1)).toEqual([1, 4, 2, 3, 5])
    expect(reorderIds(order, new Set([3]), 0)).toEqual([3, 1, 2, 4, 5])
    expect(reorderIds(order, new Set([3]), 5)).toEqual([1, 2, 4, 5, 3])
  })

  it('lands tracks picked apart together, in the order they had', () => {
    expect(reorderIds(order, new Set([5, 1, 3]), 2)).toEqual([2, 1, 3, 5, 4])
  })

  it('answers the same list when nothing would move', () => {
    expect(reorderIds(order, new Set([2]), 2)).toBe(order)
    expect(reorderIds(order, new Set([2]), 1)).toBe(order)
    expect(reorderIds(order, new Set([2, 3]), 3)).toBe(order)
  })
})
