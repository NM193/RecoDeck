// src/lib/trackTable/selection.test.ts
import { describe, expect, it } from 'vitest'
import {
  NO_SELECTION,
  clickRow,
  moveCursor,
  selectAll,
  selectOnly,
  selectedTracks,
  trimSelection,
  type Selection,
} from './selection'

const shown = [10, 20, 30, 40, 50]
const plain = { toggle: false, range: false }
const cmd = { toggle: true, range: false }
const shift = { toggle: false, range: true }
const cmdShift = { toggle: true, range: true }
const ids = (selection: Selection) => [...selection.ids].sort((a, b) => a - b)

describe('selecting rows', () => {
  it('a click selects that row alone', () => {
    const selection = clickRow(selectOnly(10), 30, plain, shown)
    expect(ids(selection)).toEqual([30])
    expect(selection.anchor).toBe(30)
  })

  it('⌘-click adds a row, and removes it again', () => {
    const added = clickRow(selectOnly(10), 30, cmd, shown)
    expect(ids(added)).toEqual([10, 30])
    expect(ids(clickRow(added, 10, cmd, shown))).toEqual([30])
  })

  it('Shift-click selects the range from the row clicked last, either way', () => {
    expect(ids(clickRow(selectOnly(20), 40, shift, shown))).toEqual([20, 30, 40])
    expect(ids(clickRow(selectOnly(40), 20, shift, shown))).toEqual([20, 30, 40])
  })

  it('a second Shift-click redraws the range from the same row', () => {
    const first = clickRow(selectOnly(20), 50, shift, shown)
    expect(ids(clickRow(first, 30, shift, shown))).toEqual([20, 30])
  })

  it('⌘-Shift-click adds the range to the rows selected', () => {
    const picked = clickRow(selectOnly(10), 40, cmd, shown)
    expect(ids(clickRow(picked, 50, cmdShift, shown))).toEqual([10, 40, 50])
  })

  it('Shift-click with nothing clicked before selects that row', () => {
    expect(ids(clickRow(NO_SELECTION, 30, shift, shown))).toEqual([30])
  })

  it('⌘A selects every row shown', () => {
    expect(ids(selectAll(selectOnly(20), shown))).toEqual(shown)
  })
})

describe('moving with ↑ ↓', () => {
  it('moves one row, and stops at the ends', () => {
    expect(ids(moveCursor(selectOnly(20), shown, 1, false))).toEqual([30])
    expect(ids(moveCursor(selectOnly(50), shown, 1, false))).toEqual([50])
    expect(ids(moveCursor(selectOnly(10), shown, -1, false))).toEqual([10])
  })

  it('with nothing selected, ↓ takes the first row and ↑ the last', () => {
    expect(ids(moveCursor(NO_SELECTION, shown, 1, false))).toEqual([10])
    expect(ids(moveCursor(NO_SELECTION, shown, -1, false))).toEqual([50])
  })

  it('with Shift, the range from the anchor follows', () => {
    const down = moveCursor(moveCursor(selectOnly(20), shown, 1, true), shown, 1, true)
    expect(ids(down)).toEqual([20, 30, 40])
    expect(ids(moveCursor(down, shown, -1, true))).toEqual([20, 30])
  })
})

describe('the rows shown change', () => {
  it('rows no longer shown leave the selection', () => {
    const all = selectAll(selectOnly(20), shown)
    const trimmed = trimSelection(all, [20, 40])
    expect(ids(trimmed)).toEqual([20, 40])
    expect(trimmed.anchor).toBe(20)
    // Shown again later, they stay out.
    expect(ids(trimSelection(trimmed, shown))).toEqual([20, 40])
  })

  it('forgets an anchor no longer shown', () => {
    expect(trimSelection(selectOnly(30), [10, 20]).anchor).toBeNull()
  })

  it('keeps the same selection when every row is still shown', () => {
    const selection = selectAll(selectOnly(20), shown)
    expect(trimSelection(selection, [...shown, 60])).toBe(selection)
  })

  it('gives the selected tracks in the order shown', () => {
    const tracks = shown.map((id) => ({ id }))
    const selection = clickRow(clickRow(selectOnly(40), 10, cmd, shown), 30, cmd, shown)
    expect(selectedTracks(selection, tracks).map((t) => t.id)).toEqual([10, 30, 40])
  })
})
