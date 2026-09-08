-- Migration 011: how often a followed channel is checked on its own
--
-- 0 means never — the default, so installing the app never starts spending
-- someone's quota without them asking. 24 is daily, 168 weekly.
--
-- A check costs one to two units per channel, so ten channels checked daily is
-- roughly twenty units against a ten-thousand allowance. The interval is
-- honoured off last_checked, which means a manual check counts and the
-- automatic one does not repeat it.

ALTER TABLE yt_channels ADD COLUMN check_interval_hours INTEGER NOT NULL DEFAULT 0;
