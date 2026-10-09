import { describe, expect, it } from 'vitest'
import { MAX_DJ_RECENT, orderYourDjs, rememberDj } from './recent'

describe('DJ pages opened lately', () => {
  it('puts the DJ key in front, once', () => {
    expect(rememberDj(['ben rau', 'traumer'], ' Traumer ')).toEqual([
      'traumer',
      'ben rau',
    ])
  })

  it(`keeps the newest ${MAX_DJ_RECENT}`, () => {
    const list = Array.from({ length: MAX_DJ_RECENT }, (_, i) => `dj ${i}`)
    const next = rememberDj(list, 'New DJ')
    expect(next).toHaveLength(MAX_DJ_RECENT)
    expect(next[0]).toBe('new dj')
  })

  it('ignores an empty name', () => {
    const list = ['traumer']
    expect(rememberDj(list, '  ')).toBe(list)
  })

  it('orders Your DJs: opened lately first, then the rest as given (by name)', () => {
    const djs = ['amy', 'ben rau', 'hot since 82', 'traumer'].map(
      (nameKey) => ({ nameKey }),
    )
    expect(
      orderYourDjs(djs, ['traumer', 'gone', 'ben rau']).map((dj) => dj.nameKey),
    ).toEqual(['traumer', 'ben rau', 'amy', 'hot since 82'])
  })
})
