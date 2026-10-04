// src/lib/toast.ts
// Toasts (Interactions spec, Feedback): `toast(message, { kind, action })`
// from anywhere; the Toaster shows them. success and info leave after 4s,
// warning after 6s, error stays until closed, and a toast under the mouse
// waits and shows its detail (e.g. why tracks were skipped). At most 3 at a
// time: a fourth pushes the oldest out. An action (Undo, Open, Try again)
// runs and closes its toast.
import { useSyncExternalStore } from 'react'

export type ToastKind = 'success' | 'info' | 'warning' | 'error'

export interface ToastAction {
  label: string
  run: () => void
}

export interface ToastOptions {
  /** success when absent. */
  kind?: ToastKind
  action?: ToastAction
  /** Shown under the message while the mouse is over the toast. */
  detail?: string
}

export interface Toast {
  id: number
  message: string
  kind: ToastKind
  action?: ToastAction
  detail?: string
}

export const TOAST_LIMIT = 3

/** How long each kind stays, in ms; null stays until closed. */
export const TOAST_DURATION: Record<ToastKind, number | null> = {
  success: 4000,
  info: 4000,
  warning: 6000,
  error: null,
}

// A toast's time left; `handle` is null while the mouse holds it.
interface Timer {
  handle: ReturnType<typeof setTimeout> | null
  remaining: number
  startedAt: number
}

let toasts: readonly Toast[] = []
const timers = new Map<number, Timer>()
const listeners = new Set<() => void>()
let nextId = 1

function emit() {
  listeners.forEach((listener) => listener())
}

function startTimer(id: number, ms: number) {
  timers.set(id, {
    handle: setTimeout(() => dismissToast(id), ms),
    remaining: ms,
    startedAt: Date.now(),
  })
}

function stopTimer(id: number) {
  const timer = timers.get(id)
  if (timer?.handle) clearTimeout(timer.handle)
  timers.delete(id)
}

/** Shows a toast; answers its id. */
export function toast(message: string, options: ToastOptions = {}): number {
  const id = nextId++
  const kind = options.kind ?? 'success'
  let next = [...toasts, { id, message, kind, action: options.action, detail: options.detail }]
  while (next.length > TOAST_LIMIT) {
    stopTimer(next[0].id)
    next = next.slice(1)
  }
  toasts = next
  const duration = TOAST_DURATION[kind]
  if (duration !== null) startTimer(id, duration)
  emit()
  return id
}

export function dismissToast(id: number): void {
  stopTimer(id)
  if (!toasts.some((t) => t.id === id)) return
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

/** The mouse is over the toast: its time stops. */
export function holdToast(id: number): void {
  const timer = timers.get(id)
  if (!timer || timer.handle === null) return
  clearTimeout(timer.handle)
  timer.handle = null
  timer.remaining -= Date.now() - timer.startedAt
}

/** The mouse left it: the rest of its time runs. */
export function releaseToast(id: number): void {
  const timer = timers.get(id)
  if (!timer || timer.handle !== null) return
  timer.startedAt = Date.now()
  timer.handle = setTimeout(() => dismissToast(id), Math.max(0, timer.remaining))
}

/** Runs the toast's action, closing the toast first. */
export function runToastAction(id: number): void {
  const shown = toasts.find((t) => t.id === id)
  dismissToast(id)
  shown?.action?.run()
}

/** Closes every toast (tests). */
export function clearToasts(): void {
  toasts.forEach((t) => stopTimer(t.id))
  toasts = []
  emit()
}

export function getToasts(): readonly Toast[] {
  return toasts
}

export function subscribeToasts(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The toasts showing, for the Toaster. */
export function useToasts(): readonly Toast[] {
  return useSyncExternalStore(subscribeToasts, getToasts)
}
