CREATE TABLE "noncombat_priest_aid_actions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "actor_character_id" TEXT NOT NULL,
  "target_character_id" TEXT NOT NULL,
  "actor_telegram_user_id" BIGINT NOT NULL,
  "target_telegram_user_id" BIGINT NOT NULL,
  "actor_name" TEXT NOT NULL,
  "target_name" TEXT NOT NULL,
  "actor_remort_count" INTEGER NOT NULL DEFAULT 0,
  "target_remort_count" INTEGER NOT NULL DEFAULT 0,
  "action_kind" TEXT NOT NULL,
  "technique_id" TEXT NOT NULL,
  "rules_version" TEXT NOT NULL,
  "location_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'completed',
  "heal_amount" INTEGER NOT NULL DEFAULT 0,
  "mana_cost" INTEGER NOT NULL DEFAULT 0,
  "blessing_id" TEXT,
  "result_json" JSONB,
  "cooldown_available_at" DATETIME NOT NULL,
  "completed_at" DATETIME NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  CONSTRAINT "noncombat_priest_aid_actions_actor_character_id_fkey" FOREIGN KEY ("actor_character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "noncombat_priest_aid_actions_target_character_id_fkey" FOREIGN KEY ("target_character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "noncombat_priest_aid_actions_actor_character_id_action_kind_completed_at_idx" ON "noncombat_priest_aid_actions"("actor_character_id", "action_kind", "completed_at");
CREATE INDEX "noncombat_priest_aid_actions_target_character_id_action_kind_completed_at_idx" ON "noncombat_priest_aid_actions"("target_character_id", "action_kind", "completed_at");

CREATE TABLE "noncombat_priest_blessings" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "actor_character_id" TEXT NOT NULL,
  "target_character_id" TEXT NOT NULL,
  "actor_telegram_user_id" BIGINT NOT NULL,
  "target_telegram_user_id" BIGINT NOT NULL,
  "actor_name" TEXT NOT NULL,
  "target_name" TEXT NOT NULL,
  "actor_remort_count" INTEGER NOT NULL DEFAULT 0,
  "target_remort_count" INTEGER NOT NULL DEFAULT 0,
  "technique_id" TEXT NOT NULL,
  "rules_version" TEXT NOT NULL,
  "location_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "active_guard" TEXT,
  "bonus_stat" TEXT,
  "bonus_amount" INTEGER NOT NULL DEFAULT 0,
  "result_json" JSONB,
  "started_at" DATETIME NOT NULL,
  "expires_at" DATETIME NOT NULL,
  "ended_at" DATETIME,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  CONSTRAINT "noncombat_priest_blessings_actor_character_id_fkey" FOREIGN KEY ("actor_character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "noncombat_priest_blessings_target_character_id_fkey" FOREIGN KEY ("target_character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "noncombat_priest_blessings_active_guard_key" ON "noncombat_priest_blessings"("active_guard");
CREATE INDEX "noncombat_priest_blessings_target_character_id_status_expires_at_idx" ON "noncombat_priest_blessings"("target_character_id", "status", "expires_at");
CREATE INDEX "noncombat_priest_blessings_actor_character_id_started_at_idx" ON "noncombat_priest_blessings"("actor_character_id", "started_at");

CREATE TABLE "noncombat_rogue_pickpocket_attempts" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "actor_character_id" TEXT NOT NULL,
  "target_character_id" TEXT NOT NULL,
  "actor_telegram_user_id" BIGINT NOT NULL,
  "target_telegram_user_id" BIGINT NOT NULL,
  "actor_name" TEXT NOT NULL,
  "target_name" TEXT NOT NULL,
  "actor_remort_count" INTEGER NOT NULL DEFAULT 0,
  "target_remort_count" INTEGER NOT NULL DEFAULT 0,
  "technique_id" TEXT NOT NULL,
  "rules_version" TEXT NOT NULL,
  "location_id" TEXT NOT NULL,
  "local_date" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'completed',
  "outcome" TEXT NOT NULL,
  "stolen_gold" INTEGER NOT NULL DEFAULT 0,
  "actor_hp_after" INTEGER,
  "stat_snapshot_json" JSONB NOT NULL,
  "result_json" JSONB,
  "cooldown_available_at" DATETIME NOT NULL,
  "completed_at" DATETIME NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  CONSTRAINT "noncombat_rogue_pickpocket_attempts_actor_character_id_fkey" FOREIGN KEY ("actor_character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "noncombat_rogue_pickpocket_attempts_target_character_id_fkey" FOREIGN KEY ("target_character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "noncombat_rogue_pickpocket_attempts_actor_character_id_target_character_id_local_date_key" ON "noncombat_rogue_pickpocket_attempts"("actor_character_id", "target_character_id", "local_date");
CREATE INDEX "noncombat_rogue_pickpocket_attempts_actor_character_id_completed_at_idx" ON "noncombat_rogue_pickpocket_attempts"("actor_character_id", "completed_at");
CREATE INDEX "noncombat_rogue_pickpocket_attempts_target_character_id_completed_at_idx" ON "noncombat_rogue_pickpocket_attempts"("target_character_id", "completed_at");
