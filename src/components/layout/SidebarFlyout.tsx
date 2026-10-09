// src/components/layout/SidebarFlyout.tsx
// A panel beside a rail icon that shows what the expanded section would.
// A menu opened from inside it (FolderTree's right-click, the shared Menu)
// lives in body, and a press on it is not "outside".
import { useEffect, useRef, type ReactNode } from 'react'
import { useOverlay } from '../../lib/overlays'

interface SidebarFlyoutProps {
  title: string
  top: number
  left: number
  /** The icon that opened it — clicking it again must not count as "outside". */
  anchor: HTMLElement | null
  onClose: () => void
  children: ReactNode
}

export function SidebarFlyout({
  title,
  top,
  left,
  anchor,
  onClose,
  children,
}: SidebarFlyoutProps) {
  const ref = useRef<HTMLDivElement>(null)
  // Open, it tells the app (useOverlay): Esc closes it, and the set video steps aside.
  useOverlay(true, onClose)

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (ref.current?.contains(target) || anchor?.contains(target)) return
      if ((target as Element).closest?.('.menu')) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [anchor, onClose])

  return (
    <div
      ref={ref}
      className="sidebar-flyout"
      style={{ top, left, maxHeight: window.innerHeight - top - 16 }}
      role="dialog"
      aria-label={title}
    >
      <div className="sidebar-flyout__title">{title}</div>
      <div className="sidebar-flyout__body" data-drop-scroll>
        {children}
      </div>
    </div>
  )
}
