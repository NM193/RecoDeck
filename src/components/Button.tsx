// src/components/Button.tsx
// The shared button (Interactions spec, Controls): the `.btn` classes, and a
// working state — a spinner in the icon's place, the label in its -ing form
// ("Saving…"), disabled until the work ends.
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'danger'
  size?: 'sm'
  /** An icon before the label. */
  icon?: IconName
  /** The work it started is running. */
  working?: boolean
  /** The label while working: "Saving…". The label stays when absent. */
  workingLabel?: ReactNode
}

export function Button({
  variant,
  size,
  icon,
  working = false,
  workingLabel,
  className,
  disabled,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  const classes = ['btn', variant && `btn--${variant}`, size && `btn--${size}`, className]
    .filter(Boolean)
    .join(' ')
  return (
    <button {...rest} type={type} className={classes} disabled={disabled || working} aria-busy={working || undefined}>
      {working ? <span className="btn__spinner" aria-hidden="true" /> : icon && <Icon name={icon} size={14} />}
      {working && workingLabel !== undefined ? workingLabel : children}
    </button>
  )
}
