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

import {
  analyse,
  containment,
  msToCue,
  normalise,
  parseCue,
  splitArtistTitle,
} from './index'
import { extractTracklist } from './extract'
import { collectCueMentions } from './comments'
import type { RawSet, TracklistResult } from './types'

const FIXTURES = join(__dirname, '__fixtures__')

/**
 * The fixtures are real captured API responses for real sets, so they live
 * outside the repository. Everything that depends on them skips when they are
 * not there; the rules that can be stated without a real set still run.
 *
 * To restore them, drop the saved JSON responses back into `__fixtures__/`.
 */
const havePresentFixtures = (() => {
  try {
    return readdirSync(FIXTURES).some((f) => f.endsWith('.json'))
  } catch {
    return false
  }
})()

// A skipped `describe` still evaluates its body so the runner can list what it
// skipped, so this has to be safe to call with nothing on disk.
const readJson = <T>(name: string): T =>
  havePresentFixtures ? (JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')) as T) : ({} as T)

const setFiles = havePresentFixtures
  ? readdirSync(FIXTURES)
      .filter((f) => f.endsWith('.json') && f !== 'expected.json' && !f.includes('tool-output'))
      .sort()
  : []

const expected = havePresentFixtures ? readJson<TracklistResult[]>('expected.json') : []
const expectedById = new Map(expected.map((r) => [r.video.id, r]))

/** Skips the whole block rather than failing it when there is nothing to read. */
const withFixtures = havePresentFixtures ? describe : describe.skip

/** Sets where we deliberately differ from the tool — see the block below. */
const DIVERGENT = new Set(['bk6Xst6euQk'])

/**
 * Sets collected after the port, which the standalone tool never saw and so has
 * no output for. They are regression fixtures for RecoDeck's own behaviour.
 */
const AFTER_THE_TOOL = new Set(['_wfwSaA5GeE'])

const EXCLUDED = new Set([...DIVERGENT, ...AFTER_THE_TOOL])

withFixtures('parity with the standalone tool', () => {
  it('has a fixture for every expected result', () => {
    expect(setFiles.length - EXCLUDED.size).toBe(expected.length)
  })

  for (const file of setFiles.filter((f) => !EXCLUDED.has(f.replace('.json', '')))) {
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

/**
 * Solomun | Boiler Room: Tulum — the set that exposed the narration bug.
 *
 * Somebody narrated the crowd with timestamps ("1:10:13 tattoo girl checks on
 * the lad..."), and the block passed every structural test: ascending, inside
 * the runtime, plenty of rows. The original tool accepts it, and its output is
 * kept here as `bk6Xst6euQk.tool-output.json` to make the difference explicit:
 * this is the one set where reproducing the tool exactly would be wrong.
 */
withFixtures('Boiler Room Tulum — where we deliberately beat the original', () => {
  const { video, comments } = readJson<RawSet>('bk6Xst6euQk.json')
  const toolOutput = readJson<TracklistResult[]>('bk6Xst6euQk.tool-output.json')[0]

  const NARRATION = [
    'Lad with red hat acquires target',
    'tattoo girl checks on the lad maybe she is interested. she doesnt know yet',
    'blond girl comes to rescue her friend, she know shes not interested. watch how she holds her friend',
    'Lad seems oppertunity for a threeway kiss, trying to keep his head cool.',
    'lad goes back to friend, tattoo girl goes back to blonde friend and nods. *hes gone*',
  ]

  it('confirms the original tool really does take the narration for tracks', () => {
    const toolTitles = toolOutput.tracks.map((t) => t.title)
    for (const line of NARRATION) expect(toolTitles).toContain(line)
  })

  it('keeps every real track the tool found', () => {
    const ours = analyse(video, comments)
    const oursNames = ours.tracks.map((t) => (t.artist ? `${t.artist} - ${t.title}` : t.title))

    const realOnes = toolOutput.tracks
      .filter((t) => !NARRATION.includes(t.title))
      .map((t) => (t.artist ? `${t.artist} - ${t.title}` : t.title))

    for (const name of realOnes) expect(oursNames).toContain(name)
  })

  it('drops the narration and nothing else', () => {
    const ours = analyse(video, comments)
    const oursTitles = ours.tracks.map((t) => t.title)
    for (const line of NARRATION) expect(oursTitles).not.toContain(line)
    expect(ours.trackCount).toBe(toolOutput.trackCount - NARRATION.length)
  })
})

/**
 * HOT SINCE 82 @ BBC Radio 1 Essential Mix — a tracklist with no timestamps.
 *
 * The uploader wrote all 24 tracks into the description as a numbered list and
 * gave not one cue. Every structural test the parser had was built around
 * timestamps, so the description yielded nothing and the set fell through to
 * being assembled from comments — one track, from somebody shouting
 * "OH MY F*K, CHANTE!".
 *
 * The standalone tool has the same blind spot. A numbered list is a tracklist
 * even with nowhere to seek to, and it is what makes library matching possible.
 */
withFixtures('BBC Essential Mix — a numbered list with no timestamps', () => {
  const { video, comments } = readJson<RawSet>('_wfwSaA5GeE.json')

  it('reads all 24 tracks out of the description', () => {
    const result = analyse(video, comments)
    expect(result.trackCount).toBe(24)
    expect(result.source).toBe('description')
    expect(result.status).toBe('ok')
  })

  it('says plainly that there are no timestamps', () => {
    const result = analyse(video, comments)
    // The player cannot seek to any of these, and the UI has to know that
    // rather than send everyone to 0:00.
    expect(result.untimed).toBe(true)
    expect(result.tracks.every((t) => t.cueMs === 0 && t.cue === '')).toBe(true)
  })

  it('keeps the artist, the remix and the label off each row', () => {
    const { tracks } = analyse(video, comments)

    expect(tracks[0].artist).toBe('Hot Since 82 & Shades Of Rhythm')
    expect(tracks[0].title).toBe('Shaded')
    expect(tracks[0].label).toBe('KNEE DEEP IN SOUND')

    const burning = tracks.find((t) => t.title === 'Burning')
    expect(burning?.artist).toBe('MK ft. Alana')
    expect(burning?.mix).toBe('Hot Since 82 Remix')
    expect(burning?.label).toBe('DEFECTED')

    // Numbering is stripped, not carried into the artist.
    expect(tracks.every((t) => !/^\d+[.)]/.test(t.artist ?? ''))).toBe(true)
  })

  it('no longer falls back to a shout in the comments', () => {
    const { tracks } = analyse(video, comments)
    expect(tracks.map((t) => t.title)).not.toContain('OH MY F*K, CHANTE!')
  })
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
    expect(splitArtistTitle('Jean-Michel Jarre - Oxygene').artist).toBe(
      'Jean-Michel Jarre',
    )
    expect(splitArtistTitle('Jean-Michel Jarre - Oxygene').title).toBe(
      'Oxygene',
    )
  })

  it('separates label, mix, note and uncertainty from the name', () => {
    const parsed = splitArtistTitle(
      'Crusy - Kids (Todd Terje Remix) [Defected]',
    )
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
    expect(splitArtistTitle('Artist - Title - thanks @someone').title).toBe(
      'Title',
    )
    expect(splitArtistTitle('Artist - Title @someone').title).toBe('Title')
  })

  it('matches partial credits by containment, which is what merging relies on', () => {
    // One person writes the lead artist, another the full credit.
    expect(containment(normalise('Crusy'), normalise('Crusy, Karretero'))).toBe(
      1,
    )
    expect(containment(normalise('Kids'), normalise('Kids'))).toBe(1)
    expect(containment(normalise('Kids'), normalise('Something Else'))).toBe(0)
  })

  it('ignores a block of text that is not a tracklist', () => {
    const chapters = 'watch this\n0:00 hello\n1:00 bye'
    expect(extractTracklist(chapters, 3_600_000).tracks).toHaveLength(0)
  })

  it('refuses a narration comment, however tracklist-shaped it looks', () => {
    // Reported from a real set: someone narrating the crowd with timestamps.
    // It is ascending, inside the runtime and has plenty of rows, so every
    // structural check passes — only the language gives it away.
    const narration = [
      '1:09:42 Lad with red hat acquires target',
      '1:10:13 tattoo girl checks on the lad maybe she is interested. she doesnt know yet',
      '1:10:55 blond girl comes to rescue her friend, she know shes not interested',
      '1:11:36 Lad seems oppertunity for a threeway kiss, trying to keep his head cool.',
      '1:12:03 lad goes back to friend, tattoo girl goes back to blonde friend and nods',
    ].join('\n')

    const result = extractTracklist(narration, 7_200_000)
    expect(result.tracks).toHaveLength(0)
    expect(result.confidence).toBe(0)
  })

  it('still accepts a list of bare titles, which is what the prose rule must not break', () => {
    // A DJ playing their own records is listed without any "Artist - " prefix.
    // This is the case the artistShape floor exists for; the prose rule has to
    // leave it alone.
    const titlesOnly = [
      '0:00 Redemption',
      '4:30 Butterflies',
      '9:00 On His Way',
      '13:20 Never Look Back',
      '18:00 Purple Noise',
    ].join('\n')

    // Duration matched to the span, the way a real list covers its set — the
    // coverage term is what the confidence mostly measures.
    const result = extractTracklist(titlesOnly, 1_800_000)
    expect(result.tracks).toHaveLength(5)
    // 0.5 exactly: the artistShape floor, undiluted. This is the number the
    // Boris Brejcha reference set scores, and the reason the floor exists.
    expect(result.confidence).toBe(0.5)
  })

  it('drops a single joke line out of an otherwise real list', () => {
    const mixed = [
      '0:00 Velvet Season - Love Generation',
      '6:00 Jordano Roosevelt - Scars',
      '9:00 the guy in the front row has absolutely lost his mind right here',
      '11:00 Alan Nieves - Apologize',
      '15:30 Avision - This Time',
    ].join('\n')

    const result = extractTracklist(mixed, 7_200_000)
    expect(result.tracks).toHaveLength(4)
    expect(result.tracks.map((t) => t.title)).not.toContain(
      'the guy in the front row has absolutely lost his mind right here',
    )
    // Renumbered after the drop, with no gap where the joke was.
    expect(result.tracks.map((t) => t.index)).toEqual([1, 2, 3, 4])
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
