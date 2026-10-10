// Export to DJ software (spec: docs/superpowers/specs/2026-10-09-dj-export-design.md):
// the playlist tree with boxes, where the file goes, how to load it, and the
// export. Phase 1 writes Rekordbox XML; the program tabs come with Traktor.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { revealItemInDir } from '@tauri-apps/plugin-opener'
import { tauriApi } from '../lib/tauri-api'
import { useOverlay } from '../lib/overlays'
import { toast } from '../lib/toast'
import { getErrorMessage } from '../types/ai'
import type { DjExportDefaults } from '../types/djExport'
import {
  buildTree,
  checkState,
  initialSelection,
  playlistIdsUnder,
  resultToast,
  selectedInOrder,
  toggle,
  type CheckState,
  type ExportTreeNode,
} from '../lib/djExport/selection'
import { Button } from './Button'
import { Icon } from './Icon'
import './DjExportModal.css'

const PROGRAM = 'Rekordbox'
const REVEAL_LABEL = navigator.userAgent.includes('Windows') ? 'Show in Explorer' : 'Show in Finder'

interface DjExportModalProps {
  /** The playlist or folder whose menu opened it; null from elsewhere. */
  openedFrom: number | null
  onClose: () => void
}

export function DjExportModal({ openedFrom, onClose }: DjExportModalProps) {
  const [tree, setTree] = useState<ExportTreeNode[] | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [path, setPath] = useState('')
  const [defaults, setDefaults] = useState<DjExportDefaults | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  // Esc closes it, as the backdrop and Cancel do — not while it writes.
  useOverlay(true, () => {
    if (!running) onClose()
  })

  // Menus hand focus back to whatever opened them, expecting a dialog to take it.
  useEffect(() => {
    dialogRef.current?.focus()
  }, [])

  useEffect(() => {
    let live = true
    Promise.all([tauriApi.getAllPlaylists(), tauriApi.djExportDefaults('rekordbox')])
      .then(([playlists, defaults]) => {
        if (!live) return
        const built = buildTree(playlists)
        setTree(built)
        setSelected(initialSelection(built, defaults.playlist_ids, openedFrom))
        setPath(defaults.path)
        setDefaults(defaults)
      })
      .catch((err) => {
        if (live) setLoadError(getErrorMessage(err))
      })
    return () => {
      live = false
    }
  }, [openedFrom])

  async function changePath() {
    setError(null)
    try {
      const picked = await tauriApi.pickDjExportFile('rekordbox', path)
      if (picked) setPath(picked)
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  async function handleExport() {
    if (!tree) return
    setError(null)
    setRunning(true)
    try {
      const result = await tauriApi.exportToDj('rekordbox', selectedInOrder(tree, selected), path)
      const { message, kind, detail } = resultToast(result, PROGRAM)
      const written = result.written[0]
      toast(message, {
        kind,
        detail,
        action: written ? { label: REVEAL_LABEL, run: () => void revealItemInDir(written).catch((e) => toast(getErrorMessage(e), { kind: 'error' })) } : undefined,
      })
      onClose()
    } catch (err) {
      setRunning(false)
      setError(getErrorMessage(err))
    }
  }

  const count = tree ? selectedInOrder(tree, selected).length : 0

  return (
    <div className="modal-overlay" onClick={() => !running && onClose()}>
      <div
        className="modal-content dj-export"
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        ref={dialogRef}
        aria-labelledby="dj-export-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="dj-export-title">Export to {PROGRAM}</h3>

        <div className="dj-export__label">Playlists</div>
        <div className="dj-export__tree">
          {loadError ? (
            <p className="dj-export__note dj-export__note--error">{loadError}</p>
          ) : tree === null ? (
            <p className="dj-export__note">Loading…</p>
          ) : tree.length === 0 ? (
            <p className="dj-export__note">No playlists yet.</p>
          ) : (
            <TreeRows
              nodes={tree}
              depth={0}
              selected={selected}
              disabled={running}
              onToggle={(node) => setSelected((current) => toggle(node, current))}
            />
          )}
        </div>

        <div className="dj-export__label">Where</div>
        <div className="dj-export__where">
          <PathText path={path} />
          <button
            type="button"
            className="btn"
            onClick={() => void changePath()}
            disabled={running || tree === null}
          >
            Change…
          </button>
        </div>

        {defaults && <HowTo full={!defaults.remembered || path !== defaults.path} />}

        {error && (
          <p className="dj-export__error" role="alert">
            {error}
          </p>
        )}

        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose} disabled={running}>
            Cancel
          </button>
          <Button
            variant="primary"
            onClick={() => void handleExport()}
            working={running}
            workingLabel="Exporting…"
            disabled={count === 0 || !path}
          >
            {count > 0 ? `Export ${count} ${count === 1 ? 'playlist' : 'playlists'}` : 'Export'}
          </Button>
        </div>
      </div>
    </div>
  )
}

interface TreeRowsProps {
  nodes: ExportTreeNode[]
  depth: number
  selected: Set<number>
  disabled: boolean
  onToggle: (node: ExportTreeNode) => void
}

function TreeRows({ nodes, depth, selected, disabled, onToggle }: TreeRowsProps) {
  return (
    <>
      {nodes.map((node) => {
        const empty = node.isFolder && playlistIdsUnder(node).length === 0
        return (
          <div key={node.id}>
            <label className="dj-export__row" style={{ paddingLeft: 10 + depth * 18 }}>
              <Check
                state={checkState(node, selected)}
                disabled={disabled || empty}
                label={node.name}
                onChange={() => onToggle(node)}
              />
              <Icon name={node.isFolder ? 'Folder' : 'ListMusic'} size={14} />
              <span className="dj-export__name">{node.name}</span>
            </label>
            {node.isFolder && (
              <TreeRows
                nodes={node.children}
                depth={depth + 1}
                selected={selected}
                disabled={disabled}
                onToggle={onToggle}
              />
            )}
          </div>
        )
      })}
    </>
  )
}

/** A native box; "mixed" is its indeterminate state, which only a ref can set. */
function Check({
  state,
  disabled,
  label,
  onChange,
}: {
  state: CheckState
  disabled: boolean
  label: string
  onChange: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useLayoutEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'mixed'
  }, [state])
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={state === 'checked'}
      disabled={disabled}
      aria-label={label}
      onChange={onChange}
    />
  )
}

/** The file's path; when it is long the folder part gives way and the file name stays in view. */
function PathText({ path }: { path: string }) {
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1
  return (
    <span className="dj-export__path" title={path}>
      <span className="dj-export__path-folder">{path.slice(0, cut)}</span>
      <span className="dj-export__path-file">{path.slice(cut)}</span>
    </span>
  )
}

/** How to load the file in Rekordbox: every step until the first export or when the file goes somewhere new, then the one that repeats. */
// Checked in Rekordbox 7.2.19: importing again adds new tracks and duplicates nothing, but
// tracks already in its collection keep Rekordbox's own data.
const KEEPS_ITS_OWN = 'Tracks Rekordbox already has keep its own BPM, key and rating; new tracks take RecoDeck’s.'

function HowTo({ full }: { full: boolean }) {
  if (!full) {
    return (
      <p className="dj-export__howto">
        In Rekordbox, refresh “rekordbox xml” and import the playlists again. {KEEPS_ITS_OWN}
      </p>
    )
  }
  return (
    <>
      <ol className="dj-export__howto dj-export__howto--steps">
        <li>In Rekordbox, Preferences → View → Layout: turn on “rekordbox xml”.</li>
        <li>Preferences → Advanced → Database → rekordbox xml → Imported Library: choose this file.</li>
        <li>Refresh “rekordbox xml” in the tree, then right-click a playlist → Import Playlist.</li>
      </ol>
      <p className="dj-export__howto dj-export__howto--note">{KEEPS_ITS_OWN}</p>
    </>
  )
}
