import { describe, expect, it } from 'vitest'
import { channelCheckMessage, checkedLabel, djCheckMessage, newSetCount } from './following'
import type { ChannelNews } from '../../types/youtube'

const news = (title: string, n: number): ChannelNews => ({
  channel_id: title,
  title,
  source: 'channel',
  auto_import: false,
  new_sets: Array.from({ length: n }, (_, i) => ({ video_id: `${title}${i}`, title: '', published_at: '', already_stored: false })),
})

describe('checkedLabel', () => {
  const now = new Date(2026, 9, 8, 20, 0)

  it('says when it was last checked, in local days', () => {
    expect(checkedLabel(new Date(2026, 9, 8, 9, 5).toISOString(), now)).toBe('checked 09:05')
    expect(checkedLabel(new Date(2026, 9, 7, 23, 0).toISOString(), now)).toBe('checked yesterday')
    expect(checkedLabel(new Date(2026, 9, 2, 12, 0).toISOString(), now)).toBe('checked Oct 2')
  })

  it('says never for nothing, or something it cannot read', () => {
    expect(checkedLabel(undefined, now)).toBe('never checked')
    expect(checkedLabel('whenever', now)).toBe('never checked')
  })
})

describe('what a check found', () => {
  it('counts the new uploads', () => {
    expect(newSetCount([news('a', 2), news('b', 0), news('c', 1)])).toBe(3)
  })

  it('points a DJ search to the library', () => {
    expect(djCheckMessage([news('Traumer', 2)], 'Traumer')).toBe('2 new sets from Traumer — see Library')
    expect(djCheckMessage([], 'Traumer')).toBe('Nothing new from Traumer')
    expect(djCheckMessage([news('a', 1), news('b', 3)], null)).toBe('4 new sets from 2 DJs — see Library')
    expect(djCheckMessage([], null)).toBe('Nothing new from your DJs')
  })

  it('says what a channel check found', () => {
    expect(channelCheckMessage([news('Cercle', 1)], 'Cercle')).toBe('1 new set on Cercle')
    expect(channelCheckMessage([], 'Cercle')).toBe('Nothing new on Cercle')
    expect(channelCheckMessage([news('a', 2), news('b', 1)], null)).toBe('3 new sets on 2 channels')
    expect(channelCheckMessage([], null)).toBe('Nothing new on your channels')
  })
})
