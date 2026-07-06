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
import {
  BARREL_BEER_TUTORIAL_REWARD_XP,
  BARREL_BEER_TUTORIAL_STIPEND_GOLD,
  BarrelBeerTutorialService
} from "../../src/services/barrelBeerTutorialService";
import { PERSTEN_PYVOVLADDIA_ITEM_ID } from "../../src/services/itemGrant";
import {
  PRESENCE_LOCATION_KORCHMA_BARREL,
  PRESENCE_LOCATION_KORCHMA_QUEST_TABLE
} from "../../src/services/presenceService";

const telegramUserId = 4242n;
const now = new Date("2026-07-06T12:00:00.000Z");

describe("BarrelBeerTutorialService", () => {
  it("appears at level 2 and not below level 2", async () => {
    const locked = createWorld({ level: 1 });
    await expect(locked.service.getForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "level-locked",
      requiredLevel: 2
    });

    const available = createWorld({ level: 2 });
    await expect(available.service.getForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "available"
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

    await world.service.acceptForTelegramUser(telegramUserId);
    await world.service.markVisitedBarrelForTelegramUser(telegramUserId);
    await world.service.markBarrelRaidCompletedForTelegramUser(telegramUserId);
    world.character.currentLocationId = PRESENCE_LOCATION_KORCHMA_QUEST_TABLE;

    await expect(world.service.turnInForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "missing-progress",
      progress: {
        visitedBarrel: true,
        raidCompleted: true,
        beerAction: false,
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

  it("completes the full route while beer effect is active", async () => {
    const world = createWorld({ level: 2, xp: 5, activeBeer: true });

    await world.service.acceptForTelegramUser(telegramUserId);
    await world.service.markVisitedBarrelForTelegramUser(telegramUserId);
    await world.service.markBarrelRaidCompletedForTelegramUser(telegramUserId);
    await world.service.markBeerDrunkForTelegramUser(telegramUserId);
    world.character.currentLocationId = PRESENCE_LOCATION_KORCHMA_QUEST_TABLE;

    const result = await world.service.turnInForTelegramUser(telegramUserId);

    expect(result).toMatchObject({
      state: "completed",
      reward: {
        xp: BARREL_BEER_TUTORIAL_REWARD_XP,
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
    expect(world.character.xp).toBe(55);
  });

  it("fails gracefully after beer expires and later succeeds after drinking again", async () => {
    const world = createWorld({ level: 2, activeBeer: false });

    await world.service.acceptForTelegramUser(telegramUserId);
    await world.service.markVisitedBarrelForTelegramUser(telegramUserId);
    await world.service.markBarrelRaidCompletedForTelegramUser(telegramUserId);
    await world.service.markBeerDrunkForTelegramUser(telegramUserId);
    world.character.currentLocationId = PRESENCE_LOCATION_KORCHMA_QUEST_TABLE;

    await expect(world.service.turnInForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "beer-expired",
      progress: {
        visitedBarrel: true,
        raidCompleted: true,
        beerAction: true,
        beerDrunk: true,
        activeBeer: false
      }
    });

    world.shynok.activeDrink = buildDrinkState({ expiresAt: new Date(now.getTime() + 23 * 60_000) });

    await expect(world.service.turnInForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "completed"
    });
  });

  it("grants completion reward once", async () => {
    const world = createWorld({ level: 2, activeBeer: true });

    await world.service.acceptForTelegramUser(telegramUserId);
    await world.service.markVisitedBarrelForTelegramUser(telegramUserId);
    await world.service.markBarrelRaidCompletedForTelegramUser(telegramUserId);
    await world.service.markBeerDrunkForTelegramUser(telegramUserId);
    world.character.currentLocationId = PRESENCE_LOCATION_KORCHMA_QUEST_TABLE;

    await expect(world.service.turnInForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "completed"
    });
    await expect(world.service.turnInForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "already-completed",
      levelChange: null
    });
    expect(world.character.xp).toBe(BARREL_BEER_TUTORIAL_REWARD_XP);
  });
});

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

    this.character.xp += input.rewardXp;
    this.character.gold += input.rewardGold;

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
        oldLevel: this.character.level,
        newLevel: this.character.level,
        leveledUp: false
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
