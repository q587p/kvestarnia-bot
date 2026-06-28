import { describe, expect, it } from "vitest";
import type { CharacterRecord } from "../../src/db/repositories/characterRepository";
import type {
  CellarGrownupFinalEnding,
  CellarGrownupQuestRepository,
  CellarGrownupQuestRepositoryKeys,
  CellarGrownupQuestSnapshot
} from "../../src/db/repositories/cellarGrownupQuestRepository";
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
import { getLevelForXp } from "../../src/domain/progression/level";
import { summarizeCharacter, type CharacterSummary } from "../../src/domain/characters/characterSummary";
import {
  CELLAR_GROWNUP_ROLEPLAY_MAX_CHANCE,
  CELLAR_GROWNUP_ROLEPLAY_COOLDOWN_KEY,
  CELLAR_GROWNUP_ROLEPLAY_COOLDOWN_MS,
  CELLAR_GROWNUP_SEAL_PRICE,
  CellarGrownupQuestService,
  getRoleplayChance
} from "../../src/services/cellarGrownupQuestService";
import {
  CELLAR_CHEESE_SEAL_ITEM_ID,
  CELLAR_FOAMY_MIRAGE_BOTTLE_ITEM_ID
} from "../../src/services/itemGrant";

const telegramUserId = 42n;
const now = new Date("2026-06-15T09:00:00.000Z");

describe("CellarGrownupQuestService", () => {
  it("keeps level three on the old mouse behavior", async () => {
    const world = new FakeCellarGrownupWorld();
    world.addCharacter({ xp: 25 });
    const service = createService(world);

    await expect(service.getForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "too-young",
      requiredLevel: 4
    });
  });

  it("offers the grownup cellar quest from level four", async () => {
    const world = new FakeCellarGrownupWorld();
    world.addCharacter({ xp: 45 });
    const service = createService(world);

    await expect(service.getForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "offered",
      price: CELLAR_GROWNUP_SEAL_PRICE
    });
  });

  it("buys the cheese seal once without duplicate spending", async () => {
    const world = new FakeCellarGrownupWorld();
    world.addCharacter({ xp: 45, gold: 300 });
    const service = createService(world);

    await expect(service.buySeal(telegramUserId)).resolves.toMatchObject({
      state: "seal-purchased",
      price: CELLAR_GROWNUP_SEAL_PRICE
    });
    await expect(service.buySeal(telegramUserId)).resolves.toMatchObject({
      state: "seal-already-owned"
    });

    expect(world.character?.gold).toBe(60);
    expect(world.getItem(CELLAR_CHEESE_SEAL_ITEM_ID)).toBe(1);
    expect(world.purchaseCount).toBe(1);
  });

  it("does not buy the seal without enough gold", async () => {
    const world = new FakeCellarGrownupWorld();
    world.addCharacter({ xp: 45, gold: 12 });
    const service = createService(world);

    await expect(service.buySeal(telegramUserId)).resolves.toMatchObject({
      state: "insufficient-gold",
      price: CELLAR_GROWNUP_SEAL_PRICE
    });

    expect(world.character?.gold).toBe(12);
    expect(world.getItem(CELLAR_CHEESE_SEAL_ITEM_ID)).toBe(0);
  });

  it("passes with a seal and grants the bottle once", async () => {
    const world = new FakeCellarGrownupWorld();
    world.addCharacter({ xp: 45, gold: 300 });
    const service = createService(world);

    await service.buySeal(telegramUserId);
    await expect(service.showSeal(telegramUserId)).resolves.toMatchObject({
      state: "bottle-obtained",
      source: "seal"
    });
    await expect(service.showSeal(telegramUserId)).resolves.toMatchObject({
      state: "bottle-obtained",
      source: "seal"
    });

    expect(world.getItem(CELLAR_FOAMY_MIRAGE_BOTTLE_ITEM_ID)).toBe(1);
    expect(world.bottleClaimCount).toBe(1);
  });

  it("does not grant the bottle from the first roleplay attempt", async () => {
    const world = new FakeCellarGrownupWorld();
    world.addCharacter({
      xp: 45,
      raceId: "race.domovyk",
      classId: "class.bard"
    });
    const service = createService(world, () => 0);

    await expect(service.attemptRoleplay(telegramUserId)).resolves.toMatchObject({
      state: "roleplay-failed",
      chance: 0
    });

    expect(world.getItem(CELLAR_FOAMY_MIRAGE_BOTTLE_ITEM_ID)).toBe(0);
  });

  it("can pass through roleplay only after an earlier failed attempt", async () => {
    const world = new FakeCellarGrownupWorld();
    world.addCharacter({
      xp: 45,
      raceId: "race.domovyk",
      classId: "class.bard"
    });
    world.setRoleplayCooldown(new Date(now.getTime() - 1));
    const service = createService(world, () => 0);

    await expect(service.attemptRoleplay(telegramUserId)).resolves.toMatchObject({
      state: "bottle-obtained",
      source: "roleplay"
    });
    expect(world.getItem(CELLAR_FOAMY_MIRAGE_BOTTLE_ITEM_ID)).toBe(1);
  });

  it("caps roleplay bottle chance at thirteen percent", () => {
    const world = new FakeCellarGrownupWorld();
    world.addCharacter({
      xp: 45,
      raceId: "race.domovyk",
      classId: "class.bard",
      statsJson: {
        strength: 8,
        dexterity: 6,
        intelligence: 6,
        charisma: 13,
        luck: 13
      }
    });

    expect(getRoleplayChance(world.characterSummary())).toBe(CELLAR_GROWNUP_ROLEPLAY_MAX_CHANCE);
  });

  it("starts cooldown after failed roleplay without blocking paid routes", async () => {
    const world = new FakeCellarGrownupWorld();
    world.addCharacter({ xp: 45, gold: 300 });
    const service = createService(world, () => 0.99);

    const failed = await service.attemptRoleplay(telegramUserId);

    expect(failed).toMatchObject({
      state: "roleplay-failed"
    });
    if (failed.state === "roleplay-failed") {
      expect(failed.availableAt).toEqual(
        new Date(now.getTime() + CELLAR_GROWNUP_ROLEPLAY_COOLDOWN_MS)
      );
    }
    await expect(service.attemptRoleplay(telegramUserId)).resolves.toMatchObject({
      state: "roleplay-cooldown"
    });
    await expect(service.buySeal(telegramUserId)).resolves.toMatchObject({
      state: "seal-purchased"
    });
  });

  it("turns in the bottle once and consumes it", async () => {
    const world = new FakeCellarGrownupWorld();
    world.addCharacter({ xp: 45, gold: 300 });
    world.setItem(CELLAR_FOAMY_MIRAGE_BOTTLE_ITEM_ID, 1);
    const service = createService(world);

    await expect(service.complete(telegramUserId, "turn-in")).resolves.toMatchObject({
      state: "completed",
      ending: "turn-in",
      reward: {
        xp: 80,
        gold: 180
      }
    });
    await expect(service.complete(telegramUserId, "turn-in")).resolves.toMatchObject({
      state: "already-completed",
      ending: "turn-in"
    });

    expect(world.character?.xp).toBe(125);
    expect(world.character?.gold).toBe(480);
    expect(world.getItem(CELLAR_FOAMY_MIRAGE_BOTTLE_ITEM_ID)).toBe(0);
    expect(world.completionCount).toBe(1);
  });

  it("can keep the final bottle and still completes once", async () => {
    const world = new FakeCellarGrownupWorld();
    world.addCharacter({ xp: 45, gold: 10 });
    world.setItem(CELLAR_FOAMY_MIRAGE_BOTTLE_ITEM_ID, 1);
    const service = createService(world);

    await expect(service.complete(telegramUserId, "keep")).resolves.toMatchObject({
      state: "completed",
      ending: "keep",
      reward: {
        xp: 40,
        gold: 0
      }
    });
    await expect(service.complete(telegramUserId, "turn-in")).resolves.toMatchObject({
      state: "already-completed",
      ending: "keep"
    });

    expect(world.character?.xp).toBe(85);
    expect(world.character?.gold).toBe(10);
    expect(world.getItem(CELLAR_FOAMY_MIRAGE_BOTTLE_ITEM_ID)).toBe(1);
    expect(world.completionCount).toBe(1);
  });
});

function createService(
  world: FakeCellarGrownupWorld,
  roll: () => number = () => 0
): CellarGrownupQuestService {
  return new CellarGrownupQuestService(world, world, world, () => now, roll);
}

class FakeCellarGrownupWorld
  implements CellarGrownupQuestRepository, DailyActionRepository, CooldownRepository
{
  character: CharacterRecord | null = null;
  private readonly items = new Map<string, number>();
  private readonly dailyActions = new Map<string, DailyActionRecord>();
  private readonly cooldowns = new Map<string, CharacterCooldownRecord>();
  purchaseCount = 0;
  bottleClaimCount = 0;
  completionCount = 0;

  addCharacter(overrides: Partial<CharacterRecord> = {}): void {
    const xp = overrides.xp ?? 45;
    this.character = {
      id: "character-1",
      userId: "user-1",
      name: "Мандрівник",
      pronoun: "they",
      path: "boundary",
      raceId: "race.human-ish",
      classId: "class.warrior",
      level: getLevelForXp(xp),
      xp,
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

  getItem(itemId: string): number {
    return this.items.get(itemId) ?? 0;
  }

  setItem(itemId: string, quantity: number): void {
    this.items.set(itemId, quantity);
  }

  setRoleplayCooldown(availableAt: Date): void {
    if (!this.character) {
      throw new Error("Character must exist before setting roleplay cooldown.");
    }

    this.cooldowns.set(`${this.character.id}:${CELLAR_GROWNUP_ROLEPLAY_COOLDOWN_KEY}`, {
      id: `cooldown-${this.cooldowns.size + 1}`,
      characterId: this.character.id,
      key: CELLAR_GROWNUP_ROLEPLAY_COOLDOWN_KEY,
      availableAt,
      updatedAt: now
    });
  }

  characterSummary(): CharacterSummary {
    if (!this.character) {
      throw new Error("Character must exist before reading summary.");
    }

    return summarizeCharacter(this.character);
  }

  getSnapshotForTelegramUser(
    userTelegramId: bigint,
    keys: CellarGrownupQuestRepositoryKeys
  ): Promise<CellarGrownupQuestSnapshot | null> {
    if (userTelegramId !== telegramUserId || !this.character) {
      return Promise.resolve(null);
    }

    return Promise.resolve({
      character: this.character,
      completedAction: this.dailyActions.get(actionKey(keys.completionKey, keys.onceLocalDate)) ?? null,
      roleplayCooldown:
        this.cooldowns.get(`${this.character.id}:${keys.roleplayCooldownKey}`) ?? null,
      cheeseSealQuantity: this.getItem(keys.cheeseSealItemId),
      bottleQuantity: this.getItem(keys.bottleItemId)
    });
  }

  async buyCheeseSealForTelegramUser(
    userTelegramId: bigint,
    input: {
      keys: CellarGrownupQuestRepositoryKeys;
      price: number;
      now: Date;
    }
  ) {
    const snapshot = await this.getSnapshotForTelegramUser(userTelegramId, input.keys);

    if (!snapshot || !this.character) {
      return { state: "no-character" as const };
    }

    if (snapshot.completedAction) {
      return { state: "already-completed" as const, snapshot };
    }

    if (snapshot.cheeseSealQuantity > 0) {
      return { state: "already-owned" as const, snapshot };
    }

    if (this.character.gold < input.price) {
      return { state: "insufficient" as const, snapshot, price: input.price };
    }

    this.character = {
      ...this.character,
      gold: this.character.gold - input.price
    };
    this.setItem(input.keys.cheeseSealItemId, 1);
    this.purchaseCount += 1;
    this.dailyActions.set(actionKey(input.keys.sealPurchaseKey, input.keys.onceLocalDate), {
      id: `action-purchase-${this.purchaseCount}`,
      characterId: this.character.id,
      key: input.keys.sealPurchaseKey,
      localDate: input.keys.onceLocalDate,
      rewardXp: 0,
      rewardGold: -input.price,
      createdAt: input.now
    });

    return {
      state: "purchased" as const,
      snapshot: (await this.getSnapshotForTelegramUser(userTelegramId, input.keys))!,
      price: input.price
    };
  }

  async completeWithBottleForTelegramUser(
    userTelegramId: bigint,
    input: {
      keys: CellarGrownupQuestRepositoryKeys;
      ending: CellarGrownupFinalEnding;
      rewardXp: number;
      rewardGold: number;
      now: Date;
    }
  ) {
    const snapshot = await this.getSnapshotForTelegramUser(userTelegramId, input.keys);

    if (!snapshot || !this.character) {
      return { state: "no-character" as const };
    }

    if (snapshot.completedAction) {
      return {
        state: "already-completed" as const,
        snapshot,
        ending: snapshot.completedAction.rewardGold > 0 ? "turn-in" as const : "keep" as const
      };
    }

    if (snapshot.bottleQuantity <= 0) {
      return { state: "missing-bottle" as const, snapshot };
    }

    const oldLevel = getLevelForXp(this.character.xp);
    this.character = {
      ...this.character,
      xp: this.character.xp + input.rewardXp,
      gold: this.character.gold + input.rewardGold
    };
    this.character = {
      ...this.character,
      level: getLevelForXp(this.character.xp)
    };

    if (input.ending === "turn-in") {
      this.setItem(input.keys.bottleItemId, Math.max(0, snapshot.bottleQuantity - 1));
    }

    this.completionCount += 1;
    const action: DailyActionRecord = {
      id: `action-complete-${this.completionCount}`,
      characterId: this.character.id,
      key: input.keys.completionKey,
      localDate: input.keys.onceLocalDate,
      rewardXp: input.rewardXp,
      rewardGold: input.rewardGold,
      createdAt: input.now
    };
    this.dailyActions.set(actionKey(input.keys.completionKey, input.keys.onceLocalDate), action);

    return {
      state: "completed" as const,
      snapshot: {
        ...((await this.getSnapshotForTelegramUser(userTelegramId, input.keys))!),
        completedAction: action
      },
      ending: input.ending,
      levelChange: {
        oldLevel,
        newLevel: this.character.level,
        leveledUp: this.character.level > oldLevel
      }
    };
  }

  findForTelegramUser(
    userTelegramId: bigint,
    inputOrKey: { key: string; localDate: string } | string
  ) {
    if (!this.character || userTelegramId !== telegramUserId) {
      return Promise.resolve(null);
    }

    if (typeof inputOrKey === "string") {
      return Promise.resolve({
        character: this.character,
        cooldown: this.cooldowns.get(`${this.character.id}:${inputOrKey}`) ?? null
      });
    }

    return Promise.resolve(
      this.dailyActions.get(actionKey(inputOrKey.key, inputOrKey.localDate)) ?? null
    );
  }

  claimForTelegramUser(
    userTelegramId: bigint,
    input: ClaimDailyActionInput
  ): Promise<ClaimDailyActionResult | null> {
    if (!this.character || userTelegramId !== telegramUserId) {
      return Promise.resolve(null);
    }

    const key = actionKey(input.key, input.localDate);
    const existing = this.dailyActions.get(key);

    if (existing) {
      return Promise.resolve({
        state: "existing",
        action: existing,
        character: this.character,
        levelChange: null,
        itemGrants: []
      });
    }

    const oldLevel = getLevelForXp(this.character.xp);
    this.character = {
      ...this.character,
      xp: this.character.xp + input.rewardXp,
      gold: this.character.gold + input.rewardGold
    };
    this.character = {
      ...this.character,
      level: getLevelForXp(this.character.xp)
    };

    const appliedItemGrants = (input.itemGrants ?? []).flatMap((grant) => {
      const current = this.getItem(grant.itemId);
      const max = grant.maxOwnedQuantity ?? Number.POSITIVE_INFINITY;
      const quantity = Math.min(grant.quantity, Math.max(0, max - current));

      if (quantity <= 0) {
        return [];
      }

      this.setItem(grant.itemId, current + quantity);
      return [{ itemId: grant.itemId, quantity }];
    });

    if (input.key.includes("bottle")) {
      this.bottleClaimCount += 1;
    }

    const action: DailyActionRecord = {
      id: `action-${this.dailyActions.size + 1}`,
      characterId: this.character.id,
      key: input.key,
      localDate: input.localDate,
      rewardXp: input.rewardXp,
      rewardGold: input.rewardGold,
      createdAt: now
    };
    this.dailyActions.set(key, action);

    return Promise.resolve({
      state: "created",
      action,
      character: this.character,
      levelChange: {
        oldLevel,
        newLevel: this.character.level,
        leveledUp: this.character.level > oldLevel
      },
      itemGrants: appliedItemGrants
    });
  }

  claimRewardForTelegramUser(
    userTelegramId: bigint,
    input: ClaimCooldownRewardInput
  ): Promise<ClaimCooldownRewardResult | null> {
    if (!this.character || userTelegramId !== telegramUserId) {
      return Promise.resolve(null);
    }

    const key = `${this.character.id}:${input.key}`;
    const existing = this.cooldowns.get(key);

    if (existing && existing.availableAt > input.now) {
      return Promise.resolve({
        state: "on-cooldown",
        cooldown: existing,
        character: this.character
      });
    }

    const cooldown: CharacterCooldownRecord = {
      id: `cooldown-${this.cooldowns.size + 1}`,
      characterId: this.character.id,
      key: input.key,
      availableAt: input.availableAt,
      updatedAt: input.now
    };
    this.cooldowns.set(key, cooldown);

    return Promise.resolve({
      state: "completed",
      cooldown,
      character: this.character,
      itemGrants: [],
      levelChange: {
        oldLevel: this.character.level,
        newLevel: this.character.level,
        leveledUp: false
      }
    });
  }
}

function actionKey(key: string, localDate: string): string {
  return `${key}:${localDate}`;
}
