import { describe, expect, it } from "vitest";
import type { CharacterRecord, CharacterRepository } from "../../src/db/repositories/characterRepository";
import { DailyActionPrefixLimitExceededError } from "../../src/db/repositories/dailyActionRepository";
import type {
  ClaimDailyActionInput,
  ClaimDailyActionResult,
  DailyActionRecord,
  DailyActionRepository
} from "../../src/db/repositories/dailyActionRepository";
import { DAILY_KORCHMA_ROUND_REQUIRED_STEPS } from "../../src/content/dailyKorchmaRoundContent";
import {
  DAILY_KORCHMA_ROUND_OFFER_KEY,
  DAILY_KORCHMA_ROUND_REWARD_KEY,
  DAILY_KORCHMA_ROUND_STEP_KEY
} from "../../src/services/dailyActionKeys";
import { DailyKorchmaRoundService } from "../../src/services/dailyKorchmaRoundService";
import {
  PRESENCE_LOCATION_KORCHMA_HALL,
  PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
  getLocationName
} from "../../src/services/presenceService";

const telegramUserId = 587n;
const now = new Date("2026-06-28T09:00:00.000Z");

describe("DailyKorchmaRoundService", () => {
  it("locks level 2 and creates a stable level 3 offer with one yard and two interiors", async () => {
    const world = new FakeWorld(makeCharacter({ level: 2 }));
    let result = await world.service.getForTelegramUser(telegramUserId);

    expect(result.state).toBe("level-locked");

    world.character = makeCharacter({ level: 3 });
    result = await world.service.getForTelegramUser(telegramUserId);

    expect(result.state).toBe("ready");
    if (result.state !== "ready") {
      return;
    }
    expect(result.offer.scenes).toHaveLength(3);
    expect(result.offer.scenes.filter((scene) => scene.zone === "yard")).toHaveLength(1);
    expect(new Set(result.offer.scenes.filter((scene) => scene.zone === "interior").map((scene) => scene.locationId)).size).toBe(2);
    expect(world.daily.records.filter((record) => record.key === DAILY_KORCHMA_ROUND_OFFER_KEY)).toHaveLength(1);

    const replay = await world.service.getForTelegramUser(telegramUserId);
    expect(replay.state).toBe("ready");
    if (replay.state === "ready") {
      expect(replay.offer.scenes.map((scene) => scene.id)).toEqual(result.offer.scenes.map((scene) => scene.id));
    }
  });

  it("requires current scene presence, rejects duplicate and stale callbacks, then locks the third scene", async () => {
    const world = new FakeWorld(makeCharacter({ level: 3 }));
    const offer = await readyOffer(world);
    const first = offer.scenes[0]!;
    const second = offer.scenes[1]!;
    const third = offer.scenes[2]!;

    world.locationId = PRESENCE_LOCATION_KORCHMA_HALL;
    let step = await world.service.completeStep(telegramUserId, {
      dayToken: offer.dayToken,
      sceneIndex: 0,
      actionId: first.actions[0]!.id,
      lifeToken: offer.lifeToken
    });

    expect(step.state).toBe(first.locationId === PRESENCE_LOCATION_KORCHMA_HALL ? "step-completed" : "wrong-location");

    if (step.state === "wrong-location") {
      world.locationId = first.locationId;
      step = await world.service.completeStep(telegramUserId, {
        dayToken: offer.dayToken,
        sceneIndex: 0,
        actionId: first.actions[0]!.id,
        lifeToken: offer.lifeToken
      });
    }

    expect(step.state).toBe("step-completed");

    const duplicate = await world.service.completeStep(telegramUserId, {
      dayToken: offer.dayToken,
      sceneIndex: 0,
      actionId: first.actions[1]!.id,
      lifeToken: offer.lifeToken
    });
    expect(duplicate.state).toBe("step-replayed");
    expect(world.daily.records.filter((record) => record.key === DAILY_KORCHMA_ROUND_STEP_KEY)).toHaveLength(1);

    const staleDay = await world.service.completeStep(telegramUserId, {
      dayToken: "20260627",
      sceneIndex: 0,
      actionId: first.actions[0]!.id,
      lifeToken: offer.lifeToken
    });
    expect(staleDay.state).toBe("stale-day");

    const staleLife = await world.service.completeStep(telegramUserId, {
      dayToken: offer.dayToken,
      sceneIndex: 1,
      actionId: second.actions[0]!.id,
      lifeToken: offer.lifeToken + 1
    });
    expect(staleLife.state).toBe("stale-life");

    world.locationId = second.locationId;
    const secondStep = await world.service.completeStep(telegramUserId, {
      dayToken: offer.dayToken,
      sceneIndex: 1,
      actionId: second.actions[0]!.id,
      lifeToken: offer.lifeToken
    });
    expect(secondStep.state).toBe("step-completed");
    expect(secondStep.state === "step-completed" ? secondStep.completedCount : 0).toBe(DAILY_KORCHMA_ROUND_REQUIRED_STEPS);

    world.locationId = third.locationId;
    const thirdStep = await world.service.completeStep(telegramUserId, {
      dayToken: offer.dayToken,
      sceneIndex: 2,
      actionId: third.actions[0]!.id,
      lifeToken: offer.lifeToken
    });
    expect(thirdStep.state).toBe("third-locked");
  });

  it("claims exactly 4 XP and 2 gold once from the Quest Table and survives restart/remort", async () => {
    const world = new FakeWorld(makeCharacter({ level: 3, xp: 13, gold: 23 }));
    const offer = await readyOffer(world);
    const [first, second] = offer.scenes;

    world.locationId = first!.locationId;
    await world.service.completeStep(telegramUserId, {
      dayToken: offer.dayToken,
      sceneIndex: 0,
      actionId: first!.actions[0]!.id,
      lifeToken: offer.lifeToken
    });
    world.locationId = second!.locationId;
    await world.service.completeStep(telegramUserId, {
      dayToken: offer.dayToken,
      sceneIndex: 1,
      actionId: second!.actions[0]!.id,
      lifeToken: offer.lifeToken
    });

    world.locationId = PRESENCE_LOCATION_KORCHMA_HALL;
    const wrongPlace = await world.service.claimReward(telegramUserId, {
      dayToken: offer.dayToken,
      lifeToken: offer.lifeToken
    });
    expect(wrongPlace.state).toBe("wrong-location");

    world.locationId = PRESENCE_LOCATION_KORCHMA_QUEST_TABLE;
    const claimed = await world.service.claimReward(telegramUserId, {
      dayToken: offer.dayToken,
      lifeToken: offer.lifeToken
    });
    expect(claimed.state).toBe("reward-claimed");
    expect(world.character?.xp).toBe(17);
    expect(world.character?.gold).toBe(25);
    expect(world.daily.records.filter((record) => record.key === DAILY_KORCHMA_ROUND_REWARD_KEY)).toHaveLength(1);

    const restarted = new DailyKorchmaRoundService(world, world.daily, world, world, world, undefined, () => now);
    const replay = await restarted.claimReward(telegramUserId, {
      dayToken: offer.dayToken,
      lifeToken: offer.lifeToken
    });
    expect(replay.state).toBe("reward-replayed");
    expect(world.character?.xp).toBe(17);
    expect(world.character?.gold).toBe(25);

    world.character = { ...world.character!, remortCount: 1 };
    const afterRemort = await world.service.getForTelegramUser(telegramUserId);
    expect(afterRemort.state).toBe("completed");

    const oldLife = await world.service.completeStep(telegramUserId, {
      dayToken: offer.dayToken,
      sceneIndex: 0,
      actionId: first!.actions[0]!.id,
      lifeToken: offer.lifeToken
    });
    expect(oldLife.state).toBe("stale-life");
  });

  it("does not create a third step row when another callback completes a second scene inside the claim boundary", async () => {
    const world = new FakeWorld(makeCharacter({ level: 3 }));
    const offer = await readyOffer(world);
    const [first, second, third] = offer.scenes;

    world.locationId = first!.locationId;
    await expect(
      world.service.completeStep(telegramUserId, {
        dayToken: offer.dayToken,
        sceneIndex: 0,
        actionId: first!.actions[0]!.id,
        lifeToken: offer.lifeToken
      })
    ).resolves.toMatchObject({ state: "step-completed" });

    world.daily.beforeCreate = (input) => {
      if (input.key !== DAILY_KORCHMA_ROUND_STEP_KEY || !input.localDate.endsWith(`:${second!.id}`)) {
        return;
      }

      world.daily.addStepRecord(offer.dayKey, third!, third!.actions[0]!.id);
    };

    world.locationId = second!.locationId;
    const raced = await world.service.completeStep(telegramUserId, {
      dayToken: offer.dayToken,
      sceneIndex: 1,
      actionId: second!.actions[0]!.id,
      lifeToken: offer.lifeToken
    });

    expect(raced.state).toBe("third-locked");
    expect(world.daily.records.filter((record) => record.key === DAILY_KORCHMA_ROUND_STEP_KEY)).toHaveLength(2);
    expect(
      world.daily.records
        .filter((record) => record.key === DAILY_KORCHMA_ROUND_STEP_KEY)
        .map((record) => record.localDate)
    ).toEqual(expect.arrayContaining([`${offer.dayKey}:${first!.id}`, `${offer.dayKey}:${third!.id}`]));
  });

  it("resets today's daily Korchma round rows for local QA", async () => {
    const world = new FakeWorld(makeCharacter({ level: 3 }));
    const offer = await readyOffer(world);
    const [first, second] = offer.scenes;

    world.locationId = first!.locationId;
    await world.service.completeStep(telegramUserId, {
      dayToken: offer.dayToken,
      sceneIndex: 0,
      actionId: first!.actions[0]!.id,
      lifeToken: offer.lifeToken
    });
    world.locationId = second!.locationId;
    await world.service.completeStep(telegramUserId, {
      dayToken: offer.dayToken,
      sceneIndex: 1,
      actionId: second!.actions[0]!.id,
      lifeToken: offer.lifeToken
    });
    world.locationId = PRESENCE_LOCATION_KORCHMA_QUEST_TABLE;
    await world.service.claimReward(telegramUserId, {
      dayToken: offer.dayToken,
      lifeToken: offer.lifeToken
    });

    expect(world.daily.records.filter((record) => record.key === DAILY_KORCHMA_ROUND_OFFER_KEY)).toHaveLength(1);
    expect(world.daily.records.filter((record) => record.key === DAILY_KORCHMA_ROUND_STEP_KEY)).toHaveLength(2);
    expect(world.daily.records.filter((record) => record.key === DAILY_KORCHMA_ROUND_REWARD_KEY)).toHaveLength(1);

    await expect(world.service.resetTodayForDev(telegramUserId)).resolves.toBe("reset");
    expect(world.daily.records.filter((record) => record.key === DAILY_KORCHMA_ROUND_OFFER_KEY)).toHaveLength(0);
    expect(world.daily.records.filter((record) => record.key === DAILY_KORCHMA_ROUND_STEP_KEY)).toHaveLength(0);
    expect(world.daily.records.filter((record) => record.key === DAILY_KORCHMA_ROUND_REWARD_KEY)).toHaveLength(0);

    const reopened = await world.service.getForTelegramUser(telegramUserId);
    expect(reopened.state).toBe("ready");
    if (reopened.state === "ready") {
      expect(reopened.offer.scenes.map((scene) => scene.id)).toEqual(offer.scenes.map((scene) => scene.id));
      expect(reopened.offer.completedSceneIds).toEqual([]);
    }
  });

  it("blocks mutation during active combat or pending Barrel", async () => {
    const fightWorld = new FakeWorld(makeCharacter({ level: 3 }));
    fightWorld.fightState = "persistent-active";
    expect((await fightWorld.service.getForTelegramUser(telegramUserId)).state).toBe("active-fight");

    const barrelWorld = new FakeWorld(makeCharacter({ level: 3 }));
    barrelWorld.pendingBarrel = true;
    expect((await barrelWorld.service.getForTelegramUser(telegramUserId)).state).toBe("pending-barrel");
  });
});

async function readyOffer(world: FakeWorld) {
  const result = await world.service.getForTelegramUser(telegramUserId);
  expect(result.state).toBe("ready");

  if (result.state !== "ready") {
    throw new Error("Expected daily Korchma round offer.");
  }

  return result.offer;
}

class FakeWorld implements CharacterRepository, DailyActionRepository {
  readonly daily = new FakeDailyActionRepository(this);
  readonly service = new DailyKorchmaRoundService(this, this.daily, this, this, this, undefined, () => now);
  locationId = PRESENCE_LOCATION_KORCHMA_QUEST_TABLE;
  fightState: "ready" | "persistent-active" | "training-active" = "ready";
  pendingBarrel = false;

  constructor(public character: CharacterRecord | null) {}

  findByUserId(): Promise<CharacterRecord | null> {
    return Promise.resolve(this.character);
  }

  findByTelegramUserId(id: bigint): Promise<CharacterRecord | null> {
    return Promise.resolve(id === telegramUserId ? this.character : null);
  }

  deleteByTelegramUserId(): Promise<boolean> {
    this.character = null;
    return Promise.resolve(true);
  }

  createForTelegramUserIfMissing(): never {
    throw new Error("Not implemented");
  }

  getCurrentPlaceForTelegramUser(id: bigint) {
    if (id !== telegramUserId || !this.character) {
      return Promise.resolve({ state: "no-character" as const });
    }

    return Promise.resolve({
      state: "ready" as const,
      locationId: this.locationId,
      locationName: getLocationName(this.locationId),
      insideKorchma: true
    });
  }

  getFightOverviewForTelegramUser() {
    return Promise.resolve({
      state: this.fightState,
      character: this.character!
    } as never);
  }

  getActivePendingFridayBarrelRaidForTelegramUser() {
    return Promise.resolve(
      this.pendingBarrel
        ? {
            state: "pending" as const,
            character: this.character!,
            availableAt: new Date("2026-06-28T09:05:00.000Z"),
            now,
            periodId: "2026-06-28T09"
          }
        : { state: "none" as const }
    );
  }
}

class FakeDailyActionRepository implements DailyActionRepository {
  private readonly actions = new Map<string, DailyActionRecord>();
  beforeCreate: ((input: ClaimDailyActionInput) => void) | null = null;

  constructor(private readonly world: FakeWorld) {}

  get records(): DailyActionRecord[] {
    return [...this.actions.values()];
  }

  findForTelegramUser(
    id: bigint,
    input: { key: string; localDate: string }
  ): Promise<DailyActionRecord | null> {
    if (id !== telegramUserId || !this.world.character) {
      return Promise.resolve(null);
    }

    return Promise.resolve(this.actions.get(keyFor(input)) ?? null);
  }

  listForTelegramUser(id: bigint, input: { key: string }): Promise<DailyActionRecord[] | null> {
    if (id !== telegramUserId || !this.world.character) {
      return Promise.resolve(null);
    }

    return Promise.resolve(this.records.filter((record) => record.key === input.key));
  }

  addStepRecord(dayKey: string, scene: { id: string; locationId: string }, actionId: string): void {
    if (!this.world.character) {
      return;
    }

    const localDate = `${dayKey}:${scene.id}`;
    const action: DailyActionRecord = {
      id: `daily-action-${this.actions.size + 1}`,
      characterId: this.world.character.id,
      key: DAILY_KORCHMA_ROUND_STEP_KEY,
      localDate,
      rewardXp: 0,
      rewardGold: 0,
      spentGold: 0,
      resultJson: {
        version: 1,
        dayToken: dayKey.split("-").join(""),
        sceneId: scene.id,
        actionId,
        locationId: scene.locationId
      },
      createdAt: now
    };

    this.actions.set(keyFor(action), action);
  }

  claimForTelegramUser(
    id: bigint,
    input: ClaimDailyActionInput
  ): Promise<ClaimDailyActionResult | null> {
    if (id !== telegramUserId || !this.world.character) {
      return Promise.resolve(null);
    }

    if (
      input.expectedLife &&
      (this.world.character.remortCount ?? 0) !== input.expectedLife.remortCount
    ) {
      return Promise.resolve(null);
    }

    const key = keyFor(input);
    const existing = this.actions.get(key);

    if (existing) {
      return Promise.resolve({
        state: "existing",
        action: existing,
        character: this.world.character,
        levelChange: null,
        itemGrants: []
      });
    }

    this.beforeCreate?.(input);
    this.beforeCreate = null;

    const prefixLimit = input.localDatePrefixLimit;

    if (prefixLimit) {
      const currentRows = this.records.filter(
        (record) =>
          record.key === prefixLimit.key &&
          record.localDate.startsWith(prefixLimit.localDatePrefix)
      ).length;

      if (currentRows >= prefixLimit.maxRows) {
        return Promise.reject(
          new DailyActionPrefixLimitExceededError(currentRows, prefixLimit.maxRows)
        );
      }
    }

    const oldLevel = this.world.character.level;
    this.world.character = {
      ...this.world.character,
      xp: this.world.character.xp + input.rewardXp,
      gold: this.world.character.gold + input.rewardGold
    };
    const action: DailyActionRecord = {
      id: `daily-action-${this.actions.size + 1}`,
      characterId: this.world.character.id,
      key: input.key,
      localDate: input.localDate,
      rewardXp: input.rewardXp,
      rewardGold: input.rewardGold,
      spentGold: input.spentGold ?? 0,
      resultJson: input.resultJson ?? null,
      createdAt: now
    };
    this.actions.set(key, action);

    return Promise.resolve({
      state: "created",
      action,
      character: this.world.character,
      levelChange: {
        oldLevel,
        newLevel: this.world.character.level,
        leveledUp: this.world.character.level > oldLevel
      },
      itemGrants: [],
      hpLoss: null
    });
  }

  deleteForTelegramUser(
    id: bigint,
    input: { key: string; localDate: string }
  ): Promise<"deleted" | "missing" | "no-character"> {
    if (id !== telegramUserId || !this.world.character) {
      return Promise.resolve("no-character");
    }

    return Promise.resolve(this.actions.delete(keyFor(input)) ? "deleted" : "missing");
  }
}

function keyFor(input: { key: string; localDate: string }): string {
  return `${input.key}:${input.localDate}`;
}

function makeCharacter(overrides: Partial<CharacterRecord> = {}): CharacterRecord {
  return {
    id: "character-1",
    userId: "user-1",
    name: "Тестун",
    pronoun: "they",
    path: "sun",
    raceId: "race.domovyk",
    classId: "class.ranger",
    level: 3,
    xp: 0,
    gold: 0,
    hpCurrent: 10,
    hpMax: 10,
    manaCurrent: 3,
    manaMax: 3,
    statsJson: {
      strength: 1,
      dexterity: 1,
      intelligence: 1,
      charisma: 1,
      luck: 1
    },
    remortCount: 0,
    ...overrides
  };
}
