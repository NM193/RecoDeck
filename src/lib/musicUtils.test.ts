import { describe, it, expect } from 'vitest'
import { getKeyCompatibility, getKeyCompatibilityScore, getBpmIssue } from './musicUtils'

// ---------------------------------------------------------------------------
// Legacy 3-tier getKeyCompatibility (backward-compat)
// ---------------------------------------------------------------------------
describe('getKeyCompatibility', () => {
  it('returns perfect for identical keys', () => {
    expect(getKeyCompatibility('8A', '8A')).toBe('perfect')
  })

  it('returns compatible for same number different letter (relative)', () => {
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

  it('returns compatible for energy transitions', () => {
    // Energy boost +2 semitones (N+2 same letter)
    expect(getKeyCompatibility('8A', '10A')).toBe('compatible')
    // Energy boost +1 semitone (N+7 same letter)
    expect(getKeyCompatibility('2A', '9A')).toBe('compatible')
    // Diagonal transitions (N±1 switch letter)
    expect(getKeyCompatibility('8A', '9B')).toBe('compatible')
    expect(getKeyCompatibility('8A', '7B')).toBe('compatible')
  })

  it('returns compatible for energy transitions (previously clash)', () => {
    // 1A → 6A = offset +5 = energy drop -1 semitone (score 55)
    expect(getKeyCompatibility('1A', '6A')).toBe('compatible')
    // 3B → 10B = offset +7 = energy boost +1 semitone (score 75)
    expect(getKeyCompatibility('3B', '10B')).toBe('compatible')
  })

  it('returns clash for truly incompatible keys', () => {
    // offset +3 same letter = no recognized relationship
    expect(getKeyCompatibility('1A', '4A')).toBe('clash')
    // offset +4 same letter = no recognized relationship
    expect(getKeyCompatibility('1B', '5B')).toBe('clash')
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

// ---------------------------------------------------------------------------
// Expanded 4-tier getKeyCompatibilityScore
// ---------------------------------------------------------------------------
describe('getKeyCompatibilityScore', () => {
  it('returns perfect tier for same key (score 100)', () => {
    const r = getKeyCompatibilityScore('8A', '8A')
    expect(r.score).toBe(100)
    expect(r.tier).toBe('perfect')
    expect(r.label).toBe('same_key')
  })

  it('returns harmonic tier for relative major/minor (score 95)', () => {
    const r = getKeyCompatibilityScore('8A', '8B')
    expect(r.score).toBe(95)
    expect(r.tier).toBe('harmonic')
    expect(r.label).toBe('relative')
  })

  it('returns harmonic tier for adjacent +1 (score 90)', () => {
    const r = getKeyCompatibilityScore('8A', '9A')
    expect(r.score).toBe(90)
    expect(r.tier).toBe('harmonic')
    expect(r.label).toBe('adjacent_up')
  })

  it('returns harmonic tier for adjacent -1 (score 90)', () => {
    const r = getKeyCompatibilityScore('9A', '8A')
    expect(r.score).toBe(90)
    expect(r.tier).toBe('harmonic')
    expect(r.label).toBe('adjacent_down')
  })

  it('handles circular wrap for adjacent keys', () => {
    // 12A → 1A = +1 (adjacent up)
    const r1 = getKeyCompatibilityScore('12A', '1A')
    expect(r1.score).toBe(90)
    expect(r1.label).toBe('adjacent_up')

    // 1B → 12B = -1 (adjacent down)
    const r2 = getKeyCompatibilityScore('1B', '12B')
    expect(r2.score).toBe(90)
    expect(r2.label).toBe('adjacent_down')
  })

  it('returns energy tier for +2 semitone boost (score 80)', () => {
    const r = getKeyCompatibilityScore('8A', '10A')
    expect(r.score).toBe(80)
    expect(r.tier).toBe('energy')
    expect(r.label).toBe('energy_boost_2')
  })

  it('returns energy tier for +1 semitone boost (score 75)', () => {
    // +7 on wheel = +1 semitone
    const r = getKeyCompatibilityScore('2A', '9A')
    expect(r.score).toBe(75)
    expect(r.tier).toBe('energy')
    expect(r.label).toBe('energy_boost_1')
  })

  it('returns energy tier for diagonal transitions (score 70)', () => {
    // +1 switch letter = diagonal up
    const r1 = getKeyCompatibilityScore('8A', '9B')
    expect(r1.score).toBe(70)
    expect(r1.tier).toBe('energy')
    expect(r1.label).toBe('diagonal_up')

    // -1 switch letter = diagonal down
    const r2 = getKeyCompatibilityScore('8A', '7B')
    expect(r2.score).toBe(70)
    expect(r2.tier).toBe('energy')
    expect(r2.label).toBe('diagonal_down')
  })

  it('returns energy tier for -2 semitone drop (score 60)', () => {
    // -2 on wheel = +10
    const r = getKeyCompatibilityScore('10A', '8A')
    expect(r.score).toBe(60)
    expect(r.tier).toBe('energy')
    expect(r.label).toBe('energy_drop_2')
  })

  it('returns energy tier for -1 semitone drop (score 55)', () => {
    // -7 on wheel = +5
    const r = getKeyCompatibilityScore('9A', '2A')
    expect(r.score).toBe(55)
    expect(r.tier).toBe('energy')
    expect(r.label).toBe('energy_drop_1')
  })

  it('returns clash tier for mood shift (score 40)', () => {
    // +3 switch letter
    const r = getKeyCompatibilityScore('5A', '8B')
    expect(r.score).toBe(40)
    expect(r.tier).toBe('clash')
    expect(r.label).toBe('mood_shift')
  })

  it('returns clash tier for reverse slide (score 30)', () => {
    // +4 switch letter
    const r = getKeyCompatibilityScore('5A', '9B')
    expect(r.score).toBe(30)
    expect(r.tier).toBe('clash')
    expect(r.label).toBe('reverse_slide')
  })

  it('returns clash tier for tritone (score 10)', () => {
    // +6 same letter
    const r = getKeyCompatibilityScore('1A', '7A')
    expect(r.score).toBe(10)
    expect(r.tier).toBe('clash')
    expect(r.label).toBe('tritone')
  })

  it('returns clash with score 0 for incompatible keys', () => {
    // +3 same letter = no recognized relationship
    const r = getKeyCompatibilityScore('1A', '4A')
    expect(r.score).toBe(0)
    expect(r.tier).toBe('clash')
    expect(r.label).toBe('incompatible')
  })

  it('returns clash for undefined/missing keys', () => {
    expect(getKeyCompatibilityScore(undefined, '8A').tier).toBe('clash')
    expect(getKeyCompatibilityScore('8A', undefined).score).toBe(0)
    expect(getKeyCompatibilityScore(undefined, undefined).label).toBe('unknown')
  })

  it('returns clash for unparseable keys', () => {
    expect(getKeyCompatibilityScore('XY', '8A').tier).toBe('clash')
    expect(getKeyCompatibilityScore('8A', '0A').score).toBe(0)
    expect(getKeyCompatibilityScore('13A', '8A').tier).toBe('clash')
  })

  it('is symmetric for undirected relationships', () => {
    // Same key is trivially symmetric
    expect(getKeyCompatibilityScore('5B', '5B').score).toBe(100)

    // Relative major/minor is symmetric
    expect(getKeyCompatibilityScore('5A', '5B').score).toBe(95)
    expect(getKeyCompatibilityScore('5B', '5A').score).toBe(95)
  })

  it('distinguishes directional energy transitions', () => {
    // 8A → 10A is energy boost +2
    const boost = getKeyCompatibilityScore('8A', '10A')
    expect(boost.label).toBe('energy_boost_2')

    // 10A → 8A is energy drop -2
    const drop = getKeyCompatibilityScore('10A', '8A')
    expect(drop.label).toBe('energy_drop_2')

    // Both have the same score magnitude
    expect(boost.score).toBeGreaterThan(drop.score)
  })
})

// ---------------------------------------------------------------------------
// BPM issue detection
// ---------------------------------------------------------------------------
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
