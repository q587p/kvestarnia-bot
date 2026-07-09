import { describe, expect, it, vi } from "vitest";
import type { CharacterRecord, CharacterRepository } from "../../src/db/repositories/characterRepository";
import type {
  ClaimDailyActionInput,
  ClaimDailyActionResult,
  DailyActionRecord,
  DailyActionRepository
} from "../../src/db/repositories/dailyActionRepository";
import type { AchievementService } from "../../src/services/achievementService";
import {
  FIRST_KORCHMA_QUEST_REWARD_XP,
  FirstKorchmaQuestService
} from "../../src/services/firstKorchmaQuestService";

describe("FirstKorchmaQuestService", () => {
  it("reports the route quest as active outside and after entering Korchma", async () => {
    const world = new TestWorld();
    const service = world.service();

    expect(await service.getForTelegramUser(42n)).toMatchObject({
      state: "active",
      progress: {
        enteredKorchma: false,
        reachedQuestTable: false,
        currentLocationId: "location.korchma.front"
      }
    });

    world.character.currentLocationId = "location.korchma.hall";
    await service.markEnteredForTelegramUser(42n);
    await service.markEnteredForTelegramUser(42n);

    expect(await service.getForTelegramUser(42n)).toMatchObject({
      state: "active",
      progress: {
        enteredKorchma: true,
        reachedQuestTable: false,
        currentLocationId: "location.korchma.hall"
      }
    });
    expect(world.daily.count("quest.first-korchma.entered", "life:0")).toBe(1);
  });

  it("completes at the quest table once per character life and grants symbolic XP", async () => {
    const trackEventSafely = vi.fn(() => Promise.resolve([]));
    const achievements = {
      trackEventSafely
    } as unknown as AchievementService;
    const world = new TestWorld();
    world.character.currentLocationId = "location.korchma.quest_table";
    const service = world.service(achievements);

    const completed = await service.completeForTelegramUser(42n);
    const replay = await service.completeForTelegramUser(42n);

    expect(completed).toMatchObject({
      state: "completed",
      reward: { xp: FIRST_KORCHMA_QUEST_REWARD_XP, gold: 0 },
      progress: {
        enteredKorchma: true,
        reachedQuestTable: true
      }
    });
    expect(replay).toMatchObject({
      state: "already-completed",
      reward: { xp: FIRST_KORCHMA_QUEST_REWARD_XP, gold: 0 }
    });
    expect(world.character.xp).toBe(FIRST_KORCHMA_QUEST_REWARD_XP);
    expect(world.daily.count("quest.first-korchma.completed", "life:0")).toBe(1);
    expect(trackEventSafely).toHaveBeenCalledTimes(1);
    expect(trackEventSafely).toHaveBeenCalledWith(expect.objectContaining({
      type: "quest.first-korchma.completed",
      characterId: world.character.id
    }));
  });

  it("uses the remort life token so a new life can take the starter route again", async () => {
    const world = new TestWorld();
    world.character.currentLocationId = "location.korchma.quest_table";
    const service = world.service();

    await service.completeForTelegramUser(42n);
    world.character.remortCount = 1;
    world.character.currentLocationId = "location.korchma.front";

    expect(await service.getForTelegramUser(42n)).toMatchObject({
      state: "active",
      progress: {
        enteredKorchma: false,
        reachedQuestTable: false
      }
    });

    await service.completeForTelegramUser(42n);

    expect(world.daily.count("quest.first-korchma.completed", "life:0")).toBe(1);
    expect(world.daily.count("quest.first-korchma.completed", "life:1")).toBe(1);
    expect(world.character.xp).toBe(FIRST_KORCHMA_QUEST_REWARD_XP * 2);
  });
});

class TestWorld {
  readonly character: CharacterRecord = {
    id: "character-1",
    userId: "user-1",
    currentLocationId: "location.korchma.front",
    name: "Мандрівник",
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
      strength: 8,
      dexterity: 6,
      intelligence: 6,
      charisma: 6,
      luck: 6
    },
    remortCount: 0
  };
  readonly characters = new TestCharacterRepository(this.character);
  readonly daily = new TestDailyActionRepository(this.character);

  service(achievements?: AchievementService): FirstKorchmaQuestService {
    return new FirstKorchmaQuestService(this.characters as CharacterRepository, this.daily, achievements);
  }
}

class TestCharacterRepository implements Partial<CharacterRepository> {
  constructor(private readonly character: CharacterRecord) {}

  findByTelegramUserId(): Promise<CharacterRecord | null> {
    return Promise.resolve(this.character);
  }
}

class TestDailyActionRepository implements DailyActionRepository {
  private readonly rows = new Map<string, DailyActionRecord>();

  constructor(private readonly character: CharacterRecord) {}

  findForTelegramUser(
    _telegramUserId: bigint,
    input: { key: string; localDate: string }
  ): Promise<DailyActionRecord | null> {
    return Promise.resolve(this.rows.get(rowKey(input.key, input.localDate)) ?? null);
  }

  claimForTelegramUser(
    _telegramUserId: bigint,
    input: ClaimDailyActionInput
  ): Promise<ClaimDailyActionResult | null> {
    if (input.expectedLife && input.expectedLife.remortCount !== (this.character.remortCount ?? 0)) {
      return Promise.resolve(null);
    }

    const key = rowKey(input.key, input.localDate);
    const existing = this.rows.get(key);

    if (existing) {
      return Promise.resolve({
        state: "existing",
        action: existing,
        character: this.character,
        levelChange: null,
        itemGrants: []
      });
    }

    this.character.xp += input.rewardXp;
    this.character.gold += input.rewardGold;
    const row: DailyActionRecord = {
      id: `action-${this.rows.size + 1}`,
      characterId: this.character.id,
      key: input.key,
      localDate: input.localDate,
      rewardXp: input.rewardXp,
      rewardGold: input.rewardGold,
      spentGold: input.spentGold ?? 0,
      resultJson: input.resultJson as DailyActionRecord["resultJson"],
      createdAt: new Date("2026-07-09T18:00:00.000Z")
    };
    this.rows.set(key, row);

    return Promise.resolve({
      state: "created",
      action: row,
      character: this.character,
      levelChange: {
        oldLevel: this.character.level,
        newLevel: this.character.level,
        leveledUp: false
      },
      itemGrants: [],
      hpLoss: null
    });
  }

  count(key: string, localDate: string): number {
    return this.rows.has(rowKey(key, localDate)) ? 1 : 0;
  }
}

function rowKey(key: string, localDate: string): string {
  return `${key}:${localDate}`;
}
