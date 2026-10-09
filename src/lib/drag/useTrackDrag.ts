// src/lib/drag/useTrackDrag.ts
// A track table's rows as a drag source (Interactions spec, Drag and drop):
// a press on a row that moves 4px drags the selected tracks — or that row
// alone, selected first, when it is not selected. Not with ⌘ or Shift held
// (they select), and not from a control in the row (▶, the stars).
import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import type { Track } from '../../types/track'
import type { DragPayload, DropTarget } from './dropTargets'
import { startTrackDrag, type Point } from './trackDrag'

/** How far the pointer moves before a press becomes a drag. */
const DRAG_THRESHOLD = 4

interface TrackDragSource {
  /** The drag for a press on `track`'s row, selecting what it drags; null for none. */
  begin: (track: Track) => DragPayload | null
  onDrop: (payload: DragPayload, target: DropTarget, at: Point) => void
}

/** The rows' onPointerDown. */
export function useTrackDrag(source: TrackDragSource) {
  // The latest selection and handlers, read when the drag starts.
  const sourceRef = useRef(source)
  useEffect(() => {
    sourceRef.current = source
  })

  return (event: ReactPointerEvent, track: Track) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return
    if ((event.target as Element).closest('button, input, textarea, select, a, [role="slider"]')) return
    const start = { x: event.clientX, y: event.clientY }
    const pointerId = event.pointerId

    const stop = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
      window.removeEventListener('blur', stop)
    }
    const onMove = (move: PointerEvent) => {
      if (move.pointerId !== pointerId) return
      // The button is up: its release was lost (a dialog, another window).
      if ((move.buttons & 1) === 0) {
        stop()
        return
      }
      if (Math.hypot(move.clientX - start.x, move.clientY - start.y) < DRAG_THRESHOLD) return
      stop()
      const payload = sourceRef.current.begin(track)
      if (!payload) return
      startTrackDrag(payload, { x: move.clientX, y: move.clientY }, (target, at) =>
        sourceRef.current.onDrop(payload, target, at),
      )
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    window.addEventListener('blur', stop)
  }
}
