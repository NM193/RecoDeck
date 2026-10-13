import { describe, expect, it } from 'vitest'
import { clampMasterBpm, masterRange, masterRate } from './masterBpm'

describe('masterRate', () => {
  it('is off when there is no master', () => {
    const r = masterRate(null, 124)
    expect(r.kind).toBe('off')
    expect(r.rate).toBe(1)
  })

  it('slows a faster track down to the master', () => {
    const r = masterRate(122, 124)
    expect(r.kind).toBe('matched')
    expect(r.rate).toBeCloseTo(122 / 124, 6)
    expect(r.percent).toBe(-1.6)
    expect(r.heardBpm).toBe(122)
  })

  it('speeds a slower track up', () => {
    const r = masterRate(126, 120)
    expect(r.rate).toBeCloseTo(1.05, 6)
    expect(r.percent).toBe(5)
  })

  it('plays a track without BPM as it is', () => {
    expect(masterRate(122, null).kind).toBe('no-bpm')
    expect(masterRate(122, undefined).rate).toBe(1)
    expect(masterRate(122, 0).kind).toBe('no-bpm')
  })

  it('stretches a far track only as far as the limit, never back to normal', () => {
    const r = masterRate(122, 100)
    expect(r.kind).toBe('limited')
    expect(r.rate).toBeCloseTo(1.08, 6)
    expect(r.heardBpm).toBe(108)
    expect(r.percent).toBe(8)
    const down = masterRate(100, 125)
    expect(down.rate).toBeCloseTo(0.92, 6)
    expect(down.heardBpm).toBe(115)
  })

  it('treats double and half time as the same tempo', () => {
    expect(masterRate(128, 64).rate).toBeCloseTo(1, 6)
    expect(masterRate(128, 136).kind).toBe('matched')
    const doubled = masterRate(128, 66)
    expect(doubled.kind).toBe('matched')
    expect(doubled.reading).toBe(132)
    expect(doubled.rate).toBeCloseTo(128 / 132, 6)
    const halved = masterRate(122, 244)
    expect(halved.rate).toBeCloseTo(1, 6)
  })
})

describe('masterRange', () => {
  it('is the track BPM plus or minus 8%, in whole BPM', () => {
    expect(masterRange(125)).toEqual({ min: 115, max: 135 })
    expect(masterRange(122)).toEqual({ min: 113, max: 131 })
  })

  it('is the full range without a track BPM', () => {
    expect(masterRange(null)).toEqual({ min: 60, max: 200 })
  })
})

describe('clampMasterBpm', () => {
  it('keeps the value in range, to one decimal', () => {
    expect(clampMasterBpm(10)).toBe(60)
    expect(clampMasterBpm(999)).toBe(200)
    expect(clampMasterBpm(122.46)).toBe(122.5)
    expect(clampMasterBpm(NaN)).toBe(122)
  })
})
