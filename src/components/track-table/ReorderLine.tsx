// src/components/track-table/ReorderLine.tsx
// Where dragged tracks would land in a playlist's own order: a line in the
// gap between rows nearest the pointer (track table spec, Dragging).
import { useTrackDragStore } from '../../lib/drag/trackDrag'

interface ReorderLineProps {
  /** The table's id: the line shows while its own rows are the target. */
  table: string
  /** Where the line goes for a pointer's height, in pixels from the first row's top. */
  lineAt: (clientY: number) => number
}

export function ReorderLine({ table, lineAt }: ReorderLineProps) {
  const y = useTrackDragStore((state) =>
    state.target?.kind === 'rows' && state.target.table === table ? state.y : null,
  )
  // A list scrolling under a still pointer moves the gap too.
  useTrackDragStore((state) => state.scrolls)
  if (y === null) return null
  return (
    <div
      className="tt-reorder-line"
      style={{ transform: `translateY(${lineAt(y)}px)` }}
    />
  )
}
