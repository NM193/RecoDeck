export type BiquadFilterType = 'lowshelf' | 'peaking' | 'highshelf'

export interface EqBand {
  freq: number
  label: string
  type: BiquadFilterType
  Q: number
}

export const EQ_BANDS: EqBand[] = [
  { freq: 40,    label: '40',   type: 'lowshelf',  Q: 0.7 },
  { freq: 80,    label: '80',   type: 'peaking',   Q: 1.4 },
  { freq: 160,   label: '160',  type: 'peaking',   Q: 1.4 },
  { freq: 320,   label: '320',  type: 'peaking',   Q: 1.4 },
  { freq: 640,   label: '640',  type: 'peaking',   Q: 1.4 },
  { freq: 1300,  label: '1.3k', type: 'peaking',   Q: 1.4 },
  { freq: 2500,  label: '2.5k', type: 'peaking',   Q: 1.4 },
  { freq: 5000,  label: '5k',   type: 'peaking',   Q: 1.4 },
  { freq: 10000, label: '10k',  type: 'peaking',   Q: 1.4 },
  { freq: 16000, label: '16k',  type: 'highshelf', Q: 0.7 },
]
