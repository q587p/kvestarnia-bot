import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Prisma schema", () => {
  it("represents DailyAction uniqueness for once-per-day rewards", () => {
    const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");

    expect(schema).toContain("model DailyAction");
    expect(schema).toContain("@@unique([characterId, key, localDate])");
    expect(schema).toContain("@map(\"local_date\")");
    expect(schema).toContain("@map(\"reward_xp\")");
    expect(schema).toContain("@map(\"reward_gold\")");
  });

  it("represents persistent character inventory rows", () => {
    const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");

    expect(schema).toContain("model CharacterItem");
    expect(schema).toContain("items     CharacterItem[]");
    expect(schema).toContain("@map(\"character_id\")");
    expect(schema).toContain("@map(\"item_id\")");
    expect(schema).toContain("@@unique([characterId, itemId])");
    expect(schema).toContain("@@map(\"character_items\")");
  });

  it("stores the hidden character path without exposing it as UI text", () => {
    const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");
    const migration = readFileSync(
      join(
        process.cwd(),
        "prisma",
        "migrations",
        "20260612193000_add_character_path",
        "migration.sql"
      ),
      "utf8"
    );

    expect(schema).toContain("path      String   @default(\"boundary\")");
    expect(migration).toContain("ADD COLUMN \"path\" TEXT NOT NULL DEFAULT 'boundary'");
    expect(migration).toContain("WHEN 'he' THEN 'sun'");
    expect(migration).toContain("WHEN 'she' THEN 'moon'");
  });

  it("stores lightweight user presence fields", () => {
    const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");
    const migration = readFileSync(
      join(
        process.cwd(),
        "prisma",
        "migrations",
        "20260613001000_add_user_presence",
        "migration.sql"
      ),
      "utf8"
    );

    expect(schema).toContain("lastActionAt");
    expect(schema).toContain("@map(\"last_action_at\")");
    expect(schema).toContain("lastSeenLocationId");
    expect(schema).toContain("currentRaidId");
    expect(schema).toContain("currentAdventureId");
    expect(migration).toContain("ADD COLUMN \"last_action_at\"");
    expect(migration).toContain("ADD COLUMN \"last_seen_location_id\"");
    expect(migration).toContain("ADD COLUMN \"current_raid_id\"");
    expect(migration).toContain("ADD COLUMN \"current_adventure_id\"");
  });

  it("stores character cooldowns for repeatable activities", () => {
    const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");
    const migration = readFileSync(
      join(
        process.cwd(),
        "prisma",
        "migrations",
        "20260613052000_add_character_cooldowns",
        "migration.sql"
      ),
      "utf8"
    );

    expect(schema).toContain("model CharacterCooldown");
    expect(schema).toContain("cooldowns CharacterCooldown[]");
    expect(schema).toContain("@map(\"available_at\")");
    expect(schema).toContain("@@unique([characterId, key])");
    expect(schema).toContain("@@map(\"character_cooldowns\")");
    expect(migration).toContain("CREATE TABLE \"character_cooldowns\"");
    expect(migration).toContain("CREATE UNIQUE INDEX \"character_cooldowns_character_id_key_key\"");
  });

  it("stores korchma round purchases for generosity leaderboards", () => {
    const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");
    const migration = readFileSync(
      join(
        process.cwd(),
        "prisma",
        "migrations",
        "20260613124000_add_korchma_round_purchases",
        "migration.sql"
      ),
      "utf8"
    );

    expect(schema).toContain("model KorchmaRoundPurchase");
    expect(schema).toContain("korchmaRoundPurchases KorchmaRoundPurchase[]");
    expect(schema).toContain("@map(\"spent_gold\")");
    expect(schema).toContain("@map(\"local_date\")");
    expect(schema).toContain("@@map(\"korchma_round_purchases\")");
    expect(migration).toContain("CREATE TABLE \"korchma_round_purchases\"");
    expect(migration).toContain("CREATE INDEX \"korchma_round_purchases_local_date_idx\"");
  });

  it("stores persistent equipment rows per character slot", () => {
    const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");
    const migration = readFileSync(
      join(
        process.cwd(),
        "prisma",
        "migrations",
        "20260613210000_add_character_equipment",
        "migration.sql"
      ),
      "utf8"
    );

    expect(schema).toContain("model CharacterEquipment");
    expect(schema).toContain("equipment CharacterEquipment[]");
    expect(schema).toContain("@map(\"character_id\")");
    expect(schema).toContain("@map(\"item_id\")");
    expect(schema).toContain("@@unique([characterId, slot])");
    expect(schema).toContain("@@map(\"character_equipment\")");
    expect(migration).toContain("CREATE TABLE \"character_equipment\"");
    expect(migration).toContain("CREATE UNIQUE INDEX \"character_equipment_character_id_slot_key\"");
    expect(migration).toContain("CREATE INDEX \"character_equipment_item_id_idx\"");
  });

  it("stores Hunt Board contract ledger rows per character period", () => {
    const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");
    const migration = readFileSync(
      join(
        process.cwd(),
        "prisma",
        "migrations",
        "20260614130000_add_hunt_contracts",
        "migration.sql"
      ),
      "utf8"
    );

    expect(schema).toContain("model HuntContract");
    expect(schema).toContain("huntContracts HuntContract[]");
    expect(schema).toContain("@map(\"local_period_id\")");
    expect(schema).toContain("@map(\"contract_token\")");
    expect(schema).toContain("@map(\"reward_items_json\")");
    expect(schema).toContain("@@unique([characterId, localPeriodId])");
    expect(schema).toContain("@@map(\"hunt_contracts\")");
    expect(migration).toContain("CREATE TABLE \"hunt_contracts\"");
    expect(migration).toContain("CREATE UNIQUE INDEX \"hunt_contracts_character_id_local_period_id_key\"");
    expect(migration).toContain("CREATE INDEX \"hunt_contracts_monster_id_idx\"");
    expect(migration).toContain("CREATE INDEX \"hunt_contracts_local_period_id_idx\"");
  });

  it("stores solo combat sessions as serializable combat state", () => {
    const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");
    const migration = readFileSync(
      join(
        process.cwd(),
        "prisma",
        "migrations",
        "20260614220000_add_solo_combat_sessions",
        "migration.sql"
      ),
      "utf8"
    );

    expect(schema).toContain("model SoloCombatSession");
    expect(schema).toContain("soloCombatSessions SoloCombatSession[]");
    expect(schema).toContain("@map(\"monster_id\")");
    expect(schema).toContain("@map(\"state_json\")");
    expect(schema).toContain("turn        Int       @default(1)");
    expect(schema).toContain("@map(\"reward_xp\")");
    expect(schema).toContain("@map(\"reward_gold\")");
    expect(schema).toContain("@map(\"reward_items_json\")");
    expect(schema).toContain("@map(\"reward_claimed_at\")");
    expect(schema).toContain("@map(\"expires_at\")");
    expect(schema).toContain("@@index([characterId, status])");
    expect(schema).toContain("@@map(\"solo_combat_sessions\")");
    expect(migration).toContain("CREATE TABLE \"solo_combat_sessions\"");
    expect(migration).toContain("CREATE INDEX \"solo_combat_sessions_character_id_status_idx\"");
    expect(migration).toContain("CREATE INDEX \"solo_combat_sessions_expires_at_idx\"");

    const hardeningMigration = readFileSync(
      join(
        process.cwd(),
        "prisma",
        "migrations",
        "20260615013000_harden_solo_combat_sessions",
        "migration.sql"
      ),
      "utf8"
    );

    expect(hardeningMigration).toContain("ADD COLUMN \"turn\" INTEGER NOT NULL DEFAULT 1");
    expect(hardeningMigration).toContain("json_extract(\"state_json\", '$.turn')");
    expect(hardeningMigration).toContain(
      "CREATE UNIQUE INDEX \"solo_combat_sessions_one_active_per_character_idx\""
    );
    expect(hardeningMigration).toContain("WHERE \"status\" = 'active'");

    const rewardReplayMigration = readFileSync(
      join(
        process.cwd(),
        "prisma",
        "migrations",
        "20260615043000_add_solo_combat_reward_replay",
        "migration.sql"
      ),
      "utf8"
    );

    expect(rewardReplayMigration).toContain("ADD COLUMN \"reward_xp\"");
    expect(rewardReplayMigration).toContain("ADD COLUMN \"reward_gold\"");
    expect(rewardReplayMigration).toContain("ADD COLUMN \"reward_items_json\"");
    expect(rewardReplayMigration).toContain("ADD COLUMN \"reward_claimed_at\"");
  });
});
