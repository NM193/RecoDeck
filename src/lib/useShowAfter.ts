// src/lib/useShowAfter.ts
// Loading (Interactions spec): a skeleton shows only after 150ms, so a fast
// read never flashes it.
import { useEffect, useState } from 'react'

export const SKELETON_DELAY_MS = 150

/** False until `ms` have passed since the caller mounted. */
export function useShowAfter(ms: number = SKELETON_DELAY_MS): boolean {
  const [shown, setShown] = useState(ms <= 0)
  useEffect(() => {
    if (ms <= 0) return
    const timer = setTimeout(() => setShown(true), ms)
    return () => clearTimeout(timer)
  }, [ms])
  return shown
}
