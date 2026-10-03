// src/components/settings/SpotifySection.tsx
import { useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { tauriApi } from '../../lib/tauri-api'
import { getErrorMessage, isAppError } from '../../types/ai'
import { SPOTIFY_SYNCED_EVENT, type SpotifyStatus } from '../../types/spotify'

const REDIRECT_URI = 'http://127.0.0.1:47816/callback'

const linkStyle = { color: 'var(--accent)', textDecoration: 'underline' }

export function SpotifySection() {
  const [status, setStatus] = useState<SpotifyStatus | null>(null)
  const [clientId, setClientId] = useState('')
  const [busy, setBusy] = useState<'save' | 'connect' | 'disconnect' | null>(
    null,
  )
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let live = true
    const load = () => {
      tauriApi
        .getSpotifyStatus()
        .then((next) => {
          if (!live) return
          setStatus(next)
          setClientId((typed) => typed || next.clientId || '')
        })
        .catch(() => {})
    }
    load()
    const stop = listen(SPOTIFY_SYNCED_EVENT, load)
    return () => {
      live = false
      void stop.then((unlisten) => unlisten())
    }
  }, [])

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])

  const run = (
    kind: 'save' | 'connect' | 'disconnect',
    action: () => Promise<SpotifyStatus>,
  ) => {
    setBusy(kind)
    setError(null)
    action()
      .then(setStatus)
      .catch((e: unknown) => {
        // A newer Connect or a Client ID change cancelled this login on purpose.
        if (isAppError(e) && e.kind === 'SpotifyLoginCancelled') return
        setError(getErrorMessage(e))
      })
      .finally(() => setBusy(null))
  }

  const saved = status?.clientId ?? null
  const dirty = clientId.trim() !== '' && clientId.trim() !== saved

  return (
    <>
      <p className="settings-description">
        Shows which of your Spotify likes and playlists are already in your
        library, and makes the missing ones one click from the store. RecoDeck
        only reads from Spotify — it never likes, unlikes or edits anything.
      </p>

      <div className="sv-subsection">
        <label className="sv-setting-row__label">
          Create your Spotify app (once)
        </label>
        <ol
          className="settings-hint"
          style={{
            marginTop: '0.5rem',
            paddingLeft: '1.1rem',
            lineHeight: 1.7,
          }}
        >
          <li>
            Open{' '}
            <a
              href="https://developer.spotify.com/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              style={linkStyle}
            >
              developer.spotify.com/dashboard
            </a>{' '}
            and press <strong>Create app</strong>. Any name and description will
            do.
          </li>
          <li>
            Under <strong>Redirect URIs</strong> add exactly{' '}
            <code>{REDIRECT_URI}</code>{' '}
            <button
              type="button"
              className="btn-secondary btn-small"
              onClick={() => {
                navigator.clipboard
                  .writeText(REDIRECT_URI)
                  .then(() => setCopied(true))
                  .catch(() => {})
              }}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </li>
          <li>
            Under <strong>Which API/SDKs are you planning to use?</strong> tick{' '}
            <strong>Web API</strong>, then save.
          </li>
          <li>
            Open the app's <strong>User Management</strong> and add the name and
            email of your own Spotify account — a personal app can only sign in
            the accounts listed there.
          </li>
          <li>
            Copy the app's <strong>Client ID</strong> into the field below.
            There is no secret to copy.
          </li>
        </ol>
        <p className="settings-hint" style={{ marginTop: '0.5rem' }}>
          Spotify asks for Premium on the account that owns the app. Without
          Premium the play buttons open the Spotify app instead of playing
          directly.
        </p>
      </div>

      <div className="sv-subsection" style={{ marginTop: '1.25rem' }}>
        <label htmlFor="spotify-client-id" className="sv-setting-row__label">
          Client ID
        </label>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
          <input
            id="spotify-client-id"
            type="text"
            placeholder="32 letters and digits"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && dirty)
                run('save', () => tauriApi.setSpotifyClientId(clientId))
            }}
            className="settings-text-input"
            style={{ flex: 1 }}
            spellCheck={false}
          />
          <button
            type="button"
            className="btn-primary btn-small"
            disabled={!dirty || busy !== null}
            onClick={() =>
              run('save', () => tauriApi.setSpotifyClientId(clientId))
            }
          >
            {busy === 'save' ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div className="sv-subsection" style={{ marginTop: '1.25rem' }}>
        <label className="sv-setting-row__label">Account</label>
        <div
          style={{
            display: 'flex',
            gap: '0.5rem',
            alignItems: 'center',
            marginTop: '0.5rem',
          }}
        >
          {status?.connected ? (
            <>
              <span>
                Connected as <strong>{status.accountName}</strong>
              </span>
              {status.needsReconnect && (
                <button
                  type="button"
                  className="btn-primary btn-small"
                  disabled={dirty || busy !== null}
                  title={dirty ? 'Save the Client ID first' : undefined}
                  onClick={() =>
                    run('connect', () => tauriApi.connectSpotify())
                  }
                >
                  {busy === 'connect' ? 'Waiting for Spotify…' : 'Reconnect'}
                </button>
              )}
              <button
                type="button"
                className="btn-secondary btn-small"
                disabled={busy !== null}
                onClick={() =>
                  run('disconnect', () => tauriApi.disconnectSpotify())
                }
              >
                Disconnect
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn-primary btn-small"
              // Connect signs in with the saved Client ID, not the one being typed.
              disabled={!saved || dirty || busy !== null}
              title={dirty ? 'Save the Client ID first' : undefined}
              onClick={() => run('connect', () => tauriApi.connectSpotify())}
            >
              {busy === 'connect'
                ? 'Waiting for Spotify in your browser…'
                : 'Connect Spotify'}
            </button>
          )}
        </div>
        {error && (
          <p
            style={{
              marginTop: '0.5rem',
              color: 'var(--color-danger)',
              fontSize: '0.875rem',
            }}
          >
            {error}
          </p>
        )}
      </div>

      {status?.connected && (
        <div className="sv-subsection" style={{ marginTop: '1.25rem' }}>
          <label className="sv-setting-row__label">Last sync</label>
          <p className="settings-hint" style={{ marginTop: '0.5rem' }}>
            {status.lastError
              ? `Failed: ${status.lastError}`
              : status.lastSyncedAt
                ? `Synced ${new Date(status.lastSyncedAt).toLocaleString()} — every 10 minutes while RecoDeck is open.`
                : 'The first sync is running…'}
          </p>
          {status.refused.length > 0 && (
            <p className="settings-hint">
              Spotify would not share{' '}
              {status.refused.length === 1
                ? 'this playlist'
                : 'these playlists'}{' '}
              — it only gives personal apps the playlists you own or collaborate
              on: {status.refused.join(', ')}.
            </p>
          )}
        </div>
      )}
    </>
  )
}
