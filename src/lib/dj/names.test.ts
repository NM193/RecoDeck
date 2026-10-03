// src/lib/dj/names.test.ts
import { describe, expect, it } from 'vitest'
import {
  djCardSubtitle,
  djKey,
  djNamesOfSet,
  findKnownDjs,
  knownDjs,
  newOnSpotify,
  setsOfDj,
  splitDjNames,
} from './names'

function set(title: string, channel = 'Some Channel') {
  return { video_id: title, title, channel }
}

describe('splitting a billing into DJs', () => {
  it('splits b2b and vs, in any case', () => {
    expect(splitDjNames('Marco Carola b2b Luciano')).toEqual([
      'Marco Carola',
      'Luciano',
    ])
    expect(splitDjNames('Priku B2B Traumer')).toEqual(['Priku', 'Traumer'])
    expect(splitDjNames('Adam Beyer VS Ida Engberg')).toEqual([
      'Adam Beyer',
      'Ida Engberg',
    ])
    expect(splitDjNames('A vs. B')).toEqual(['A', 'B'])
    expect(splitDjNames('A b2b B b2b C')).toEqual(['A', 'B', 'C'])
  })

  it('leaves a name that only contains the letters alone', () => {
    expect(splitDjNames('Vsevolod')).toEqual(['Vsevolod'])
    expect(splitDjNames('Rob2b')).toEqual(['Rob2b'])
    expect(splitDjNames('Luciano')).toEqual(['Luciano'])
  })

  it('reads the DJs of a saved set from its title', () => {
    expect(djNamesOfSet(set('Marco Carola b2b Luciano - KEEZY 2022'))).toEqual([
      'Marco Carola',
      'Luciano',
    ])
    expect(djNamesOfSet(set('Luciano - @Thuishaven Amsterdam 2026'))).toEqual([
      'Luciano',
    ])
  })

  it('keys a name the way watched DJs are keyed', () => {
    expect(djKey('  Luciano ')).toBe('luciano')
  })
})

describe("a DJ's saved sets", () => {
  const sets = [
    set('Marco Carola b2b Luciano - KEEZY 2022'),
    set('Luciano - @Thuishaven Amsterdam 2026'),
    set('Solomun | Boiler Room: Tulum'),
  ]

  it('includes a b2b set for both DJs', () => {
    expect(setsOfDj(sets, 'luciano').map((s) => s.title)).toEqual([
      'Marco Carola b2b Luciano - KEEZY 2022',
      'Luciano - @Thuishaven Amsterdam 2026',
    ])
    expect(setsOfDj(sets, 'marco carola')).toHaveLength(1)
    expect(setsOfDj(sets, 'luc')).toHaveLength(0)
  })

  it('lists every known DJ once, most sets first, watched DJs too', () => {
    const known = knownDjs(sets, [
      { name_key: 'luciano', display_name: 'LUCIANO' },
      { name_key: 'peggy gou', display_name: 'Peggy Gou' },
    ])
    expect(known).toEqual([
      { key: 'luciano', name: 'Luciano', setCount: 2 },
      { key: 'marco carola', name: 'Marco Carola', setCount: 1 },
      { key: 'solomun', name: 'Solomun', setCount: 1 },
      { key: 'peggy gou', name: 'Peggy Gou', setCount: 0 },
    ])
  })

  it('never lists the "Unknown" a nameless title gives', () => {
    // No name in front of a separator and no channel: extractDjName says "Unknown".
    const nameless = {
      title: 'Some long descriptive title that is clearly a sentence here',
    }
    expect(knownDjs([nameless], [])).toEqual([])
  })
})

describe('the DJs row in Search', () => {
  const known = [
    { key: 'luciano', name: 'Luciano', setCount: 6 },
    { key: 'solomun', name: 'Solomun', setCount: 2 },
  ]

  it('finds known DJs whose name contains the query', () => {
    expect(findKnownDjs(known, 'LUCI').map((d) => d.key)).toEqual(['luciano'])
    expect(findKnownDjs(known, '  ')).toEqual([])
  })

  it('adds Spotify results not already shown, at most six', () => {
    const results = [
      'Luciano',
      'Lucia Lu',
      'Luciano Lopez',
      'lucia lu',
      'A',
      'B',
      'C',
      'D',
      'E',
    ].map((name) => ({ name }))
    expect(newOnSpotify([known[0]], results, 6).map((r) => r.name)).toEqual([
      'Lucia Lu',
      'Luciano Lopez',
      'A',
      'B',
      'C',
      'D',
    ])
  })

  it('says how many sets, and how many tracks are owned once known', () => {
    expect(djCardSubtitle({ setCount: 6, owned: null })).toBe('6 sets')
    expect(djCardSubtitle({ setCount: 1, owned: 23 })).toBe(
      '1 set · you own 23',
    )
    expect(djCardSubtitle({ setCount: 0, owned: null })).toBe('watched')
    expect(djCardSubtitle('spotify')).toBe('on Spotify')
  })
})

describe('finding known DJs ignoring accents', () => {
  const known = [{ key: 'kölsch', name: 'Kölsch', setCount: 1 }]
  it('finds an accented name from plain letters and back', () => {
    expect(findKnownDjs(known, 'kolsch')).toHaveLength(1)
    expect(findKnownDjs(known, 'KÖL')).toHaveLength(1)
    expect(
      findKnownDjs([{ key: 'kolsch', name: 'Kolsch', setCount: 1 }], 'kölsch'),
    ).toHaveLength(1)
  })
})
