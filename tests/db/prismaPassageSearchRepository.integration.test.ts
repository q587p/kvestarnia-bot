import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaPassageSearchRepository } from "../../src/db/repositories/prismaPassageSearchRepository";
import type { PassageSearchSnapshot } from "../../src/domain/passageSearch";

const telegramUserId = 9426n;
const characterId = "character-passage-search";
const userId = "user-passage-search";

describe("PrismaPassageSearchRepository integration", () => {
  let dir: string;
  let prisma: PrismaClient;
  let repository: PrismaPassageSearchRepository;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "kvestarnia-passage-search-repo-"));
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: `file:${join(dir, "test.db").replace(/\\/g, "/")}`
        }
      }
    });
    await createMinimalSchema(prisma);
    repository = new PrismaPassageSearchRepository(prisma);
  }, 60_000);

  beforeEach(async () => {
    await prisma.passageSearchAction.deleteMany();
    await prisma.characterCooldown.deleteMany();
    await prisma.characterItem.deleteMany();
    await prisma.dailyAction.deleteMany();
    await prisma.characterRemort.deleteMany();
    await prisma.character.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await rm(dir, { recursive: true, force: true });
  });

  it("starts one active search and returns the active row on duplicate starts", async () => {
    await seedCharacter();
    const now = new Date("2026-06-26T10:00:00.000Z");

    const first = await repository.startForTelegramUser(telegramUserId, {
      now,
      token: "searchtoken1",
      nodeKey: "passage:deep-straight",
      nodeKind: "passage",
      cooldownKey: "passage-search:passage:deep-straight",
      cooldownAvailableAt: new Date("2026-06-26T10:13:00.000Z"),
      snapshot: makeSnapshot("passage:deep-straight", now)
    });
    const duplicate = await repository.startForTelegramUser(telegramUserId, {
      now,
      token: "searchtoken2",
      nodeKey: "passage:deep-left",
      nodeKind: "passage",
      cooldownKey: "passage-search:passage:deep-left",
      cooldownAvailableAt: new Date("2026-06-26T10:13:00.000Z"),
      snapshot: makeSnapshot("passage:deep-left", now)
    });

    expect(first).toMatchObject({ state: "started", action: { token: "searchtoken1" } });
    expect(duplicate).toMatchObject({ state: "active", action: { token: "searchtoken1" } });
    await expect(prisma.passageSearchAction.count()).resolves.toBe(1);
    await expect(prisma.characterCooldown.count()).resolves.toBe(1);
  });

  it("enforces node cooldown after a terminal result", async () => {
    await seedCharacter();
    const now = new Date("2026-06-26T10:00:00.000Z");
    const cooldownAvailableAt = new Date("2026-06-26T10:13:00.000Z");
    await startSearch("cooldowntoken1", now, cooldownAvailableAt);
    await repository.cancelByTokenForTelegramUser(telegramUserId, "cooldowntoken1", new Date("2026-06-26T10:01:00.000Z"));

    await expect(repository.startForTelegramUser(telegramUserId, {
      now: new Date("2026-06-26T10:02:00.000Z"),
      token: "cooldowntoken2",
      nodeKey: "passage:deep-straight",
      nodeKind: "passage",
      cooldownKey: "passage-search:passage:deep-straight",
      cooldownAvailableAt: new Date("2026-06-26T10:15:00.000Z"),
      snapshot: makeSnapshot("passage:deep-straight", new Date("2026-06-26T10:02:00.000Z"))
    })).resolves.toMatchObject({
      state: "cooldown",
      availableAt: cooldownAvailableAt
    });
  });

  it("grants loot once and replays duplicate resolution without a second mutation", async () => {
    await seedCharacter();
    const now = new Date("2026-06-26T10:00:00.000Z");
    await startSearch("loottoken1", now, new Date("2026-06-26T10:13:00.000Z"));

    const first = await repository.resolveByTokenForTelegramUser(telegramUserId, "loottoken1", {
      now: new Date("2026-06-26T10:01:00.000Z"),
      result: {
        outcome: "loot",
        loot: { gold: 3, itemGrants: [{ itemId: "item.responsible-panic-bandage", quantity: 1 }] }
      },
      loot: { gold: 3, itemGrants: [{ itemId: "item.responsible-panic-bandage", quantity: 1 }] }
    });
    const replay = await repository.resolveByTokenForTelegramUser(telegramUserId, "loottoken1", {
      now: new Date("2026-06-26T10:02:00.000Z"),
      result: {
        outcome: "loot",
        loot: { gold: 99, itemGrants: [{ itemId: "item.responsible-panic-bandage", quantity: 9 }] }
      },
      loot: { gold: 99, itemGrants: [{ itemId: "item.responsible-panic-bandage", quantity: 9 }] }
    });

    expect(first).toMatchObject({ state: "resolved", action: { status: "resolved" } });
    expect(replay).toMatchObject({ state: "already-handled", action: { status: "resolved" } });
    await expect(prisma.character.findUnique({ where: { id: characterId } })).resolves.toMatchObject({ gold: 3 });
    await expect(prisma.characterItem.findUnique({
      where: {
        characterId_itemId: {
          characterId,
          itemId: "item.responsible-panic-bandage"
        }
      }
    })).resolves.toMatchObject({ quantity: 1 });
  });

  it("clears only running search state and passage-search cooldowns for dev QA", async () => {
    await seedCharacter();
    const now = new Date("2026-06-26T10:00:00.000Z");
    await startSearch("resettoken1", now, new Date("2026-06-26T10:13:00.000Z"));
    await prisma.characterCooldown.create({
      data: {
        characterId,
        key: "unrelated",
        availableAt: new Date("2026-06-26T11:00:00.000Z")
      }
    });

    await expect(repository.clearSearchStateForTelegramUser(telegramUserId, new Date("2026-06-26T10:01:00.000Z"))).resolves.toMatchObject({
      state: "cleared",
      actions: 1,
      cooldowns: 1
    });
    await expect(prisma.passageSearchAction.findFirst()).resolves.toMatchObject({
      status: "cancelled",
      activeKey: null
    });
    await expect(prisma.characterCooldown.findMany()).resolves.toHaveLength(1);
    await expect(prisma.characterCooldown.findFirst()).resolves.toMatchObject({ key: "unrelated" });
  });

  async function seedCharacter(): Promise<void> {
    await prisma.user.create({
      data: {
        id: userId,
        telegramUserId,
        character: {
          create: {
            id: characterId,
            name: "Пошуковець",
            pronoun: "they",
            raceId: "human",
            classId: "warrior",
            level: 3,
            xp: 25,
            gold: 0,
            hpCurrent: 25,
            hpMax: 25,
            manaCurrent: 10,
            manaMax: 10,
            statsJson: {
              strength: 5,
              dexterity: 5,
              intelligence: 5,
              charisma: 5,
              luck: 5
            }
          }
        }
      }
    });
  }

  async function startSearch(token: string, now: Date, cooldownAvailableAt: Date): Promise<void> {
    const result = await repository.startForTelegramUser(telegramUserId, {
      now,
      token,
      nodeKey: "passage:deep-straight",
      nodeKind: "passage",
      cooldownKey: "passage-search:passage:deep-straight",
      cooldownAvailableAt,
      snapshot: makeSnapshot("passage:deep-straight", now)
    });
    expect(result.state).toBe("started");
  }
});

function makeSnapshot(nodeKey: string, now: Date): PassageSearchSnapshot {
  return {
    nodeKey,
    nodeKind: "passage",
    originLocationId: "location.korchma.deep.level1.straight",
    passage: "deep-straight",
    encounterToken: "encounter1",
    durationMs: 42_000,
    safeAtStart: false,
    dangerTier: 2,
    searchTier: 2,
    monsterIdAtStart: "monster.test",
    monsterNameAtStart: "Тестовий Шурхіт",
    monsterLevelAtStart: 3,
    playerLuckSnapshot: 5,
    startedAt: now.toISOString(),
    endsAt: new Date(now.getTime() + 42_000).toISOString()
  };
}

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
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT characters_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE
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
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT character_remorts_character_id_fkey FOREIGN KEY (character_id) REFERENCES characters (id) ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `CREATE UNIQUE INDEX character_remorts_character_id_remort_number_key ON character_remorts(character_id, remort_number)`,
    `CREATE TABLE character_cooldowns (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      key TEXT NOT NULL,
      available_at DATETIME NOT NULL,
      result_json JSONB,
      updated_at DATETIME NOT NULL,
      CONSTRAINT character_cooldowns_character_id_fkey FOREIGN KEY (character_id) REFERENCES characters (id) ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `CREATE UNIQUE INDEX character_cooldowns_character_id_key_key ON character_cooldowns(character_id, key)`,
    `CREATE TABLE passage_search_actions (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL,
      character_id TEXT NOT NULL,
      node_key TEXT NOT NULL,
      node_kind TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      active_key TEXT,
      started_at DATETIME NOT NULL,
      ends_at DATETIME NOT NULL,
      payload_json JSONB NOT NULL,
      result_json JSONB,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL,
      CONSTRAINT passage_search_actions_character_id_fkey FOREIGN KEY (character_id) REFERENCES characters (id) ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `CREATE UNIQUE INDEX passage_search_actions_token_key ON passage_search_actions(token)`,
    `CREATE UNIQUE INDEX passage_search_actions_active_key_key ON passage_search_actions(active_key)`,
    `CREATE TABLE character_items (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL,
      CONSTRAINT character_items_character_id_fkey FOREIGN KEY (character_id) REFERENCES characters (id) ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `CREATE UNIQUE INDEX character_items_character_id_item_id_key ON character_items(character_id, item_id)`,
    `CREATE TABLE daily_actions (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      key TEXT NOT NULL,
      local_date TEXT NOT NULL,
      reward_xp INTEGER NOT NULL,
      reward_gold INTEGER NOT NULL,
      spent_gold INTEGER NOT NULL DEFAULT 0,
      result_json JSONB,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT daily_actions_character_id_fkey FOREIGN KEY (character_id) REFERENCES characters (id) ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `CREATE UNIQUE INDEX daily_actions_character_id_key_local_date_key ON daily_actions(character_id, key, local_date)`
  ]) {
    await prisma.$executeRawUnsafe(statement);
  }
}
