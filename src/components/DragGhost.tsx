// src/components/DragGhost.tsx
// The label that follows the pointer while tracks are dragged ("3 tracks";
// Interactions spec, Drag and drop). Its CSS also holds the drag's cursor and
// the lit target.
import { createPortal } from 'react-dom'
import { useTrackDragStore } from '../lib/drag/trackDrag'
import './DragGhost.css'

export function DragGhost() {
  const count = useTrackDragStore((state) => state.payload?.tracks.length ?? 0)
  const x = useTrackDragStore((state) => state.x)
  const y = useTrackDragStore((state) => state.y)
  if (count === 0) return null
  return createPortal(
    <div className="drag-ghost" style={{ transform: `translate(${x + 14}px, ${y + 10}px)` }}>
      {count.toLocaleString('en-US')} {count === 1 ? 'track' : 'tracks'}
    </div>,
    document.body,
  )
}
