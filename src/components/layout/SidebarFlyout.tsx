// src/components/layout/SidebarFlyout.tsx
// A panel beside a rail icon that shows what the expanded section would.
// No transform on it or its ancestors: FolderTree's own menus are
// position: fixed, and a transformed ancestor would misplace them.
import { useEffect, useRef, type ReactNode } from 'react'

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

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (ref.current?.contains(target) || anchor?.contains(target)) return
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
