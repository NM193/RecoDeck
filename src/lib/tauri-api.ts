// Tauri API wrapper for invoking backend commands

import { invoke } from "@tauri-apps/api/core";
import type { Track, ScanResult, BpmResult, KeyResult, TrackAnalysis, FolderInfo, Playlist, GenreCount, GenreDefinition } from "../types/track";
import type { ChatMessage, GeneratedPlaylist } from "../types/ai";

export const tauriApi = {
  // Database commands
  async initDatabase(dbPath: string): Promise<string> {
    return await invoke("init_database", { dbPath });
  },

  async getAllTracks(): Promise<Track[]> {
    return await invoke("get_all_tracks");
  },

  async getTracksPaginated(limit: number, offset: number): Promise<Track[]> {
    return await invoke("get_tracks_paginated", { limit, offset });
  },

  async getTrack(id: number): Promise<Track> {
    return await invoke("get_track", { id });
  },

  async updateTrack(track: Track): Promise<void> {
    return await invoke("update_track", { track });
  },

  async deleteTrack(id: number): Promise<void> {
    return await invoke("delete_track", { id });
  },

  async countTracks(): Promise<number> {
    return await invoke("count_tracks");
  },

  // Search command (backend SQL search for future use with large libraries)
  async searchTracks(query: string): Promise<Track[]> {
    return await invoke("search_tracks", { query });
  },

  // Scanner commands
  async scanDirectory(path: string): Promise<ScanResult> {
    return await invoke("scan_directory", { path });
  },

  async listAudioFiles(path: string): Promise<string[]> {
    return await invoke("list_audio_files", { path });
  },

  // Settings commands
  async getSetting(key: string): Promise<string | null> {
    return await invoke("get_setting", { key });
  },

  async setSetting(key: string, value: string): Promise<void> {
    return await invoke("set_setting", { key, value });
  },

  async getLibraryFolders(): Promise<string[]> {
    return await invoke("get_library_folders");
  },

  async addLibraryFolder(path: string): Promise<string[]> {
    return await invoke("add_library_folder", { path });
  },

  async removeLibraryFolder(path: string): Promise<string[]> {
    return await invoke("remove_library_folder", { path });
  },

  async getTheme(): Promise<string> {
    return await invoke("get_theme");
  },

  async setTheme(theme: string): Promise<void> {
    return await invoke("set_theme", { theme });
  },

  // Folder tree commands
  async listSubdirectories(path: string): Promise<FolderInfo[]> {
    return await invoke("list_subdirectories", { path });
  },

  async getTracksInFolder(path: string): Promise<Track[]> {
    return await invoke("get_tracks_in_folder", { path });
  },

  async countTracksInFolder(path: string): Promise<number> {
    return await invoke("count_tracks_in_folder", { path });
  },

  async getTracksInFolderShallow(path: string): Promise<Track[]> {
    return await invoke("get_tracks_in_folder_shallow", { path });
  },

  async countTracksInFolderShallow(path: string): Promise<number> {
    return await invoke("count_tracks_in_folder_shallow", { path });
  },

  // Cleanup command - removes tracks not in library folders
  async cleanupStrayTracks(): Promise<number> {
    return await invoke("cleanup_stray_tracks");
  },

  // Cleanup command - removes duplicate tracks (same file hash or filename)
  async cleanupDuplicateTracks(): Promise<number> {
    return await invoke("cleanup_duplicate_tracks");
  },

  // Normalize file paths - removes double slashes from stored paths
  async normalizeFilePaths(): Promise<number> {
    return await invoke("normalize_file_paths");
  },

  // Debug: get all tracks with their hashes (for troubleshooting)
  async getDebugTracks(): Promise<{ id: number; file_path: string; file_hash: string; filename: string }[]> {
    return await invoke("get_debug_tracks");
  },

  // Playlist commands
  async createPlaylist(name: string, parentId?: number | null): Promise<Playlist> {
    return await invoke("create_playlist", { name, parentId: parentId ?? null });
  },

  async createPlaylistFolder(name: string, parentId?: number | null): Promise<Playlist> {
    return await invoke("create_playlist_folder", { name, parentId: parentId ?? null });
  },

  async getAllPlaylists(): Promise<Playlist[]> {
    return await invoke("get_all_playlists");
  },

  async renamePlaylist(id: number, name: string): Promise<void> {
    return await invoke("rename_playlist", { id, name });
  },

  async deletePlaylist(id: number): Promise<void> {
    return await invoke("delete_playlist", { id });
  },

  async getPlaylistTracks(playlistId: number): Promise<Track[]> {
    return await invoke("get_playlist_tracks", { playlistId });
  },

  async addTrackToPlaylist(playlistId: number, trackId: number): Promise<void> {
    return await invoke("add_track_to_playlist", { playlistId, trackId });
  },

  async removeTrackFromPlaylist(playlistId: number, trackId: number): Promise<void> {
    return await invoke("remove_track_from_playlist", { playlistId, trackId });
  },

  // File watcher commands
  async startFileWatcher(folders: string[]): Promise<void> {
    return await invoke("start_file_watcher", { folders });
  },

  // Analysis commands
  async analyzeBpm(trackId: number): Promise<BpmResult> {
    return await invoke("analyze_bpm", { trackId });
  },

  async analyzeAllBpm(): Promise<BpmResult[]> {
    return await invoke("analyze_all_bpm");
  },

  async analyzeKey(trackId: number): Promise<KeyResult> {
    return await invoke("analyze_key", { trackId });
  },

  async analyzeAllKeys(): Promise<KeyResult[]> {
    return await invoke("analyze_all_keys");
  },

  async getTrackAnalysis(trackId: number): Promise<TrackAnalysis | null> {
    return await invoke("get_track_analysis", { trackId });
  },

  async analyzeWaveform(trackId: number): Promise<void> {
    return await invoke("analyze_waveform", { trackId });
  },

  async getWaveform(trackId: number, level: string): Promise<Uint8Array | null> {
    const result = await invoke<number[] | null>("get_waveform", { trackId, level });
    if (result === null) return null;
    return new Uint8Array(result);
  },

  // Playback commands (native decode/streaming)
  async playbackLoadTrack(trackId: number): Promise<{
    is_playing: boolean;
    track_id: number | null;
    position_ms: number;
    duration_ms: number;
    sample_rate: number;
  }> {
    return await invoke("load_track", { trackId });
  },

  async playbackPlay(): Promise<{
    is_playing: boolean;
    track_id: number | null;
    position_ms: number;
    duration_ms: number;
    sample_rate: number;
  }> {
    return await invoke("play");
  },

  async playbackPause(): Promise<{
    is_playing: boolean;
    track_id: number | null;
    position_ms: number;
    duration_ms: number;
    sample_rate: number;
  }> {
    return await invoke("pause");
  },

  async playbackResume(): Promise<{
    is_playing: boolean;
    track_id: number | null;
    position_ms: number;
    duration_ms: number;
    sample_rate: number;
  }> {
    return await invoke("resume");
  },

  async playbackSeek(positionMs: number): Promise<{
    is_playing: boolean;
    track_id: number | null;
    position_ms: number;
    duration_ms: number;
    sample_rate: number;
  }> {
    return await invoke("seek", { positionMs });
  },

  async playbackStop(): Promise<{
    is_playing: boolean;
    track_id: number | null;
    position_ms: number;
    duration_ms: number;
    sample_rate: number;
  }> {
    return await invoke("stop");
  },

  async playbackStatus(): Promise<{
    is_playing: boolean;
    track_id: number | null;
    position_ms: number;
    duration_ms: number;
    sample_rate: number;
  }> {
    return await invoke("get_playback_status");
  },

  // AI commands
  async setAIApiKey(apiKey: string): Promise<void> {
    return await invoke("set_ai_api_key", { apiKey });
  },

  async getAIApiKeyStatus(): Promise<boolean> {
    return await invoke("get_ai_api_key_status");
  },

  async deleteAIApiKey(): Promise<void> {
    return await invoke("delete_ai_api_key");
  },

  async rebuildAIContext(): Promise<void> {
    return await invoke("rebuild_ai_context");
  },

  async aiGeneratePlaylist(prompt: string): Promise<GeneratedPlaylist> {
    return await invoke("ai_generate_playlist", { prompt });
  },

  async aiChat(message: string, conversationHistory: ChatMessage[]): Promise<string> {
    return await invoke("ai_chat", { message, conversationHistory });
  },

  // Genre commands
  async setTrackGenre(trackId: number, genre: string): Promise<void> {
    return await invoke("set_track_genre", { trackId, genre });
  },

  async clearTrackGenre(trackId: number): Promise<void> {
    return await invoke("clear_track_genre", { trackId });
  },

  async getGenresWithCounts(): Promise<GenreCount[]> {
    return await invoke("get_genres_with_counts");
  },

  async getTracksByGenre(genre: string): Promise<Track[]> {
    return await invoke("get_tracks_by_genre", { genre });
  },

  async createGenreDefinition(name: string, color?: string): Promise<number> {
    return await invoke("create_genre_definition", { name, color: color || null });
  },

  async getGenreDefinitions(): Promise<GenreDefinition[]> {
    return await invoke("get_genre_definitions");
  },

  async deleteGenreDefinition(id: number): Promise<void> {
    return await invoke("delete_genre_definition", { id });
  },

  async renameGenreDefinition(id: number, newName: string): Promise<void> {
    return await invoke("rename_genre_definition", { id, newName });
  },

  async bulkSetGenre(trackIds: number[], genre: string): Promise<number> {
    return await invoke("bulk_set_genre", { trackIds, genre });
  },
};
