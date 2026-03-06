import { useState } from 'react'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { ask } from '@tauri-apps/plugin-dialog'

interface WhatsNewDialogProps {
  version: string
  changes: string[]
  onClose: () => void
}

export function WhatsNewDialog({ version, changes, onClose }: WhatsNewDialogProps) {
  const [updating, setUpdating] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)

  async function handleUpdate() {
    try {
      setUpdating(true)
      setUpdateStatus('Checking for updates...')
      setProgress(0)

      const update = await check()

      if (!update) {
        setUpdateStatus("You're on the latest version!")
        setTimeout(() => {
          setUpdating(false)
          setUpdateStatus(null)
        }, 2000)
        return
      }

      setUpdateStatus(`Downloading v${update.version}...`)
      let downloadedBytes = 0
      let totalBytes = 0

      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          totalBytes = event.data.contentLength ?? 0
        } else if (event.event === 'Progress') {
          downloadedBytes += event.data.chunkLength
          const pct = totalBytes > 0 ? Math.min(95, Math.round((downloadedBytes / totalBytes) * 100)) : 0
          setProgress(pct)
          setUpdateStatus(`Downloading... ${pct}%`)
        } else if (event.event === 'Finished') {
          setProgress(100)
          setUpdateStatus('Installing...')
        }
      })

      setUpdateStatus('Update ready!')
      const restartNow = await ask(
        `Update v${update.version} downloaded.\n\nRestart now to apply?`,
        { title: 'Restart to Update', kind: 'info', okLabel: 'Restart Now', cancelLabel: 'Later' },
      )

      if (restartNow) {
        await relaunch()
      } else {
        setUpdateStatus('Update will apply on next restart.')
        setTimeout(onClose, 2000)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setUpdateStatus(`Update failed: ${msg}`)
      setTimeout(() => {
        setUpdating(false)
        setUpdateStatus(null)
      }, 3000)
    }
  }

  return (
    <div className="modal-overlay" onClick={updating ? undefined : onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: 440, padding: '24px 28px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3>What's New in {version}</h3>
        <ul style={{ margin: '12px 0 20px', paddingLeft: 20, lineHeight: 1.7 }}>
          {changes.map((item, i) => (
            <li key={i} style={{ marginBottom: 4, color: 'var(--text-secondary)' }}>
              {item}
            </li>
          ))}
        </ul>

        {/* Update progress bar */}
        {updating && updateStatus && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>
              {updateStatus}
            </div>
            {progress > 0 && (
              <div style={{
                height: 4,
                borderRadius: 2,
                background: 'var(--bg-tertiary)',
                overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%',
                  width: `${progress}%`,
                  background: 'var(--accent)',
                  borderRadius: 2,
                  transition: 'width 0.3s ease',
                }} />
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            className="btn btn-primary"
            onClick={handleUpdate}
            disabled={updating}
          >
            {updating ? 'Updating...' : 'Update'}
          </button>
          <button
            className="btn"
            onClick={onClose}
            disabled={updating}
            style={{ background: 'var(--bg-tertiary)' }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
