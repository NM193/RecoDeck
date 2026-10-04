// src/lib/thumbnails/queue.test.ts
import { describe, expect, it, vi } from 'vitest'
import { ThumbnailCache, ThumbnailQueue, type Thumb } from './queue'

// A load whose answers the test gives, one track at a time.
function controlledLoad() {
  const pending = new Map<number, (thumb: Thumb) => void>()
  const failing = new Map<number, (error: Error) => void>()
  const load = vi.fn(
    (id: number) =>
      new Promise<Thumb>((resolve, reject) => {
        pending.set(id, resolve)
        failing.set(id, reject)
      }),
  )
  const answer = async (id: number, thumb: Thumb) => {
    pending.get(id)!(thumb)
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  const fail = async (id: number) => {
    failing.get(id)!(new Error('no_artwork'))
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  return { load, answer, fail, started: () => load.mock.calls.map(([id]) => id) }
}

describe('the thumbnail cache', () => {
  it('keeps the most recent, frees the URL of the one that goes', () => {
    const release = vi.fn()
    const cache = new ThumbnailCache(2, release)
    cache.set(1, 'blob:1')
    cache.set(2, 'blob:2')
    cache.get(1) // 1 is now more recent than 2
    cache.set(3, 'blob:3')
    expect(cache.get(2)).toBeUndefined()
    expect(cache.get(1)).toBe('blob:1')
    expect(release).toHaveBeenCalledWith('blob:2')
    expect(cache.size).toBe(2)
  })

  it('keeps "no artwork", which has no URL to free', () => {
    const release = vi.fn()
    const cache = new ThumbnailCache(1, release)
    cache.set(1, null)
    expect(cache.get(1)).toBeNull()
    cache.set(2, 'blob:2')
    expect(release).not.toHaveBeenCalled()
  })
})

describe('the thumbnail queue', () => {
  it('reads at most four at a time', async () => {
    const { load, answer, started } = controlledLoad()
    const queue = new ThumbnailQueue(new ThumbnailCache(100, vi.fn()), load, 4)
    for (let id = 1; id <= 6; id++) queue.request(id, vi.fn())
    expect(started()).toEqual([1, 2, 3, 4])
    await answer(2, 'blob:2')
    expect(started()).toEqual([1, 2, 3, 4, 5])
  })

  it('gives each asker the thumbnail, and keeps it', async () => {
    const { load, answer } = controlledLoad()
    const queue = new ThumbnailQueue(new ThumbnailCache(100, vi.fn()), load, 4)
    const first = vi.fn()
    const second = vi.fn()
    queue.request(7, first)
    queue.request(7, second)
    expect(load).toHaveBeenCalledTimes(1)
    await answer(7, 'blob:7')
    expect(first).toHaveBeenCalledWith('blob:7')
    expect(second).toHaveBeenCalledWith('blob:7')
    expect(queue.cached(7)).toBe('blob:7')
  })

  it('answers a known thumbnail at once, without reading it again', () => {
    const cache = new ThumbnailCache(100, vi.fn())
    cache.set(7, null)
    const { load } = controlledLoad()
    const queue = new ThumbnailQueue(cache, load, 4)
    const onReady = vi.fn()
    queue.request(7, onReady)
    expect(onReady).toHaveBeenCalledWith(null)
    expect(load).not.toHaveBeenCalled()
  })

  it('skips a row that left the view before its turn', async () => {
    const { load, answer, started } = controlledLoad()
    const queue = new ThumbnailQueue(new ThumbnailCache(100, vi.fn()), load, 1)
    queue.request(1, vi.fn())
    const cancel = queue.request(2, vi.fn())
    queue.request(3, vi.fn())
    cancel()
    await answer(1, 'blob:1')
    expect(started()).toEqual([1, 3])
  })

  it('still keeps a thumbnail whose row left during the read', async () => {
    const { load, answer } = controlledLoad()
    const queue = new ThumbnailQueue(new ThumbnailCache(100, vi.fn()), load, 4)
    const onReady = vi.fn()
    const cancel = queue.request(1, onReady)
    cancel()
    await answer(1, 'blob:1')
    expect(onReady).not.toHaveBeenCalled()
    expect(queue.cached(1)).toBe('blob:1')
  })

  it('forgets a thumbnail, freeing its URL, and reads it again when asked', async () => {
    const release = vi.fn()
    const { load, answer } = controlledLoad()
    const queue = new ThumbnailQueue(new ThumbnailCache(100, release), load, 4)
    queue.request(1, vi.fn())
    await answer(1, 'blob:1')
    queue.forget(1)
    expect(release).toHaveBeenCalledWith('blob:1')
    expect(queue.cached(1)).toBeUndefined()
    queue.request(1, vi.fn())
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('keeps a failed read as "no artwork"', async () => {
    const { load, fail } = controlledLoad()
    const queue = new ThumbnailQueue(new ThumbnailCache(100, vi.fn()), load, 4)
    const onReady = vi.fn()
    queue.request(1, onReady)
    await fail(1)
    expect(onReady).toHaveBeenCalledWith(null)
    expect(queue.cached(1)).toBeNull()
  })
})
