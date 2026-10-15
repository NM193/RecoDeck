import { describe, expect, it } from 'vitest'
import { baseName, isInsideFolders, parentFolder } from './paths'

describe('isInsideFolders', () => {
  const folders = ['/Music', '/Sets/']
  it('accepts a library folder itself and anything below it', () => {
    expect(isInsideFolders('/Music', folders)).toBe(true)
    expect(isInsideFolders('/Music/House/a.mp3', folders)).toBe(true)
    expect(isInsideFolders('/Sets', folders)).toBe(true)
    expect(isInsideFolders('/Sets/2026/', folders)).toBe(true)
  })
  it('rejects a sibling that only shares the prefix', () => {
    expect(isInsideFolders('/Music2/a.mp3', folders)).toBe(false)
    expect(isInsideFolders('/Downloads/a.mp3', folders)).toBe(false)
  })
})

describe('parentFolder and baseName', () => {
  it('split a path', () => {
    expect(parentFolder('/Music/House/a.mp3')).toBe('/Music/House')
    expect(parentFolder('/a.mp3')).toBe('/')
    expect(baseName('/Music/House/')).toBe('House')
    expect(baseName('/Music/House/a.mp3')).toBe('a.mp3')
  })
})
