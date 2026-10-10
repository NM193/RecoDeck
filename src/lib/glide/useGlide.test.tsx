import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { GLIDE } from './glide'
import { GAP_GRACE_MS, useGlideTo, useHoverGlide } from './useGlide'
import { useTrackDragStore } from '../drag/trackDrag'
import type { DragPayload } from '../drag/dropTargets'

// React's act() in a plain DOM, without a testing library.
;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

// jsdom has no layout: row i sits 40px under row i - 1.
function layOut(host: HTMLElement) {
  const track = host.querySelector<HTMLElement>('.track')!
  track.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 300, height: 200 }) as DOMRect
  host.querySelectorAll<HTMLElement>('.item').forEach((item, i) => {
    item.getBoundingClientRect = () =>
      ({ left: 0, top: i * 40, width: 300, height: 40 }) as DOMRect
  })
}

function HoverList({ shown = true }: { shown?: boolean }) {
  const track = useRef<HTMLDivElement>(null)
  const highlight = useRef<HTMLSpanElement>(null)
  useHoverGlide(track, highlight, '.item', GLIDE.row)
  if (!shown) return null
  return (
    <div className="track" ref={track}>
      <span className="glide" ref={highlight} />
      <div className="item">one</div>
      <div className="gap" />
      <div className="item">
        <b>two</b>
      </div>
    </div>
  )
}

function OpenList({ open }: { open: number }) {
  const track = useRef<HTMLDivElement>(null)
  const highlight = useRef<HTMLSpanElement>(null)
  useGlideTo(track, highlight, '.item--open', GLIDE.row)
  return (
    <div className="track" ref={track}>
      <span className="glide" ref={highlight} />
      {[0, 1, 2].map((i) => (
        <div key={i} className={`item${i === open ? ' item--open' : ''}`} />
      ))}
    </div>
  )
}

const over = (target: Element) =>
  act(() => {
    target.dispatchEvent(
      new MouseEvent('pointerover', { bubbles: true, clientX: 5, clientY: 5 }),
    )
  })
const leave = (track: Element) =>
  act(() => {
    track.dispatchEvent(new MouseEvent('pointerleave'))
  })

let host: HTMLDivElement
let root: Root
const glideOf = () => host.querySelector<HTMLElement>('.glide')!
beforeEach(() => {
  vi.useFakeTimers()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  useTrackDragStore.setState({ payload: null })
  vi.useRealTimers()
})

describe('useHoverGlide', () => {
  it('follows the pointer from item to item, a child counting as its item', () => {
    act(() => root.render(<HoverList />))
    layOut(host)
    const [one, two] = host.querySelectorAll('.item')
    over(one)
    expect(glideOf().style.opacity).toBe('1')
    expect(glideOf().style.transform).toBe('translate3d(0px, 0px, 0)')
    over(two.querySelector('b')!)
    expect(glideOf().style.transform).toBe('translate3d(0px, 40px, 0)')
  })

  it('waits 80ms in a gap before fading, and a new item cancels the fade', () => {
    act(() => root.render(<HoverList />))
    layOut(host)
    const [one, two] = host.querySelectorAll('.item')
    over(one)
    over(host.querySelector('.gap')!)
    act(() => vi.advanceTimersByTime(GAP_GRACE_MS - 1))
    expect(glideOf().style.opacity).toBe('1')
    over(two)
    act(() => vi.advanceTimersByTime(GAP_GRACE_MS))
    expect(glideOf().style.opacity).toBe('1')
    leave(host.querySelector('.track')!)
    act(() => vi.advanceTimersByTime(GAP_GRACE_MS))
    expect(glideOf().style.opacity).toBe('0')
  })

  it('hides while tracks are dragged', () => {
    act(() => root.render(<HoverList />))
    layOut(host)
    const [one, two] = host.querySelectorAll('.item')
    over(one)
    act(() => useTrackDragStore.setState({ payload: {} as DragPayload }))
    expect(glideOf().style.opacity).toBe('0')
    over(two)
    expect(glideOf().style.opacity).toBe('0')
  })

  it('attaches to a track that mounts after the first render', () => {
    act(() => root.render(<HoverList shown={false} />))
    act(() => root.render(<HoverList />))
    layOut(host)
    over(host.querySelectorAll('.item')[1])
    expect(glideOf().style.transform).toBe('translate3d(0px, 40px, 0)')
  })
})

describe('useHoverGlide, after a render', () => {
  it('follows its item when the list moved it under a still pointer', () => {
    act(() => root.render(<HoverList />))
    layOut(host)
    const [one] = host.querySelectorAll<HTMLElement>('.item')
    over(one)
    expect(glideOf().style.transform).toBe('translate3d(0px, 0px, 0)')
    one.getBoundingClientRect = () => ({ left: 0, top: 80, width: 300, height: 40 }) as DOMRect
    act(() => root.render(<HoverList />))
    expect(glideOf().style.transform).toBe('translate3d(0px, 80px, 0)')
  })
})

describe('useGlideTo', () => {
  it('sits on the open item and slides when another opens', () => {
    act(() => root.render(<OpenList open={0} />))
    layOut(host)
    act(() => root.render(<OpenList open={2} />))
    expect(glideOf().style.transform).toBe('translate3d(0px, 80px, 0)')
    expect(glideOf().style.transition).toContain('transform 240ms')
  })

  it('fades out when nothing is open', () => {
    act(() => root.render(<OpenList open={1} />))
    layOut(host)
    act(() => root.render(<OpenList open={0} />))
    act(() => root.render(<OpenList open={-1} />))
    expect(glideOf().style.opacity).toBe('0')
  })
})
