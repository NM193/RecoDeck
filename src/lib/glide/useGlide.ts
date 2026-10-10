// src/lib/glide/useGlide.ts
// The two ways a list drives its glide (Micro-interactions spec, Hooks):
// useHoverGlide follows the pointer, useGlideTo follows the item a selector
// picks (the open page, a menu's active item). Both take the track's ref and
// the highlight's ref, and attach after each render once both exist, so a
// track that mounts later (a list shown once it has rows) still gets one.
import { useLayoutEffect, useRef, type RefObject } from 'react'
import { useTrackDragStore } from '../drag/trackDrag'
import { createGlide, type Glide, type GlideOptions } from './glide'

/** On no item (a gap between cards, or off the track), it waits this long before fading. */
export const GAP_GRACE_MS = 80

interface Attached {
  track: HTMLElement
  el: HTMLElement
  key: string
  glide: Glide
  detach: () => void
}

/**
 * Keeps one glide on the current track and highlight: made when both exist,
 * made again when either element or `key` changes, dropped on unmount.
 */
function useAttached(
  trackRef: RefObject<HTMLElement | null>,
  highlightRef: RefObject<HTMLElement | null>,
  key: string,
  options: GlideOptions,
  attach: (track: HTMLElement, glide: Glide) => () => void,
): RefObject<Attached | null> {
  const attached = useRef<Attached | null>(null)

  useLayoutEffect(() => {
    const track = trackRef.current
    const el = highlightRef.current
    const now = attached.current
    if (now && now.track === track && now.el === el && now.key === key) {
      // A render may have moved its item under a still pointer (a re-sort).
      now.glide.refresh()
      return
    }
    now?.detach()
    attached.current = null
    if (!track || !el) return
    const glide = createGlide(track, el, options)
    attached.current = { track, el, key, glide, detach: attach(track, glide) }
  })

  useLayoutEffect(
    () => () => {
      attached.current?.detach()
      attached.current = null
    },
    [],
  )

  return attached
}

/** The highlight follows the pointer over the items that match `itemSelector`. */
export function useHoverGlide(
  trackRef: RefObject<HTMLElement | null>,
  highlightRef: RefObject<HTMLElement | null>,
  itemSelector: string,
  options: GlideOptions,
): void {
  useAttached(
    trackRef,
    highlightRef,
    `${itemSelector}\n${options.enterFrom}`,
    options,
    (track, glide) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      let pointer: { x: number; y: number } | null = null
      let frame = 0

      const itemAt = (target: EventTarget | null): Element | null => {
        if (!(target instanceof Element)) return null
        const item = target.closest(itemSelector)
        return item && track.contains(item) ? item : null
      }
      // While tracks are dragged it stays hidden; drop targets light themselves.
      const go = (item: Element | null) => {
        clearTimeout(timer)
        if (useTrackDragStore.getState().payload !== null) glide.moveTo(null)
        else if (item) glide.moveTo(item)
        else if (glide.item)
          timer = setTimeout(() => glide.moveTo(null), GAP_GRACE_MS)
      }

      const onOver = (e: PointerEvent) => {
        pointer = { x: e.clientX, y: e.clientY }
        go(itemAt(e.target))
      }
      const onMove = (e: PointerEvent) => {
        pointer = { x: e.clientX, y: e.clientY }
      }
      const onLeave = () => {
        pointer = null
        go(null)
      }
      // A list scrolling, or rows coming and going, under a still pointer: the
      // item under it now. (Most tracks are not the scroller, and scroll does
      // not bubble: hence the capture on document.)
      const recheck = () => {
        if (pointer === null || frame !== 0) return
        frame = requestAnimationFrame(() => {
          frame = 0
          if (pointer)
            go(
              itemAt(document.elementFromPoint?.(pointer.x, pointer.y) ?? null),
            )
        })
      }
      // (jsdom has no ResizeObserver; the app always does.)
      const observer =
        typeof ResizeObserver === 'function'
          ? new ResizeObserver(() => {
              glide.refresh()
              recheck()
            })
          : null
      observer?.observe(track)
      const unsubscribe = useTrackDragStore.subscribe((state) => {
        if (state.payload !== null) go(null)
      })

      track.addEventListener('pointerover', onOver)
      track.addEventListener('pointermove', onMove)
      track.addEventListener('pointerleave', onLeave)
      document.addEventListener('scroll', recheck, {
        capture: true,
        passive: true,
      })
      return () => {
        track.removeEventListener('pointerover', onOver)
        track.removeEventListener('pointermove', onMove)
        track.removeEventListener('pointerleave', onLeave)
        document.removeEventListener('scroll', recheck, { capture: true })
        unsubscribe()
        observer?.disconnect()
        clearTimeout(timer)
        cancelAnimationFrame(frame)
      }
    },
  )
}

/**
 * The highlight follows the item that matches `selector` (the open page, a
 * menu's active item). It looks after every render of its component, and
 * again whenever the track changes size; no match fades it out.
 */
export function useGlideTo(
  trackRef: RefObject<HTMLElement | null>,
  highlightRef: RefObject<HTMLElement | null>,
  selector: string,
  options: GlideOptions,
): void {
  const attached = useAttached(
    trackRef,
    highlightRef,
    `${selector}\n${options.enterFrom}`,
    options,
    (track, glide) => {
      // (jsdom has no ResizeObserver; the app always does.)
      if (typeof ResizeObserver !== 'function') return () => {}
      const observer = new ResizeObserver(() => glide.refresh())
      observer.observe(track)
      return () => observer.disconnect()
    },
  )

  useLayoutEffect(() => {
    const now = attached.current
    if (now) now.glide.moveTo(now.track.querySelector(selector))
  })
}
