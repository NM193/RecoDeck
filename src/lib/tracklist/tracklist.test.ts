/**
 * The port is only correct if it reproduces what the standalone tool produces.
 *
 * `__fixtures__/*.json` are raw API responses the tool saved for six real sets;
 * `expected.json` is that tool's own output over them (`--replay=fixtures`).
 * Anything that changes a parsed tracklist shows up here as a diff, which is
 * the entire point of keeping the fixtures.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { analyse, containment, msToCue, normalise, parseCue, splitArtistTitle } from './index'
import { extractTracklist } from './extract'
import { collectCueMentions } from './comments'
import type { RawSet, TracklistResult } from './types'

const FIXTURES = join(__dirname, '__fixtures__')

const readJson = <T>(name: string): T => JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')) as T

const setFiles = readdirSync(FIXTURES)
  .filter((f) => f.endsWith('.json') && f !== 'expected.json')
  .sort()

const expected = readJson<TracklistResult[]>('expected.json')
const expectedById = new Map(expected.map((r) => [r.video.id, r]))

describe('parity with the standalone tool', () => {
  it('has a fixture for every expected result', () => {
    expect(setFiles.length).toBe(expected.length)
  })

  for (const file of setFiles) {
    const { video, comments } = readJson<RawSet>(file)

    it(`reproduces ${video.title.slice(0, 48)}`, () => {
      const golden = expectedById.get(video.id)
      expect(golden, `no expected result for ${video.id}`).toBeDefined()

      const result = analyse(video, comments)

      // Compared field by field first: a diff on 40 tracks is unreadable, and
      // these four lines say what actually went wrong.
      expect(result.status).toBe(golden!.status)
      expect(result.confidence).toBe(golden!.confidence)
      expect(result.sourceCount).toBe(golden!.sourceCount)
      expect(result.trackCount).toBe(golden!.trackCount)

      expect(result.tracks).toEqual(golden!.tracks)
      expect(result.loose).toEqual(golden!.loose)
      expect(result).toEqual(golden)
    })
  }
})

describe('the pieces that carry the measured tuning', () => {
  it('reads every timestamp shape a person types', () => {
    expect(parseCue('1:23:45')).toBe(5_025_000)
    expect(parseCue('23:45')).toBe(1_425_000)
    expect(msToCue(5_025_000)).toBe('1:23:45')
    expect(msToCue(1_425_000)).toBe('23:45')
    expect(msToCue(1_000)).toBe('0:01')
  })

  it('keeps hyphenated names whole', () => {
    // The dash rule requires surrounding spaces precisely for this case.
    expect(splitArtistTitle('Jean-Michel Jarre - Oxygene').artist).toBe('Jean-Michel Jarre')
    expect(splitArtistTitle('Jean-Michel Jarre - Oxygene').title).toBe('Oxygene')
  })

  it('separates label, mix, note and uncertainty from the name', () => {
    const parsed = splitArtistTitle('Crusy - Kids (Todd Terje Remix) [Defected]')
    expect(parsed.artist).toBe('Crusy')
    expect(parsed.title).toBe('Kids')
    expect(parsed.mix).toBe('Todd Terje Remix')
    expect(parsed.label).toBe('Defected')

    const unsure = splitArtistTitle('Someone - Some Track?')
    expect(unsure.uncertain).toBe(true)
    expect(unsure.title).toBe('Some Track')
  })

  it('recognises an unnamed slot however it is written', () => {
    expect(splitArtistTitle('ID').isUnknown).toBe(true)
    expect(splitArtistTitle('ID - ID').isUnknown).toBe(true)
    expect(splitArtistTitle('???').isUnknown).toBe(true)
    expect(splitArtistTitle('Real Artist - Real Title').isUnknown).toBe(false)
  })

  it('drops the thanks and handles commenters sign with', () => {
    expect(splitArtistTitle('Artist - Title - thanks @someone').title).toBe('Title')
    expect(splitArtistTitle('Artist - Title @someone').title).toBe('Title')
  })

  it('matches partial credits by containment, which is what merging relies on', () => {
    // One person writes the lead artist, another the full credit.
    expect(containment(normalise('Crusy'), normalise('Crusy, Karretero'))).toBe(1)
    expect(containment(normalise('Kids'), normalise('Kids'))).toBe(1)
    expect(containment(normalise('Kids'), normalise('Something Else'))).toBe(0)
  })

  it('ignores a block of text that is not a tracklist', () => {
    const chapters = 'watch this\n0:00 hello\n1:00 bye'
    expect(extractTracklist(chapters, 3_600_000).tracks).toHaveLength(0)
  })

  it('gives a reply the timestamp of the question it answers', () => {
    // The discovery the whole tool rests on: the answer carries no time of its
    // own, and without inheritance the track is invisible.
    const mentions = collectCueMentions([
      { author: '@asker', text: '39:30 anyone id?', likeCount: 0 },
      {
        author: '@answerer',
        text: 'Rockers Hi-Fi - Transmission Central',
        likeCount: 4,
        replyTo: '@asker',
      },
    ])

    const answer = mentions.find((m) => m.text.includes('Rockers Hi-Fi'))
    expect(answer).toBeDefined()
    expect(answer!.cueMs).toBe(2_370_000) // 39:30
  })

  it('does not let ordinary chatter inherit a timestamp', () => {
    const mentions = collectCueMentions([
      { author: '@asker', text: '39:30 anyone id?', likeCount: 0 },
      { author: '@fan', text: 'banger!!', likeCount: 2, replyTo: '@asker' },
    ])
    expect(mentions.some((m) => m.text.includes('banger'))).toBe(false)
  })
})
