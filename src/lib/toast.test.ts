// src/lib/toast.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearToasts,
  dismissToast,
  getToasts,
  holdToast,
  releaseToast,
  runToastAction,
  toast,
} from './toast'

const messages = () => getToasts().map((t) => t.message)

describe('toasts', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    clearToasts()
    vi.useRealTimers()
  })

  it('success and info leave after 4s, warning after 6s', () => {
    toast('Added', { kind: 'success' })
    toast('Note', { kind: 'info' })
    toast('Careful', { kind: 'warning' })
    vi.advanceTimersByTime(3999)
    expect(messages()).toEqual(['Added', 'Note', 'Careful'])
    vi.advanceTimersByTime(1)
    expect(messages()).toEqual(['Careful'])
    vi.advanceTimersByTime(2000)
    expect(messages()).toEqual([])
  })

  it('an error stays until it is closed', () => {
    const id = toast('Failed', { kind: 'error' })
    vi.advanceTimersByTime(60_000)
    expect(messages()).toEqual(['Failed'])
    dismissToast(id)
    expect(messages()).toEqual([])
  })

  it('shows at most three: a fourth pushes the oldest out', () => {
    toast('one', { kind: 'error' })
    toast('two')
    toast('three')
    toast('four')
    expect(messages()).toEqual(['two', 'three', 'four'])
  })

  it('waits while the mouse is over it, then runs the rest of its time', () => {
    const id = toast('Added')
    vi.advanceTimersByTime(3000)
    holdToast(id)
    vi.advanceTimersByTime(10_000)
    expect(messages()).toEqual(['Added'])
    releaseToast(id)
    vi.advanceTimersByTime(999)
    expect(messages()).toEqual(['Added'])
    vi.advanceTimersByTime(1)
    expect(messages()).toEqual([])
  })

  it('keeps a detail for the mouse to show', () => {
    toast('Moved 2 · 1 skipped', { kind: 'warning', detail: "Juz Listen' — playing now" })
    expect(getToasts()[0].detail).toBe("Juz Listen' — playing now")
  })

  it('an action runs and closes its toast', () => {
    const run = vi.fn()
    const id = toast('Added 3 tracks to Peak Time', { action: { label: 'Undo', run } })
    runToastAction(id)
    expect(run).toHaveBeenCalledOnce()
    expect(messages()).toEqual([])
  })
})
