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

function render() {
  const onLater = vi.fn()
  const onReanalyze = vi.fn()
  act(() =>
    root.render(
      <ReanalyzePrompt
        status={status}
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
  it('says how many tracks and how long', () => {
    render()
    expect(host.textContent).toContain('Better BPM and key detection')
    expect(host.textContent).toContain('Re-analyze 1234 tracks now?')
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
