import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { TooltipLayer } from './TooltipLayer'
import { useTrackDragStore } from '../lib/drag/trackDrag'
import type { DragPayload } from '../lib/drag/dropTargets'
import { TIP_DELAY_MS, TIP_LEAVE_MS, TIP_WARM_MS } from '../lib/tooltip/tooltip'

// React's act() in a plain DOM, without a testing library.
;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root
let page: HTMLDivElement
const tip = () => document.querySelector<HTMLElement>('.tip[role="tooltip"]')!
const shown = () => tip().classList.contains('tip--shown')
const over = (el: Element) =>
  act(() => {
    el.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }))
  })
const out = (el: Element, to: Element | null = page) =>
  act(() => {
    el.dispatchEvent(
      new MouseEvent('pointerout', { bubbles: true, relatedTarget: to }),
    )
  })
const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms))

beforeEach(() => {
  vi.useFakeTimers()
  page = document.createElement('div')
  page.innerHTML = `
    <button id="next" data-tip="Next" data-tip-keys="next"><b>›</b></button>
    <button id="prev" data-tip="Previous"></button>
    <div data-tip-off><button id="off" data-tip="Hidden"></button></div>
    <button id="plain"></button>
    <span id="name" data-tip="A long set name" data-tip-overflow>A long set name</span>`
  document.body.append(page)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root.render(<TooltipLayer />))
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  page.remove()
  useTrackDragStore.setState({ payload: null })
  vi.useRealTimers()
})

const el = (id: string) => document.getElementById(id)!

describe('TooltipLayer', () => {
  it('shows after 200ms, with the text and the shortcut chips', () => {
    over(el('next').querySelector('b')!)
    wait(TIP_DELAY_MS - 1)
    expect(shown()).toBe(false)
    wait(1)
    expect(shown()).toBe(true)
    expect(tip().textContent).toMatch(/^Next/)
    expect(
      [...tip().querySelectorAll('kbd')].map((k) => k.textContent),
    ).toContain('→')
  })

  it('stays while the pointer moves inside its element, hides 80ms after it leaves', () => {
    over(el('next'))
    wait(TIP_DELAY_MS)
    out(el('next'), el('next').querySelector('b'))
    wait(TIP_LEAVE_MS)
    expect(shown()).toBe(true)
    out(el('next'))
    wait(TIP_LEAVE_MS)
    expect(shown()).toBe(false)
  })

  it('glides to a neighbour while shown', () => {
    over(el('next'))
    wait(TIP_DELAY_MS)
    out(el('next'), el('prev'))
    over(el('prev'))
    expect(shown()).toBe(true)
    expect(tip().classList.contains('tip--gliding')).toBe(true)
    wait(110)
    expect(tip().textContent).toBe('Previous')
  })

  it('shows at once while warm, then waits again', () => {
    over(el('next'))
    wait(TIP_DELAY_MS)
    out(el('next'))
    wait(TIP_LEAVE_MS)
    over(el('prev'))
    expect(shown()).toBe(true)
    expect(tip().classList.contains('tip--gliding')).toBe(false)
    out(el('prev'))
    wait(TIP_LEAVE_MS + TIP_WARM_MS)
    over(el('next'))
    expect(shown()).toBe(false)
  })

  it('a press hides it', () => {
    over(el('next'))
    wait(TIP_DELAY_MS)
    act(() => {
      el('next').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    })
    expect(shown()).toBe(false)
  })

  it('shows nothing inside data-tip-off, on an element without one, or while tracks are dragged', () => {
    over(el('off'))
    over(el('plain'))
    wait(TIP_DELAY_MS)
    expect(shown()).toBe(false)
    act(() => useTrackDragStore.setState({ payload: {} as DragPayload }))
    over(el('prev'))
    wait(TIP_DELAY_MS)
    expect(shown()).toBe(false)
  })

  it('a press hides it, and it stays hidden until the pointer leaves the element', () => {
    over(el('next'))
    wait(TIP_DELAY_MS)
    act(() => {
      el('next').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    })
    out(el('next').querySelector('b')!, el('next'))
    over(el('next'))
    wait(TIP_DELAY_MS)
    expect(shown()).toBe(false)
    out(el('next'))
    over(el('next'))
    wait(TIP_DELAY_MS)
    expect(shown()).toBe(true)
  })

  it('shows nothing for an element that left the page while it waited', () => {
    over(el('prev'))
    act(() => el('prev').remove())
    wait(TIP_DELAY_MS)
    expect(shown()).toBe(false)
  })

  it('with data-tip-overflow, shows only while the text is cut off', () => {
    over(el('name'))
    wait(TIP_DELAY_MS)
    expect(shown()).toBe(false)
    out(el('name'))
    Object.defineProperty(el('name'), 'scrollWidth', { value: 300 })
    Object.defineProperty(el('name'), 'clientWidth', { value: 120 })
    wait(TIP_LEAVE_MS + 500)
    over(el('name'))
    wait(TIP_DELAY_MS)
    expect(shown()).toBe(true)
  })
})
