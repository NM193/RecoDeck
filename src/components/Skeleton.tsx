// src/components/Skeleton.tsx
// Loading (Interactions spec): grey shapes of what is coming, shimmering,
// only after 150ms (useShowAfter) — never a blank area, never a spinner in
// the middle of a page. Its styles are the shared `.skeleton` (controls.css);
// what replaces it can fade in with `.content-in`.
import type { CSSProperties } from 'react'
import { useShowAfter } from '../lib/useShowAfter'

/** One grey block: a cover, a QR code, a line. Holds its place while it waits. */
export function Skeleton({
  width,
  height,
  radius,
  className,
}: {
  width: CSSProperties['width']
  height: CSSProperties['height']
  radius?: CSSProperties['borderRadius']
  className?: string
}) {
  const shown = useShowAfter()
  return (
    <span
      className={['skeleton', className].filter(Boolean).join(' ')}
      style={{ width, height, borderRadius: radius, visibility: shown ? undefined : 'hidden' }}
      aria-hidden="true"
    />
  )
}

/** A list still reading: rows of a cover and two lines, holding their place while they wait. */
export function SkeletonRows({ rows = 6, label = 'Loading' }: { rows?: number; label?: string }) {
  const shown = useShowAfter()
  return (
    <div
      className="skeleton-rows"
      role="status"
      aria-label={label}
      aria-busy="true"
      style={{ visibility: shown ? undefined : 'hidden' }}
    >
      {Array.from({ length: rows }, (_, i) => (
        <div className="skeleton-rows__row" key={i}>
          <span className="skeleton skeleton-rows__cover" />
          <span className="skeleton-rows__lines">
            <span className="skeleton skeleton-rows__line" style={{ width: `${64 - (i % 3) * 12}%` }} />
            <span className="skeleton skeleton-rows__line skeleton-rows__line--short" />
          </span>
        </div>
      ))}
    </div>
  )
}
