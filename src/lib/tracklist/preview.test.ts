/**
 * The line that decides whether someone spends 5-7 units opening a set.
 *
 * Wrong in one direction it hides a real tracklist; wrong in the other it
 * promises one that is not there. Both are worse than saying nothing.
 */

import { describe, expect, it } from 'vitest'
import { describePreview, previewSet } from './preview'

const NUMBERED = `Tracklist:
01. Hot Since 82 & Shades Of Rhythm - Shaded [KNEE DEEP IN SOUND]
02. Hot Since 82 - Benoit
03. Hot Since 82 - Good Love
04. Love Xpress - Happiness
05. Hot Since 82 & Kuuda - State Of Mind`

const TIMED = `0:00 Mathias Kaden ft. Zoe Xenia - Soulmakers (Pulshar Remix)
4:30 Superlounge - Your Life
7:30 Blaze - Lovelee Dae
13:00 Luciano Garrido - El Nuevo Misterio
18:20 Jimi Jules - My City's On Fire`

describe('what a search result promises', () => {
  it('counts a timestamped tracklist in the description', () => {
    const preview = previewSet({ description: TIMED, durationMs: 3_600_000 })
    expect(preview.trackCount).toBe(5)
    expect(preview.untimed).toBe(false)
    expect(describePreview(preview)).toBe('5 tracks in the description')
  })

  it('counts a numbered one, and says it has no timestamps', () => {
    const preview = previewSet({ description: NUMBERED, durationMs: 7_200_000 })
    expect(preview.trackCount).toBe(5)
    expect(preview.untimed).toBe(true)
    expect(describePreview(preview)).toBe('5 tracks in the description, no timestamps')
  })

  it('points at the comments when the description holds nothing', () => {
    const preview = previewSet({
      description: 'Subscribe for more! Follow me on Instagram.',
      commentCount: 512,
    })
    expect(preview.trackCount).toBe(0)
    expect(describePreview(preview)).toBe(
      'nothing in the description · 512 comments to search',
    )
  })

  it('says so when there is nowhere left to look', () => {
    const preview = previewSet({ description: 'No links.', commentCount: 0 })
    expect(describePreview(preview)).toBe(
      'no tracklist in the description, and comments are off',
    )
  })

  it('promises nothing when the description never arrived', () => {
    const preview = previewSet({})
    expect(preview.trackCount).toBe(0)
    expect(describePreview(preview)).toBe('nothing in the description')
  })

  it('does not take a description full of prose for a tracklist', () => {
    const preview = previewSet({
      description: `Recorded live in Dubrovnik on a warm evening in July.
Thanks to everyone who came out and danced with us.
Filmed by the Cercle team over two days.
Follow the artist on all platforms.`,
      durationMs: 6_000_000,
    })
    expect(preview.trackCount).toBe(0)
  })
})
