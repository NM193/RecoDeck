// src/components/settings/openSections.ts
/**
 * Which Settings sections are left open, remembered per person in
 * localStorage (see CollapsibleSection). Also how another view opens Settings
 * on one section: mark it open, then show Settings.
 */
const STORAGE_KEY = 'settingsOpenSections'

export function readOpen(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return []
    const parsed: unknown = JSON.parse(stored)
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === 'string')
      : []
  } catch {
    // A private window, cleared site data, or storage that throws on read.
    return []
  }
}

export function writeOpen(ids: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
  } catch {
    // Not remembering is a smaller problem than failing to open a section.
  }
}

/** Settings opens with this section expanded (e.g. 'spotify' for "Connect Spotify"). */
export function openSettingsSection(id: string) {
  const ids = readOpen()
  if (!ids.includes(id)) writeOpen([...ids, id])
}
