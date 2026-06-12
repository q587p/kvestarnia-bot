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
import { getLevelForXp } from "../../src/domain/progression/level";
import { MIMIC_SHAWARMA_ADVENTURE_KEY } from "../../src/services/adventureService";
import {
  FightService,
  MIMIC_SHAWARMA_COMBAT_PROBE_KEY
} from "../../src/services/fightService";

const telegramUserId = 42n;

describe("FightService", () => {
  it("returns no-character when user has no character", async () => {
    const characters = new FakeCharacterRepository();
    const dailyActions = new FakeDailyActionRepository(characters);
    const service = new FightService(characters, dailyActions, fixedClock);

    await expect(service.getMimicShawarmaForTelegramUser(telegramUserId)).resolves.toEqual({
      state: "no-character"
    });
    await expect(service.completeMimicShawarma(telegramUserId, "attack")).resolves.toEqual({
      state: "no-character"
    });
  });

  it("grants the first combat probe reward once", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 7 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const service = new FightService(characters, dailyActions, fixedClock);

    const result = await service.completeMimicShawarma(telegramUserId, "attack");

    expect(result.state).toBe("completed");
    expect(dailyActions.createCount).toBe(1);
    expect(dailyActions.records[0]).toMatchObject({
      key: MIMIC_SHAWARMA_COMBAT_PROBE_KEY,
      localDate: "2026-06-12",
      rewardXp: 9,
      rewardGold: 3
    });
    await expect(characters.findByTelegramUserId(telegramUserId)).resolves.toMatchObject({
      xp: 16,
      gold: 3,
      level: 2
    });
    if (result.state === "completed") {
      expect(result.combat).toMatchObject({
        action: "attack",
        playerDamage: 8,
        enemyDamage: 3
      });
      expect(result.levelChange).toMatchObject({
        oldLevel: 1,
        newLevel: 2,
        leveledUp: true
      });
      expect(result.reward.itemGrants).toEqual([
        {
          itemId: "item.suspicious-shawarma-wrapper",
          name: "Підозрілий лавашний доказ",
          quantity: 1
        }
      ]);
    }
  });

  it("uses effective level stats for combat preview", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 15 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const service = new FightService(characters, dailyActions, fixedClock);

    const result = await service.completeMimicShawarma(telegramUserId, "attack");

    expect(result.state).toBe("completed");
    if (result.state === "completed") {
      expect(result.combat).toMatchObject({
        playerHpMaxPreview: 26,
        playerHpPreview: 23,
        playerDamage: 10
      });
      expect(result.character).toMatchObject({
        hpMax: 26,
        stats: {
          strength: 9
        }
      });
    }
  });

  it("keeps higher-level attack damage at least as high as level 1", async () => {
    const levelOne = new FakeCharacterRepository();
    levelOne.add(telegramUserId);
    const levelOneService = new FightService(
      levelOne,
      new FakeDailyActionRepository(levelOne),
      fixedClock
    );
    const levelTwo = new FakeCharacterRepository();
    levelTwo.add(telegramUserId, { xp: 15 });
    const levelTwoService = new FightService(
      levelTwo,
      new FakeDailyActionRepository(levelTwo),
      fixedClock
    );

    const first = await levelOneService.completeMimicShawarma(telegramUserId, "attack");
    const second = await levelTwoService.completeMimicShawarma(telegramUserId, "attack");

    expect(first.state).toBe("completed");
    expect(second.state).toBe("completed");
    if (first.state === "completed" && second.state === "completed") {
      expect(second.combat.playerDamage).toBeGreaterThanOrEqual(first.combat.playerDamage);
    }
  });

  it("does not duplicate the same action on the same date", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId);
    const dailyActions = new FakeDailyActionRepository(characters);
    const service = new FightService(characters, dailyActions, fixedClock);

    await service.completeMimicShawarma(telegramUserId, "receipt");
    const repeated = await service.completeMimicShawarma(telegramUserId, "receipt");

    expect(repeated.state).toBe("already-completed");
    expect(dailyActions.createCount).toBe(1);
    expect(dailyActions.grantedItems).toEqual([
      {
        itemId: "item.receipt-of-formal-suspicion",
        quantity: 1
      }
    ]);
    await expect(characters.findByTelegramUserId(telegramUserId)).resolves.toMatchObject({
      xp: 7,
      gold: 5
    });
  });

  it("returns an already-completed lookup and only suggests quest when it is still available", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId);
    const dailyActions = new FakeDailyActionRepository(characters);
    const service = new FightService(characters, dailyActions, fixedClock);

    await service.completeMimicShawarma(telegramUserId, "attack");
    await expect(service.getMimicShawarmaForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "already-completed",
      questAvailable: true
    });

    dailyActions.addAction(telegramUserId, MIMIC_SHAWARMA_ADVENTURE_KEY);

    await expect(service.getMimicShawarmaForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "already-completed",
      questAvailable: false
    });
  });

  it("does not duplicate another action after one option was claimed that date", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId);
    const dailyActions = new FakeDailyActionRepository(characters);
    const service = new FightService(characters, dailyActions, fixedClock);

    await service.completeMimicShawarma(telegramUserId, "attack");
    const secondOption = await service.completeMimicShawarma(telegramUserId, "flee");

    expect(secondOption.state).toBe("already-completed");
    expect(dailyActions.createCount).toBe(1);
    expect(dailyActions.grantedItems).toEqual([
      {
        itemId: "item.suspicious-shawarma-wrapper",
        quantity: 1
      }
    ]);
    await expect(characters.findByTelegramUserId(telegramUserId)).resolves.toMatchObject({
      xp: 9,
      gold: 3
    });
  });
});

function fixedClock(): Date {
  return new Date("2026-06-12T10:30:00.000Z");
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
      [...this.charactersByTelegramUserId.values()].find((character) => character.userId === userId) ??
        null
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
  readonly grantedItems: Array<{ itemId: string; quantity: number }> = [];
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

  addAction(userTelegramId: bigint, key: string, localDate = "2026-06-12"): void {
    const characterId = `character-${userTelegramId.toString()}`;
    const action = {
      id: `daily-action-${this.actions.size + 1}`,
      characterId,
      key,
      localDate,
      rewardXp: 0,
      rewardGold: 0,
      createdAt: fixedClock()
    };

    this.actions.set(`${characterId}:${key}:${localDate}`, action);
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
    const itemGrants = input.itemGrants ?? [];
    this.grantedItems.push(...itemGrants);

    return {
      state: "created",
      action,
      character: updatedCharacter,
      itemGrants,
      levelChange: {
        oldLevel: getLevelForXp(character.xp),
        newLevel: updatedCharacter.level,
        leveledUp: updatedCharacter.level > getLevelForXp(character.xp)
      }
    };
  }
}
