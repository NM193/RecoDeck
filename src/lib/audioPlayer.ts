/**
 * HTML5 Audio-based player that uses a custom "stream" URI scheme protocol
 * registered in the Rust backend to serve local audio files.
 *
 * IMPORTANT:
 * In Tauri/WebView, the most reliable way to access a custom protocol from
 * browser media elements is via the `http://<scheme>.localhost/...` mapping.
 * Some WebKit builds treat `scheme://localhost/...` as unsupported for <audio>.
 *
 * Preferred URL format (all platforms): http://stream.localhost/?p=<encoded_path>
 * Fallback URL format:                 stream://localhost/?p=<encoded_path>
 */
export class AudioPlayer {
  private audio: HTMLAudioElement;
  private _isPlaying: boolean = false;
  private _duration: number = 0;
  private _position: number = 0;
  private _hasSource: boolean = false; // true only after loadTrack()
  private _isLoading: boolean = false; // true during loadTrack (suppresses error display during fallback)
  private _isSeeking: boolean = false; // true during seek (suppresses pause event)
  private _loadGeneration: number = 0; // incremented on each loadTrack to cancel stale loads
  private mode: 'html' | 'native' = 'html';

  // Track metadata for premature-end recovery
  private _currentTrackId: number | null = null;
  private _metadataDurationMs: number = 0; // from backend scanning (symphonia) — more reliable than browser
  private _nativeRecoveryAttempted: boolean = false; // prevents infinite recovery loops

  // Crossfade support
  private crossfadeEnabled: boolean = false;
  private crossfadeDurationMs: number = 8000; // default 8 seconds
  private crossfadeAudio: HTMLAudioElement | null = null; // second audio element for incoming track
  private isCrossfading: boolean = false;
  private crossfadeFadeComplete: boolean = false; // fade-in done, waiting for outgoing track to end naturally
  private crossfadeStartTime: number = 0;
  private crossfadeRafId: number | null = null;
  private outgoingBpm: number | null = null;
  private incomingBpm: number | null = null;

  // Native (Rust decode -> PCM -> WebAudio) fallback for formats WebView can't decode (e.g. ogg on macOS).
  private audioCtx: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private nativeSources: Set<AudioBufferSourceNode> = new Set();
  private nativeUnlistenChunk?: () => void;
  private nativeUnlistenEnded?: () => void;
  private nativePositionTimer: number | null = null;
  private nativeStartAudioTime: number = 0;
  private nativeStartPositionMs: number = 0;
  private nativeNextStartTime: number = 0;
  private nativeEndedEmitted: boolean = false;

  // Callbacks
  public onPositionUpdate?: (positionMs: number) => void;
  public onDurationChange?: (durationMs: number) => void;
  public onTrackEnded?: () => void;
  public onError?: (error: string) => void;
  public onPlayStateChange?: (isPlaying: boolean) => void;

  // Crossfade configuration
  setCrossfadeEnabled(enabled: boolean) {
    this.crossfadeEnabled = enabled;
    if (!enabled && (this.isCrossfading || this.crossfadeFadeComplete)) {
      this.abortCrossfade();
    }
  }

  setCrossfadeDuration(seconds: number) {
    this.crossfadeDurationMs = Math.max(1000, Math.min(30000, seconds * 1000));
  }

  setMetadataDuration(ms: number) {
    this._metadataDurationMs = ms;
  }

  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.setupEventListeners();
  }

  private setupEventListeners() {
    // Capture the audio element reference so we can detect stale listeners
    // after a crossfade swap (old element's listeners should be ignored).
    const audio = this.audio;

    audio.addEventListener('timeupdate', () => {
      if (audio !== this.audio) return; // stale element after crossfade swap
      this._position = audio.currentTime * 1000;
      this.onPositionUpdate?.(this._position);
    });

    audio.addEventListener('durationchange', () => {
      if (audio !== this.audio) return; // stale element after crossfade swap
      if (isFinite(audio.duration)) {
        this._duration = audio.duration * 1000;
        this.onDurationChange?.(this._duration);
      }
    });

    audio.addEventListener('ended', () => {
      // If this is a stale audio element (swapped out during crossfade), ignore.
      if (audio !== this.audio) return;
      console.log('[AudioPlayer] ended event fired, position:', this._position, 'duration:', this._duration);

      // If the crossfade fade-in is still running, the outgoing track ended
      // before the fade completed. Immediately bring the incoming track to
      // full volume and complete the swap — waiting for the fade leaves the
      // user hearing only a partial-volume incoming track which feels like
      // the song "skipped."
      if (this.isCrossfading) {
        console.warn('[AudioPlayer] Outgoing track ended during crossfade fade-in, completing swap immediately');
        if (this.crossfadeAudio) {
          this.crossfadeAudio.volume = 1.0;
        }
        this.isCrossfading = false;
        if (this.crossfadeRafId !== null) {
          cancelAnimationFrame(this.crossfadeRafId);
          this.crossfadeRafId = null;
        }
        this.completeCrossfade();
        return;
      }

      // If crossfade fade-in already completed and we were waiting for this
      // track to end naturally — now perform the swap.
      if (this.crossfadeFadeComplete) {
        console.log('[AudioPlayer] Outgoing track ended naturally after crossfade, performing swap');
        this.completeCrossfade();
        return;
      }

      // ── Native decoder recovery for premature HTML ended ──
      // WebKit can miscalculate duration for VBR MP3 and certain formats,
      // causing the ended event to fire seconds before the actual end.
      // Always attempt recovery via native decoder (once per track).
      // If the track truly ended, native decoder reaches EOF quickly (~200ms)
      // and onTrackEnded fires normally. If there IS more audio, it plays.
      const metaGap = this._metadataDurationMs > 0
        ? this._metadataDurationMs - this._position
        : 0;
      const browserGap = this._duration > this._position
        ? this._duration - this._position
        : 0;

      console.log(
        `[AudioPlayer] HTML ended: pos=${Math.round(this._position)}ms, ` +
        `browserDur=${Math.round(this._duration)}ms (gap=${Math.round(browserGap)}ms), ` +
        `metaDur=${this._metadataDurationMs}ms (gap=${Math.round(metaGap)}ms), ` +
        `recoveryAttempted=${this._nativeRecoveryAttempted}`
      );

      if (this._currentTrackId != null && !this._nativeRecoveryAttempted) {
        this._nativeRecoveryAttempted = true;
        const maxGap = Math.max(metaGap, browserGap);
        console.log(
          `[AudioPlayer] Attempting native decoder recovery` +
          (maxGap > 1000 ? ` (~${Math.round(maxGap / 1000)}s may remain).` : '.')
        );

        const savedPosition = this._position;
        const trackId = this._currentTrackId;

        // Suppress pause events during mode switch
        this._isSeeking = true;

        (async () => {
          try {
            await this.switchToNative(trackId);

            // Seek with a safety margin to account for VBR seek imprecision.
            // Symphonia's seek on VBR MP3 can overshoot, missing audio data.
            // We seek 10s earlier to ensure we don't skip anything.
            const SEEK_MARGIN_MS = 10000;
            const seekPosition = Math.max(0, savedPosition - SEEK_MARGIN_MS);
            if (seekPosition > 0) {
              const { tauriApi } = await import('./tauri-api');
              await tauriApi.playbackSeek(Math.floor(seekPosition));
              this.nativeStartPositionMs = seekPosition;
              this._position = seekPosition;
              if (this.audioCtx) {
                this.nativeStartAudioTime = this.audioCtx.currentTime;
              }
            }

            this._isSeeking = false;
            await this.nativeResume();
          } catch (err) {
            console.error('[AudioPlayer] Native recovery failed:', err);
            this._isSeeking = false;
            this._isPlaying = false;
            this.onPlayStateChange?.(false);
            this.onTrackEnded?.();
          }
        })();
        return;
      }

      // Normal end (or recovery already attempted)
      this._isPlaying = false;
      this.onPlayStateChange?.(false);
      this.onTrackEnded?.();
    });

    audio.addEventListener('play', () => {
      if (audio !== this.audio) return; // stale element after crossfade swap
      console.log('[AudioPlayer] play event fired, setting isPlaying=true');
      this._isPlaying = true;
      this.onPlayStateChange?.(true);
    });

    audio.addEventListener('pause', () => {
      if (audio !== this.audio) return; // stale element after crossfade swap
      // Suppress pause events during seek — WebKit briefly pauses to buffer new range
      if (this._isSeeking) return;
      // Suppress pause events during crossfade — the incoming track is still playing
      if (this.isCrossfading || this.crossfadeFadeComplete) return;
      this._isPlaying = false;
      this.onPlayStateChange?.(false);
    });

    this.audio.addEventListener('error', () => {
      // Ignore errors when:
      // - No real source has been loaded (e.g. cleanup setting src='')
      // - Currently loading (fallback to native decoder may be in progress)
      if (!this._hasSource || this._isLoading) return;

      const mediaError = this.audio.error;
      const message = mediaError
        ? `Audio error (code ${mediaError.code}): ${mediaError.message || 'Unknown error'}`
        : 'Unknown audio error';
      console.error('[AudioPlayer]', message, 'src:', this.audio.src);
      this._isPlaying = false;
      this.onPlayStateChange?.(false);
      this.onError?.(message);
    });
  }

  private async ensureNativeAudio(): Promise<void> {
    // Create AudioContext if needed.
    if (!this.audioCtx || !this.gainNode) {
      const ctx = new AudioContext();
      const gain = ctx.createGain();
      gain.connect(ctx.destination);
      this.audioCtx = ctx;
      this.gainNode = gain;
    }

    // Ensure backend stream listeners are registered.
    // They can be lost if cleanup() was called (e.g. React Strict Mode).
    if (this.nativeUnlistenChunk && this.nativeUnlistenEnded) return;

    const { listen } = await import('@tauri-apps/api/event');
    const { tauriApi } = await import('./tauri-api');

    this.nativeUnlistenChunk = await listen('audio-chunk', (event) => {
      const chunk = event.payload as {
        samples: number[];
        sample_rate: number;
        position_ms: number;
        duration_ms: number;
        is_end: boolean;
      };

      if (this.mode !== 'native') return;
      if (!this.audioCtx || !this.gainNode) return;

      // Update duration from backend (more reliable for formats without metadata).
      if (chunk.duration_ms && chunk.duration_ms > 0) {
        this._duration = chunk.duration_ms;
        this.onDurationChange?.(this._duration);
      }

      if (chunk.is_end) {
        this.nativeEmitEndedOnce();
        return;
      }

      // Schedule PCM chunk into WebAudio.
      const frames = Math.floor(chunk.samples.length / 2);
      if (frames <= 0) return;

      const buffer = this.audioCtx.createBuffer(2, frames, chunk.sample_rate || 44100);
      const left = buffer.getChannelData(0);
      const right = buffer.getChannelData(1);
      for (let i = 0, j = 0; i < frames; i++, j += 2) {
        left[i] = chunk.samples[j] ?? 0;
        right[i] = chunk.samples[j + 1] ?? left[i];
      }

      const source = this.audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.gainNode);
      // Capture the current track ID so the ended handler can detect stale sources
      const sourceTrackId = this._currentTrackId;
      source.addEventListener('ended', () => {
        this.nativeSources.delete(source);
        // Ignore ended events from old tracks (when a new track has started loading)
        if (sourceTrackId !== this._currentTrackId) {
          return;
        }
        // If this was the last buffer, check if the track is done
        if (this.nativeSources.size === 0 && this.audioCtx) {
          const decoderDone = this.nativeEndedEmitted;
          // Even without audio-ended event: if all scheduled time has passed,
          // no more audio is coming.
          const allScheduledPlayed =
            this.nativeNextStartTime > this.nativeStartAudioTime + 0.1 &&
            this.audioCtx.currentTime >= this.nativeNextStartTime - 0.05;
          if (decoderDone || allScheduledPlayed) {
            console.log('[AudioPlayer] Last source ended — advancing (decoderDone=' + decoderDone + ')');
            if (!this.nativeEndedEmitted) this.nativeEndedEmitted = true;
            this.nativeFinishPlayback();
          }
        }
      });
      this.nativeSources.add(source);

      // Schedule with a small lead time to avoid underruns.
      const now = this.audioCtx.currentTime;
      const lead = 0.05;
      if (this.nativeNextStartTime < now + lead) {
        this.nativeNextStartTime = now + lead;
      }
      source.start(this.nativeNextStartTime);
      this.nativeNextStartTime += buffer.duration;
    });

    this.nativeUnlistenEnded = await listen('audio-ended', () => {
      if (this.mode !== 'native') return;
      this.nativeEmitEndedOnce();
    });

    // Keep backend import referenced (avoid tree-shake surprises in some bundlers).
    void tauriApi;
  }

  private nativeEmitEndedOnce() {
    if (this.nativeEndedEmitted) return;
    this.nativeEndedEmitted = true;

    // Log diagnostic info when track ends in native mode
    const position = this._position;
    const duration = this._duration;

    console.log(`[AudioPlayer] Native decoder finished: position=${Math.round(position)}ms, duration=${Math.round(duration)}ms`);

    if (this.audioCtx) {
      const remainingAudio = (this.nativeNextStartTime - this.audioCtx.currentTime) * 1000;
      console.log(`[AudioPlayer] WebAudio buffers remaining: ~${Math.round(remainingAudio)}ms`);
    }

    // Don't call onTrackEnded() immediately! The native decoder runs faster
    // than real-time, so there are still WebAudio buffers queued ahead of
    // actual playback. The position timer (startNativePositionTimer) will
    // detect when all buffers have played out and fire onTrackEnded then.
    // See the check in startNativePositionTimer.
  }

  /** Called when decoder is done AND all audio has played. Safe to call multiple times. */
  private nativeFinishPlayback() {
    // Guard: prevent double-firing (can be called from timer, source ended, or fallback)
    if (!this.nativeEndedEmitted) return;
    this.nativeEndedEmitted = false; // Prevent subsequent calls

    console.log('[AudioPlayer] nativeFinishPlayback: all audio done, advancing to next track');
    this.stopNativePositionTimer();
    this._isPlaying = false;
    this.onPlayStateChange?.(false);
    console.log('[AudioPlayer] Calling onTrackEnded, callback defined:', !!this.onTrackEnded);
    this.onTrackEnded?.();
  }

  private stopNativeSources() {
    for (const src of this.nativeSources) {
      try {
        src.stop();
      } catch {
        // ignore
      }
    }
    this.nativeSources.clear();
  }

  private startNativePositionTimer() {
    if (this.nativePositionTimer != null) return;
    this.nativePositionTimer = window.setInterval(() => {
      if (this.mode !== 'native') return;
      if (!this.audioCtx) return;
      if (!this._isPlaying) return;

      const pos = this.nativeStartPositionMs + (this.audioCtx.currentTime - this.nativeStartAudioTime) * 1000;
      this._position = Math.max(0, pos);
      this.onPositionUpdate?.(this._position);

      // === Track end detection ===
      // Works even if audio-ended event was never received from the backend.

      // Check 1: decoder signaled end (nativeEndedEmitted) AND time has passed
      if (this.nativeEndedEmitted) {
        const allPlayed = this.audioCtx.currentTime >= this.nativeNextStartTime - 0.05;
        if (allPlayed) {
          this.nativeFinishPlayback();
          return;
        }
      }

      // Check 2: No active sources, some audio was scheduled, and all
      // scheduled time has passed. This detects track end purely from
      // WebAudio state — no backend event needed.
      if (this.nativeSources.size === 0 &&
          this.nativeNextStartTime > this.nativeStartAudioTime + 0.1 &&
          this.audioCtx.currentTime > this.nativeNextStartTime + 0.15) {
        console.log('[AudioPlayer] Timer detect: all audio played, no sources remain');
        if (!this.nativeEndedEmitted) this.nativeEndedEmitted = true;
        this.nativeFinishPlayback();
        return;
      }
    }, 200);
  }

  private stopNativePositionTimer() {
    if (this.nativePositionTimer == null) return;
    window.clearInterval(this.nativePositionTimer);
    this.nativePositionTimer = null;
  }

  /**
   * Convert a local file path to a stream:// URL served by our Rust backend.
   * Path is passed in the query string (?p=...) so the full path (including any
   * number of subfolders and special characters) is always received correctly.
   * 
   * IMPORTANT: This function preserves ALL special characters in filenames:
   * spaces, commas, brackets, quotes, backslashes (on macOS/Linux), etc.
   * 
   * Prefer:          http://stream.localhost/?p=<encoded_path>
   * Fallback:        stream://localhost/?p=<encoded_path>
   */
  private filePathToStreamUrl(filePath: string): string {
    const trimmed = filePath.trim();
    if (!trimmed) return '';

    // If caller already provided a stream URL, don't wrap again.
    if (trimmed.startsWith('stream://localhost/') || trimmed.startsWith('stream://localhost/?p=')) {
      return trimmed;
    }
    if (trimmed.startsWith('http://stream.localhost/') || trimmed.startsWith('http://stream.localhost/?p=')) {
      return trimmed;
    }

    // Strip file:// prefix if it accidentally got stored/passed in.
    const withoutFileScheme = trimmed.startsWith('file://') ? trimmed.slice('file://'.length) : trimmed;

    // Normalize Windows backslashes to forward slashes (only on Windows).
    // On macOS/Linux, backslashes are valid filename characters - preserve them!
    const isWindows = navigator.userAgent.includes('Windows');
    const normalized = isWindows ? withoutFileScheme.replace(/\\/g, '/') : withoutFileScheme;
    
    // Collapse repeated slashes only (preserve all other characters)
    const collapsed = normalized.replace(/\/{2,}/g, '/');
    
    // Ensure absolute path
    const pathForUrl =
      collapsed.startsWith('/') || /^[A-Za-z]:\//.test(collapsed)
        ? collapsed
        : `/${collapsed}`;
        
    // encodeURIComponent properly encodes ALL special characters including:
    // spaces, commas, brackets, quotes, backslashes, etc.
    // This ensures the path survives as a single query parameter value.
    const encoded = encodeURIComponent(pathForUrl);

    // Always prefer the WebView-safe http mapping. We'll fall back to stream:// if needed.
    return `http://stream.localhost/?p=${encoded}`;
  }

  private async loadUrl(url: string, originalPathForLogs: string): Promise<void> {
    this._hasSource = true;
    this.audio.src = url;
    this.audio.load();

    // Wait for canplay — the browser has buffered enough to actually produce audio.
    // Do NOT resolve on loadedmetadata: WebKit can advance the playback clock after
    // loadedmetadata but before the audio output pipeline is connected, resulting in
    // the progress bar moving with no sound.
    await new Promise<void>((resolve, reject) => {
      const onError = () => {
        cleanup();
        const err = this.audio.error;
        const code = err?.code ?? 0;
        // MEDIA_ERR_ABORTED=1, NETWORK=2, DECODE=3, SRC_NOT_SUPPORTED=4
        const codeHint =
          code === 2
            ? ' (network/protocol blocked or file not found)'
            : code === 4
              ? ' (format or URL not supported)'
              : code === 3
                ? ' (decode error)'
                : '';
        const msg =
          err?.message && err.message.length > 0
            ? `${err.message}${codeHint}`
            : `Failed to load audio file${codeHint}. If the file was moved or deleted, rescan the folder or remove the track.`;
        console.warn('[AudioPlayer] Load error:', msg, 'code:', code, 'url:', url, 'path:', originalPathForLogs);
        const error: any = new Error(msg);
        error.code = code;
        reject(error);
      };
      const onCanPlay = () => {
        cleanup();
        console.log('[AudioPlayer] Can play, duration:', this.audio.duration);
        resolve();
      };
      const cleanup = () => {
        this.audio.removeEventListener('canplay', onCanPlay);
        this.audio.removeEventListener('error', onError);
      };
      this.audio.addEventListener('canplay', onCanPlay, { once: true });
      this.audio.addEventListener('error', onError, { once: true });
    });
  }

  /**
   * Load a track by its local file path.
   */
  async loadTrack(filePath: string, trackId?: number): Promise<void> {
    console.log('[AudioPlayer] loadTrack() called, filePath:', filePath, 'trackId:', trackId);
    // Increment generation so any in-flight load from a previous call is cancelled.
    const gen = ++this._loadGeneration;
    this._isLoading = true;

    try {
      // ── Full cleanup of previous playback ──
      console.log('[AudioPlayer] loadTrack: cleaning up previous playback, mode:', this.mode);

      // Stop the current HTML audio element.
      this.audio.pause();
      this._hasSource = false;
      this.audio.removeAttribute('src');
      this.audio.load();

      // Reset nativeEndedEmitted BEFORE stopping sources to prevent spurious onTrackEnded callbacks
      // when source.stop() fires the ended event
      this.nativeEndedEmitted = false;

      // If previous track used native mode, stop backend streaming and free resources.
      if (this.mode === 'native') {
        console.log('[AudioPlayer] loadTrack: stopping native mode playback');
        this.stopNativeSources();
        this.stopNativePositionTimer();
        try {
          const { tauriApi } = await import('./tauri-api');
          await tauriApi.playbackStop();
          console.log('[AudioPlayer] loadTrack: native playback stopped');
        } catch (err) {
          console.warn('[AudioPlayer] loadTrack: error stopping native playback:', err);
        }
        if (gen !== this._loadGeneration) {
          console.log('[AudioPlayer] loadTrack: superseded during native cleanup, aborting');
          return;
        }
      }

      // Create a fresh Audio element so WebKit starts with a clean decode pipeline.
      // Reusing the same element after source changes can leave WebKit in a state
      // where play() advances the playback clock but produces no audio output
      // (progress bar moves, time updates, but no sound). Creating a new element
      // avoids this entirely. The old element (paused, no src) will be GC'd.
      console.log('[AudioPlayer] loadTrack: creating fresh Audio element');
      const prevVolume = this.audio.volume;
      this.audio = new Audio();
      this.audio.preload = 'auto';
      this.audio.volume = prevVolume;
      this.setupEventListeners();

      this._isPlaying = false;
      this._position = 0;
      this._duration = 0;
      this._currentTrackId = trackId ?? null;
      this._metadataDurationMs = 0;
      this._nativeRecoveryAttempted = false;
      this.nativeStartPositionMs = 0;
      console.log('[AudioPlayer] loadTrack: reset state - position=0, duration=0, isPlaying=false');

      // Notify UI about reset
      this.onPositionUpdate?.(0);
      this.onDurationChange?.(0);

      // If we already know the format is WebKit-hostile, go native immediately.
      // Common formats that WebKit on macOS often can't decode:
      const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
      const webkitUnsupportedFormats = ['ogg', 'opus', 'wma', 'ape', 'tak', 'alac'];
      const preferNative = webkitUnsupportedFormats.includes(ext);

      if (preferNative && typeof trackId === 'number') {
        console.log(`[AudioPlayer] Format .${ext} not supported by WebKit, using native decoder`);
        await this.switchToNative(trackId);
        if (gen !== this._loadGeneration) {
          console.log('[AudioPlayer] loadTrack: superseded after switchToNative, aborting');
          return;
        }
        console.log('[AudioPlayer] loadTrack: native mode ready');
        return;
      }

    const url = this.filePathToStreamUrl(filePath);
    console.log('[AudioPlayer] loadTrack: starting HTML mode load, URL:', url);

    try {
      this.mode = 'html';
      console.log('[AudioPlayer] loadTrack: calling loadUrl...');
      await this.loadUrl(url, filePath);
      console.log('[AudioPlayer] loadTrack: loadUrl completed');
      if (gen !== this._loadGeneration) {
        console.log('[AudioPlayer] loadTrack: superseded after loadUrl, aborting');
        return;
      }
    } catch (e: any) {
      if (gen !== this._loadGeneration) {
        console.log('[AudioPlayer] loadTrack: superseded in catch block, aborting');
        return;
      }
      // Check if this is a codec/format error (code 4 = MEDIA_ERR_SRC_NOT_SUPPORTED)
      const isFormatError = e?.code === 4 || e?.code === 3;

      if (isFormatError && typeof trackId === 'number') {
        // Format not supported by WebKit - switch to native decoder immediately
        console.log('[AudioPlayer] WebKit cannot decode this format, switching to native decoder');
        await this.switchToNative(trackId);
        if (gen !== this._loadGeneration) {
          console.log('[AudioPlayer] loadTrack: superseded after switchToNative fallback, aborting');
          return;
        }
        console.log('[AudioPlayer] loadTrack: native mode fallback ready');
        return;
      }

      // For non-format errors, try fallback URL scheme
      const fallbackUrl = url.startsWith('http://stream.localhost/')
        ? url.replace('http://stream.localhost/', 'stream://localhost/')
        : url;

      if (fallbackUrl !== url && !isFormatError) {
        console.warn('[AudioPlayer] Retrying with fallback URL:', fallbackUrl);
        try {
          await this.loadUrl(fallbackUrl, filePath);
          if (gen !== this._loadGeneration) {
            console.log('[AudioPlayer] loadTrack: superseded after fallback loadUrl, aborting');
            return;
          }
          console.log('[AudioPlayer] loadTrack: fallback URL loaded successfully');
          return;
        } catch (e2: any) {
          if (gen !== this._loadGeneration) {
            console.log('[AudioPlayer] loadTrack: superseded in fallback catch, aborting');
            return;
          }
          // If fallback also has format error and we have trackId, try native
          const isFormatError2 = e2?.code === 4 || e2?.code === 3;
          if (isFormatError2 && typeof trackId === 'number') {
            console.log('[AudioPlayer] Fallback URL also failed with format error, switching to native decoder');
            await this.switchToNative(trackId);
            if (gen !== this._loadGeneration) {
              console.log('[AudioPlayer] loadTrack: superseded after fallback native switch, aborting');
              return;
            }
            console.log('[AudioPlayer] loadTrack: fallback native mode ready');
            return;
          }
          console.error('[AudioPlayer] loadTrack: fallback URL failed:', e2);
          throw e2;
        }
      }

      // No trackId or other error - throw it
      console.error('[AudioPlayer] loadTrack: error during load:', e);
      throw e;
    }
    } finally {
      // Only clear loading flag if this is still the active load
      if (gen === this._loadGeneration) {
        console.log('[AudioPlayer] loadTrack: clearing loading flag');
        this._isLoading = false;
      } else {
        console.log('[AudioPlayer] loadTrack: NOT clearing loading flag (superseded)');
      }
    }
    console.log('[AudioPlayer] loadTrack: completed successfully');
  }

  private async switchToNative(trackId: number): Promise<void> {
    console.log('[AudioPlayer] switchToNative: starting, trackId:', trackId);
    const { tauriApi } = await import('./tauri-api');
    console.log('[AudioPlayer] switchToNative: ensuring native audio context...');
    await this.ensureNativeAudio();
    console.log('[AudioPlayer] switchToNative: native audio context ready');

    // Stop HTML audio, clear native scheduling.
    this.audio.pause();
    this.stopNativeSources();
    if (this.audioCtx) {
      this.nativeNextStartTime = this.audioCtx.currentTime;
    } else {
      this.nativeNextStartTime = 0;
    }

    this.mode = 'native';
    this.nativeEndedEmitted = false;

    // Ask backend to load/prepare decoder and return duration (if known).
    console.log('[AudioPlayer] switchToNative: calling playbackLoadTrack, trackId:', trackId);
    const status = await tauriApi.playbackLoadTrack(trackId);
    console.log('[AudioPlayer] switchToNative: playbackLoadTrack complete, duration:', status.duration_ms, 'ms');

    if (status.duration_ms && status.duration_ms > 0) {
      this._duration = status.duration_ms;
      this.onDurationChange?.(this._duration);
    }
    this._position = status.position_ms ?? 0;
    this.nativeStartPositionMs = this._position;
    if (this.audioCtx) this.nativeStartAudioTime = this.audioCtx.currentTime;
    this.onPositionUpdate?.(this._position);
    console.log('[AudioPlayer] switchToNative: complete, position:', this._position, 'duration:', this._duration);
  }

  async play(): Promise<void> {
    console.log('[AudioPlayer] play() called, mode:', this.mode, 'hasSource:', this._hasSource, 'src:', this.audio?.src);
    if (this.mode === 'native') {
      await this.resume();
      return;
    }
    try {
      await this.audio.play();
      console.log('[AudioPlayer] play() successful, isPlaying will be set by play event');
    } catch (err) {
      console.error('[AudioPlayer] play() failed:', err);
      throw err;
    }
  }

  pause(): void {
    if (this.mode === 'native') {
      void this.nativePause();
      return;
    }
    this.audio.pause();
  }

  async resume(): Promise<void> {
    if (this.mode === 'native') {
      await this.nativeResume();
      return;
    }
    await this.audio.play();
  }

  async seek(positionMs: number): Promise<void> {
    const wasPlaying = this._isPlaying;

    if (this.mode === 'native') {
      await this.nativeSeek(positionMs);
      return;
    }

    // HTML5 mode: suppress pause events during seek
    this._isSeeking = true;
    const clampedMs = Math.max(0, Math.min(positionMs, this._duration));

    // Register seeked listener BEFORE setting currentTime to avoid race
    const seekComplete = new Promise<void>((resolve) => {
      const timeout = setTimeout(() => resolve(), 2000); // safety timeout
      this.audio.addEventListener('seeked', () => {
        clearTimeout(timeout);
        resolve();
      }, { once: true });
    });

    this.audio.currentTime = clampedMs / 1000;
    this._position = clampedMs;
    this.onPositionUpdate?.(clampedMs);

    // Wait for seek to finish
    await seekComplete;
    this._isSeeking = false;

    // Resume playback if it was playing before seek
    if (wasPlaying) {
      try {
        await this.audio.play();
      } catch {
        // Ignore play errors during seek recovery
      }
    }
  }

  stop(): void {
    if (this.mode === 'native') {
      void this.nativeStop();
      return;
    }
    this.audio.pause();
    this.audio.currentTime = 0;
    this._isPlaying = false;
    this._position = 0;
  }

  setVolume(volume: number) {
    const v = Math.max(0, Math.min(1, volume));
    this.audio.volume = v;
    if (this.gainNode) {
      this.gainNode.gain.value = v;
    }
  }

  get isPlaying(): boolean {
    return this._isPlaying;
  }

  get position(): number {
    return this._position;
  }

  get duration(): number {
    return this._duration;
  }

  get isCrossfadingState(): boolean {
    return this.isCrossfading;
  }

  async initialize() {
    // No-op: HTML5 Audio doesn't need async initialization
  }

  async cleanup() {
    this._hasSource = false;
    this.audio.pause();
    this.audio.removeAttribute('src');
    this._isPlaying = false;

    // Abort any active crossfade
    this.abortCrossfade();

    // Native cleanup
    this.stopNativePositionTimer();
    this.stopNativeSources();
    if (this.nativeUnlistenChunk) {
      this.nativeUnlistenChunk();
      this.nativeUnlistenChunk = undefined;
    }
    if (this.nativeUnlistenEnded) {
      this.nativeUnlistenEnded();
      this.nativeUnlistenEnded = undefined;
    }
  }

  /**
   * Start crossfade to next track (HTML mode only).
   * Preloads the incoming track, starts it at matched tempo, and fades volumes.
   */
  async startCrossfadeToNext(nextTrackFilePath: string, _nextTrackId?: number, nextTrackBpm?: number | null, currentTrackBpm?: number | null): Promise<void> {
    // Only support crossfade in HTML mode (native mode would need dual decoder support)
    if (this.mode !== 'html') {
      console.warn('[AudioPlayer] Crossfade only supported in HTML mode, skipping');
      // Return rejection so caller knows crossfade didn't happen
      throw new Error('Crossfade not supported in native mode');
    }

    if (!this.crossfadeEnabled || this.isCrossfading || this.crossfadeFadeComplete) {
      return;
    }

    // Don't crossfade if we're in native mode or no current track
    if (!this._hasSource || !this.audio.src) {
      return;
    }

    this.isCrossfading = true;
    this.outgoingBpm = currentTrackBpm ?? null;
    this.incomingBpm = nextTrackBpm ?? null;

    try {
      // Create second audio element for incoming track
      this.crossfadeAudio = new Audio();
      this.crossfadeAudio.preload = 'auto';
      this.crossfadeAudio.volume = 0; // Start at 0, fade in

      // Calculate beatmatch playback rate
      let playbackRate = 1.0;
      if (this.outgoingBpm && this.outgoingBpm > 0 && this.incomingBpm && this.incomingBpm > 0) {
        playbackRate = this.outgoingBpm / this.incomingBpm;
        // Clamp playback rate to reasonable range (0.5x to 2x)
        playbackRate = Math.max(0.5, Math.min(2.0, playbackRate));
        console.log(`[AudioPlayer] Beatmatch: ${this.outgoingBpm} BPM → ${this.incomingBpm} BPM, playbackRate=${playbackRate.toFixed(3)}`);
      } else {
        console.log('[AudioPlayer] Crossfade without beatmatch (missing BPM data)');
      }

      this.crossfadeAudio.playbackRate = playbackRate;

      // Load incoming track
      const url = this.filePathToStreamUrl(nextTrackFilePath);
      this.crossfadeAudio.src = url;
      this.crossfadeAudio.load();

      // Wait for incoming track to be ready
      await new Promise<void>((resolve, reject) => {
        const onCanPlay = () => {
          cleanup();
          resolve();
        };
        const onError = () => {
          cleanup();
          reject(new Error('Failed to load incoming track for crossfade'));
        };
        const cleanup = () => {
          this.crossfadeAudio?.removeEventListener('canplay', onCanPlay);
          this.crossfadeAudio?.removeEventListener('error', onError);
        };
        this.crossfadeAudio?.addEventListener('canplay', onCanPlay, { once: true });
        this.crossfadeAudio?.addEventListener('error', onError, { once: true });
      });

      // Start incoming track (volume 0)
      await this.crossfadeAudio.play();

      // Start crossfade animation
      this.crossfadeStartTime = Date.now();
      this.updateCrossfadeVolumes();
    } catch (err) {
      console.error('[AudioPlayer] Crossfade failed:', err);
      this.abortCrossfade();
    }
  }

  private updateCrossfadeVolumes() {
    if (!this.isCrossfading || !this.crossfadeAudio) {
      return;
    }

    const elapsed = Date.now() - this.crossfadeStartTime;
    const progress = Math.min(1.0, elapsed / this.crossfadeDurationMs);

    // Only fade IN the incoming track. The outgoing track keeps playing at
    // full volume so the current song reaches 100% of its duration.
    this.crossfadeAudio.volume = progress;

    if (progress >= 1.0) {
      // Fade-in complete. Incoming track is at full volume.
      // Don't stop the outgoing track — let it finish naturally.
      this.isCrossfading = false;
      this.crossfadeFadeComplete = true;

      if (this.crossfadeRafId !== null) {
        cancelAnimationFrame(this.crossfadeRafId);
        this.crossfadeRafId = null;
      }

      // If the outgoing track already ended while the fade was running, swap now.
      if (this.audio.ended) {
        console.log('[AudioPlayer] Outgoing track already ended, completing crossfade swap');
        this.completeCrossfade();
      } else {
        console.log('[AudioPlayer] Crossfade fade-in complete, waiting for outgoing track to end naturally');
      }
    } else {
      // Continue animation
      this.crossfadeRafId = requestAnimationFrame(() => this.updateCrossfadeVolumes());
    }
  }

  private completeCrossfade() {
    if (!this.crossfadeAudio) return;

    // Clean up the outgoing audio element (it already ended naturally or is done).
    this.audio.removeAttribute('src');
    this.audio.load();

    // Reset incoming track playback rate to 1.0 (default BPM)
    this.crossfadeAudio.playbackRate = 1.0;
    console.log('[AudioPlayer] Crossfade swap complete, reset playbackRate to 1.0');

    // Swap: incoming becomes current
    const newAudio = this.crossfadeAudio;
    this.audio = newAudio;
    this.audio.volume = 1.0;
    this.crossfadeAudio = null;

    // Reattach event listeners to the new audio element
    this.setupEventListeners();

    // Update state
    this._hasSource = true;
    this._isPlaying = true;
    this._nativeRecoveryAttempted = false; // Fresh flag for the new track
    this.isCrossfading = false;
    this.crossfadeFadeComplete = false;
    this.crossfadeStartTime = 0;
    this.outgoingBpm = null;
    this.incomingBpm = null;

    // Cancel animation frame (safety, should already be cancelled)
    if (this.crossfadeRafId !== null) {
      cancelAnimationFrame(this.crossfadeRafId);
      this.crossfadeRafId = null;
    }

    // Immediately update position/duration from the new audio element so the
    // store reflects the incoming track's state BEFORE onTrackEnded fires.
    // Without this, the crossfade monitor in Player.tsx would see stale values
    // (old track near the end) and incorrectly trigger another crossfade.
    if (isFinite(this.audio.duration)) {
      this._duration = this.audio.duration * 1000;
      this.onDurationChange?.(this._duration);
    }
    this._position = this.audio.currentTime * 1000;
    this.onPositionUpdate?.(this._position);

    // Ensure the UI knows we're still playing
    this.onPlayStateChange?.(true);

    // Notify that track changed (Player will update currentTrack)
    this.onTrackEnded?.();
  }

  private abortCrossfade() {
    if (this.crossfadeRafId !== null) {
      cancelAnimationFrame(this.crossfadeRafId);
      this.crossfadeRafId = null;
    }

    if (this.crossfadeAudio) {
      this.crossfadeAudio.pause();
      this.crossfadeAudio.removeAttribute('src');
      this.crossfadeAudio.load();
      this.crossfadeAudio = null;
    }

    // Restore outgoing track volume
    if (this.audio) {
      this.audio.volume = 1.0;
    }

    this.isCrossfading = false;
    this.crossfadeFadeComplete = false;
    this.crossfadeStartTime = 0;
    this.outgoingBpm = null;
    this.incomingBpm = null;
  }

  private async nativeResume(): Promise<void> {
    console.log('[AudioPlayer] nativeResume: starting');
    const { tauriApi } = await import('./tauri-api');
    await this.ensureNativeAudio();
    if (!this.audioCtx) {
      console.error('[AudioPlayer] nativeResume: no audioCtx!');
      return;
    }

    // Start/restart position baseline and scheduling.
    this.nativeStartAudioTime = this.audioCtx.currentTime;
    this.nativeNextStartTime = this.audioCtx.currentTime;
    this.nativeEndedEmitted = false;

    console.log('[AudioPlayer] nativeResume: resuming audio context');
    await this.audioCtx.resume();
    this._isPlaying = true;
    this.onPlayStateChange?.(true);
    this.startNativePositionTimer();

    // Start backend streaming loop.
    console.log('[AudioPlayer] nativeResume: calling playbackPlay');
    await tauriApi.playbackPlay();
    console.log('[AudioPlayer] nativeResume: playback started');
  }

  private async nativePause(): Promise<void> {
    const { tauriApi } = await import('./tauri-api');
    if (!this.audioCtx) {
      this._isPlaying = false;
      this.onPlayStateChange?.(false);
      return;
    }

    // Capture current position baseline.
    const currentPos = this.nativeStartPositionMs + (this.audioCtx.currentTime - this.nativeStartAudioTime) * 1000;
    this._position = Math.max(0, currentPos);
    this.onPositionUpdate?.(this._position);
    this.nativeStartPositionMs = this._position;
    this.nativeStartAudioTime = this.audioCtx.currentTime;

    // Stop scheduled audio immediately and pause backend streaming.
    this.stopNativeSources();
    this.nativeNextStartTime = this.audioCtx.currentTime;
    this.stopNativePositionTimer();
    await tauriApi.playbackPause();
    await this.audioCtx.suspend();

    this._isPlaying = false;
    this.onPlayStateChange?.(false);
  }

  private async nativeSeek(positionMs: number): Promise<void> {
    const { tauriApi } = await import('./tauri-api');
    await this.ensureNativeAudio();
    if (!this.audioCtx) return;

    // Capture playing state before stopping sources
    const wasPlaying = this._isPlaying;

    // Stop currently scheduled audio and reset scheduling.
    this.stopNativeSources();
    this.nativeNextStartTime = this.audioCtx.currentTime;
    this.nativeStartPositionMs = Math.max(0, positionMs);
    this.nativeStartAudioTime = this.audioCtx.currentTime;
    this._position = this.nativeStartPositionMs;
    this.onPositionUpdate?.(this._position);
    this.nativeEndedEmitted = false;

    // AWAIT seek completion (backend increments generation to cancel old task)
    await tauriApi.playbackSeek(Math.floor(positionMs));

    // Only resume if we were playing AND seek succeeded
    if (wasPlaying) {
      // Small delay to ensure backend task cancellation propagated
      await new Promise(resolve => setTimeout(resolve, 100));
      await tauriApi.playbackResume();
    }
  }

  private async nativeStop(): Promise<void> {
    const { tauriApi } = await import('./tauri-api');
    this.stopNativeSources();
    this.stopNativePositionTimer();
    this.nativeEndedEmitted = false;
    if (this.audioCtx) {
      this.nativeNextStartTime = this.audioCtx.currentTime;
    }
    this._isPlaying = false;
    this._position = 0;
    this.onPlayStateChange?.(false);
    this.onPositionUpdate?.(0);
    await tauriApi.playbackStop();
  }
}

// Global audio player instance
export const audioPlayer = new AudioPlayer();
