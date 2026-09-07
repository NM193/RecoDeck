/**
 * The tracklist parser, ported from the standalone yt-tracklist tool.
 *
 * The port is deliberately literal: the measured tuning (a ±20s cue window, a
 * 150s name window, containment thresholds of 0.8 for titles and 0.6 for
 * artists, and the 0.5 floor under artistShape) came out of real sets, and its
 * fixtures are kept here as the regression suite.
 */

import { assembleFromComments, resolveUnknowns } from './comments'
import { collectCandidates, mergeCandidates } from './merge'
import type { SetComment, SetVideo, TracklistResult } from './types'

export * from './types'
export { extractTracklist } from './extract'
export { collectCandidates, mergeCandidates } from './merge'
export { assembleFromComments, collectCueMentions, resolveUnknowns } from './comments'
export { msToCue, parseCue, normalise, splitArtistTitle, containment } from './text'

/** Parses one already-fetched set. Works the same on a live fetch or a fixture. */
export function analyse(
  video: SetVideo,
  comments: SetComment[],
  minConfidence = 0.35,
): TracklistResult {
  const candidates = collectCandidates(video, comments)
  const best = candidates[0] ?? null
  const merged = best ? mergeCandidates(candidates) : null
  if (merged) resolveUnknowns(merged.tracks, comments)

  // No whole list anywhere — assemble one from what is scattered in the comments.
  const assembled = merged?.tracks.length ? null : assembleFromComments(video, comments)
  const tracks = merged?.tracks.length ? merged.tracks : (assembled?.tracks ?? [])

  return {
    video: {
      id: video.id,
      url: video.url,
      title: video.title,
      channel: video.channel,
      publishedAt: video.publishedAt,
      durationMs: video.durationMs,
    },
    status:
      tracks.length === 0
        ? 'no_tracklist'
        : assembled
          ? 'assembled'
          : best!.confidence < minConfidence
            ? 'low_confidence'
            : 'ok',
    source: best?.source ?? null,
    sourceMeta: best?.sourceMeta ?? null,
    confidence: best?.confidence ?? 0,
    sourceCount: merged?.sourceCount ?? 0,
    trackCount: tracks.length,
    tracks,
    loose: assembled?.loose ?? [],
  }
}
