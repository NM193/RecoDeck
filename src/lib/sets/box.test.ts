import { describe, expect, it } from 'vitest'
import { boxOffer, matchingSets, setCardLine, videoIdOf } from './box'
import type { YtSetSummary } from '../../types/youtube'

const set = (video_id: string, title: string, channel?: string): YtSetSummary => ({ video_id, url: video_id, title, channel })

describe('videoIdOf', () => {
  it('reads the id from every kind of YouTube link, or a bare id', () => {
    expect(videoIdOf('https://www.youtube.com/watch?v=AvoifrdCfFM&t=42s')).toBe('AvoifrdCfFM')
    expect(videoIdOf('https://youtu.be/AvoifrdCfFM')).toBe('AvoifrdCfFM')
    expect(videoIdOf('https://www.youtube.com/live/AvoifrdCfFM?si=x')).toBe('AvoifrdCfFM')
    expect(videoIdOf('youtube.com/shorts/AvoifrdCfFM')).toBe('AvoifrdCfFM')
    expect(videoIdOf('  AvoifrdCfFM ')).toBe('AvoifrdCfFM')
    expect(videoIdOf('Hot Since 82')).toBeNull()
  })
})

describe('boxOffer', () => {
  const stored = new Set(['AvoifrdCfFM'])

  it('offers to open a link, free when the set is in the library', () => {
    expect(boxOffer('https://youtu.be/AvoifrdCfFM', stored)).toEqual({ kind: 'link', videoId: 'AvoifrdCfFM', stored: true })
    expect(boxOffer('https://youtu.be/BBBBBBBBBBB', stored)).toEqual({ kind: 'link', videoId: 'BBBBBBBBBBB', stored: false })
  })

  it('searches for text of two characters or more, and offers nothing for less', () => {
    expect(boxOffer(' Traumer ', stored)).toEqual({ kind: 'text', query: 'Traumer' })
    expect(boxOffer('t', stored)).toEqual({ kind: 'empty' })
    expect(boxOffer('   ', stored)).toEqual({ kind: 'empty' })
  })
})

describe('matchingSets', () => {
  const sets = [
    set('a', 'Mochakk | HÖR Berlin', 'HÖR BERLIN'),
    set('b', 'Traumer @ Cercle Odyssey, Paris', 'Cercle'),
    set('c', 'Live from the terrace', 'Traumer'),
    set('d', 'Solomun Boiler Room Tulum', 'Boiler Room'),
  ]

  it('finds the text in the title, the channel or the DJ, without case or accents', () => {
    expect(matchingSets(sets, 'traumer').map((s) => s.video_id)).toEqual(['b', 'c'])
    expect(matchingSets(sets, 'hor').map((s) => s.video_id)).toEqual(['a'])
    expect(matchingSets(sets, 'boiler').map((s) => s.video_id)).toEqual(['d'])
    expect(matchingSets(sets, 'nobody')).toEqual([])
  })

  it('lists at most five', () => {
    const many = Array.from({ length: 8 }, (_, i) => set(`m${i}`, `Traumer live ${i}`))
    expect(matchingSets(many, 'traumer')).toHaveLength(5)
  })
})

describe('setCardLine', () => {
  it('reads the channel and the tracks, or that there is no tracklist yet', () => {
    expect(setCardLine({ channel: 'Cercle', track_count: 41 })).toBe('Cercle · 41 tracks')
    expect(setCardLine({ channel: 'UNDRSTND', track_count: 0 })).toBe('UNDRSTND · no tracklist yet')
    expect(setCardLine({ track_count: 1 })).toBe('1 track')
  })
})
