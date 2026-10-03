// src/lib/spotify/ownership.test.ts
import { describe, expect, it } from 'vitest'
import {
  buildOwnershipIndex,
  classifyItems,
  classifyTracks,
  maybeReason,
  ownershipOf,
  type Ownership,
} from './ownership'
import { indexLibrary, matchOne, type LibraryTrack } from '../tracklist/match'
import { toParsed } from './title'
import type { SpotifyTrack, SpotifyVerdict } from '../../types/spotify'

function lib(id: number, artist: string, title: string): LibraryTrack {
  return { id, artist, title, file_path: `/music/${artist} - ${title}.mp3` }
}

function sp(spotifyId: string, title: string, artists: string): SpotifyTrack {
  return { spotifyId, title, artists, album: null, durationMs: null }
}

function classify(
  tracks: SpotifyTrack[],
  library: LibraryTrack[],
  verdicts: SpotifyVerdict[] = [],
) {
  return classifyTracks(tracks, buildOwnershipIndex(library), verdicts)
}

describe('do I own this Spotify track?', () => {
  const shelf = [
    lib(1, 'Butch', 'Come Get Up (Extended Mix)'),
    lib(2, 'Moreno, Prieto, Ortega, Lopez', '300 Cash'),
    lib(3, 'Witchy', 'Witch Doctor (Extended Mix)'),
  ]

  it('is Owned on a strong match, with the file', () => {
    const result = classify(
      [sp('a', 'Come Get Up - Extended Mix', 'Butch, Santos')],
      shelf,
    )
    expect(result.get('a')).toEqual({ kind: 'owned', file: shelf[0] })
  })

  it('is Maybe on a weak match, and says why', () => {
    const result = classify(
      [sp('b', '300 Cash', 'Moreno & Prieto, Sortech')],
      shelf,
    )
    expect(result.get('b')).toEqual({
      kind: 'maybe',
      file: shelf[1],
      reason: 'same title, artist partly matches',
    })
  })

  it('is Missing when nothing matches', () => {
    expect(
      classify([sp('c', 'Tell You', 'Prunk, Retrouve')], shelf).get('c'),
    ).toEqual({ kind: 'missing' })
  })

  it('does not take a remix for the extended mix — the version Spotify puts after the dash counts', () => {
    const result = classify(
      [sp('d', 'Witch Doctor - Hot Since 82 Remix', 'Witchy')],
      shelf,
    )
    expect(result.get('d')?.kind).toBe('missing')
  })

  it('takes Original Mix, Extended Mix and Radio Edit for the same record', () => {
    const extended = [lib(6, 'Clive, Deepower', 'Little Girl (Extended Mix)')]
    const original = [lib(7, 'Clive, Deepower', 'Little Girl (Original Mix)')]
    const artists = 'Clive, Deepower'

    expect(
      classify([sp('e', 'Little Girl - Original Mix', artists)], extended).get(
        'e',
      ),
    ).toEqual({
      kind: 'owned',
      file: extended[0],
    })
    expect(
      classify([sp('f', 'Little Girl - Extended Mix', artists)], original).get(
        'f',
      ),
    ).toEqual({
      kind: 'owned',
      file: original[0],
    })
    expect(
      classify([sp('g', 'Little Girl - Radio Edit', artists)], extended).get(
        'g',
      ),
    ).toEqual({
      kind: 'owned',
      file: extended[0],
    })
  })

  it('does not take a named remix for the Original Mix', () => {
    const original = [lib(8, 'Witchy', 'Witch Doctor (Original Mix)')]
    expect(
      classify(
        [sp('h', 'Witch Doctor - Hot Since 82 Remix', 'Witchy')],
        original,
      ).get('h'),
    ).toEqual({
      kind: 'missing',
    })
  })

  it('is Owned whether or not either side types the accents', () => {
    const accented = [lib(13, 'Kölsch', 'Grey'), lib(14, 'Âme', 'Rej')]
    const plain = [lib(15, 'Kolsch', 'Grey'), lib(16, 'Ame', 'Rej')]

    const unaccented = classify(
      [sp('k', 'Grey', 'Kolsch'), sp('m', 'Rej', 'Ame')],
      accented,
    )
    expect(unaccented.get('k')).toEqual({ kind: 'owned', file: accented[0] })
    expect(unaccented.get('m')).toEqual({ kind: 'owned', file: accented[1] })

    const withAccents = classify(
      [sp('k', 'Grey', 'Kölsch'), sp('m', 'Rej', 'Âme')],
      plain,
    )
    expect(withAccents.get('k')).toEqual({ kind: 'owned', file: plain[0] })
    expect(withAccents.get('m')).toEqual({ kind: 'owned', file: plain[1] })
  })

  it('is Owned after a Yes, whatever the matcher thinks', () => {
    const verdicts: SpotifyVerdict[] = [
      { spotifyId: 'c', libraryTrackId: 2, verdict: 'yes' },
    ]
    const result = classify(
      [sp('c', 'Tell You', 'Prunk, Retrouve')],
      shelf,
      verdicts,
    )
    expect(result.get('c')).toEqual({ kind: 'owned', file: shelf[1] })
  })

  it('looks past a file answered No, to another one or to nothing', () => {
    const twins = [
      lib(4, 'Moreno, Prieto, Ortega, Lopez', '300 Cash'),
      lib(5, 'Moreno, Prieto, Garcia, Ruiz', '300 Cash'),
    ]
    const track = sp('b', '300 Cash', 'Moreno & Prieto, Sortech')

    const first = classify([track], twins).get('b')
    expect(first?.file?.id).toBe(4)

    const noToFour: SpotifyVerdict[] = [
      { spotifyId: 'b', libraryTrackId: 4, verdict: 'no' },
    ]
    expect(classify([track], twins, noToFour).get('b')).toMatchObject({
      kind: 'maybe',
      file: twins[1],
    })

    const noToBoth: SpotifyVerdict[] = [
      ...noToFour,
      { spotifyId: 'b', libraryTrackId: 5, verdict: 'no' },
    ]
    expect(classify([track], twins, noToBoth).get('b')).toEqual({
      kind: 'missing',
    })
  })

  it('ignores a verdict about a file that is no longer in the library', () => {
    const verdicts: SpotifyVerdict[] = [
      { spotifyId: 'c', libraryTrackId: 999, verdict: 'yes' },
    ]
    expect(
      classify([sp('c', 'Tell You', 'Prunk, Retrouve')], shelf, verdicts).get(
        'c',
      ),
    ).toEqual({
      kind: 'missing',
    })
  })

  it('answers for every track, keyed by Spotify id', () => {
    const result = classify(
      [sp('a', 'Come Get Up', 'Butch'), sp('c', 'Tell You', 'Prunk')],
      shelf,
    )
    expect([...result.keys()]).toEqual(['a', 'c'])
  })
})

describe('the title-word pre-filter', () => {
  it('gives exactly what comparing every track with every file gives', () => {
    const library: LibraryTrack[] = [
      lib(1, 'Butch', 'Come Get Up (Extended Mix)'),
      lib(2, 'Moreno, Prieto, Ortega, Lopez', '300 Cash'),
      lib(3, 'Moreno, Prieto, Garcia, Ruiz', '300 Cash'),
      lib(4, 'Witchy', 'Witch Doctor (Extended Mix)'),
      lib(5, 'Witchy', 'Witch Doctor (Hot Since 82 Remix)'),
      lib(6, 'Clive, Deepower', 'Little Girl (Original Mix)'),
      {
        id: 7,
        title: 'Lee Burridge & Lost Desert - Elongi feat. Junior',
        file_path: '/m/7.mp3',
      },
      lib(8, 'Unknown Artist', 'Movement Of Whale'),
      lib(
        9,
        'Discoplex, Izaac Moses',
        'I Need A Rush (feat. Sheree Hicks) [Extended Mix]',
      ),
      lib(10, 'Dolly Parton', 'Jolene'),
      lib(11, 'Some Other Artist', 'Jolene'),
      lib(12, 'Makèz', 'Reverse Things'),
    ]
    const tracks: SpotifyTrack[] = [
      sp('a', 'Come Get Up - Extended Mix', 'Butch, Santos'),
      sp('b', '300 Cash', 'Moreno & Prieto, Sortech'),
      sp('c', 'Witch Doctor - Hot Since 82 Remix', 'Witchy'),
      sp('d', 'Witch Doctor - Radio Edit', 'Witchy'),
      sp('e', 'Little Girl - Extended Mix', 'Clive, Deepower'),
      sp('f', 'Elongi', 'Lee Burridge, Lost Desert'),
      sp('g', 'Lost', 'Simion, Roland Clark'),
      sp('h', 'Movement Of Whale', 'SevenDoors'),
      sp(
        'i',
        'I Need A Rush (feat. Sheree Hicks) - Extended Mix',
        'Discoplex, Izaac Moses, Sheree Hicks',
      ),
      sp('j', 'Jolene', 'Dolly Parton'),
      sp('k', 'Reverse Things', 'Makèz, Toman'),
      sp('l', 'Tell You', 'Prunk, Retrouve'),
      sp('m', '', 'Nobody'),
    ]

    const everything = indexLibrary(library)
    const expected = new Map<string, Ownership>()
    for (const track of tracks) {
      const match = matchOne(toParsed(track), everything)
      expected.set(
        track.spotifyId,
        !match
          ? { kind: 'missing' }
          : match.strong
            ? { kind: 'owned', file: match.track }
            : { kind: 'maybe', file: match.track, reason: maybeReason(match) },
      )
    }

    const result = classify(tracks, library)
    expect(result).toEqual(expected)
    // The fixture exercises all three answers, so the comparison means something.
    expect(new Set([...result.values()].map((o) => o.kind))).toEqual(
      new Set(['owned', 'maybe', 'missing']),
    )
  })
})

describe('ownership of a row that is not a Spotify track', () => {
  // A saved set's row, as the tracklist parser shapes it: the version in its own
  // field, and folded into titleNorm.
  const shelf = [
    lib(1, 'Butch', 'Come Get Up (Extended Mix)'),
    lib(2, 'Moreno, Prieto, Ortega, Lopez', '300 Cash'),
  ]
  const index = buildOwnershipIndex(shelf)
  const comeGetUp = {
    artist: 'Butch',
    title: 'Come Get Up',
    mix: 'Extended Mix',
    artistNorm: 'butch',
    titleNorm: 'come get up extended mix',
  }

  it('is Owned, Maybe or Missing by the same rules as a Spotify track', () => {
    expect(ownershipOf(comeGetUp, index)).toEqual({
      kind: 'owned',
      file: shelf[0],
    })
    expect(
      ownershipOf(
        {
          artist: 'Moreno & Prieto, Sortech',
          title: '300 Cash',
          mix: null,
          artistNorm: 'moreno prieto sortech',
          titleNorm: '300 cash',
        },
        index,
      ),
    ).toEqual({
      kind: 'maybe',
      file: shelf[1],
      reason: 'same title, artist partly matches',
    })
    expect(
      ownershipOf(
        {
          artist: 'Prunk',
          title: 'Tell You',
          mix: null,
          artistNorm: 'prunk',
          titleNorm: 'tell you',
        },
        index,
      ),
    ).toEqual({ kind: 'missing' })
  })

  it('skips the files it is told to', () => {
    expect(ownershipOf(comeGetUp, index, new Set([1]))).toEqual({
      kind: 'missing',
    })
  })
})

describe('ownership through the shared shape', () => {
  const shelf = [
    lib(1, 'Soulva', 'Odyssey (Original Mix)'),
    lib(2, 'Some Producer', 'Honey Hunter'),
  ]
  const index = buildOwnershipIndex(shelf)
  const odyssey = {
    artist: 'Soulva',
    title: 'Odyssey',
    mix: 'Original Mix',
    artistNorm: 'soulva',
    titleNorm: 'odyssey original mix',
  }
  const bareHoney = {
    artist: null,
    title: 'Honey Hunter',
    mix: null,
    artistNorm: null,
    titleNorm: 'honey hunter',
  }

  it('answers any source by its id', () => {
    const result = classifyItems([{ id: 'v1', parsed: odyssey }], index, [])
    expect(result.get('v1')).toEqual({ kind: 'owned', file: shelf[0] })
  })

  it('reads verdicts keyed by the same id', () => {
    const result = classifyItems(
      [{ id: 'v4', parsed: bareHoney, titleOnly: true }],
      index,
      [{ id: 'v4', libraryTrackId: 2, verdict: 'yes' }],
    )
    expect(result.get('v4')).toEqual({ kind: 'owned', file: shelf[1] })
  })

  it('makes a same-titled file a Maybe when the row names no artist and asks for it', () => {
    expect(ownershipOf(bareHoney, index)).toEqual({ kind: 'missing' })
    expect(ownershipOf(bareHoney, index, undefined, true)).toEqual({
      kind: 'maybe',
      file: shelf[1],
      reason: 'same title, artist unknown',
    })
  })

  it('wants the title to agree in full, and never answers Owned on a title alone', () => {
    const partly = { ...bareHoney, title: 'Honey Monster', titleNorm: 'honey monster' }
    expect(ownershipOf(partly, index, undefined, true)).toEqual({ kind: 'missing' })
    // A row with an artist that does not agree stays Missing: titleOnly is
    // only for rows that name none.
    const otherArtist = { ...bareHoney, artist: 'Extrawelt', artistNorm: 'extrawelt' }
    expect(ownershipOf(otherArtist, index, undefined, true)).toEqual({ kind: 'missing' })
  })

  it('takes the file with exactly the same title, not one that merely contains it', () => {
    const files = [lib(10, 'A', 'Honey Hunter'), lib(11, 'B', 'Honey'), lib(12, 'C', 'Home Again')]
    const idx = buildOwnershipIndex(files)
    const honey = { ...bareHoney, title: 'Honey', titleNorm: 'honey' }
    expect(ownershipOf(honey, idx, undefined, true)).toMatchObject({ kind: 'maybe', file: files[1] })
    const home = { ...bareHoney, title: 'Home', titleNorm: 'home' }
    expect(ownershipOf(home, idx, undefined, true)).toEqual({ kind: 'missing' })
    const aHome = { ...bareHoney, title: 'A Home', titleNorm: 'a home' }
    expect(ownershipOf(aHome, buildOwnershipIndex([lib(13, 'D', 'Home')]), undefined, true)).toEqual({
      kind: 'missing',
    })
  })

  it('treats Various Artists as no artist', () => {
    const va = { ...bareHoney, artist: 'Various Artists', artistNorm: 'various artists' }
    expect(ownershipOf(va, index, undefined, true)).toMatchObject({ kind: 'maybe', file: shelf[1] })
  })

  it('moves a title-only Maybe on after a No verdict', () => {
    const files = [lib(20, 'A', 'Honey Hunter'), lib(21, 'B', 'Honey Hunter')]
    const idx = buildOwnershipIndex(files)
    const item = { id: 'v9', parsed: bareHoney, titleOnly: true }
    const no = (id: number) => ({ id: 'v9', libraryTrackId: id, verdict: 'no' as const })
    expect(classifyItems([item], idx, [no(20)]).get('v9')).toMatchObject({ kind: 'maybe', file: files[1] })
    expect(classifyItems([item], idx, [no(20), no(21)]).get('v9')).toEqual({ kind: 'missing' })
  })

  it('says why a title-only Maybe is unsure', () => {
    expect(maybeReason({ titleScore: 1, artistScore: 0 })).toBe(
      'same title, artist unknown',
    )
  })
})
