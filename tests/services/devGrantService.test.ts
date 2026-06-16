import { describe, expect, it } from "vitest";
import type { CharacterRecord } from "../../src/db/repositories/characterRepository";
import type {
  DevGrantCharacterResult,
  DevGrantItemResult,
  DevGrantProgressResult,
  DevGrantRepository
} from "../../src/db/repositories/devGrantRepository";
import type { ItemGrant } from "../../src/db/repositories/dailyActionRepository";
import { items } from "../../src/content";
import { DevGrantService } from "../../src/services/devGrantService";
import { FakeRandomSource } from "../../src/shared/random";

describe("DevGrantService", () => {
  it("does not grant anything in production", async () => {
    const repository = new FakeDevGrantRepository();
    const service = new DevGrantService(repository, "production", new FakeRandomSource([0]));

    await expect(service.addXp(42n, 10)).resolves.toEqual({ state: "disabled" });
    expect(repository.calls).toEqual([]);
  });

  it("adds level, XP and gold for the current character", async () => {
    const repository = new FakeDevGrantRepository();
    const service = new DevGrantService(repository, "development", new FakeRandomSource([0]));

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

  it("adds deterministic random items and enriches their names", async () => {
    const repository = new FakeDevGrantRepository();
    const service = new DevGrantService(repository, "development", new FakeRandomSource([0]));
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

  it("returns no-character when the repository cannot find a character", async () => {
    const repository = new FakeDevGrantRepository();
    const service = new DevGrantService(repository, "development", new FakeRandomSource([0]));

    await expect(service.addGold(404n, 1)).resolves.toEqual({ state: "no-character" });
  });
});

class FakeDevGrantRepository implements DevGrantRepository {
  readonly calls: string[] = [];
  private readonly character = makeCharacter();

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
    manaCurrent: 10,
    manaMax: 10,
    statsJson: {
      strength: 6,
      dexterity: 6,
      intelligence: 6,
      charisma: 6,
      luck: 6
    }
  };
}
