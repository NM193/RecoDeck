// src/lib/search/sections.ts
// Which sections the Search page shows before you type, and in what order
// (Search spec, Customize). Stored as an ordered list of { id, on }. Pure;
// storage.ts stores it.

export type SearchSectionId =
  | 'recent-searches'
  | 'recently-played'
  | 'your-djs'
  | 'genres'
  | 'recently-added'
  | 'saved-sets'

export interface SectionPref {
  id: SearchSectionId
  on: boolean
}

/** Every section in its default order, with its default. */
export const SEARCH_SECTIONS: ReadonlyArray<{
  id: SearchSectionId
  label: string
  on: boolean
}> = [
  { id: 'recent-searches', label: 'Recent searches', on: true },
  { id: 'recently-played', label: 'Recently played', on: true },
  { id: 'your-djs', label: 'Your DJs', on: true },
  { id: 'genres', label: 'Your library by genre', on: true },
  { id: 'recently-added', label: 'Recently added', on: false },
  { id: 'saved-sets', label: 'Sets you saved lately', on: false },
]

export const DEFAULT_SECTION_PREFS: SectionPref[] = SEARCH_SECTIONS.map(
  ({ id, on }) => ({
    id,
    on,
  }),
)

export function sectionLabel(id: SearchSectionId): string {
  return SEARCH_SECTIONS.find((section) => section.id === id)?.label ?? id
}

/**
 * The stored order: unknown ids and repeats dropped, and a section it does
 * not name (one added in a later version) appended, off. Nothing stored, or
 * nothing readable, is the default.
 */
export function parseSectionPrefs(stored: string | null): SectionPref[] {
  if (!stored) return DEFAULT_SECTION_PREFS
  let parsed: unknown
  try {
    parsed = JSON.parse(stored)
  } catch {
    return DEFAULT_SECTION_PREFS
  }
  if (!Array.isArray(parsed)) return DEFAULT_SECTION_PREFS
  const known = new Set<string>(SEARCH_SECTIONS.map((section) => section.id))
  const prefs: SectionPref[] = []
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) continue
    const { id, on } = item as { id?: unknown; on?: unknown }
    if (typeof id !== 'string' || !known.has(id)) continue
    if (prefs.some((pref) => pref.id === id)) continue
    prefs.push({ id: id as SearchSectionId, on: on === true })
  }
  for (const section of SEARCH_SECTIONS) {
    if (!prefs.some((pref) => pref.id === section.id)) {
      prefs.push({ id: section.id, on: false })
    }
  }
  return prefs
}

/** `prefs` with the section at `index` moved one place up (-1) or down (+1). */
export function moveSection(
  prefs: SectionPref[],
  index: number,
  by: -1 | 1,
): SectionPref[] {
  const target = index + by
  if (
    index < 0 ||
    index >= prefs.length ||
    target < 0 ||
    target >= prefs.length
  ) {
    return prefs
  }
  const next = [...prefs]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

/** `prefs` with one section switched on or off. */
export function setSectionOn(
  prefs: SectionPref[],
  id: SearchSectionId,
  on: boolean,
): SectionPref[] {
  return prefs.map((pref) => (pref.id === id ? { ...pref, on } : pref))
}
