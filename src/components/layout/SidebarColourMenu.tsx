// src/components/layout/SidebarColourMenu.tsx
// The colour block of a sidebar section's right-click menu.
import { Icon } from '../Icon'
import { PALETTE } from '../../lib/sidebarPrefs'

interface SidebarColourMenuProps {
  label: string
  current: string
  onPick: (hex: string) => void
  /** Called on every change of the system picker; the caller keeps the menu open. */
  onCustom: (hex: string) => void
  onReset: () => void
}

export function SidebarColourMenu({
  label,
  current,
  onPick,
  onCustom,
  onReset,
}: SidebarColourMenuProps) {
  return (
    <div className="sidebar-colour-menu">
      <div className="sidebar-colour-menu__title">{label} · icon colour</div>
      <div className="sidebar-colour-menu__swatches">
        {PALETTE.map((hex) => (
          <button
            key={hex}
            type="button"
            className={`sidebar-colour-menu__swatch ${current === hex ? 'sidebar-colour-menu__swatch--current' : ''}`}
            style={{ background: hex }}
            onClick={() => onPick(hex)}
            aria-label={`Use ${hex}`}
          />
        ))}
      </div>
      <label className="sidebar-ctx-menu__item">
        <Icon name="Pipette" size={14} />
        Custom colour…
        <input
          type="color"
          className="sidebar-colour-menu__picker"
          value={current}
          onChange={(e) => onCustom(e.target.value)}
        />
      </label>
      <button type="button" className="sidebar-ctx-menu__item" onClick={onReset}>
        <Icon name="RotateCcw" size={14} />
        Reset to default
      </button>
    </div>
  )
}
