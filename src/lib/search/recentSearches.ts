// src/lib/search/recentSearches.ts
// Search's Recent searches (Search spec): the last 10 queries the user acted
// on, newest first, kept on this machine only. Pure; storage.ts stores them.

export const MAX_RECENT_SEARCHES = 10

/**
 * `list` with `query` in front: trimmed, a repeat in any case moved rather
 * than added, at most 10. An empty query changes nothing.
 */
export function rememberSearch(list: string[], query: string): string[] {
  const q = query.trim()
  if (!q) return list
  const lower = q.toLowerCase()
  return [q, ...list.filter((item) => item.toLowerCase() !== lower)].slice(
    0,
    MAX_RECENT_SEARCHES,
  )
}

/** `list` without `query`, compared in any case. */
export function forgetSearch(list: string[], query: string): string[] {
  const lower = query.toLowerCase()
  return list.filter((item) => item.toLowerCase() !== lower)
}
