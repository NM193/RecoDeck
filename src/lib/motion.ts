// src/lib/motion.ts
// The Interactions spec's three durations and one easing, in seconds for
// framer-motion; the same values as --motion-* and --ease in globals.css.
export const MOTION = { fast: 0.12, base: 0.18, slow: 0.24 } as const

export const EASE: [number, number, number, number] = [0.2, 0, 0, 1]
