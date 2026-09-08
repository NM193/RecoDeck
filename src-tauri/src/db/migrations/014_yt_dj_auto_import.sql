-- Migration 014: import a watched DJ's new sets without being asked
--
-- Off by default, like every other spending switch in this feature. A set is
-- 5-7 units to fetch and parse, so a search that turns up seven of them is
-- another fifty on top of the hundred the search itself cost. That is fine when
-- it was asked for and rude when it was not.

ALTER TABLE yt_watched_djs ADD COLUMN auto_import INTEGER NOT NULL DEFAULT 0;
