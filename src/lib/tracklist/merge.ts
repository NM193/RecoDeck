/**
 * Consensus.
 *
 * A popular set has the same tracklist typed out by five or six different
 * people, plus the uploader's own in the description. Picking one and throwing
 * the rest away wastes the most valuable signal there is: agreement. What one
 * list marks as "ID" another one names, and a name five people repeat is a
 * fact, while a name only one person wrote is a guess.
 */

import { extractTracklist } from './extract'
import type {
  Candidate,
  Disagreement,
  SetComment,
  SetVideo,
  Track,
} from './types'
import { median, msToCue, sameArtist, sameTitle, tokenSet } from './text'

/** Every block of text that parses as a tracklist, strongest first. */
export function collectCandidates(
  video: SetVideo,
  comments: SetComment[],
): Candidate[] {
  const candidates: Candidate[] = []

  const fromDescription = extractTracklist(video.description, video.durationMs)
  if (fromDescription.tracks.length) {
    candidates.push({
      source: 'description',
      sourceMeta: null,
      weight: 1.2,
      ...fromDescription,
    })
  }

  for (const comment of comments) {
    const result = extractTracklist(comment.text, video.durationMs)
    if (!result.tracks.length) continue
    candidates.push({
      source: 'comment',
      sourceMeta: { author: comment.author, likeCount: comment.likeCount },
      weight: 1,
      ...result,
      // A tracklist in the description is authored by the uploader, so it is
      // trusted slightly more than a random comment at equal confidence.
      confidence: Number((result.confidence * 0.95).toFixed(3)),
    })
  }

  return candidates.sort(
    (a, b) => b.confidence - a.confidence || b.tracks.length - a.tracks.length,
  )
}

interface Variant {
  artist: string | null
  artistNorm: string | null
  title: string
  titleNorm: string | null
  mix: string | null
  label: string | null
  note: string | null
  uncertain: boolean
  votes: number
  weight: number
  likeCount: number
}

/**
 * Folds every candidate list into one, grouping entries that describe the same
 * slot. Two entries are the same slot when their cues nearly coincide, or when
 * they carry the same title and sit within a few minutes of each other —
 * independently typed lists drift, copies of the same list do not.
 */
export function mergeCandidates(
  candidates: Candidate[],
  {
    cueWindow = 20_000,
    nameWindow = 150_000,
  }: { cueWindow?: number; nameWindow?: number } = {},
): { tracks: Track[]; sourceCount: number } {
  interface Cluster {
    cueMs: number
    cues: number[]
    titles: Set<string>
    entries: Array<{
      track: Candidate['tracks'][number]
      weight: number
      sourceMeta: Candidate['sourceMeta']
    }>
  }
  const clusters: Cluster[] = []

  for (const candidate of candidates) {
    for (const track of candidate.tracks) {
      let cluster = clusters.find(
        (c) =>
          Math.abs(c.cueMs - track.cueMs) <= cueWindow ||
          (!!track.titleNorm &&
            [...c.titles].some((t) => sameTitle(t, track.titleNorm)) &&
            Math.abs(c.cueMs - track.cueMs) <= nameWindow),
      )

      if (!cluster) {
        cluster = {
          cueMs: track.cueMs,
          cues: [],
          titles: new Set<string>(),
          entries: [],
        }
        clusters.push(cluster)
      }

      cluster.entries.push({
        track,
        weight: candidate.weight,
        sourceMeta: candidate.sourceMeta,
      })
      cluster.cues.push(track.cueMs)
      cluster.cueMs = median(cluster.cues)
      if (track.titleNorm) cluster.titles.add(track.titleNorm)
    }
  }

  clusters.sort((a, b) => a.cueMs - b.cueMs)
  const sourceCount = candidates.length

  const tracks = clusters.map<Track>((cluster, i) => {
    const variants: Variant[] = []

    for (const entry of cluster.entries) {
      const t = entry.track
      if (t.isUnknown) continue

      let variant = variants.find(
        (v) =>
          sameTitle(v.titleNorm, t.titleNorm) &&
          sameArtist(v.artistNorm, t.artistNorm),
      )

      if (!variant) {
        variant = {
          artist: t.artist,
          artistNorm: t.artistNorm,
          title: t.title,
          titleNorm: t.titleNorm,
          mix: t.mix,
          label: t.label,
          note: t.note,
          uncertain: t.uncertain,
          votes: 0,
          weight: 0,
          likeCount: 0,
        }
        variants.push(variant)
      }

      variant.votes += 1
      variant.weight += entry.weight
      variant.likeCount = Math.max(
        variant.likeCount,
        entry.sourceMeta?.likeCount ?? 0,
      )
      // Keep the fullest credit: "Crusy, Karretero" beats a bare "Crusy".
      if (tokenSet(t.artistNorm).size > tokenSet(variant.artistNorm).size) {
        variant.artist = t.artist
        variant.artistNorm = t.artistNorm
      }
      variant.mix ??= t.mix
      variant.label ??= t.label
      variant.note ??= t.note
      // One confident source is enough to drop the question mark.
      variant.uncertain &&= t.uncertain
    }

    variants.sort((a, b) => b.weight - a.weight || b.likeCount - a.likeCount)
    const winner = variants[0] ?? null

    const disagree: Disagreement[] = variants.slice(1, 3).map((v) => ({
      artist: v.artist,
      title: v.title,
      mix: v.mix,
      votes: v.votes,
    }))

    return {
      index: i + 1,
      cue: msToCue(cluster.cueMs),
      cueMs: cluster.cueMs,
      artist: winner?.artist ?? null,
      title: winner?.title ?? 'ID',
      mix: winner?.mix ?? null,
      label: winner?.label ?? null,
      note: winner?.note ?? null,
      uncertain: winner?.uncertain ?? false,
      isUnknown: !winner,
      artistNorm: winner?.artistNorm ?? null,
      titleNorm: winner?.titleNorm ?? null,
      votes: winner?.votes ?? 0,
      listed: cluster.entries.length,
      sourceCount,
      disagree,
    }
  })

  return { tracks, sourceCount }
}
