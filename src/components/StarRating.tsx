// 5-star rating control with hover preview
// Clicking the already-selected star resets rating to 0
// The stars light in a wave, each pulsing as it lights; the one under the
// pointer zooms instead (Micro-interactions spec, Stars).

import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { prefersReducedMotion } from '../lib/glide/glide'
import { STAR_EASE, STAR_PULSE, starsToPulse } from '../lib/starWave'
import './StarRating.css'

interface StarRatingProps {
  value: number
  onChange: (rating: number) => void
  readonly?: boolean
}

export function StarRating({ value, onChange, readonly = false }: StarRatingProps) {
  const [hovered, setHovered] = useState<number | null>(null)
  const display = hovered ?? value
  const starsRef = useRef<HTMLDivElement>(null)
  // How many stars were lit before this render: the wave starts after them.
  const shownRef = useRef(display)

  useLayoutEffect(() => {
    const from = shownRef.current
    shownRef.current = display
    if (readonly || prefersReducedMotion()) return
    const glyphs = starsRef.current?.querySelectorAll<HTMLElement>('.star__glyph')
    if (!glyphs) return
    for (const { index, delay } of starsToPulse(from, display)) {
      if (index + 1 === hovered) continue
      // On the glyph, so it never fights the button's own zoom. (jsdom has
      // no Web Animations; the app always does.)
      glyphs[index]?.animate?.(STAR_PULSE, { duration: 280, delay, easing: STAR_EASE })
    }
  }, [display, hovered, readonly])

  return (
    <div
      ref={starsRef}
      className={`star-rating ${readonly ? 'star-rating--readonly' : ''}`}
      onMouseLeave={() => setHovered(null)}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const active = star <= display
        return (
          <button
            key={star}
            type="button"
            className={`star ${active ? 'star--active' : ''}`}
            style={{ '--i': star - 1 } as CSSProperties}
            disabled={readonly}
            aria-label={`Rate ${star} star${star === 1 ? '' : 's'}`}
            onMouseEnter={() => !readonly && setHovered(star)}
            onClick={(e) => {
              if (readonly) return
              e.stopPropagation()
              onChange(star === value ? 0 : star)
            }}
          >
            <span className="star__glyph">★</span>
          </button>
        )
      })}
    </div>
  )
}
