// src/components/home/HomeHeader.tsx
// The greeting and the date over Home's cards, with Customize; while
// customizing, Reset, Cancel and Save (Home cards spec, Customize).
import { Icon } from '../Icon'

interface HomeHeaderProps {
  editing: boolean
  onCustomize: () => void
  onReset: () => void
  onCancel: () => void
  onSave: () => void
}

function greeting(now: Date): string {
  const hour = now.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export function HomeHeader({
  editing,
  onCustomize,
  onReset,
  onCancel,
  onSave,
}: HomeHeaderProps) {
  const now = new Date()
  return (
    <header className="home-header">
      <div className="home-header__hello">
        <h1 className="home-header__greeting">
          {editing ? 'Customize Home' : greeting(now)}
        </h1>
        <span className="home-header__date">
          {editing
            ? 'Drag a card by its title, resize it from its corner, or add one from the list'
            : now.toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
        </span>
      </div>
      {editing ? (
        <div className="home-header__actions">
          <button type="button" className="link-btn" onClick={onReset}>
            Reset
          </button>
          <button type="button" className="btn btn--sm" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--sm btn--primary"
            onClick={onSave}
          >
            Save
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn--sm" onClick={onCustomize}>
          <Icon name="SlidersHorizontal" size={14} />
          Customize
        </button>
      )}
    </header>
  )
}
