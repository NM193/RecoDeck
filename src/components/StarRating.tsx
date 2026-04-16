// 5-star rating control with hover preview
// Clicking the already-selected star resets rating to 0

import { useState } from 'react'
import './StarRating.css'

interface StarRatingProps {
  value: number
  onChange: (rating: number) => void
  readonly?: boolean
}

export function StarRating({ value, onChange, readonly = false }: StarRatingProps) {
  const [hovered, setHovered] = useState<number | null>(null)
  const display = hovered ?? value

  return (
    <div
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
            disabled={readonly}
            aria-label={`Rate ${star} star${star === 1 ? '' : 's'}`}
            onMouseEnter={() => !readonly && setHovered(star)}
            onClick={(e) => {
              if (readonly) return
              e.stopPropagation()
              onChange(star === value ? 0 : star)
            }}
          >
            ★
          </button>
        )
      })}
    </div>
  )
}
