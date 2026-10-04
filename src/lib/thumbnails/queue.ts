// src/lib/thumbnails/queue.ts
// Artwork thumbnails' cache and queue (track table spec, Rows): the last
// 1,000 are kept — "no artwork" too, so a missing cover is not asked for
// again — and at most 4 are read at a time; a request cancelled before its
// turn (a row scrolled out of view) is dropped. Pure: reading a thumbnail and
// freeing its URL are given.

/** A thumbnail's object URL, or null for a track without artwork. */
export type Thumb = string | null

type Listener = (thumb: Thumb) => void

export class ThumbnailCache {
  // A Map keeps insertion order: the first entry is the least recently used.
  private readonly entries = new Map<number, Thumb>()

  constructor(
    private readonly limit: number,
    private readonly release: (url: string) => void,
  ) {}

  /** The thumbnail, or undefined when not known yet; a hit becomes the most recent. */
  get(id: number): Thumb | undefined {
    if (!this.entries.has(id)) return undefined
    const thumb = this.entries.get(id)!
    this.entries.delete(id)
    this.entries.set(id, thumb)
    return thumb
  }

  /** Keeps a thumbnail; past the limit, the least recently used goes and its URL is freed. */
  set(id: number, thumb: Thumb): void {
    const old = this.entries.get(id)
    if (old && old !== thumb) this.release(old)
    this.entries.delete(id)
    this.entries.set(id, thumb)
    while (this.entries.size > this.limit) {
      const [oldestId, oldest] = this.entries.entries().next().value!
      this.entries.delete(oldestId)
      if (oldest) this.release(oldest)
    }
  }

  /** Forgets a thumbnail, and frees its URL. */
  delete(id: number): void {
    const thumb = this.entries.get(id)
    this.entries.delete(id)
    if (thumb) this.release(thumb)
  }

  get size(): number {
    return this.entries.size
  }
}

export class ThumbnailQueue {
  private readonly waiting: number[] = []
  private readonly listeners = new Map<number, Set<Listener>>()
  private readonly loading = new Set<number>()

  constructor(
    private readonly cache: ThumbnailCache,
    private readonly load: (id: number) => Promise<Thumb>,
    private readonly concurrency: number,
  ) {}

  /** The thumbnail if it is known, without asking for it. */
  cached(id: number): Thumb | undefined {
    return this.cache.get(id)
  }

  /**
   * Forgets a track's thumbnail, so the next row asks again: its file moved,
   * and a folder's cover.jpg may now be another one.
   */
  forget(id: number): void {
    this.cache.delete(id)
  }

  /**
   * Asks for a track's thumbnail; `onReady` gets it once it is read (at once
   * when it is known). The answer cancels: a request not started yet is
   * dropped; one being read still fills the cache.
   */
  request(id: number, onReady: Listener): () => void {
    const known = this.cache.get(id)
    if (known !== undefined) {
      onReady(known)
      return () => {}
    }
    let listeners = this.listeners.get(id)
    if (!listeners) {
      listeners = new Set()
      this.listeners.set(id, listeners)
      if (!this.loading.has(id)) this.waiting.push(id)
    }
    listeners.add(onReady)
    this.pump()

    return () => {
      const current = this.listeners.get(id)
      if (!current?.delete(onReady) || current.size > 0) return
      this.listeners.delete(id)
      const index = this.waiting.indexOf(id)
      if (index !== -1) this.waiting.splice(index, 1)
    }
  }

  private pump(): void {
    while (this.loading.size < this.concurrency && this.waiting.length > 0) {
      const id = this.waiting.shift()!
      this.loading.add(id)
      this.load(id)
        .catch((): Thumb => null)
        .then((thumb) => {
          this.loading.delete(id)
          this.cache.set(id, thumb)
          const listeners = this.listeners.get(id)
          this.listeners.delete(id)
          listeners?.forEach((listener) => listener(thumb))
          this.pump()
        })
    }
  }
}
