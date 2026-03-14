import type { VersionChanges } from '../lib/changelog'

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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: 440, padding: '24px 28px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3>What's New in {version}</h3>

        <div style={{ margin: '12px 0 20px' }}>
          {sections.map((section) => (
            <div key={section.label} style={{ marginBottom: 16 }}>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 13,
                  color: 'var(--text-primary)',
                  marginBottom: 6,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                {section.label}
              </div>
              <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
                {section.items.map((item, i) => (
                  <li key={i} style={{ marginBottom: 4, color: 'var(--text-secondary)' }}>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
