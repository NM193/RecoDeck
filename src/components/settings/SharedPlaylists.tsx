// Settings → Mobile Companion: the live playlist share links (spec 2026-10-16),
// each with Copy link and Stop sharing, and Stop all sharing. The list loads
// with the section and after each action.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '../Button'
import { Skeleton } from '../Skeleton'
import { toast } from '../../lib/toast'
import { tauriApi } from '../../lib/tauri-api'
import {
  expiresSoon,
  nowSeconds,
  shareLinkUrl,
  sharedLine,
} from '../../lib/share/shareText'
import { getErrorMessage } from '../../types/ai'
import type { ShareLink } from '../../types/track'
import './SharedPlaylists.css'

/** How long "Copied" stays on a row's button, in ms. */
const COPIED_MS = 2000

export function SharedPlaylists({ companionUrl }: { companionUrl: string }) {
  const [links, setLinks] = useState<ShareLink[] | null>(null)
  const [now, setNow] = useState(nowSeconds)
  // The token being stopped, or 'all'.
  const [stopping, setStopping] = useState<string | null>(null)
  const [copiedToken, setCopiedToken] = useState<string | null>(null)
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    try {
      const list = await tauriApi.listShareLinks()
      setLinks(list)
      setNow(nowSeconds())
    } catch (err) {
      toast(`Couldn't load shared playlists: ${getErrorMessage(err)}`, {
        kind: 'error',
      })
      setLinks((current) => current ?? [])
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current)
    },
    [],
  )

  function copyLink(token: string) {
    navigator.clipboard
      .writeText(shareLinkUrl(companionUrl, token))
      .then(() => {
        setCopiedToken(token)
        if (copiedTimer.current) clearTimeout(copiedTimer.current)
        copiedTimer.current = setTimeout(() => setCopiedToken(null), COPIED_MS)
      })
      .catch(() => toast("Couldn't copy the link", { kind: 'error' }))
  }

  async function stopOne(link: ShareLink) {
    setStopping(link.token)
    try {
      await tauriApi.stopShareLink(link.token)
      toast(`Stopped sharing ${link.playlist_name}`)
    } catch (err) {
      toast(`Couldn't stop sharing: ${getErrorMessage(err)}`, { kind: 'error' })
    } finally {
      setStopping(null)
      await load()
    }
  }

  async function stopAll() {
    setStopping('all')
    try {
      const stopped = await tauriApi.stopAllShareLinks()
      toast(
        `Stopped sharing ${stopped} ${stopped === 1 ? 'playlist' : 'playlists'}`,
      )
    } catch (err) {
      toast(`Couldn't stop sharing: ${getErrorMessage(err)}`, { kind: 'error' })
    } finally {
      setStopping(null)
      await load()
    }
  }

  const count = links?.length ?? 0

  return (
    <section
      className="companion-share"
      aria-labelledby="companion-share-title"
    >
      <div className="companion-share__head">
        <h4 id="companion-share-title" className="companion-share__title">
          Shared playlists
          {count > 0 && <span className="companion-share__count">{count}</span>}
        </h4>
        {count > 0 && (
          <Button
            size="sm"
            onClick={() => void stopAll()}
            disabled={stopping !== null}
            working={stopping === 'all'}
            workingLabel="Stopping…"
          >
            Stop all sharing
          </Button>
        )}
      </div>

      {links === null ? (
        <Skeleton width="100%" height={44} />
      ) : count === 0 ? (
        <p className="companion-share__empty">No shared playlists.</p>
      ) : (
        <ul className="companion-share__list">
          {links.map((link) => (
            <li key={link.token} className="companion-share__row">
              <div className="companion-share__info">
                <span className="companion-share__name">
                  {link.playlist_name}
                </span>
                <span
                  className={
                    expiresSoon(link.expires_at, now)
                      ? 'companion-share__meta companion-share__meta--soon'
                      : 'companion-share__meta'
                  }
                >
                  {sharedLine(link, now)}
                </span>
              </div>
              <button
                type="button"
                className="btn btn--sm companion-share__copy"
                onClick={() => copyLink(link.token)}
              >
                {copiedToken === link.token ? 'Copied' : 'Copy link'}
              </button>
              <Button
                size="sm"
                onClick={() => void stopOne(link)}
                disabled={stopping !== null}
                working={stopping === link.token}
                workingLabel="Stopping…"
              >
                Stop sharing
              </Button>
            </li>
          ))}
        </ul>
      )}

      <p className="companion-share__hint">
        A share link opens one playlist only and stops working when it expires.
      </p>
    </section>
  )
}
