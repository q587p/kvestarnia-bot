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
  "dev_override_completed_at" DATETIME,
  "dev_override_user_id" TEXT,
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

CREATE TABLE "guild_weekly_participant_snapshots" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "session_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "character_id" TEXT NOT NULL,
  "remort_count" INTEGER NOT NULL,
  "roster_order" INTEGER NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "guild_weekly_participant_snapshots_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "group_combat_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "guild_weekly_participant_snapshots" (
  "id", "session_id", "user_id", "character_id", "remort_count", "roster_order"
)
SELECT
  lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' ||
  substr(lower(hex(randomblob(2))), 2) || '-' ||
  substr('89ab', abs(random()) % 4 + 1, 1) ||
  substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
  participant."session_id",
  character."user_id",
  participant."character_id",
  participant."remort_count",
  COALESCE(participant."roster_order", 0)
FROM "group_combat_participants" AS participant
JOIN "characters" AS character ON character."id" = participant."character_id"
JOIN "group_combat_sessions" AS session ON session."id" = participant."session_id"
WHERE session."guild_weekly_goal_eligible" = true;

CREATE TABLE "guild_weekly_reconciliations" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "session_id" TEXT NOT NULL,
  "decision" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "period_key" TEXT,
  "reconciled_at" DATETIME NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "guild_weekly_reconciliations_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "group_combat_sessions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "guild_glory_receipts" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "guild_id" TEXT NOT NULL,
  "period_id" TEXT NOT NULL,
  "source_key" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "awarded_at" DATETIME NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "guild_glory_receipts_guild_id_fkey"
    FOREIGN KEY ("guild_id") REFERENCES "guilds" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "guild_glory_receipts_period_id_fkey"
    FOREIGN KEY ("period_id") REFERENCES "guild_weekly_goal_periods" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "guild_weekly_achievement_entitlements" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "achievement_id" TEXT NOT NULL,
  "source_period_id" TEXT NOT NULL,
  "source_period_key" TEXT NOT NULL,
  "entitled_at" DATETIME NOT NULL,
  "projected_character_id" TEXT,
  "projected_remort_count" INTEGER,
  "projected_at" DATETIME,
  "notification_claim_token" TEXT,
  "notification_claimed_until" DATETIME,
  "notified_at" DATETIME,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "guild_weekly_achievement_entitlements_source_period_id_fkey"
    FOREIGN KEY ("source_period_id") REFERENCES "guild_weekly_goal_periods" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
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
CREATE UNIQUE INDEX "guild_weekly_participant_snapshots_session_id_user_id_key"
ON "guild_weekly_participant_snapshots"("session_id", "user_id");
CREATE UNIQUE INDEX "guild_weekly_participant_snapshots_session_id_roster_order_key"
ON "guild_weekly_participant_snapshots"("session_id", "roster_order");
CREATE INDEX "guild_weekly_participant_snapshots_user_id_session_id_idx"
ON "guild_weekly_participant_snapshots"("user_id", "session_id");
CREATE UNIQUE INDEX "guild_weekly_reconciliations_session_id_key"
ON "guild_weekly_reconciliations"("session_id");
CREATE INDEX "guild_weekly_reconciliations_reconciled_at_session_id_idx"
ON "guild_weekly_reconciliations"("reconciled_at", "session_id");
CREATE UNIQUE INDEX "guild_glory_receipts_period_id_key"
ON "guild_glory_receipts"("period_id");
CREATE UNIQUE INDEX "guild_glory_receipts_source_key_key"
ON "guild_glory_receipts"("source_key");
CREATE INDEX "guild_glory_receipts_guild_id_awarded_at_idx"
ON "guild_glory_receipts"("guild_id", "awarded_at");
CREATE UNIQUE INDEX "guild_weekly_achievement_entitlements_user_id_achievement_id_key"
ON "guild_weekly_achievement_entitlements"("user_id", "achievement_id");
CREATE INDEX "guild_weekly_achievement_entitlements_notified_at_notification_claimed_until_entitled_at_id_idx"
ON "guild_weekly_achievement_entitlements"("notified_at", "notification_claimed_until", "entitled_at", "id");
CREATE INDEX "guild_weekly_achievement_entitlements_user_id_projected_character_id_notified_at_idx"
ON "guild_weekly_achievement_entitlements"("user_id", "projected_character_id", "notified_at");
CREATE INDEX "group_combat_sessions_guild_weekly_goal_eligible_completed_at_id_idx"
ON "group_combat_sessions"("guild_weekly_goal_eligible", "completed_at", "id");
