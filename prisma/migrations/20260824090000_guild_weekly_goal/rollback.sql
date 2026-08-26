DROP INDEX IF EXISTS "guild_weekly_achievement_entitlements_source_period_id_idx";
DROP TABLE IF EXISTS "guild_weekly_achievement_entitlements";
DROP TABLE IF EXISTS "guild_glory_receipts";
DROP TABLE IF EXISTS "guild_weekly_reconciliations";
DROP TABLE IF EXISTS "guild_weekly_participant_snapshots";
DROP TABLE IF EXISTS "guild_weekly_contributor_receipts";
DROP TABLE IF EXISTS "guild_weekly_contributions";
DROP TABLE IF EXISTS "guild_weekly_goal_periods";

DROP INDEX IF EXISTS "group_combat_sessions_guild_weekly_goal_eligible_completed_at_id_idx";

ALTER TABLE "group_combat_sessions"
DROP COLUMN "guild_weekly_goal_eligible";
