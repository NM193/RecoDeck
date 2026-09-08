/**
 * The cases are the real titles of the reference sets, because that is the
 * shape of the problem: seven titles, five different conventions.
 */

import { describe, expect, it } from 'vitest'

import { extractDjName, groupByDj } from './djName'

describe('finding the DJ in a set title', () => {
  it('handles every shape the reference sets use', () => {
    expect(extractDjName('Hot Since 82 | Mixmag Lab London', 'Mixmag')).toBe('Hot Since 82')
    expect(extractDjName('Solomun | Boiler Room: Tulum', 'Boiler Room')).toBe('Solomun')
    expect(
      extractDjName("Solomun @ Théâtre Antique d'Orange in France for Cercle", 'Cercle'),
    ).toBe('Solomun')
    expect(
      extractDjName('Boris Brejcha at Grand Palais in Paris, France for Cercle', 'Cercle'),
    ).toBe('Boris Brejcha')
    expect(extractDjName('Luciano - @Thuishaven Amsterdam 2026', 'Thuishaven')).toBe('Luciano')
    expect(
      extractDjName(
        'Dr Banana | Det Gode Selskab x Burn Energy Tour x Mixmag | Norway',
        'Mixmag',
      ),
    ).toBe('Dr Banana')
  })

  it('keeps a back-to-back billing whole', () => {
    // Two names, one act — cutting at the first separator would lose the second.
    expect(
      extractDjName('Priku B2B Traumer @ Berg Audio x Hola Club [OFF SONAR 2026]', 'Berg Audio'),
    ).toBe('Priku B2B Traumer')
  })

  it('drops trailing noise', () => {
    expect(extractDjName('Peggy Gou (4K) | Boiler Room', 'Boiler Room')).toBe('Peggy Gou')
  })

  /**
   * All three appeared in one library view, each filed under its own heading
   * as though it were a different act.
   */
  it('drops what the DJ did, and keeps who they are', () => {
    // "Hot Since 82 House Set" filed apart from "Hot Since 82".
    expect(extractDjName('Hot Since 82 House Set | KISS DANCE', 'KISS')).toBe('Hot Since 82')
    // "JOSEPH CAPRIATI closing set" filed apart from the same man.
    expect(
      extractDjName(
        'JOSEPH CAPRIATI closing set @ AMNESIA IBIZA opening party 2024 by LUCA DEA',
        'Luca Dea',
      ),
    ).toBe('JOSEPH CAPRIATI')
    expect(extractDjName('Traumer DJ SET - Sacré [FULL MIX]', 'traumer')).toBe('Traumer')
    expect(extractDjName('Boris Brejcha live set @ Tomorrowland', 'Tomorrowland')).toBe(
      'Boris Brejcha',
    )
  })

  it('does not strip a word that is part of the name', () => {
    // The rule removes what someone did, never who they are.
    expect(extractDjName('Mixed Emotions | Boiler Room', 'Boiler Room')).toBe('Mixed Emotions')
    expect(extractDjName('Sunset Rollercoaster @ Cercle', 'Cercle')).toBe('Sunset Rollercoaster')
    // Stripping must never leave nothing behind.
    expect(extractDjName('Live | Boiler Room', 'Boiler Room')).toBe('Live')
  })

  it('reads past a compilation series to the artist behind it', () => {
    // "Fabric 80 - Joseph Capriati" is a record, not a DJ called Fabric 80.
    expect(extractDjName('Fabric 80 - Joseph Capriati | CD (2015)', 'Progressive Addict')).toBe(
      'Joseph Capriati',
    )
    // But a real name that happens to end in a number stays whole.
    expect(extractDjName('Hot Since 82 - Radio 1s Essential Mix', 'Radio 1')).toBe('Hot Since 82')
  })

  it('files every Hot Since 82 set under one heading', () => {
    const groups = groupByDj([
      { title: 'Hot Since 82 | Mixmag Lab London', channel: 'Mixmag' },
      { title: 'Hot Since 82 House Set | KISS DANCE', channel: 'KISS' },
      { title: 'HOT SINCE 82 (UK) @ BBC Radio 1 Essential Mix', channel: 'cosmobeat' },
      { title: 'HOT SINCE 82 at Music On Festival 2022 444 Hz', channel: 'FLAWLESS' },
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].sets).toHaveLength(4)
  })

  it('falls back to the host when the title is just a description', () => {
    // Nothing that reads as a name in front, so labelling it with the host beats
    // inventing a DJ called "The best deep house mix of".
    expect(
      extractDjName('The best deep house mix of the summer 2026 for your holiday', 'Some Channel'),
    ).toBe('Some Channel')
    expect(extractDjName('', 'Some Channel')).toBe('Some Channel')
    expect(extractDjName('')).toBe('Unknown')
  })

  it('groups sets under one act regardless of spelling, biggest group first', () => {
    const groups = groupByDj([
      { title: 'Solomun | Boiler Room: Tulum', channel: 'Boiler Room' },
      { title: 'SOLOMUN @ Cercle', channel: 'Cercle' },
      { title: 'Hot Since 82 | Mixmag', channel: 'Mixmag' },
    ])

    expect(groups).toHaveLength(2)
    expect(groups[0].dj).toBe('Solomun')
    expect(groups[0].sets).toHaveLength(2)
    expect(groups[1].dj).toBe('Hot Since 82')
  })
})
