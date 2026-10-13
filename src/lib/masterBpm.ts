/**
 * Master BPM: one global tempo every track is played at, so a track can be heard
 * at the tempo of the set being planned. This is the pure maths; `store/masterBpmStore.ts`
 * keeps the setting and `components/layout/MasterBpmControl.tsx` applies it to the player.
 */

export const MASTER_BPM_MIN = 60
export const MASTER_BPM_MAX = 200
export const MASTER_BPM_DEFAULT = 122

/**
 * The most a track is sped up or slowed down (a CDJ's default pitch range).
 * A track further from the master goes as far as this and no further.
 */
export const MAX_STRETCH = 0.08

export type MasterRateKind =
  /** Played at `rate` so its tempo matches the master. */
  | 'matched'
  /** Master BPM is off. */
  | 'off'
  /** The track has no BPM, so it plays as it is. */
  | 'no-bpm'
  /** Too far from the master: stretched by MAX_STRETCH, as close as it gets. */
  | 'limited'

export interface MasterRate {
  kind: MasterRateKind
  /** `playbackRate` to use (1 unless matched). */
  rate: number
  /** The BPM the track is heard at: the master when matched, else its own (or null). */
  heardBpm: number | null
  /** Speed change in percent, e.g. -1.6. */
  percent: number
  /** The track's BPM as matched: its own, or doubled/halved when that is closer. */
  reading: number | null
}

/** Clamp a typed or stepped master BPM into range, to one decimal. */
export function clampMasterBpm(bpm: number): number {
  if (!Number.isFinite(bpm)) return MASTER_BPM_DEFAULT
  return Math.round(Math.min(MASTER_BPM_MAX, Math.max(MASTER_BPM_MIN, bpm)) * 10) / 10
}

/**
 * The playback rate that puts a track at the master tempo.
 *
 * Half and double time count as the same tempo (a 70 BPM track and a 140 BPM one
 * both fit a master of 128), so the reading closest to the master is used.
 */
export function masterRate(
  masterBpm: number | null,
  trackBpm: number | null | undefined,
): MasterRate {
  const valid = !!trackBpm && Number.isFinite(trackBpm) && trackBpm > 0
  if (masterBpm == null) {
    return { kind: 'off', rate: 1, heardBpm: trackBpm ?? null, percent: 0, reading: valid ? trackBpm! : null }
  }
  if (!valid) {
    return { kind: 'no-bpm', rate: 1, heardBpm: null, percent: 0, reading: null }
  }

  let reading = trackBpm!
  for (const candidate of [trackBpm! * 2, trackBpm! / 2]) {
    if (Math.abs(masterBpm / candidate - 1) < Math.abs(masterBpm / reading - 1)) reading = candidate
  }

  const wanted = masterBpm / reading
  const rate = Math.min(1 + MAX_STRETCH, Math.max(1 - MAX_STRETCH, wanted))
  return {
    kind: rate === wanted ? 'matched' : 'limited',
    rate,
    heardBpm: Math.round(reading * rate * 10) / 10,
    percent: Math.round((rate - 1) * 1000) / 10,
    reading,
  }
}

/**
 * The master BPMs a track can reach: its BPM (as matched) plus or minus MAX_STRETCH,
 * in whole BPM. Without a track BPM, the full master range.
 */
export function masterRange(reading: number | null): { min: number; max: number } {
  if (!reading) return { min: MASTER_BPM_MIN, max: MASTER_BPM_MAX }
  return {
    min: Math.max(MASTER_BPM_MIN, Math.ceil(reading * (1 - MAX_STRETCH))),
    max: Math.min(MASTER_BPM_MAX, Math.floor(reading * (1 + MAX_STRETCH))),
  }
}
