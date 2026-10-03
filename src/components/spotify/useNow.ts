// "synced 2 min ago" needs the time, and reading the clock during render
// breaks the react-hooks purity rule. This ticks in a timer instead; `null`
// until the first tick, a moment after mount.
import { useEffect, useState } from 'react'

export function useNow(intervalMs: number): number | null {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const first = setTimeout(tick, 0)
    const timer = setInterval(tick, intervalMs)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
    }
  }, [intervalMs])
  return now
}
