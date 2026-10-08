interface ToggleSwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  /** Its accessible name, where no visible label is tied to it. */
  label?: string
}

export function ToggleSwitch({ checked, onChange, disabled, label }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`toggle-switch ${checked ? 'toggle-switch--on' : ''} ${disabled ? 'toggle-switch--disabled' : ''}`}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
    >
      <span className="toggle-switch__thumb" />
    </button>
  )
}
