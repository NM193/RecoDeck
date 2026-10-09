// src/components/track-table/FilterButton.tsx
// The toolbar's Filter button. With a filter on it names it instead
// ("Tech House · 125–129 BPM ✕"), in the accent style; ✕ clears it.
import { useCallback, useRef, useState } from 'react'
import type { Track } from '../../types/track'
import { filterButtonLabel, type TrackFilter } from '../../lib/trackTable/filter'
import { Icon } from '../Icon'
import { Popover } from '../Popover'
import { FilterPanel } from './FilterPanel'
import './TrackFilter.css'

interface FilterButtonProps {
  /** The view's tracks before the filter. */
  tracks: Track[]
  filter: TrackFilter | null
  onChange: (filter: TrackFilter | null) => void
  /** The rows the table shows with this filter. */
  shownCount: number
}

export function FilterButton({
  tracks,
  filter,
  onChange,
  shownCount,
}: FilterButtonProps) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  const label = filterButtonLabel(filter)

  return (
    <div ref={anchorRef} className={label ? 'tt-filter tt-filter--on' : 'tt-filter'}>
      <button
        type="button"
        className="btn tt-filter__main"
        aria-haspopup="dialog"
        aria-expanded={open}
        title={label ?? undefined}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        <Icon name="ListFilter" size={14} />
        <span className="tt-filter__label">{label ?? 'Filter'}</span>
      </button>
      {label && (
        <button
          type="button"
          className="btn tt-filter__clear"
          aria-label="Clear filter"
          title="Clear filter"
          onClick={() => onChange(null)}
        >
          ✕
        </button>
      )}
      <Popover
        open={open}
        onClose={close}
        anchorRef={anchorRef}
        label="Filter"
        className="tt-filter-panel"
      >
        <FilterPanel
          tracks={tracks}
          filter={filter}
          onChange={onChange}
          shownCount={shownCount}
          onClose={close}
        />
      </Popover>
    </div>
  )
}
