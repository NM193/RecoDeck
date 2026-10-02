/**
 * Everything that comes out of the comment section rather than a written list.
 *
 * The single most valuable discovery of the original tool lives here: an answer
 * to "39:30 anyone id?" is usually just "Rockers Hi-Fi - Transmission Central",
 * with no timestamp of its own. The time is in the question above it. Since
 * YouTube returns replies directly after their parent comment, a reply can
 * inherit the cue of the question it hangs under — without that, those tracks
 * are invisible.
 */

import type {
  LooseName,
  SetComment,
  SetVideo,
  Suggestion,
  Track,
} from './types'
import {
  ANY_CUE,
  ARTIST_TITLE,
  CHATTER,
  cueLines,
  HANDLE_PREFIX,
  ID_MARKER,
  ID_QUESTION,
  msToCue,
  normalise,
  parseCue,
  sameTitle,
  splitArtistTitle,
} from './text'

interface CueMention {
  cueMs: number
  text: string
  full: string
  author: string
  likeCount: number
  fromReply?: boolean
}

/** Every "<timestamp> <something>" pair mentioned anywhere in the comments. */
export function collectCueMentions(comments: SetComment[]): CueMention[] {
  const CUE_THEN_TEXT =
    /((?:\d{1,3}:)?\d{1,2}:\d{2})\s*(?:[-–—:|>=]|is|je)?\s*(.*?)(?=(?:\d{1,3}:)?\d{1,2}:\d{2}|$)/g
  const mentions: CueMention[] = []
  let parentCues: number[] = []

  for (const comment of comments) {
    const own: CueMention[] = []
    for (const line of cueLines(comment.text)) {
      CUE_THEN_TEXT.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = CUE_THEN_TEXT.exec(line))) {
        own.push({
          cueMs: parseCue(match[1]),
          text: match[2].trim(),
          full: comment.text,
          author: comment.author,
          likeCount: comment.likeCount,
        })
      }
    }

    if (own.length) {
      mentions.push(...own)
      if (!comment.replyTo) parentCues = own.map((m) => m.cueMs)
      continue
    }

    if (!comment.replyTo) {
      parentCues = []
      continue
    }

    // A reply with no timestamp inherits the one from the question it answers,
    // provided it actually looks like a track name. Only from a question about
    // one place, though: under "40:30 ID / 1:39:00 ID / 2:19:00 ID", or under a
    // whole tracklist, nothing says which of them the reply is answering, and
    // it used to be offered at every one.
    const body = comment.text.replace(HANDLE_PREFIX, '').trim()
    if (parentCues.length !== 1 || CHATTER.test(body) || !ARTIST_TITLE.test(body))
      continue

    for (const cueMs of parentCues) {
      mentions.push({
        cueMs,
        text: body,
        full: body,
        author: comment.author,
        likeCount: comment.likeCount,
        fromReply: true,
      })
    }
  }

  return mentions
}

/**
 * When a set has no whole tracklist anywhere, this assembles what there is:
 * individually named tracks, slots where somebody asked and nobody answered,
 * and names mentioned without any timestamp at all.
 */
export function assembleFromComments(
  video: SetVideo,
  comments: SetComment[],
): { tracks: Track[]; loose: LooseName[] } {
  const mentions = collectCueMentions(comments)
  const named: Array<CueMention & ReturnType<typeof splitArtistTitle>> = []
  const asked: Array<{ cueMs: number }> = []

  for (const mention of mentions) {
    if (video.durationMs > 0 && mention.cueMs > video.durationMs * 1.05)
      continue

    const parsed = splitArtistTitle(mention.text)
    // The question is often asked before the timestamp ("anyone know the one at
    // 8:00?"), so the whole comment is judged, not only the tail after the cue.
    const context = mention.full ?? mention.text
    const isQuestion = ID_QUESTION.test(context) || ID_MARKER.test(context)

    if (!parsed.artist && isQuestion) {
      asked.push({ cueMs: mention.cueMs })
      continue
    }
    if (parsed.isUnknown || !parsed.title || parsed.title.length < 4) continue
    if (!parsed.artist && CHATTER.test(context)) continue

    named.push({ ...parsed, ...mention })
  }

  // Same place, same name -> one track carrying several votes.
  interface Slot extends CueMention {
    artist: string | null
    title: string
    mix: string | null
    label: string | null
    note: string | null
    uncertain: boolean
    key: string | null
    votes: number
  }
  const slots: Slot[] = []
  for (const item of named) {
    const key = normalise(
      [item.artist, item.title, item.mix].filter(Boolean).join(' '),
    )
    let slot = slots.find(
      (s) => Math.abs(s.cueMs - item.cueMs) <= 20_000 && sameTitle(s.key, key),
    )
    if (!slot) {
      slot = { ...item, key, votes: 0, likeCount: 0 }
      slots.push(slot)
    }
    slot.votes += 1
    slot.likeCount = Math.max(slot.likeCount, item.likeCount ?? 0)
  }

  // A question about a slot that has since been named is not shown as open.
  const open: Array<{ cueMs: number; asks: number }> = []
  for (const question of asked) {
    if (slots.some((s) => Math.abs(s.cueMs - question.cueMs) <= 30_000))
      continue
    const near = open.find((o) => Math.abs(o.cueMs - question.cueMs) <= 30_000)
    if (near) near.asks += 1
    else open.push({ cueMs: question.cueMs, asks: 1 })
  }

  const tracks: Track[] = [
    ...slots.map<Track>((s) => ({
      index: 0,
      cue: msToCue(s.cueMs),
      cueMs: s.cueMs,
      artist: s.artist,
      title: s.title,
      mix: s.mix,
      label: s.label,
      note: s.note,
      uncertain: s.uncertain,
      isUnknown: false,
      artistNorm: normalise(s.artist),
      titleNorm: normalise(s.title),
      votes: s.votes,
      listed: s.votes,
      sourceCount: 0,
      disagree: [],
      fromComments: true,
      author: s.author,
      likeCount: s.likeCount,
    })),
    ...open.map<Track>((o) => ({
      index: 0,
      cue: msToCue(o.cueMs),
      cueMs: o.cueMs,
      artist: null,
      title: 'ID',
      mix: null,
      label: null,
      note: null,
      uncertain: false,
      isUnknown: true,
      artistNorm: null,
      titleNorm: null,
      votes: 0,
      listed: 0,
      sourceCount: 0,
      disagree: [],
      fromComments: true,
      asks: o.asks,
    })),
  ]
    .sort((a, b) => a.cueMs - b.cueMs)
    .map((track, i) => ({ ...track, index: i + 1 }))

  // Names with no timestamp at all — we do not know where they are, only that
  // they are somewhere in the set.
  const loose: LooseName[] = []
  for (const comment of comments) {
    if (ANY_CUE.test(comment.text)) continue
    const body = comment.text.replace(HANDLE_PREFIX, '').trim()
    if (CHATTER.test(body) || !ARTIST_TITLE.test(body) || body.length > 90)
      continue
    if (ID_QUESTION.test(body) || ID_MARKER.test(body)) continue

    const parsed = splitArtistTitle(body)
    if (parsed.isUnknown || !parsed.artist || parsed.title.length < 4) continue

    const key = normalise([parsed.artist, parsed.title].join(' '))
    if (
      loose.some((l) => l.key === key) ||
      tracks.some((t) => sameTitle(t.titleNorm, normalise(parsed.title)))
    )
      continue
    loose.push({
      key,
      artist: parsed.artist,
      title: parsed.title,
      mix: parsed.mix,
      author: comment.author,
      likeCount: comment.likeCount,
    })
  }

  return { tracks, loose: loose.slice(0, 12) }
}

/**
 * An "artist" this long is a sentence, not a credit. Measured on the reference
 * sets: the longest real credit is ten words ("Mousse T & Hot 'N' Juicy feat.
 * Inaya Day"), while sentences split at a dash run from fifteen up.
 */
const PROSE_ARTIST_WORDS = 12

function wordCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length
}

/** Best guesses for one unknown slot, strongest first. */
function suggestIds(
  track: Track,
  mentions: CueMention[],
  known: Array<{
    key: string | null
    titleKey: string | null
    cueMs: number
  }> = [],
  toleranceMs = 60_000,
): Suggestion[] {
  const byName = new Map<string, Omit<Suggestion, 'score'>>()

  for (const mention of mentions) {
    const delta = Math.abs(mention.cueMs - track.cueMs)
    if (delta > toleranceMs) continue

    const parsed = splitArtistTitle(mention.text)
    if (parsed.isUnknown) continue
    if (!parsed.title || parsed.title.length < 4) continue
    // An answer is written "Artist - Title". Without the artist, what follows a
    // timestamp is whatever the commenter said about it — "the build up at
    // 1:56:00 is amazing", "2:29:00 track?" — and was offered as the name.
    if (!parsed.artist) continue
    // A sentence that happens to contain a dash splits as if it were a credit.
    if (wordCount(parsed.artist) >= PROSE_ARTIST_WORDS) continue

    const key = normalise(
      [parsed.artist, parsed.title].filter(Boolean).join(' '),
    )
    if (!key || key.length < 4) continue
    // A comment about the neighbouring track drifts into this slot's window.
    // If the name is already on the tracklist nearby, it is not this ID.
    const titleKey = normalise(parsed.title)
    if (
      known.some(
        (k) =>
          (k.key === key || (titleKey && k.titleKey === titleKey)) &&
          Math.abs(k.cueMs - track.cueMs) < 180_000,
      )
    )
      continue

    const entry = byName.get(key) ?? {
      artist: parsed.artist,
      title: parsed.title,
      label: parsed.label,
      author: mention.author,
      votes: 0,
      likeCount: 0,
      exact: false,
    }
    entry.votes += 1
    entry.exact ||= delta <= 5_000
    if (mention.likeCount > entry.likeCount) {
      entry.likeCount = mention.likeCount
      entry.author = mention.author
    }
    byName.set(key, entry)
  }

  return (
    [...byName.values()]
      .map((s) => ({
        ...s,
        // Agreement between commenters counts most; likes break ties.
        score: Number(
          (
            (s.artist ? 2 : 1) *
            (s.exact ? 1.5 : 1) *
            (s.votes + Math.log10(1 + s.likeCount))
          ).toFixed(2),
        ),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 2)
  )
}

/** Fills every unknown slot in place with whatever the comments know. */
export function resolveUnknowns(
  tracks: Track[],
  comments: SetComment[],
): Track[] {
  const unknowns = tracks.filter((t) => t.isUnknown)
  if (unknowns.length === 0) return tracks

  const mentions = collectCueMentions(comments)
  const known = tracks
    .filter((t) => !t.isUnknown)
    .map((t) => ({
      key: normalise([t.artist, t.title].filter(Boolean).join(' ')),
      titleKey: t.titleNorm,
      cueMs: t.cueMs,
    }))

  for (const track of unknowns)
    track.suggestions = suggestIds(track, mentions, known)
  return tracks
}
