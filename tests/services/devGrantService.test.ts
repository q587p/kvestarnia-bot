import { describe, expect, it, vi } from "vitest";
import type { CharacterRecord } from "../../src/db/repositories/characterRepository";
import type {
  DevGrantCharacterResult,
  DevGrantCooldownResult,
  DevGrantDailyActionResetResult,
  DevGrantItemResult,
  DevGrantProgressResult,
  DevGrantRepository
} from "../../src/db/repositories/devGrantRepository";
import type { ItemGrant } from "../../src/db/repositories/dailyActionRepository";
import { items } from "../../src/content";
import type { AchievementService } from "../../src/services/achievementService";
import { DevGrantService } from "../../src/services/devGrantService";
import { BANDAGE_ITEM_ID } from "../../src/services/itemGrant";
import { YEGER_RANGER_FREE_BANDAGE_KEY, YEGER_TRACKING_COOLDOWN_KEY } from "../../src/services/yegerQuestService";
import {
  YEGER_BANDAGE_PURCHASE_CANCEL_KEY,
  YEGER_BANDAGE_PURCHASE_CONFIRM_KEY,
  YEGER_BANDAGE_PURCHASE_PREVIEW_KEY
} from "../../src/services/dailyActionKeys";
import { FakeRandomSource } from "../../src/shared/random";

describe("DevGrantService", () => {
  it("does not grant anything in production", async () => {
    const repository = new FakeDevGrantRepository();
    const service = new DevGrantService(repository, "production", true, new FakeRandomSource([0]));

    await expect(service.addXp(42n, 10)).resolves.toEqual({ state: "disabled" });
    expect(repository.calls).toEqual([]);
  });

  it("does not grant anything in development without the explicit opt-in flag", async () => {
    const repository = new FakeDevGrantRepository();
    const service = new DevGrantService(repository, "development", false, new FakeRandomSource([0]));

    await expect(service.addGold(42n, 10)).resolves.toEqual({ state: "disabled" });
    expect(repository.calls).toEqual([]);
  });

  it("adds level, XP and gold for the current character", async () => {
    const repository = new FakeDevGrantRepository();
    const service = new DevGrantService(repository, "development", true, new FakeRandomSource([0]));

    await expect(service.addLevel(42n)).resolves.toMatchObject({
      state: "updated",
      kind: "level",
      amount: 1,
      character: {
        level: 2
      },
      levelChange: {
        oldLevel: 1,
        newLevel: 2,
        leveledUp: true
      }
    });
    await expect(service.addXp(42n, 7)).resolves.toMatchObject({
      state: "updated",
      kind: "xp",
      amount: 7,
      character: {
        xp: 7
      }
    });
    await expect(service.addGold(42n, 11)).resolves.toMatchObject({
      state: "updated",
      kind: "gold",
      amount: 11,
      character: {
        gold: 11
      }
    });
  });

  it("routes level dev grants through achievement tracking", async () => {
    const repository = new FakeDevGrantRepository();
    const trackEventSafely = vi.fn<AchievementService["trackEventSafely"]>().mockResolvedValue([
      {
        id: "achievement.level.3",
        title: "Перший поверх амбіцій",
        cosmeticTitleGrantId: null,
        unlockedAt: new Date("2026-06-17T10:00:00.000Z")
      }
    ]);
    const recalculateForCharacter = vi
      .fn<AchievementService["recalculateForCharacter"]>()
      .mockResolvedValue({ unlocks: [] });
    const achievements = {
      trackEventSafely,
      recalculateForCharacter
    } as unknown as AchievementService;
    const service = new DevGrantService(
      repository,
      "development",
      true,
      new FakeRandomSource([0]),
      achievements
    );

    const result = await service.addLevel(42n, 2);

    expect(result).toMatchObject({
      state: "updated",
      kind: "level",
      achievementUnlocks: [
        {
          id: "achievement.level.3"
        }
      ]
    });
    expect(trackEventSafely).toHaveBeenCalledTimes(1);
    const [event] = trackEventSafely.mock.calls[0] ?? [];
    expect(event).toMatchObject({
      characterId: "character-42",
      type: "level.reached",
      level: 3,
      sourceId: "dev.add_level:character-42:1->3"
    });
    expect(event?.occurredAt).toBeInstanceOf(Date);
    expect(recalculateForCharacter).toHaveBeenCalledTimes(1);
    const [characterId, occurredAt] = recalculateForCharacter.mock.calls[0] ?? [];
    expect(characterId).toBe("character-42");
    expect(occurredAt).toBeInstanceOf(Date);
  });

  it("heals the current character to full or by a capped amount", async () => {
    const repository = new FakeDevGrantRepository();
    const service = new DevGrantService(repository, "development", true, new FakeRandomSource([0]));

    repository.setHp(4);

    await expect(service.heal(42n, 7)).resolves.toMatchObject({
      state: "updated",
      kind: "heal",
      amount: 7,
      character: {
        hpCurrent: 11,
        hpMax: 20,
        hpRegenAt: null
      }
    });

    await expect(service.heal(42n, 100)).resolves.toMatchObject({
      state: "updated",
      kind: "heal",
      amount: 100,
      character: {
        hpCurrent: 20,
        hpMax: 20,
        hpRegenAt: null
      }
    });

    repository.setHp(3);

    await expect(service.heal(42n)).resolves.toMatchObject({
      state: "updated",
      kind: "heal",
      character: {
        hpCurrent: 20,
        hpMax: 20,
        hpRegenAt: null
      }
    });
  });

  it("restores mana to full or by a capped amount", async () => {
    const repository = new FakeDevGrantRepository();
    const service = new DevGrantService(repository, "development", true, new FakeRandomSource([0]));

    repository.setMana(2);

    await expect(service.restoreMana(42n, 4)).resolves.toMatchObject({
      state: "updated",
      kind: "mana",
      amount: 4,
      character: {
        manaCurrent: 6,
        manaMax: 10,
        manaRegenAt: null
      }
    });

    await expect(service.restoreMana(42n, 100)).resolves.toMatchObject({
      state: "updated",
      kind: "mana",
      amount: 100,
      character: {
        manaCurrent: 10,
        manaMax: 10,
        manaRegenAt: null
      }
    });

    repository.setMana(3);

    await expect(service.restoreMana(42n)).resolves.toMatchObject({
      state: "updated",
      kind: "mana",
      character: {
        manaCurrent: 10,
        manaMax: 10,
        manaRegenAt: null
      }
    });
  });

  it("adds deterministic random items and enriches their names", async () => {
    const repository = new FakeDevGrantRepository();
    const service = new DevGrantService(repository, "development", true, new FakeRandomSource([0]));
    const firstItem = items[0];

    expect(firstItem).toBeDefined();
    await expect(service.addRandomItems(42n, 2)).resolves.toMatchObject({
      state: "updated",
      kind: "items",
      amount: 2,
      itemGrants: [
        {
          itemId: firstItem?.id,
          name: firstItem?.name,
          quantity: 2
        }
      ]
    });
  });

  it("adds responsible panic bandages directly for local QA", async () => {
    const repository = new FakeDevGrantRepository();
    const service = new DevGrantService(repository, "development", true, new FakeRandomSource([0]));

    await expect(service.addBandages(42n, 5)).resolves.toMatchObject({
      state: "updated",
      kind: "items",
      amount: 5,
      itemGrants: [
        {
          itemId: BANDAGE_ITEM_ID,
          name: "Бинт відповідальної паніки",
          quantity: 5
        }
      ]
    });
    expect(repository.calls).toContain(`items:42:${BANDAGE_ITEM_ID}:5`);
  });

  it("resets the Yeger free bandage cooldown for the current character", async () => {
    const repository = new FakeDevGrantRepository();
    const service = new DevGrantService(repository, "development", true, new FakeRandomSource([0]));

    await expect(service.resetYegerBandageCooldown(42n)).resolves.toMatchObject({
      state: "updated",
      kind: "yeger-bandage-cooldown",
      cleared: true,
      character: {
        id: "character-42"
      }
    });
    expect(repository.calls).toContain(`cooldown:42:${YEGER_RANGER_FREE_BANDAGE_KEY}`);
  });

  it("finishes the Yeger trail wait for the current character", async () => {
    const repository = new FakeDevGrantRepository();
    const service = new DevGrantService(repository, "development", true, new FakeRandomSource([0]));

    await expect(service.resetYegerTrackingCooldown(42n)).resolves.toMatchObject({
      state: "updated",
      kind: "yeger-tracking-cooldown",
      cleared: true,
      character: {
        id: "character-42"
      }
    });
    expect(repository.calls).toContain(`cooldown-ready:42:${YEGER_TRACKING_COOLDOWN_KEY}`);
  });

  it("resets the Yeger paid bandage purchase day for local QA", async () => {
    const repository = new FakeDevGrantRepository();
    const service = new DevGrantService(repository, "development", true, new FakeRandomSource([0]));

    await expect(service.resetYegerBandageDay(42n)).resolves.toMatchObject({
      state: "updated",
      kind: "yeger-bandage-day",
      deleted: 3,
      character: {
        id: "character-42"
      }
    });
    expect(repository.calls).toContain(
      `daily-actions:42:${[
        YEGER_BANDAGE_PURCHASE_PREVIEW_KEY,
        YEGER_BANDAGE_PURCHASE_CONFIRM_KEY,
        YEGER_BANDAGE_PURCHASE_CANCEL_KEY
      ].join(",")}`
    );
  });

  it("does not reset the Yeger paid bandage day when dev grants are disabled", async () => {
    const repository = new FakeDevGrantRepository();
    const service = new DevGrantService(repository, "development", false, new FakeRandomSource([0]));

    await expect(service.resetYegerBandageDay(42n)).resolves.toEqual({ state: "disabled" });
    expect(repository.calls).toEqual([]);
  });

  it("returns no-character when the repository cannot find a character", async () => {
    const repository = new FakeDevGrantRepository();
    const service = new DevGrantService(repository, "development", true, new FakeRandomSource([0]));

    await expect(service.addGold(404n, 1)).resolves.toEqual({ state: "no-character" });
  });
});

class FakeDevGrantRepository implements DevGrantRepository {
  readonly calls: string[] = [];
  private readonly character = makeCharacter();

  setHp(hpCurrent: number): void {
    this.character.hpCurrent = hpCurrent;
    this.character.hpRegenAt = new Date("2026-06-17T10:00:00.000Z");
  }

  setMana(manaCurrent: number): void {
    this.character.manaCurrent = manaCurrent;
    this.character.manaRegenAt = new Date("2026-06-17T10:00:00.000Z");
  }

  addLevelForTelegramUser(
    telegramUserId: bigint,
    amount: number
  ): Promise<DevGrantProgressResult | null> {
    this.calls.push(`level:${telegramUserId.toString()}:${amount}`);

    if (telegramUserId !== 42n) {
      return Promise.resolve(null);
    }

    const oldLevel = this.character.level;
    this.character.level += amount;

    return Promise.resolve({
      character: this.character,
      levelChange: {
        oldLevel,
        newLevel: this.character.level,
        leveledUp: this.character.level > oldLevel
      }
    });
  }

  addXpForTelegramUser(
    telegramUserId: bigint,
    amount: number
  ): Promise<DevGrantProgressResult | null> {
    this.calls.push(`xp:${telegramUserId.toString()}:${amount}`);

    if (telegramUserId !== 42n) {
      return Promise.resolve(null);
    }

    const oldLevel = this.character.level;
    this.character.xp += amount;

    return Promise.resolve({
      character: this.character,
      levelChange: {
        oldLevel,
        newLevel: this.character.level,
        leveledUp: false
      }
    });
  }

  addGoldForTelegramUser(
    telegramUserId: bigint,
    amount: number
  ): Promise<DevGrantCharacterResult | null> {
    this.calls.push(`gold:${telegramUserId.toString()}:${amount}`);

    if (telegramUserId !== 42n) {
      return Promise.resolve(null);
    }

    this.character.gold += amount;

    return Promise.resolve({ character: this.character });
  }

  healForTelegramUser(
    telegramUserId: bigint,
    amount?: number
  ): Promise<DevGrantCharacterResult | null> {
    this.calls.push(`heal:${telegramUserId.toString()}:${amount ?? "full"}`);

    if (telegramUserId !== 42n) {
      return Promise.resolve(null);
    }

    this.character.hpCurrent = amount === undefined
      ? this.character.hpMax
      : Math.min(this.character.hpMax, this.character.hpCurrent + amount);
    this.character.hpRegenAt = null;

    return Promise.resolve({ character: this.character });
  }

  restoreManaForTelegramUser(
    telegramUserId: bigint,
    amount?: number
  ): Promise<DevGrantCharacterResult | null> {
    this.calls.push(`mana:${telegramUserId.toString()}:${amount ?? "full"}`);

    if (telegramUserId !== 42n) {
      return Promise.resolve(null);
    }

    this.character.manaCurrent = amount === undefined
      ? this.character.manaMax
      : Math.min(this.character.manaMax, this.character.manaCurrent + amount);
    this.character.manaRegenAt = null;

    return Promise.resolve({ character: this.character });
  }

  addItemsForTelegramUser(
    telegramUserId: bigint,
    itemGrants: ItemGrant[]
  ): Promise<DevGrantItemResult | null> {
    this.calls.push(
      `items:${telegramUserId.toString()}:${itemGrants.map((grant) => `${grant.itemId}:${grant.quantity}`).join(",")}`
    );

    if (telegramUserId !== 42n) {
      return Promise.resolve(null);
    }

    const quantitiesByItemId = new Map<string, number>();

    for (const grant of itemGrants) {
      quantitiesByItemId.set(
        grant.itemId,
        (quantitiesByItemId.get(grant.itemId) ?? 0) + grant.quantity
      );
    }

    return Promise.resolve({
      character: this.character,
      itemGrants: [...quantitiesByItemId.entries()].map(([itemId, quantity]) => ({
        itemId,
        quantity
      }))
    });
  }

  clearCooldownForTelegramUser(
    telegramUserId: bigint,
    key: string
  ): Promise<DevGrantCooldownResult | null> {
    this.calls.push(`cooldown:${telegramUserId.toString()}:${key}`);

    if (telegramUserId !== 42n) {
      return Promise.resolve(null);
    }

    return Promise.resolve({
      character: this.character,
      cleared: true
    });
  }

  finishCooldownForTelegramUser(
    telegramUserId: bigint,
    key: string
  ): Promise<DevGrantCooldownResult | null> {
    this.calls.push(`cooldown-ready:${telegramUserId.toString()}:${key}`);

    if (telegramUserId !== 42n) {
      return Promise.resolve(null);
    }

    return Promise.resolve({
      character: this.character,
      cleared: true
    });
  }

  deleteDailyActionsForTelegramUser(
    telegramUserId: bigint,
    keys: readonly string[]
  ): Promise<DevGrantDailyActionResetResult | null> {
    this.calls.push(`daily-actions:${telegramUserId.toString()}:${keys.join(",")}`);

    if (telegramUserId !== 42n) {
      return Promise.resolve(null);
    }

    return Promise.resolve({
      character: this.character,
      deleted: keys.length
    });
  }
}

function makeCharacter(): CharacterRecord {
  return {
    id: "character-42",
    userId: "user-42",
    name: "Тестовий пригодник",
    pronoun: "they",
    path: "boundary",
    raceId: "race.human-ish",
    classId: "class.warrior",
    level: 1,
    xp: 0,
    gold: 0,
    hpCurrent: 20,
    hpMax: 20,
    hpRegenAt: null,
    manaCurrent: 10,
    manaMax: 10,
    manaRegenAt: null,
    statsJson: {
      strength: 6,
      dexterity: 6,
      intelligence: 6,
      charisma: 6,
      luck: 6
    }
  };
}
