ALTER TABLE "group_combat_sessions"
ADD COLUMN "guild_weekly_goal_eligible" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "guild_weekly_goal_periods" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "guild_id" TEXT NOT NULL,
  "period_key" TEXT NOT NULL,
  "goal_key" TEXT NOT NULL,
  "guild_name_snapshot" TEXT NOT NULL,
  "guild_crest_snapshot" TEXT NOT NULL,
  "target_count" INTEGER NOT NULL,
  "progress_count" INTEGER NOT NULL DEFAULT 0,
  "completed_at" DATETIME,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  CONSTRAINT "guild_weekly_goal_periods_guild_id_fkey"
    FOREIGN KEY ("guild_id") REFERENCES "guilds" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "guild_weekly_contributions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "period_id" TEXT NOT NULL,
  "guild_id" TEXT NOT NULL,
  "group_combat_session_id" TEXT NOT NULL,
  "expedition_completed_at" DATETIME NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "guild_weekly_contributions_period_id_fkey"
    FOREIGN KEY ("period_id") REFERENCES "guild_weekly_goal_periods" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "guild_weekly_contributions_guild_id_fkey"
    FOREIGN KEY ("guild_id") REFERENCES "guilds" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "guild_weekly_contributions_group_combat_session_id_fkey"
    FOREIGN KEY ("group_combat_session_id") REFERENCES "group_combat_sessions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "guild_weekly_contributor_receipts" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "contribution_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "character_id" TEXT NOT NULL,
  "remort_count" INTEGER NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "guild_weekly_contributor_receipts_contribution_id_fkey"
    FOREIGN KEY ("contribution_id") REFERENCES "guild_weekly_contributions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "guild_weekly_goal_periods_guild_id_period_key_goal_key_key"
ON "guild_weekly_goal_periods"("guild_id", "period_key", "goal_key");
CREATE INDEX "guild_weekly_goal_periods_period_key_completed_at_idx"
ON "guild_weekly_goal_periods"("period_key", "completed_at");
CREATE UNIQUE INDEX "guild_weekly_contributions_group_combat_session_id_key"
ON "guild_weekly_contributions"("group_combat_session_id");
CREATE UNIQUE INDEX "guild_weekly_contributions_period_id_group_combat_session_id_key"
ON "guild_weekly_contributions"("period_id", "group_combat_session_id");
CREATE INDEX "guild_weekly_contributions_guild_id_expedition_completed_at_idx"
ON "guild_weekly_contributions"("guild_id", "expedition_completed_at");
CREATE UNIQUE INDEX "guild_weekly_contributor_receipts_contribution_id_user_id_key"
ON "guild_weekly_contributor_receipts"("contribution_id", "user_id");
CREATE INDEX "guild_weekly_contributor_receipts_user_id_created_at_idx"
ON "guild_weekly_contributor_receipts"("user_id", "created_at");
