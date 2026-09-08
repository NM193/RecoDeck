/**
 * Matching is generous by design — tags and typed tracklists never agree
 * exactly — so these tests pin down where the generosity has to stop.
 */

import { describe, expect, it } from 'vitest'

import { matchTracklist, type LibraryTrack } from './match'
import { normalise } from './text'
import type { Track } from './types'

/** A parsed row, with only the fields matching actually reads. */
function parsed(index: number, artist: string | null, title: string, isUnknown = false): Track {
  return {
    index,
    cue: '0:00',
    cueMs: 0,
    artist,
    title,
    mix: null,
    label: null,
    note: null,
    uncertain: false,
    isUnknown,
    artistNorm: normalise(artist),
    titleNorm: normalise(title),
    votes: 1,
    listed: 1,
    sourceCount: 1,
    disagree: [],
  }
}

function lib(id: number, artist: string | undefined, title: string): LibraryTrack {
  return { id, artist, title, file_path: `/music/${id}.mp3` }
}

describe('matching a tracklist against the library', () => {
  const library: LibraryTrack[] = [
    lib(1, 'Crusy, Karretero', 'Feels Much Better (Extended Mix)'),
    lib(2, 'Dolly Parton', 'Jolene'),
    lib(3, 'MK', 'Burning'),
    lib(4, undefined, 'Sound Check One'),
    lib(5, 'Some Other Artist', 'Jolene'),
  ]

  it('matches a partial credit against a fuller one', () => {
    // The tracklist says "Crusy", the file says "Crusy, Karretero".
    const { byIndex, owned } = matchTracklist([parsed(1, 'Crusy', 'Feels Much Better')], library)
    expect(owned).toBe(1)
    expect(byIndex.get(1)!.track.id).toBe(1)
  })

  it('ignores the mix suffix sitting in the tag', () => {
    const { byIndex } = matchTracklist([parsed(1, 'MK', 'Burning')], library)
    expect(byIndex.get(1)!.track.id).toBe(3)
  })

  it('picks the right artist when a title is shared', () => {
    const { byIndex } = matchTracklist([parsed(1, 'Dolly Parton', 'Jolene')], library)
    expect(byIndex.get(1)!.track.id).toBe(2)
  })

  it('counts what is missing', () => {
    const result = matchTracklist(
      [parsed(1, 'MK', 'Burning'), parsed(2, 'Nobody', 'Not In The Library')],
      library,
    )
    expect(result.owned).toBe(1)
    expect(result.missing).toBe(1)
  })

  it('needs an artist on both sides, never a title alone', () => {
    // Dozens of records are called "Lost" or "Jolene". Matching on a title
    // alone offered up strangers' records, so it is not evidence by itself.
    const bare: LibraryTrack[] = [lib(9, undefined, 'Jolene')]
    expect(matchTracklist([parsed(1, null, 'Jolene')], bare).owned).toBe(0)

    // Distinctive or not, a title with nobody attached to it stays unmatched.
    expect(matchTracklist([parsed(1, null, 'Sound Check One')], library).owned).toBe(0)
  })

  it('leaves unnamed slots out of both counts', () => {
    const result = matchTracklist([parsed(1, null, 'ID', true)], library)
    expect(result.owned).toBe(0)
    expect(result.missing).toBe(0)
    expect(result.byIndex.size).toBe(0)
  })

  it('rejects a different artist with the same title', () => {
    const result = matchTracklist([parsed(1, 'Totally Different Person', 'Burning')], library)
    expect(result.owned).toBe(0)
  })

  it('does not let a one-word title claim a long, unrelated file', () => {
    // Reported from a real set. The list says "Simion feat. Roland Clark - Lost";
    // the file is "Lee Burridge & Lost Desert - Elongi feat. Junior" with no
    // artist tag. containment divides by the shorter side, so the single word
    // "lost" scored a perfect 1.0 against it and the app offered to play it.
    const realWorld: LibraryTrack[] = [
      { id: 10, artist: undefined, title: 'Lee Burridge & Lost Desert - Elongi feat. Junior', file_path: '/m/10.mp3' },
    ]
    const result = matchTracklist([parsed(1, 'Simion feat. Roland Clark', 'Lost')], realWorld)
    expect(result.owned).toBe(0)
    expect(result.missing).toBe(1)
  })

  it('treats an "Unknown Artist" tag as no artist at all', () => {
    const placeholder: LibraryTrack[] = [lib(11, 'Unknown Artist', 'Movement Of Whale')]
    // The placeholder says nothing, so there is nobody to agree with.
    expect(matchTracklist([parsed(1, 'SevenDoors', 'Movement Of Whale')], placeholder).owned).toBe(0)
  })

  it('reads the artist out of the title when the tag has none', () => {
    // Plenty of files are tagged this way. Insisting on an artist tag without
    // reading these would mark half a library as missing.
    const untagged: LibraryTrack[] = [
      { id: 30, artist: undefined, title: 'Lee Burridge & Lost Desert - Elongi feat. Junior', file_path: '/m/30.mp3' },
    ]

    const { byIndex, owned } = matchTracklist(
      [parsed(1, 'Lee Burridge & Lost Desert', 'Elongi')],
      untagged,
    )
    expect(owned).toBe(1)
    expect(byIndex.get(1)!.track.id).toBe(30)

    // And the record that started all this still does not match.
    expect(matchTracklist([parsed(1, 'Simion feat. Roland Clark', 'Lost')], untagged).owned).toBe(0)
  })

  it('matches a plain tag against a remix named in the tracklist', () => {
    // The set lists the remix; the file is tagged with the bare title.
    const withMix: Track = {
      ...parsed(1, "Mousse T & Hot 'N' Juicy", 'Horny'),
      mix: 'Radio Slave & Thomas Gandey Just 17 Mix',
      titleNorm: normalise('Horny Radio Slave & Thomas Gandey Just 17 Mix'),
    }
    const plain: LibraryTrack[] = [lib(12, "Mousse T & Hot 'N' Juicy", 'Horny')]
    expect(matchTracklist([withMix], plain).owned).toBe(1)
  })

  it('does not offer a different remix as the same record', () => {
    // Both reported from real sets. The DJ played one version; the file on disk
    // is another one, and for a DJ that is a different record entirely.
    const shelf: LibraryTrack[] = [
      { id: 20, artist: 'John Summit', title: 'Witch Doctor (feat. Nic Fanciulli) [Extended Mix]', file_path: '/m/20.mp3' },
      { id: 21, artist: undefined, title: 'At Night (Afterlife Mix)', file_path: '/m/21.mp3' },
    ]

    const witchDoctor: Track = {
      ...parsed(1, 'John Summit & Nic Fanciulli', 'Witch Doctor'),
      mix: 'Hot Since 82 Remix',
      titleNorm: normalise('Witch Doctor Hot Since 82 Remix'),
    }
    const atNight: Track = {
      ...parsed(2, 'Shakedown', 'At Night'),
      mix: 'Kid Crème Club Mix',
      titleNorm: normalise('At Night Kid Crème Club Mix'),
    }

    const result = matchTracklist([witchDoctor, atNight], shelf)
    expect(result.owned).toBe(0)
    expect(result.missing).toBe(2)
  })

  it('still matches when only one side names the version', () => {
    // The tracklist writes the remix out, the tag does not — same record.
    const shelf: LibraryTrack[] = [lib(22, "Mousse T", 'Horny')]
    const withMix: Track = {
      ...parsed(1, "Mousse T", 'Horny'),
      mix: 'Radio Slave Just 17 Mix',
      titleNorm: normalise('Horny Radio Slave Just 17 Mix'),
    }
    expect(matchTracklist([withMix], shelf).owned).toBe(1)
  })

  it('matches the same version written differently', () => {
    const shelf: LibraryTrack[] = [lib(23, 'Crusy', 'Feels Much Better (Extended Mix)')]
    const sameMix: Track = {
      ...parsed(1, 'Crusy', 'Feels Much Better'),
      mix: 'Extended Mix',
      titleNorm: normalise('Feels Much Better Extended Mix'),
    }
    expect(matchTracklist([sameMix], shelf).owned).toBe(1)
  })

  it('handles an empty library without pretending', () => {
    const result = matchTracklist([parsed(1, 'MK', 'Burning')], [])
    expect(result.owned).toBe(0)
    expect(result.missing).toBe(1)
  })
})
