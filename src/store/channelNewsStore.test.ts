import { beforeEach, describe, expect, it } from 'vitest'
import { channelNewsCount, useChannelNews } from './channelNewsStore'
import type { ChannelNews, ChannelUpload } from '../types/youtube'

const upload = (video_id: string, published_at = '2026-10-01T00:00:00Z'): ChannelUpload => ({ video_id, title: video_id, published_at, already_stored: false })
const news = (channel_id: string, source: 'channel' | 'dj', ids: string[]): ChannelNews => ({
  channel_id,
  title: channel_id,
  source,
  auto_import: false,
  new_sets: ids.map(upload),
})

beforeEach(() => useChannelNews.setState({ byChannel: {}, newest: {}, busy: null }))

describe('the channels’ news', () => {
  it('keeps a channel’s news, not a DJ’s, and counts it', () => {
    useChannelNews.getState().add([news('UC1', 'channel', ['a', 'b']), news('dj:traumer', 'dj', ['c'])])
    expect(Object.keys(useChannelNews.getState().byChannel)).toEqual(['UC1'])
    expect(channelNewsCount(useChannelNews.getState().byChannel)).toBe(2)
  })

  it('adds a later check’s uploads first, each video once', () => {
    useChannelNews.getState().add([news('UC1', 'channel', ['a', 'b'])])
    useChannelNews.getState().add([news('UC1', 'channel', ['c', 'a'])])
    expect(useChannelNews.getState().byChannel.UC1.map((u) => u.video_id)).toEqual(['c', 'a', 'b'])
  })

  it('lets go of an upload once opened, and of a channel’s news once dismissed', () => {
    useChannelNews.getState().add([news('UC1', 'channel', ['a', 'b']), news('UC2', 'channel', ['c'])])
    useChannelNews.getState().take('UC1', 'a')
    expect(useChannelNews.getState().byChannel.UC1.map((u) => u.video_id)).toEqual(['b'])
    useChannelNews.getState().take('UC1', 'b')
    expect(useChannelNews.getState().byChannel.UC1).toBeUndefined()
    useChannelNews.getState().dismiss('UC2')
    expect(channelNewsCount(useChannelNews.getState().byChannel)).toBe(0)
  })

  it('counts only the channels still followed', () => {
    useChannelNews.getState().add([news('UC1', 'channel', ['a', 'b']), news('UC2', 'channel', ['c'])])
    expect(channelNewsCount(useChannelNews.getState().byChannel, new Set(['UC2']))).toBe(1)
  })

  it('remembers the newest upload, so Dismiss never marks an older one seen', () => {
    const late = { ...news('UC1', 'channel', []), new_sets: [upload('old', '2026-09-01T00:00:00Z'), upload('new', '2026-10-05T00:00:00Z')] }
    useChannelNews.getState().add([late])
    useChannelNews.getState().take('UC1', 'new')
    expect(useChannelNews.getState().newest.UC1.video_id).toBe('new')
    useChannelNews.getState().dismiss('UC1')
    expect(useChannelNews.getState().newest.UC1).toBeUndefined()
  })
})
