import { describe, expect, it } from "vitest";
import type {
  CharacterRecord,
  CharacterRepository,
  CreateCharacterInput,
  CreateCharacterResult
} from "../../src/db/repositories/characterRepository";
import type {
  CharacterCooldownRecord,
  ClaimCooldownRewardInput,
  ClaimCooldownRewardResult,
  CooldownRepository
} from "../../src/db/repositories/cooldownRepository";
import type {
  ClaimDailyActionInput,
  ClaimDailyActionResult,
  DailyActionRecord,
  DailyActionRepository
} from "../../src/db/repositories/dailyActionRepository";
import type { SoloCombatSessionRepository } from "../../src/db/repositories/soloCombatSessionRepository";
import type { TelegramUserProfile } from "../../src/db/repositories/userRepository";
import { items, monsters } from "../../src/content";
import { summarizeCharacter, type CharacterSummary } from "../../src/domain/characters/characterSummary";
import { isProtectedMantokChestItem } from "../../src/domain/mantokChest";
import { FakeRandomSource } from "../../src/shared/random";
import type { FightLookupResult, FightService } from "../../src/services/fightService";
import {
  getYegerTrackingExactChance,
  isYegerUnquietTarget,
  YEGER_TRACKING_COOLDOWN_KEY,
  YEGER_UNQUIET_TRIAL_COMPLETED_KEY,
  YEGER_UNQUIET_TRIAL_REWARD,
  YEGER_UNQUIET_TRIAL_STARTED_KEY,
  YegerQuestService
} from "../../src/services/yegerQuestService";

const telegramUserId = 42n;
const startedAt = new Date("2026-06-15T10:00:00.000Z");
const now = new Date("2026-06-15T10:05:00.000Z");

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

  it("keeps Yeger targets available across the ordinary level ladder", () => {
    const targetLevels = new Set(
      monsters
        .filter((monster) => {
          const tags = new Set(monster.tags);

          return (
            monster.level >= 4 &&
            monster.level <= 13 &&
            !tags.has("starter") &&
            !tags.has("boss") &&
            !tags.has("mini-boss") &&
            !tags.has("tiny-boss") &&
            isYegerUnquietTarget(monster)
          );
        })
        .map((monster) => monster.level)
    );

    expect([...targetLevels].sort((left, right) => left - right)).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect(targetLevels.size).toBeGreaterThanOrEqual(10);
  });

  it("starts tracking as a cooldown without rewards", async () => {
    const world = new FakeWorld();
    world.addCharacter({ level: 5, xp: 110 });
    world.addAction(YEGER_UNQUIET_TRIAL_STARTED_KEY, startedAt);
    world.randomValues = [0];

    const result = await world.service().trackForTelegramUser(telegramUserId);

    expect(result).toMatchObject({
      state: "tracking-started",
      progress: { wins: 0, target: 5 },
      tracking: {
        state: "tracking-pending",
        availableAt: new Date("2026-06-15T10:08:00.000Z")
      }
    });
    expect(world.cooldowns).toHaveLength(1);
    expect(world.character?.xp).toBe(110);
    expect(world.character?.gold).toBe(0);
    expect(world.itemGrants).toEqual([]);
  });

  it("does not restart or shorten pending tracking", async () => {
    const world = new FakeWorld();
    world.addCharacter({ level: 5, xp: 110 });
    world.addAction(YEGER_UNQUIET_TRIAL_STARTED_KEY, startedAt);
    world.addCooldown(new Date("2026-06-15T10:12:00.000Z"));

    const result = await world.service().trackForTelegramUser(telegramUserId);

    expect(result).toMatchObject({
      state: "tracking-pending",
      tracking: {
        availableAt: new Date("2026-06-15T10:12:00.000Z")
      }
    });
    expect(world.cooldowns[0]?.availableAt).toEqual(new Date("2026-06-15T10:12:00.000Z"));
  });

  it("resolves a ready successful trail into a targeted unquiet fight", async () => {
    const world = new FakeWorld();
    world.addCharacter({ level: 5, xp: 110 });
    world.addAction(YEGER_UNQUIET_TRIAL_STARTED_KEY, startedAt);
    world.addCooldown(new Date("2026-06-15T10:04:00.000Z"));
    world.randomValues = [0, 0.1];
    let fightStarts = 0;
    world.fightResult = () => {
      fightStarts += 1;
      return Promise.resolve({
        state: "persistent-active",
        character: world.characterSummary(),
        session: {
          id: "fight-1",
          characterId: "character-42",
          monsterId: "monster.complaint-lantern",
          status: "active",
          turn: 1,
          state: null,
          reward: null,
          expiresAt: new Date(now.getTime() + 600_000),
          createdAt: now,
          updatedAt: now
        },
        monster: {
          id: "monster.complaint-lantern",
          name: "Скаргова лампа",
          description: "Світить не там.",
          level: 4,
          tags: ["unquiet"]
        },
        questProgress: null
      });
    };

    const result = await world.service().trackForTelegramUser(telegramUserId);

    expect(result).toMatchObject({
      state: "tracking-resolved-success",
      fight: {
        state: "persistent-active",
        monster: { id: "monster.complaint-lantern" }
      }
    });
    expect(fightStarts).toBe(1);
    expect(world.cooldowns[0]?.availableAt).toEqual(new Date("2026-06-15T10:08:00.000Z"));
  });

  it("does not consume a ready trail while another fight is active", async () => {
    const world = new FakeWorld();
    world.addCharacter({ level: 5, xp: 110 });
    world.addAction(YEGER_UNQUIET_TRIAL_STARTED_KEY, startedAt);
    world.addCooldown(new Date("2026-06-15T10:04:00.000Z"));
    world.fightOverviewResult = {
      state: "persistent-active",
      character: world.characterSummary(),
      session: {
        id: "fight-1",
        characterId: "character-42",
        monsterId: "monster.deadline-spider",
        status: "active",
        turn: 1,
        state: null,
        reward: null,
        expiresAt: new Date(now.getTime() + 600_000),
        createdAt: now,
        updatedAt: now
      },
      monster: {
        id: "monster.deadline-spider",
        name: "Павук дедлайнів",
        description: "Плете павутину.",
        level: 2,
        tags: ["beast", "time", "web"]
      },
      questProgress: null
    };
    let fightStarts = 0;
    world.fightResult = () => {
      fightStarts += 1;
      return Promise.resolve({ state: "no-character" });
    };

    const result = await world.service().trackForTelegramUser(telegramUserId);

    expect(result).toMatchObject({
      state: "tracking-blocked-by-other-fight",
      tracking: {
        state: "tracking-ready",
        availableAt: new Date("2026-06-15T10:04:00.000Z")
      },
      fight: {
        state: "persistent-active",
        monster: { id: "monster.deadline-spider" }
      }
    });
    expect(world.cooldowns[0]?.availableAt).toEqual(new Date("2026-06-15T10:04:00.000Z"));
    expect(fightStarts).toBe(0);
  });

  it("resolves a ready failed trail without starting a fight", async () => {
    const world = new FakeWorld();
    world.addCharacter({ level: 5, xp: 110 });
    world.addAction(YEGER_UNQUIET_TRIAL_STARTED_KEY, startedAt);
    world.addCooldown(new Date("2026-06-15T10:04:00.000Z"));
    world.randomValues = [0, 0.99, 0.99];
    let fightStarts = 0;
    world.fightResult = () => {
      fightStarts += 1;
      return Promise.resolve({ state: "no-character" });
    };

    const result = await world.service().trackForTelegramUser(telegramUserId);

    expect(result).toMatchObject({
      state: "tracking-resolved-none",
      outcome: "none",
      progress: { wins: 0, target: 5 }
    });
    expect(fightStarts).toBe(0);
  });

  it("gives rangers a bounded tracking advantage", () => {
    const ordinary = worldCharacterSummary({ classId: "class.warrior" });
    const ranger = worldCharacterSummary({ classId: "class.ranger" });
    const sharpRanger = worldCharacterSummary({
      classId: "class.ranger",
      statsJson: {
        strength: 6,
        dexterity: 6,
        intelligence: 20,
        charisma: 6,
        luck: 20
      }
    });

    expect(getYegerTrackingExactChance(ranger)).toBeGreaterThan(getYegerTrackingExactChance(ordinary));
    expect(getYegerTrackingExactChance(sharpRanger)).toBeLessThanOrEqual(0.95);
  });
});

class FakeWorld implements CharacterRepository, DailyActionRepository, SoloCombatSessionRepository, CooldownRepository {
  character: CharacterRecord | null = null;
  readonly actions: DailyActionRecord[] = [];
  readonly sessions: Array<{ monsterId: string; status: "won" | "lost" | "fled" | "expired"; createdAt: Date }> = [];
  readonly itemGrants: Array<{ itemId: string; quantity: number }> = [];
  readonly cooldowns: CharacterCooldownRecord[] = [];
  randomValues: number[] = [0];
  fightOverviewResult: FightLookupResult = { state: "no-character" };
  fightResult: () => ReturnType<FightService["getOrStartPersistentFightForTelegramUser"]> = () =>
    Promise.resolve({ state: "no-character" });

  service(): YegerQuestService {
    return new YegerQuestService(
      this,
      this,
      this,
      {
        getFightOverviewForTelegramUser: () => Promise.resolve(this.fightOverviewResult),
        getOrStartPersistentFightForTelegramUser: () => this.fightResult()
      } as unknown as FightService,
      this,
      () => now,
      new FakeRandomSource(this.randomValues)
    );
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

  addCooldown(availableAt: Date): void {
    if (!this.character) {
      throw new Error("No character.");
    }

    this.cooldowns.push({
      id: `cooldown-${this.cooldowns.length + 1}`,
      characterId: this.character.id,
      key: YEGER_TRACKING_COOLDOWN_KEY,
      availableAt,
      updatedAt: now
    });
  }

  characterSummary(): CharacterSummary {
    if (!this.character) {
      throw new Error("No character.");
    }

    return summarizeCharacter(this.character);
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

  findForTelegramUser(
    _telegramUserId: bigint,
    input: { key: string; localDate: string }
  ): Promise<DailyActionRecord | null>;
  findForTelegramUser(
    _telegramUserId: bigint,
    key: string
  ): Promise<{ cooldown: CharacterCooldownRecord | null; character: CharacterRecord } | null>;
  findForTelegramUser(
    _telegramUserId: bigint,
    input: { key: string; localDate: string } | string
  ): Promise<DailyActionRecord | { cooldown: CharacterCooldownRecord | null; character: CharacterRecord } | null> {
    if (typeof input === "string") {
      if (!this.character) {
        return Promise.resolve(null);
      }

      return Promise.resolve({
        cooldown: this.cooldowns.find((cooldown) => cooldown.key === input) ?? null,
        character: { ...this.character }
      });
    }

    return Promise.resolve(
      this.actions.find((action) => action.key === input.key && action.localDate === input.localDate) ?? null
    );
  }

  claimRewardForTelegramUser(
    _telegramUserId: bigint,
    input: ClaimCooldownRewardInput
  ): Promise<ClaimCooldownRewardResult | null> {
    if (!this.character) {
      return Promise.resolve(null);
    }

    const existing = this.cooldowns.find((cooldown) => cooldown.key === input.key);

    if (existing && existing.availableAt > input.now) {
      return Promise.resolve({
        state: "on-cooldown",
        cooldown: existing,
        character: { ...this.character }
      });
    }

    const cooldown: CharacterCooldownRecord = existing ?? {
      id: `cooldown-${this.cooldowns.length + 1}`,
      characterId: this.character.id,
      key: input.key,
      availableAt: input.availableAt,
      updatedAt: input.now
    };
    cooldown.availableAt = input.availableAt;
    cooldown.updatedAt = input.now;

    if (!existing) {
      this.cooldowns.push(cooldown);
    }

    this.character = {
      ...this.character,
      xp: this.character.xp + input.rewardXp,
      gold: this.character.gold + input.rewardGold
    };

    return Promise.resolve({
      state: "completed",
      cooldown,
      character: { ...this.character },
      levelChange: {
        oldLevel: this.character.level,
        newLevel: this.character.level,
        leveledUp: false
      },
      itemGrants: input.itemGrants ?? []
    });
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

function worldCharacterSummary(overrides: Partial<CharacterRecord> = {}): CharacterSummary {
  const world = new FakeWorld();
  world.addCharacter(overrides);

  return world.characterSummary();
}
