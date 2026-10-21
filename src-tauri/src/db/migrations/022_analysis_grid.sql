-- Migration 022 (spec 2026-10-17, §4): the beat grid, and which analysis
-- version produced a row's values. NULL: from tags, or from analysis before
-- versions. A BPM of 0 was a failed analysis: cleared so it is retried.
ALTER TABLE track_analysis ADD COLUMN first_beat_ms REAL;
ALTER TABLE track_analysis ADD COLUMN analysis_version INTEGER;
UPDATE track_analysis SET bpm = NULL, bpm_confidence = NULL WHERE bpm = 0;
