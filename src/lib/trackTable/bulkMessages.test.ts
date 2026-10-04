// src/lib/trackTable/bulkMessages.test.ts
import { describe, expect, it } from 'vitest'
import {
  addedMessage,
  alreadyMessage,
  genreClearedMessage,
  genreSetMessage,
  genreSnapshot,
  removedMessage,
  tracksSubject,
} from './bulkMessages'

const one = [{ title: "Juz Listen'" }]
const many = (n: number) => Array.from({ length: n }, (_, i) => ({ title: `Track ${i}` }))

describe('the toasts after a bulk action', () => {
  it('names one track by its title and counts several', () => {
    expect(tracksSubject(one)).toBe("Juz Listen'")
    expect(tracksSubject(many(12))).toBe('12 tracks')
    expect(tracksSubject(many(1204))).toBe('1,204 tracks')
    expect(tracksSubject([{ title: undefined }])).toBe('1 track')
  })

  it('says how many were added, and how many were there already', () => {
    expect(addedMessage(many(12), 0, 'Peak Time')).toBe('Added 12 tracks to Peak Time')
    expect(addedMessage(many(10), 2, 'Peak Time')).toBe(
      'Added 10 tracks to Peak Time · 2 already there',
    )
    expect(alreadyMessage(one, 'Peak Time')).toBe('Already in Peak Time')
    expect(alreadyMessage(many(3), 'Peak Time')).toBe('All 3 tracks are already in Peak Time')
  })

  it('says what was removed and what happened to the genre', () => {
    expect(removedMessage(many(3), 'Warm Up')).toBe('Removed 3 tracks from Warm Up')
    expect(genreSetMessage(many(50), 'House')).toBe('Genre set to "House" for 50 tracks')
    expect(genreClearedMessage(one)).toBe("Genre cleared for Juz Listen'")
  })

  it('keeps each genre and its source for Undo, none included', () => {
    expect(
      genreSnapshot([
        { id: 1, genre: 'Deep House', genre_source: 'tag' },
        { id: 2, genre: undefined, genre_source: undefined },
      ]),
    ).toEqual([
      { id: 1, genre: 'Deep House', source: 'tag' },
      { id: 2, genre: null, source: null },
    ])
  })
})
