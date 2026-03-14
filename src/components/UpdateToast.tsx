import { Icon } from './Icon'
import './UpdateToast.css'

interface UpdateToastProps {
  version: string
  onInstall: () => void
  onLater: () => void
}

export function UpdateToast({ version, onInstall, onLater }: UpdateToastProps) {
  return (
    <div className="update-toast">
      <Icon name="Download" size={16} className="update-toast-icon" />
      <span className="update-toast-message">Update v{version} available</span>
      <div className="update-toast-actions">
        <button className="update-toast-btn update-toast-btn--install" onClick={onInstall}>
          Install
        </button>
        <button className="update-toast-btn update-toast-btn--later" onClick={onLater}>
          Later
        </button>
      </div>
    </div>
  )
}
