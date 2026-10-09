// src/components/settings/YouTubeMusicSection.tsx
import { useEffect, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { confirm } from '@tauri-apps/plugin-dialog'
import { ToggleSwitch } from './ToggleSwitch'
import { Button } from '../Button'
import { tauriApi } from '../../lib/tauri-api'
import { getErrorMessage, isAppError } from '../../types/ai'
import { YTM_SYNCED_EVENT, type YtmStatus } from '../../types/youtubeMusic'

const linkStyle = { color: 'var(--accent)', textDecoration: 'underline' }

type Busy = 'file' | 'connect' | 'disconnect'

export function YouTubeMusicSection() {
  const [status, setStatus] = useState<YtmStatus | null>(null)
  const [busy, setBusy] = useState<Busy | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Each action; only the newest one's end clears `busy`. */
  const runSeq = useRef(0)

  useEffect(() => {
    let live = true
    const load = () => {
      tauriApi
        .getYouTubeMusicStatus()
        .then((next) => {
          if (live) setStatus(next)
        })
        .catch(() => {})
    }
    load()
    const stop = listen(YTM_SYNCED_EVENT, load)
    return () => {
      live = false
      void stop.then((unlisten) => unlisten())
    }
  }, [])

  const run = (kind: Busy, action: () => Promise<YtmStatus>) => {
    const seq = ++runSeq.current
    setBusy(kind)
    setError(null)
    action()
      .then(setStatus)
      .catch((e: unknown) => {
        // A newer Connect, a new client file or Disconnect cancelled this login on purpose.
        if (isAppError(e) && e.kind === 'YouTubeMusicLoginCancelled') return
        setError(getErrorMessage(e))
      })
      .finally(() => {
        if (seq === runSeq.current) setBusy(null)
      })
  }

  // While a login waits in the browser the button stays live: a closed tab
  // would otherwise hold it for the five-minute timeout. Clicking again
  // starts a fresh login, and Rust cancels the old one.
  const waiting = busy === 'connect'
  const connect = () => run('connect', () => tauriApi.connectYouTubeMusic())

  const chooseFile = () =>
    run('file', async () => {
      const path = await tauriApi.chooseYouTubeMusicClientFile()
      return path
        ? tauriApi.setYouTubeMusicClientFile(path)
        : tauriApi.getYouTubeMusicStatus()
    })

  const disconnect = () => {
    void confirm(
      'Disconnect YouTube Music? Its tracks and Yes/No answers will be removed from RecoDeck. The playlists you added stay, and are read again when you connect.',
      {
        title: 'Disconnect YouTube Music',
        kind: 'warning',
        okLabel: 'Disconnect',
        cancelLabel: 'Cancel',
      },
    )
      .then((yes) => {
        if (yes) run('disconnect', () => tauriApi.disconnectYouTubeMusic())
      })
      .catch(() => {})
  }

  const setShown = (show: boolean) => {
    setError(null)
    tauriApi
      .setYouTubeMusicShowInSidebar(show)
      .then(setStatus)
      .catch((e: unknown) => setError(getErrorMessage(e)))
  }

  return (
    <>
      <p className="settings-description">
        Shows which of your YouTube Music likes and playlists are already in
        your library, and makes the missing ones one click from the store.
        RecoDeck only reads from YouTube — it never likes or edits anything.
      </p>

      <div className="sv-subsection">
        <label className="sv-setting-row__label">
          Create your Google sign-in (once)
        </label>
        <ol
          className="settings-hint"
          style={{ marginTop: '0.5rem', paddingLeft: '1.1rem', lineHeight: 1.7 }}
        >
          <li>
            Open{' '}
            <a
              href="https://console.cloud.google.com/auth/overview"
              target="_blank"
              rel="noopener noreferrer"
              style={linkStyle}
            >
              Google Auth Platform
            </a>{' '}
            in the Google Cloud project that holds your YouTube API key
            (Settings → YouTube Tracklists), and press <strong>Get started</strong>.
            Four pages: app name and support email; audience{' '}
            <strong>External</strong>; contact email; agree and{' '}
            <strong>Create</strong>.
          </li>
          <li>
            Under <strong>Audience</strong>, press <strong>Publish app</strong>{' '}
            and confirm <strong>Push to production</strong>. Google allows it
            only once <strong>Branding</strong> has a home page and a privacy
            policy link on a domain of yours. Without them, leave the app in
            Testing and add your Google account under{' '}
            <strong>Test users</strong>: everything works the same, but Google
            signs you out every 7 days, and <strong>Reconnect</strong> signs you
            back in.
          </li>
          <li>
            Under <strong>Clients</strong>, press <strong>Create client</strong>,
            choose <strong>Desktop app</strong>, press <strong>Create</strong>,
            then <strong>Download JSON</strong> in the dialog that opens — Google
            shows the secret only there. No redirect URI is needed.
          </li>
          <li>
            Choose that file below. RecoDeck keeps its Client ID and secret, not
            the file.
          </li>
        </ol>
      </div>

      <div className="sv-subsection" style={{ marginTop: '1.25rem' }}>
        <label className="sv-setting-row__label">Client file</label>
        <div
          style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem' }}
        >
          <Button
            size="sm"
            disabled={busy !== null && !waiting}
            working={busy === 'file'}
            workingLabel="Reading…"
            onClick={chooseFile}
          >
            Choose client file…
          </Button>
          <span className="settings-hint">
            {status?.hasClient ? 'A Desktop client is chosen.' : 'None chosen yet.'}
          </span>
        </div>
      </div>

      <div className="sv-subsection" style={{ marginTop: '1.25rem' }}>
        <label className="sv-setting-row__label">Account</label>
        <div
          style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem' }}
        >
          {status?.connected ? (
            <>
              <span>
                Connected as <strong>{status.email ?? 'your Google account'}</strong>
              </span>
              {status.needsReconnect && (
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  disabled={busy !== null && !waiting}
                  onClick={connect}
                >
                  {waiting ? 'Waiting for Google… (try again)' : 'Reconnect'}
                </button>
              )}
              <button
                type="button"
                className="btn btn--sm"
                // Allowed while a login waits: it cancels that login too.
                disabled={busy !== null && !waiting}
                onClick={disconnect}
              >
                Disconnect
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn--primary btn--sm"
              disabled={!status?.hasClient || (busy !== null && !waiting)}
              title={status?.hasClient ? undefined : 'Choose the client file first'}
              onClick={connect}
            >
              {waiting ? 'Waiting for Google… (try again)' : 'Connect YouTube Music'}
            </button>
          )}
        </div>
        {!status?.connected && (
          <p className="settings-hint" style={{ marginTop: '0.5rem' }}>
            Google may say it hasn&apos;t verified this app: choose{' '}
            <strong>Advanced</strong>, then <strong>Go to … (unsafe)</strong>,
            and <strong>Continue</strong> — it is your own app. Tick the YouTube
            access box if Google shows one.
          </p>
        )}
        {error && (
          <p style={{ marginTop: '0.5rem', color: 'var(--color-danger)', fontSize: '0.875rem' }}>
            {error}
          </p>
        )}
      </div>

      <div className="sv-setting-row" style={{ marginTop: '1.25rem' }}>
        <div className="sv-setting-row__info">
          <span className="sv-setting-row__label">Show in sidebar</span>
          <span className="sv-setting-row__description">
            Off hides the YOUTUBE MUSIC section and pauses its sync. Your
            sign-in and lists stay.
          </span>
        </div>
        <ToggleSwitch
          checked={status?.showInSidebar ?? true}
          disabled={status === null}
          onChange={setShown}
        />
      </div>

      {status?.connected && (
        <div className="sv-subsection" style={{ marginTop: '1.25rem' }}>
          <label className="sv-setting-row__label">Last sync</label>
          <p className="settings-hint" style={{ marginTop: '0.5rem' }}>
            {status.lastError && status.lastErrorKind !== 'quotaExceeded'
              ? `Failed: ${status.lastError}`
              : status.lastSyncedAt
                ? `Synced ${new Date(status.lastSyncedAt).toLocaleString()} — every 30 minutes while RecoDeck is open. It uses the same daily quota as YouTube Tracklists.`
                : 'The first sync is running…'}
          </p>
          {status.quotaUsedUp && (
            <p className="settings-hint">
              YouTube quota used up · resumes after midnight Pacific
            </p>
          )}
        </div>
      )}
    </>
  )
}
