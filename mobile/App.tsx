// Mobile companion app — connect to desktop RecoDeck, search and play tracks

import { useState, useEffect, useCallback } from "react";

// QR scan: URL = http://host:port/?token=xxx — parse both server URL and token from same URL
function getInitialUrl() {
  if (typeof window === "undefined") return null;
  const href = window.location.href;
  const params = new URLSearchParams(window.location.search);
  let token = params.get("token");
  if (!token && window.location.hash) {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, "").replace(/^\?/, ""));
    token = hashParams.get("token");
  }
  let origin = "";
  // 1. Meta tag (reliable, in DOM before script runs)
  const meta = document.querySelector('meta[name="recodeck-server-url"]');
  if (meta?.getAttribute("content")) {
    origin = meta.getAttribute("content")!.trim();
  }
  // 2. Injected script (companion server)
  if (!origin) {
    const injected = (window as unknown as { __RECODECK_SERVER_URL__?: string }).__RECODECK_SERVER_URL__;
    if (injected) origin = injected;
  }
  // 3. Parse from current URL
  if (!origin) {
    try {
      if (href) origin = new URL(href).origin;
    } catch {
      /* ignore */
    }
  }
  if (!origin || origin === "null") {
    const built = `${window.location.protocol}//${window.location.hostname}${window.location.port ? ":" + window.location.port : ""}`;
    if (built && built !== "://" && built !== "://:") {
      origin = built;
    } else {
      origin = window.location.origin || "";
    }
  }
  return { origin: origin || "", token };
}
const INITIAL_URL = getInitialUrl();
import { httpApi } from "../src/lib/http-api";
import type { Track } from "../src/types/track";
import { MobileTrackList } from "./components/MobileTrackList";
import { MobilePlayer } from "./components/MobilePlayer";

type ConnectionState = "disconnected" | "connecting" | "connected" | "error";

export function MobileApp() {
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("disconnected");
  const [serverUrl, setServerUrl] = useState(
    () => INITIAL_URL?.origin || localStorage.getItem("companion_url") || ""
  );
  const [token, setToken] = useState(
    () => INITIAL_URL?.token || localStorage.getItem("companion_token") || ""
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [serverName, setServerName] = useState("");
  const [trackCount, setTrackCount] = useState(0);

  // Player state
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audio] = useState(() => new Audio());

  // Shared connect logic — used by both QR auto-connect and manual Connect button
  const connect = useCallback(
    async (url: string, authToken: string) => {
      const trimmedUrl = url.trim().replace(/\/+$/, "");
      const trimmedToken = authToken.trim();
      if (!trimmedUrl) {
        setErrorMessage("Enter the server URL");
        return;
      }
      if (!trimmedToken) {
        setErrorMessage("Enter the auth token");
        return;
      }

      setConnectionState("connecting");
      setErrorMessage("");

      try {
        httpApi.configure(trimmedUrl, trimmedToken);
        const status = await httpApi.getStatus();
        setServerName(status.name);
        setTrackCount(status.track_count);
        setConnectionState("connected");
        localStorage.setItem("companion_url", trimmedUrl);
        localStorage.setItem("companion_token", trimmedToken);
      } catch (err) {
        setConnectionState("error");
        setErrorMessage(
          err instanceof Error ? err.message : "Failed to connect"
        );
      }
    },
    []
  );

  const handleConnect = useCallback(() => {
    connect(serverUrl, token);
  }, [serverUrl, token, connect]);

  // Fallback: if we have token but no server URL, try meta tag / window.location (catches timing issues)
  useEffect(() => {
    if (!token || serverUrl) return;
    const meta = document.querySelector('meta[name="recodeck-server-url"]')?.getAttribute("content");
    const fromMeta = meta?.trim();
    if (fromMeta) {
      setServerUrl(fromMeta);
      return;
    }
    try {
      const u = new URL(window.location.href);
      if (u.origin && u.origin !== "null") setServerUrl(u.origin);
    } catch {
      /* ignore */
    }
  }, [token, serverUrl]);

  // QR scan: token from URL immediately, server URL after fetch — then auto-connect
  useEffect(() => {
    let cancelled = false;
    const authToken = INITIAL_URL?.token || token;

    if (INITIAL_URL?.token) {
      setToken(INITIAL_URL.token);
      window.history.replaceState({}, "", window.location.pathname);
    }

    // Server URL: prefer INITIAL_URL, then meta tag, then current page, then localStorage
    let fallback = INITIAL_URL?.origin || localStorage.getItem("companion_url");
    if (!fallback) {
      const meta = document.querySelector('meta[name="recodeck-server-url"]')?.getAttribute("content");
      if (meta?.trim()) fallback = meta.trim();
    }
    if (!fallback && authToken) {
      try {
        const href = window.location.href;
        const url = new URL(href);
        const tokenInUrl = url.searchParams.get("token") ?? new URLSearchParams(url.hash.replace(/^#/, "").replace(/^\?/, "")).get("token");
        if (tokenInUrl) fallback = url.origin;
      } catch {
        /* ignore */
      }
    }
    if (fallback) setServerUrl(fallback);

    fetch("/api/self")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { url?: string } | null) => {
        if (cancelled) return;
        const url = data?.url || fallback;
        if (url) {
          setServerUrl(url);
          if (authToken) connect(url, authToken);
        } else if (fallback && authToken) {
          connect(fallback, authToken);
        }
      })
      .catch(() => {
        if (!cancelled && fallback && authToken) connect(fallback, authToken);
      });

    return () => { cancelled = true; };
  }, [connect]);

  // When user pastes a full URL (e.g. from QR scan) into server URL field, extract base URL + token and auto-connect
  const handleServerUrlPaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      const pasted = e.clipboardData.getData("text");
      try {
        const url = new URL(pasted);
        const tokenParam = url.searchParams.get("token") ?? new URLSearchParams(url.hash.replace(/^#/, "")).get("token");
        if (tokenParam) {
          e.preventDefault();
          const baseUrl = url.origin;
          setServerUrl(baseUrl);
          setToken(tokenParam);
          connect(baseUrl, tokenParam);
        }
      } catch {
        // Not a valid URL, let default paste happen
      }
    },
    [connect]
  );

  function handleDisconnect() {
    setConnectionState("disconnected");
    setServerName("");
    setTrackCount(0);
    setCurrentTrack(null);
    setQueue([]);
    setQueueIndex(-1);
    audio.pause();
    audio.src = "";
    localStorage.removeItem("companion_url");
    localStorage.removeItem("companion_token");
  }

  const handlePlayTrack = useCallback(
    async (track: Track, tracks: Track[], index: number) => {
      try {
        const streamUrl = await httpApi.getStreamUrl(track.id);
        audio.src = streamUrl;
        audio.play();
        setCurrentTrack(track);
        setQueue(tracks);
        setQueueIndex(index);
        setIsPlaying(true);
      } catch (err) {
        console.error("Failed to play track:", err);
      }
    },
    [audio]
  );

  const handleNext = useCallback(async () => {
    if (queueIndex < queue.length - 1) {
      const nextIndex = queueIndex + 1;
      const nextTrack = queue[nextIndex];
      try {
        const streamUrl = await httpApi.getStreamUrl(nextTrack.id);
        audio.src = streamUrl;
        audio.play();
        setCurrentTrack(nextTrack);
        setQueueIndex(nextIndex);
        setIsPlaying(true);
      } catch (err) {
        console.error("Failed to play next:", err);
      }
    }
  }, [audio, queue, queueIndex]);

  const handlePrevious = useCallback(async () => {
    if (queueIndex > 0) {
      const prevIndex = queueIndex - 1;
      const prevTrack = queue[prevIndex];
      try {
        const streamUrl = await httpApi.getStreamUrl(prevTrack.id);
        audio.src = streamUrl;
        audio.play();
        setCurrentTrack(prevTrack);
        setQueueIndex(prevIndex);
        setIsPlaying(true);
      } catch (err) {
        console.error("Failed to play previous:", err);
      }
    }
  }, [audio, queue, queueIndex]);

  const handlePlayPause = useCallback(() => {
    if (audio.paused) {
      audio.play();
      setIsPlaying(true);
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }, [audio]);

  // Audio event listeners
  useEffect(() => {
    const handleEnded = () => {
      handleNext();
    };
    const handleError = () => {
      setIsPlaying(false);
    };

    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
    };
  }, [audio, handleNext]);

  // Media Session API for lock screen controls
  useEffect(() => {
    if ("mediaSession" in navigator && currentTrack) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title || "Unknown",
        artist: currentTrack.artist || "Unknown Artist",
        album: currentTrack.album || "",
      });

      navigator.mediaSession.setActionHandler("play", handlePlayPause);
      navigator.mediaSession.setActionHandler("pause", handlePlayPause);
      navigator.mediaSession.setActionHandler("nexttrack", handleNext);
      navigator.mediaSession.setActionHandler("previoustrack", handlePrevious);
    }
  }, [currentTrack, handlePlayPause, handleNext, handlePrevious]);

  // Connect screen
  if (connectionState !== "connected") {
    return (
      <div className="mobile-connect">
        <div className="mobile-connect-card">
          <h1 className="mobile-connect-title">RecoDeck</h1>
          <p className="mobile-connect-subtitle">Connect to your music library</p>

          <div className="mobile-connect-form">
            <div className="mobile-input-group">
              <label htmlFor="server-url">
                Server URL
                <button
                  type="button"
                  className="mobile-use-current-url"
                  onClick={() => {
                    const o = window.location.origin || `${window.location.protocol}//${window.location.hostname}${window.location.port ? ":" + window.location.port : ""}`;
                    if (o) setServerUrl(o);
                  }}
                >
                  Use current page
                </button>
              </label>
              <input
                id="server-url"
                type="url"
                placeholder="Enter the server URL (e.g. http://192.168.1.100:8384)"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                onPaste={handleServerUrlPaste}
                onKeyDown={(e) => e.key === "Enter" && handleConnect()}
              />
            </div>

            <div className="mobile-input-group">
              <label htmlFor="auth-token">Auth Token</label>
              <input
                id="auth-token"
                type="text"
                placeholder="Paste token from desktop app"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                onPaste={handleServerUrlPaste}
                onKeyDown={(e) => e.key === "Enter" && handleConnect()}
                autoComplete="off"
              />
            </div>

            {errorMessage && (
              <div className="mobile-error">{errorMessage}</div>
            )}

            <button
              className="mobile-connect-btn"
              onClick={handleConnect}
              disabled={connectionState === "connecting"}
            >
              {connectionState === "connecting" ? "Connecting..." : "Connect"}
            </button>
          </div>

          <p className="mobile-connect-hint">
            Start the companion server from RecoDeck Settings on your computer.
          </p>
        </div>
      </div>
    );
  }

  // Main player UI
  return (
    <div className="mobile-app">
      <header className="mobile-header">
        <div className="mobile-header-info">
          <span className="mobile-header-title">RecoDeck</span>
          <span className="mobile-header-meta">
            {trackCount} tracks
          </span>
        </div>
        <button className="mobile-disconnect-btn" onClick={handleDisconnect}>
          Disconnect
        </button>
      </header>

      <main className="mobile-main">
        <MobileTrackList onPlayTrack={handlePlayTrack} />
      </main>

      {currentTrack && (
        <MobilePlayer
          track={currentTrack}
          isPlaying={isPlaying}
          audio={audio}
          onPlayPause={handlePlayPause}
          onNext={handleNext}
          onPrevious={handlePrevious}
          hasNext={queueIndex < queue.length - 1}
          hasPrevious={queueIndex > 0}
        />
      )}
    </div>
  );
}
