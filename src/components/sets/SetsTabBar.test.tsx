import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SetsTabBar } from './SetsTabBar'
import type { SetsTab } from '../../store/setsViewStore'

// React's act() in a plain DOM, without a testing library.
;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

// jsdom has no ResizeObserver; the thumb only needs one to exist.
class NoResizeObserver {
  observe() {}
  disconnect() {}
}

let host: HTMLDivElement
let root: Root
let onTab: ReturnType<typeof vi.fn<(tab: SetsTab) => void>>
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', NoResizeObserver)
  onTab = vi.fn<(tab: SetsTab) => void>()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

function draw(
  tab: SetsTab,
  counts = { library: 1240, newFinds: 0, saved: 37, channelNews: 0 },
) {
  act(() => root.render(<SetsTabBar tab={tab} onTab={onTab} {...counts} />))
}

const tabs = () => [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')]

describe('SetsTabBar', () => {
  it('draws the four tabs with their counts, the shown one selected', () => {
    draw('saved')
    expect(tabs().map((t) => t.textContent)).toEqual([
      'Library1,240',
      'Saved tracks37',
      'Following',
      'Stats',
    ])
    expect(tabs().map((t) => t.getAttribute('aria-selected'))).toEqual([
      'false',
      'true',
      'false',
      'false',
    ])
    // Only the selected tab is in the Tab order.
    expect(tabs().map((t) => t.tabIndex)).toEqual([-1, 0, -1, -1])
    expect(tabs()[1].getAttribute('aria-controls')).toBe('sets-panel')
  })

  it('shows new finds next to the library count and the channels badge on Following', () => {
    draw('library', { library: 12, newFinds: 3, saved: 0, channelNews: 5 })
    expect(tabs()[0].querySelector('small')?.textContent).toBe('12 · 3 new')
    expect(tabs()[0].querySelector('.sets-home__new')?.textContent).toBe('3 new')
    expect(tabs()[2].querySelector('.sets-home__badge')?.textContent).toBe('5')
  })

  it('opens a tab on click', () => {
    draw('library')
    act(() => tabs()[3].click())
    expect(onTab).toHaveBeenCalledWith('stats')
  })

  it('moves with the arrows (wrapping), Home and End', () => {
    draw('library')
    const press = (key: string) =>
      act(() => {
        tabs()[0].dispatchEvent(
          new KeyboardEvent('keydown', { key, bubbles: true }),
        )
      })
    press('ArrowLeft')
    press('ArrowRight')
    press('End')
    press('Home')
    press('a')
    expect(onTab.mock.calls.map(([t]) => t)).toEqual([
      'stats',
      'saved',
      'stats',
      'library',
    ])
  })

  it('wraps from the last tab to the first and moves the focus there', () => {
    draw('stats')
    act(() => {
      tabs()[3].focus()
      tabs()[3].dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
      )
    })
    expect(onTab).toHaveBeenCalledWith('library')
    expect(document.activeElement?.id).toBe('sets-tab-library')
  })

  it('draws the thumb behind the tabs, hidden from screen readers', () => {
    draw('library')
    const thumb = host.querySelector<HTMLElement>('.tabs__thumb')
    expect(thumb).not.toBeNull()
    expect(thumb?.getAttribute('aria-hidden')).toBe('true')
  })
})
