// src/lib/motion.ts
// The Interactions spec's three durations and one easing, in seconds for
// framer-motion; the same values as --motion-* and --ease in globals.css.
export const MOTION = { fast: 0.12, base: 0.18, slow: 0.24 } as const

export const EASE: [number, number, number, number] = [0.2, 0, 0, 1]

/** The Micro-interactions spec's slide and spring (--ease-soft, --ease-spring). */
export const EASE_SOFT: [number, number, number, number] = [0.22, 1, 0.36, 1]
export const EASE_SPRING: [number, number, number, number] = [0.34, 1.56, 0.64, 1]
