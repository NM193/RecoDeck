// src/lib/starWave.ts
// The rating's wave (Micro-interactions spec, Stars): which stars pulse as
// they light, and when. Their colour ripples by CSS alone (a delay of
// STAR_STEP_MS × the star's index).

/** The gap between one star and the next in the wave. */
export const STAR_STEP_MS = 24

/** The pulse a star gives as it lights: up to 1.22 and back. */
export const STAR_PULSE: Keyframe[] = [
  { transform: 'scale(1)' },
  { transform: 'scale(1.22)', offset: 0.45 },
  { transform: 'scale(1)' },
]

/** The mockup's spring for the stars, softer than --ease-spring. */
export const STAR_EASE = 'cubic-bezier(0.34, 1.4, 0.64, 1)'

/**
 * Going from `from` stars shown to `to`, the stars that newly light (0-based)
 * and each one's pulse delay, counted from the first of them.
 */
export function starsToPulse(
  from: number,
  to: number,
): { index: number; delay: number }[] {
  const start = Math.max(from, 0)
  const pulses: { index: number; delay: number }[] = []
  for (let index = start; index < to; index++) {
    pulses.push({ index, delay: (index - start) * STAR_STEP_MS })
  }
  return pulses
}
