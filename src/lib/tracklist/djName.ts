/**
 * Who played the set.
 *
 * The channel is not the answer — Mixmag, Boiler Room and Cercle are the hosts,
 * and their names are what YouTube reports. The DJ is in the title, and the
 * titles follow a small number of shapes:
 *
 *   Hot Since 82 | Mixmag Lab London
 *   Solomun @ Théâtre Antique d'Orange in France for Cercle
 *   Boris Brejcha at Grand Palais in Paris, France for Cercle
 *   Luciano - @Thuishaven Amsterdam 2026
 *   Priku B2B Traumer @ Berg Audio x Hola Club
 *
 * In every one of them the name comes first and a separator follows. So the
 * rule is to cut at the earliest separator, then sanity-check the result: a
 * remainder that runs on like a sentence is a title with no name in front of
 * it, not a DJ.
 */

/** Ordered by nothing in particular — whichever appears earliest wins. */
const SEPARATORS = [
  ' | ',
  ' — ',
  ' – ',
  ' - ',
  ' @ ',
  ' at ',
  ' live at ',
  ' for ',
  ' presents ',
  ' pres. ',
  ' plays ',
  ' b2b ', // handled below: a back-to-back keeps both names
  ': ',
  ' // ',
]

/** Bracketed noise that trails a name: (4K), [Official Video], and so on. */
const TRAILING_NOISE = /\s*[[(][^\])]*[\])]\s*$/g

const MAX_WORDS = 6

/**
 * What the DJ did, which is not who they are.
 *
 * "Hot Since 82 House Set" and "JOSEPH CAPRIATI closing set" were filed as two
 * more acts, each under its own heading, beside the same men. Cutting at the
 * separator is not enough when the description begins before it.
 *
 * Only a trailing run is removed, and only words that describe a performance —
 * so "Mixed Emotions" and "Sunset Rollercoaster" keep their names, because the
 * word that would be stripped is not at the end.
 */
const ROLE_WORDS =
  '(?:closing|opening|warm[\\s-]?up|sunset|sunrise|house|techno|minimal|deep|disco|melodic|live|dj|full|extended|special|guest|exclusive|studio|rooftop|boat|beach)'

const TRAILING_ROLE = new RegExp(
  `\\s+(?:${ROLE_WORDS}\\s+)*(?:set|mix|session|live|performance)$`,
  'i',
)

/**
 * A compilation series in front of the artist: "Fabric 80 - Joseph Capriati".
 *
 * One word and a number is a series — Fabric 80, Cocoon 12. A real name that
 * happens to carry a number is longer than that: "Hot Since 82" is two words
 * and a number, and stays whole.
 */
const SERIES_PREFIX = /^[A-Za-z]+\s+\d{1,3}$/

export function extractDjName(title: string, channel?: string | null): string {
  const clean = title.replace(/\s+/g, ' ').trim()
  if (!clean) return channel?.trim() || 'Unknown'

  // A back-to-back set is one act: "Priku B2B Traumer" stays whole, so cutting
  // starts after it rather than at it.
  const b2b = /\sb2b\s/i.exec(clean)

  let cut = clean.length
  for (const separator of SEPARATORS) {
    if (separator === ' b2b ') continue
    const index = clean.toLowerCase().indexOf(separator.toLowerCase())
    if (index > 0 && index < cut && (!b2b || index > b2b.index)) cut = index
  }

  let name = clean.slice(0, cut).replace(TRAILING_NOISE, '').trim()
  // A dangling separator left by an unusual spacing, e.g. "Solomun -".
  name = name.replace(/[|@\-–—:]+$/, '').trim()

  // "Fabric 80 - Joseph Capriati" is a record, not a DJ called Fabric 80. The
  // name is behind the series, so read one segment further.
  if (SERIES_PREFIX.test(name) && cut < clean.length) {
    const rest = clean.slice(cut).replace(/^\s*[-–—|:@]\s*/, '')
    let after = rest
    for (const separator of SEPARATORS) {
      if (separator === ' b2b ') continue
      const index = after.toLowerCase().indexOf(separator.toLowerCase())
      if (index > 0) after = after.slice(0, index)
    }
    after = after.replace(TRAILING_NOISE, '').trim()
    const afterWords = after.split(' ').filter(Boolean)
    // Only when what follows reads like a name: a couple of words, no digits.
    if (afterWords.length >= 2 && afterWords.length <= 4 && !/\d/.test(after)) {
      name = after
    }
  }

  // What they did comes off; who they are stays. Never to nothing: a name that
  // is only a role word is still the only name there is.
  const stripped = name.replace(TRAILING_ROLE, '').trim()
  if (stripped) name = stripped

  const words = name.split(' ').filter(Boolean)
  if (!name || words.length > MAX_WORDS) {
    // No name in front — a descriptive title, so the host is the best label.
    return channel?.trim() || 'Unknown'
  }

  return name
}

/** Groups sets under the DJ who played them, biggest first. */
export function groupByDj<T extends { title: string; channel?: string | null }>(
  sets: T[],
): Array<{ dj: string; sets: T[] }> {
  const groups = new Map<string, { dj: string; sets: T[] }>()

  for (const set of sets) {
    const dj = extractDjName(set.title, set.channel)
    // Case-insensitive so "SOLOMUN" and "Solomun" are one act, while the first
    // spelling seen is the one shown.
    const key = dj.toLowerCase()
    const group = groups.get(key) ?? { dj, sets: [] }
    group.sets.push(set)
    groups.set(key, group)
  }

  return [...groups.values()].sort(
    (a, b) => b.sets.length - a.sets.length || a.dj.localeCompare(b.dj),
  )
}
