// src/lib/trackTable/count.test.ts
import { describe, expect, it } from 'vitest'
import { trackCountLabel } from './count'

describe('the track count', () => {
  it('shows the total alone with no search or filter', () => {
    expect(trackCountLabel(8583, 8583, false)).toBe('8,583 tracks')
  })

  it('shows the rows out of the total while narrowed', () => {
    expect(trackCountLabel(1162, 8583, true)).toBe('1,162 of 8,583 tracks')
    expect(trackCountLabel(0, 8583, true)).toBe('0 of 8,583 tracks')
  })

  it('says track for one', () => {
    expect(trackCountLabel(1, 1, false)).toBe('1 track')
  })
})
