import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { AnalysisStatus } from '../types/track'
import { ReanalyzePrompt } from './ReanalyzePrompt'

// React's act() in a plain DOM, without a testing library.
;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const status: AnalysisStatus = {
  version: 1,
  needing: 1234,
  with_old_values: 1200,
  estimate_minutes: 15,
}

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

function render(over: Partial<AnalysisStatus> = {}) {
  const onLater = vi.fn()
  const onReanalyze = vi.fn()
  act(() =>
    root.render(
      <ReanalyzePrompt
        status={{ ...status, ...over }}
        onLater={onLater}
        onReanalyze={onReanalyze}
      />,
    ),
  )
  return { onLater, onReanalyze }
}

function button(label: string) {
  const found = [...host.querySelectorAll('button')].find(
    (b) => b.textContent === label,
  )
  if (!found) throw new Error(`no ${label} button`)
  return found
}

describe('ReanalyzePrompt', () => {
  it('takes focus on the dialog, not a button', () => {
    render()
    const dialog = host.querySelector('[role="dialog"]')
    expect(document.activeElement).toBe(dialog)
  })

  it('a click on the backdrop answers nothing', () => {
    const { onLater, onReanalyze } = render()
    const overlay = host.querySelector('.modal-overlay') as HTMLElement
    act(() => overlay.click())
    expect(onLater).not.toHaveBeenCalled()
    expect(onReanalyze).not.toHaveBeenCalled()
  })

  it('Esc is Later, once', () => {
    const { onLater, onReanalyze } = render()
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      )
    })
    expect(onLater).toHaveBeenCalledTimes(1)
    expect(onReanalyze).not.toHaveBeenCalled()
  })

  it('counts in words and with separators', () => {
    render({ needing: 1 })
    expect(host.textContent).toContain('Re-analyze 1 track now?')
    act(() => root.unmount())
    root = createRoot(host)
    render({ needing: 8000 })
    expect(host.textContent).toContain('Re-analyze 8,000 tracks now?')
  })

  it('says how many tracks and how long', () => {
    render()
    expect(host.textContent).toContain('Better BPM and key detection')
    expect(host.textContent).toContain('Re-analyze 1,234 tracks now?')
    expect(host.textContent).toContain('about 15 min')
  })

  it('Re-analyze and Later each answer once', () => {
    const { onLater, onReanalyze } = render()
    act(() => button('Re-analyze').click())
    expect(onReanalyze).toHaveBeenCalledTimes(1)
    act(() => button('Later').click())
    expect(onLater).toHaveBeenCalledTimes(1)
  })
})
