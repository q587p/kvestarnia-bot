import { describe, expect, it } from "vitest";
import type { CharacterRecord, CharacterRepository } from "../../src/db/repositories/characterRepository";
import type {
  ClaimDailyActionInput,
  ClaimDailyActionResult,
  DailyActionRecord,
  DailyActionRepository
} from "../../src/db/repositories/dailyActionRepository";
import type {
  ShynokDrinkStateRecord,
  ShynokRepository
} from "../../src/db/repositories/shynokRepository";
import { getLevelForXp, getLevelStartXp } from "../../src/domain/progression/level";
import {
  BARREL_BEER_TUTORIAL_MAX_LEVEL,
  BARREL_BEER_TUTORIAL_STIPEND_GOLD,
  BarrelBeerTutorialService,
  getBarrelBeerTutorialRewardXp
} from "../../src/services/barrelBeerTutorialService";
import { PERSTEN_PYVOVLADDIA_ITEM_ID } from "../../src/services/itemGrant";
import {
  PRESENCE_LOCATION_KORCHMA_BARREL,
  PRESENCE_LOCATION_KORCHMA_QUEST_TABLE
} from "../../src/services/presenceService";

const telegramUserId = 4242n;
const now = new Date("2026-07-06T12:00:00.000Z");

describe("BarrelBeerTutorialService", () => {
  it("is available only for levels 2 through 7 before acceptance", async () => {
    const locked = createWorld({ level: 1 });
    await expect(locked.service.getForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "level-locked",
      requiredLevel: 2
    });

    for (const level of [2, 3, 4, 5, 6, 7]) {
      const available = createWorld({ level });
      await expect(available.service.getForTelegramUser(telegramUserId)).resolves.toMatchObject({
        state: "available"
      });
    }

    const retired = createWorld({ level: 8 });
    await expect(retired.service.getForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "level-retired",
      maxLevel: BARREL_BEER_TUTORIAL_MAX_LEVEL
    });
    await expect(retired.service.acceptForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "level-retired",
      maxLevel: BARREL_BEER_TUTORIAL_MAX_LEVEL
    });
  });

  it("grants the 39 gold stipend exactly once", async () => {
    const world = createWorld({ level: 2, gold: 10 });

    await expect(world.service.acceptForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "accepted",
      stipendGold: BARREL_BEER_TUTORIAL_STIPEND_GOLD
    });
    expect(world.character.gold).toBe(49);

    await expect(world.service.acceptForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "already-accepted",
      stipendGold: 0
    });
    expect(world.character.gold).toBe(49);
  });

  it("does not complete after only the Barrel raid", async () => {
    const world = createWorld({ level: 2 });

    await acceptAndFinishRoute(world);
    world.character.currentLocationId = PRESENCE_LOCATION_KORCHMA_QUEST_TABLE;

    await expect(world.service.turnInForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "missing-progress",
      progress: {
        visitedBarrel: true,
        raidCompleted: true,
        beerRoundOffered: false,
        beerDrunk: false
      }
    });
  });

  it("does not complete from beer effect alone without route progress", async () => {
    const world = createWorld({ level: 2, activeBeer: true });

    await world.service.acceptForTelegramUser(telegramUserId);
    world.character.currentLocationId = PRESENCE_LOCATION_KORCHMA_QUEST_TABLE;

    await expect(world.service.turnInForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "missing-progress",
      progress: {
        activeBeer: true,
        visitedBarrel: false,
        raidCompleted: false
      }
    });
  });

  it("ignores beer drinks before the mandatory round and requires a fresh post-round drink", async () => {
    const world = createWorld({ level: 2, activeBeer: true });

    await acceptAndFinishRoute(world);
    await world.service.markBeerDrunkForTelegramUser(telegramUserId);
    await world.service.markBeerRoundOfferedForTelegramUser(telegramUserId);
    world.character.currentLocationId = PRESENCE_LOCATION_KORCHMA_QUEST_TABLE;

    await expect(world.service.turnInForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "missing-progress",
      progress: {
        beerRoundOffered: true,
        beerDrunk: false,
        activeBeer: true
      }
    });

    await world.service.markBeerDrunkForTelegramUser(telegramUserId);

    await expect(world.service.turnInForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "completed",
      progress: {
        beerRoundOffered: true,
        beerDrunk: true,
        activeBeer: true
      }
    });
  });

  it("requires drinking beer after the mandatory round", async () => {
    const world = createWorld({ level: 2, activeBeer: true });

    await acceptAndFinishRoute(world);
    await world.service.markBeerRoundOfferedForTelegramUser(telegramUserId);
    world.character.currentLocationId = PRESENCE_LOCATION_KORCHMA_QUEST_TABLE;

    await expect(world.service.turnInForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "missing-progress",
      progress: {
        beerRoundOffered: true,
        beerDrunk: false,
        activeBeer: true
      }
    });
  });

  it("ignores beer rounds offered before the Barrel raid step", async () => {
    const world = createWorld({ level: 2, activeBeer: true });

    await world.service.acceptForTelegramUser(telegramUserId);
    await world.service.markBeerRoundOfferedForTelegramUser(telegramUserId);
    await world.service.markVisitedBarrelForTelegramUser(telegramUserId);
    await world.service.markBarrelRaidCompletedForTelegramUser(telegramUserId);
    await world.service.markBeerDrunkForTelegramUser(telegramUserId);
    world.character.currentLocationId = PRESENCE_LOCATION_KORCHMA_QUEST_TABLE;

    await expect(world.service.turnInForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "missing-progress",
      progress: {
        visitedBarrel: true,
        raidCompleted: true,
        beerRoundOffered: false,
        beerDrunk: false
      }
    });
  });

  it("completes the full route while beer effect is active", async () => {
    const world = createWorld({ level: 2, xp: 5, activeBeer: true });

    await acceptAndFinishRoute(world);
    await world.service.markBeerRoundOfferedForTelegramUser(telegramUserId);
    await world.service.markBeerDrunkForTelegramUser(telegramUserId);
    world.character.currentLocationId = PRESENCE_LOCATION_KORCHMA_QUEST_TABLE;

    const result = await world.service.turnInForTelegramUser(telegramUserId);

    expect(result).toMatchObject({
      state: "completed",
      reward: {
        xp: 6,
        gold: 0,
        itemGrants: [
          {
            itemId: PERSTEN_PYVOVLADDIA_ITEM_ID,
            name: "Перстень Пивовладдя",
            quantity: 1
          }
        ]
      }
    });
    expect(world.character.xp).toBe(11);
  });

  it("requires the character to already be at the quest table for turn-in", async () => {
    const world = createWorld({ level: 2, activeBeer: true });

    await acceptAndFinishRoute(world);
    await world.service.markBeerRoundOfferedForTelegramUser(telegramUserId);
    await world.service.markBeerDrunkForTelegramUser(telegramUserId);
    world.character.currentLocationId = PRESENCE_LOCATION_KORCHMA_BARREL;

    await expect(world.service.turnInForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "wrong-location",
      progress: {
        beerRoundOffered: true,
        beerDrunk: true,
        activeBeer: true,
        currentLocationId: PRESENCE_LOCATION_KORCHMA_BARREL
      }
    });
    expect(world.character.xp).toBe(0);
  });

  it("fails gracefully after beer expires and later succeeds after drinking again", async () => {
    const world = createWorld({ level: 2, activeBeer: false });

    await acceptAndFinishRoute(world);
    await world.service.markBeerRoundOfferedForTelegramUser(telegramUserId);
    await world.service.markBeerDrunkForTelegramUser(telegramUserId);
    world.character.currentLocationId = PRESENCE_LOCATION_KORCHMA_QUEST_TABLE;

    await expect(world.service.turnInForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "beer-expired",
      progress: {
        visitedBarrel: true,
        raidCompleted: true,
        beerRoundOffered: true,
        beerDrunk: true,
        activeBeer: false
      }
    });

    world.shynok.activeDrink = buildDrinkState({ expiresAt: new Date(now.getTime() + 23 * 60_000) });

    await expect(world.service.turnInForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "completed",
      progress: {
        beerRoundOffered: true,
        beerDrunk: true
      }
    });
  });

  it("completes after a one-time round and a later self beer active effect", async () => {
    const world = createWorld({ level: 2, activeBeer: false });

    await acceptAndFinishRoute(world);
    await world.service.markBeerRoundOfferedForTelegramUser(telegramUserId);
    await world.service.markBeerDrunkForTelegramUser(telegramUserId);
    world.character.currentLocationId = PRESENCE_LOCATION_KORCHMA_QUEST_TABLE;

    await expect(world.service.turnInForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "beer-expired"
    });

    world.shynok.activeDrink = buildDrinkState({ expiresAt: new Date(now.getTime() + 23 * 60_000) });

    await expect(world.service.turnInForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "completed"
    });
  });

  it("allows a quest accepted at level 7 to finish after the character reaches level 8", async () => {
    const world = createWorld({ level: 7, xp: getLevelStartXp(7) });

    await world.service.acceptForTelegramUser(telegramUserId);
    world.character.level = 8;
    world.character.xp = getLevelStartXp(8);
    await world.service.markVisitedBarrelForTelegramUser(telegramUserId);
    await world.service.markBarrelRaidCompletedForTelegramUser(telegramUserId);
    await world.service.markBeerRoundOfferedForTelegramUser(telegramUserId);
    await world.service.markBeerDrunkForTelegramUser(telegramUserId);
    world.shynok.activeDrink = buildDrinkState({ expiresAt: new Date(now.getTime() + 23 * 60_000) });
    world.character.currentLocationId = PRESENCE_LOCATION_KORCHMA_QUEST_TABLE;

    await expect(world.service.turnInForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "completed",
      reward: {
        xp: 16
      }
    });
  });

  it("keeps Barrel route progress scoped to the current remort life", async () => {
    const world = createWorld({ level: 2 });

    await acceptAndFinishRoute(world);
    await expect(world.service.getForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "in-progress",
      progress: {
        accepted: true,
        visitedBarrel: true,
        raidCompleted: true
      }
    });

    world.character.remortCount = 1;
    world.character.level = 3;
    await world.service.markVisitedBarrelForTelegramUser(telegramUserId);
    await world.service.markBarrelRaidCompletedForTelegramUser(telegramUserId);

    await expect(world.service.getForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "available",
      progress: {
        accepted: false,
        visitedBarrel: false,
        raidCompleted: false
      }
    });

    await world.service.acceptForTelegramUser(telegramUserId);
    await expect(world.service.getForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "in-progress",
      progress: {
        accepted: true,
        visitedBarrel: false,
        raidCompleted: false
      }
    });
  });

  it("uses small level-scaled XP instead of a fixed 50 XP reward", () => {
    expect(getBarrelBeerTutorialRewardXp(buildCharacter({ level: 2, xp: getLevelStartXp(2) }))).toBe(6);
    expect(getBarrelBeerTutorialRewardXp(buildCharacter({ level: 3, xp: getLevelStartXp(3) }))).toBe(8);
    expect(getBarrelBeerTutorialRewardXp(buildCharacter({ level: 4, xp: getLevelStartXp(4) }))).toBe(10);
    expect(getBarrelBeerTutorialRewardXp(buildCharacter({ level: 5, xp: getLevelStartXp(5) }))).toBe(16);
    expect(getBarrelBeerTutorialRewardXp(buildCharacter({ level: 6, xp: getLevelStartXp(6) }))).toBe(16);
    expect(getBarrelBeerTutorialRewardXp(buildCharacter({ level: 7, xp: getLevelStartXp(7) }))).toBe(16);
    expect(getBarrelBeerTutorialRewardXp(buildCharacter({ level: 2, xp: getLevelStartXp(2) }))).not.toBe(50);
  });

  it("caps no-remort XP so the quest reward cannot advance more than one level", async () => {
    const oldLevel = 12;
    const world = createWorld({ level: 5, xp: getLevelStartXp(5), activeBeer: true });

    await world.service.acceptForTelegramUser(telegramUserId);
    world.character.level = oldLevel;
    world.character.xp = getLevelStartXp(13) - 1;
    await acceptAndFinishRoute(world);
    await world.service.markBeerRoundOfferedForTelegramUser(telegramUserId);
    await world.service.markBeerDrunkForTelegramUser(telegramUserId);
    world.character.currentLocationId = PRESENCE_LOCATION_KORCHMA_QUEST_TABLE;

    const result = await world.service.turnInForTelegramUser(telegramUserId);

    expect(result).toMatchObject({
      state: "completed",
      reward: {
        xp: 1
      },
      levelChange: {
        oldLevel,
        newLevel: oldLevel + 1,
        leveledUp: true
      }
    });
    expect(world.character.level).toBe(oldLevel + 1);
  });

  it("grants completion reward once", async () => {
    const world = createWorld({ level: 2, activeBeer: true });

    await acceptAndFinishRoute(world);
    await world.service.markBeerRoundOfferedForTelegramUser(telegramUserId);
    await world.service.markBeerDrunkForTelegramUser(telegramUserId);
    world.character.currentLocationId = PRESENCE_LOCATION_KORCHMA_QUEST_TABLE;

    await expect(world.service.turnInForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "completed",
      reward: {
        xp: 6
      }
    });
    await expect(world.service.turnInForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "already-completed",
      levelChange: null,
      reward: {
        xp: 6
      }
    });
    expect(world.character.xp).toBe(6);
  });
});

async function acceptAndFinishRoute(world: ReturnType<typeof createWorld>): Promise<void> {
  await world.service.acceptForTelegramUser(telegramUserId);
  await world.service.markVisitedBarrelForTelegramUser(telegramUserId);
  await world.service.markBarrelRaidCompletedForTelegramUser(telegramUserId);
}

function createWorld(input: {
  level: number;
  gold?: number;
  xp?: number;
  activeBeer?: boolean;
}) {
  const character = buildCharacter(input);
  const characters = new FakeCharacterRepository(character);
  const dailyActions = new FakeDailyActionRepository(character);
  const shynok = new FakeShynokRepository(
    input.activeBeer
      ? buildDrinkState({ expiresAt: new Date(now.getTime() + 23 * 60_000) })
      : null
  );

  return {
    character,
    service: new BarrelBeerTutorialService(characters, dailyActions, shynok, () => now),
    dailyActions,
    shynok
  };
}

function buildCharacter(input: { level: number; gold?: number; xp?: number }): CharacterRecord {
  return {
    id: "character-1",
    userId: "user-1",
    currentLocationId: PRESENCE_LOCATION_KORCHMA_BARREL,
    name: "Тестик",
    pronoun: "they",
    path: "path.test",
    raceId: "race.test",
    classId: "class.test",
    level: input.level,
    xp: input.xp ?? 0,
    gold: input.gold ?? 0,
    hpCurrent: 10,
    hpMax: 10,
    manaCurrent: 3,
    manaMax: 3,
    statsJson: {},
    remortCount: 0
  };
}

function buildDrinkState(input: { expiresAt: Date }): ShynokDrinkStateRecord {
  return {
    id: "drink-state-1",
    activationId: "activation-1",
    characterId: "character-1",
    remortCount: 0,
    drinkKey: "drink.simple-beer",
    phase: "timed",
    startedAt: now,
    expiresAt: input.expiresAt,
    sourceType: "self_purchase",
    sourceId: "order-1",
    metadata: {}
  };
}

class FakeCharacterRepository implements CharacterRepository {
  constructor(private readonly character: CharacterRecord | null) {}

  findByUserId(): Promise<CharacterRecord | null> {
    return Promise.resolve(this.character);
  }

  findByTelegramUserId(): Promise<CharacterRecord | null> {
    return Promise.resolve(this.character);
  }

  deleteByTelegramUserId(): Promise<boolean> {
    throw new Error("Not implemented.");
  }

  createForTelegramUserIfMissing(): never {
    throw new Error("Not implemented.");
  }
}

class FakeDailyActionRepository implements DailyActionRepository {
  private readonly actions = new Map<string, DailyActionRecord>();

  constructor(private readonly character: CharacterRecord) {}

  findForTelegramUser(
    _telegramUserId: bigint,
    input: { key: string; localDate: string }
  ): Promise<DailyActionRecord | null> {
    return Promise.resolve(this.actions.get(actionKey(input.key, input.localDate)) ?? null);
  }

  claimForTelegramUser(
    _telegramUserId: bigint,
    input: ClaimDailyActionInput
  ): Promise<ClaimDailyActionResult | null> {
    const key = actionKey(input.key, input.localDate);
    const existing = this.actions.get(key);

    if (existing) {
      return Promise.resolve({
        state: "existing",
        action: existing,
        character: this.character,
        levelChange: null,
        itemGrants: []
      });
    }

    const oldLevel = this.character.level;
    this.character.xp += input.rewardXp;
    this.character.gold += input.rewardGold;
    if (input.rewardXp > 0) {
      this.character.level = getLevelForXp(this.character.xp, {
        remortCount: this.character.remortCount ?? 0
      });
    }

    const action: DailyActionRecord = {
      id: key,
      characterId: this.character.id,
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
      character: this.character,
      levelChange: {
        oldLevel,
        newLevel: this.character.level,
        leveledUp: this.character.level > oldLevel
      },
      itemGrants: input.itemGrants ?? [],
      hpLoss: null
    });
  }
}

class FakeShynokRepository implements Pick<ShynokRepository, "getActiveDrinkForTelegramUser"> {
  constructor(public activeDrink: ShynokDrinkStateRecord | null) {}

  getActiveDrinkForTelegramUser(): Promise<ShynokDrinkStateRecord | null> {
    return Promise.resolve(this.activeDrink);
  }
}

function actionKey(key: string, localDate: string): string {
  return `${key}:${localDate}`;
}
