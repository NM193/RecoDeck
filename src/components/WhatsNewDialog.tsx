import type { VersionChanges } from '../lib/changelog'
import './WhatsNewDialog.css'

/**
 * Renders the `**bold**` the changelog uses to lead a line with its subject.
 *
 * Not a markdown library for one construct — the changelog is ours, and this is
 * the only formatting it carries. Anything else is shown as written.
 */
function withEmphasis(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      part
    ),
  )
}

interface WhatsNewDialogProps {
  version: string
  changes: VersionChanges
  onClose: () => void
}

export function WhatsNewDialog({ version, changes, onClose }: WhatsNewDialogProps) {
  const sections = [
    { label: 'New', items: changes.added },
    { label: 'Fixed', items: changes.fixed },
    { label: 'Changes', items: changes.changed },
  ].filter((section) => section.items.length > 0)

  const total = sections.reduce((sum, section) => sum + section.items.length, 0)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content whats-new" onClick={(e) => e.stopPropagation()}>
        <div className="whats-new__header">
          <h3>What's New in {version}</h3>
          <p className="whats-new__intro">
            {total} {total === 1 ? 'change' : 'changes'} in this release.
          </p>
        </div>

        <div className="whats-new__body">
          {sections.map((section) => (
            <div className="whats-new__section" key={section.label}>
              <div className="whats-new__label">{section.label}</div>
              <ul className="whats-new__list">
                {section.items.map((item, i) => (
                  <li key={i}>{withEmphasis(item)}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="whats-new__footer">
          <button className="btn btn-primary" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
