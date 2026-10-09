// src-tauri/src/formats/mod.rs
// Export to DJ software (docs/superpowers/specs/2026-10-09-dj-export-design.md):
// the playlists a DJ picks, with their tracks' data, as one model that each
// program's writer turns into its own format. collect reads the database,
// mark_missing looks at the disk, and the writers touch neither.

pub mod keys;
mod xml;
