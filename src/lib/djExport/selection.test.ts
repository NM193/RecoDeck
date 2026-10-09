import { describe, expect, it } from 'vitest'
import type { Playlist } from '../../types/track'
import {
  buildTree,
  checkState,
  findNode,
  initialSelection,
  resultToast,
  selectedInOrder,
  toggle,
} from './selection'

const p = (id: number, name: string, parent_id: number | null, folder = false): Playlist => ({
  id,
  name,
  parent_id,
  playlist_type: folder ? 'folder' : 'manual',
  track_count: 0,
})

// As get_all_playlists answers: by name.
const playlists = [
  p(5, 'Empty', null, true),
  p(2, 'Friday', 1),
  p(1, 'Gigs', null, true),
  p(4, 'Inner', 3),
  p(3, 'Nested', 1, true),
  p(6, 'Warm-up', null),
]
const tree = buildTree(playlists)
const node = (id: number) => findNode(tree, id)!

describe('buildTree', () => {
  it('nests by parent in the sidebar order', () => {
    expect(tree.map((n) => n.name)).toEqual(['Empty', 'Gigs', 'Warm-up'])
    expect(node(1).children.map((n) => n.name)).toEqual(['Friday', 'Nested'])
    expect(node(3).children.map((n) => n.name)).toEqual(['Inner'])
  })
})

describe('initialSelection', () => {
  it('keeps the remembered playlists that still exist and adds the one opened from', () => {
    expect([...initialSelection(tree, [6, 99], 2)].sort()).toEqual([2, 6])
  })
  it('a folder opened from brings every playlist inside it', () => {
    expect([...initialSelection(tree, [], 1)].sort()).toEqual([2, 4])
  })
  it('nothing remembered and opened from nowhere is nothing', () => {
    expect(initialSelection(tree, [], null).size).toBe(0)
  })
})

describe('checkState and toggle', () => {
  it('a folder is mixed when some of it is checked', () => {
    expect(checkState(node(1), new Set([2]))).toBe('mixed')
    expect(checkState(node(1), new Set([2, 4]))).toBe('checked')
    expect(checkState(node(1), new Set())).toBe('unchecked')
    expect(checkState(node(5), new Set([2]))).toBe('unchecked')
  })
  it('a folder checks all of itself, or clears it when all was checked', () => {
    const all = toggle(node(1), new Set([2]))
    expect([...all].sort()).toEqual([2, 4])
    expect(toggle(node(1), all).size).toBe(0)
  })
  it('a playlist flips', () => {
    expect([...toggle(node(6), new Set([2]))].sort()).toEqual([2, 6])
    expect([...toggle(node(6), new Set([6]))]).toEqual([])
  })
})

describe('selectedInOrder', () => {
  it('answers the checked playlists in the tree order', () => {
    expect(selectedInOrder(tree, new Set([6, 4, 2]))).toEqual([2, 4, 6])
  })
})

describe('resultToast', () => {
  it('says what went where', () => {
    expect(resultToast({ playlists: 1, tracks: 1, skipped: [], written: ['/x.xml'] }, 'Rekordbox')).toEqual({
      message: '1 playlist, 1 track exported to Rekordbox',
      kind: 'success',
    })
  })
  it('warns about the files that are gone and lists them', () => {
    const t = resultToast(
      {
        playlists: 3,
        tracks: 1214,
        skipped: [
          { artist: 'DJ', title: 'Gone', path: '/a.mp3' },
          { artist: '', title: '', path: '/b.mp3' },
        ],
        written: ['/x.xml'],
      },
      'Rekordbox',
    )
    expect(t.message).toBe('3 playlists, 1,214 tracks exported to Rekordbox · 2 tracks skipped — file missing')
    expect(t.kind).toBe('warning')
    expect(t.detail).toBe('DJ – Gone (/a.mp3)\nUnknown artist – Untitled (/b.mp3)')
  })
  it('lists at most six skipped tracks, then how many more', () => {
    const skipped = Array.from({ length: 8 }, (_, i) => ({ artist: 'DJ', title: `T${i}`, path: `/${i}.mp3` }))
    const t = resultToast({ playlists: 1, tracks: 9, skipped, written: ['/x.xml'] }, 'Rekordbox')
    const lines = t.detail!.split('\n')
    expect(lines).toHaveLength(7)
    expect(lines[5]).toBe('DJ – T5 (/5.mp3)')
    expect(lines[6]).toBe('and 2 more')
  })
})
