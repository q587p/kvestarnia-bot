import { describe, expect, it } from "vitest";
import type { CharacterRecord } from "../../src/db/repositories/characterRepository";
import type {
  CharacterCooldownRecord,
  ClaimCooldownRewardInput,
  ClaimCooldownRewardResult,
  CooldownRepository
} from "../../src/db/repositories/cooldownRepository";
import { getLevelForXp } from "../../src/domain/progression/level";
import {
  CELLAR_MOUSE_ERRAND_COOLDOWN_MS,
  CellarErrandService
} from "../../src/services/cellarErrandService";

const telegramUserId = 42n;
const startedAt = new Date("2026-06-13T10:00:00.000Z");

describe("CellarErrandService", () => {
  it("returns no-character when user has no character", async () => {
    const cooldowns = new FakeCooldownRepository();
    const service = new CellarErrandService(cooldowns, () => startedAt);

    await expect(service.getForTelegramUser(telegramUserId)).resolves.toEqual({
      state: "no-character"
    });
    await expect(service.complete(telegramUserId, "cheese-trap")).resolves.toEqual({
      state: "no-character"
    });
  });

  it("grants a tiny reward and starts cooldown on first completion", async () => {
    const cooldowns = new FakeCooldownRepository();
    cooldowns.addCharacter(telegramUserId, { xp: 10 });
    const service = new CellarErrandService(cooldowns, () => startedAt);

    await expect(service.getForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "ready"
    });

    const result = await service.complete(telegramUserId, "cheese-trap");

    expect(result.state).toBe("completed");
    expect(cooldowns.claimCount).toBe(1);
    await expect(cooldowns.findCharacter(telegramUserId)).resolves.toMatchObject({
      xp: 12,
      gold: 1,
      level: 2
    });
    if (result.state === "completed") {
      expect(result.reward).toMatchObject({
        xp: 2,
        gold: 1,
        itemGrants: [
          {
            itemId: "item.cheese-of-procedural-doubt",
            name: "Сир процедурного сумніву",
            quantity: 1
          }
        ]
      });
      expect(result.availableAt).toEqual(
        new Date(startedAt.getTime() + CELLAR_MOUSE_ERRAND_COOLDOWN_MS)
      );
      expect(result.levelChange).toMatchObject({
        oldLevel: 2,
        newLevel: 2,
        leveledUp: false
      });
    }
  });

  it("locks cellar errands until level two without claiming rewards", async () => {
    const cooldowns = new FakeCooldownRepository();
    cooldowns.addCharacter(telegramUserId, { xp: 0 });
    const service = new CellarErrandService(cooldowns, () => startedAt);

    await expect(service.getForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "level-locked",
      requiredLevel: 2
    });
    await expect(service.complete(telegramUserId, "cheese-trap")).resolves.toMatchObject({
      state: "level-locked",
      requiredLevel: 2
    });
    expect(cooldowns.claimCount).toBe(0);
    await expect(cooldowns.findCharacter(telegramUserId)).resolves.toMatchObject({
      xp: 0,
      gold: 0,
      level: 1
    });
  });

  it("does not duplicate rewards during cooldown", async () => {
    const cooldowns = new FakeCooldownRepository();
    cooldowns.addCharacter(telegramUserId, { xp: 10 });
    const service = new CellarErrandService(cooldowns, () => startedAt);

    await service.complete(telegramUserId, "negotiate");
    const repeated = await service.complete(telegramUserId, "negotiate");

    expect(repeated.state).toBe("on-cooldown");
    expect(cooldowns.claimCount).toBe(1);
    expect(cooldowns.grantedItems).toEqual([
      {
        itemId: "item.cork-ring-of-serious-business",
        quantity: 1
      },
      {
        itemId: "item.napkin-of-mouse-diplomacy",
        quantity: 1
      }
    ]);
    await expect(cooldowns.findCharacter(telegramUserId)).resolves.toMatchObject({
      xp: 12,
      gold: 0
    });
  });

  it("allows another completion after cooldown expires", async () => {
    const cooldowns = new FakeCooldownRepository();
    cooldowns.addCharacter(telegramUserId, { xp: 10 });
    let now = startedAt;
    const service = new CellarErrandService(cooldowns, () => now);

    await service.complete(telegramUserId, "sweep-bravely");
    now = new Date(startedAt.getTime() + CELLAR_MOUSE_ERRAND_COOLDOWN_MS + 1);
    const second = await service.complete(telegramUserId, "cheese-trap");

    expect(second.state).toBe("completed");
    expect(cooldowns.claimCount).toBe(2);
    expect(cooldowns.grantedItems).toEqual([
      {
        itemId: "item.bristle-of-basement-order",
        quantity: 1
      },
      {
        itemId: "item.cheese-of-procedural-doubt",
        quantity: 1
      }
    ]);
    await expect(cooldowns.findCharacter(telegramUserId)).resolves.toMatchObject({
      xp: 13,
      gold: 1
    });
  });
});

class FakeCooldownRepository implements CooldownRepository {
  private readonly characters = new Map<bigint, CharacterRecord>();
  private readonly cooldowns = new Map<string, CharacterCooldownRecord>();
  readonly grantedItems: Array<{ itemId: string; quantity: number }> = [];
  claimCount = 0;

  addCharacter(userTelegramId: bigint, overrides: Partial<CharacterRecord> = {}): void {
    const xp = overrides.xp ?? 0;
    this.characters.set(userTelegramId, {
      id: `character-${userTelegramId.toString()}`,
      userId: `user-${userTelegramId.toString()}`,
      name: "Мандрівник",
      pronoun: "they",
      path: "boundary",
      raceId: "race.human-ish",
      classId: "class.warrior",
      level: getLevelForXp(xp),
      xp,
      gold: 0,
      hpCurrent: 22,
      hpMax: 22,
      manaCurrent: 10,
      manaMax: 10,
      statsJson: {
        strength: 8,
        dexterity: 6,
        intelligence: 6,
        charisma: 6,
        luck: 6
      },
      ...overrides
    });
  }

  findCharacter(userTelegramId: bigint): Promise<CharacterRecord | null> {
    return Promise.resolve(this.characters.get(userTelegramId) ?? null);
  }

  findForTelegramUser(
    userTelegramId: bigint,
    key: string
  ): Promise<{ cooldown: CharacterCooldownRecord | null; character: CharacterRecord } | null> {
    const character = this.characters.get(userTelegramId);

    if (!character) {
      return Promise.resolve(null);
    }

    return Promise.resolve({
      character,
      cooldown: this.cooldowns.get(`${character.id}:${key}`) ?? null
    });
  }

  claimRewardForTelegramUser(
    userTelegramId: bigint,
    input: ClaimCooldownRewardInput
  ): Promise<ClaimCooldownRewardResult | null> {
    const character = this.characters.get(userTelegramId);

    if (!character) {
      return Promise.resolve(null);
    }

    const key = `${character.id}:${input.key}`;
    const existing = this.cooldowns.get(key);

    if (existing && existing.availableAt > input.now) {
      return Promise.resolve({
        state: "on-cooldown",
        cooldown: existing,
        character
      });
    }

    this.claimCount += 1;
    const itemGrants = input.itemGrants ?? [];
    const cooldown = {
      id: `cooldown-${this.claimCount}`,
      characterId: character.id,
      key: input.key,
      availableAt: input.availableAt,
      updatedAt: input.now
    };
    this.cooldowns.set(key, cooldown);

    const nextXp = character.xp + input.rewardXp;
    const updatedCharacter = {
      ...character,
      xp: nextXp,
      gold: character.gold + input.rewardGold,
      level: getLevelForXp(nextXp)
    };
    this.characters.set(userTelegramId, updatedCharacter);
    this.grantedItems.push(...itemGrants);

    return Promise.resolve({
      state: "completed",
      cooldown,
      character: updatedCharacter,
      itemGrants,
      levelChange: {
        oldLevel: getLevelForXp(character.xp),
        newLevel: updatedCharacter.level,
        leveledUp: updatedCharacter.level > getLevelForXp(character.xp)
      }
    });
  }
}
