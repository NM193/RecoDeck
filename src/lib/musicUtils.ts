// Shared music utility functions for Camelot key compatibility and BPM analysis.
// Extracted from AIPlaylistDialog for reuse across AI components.

export type KeyCompatibility = 'perfect' | 'compatible' | 'clash';
export type BpmIssue = 'ok' | 'warn' | 'bad';

/**
 * Determine Camelot key compatibility between two keys.
 * Compatible means: same key (perfect), same number different letter (compatible),
 * or same letter +/-1 on the circular 1-12 wheel (compatible).
 */
export function getKeyCompatibility(
  keyA: string | undefined,
  keyB: string | undefined,
): KeyCompatibility {
  if (!keyA || !keyB) return 'clash';
  if (keyA === keyB) return 'perfect';
  const parse = (k: string) => {
    const m = k.match(/^(\d{1,2})([AB])$/i);
    if (!m) return null;
    return { num: parseInt(m[1], 10), letter: m[2].toUpperCase() };
  };
  const a = parse(keyA);
  const b = parse(keyB);
  if (!a || !b) return 'clash';
  // Same number, different letter (inner/outer wheel)
  if (a.num === b.num && a.letter !== b.letter) return 'compatible';
  // Same letter, +/-1 position (circular 1-12)
  if (a.letter === b.letter) {
    const diff = Math.abs(a.num - b.num);
    if (diff === 1 || diff === 11) return 'compatible';
  }
  return 'clash';
}

/**
 * Determine BPM transition quality between two tracks.
 * ok: delta <= 5, warn: delta 6-10, bad: delta > 10 or missing data.
 */
export function getBpmIssue(bpmA?: number, bpmB?: number): BpmIssue {
  if (bpmA == null || bpmB == null) return 'bad';
  const delta = Math.abs(bpmA - bpmB);
  if (delta <= 5) return 'ok';
  if (delta <= 10) return 'warn';
  return 'bad';
}
