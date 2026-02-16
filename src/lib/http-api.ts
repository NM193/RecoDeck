// HTTP API wrapper for the mobile companion server
// Mirrors the tauriApi interface but uses fetch() over HTTP instead of Tauri IPC.
// Only includes read-only methods needed by the mobile PWA.

import type { Track } from "../types/track";

// Mobile track type — matches MobileTrackDTO from the server (no file_path)
export interface MobileTrack {
  id: number;
  title?: string;
  artist?: string;
  album?: string;
  album_artist?: string;
  track_number?: number;
  year?: number;
  label?: string;
  duration_ms?: number;
  file_format?: string;
  bitrate?: number;
  sample_rate?: number;
  file_size?: number;
  play_count: number;
  rating: number;
  genre?: string;
  filename: string;
  bpm?: number;
  musical_key?: string;
}

interface ServerStatus {
  name: string;
  version: string;
  track_count: number;
}

interface StreamTicketResponse {
  ticket: string;
  expires_in: number;
  stream_url: string;
}

let _baseUrl = "";
let _token = "";

/** Convert MobileTrack to Track interface (filling in missing fields with defaults) */
function mobileTrackToTrack(mt: MobileTrack): Track {
  return {
    id: mt.id,
    file_path: "", // not exposed by server
    file_hash: "",
    title: mt.title,
    artist: mt.artist,
    album: mt.album,
    album_artist: mt.album_artist,
    track_number: mt.track_number,
    year: mt.year,
    label: mt.label,
    duration_ms: mt.duration_ms,
    file_format: mt.file_format,
    bitrate: mt.bitrate,
    sample_rate: mt.sample_rate,
    file_size: mt.file_size,
    play_count: mt.play_count,
    rating: mt.rating,
    genre: mt.genre,
    bpm: mt.bpm,
    musical_key: mt.musical_key,
  };
}

async function authFetch(path: string, options?: RequestInit): Promise<Response> {
  const res = await fetch(`${_baseUrl}${path}`, {
    ...options,
    headers: {
      ...options?.headers,
      Authorization: `Bearer ${_token}`,
      "Content-Type": "application/json",
    },
  });

  if (res.status === 401) {
    throw new Error("Unauthorized — invalid or expired token");
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  return res;
}

export const httpApi = {
  /** Configure the server connection */
  configure(baseUrl: string, token: string) {
    _baseUrl = baseUrl.replace(/\/+$/, "");
    _token = token;
  },

  /** Get base URL */
  getBaseUrl(): string {
    return _baseUrl;
  },

  /** Check connection to the server */
  async getStatus(): Promise<ServerStatus> {
    const res = await authFetch("/api/status");
    return res.json();
  },

  /** Get paginated tracks */
  async getTracksPaginated(limit: number, offset: number): Promise<Track[]> {
    const res = await authFetch(`/api/tracks?limit=${limit}&offset=${offset}`);
    const mobileTracks: MobileTrack[] = await res.json();
    return mobileTracks.map(mobileTrackToTrack);
  },

  /** Search tracks */
  async searchTracks(query: string): Promise<Track[]> {
    const res = await authFetch(
      `/api/tracks/search?q=${encodeURIComponent(query)}`
    );
    const mobileTracks: MobileTrack[] = await res.json();
    return mobileTracks.map(mobileTrackToTrack);
  },

  /** Get a single track */
  async getTrack(id: number): Promise<Track> {
    const res = await authFetch(`/api/tracks/${id}`);
    const mt: MobileTrack = await res.json();
    return mobileTrackToTrack(mt);
  },

  /** Request a stream ticket for audio playback */
  async getStreamTicket(trackId: number): Promise<StreamTicketResponse> {
    const res = await authFetch("/api/stream-ticket", {
      method: "POST",
      body: JSON.stringify({ track_id: trackId }),
    });
    return res.json();
  },

  /** Get the full stream URL with ticket for an audio element */
  async getStreamUrl(trackId: number): Promise<string> {
    const ticket = await this.getStreamTicket(trackId);
    return `${_baseUrl}/stream/${trackId}?ticket=${ticket.ticket}`;
  },
};
