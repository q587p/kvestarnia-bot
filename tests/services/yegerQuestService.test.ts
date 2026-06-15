import { describe, expect, it } from "vitest";
import type {
  CharacterRecord,
  CharacterRepository,
  CreateCharacterInput,
  CreateCharacterResult
} from "../../src/db/repositories/characterRepository";
import type {
  ClaimDailyActionInput,
  ClaimDailyActionResult,
  DailyActionRecord,
  DailyActionRepository
} from "../../src/db/repositories/dailyActionRepository";
import type { SoloCombatSessionRepository } from "../../src/db/repositories/soloCombatSessionRepository";
import type { TelegramUserProfile } from "../../src/db/repositories/userRepository";
import { items } from "../../src/content";
import { isProtectedMantokChestItem } from "../../src/domain/mantokChest";
import type { FightService } from "../../src/services/fightService";
import {
  isYegerUnquietTarget,
  YEGER_UNQUIET_TRIAL_COMPLETED_KEY,
  YEGER_UNQUIET_TRIAL_REWARD,
  YEGER_UNQUIET_TRIAL_STARTED_KEY,
  YegerQuestService
} from "../../src/services/yegerQuestService";

const telegramUserId = 42n;
const startedAt = new Date("2026-06-15T10:00:00.000Z");

describe("YegerQuestService", () => {
  it("gates the first Yeger quest at level 4", async () => {
    const world = new FakeWorld();
    world.addCharacter({ level: 3, xp: 25 });
    const service = world.service();

    await expect(service.getForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "level-locked",
      requiredLevel: 4
    });
    expect(world.actions).toHaveLength(0);
  });

  it("offers and starts the unquiet trial idempotently", async () => {
    const world = new FakeWorld();
    world.addCharacter({ level: 4, xp: 70 });
    const service = world.service();

    await expect(service.getForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "offered",
      progress: { wins: 0, target: 5 }
    });
    await expect(service.startForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "in-progress",
      progress: { wins: 0, target: 5 }
    });
    await expect(service.startForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "in-progress"
    });
    expect(world.actions.filter((action) => action.key === YEGER_UNQUIET_TRIAL_STARTED_KEY)).toHaveLength(1);
  });

  it("counts only won unquiet sessions after quest start", async () => {
    const world = new FakeWorld();
    world.addCharacter({ level: 5, xp: 110 });
    world.addAction(YEGER_UNQUIET_TRIAL_STARTED_KEY, startedAt);
    world.sessions.push(
      { monsterId: "monster.stamp-doorkeeper-skeleton", status: "won", createdAt: startedAt },
      { monsterId: "monster.unread-rules-ghost", status: "won", createdAt: new Date(startedAt.getTime() + 1) },
      { monsterId: "monster.self-critique-mirror", status: "lost", createdAt: new Date(startedAt.getTime() + 2) },
      { monsterId: "monster.deadline-spider", status: "won", createdAt: new Date(startedAt.getTime() + 3) },
      { monsterId: "monster.three-signature-chimera", status: "won", createdAt: new Date(startedAt.getTime() - 1) }
    );

    await expect(world.service().getForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "in-progress",
      progress: { wins: 2, target: 5 }
    });
  });

  it("claims the completion reward once", async () => {
    const world = new FakeWorld();
    world.addCharacter({ level: 5, xp: 110 });
    world.addAction(YEGER_UNQUIET_TRIAL_STARTED_KEY, startedAt);
    for (let index = 0; index < 5; index += 1) {
      world.sessions.push({
        monsterId: "monster.stamp-doorkeeper-skeleton",
        status: "won",
        createdAt: new Date(startedAt.getTime() + index)
      });
    }

    const first = await world.service().turnInForTelegramUser(telegramUserId);
    const repeated = await world.service().turnInForTelegramUser(telegramUserId);

    expect(first).toMatchObject({
      state: "completed",
      reward: {
        xp: 80,
        gold: 120,
        itemGrants: [{ itemId: YEGER_UNQUIET_TRIAL_REWARD.itemId, quantity: 1 }]
      }
    });
    expect(repeated).toMatchObject({ state: "already-completed" });
    expect(world.actions.filter((action) => action.key === YEGER_UNQUIET_TRIAL_COMPLETED_KEY)).toHaveLength(1);
    expect(world.itemGrants).toEqual([{ itemId: YEGER_UNQUIET_TRIAL_REWARD.itemId, quantity: 1 }]);
  });

  it("defines the Yeger keepsake and keeps it out of Mantok Chest", () => {
    const item = items.find((candidate) => candidate.id === YEGER_UNQUIET_TRIAL_REWARD.itemId);

    expect(item).toMatchObject({
      name: "Єгерська риска на дощечці",
      slot: "cosmetic",
      rarity: "uncommon"
    });
    expect(item && isProtectedMantokChestItem(item)).toBe(true);
  });

  it("keeps the unquiet target predicate narrow", () => {
    expect(isYegerUnquietTarget({ tags: ["undead"] })).toBe(true);
    expect(isYegerUnquietTarget({ tags: ["ghost"] })).toBe(true);
    expect(isYegerUnquietTarget({ tags: ["cursed"] })).toBe(true);
    expect(isYegerUnquietTarget({ tags: ["beast", "paperwork"] })).toBe(false);
  });
});

class FakeWorld implements CharacterRepository, DailyActionRepository, SoloCombatSessionRepository {
  private character: CharacterRecord | null = null;
  readonly actions: DailyActionRecord[] = [];
  readonly sessions: Array<{ monsterId: string; status: "won" | "lost" | "fled" | "expired"; createdAt: Date }> = [];
  readonly itemGrants: Array<{ itemId: string; quantity: number }> = [];

  service(): YegerQuestService {
    return new YegerQuestService(this, this, this, {
      getOrStartPersistentFightForTelegramUser: () => Promise.resolve({ state: "no-character" })
    } as unknown as FightService);
  }

  addCharacter(overrides: Partial<CharacterRecord> = {}): void {
    this.character = {
      id: "character-42",
      userId: "user-42",
      name: "Мандрівник",
      pronoun: "they",
      path: "boundary",
      raceId: "race.human-ish",
      classId: "class.warrior",
      level: 4,
      xp: 70,
      gold: 0,
      hpCurrent: 24,
      hpMax: 24,
      manaCurrent: 12,
      manaMax: 12,
      statsJson: {
        strength: 8,
        dexterity: 6,
        intelligence: 6,
        charisma: 6,
        luck: 6
      },
      ...overrides
    };
  }

  addAction(key: string, createdAt = startedAt): void {
    if (!this.character) {
      throw new Error("No character.");
    }

    this.actions.push({
      id: `action-${this.actions.length + 1}`,
      characterId: this.character.id,
      key,
      localDate: "once",
      rewardXp: 0,
      rewardGold: 0,
      createdAt
    });
  }

  findByTelegramUserId(): Promise<CharacterRecord | null> {
    return Promise.resolve(this.character ? { ...this.character } : null);
  }

  findForTelegramUser(_telegramUserId: bigint, input: { key: string; localDate: string }): Promise<DailyActionRecord | null> {
    return Promise.resolve(
      this.actions.find((action) => action.key === input.key && action.localDate === input.localDate) ?? null
    );
  }

  claimForTelegramUser(_telegramUserId: bigint, input: ClaimDailyActionInput): Promise<ClaimDailyActionResult | null> {
    if (!this.character) {
      return Promise.resolve(null);
    }

    const existing = this.actions.find(
      (action) => action.key === input.key && action.localDate === input.localDate
    );

    if (existing) {
      return Promise.resolve({
        state: "existing",
        action: existing,
        character: { ...this.character },
        levelChange: null,
        itemGrants: []
      });
    }

    const action: DailyActionRecord = {
      id: `action-${this.actions.length + 1}`,
      characterId: this.character.id,
      key: input.key,
      localDate: input.localDate,
      rewardXp: input.rewardXp,
      rewardGold: input.rewardGold,
      createdAt: startedAt
    };
    this.actions.push(action);
    this.character = {
      ...this.character,
      xp: this.character.xp + input.rewardXp,
      gold: this.character.gold + input.rewardGold
    };
    const itemGrants = input.itemGrants?.map((grant) => ({ itemId: grant.itemId, quantity: grant.quantity })) ?? [];
    this.itemGrants.push(...itemGrants);

    return Promise.resolve({
      state: "created",
      action,
      character: { ...this.character },
      levelChange: {
        oldLevel: 4,
        newLevel: this.character.level,
        leveledUp: false
      },
      itemGrants
    });
  }

  listByTelegramUserIdSince(_telegramUserId: bigint, since: Date) {
    return Promise.resolve(this.sessions.filter((session) => session.createdAt >= since));
  }

  countWonByTelegramUserId(): Promise<number> {
    return Promise.resolve(this.sessions.filter((session) => session.status === "won").length);
  }

  findActiveByTelegramUserId() { return Promise.resolve(null); }
  findByIdForTelegramUserId() { return Promise.resolve(null); }
  createForTelegramUser() { return Promise.resolve(null); }
  updateById() { return Promise.resolve(null); }
  updateByIdIfActiveTurn() { return Promise.resolve(null); }
  recordRewardById() { return Promise.resolve(null); }
  markStatusById() { return Promise.resolve(null); }
  findByUserId(): Promise<CharacterRecord | null> { return Promise.resolve(this.character); }
  deleteByTelegramUserId(): Promise<boolean> { return Promise.resolve(false); }
  createForTelegramUserIfMissing(_user: TelegramUserProfile, input: CreateCharacterInput): Promise<CreateCharacterResult> {
    this.addCharacter(input);
    return Promise.resolve({ character: this.character as CharacterRecord, created: true });
  }
}
