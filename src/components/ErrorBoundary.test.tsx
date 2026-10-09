import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ErrorBoundary } from './ErrorBoundary'

// React's act() in a plain DOM, without a testing library.
;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

let broken = true
function Fragile() {
  if (broken) throw new TypeError('layout.map is not a function')
  return <span>content</span>
}

function button(label: string): HTMLButtonElement {
  const found = [...host.querySelectorAll('button')].find(
    (b) => b.textContent === label,
  )
  if (!found) throw new Error(`no button "${label}" in: ${host.textContent}`)
  return found
}

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  broken = true
  // React reports every error a boundary catches; the tests expect them.
  vi.spyOn(console, 'error').mockImplementation(() => {})
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.restoreAllMocks()
  // A test's clipboard stays on navigator otherwise.
  Reflect.deleteProperty(navigator, 'clipboard')
})

function setClipboard(
  clipboard: { writeText: (text: string) => Promise<void> } | undefined,
) {
  Object.defineProperty(navigator, 'clipboard', {
    value: clipboard,
    configurable: true,
  })
}

describe('an error while drawing shows a notice instead of a blank window', () => {
  it('draws its children when nothing throws', () => {
    broken = false
    act(() =>
      root.render(
        <ErrorBoundary level="page">
          <Fragile />
        </ErrorBoundary>,
      ),
    )
    expect(host.textContent).toBe('content')
  })

  it('a page says it ran into a problem, and what the error was', () => {
    act(() =>
      root.render(
        <ErrorBoundary level="page">
          <Fragile />
        </ErrorBoundary>,
      ),
    )
    expect(host.querySelector('[role="alert"]')).not.toBeNull()
    expect(host.textContent).toContain('This page ran into a problem')
    expect(host.textContent).toContain('layout.map is not a function')
  })

  it('Try again draws the page again, and it shows once the cause is gone', () => {
    act(() =>
      root.render(
        <ErrorBoundary level="page">
          <Fragile />
        </ErrorBoundary>,
      ),
    )
    broken = false
    act(() => button('Try again').click())
    expect(host.textContent).toBe('content')
  })

  it('a Home card says it could not load, with Try again', () => {
    act(() =>
      root.render(
        <ErrorBoundary level="card">
          <Fragile />
        </ErrorBoundary>,
      ),
    )
    expect(host.textContent).toContain("This card couldn't load")
    expect(button('Try again')).toBeTruthy()
  })

  it('the whole app offers Reload instead of Try again', () => {
    act(() =>
      root.render(
        <ErrorBoundary level="app">
          <Fragile />
        </ErrorBoundary>,
      ),
    )
    expect(host.textContent).toContain('RecoDeck ran into a problem')
    expect(button('Reload')).toBeTruthy()
    expect(host.textContent).not.toContain('Try again')
  })

  it("shows WebKit's message without the source it quotes, and copies all of it", async () => {
    const webkit =
      "drawn.map is not a function. (In 'drawn.map((track, index) => { return null })', 'drawn.map' is undefined)"
    function WebKitError(): never {
      throw new TypeError(webkit)
    }
    const writeText = vi.fn().mockResolvedValue(undefined)
    setClipboard({ writeText })
    act(() =>
      root.render(
        <ErrorBoundary level="page">
          <WebKitError />
        </ErrorBoundary>,
      ),
    )
    expect(host.querySelector('.error-notice__message')?.textContent).toBe(
      'drawn.map is not a function.',
    )
    await act(async () => button('Copy error').click())
    expect(writeText.mock.calls[0][0]).toContain(webkit)
  })

  it('Copy error puts the error and its stack on the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    setClipboard({ writeText })
    act(() =>
      root.render(
        <ErrorBoundary level="page">
          <Fragile />
        </ErrorBoundary>,
      ),
    )
    await act(async () => button('Copy error').click())
    expect(writeText).toHaveBeenCalledOnce()
    const copied = writeText.mock.calls[0][0] as string
    expect(copied).toContain('TypeError: layout.map is not a function')
    expect(copied).toContain('Fragile')
    expect(button('Copied')).toBeTruthy()
  })

  it('Copy error says so when the copy fails', async () => {
    setClipboard({ writeText: () => Promise.reject(new Error('denied')) })
    act(() =>
      root.render(
        <ErrorBoundary level="page">
          <Fragile />
        </ErrorBoundary>,
      ),
    )
    await act(async () => button('Copy error').click())
    expect(button("Couldn't copy")).toBeTruthy()
  })

  it('Copy error says so when there is no clipboard', async () => {
    setClipboard(undefined)
    act(() =>
      root.render(
        <ErrorBoundary level="page">
          <Fragile />
        </ErrorBoundary>,
      ),
    )
    await act(async () => button('Copy error').click())
    expect(button("Couldn't copy")).toBeTruthy()
  })

  // App gives each page its own key, so the page you go to starts fresh.
  it('a new key starts a fresh boundary', () => {
    act(() =>
      root.render(
        <ErrorBoundary key="sets" level="page">
          <Fragile />
        </ErrorBoundary>,
      ),
    )
    broken = false
    act(() =>
      root.render(
        <ErrorBoundary key="home" level="page">
          <Fragile />
        </ErrorBoundary>,
      ),
    )
    expect(host.textContent).toBe('content')
  })
})
