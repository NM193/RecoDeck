import { create } from 'zustand'
import { usePlayerStore } from './playerStore'
import {
  MASTER_BPM_DEFAULT,
  clampMasterBpm,
  masterRate,
  type MasterRate,
} from '../lib/masterBpm'

const KEY = 'master_bpm'

interface Saved {
  enabled: boolean
  bpm: number
}

function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Saved>
      return {
        enabled: parsed.enabled === true,
        bpm: clampMasterBpm(Number(parsed.bpm ?? MASTER_BPM_DEFAULT)),
      }
    }
  } catch {
    // Storage can be blocked or hold junk; start from the defaults.
  }
  return { enabled: false, bpm: MASTER_BPM_DEFAULT }
}

function save(state: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // Not saving is fine: the setting just isn't remembered.
  }
}

interface MasterBpmState extends Saved {
  setEnabled: (enabled: boolean) => void
  setBpm: (bpm: number) => void
}

export const useMasterBpmStore = create<MasterBpmState>((set, get) => ({
  ...load(),
  setEnabled: (enabled) => {
    set({ enabled })
    save({ enabled, bpm: get().bpm })
  },
  setBpm: (bpm) => {
    const next = clampMasterBpm(bpm)
    set({ bpm: next })
    save({ enabled: get().enabled, bpm: next })
  },
}))

/** How a track plays right now, given the current master setting. */
export function masterRateFor(trackBpm: number | null | undefined): MasterRate {
  const { enabled, bpm } = useMasterBpmStore.getState()
  return masterRate(enabled ? bpm : null, trackBpm)
}

/** How the current track is being played under the master setting (reactive). */
export function useCurrentMasterRate(): MasterRate {
  const enabled = useMasterBpmStore((s) => s.enabled)
  const bpm = useMasterBpmStore((s) => s.bpm)
  const trackBpm = usePlayerStore((s) => s.currentTrack?.bpm)
  return masterRate(enabled ? bpm : null, trackBpm)
}
