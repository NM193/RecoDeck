/**
 * Name and timestamp handling — the vocabulary the rest of the parser speaks.
 *
 * Every regex here was tuned against real sets in the standalone tool; the
 * comments explain what each one is defending against, because the shapes look
 * arbitrary until you have seen the comment that motivated them.
 */

import type { ParsedName } from './types'

/** "1:23:45" or "23:45" -> milliseconds */
export function parseCue(cue: string): number {
  const parts = cue.split(':').map(Number)
  const [h, m, s] = parts.length === 3 ? parts : [0, parts[0], parts[1]]
  return ((h * 60 + m) * 60 + s) * 1000
}

/** milliseconds -> "1:23:45" / "23:45" */
export function msToCue(ms: number): string {
  const total = Math.round(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const sec = total % 60
  return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(sec).padStart(2, '0')
}

// Matches: "1. 00:00 Artist - Title", "[04:12] Artist – Title", "12:34 — Artist - Title"
export const TRACK_LINE = /^\s*(?:\d{1,3}[.)]\s*)?[[(]?((?:\d{1,3}:)?\d{1,2}:\d{2})[\])]?\s*[-–—:|.]?\s*(.+?)\s*$/

// The closing half of a "start - end" range, sitting in front of the name.
const RANGE_END = /^[[(]?(?:\d{1,3}:)?\d{1,2}:\d{2}[\])]?\s*[-–—:|>]?\s*/

// Requires whitespace around the dash so hyphenated names ("Jean-Michel") survive.
export const ARTIST_TITLE = /^(.*?)\s+[-–—]\s+(.*)$/

// Labels are conventionally in square brackets; parentheses usually hold
// "(Original Mix)" style mix descriptors, which belong to the title.
const LABEL_SUFFIX = /\s*\[([^\][]{2,40})\]\s*$/

// "(Todd Terje Remix)", "(edit)" — the version, which is part of the identity.
const MIX_SUFFIX =
  /\s*[([]([^()[\]]*\b(?:remix|mix|edit|version|bootleg|dub|rework|vip|remaster)\b[^()[\]]*)[)\]]\s*$/i

// A commenter thinking out loud inside the name.
const NOTE_PAREN =
  /\s*\(([^()]*\b(?:i think|i don.?t think|dont think|maybe|not sure|probably|possibly|i\.e\.|unreleased)\b[^()]*)\)/i

// "(?)" or a trailing "?" — the commenter is unsure, that is metadata not a name.
const UNCERTAIN = /\s*[([]\s*\?+\s*[)\]]|\s*\?+\s*$/
export const UNKNOWN_TOKEN = /^(id|\?+|unknown|unreleased)$/i

// Commenters sign their contribution: "Artist - Title - thanks @someone".
const CREDIT_SUFFIX = /\s*[-–—]?\s*\b(thanks?|thx|credits?)\b\s*(to\s*)?(@[\w.-]+[\s,]*)*$/i
const HANDLE_SUFFIX = /(\s*@[\w.-]+)+\s*$/

// A person ASKING for the ID is not an answer. Filtered unless a name follows.
export const ID_QUESTION =
  /\b(anyone|anybody|somebody|someone|know|knows|what.{0,3}s this|track ?id|help|pls|please|thanks?|thx)\b/i

// A bare "ID" anywhere in the text means the slot is still open, not answered.
export const ID_MARKER = /(^|\W)id(\W|$)/i

// Pure noise that would otherwise pass for a track name.
export const CHATTER =
  /\b(thanks?|thank you|thx|nice|tune|banger|fire|goat|legend|please|pls|following|sick|love it|wow|same|lol)\b/i

export const ANY_CUE = /(?:\d{1,3}:)?\d{1,2}:\d{2}/

/** Drops the closing half of a "00:01 - 01:00 Artist - Title" range. */
export function stripRangeEnd(rest: string): string {
  return rest.replace(RANGE_END, '')
}

/** Breaks one written-out track into its parts. */
export function splitArtistTitle(rawText: string): ParsedName {
  let text = rawText.replace(/\s+/g, ' ').trim()
  text = text.replace(CREDIT_SUFFIX, '').replace(HANDLE_SUFFIX, '').trim()

  let label: string | null = null
  const labelMatch = LABEL_SUFFIX.exec(text)
  if (labelMatch) {
    label = labelMatch[1].trim()
    text = text.slice(0, labelMatch.index).trim()
  }

  let note: string | null = null
  const noteMatch = NOTE_PAREN.exec(text)
  if (noteMatch) {
    note = noteMatch[1].trim()
    text = (text.slice(0, noteMatch.index) + text.slice(noteMatch.index + noteMatch[0].length)).trim()
  }

  let uncertain = false
  if (UNCERTAIN.test(text)) {
    uncertain = true
    text = text.replace(UNCERTAIN, '').trim()
  }

  let mix: string | null = null
  const mixMatch = MIX_SUFFIX.exec(text)
  if (mixMatch) {
    mix = mixMatch[1].trim()
    text = text.slice(0, mixMatch.index).trim()
  }

  const match = ARTIST_TITLE.exec(text)
  const artist = match ? match[1].trim() : null
  const title = (match ? match[2].trim() : text).replace(/\s*[-–—]\s*$/, '').trim()

  const isUnknown =
    (artist ? UNKNOWN_TOKEN.test(artist) : false) || UNKNOWN_TOKEN.test(title) || title === ''

  return { artist, title, mix, label, note, uncertain, isUnknown }
}

/** Strips noise so the same track from two sources normalises to the same string. */
export function normalise(value: string | null | undefined): string | null {
  if (!value) return null
  return value
    .toLowerCase()
    .replace(/[[(](original|extended|radio|club|dub|vocal)?\s*(mix|edit|version|remaster)[\])]/g, '')
    .replace(/\bfeat\.?|\bft\.?/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/*
 * Two people typing the same track rarely type it identically: one writes the
 * full credit, another only the lead artist, a third appends a remark. Names
 * count as the same when one is contained in the other.
 */
export function tokenSet(norm: string | null | undefined): Set<string> {
  return new Set((norm ?? '').split(' ').filter(Boolean))
}

export function containment(a: string | null | undefined, b: string | null | undefined): number {
  const A = tokenSet(a)
  const B = tokenSet(b)
  if (!A.size || !B.size) return 0
  let hits = 0
  for (const token of A) if (B.has(token)) hits += 1
  return hits / Math.min(A.size, B.size)
}

export const sameTitle = (a: string | null | undefined, b: string | null | undefined): boolean =>
  containment(a, b) >= 0.8

/** Looser than titles: a missing artist must not split a slot in two. */
export const sameArtist = (a: string | null | undefined, b: string | null | undefined): boolean =>
  !a || !b || containment(a, b) >= 0.6

/** More robust than the mean when one source mistypes a timestamp. */
export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}
