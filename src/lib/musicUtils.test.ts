import { describe, it, expect } from 'vitest'
import { getKeyCompatibility, getBpmIssue } from './musicUtils'

describe('getKeyCompatibility', () => {
  it('returns perfect for identical keys', () => {
    expect(getKeyCompatibility('8A', '8A')).toBe('perfect')
  })

  it('returns compatible for same number different letter', () => {
    expect(getKeyCompatibility('8A', '8B')).toBe('compatible')
    expect(getKeyCompatibility('1B', '1A')).toBe('compatible')
  })

  it('returns compatible for adjacent number same letter', () => {
    expect(getKeyCompatibility('5A', '6A')).toBe('compatible')
    expect(getKeyCompatibility('6A', '5A')).toBe('compatible')
  })

  it('returns compatible for circular wrap (12A <-> 1A)', () => {
    expect(getKeyCompatibility('12A', '1A')).toBe('compatible')
    expect(getKeyCompatibility('1B', '12B')).toBe('compatible')
  })

  it('returns clash for non-adjacent keys', () => {
    expect(getKeyCompatibility('1A', '6A')).toBe('clash')
    expect(getKeyCompatibility('3B', '10B')).toBe('clash')
  })

  it('returns clash for different letter AND non-adjacent number', () => {
    expect(getKeyCompatibility('1A', '5B')).toBe('clash')
  })

  it('returns clash when either key is undefined', () => {
    expect(getKeyCompatibility(undefined, '8A')).toBe('clash')
    expect(getKeyCompatibility('8A', undefined)).toBe('clash')
    expect(getKeyCompatibility(undefined, undefined)).toBe('clash')
  })

  it('returns clash for unparseable keys', () => {
    expect(getKeyCompatibility('XY', '8A')).toBe('clash')
    expect(getKeyCompatibility('8A', '0A')).toBe('clash')
    expect(getKeyCompatibility('13A', '8A')).toBe('clash')
  })
})

describe('getBpmIssue', () => {
  it('returns ok for delta <= 5', () => {
    expect(getBpmIssue(128, 128)).toBe('ok')
    expect(getBpmIssue(128, 133)).toBe('ok')
    expect(getBpmIssue(128, 123)).toBe('ok')
  })

  it('returns warn for delta 6-10', () => {
    expect(getBpmIssue(120, 128)).toBe('warn')
    expect(getBpmIssue(130, 140)).toBe('warn')
  })

  it('returns bad for delta > 10', () => {
    expect(getBpmIssue(120, 140)).toBe('bad')
    expect(getBpmIssue(128, 100)).toBe('bad')
  })

  it('returns bad when either BPM is undefined', () => {
    expect(getBpmIssue(undefined, 128)).toBe('bad')
    expect(getBpmIssue(128, undefined)).toBe('bad')
    expect(getBpmIssue(undefined, undefined)).toBe('bad')
  })

  it('returns ok for exact boundary (delta = 5)', () => {
    expect(getBpmIssue(125, 130)).toBe('ok')
  })

  it('returns warn for exact boundary (delta = 10)', () => {
    expect(getBpmIssue(120, 130)).toBe('warn')
  })
})
