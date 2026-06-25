import { describe, expect, it } from "vitest";
import type { CharacterRecord } from "../../src/db/repositories/characterRepository";
import type {
  DevGrantCharacterResult,
  DevGrantCooldownResult,
  DevGrantItemResult,
  DevGrantProgressResult,
  DevGrantRepository
} from "../../src/db/repositories/devGrantRepository";
import type { ItemGrant } from "../../src/db/repositories/dailyActionRepository";
import { items } from "../../src/content";
import { DevGrantService } from "../../src/services/devGrantService";
import { YEGER_RANGER_FREE_BANDAGE_KEY, YEGER_TRACKING_COOLDOWN_KEY } from "../../src/services/yegerQuestService";
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
    this.calls.push(`items:${telegramUserId.toString()}`);

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
