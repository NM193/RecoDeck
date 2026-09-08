/**
 * Does this look like a channel, or like somebody's name?
 *
 * The Follow box resolves whatever it is given, and the last thing it tries is
 * a search — 100 units — for a channel matching the words. Type "Solomun" into
 * it and that is exactly what happens: a hundred units spent to return his own
 * channel, where releases live rather than the sets he plays. It appears to
 * work and hands back the wrong thing, which is the worst outcome available.
 *
 * So the box asks first. This is a guard, not a resolver: it decides whether
 * spending anything is worth offering, and the backend still does the real
 * work for everything that passes.
 */

/** A YouTube channel id: "UC" and 22 more characters. */
const CHANNEL_ID = /UC[A-Za-z0-9_-]{22}/

/** A link of any kind — a channel page, or one of its videos. */
const LINK = /(^|\W)(https?:\/\/|www\.|youtube\.com|youtu\.be)/i

export function looksLikeAChannel(input: string): boolean {
  const text = input.trim()
  if (!text) return false
  // A handle is the cheapest thing to resolve and the most common paste.
  if (text.includes('@')) return true
  if (CHANNEL_ID.test(text)) return true
  return LINK.test(text)
}
