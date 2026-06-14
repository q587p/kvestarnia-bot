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
import type { TelegramUserProfile } from "../../src/db/repositories/userRepository";
import { items, monsterLoot, monsters } from "../../src/content";
import { getLevelForXp } from "../../src/domain/progression/level";
import {
  HUNT_BOARD_CONTRACT_KEY,
  HuntService,
  selectHuntMonster,
  toKyivIsoDate
} from "../../src/services/huntService";

const telegramUserId = 42n;

describe("HuntService", () => {
  it("returns no-character when user has no character", async () => {
    const characters = new FakeCharacterRepository();
    const dailyActions = new FakeDailyActionRepository(characters);
    const service = new HuntService(characters, dailyActions, fixedClock);

    await expect(service.getHuntBoardForTelegramUser(telegramUserId)).resolves.toEqual({
      state: "no-character"
    });
    await expect(service.completeHuntContract(telegramUserId, "2026-06-14", "strike")).resolves.toEqual({
      state: "no-character"
    });
  });

  it("selects the same non-boss monster for the same Kyiv day and character", () => {
    const first = selectHuntMonster("2026-06-14", "character-42");
    const second = selectHuntMonster("2026-06-14", "character-42");

    expect(first).toEqual(second);
    expect(first.id).not.toBe("monster.mimic-shawarma");
    expect(first.tags).not.toContain("boss");
    expect(first.level).toBeLessThanOrEqual(3);
  });

  it("uses Kyiv-local dates for daily contracts", () => {
    expect(toKyivIsoDate(new Date("2026-06-13T21:30:00.000Z"))).toBe("2026-06-14");
  });

  it("grants one deterministic hunt reward per day", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId);
    const dailyActions = new FakeDailyActionRepository(characters);
    const service = new HuntService(characters, dailyActions, fixedClock);

    const result = await service.completeHuntContract(telegramUserId, "2026-06-14", "strike");
    const repeated = await service.completeHuntContract(telegramUserId, "2026-06-14", "trick");

    expect(result.state).toBe("completed");
    expect(repeated.state).toBe("already-completed");
    expect(dailyActions.createCount).toBe(1);
    expect(dailyActions.records[0]).toMatchObject({
      key: HUNT_BOARD_CONTRACT_KEY,
      localDate: "2026-06-14"
    });
    if (result.state === "completed") {
      expect(result.reward.xp).toBeGreaterThanOrEqual(3);
      expect(result.reward.xp).toBeLessThanOrEqual(7);
      expect(result.reward.gold).toBeGreaterThanOrEqual(0);
      expect(result.reward.gold).toBeLessThanOrEqual(3);
      expect(result.reward.itemGrants.length).toBeLessThanOrEqual(1);
    }
    await expect(characters.findByTelegramUserId(telegramUserId)).resolves.toMatchObject({
      xp: result.state === "completed" ? result.reward.xp : 0,
      gold: result.state === "completed" ? result.reward.gold : 0
    });
  });

  it("does not complete today's hunt from a stale date callback", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId);
    const dailyActions = new FakeDailyActionRepository(characters);
    const service = new HuntService(characters, dailyActions, fixedClock);

    const result = await service.completeHuntContract(telegramUserId, "2026-06-13", "strike");

    expect(result).toEqual({
      state: "stale-period",
      currentLocalDate: "2026-06-14",
      requestedLocalDate: "2026-06-13"
    });
    expect(dailyActions.createCount).toBe(0);
    await expect(characters.findByTelegramUserId(telegramUserId)).resolves.toMatchObject({
      xp: 0,
      gold: 0
    });
  });

  it("keeps monster loot references valid and value-bearing", () => {
    const itemIds = new Set(items.map((item) => item.id));
    const monsterIds = new Set(monsters.map((monster) => monster.id));

    for (const [monsterId, lootIds] of Object.entries(monsterLoot)) {
      expect(monsterIds.has(monsterId)).toBe(true);

      for (const itemId of lootIds) {
        const item = items.find((candidate) => candidate.id === itemId);

        expect(itemIds.has(itemId)).toBe(true);
        expect(item?.goldValue !== undefined || item?.priceless === true).toBe(true);
        expect(item).not.toHaveProperty("effect");
        expect(item).not.toHaveProperty("statBonus");
      }
    }
  });
});

function fixedClock(): Date {
  return new Date("2026-06-13T21:30:00.000Z");
}

class FakeCharacterRepository implements CharacterRepository {
  private readonly charactersByTelegramUserId = new Map<bigint, CharacterRecord>();

  add(userTelegramId: bigint, overrides: Partial<CharacterRecord> = {}): void {
    const xp = overrides.xp ?? 0;
    this.charactersByTelegramUserId.set(userTelegramId, {
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

  updateReward(userTelegramId: bigint, xp: number, gold: number): CharacterRecord {
    const character = this.charactersByTelegramUserId.get(userTelegramId);

    if (!character) {
      throw new Error("Character not found.");
    }

    const nextXp = character.xp + xp;
    const updated = {
      ...character,
      xp: nextXp,
      gold: character.gold + gold,
      level: getLevelForXp(nextXp)
    };
    this.charactersByTelegramUserId.set(userTelegramId, updated);
    return updated;
  }

  findByUserId(userId: string): Promise<CharacterRecord | null> {
    return Promise.resolve(
      [...this.charactersByTelegramUserId.values()].find((character) => character.userId === userId) ?? null
    );
  }

  findByTelegramUserId(userTelegramId: bigint): Promise<CharacterRecord | null> {
    return Promise.resolve(this.charactersByTelegramUserId.get(userTelegramId) ?? null);
  }

  deleteByTelegramUserId(userTelegramId: bigint): Promise<boolean> {
    return Promise.resolve(this.charactersByTelegramUserId.delete(userTelegramId));
  }

  createForTelegramUserIfMissing(
    user: TelegramUserProfile,
    input: CreateCharacterInput
  ): Promise<CreateCharacterResult> {
    const existing = this.charactersByTelegramUserId.get(user.telegramUserId);

    if (existing) {
      return Promise.resolve({ character: existing, created: false });
    }

    const character: CharacterRecord = {
      id: `character-${user.telegramUserId.toString()}`,
      userId: `user-${user.telegramUserId.toString()}`,
      ...input
    };
    this.charactersByTelegramUserId.set(user.telegramUserId, character);

    return Promise.resolve({ character, created: true });
  }
}

class FakeDailyActionRepository implements DailyActionRepository {
  private readonly actions = new Map<string, DailyActionRecord>();
  createCount = 0;

  constructor(private readonly characters: FakeCharacterRepository) {}

  get records(): DailyActionRecord[] {
    return [...this.actions.values()];
  }

  async findForTelegramUser(
    userTelegramId: bigint,
    input: { key: string; localDate: string }
  ): Promise<DailyActionRecord | null> {
    const character = await this.characters.findByTelegramUserId(userTelegramId);

    if (!character) {
      return null;
    }

    return this.actions.get(`${character.id}:${input.key}:${input.localDate}`) ?? null;
  }

  async claimForTelegramUser(
    userTelegramId: bigint,
    input: ClaimDailyActionInput
  ): Promise<ClaimDailyActionResult | null> {
    const character = await this.characters.findByTelegramUserId(userTelegramId);

    if (!character) {
      return null;
    }

    const claimKey = `${character.id}:${input.key}:${input.localDate}`;
    const existing = this.actions.get(claimKey);

    if (existing) {
      return {
        state: "existing",
        action: existing,
        character,
        levelChange: null,
        itemGrants: []
      };
    }

    this.createCount += 1;
    const action = {
      id: `daily-action-${this.createCount}`,
      characterId: character.id,
      key: input.key,
      localDate: input.localDate,
      rewardXp: input.rewardXp,
      rewardGold: input.rewardGold,
      createdAt: fixedClock()
    };
    this.actions.set(claimKey, action);

    const updatedCharacter = this.characters.updateReward(
      userTelegramId,
      input.rewardXp,
      input.rewardGold
    );

    return {
      state: "created",
      action,
      character: updatedCharacter,
      itemGrants: input.itemGrants ?? [],
      levelChange: {
        oldLevel: getLevelForXp(character.xp),
        newLevel: updatedCharacter.level,
        leveledUp: updatedCharacter.level > getLevelForXp(character.xp)
      }
    };
  }
}
