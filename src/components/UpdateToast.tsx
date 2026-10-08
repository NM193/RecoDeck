// src/components/UpdateToast.tsx
// The update prompt (Interactions spec, Feedback): it stays apart from the
// toasts, top right until answered, in their style with the shared buttons.
import { Icon } from './Icon'
import './UpdateToast.css'

interface UpdateToastProps {
  version: string
  onInstall: () => void
  onLater: () => void
}

export function UpdateToast({ version, onInstall, onLater }: UpdateToastProps) {
  return (
    <div className="update-toast" role="status">
      <Icon name="Download" size={16} className="update-toast__icon" />
      <span className="update-toast__message">Update v{version} available</span>
      <button type="button" className="btn btn--sm" onClick={onLater}>
        Later
      </button>
      <button type="button" className="btn btn--primary btn--sm" onClick={onInstall}>
        Install
      </button>
    </div>
  )
}
