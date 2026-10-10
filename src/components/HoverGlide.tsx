// src/components/HoverGlide.tsx
// A list whose hover highlight slides from item to item (Micro-interactions
// spec, The glide): a <div> holding the highlight before its children. With
// `open`, a second highlight sits on the open item (the sidebar's open page).
// Lists that already have their own element use the hooks instead.
import { useRef, type HTMLAttributes } from 'react'
import { GLIDE } from '../lib/glide/glide'
import { useGlideTo, useHoverGlide } from '../lib/glide/useGlide'

interface HoverGlideProps extends HTMLAttributes<HTMLDivElement> {
  /** The items the highlight goes to, e.g. '.search-row'. */
  item: string
  kind: keyof typeof GLIDE
  /** The open item, e.g. '.folder-row.selected'. */
  open?: string
}

export function HoverGlide({
  item,
  kind,
  open,
  className,
  children,
  ...rest
}: HoverGlideProps) {
  const track = useRef<HTMLDivElement>(null)
  const hover = useRef<HTMLSpanElement>(null)
  const opened = useRef<HTMLSpanElement>(null)
  useHoverGlide(track, hover, item, GLIDE[kind])
  useGlideTo(track, opened, open ?? ':not(*)', GLIDE[kind])
  return (
    <div
      ref={track}
      className={className ? `glide-track ${className}` : 'glide-track'}
      {...rest}
    >
      <span ref={hover} className="glide" aria-hidden="true" />
      {open && (
        <span ref={opened} className="glide glide--open" aria-hidden="true" />
      )}
      {children}
    </div>
  )
}
