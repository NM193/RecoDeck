// src/lib/setPlayer/panelQueue.ts
// The YouTube panel's calls that create, move or close the native webview,
// one at a time and in order: a close sent while an open is still on its way
// must not land first (or the video plays on with nothing to stop it), and
// two opens must not race for the panel's one label.

let chain: Promise<unknown> = Promise.resolve()

/** Runs `call` after every panel call queued before it, failed or not. */
export function queuePanel<T>(call: () => Promise<T>): Promise<T> {
  const next = chain.then(call, call)
  chain = next.catch(() => {})
  return next
}
