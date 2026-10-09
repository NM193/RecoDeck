// src/components/track-table/useLibraryFolders.ts
// The library's folders for Move to folder ▸, read each time the right-click
// menu opens (folders come and go on disk); the last list shows meanwhile.
import { useEffect, useState } from 'react'
import { tauriApi } from '../../lib/tauri-api'
import type { LibraryFolder } from '../../types/track'

export function useLibraryFolders(open: boolean): LibraryFolder[] | null {
  const [folders, setFolders] = useState<LibraryFolder[] | null>(null)

  useEffect(() => {
    if (!open) return
    let live = true
    tauriApi
      .listLibraryFolders()
      .then((list) => live && setFolders(list))
      .catch(() => live && setFolders([]))
    return () => {
      live = false
    }
  }, [open])

  return folders
}
