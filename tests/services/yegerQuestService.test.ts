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
import {
  DailyActionQuantityLimitExceededError,
  type ClaimDailyActionInput,
  type ClaimDailyActionResult,
  type DailyActionRecord,
  type DailyActionRepository
} from "../../src/db/repositories/dailyActionRepository";
import type { SoloCombatSessionRepository } from "../../src/db/repositories/soloCombatSessionRepository";
import type { TelegramUserProfile } from "../../src/db/repositories/userRepository";
import { items, monsters } from "../../src/content";
import { summarizeCharacter, type CharacterSummary } from "../../src/domain/characters/characterSummary";
import { isProtectedMantokChestItem } from "../../src/domain/mantokChest";
import { FakeRandomSource } from "../../src/shared/random";
import type { FightLookupResult, FightService, PersistentFightStartOptions } from "../../src/services/fightService";
import {
  getYegerUnquietTrialTurnInXp,
  getYegerBandagePrice,
  getYegerTrackingExactChance,
  isYegerUnquietTarget,
  YEGER_BANDAGE_PURCHASE_DAILY_LIMIT,
  YEGER_BANDAGE_PRICE,
  YEGER_RANGER_BANDAGE_PRICE,
  YEGER_RANGER_FREE_BANDAGE_KEY,
  YEGER_TRACKING_COOLDOWN_KEY,
  YEGER_UNQUIET_TRIAL_COMPLETED_KEY,
  YEGER_UNQUIET_TRIAL_SECOND_COMPLETED_KEY,
  YEGER_UNQUIET_TRIAL_SECOND_STARTED_KEY,
  YEGER_UNQUIET_TRIAL_REWARD,
  YEGER_UNQUIET_TRIAL_STARTED_KEY,
  YegerQuestService
} from "../../src/services/yegerQuestService";
import { PRESENCE_LOCATION_KORCHMA_RANGER_CORNER } from "../../src/services/presenceService";

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

  it("offers the next 17 unquiet targets after the first board is complete", async () => {
    const world = new FakeWorld();
    world.addCharacter({ level: 6, xp: 170 });
    world.addAction(YEGER_UNQUIET_TRIAL_COMPLETED_KEY, startedAt, {
      rewardXp: 42,
      rewardGold: YEGER_UNQUIET_TRIAL_REWARD.gold
    });
    const service = world.service();

    await expect(service.getForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "offered",
      progress: { wins: 0, target: 17, stageId: "second" }
    });
    await expect(service.startForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "in-progress",
      progress: { wins: 0, target: 17, stageId: "second" }
    });
    expect(world.actions.filter((action) => action.key === YEGER_UNQUIET_TRIAL_SECOND_STARTED_KEY)).toHaveLength(1);
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

  it("counts the second Yeger board from its own start time", async () => {
    const world = new FakeWorld();
    world.addCharacter({ level: 8, xp: 320 });
    world.addAction(YEGER_UNQUIET_TRIAL_COMPLETED_KEY, new Date("2026-06-15T09:00:00.000Z"), {
      rewardXp: 42,
      rewardGold: YEGER_UNQUIET_TRIAL_REWARD.gold
    });
    world.addAction(YEGER_UNQUIET_TRIAL_SECOND_STARTED_KEY, startedAt);
    world.sessions.push(
      { monsterId: "monster.stamp-doorkeeper-skeleton", status: "won", createdAt: new Date(startedAt.getTime() - 1) },
      { monsterId: "monster.stamp-doorkeeper-skeleton", status: "won", createdAt: startedAt },
      { monsterId: "monster.unread-rules-ghost", status: "won", createdAt: new Date(startedAt.getTime() + 1) }
    );

    await expect(world.service().getForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "in-progress",
      progress: { wins: 2, target: 17, stageId: "second" }
    });
  });

  it("does not count an old unquiet win that was updated after the trail started", async () => {
    const world = new FakeWorld();
    world.addCharacter({ level: 5, xp: 110 });
    world.addAction(YEGER_UNQUIET_TRIAL_STARTED_KEY, startedAt);
    world.sessions.push(
      {
        monsterId: "monster.stamp-doorkeeper-skeleton",
        status: "won",
        createdAt: new Date(startedAt.getTime() - 60_000),
        completedAt: new Date(startedAt.getTime() - 60_000),
        updatedAt: new Date(startedAt.getTime() + 60_000)
      },
      {
        monsterId: "monster.unread-rules-ghost",
        status: "won",
        createdAt: new Date(startedAt.getTime() + 1),
        completedAt: new Date(startedAt.getTime() + 1),
        updatedAt: new Date(startedAt.getTime() + 2)
      }
    );

    await expect(world.service().getForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "in-progress",
      progress: { wins: 1, target: 5 }
    });
  });

  it("claims the completion reward once", async () => {
    const world = new FakeWorld();
    world.addCharacter({ level: 5, xp: 70 });
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
        xp: 35,
        gold: 120,
        itemGrants: [{ itemId: YEGER_UNQUIET_TRIAL_REWARD.itemId, quantity: 1 }]
      }
    });
    expect(repeated).toMatchObject({ state: "already-completed" });
    expect(world.actions.filter((action) => action.key === YEGER_UNQUIET_TRIAL_COMPLETED_KEY)).toHaveLength(1);
    expect(world.itemGrants).toEqual([{ itemId: YEGER_UNQUIET_TRIAL_REWARD.itemId, quantity: 1 }]);
    expect(world.character).toMatchObject({
      xp: 105,
      gold: 120
    });
  });

  it("scales turn-in XP by level so low-level Yeger completion cannot jump two levels", async () => {
    const world = new FakeWorld();
    world.addCharacter({ level: 4, xp: 69 });
    world.addAction(YEGER_UNQUIET_TRIAL_STARTED_KEY, startedAt);
    for (let index = 0; index < 5; index += 1) {
      world.sessions.push({
        monsterId: "monster.stamp-doorkeeper-skeleton",
        status: "won",
        createdAt: new Date(startedAt.getTime() + index)
      });
    }

    const first = await world.service().turnInForTelegramUser(telegramUserId);

    expect(first).toMatchObject({
      state: "completed",
      reward: {
        xp: 28,
        gold: 120
      }
    });
    expect(world.character?.xp).toBe(97);
  });

  it("keeps stale first-board turn-in callbacks replaying from the stored ledger", async () => {
    const world = new FakeWorld();
    world.addCharacter({ level: 5, xp: 190, gold: 120 });
    world.addAction(YEGER_UNQUIET_TRIAL_COMPLETED_KEY, startedAt, {
      rewardXp: 80,
      rewardGold: 120
    });

    await expect(world.service().getForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "offered",
      progress: { wins: 0, target: 17, stageId: "second" }
    });
    await expect(world.service().turnInForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "already-completed",
      progress: { wins: 5, target: 5, stageId: "first" },
      reward: {
        xp: 80,
        gold: 120
      }
    });
  });

  it("replays completed second Yeger board without first-board keepsake fallback", async () => {
    const world = new FakeWorld();
    world.addCharacter({ level: 8, xp: 320, gold: 290 });
    world.addAction(YEGER_UNQUIET_TRIAL_COMPLETED_KEY, startedAt, {
      rewardXp: 42,
      rewardGold: YEGER_UNQUIET_TRIAL_REWARD.gold
    });
    world.addAction(YEGER_UNQUIET_TRIAL_SECOND_COMPLETED_KEY, startedAt, {
      rewardXp: 56,
      rewardGold: 170
    });

    await expect(world.service().getForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "completed",
      progress: { wins: 17, target: 17, stageId: "second" },
      reward: {
        xp: 56,
        gold: 170,
        itemGrants: []
      }
    });
  });

  it("caps scaled Yeger turn-in XP at the old high-level reward", () => {
    expect(getYegerUnquietTrialTurnInXp({ level: 4 })).toBe(28);
    expect(getYegerUnquietTrialTurnInXp({ level: 13 })).toBe(80);
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
    expect(isYegerUnquietTarget({ tags: ["food", "bread", "rules"] })).toBe(false);
    expect(isYegerUnquietTarget(monsters.find((monster) => monster.id === "monster.salted-oath-pretzel")!)).toBe(false);
    expect(isYegerUnquietTarget(monsters.find((monster) => monster.id === "monster.unclosed-closure-act")!)).toBe(true);
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
    expect(world.fightStartOptions).toEqual([
      {
        source: "yeger",
        originLocationId: PRESENCE_LOCATION_KORCHMA_RANGER_CORNER,
        target: { tagsAny: ["undead", "ghost", "cursed", "unquiet"] }
      }
    ]);
    expect(world.cooldowns[0]?.availableAt).toEqual(new Date("2026-06-15T10:08:00.000Z"));
  });

  it("ignores ordinary monster rest when a ready trail finds a Yeger target", async () => {
    const world = new FakeWorld();
    world.addCharacter({ level: 5, xp: 110 });
    world.addAction(YEGER_UNQUIET_TRIAL_STARTED_KEY, startedAt);
    world.addCooldown(new Date("2026-06-15T10:04:00.000Z"));
    world.randomValues = [0, 0.1];
    world.fightOverviewResult = {
      state: "monster-rest",
      character: world.characterSummary(),
      questProgress: {
        stageId: "13",
        title: "Тринадцять дрібних проблем",
        wins: 3,
        target: 13,
        completed: false,
        rewardClaimed: false,
        issued: true,
        branchComplete: false
      },
      availableAt: new Date("2026-06-15T10:08:00.000Z"),
      now
    };
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
    expect(world.fightStartOptions).toEqual([
      {
        source: "yeger",
        originLocationId: PRESENCE_LOCATION_KORCHMA_RANGER_CORNER,
        target: { tagsAny: ["undead", "ghost", "cursed", "unquiet"] }
      }
    ]);
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

  it("lets Yeger sell bandages with a ranger discount", async () => {
    const world = new FakeWorld();
    world.addCharacter({ gold: 20, classId: "class.ranger" });

    const result = await world.service().buyBandageForTelegramUser(telegramUserId);

    expect(getYegerBandagePrice(world.characterSummary())).toBe(YEGER_RANGER_BANDAGE_PRICE);
    expect(result).toMatchObject({
      state: "bought",
      spentGold: YEGER_RANGER_BANDAGE_PRICE,
      itemGrants: [{ itemId: "item.responsible-panic-bandage", quantity: 1 }]
    });
    expect(world.character?.gold).toBe(16);
    expect(world.itemGrants).toEqual([{ itemId: "item.responsible-panic-bandage", quantity: 1 }]);
  });

  it("previews Yeger bandage purchase before spending gold", async () => {
    const world = new FakeWorld();
    world.addCharacter({ gold: 20, classId: "class.ranger" });

    const result = await world.service().previewBandagePurchaseForTelegramUser(telegramUserId);

    expect(result).toMatchObject({
      state: "preview",
      priceGold: YEGER_RANGER_BANDAGE_PRICE,
      currentGold: 20,
      itemGrants: [{ itemId: "item.responsible-panic-bandage", quantity: 1 }]
    });
    expect(world.character?.gold).toBe(20);
    expect(world.itemGrants).toEqual([]);
  });

  it("previews paid Yeger bandage bundles as fixed quantities", async () => {
    const world = new FakeWorld();
    world.addCharacter({ gold: 200, classId: "class.warrior" });

    const result = await world.service().previewBandagePurchaseForTelegramUser(telegramUserId, 17);

    expect(result).toMatchObject({
      state: "preview",
      targetQuantity: YEGER_BANDAGE_PURCHASE_DAILY_LIMIT,
      purchaseQuantity: 17,
      purchasedToday: 0,
      dailyLimit: YEGER_BANDAGE_PURCHASE_DAILY_LIMIT,
      unitPriceGold: YEGER_BANDAGE_PRICE,
      priceGold: YEGER_BANDAGE_PRICE * 17,
      currentGold: 200,
      itemGrants: [{ itemId: "item.responsible-panic-bandage", quantity: 17 }]
    });
    expect(world.character?.gold).toBe(200);
    expect(world.itemGrants).toEqual([]);
  });

  it("confirms a Yeger bandage purchase token at most once", async () => {
    const world = new FakeWorld();
    world.addCharacter({ gold: 20, classId: "class.ranger" });
    const preview = await world.service().previewBandagePurchaseForTelegramUser(telegramUserId);
    if (preview.state !== "preview") {
      throw new Error("Expected preview.");
    }

    const first = await world.service().confirmBandagePurchaseForTelegramUser(telegramUserId, preview.token);
    const replay = await world.service().confirmBandagePurchaseForTelegramUser(telegramUserId, preview.token);

    expect(first).toMatchObject({ state: "bought", spentGold: YEGER_RANGER_BANDAGE_PRICE });
    expect(replay).toMatchObject({ state: "replayed", spentGold: YEGER_RANGER_BANDAGE_PRICE });
    expect(world.character?.gold).toBe(16);
    expect(world.itemGrants).toEqual([{ itemId: "item.responsible-panic-bandage", quantity: 1 }]);
  });

  it("buys another fixed bundle after an earlier purchase", async () => {
    const world = new FakeWorld();
    world.addCharacter({ gold: 700, classId: "class.warrior" });
    const service = world.service();
    const five = await service.previewBandagePurchaseForTelegramUser(telegramUserId, 5);
    if (five.state !== "preview") {
      throw new Error("Expected first preview.");
    }

    await expect(service.confirmBandagePurchaseForTelegramUser(telegramUserId, five.token))
      .resolves.toMatchObject({
        state: "bought",
        spentGold: YEGER_BANDAGE_PRICE * 5,
        itemGrants: [{ itemId: "item.responsible-panic-bandage", quantity: 5 }]
      });
    const secondFive = await service.previewBandagePurchaseForTelegramUser(telegramUserId, 5);
    if (secondFive.state !== "preview") {
      throw new Error("Expected second bundle preview.");
    }

    expect(secondFive).toMatchObject({
      targetQuantity: YEGER_BANDAGE_PURCHASE_DAILY_LIMIT,
      purchaseQuantity: 5,
      purchasedToday: 5,
      priceGold: YEGER_BANDAGE_PRICE * 5,
      itemGrants: [{ itemId: "item.responsible-panic-bandage", quantity: 5 }]
    });
    await expect(service.confirmBandagePurchaseForTelegramUser(telegramUserId, secondFive.token))
      .resolves.toMatchObject({
        state: "bought",
        spentGold: YEGER_BANDAGE_PRICE * 5,
        itemGrants: [{ itemId: "item.responsible-panic-bandage", quantity: 5 }]
      });
    const remaining = await service.previewBandagePurchaseForTelegramUser(telegramUserId, 93);
    expect(remaining).toMatchObject({
      state: "preview",
      targetQuantity: YEGER_BANDAGE_PURCHASE_DAILY_LIMIT,
      purchaseQuantity: 83,
      purchasedToday: 10,
      dailyLimit: YEGER_BANDAGE_PURCHASE_DAILY_LIMIT
    });
    if (remaining.state !== "preview") {
      throw new Error("Expected remaining bundle preview.");
    }
    await service.confirmBandagePurchaseForTelegramUser(telegramUserId, remaining.token);
    await expect(service.previewBandagePurchaseForTelegramUser(telegramUserId, 1))
      .resolves.toMatchObject({
        state: "daily-limit",
        purchasedToday: 93,
        dailyLimit: YEGER_BANDAGE_PURCHASE_DAILY_LIMIT
      });
    expect(world.character?.gold).toBe(49);
    expect(world.itemGrants).toEqual([
      { itemId: "item.responsible-panic-bandage", quantity: 5 },
      { itemId: "item.responsible-panic-bandage", quantity: 5 },
      { itemId: "item.responsible-panic-bandage", quantity: 83 }
    ]);
  });

  it("stales a bundle confirmation when another receipt changes the same daily target", async () => {
    const world = new FakeWorld();
    world.addCharacter({ gold: 200, classId: "class.warrior" });
    const service = world.service();
    const first = await service.previewBandagePurchaseForTelegramUser(telegramUserId, 5);
    const second = await service.previewBandagePurchaseForTelegramUser(telegramUserId, 5);
    if (first.state !== "preview" || second.state !== "preview") {
      throw new Error("Expected previews.");
    }

    await expect(service.confirmBandagePurchaseForTelegramUser(telegramUserId, first.token))
      .resolves.toMatchObject({ state: "bought", itemGrants: [{ quantity: 5 }] });
    await expect(service.confirmBandagePurchaseForTelegramUser(telegramUserId, second.token))
      .resolves.toMatchObject({ state: "stale-token" });
    expect(world.character?.gold).toBe(165);
    expect(world.itemGrants).toEqual([{ itemId: "item.responsible-panic-bandage", quantity: 5 }]);
  });

  it("cancels a Yeger bandage purchase token before spend", async () => {
    const world = new FakeWorld();
    world.addCharacter({ gold: 20, classId: "class.warrior" });
    const preview = await world.service().previewBandagePurchaseForTelegramUser(telegramUserId);
    if (preview.state !== "preview") {
      throw new Error("Expected preview.");
    }

    await expect(world.service().cancelBandagePurchaseForTelegramUser(telegramUserId, preview.token))
      .resolves.toMatchObject({ state: "cancelled" });
    await expect(world.service().confirmBandagePurchaseForTelegramUser(telegramUserId, preview.token))
      .resolves.toMatchObject({ state: "cancelled" });
    expect(world.character?.gold).toBe(20);
    expect(world.itemGrants).toEqual([]);
  });

  it("replays the canonical Yeger receipt when cancel loses to confirm", async () => {
    const world = new FakeWorld();
    world.addCharacter({ gold: 20, classId: "class.ranger" });
    const preview = await world.service().previewBandagePurchaseForTelegramUser(telegramUserId);
    if (preview.state !== "preview") {
      throw new Error("Expected preview.");
    }

    await expect(world.service().confirmBandagePurchaseForTelegramUser(telegramUserId, preview.token))
      .resolves.toMatchObject({ state: "bought", spentGold: YEGER_RANGER_BANDAGE_PRICE });
    await expect(world.service().cancelBandagePurchaseForTelegramUser(telegramUserId, preview.token))
      .resolves.toMatchObject({
        state: "replayed",
        spentGold: YEGER_RANGER_BANDAGE_PRICE,
        itemGrants: [{ itemId: "item.responsible-panic-bandage", quantity: 1 }]
      });
    expect(world.character?.gold).toBe(16);
    expect(world.itemGrants).toEqual([{ itemId: "item.responsible-panic-bandage", quantity: 1 }]);
  });

  it("blocks Yeger bandage purchase without enough gold", async () => {
    const world = new FakeWorld();
    world.addCharacter({ gold: 0, classId: "class.warrior" });

    await expect(world.service().buyBandageForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "insufficient-gold",
      requiredGold: YEGER_BANDAGE_PRICE
    });
    expect(world.character?.gold).toBe(0);
    expect(world.itemGrants).toEqual([]);
  });

  it("gives rangers one free bandage on a 93-minute cooldown", async () => {
    const world = new FakeWorld();
    world.addCharacter({ classId: "class.ranger" });

    const first = await world.service().claimRangerBandageForTelegramUser(telegramUserId);
    const second = await world.service().claimRangerBandageForTelegramUser(telegramUserId);

    expect(first).toMatchObject({
      state: "claimed",
      itemGrants: [{ itemId: "item.responsible-panic-bandage", quantity: 1 }]
    });
    expect(second).toMatchObject({
      state: "on-cooldown",
      nextAvailableAt: new Date("2026-06-15T11:38:00.000Z")
    });
    expect(world.cooldowns.find((cooldown) => cooldown.key === YEGER_RANGER_FREE_BANDAGE_KEY)?.availableAt)
      .toEqual(new Date("2026-06-15T11:38:00.000Z"));
  });
});

class FakeWorld implements CharacterRepository, DailyActionRepository, SoloCombatSessionRepository, CooldownRepository {
  character: CharacterRecord | null = null;
  readonly actions: DailyActionRecord[] = [];
  readonly sessions: Array<{
    monsterId: string;
    status: "won" | "lost" | "fled" | "expired";
    createdAt: Date;
    completedAt?: Date;
    updatedAt?: Date;
    state?: { completedAt?: string } | null;
  }> = [];
  readonly itemGrants: Array<{ itemId: string; quantity: number }> = [];
  readonly cooldowns: CharacterCooldownRecord[] = [];
  readonly fightStartOptions: PersistentFightStartOptions[] = [];
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
        getOrStartPersistentFightForTelegramUser: (
          _telegramUserId: bigint,
          options?: PersistentFightStartOptions
        ) => {
          this.fightStartOptions.push(options ?? {});
          return this.fightResult();
        }
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

  addAction(
    key: string,
    createdAt = startedAt,
    reward: { rewardXp?: number; rewardGold?: number } = {}
  ): void {
    if (!this.character) {
      throw new Error("No character.");
    }

    this.actions.push({
      id: `action-${this.actions.length + 1}`,
      characterId: this.character.id,
      key,
      localDate: "once",
      rewardXp: reward.rewardXp ?? 0,
      rewardGold: reward.rewardGold ?? 0,
      spentGold: 0,
      resultJson: null,
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

    const spentGold = input.spentGold ?? 0;
    if (spentGold > 0 && this.character.gold < spentGold) {
      return Promise.resolve({
        state: "insufficient-gold",
        character: { ...this.character },
        requiredGold: spentGold
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
      gold: this.character.gold + input.rewardGold - spentGold
    };
    const itemGrants = input.itemGrants?.map((grant) => ({ itemId: grant.itemId, quantity: grant.quantity })) ?? [];
    this.itemGrants.push(...itemGrants);

    return Promise.resolve({
      state: "completed",
      cooldown,
      character: { ...this.character },
      levelChange: {
        oldLevel: this.character.level,
        newLevel: this.character.level,
        leveledUp: false
      },
      itemGrants
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
      spentGold: input.spentGold ?? 0,
      resultJson: input.resultJson as DailyActionRecord["resultJson"] ?? null,
      createdAt: startedAt
    };
    const spentGold = input.spentGold ?? 0;
    if (input.quantityLimit) {
      const currentQuantity = this.actions
        .filter((existingAction) => existingAction.key === input.quantityLimit?.key)
        .filter((existingAction) => {
          const result = existingAction.resultJson as { kind?: unknown; purchaseDay?: unknown } | null;

          return result?.kind === input.quantityLimit?.resultKind &&
            (result.purchaseDay ?? existingAction.createdAt.toISOString().slice(0, 10)) === input.quantityLimit?.purchaseDay;
        })
        .flatMap((existingAction) => {
          const result = existingAction.resultJson as {
            reward?: { appliedItemGrants?: Array<{ itemId: string; quantity: number }> };
          } | null;

          return result?.reward?.appliedItemGrants ?? [{ itemId: input.quantityLimit?.itemId, quantity: 1 }];
        })
        .filter((grant) => grant.itemId === input.quantityLimit?.itemId)
        .reduce((sum, grant) => sum + grant.quantity, 0);

      if (currentQuantity + input.quantityLimit.quantity > input.quantityLimit.maxQuantity) {
        throw new DailyActionQuantityLimitExceededError(currentQuantity, input.quantityLimit.maxQuantity);
      }
    }
    if (spentGold > 0 && this.character.gold < spentGold) {
      return Promise.resolve({
        state: "insufficient-gold",
        character: { ...this.character },
        requiredGold: spentGold
      });
    }
    this.actions.push(action);
    this.character = {
      ...this.character,
      xp: this.character.xp + input.rewardXp,
      gold: this.character.gold + input.rewardGold - spentGold
    };
    const itemGrants = input.itemGrants?.map((grant) => ({ itemId: grant.itemId, quantity: grant.quantity })) ?? [];
    this.itemGrants.push(...itemGrants);
    if (itemGrants.length > 0) {
      action.resultJson = {
        ...(action.resultJson && typeof action.resultJson === "object" && !Array.isArray(action.resultJson)
          ? action.resultJson
          : {}),
        reward: {
          appliedItemGrants: itemGrants
        }
      };
    }

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

  listForTelegramUser(
    _telegramUserId: bigint,
    input: { key: string }
  ): Promise<DailyActionRecord[] | null> {
    if (!this.character) {
      return Promise.resolve(null);
    }

    return Promise.resolve(this.actions.filter((action) => action.key === input.key));
  }

  listCompletedByTelegramUserIdSince(_telegramUserId: bigint, since: Date) {
    return Promise.resolve(
      this.sessions.flatMap((session) => {
        const completedAt = session.completedAt ?? (
          session.state?.completedAt ? new Date(session.state.completedAt) : session.createdAt
        );

        if (completedAt < since) {
          return [];
        }

        return [{
          ...session,
          updatedAt: session.updatedAt ?? completedAt,
          completedAt,
          state: session.state ?? null
        }];
      })
    );
  }

  countWonByTelegramUserId(
    _telegramUserId: bigint,
    options: { excludeMonsterIds?: readonly string[] } = {}
  ): Promise<number> {
    const excludedMonsterIds = new Set(options.excludeMonsterIds ?? []);

    return Promise.resolve(
      this.sessions.filter(
        (session) => session.status === "won" && !excludedMonsterIds.has(session.monsterId)
      ).length
    );
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
