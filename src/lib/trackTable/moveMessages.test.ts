// src/lib/trackTable/moveMessages.test.ts
import { describe, expect, it } from 'vitest'
import {
  folderName,
  folderOf,
  movedMessage,
  sharedFolder,
  skipDetail,
  undoGroups,
} from './moveMessages'

const titled = (n: number) => Array.from({ length: n }, (_, i) => ({ title: `Track ${i}` }))

describe('Move to folder', () => {
  it('knows the folder a track is in, and the one every track shares', () => {
    expect(folderOf('/Music/House/a.mp3')).toBe('/Music/House')
    expect(folderOf('C:/Music/a.mp3')).toBe('C:/Music')
    expect(
      sharedFolder([{ file_path: '/Music/House/a.mp3' }, { file_path: '/Music/House/b.mp3' }]),
    ).toBe('/Music/House')
    expect(
      sharedFolder([{ file_path: '/Music/House/a.mp3' }, { file_path: '/Music/Deep/b.mp3' }]),
    ).toBeNull()
  })

  it('names a folder by the end of its label', () => {
    expect(folderName('Music / House / Deep')).toBe('Deep')
    expect(folderName('Music')).toBe('Music')
  })

  it('says how many moved, and how many stayed and why', () => {
    expect(movedMessage(titled(3), [], 'House')).toBe('Moved 3 tracks to House')
    expect(movedMessage(titled(2), [{ id: 1, reason: 'playing' }], 'House')).toBe(
      'Moved 2 · 1 skipped (playing now)',
    )
    expect(
      movedMessage(
        titled(1),
        [
          { id: 1, reason: 'playing' },
          { id: 2, reason: 'name_taken' },
        ],
        'House',
      ),
    ).toBe('Moved 1 · 2 skipped')
    expect(movedMessage([], [{ id: 1, reason: 'already_there' }], 'House')).toBe(
      'Nothing moved · 1 skipped (already there)',
    )
  })

  it('lists why each track stayed, for the hover', () => {
    const titles: Record<number, string> = { 1: "Juz Listen'", 2: 'Voayeur' }
    expect(
      skipDetail(
        [
          { id: 1, reason: 'playing' },
          { id: 2, reason: 'name_taken' },
        ],
        (id) => titles[id],
      ),
    ).toBe("Juz Listen' — playing now\nVoayeur — a file with that name is there")
    const many = Array.from({ length: 8 }, (_, id) => ({ id, reason: 'missing' as const }))
    expect(skipDetail(many, () => 'T').split('\n')).toHaveLength(7)
    expect(skipDetail(many, () => 'T')).toMatch(/and 2 more$/)
  })

  it('moves back once per folder the tracks came from', () => {
    const old: Record<number, string> = {
      1: '/Music/House/a.mp3',
      2: '/Music/Deep/b.mp3',
      3: '/Music/House/c.mp3',
    }
    expect(undoGroups([{ id: 1 }, { id: 2 }, { id: 3 }], (id) => old[id])).toEqual([
      { folder: '/Music/House', ids: [1, 3] },
      { folder: '/Music/Deep', ids: [2] },
    ])
  })
})
