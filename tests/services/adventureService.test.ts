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
import type { SoloCombatSessionRecord } from "../../src/db/repositories/soloCombatSessionRepository";
import type { TelegramUserProfile } from "../../src/db/repositories/userRepository";
import { getLevelForXp } from "../../src/domain/progression/level";
import {
  ADVENTURE_CHOICE_KEY,
  ADVENTURE_PROBLEM_IDS,
  AdventureService,
  MIMIC_SHAWARMA_ADVENTURE_KEY,
  buildApproachOptions,
  buildAdventureOffer,
  buildAdventurePeriod,
  getAdventureProblemIcon,
  type AdventureApproach
} from "../../src/services/adventureService";

const telegramUserId = 42n;

describe("AdventureService", () => {
  it("returns no-character when user has no character", async () => {
    const { service } = setup();

    await expect(service.getAdventureOfferForTelegramUser(telegramUserId)).resolves.toEqual({
      state: "no-character"
    });
    await expect(
      service.completeAdventureApproach(telegramUserId, {
        periodToken: "20260612",
        problemId: "stew",
        approach: "safe"
      })
    ).resolves.toEqual({
      state: "no-character"
    });
  });

  it("generates three distinct deterministic choices for a 93-minute period", () => {
    const period = buildAdventurePeriod(fixedClock());
    const first = buildAdventureOffer("character-42", period);
    const second = buildAdventureOffer("character-42", period);
    const samePeriod = buildAdventureOffer(
      "character-42",
      buildAdventurePeriod(new Date(period.expiresAt.getTime() - 1_000))
    );
    const nextPeriod = buildAdventureOffer(
      "character-42",
      buildAdventurePeriod(new Date(period.expiresAt.getTime() + 1_000))
    );

    expect(first).toEqual(second);
    expect(first).toEqual(samePeriod);
    expect(first.periodToken).toBe(period.token);
    expect(first.choices).toHaveLength(3);
    expect(new Set(first.choices.map((choice) => choice.id)).size).toBe(3);
    expect(ADVENTURE_PROBLEM_IDS.length).toBeGreaterThanOrEqual(24);
    expect(nextPeriod.choices.map((choice) => choice.id)).not.toEqual(
      first.choices.map((choice) => choice.id)
    );
    expect(
      (first.expiresAt.getTime() - buildAdventurePeriod(fixedClock()).expiresAt.getTime()) / 60_000
    ).toBe(0);
    expect(first.choices.every((choice) => getAdventureProblemIcon(choice.id).length > 0)).toBe(true);
    expect(ADVENTURE_PROBLEM_IDS.every((problemId) => getAdventureProblemIcon(problemId).length > 0)).toBe(true);
  });

  it("selects a problem and exposes safe, flavored, and risky approaches", async () => {
    const { service, characters } = setup();
    characters.add(telegramUserId, { xp: 25, classId: "class.bureaucramancer" });
    const offer = await readyOffer(service);
    const result = await service.selectAdventureProblem(telegramUserId, {
      periodToken: offer.periodToken,
      problemId: offer.choices[0].id
    });

    expect(result.state).toBe("selected");
    if (result.state === "selected") {
      expect(result.approaches.map((approach) => approach.id)).toEqual([
        "safe",
        "flair",
        "risky"
      ]);
      expect(result.approaches[0].reward.xp).toBeLessThan(result.approaches[1].reward.xp);
      expect(result.approaches[1].reward.xp).toBeLessThan(result.approaches[2].reward.xp);
      expect(result.approaches[0].complicationChance).toBeLessThan(
        result.approaches[2].complicationChance
      );
      expect(result.approaches[1].label).toContain("23-Б");
    }
  });

  it("claims one non-complicated reward through the daily action path", async () => {
    const found = await findResolvedAdventure("flair", false);

    expect(found.result.state).toBe("completed");
    if (found.result.state === "completed") {
      expect(found.result.reward).toMatchObject({
        xp: 7,
        gold: 4,
        localDate: buildAdventurePeriod(fixedClock()).storageKey
      });
      expect(found.result.complication).toBe(false);
    }
    expect(found.dailyActions.createCount).toBe(1);
    expect(found.dailyActions.records[0]).toMatchObject({
      key: ADVENTURE_CHOICE_KEY,
      localDate: buildAdventurePeriod(fixedClock()).storageKey,
      rewardXp: 7,
      rewardGold: 4
    });
  });

  it("records a complication as the daily claim without granting reward", async () => {
    const found = await findResolvedAdventure("risky", true);

    expect(found.result.state).toBe("completed");
    if (found.result.state === "completed") {
      expect(found.result.complication).toBe(true);
      expect(found.result.reward).toMatchObject({
        xp: 0,
        gold: 0
      });
    }
    expect(found.dailyActions.createCount).toBe(1);
    expect(found.dailyActions.records[0]).toMatchObject({
      key: ADVENTURE_CHOICE_KEY,
      rewardXp: 0,
      rewardGold: 0
    });
  });

  it("does not duplicate rewards when callback is replayed", async () => {
    const found = await findResolvedAdventure("safe", false);
    const repeated = await found.service.completeAdventureApproach(found.userId, found.input);

    expect(repeated.state).toBe("already-completed");
    expect(found.dailyActions.createCount).toBe(1);
  });

  it("resets the current 93-minute adventure claim for dev testing", async () => {
    const found = await findResolvedAdventure("safe", false);

    await expect(found.service.resetCurrentPeriodForTelegramUser(found.userId)).resolves.toMatchObject({
      state: "reset"
    });
    await expect(found.service.resetCurrentPeriodForTelegramUser(found.userId)).resolves.toMatchObject({
      state: "not-claimed"
    });
    const replay = await found.service.completeAdventureApproach(found.userId, found.input);

    expect(replay.state).toBe("completed");
    expect(found.dailyActions.createCount).toBe(2);
  });

  it("rejects stale period and stale problem callbacks without claiming", async () => {
    const { service, characters, dailyActions } = setup();
    characters.add(telegramUserId, { xp: 25 });
    const offer = await readyOffer(service);
    const staleProblem = ADVENTURE_PROBLEM_IDS
      .find((problemId) => !offer.choices.some((choice) => choice.id === problemId));

    await expect(
      service.selectAdventureProblem(telegramUserId, {
        periodToken: "20260611",
        problemId: offer.choices[0].id
      })
    ).resolves.toMatchObject({ state: "stale" });
    await expect(
      service.completeAdventureApproach(telegramUserId, {
        periodToken: offer.periodToken,
        problemId: staleProblem ?? "spoon",
        approach: "safe"
      })
    ).resolves.toMatchObject({ state: "stale" });
    expect(dailyActions.createCount).toBe(0);
  });

  it("level-gates the adventure choice loop", async () => {
    const { service, characters, dailyActions } = setup();
    characters.add(telegramUserId, { xp: 15 });

    await expect(service.getAdventureOfferForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "level-locked",
      requiredLevel: 3
    });
    await expect(
      service.completeAdventureApproach(telegramUserId, {
        periodToken: "20260612",
        problemId: "stew",
        approach: "safe"
      })
    ).resolves.toMatchObject({
      state: "level-locked",
      requiredLevel: 3
    });
    expect(dailyActions.createCount).toBe(0);
  });

  it("keeps the starter shawarma adventure available before the choice loop opens", async () => {
    const { service, characters, dailyActions } = setup();
    characters.add(telegramUserId, { xp: 0 });

    await expect(service.getAdventureOfferForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "level-locked",
      requiredLevel: 3
    });
    await expect(service.getMimicShawarmaForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "ready"
    });

    const result = await service.completeMimicShawarma(telegramUserId, "poke");

    expect(result.state).toBe("completed");
    if (result.state === "completed") {
      expect(result.reward).toMatchObject({
        xp: 8,
        gold: 4,
        localDate: "2026-06-12"
      });
    }
    expect(dailyActions.records[0]).toMatchObject({
      key: MIMIC_SHAWARMA_ADVENTURE_KEY,
      localDate: "2026-06-12",
      rewardXp: 8,
      rewardGold: 4
    });
  });

  it("does not duplicate starter shawarma rewards when legacy callbacks replay", async () => {
    const { service, characters, dailyActions } = setup();
    characters.add(telegramUserId, { xp: 0 });

    const first = await service.completeMimicShawarma(telegramUserId, "receipt");
    const replay = await service.completeMimicShawarma(telegramUserId, "receipt");

    expect(first.state).toBe("completed");
    expect(replay.state).toBe("already-completed");
    expect(dailyActions.createCount).toBe(1);
  });

  it("blocks fresh offers and claims while a live fight is active", async () => {
    const activeFight = fakeSession();
    const { service, characters, dailyActions } = setup(activeFight);
    characters.add(telegramUserId, { xp: 25 });
    const offer = buildAdventureOffer(
      `character-${telegramUserId.toString()}`,
      buildAdventurePeriod(fixedClock())
    );

    await expect(service.getAdventureOfferForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "active-fight",
      session: activeFight
    });
    await expect(
      service.completeAdventureApproach(telegramUserId, {
        periodToken: offer.periodToken,
        problemId: offer.choices[0].id,
        approach: "risky"
      })
    ).resolves.toMatchObject({
      state: "active-fight",
      session: activeFight
    });
    expect(dailyActions.createCount).toBe(0);
  });

  it("keeps a live complication fight visible after the period has an adventure claim", async () => {
    const activeFight = fakeSession();
    const { service, characters, dailyActions } = setup(activeFight);
    characters.add(telegramUserId, { xp: 25 });
    dailyActions.add(telegramUserId, {
      key: ADVENTURE_CHOICE_KEY,
      localDate: buildAdventurePeriod(fixedClock()).storageKey
    });

    await expect(service.getAdventureOfferForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "active-fight",
      session: activeFight
    });
  });

  it("keeps approach reward and risk ordering conservative", () => {
    const options = buildApproachOptions(characterSummary());

    expect(options.map((option) => option.reward.xp)).toEqual([4, 7, 10]);
    expect(options.map((option) => option.reward.gold)).toEqual([2, 4, 7]);
    expect(options.map((option) => option.complicationChance)).toEqual([13, 23, 42]);
  });
});

function fixedClock(): Date {
  return new Date("2026-06-12T10:30:00.000Z");
}

function setup(activeFight: SoloCombatSessionRecord | null = null): {
  characters: FakeCharacterRepository;
  dailyActions: FakeDailyActionRepository;
  service: AdventureService;
} {
  const characters = new FakeCharacterRepository();
  const dailyActions = new FakeDailyActionRepository(characters);
  const fights = {
    findActiveByTelegramUserId: () => Promise.resolve(activeFight)
  };

  return {
    characters,
    dailyActions,
    service: new AdventureService(characters, dailyActions, fixedClock, fights)
  };
}

async function readyOffer(service: AdventureService) {
  const result = await service.getAdventureOfferForTelegramUser(telegramUserId);

  if (result.state !== "ready") {
    throw new Error(`Expected ready offer, got ${result.state}.`);
  }

  return result.offer;
}

async function findResolvedAdventure(approach: AdventureApproach, complication: boolean) {
  for (let user = 40n; user < 700n; user += 1n) {
    const { service, characters, dailyActions } = setup();
    characters.add(user, { xp: 25 });
    const lookup = await service.getAdventureOfferForTelegramUser(user);

    if (lookup.state !== "ready") {
      continue;
    }

    const input = {
      periodToken: lookup.offer.periodToken,
      problemId: lookup.offer.choices[0].id,
      approach
    };
    const result = await service.completeAdventureApproach(user, input);

    if (result.state === "completed" && result.complication === complication) {
      return { service, dailyActions, result, input, userId: user };
    }
  }

  throw new Error(`Could not find ${approach} adventure with complication=${complication}.`);
}

function characterSummary() {
  return {
    name: "Мандрівник",
    pronoun: "they",
    pronounLabel: "Вони",
    path: "boundary",
    raceId: "race.human-ish",
    raceName: "Людисько",
    classId: "class.warrior",
    className: "Воїн",
    title: "Пересічний Пригодник",
    level: 3,
    xp: 25,
    nextLevelXp: 50,
    xpToNextLevel: 25,
    gold: 0,
    hpCurrent: 28,
    hpMax: 28,
    manaCurrent: 14,
    manaMax: 14,
    stats: {
      strength: 9,
      dexterity: 6,
      intelligence: 6,
      charisma: 6,
      luck: 6
    },
    levelBonus: {
      hpMax: 8,
      manaMax: 4,
      primaryStat: {
        stat: "strength" as const,
        bonus: 2
      }
    }
  };
}

function fakeSession(): SoloCombatSessionRecord {
  return {
    id: "session-1",
    characterId: `character-${telegramUserId.toString()}`,
    monsterId: "monster.deadline-spider",
    status: "active",
    turn: 1,
    state: null,
    reward: null,
    createdAt: fixedClock(),
    updatedAt: fixedClock(),
    expiresAt: new Date("2026-06-12T10:45:00.000Z")
  };
}

class FakeCharacterRepository implements CharacterRepository {
  private readonly charactersByTelegramUserId = new Map<bigint, CharacterRecord>();

  add(userTelegramId: bigint, overrides: Partial<CharacterRecord> = {}): void {
    const xp = overrides.xp ?? 25;
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
      hpCurrent: 28,
      hpMax: 28,
      manaCurrent: 14,
      manaMax: 14,
      statsJson: {
        strength: 9,
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
  createCount = 0;

  constructor(private readonly characters: FakeCharacterRepository) {}

  get records(): DailyActionRecord[] {
    return [...this.actions.values()];
  }

  add(
    userTelegramId: bigint,
    input: { key: string; localDate: string; rewardXp?: number; rewardGold?: number }
  ): void {
    const characterId = `character-${userTelegramId.toString()}`;
    const action = {
      id: `daily-action-${this.actions.size + 1}`,
      characterId,
      key: input.key,
      localDate: input.localDate,
      rewardXp: input.rewardXp ?? 0,
      rewardGold: input.rewardGold ?? 0,
      createdAt: fixedClock()
    };
    this.actions.set(`${characterId}:${input.key}:${input.localDate}`, action);
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

  async deleteForTelegramUser(
    userTelegramId: bigint,
    input: { key: string; localDate: string }
  ): Promise<"deleted" | "missing" | "no-character"> {
    const character = await this.characters.findByTelegramUserId(userTelegramId);

    if (!character) {
      return "no-character";
    }

    return this.actions.delete(`${character.id}:${input.key}:${input.localDate}`)
      ? "deleted"
      : "missing";
  }
}
