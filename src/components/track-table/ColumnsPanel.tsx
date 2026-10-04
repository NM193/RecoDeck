// src/components/track-table/ColumnsPanel.tsx
// The Columns panel (track table spec): a checkbox per column, ⠿ to drag a
// column to another place (or ↑ ↓ on the focused handle), Reset, and the
// Artwork switch. # and the artwork are not in the list.
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import {
  columnDef,
  defaultLayout,
  moveColumn,
  setColumnShown,
  type ColumnId,
  type TrackTableLayout,
} from '../../lib/trackTable/columns'
import { Icon } from '../Icon'
import { ToggleSwitch } from '../settings/ToggleSwitch'

/** Each row's height, in CSS too: a drag moves a column one row per this. */
const ROW_HEIGHT = 28

interface ColumnsPanelProps {
  layout: TrackTableLayout
  onChange: (layout: TrackTableLayout) => void
}

interface Drag {
  pointerId: number
  from: number
  to: number
  startY: number
  offset: number
}

export function ColumnsPanel({ layout, onChange }: ColumnsPanelProps) {
  const [drag, setDrag] = useState<Drag | null>(null)
  const handles = useRef(new Map<ColumnId, HTMLButtonElement>())
  const last = layout.columns.length - 1

  const startDrag = (index: number) => (event: PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    setDrag({ pointerId: event.pointerId, from: index, to: index, startY: event.clientY, offset: 0 })
  }
  const moveDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (!drag || event.pointerId !== drag.pointerId) return
    const offset = event.clientY - drag.startY
    const to = Math.max(0, Math.min(last, drag.from + Math.round(offset / ROW_HEIGHT)))
    setDrag({ ...drag, offset, to })
  }
  const endDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (!drag || event.pointerId !== drag.pointerId) return
    if (drag.to !== drag.from) onChange(moveColumn(layout, drag.from, drag.to))
    setDrag(null)
  }

  // ↑ ↓ on a focused handle move its column; the handle keeps the focus.
  const moveByKey = (index: number, id: ColumnId) => (event: KeyboardEvent) => {
    const step = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
    if (step === 0) return
    event.preventDefault()
    onChange(moveColumn(layout, index, index + step))
    requestAnimationFrame(() => handles.current.get(id)?.focus())
  }

  // While dragging, the rows between the column's place and where it would
  // land step aside by one row.
  const shift = (index: number): number => {
    if (!drag || index === drag.from) return 0
    if (drag.from < drag.to && index > drag.from && index <= drag.to) return -ROW_HEIGHT
    if (drag.to < drag.from && index >= drag.to && index < drag.from) return ROW_HEIGHT
    return 0
  }

  return (
    <>
      <h5 className="popover__title">Columns</h5>
      <ul className={drag ? 'tt-columns tt-columns--dragging' : 'tt-columns'}>
        {layout.columns.map((column, index) => {
          const def = columnDef(column.id)
          const always = column.id === 'title'
          const dragging = drag?.from === index
          const toggle = () => onChange(setColumnShown(layout, column.id, !column.shown))
          return (
            <li
              key={column.id}
              className={dragging ? 'tt-columns__row tt-columns__row--dragging' : 'tt-columns__row'}
              style={{ transform: `translateY(${drag && dragging ? drag.offset : shift(index)}px)` }}
            >
              <button
                ref={(el) => {
                  if (el) handles.current.set(column.id, el)
                  else handles.current.delete(column.id)
                }}
                type="button"
                className="tt-columns__handle"
                aria-label={`Move ${def.name}`}
                title="Drag to reorder"
                onPointerDown={startDrag(index)}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onKeyDown={moveByKey(index, column.id)}
              >
                ⠿
              </button>
              <button
                type="button"
                role="checkbox"
                aria-checked={column.shown}
                aria-label={def.name}
                className="tt-check"
                disabled={always}
                onClick={toggle}
              >
                {column.shown && <Icon name="Check" size={11} strokeWidth={2.5} />}
              </button>
              <span
                className="tt-columns__name"
                onClick={always ? undefined : toggle}
              >
                {def.name}
              </span>
              {always && <span className="tt-columns__note">always</span>}
            </li>
          )
        })}
      </ul>
      <div className="popover__footer">
        <button type="button" className="link-btn" onClick={() => onChange(defaultLayout())}>
          Reset
        </button>
        <label className="tt-columns__artwork">
          Artwork
          <ToggleSwitch
            checked={layout.artwork}
            onChange={(artwork) => onChange({ ...layout, artwork })}
          />
        </label>
      </div>
    </>
  )
}
