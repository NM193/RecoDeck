// src/components/menu/menuNav.ts
// ↑ ↓ in a menu (Interactions spec, Menus): the next item that can be
// chosen, wrapping round; separators and disabled items are passed over.

interface Steppable {
  kind: string
  disabled?: boolean
}

const choosable = (entry: Steppable) => entry.kind !== 'separator' && !entry.disabled

/**
 * The next choosable index from `from`; -1 when none is. With `from` -1
 * (nothing active yet), ↓ starts at the first item and ↑ at the last.
 */
export function stepIndex(entries: readonly Steppable[], from: number, step: 1 | -1): number {
  const n = entries.length
  const start = from === -1 && step === -1 ? n : from
  for (let i = 1; i <= n; i++) {
    const index = (((start + step * i) % n) + n) % n
    if (choosable(entries[index])) return index
  }
  return -1
}
