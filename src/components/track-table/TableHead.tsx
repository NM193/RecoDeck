// src/components/track-table/TableHead.tsx
// The column heads (track table spec, Columns): a click sorts by the column
// and again reverses (in a playlist, a third click goes back to its own
// order), the arrow shows which; Title & artist's "Title" and
// "Artist" each sort. A head's right edge drags to resize (Title & artist
// takes what is left, so it has none). A right-click opens the Columns panel.
import { useRef, useState, type PointerEvent } from 'react'
import {
  columnDef,
  setColumnWidth,
  shownColumns,
  type ColumnLayout,
  type TrackTableLayout,
} from '../../lib/trackTable/columns'
import { SORT_BY_COLUMN, type SortColumn, type SortState } from '../../lib/trackTable/sort'
import { useTrackTableLayout } from '../../store/trackTableLayoutStore'

interface TableHeadProps {
  layout: TrackTableLayout
  /** null: the list's own order (a playlist), no arrow. */
  sort: SortState | null
  onSort: (column: SortColumn) => void
  onOpenColumns: () => void
}

function SortButton({
  column,
  label,
  sort,
  onSort,
}: {
  column: SortColumn
  label: string
  sort: SortState | null
  onSort: (column: SortColumn) => void
}) {
  const sorted = sort?.column === column
  return (
    <button
      type="button"
      className={sorted ? 'head-sort head-sort--sorted' : 'head-sort'}
      aria-sort={sorted ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}
      onClick={() => onSort(column)}
    >
      {label}
      {sorted && <span className="sort-indicator">{sort.direction === 'asc' ? '▲' : '▼'}</span>}
    </button>
  )
}

function ResizeHandle({ column }: { column: ColumnLayout }) {
  const start = useRef<{ pointerId: number; x: number; width: number } | null>(null)
  const [active, setActive] = useState(false)

  const onPointerDown = (event: PointerEvent<HTMLSpanElement>) => {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    start.current = { pointerId: event.pointerId, x: event.clientX, width: column.width }
    setActive(true)
  }
  const onPointerMove = (event: PointerEvent<HTMLSpanElement>) => {
    const drag = start.current
    if (!drag || event.pointerId !== drag.pointerId) return
    const { layout, setLayout } = useTrackTableLayout.getState()
    // Only shown while dragging; written once on release.
    setLayout(setColumnWidth(layout, column.id, drag.width + event.clientX - drag.x), false)
  }
  const onPointerEnd = (event: PointerEvent<HTMLSpanElement>) => {
    if (!start.current || event.pointerId !== start.current.pointerId) return
    start.current = null
    setActive(false)
    useTrackTableLayout.getState().save()
  }

  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${columnDef(column.id).name}`}
      className={active ? 'head-resize head-resize--active' : 'head-resize'}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onClick={(event) => event.stopPropagation()}
    />
  )
}

export function TableHead({ layout, sort, onSort, onOpenColumns }: TableHeadProps) {
  return (
    <div
      className="track-table-row header-row"
      onContextMenu={(event) => {
        event.preventDefault()
        onOpenColumns()
      }}
    >
      <div className="tt-cell cell-index">#</div>
      {layout.artwork && <div className="tt-cell cell-art" />}
      {shownColumns(layout).map((column) => {
        if (column.id === 'title') {
          return (
            <div key="title" className="tt-cell head-cell">
              <SortButton column="title" label="Title" sort={sort} onSort={onSort} />
              <span className="head-sep">·</span>
              <SortButton column="artist" label="Artist" sort={sort} onSort={onSort} />
            </div>
          )
        }
        const def = columnDef(column.id)
        return (
          <div
            key={column.id}
            className={def.align === 'end' ? 'tt-cell head-cell head-cell--end' : 'tt-cell head-cell'}
          >
            <SortButton
              column={SORT_BY_COLUMN[column.id]}
              label={def.head}
              sort={sort}
              onSort={onSort}
            />
            <ResizeHandle column={column} />
          </div>
        )
      })}
    </div>
  )
}
