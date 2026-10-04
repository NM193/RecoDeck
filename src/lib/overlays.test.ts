// src/lib/overlays.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { closeTopOverlay, isOverlayOpen, registerOverlay } from './overlays'

describe('open overlays', () => {
  const unregisters: Array<() => void> = []
  const open = () => {
    const close = vi.fn()
    unregisters.push(registerOverlay(close))
    return close
  }
  const pressEscape = (repeat = false) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', repeat }))

  afterEach(() => {
    unregisters.splice(0).forEach((unregister) => unregister())
  })

  it('knows when one is open', () => {
    expect(isOverlayOpen()).toBe(false)
    open()
    expect(isOverlayOpen()).toBe(true)
  })

  it('closes the one opened last', () => {
    const first = open()
    const second = open()
    expect(closeTopOverlay()).toBe(true)
    expect(second).toHaveBeenCalledOnce()
    expect(first).not.toHaveBeenCalled()
  })

  it('forgets one that closed by itself', () => {
    const first = open()
    registerOverlay(vi.fn())()
    closeTopOverlay()
    expect(first).toHaveBeenCalledOnce()
  })

  it('answers false with none open', () => {
    expect(closeTopOverlay()).toBe(false)
  })

  it('closes the top one on Esc', () => {
    const first = open()
    const second = open()
    pressEscape()
    expect(second).toHaveBeenCalledOnce()
    expect(first).not.toHaveBeenCalled()
  })

  it('ignores a held Esc and other keys', () => {
    const close = open()
    pressEscape(true)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(close).not.toHaveBeenCalled()
  })

  it('stops listening once the last one closes', () => {
    const close = vi.fn()
    registerOverlay(close)()
    pressEscape()
    expect(close).not.toHaveBeenCalled()
  })
})
