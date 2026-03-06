// Shared music utility functions for Camelot key compatibility and BPM analysis.
// Implements full Traktor-style harmonic mixing rules with tiered scoring.

// Legacy 3-tier type (kept for backward compatibility)
export type KeyCompatibility = 'perfect' | 'compatible' | 'clash'

// Expanded 4-tier system matching professional DJ software
export type KeyCompatibilityTier = 'perfect' | 'harmonic' | 'energy' | 'clash'

export interface KeyCompatibilityResult {
  /** Compatibility score (0-100). Higher = more compatible. */
  score: number
  /** Machine-readable label for the relationship type */
  label: string
  /** 4-tier classification for UI display */
  tier: KeyCompatibilityTier
}

export type BpmIssue = 'ok' | 'warn' | 'bad'

/** Parse a Camelot key string like "8A" or "11B" into number + letter */
function parseCamelot(key: string): { num: number; letter: string } | null {
  const m = key.match(/^(\d{1,2})([AB])$/i)
  if (!m) return null
  const num = parseInt(m[1], 10)
  if (num < 1 || num > 12) return null
  return { num, letter: m[2].toUpperCase() }
}

/**
 * Full harmonic mixing compatibility score between two Camelot keys.
 *
 * Scoring follows the Camelot wheel rules used by Traktor, Mixed In Key, etc.:
 *
 * | Score | Tier     | Rule                         | Wheel Operation              |
 * |-------|----------|------------------------------|------------------------------|
 * | 100   | perfect  | Same key                     | Same                         |
 * | 95    | harmonic | Relative major/minor         | Same num, switch letter      |
 * | 90    | harmonic | Adjacent +1 (dominant)       | +1, same letter              |
 * | 90    | harmonic | Adjacent -1 (subdominant)    | -1, same letter              |
 * | 80    | energy   | Energy boost +2 semitones    | +2, same letter              |
 * | 75    | energy   | Energy boost +1 semitone     | +7, same letter              |
 * | 70    | energy   | Diagonal +1                  | +1, switch letter            |
 * | 70    | energy   | Diagonal -1                  | -1, switch letter            |
 * | 60    | energy   | Energy drop -2 semitones     | -2, same letter              |
 * | 55    | energy   | Energy drop -1 semitone      | -7, same letter              |
 * | 40    | clash    | Mood shift                   | +3, switch letter            |
 * | 10    | clash    | Tritone (avoid)              | +6, same letter              |
 * | 0     | clash    | Incompatible                 | Everything else              |
 */
export function getKeyCompatibilityScore(
  keyA: string | undefined,
  keyB: string | undefined,
): KeyCompatibilityResult {
  if (!keyA || !keyB) return { score: 0, label: 'unknown', tier: 'clash' }
  if (keyA === keyB) return { score: 100, label: 'same_key', tier: 'perfect' }

  const a = parseCamelot(keyA)
  const b = parseCamelot(keyB)
  if (!a || !b) return { score: 0, label: 'unknown', tier: 'clash' }

  // Directed offset on the circular 1-12 wheel (0-11)
  const offset = ((b.num - a.num) % 12 + 12) % 12
  const sameMode = a.letter === b.letter

  if (sameMode) {
    switch (offset) {
      case 0:  return { score: 100, label: 'same_key',        tier: 'perfect'  }
      case 1:  return { score: 90,  label: 'adjacent_up',     tier: 'harmonic' }
      case 11: return { score: 90,  label: 'adjacent_down',   tier: 'harmonic' }
      case 2:  return { score: 80,  label: 'energy_boost_2',  tier: 'energy'   }
      case 7:  return { score: 75,  label: 'energy_boost_1',  tier: 'energy'   }
      case 10: return { score: 60,  label: 'energy_drop_2',   tier: 'energy'   }
      case 5:  return { score: 55,  label: 'energy_drop_1',   tier: 'energy'   }
      case 6:  return { score: 10,  label: 'tritone',         tier: 'clash'    }
      default: return { score: 0,   label: 'incompatible',    tier: 'clash'    }
    }
  } else {
    switch (offset) {
      case 0:  return { score: 95,  label: 'relative',        tier: 'harmonic' }
      case 1:  return { score: 70,  label: 'diagonal_up',     tier: 'energy'   }
      case 11: return { score: 70,  label: 'diagonal_down',   tier: 'energy'   }
      case 3:  return { score: 40,  label: 'mood_shift',      tier: 'clash'    }
      case 4:  return { score: 30,  label: 'reverse_slide',   tier: 'clash'    }
      default: return { score: 0,   label: 'incompatible',    tier: 'clash'    }
    }
  }
}

/**
 * Legacy 3-tier compatibility check (backward-compatible).
 * Maps the expanded scoring to the original perfect/compatible/clash tiers.
 */
export function getKeyCompatibility(
  keyA: string | undefined,
  keyB: string | undefined,
): KeyCompatibility {
  const { tier } = getKeyCompatibilityScore(keyA, keyB)
  if (tier === 'perfect') return 'perfect'
  if (tier === 'harmonic' || tier === 'energy') return 'compatible'
  return 'clash'
}

/**
 * Determine BPM transition quality between two tracks.
 * ok: delta <= 5, warn: delta 6-10, bad: delta > 10 or missing data.
 */
export function getBpmIssue(bpmA?: number, bpmB?: number): BpmIssue {
  if (bpmA == null || bpmB == null) return 'bad'
  const delta = Math.abs(bpmA - bpmB)
  if (delta <= 5) return 'ok'
  if (delta <= 10) return 'warn'
  return 'bad'
}
