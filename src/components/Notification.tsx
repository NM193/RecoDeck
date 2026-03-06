import { useCallback, useRef } from 'react'
import { Icon, type IconName } from './Icon'
import './Notification.css'

interface NotificationProps {
  message: string
  type?: 'info' | 'success' | 'warning' | 'error'
  duration?: number
  onClose: () => void
}

export function Notification({
  message,
  type = 'info',
  duration = 4000,
  onClose,
}: NotificationProps) {
  const closedRef = useRef(false)

  const handleAnimationEnd = useCallback(
    (e: React.AnimationEvent) => {
      if (e.animationName === 'notifCountdown' && !closedRef.current) {
        closedRef.current = true
        onClose()
      }
    },
    [onClose],
  )

  const handleClose = useCallback(() => {
    if (!closedRef.current) {
      closedRef.current = true
      onClose()
    }
  }, [onClose])

  const getIcon = (): IconName => {
    if (type === 'success') return 'CircleCheck'
    if (type === 'warning') return 'TriangleAlert'
    if (type === 'error') return 'CircleX'
    return 'Info'
  }

  return (
    <div
      className={`notification notification--${type}`}
      style={{ '--notif-duration': `${duration}ms` } as React.CSSProperties}
      onAnimationEnd={handleAnimationEnd}
    >
      <Icon name={getIcon()} size={16} className="notification-icon" />
      <span className="notification-message">{message}</span>
      <button className="notification-close" onClick={handleClose}>
        <Icon name="X" size={14} />
      </button>
    </div>
  )
}
