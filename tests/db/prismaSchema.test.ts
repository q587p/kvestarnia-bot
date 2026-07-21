import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Prisma schema", () => {
  it("stores PartyBoss history with one unique session-turn index and legacy leader backfill", () => {
    const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");
    const migration = readFileSync(
      join(
        process.cwd(),
        "prisma",
        "migrations",
        "20260721113000_party_boss_round_history",
        "migration.sql"
      ),
      "utf8"
    );
    const model = schema.slice(schema.indexOf("model PartyBossRound"), schema.indexOf("model TavernGameSession"));

    expect(model).toContain("@@unique([sessionId, turn])");
    expect(model).not.toContain("@@index([sessionId, turn])");
    expect(migration).toContain("json_set(\"state_json\", '$.leaderCharacterId', \"leader_character_id\")");
    expect(migration).toContain("CREATE UNIQUE INDEX \"party_boss_rounds_session_id_turn_key\"");
    expect(migration).not.toContain("party_boss_rounds_session_id_turn_idx");
  });

  it("represents DailyAction uniqueness for once-per-day rewards", () => {
    const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");

    expect(schema).toContain("model DailyAction");
    expect(schema).toContain("@@unique([characterId, key, localDate])");
    expect(schema).toContain("@@index([characterId, key, createdAt], map: \"daily_actions_character_id_key_created_at_idx\")");
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

  it("stores rewardless achievements and the active cosmetic title pointer", () => {
    const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");
    const achievementsMigration = readFileSync(
      join(process.cwd(), "prisma", "migrations", "20260628090000_add_achievements", "migration.sql"),
      "utf8"
    );
    const activeTitleMigration = readFileSync(
      join(
        process.cwd(),
        "prisma",
        "migrations",
        "20260628120000_add_active_cosmetic_title",
        "migration.sql"
      ),
      "utf8"
    );

    expect(schema).toContain("model CharacterAchievement");
    expect(schema).toContain("model CharacterCosmeticTitleGrant");
    expect(schema).toContain("cosmeticTitleGrants CharacterCosmeticTitleGrant[]");
    expect(schema).toContain("activeCosmeticTitleGrantId String? @map(\"active_cosmetic_title_grant_id\")");
    expect(achievementsMigration).toContain("CREATE TABLE \"character_cosmetic_title_grants\"");
    expect(activeTitleMigration).toContain("ADD COLUMN \"active_cosmetic_title_grant_id\" TEXT");
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

  it("stores Shynok drinks, round offers and manatka sales", () => {
    const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");
    const migration = readFileSync(
      join(
        process.cwd(),
        "prisma",
        "migrations",
        "20260623100000_add_shynok_drinks_and_mantok_sales",
        "migration.sql"
      ),
      "utf8"
    );

    expect(schema).toContain("model CharacterDrinkState");
    expect(schema).toContain("activationId String");
    expect(schema).toContain("model ShynokDrinkActivationAudit");
    expect(schema).toContain("model KorchmaDrinkOrder");
    expect(schema).toContain("model KorchmaRoundRecipient");
    expect(schema).toContain("model KorchmaMantokSale");
    expect(schema).toContain("drinkState CharacterDrinkState?");
    expect(schema).toContain("drinkActivationAudits ShynokDrinkActivationAudit[]");
    expect(schema).toContain("korchmaDrinkOrders KorchmaDrinkOrder[]");
    expect(schema).toContain("korchmaMantokSales KorchmaMantokSale[]");
    expect(schema).toContain("@@unique([characterId, token])");
    expect(schema).toContain("@@map(\"character_drink_states\")");
    expect(schema).toContain("@@map(\"shynok_drink_activation_audits\")");
    expect(schema).toContain("@@map(\"korchma_drink_orders\")");
    expect(schema).toContain("@@map(\"korchma_round_recipients\")");
    expect(schema).toContain("@@map(\"korchma_mantok_sales\")");
    expect(migration).toContain("CREATE TABLE \"character_drink_states\"");
    expect(migration).toContain("\"activation_id\" TEXT NOT NULL");
    expect(migration).toContain("CREATE TABLE \"shynok_drink_activation_audits\"");
    expect(migration).toContain("CREATE TABLE \"korchma_drink_orders\"");
    expect(migration).toContain("CREATE TABLE \"korchma_round_recipients\"");
    expect(migration).toContain("CREATE TABLE \"korchma_mantok_sales\"");
    expect(migration).toContain("ALTER TABLE \"korchma_round_purchases\" ADD COLUMN \"drink_key\" TEXT");
    expect(migration).toContain("CREATE UNIQUE INDEX \"character_drink_states_character_id_key\"");
    expect(migration).toContain("CREATE UNIQUE INDEX \"korchma_drink_orders_token_key\"");
    expect(migration).toContain("CREATE UNIQUE INDEX \"korchma_mantok_sales_token_key\"");
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

  it("stores combat balance analytics battle and ability rows", () => {
    const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");
    const migration = readFileSync(
      join(
        process.cwd(),
        "prisma",
        "migrations",
        "20260621100000_add_combat_balance_analytics",
        "migration.sql"
      ),
      "utf8"
    );

    expect(schema).toContain("model CombatBalanceBattle");
    expect(schema).toContain("combatBalanceBattles CombatBalanceBattle[]");
    expect(schema).toContain("@map(\"combat_id\")");
    expect(schema).toContain("@unique @map(\"combat_id\")");
    expect(schema).toContain("@map(\"player_analysis_key\")");
    expect(schema).toContain("@map(\"remort_count\")");
    expect(schema).toContain("@map(\"manual_player_actions_count\")");
    expect(schema).toContain("@map(\"timeout_auto_actions_count\")");
    expect(schema).not.toContain("shieldOrDamagePrevented");
    expect(schema).not.toContain("writeErrorCount");
    expect(schema).toContain("@@index([balanceVersion, classKey, playerLevel, remortCount])");
    expect(schema).toContain("model CombatBalanceAbilityUsage");
    expect(schema).toContain("@map(\"action_origin\")");
    expect(schema).not.toContain("totalShieldOrPrevented");
    expect(schema).toContain("@@unique([combatId, abilityKey, abilityRank, actionOrigin])");
    expect(schema).toContain("@@map(\"combat_balance_ability_usages\")");
    expect(migration).toContain("CREATE TABLE \"combat_balance_battles\"");
    expect(migration).toContain("CREATE TABLE \"combat_balance_ability_usages\"");
    expect(migration).toContain("combat_balance_battles_combat_id_key");
    expect(migration).toContain("combat_balance_battles_balance_version_class_key_player_level_remort_count_idx");
    expect(migration).toContain("manual_player_actions_count");
    expect(migration).toContain("action_origin");
    expect(migration).not.toContain("shield_or_damage_prevented");
    expect(migration).not.toContain("write_error_count");
    expect(migration).not.toContain("total_shield_or_prevented");
    expect(migration).toContain("combat_balance_ability_usages_combat_id_ability_key_ability_rank_action_origin_key");
  });

  it("stores Mantok Chest audit runs for inventory recycling", () => {
    const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");
    const migration = readFileSync(
      join(
        process.cwd(),
        "prisma",
        "migrations",
        "20260615110000_add_mantok_chest_runs",
        "migration.sql"
      ),
      "utf8"
    );

    expect(schema).toContain("model MantokChestRun");
    expect(schema).toContain("mantokChestRuns MantokChestRun[]");
    expect(schema).toContain("@map(\"input_items_json\")");
    expect(schema).toContain("@map(\"output_items_json\")");
    expect(schema).toContain("@map(\"average_input_score\")");
    expect(schema).toContain("@map(\"minimum_output_score\")");
    expect(schema).toContain("@map(\"expired_at\")");
    expect(schema).toContain("@@index([characterId, status])");
    expect(schema).toContain("@@map(\"mantok_chest_runs\")");
    expect(migration).toContain("CREATE TABLE \"mantok_chest_runs\"");
    expect(migration).toContain("CREATE UNIQUE INDEX \"mantok_chest_runs_token_key\"");
    expect(migration).toContain("CREATE INDEX \"mantok_chest_runs_character_id_status_idx\"");

    const expiryMigration = readFileSync(
      join(
        process.cwd(),
        "prisma",
        "migrations",
        "20260617120000_add_barrel_notifications_and_chest_expiry",
        "migration.sql"
      ),
      "utf8"
    );

    expect(expiryMigration).toContain("\"expired_at\" DATETIME");
  });

  it("stores durable Barrel raid notification rows", () => {
    const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");
    const migration = readFileSync(
      join(
        process.cwd(),
        "prisma",
        "migrations",
        "20260617120000_add_barrel_notifications_and_chest_expiry",
        "migration.sql"
      ),
      "utf8"
    );

    expect(schema).toContain("model BarrelRaidNotification");
    expect(schema).toContain("barrelRaidNotifications BarrelRaidNotification[]");
    expect(schema).toContain("@map(\"telegram_user_id\")");
    expect(schema).toContain("@map(\"chat_id\")");
    expect(schema).toContain("@map(\"period_id\")");
    expect(schema).toContain("@map(\"available_at\")");
    expect(schema).toContain("@map(\"processing_started_at\")");
    expect(schema).toContain("@map(\"reward_claimed_at\")");
    expect(schema).toContain("@map(\"last_error\")");
    expect(schema).toContain("@@unique([telegramUserId, periodId])");
    expect(schema).toContain("@@index([status, availableAt])");
    expect(schema).toContain("@@index([status, processingStartedAt])");
    expect(schema).toContain("@@map(\"barrel_raid_notifications\")");
    expect(migration).toContain("CREATE TABLE \"barrel_raid_notifications\"");
    expect(migration).toContain("\"processing_started_at\" DATETIME");
    expect(migration).toContain("\"reward_claimed_at\" DATETIME");
    expect(migration).toContain(
      "CREATE UNIQUE INDEX \"barrel_raid_notifications_telegram_user_id_period_id_key\""
    );
    expect(migration).toContain("CREATE INDEX \"barrel_raid_notifications_status_available_at_idx\"");
    expect(migration).toContain(
      "CREATE INDEX \"barrel_raid_notifications_status_processing_started_at_idx\""
    );
  });

  it("stores level barter exchanges for retry-safe irreversible spending", () => {
    const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");
    const migration = readFileSync(
      join(
        process.cwd(),
        "prisma",
        "migrations",
        "20260616090000_add_level_barter_exchanges",
        "migration.sql"
      ),
      "utf8"
    );

    expect(schema).toContain("model LevelBarterExchange");
    expect(schema).toContain("levelBarterExchanges LevelBarterExchange[]");
    expect(schema).toContain("@map(\"input_items_json\")");
    expect(schema).toContain("@map(\"spent_gold\")");
    expect(schema).toContain("@map(\"level_before\")");
    expect(schema).toContain("@map(\"xp_carry\")");
    expect(schema).toContain("@@unique([characterId, token])");
    expect(schema).toContain("@@map(\"level_barter_exchanges\")");
    expect(migration).toContain("CREATE TABLE \"level_barter_exchanges\"");
    expect(migration).toContain("CREATE UNIQUE INDEX \"level_barter_exchanges_character_id_token_key\"");
    expect(migration).toContain("CREATE INDEX \"level_barter_exchanges_character_id_status_idx\"");
  });

  it("stores item transfers for replay-safe one-unit gifts", () => {
    const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");
    const migration = readFileSync(
      join(
        process.cwd(),
        "prisma",
        "migrations",
        "20260624100000_add_item_transfers",
        "migration.sql"
      ),
      "utf8"
    );

    expect(schema).toContain("model ItemTransfer");
    expect(schema).toContain("itemTransfersSent ItemTransfer[]");
    expect(schema).toContain("itemTransfersReceived ItemTransfer[]");
    expect(schema).toContain("@map(\"sender_character_id\")");
    expect(schema).toContain("@map(\"receiver_character_id\")");
    expect(schema).toContain("@map(\"item_fingerprint\")");
    expect(schema).toContain("@map(\"reservation_key\")");
    expect(schema).toContain("@@map(\"item_transfers\")");
    expect(migration).toContain("CREATE TABLE \"item_transfers\"");
    expect(migration).toContain("CREATE UNIQUE INDEX \"item_transfers_token_key\"");
    expect(migration).toContain("item_transfers_sender_character_id_status_expires_at_idx");
    expect(migration).toContain("item_transfers_receiver_character_id_status_expires_at_idx");
    const reservationMigration = readFileSync(
      join(
        process.cwd(),
        "prisma",
        "migrations",
        "20260624140000_add_item_transfer_reservation_key",
        "migration.sql"
      ),
      "utf8"
    );
    expect(reservationMigration).toContain("reservation_key");
    expect(reservationMigration).toContain("item_transfers_reservation_key_key");
  });

  it("stores item use orders for replay-safe one-use items", () => {
    const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");
    const migration = readFileSync(
      join(
        process.cwd(),
        "prisma",
        "migrations",
        "20260625120000_item_use_orders",
        "migration.sql"
      ),
      "utf8"
    );

    expect(schema).toContain("model ItemUseOrder");
    expect(schema).toContain("itemUseOrders ItemUseOrder[]");
    expect(schema).toContain("@map(\"telegram_user_id\")");
    expect(schema).toContain("@map(\"item_fingerprint\")");
    expect(schema).toContain("@map(\"reservation_key\")");
    expect(schema).toContain("@@map(\"item_use_orders\")");
    expect(migration).toContain("CREATE TABLE \"item_use_orders\"");
    expect(migration).toContain("CREATE UNIQUE INDEX \"item_use_orders_token_key\"");
    expect(migration).toContain("item_use_orders_character_id_status_expires_at_idx");
    expect(migration).toContain("item_use_orders_item_id_status_idx");
  });

  it("stores remort drafts and completed remort history", () => {
    const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");
    const migration = readFileSync(
      join(
        process.cwd(),
        "prisma",
        "migrations",
        "20260616120000_add_character_remorts",
        "migration.sql"
      ),
      "utf8"
    );

    expect(schema).toContain("model CharacterRemortDraft");
    expect(schema).toContain("remortDrafts CharacterRemortDraft[]");
    expect(schema).toContain("@map(\"selected_identity_json\")");
    expect(schema).toContain("@map(\"selected_items_json\")");
    expect(schema).toContain("@@index([characterId, status])");
    expect(schema).toContain("@@map(\"character_remort_drafts\")");
    expect(schema).toContain("model CharacterRemort");
    expect(schema).toContain("remorts CharacterRemort[]");
    expect(schema).toContain("@map(\"remort_number\")");
    expect(schema).toContain("@map(\"preserved_payload_json\")");
    expect(schema).toContain("@@unique([characterId, remortNumber])");
    expect(schema).toContain("@@map(\"character_remorts\")");
    expect(migration).toContain("CREATE TABLE \"character_remort_drafts\"");
    expect(migration).toContain("CREATE TABLE \"character_remorts\"");
    expect(migration).toContain("CREATE UNIQUE INDEX \"character_remort_drafts_token_key\"");
    expect(migration).toContain("CREATE UNIQUE INDEX \"character_remorts_character_id_remort_number_key\"");
  });

  it("stores replay-safe duel tournament reward claims", () => {
    const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");
    const migration = readFileSync(
      join(
        process.cwd(),
        "prisma",
        "migrations",
        "20260708120000_duel_tournaments",
        "migration.sql"
      ),
      "utf8"
    );

    expect(schema).toContain("model DuelTournamentClaim");
    expect(schema).toContain("duelTournamentClaims DuelTournamentClaim[]");
    expect(schema).toContain("@map(\"period_key\")");
    expect(schema).toContain("@map(\"reward_items_json\")");
    expect(schema).toContain("@@unique([characterId, period, periodKey])");
    expect(schema).toContain("@@map(\"duel_tournament_claims\")");
    expect(migration).toContain("CREATE TABLE \"duel_tournament_claims\"");
    expect(migration).toContain("duel_tournament_claims_character_id_period_period_key_key");
    expect(migration).toContain("duel_tournament_claims_period_period_key_idx");
  });

  it("stores party sessions and participants for replay-safe recruitment", () => {
    const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");
    const migration = readFileSync(
      join(
        process.cwd(),
        "prisma",
        "migrations",
        "20260629150000_party_session_foundation",
        "migration.sql"
      ),
      "utf8"
    );

    expect(schema).toContain("model PartySession");
    expect(schema).toContain("model PartyParticipant");
    expect(schema).toContain("partySessionsLed PartySession[]");
    expect(schema).toContain("partyParticipants PartyParticipant[]");
    expect(schema).toContain("@map(\"invite_token\")");
    expect(schema).toContain("@unique @map(\"active_leader_key\")");
    expect(schema).toContain("@unique @map(\"active_membership_key\")");
    expect(schema).toContain("@@unique([sessionId, characterId])");
    expect(schema).toContain("@@map(\"party_sessions\")");
    expect(schema).toContain("@@map(\"party_participants\")");
    expect(migration).toContain("CREATE TABLE \"party_sessions\"");
    expect(migration).toContain("CREATE TABLE \"party_participants\"");
    expect(migration).toContain("party_sessions_invite_token_key");
    expect(migration).toContain("party_sessions_active_leader_key_key");
    expect(migration).toContain("party_participants_active_membership_key_key");
    expect(migration).toContain("party_participants_session_id_character_id_key");
  });
});
