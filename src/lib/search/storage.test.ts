import { describe, expect, it } from 'vitest'
import { parseStringList } from './storage'

describe('a stored list of strings', () => {
  it('keeps non-empty strings, at most max', () => {
    expect(
      parseStringList('["traumer", 3, "", " ", "capriati", "amy"]', 2),
    ).toEqual(['traumer', 'capriati'])
  })

  it('is empty when nothing readable is stored', () => {
    expect(parseStringList(null, 10)).toEqual([])
    expect(parseStringList('{"a":1}', 10)).toEqual([])
    expect(parseStringList('not json', 10)).toEqual([])
  })
})
