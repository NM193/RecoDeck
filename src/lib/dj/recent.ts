// src/lib/dj/recent.ts
// The DJ pages opened most recently (Search spec, Your DJs): name keys,
// newest first, which put those DJs first in Your DJs. Pure; the list is
// kept in localStorage['dj_recent'] by lib/search/storage.ts.
import { djKey } from './names'

export const MAX_DJ_RECENT = 20

/** `list` with the DJ's key in front, once, at most 20. */
export function rememberDj(list: string[], name: string): string[] {
  const key = djKey(name)
  if (!key) return list
  return [key, ...list.filter((item) => item !== key)].slice(0, MAX_DJ_RECENT)
}

/** The DJs opened most recently first, the rest after them in the order given. */
export function orderYourDjs<T extends { nameKey: string }>(
  djs: T[],
  recent: string[],
): T[] {
  const rank = new Map(recent.map((key, index) => [key, index]))
  const last = recent.length
  return [...djs].sort(
    (a, b) => (rank.get(a.nameKey) ?? last) - (rank.get(b.nameKey) ?? last),
  )
}
