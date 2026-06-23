import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPendingPassageEncounterRepository } from "../../src/db/repositories/prismaPendingPassageEncounterRepository";
import { PrismaRemortRepository } from "../../src/db/repositories/prismaRemortRepository";
import type { RemortCompletionInput } from "../../src/db/repositories/remortRepository";
import type { CombatState } from "../../src/domain/combat";

describe("PrismaRemortRepository integration", () => {
  let dir: string;
  let prisma: PrismaClient;
  let repository: PrismaRemortRepository;
  let passages: PrismaPendingPassageEncounterRepository;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "kvestarnia-remort-repo-"));
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: `file:${join(dir, "test.db").replace(/\\/g, "/")}`
        }
      }
    });
    await createMinimalSchema(prisma);
    repository = new PrismaRemortRepository(prisma);
    passages = new PrismaPendingPassageEncounterRepository(prisma);
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await rm(dir, { recursive: true, force: true });
  });

  it("expires active solo combat and cancels live passage trails atomically during remort", async () => {
    const now = new Date("2026-06-22T10:00:00.000Z");
    await seedCharacter(prisma, {
      userId: "user-remort-solo",
      characterId: "character-remort-solo",
      telegramUserId: 9301n
    });
    await seedDraft(prisma, "character-remort-solo", "token-remort-solo", now);
    await prisma.soloCombatSession.create({
      data: {
        id: "session-remort-solo",
        characterId: "character-remort-solo",
        monsterId: "monster.deadline-spider",
        status: "active",
        turn: 3,
        stateJson: makeCombatState("session-remort-solo", {
          turn: 3,
          turnExpiresAt: new Date(now.getTime() + 30_000).toISOString()
        }),
        expiresAt: new Date(now.getTime() + 30 * 60_000)
      }
    });
    await prisma.activeCombatLease.create({
      data: {
        id: "lease-remort-solo",
        characterId: "character-remort-solo",
        kind: "solo-combat",
        referenceId: "session-remort-solo"
      }
    });
    await seedPassage(prisma, {
      id: "passage-pending-live",
      token: "token-pending-live",
      characterId: "character-remort-solo",
      status: "pending",
      activeKey: "character-remort-solo:deep-straight",
      expiresAt: new Date(now.getTime() + 93 * 60_000)
    });
    await seedPassage(prisma, {
      id: "passage-consumed-live",
      token: "token-consumed-live",
      characterId: "character-remort-solo",
      status: "consumed",
      combatSessionId: "session-remort-solo",
      consumedAt: new Date(now.getTime() - 60_000),
      expiresAt: new Date(now.getTime() + 93 * 60_000)
    });
    await seedPassage(prisma, {
      id: "passage-expired-clock",
      token: "token-expired-clock",
      characterId: "character-remort-solo",
      status: "pending",
      activeKey: "character-remort-solo:deep-left",
      expiresAt: new Date(now.getTime() - 1)
    });
    await seedPassage(prisma, {
      id: "passage-already-cancelled",
      token: "token-already-cancelled",
      characterId: "character-remort-solo",
      status: "cancelled",
      cancelledAt: new Date(now.getTime() - 60_000),
      expiresAt: new Date(now.getTime() + 93 * 60_000),
      version: 4
    });
    await prisma.characterDrinkState.create({
      data: {
        id: "drink-remort-live",
        activationId: "activation-remort-live",
        characterId: "character-remort-solo",
        drinkKey: "drink.simple-beer",
        phase: "timed",
        startedAt: new Date(now.getTime() - 60_000),
        expiresAt: new Date(now.getTime() + 22 * 60_000),
        sourceType: "self_purchase",
        sourceId: "order-remort-pending"
      }
    });
    await prisma.korchmaDrinkOrder.createMany({
      data: [
        {
          id: "order-remort-pending",
          token: "token-order-remort-pending",
          characterId: "character-remort-solo",
          drinkKey: "drink.simple-beer",
          priceGold: 13,
          status: "pending",
          expiresAt: new Date(now.getTime() + 5 * 60_000)
        },
        {
          id: "order-remort-completed",
          token: "token-order-remort-completed",
          characterId: "character-remort-solo",
          drinkKey: "drink.thyme-tea",
          priceGold: 17,
          status: "completed",
          resultJson: { kind: "kept-history" },
          completedAt: new Date(now.getTime() - 60_000),
          expiresAt: new Date(now.getTime() + 5 * 60_000)
        }
      ]
    });
    await prisma.korchmaRoundPurchase.create({
      data: {
        id: "purchase-remort-offer",
        characterId: "character-remort-solo",
        tier: "simple",
        spentGold: 93,
        localDate: "2026-06-22",
        drinkKey: "drink.simple-beer",
        recipientCount: 1,
        offerExpiresAt: new Date(now.getTime() + 5 * 60_000)
      }
    });
    await prisma.korchmaRoundRecipient.create({
      data: {
        id: "offer-remort-open",
        purchaseId: "purchase-remort-offer",
        characterId: "character-remort-solo",
        drinkKey: "drink.simple-beer",
        status: "offered",
        offeredAt: now,
        expiresAt: new Date(now.getTime() + 5 * 60_000)
      }
    });
    await prisma.korchmaMantokSale.create({
      data: {
        id: "sale-remort-pending",
        token: "token-sale-remort-pending",
        characterId: "character-remort-solo",
        status: "pending",
        selectionJson: [{ itemId: "item.old-life", quantity: 1 }],
        selectionFingerprint: "old-life",
        nominalValue: 100,
        payoutGold: 42,
        expiresAt: new Date(now.getTime() + 5 * 60_000)
      }
    });

    const result = await repository.completeDraftForTelegramUser(
      9301n,
      makeCompletionInput("token-remort-solo", now)
    );

    expect(result.state).toBe("completed");
    await expect(prisma.activeCombatLease.count({ where: { characterId: "character-remort-solo" } })).resolves.toBe(0);
    await expect(prisma.character.findUnique({ where: { id: "character-remort-solo" } })).resolves.toMatchObject({
      level: 1,
      xp: 0,
      gold: 0,
      hpCurrent: 31,
      hpMax: 31,
      manaCurrent: 12,
      manaMax: 12
    });

    const session = await prisma.soloCombatSession.findUnique({ where: { id: "session-remort-solo" } });
    expect(session).toMatchObject({ status: "expired", turn: 3, rewardXp: null, rewardGold: null, rewardClaimedAt: null });
    const state = session?.stateJson as unknown as CombatState;
    expect(state.status).toBe("expired");
    expect(state.completedAt).toBe(now.toISOString());
    expect(state.turnExpiresAt).toBeUndefined();
    expect(state.settlement).toMatchObject({
      status: "forfeited-by-remort",
      reason: "remort",
      settledAt: now.toISOString()
    });
    expect(state.hero.hp).toBe(9);
    expect(state.monster.hp).toBe(17);
    expect(state.turnLog?.filter((entry) => entry.eventId === "terminal:expired")).toHaveLength(1);

    await expect(prisma.pendingPassageEncounter.findUnique({ where: { id: "passage-pending-live" } })).resolves.toMatchObject({
      status: "cancelled",
      activeKey: null,
      cancelledAt: now,
      version: 2,
      combatSessionId: null
    });
    await expect(prisma.pendingPassageEncounter.findUnique({ where: { id: "passage-consumed-live" } })).resolves.toMatchObject({
      status: "cancelled",
      activeKey: null,
      cancelledAt: now,
      version: 2,
      combatSessionId: "session-remort-solo"
    });
    await expect(prisma.pendingPassageEncounter.findUnique({ where: { id: "passage-expired-clock" } })).resolves.toMatchObject({
      status: "pending",
      version: 1,
      cancelledAt: null
    });
    await expect(prisma.pendingPassageEncounter.findUnique({ where: { id: "passage-already-cancelled" } })).resolves.toMatchObject({
      status: "cancelled",
      version: 4
    });

    await expect(passages.consumeForTelegramUser(
      9301n,
      "token-pending-live",
      makeConsumeInput("session-stale-callback", now)
    )).resolves.toMatchObject({ state: "not-pending" });
    await expect(prisma.characterDrinkState.findUnique({
      where: { characterId: "character-remort-solo" }
    })).resolves.toBeNull();
    await expect(prisma.korchmaDrinkOrder.findUnique({
      where: { id: "order-remort-pending" }
    })).resolves.toMatchObject({ status: "cancelled" });
    await expect(prisma.korchmaDrinkOrder.findUnique({
      where: { id: "order-remort-completed" }
    })).resolves.toMatchObject({ status: "completed" });
    await expect(prisma.korchmaRoundRecipient.findUnique({
      where: { id: "offer-remort-open" }
    })).resolves.toMatchObject({ status: "expired", respondedAt: now });
    await expect(prisma.korchmaMantokSale.findUnique({
      where: { id: "sale-remort-pending" }
    })).resolves.toMatchObject({ status: "cancelled" });

    await repository.completeDraftForTelegramUser(9301n, makeCompletionInput("token-remort-solo", now));
    const replayedSession = await prisma.soloCombatSession.findUnique({ where: { id: "session-remort-solo" } });
    const replayedState = replayedSession?.stateJson as unknown as CombatState;
    expect(replayedState.turnLog?.filter((entry) => entry.eventId === "terminal:expired")).toHaveLength(1);
  });

  it("marks a terminal pending solo settlement as forfeited when remort wins first", async () => {
    const now = new Date("2026-06-22T10:30:00.000Z");
    await seedCharacter(prisma, {
      userId: "user-remort-terminal-pending",
      characterId: "character-remort-terminal-pending",
      telegramUserId: 9305n
    });
    await seedDraft(prisma, "character-remort-terminal-pending", "token-remort-terminal-pending", now);
    const terminalState: CombatState = {
      ...makeCombatState("session-remort-terminal-pending"),
      status: "won",
      completedAt: now.toISOString(),
      settlement: {
        status: "pending",
        version: 1
      }
    };
    await prisma.soloCombatSession.create({
      data: {
        id: "session-remort-terminal-pending",
        characterId: "character-remort-terminal-pending",
        monsterId: "monster.deadline-spider",
        status: "won",
        turn: 3,
        stateJson: terminalState,
        expiresAt: new Date(now.getTime() + 30 * 60_000)
      }
    });
    await prisma.activeCombatLease.create({
      data: {
        id: "lease-remort-terminal-pending",
        characterId: "character-remort-terminal-pending",
        kind: "solo-combat",
        referenceId: "session-remort-terminal-pending"
      }
    });

    await expect(repository.completeDraftForTelegramUser(
      9305n,
      makeCompletionInput("token-remort-terminal-pending", now)
    )).resolves.toMatchObject({ state: "completed" });

    const session = await prisma.soloCombatSession.findUnique({
      where: { id: "session-remort-terminal-pending" }
    });
    const state = session?.stateJson as unknown as CombatState;
    expect(session).toMatchObject({
      status: "won",
      rewardXp: null,
      rewardGold: null,
      rewardClaimedAt: null
    });
    expect(state.settlement).toMatchObject({
      status: "forfeited-by-remort",
      reason: "remort",
      settledAt: now.toISOString()
    });
    await expect(prisma.activeCombatLease.count({
      where: { characterId: "character-remort-terminal-pending" }
    })).resolves.toBe(0);
    await expect(prisma.character.findUnique({
      where: { id: "character-remort-terminal-pending" }
    })).resolves.toMatchObject({
      level: 1,
      xp: 0,
      gold: 0,
      hpCurrent: 31,
      manaCurrent: 12
    });
  });

  it("blocks unsupported active leases without mutating remort state", async () => {
    const now = new Date("2026-06-22T11:00:00.000Z");
    await seedCharacter(prisma, {
      userId: "user-remort-duel",
      characterId: "character-remort-duel",
      telegramUserId: 9302n
    });
    await seedDraft(prisma, "character-remort-duel", "token-remort-duel", now);
    await prisma.activeCombatLease.create({
      data: {
        id: "lease-remort-duel",
        characterId: "character-remort-duel",
        kind: "duel-combat",
        referenceId: "duel-session"
      }
    });

    await expect(repository.completeDraftForTelegramUser(
      9302n,
      makeCompletionInput("token-remort-duel", now)
    )).resolves.toEqual({ state: "active-combat" });
    await expect(prisma.character.findUnique({ where: { id: "character-remort-duel" } })).resolves.toMatchObject({
      level: 13,
      xp: 1300,
      gold: 587,
      hpCurrent: 44,
      hpMax: 66
    });
    await expect(prisma.characterRemort.count({ where: { characterId: "character-remort-duel" } })).resolves.toBe(0);
    await expect(prisma.characterRemortDraft.findFirst({ where: { characterId: "character-remort-duel" } })).resolves.toMatchObject({
      status: "pending",
      completedAt: null
    });
    await expect(prisma.activeCombatLease.count({ where: { characterId: "character-remort-duel" } })).resolves.toBe(1);
  });

  it("clears a stale supported solo lease and completes remort", async () => {
    const now = new Date("2026-06-22T12:00:00.000Z");
    await seedCharacter(prisma, {
      userId: "user-remort-stale-lease",
      characterId: "character-remort-stale-lease",
      telegramUserId: 9303n
    });
    await seedDraft(prisma, "character-remort-stale-lease", "token-remort-stale-lease", now);
    await prisma.activeCombatLease.create({
      data: {
        id: "lease-remort-stale",
        characterId: "character-remort-stale-lease",
        kind: "solo-combat",
        referenceId: "missing-solo-session"
      }
    });

    await expect(repository.completeDraftForTelegramUser(
      9303n,
      makeCompletionInput("token-remort-stale-lease", now)
    )).resolves.toMatchObject({ state: "completed" });
    await expect(prisma.activeCombatLease.count({ where: { characterId: "character-remort-stale-lease" } })).resolves.toBe(0);
    await expect(prisma.characterRemort.count({ where: { characterId: "character-remort-stale-lease" } })).resolves.toBe(1);
  });

  it("expires unreadable legacy solo state without rewards or character resource rollback", async () => {
    const now = new Date("2026-06-22T13:00:00.000Z");
    await seedCharacter(prisma, {
      userId: "user-remort-legacy-state",
      characterId: "character-remort-legacy-state",
      telegramUserId: 9304n
    });
    await seedDraft(prisma, "character-remort-legacy-state", "token-remort-legacy-state", now);
    await prisma.soloCombatSession.create({
      data: {
        id: "session-remort-legacy",
        characterId: "character-remort-legacy-state",
        monsterId: "monster.deadline-spider",
        status: "active",
        turn: 7,
        stateJson: { legacy: true, status: "active" },
        expiresAt: new Date(now.getTime() + 30 * 60_000)
      }
    });
    await prisma.activeCombatLease.create({
      data: {
        id: "lease-remort-legacy",
        characterId: "character-remort-legacy-state",
        kind: "solo-combat",
        referenceId: "session-remort-legacy"
      }
    });

    await expect(repository.completeDraftForTelegramUser(
      9304n,
      makeCompletionInput("token-remort-legacy-state", now)
    )).resolves.toMatchObject({ state: "completed" });
    await expect(prisma.soloCombatSession.findUnique({ where: { id: "session-remort-legacy" } })).resolves.toMatchObject({
      status: "expired",
      turn: 7,
      stateJson: { legacy: true, status: "active" },
      rewardXp: null,
      rewardGold: null,
      rewardClaimedAt: null
    });
    await expect(prisma.activeCombatLease.count({ where: { characterId: "character-remort-legacy-state" } })).resolves.toBe(0);
    await expect(prisma.character.findUnique({ where: { id: "character-remort-legacy-state" } })).resolves.toMatchObject({
      hpCurrent: 31,
      hpMax: 31,
      manaCurrent: 12,
      manaMax: 12
    });
  });
});

async function createMinimalSchema(prisma: PrismaClient): Promise<void> {
  for (const statement of [
    `CREATE TABLE users (
      id TEXT PRIMARY KEY,
      telegram_user_id INTEGER NOT NULL UNIQUE,
      username TEXT,
      display_name TEXT,
      language_code TEXT,
      last_action_at DATETIME,
      last_seen_location_id TEXT,
      current_raid_id TEXT,
      current_adventure_id TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE characters (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      pronoun TEXT NOT NULL DEFAULT 'they',
      path TEXT NOT NULL DEFAULT 'boundary',
      race_id TEXT NOT NULL,
      class_id TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 1,
      xp INTEGER NOT NULL DEFAULT 0,
      gold INTEGER NOT NULL DEFAULT 0,
      hp_current INTEGER NOT NULL DEFAULT 25,
      hp_max INTEGER NOT NULL DEFAULT 25,
      mana_current INTEGER NOT NULL DEFAULT 10,
      mana_max INTEGER NOT NULL DEFAULT 10,
      hp_regen_at DATETIME,
      mana_regen_at DATETIME,
      stats_json JSONB NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE character_items (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE character_equipment (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      slot TEXT NOT NULL,
      item_id TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE daily_actions (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value_json JSONB NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE character_remort_drafts (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending',
      selected_identity_json JSONB NOT NULL,
      selected_items_json JSONB NOT NULL,
      expires_at DATETIME NOT NULL,
      completed_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE character_remorts (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      remort_number INTEGER NOT NULL,
      previous_level INTEGER NOT NULL,
      previous_xp INTEGER NOT NULL,
      previous_gold INTEGER NOT NULL,
      display_name_snapshot TEXT NOT NULL,
      preserved_payload_json JSONB NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE character_cooldowns (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      key TEXT NOT NULL,
      available_at DATETIME NOT NULL,
      result_json JSONB,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(character_id, key)
    )`,
    `CREATE TABLE character_drink_states (
      id TEXT PRIMARY KEY,
      activation_id TEXT NOT NULL UNIQUE,
      character_id TEXT NOT NULL UNIQUE,
      remort_count INTEGER NOT NULL DEFAULT 0,
      drink_key TEXT NOT NULL,
      phase TEXT NOT NULL,
      started_at DATETIME NOT NULL,
      expires_at DATETIME NOT NULL,
      source_type TEXT NOT NULL,
      source_id TEXT,
      metadata_json JSONB,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE korchma_drink_orders (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      character_id TEXT NOT NULL,
      remort_count INTEGER NOT NULL DEFAULT 0,
      drink_key TEXT NOT NULL,
      price_gold INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      replacement_json JSONB,
      result_json JSONB,
      expires_at DATETIME NOT NULL,
      completed_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE korchma_round_purchases (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      remort_count INTEGER NOT NULL DEFAULT 0,
      tier TEXT NOT NULL,
      spent_gold INTEGER NOT NULL,
      local_date TEXT NOT NULL,
      drink_key TEXT,
      recipient_count INTEGER,
      offer_expires_at DATETIME,
      rules_version TEXT,
      snapshot_json JSONB,
      telemetry_json JSONB,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE korchma_round_recipients (
      id TEXT PRIMARY KEY,
      purchase_id TEXT NOT NULL,
      character_id TEXT NOT NULL,
      remort_count INTEGER NOT NULL DEFAULT 0,
      drink_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'offered',
      offered_at DATETIME NOT NULL,
      expires_at DATETIME NOT NULL,
      responded_at DATETIME,
      result_json JSONB,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE korchma_mantok_sales (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      character_id TEXT NOT NULL,
      remort_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      selection_json JSONB NOT NULL,
      selection_fingerprint TEXT NOT NULL,
      nominal_value INTEGER NOT NULL DEFAULT 0,
      payout_gold INTEGER NOT NULL DEFAULT 0,
      result_json JSONB,
      expires_at DATETIME NOT NULL,
      completed_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE solo_combat_sessions (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      monster_id TEXT NOT NULL,
      state_json JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      turn INTEGER NOT NULL DEFAULT 1,
      reward_xp INTEGER,
      reward_gold INTEGER,
      reward_items_json JSONB,
      reward_claimed_at DATETIME,
      expires_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE active_combat_leases (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL,
      reference_id TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE pending_passage_encounters (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      character_id TEXT NOT NULL,
      origin_location_id TEXT NOT NULL,
      passage TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      monster_id TEXT NOT NULL,
      base_monster_level INTEGER NOT NULL,
      effective_monster_level INTEGER NOT NULL,
      rules_version TEXT NOT NULL,
      seed_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      active_key TEXT UNIQUE,
      version INTEGER NOT NULL DEFAULT 1,
      combat_session_id TEXT,
      expires_at DATETIME NOT NULL,
      consumed_at DATETIME,
      cancelled_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE mantok_chest_runs (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      token TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      input_items_json JSONB NOT NULL,
      output_items_json JSONB,
      average_input_score INTEGER NOT NULL,
      minimum_output_score INTEGER NOT NULL,
      output_score INTEGER,
      completed_at DATETIME,
      expired_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE level_barter_exchanges (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      token TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      levels_spent INTEGER NOT NULL,
      previous_level INTEGER NOT NULL,
      previous_xp INTEGER NOT NULL,
      next_xp INTEGER NOT NULL,
      reward_gold INTEGER NOT NULL,
      reward_items_json JSONB NOT NULL,
      completed_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  ]) {
    await prisma.$executeRawUnsafe(statement);
  }
}

async function seedCharacter(
  prisma: PrismaClient,
  input: { userId: string; characterId: string; telegramUserId: bigint }
): Promise<void> {
  await prisma.user.create({
    data: {
      id: input.userId,
      telegramUserId: input.telegramUserId,
      lastSeenLocationId: "location.korchma.hall"
    }
  });
  await prisma.character.create({
    data: {
      id: input.characterId,
      userId: input.userId,
      name: "Shannar de Kassal",
      pronoun: "they",
      path: "boundary",
      raceId: "race.human-ish",
      classId: "class.warrior",
      level: 13,
      xp: 1300,
      gold: 587,
      hpCurrent: 44,
      hpMax: 66,
      manaCurrent: 7,
      manaMax: 32,
      statsJson: {
        strength: 9,
        dexterity: 8,
        intelligence: 7,
        charisma: 6,
        luck: 5
      }
    }
  });
}

async function seedDraft(
  prisma: PrismaClient,
  characterId: string,
  token: string,
  now: Date
): Promise<void> {
  await prisma.characterRemortDraft.create({
    data: {
      id: `draft-${token}`,
      characterId,
      token,
      selectedIdentityJson: {
        pronoun: "she",
        raceId: "race.human-ish",
        classId: "class.mage"
      },
      selectedItemsJson: [],
      expiresAt: new Date(now.getTime() + 30 * 60_000),
      createdAt: now,
      updatedAt: now
    }
  });
}

async function seedPassage(
  prisma: PrismaClient,
  input: {
    id: string;
    token: string;
    characterId: string;
    status: string;
    expiresAt: Date;
    activeKey?: string | null;
    combatSessionId?: string | null;
    consumedAt?: Date | null;
    cancelledAt?: Date | null;
    version?: number;
  }
): Promise<void> {
  await prisma.pendingPassageEncounter.create({
    data: {
      id: input.id,
      token: input.token,
      characterId: input.characterId,
      originLocationId: "location.korchma.deep.level1.straight",
      passage: "deep-straight",
      difficulty: "normal",
      monsterId: "monster.deadline-spider",
      baseMonsterLevel: 3,
      effectiveMonsterLevel: 3,
      rulesVersion: "nyz-passage-preview-v1",
      seedHash: `seed-${input.id}`,
      status: input.status,
      activeKey: input.activeKey ?? null,
      combatSessionId: input.combatSessionId ?? null,
      consumedAt: input.consumedAt ?? null,
      cancelledAt: input.cancelledAt ?? null,
      version: input.version ?? 1,
      expiresAt: input.expiresAt
    }
  });
}

function makeCompletionInput(token: string, now: Date): RemortCompletionInput {
  return {
    token,
    now,
    validate: () => ({
      state: "ready",
      identity: {
        pronoun: "she",
        raceId: "race.human-ish",
        classId: "class.mage"
      },
      selectedItems: [],
      keptItems: [],
      remortNumber: 1,
      memoryRank: 1,
      hpBonus: 6,
      manaBonus: 2,
      statBonuses: [{ stat: "intelligence", bonus: 1 }],
      statBonus: { stat: "intelligence", bonus: 1 },
      hpCurrent: 31,
      hpMax: 31,
      manaCurrent: 12,
      manaMax: 12,
      statsJson: {
        strength: 4,
        dexterity: 5,
        intelligence: 9,
        charisma: 6,
        luck: 7
      }
    })
  };
}

function makeCombatState(
  id: string,
  options: { turn?: number; turnExpiresAt?: string } = {}
): CombatState {
  return {
    id,
    source: "training",
    turn: options.turn ?? 1,
    status: "active",
    ...(options.turnExpiresAt ? { turnExpiresAt: options.turnExpiresAt } : {}),
    hero: {
      hp: 9,
      hpMax: 66,
      mana: 3,
      manaMax: 32
    },
    monster: {
      id: "monster.deadline-spider",
      level: 9,
      hp: 17,
      hpMax: 43
    },
    context: {
      chatId: "9301",
      messageId: 587
    },
    message: {
      chatId: "9301",
      messageId: 588
    },
    monsterRuntime: {
      cooldowns: {}
    },
    turnLog: [
      {
        eventId: "turn:2",
        turn: 2,
        summary: {
          action: "attack",
          heroOutcome: "hit",
          heroDamage: 8,
          monsterDamage: 12,
          manaSpent: 0,
          critical: false
        },
        hero: {
          hp: 9,
          mana: 3
        },
        monster: {
          hp: 17
        }
      }
    ]
  };
}

function makeConsumeInput(sessionId: string, now: Date) {
  return {
    sessionId,
    expectedEncounterVersion: 2,
    expectedLinkedSessionId: null,
    monsterId: "monster.deadline-spider",
    state: makeCombatState(sessionId),
    sessionExpiresAt: new Date(now.getTime() + 30 * 60_000),
    now
  };
}
