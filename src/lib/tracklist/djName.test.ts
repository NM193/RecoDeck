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
