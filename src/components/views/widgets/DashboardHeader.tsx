import { Icon } from '../../Icon'

interface DashboardHeaderProps {
  isEditMode: boolean
  onCustomize: () => void
  onSave: () => void
  onCancel: () => void
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function getDateString(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

export function DashboardHeader({ isEditMode, onCustomize, onSave, onCancel }: DashboardHeaderProps) {
  if (isEditMode) {
    return (
      <div className="dashboard-header dashboard-header--edit">
        <span className="dashboard-header__edit-label">Editing Dashboard</span>
        <div className="dashboard-header__edit-actions">
          <button className="dashboard-header__btn dashboard-header__btn--cancel" onClick={onCancel}>
            Cancel
          </button>
          <button className="dashboard-header__btn dashboard-header__btn--save" onClick={onSave}>
            Save Layout
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard-header">
      <div className="dashboard-header__info">
        <h1 className="dashboard-header__greeting">{getGreeting()}</h1>
        <span className="dashboard-header__date">{getDateString()}</span>
      </div>
      <button className="dashboard-header__customize" onClick={onCustomize}>
        <Icon name="Settings" size={14} />
        Customize
      </button>
    </div>
  )
}
