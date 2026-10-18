import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { AnalysisProgress, type AnalysisProgressData } from './AnalysisProgress'

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const progress: AnalysisProgressData = {
  currentIndex: 3,
  totalTracks: 10,
  currentTrackName: 'Track',
  totalDurationMs: 0,
  totalSizeBytes: 0,
  startTime: Date.now() - 30_000,
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

describe('AnalysisProgress cancelling', () => {
  it('shows Cancelling… instead of the time left, and disables the button', () => {
    const onCancel = vi.fn()
    act(() =>
      root.render(
        <AnalysisProgress progress={progress} onCancel={onCancel} cancelling />,
      ),
    )
    expect(host.textContent).toContain('Cancelling…')
    expect(host.textContent).not.toContain('remaining')
    const button = host.querySelector('button') as HTMLButtonElement
    expect(button.disabled).toBe(true)
    act(() => button.click())
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('shows no Cancelling… otherwise, and the button cancels', () => {
    const onCancel = vi.fn()
    act(() =>
      root.render(<AnalysisProgress progress={progress} onCancel={onCancel} />),
    )
    expect(host.textContent).not.toContain('Cancelling…')
    const button = host.querySelector('button') as HTMLButtonElement
    expect(button.disabled).toBe(false)
    act(() => button.click())
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
