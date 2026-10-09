// src/lib/search/storage.ts
// Where Search keeps its lists on this machine: recent searches, the
// sections' order, and the DJ pages opened lately. A private window or
// storage that throws reads as nothing stored and does not remember.
import { MAX_DJ_RECENT, rememberDj } from '../dj/recent'
import { MAX_RECENT_SEARCHES } from './recentSearches'
import { parseSectionPrefs, type SectionPref } from './sections'

const RECENT_SEARCHES_KEY = 'search_recent'
const SECTIONS_KEY = 'search_sections'
const DJ_RECENT_KEY = 'dj_recent'

/** A stored list of strings: non-empty strings only, at most `max`; empty when unreadable. */
export function parseStringList(stored: string | null, max: number): string[] {
  if (!stored) return []
  try {
    const parsed: unknown = JSON.parse(stored)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (item): item is string =>
          typeof item === 'string' && item.trim() !== '',
      )
      .slice(0, max)
  } catch {
    return []
  }
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Not remembering is a smaller problem than failing the action.
  }
}

export function loadRecentSearches(): string[] {
  return parseStringList(read(RECENT_SEARCHES_KEY), MAX_RECENT_SEARCHES)
}

export function saveRecentSearches(list: string[]) {
  write(RECENT_SEARCHES_KEY, list)
}

export function loadSectionPrefs(): SectionPref[] {
  return parseSectionPrefs(read(SECTIONS_KEY))
}

export function saveSectionPrefs(prefs: SectionPref[]) {
  write(SECTIONS_KEY, prefs)
}

export function loadDjRecent(): string[] {
  return parseStringList(read(DJ_RECENT_KEY), MAX_DJ_RECENT)
}

/** A DJ page opened: that DJ goes first in Search's Your DJs. */
export function noteDjOpened(name: string) {
  write(DJ_RECENT_KEY, rememberDj(loadDjRecent(), name))
}
