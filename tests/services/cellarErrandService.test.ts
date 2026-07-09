import { describe, expect, it } from "vitest";
import type { CharacterRecord } from "../../src/db/repositories/characterRepository";
import type {
  CharacterCooldownRecord,
  ClaimCooldownRewardInput,
  ClaimCooldownRewardResult,
  CooldownRepository
} from "../../src/db/repositories/cooldownRepository";
import { getLevelForXp } from "../../src/domain/progression/level";
import { summarizeCharacter } from "../../src/domain/characters/characterSummary";
import {
  CELLAR_MOUSE_ERRAND_COOLDOWN_MS,
  CellarErrandService,
  buildCellarMethodOptions
} from "../../src/services/cellarErrandService";
import { buildStarterQuestResolutionScene } from "../../src/content/starterQuestResolutionContent";

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

  it("grants an authored reward and starts cooldown on first completion", async () => {
    const cooldowns = new FakeCooldownRepository();
    cooldowns.addCharacter(telegramUserId, { xp: 10 });
    const service = new CellarErrandService(cooldowns, () => startedAt);

    await expect(service.getForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "ready"
    });

    const result = await service.complete(telegramUserId, "cheese-trap");

    expect(result.state).toBe("completed");
    expect(cooldowns.claimCount).toBe(1);
    if (result.state === "completed") {
      expect(result.reward.xp).toBeGreaterThan(0);
      expect(result.reward.gold).toBeGreaterThanOrEqual(0);
      expect(result.reward.itemGrants).toEqual([
        {
          itemId: "item.cheese-of-procedural-doubt",
          name: "Сир процедурного сумніву",
          quantity: 1
        }
      ]);
      await expect(cooldowns.findCharacter(telegramUserId)).resolves.toMatchObject({
        xp: 10 + result.reward.xp,
        gold: result.reward.gold,
        level: getLevelForXp(10 + result.reward.xp)
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

  it("retires cellar errands from level four without claiming rewards", async () => {
    const cooldowns = new FakeCooldownRepository();
    cooldowns.addCharacter(telegramUserId, { xp: 45 });
    const service = new CellarErrandService(cooldowns, () => startedAt);

    await expect(service.getForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "level-retired",
      maxLevel: 3,
      completed: false
    });
    await expect(service.complete(telegramUserId, "negotiate")).resolves.toMatchObject({
      state: "level-retired",
      maxLevel: 3,
      completed: false
    });
    expect(cooldowns.claimCount).toBe(0);
    expect(cooldowns.grantedItems).toEqual([]);
    await expect(cooldowns.findCharacter(telegramUserId)).resolves.toMatchObject({
      xp: 45,
      gold: 0,
      level: 4
    });
  });

  it("marks retired cellar errands completed when a prior completion exists", async () => {
    const cooldowns = new FakeCooldownRepository();
    cooldowns.addCharacter(telegramUserId, { xp: 10 });
    const service = new CellarErrandService(cooldowns, () => startedAt);

    await service.complete(telegramUserId, "negotiate");
    cooldowns.addCharacter(telegramUserId, { xp: 45 });

    await expect(service.getForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "level-retired",
      maxLevel: 3,
      completed: true
    });
  });

  it("does not duplicate rewards during cooldown", async () => {
    const cooldowns = new FakeCooldownRepository();
    cooldowns.addCharacter(telegramUserId, { xp: 10 });
    const service = new CellarErrandService(cooldowns, () => startedAt);

    const first = await service.complete(telegramUserId, "negotiate");
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
    if (first.state === "completed") {
      await expect(cooldowns.findCharacter(telegramUserId)).resolves.toMatchObject({
        xp: 10 + first.reward.xp,
        gold: first.reward.gold
      });
    }
  });

  it("allows another completion after cooldown expires", async () => {
    const cooldowns = new FakeCooldownRepository();
    cooldowns.addCharacter(telegramUserId, { xp: 10 });
    let now = startedAt;
    const service = new CellarErrandService(cooldowns, () => now);

    const first = await service.complete(telegramUserId, "sweep-bravely");
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
    if (first.state === "completed" && second.state === "completed") {
      await expect(cooldowns.findCharacter(telegramUserId)).resolves.toMatchObject({
        xp: 10 + first.reward.xp + second.reward.xp,
        gold: first.reward.gold + second.reward.gold
      });
    }
  });

  it("does not claim, debit, or start cooldown when a paid method lacks gold", async () => {
    const cooldowns = new FakeCooldownRepository();
    cooldowns.addCharacter(telegramUserId, { xp: 10, gold: 0 });
    const service = new CellarErrandService(cooldowns, () => startedAt);

    const result = await service.complete(telegramUserId, "bribe-cheese");

    expect(result).toMatchObject({
      state: "insufficient-gold",
      requiredGold: 1
    });
    expect(cooldowns.claimCount).toBe(0);
    expect(cooldowns.grantedItems).toEqual([]);
    await expect(cooldowns.findCharacter(telegramUserId)).resolves.toMatchObject({
      xp: 10,
      gold: 0
    });
    await expect(cooldowns.findForTelegramUser(telegramUserId, "cellar.mouse-errand")).resolves.toMatchObject({
      cooldown: null
    });
  });

  it("returns stale for unknown authored cellar methods instead of consuming cooldown", async () => {
    const cooldowns = new FakeCooldownRepository();
    cooldowns.addCharacter(telegramUserId, { xp: 10 });
    const service = new CellarErrandService(cooldowns, () => startedAt);

    const result = await service.complete(telegramUserId, "r-old-array-index");

    expect(result).toMatchObject({ state: "stale" });
    expect(cooldowns.claimCount).toBe(0);
  });

  it("rejects hidden authored cellar methods instead of consuming cooldown", async () => {
    const cooldowns = new FakeCooldownRepository();
    cooldowns.addCharacter(telegramUserId, { xp: 10, gold: 3 });
    const character = await cooldowns.findCharacter(telegramUserId);

    expect(character).not.toBeNull();
    const summary = summarizeCharacter(character!);
    const visible = buildCellarMethodOptions(summary).map((method) => method.id);
    const hidden = buildStarterQuestResolutionScene("cellar-mouse", summary).methods.find(
      (method) =>
        !visible.includes(method.id) &&
        method.id !== "cheese-trap" &&
        method.id !== "sweep-bravely" &&
        method.id !== "negotiate" &&
        method.id !== "bribe-cheese"
    );
    const service = new CellarErrandService(cooldowns, () => startedAt);
    const result = await service.complete(telegramUserId, {
      type: "method",
      methodId: hidden?.id ?? "missing"
    });

    expect(hidden).toBeDefined();
    expect(result).toMatchObject({ state: "stale" });
    expect(cooldowns.claimCount).toBe(0);
    await expect(cooldowns.findForTelegramUser(telegramUserId, "cellar.mouse-errand")).resolves.toMatchObject({
      cooldown: null
    });
  });

  it.each(["negotiate", "cheese-trap", "sweep-bravely"] as const)(
    "does not let v2 cellar method %s fall through to legacy actions",
    async (methodId) => {
      const cooldowns = new FakeCooldownRepository();
      cooldowns.addCharacter(telegramUserId, { xp: 10, gold: 3 });
      const service = new CellarErrandService(cooldowns, () => startedAt);

      await expect(service.complete(telegramUserId, {
        type: "method",
        methodId
      })).resolves.toMatchObject({ state: "stale" });
      expect(cooldowns.claimCount).toBe(0);
      await expect(cooldowns.findForTelegramUser(telegramUserId, "cellar.mouse-errand")).resolves.toMatchObject({
        cooldown: null
      });
    }
  );

  it("keeps every visible cellar method inside the conservative mouse reward envelope", async () => {
    const base = new FakeCooldownRepository();
    base.addCharacter(telegramUserId, { xp: 10, gold: 3 });
    const character = await base.findCharacter(telegramUserId);

    expect(character).not.toBeNull();
    const methods = buildCellarMethodOptions(summarizeCharacter(character!));

    expect(methods).toHaveLength(4);
    expect(methods.map((method) => method.id)).toContain("bribe-cheese");
    expect(methods.find((method) => method.id === "bribe-cheese")?.callbackKey).toBeDefined();

    for (const method of methods) {
      const cooldowns = new FakeCooldownRepository();
      cooldowns.addCharacter(telegramUserId, { xp: 10, gold: 3 });
      const service = new CellarErrandService(cooldowns, () => startedAt);
      const result = await service.complete(telegramUserId, {
        type: "method",
        methodId: method.callbackKey ?? method.id
      });

      expect(result.state).toBe("completed");
      if (result.state === "completed") {
        expect(result.reward.xp).toBeLessThanOrEqual(method.id === "sweep-bravely" ? 1 : 2);
        expect(result.reward.gold).toBeLessThanOrEqual(1);
        expect(result.reward.gold - result.spentGold).toBeLessThanOrEqual(1);
      }
    }
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

    if ((input.spentGold ?? 0) > character.gold) {
      return Promise.resolve({
        state: "insufficient-gold",
        character,
        requiredGold: input.spentGold ?? 0
      });
    }

    this.claimCount += 1;
    const itemGrants = (input.itemGrants ?? []).map(({ itemId, quantity }) => ({
      itemId,
      quantity
    }));
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
      gold: character.gold + input.rewardGold - (input.spentGold ?? 0),
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
