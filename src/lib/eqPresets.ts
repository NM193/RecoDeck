export type EqPresetName =
  | 'flat'
  | 'bass_boost'
  | 'treble_boost'
  | 'vocal'
  | 'electronic'
  | 'headphones'

export interface EqPreset {
  label: string
  gains: number[] // 10 dB values, same order as EQ_BANDS
}

export const EQ_PRESETS: Record<EqPresetName, EqPreset> = {
  flat: {
    label: 'Flat',
    gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  bass_boost: {
    label: 'Bass Boost',
    gains: [8, 7, 5, 3, 1, 0, 0, 0, 0, 0],
  },
  treble_boost: {
    label: 'Treble Boost',
    gains: [0, 0, 0, 0, 0, 1, 3, 5, 7, 8],
  },
  vocal: {
    label: 'Vocal',
    gains: [-2, -3, 0, 3, 5, 5, 4, 2, 0, -1],
  },
  electronic: {
    label: 'Electronic',
    gains: [6, 5, 2, 0, -1, 2, 1, 3, 5, 6],
  },
  headphones: {
    label: 'Headphones',
    gains: [4, 3, 1, 0, -1, 0, 1, 3, 4, 5],
  },
}

export const EQ_PRESET_NAMES = Object.keys(EQ_PRESETS) as EqPresetName[]

/**
 * Compares a bands array element-wise against each preset.
 * Returns the matching preset name or 'custom' if no preset matches.
 * Tolerance of 0.01 dB per band.
 */
export function detectPreset(bands: number[]): EqPresetName | 'custom' {
  for (const name of EQ_PRESET_NAMES) {
    const preset = EQ_PRESETS[name]
    if (preset.gains.length !== bands.length) continue
    const matches = preset.gains.every(
      (g, i) => Math.abs(g - bands[i]) < 0.01
    )
    if (matches) return name
  }
  return 'custom'
}
