// Tauri command modules

pub mod ai;
pub mod analysis;
pub mod genre;
pub mod library;
pub mod playback;
pub mod playlists;
pub mod settings;
pub mod watcher;

// Re-export commonly used items
pub use library::{AppState, TrackDTO};
pub use playback::PlaybackState;
pub use watcher::WatcherState;
