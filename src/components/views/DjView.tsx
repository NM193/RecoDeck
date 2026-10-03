// One DJ's page. This first version is the hero with the name and Back; the
// photo, meta line, buttons and tabs come with the page's data (useDjPage).
import { Icon } from '../Icon'
import './DjView.css'

interface DjViewProps {
  /** The name as it was clicked; the page's key is djKey(name). */
  name: string
  /** Back to where the first DJ page was opened from (Search or Sets). */
  onBack: () => void
}

export function DjView({ name, onBack }: DjViewProps) {
  return (
    <div className="dj-view">
      <header className="dj-hero">
        <button
          type="button"
          className="dj-hero__back"
          onClick={onBack}
          title="Back"
        >
          <Icon name="ArrowLeft" size={16} />
          Back
        </button>
        <div className="dj-hero__in">
          <div className="dj-hero__kicker">DJ · Producer</div>
          <h1 className="dj-hero__name">{name}</h1>
        </div>
      </header>
    </div>
  )
}
