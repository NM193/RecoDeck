import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SKELETON_DELAY_MS, useShowAfter } from './useShowAfter'

// React's act() in a plain DOM, without a testing library.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function Probe({ ms }: { ms?: number }) {
  return <span>{useShowAfter(ms) ? 'shown' : 'waiting'}</span>
}

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.useFakeTimers()
  host = document.createElement('div')
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  vi.useRealTimers()
})

describe('a skeleton waits before it shows', () => {
  it('shows nothing for 150ms, then shows', () => {
    act(() => root.render(<Probe />))
    expect(host.textContent).toBe('waiting')
    act(() => vi.advanceTimersByTime(SKELETON_DELAY_MS - 1))
    expect(host.textContent).toBe('waiting')
    act(() => vi.advanceTimersByTime(1))
    expect(host.textContent).toBe('shown')
  })

  it('never shows when the read ends first (it unmounts)', () => {
    act(() => root.render(<Probe />))
    act(() => vi.advanceTimersByTime(100))
    act(() => root.render(<span>rows</span>))
    act(() => vi.advanceTimersByTime(500))
    expect(host.textContent).toBe('rows')
  })

  it('shows at once when asked to wait 0', () => {
    act(() => root.render(<Probe ms={0} />))
    expect(host.textContent).toBe('shown')
  })
})
