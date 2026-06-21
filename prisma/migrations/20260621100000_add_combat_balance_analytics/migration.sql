CREATE TABLE "combat_balance_battles" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "combat_id" TEXT NOT NULL,
  "combat_source" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "started_at" DATETIME NOT NULL,
  "finished_at" DATETIME NOT NULL,
  "balance_version" TEXT NOT NULL,
  "combat_engine_version" TEXT NOT NULL,
  "analytics_schema_version" INTEGER NOT NULL,
  "player_analysis_key" TEXT NOT NULL,
  "character_id" TEXT NOT NULL,
  "is_test_or_admin" BOOLEAN NOT NULL DEFAULT false,
  "class_key" TEXT NOT NULL,
  "player_level" INTEGER NOT NULL,
  "remort_count" INTEGER NOT NULL,
  "player_max_hp" INTEGER NOT NULL,
  "player_hp_at_start" INTEGER NOT NULL,
  "player_hp_at_end" INTEGER NOT NULL,
  "player_mana_max" INTEGER NOT NULL,
  "player_mana_at_start" INTEGER NOT NULL,
  "player_stats_json" JSONB NOT NULL,
  "player_equipment_json" JSONB NOT NULL,
  "mob_template_key" TEXT NOT NULL,
  "mob_type" TEXT NOT NULL,
  "mob_level" INTEGER NOT NULL,
  "mob_base_level" INTEGER,
  "mob_difficulty_tier" TEXT NOT NULL,
  "mob_max_hp" INTEGER NOT NULL,
  "mob_hp_at_end" INTEGER NOT NULL,
  "rounds_count" INTEGER NOT NULL,
  "player_actions_count" INTEGER NOT NULL,
  "manual_player_actions_count" INTEGER NOT NULL DEFAULT 0,
  "timeout_auto_actions_count" INTEGER NOT NULL DEFAULT 0,
  "timeout_skip_actions_count" INTEGER NOT NULL DEFAULT 0,
  "enemy_actions_count" INTEGER NOT NULL,
  "damage_dealt" INTEGER NOT NULL,
  "damage_taken" INTEGER NOT NULL,
  "healing_done" INTEGER NOT NULL DEFAULT 0,
  "critical_hits" INTEGER NOT NULL DEFAULT 0,
  "misses" INTEGER NOT NULL DEFAULT 0,
  "duplicate_write_attempts" INTEGER NOT NULL DEFAULT 0,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "combat_balance_battles_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "combat_balance_ability_usages" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "battle_id" TEXT NOT NULL,
  "combat_id" TEXT NOT NULL,
  "ability_key" TEXT NOT NULL,
  "action_origin" TEXT NOT NULL DEFAULT 'manual',
  "ability_rank" INTEGER NOT NULL DEFAULT 0,
  "is_class_ability" BOOLEAN NOT NULL DEFAULT false,
  "uses_count" INTEGER NOT NULL,
  "successful_uses_count" INTEGER NOT NULL,
  "hit_count" INTEGER NOT NULL DEFAULT 0,
  "crit_count" INTEGER NOT NULL DEFAULT 0,
  "miss_count" INTEGER NOT NULL DEFAULT 0,
  "total_damage" INTEGER NOT NULL DEFAULT 0,
  "total_healing" INTEGER NOT NULL DEFAULT 0,
  "resource_spent" INTEGER NOT NULL DEFAULT 0,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "combat_balance_ability_usages_battle_id_fkey" FOREIGN KEY ("battle_id") REFERENCES "combat_balance_battles" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "combat_balance_battles_combat_id_key" ON "combat_balance_battles"("combat_id");
CREATE INDEX "combat_balance_battles_finished_at_idx" ON "combat_balance_battles"("finished_at");
CREATE INDEX "combat_balance_battles_balance_version_class_key_player_level_remort_count_idx" ON "combat_balance_battles"("balance_version", "class_key", "player_level", "remort_count");
CREATE INDEX "combat_balance_battles_combat_source_finished_at_idx" ON "combat_balance_battles"("combat_source", "finished_at");
CREATE INDEX "combat_balance_battles_mob_template_key_mob_level_idx" ON "combat_balance_battles"("mob_template_key", "mob_level");
CREATE UNIQUE INDEX "combat_balance_ability_usages_combat_id_ability_key_ability_rank_action_origin_key" ON "combat_balance_ability_usages"("combat_id", "ability_key", "ability_rank", "action_origin");
CREATE INDEX "combat_balance_ability_usages_battle_id_idx" ON "combat_balance_ability_usages"("battle_id");
CREATE INDEX "combat_balance_ability_usages_ability_key_action_origin_idx" ON "combat_balance_ability_usages"("ability_key", "action_origin");
