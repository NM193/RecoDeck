// src/components/track-table/ColumnsButton.tsx
// The toolbar's Columns button and its panel. The table holds `open`, so a
// right-click on any column head opens the same panel.
import { useCallback, useRef } from 'react'
import { useTrackTableLayout } from '../../store/trackTableLayoutStore'
import { Icon } from '../Icon'
import { Popover } from '../Popover'
import { ColumnsPanel } from './ColumnsPanel'
import './Columns.css'

interface ColumnsButtonProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ColumnsButton({ open, onOpenChange }: ColumnsButtonProps) {
  const anchorRef = useRef<HTMLDivElement>(null)
  const layout = useTrackTableLayout((state) => state.layout)
  const setLayout = useTrackTableLayout((state) => state.setLayout)
  const close = useCallback(() => onOpenChange(false), [onOpenChange])

  return (
    <div ref={anchorRef} className="tt-columns-anchor">
      <button
        type="button"
        className="btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        <Icon name="Columns3" size={14} />
        Columns
      </button>
      <Popover
        open={open}
        onClose={close}
        anchorRef={anchorRef}
        label="Columns"
        className="tt-columns-panel"
      >
        <ColumnsPanel layout={layout} onChange={setLayout} />
      </Popover>
    </div>
  )
}
