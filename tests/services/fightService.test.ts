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
import type {
  ApplyCombatItemTurnInput,
  ApplyCombatItemTurnResult,
  CreateSoloCombatSessionInput,
  DueSoloCombatSessionRecord,
  SoloCombatSessionRecord,
  SoloCombatSessionRepository,
  SoloCombatSessionStatus,
  RecordSoloCombatRewardInput,
  UpdateSoloCombatSessionInput
} from "../../src/db/repositories/soloCombatSessionRepository";
import type {
  ConsumePendingPassageEncounterInput,
  ConsumePendingPassageEncounterResult,
  CreatePendingPassageEncounterInput,
  PendingPassageEncounterRecord,
  PendingPassageEncounterRepository
} from "../../src/db/repositories/pendingPassageEncounterRepository";
import type {
  CharacterEquipmentRecord,
  CharacterEquipmentSnapshot,
  EquipmentRepository
} from "../../src/db/repositories/equipmentRepository";
import type { ShynokRepository } from "../../src/db/repositories/shynokRepository";
import type { TelegramUserProfile } from "../../src/db/repositories/userRepository";
import { monsters } from "../../src/content/monsters";
import {
  markCombatSettlementCompleted,
  markCombatSettlementForfeitedByRemort,
  normalizeCombatEnemies,
  type CombatState
} from "../../src/domain/combat";
import { getLevelForXp } from "../../src/domain/progression/level";
import { buildStarterLevelTwoXpReward } from "../../src/domain/progression/starterRewards";
import { getItemDropChance } from "../../src/domain/loot";
import { TRAINING_DOPPELGANGER_MONSTER_ID } from "../../src/domain/trainingDoppelganger";
import { FakeRandomSource } from "../../src/shared/random";
import { MIMIC_SHAWARMA_ADVENTURE_KEY } from "../../src/services/adventureService";
import {
  buildCenterBaselinePersistentFightWinXp,
  buildHardPersistentFightWinXpFloor,
  applyRecentOrdinaryMonsterExclusions,
  FightService,
  getGoldSensitiveItemDropChance,
  getPersistentFightDifficultyConfig,
  MIMIC_SHAWARMA_COMBAT_PROBE_KEY,
  MONSTER_REST_COOLDOWN_MS,
  PENDING_PASSAGE_ENCOUNTER_TTL_MS,
  PENDING_PASSAGE_MONSTER_FULL_REGEN_SECONDS,
  PERSISTENT_SOLO_FIGHT_REWARD_KEY,
  PROBLEM_QUEST_BUCKET,
  PROBLEM_QUEST_REQUIRED_LEVEL,
  PROBLEM_QUEST_STAGES,
  selectPersistentFightMonsterLevel,
  THIRTEEN_SMALL_PROBLEMS_QUEST_KEY
} from "../../src/services/fightService";
import { BANDAGE_ITEM_ID } from "../../src/services/itemGrant";
import {
  PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT,
  PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_STRAIGHT,
  PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
  PRESENCE_LOCATION_KORCHMA_RANGER_CORNER
} from "../../src/services/presenceService";
import { getCombatItemUseKey } from "../../src/services/combatItemUse";

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
      rewardXp: buildStarterLevelTwoXpReward(),
      rewardGold: 3
    });
    await expect(characters.findByTelegramUserId(telegramUserId)).resolves.toMatchObject({
      xp: 15,
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
          itemId: "item.pan-of-persuasion",
          name: "Пательня переконання",
          quantity: 1
        },
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
        playerHpPreview: 19,
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

    const first = await service.completeMimicShawarma(telegramUserId, "receipt");
    const repeated = await service.completeMimicShawarma(telegramUserId, "receipt");

    expect(first.state).toBe("completed");
    if (first.state === "completed") {
      expect(first.reward.itemGrants).toEqual([
        {
          itemId: "item.stamp-of-minor-authority",
          name: "Печатка дрібної переваги",
          quantity: 1
        },
        {
          itemId: "item.receipt-of-formal-suspicion",
          name: "Чек формальної підозри",
          quantity: 1
        }
      ]);
    }
    expect(repeated.state).toBe("already-completed");
    expect(dailyActions.createCount).toBe(1);
    expect(dailyActions.grantedItems).toEqual([
      {
        itemId: "item.stamp-of-minor-authority",
        quantity: 1
      },
      {
        itemId: "item.receipt-of-formal-suspicion",
        quantity: 1
      }
    ]);
    await expect(characters.findByTelegramUserId(telegramUserId)).resolves.toMatchObject({
      xp: buildStarterLevelTwoXpReward(),
      gold: 5
    });
  });

  it("retires the starter fight at level three without claiming rewards", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const service = new FightService(characters, dailyActions, fixedClock);

    await expect(service.getMimicShawarmaForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "level-retired",
      maxLevel: 2
    });
    await expect(service.completeMimicShawarma(telegramUserId, "attack")).resolves.toMatchObject({
      state: "level-retired",
      maxLevel: 2
    });
    expect(dailyActions.createCount).toBe(0);
    expect(dailyActions.grantedItems).toEqual([]);
    await expect(characters.findByTelegramUserId(telegramUserId)).resolves.toMatchObject({
      xp: 25,
      gold: 0,
      level: 3
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
        itemId: "item.pan-of-persuasion",
        quantity: 1
      },
      {
        itemId: "item.suspicious-shawarma-wrapper",
        quantity: 1
      }
    ]);
    await expect(characters.findByTelegramUserId(telegramUserId)).resolves.toMatchObject({
      xp: buildStarterLevelTwoXpReward(),
      gold: 3
    });
  });

  it("shows persistent fight availability without starting a session", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1])
    );

    const overview = await service.getFightOverviewForTelegramUser(telegramUserId);

    expect(overview).toMatchObject({
      state: "persistent-ready",
      character: {
        level: 3
      },
      questProgress: {
        wins: 0,
        target: 13,
        completed: false,
        rewardClaimed: false
      }
    });
    expect(sessions.createCount).toBe(0);
  });

  it("reports a recovery notice when fight overview fills HP", async () => {
    const marker = new Date("2026-06-12T10:10:00.000Z");
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, {
      xp: 25,
      hpCurrent: 1,
      hpMax: 22,
      hpRegenAt: marker,
      manaRegenAt: marker
    });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1])
    );

    const overview = await service.getFightOverviewForTelegramUser(telegramUserId);
    const repeated = await service.getFightOverviewForTelegramUser(telegramUserId);

    expect(overview).toMatchObject({
      state: "persistent-ready",
      recoveryNotice: {
        type: "hp-full",
        hpCurrent: 30,
        hpMax: 30
      }
    });
    expect(repeated).not.toHaveProperty("recoveryNotice");
  });

  it("keeps old first-problem progress visible until the first paper is taken", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters, {
      autoIssueFirstProblemStage: false
    });
    const sessions = new FakeSoloCombatSessionRepository(characters);
    sessions.addWonSessions("character-42", 3);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1])
    );

    const overview = await service.getFightOverviewForTelegramUser(telegramUserId);
    const startAttempt = await service.getFightForTelegramUser(telegramUserId);

    expect(overview).toMatchObject({
      state: "persistent-not-issued",
      questProgress: {
        stageId: "13",
        wins: 3,
        target: 13,
        completed: false,
        rewardClaimed: false,
        issued: false
      }
    });
    expect(startAttempt).toMatchObject({
      state: "persistent-not-issued",
      questProgress: {
        issued: false,
        wins: 3
      }
    });
    expect(sessions.createCount).toBe(0);

    const issued = await service.issueNextProblemQuestForTelegramUser(telegramUserId);

    expect(issued).toMatchObject({
      state: "issued",
      stage: { id: "13" },
      nextStage: { id: "13" },
      issued: "created",
      progress: {
        stageId: "13",
        issued: true,
        wins: 3,
        target: 13
      }
    });
  });

  it("does not issue the first problem paper before level 2", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 0 });
    const dailyActions = new FakeDailyActionRepository(characters, {
      autoIssueFirstProblemStage: false
    });
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      new FakeSoloCombatSessionRepository(characters),
      new FakeRandomSource([0.1])
    );

    const result = await service.issueNextProblemQuestForTelegramUser(telegramUserId);

    expect(result).toMatchObject({
      state: "level-locked",
      requiredLevel: PROBLEM_QUEST_REQUIRED_LEVEL,
      character: {
        level: 1
      }
    });
    expect(dailyActions.records).toHaveLength(0);
  });

  it("recovers old completed first-problem progress only after the first paper is taken", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters, {
      autoIssueFirstProblemStage: false
    });
    const sessions = new FakeSoloCombatSessionRepository(characters);
    sessions.addWonSessions("character-42", 14);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1])
    );

    const prematureTurnIn = await service.turnInProblemQuestForTelegramUser(telegramUserId);

    expect(prematureTurnIn).toMatchObject({
      state: "not-ready",
      progress: {
        stageId: "13",
        wins: 14,
        target: 13,
        completed: true,
        rewardClaimed: false,
        issued: false
      }
    });
    expect(
      dailyActions.records.filter((record) => record.key === THIRTEEN_SMALL_PROBLEMS_QUEST_KEY)
    ).toHaveLength(0);

    const issued = await service.issueNextProblemQuestForTelegramUser(telegramUserId);

    expect(issued).toMatchObject({
      state: "issued",
      stage: { id: "13" },
      nextStage: { id: "13" },
      issued: "created",
      progress: {
        stageId: "13",
        issued: true,
        wins: 14,
        target: 13,
        completed: true,
        rewardClaimed: false
      }
    });

    const turnIn = await service.turnInProblemQuestForTelegramUser(telegramUserId);

    expect(turnIn.state).toBe("turned-in");
    if (turnIn.state === "turned-in") {
      expect(turnIn.result).toMatchObject({
        state: "claimed",
        stage: { id: "13" },
        nextStage: { id: "23" },
        nextStageAvailable: true
      });
    }
    expect(
      dailyActions.records.filter((record) => record.key === THIRTEEN_SMALL_PROBLEMS_QUEST_KEY)
    ).toHaveLength(1);

    const replay = await service.turnInProblemQuestForTelegramUser(telegramUserId);

    expect(replay).toMatchObject({
      state: "turned-in",
      result: {
        state: "already-claimed",
        stage: { id: "13" }
      }
    });
    expect(
      dailyActions.records.filter((record) => record.key === THIRTEEN_SMALL_PROBLEMS_QUEST_KEY)
    ).toHaveLength(1);
  });

  it("uses record remort count for fight level gates", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { level: 2, xp: 25, remortCount: 1 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1])
    );

    const overview = await service.getFightOverviewForTelegramUser(telegramUserId);

    expect(overview).toMatchObject({
      state: "ready",
      character: {
        level: 2,
        remortCount: 1
      }
    });
    expect(sessions.createCount).toBe(0);
  });

  it("shows thirteen-problems progress beyond the reward target without claiming from overview", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    sessions.addWonSessions("character-42", 14);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1])
    );

    const overview = await service.getFightOverviewForTelegramUser(telegramUserId);

    expect(overview).toMatchObject({
      state: "persistent-ready",
      questProgress: {
        wins: 14,
        target: 13,
        completed: true,
        rewardClaimed: false
      }
    });
    expect(dailyActions.createCount).toBe(0);
  });

  it("keeps an active training doppelganger session out of quest overview expiry", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const trainingSession = sessions.addSession(makeActiveTrainingSession());
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1])
    );

    const overview = await service.getFightOverviewForTelegramUser(telegramUserId);
    const problemQuest = await service.getProblemQuestProgressForTelegramUser(telegramUserId);

    expect(overview).toMatchObject({
      state: "training-active",
      session: {
        id: trainingSession.id,
        monsterId: TRAINING_DOPPELGANGER_MONSTER_ID,
        status: "active"
      },
      questProgress: {
        wins: 0,
        completed: false
      }
    });
    expect(problemQuest).toMatchObject({
      state: "ready",
      progress: {
        wins: 0,
        completed: false
      }
    });
    expect(sessions.updateCount).toBe(0);
    expect(sessions.getById(trainingSession.id)).toMatchObject({
      status: "active",
      monsterId: TRAINING_DOPPELGANGER_MONSTER_ID
    });
  });

  it("keeps an active training doppelganger session out of normal fight start", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const trainingSession = sessions.addSession(makeActiveTrainingSession());
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1])
    );

    const result = await service.getFightForTelegramUser(telegramUserId);

    expect(result).toMatchObject({
      state: "training-active",
      session: {
        id: trainingSession.id,
        monsterId: TRAINING_DOPPELGANGER_MONSTER_ID,
        status: "active"
      }
    });
    expect(sessions.createCount).toBe(0);
    expect(sessions.updateCount).toBe(0);
  });

  it("excludes won training doppelganger sessions from thirteen small problems", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    sessions.addWonSessions("character-42", 12);
    sessions.addWonSessions("character-42", 3, TRAINING_DOPPELGANGER_MONSTER_ID);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1])
    );

    const overview = await service.getFightOverviewForTelegramUser(telegramUserId);

    expect(overview).toMatchObject({
      state: "persistent-ready",
      questProgress: {
        wins: 12,
        target: 13,
        completed: false,
        rewardClaimed: false
      }
    });
    expect(dailyActions.records.filter((record) => record.key === THIRTEEN_SMALL_PROBLEMS_QUEST_KEY)).toHaveLength(0);
  });

  it("does not let training doppelganger wins trigger the thirteen small problems reward", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    sessions.addWonSessions("character-42", 13, TRAINING_DOPPELGANGER_MONSTER_ID);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1])
    );

    const overview = await service.getFightOverviewForTelegramUser(telegramUserId);

    expect(overview).toMatchObject({
      state: "persistent-ready",
      questProgress: {
        wins: 0,
        completed: false,
        rewardClaimed: false
      }
    });
    expect(dailyActions.createCount).toBe(0);
    expect(dailyActions.grantedItems).toEqual([]);
  });

  it("starts and resumes one persistent fight session for level three characters", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1])
    );

    const first = await service.getFightForTelegramUser(telegramUserId);
    const second = await service.getFightForTelegramUser(telegramUserId);

    expect(first).toMatchObject({
      state: "persistent-active",
      character: {
        level: 3
      }
    });
    expect(second).toMatchObject({
      state: "persistent-active"
    });
    if (first.state === "persistent-active" && second.state === "persistent-active") {
      expect(second.session.id).toBe(first.session.id);
      expect(first.session.state).toMatchObject({
        turn: 1,
        status: "active"
      });
      expect(first.monster.id).not.toBe("monster.mimic-shawarma");
    }
    expect(sessions.createCount).toBe(1);
    expect(dailyActions.createCount).toBe(0);
  });

  it("freezes monster context and bark state when a persistent fight starts", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1])
    );

    const started = await service.getFightForTelegramUser(telegramUserId);

    expect(started.state).toBe("persistent-active");
    if (started.state !== "persistent-active") {
      return;
    }
    const stored = sessions.getById(started.session.id);

    expect(stored?.state?.context).toMatchObject({
      version: 1,
      rulesVersion: "monster-context-v1",
      monsterId: started.monster.id,
      world: {
        timezone: "Europe/Kyiv",
        localDate: "2026-06-12",
        partySizeBand: "solo"
      }
    });
    expect(stored?.state?.barks).toMatchObject({
      version: 1,
      rulesVersion: "monster-barks-v1",
      audience: "solo"
    });
    expect(stored?.state?.monster.contextModifiers).toEqual(stored?.state?.context?.effects);
  });

  it("freezes active beer modifiers when a direct persistent fight starts", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const shynok: Pick<ShynokRepository, "getActiveDrinkForTelegramUser"> = {
      getActiveDrinkForTelegramUser: () =>
        Promise.resolve({
          id: "drink-state-beer-direct",
          characterId: "character-1",
          remortCount: 0,
          drinkKey: "drink.fine-beer",
          phase: "timed",
          startedAt: new Date("2026-06-12T09:50:00.000Z"),
          expiresAt: new Date("2026-06-12T10:32:00.000Z"),
          sourceType: "self_purchase",
          sourceId: "order-beer-direct",
          metadata: null
        })
    };
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1]),
      undefined,
      undefined,
      undefined,
      shynok
    );

    const started = await service.getFightForTelegramUser(telegramUserId);

    expect(started.state).toBe("persistent-active");
    if (started.state !== "persistent-active") {
      return;
    }
    expect(sessions.getById(started.session.id)?.state?.drinkModifiers).toEqual({
      drinkKey: "drink.fine-beer",
      sourceId: "drink-state-beer-direct",
      accuracyPenaltyPp: 10
    });
  });

  it("starts a targeted persistent fight at the highest suitable requested monster level", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { level: 4, xp: 45 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0])
    );

    const first = await service.getOrStartPersistentFightForTelegramUser(telegramUserId, {
      source: "yeger",
      target: { tagsAny: ["undead", "ghost", "cursed", "unquiet"] }
    });
    const second = await service.getOrStartPersistentFightForTelegramUser(telegramUserId, {
      source: "yeger",
      target: { tagsAny: ["undead", "ghost", "cursed", "unquiet"] }
    });

    expect(first.state).toBe("persistent-active");
    if (first.state === "persistent-active") {
      expect(first.monster.tags.some((tag) => ["undead", "ghost", "cursed", "unquiet"].includes(tag))).toBe(true);
      expect(first.monster.level).toBe(4);
    }
    expect(second.state).toBe("persistent-active");
    expect(sessions.createCount).toBe(1);
  });

  it("creates an adventure handoff fight with the selected monster id", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1])
    );
    const adventureMonsterId = "monster.borshch-slime";

    const started = await service.getOrStartPersistentFightForTelegramUser(telegramUserId, {
      source: "adventure",
      difficulty: "normal",
      target: { monsterIds: [adventureMonsterId] }
    });

    expect(started.state).toBe("persistent-active");
    if (started.state === "persistent-active") {
      expect(started.started).toBe(true);
      expect(started.monster.id).toBe(adventureMonsterId);
      expect(started.session.monsterId).toBe(adventureMonsterId);
    }
    expect(sessions.createCount).toBe(1);
  });

  it("syncs passive resources before starting a new persistent fight", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, {
      xp: 25,
      hpCurrent: 1,
      manaCurrent: 1,
      hpRegenAt: new Date("2026-06-12T09:30:00.000Z"),
      manaRegenAt: new Date("2026-06-12T09:30:00.000Z")
    });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1])
    );

    const started = await service.getFightForTelegramUser(telegramUserId);

    expect(started.state).toBe("persistent-active");
    if (started.state === "persistent-active") {
      expect(started.session.state?.hero.hp).toBeGreaterThan(1);
      expect(started.session.state?.hero.mana).toBeGreaterThan(1);
    }
    expect(characters.resourceUpdateCount).toBe(1);
  });

  it("applies historical timed drink recovery when fight-start sync happens after expiry", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, {
      xp: 25,
      hpCurrent: 1,
      manaCurrent: 1,
      hpRegenAt: new Date("2026-06-12T10:29:00.000Z"),
      manaRegenAt: new Date("2026-06-12T10:29:00.000Z")
    });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const shynok: Pick<ShynokRepository, "getActiveDrinkForTelegramUser" | "getRecoveryDrinkForTelegramUser"> = {
      getActiveDrinkForTelegramUser: () => Promise.resolve(null),
      getRecoveryDrinkForTelegramUser: () =>
        Promise.resolve({
          id: "drink-state-expired-recovery",
          characterId: "character-42",
          remortCount: 0,
          drinkKey: "drink.fine-beer",
          phase: "timed",
          startedAt: new Date("2026-06-12T10:29:00.000Z"),
          expiresAt: new Date("2026-06-12T10:29:42.000Z"),
          sourceType: "self_purchase",
          sourceId: "order-expired-recovery",
          metadata: null
        })
    };
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1]),
      undefined,
      undefined,
      undefined,
      shynok
    );

    const started = await service.getFightForTelegramUser(telegramUserId);

    expect(started.state).toBe("persistent-active");
    if (started.state === "persistent-active") {
      expect(started.session.state?.hero.hp).toBe(5);
      expect(started.session.state?.drinkModifiers).toBeUndefined();
    }
    expect(characters.resourceUpdateCount).toBe(1);
  });

  it("does not start a new persistent fight at zero HP", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, {
      xp: 25,
      hpCurrent: 0,
      hpRegenAt: fixedClock()
    });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1])
    );

    const result = await service.getFightForTelegramUser(telegramUserId);

    expect(result.state).toBe("needs-rest");
    expect(sessions.createCount).toBe(0);
  });

  it("does not show a persistent fight overview as ready at zero HP", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, {
      xp: 25,
      hpCurrent: 0,
      hpRegenAt: fixedClock()
    });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1])
    );
    await service.issueNextProblemQuestForTelegramUser(telegramUserId);

    const overview = await service.getFightOverviewForTelegramUser(telegramUserId);

    expect(overview.state).toBe("needs-rest");
    expect(sessions.createCount).toBe(0);
  });

  it("prefers the closest available solo fight monster level for higher-level characters", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 225 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1])
    );

    const started = await service.getFightForTelegramUser(telegramUserId);

    expect(started.state).toBe("persistent-active");
    if (started.state === "persistent-active") {
      expect(started.character.level).toBe(8);
      expect(started.monster.level).toBeGreaterThanOrEqual(started.character.level - 2);
      expect(started.monster.level).toBeLessThanOrEqual(started.character.level);
      expect(started.monster.id).not.toBe("monster.mimic-shawarma");
    }
  });

  it("selects persistent fight monster levels by difficulty", () => {
    expect(
      selectPersistentFightMonsterLevel({
        characterLevel: 6,
        baseMonsterLevel: 5,
        difficulty: "easy"
      })
    ).toBe(1);
    expect(
      selectPersistentFightMonsterLevel({
        characterLevel: 6,
        baseMonsterLevel: 2,
        difficulty: "easy"
      })
    ).toBe(2);
    expect(
      selectPersistentFightMonsterLevel({
        characterLevel: 6,
        baseMonsterLevel: 5,
        difficulty: "normal"
      })
    ).toBe(5);
    expect(
      selectPersistentFightMonsterLevel({
        characterLevel: 6,
        baseMonsterLevel: 5,
        difficulty: "hard"
      })
    ).toBe(8);
    expect(
      selectPersistentFightMonsterLevel({
        characterLevel: 2,
        baseMonsterLevel: 3,
        difficulty: "easy"
      })
    ).toBe(1);
  });

  it("keeps difficulty reward scaling conservative", () => {
    expect(getPersistentFightDifficultyConfig("easy")).toMatchObject({
      levelDelta: -5,
      xpFactorRange: {
        min: 0.5,
        max: 0.75
      },
      monsterLevelRangeOffset: {
        min: -5,
        max: -3
      },
      dropChanceMultiplier: 0.65,
      lootPowerOffset: -1
    });
    expect(getPersistentFightDifficultyConfig("normal")).toMatchObject({
      dropChanceMultiplier: 1
    });
    expect(getPersistentFightDifficultyConfig("hard")).toMatchObject({
      levelDelta: 2,
      xpFactorRange: {
        min: 1.25,
        max: 1.5
      },
      dropChanceMultiplier: 1.35,
      lootPowerOffset: 1
    });
  });

  it("lets starter shawarma plus the combat probe reach level two after remort", async () => {
    const characters = new FakeCharacterRepository();
    const starterXp = buildStarterLevelTwoXpReward({ remortCount: 1 });
    characters.add(telegramUserId, { level: 1, xp: starterXp, remortCount: 1 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const service = new FightService(characters, dailyActions, fixedClock);

    const result = await service.completeMimicShawarma(telegramUserId, "flee");

    expect(result.state).toBe("completed");
    if (result.state === "completed") {
      expect(result.reward.xp).toBe(starterXp);
      expect(result.levelChange).toMatchObject({
        oldLevel: 1,
        newLevel: 2,
        leveledUp: true
      });
    }
    await expect(characters.findByTelegramUserId(telegramUserId)).resolves.toMatchObject({
      xp: starterXp * 2,
      level: 2,
      remortCount: 1
    });
  });

  it("interpolates gold-sensitive drop chance from zero-gold boost to configured difficulty endpoints", () => {
    const luck = 8;
    const level = 10;
    const easy = getPersistentFightDifficultyConfig("easy");
    const normal = getPersistentFightDifficultyConfig("normal");
    const hard = getPersistentFightDifficultyConfig("hard");

    expect(
      getGoldSensitiveItemDropChance({ gold: 0, characterLevel: level, luck, difficulty: easy })
    ).toBe(0.93);
    expect(
      getGoldSensitiveItemDropChance({ gold: 0, characterLevel: level, luck, difficulty: normal })
    ).toBe(0.93);
    expect(
      getGoldSensitiveItemDropChance({ gold: 0, characterLevel: level, luck, difficulty: hard })
    ).toBe(0.93);
    expect(
      getGoldSensitiveItemDropChance({
        gold: level,
        characterLevel: level,
        luck,
        difficulty: easy
      })
    ).toBeCloseTo(getItemDropChance(luck) * 0.65);
    expect(
      getGoldSensitiveItemDropChance({
        gold: level,
        characterLevel: level,
        luck,
        difficulty: normal
      })
    ).toBeCloseTo(getItemDropChance(luck));
    expect(
      getGoldSensitiveItemDropChance({
        gold: level,
        characterLevel: level,
        luck,
        difficulty: hard
      })
    ).toBeCloseTo(getItemDropChance(luck) * 1.35);
    expect(
      getGoldSensitiveItemDropChance({ gold: 5, characterLevel: level, luck, difficulty: normal })
    ).toBeGreaterThan(
      getGoldSensitiveItemDropChance({ gold: level, characterLevel: level, luck, difficulty: normal })
    );
    expect(
      getGoldSensitiveItemDropChance({ gold: 5, characterLevel: level, luck, difficulty: normal })
    ).toBeLessThan(0.93);
  });

  it("keeps hard XP floor tied to the center baseline for the same base monster", () => {
    expect(
      buildCenterBaselinePersistentFightWinXp({ characterLevel: 3, baseMonsterLevel: 3 })
    ).toBe(9);
    expect(buildHardPersistentFightWinXpFloor({ characterLevel: 3, baseMonsterLevel: 3 })).toBe(
      10
    );
    expect(
      buildCenterBaselinePersistentFightWinXp({ characterLevel: 13, baseMonsterLevel: 3 })
    ).toBe(2);
    expect(buildHardPersistentFightWinXpFloor({ characterLevel: 13, baseMonsterLevel: 3 })).toBe(
      3
    );
  });

  it("stores selected persistent fight difficulty in combat state", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 110 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1])
    );

    const started = await service.getOrStartPersistentFightForTelegramUser(telegramUserId, {
      difficulty: "easy"
    });

    expect(started.state).toBe("persistent-active");
    if (started.state === "persistent-active") {
      expect(started.character.level).toBe(6);
      expect(started.monster.level).toBeGreaterThanOrEqual(1);
      expect(started.monster.level).toBeLessThanOrEqual(3);
      expect(started.session.state?.monster.debugTrace).toMatchObject({
        interventionKind: "help",
        interventionSourceKey: "prypichnyk",
        baseMonsterLevel: started.session.state.monster.debugTrace?.baseMonsterLevel,
        effectiveMonsterLevel: started.monster.level
      });
    }
  });

  it("reuses a pending passage preview for the same passage before expiry", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 110 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const pending = new FakePendingPassageEncounterRepository(characters, sessions);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1, 0.9]),
      undefined,
      undefined,
      pending
    );

    const first = await service.previewPersistentFightForTelegramUser(telegramUserId, {
      difficulty: "normal",
      originLocationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_STRAIGHT
    });
    const second = await service.previewPersistentFightForTelegramUser(telegramUserId, {
      difficulty: "normal",
      originLocationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_STRAIGHT
    });

    expect(first.state).toBe("persistent-preview");
    expect(second.state).toBe("persistent-preview");
    if (first.state === "persistent-preview" && second.state === "persistent-preview") {
      expect(second.encounterToken).toBe(first.encounterToken);
      expect(second.monster.id).toBe(first.monster.id);
      expect(second.monster.level).toBe(first.monster.level);
      expect(first.expiresAt.getTime() - fixedClock().getTime()).toBe(PENDING_PASSAGE_ENCOUNTER_TTL_MS);
      expect(PENDING_PASSAGE_ENCOUNTER_TTL_MS).toBe(93 * 60 * 1000);
    }
    expect(pending.createCount).toBe(1);
  });

  it("rests the same passage after its pending monster is defeated", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 110 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const pending = new FakePendingPassageEncounterRepository(characters, sessions);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1, 0.9]),
      undefined,
      undefined,
      pending
    );

    const preview = await service.previewPersistentFightForTelegramUser(telegramUserId, {
      difficulty: "normal",
      originLocationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_STRAIGHT
    });
    if (preview.state !== "persistent-preview") {
      throw new Error("Expected passage preview");
    }

    const started = await service.attackPersistentPassageEncounterForTelegramUser(
      telegramUserId,
      preview.encounterToken
    );
    if (started.state !== "persistent-active" || !started.session.state) {
      throw new Error("Expected passage fight");
    }

    await sessions.updateById(started.session.id, {
      status: "won",
      state: markCombatSettlementCompleted({
        ...started.session.state,
        status: "won",
        completedAt: fixedClock().toISOString(),
        monster: {
          ...started.session.state.monster,
          hp: 0
        }
      }, fixedClock())
    });

    const reopened = await service.previewPersistentFightForTelegramUser(telegramUserId, {
      difficulty: "normal",
      originLocationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_STRAIGHT
    });

    const otherPassage = await service.previewPersistentFightForTelegramUser(telegramUserId, {
      difficulty: "hard",
      originLocationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT
    });

    expect(reopened.state).toBe("monster-rest");
    if (reopened.state === "monster-rest") {
      expect(reopened.availableAt.getTime()).toBe(fixedClock().getTime() + MONSTER_REST_COOLDOWN_MS);
    }
    expect(otherPassage.state).toBe("persistent-preview");
    if (otherPassage.state === "persistent-preview") {
      expect(otherPassage.originLocationId).toBe(PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT);
    }
    expect(pending.createCount).toBe(2);
  });

  it("refreshes a passage preview and rejects attack tokens after rules-version drift", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 110 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const pending = new FakePendingPassageEncounterRepository(characters, sessions);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1, 0.9, 0.2, 0.8]),
      undefined,
      undefined,
      pending
    );

    const first = await service.previewPersistentFightForTelegramUser(telegramUserId, {
      difficulty: "normal",
      originLocationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_STRAIGHT
    });
    if (first.state !== "persistent-preview") {
      throw new Error("Expected first preview");
    }
    pending.setRulesVersion(first.encounterToken, "nyz-passage-preview-old");

    const refreshed = await service.previewPersistentFightForTelegramUser(telegramUserId, {
      difficulty: "normal",
      originLocationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_STRAIGHT
    });
    const attackedOld = await service.attackPersistentPassageEncounterForTelegramUser(
      telegramUserId,
      first.encounterToken
    );

    expect(refreshed.state).toBe("persistent-preview");
    expect(attackedOld.state).toBe("persistent-preview");
    if (refreshed.state === "persistent-preview" && attackedOld.state === "persistent-preview") {
      expect(refreshed.encounterToken).not.toBe(first.encounterToken);
      expect(attackedOld.encounterToken).toBe(refreshed.encounterToken);
      expect(attackedOld.refreshed).toBe("stale");
    }
    expect(pending.createCount).toBe(2);
    expect(pending.consumeCount).toBe(0);
  });

  it("consumes the exact pending monster and frozen effective level", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { level: 12, xp: 52 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const pending = new FakePendingPassageEncounterRepository(characters, sessions);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1]),
      undefined,
      undefined,
      pending
    );

    const preview = await service.previewPersistentFightForTelegramUser(telegramUserId, {
      difficulty: "easy",
      originLocationId: "location.korchma.deep.level1.right"
    });

    expect(preview.state).toBe("persistent-preview");
    if (preview.state !== "persistent-preview") {
      throw new Error("Expected preview");
    }

    characters.patch(telegramUserId, { level: 23, xp: 50_000 });
    const started = await service.attackPersistentPassageEncounterForTelegramUser(
      telegramUserId,
      preview.encounterToken
    );

    expect(started.state).toBe("persistent-active");
    if (started.state === "persistent-active") {
      expect(started.monster.id).toBe(preview.monster.id);
      expect(started.monster.level).toBe(preview.monster.level);
      expect(started.session.state?.monster.debugTrace?.effectiveMonsterLevel).toBe(preview.monster.level);
    }
    expect(pending.consumeCount).toBe(1);
    expect(sessions.createCount).toBe(0);
  });

  it("keeps a wounded consumed passage monster recoverable until it heals", async () => {
    let now = fixedClock();
    const clock = () => now;
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { level: 12, xp: 52 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const pending = new FakePendingPassageEncounterRepository(characters, sessions);
    const service = new FightService(
      characters,
      dailyActions,
      clock,
      sessions,
      new FakeRandomSource([0.1, 0.2]),
      undefined,
      undefined,
      pending
    );
    const preview = await service.previewPersistentFightForTelegramUser(telegramUserId, {
      difficulty: "normal",
      originLocationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_STRAIGHT
    });
    if (preview.state !== "persistent-preview") {
      throw new Error("Expected preview");
    }
    const started = await service.attackPersistentPassageEncounterForTelegramUser(
      telegramUserId,
      preview.encounterToken
    );
    if (started.state !== "persistent-active" || !started.session.state) {
      throw new Error("Expected active fight");
    }
    const woundedHp = 4;
    const woundedState = {
      ...started.session.state,
      status: "lost" as const,
      completedAt: now.toISOString(),
      hero: {
        ...started.session.state.hero,
        hp: 0
      },
      monster: {
        ...started.session.state.monster,
        hp: woundedHp
      }
    };
    await sessions.updateById(started.session.id, { state: woundedState, status: "lost" });

    now = addSeconds(fixedClock(), PENDING_PASSAGE_MONSTER_FULL_REGEN_SECONDS / 2);
    const woundedPreview = await service.previewPersistentFightForTelegramUser(telegramUserId, {
      difficulty: "normal",
      originLocationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_STRAIGHT
    });

    expect(woundedPreview.state).toBe("persistent-preview");
    if (woundedPreview.state !== "persistent-preview") {
      throw new Error("Expected wounded preview");
    }
    expect(woundedPreview.encounterToken).toBe(preview.encounterToken);
    expect(woundedPreview.monster.id).toBe(preview.monster.id);
    expect(woundedPreview.monsterHp).toEqual({
      current: woundedHp + Math.floor(started.session.state.monster.hpMax / 2),
      max: started.session.state.monster.hpMax
    });

    const restarted = await service.attackPersistentPassageEncounterForTelegramUser(
      telegramUserId,
      woundedPreview.encounterToken
    );

    expect(restarted.state).toBe("persistent-active");
    if (restarted.state === "persistent-active") {
      expect(restarted.monster.id).toBe(preview.monster.id);
      expect(restarted.session.id).not.toBe(started.session.id);
      expect(restarted.session.state?.monster.hp).toBe(woundedPreview.monsterHp.current);
    }
  });

  it("keeps a full-health surviving passage monster recoverable before trail expiry", async () => {
    let now = fixedClock();
    const clock = () => now;
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { level: 12, xp: 52 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const pending = new FakePendingPassageEncounterRepository(characters, sessions);
    const service = new FightService(
      characters,
      dailyActions,
      clock,
      sessions,
      new FakeRandomSource([0.1, 0.2]),
      undefined,
      undefined,
      pending
    );
    const preview = await service.previewPersistentFightForTelegramUser(telegramUserId, {
      difficulty: "normal",
      originLocationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_STRAIGHT
    });
    if (preview.state !== "persistent-preview") {
      throw new Error("Expected preview");
    }
    const started = await service.attackPersistentPassageEncounterForTelegramUser(
      telegramUserId,
      preview.encounterToken
    );
    if (started.state !== "persistent-active" || !started.session.state) {
      throw new Error("Expected active fight");
    }
    const lostState = {
      ...started.session.state,
      status: "lost" as const,
      completedAt: now.toISOString(),
      hero: {
        ...started.session.state.hero,
        hp: 0
      },
      monster: {
        ...started.session.state.monster,
        hp: started.session.state.monster.hpMax
      }
    };
    await sessions.updateById(started.session.id, { state: lostState, status: "lost" });

    now = addSeconds(fixedClock(), 60);
    const survivorPreview = await service.previewPersistentFightForTelegramUser(telegramUserId, {
      difficulty: "normal",
      originLocationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_STRAIGHT
    });

    expect(survivorPreview.state).toBe("persistent-preview");
    if (survivorPreview.state !== "persistent-preview") {
      throw new Error("Expected full-health survivor preview");
    }
    expect(survivorPreview.encounterToken).toBe(preview.encounterToken);
    expect(survivorPreview.monster.id).toBe(preview.monster.id);
    expect(survivorPreview.monsterHp).toBeUndefined();

    const restarted = await service.attackPersistentPassageEncounterForTelegramUser(
      telegramUserId,
      survivorPreview.encounterToken
    );

    expect(restarted.state).toBe("persistent-active");
    if (restarted.state === "persistent-active") {
      expect(restarted.monster.id).toBe(preview.monster.id);
      expect(restarted.session.id).not.toBe(started.session.id);
      expect(restarted.session.state?.monster.hp).toBe(started.session.state.monster.hpMax);
    }
  });

  it("rerolls after the consumed passage trail expires", async () => {
    let now = fixedClock();
    const clock = () => now;
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { level: 12, xp: 52 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const pending = new FakePendingPassageEncounterRepository(characters, sessions);
    const service = new FightService(
      characters,
      dailyActions,
      clock,
      sessions,
      new FakeRandomSource([0.1, 0.2]),
      undefined,
      undefined,
      pending
    );
    const preview = await service.previewPersistentFightForTelegramUser(telegramUserId, {
      difficulty: "normal",
      originLocationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_STRAIGHT
    });
    if (preview.state !== "persistent-preview") {
      throw new Error("Expected preview");
    }
    const started = await service.attackPersistentPassageEncounterForTelegramUser(
      telegramUserId,
      preview.encounterToken
    );
    if (started.state !== "persistent-active" || !started.session.state) {
      throw new Error("Expected active fight");
    }
    const lostState = {
      ...started.session.state,
      status: "lost" as const,
      completedAt: now.toISOString(),
      hero: {
        ...started.session.state.hero,
        hp: 0
      },
      monster: {
        ...started.session.state.monster,
        hp: started.session.state.monster.hpMax
      }
    };
    await sessions.updateById(started.session.id, { state: lostState, status: "lost" });

    now = new Date(fixedClock().getTime() + PENDING_PASSAGE_ENCOUNTER_TTL_MS + 1);
    const freshPreview = await service.previewPersistentFightForTelegramUser(telegramUserId, {
      difficulty: "normal",
      originLocationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_STRAIGHT
    });

    expect(freshPreview.state).toBe("persistent-preview");
    if (freshPreview.state === "persistent-preview") {
      expect(freshPreview.encounterToken).not.toBe(preview.encounterToken);
    }
  });

  it("refreshes an expired pending passage instead of starting its stale token", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 110 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const pending = new FakePendingPassageEncounterRepository(characters, sessions);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1, 0.2]),
      undefined,
      undefined,
      pending
    );
    const preview = await service.previewPersistentFightForTelegramUser(telegramUserId, {
      difficulty: "normal",
      originLocationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_STRAIGHT
    });
    if (preview.state !== "persistent-preview") {
      throw new Error("Expected preview");
    }
    pending.expireToken(preview.encounterToken);

    const refreshed = await service.attackPersistentPassageEncounterForTelegramUser(telegramUserId, preview.encounterToken);

    expect(refreshed.state).toBe("persistent-preview");
    if (refreshed.state === "persistent-preview") {
      expect(refreshed.refreshed).toBe("expired");
      expect(refreshed.encounterToken).not.toBe(preview.encounterToken);
    }
    expect(sessions.createCount).toBe(0);
  });

  it("excludes recent ordinary monsters when the candidate pool can support it", () => {
    const candidates = [
      { id: "monster.a" },
      { id: "monster.b" },
      { id: "monster.c" },
      { id: "monster.d" }
    ].map((monster, index) => ({
      ...monster,
      name: monster.id,
      description: "",
      level: index + 1,
      tags: []
    }));

    expect(applyRecentOrdinaryMonsterExclusions(candidates, ["monster.a"]).map((monster) => monster.id)).not.toContain("monster.a");
    expect(
      applyRecentOrdinaryMonsterExclusions(candidates, ["monster.a", "monster.b", "monster.c"]).map((monster) => monster.id)
    ).toEqual(["monster.d"]);
    expect(applyRecentOrdinaryMonsterExclusions(candidates.slice(0, 1), ["monster.a"]).map((monster) => monster.id)).toEqual(["monster.a"]);
  });

  it("selects right-passage monsters three to five levels below when available", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { level: 12, xp: 52 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1])
    );

    const started = await service.getOrStartPersistentFightForTelegramUser(telegramUserId, {
      difficulty: "easy"
    });

    expect(started.state).toBe("persistent-active");
    if (started.state === "persistent-active") {
      expect(started.character.level).toBe(12);
      expect(started.monster.level).toBeGreaterThanOrEqual(7);
      expect(started.monster.level).toBeLessThanOrEqual(9);
      expect(started.session.state?.monster.debugTrace).toMatchObject({
        interventionKind: "help",
        effectiveMonsterLevel: started.monster.level
      });
    }
  });

  it("falls back to a clamped right-passage monster level when the lower band has no content", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { level: 29, xp: 130_000 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.99])
    );

    const started = await service.getOrStartPersistentFightForTelegramUser(telegramUserId, {
      difficulty: "easy"
    });

    expect(started.state).toBe("persistent-active");
    if (started.state === "persistent-active") {
      expect(started.character.level).toBe(29);
      expect(started.monster.level).toBe(24);
      expect(started.session.state?.monster.debugTrace).toMatchObject({
        interventionKind: "help",
        baseMonsterLevel: 23,
        effectiveMonsterLevel: 24
      });
    }
  });

  it("stores persistent fight origin location in combat state", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 110 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1])
    );

    const started = await service.getOrStartPersistentFightForTelegramUser(telegramUserId, {
      source: "adventure",
      originLocationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
      difficulty: "normal"
    });

    expect(started.state).toBe("persistent-active");
    if (started.state === "persistent-active") {
      expect(started.session.state?.source).toBe("adventure");
      expect(started.session.state?.originLocationId).toBe(PRESENCE_LOCATION_KORCHMA_QUEST_TABLE);
    }
  });

  it("defaults ordinary and Yeger persistent fight origins without caller input", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 110 });
    characters.add(99n, { xp: 110 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1])
    );

    const ordinary = await service.getOrStartPersistentFightForTelegramUser(telegramUserId, {
      difficulty: "normal"
    });
    const yeger = await service.getOrStartPersistentFightForTelegramUser(99n, {
      source: "yeger",
      target: { tagsAny: ["undead"] }
    });

    expect(ordinary.state).toBe("persistent-active");
    expect(yeger.state).toBe("persistent-active");
    if (ordinary.state === "persistent-active") {
      expect(ordinary.session.state?.originLocationId).toBe(PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_STRAIGHT);
    }
    if (yeger.state === "persistent-active") {
      expect(yeger.session.state?.originLocationId).toBe(PRESENCE_LOCATION_KORCHMA_RANGER_CORNER);
    }
  });

  it("does not replace an active persistent fight when another difficulty is clicked", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 110 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1])
    );

    const first = await service.getOrStartPersistentFightForTelegramUser(telegramUserId, {
      difficulty: "easy"
    });
    const second = await service.getOrStartPersistentFightForTelegramUser(telegramUserId, {
      difficulty: "hard"
    });

    expect(first.state).toBe("persistent-active");
    expect(second.state).toBe("persistent-active");
    if (first.state === "persistent-active" && second.state === "persistent-active") {
      expect(second.session.id).toBe(first.session.id);
      expect(second.monster.level).toBeGreaterThanOrEqual(1);
      expect(second.monster.level).toBeLessThanOrEqual(3);
      expect(second.session.state?.monster.debugTrace?.interventionKind).toBe("help");
    }
    expect(sessions.createCount).toBe(1);
  });

  it("returns the active lease winner when a persistent fight start races another create", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 110 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    sessions.activeSessionToReturnOnCreate = makeActivePersistentSession({
      id: "session-existing",
      characterId: "character-42",
      monsterId: "monster.deadline-spider"
    });
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.99])
    );

    const started = await service.getOrStartPersistentFightForTelegramUser(telegramUserId, {
      difficulty: "hard"
    });

    expect(started.state).toBe("persistent-active");
    if (started.state === "persistent-active") {
      expect(started.session.id).toBe("session-existing");
      expect(started.monster.id).toBe("monster.deadline-spider");
      expect(started.session.state?.monster.debugTrace?.interventionKind).toBe("help");
      expect(started.started).toBeUndefined();
    }
    expect(sessions.createCount).toBe(1);
  });

  it("uses live equipped weapon bonuses during persistent fight turns", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const equipment = new FakeEquipmentRepository({ characterId: "character-42", equipment: [] });
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1, 0.1, 0.9, 0.6, 0.1, 0.1, 0.9, 0.6]),
      equipment
    );

    const started = await service.getFightForTelegramUser(telegramUserId);
    expect(started.state).toBe("persistent-active");
    if (started.state !== "persistent-active") {
      return;
    }

    expect(started.session.state?.hero).toMatchObject({
      hp: 22,
      hpMax: 30,
      mana: 10,
      manaMax: 14
    });

    equipment.setSnapshot({
      characterId: "character-42",
      equipment: [buildEquipment({ slot: "weapon", itemId: "item.pan-of-persuasion" })]
    });

    const equippedTurn = await service.resolvePersistentFightTurn(telegramUserId, {
      sessionId: started.session.id,
      turn: 1,
      action: "attack"
    });

    expect(equippedTurn.state).toBe("updated");
    if (equippedTurn.state !== "updated") {
      return;
    }

    const withoutEquipment = new FakeCharacterRepository();
    withoutEquipment.add(telegramUserId, { xp: 25 });
    const withoutEquipmentSessions = new FakeSoloCombatSessionRepository(withoutEquipment);
    const withoutEquipmentService = new FightService(
      withoutEquipment,
      new FakeDailyActionRepository(withoutEquipment),
      fixedClock,
      withoutEquipmentSessions,
      new FakeRandomSource([0.1, 0.1, 0.9, 0.6]),
      new FakeEquipmentRepository({ characterId: "character-42", equipment: [] })
    );
    const baselineStarted = await withoutEquipmentService.getFightForTelegramUser(telegramUserId);
    expect(baselineStarted.state).toBe("persistent-active");
    if (baselineStarted.state !== "persistent-active") {
      return;
    }
    const baselineTurn = await withoutEquipmentService.resolvePersistentFightTurn(telegramUserId, {
      sessionId: baselineStarted.session.id,
      turn: 1,
      action: "attack"
    });

    expect(baselineTurn.state).toBe("updated");
    if (baselineTurn.state === "updated") {
      expect(equippedTurn.session.state?.lastTurn?.heroDamage).toBeGreaterThan(
        baselineTurn.session.state?.lastTurn?.heroDamage ?? 0
      );
      expect(equippedTurn.session.state?.lastTurn?.heroDamage).toBe(10);
      expect(baselineTurn.session.state?.lastTurn?.heroDamage).toBe(8);
    }
  });

  it("does not refill active fight resources when equipment changes mid-fight", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const equipment = new FakeEquipmentRepository({ characterId: "character-42", equipment: [] });
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1, 0.1, 0.9, 0.6]),
      equipment
    );
    const started = await service.getFightForTelegramUser(telegramUserId);
    expect(started.state).toBe("persistent-active");
    if (started.state !== "persistent-active") {
      return;
    }

    sessions.setHeroHp(started.session.id, 12);
    equipment.setSnapshot({
      characterId: "character-42",
      equipment: [buildEquipment({ slot: "chest", itemId: "item.apron-of-foam-resistance" })]
    });

    const turn = await service.resolvePersistentFightTurn(telegramUserId, {
      sessionId: started.session.id,
      turn: 1,
      action: "attack"
    });

    expect(turn.state).toBe("updated");
    if (turn.state === "updated") {
      expect(turn.character.equipmentEffects).toMatchObject({ hpMax: 2, armor: 1 });
      expect(turn.session.state?.hero.hpMax).toBe(30);
      expect(turn.session.state?.hero.hp).toBeLessThan(12);
    }
  });

  it("uses a one-use manatka as the current persistent fight action", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    sessions.combatItemStacks.set("item.responsible-panic-bandage", 1);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.99, 0.99, 0.99, 0.99])
    );
    const started = await service.getFightForTelegramUser(telegramUserId);
    expect(started.state).toBe("persistent-active");
    if (started.state !== "persistent-active") {
      return;
    }
    sessions.setHeroHp(started.session.id, 10);

    const result = await service.resolvePersistentFightItemTurn(telegramUserId, {
      sessionId: started.session.id,
      turn: 1,
      itemKey: getCombatItemUseKey("item.responsible-panic-bandage")
    });

    expect(result.state).toBe("updated");
    expect(sessions.consumedCombatItems).toEqual(["item.responsible-panic-bandage"]);
    expect(sessions.combatItemStacks.get("item.responsible-panic-bandage")).toBe(0);
    if (result.state === "updated") {
      expect(result.session.state?.turn).toBe(2);
      expect(result.session.state?.lastTurn).toMatchObject({
        action: "item",
        heroOutcome: "item-used",
        itemId: "item.responsible-panic-bandage",
        heroHealing: 7
      });
      expect(result.session.state?.turnLog?.at(-1)?.summary.action).toBe("item");
    }
  });

  it("expires an active persistent fight with a missing monster instead of returning a dead-end", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1])
    );
    const started = await service.getFightForTelegramUser(telegramUserId);
    expect(started.state).toBe("persistent-active");
    if (started.state !== "persistent-active") {
      return;
    }
    sessions.addSession({
      ...started.session,
      monsterId: "monster.deleted-by-the-archive"
    });

    const overview = await service.getFightOverviewForTelegramUser(telegramUserId);

    expect(overview.state).toBe("persistent-terminal");
    if (overview.state === "persistent-terminal") {
      expect(overview.monster).toBeNull();
      expect(overview.session.state?.status).toBe("expired");
      expect(overview.session.state?.settlement?.status).toBe("completed");
    }
    expect(sessions.updateCount).toBe(2);
    expect(dailyActions.createCount).toBe(0);
  });

  it("claims and replays one persistent fight reward on victory", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1, 0.1, 0.1, 0.1, 0.1, 0])
    );
    const started = await service.getFightForTelegramUser(telegramUserId);
    expect(started.state).toBe("persistent-active");
    if (started.state !== "persistent-active") {
      return;
    }
    sessions.setMonsterHp(started.session.id, 1);

    const result = await service.resolvePersistentFightTurn(telegramUserId, {
      sessionId: started.session.id,
      turn: 1,
      action: "attack"
    });

    expect(result.state).toBe("updated");
    if (result.state === "updated") {
      expect(result.session.status).toBe("won");
      expect(result.fightReward).toMatchObject({
        state: "claimed",
        reward: {
          localDate: started.session.id
        }
      });
      expect(typeof result.fightReward?.reward.xp).toBe("number");
      expect(typeof result.fightReward?.reward.gold).toBe("number");
      expect(
        result.fightReward?.reward.itemGrants.filter((grant) => grant.itemId !== BANDAGE_ITEM_ID)
          .length
      ).toBeLessThanOrEqual(1);
      expect(result.fightReward?.reward.itemGrants).toContainEqual({
        itemId: BANDAGE_ITEM_ID,
        name: "Бинт відповідальної паніки",
        quantity: 1
      });
      expect(result.questProgress).toMatchObject({
        wins: 1,
        target: 13,
        completed: false
      });
    }
    expect(sessions.updateCount).toBe(1);
    const rewardRecords = dailyActions.records.filter(
      (record) => record.key === PERSISTENT_SOLO_FIGHT_REWARD_KEY
    );
    expect(rewardRecords).toHaveLength(1);
    expect(rewardRecords[0]).toMatchObject({
      key: PERSISTENT_SOLO_FIGHT_REWARD_KEY,
      localDate: started.session.id
    });
    await expect(characters.findByTelegramUserId(telegramUserId)).resolves.toMatchObject({
      xp: 25 + (result.state === "updated" ? result.fightReward?.reward.xp ?? 0 : 0),
      gold: result.state === "updated" ? result.fightReward?.reward.gold ?? 0 : 0,
      hpCurrent: result.state === "updated" ? result.session.state?.hero.hp : undefined,
      manaCurrent: result.state === "updated" ? result.session.state?.hero.mana : undefined
    });
    expect(characters.resourceUpdateCount).toBeGreaterThan(0);
    expect(sessions.getById(started.session.id)?.state?.settlement?.resources).toMatchObject({
      status: "applied",
      appliedAt: "2026-06-12T10:30:00.000Z"
    });
    const resourceUpdateCountAfterClaim = characters.resourceUpdateCount;
    const characterAfterClaim = await characters.findByTelegramUserId(telegramUserId);

    const repeated = await service.resolvePersistentFightTurn(telegramUserId, {
      sessionId: started.session.id,
      turn: 1,
      action: "attack"
    });

    expect(repeated.state).toBe("terminal");
    if (result.state === "updated" && repeated.state === "terminal") {
      expect(repeated.fightReward).toMatchObject({
        state: "replayed",
        reward: {
          xp: result.fightReward?.reward.xp,
          gold: result.fightReward?.reward.gold,
          localDate: started.session.id,
          itemGrants: result.fightReward?.reward.itemGrants
        }
      });
    }
    expect(characters.resourceUpdateCount).toBe(resourceUpdateCountAfterClaim);
    await expect(characters.findByTelegramUserId(telegramUserId)).resolves.toMatchObject({
      hpRegenAt: characterAfterClaim?.hpRegenAt,
      manaRegenAt: characterAfterClaim?.manaRegenAt
    });
    expect(rewardRecords).toHaveLength(1);
  });

  it("claims a persistent fight reward when the final monster response drops the hero to zero", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1, 0.1, 0.1, 0.1, 0.1, 0])
    );
    const started = await service.getFightForTelegramUser(telegramUserId);
    expect(started.state).toBe("persistent-active");
    if (started.state !== "persistent-active") {
      return;
    }
    sessions.setHeroHp(started.session.id, 1);
    sessions.setMonsterHp(started.session.id, 1);

    const result = await service.resolvePersistentFightTurn(telegramUserId, {
      sessionId: started.session.id,
      turn: 1,
      action: "attack"
    });

    expect(result.state).toBe("updated");
    if (result.state === "updated") {
      expect(result.session.status).toBe("won");
      expect(result.session.state?.hero.hp).toBe(0);
      expect(result.fightReward?.state).toBe("claimed");
    }
    const rewardRecords = dailyActions.records.filter(
      (record) => record.key === PERSISTENT_SOLO_FIGHT_REWARD_KEY
    );
    expect(rewardRecords).toHaveLength(1);
  });

  it.each(["normal", "yeger", "adventure"] as const)(
    "uses shared variable-gold rewards for %s persistent fight sources",
    async (source) => {
      const characters = new FakeCharacterRepository();
      characters.add(telegramUserId, { xp: 25 });
      const dailyActions = new FakeDailyActionRepository(characters);
      const sessions = new FakeSoloCombatSessionRepository(characters);
      const baseSession = makeTerminalSession(
        "won",
        `session-shared-reward-${source}`,
        `character-${telegramUserId.toString()}`,
        source === "yeger" ? "monster.unclosed-closure-act" : "monster.deadline-spider"
      );
      const wonSession = sessions.addSession({
        ...baseSession,
        state: {
          ...baseSession.state!,
          source
        }
      });
      const service = new FightService(
        characters,
        dailyActions,
        fixedClock,
        sessions,
        new FakeRandomSource([0.5, 0.99, 0.1])
      );

      const recovered = await service.resolvePersistentFightTurn(telegramUserId, {
        sessionId: wonSession.id,
        turn: wonSession.turn,
        action: "attack"
      });
      const replayed = await service.resolvePersistentFightTurn(telegramUserId, {
        sessionId: wonSession.id,
        turn: wonSession.turn,
        action: "attack"
      });

      expect(recovered.state).toBe("terminal");
      expect(replayed.state).toBe("terminal");
      if (recovered.state !== "terminal" || replayed.state !== "terminal") {
        throw new Error("Expected terminal reward recovery.");
      }
      expect(recovered.fightReward?.reward.gold).toBeGreaterThanOrEqual(0);
      expect(recovered.fightReward?.reward.gold).toBeLessThanOrEqual(3);
      expect(replayed.fightReward).toMatchObject({
        state: "replayed",
        reward: {
          xp: recovered.fightReward?.reward.xp,
          gold: recovered.fightReward?.reward.gold,
          itemGrants: recovered.fightReward?.reward.itemGrants
        }
      });
      expect(dailyActions.records.filter((record) => record.key === PERSISTENT_SOLO_FIGHT_REWARD_KEY)).toHaveLength(1);
    }
  );

  it("compresses XP for a level-thirteen hero farming a genuinely weak base monster", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 1300 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1, 0.1, 0.1, 0.1, 0.1, 0])
    );
    const started = await service.getFightForTelegramUser(telegramUserId);
    expect(started.state).toBe("persistent-active");
    if (started.state !== "persistent-active") {
      return;
    }
    sessions.addSession({
      ...started.session,
      monsterId: "monster.deadline-spider",
      state: started.session.state
        ? {
            ...started.session.state,
            monster: {
              id: "monster.deadline-spider",
              hp: 1,
              hpMax: 18
            }
          }
        : started.session.state
    });

    const result = await service.resolvePersistentFightTurn(telegramUserId, {
      sessionId: started.session.id,
      turn: 1,
      action: "attack"
    });

    expect(result.state).toBe("updated");
    if (result.state === "updated") {
      expect(result.session.status).toBe("won");
      expect(result.character.level - result.monster.level).toBeGreaterThan(2);
      expect(result.fightReward?.reward.xp).toBe(2);
    }
    const rewardRecords = dailyActions.records.filter(
      (record) => record.key === PERSISTENT_SOLO_FIGHT_REWARD_KEY
    );
    expect(rewardRecords).toHaveLength(1);
    expect(rewardRecords[0]).toMatchObject({
      key: PERSISTENT_SOLO_FIGHT_REWARD_KEY,
      rewardXp: 2
    });
  });

  it("compresses XP for a level-six hero fighting a genuinely weak level-three base monster", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 110 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1, 0.1, 0.1, 0.1, 0.1, 0])
    );
    const started = await service.getFightForTelegramUser(telegramUserId);
    expect(started.state).toBe("persistent-active");
    if (started.state !== "persistent-active") {
      return;
    }
    sessions.addSession({
      ...started.session,
      monsterId: "monster.preapproval-dragonling",
      state: started.session.state
        ? {
            ...started.session.state,
            monster: {
              id: "monster.preapproval-dragonling",
              hp: 1,
              hpMax: 24
            }
          }
        : started.session.state
    });

    const result = await service.resolvePersistentFightTurn(telegramUserId, {
      sessionId: started.session.id,
      turn: 1,
      action: "attack"
    });

    expect(result.state).toBe("updated");
    if (result.state === "updated") {
      expect(result.session.status).toBe("won");
      expect(result.character.level).toBe(6);
      expect(result.monster.level).toBe(3);
      expect(result.fightReward?.reward.xp).toBe(3);
    }
  });

  it("does not treat an easy passage level reduction as weak-target farming", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 110 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1, 0.1, 0.1, 0.1, 0.1, 0])
    );
    const started = await service.getFightForTelegramUser(telegramUserId);
    expect(started.state).toBe("persistent-active");
    if (started.state !== "persistent-active") {
      return;
    }
    sessions.addSession({
      ...started.session,
      monsterId: "monster.salted-oath-pretzel",
      state: started.session.state
        ? {
            ...started.session.state,
            monster: {
              ...started.session.state.monster,
              id: "monster.salted-oath-pretzel",
              hp: 1,
              hpMax: 24,
              level: 1,
              debugTrace: {
                interventionKind: "help",
                interventionSourceKey: "prypichnyk",
                baseMonsterLevel: 6,
                effectiveMonsterLevel: 1
              }
            }
          }
        : started.session.state
    });

    const result = await service.resolvePersistentFightTurn(telegramUserId, {
      sessionId: started.session.id,
      turn: 1,
      action: "attack"
    });

    expect(result.state).toBe("updated");
    if (result.state === "updated") {
      expect(result.character.level).toBe(6);
      expect(result.monster.level).toBe(1);
      expect(result.fightReward?.reward.xp).toBe(3);
    }
  });

  it("uses level-factor XP and variable gold for side passages", async () => {
    async function recoverReward(
      difficulty: "easy" | "normal" | "hard",
      effectiveMonsterLevel: number
    ): Promise<{ xp: number; gold: number }> {
      const characters = new FakeCharacterRepository();
      characters.add(telegramUserId, { xp: 1300 });
      const dailyActions = new FakeDailyActionRepository(characters);
      const sessions = new FakeSoloCombatSessionRepository(characters);
      const baseSession = makeTerminalSession(
        "won",
        `session-rounding-${difficulty}`,
        `character-${telegramUserId.toString()}`,
        "monster.salted-oath-pretzel"
      );
      const interventionKind =
        difficulty === "easy" ? "help" : difficulty === "hard" ? "hinder" : "none";
      const wonSession = sessions.addSession({
        ...baseSession,
        state: baseSession.state
          ? {
              ...baseSession.state,
              monster: {
                ...baseSession.state.monster,
                level: effectiveMonsterLevel,
                debugTrace: {
                  interventionKind,
                  interventionSourceKey: "prypichnyk",
                  baseMonsterLevel: 13,
                  effectiveMonsterLevel
                }
              }
            }
          : baseSession.state
      });
      const service = new FightService(
        characters,
        dailyActions,
        fixedClock,
        sessions,
        new FakeRandomSource([0.99])
      );

      const recovered = await service.resolvePersistentFightTurn(telegramUserId, {
        sessionId: wonSession.id,
        turn: wonSession.turn,
        action: "attack"
      });

      expect(recovered.state).toBe("terminal");
      if (recovered.state !== "terminal") {
        throw new Error("Expected terminal reward recovery.");
      }

      return {
        xp: recovered.fightReward?.reward.xp ?? 0,
        gold: recovered.fightReward?.reward.gold ?? 0
      };
    }

    const easy = await recoverReward("easy", 8);
    const normal = await recoverReward("normal", 13);
    const hard = await recoverReward("hard", 15);

    expect(easy.xp).toBe(9);
    expect(normal.xp).toBe(14);
    expect(hard.xp).toBe(20);
    expect(hard.xp).toBeGreaterThan(normal.xp);
    expect(normal.xp).toBeGreaterThan(easy.xp);
    expect(easy.gold).toBeGreaterThanOrEqual(0);
    expect(easy.gold).toBeLessThanOrEqual(13);
    expect(normal.gold).toBeGreaterThanOrEqual(0);
    expect(normal.gold).toBeLessThanOrEqual(13);
    expect(hard.gold).toBeGreaterThanOrEqual(0);
    expect(hard.gold).toBeLessThanOrEqual(13);
  });

  it("uses the center baseline as hard XP floor instead of the hard effective monster level", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const baseSession = makeTerminalSession(
      "won",
      "session-hard-low-level-floor",
      `character-${telegramUserId.toString()}`,
      "monster.preapproval-dragonling"
    );
    const wonSession = sessions.addSession({
      ...baseSession,
      state: {
        ...baseSession.state!,
        monster: {
          ...baseSession.state!.monster,
          level: 5,
          debugTrace: {
            interventionKind: "hinder",
            interventionSourceKey: "prypichnyk",
            baseMonsterLevel: 3,
            effectiveMonsterLevel: 5
          }
        }
      }
    });
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.5, 0.99, 0])
    );

    const recovered = await service.resolvePersistentFightTurn(telegramUserId, {
      sessionId: wonSession.id,
      turn: wonSession.turn,
      action: "attack"
    });

    expect(recovered.state).toBe("terminal");
    if (recovered.state !== "terminal") {
      throw new Error("Expected terminal reward recovery.");
    }
    expect(recovered.fightReward?.reward.xp).toBe(10);
  });

  it("lets the hard XP range exceed the center-baseline floor at higher levels", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 1300 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const baseSession = makeTerminalSession(
      "won",
      "session-hard-range-wins",
      `character-${telegramUserId.toString()}`,
      "monster.salted-oath-pretzel"
    );
    const wonSession = sessions.addSession({
      ...baseSession,
      state: {
        ...baseSession.state!,
        monster: {
          ...baseSession.state!.monster,
          level: 15,
          debugTrace: {
            interventionKind: "hinder",
            interventionSourceKey: "prypichnyk",
            baseMonsterLevel: 13,
            effectiveMonsterLevel: 15
          }
        }
      }
    });
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.5, 0.99, 0.99])
    );

    const recovered = await service.resolvePersistentFightTurn(telegramUserId, {
      sessionId: wonSession.id,
      turn: wonSession.turn,
      action: "attack"
    });

    expect(recovered.state).toBe("terminal");
    if (recovered.state !== "terminal") {
      throw new Error("Expected terminal reward recovery.");
    }
    expect(buildHardPersistentFightWinXpFloor({ characterLevel: 13, baseMonsterLevel: 13 })).toBe(
      15
    );
    expect(recovered.fightReward?.reward.xp).toBe(20);
  });

  it("raises item drop chance when variable fight gold rolls zero", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 1300 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const wonSession = sessions.addSession(
      makeTerminalSession(
        "won",
        "session-zero-gold-drop-boost",
        `character-${telegramUserId.toString()}`,
        "monster.salted-oath-pretzel"
      )
    );
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0, 0.92, 0, 0])
    );

    const recovered = await service.resolvePersistentFightTurn(telegramUserId, {
      sessionId: wonSession.id,
      turn: wonSession.turn,
      action: "attack"
    });

    expect(recovered.state).toBe("terminal");
    if (recovered.state !== "terminal") {
      throw new Error("Expected terminal reward recovery.");
    }

    expect(recovered.fightReward?.reward.gold).toBe(0);
    expect(
      recovered.fightReward?.reward.itemGrants.filter((grant) => grant.itemId !== BANDAGE_ITEM_ID)
    ).toHaveLength(1);
    expect(recovered.fightReward?.reward.itemGrants).toContainEqual({
      itemId: BANDAGE_ITEM_ID,
      name: "Бинт відповідальної паніки",
      quantity: 1
    });

    const replayed = await service.resolvePersistentFightTurn(telegramUserId, {
      sessionId: wonSession.id,
      turn: wonSession.turn,
      action: "attack"
    });

    expect(replayed.state).toBe("terminal");
    if (replayed.state !== "terminal") {
      throw new Error("Expected terminal reward replay.");
    }

    expect(replayed.fightReward?.reward.gold).toBe(0);
    expect(replayed.fightReward?.reward.itemGrants).toEqual(
      recovered.fightReward?.reward.itemGrants
    );
  });

  it("does not drop at the zero-gold threshold boundary", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 1300 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const wonSession = sessions.addSession(
      makeTerminalSession(
        "won",
        "session-zero-gold-drop-threshold",
        `character-${telegramUserId.toString()}`,
        "monster.salted-oath-pretzel"
      )
    );
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0, 0.93, 0])
    );

    const recovered = await service.resolvePersistentFightTurn(telegramUserId, {
      sessionId: wonSession.id,
      turn: wonSession.turn,
      action: "attack"
    });

    expect(recovered.state).toBe("terminal");
    if (recovered.state !== "terminal") {
      throw new Error("Expected terminal reward recovery.");
    }
    expect(recovered.fightReward?.reward.gold).toBe(0);
    expect(
      recovered.fightReward?.reward.itemGrants.filter((grant) => grant.itemId !== BANDAGE_ITEM_ID)
    ).toEqual([]);
    expect(recovered.fightReward?.reward.itemGrants).toContainEqual({
      itemId: BANDAGE_ITEM_ID,
      name: "Бинт відповідальної паніки",
      quantity: 1
    });
  });

  it("scales recovered persistent fight rewards by stored difficulty", async () => {
    async function recoverReward(
      difficulty: "easy" | "normal" | "hard",
      effectiveMonsterLevel: number
    ): Promise<{ xp: number; gold: number; replayXp: number; replayGold: number }> {
      const characters = new FakeCharacterRepository();
      characters.add(telegramUserId, { xp: 110 });
      const dailyActions = new FakeDailyActionRepository(characters);
      const sessions = new FakeSoloCombatSessionRepository(characters);
      const baseSession = makeTerminalSession(
        "won",
        `session-${difficulty}`,
        `character-${telegramUserId.toString()}`,
        "monster.salted-oath-pretzel"
      );
      const interventionKind =
        difficulty === "easy" ? "help" : difficulty === "hard" ? "hinder" : "none";
      const wonSession = sessions.addSession({
        ...baseSession,
        state: baseSession.state
          ? {
              ...baseSession.state,
              monster: {
                ...baseSession.state.monster,
                level: effectiveMonsterLevel,
                debugTrace: {
                  interventionKind,
                  interventionSourceKey: "prypichnyk",
                  baseMonsterLevel: 6,
                  effectiveMonsterLevel
                }
              }
            }
          : baseSession.state
      });
      const service = new FightService(
        characters,
        dailyActions,
        fixedClock,
        sessions,
        new FakeRandomSource([0.99])
      );

      const recovered = await service.resolvePersistentFightTurn(telegramUserId, {
        sessionId: wonSession.id,
        turn: wonSession.turn,
        action: "attack"
      });
      const replayed = await service.resolvePersistentFightTurn(telegramUserId, {
        sessionId: wonSession.id,
        turn: wonSession.turn,
        action: "attack"
      });

      expect(recovered.state).toBe("terminal");
      expect(replayed.state).toBe("terminal");
      if (recovered.state !== "terminal" || replayed.state !== "terminal") {
        throw new Error("Expected terminal reward recovery.");
      }

      return {
        xp: recovered.fightReward?.reward.xp ?? 0,
        gold: recovered.fightReward?.reward.gold ?? 0,
        replayXp: replayed.fightReward?.reward.xp ?? 0,
        replayGold: replayed.fightReward?.reward.gold ?? 0
      };
    }

    const easy = await recoverReward("easy", 1);
    const normal = await recoverReward("normal", 6);
    const hard = await recoverReward("hard", 8);

    expect(easy.xp).toBeLessThan(normal.xp);
    expect(normal.xp).toBeLessThan(hard.xp);
    expect(easy.gold).toBeGreaterThanOrEqual(0);
    expect(easy.gold).toBeLessThanOrEqual(6);
    expect(normal.gold).toBeGreaterThanOrEqual(0);
    expect(normal.gold).toBeLessThanOrEqual(6);
    expect(hard.gold).toBeGreaterThanOrEqual(0);
    expect(hard.gold).toBeLessThanOrEqual(6);
    expect(easy.replayXp).toBe(easy.xp);
    expect(easy.replayGold).toBe(easy.gold);
    expect(normal.replayXp).toBe(normal.xp);
    expect(normal.replayGold).toBe(normal.gold);
    expect(hard.replayXp).toBe(hard.xp);
    expect(hard.replayGold).toBe(hard.gold);
  });

  it("falls back to authored monster level when legacy reward recovery lacks base trace", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 70 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const legacySession = makeTerminalSession(
      "won",
      "session-legacy-no-base-level",
      `character-${telegramUserId.toString()}`,
      "monster.preapproval-dragonling"
    );
    const wonSession = sessions.addSession({
      ...legacySession,
      state: {
        ...legacySession.state,
        monster: {
          id: "monster.preapproval-dragonling",
          hp: 0,
          hpMax: 18,
          level: 1,
          debugTrace: {
            interventionKind: "help",
            interventionSourceKey: "prypichnyk",
            effectiveMonsterLevel: 1
          }
        }
      }
    });
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1, 0.1, 0])
    );

    const recovered = await service.resolvePersistentFightTurn(telegramUserId, {
      sessionId: wonSession.id,
      turn: wonSession.turn,
      action: "attack"
    });

    expect(recovered.state).toBe("terminal");
    if (recovered.state === "terminal") {
      expect(recovered.fightReward?.reward.xp).toBe(2);
    }
  });

  it("falls back to the authoritative reward claim when session replay storage is missing", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    sessions.dropRewardReplayWrites();
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1, 0.1, 0.1, 0.1, 0.1, 0])
    );
    const started = await service.getFightForTelegramUser(telegramUserId);
    expect(started.state).toBe("persistent-active");
    if (started.state !== "persistent-active") {
      return;
    }
    sessions.setMonsterHp(started.session.id, 1);

    const result = await service.resolvePersistentFightTurn(telegramUserId, {
      sessionId: started.session.id,
      turn: 1,
      action: "attack"
    });

    expect(result.state).toBe("updated");
    const rewardRecords = dailyActions.records.filter(
      (record) => record.key === PERSISTENT_SOLO_FIGHT_REWARD_KEY
    );
    expect(rewardRecords).toHaveLength(1);
    expect(sessions.getById(started.session.id)?.reward).toBeNull();
    const action = rewardRecords[0];

    const repeated = await service.resolvePersistentFightTurn(telegramUserId, {
      sessionId: started.session.id,
      turn: 1,
      action: "attack"
    });

    expect(repeated.state).toBe("terminal");
    if (repeated.state === "terminal") {
      expect(repeated.fightReward).toEqual({
        state: "already-claimed",
        reward: {
          xp: action?.rewardXp,
          gold: action?.rewardGold,
          localDate: started.session.id,
          itemGrants: []
        },
        levelChange: null,
        itemReplayUnavailable: true
      });
    }
    expect(rewardRecords).toHaveLength(1);
  });

  it("recovers an unclaimed reward for a terminal won session", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const wonSession = sessions.addSession(
      makeTerminalSession("won", "session-won-without-reward", `character-${telegramUserId.toString()}`)
    );
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1, 0.1, 0])
    );

    const recovered = await service.resolvePersistentFightTurn(telegramUserId, {
      sessionId: wonSession.id,
      turn: wonSession.turn,
      action: "attack"
    });

    expect(recovered.state).toBe("terminal");
    if (recovered.state === "terminal") {
      expect(recovered.fightReward).toMatchObject({
        state: "claimed",
        reward: {
          localDate: wonSession.id
        }
      });
      expect(typeof recovered.fightReward?.reward.xp).toBe("number");
      expect(typeof recovered.fightReward?.reward.gold).toBe("number");
    }
    const rewardRecords = dailyActions.records.filter(
      (record) => record.key === PERSISTENT_SOLO_FIGHT_REWARD_KEY
    );
    expect(rewardRecords).toHaveLength(1);
    expect(sessions.getById(wonSession.id)?.reward).not.toBeNull();

    const repeated = await service.resolvePersistentFightTurn(telegramUserId, {
      sessionId: wonSession.id,
      turn: wonSession.turn,
      action: "attack"
    });

    expect(repeated.state).toBe("terminal");
    if (recovered.state === "terminal" && repeated.state === "terminal") {
      expect(repeated.fightReward).toMatchObject({
        state: "replayed",
        reward: {
          xp: recovered.fightReward?.reward.xp,
          gold: recovered.fightReward?.reward.gold,
          localDate: wonSession.id,
          itemGrants: recovered.fightReward?.reward.itemGrants
        }
      });
    }
    expect(rewardRecords).toHaveLength(1);
  });

  it("completes a pending won settlement immediately after the resource version handoff", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25, hpCurrent: 24, manaCurrent: 12 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const wonSession = makeTerminalSession(
      "won",
      "session-won-pending-settlement",
      `character-${telegramUserId.toString()}`
    );
    wonSession.state = wonSession.state
      ? {
          ...wonSession.state,
          life: { remortCount: 0 },
          settlement: { status: "pending", version: 1 }
        }
      : wonSession.state;
    sessions.addSession(wonSession);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1, 0.1, 0])
    );

    const recovered = await service.resolvePersistentFightTurn(telegramUserId, {
      sessionId: wonSession.id,
      turn: wonSession.turn,
      action: "attack"
    });

    expect(recovered.state).toBe("terminal");
    if (recovered.state === "terminal") {
      expect(recovered.fightReward).toMatchObject({
        state: "claimed",
        reward: {
          localDate: wonSession.id
        }
      });
    }
    const stored = sessions.getById(wonSession.id);
    expect(stored?.state?.settlement?.status).toBe("completed");
    expect(stored?.state?.settlement?.version).toBe(3);
    expect(stored?.state?.settlement?.resources?.status).toBe("applied");
    expect(stored?.reward).not.toBeNull();
  });

  it("counts a won persistent fight toward thirteen small problems", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1, 0.1, 0.1])
    );
    const started = await service.getFightForTelegramUser(telegramUserId);
    expect(started.state).toBe("persistent-active");
    if (started.state !== "persistent-active") {
      return;
    }
    sessions.setMonsterHp(started.session.id, 1);

    const result = await service.resolvePersistentFightTurn(telegramUserId, {
      sessionId: started.session.id,
      turn: 1,
      action: "attack"
    });

    expect(result.state).toBe("updated");
    if (result.state === "updated") {
      expect(result.session.status).toBe("won");
      expect(result.questProgress).toMatchObject({
        wins: 1,
        target: 13,
        completed: false
      });
    }
    expect(dailyActions.createCount).toBe(1);
  });

  it("grants one XP consolation for a lost persistent fight without moving quest progress", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25, hpCurrent: 10 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1, 0.99, 0.1, 0.99])
    );
    const started = await service.getFightForTelegramUser(telegramUserId);
    expect(started.state).toBe("persistent-active");
    if (started.state !== "persistent-active") {
      return;
    }
    sessions.setHeroHp(started.session.id, 1);
    sessions.setMonsterHp(started.session.id, 999);
    sessions.clearMonsterRuntime(started.session.id);

    const result = await service.resolvePersistentFightTurn(telegramUserId, {
      sessionId: started.session.id,
      turn: 1,
      action: "attack"
    });

    expect(result.state).toBe("updated");
    if (result.state === "updated") {
      expect(result.session.status).toBe("lost");
      expect(result.fightReward).toMatchObject({
        state: "claimed",
        reward: {
          xp: 1,
          gold: 0,
          localDate: started.session.id,
          itemGrants: []
        }
      });
      expect(result.questProgress).toMatchObject({ wins: 0 });
    }
    const rewardRecords = dailyActions.records.filter(
      (record) => record.key === PERSISTENT_SOLO_FIGHT_REWARD_KEY
    );
    expect(rewardRecords).toHaveLength(1);
    expect(rewardRecords[0]).toMatchObject({
      key: PERSISTENT_SOLO_FIGHT_REWARD_KEY,
      localDate: started.session.id,
      rewardXp: 1,
      rewardGold: 0
    });
    expect(dailyActions.grantedItems).toEqual([]);
    await expect(characters.findByTelegramUserId(telegramUserId)).resolves.toMatchObject({
      xp: 26,
      gold: 0
    });

    const repeated = await service.resolvePersistentFightTurn(telegramUserId, {
      sessionId: started.session.id,
      turn: 1,
      action: "attack"
    });

    expect(repeated.state).toBe("terminal");
    if (repeated.state === "terminal") {
      expect(repeated.fightReward).toMatchObject({
        state: "replayed",
        reward: {
          xp: 1,
          gold: 0,
          localDate: started.session.id,
          itemGrants: []
        }
      });
    }
    expect(rewardRecords).toHaveLength(1);
  });

  it("grants half XP for defeated enemies when a multi-enemy persistent fight is lost", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 110, hpCurrent: 1 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1, 0.9, 0.2, 0.1, 0.9, 0.2])
    );

    for (const [index, completedAt] of [
      new Date("2026-06-12T10:29:40.000Z"),
      new Date("2026-06-12T10:29:41.000Z"),
      new Date("2026-06-12T10:29:42.000Z")
    ].entries()) {
      sessions.addSession(makeEligibleOrdinaryThreatSession("won", `ordinary-threat-partial-loss-${index + 1}`, {
        completedAt
      }));
    }

    const started = await service.getFightForTelegramUser(telegramUserId);
    expect(started.state).toBe("persistent-active");
    if (started.state !== "persistent-active") {
      return;
    }

    const postPrimaryDeath = moveSessionToPostPrimaryDeath(sessions, started.session.id);
    const defeatedEnemy = postPrimaryDeath.enemies?.find((enemy) => enemy.hp <= 0);
    const livingEnemy = postPrimaryDeath.enemies?.find((enemy) => enemy.hp > 0);
    expect(defeatedEnemy).toBeDefined();
    expect(livingEnemy).toBeDefined();
    if (!defeatedEnemy || !livingEnemy) {
      return;
    }
    livingEnemy.hp = 999;
    livingEnemy.hpMax = 999;
    postPrimaryDeath.monster = {
      ...postPrimaryDeath.monster,
      hp: 999,
      hpMax: 999
    };
    postPrimaryDeath.hero = {
      ...postPrimaryDeath.hero,
      hp: 1
    };
    const defeatedContent = monsters.find((monster) => monster.id === defeatedEnemy.id);
    const defeatedLevel = defeatedEnemy.level ?? defeatedContent?.level ?? 1;
    const expectedPartialXp = Math.ceil(
      buildCenterBaselinePersistentFightWinXp({
        characterLevel: 6,
        baseMonsterLevel: defeatedLevel
      }) * 0.5
    );
    await sessions.updateById(started.session.id, {
      status: "active",
      state: postPrimaryDeath
    });

    const result = await service.resolvePersistentFightTurn(telegramUserId, {
      sessionId: started.session.id,
      turn: 2,
      action: "attack"
    });

    expect(result.state).toBe("updated");
    if (result.state === "updated") {
      expect(result.session.status).toBe("lost");
      expect(result.fightReward).toMatchObject({
        state: "claimed",
        reward: {
          xp: expectedPartialXp,
          gold: 0,
          localDate: started.session.id,
          itemGrants: []
        }
      });
      expect(result.fightReward?.reward.xp).toBeGreaterThan(1);
      expect(result.questProgress).toMatchObject({ wins: 3, completed: false });
    }
    const rewardRecords = dailyActions.records.filter(
      (record) => record.key === PERSISTENT_SOLO_FIGHT_REWARD_KEY
    );
    expect(rewardRecords).toHaveLength(1);
    expect(rewardRecords[0]).toMatchObject({
      key: PERSISTENT_SOLO_FIGHT_REWARD_KEY,
      localDate: started.session.id,
      rewardXp: expectedPartialXp,
      rewardGold: 0
    });
    expect(dailyActions.grantedItems).toEqual([]);

    const repeated = await service.resolvePersistentFightTurn(telegramUserId, {
      sessionId: started.session.id,
      turn: 2,
      action: "attack"
    });

    expect(repeated.state).toBe("terminal");
    if (repeated.state === "terminal") {
      expect(repeated.fightReward).toMatchObject({
        state: "replayed",
        reward: {
          xp: expectedPartialXp,
          gold: 0,
          localDate: started.session.id,
          itemGrants: []
        }
      });
    }
  });

  it("does not grant persistent fight rewards for flee or expired sessions", async () => {
    const fledCharacters = new FakeCharacterRepository();
    fledCharacters.add(telegramUserId, { xp: 25 });
    const fledDailyActions = new FakeDailyActionRepository(fledCharacters);
    const fledSessions = new FakeSoloCombatSessionRepository(fledCharacters);
    const fledService = new FightService(
      fledCharacters,
      fledDailyActions,
      fixedClock,
      fledSessions,
      new FakeRandomSource([0.1, 0.01])
    );
    const started = await fledService.getFightForTelegramUser(telegramUserId);
    expect(started.state).toBe("persistent-active");
    if (started.state !== "persistent-active") {
      return;
    }

    const fled = await fledService.resolvePersistentFightTurn(telegramUserId, {
      sessionId: started.session.id,
      turn: 1,
      action: "flee"
    });

    expect(fled.state).toBe("updated");
    if (fled.state === "updated") {
      expect(fled.session.status).toBe("fled");
      expect(fled.fightReward).toBeNull();
    }
    expect(fledDailyActions.createCount).toBe(0);

    const expiredCharacters = new FakeCharacterRepository();
    expiredCharacters.add(telegramUserId, { xp: 25 });
    const expiredDailyActions = new FakeDailyActionRepository(expiredCharacters);
    const expiredSessions = new FakeSoloCombatSessionRepository(expiredCharacters);
    const expiredService = new FightService(
      expiredCharacters,
      expiredDailyActions,
      fixedClock,
      expiredSessions,
      new FakeRandomSource([0.1])
    );
    const expiredStarted = await expiredService.getFightForTelegramUser(telegramUserId);
    expect(expiredStarted.state).toBe("persistent-active");
    if (expiredStarted.state !== "persistent-active") {
      return;
    }
    expiredSessions.setExpiresAt(expiredStarted.session.id, new Date("2026-06-12T10:00:00.000Z"));

    const expired = await expiredService.resolvePersistentFightTurn(telegramUserId, {
      sessionId: expiredStarted.session.id,
      turn: 1,
      action: "attack"
    });

    expect(expired.state).toBe("terminal");
    if (expired.state === "terminal") {
      expect(expired.session.state?.status).toBe("expired");
      expect(expired.fightReward).toBeNull();
      expect(expired.session.state?.turnLog).toHaveLength(1);
      expect(expired.session.state?.turnLog?.[0]).toMatchObject({
        eventId: "terminal:expired",
        turn: 1,
        summary: expired.session.state.lastTurn
      });
    }
    expect(expiredDailyActions.createCount).toBe(0);
  });

  it("does not count lost, fled, or expired persistent fights toward the quest", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    sessions.addSession(makeTerminalSession("lost"));
    sessions.addSession(makeTerminalSession("fled", "session-fled"));
    sessions.addSession(makeTerminalSession("expired", "session-expired"));
    const service = new FightService(characters, dailyActions, fixedClock, sessions);

    const overview = await service.getFightOverviewForTelegramUser(telegramUserId);

    expect(overview).toMatchObject({
      state: "persistent-ready",
      questProgress: {
        wins: 0,
        completed: false
      }
    });
  });

  it("keeps ordinary fights at one enemy before three eligible wins", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1, 0.1])
    );

    await service.issueNextProblemQuestForTelegramUser(telegramUserId);

    for (const index of [1, 2]) {
      sessions.addSession(makeEligibleOrdinaryThreatSession("won", `ordinary-threat-base-${index}`, {
        completedAt: new Date(`2026-06-12T10:29:4${index}.000Z`)
      }));
    }

    const started = await service.getFightForTelegramUser(telegramUserId);

    expect(started.state).toBe("persistent-active");
    if (started.state === "persistent-active") {
      expect(normalizeCombatEnemies(started.session.state!)).toHaveLength(1);
      expect(started.session.state?.threat).toBeUndefined();
    }
  });

  it("starts exactly two enemies after three eligible ordinary one-enemy wins", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1, 0.9, 0.2])
    );

    await service.issueNextProblemQuestForTelegramUser(telegramUserId);

    for (const [index, completedAt] of [
      new Date("2026-06-12T10:29:40.000Z"),
      new Date("2026-06-12T10:29:41.000Z"),
      new Date("2026-06-12T10:29:42.000Z")
    ].entries()) {
      sessions.addSession(makeEligibleOrdinaryThreatSession("won", `ordinary-threat-escalate-${index + 1}`, {
        completedAt
      }));
    }

    const started = await service.getFightForTelegramUser(telegramUserId);

    expect(started.state).toBe("persistent-active");
    if (started.state === "persistent-active") {
      expect(normalizeCombatEnemies(started.session.state!)).toHaveLength(2);
      expect(started.session.state?.threat).toMatchObject({
        version: 1,
        enemyCount: 2,
        reason: "ordinary-win-streak",
        eligibleWins: 3,
        lineVersion: "threat-escalation-v1"
      });
      expect(started.session.state?.threat?.lineId).toEqual(expect.any(String));
    }
  });

  it("continues with two enemies and boosts the second enemy after a previous escalated two-enemy win", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 110 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1, 0.9, 0.2])
    );

    await service.issueNextProblemQuestForTelegramUser(telegramUserId);

    sessions.addSession(makeEligibleOrdinaryThreatSession("won", "ordinary-threat-repeat-checkpoint", {
      completedAt: new Date("2026-06-12T10:29:39.000Z"),
      escalated: true
    }));

    const started = await service.getFightForTelegramUser(telegramUserId);

    expect(started.state).toBe("persistent-active");
    if (started.state === "persistent-active") {
      const enemies = normalizeCombatEnemies(started.session.state!);
      const secondEnemy = enemies[1];
      const baseSecondEnemy = monsters.find((monster) => monster.id === secondEnemy?.id);

      expect(secondEnemy).toBeDefined();
      expect(baseSecondEnemy).toBeDefined();
      expect(secondEnemy?.level).toBe((baseSecondEnemy?.level ?? 0) + 2);
      expect(started.session.state?.threat?.pressure).toMatchObject({
        version: 1,
        consecutiveWonEscalatedFights: 1,
        requestedSecondEnemyLevelBonus: 2,
        appliedSecondEnemyLevelBonus: 2,
        boostedEnemyId: secondEnemy?.enemyId,
        boostedEnemyEffectiveLevel: secondEnemy?.level,
        levelCap: 23
      });
    }
  });

  it("stacks the second enemy level boost across consecutive won two-enemy fights", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 110 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1, 0.9, 0.2])
    );

    await service.issueNextProblemQuestForTelegramUser(telegramUserId);

    sessions.addSession(makeEligibleOrdinaryThreatSession("won", "ordinary-threat-repeat-checkpoint-1", {
      completedAt: new Date("2026-06-12T10:29:39.000Z"),
      escalated: true
    }));
    sessions.addSession(makeEligibleOrdinaryThreatSession("won", "ordinary-threat-repeat-checkpoint-2", {
      completedAt: new Date("2026-06-12T10:29:40.000Z"),
      escalated: true
    }));

    const started = await service.getFightForTelegramUser(telegramUserId);

    expect(started.state).toBe("persistent-active");
    if (started.state === "persistent-active") {
      const enemies = normalizeCombatEnemies(started.session.state!);
      const secondEnemy = enemies[1];
      const baseSecondEnemy = monsters.find((monster) => monster.id === secondEnemy?.id);

      expect(enemies).toHaveLength(2);
      expect(secondEnemy).toBeDefined();
      expect(baseSecondEnemy).toBeDefined();
      expect(secondEnemy?.level).toBe((baseSecondEnemy?.level ?? 0) + 4);
      expect(started.session.state?.threat?.pressure).toMatchObject({
        consecutiveWonEscalatedFights: 2,
        requestedSecondEnemyLevelBonus: 4,
        appliedSecondEnemyLevelBonus: 4,
        boostedEnemyId: secondEnemy?.enemyId,
        boostedEnemyEffectiveLevel: secondEnemy?.level,
        levelCap: 23
      });
    }
  });

  it("caps repeated second enemy pressure at the current game level ceiling", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { level: 23, xp: 130_000 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.999, 0.999, 0.999])
    );

    await service.issueNextProblemQuestForTelegramUser(telegramUserId);

    for (let index = 0; index < 5; index += 1) {
      sessions.addSession(makeEligibleOrdinaryThreatSession("won", `ordinary-threat-cap-${index + 1}`, {
        completedAt: new Date(`2026-06-12T10:29:4${index}.000Z`),
        escalated: true
      }));
    }

    const started = await service.getFightForTelegramUser(telegramUserId);

    expect(started.state).toBe("persistent-active");
    if (started.state === "persistent-active") {
      const enemies = normalizeCombatEnemies(started.session.state!);
      const secondEnemy = enemies[1];

      expect(enemies).toHaveLength(2);
      expect(secondEnemy?.level).toBe(23);
      expect(started.session.state?.threat?.pressure).toMatchObject({
        consecutiveWonEscalatedFights: 5,
        requestedSecondEnemyLevelBonus: 10,
        boostedEnemyId: secondEnemy?.enemyId,
        boostedEnemyEffectiveLevel: 23,
        levelCap: 23
      });
      expect(started.session.state?.threat?.pressure?.appliedSecondEnemyLevelBonus).toBeLessThan(10);
      expect(enemies.every((enemy) => (enemy.level ?? 0) <= 23)).toBe(true);
    }
  });

  it.each(["lost", "fled", "expired"] as const)(
    "resets ordinary threat streak after a one-enemy %s",
    async (terminalStatus) => {
      const characters = new FakeCharacterRepository();
      characters.add(telegramUserId, { xp: 25 });
      const dailyActions = new FakeDailyActionRepository(characters);
      const sessions = new FakeSoloCombatSessionRepository(characters);
      const service = new FightService(
        characters,
        dailyActions,
        fixedClock,
        sessions,
        new FakeRandomSource([0.1])
      );

      await service.issueNextProblemQuestForTelegramUser(telegramUserId);

      sessions.addSession(makeEligibleOrdinaryThreatSession("won", "ordinary-threat-reset-1", {
        completedAt: new Date("2026-06-12T10:29:40.000Z")
      }));
      sessions.addSession(makeEligibleOrdinaryThreatSession("won", "ordinary-threat-reset-2", {
        completedAt: new Date("2026-06-12T10:29:41.000Z")
      }));
      sessions.addSession(makeEligibleOrdinaryThreatSession(terminalStatus, "ordinary-threat-reset-3", {
        completedAt: new Date("2026-06-12T10:29:42.000Z")
      }));

      const started = await service.getFightForTelegramUser(telegramUserId);

      expect(started.state).toBe("persistent-active");
      if (started.state === "persistent-active") {
        expect(normalizeCombatEnemies(started.session.state!)).toHaveLength(1);
      }
    }
  );

  it("resets to one enemy after a lost escalated terminal checkpoint", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1])
    );

    await service.issueNextProblemQuestForTelegramUser(telegramUserId);

    sessions.addSession(makeEligibleOrdinaryThreatSession("lost", "ordinary-threat-checkpoint-escalated", {
      completedAt: new Date("2026-06-12T10:29:43.000Z"),
      escalated: true
    }));

    const started = await service.getFightForTelegramUser(telegramUserId);

    expect(started.state).toBe("persistent-active");
    if (started.state === "persistent-active") {
      expect(normalizeCombatEnemies(started.session.state!)).toHaveLength(1);
    }
  });

  it("continues escalation after a won two-enemy fight even while settlement is pending", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1])
    );

    await service.issueNextProblemQuestForTelegramUser(telegramUserId);

    sessions.addSession(makeEligibleOrdinaryThreatSession("won", "ordinary-threat-pending-checkpoint-escalated", {
      completedAt: new Date("2026-06-12T10:29:43.000Z"),
      escalated: true,
      settlement: "pending"
    }));

    const started = await service.getFightForTelegramUser(telegramUserId);

    expect(started.state).toBe("persistent-active");
    if (started.state === "persistent-active") {
      expect(normalizeCombatEnemies(started.session.state!)).toHaveLength(2);
    }
  });

  it("ignores dev-forced two-enemy, starter, training, Yeger, and Adventure rows for ordinary threat", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1, 0.9, 0.2])
    );

    await service.issueNextProblemQuestForTelegramUser(telegramUserId);

    sessions.addSession(makeEligibleOrdinaryThreatSession("won", "ordinary-threat-ignore-1", {
      completedAt: new Date("2026-06-12T10:29:40.000Z")
    }));
    sessions.addSession(makeEligibleOrdinaryThreatSession("won", "ordinary-threat-ignore-2", {
      completedAt: new Date("2026-06-12T10:29:41.000Z")
    }));
    sessions.addSession(makeEligibleOrdinaryThreatSession("won", "ordinary-threat-ignore-3", {
      completedAt: new Date("2026-06-12T10:29:42.000Z")
    }));
    sessions.addSession(makeEligibleOrdinaryThreatSession("won", "ordinary-threat-ignore-dev-two", {
      completedAt: new Date("2026-06-12T10:29:43.000Z"),
      enemyCount: 2,
      threatExclusion: true
    }));
    sessions.addSession(makeEligibleOrdinaryThreatSession("won", "ordinary-threat-ignore-yeger", {
      completedAt: new Date("2026-06-12T10:29:44.000Z"),
      source: "yeger"
    }));
    sessions.addSession(makeEligibleOrdinaryThreatSession("won", "ordinary-threat-ignore-adventure", {
      completedAt: new Date("2026-06-12T10:29:45.000Z"),
      source: "adventure"
    }));
    sessions.addSession(makeEligibleOrdinaryThreatSession("won", "ordinary-threat-ignore-training", {
      completedAt: new Date("2026-06-12T10:29:46.000Z"),
      source: "training",
      monsterId: TRAINING_DOPPELGANGER_MONSTER_ID
    }));
    sessions.addSession(makeEligibleOrdinaryThreatSession("won", "ordinary-threat-ignore-starter", {
      completedAt: new Date("2026-06-12T10:29:47.000Z"),
      monsterId: "monster.mimic-shawarma"
    }));

    const started = await service.getFightForTelegramUser(telegramUserId);

    expect(started.state).toBe("persistent-active");
    if (started.state === "persistent-active") {
      expect(normalizeCombatEnemies(started.session.state!)).toHaveLength(2);
    }
  });

  it("does not let excluded rows consume the ordinary threat history window", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1, 0.9, 0.2])
    );

    await service.issueNextProblemQuestForTelegramUser(telegramUserId);

    for (const [index, completedAt] of [
      new Date("2026-06-12T10:29:40.000Z"),
      new Date("2026-06-12T10:29:41.000Z"),
      new Date("2026-06-12T10:29:42.000Z")
    ].entries()) {
      sessions.addSession(makeEligibleOrdinaryThreatSession("won", `ordinary-threat-window-win-${index + 1}`, {
        completedAt
      }));
    }
    for (let index = 0; index < 30; index += 1) {
      sessions.addSession(makeEligibleOrdinaryThreatSession("won", `ordinary-threat-window-yeger-${index + 1}`, {
        completedAt: new Date(Date.UTC(2026, 5, 12, 10, 30, index)),
        source: "yeger"
      }));
    }

    const started = await service.getFightForTelegramUser(telegramUserId);

    expect(started.state).toBe("persistent-active");
    if (started.state === "persistent-active") {
      expect(normalizeCombatEnemies(started.session.state!)).toHaveLength(2);
    }
  });

  it("computes ordinary threat from completion order instead of insertion order", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1, 0.9, 0.2])
    );

    await service.issueNextProblemQuestForTelegramUser(telegramUserId);

    for (let index = 0; index < 13; index += 1) {
      sessions.addSession(makeEligibleOrdinaryThreatSession("won", `ordinary-threat-completion-yeger-${index}`, {
        completedAt: new Date(Date.UTC(2026, 5, 12, 10, 31, index)),
        source: "yeger"
      }));
    }
    for (const [index, completedAt] of [
      new Date("2026-06-12T10:29:40.000Z"),
      new Date("2026-06-12T10:29:41.000Z"),
      new Date("2026-06-12T10:29:42.000Z")
    ].entries()) {
      sessions.addSession(makeEligibleOrdinaryThreatSession("won", `ordinary-threat-completion-win-${index + 1}`, {
        completedAt
      }));
    }

    const started = await service.getFightForTelegramUser(telegramUserId);

    expect(started.state).toBe("persistent-active");
    if (started.state === "persistent-active") {
      expect(normalizeCombatEnemies(started.session.state!)).toHaveLength(2);
    }
  });

  it("fails malformed terminal threat history safely to base threat", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1])
    );

    await service.issueNextProblemQuestForTelegramUser(telegramUserId);

    for (const [index, completedAt] of [
      new Date("2026-06-12T10:29:40.000Z"),
      new Date("2026-06-12T10:29:41.000Z"),
      new Date("2026-06-12T10:29:42.000Z")
    ].entries()) {
      sessions.addSession(makeEligibleOrdinaryThreatSession("won", `ordinary-threat-malformed-win-${index + 1}`, {
        completedAt
      }));
    }
    sessions.addSession({
      ...makeTerminalSession("won", "ordinary-threat-malformed-newer", `character-${telegramUserId.toString()}`, "monster.deadline-spider", {
        completedAt: new Date("2026-06-12T10:29:43.000Z"),
        settlement: null
      }),
      state: null
    });

    const started = await service.getFightForTelegramUser(telegramUserId);

    expect(started.state).toBe("persistent-active");
    if (started.state === "persistent-active") {
      expect(normalizeCombatEnemies(started.session.state!)).toHaveLength(1);
      expect(started.session.state?.threat).toBeUndefined();
    }
  });

  it("fails a two-enemy normal row with dropped threat metadata safely to base threat", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1])
    );

    await service.issueNextProblemQuestForTelegramUser(telegramUserId);

    for (const [index, completedAt] of [
      new Date("2026-06-12T10:29:40.000Z"),
      new Date("2026-06-12T10:29:41.000Z"),
      new Date("2026-06-12T10:29:42.000Z")
    ].entries()) {
      sessions.addSession(makeEligibleOrdinaryThreatSession("won", `ordinary-threat-dropped-win-${index + 1}`, {
        completedAt
      }));
    }
    sessions.addSession(makeEligibleOrdinaryThreatSession("won", "ordinary-threat-dropped-two-enemy", {
      completedAt: new Date("2026-06-12T10:29:43.000Z"),
      enemyCount: 2
    }));

    const started = await service.getFightForTelegramUser(telegramUserId);

    expect(started.state).toBe("persistent-active");
    if (started.state === "persistent-active") {
      expect(normalizeCombatEnemies(started.session.state!)).toHaveLength(1);
      expect(started.session.state?.threat).toBeUndefined();
    }
  });

  it.each([
    {
      name: "unknown threat line id",
      threatLineId: "unknown-threat-line",
      threatLineVersion: "threat-escalation-v1"
    },
    {
      name: "unsupported threat line version",
      threatLineId: "nyz-added-witnesses",
      threatLineVersion: "future-threat-lines-v2"
    }
  ])("fails a two-enemy normal row with $name safely to base threat", async ({ threatLineId, threatLineVersion }) => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1])
    );

    await service.issueNextProblemQuestForTelegramUser(telegramUserId);

    for (const [index, completedAt] of [
      new Date("2026-06-12T10:29:40.000Z"),
      new Date("2026-06-12T10:29:41.000Z"),
      new Date("2026-06-12T10:29:42.000Z")
    ].entries()) {
      sessions.addSession(makeEligibleOrdinaryThreatSession("won", `ordinary-threat-invalid-line-win-${index + 1}`, {
        completedAt
      }));
    }
    sessions.addSession(makeEligibleOrdinaryThreatSession("won", "ordinary-threat-invalid-line-two-enemy", {
      completedAt: new Date("2026-06-12T10:29:43.000Z"),
      escalated: true,
      threatLineId,
      threatLineVersion
    }));

    const started = await service.getFightForTelegramUser(telegramUserId);

    expect(started.state).toBe("persistent-active");
    if (started.state === "persistent-active") {
      expect(normalizeCombatEnemies(started.session.state!)).toHaveLength(1);
      expect(started.session.state?.threat).toBeUndefined();
    }
  });

  it("decides Nyz passage threat escalation when consuming the preview", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 110 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const pending = new FakePendingPassageEncounterRepository(characters, sessions);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1, 0.9, 0.2]),
      undefined,
      undefined,
      pending
    );
    const preview = await service.previewPersistentFightForTelegramUser(telegramUserId, {
      difficulty: "normal",
      originLocationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_STRAIGHT
    });
    if (preview.state !== "persistent-preview") {
      throw new Error("Expected preview");
    }

    for (const [index, completedAt] of [
      new Date("2026-06-12T10:29:40.000Z"),
      new Date("2026-06-12T10:29:41.000Z"),
      new Date("2026-06-12T10:29:42.000Z")
    ].entries()) {
      sessions.addSession(makeEligibleOrdinaryThreatSession("won", `passage-threat-win-${index + 1}`, {
        completedAt
      }));
    }

    const started = await service.attackPersistentPassageEncounterForTelegramUser(
      telegramUserId,
      preview.encounterToken
    );

    expect(started.state).toBe("persistent-active");
    if (started.state === "persistent-active") {
      const enemies = normalizeCombatEnemies(started.session.state!);
      expect(enemies).toHaveLength(2);
      expect(enemies[0]?.id).toBe(preview.monster.id);
      expect(started.session.monsterId).toBe(preview.monster.id);
      expect(started.session.state?.threat).toMatchObject({
        enemyCount: 2,
        reason: "ordinary-win-streak",
        eligibleWins: 3,
        lineVersion: "threat-escalation-v1"
      });
      if (new Set(enemies.map((enemy) => enemy.id)).size > 1) {
        expect(enemies[1]?.id).not.toBe(preview.monster.id);
      }
    }
    expect(pending.consumeCount).toBe(1);
  });

  it("continues Nyz passage escalation and boosts the second enemy after a previous escalated two-enemy win", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 110 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const pending = new FakePendingPassageEncounterRepository(characters, sessions);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1, 0.9, 0.2]),
      undefined,
      undefined,
      pending
    );
    const preview = await service.previewPersistentFightForTelegramUser(telegramUserId, {
      difficulty: "normal",
      originLocationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_STRAIGHT
    });
    if (preview.state !== "persistent-preview") {
      throw new Error("Expected preview");
    }

    sessions.addSession(makeEligibleOrdinaryThreatSession("won", "passage-threat-repeat-checkpoint", {
      completedAt: new Date("2026-06-12T10:29:39.000Z"),
      escalated: true
    }));

    const started = await service.attackPersistentPassageEncounterForTelegramUser(
      telegramUserId,
      preview.encounterToken
    );

    expect(started.state).toBe("persistent-active");
    if (started.state === "persistent-active") {
      const enemies = normalizeCombatEnemies(started.session.state!);
      const secondEnemy = enemies[1];
      const baseSecondEnemy = monsters.find((monster) => monster.id === secondEnemy?.id);

      expect(enemies).toHaveLength(2);
      expect(secondEnemy).toBeDefined();
      expect(baseSecondEnemy).toBeDefined();
      expect(secondEnemy?.level).toBe((baseSecondEnemy?.level ?? 0) + 2);
      expect(started.session.state?.threat?.pressure).toMatchObject({
        consecutiveWonEscalatedFights: 1,
        requestedSecondEnemyLevelBonus: 2,
        appliedSecondEnemyLevelBonus: 2,
        boostedEnemyId: secondEnemy?.enemyId,
        boostedEnemyEffectiveLevel: secondEnemy?.level,
        levelCap: 23
      });
    }
  });

  it("stacks the second Nyz passage enemy boost across consecutive won two-enemy fights", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 110 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const pending = new FakePendingPassageEncounterRepository(characters, sessions);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1, 0.9, 0.2]),
      undefined,
      undefined,
      pending
    );
    const preview = await service.previewPersistentFightForTelegramUser(telegramUserId, {
      difficulty: "normal",
      originLocationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_STRAIGHT
    });
    if (preview.state !== "persistent-preview") {
      throw new Error("Expected preview");
    }

    sessions.addSession(makeEligibleOrdinaryThreatSession("won", "passage-threat-repeat-checkpoint-1", {
      completedAt: new Date("2026-06-12T10:29:39.000Z"),
      escalated: true
    }));
    sessions.addSession(makeEligibleOrdinaryThreatSession("won", "passage-threat-repeat-checkpoint-2", {
      completedAt: new Date("2026-06-12T10:29:40.000Z"),
      escalated: true
    }));

    const started = await service.attackPersistentPassageEncounterForTelegramUser(
      telegramUserId,
      preview.encounterToken
    );

    expect(started.state).toBe("persistent-active");
    if (started.state === "persistent-active") {
      const enemies = normalizeCombatEnemies(started.session.state!);
      const secondEnemy = enemies[1];
      const baseSecondEnemy = monsters.find((monster) => monster.id === secondEnemy?.id);

      expect(enemies).toHaveLength(2);
      expect(enemies[0]?.id).toBe(preview.monster.id);
      expect(secondEnemy).toBeDefined();
      expect(baseSecondEnemy).toBeDefined();
      expect(secondEnemy?.level).toBe((baseSecondEnemy?.level ?? 0) + 4);
      expect(started.session.state?.threat?.pressure).toMatchObject({
        consecutiveWonEscalatedFights: 2,
        requestedSecondEnemyLevelBonus: 4,
        appliedSecondEnemyLevelBonus: 4,
        boostedEnemyId: secondEnemy?.enemyId,
        boostedEnemyEffectiveLevel: secondEnemy?.level,
        levelCap: 23
      });
    }
  });

  it("keeps Nyz passage base threat before three wins and after a newer loss", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 110 });
    characters.add(77n, { xp: 110 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const pending = new FakePendingPassageEncounterRepository(characters, sessions);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1, 0.2, 0.3, 0.4]),
      undefined,
      undefined,
      pending
    );

    sessions.addSession(makeEligibleOrdinaryThreatSession("won", "passage-threat-base-win-1", {
      completedAt: new Date("2026-06-12T10:29:40.000Z")
    }));
    sessions.addSession(makeEligibleOrdinaryThreatSession("won", "passage-threat-base-win-2", {
      completedAt: new Date("2026-06-12T10:29:41.000Z")
    }));
    const basePreview = await service.previewPersistentFightForTelegramUser(telegramUserId, {
      difficulty: "normal",
      originLocationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_STRAIGHT
    });
    if (basePreview.state !== "persistent-preview") {
      throw new Error("Expected base preview");
    }
    const baseStarted = await service.attackPersistentPassageEncounterForTelegramUser(
      telegramUserId,
      basePreview.encounterToken
    );

    expect(baseStarted.state).toBe("persistent-active");
    if (baseStarted.state === "persistent-active") {
      expect(normalizeCombatEnemies(baseStarted.session.state!)).toHaveLength(1);
      expect(baseStarted.session.state?.threat).toBeUndefined();
    }

    sessions.addSession(makeEligibleOrdinaryThreatSession("won", "passage-threat-loss-win-1", {
      completedAt: new Date("2026-06-12T10:29:40.000Z"),
      characterId: "character-77"
    }));
    sessions.addSession(makeEligibleOrdinaryThreatSession("won", "passage-threat-loss-win-2", {
      completedAt: new Date("2026-06-12T10:29:41.000Z"),
      characterId: "character-77"
    }));
    sessions.addSession(makeEligibleOrdinaryThreatSession("won", "passage-threat-loss-win-3", {
      completedAt: new Date("2026-06-12T10:29:42.000Z"),
      characterId: "character-77"
    }));
    const lossPreview = await service.previewPersistentFightForTelegramUser(77n, {
      difficulty: "normal",
      originLocationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_STRAIGHT
    });
    if (lossPreview.state !== "persistent-preview") {
      throw new Error("Expected loss preview");
    }
    sessions.addSession(makeEligibleOrdinaryThreatSession("lost", "passage-threat-newer-loss", {
      completedAt: new Date("2026-06-12T10:29:43.000Z"),
      characterId: "character-77"
    }));

    const lossStarted = await service.attackPersistentPassageEncounterForTelegramUser(
      77n,
      lossPreview.encounterToken
    );

    expect(lossStarted.state).toBe("persistent-active");
    if (lossStarted.state === "persistent-active") {
      expect(normalizeCombatEnemies(lossStarted.session.state!)).toHaveLength(1);
      expect(lossStarted.session.state?.threat).toBeUndefined();
    }
  });

  it("returns the canonical escalated passage session for duplicate and reloaded callbacks", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 110 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const pending = new FakePendingPassageEncounterRepository(characters, sessions);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1, 0.9, 0.2]),
      undefined,
      undefined,
      pending
    );
    for (const [index, completedAt] of [
      new Date("2026-06-12T10:29:40.000Z"),
      new Date("2026-06-12T10:29:41.000Z"),
      new Date("2026-06-12T10:29:42.000Z")
    ].entries()) {
      sessions.addSession(makeEligibleOrdinaryThreatSession("won", `passage-threat-duplicate-win-${index + 1}`, {
        completedAt
      }));
    }
    const preview = await service.previewPersistentFightForTelegramUser(telegramUserId, {
      difficulty: "normal",
      originLocationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_STRAIGHT
    });
    if (preview.state !== "persistent-preview") {
      throw new Error("Expected preview");
    }

    const first = await service.attackPersistentPassageEncounterForTelegramUser(telegramUserId, preview.encounterToken);
    const duplicate = await service.attackPersistentPassageEncounterForTelegramUser(telegramUserId, preview.encounterToken);
    const reloadedService = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.8]),
      undefined,
      undefined,
      pending
    );
    const reloaded = await reloadedService.attackPersistentPassageEncounterForTelegramUser(telegramUserId, preview.encounterToken);

    expect(first.state).toBe("persistent-active");
    expect(duplicate.state).toBe("persistent-active");
    expect(reloaded.state).toBe("persistent-active");
    if (first.state === "persistent-active" && duplicate.state === "persistent-active" && reloaded.state === "persistent-active") {
      const firstEnemies = normalizeCombatEnemies(first.session.state!).map((enemy) => enemy.id);
      expect(duplicate.session.id).toBe(first.session.id);
      expect(reloaded.session.id).toBe(first.session.id);
      expect(normalizeCombatEnemies(duplicate.session.state!).map((enemy) => enemy.id)).toEqual(firstEnemies);
      expect(normalizeCombatEnemies(reloaded.session.state!).map((enemy) => enemy.id)).toEqual(firstEnemies);
      expect(duplicate.session.state?.threat?.lineId).toBe(first.session.state?.threat?.lineId);
      expect(reloaded.session.state?.threat?.lineId).toBe(first.session.state?.threat?.lineId);
    }
  });

  it("checkpoints terminal escalated passage fights and disables legacy one-enemy recovery", async () => {
    let now = fixedClock();
    const clock = () => now;
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 110 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const pending = new FakePendingPassageEncounterRepository(characters, sessions);
    const service = new FightService(
      characters,
      dailyActions,
      clock,
      sessions,
      new FakeRandomSource([0.1, 0.9, 0.2, 0.3]),
      undefined,
      undefined,
      pending
    );
    for (const [index, completedAt] of [
      new Date("2026-06-12T10:29:40.000Z"),
      new Date("2026-06-12T10:29:41.000Z"),
      new Date("2026-06-12T10:29:42.000Z")
    ].entries()) {
      sessions.addSession(makeEligibleOrdinaryThreatSession("won", `passage-threat-checkpoint-win-${index + 1}`, {
        completedAt
      }));
    }
    const preview = await service.previewPersistentFightForTelegramUser(telegramUserId, {
      difficulty: "normal",
      originLocationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_STRAIGHT
    });
    if (preview.state !== "persistent-preview") {
      throw new Error("Expected preview");
    }
    const started = await service.attackPersistentPassageEncounterForTelegramUser(telegramUserId, preview.encounterToken);
    if (started.state !== "persistent-active" || !started.session.state) {
      throw new Error("Expected escalated passage fight");
    }
    expect(normalizeCombatEnemies(started.session.state)).toHaveLength(2);

    const lostState = {
      ...started.session.state,
      status: "lost" as const,
      completedAt: now.toISOString(),
      hero: {
        ...started.session.state.hero,
        hp: 0
      },
      monster: {
        ...started.session.state.monster,
        hp: 4
      }
    };
    await sessions.updateById(started.session.id, { state: lostState, status: "lost" });

    now = addSeconds(fixedClock(), 60);
    const recoveryPreview = await service.previewPersistentFightForTelegramUser(telegramUserId, {
      difficulty: "normal",
      originLocationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_STRAIGHT
    });

    expect(recoveryPreview.state).toBe("persistent-preview");
    if (recoveryPreview.state !== "persistent-preview") {
      throw new Error("Expected fresh preview");
    }
    expect(recoveryPreview.encounterToken).not.toBe(preview.encounterToken);
    expect(recoveryPreview.monsterHp).toBeUndefined();

    const terminalState = markCombatSettlementCompleted({
      ...lostState,
      status: "won",
      completedAt: now.toISOString(),
      hero: {
        ...lostState.hero,
        hp: 8
      },
      monster: {
        ...lostState.monster,
        hp: 0
      },
      enemies: lostState.enemies?.map((enemy) => ({ ...enemy, hp: 0 }))
    }, now);
    await sessions.updateById(started.session.id, { state: terminalState, status: "won" });

    const nextStarted = await service.attackPersistentPassageEncounterForTelegramUser(
      telegramUserId,
      recoveryPreview.encounterToken
    );

    expect(nextStarted.state).toBe("persistent-active");
    if (nextStarted.state === "persistent-active") {
      const enemies = normalizeCombatEnemies(nextStarted.session.state!);
      expect(enemies).toHaveLength(2);
      expect(enemies[0]?.id).toBe(recoveryPreview.monster.id);
      expect(nextStarted.session.state?.threat).toMatchObject({
        enemyCount: 2,
        reason: "ordinary-win-streak",
        eligibleWins: 3
      });
    }
  });

  it("marks the first problem quest ready on the thirteenth win without auto-claiming", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    sessions.addWonSessions("character-42", 12);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1, 0.1, 0.1])
    );
    const started = await service.getFightForTelegramUser(telegramUserId);
    expect(started.state).toBe("persistent-active");
    if (started.state !== "persistent-active") {
      return;
    }
    sessions.setMonsterHp(started.session.id, 1);

    const result = await service.resolvePersistentFightTurn(telegramUserId, {
      sessionId: started.session.id,
      turn: 1,
      action: "attack"
    });
    const repeated = await service.resolvePersistentFightTurn(telegramUserId, {
      sessionId: started.session.id,
      turn: 1,
      action: "attack"
    });

    expect(result.state).toBe("updated");
    if (result.state === "updated") {
      expect(result.questProgress).toMatchObject({
        wins: 13,
        completed: true,
        rewardClaimed: false
      });
    }
    expect(repeated.state).toBe("terminal");
    if (repeated.state === "terminal") {
      expect(repeated.questProgress).toMatchObject({
        wins: 13,
        completed: true,
        rewardClaimed: false
      });
    }
    expect(
      dailyActions.records.filter((record) => record.key === THIRTEEN_SMALL_PROBLEMS_QUEST_KEY)
    ).toHaveLength(0);
    expect(
      dailyActions.records.filter((record) => record.key === PERSISTENT_SOLO_FIGHT_REWARD_KEY)
    ).toHaveLength(1);
    expect(dailyActions.createCount).toBe(1);
    expect(dailyActions.grantedItems).not.toContainEqual({
      itemId: "item.badge-of-thirteen-small-problems",
      quantity: 1
    });
    if (result.state === "updated") {
      await expect(characters.findByTelegramUserId(telegramUserId)).resolves.toMatchObject({
        xp: 25 + (result.fightReward?.reward.xp ?? 0),
        gold: result.fightReward?.reward.gold ?? 0,
        level: getLevelForXp(25 + (result.fightReward?.reward.xp ?? 0))
      });
    }
  });

  it("turns in the first problem quest through Korchmar and waits for taking the next problem", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    sessions.addWonSessions("character-42", 13);
    const service = new FightService(characters, dailyActions, fixedClock, sessions);

    const first = await service.turnInProblemQuestForTelegramUser(telegramUserId);

    expect(first.state).toBe("turned-in");
    if (first.state === "turned-in") {
      expect(first.result).toMatchObject({
        state: "claimed",
        stage: {
          id: "13",
          target: 13
        },
        reward: {
          xp: 35,
          gold: 10,
          localDate: PROBLEM_QUEST_BUCKET,
          itemGrants: [
            {
              itemId: "item.badge-of-thirteen-small-problems",
              name: "Жетон тринадцяти дрібних проблем",
              quantity: 1
            }
          ]
        },
        nextStage: {
          id: "23",
          target: 23
        },
        nextStageAvailable: true
      });
    }
    expect(
      dailyActions.records.filter((record) => record.key === THIRTEEN_SMALL_PROBLEMS_QUEST_KEY)
    ).toHaveLength(1);
    expect(
      dailyActions.records.filter((record) => record.key === PROBLEM_QUEST_STAGES[1].issueKey)
    ).toHaveLength(0);
    expect(dailyActions.createCount).toBe(1);

    const next = await service.issueNextProblemQuestForTelegramUser(telegramUserId);

    expect(next.state).toBe("issued");
    if (next.state === "issued") {
      expect(next).toMatchObject({
        stage: { id: "13" },
        nextStage: { id: "23", target: 23 },
        issued: "created",
        progress: {
          stageId: "23",
          wins: 0,
          target: 23,
          completed: false,
          rewardClaimed: false
        }
      });
    }
    expect(
      dailyActions.records.filter((record) => record.key === PROBLEM_QUEST_STAGES[1].issueKey)
    ).toHaveLength(1);
    expect(dailyActions.createCount).toBe(2);

    const progress = await service.getProblemQuestProgressForTelegramUser(telegramUserId);

    expect(progress).toMatchObject({
      state: "ready",
      progress: {
        stageId: "23",
        wins: 0,
        completed: false
      },
      archive: [
        {
          stageId: "13",
          wins: 13,
          target: 13,
          completed: true,
          rewardClaimed: true
        }
      ]
    });
  });

  it("lets old thirteen-problem claims take the twenty-three stage without duplicating the old reward", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    dailyActions.addAction(telegramUserId, THIRTEEN_SMALL_PROBLEMS_QUEST_KEY, PROBLEM_QUEST_BUCKET);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(characters, dailyActions, fixedClock, sessions);

    const result = await service.issueNextProblemQuestForTelegramUser(telegramUserId);

    expect(result.state).toBe("issued");
    if (result.state === "issued") {
      expect(result).toMatchObject({
        stage: {
          id: "13"
        },
        nextStage: {
          id: "23"
        },
        issued: "created"
      });
    }
    expect(
      dailyActions.records.filter((record) => record.key === THIRTEEN_SMALL_PROBLEMS_QUEST_KEY)
    ).toHaveLength(1);
    expect(
      dailyActions.records.filter((record) => record.key === PROBLEM_QUEST_STAGES[1].issueKey)
    ).toHaveLength(1);
  });

  it("recovers the next problem stage issue after an already-claimed intermediate reward", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    dailyActions.addAction(telegramUserId, THIRTEEN_SMALL_PROBLEMS_QUEST_KEY, PROBLEM_QUEST_BUCKET);
    dailyActions.addAction(telegramUserId, PROBLEM_QUEST_STAGES[1].issueKey, PROBLEM_QUEST_BUCKET);
    dailyActions.addAction(telegramUserId, PROBLEM_QUEST_STAGES[1].rewardKey, PROBLEM_QUEST_BUCKET);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(characters, dailyActions, fixedClock, sessions);

    const result = await service.issueNextProblemQuestForTelegramUser(telegramUserId);

    expect(result.state).toBe("issued");
    if (result.state === "issued") {
      expect(result).toMatchObject({
        stage: {
          id: "23"
        },
        nextStage: {
          id: "42"
        },
        issued: "created"
      });
    }
    expect(
      dailyActions.records.filter((record) => record.key === PROBLEM_QUEST_STAGES[2].issueKey)
    ).toHaveLength(1);
  });

  it("counts only wins after the current problem stage was issued", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    dailyActions.addAction(telegramUserId, THIRTEEN_SMALL_PROBLEMS_QUEST_KEY, PROBLEM_QUEST_BUCKET);
    dailyActions.addAction(
      telegramUserId,
      PROBLEM_QUEST_STAGES[1].issueKey,
      PROBLEM_QUEST_BUCKET,
      new Date("2026-06-12T10:00:00.000Z")
    );
    const sessions = new FakeSoloCombatSessionRepository(characters);
    sessions.addWonSessions("character-42", 30, "monster.deadline-spider", {
      createdAt: new Date("2026-06-12T09:00:00.000Z")
    });
    sessions.addWonSessions("character-42", 22, "monster.deadline-spider", {
      createdAt: new Date("2026-06-12T10:00:01.000Z")
    });
    sessions.addWonSessions("character-42", 5, TRAINING_DOPPELGANGER_MONSTER_ID, {
      createdAt: new Date("2026-06-12T11:30:00.000Z")
    });
    const service = new FightService(characters, dailyActions, fixedClock, sessions);

    const overview = await service.getFightOverviewForTelegramUser(telegramUserId);

    expect(overview).toMatchObject({
      state: "persistent-ready",
      questProgress: {
        stageId: "23",
        wins: 22,
        target: 23,
        completed: false,
        rewardClaimed: false,
        issued: true
      }
    });
  });

  it("advances problem quest stages through forty-two and ninety-three with fresh counters", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    dailyActions.addAction(telegramUserId, THIRTEEN_SMALL_PROBLEMS_QUEST_KEY, PROBLEM_QUEST_BUCKET);
    dailyActions.addAction(
      telegramUserId,
      PROBLEM_QUEST_STAGES[1].issueKey,
      PROBLEM_QUEST_BUCKET,
      new Date("2026-06-12T10:00:00.000Z")
    );
    const sessions = new FakeSoloCombatSessionRepository(characters);
    sessions.addWonSessions("character-42", 23, "monster.deadline-spider", {
      createdAt: new Date("2026-06-12T10:10:00.000Z")
    });
    const service = new FightService(characters, dailyActions, fixedClock, sessions);

    const twentyThree = await service.turnInProblemQuestForTelegramUser(telegramUserId);
    expect(twentyThree.state).toBe("turned-in");
    if (twentyThree.state === "turned-in") {
      expect(twentyThree.result).toMatchObject({
        stage: {
          id: "23"
        },
        reward: {
          xp: 55,
          gold: 18,
          itemGrants: [
            {
              itemId: "item.apophenia-receipt-of-twenty-three",
              quantity: 1
            }
          ]
        },
        nextStage: {
          id: "42"
        },
        nextStageAvailable: true
      });
    }

    const issueFortyTwo = await service.issueNextProblemQuestForTelegramUser(telegramUserId);
    expect(issueFortyTwo.state).toBe("issued");
    if (issueFortyTwo.state === "issued") {
      expect(issueFortyTwo).toMatchObject({
        stage: { id: "23" },
        nextStage: { id: "42" },
        issued: "created"
      });
    }

    const afterTwentyThree = await service.getFightOverviewForTelegramUser(telegramUserId);
    expect(afterTwentyThree).toMatchObject({
      state: "persistent-ready",
      questProgress: {
        stageId: "42",
        wins: 0,
        target: 42,
        completed: false
      }
    });

    const fortyTwoIssue = dailyActions.records.find(
      (record) => record.key === PROBLEM_QUEST_STAGES[2].issueKey
    );
    expect(fortyTwoIssue).toBeDefined();
    sessions.addWonSessions("character-42", 42, "monster.paperwork-ooze", {
      createdAt: addSeconds(fortyTwoIssue?.createdAt ?? fixedClock(), 1)
    });

    const fortyTwo = await service.turnInProblemQuestForTelegramUser(telegramUserId);
    expect(fortyTwo.state).toBe("turned-in");
    if (fortyTwo.state === "turned-in") {
      expect(fortyTwo.result).toMatchObject({
        stage: {
          id: "42"
        },
        reward: {
          xp: 90,
          gold: 30,
          itemGrants: [
            {
              itemId: "item.towel-of-forty-two-answers",
              quantity: 1
            }
          ]
        },
        nextStage: {
          id: "93"
        },
        nextStageAvailable: true
      });
    }

    const issueNinetyThree = await service.issueNextProblemQuestForTelegramUser(telegramUserId);
    expect(issueNinetyThree.state).toBe("issued");
    if (issueNinetyThree.state === "issued") {
      expect(issueNinetyThree).toMatchObject({
        stage: { id: "42" },
        nextStage: { id: "93" },
        issued: "created"
      });
    }

    const ninetyThreeIssue = dailyActions.records.find(
      (record) => record.key === PROBLEM_QUEST_STAGES[3].issueKey
    );
    expect(ninetyThreeIssue).toBeDefined();
    sessions.addWonSessions("character-42", 93, "monster.archival-knysh-eater", {
      createdAt: addSeconds(ninetyThreeIssue?.createdAt ?? fixedClock(), 1)
    });

    const ninetyThree = await service.turnInProblemQuestForTelegramUser(telegramUserId);
    expect(ninetyThree.state).toBe("turned-in");
    if (ninetyThree.state === "turned-in") {
      expect(ninetyThree.result).toMatchObject({
        stage: {
          id: "93"
        },
        reward: {
          xp: 140,
          gold: 45,
          itemGrants: [
            {
              itemId: "item.poster-of-ninety-three-problem-wills",
              quantity: 1
            }
          ]
        },
        nextStage: null,
        branchComplete: true
      });
    }

    const complete = await service.getFightOverviewForTelegramUser(telegramUserId);
    expect(complete).toMatchObject({
      state: "persistent-ready",
      questProgress: {
        stageId: "93",
        wins: 93,
        target: 93,
        completed: true,
        rewardClaimed: true,
        branchComplete: true
      }
    });
  });

  it("does not mutate a stale persistent fight turn", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1])
    );
    const started = await service.getFightForTelegramUser(telegramUserId);
    expect(started.state).toBe("persistent-active");
    if (started.state !== "persistent-active") {
      return;
    }
    sessions.setHeroMana(started.session.id, 0);

    const result = await service.resolvePersistentFightTurn(telegramUserId, {
      sessionId: started.session.id,
      turn: 99,
      action: "attack"
    });

    expect(result.state).toBe("stale-turn");
    expect(sessions.updateCount).toBe(0);
  });

  it("does not apply the same persistent fight turn twice", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1, 0.1, 0.6, 0.1, 0.1, 0.6])
    );
    const started = await service.getFightForTelegramUser(telegramUserId);
    expect(started.state).toBe("persistent-active");
    if (started.state !== "persistent-active") {
      return;
    }

    const first = await service.resolvePersistentFightTurn(telegramUserId, {
      sessionId: started.session.id,
      turn: 1,
      action: "attack"
    });
    const repeated = await service.resolvePersistentFightTurn(telegramUserId, {
      sessionId: started.session.id,
      turn: 1,
      action: "attack"
    });

    expect(first.state).toBe("updated");
    expect(repeated.state).toBe("stale-turn");
    expect(sessions.updateCount).toBe(1);
    if (first.state === "updated" && repeated.state === "stale-turn") {
      expect(repeated.session.state).toEqual(first.session.state);
      expect(repeated.session.state?.turn).toBe(2);
    }
    expect(dailyActions.createCount).toBe(0);
  });

  it("persists and reloads a two-enemy fight after the primary enemy dies", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, {
      xp: 25,
      hpCurrent: 80,
      hpMax: 80,
      statsJson: {
        strength: 30,
        dexterity: 8,
        intelligence: 6,
        charisma: 6,
        luck: 6
      }
    });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1, 0.9, 0.99, 0.99, 0.1, 0.9, 0.99, 0.99])
    );
    const started = await service.getFightForTelegramUser(telegramUserId, {
      enemyCount: 2,
      devBypassAvailability: true
    });
    expect(started.state).toBe("persistent-active");
    if (started.state !== "persistent-active") {
      return;
    }
    const enemyNames = normalizeCombatEnemies(started.session.state!).map((enemy) => enemy.name);
    expect(enemyNames).toEqual([
      started.session.state!.monster.name,
      expect.any(String)
    ]);
    expect(enemyNames).not.toContain("Монстр 1");
    expect(enemyNames).not.toContain("Монстр 2");

    const reloadedAfterPrimaryDeath = moveSessionToPostPrimaryDeath(sessions, started.session.id);
    expect(normalizeCombatEnemies(reloadedAfterPrimaryDeath).map((enemy) => enemy.enemyId)).toEqual([
      "enemy:2",
      "enemy:1"
    ]);

    const second = await service.resolvePersistentFightTurn(telegramUserId, {
      sessionId: started.session.id,
      turn: reloadedAfterPrimaryDeath.turn,
      action: "attack"
    });

    expect(second.state).toBe("updated");
    if (second.state === "updated") {
      expect(second.session.state?.monster.id).toBe(normalizeCombatEnemies(second.session.state!)[0]!.id);
      expect(normalizeCombatEnemies(second.session.state!)[1]).toMatchObject({ enemyId: "enemy:1", hp: 0 });
      if (second.session.state?.status === "won") {
        expect(normalizeCombatEnemies(second.session.state).every((enemy) => enemy.hp === 0)).toBe(true);
      }
    }

    const stale = await service.resolvePersistentFightTurn(telegramUserId, {
      sessionId: started.session.id,
      turn: 1,
      action: "attack"
    });

    expect(stale.state).toBe("stale-turn");
    if (stale.state === "stale-turn") {
      expect(stale.session.state?.monster.id).toBe(normalizeCombatEnemies(stale.session.state!)[0]!.id);
    }
  });

  it("keeps two-enemy timeout replay safe after primary death", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, {
      xp: 25,
      hpCurrent: 80,
      hpMax: 80,
      statsJson: {
        strength: 30,
        dexterity: 8,
        intelligence: 6,
        charisma: 6,
        luck: 6
      }
    });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1, 0.9, 0.99, 0.99, 0.99, 0.99])
    );
    const started = await service.getFightForTelegramUser(telegramUserId, {
      enemyCount: 2,
      devBypassAvailability: true
    });
    expect(started.state).toBe("persistent-active");
    if (started.state !== "persistent-active") {
      return;
    }
    moveSessionToPostPrimaryDeath(sessions, started.session.id);
    sessions.setTurnExpiresAt(started.session.id, new Date("2026-06-12T10:29:59.000Z"));
    const due: DueSoloCombatSessionRecord = {
      ...sessions.getById(started.session.id)!,
      telegramUserId
    };

    const timeout = await service.resolveDuePersistentFightTurn(due);
    const duplicate = await service.resolveDuePersistentFightTurn(due);

    expect(timeout.state).toBe("updated");
    expect(duplicate.state).toBe("skipped");
    if (timeout.state === "updated") {
      expect(timeout.session.state?.lastTurn?.actionOrigin).toBe("timeout-auto-defend");
      expect(timeout.session.state?.monster.id).toBe(normalizeCombatEnemies(timeout.session.state!)[0]!.id);
      expect(normalizeCombatEnemies(timeout.session.state!)[1]).toMatchObject({ enemyId: "enemy:1", hp: 0 });
    }
  });

  it("advances a two-living-enemy fight on a due timeout and preserves the active card reference", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, {
      xp: 25,
      hpCurrent: 80,
      hpMax: 80,
      statsJson: {
        strength: 8,
        dexterity: 8,
        intelligence: 6,
        charisma: 6,
        luck: 6
      }
    });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.99, 0.99, 0.99, 0.99])
    );
    const started = await service.getFightForTelegramUser(telegramUserId, {
      enemyCount: 2,
      devBypassAvailability: true
    });
    expect(started.state).toBe("persistent-active");
    if (started.state !== "persistent-active") {
      return;
    }
    sessions.setTurnExpiresAt(started.session.id, new Date("2026-06-12T10:29:59.000Z"));
    sessions.setMessageReference(started.session.id, { chatId: "42", messageId: 587 });
    const due: DueSoloCombatSessionRecord = {
      ...sessions.getById(started.session.id)!,
      telegramUserId
    };

    const timeout = await service.resolveDuePersistentFightTurn(due);

    expect(timeout.state).toBe("updated");
    if (timeout.state === "updated") {
      expect(timeout.session.state?.turn).toBe(2);
      expect(timeout.session.state?.lastTurn?.actionOrigin).toBe("timeout-auto-defend");
      expect(timeout.session.state?.message).toEqual({ chatId: "42", messageId: 587 });
      expect(normalizeCombatEnemies(timeout.session.state!)).toHaveLength(2);
    }
  });

  it("does not let an older duplicate active session keep fighting", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1, 0.1, 0.6])
    );
    const started = await service.getFightForTelegramUser(telegramUserId);
    expect(started.state).toBe("persistent-active");
    if (started.state !== "persistent-active") {
      return;
    }
    const newerSession = sessions.addSession({
      ...started.session,
      id: "123e4567-e89b-42d3-a456-426614174111",
      updatedAt: new Date("2026-06-12T10:31:00.000Z")
    });

    const result = await service.resolvePersistentFightTurn(telegramUserId, {
      sessionId: started.session.id,
      turn: 1,
      action: "attack"
    });

    expect(result.state).toBe("stale-turn");
    if (result.state === "stale-turn") {
      expect(result.session.id).toBe(newerSession.id);
    }
    expect(sessions.updateCount).toBe(0);
    expect(dailyActions.createCount).toBe(0);
  });

  it("does not advance the persistent turn when a current skill action lacks mana", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25, classId: "class.mage", manaCurrent: 0, manaMax: 0 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1])
    );
    const started = await service.getFightForTelegramUser(telegramUserId);
    expect(started.state).toBe("persistent-active");
    if (started.state !== "persistent-active") {
      return;
    }
    sessions.setHeroMana(started.session.id, 0);

    const result = await service.resolvePersistentFightTurn(telegramUserId, {
      sessionId: started.session.id,
      turn: 1,
      action: "skill"
    });

    expect(result.state).toBe("not-enough-mana");
    if (result.state === "not-enough-mana") {
      expect(result.reason).toBe("not-enough-mana");
      expect(result.session.state?.turn).toBe(1);
      expect(result.session.state?.lastTurn).toBeUndefined();
    }
    expect(sessions.updateCount).toBe(0);
  });

  it("terminalizes an active persistent fight shown from overview when combat HP is zero", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1])
    );
    const started = await service.getFightForTelegramUser(telegramUserId);
    expect(started.state).toBe("persistent-active");
    if (started.state !== "persistent-active") {
      return;
    }
    sessions.setHeroHp(started.session.id, 0);

    const overview = await service.getFightOverviewForTelegramUser(telegramUserId);

    expect(overview.state).toBe("persistent-terminal");
    if (overview.state === "persistent-terminal") {
      expect(overview.session.state?.status).toBe("lost");
      expect(overview.session.state?.settlement?.status).toBe("completed");
      expect(overview.session.state?.completedAt).toBe("2026-06-12T10:30:00.000Z");
      expect(overview.session.state?.turnLog?.at(-1)).toMatchObject({
        eventId: "terminal:lost",
        summary: {
          action: "skip",
          heroOutcome: "lost"
        },
        hero: {
          hp: 0
        }
      });
    }
    expect(sessions.getById(started.session.id)?.status).toBe("lost");
    expect(dailyActions.createCount).toBe(1);
  });

  it("terminalizes an old active persistent turn when combat HP is zero", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1])
    );
    const started = await service.getFightForTelegramUser(telegramUserId);
    expect(started.state).toBe("persistent-active");
    if (started.state !== "persistent-active") {
      return;
    }
    sessions.setHeroHp(started.session.id, 0);

    const result = await service.resolvePersistentFightTurn(telegramUserId, {
      sessionId: started.session.id,
      turn: 1,
      action: "attack"
    });

    expect(result.state).toBe("terminal");
    if (result.state === "terminal") {
      expect(result.session.state?.status).toBe("lost");
      expect(result.session.state?.settlement?.status).toBe("completed");
      expect(result.session.state?.lastTurn).toMatchObject({
        action: "skip",
        heroOutcome: "lost"
      });
      expect(result.session.state?.turnLog?.at(-1)?.eventId).toBe("terminal:lost");
    }
    expect(sessions.getById(started.session.id)?.status).toBe("lost");
    expect(dailyActions.createCount).toBe(1);
  });

  it("replays terminal state for duplicate zero-HP persistent turn callbacks", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1])
    );
    const started = await service.getFightForTelegramUser(telegramUserId);
    expect(started.state).toBe("persistent-active");
    if (started.state !== "persistent-active") {
      return;
    }
    sessions.setHeroHp(started.session.id, 0);

    const first = await service.resolvePersistentFightTurn(telegramUserId, {
      sessionId: started.session.id,
      turn: 1,
      action: "attack"
    });
    const replayed = await service.resolvePersistentFightTurn(telegramUserId, {
      sessionId: started.session.id,
      turn: 1,
      action: "attack"
    });

    expect(first.state).toBe("terminal");
    expect(replayed.state).toBe("terminal");
    if (first.state === "terminal" && replayed.state === "terminal") {
      expect(first.session.state?.status).toBe("lost");
      expect(replayed.session.state?.status).toBe("lost");
      expect(replayed.session.state?.turnLog?.filter((entry) => entry.eventId === "terminal:lost")).toHaveLength(1);
    }
    expect(dailyActions.createCount).toBe(1);
  });

  it("uses a basic defend for an expired persistent combat turn before handling late buttons", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1, 0.6])
    );
    const started = await service.getFightForTelegramUser(telegramUserId);
    expect(started.state).toBe("persistent-active");
    if (started.state !== "persistent-active") {
      return;
    }
    sessions.setMonsterHp(started.session.id, 80);
    sessions.setTurnExpiresAt(started.session.id, new Date("2026-06-12T10:29:59.000Z"));

    const result = await service.resolvePersistentFightTurn(telegramUserId, {
      sessionId: started.session.id,
      turn: 1,
      action: "defend"
    });

    expect(result.state).toBe("stale-turn");
    if (result.state === "stale-turn") {
      expect(result.session.state?.turn).toBe(2);
      expect(result.session.state?.lastTurn?.action).toBe("defend");
      expect(result.session.state?.lastTurn?.debugTrace?.timeoutMode).toBe("auto-defend");
      expect(result.session.state?.lastTurn?.actionOrigin).toBe("timeout-auto-defend");
      expect(result.session.state?.turnLog?.[0]).toMatchObject({
        turn: 1,
        summary: {
          action: "defend",
          actionOrigin: "timeout-auto-defend"
        }
      });
      expect(result.session.state?.turnLog?.[0]?.summary).toEqual(result.session.state.lastTurn);
      expect(result.session.state?.timeout?.consecutiveMissedTurns).toBe(1);
      expect(result.session.state?.turnExpiresAt).toBe("2026-06-12T10:30:23.000Z");
    }
    expect(sessions.updateCount).toBe(1);
    expect(dailyActions.createCount).toBe(0);
  });

  it("defends on the second consecutive timeout recovered from overview", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.6])
    );
    const started = await service.getFightForTelegramUser(telegramUserId);
    expect(started.state).toBe("persistent-active");
    if (started.state !== "persistent-active") {
      return;
    }
    sessions.setMonsterHp(started.session.id, 80);
    sessions.setTurnExpiresAt(started.session.id, new Date("2026-06-12T10:29:59.000Z"));
    sessions.setTimeoutStreak(started.session.id, 1);

    const result = await service.getFightOverviewForTelegramUser(telegramUserId);

    expect(result.state).toBe("persistent-active");
    if (result.state === "persistent-active") {
      expect(result.session.state?.turn).toBe(2);
      expect(result.session.state?.lastTurn).toMatchObject({
        action: "defend",
        heroOutcome: "defended",
        heroDamage: 0,
        debugTrace: {
          timeoutMode: "auto-defend"
        }
      });
      expect(result.session.state?.timeout?.consecutiveMissedTurns).toBe(2);
      expect(result.session.state?.lastTurn?.actionOrigin).toBe("timeout-auto-defend");
      expect(result.session.state?.monster.hp).toBe(80);
      expect(result.session.state?.turnExpiresAt).toBe("2026-06-12T10:30:23.000Z");
    }
    expect(dailyActions.createCount).toBe(0);
  });

  it("expires a stale persistent fight lazily without rewards", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1])
    );
    const started = await service.getFightForTelegramUser(telegramUserId);
    expect(started.state).toBe("persistent-active");
    if (started.state !== "persistent-active") {
      return;
    }
    sessions.setExpiresAt(started.session.id, new Date("2026-06-12T10:00:00.000Z"));

    const result = await service.resolvePersistentFightTurn(telegramUserId, {
      sessionId: started.session.id,
      turn: 1,
      action: "attack"
    });

    expect(result.state).toBe("terminal");
    if (result.state === "terminal") {
      expect(result.session.state?.status).toBe("expired");
    }
    expect(dailyActions.createCount).toBe(0);
  });

  it("does not expire the third consecutive unattended persistent turn", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1, 0.9, 0.1, 0.9])
    );
    const started = await service.getFightForTelegramUser(telegramUserId);
    expect(started.state).toBe("persistent-active");
    if (started.state !== "persistent-active") {
      return;
    }
    sessions.setMonsterHp(started.session.id, 1);
    sessions.setTurnExpiresAt(started.session.id, new Date("2026-06-12T10:29:59.000Z"));
    sessions.setTimeoutStreak(started.session.id, 2);

    const due = {
      ...started.session,
      state: sessions.getById(started.session.id)?.state,
      telegramUserId
    } as DueSoloCombatSessionRecord;
    const result = await service.resolveDuePersistentFightTurn(due);

    expect(result.state).toBe("updated");
    if (result.state === "updated") {
      expect(result.session.state?.status).toBe("active");
      expect(result.session.state?.timeout?.consecutiveMissedTurns).toBe(3);
      expect(result.session.state?.lastTurn?.action).toBe("defend");
      expect(result.session.state?.lastTurn?.debugTrace).toMatchObject({
        timeoutMode: "auto-defend"
      });
    }
    expect(dailyActions.createCount).toBe(0);
  });

  it("resets the persistent timeout streak after an explicit player action", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.99, 0.9, 0.99, 0.9])
    );
    const started = await service.getFightForTelegramUser(telegramUserId);
    expect(started.state).toBe("persistent-active");
    if (started.state !== "persistent-active") {
      return;
    }
    sessions.setMonsterHp(started.session.id, 80);
    sessions.setTimeoutStreak(started.session.id, 1);
    sessions.setMessageReference(started.session.id, { chatId: "42", messageId: 587 });

    const result = await service.resolvePersistentFightTurn(telegramUserId, {
      sessionId: started.session.id,
      turn: started.session.state?.turn ?? 1,
      action: "attack"
    });

    expect(result.state).toBe("updated");
    if (result.state === "updated") {
      expect(result.session.state?.timeout).toBeUndefined();
      expect(result.session.state?.message).toEqual({ chatId: "42", messageId: 587 });
    }
  });

  it("does not reset the persistent timeout streak for an unavailable skill no-op", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25, classId: "class.mage", manaCurrent: 0, manaMax: 0 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1])
    );
    const started = await service.getFightForTelegramUser(telegramUserId);
    expect(started.state).toBe("persistent-active");
    if (started.state !== "persistent-active") {
      return;
    }
    sessions.setTimeoutStreak(started.session.id, 1);

    const result = await service.resolvePersistentFightTurn(telegramUserId, {
      sessionId: started.session.id,
      turn: started.session.state?.turn ?? 1,
      action: "skill"
    });

    expect(result.state).toBe("not-enough-mana");
    expect(sessions.getById(started.session.id)?.state?.timeout?.consecutiveMissedTurns).toBe(1);
  });

  it("commits only one persistent transition for duplicate due timeout ticks", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.99, 0.9, 0.99, 0.9])
    );
    const started = await service.getFightForTelegramUser(telegramUserId);
    expect(started.state).toBe("persistent-active");
    if (started.state !== "persistent-active") {
      return;
    }
    sessions.setMonsterHp(started.session.id, 80);
    sessions.setTurnExpiresAt(started.session.id, new Date("2026-06-12T10:29:59.000Z"));
    const due = {
      ...started.session,
      state: sessions.getById(started.session.id)?.state,
      telegramUserId
    } as DueSoloCombatSessionRecord;

    const first = await service.resolveDuePersistentFightTurn(due);
    const second = await service.resolveDuePersistentFightTurn(due);

    expect(first.state).toBe("updated");
    expect(second.state).toBe("skipped");
    expect(sessions.updateCount).toBe(1);
  });

  it("preserves the latest persistent fight message reference during stale due timeout recovery", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.99, 0.9, 0.99, 0.9])
    );
    const started = await service.getFightForTelegramUser(telegramUserId);
    expect(started.state).toBe("persistent-active");
    if (started.state !== "persistent-active") {
      return;
    }
    sessions.setMonsterHp(started.session.id, 80);
    sessions.setTurnExpiresAt(started.session.id, new Date("2026-06-12T10:29:59.000Z"));
    const staleDue = {
      ...started.session,
      state: {
        ...started.session.state!,
        turnExpiresAt: "2026-06-12T10:29:59.000Z"
      },
      telegramUserId
    } as DueSoloCombatSessionRecord;
    sessions.setMessageReference(started.session.id, { chatId: "42", messageId: 999 });

    const result = await service.resolveDuePersistentFightTurn(staleDue);

    expect(result.state).toBe("updated");
    expect(sessions.getById(started.session.id)?.state?.message).toEqual({
      chatId: "42",
      messageId: 999
    });
  });
});

function fixedClock(): Date {
  return new Date("2026-06-12T10:30:00.000Z");
}

function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

function buildEquipment(overrides: Partial<CharacterEquipmentRecord>): CharacterEquipmentRecord {
  return {
    id: "equipment-1",
    characterId: "character-42",
    slot: "weapon",
    itemId: "item.pan-of-persuasion",
    createdAt: fixedClock(),
    updatedAt: fixedClock(),
    ...overrides
  };
}

class FakeCharacterRepository implements CharacterRepository {
  private readonly charactersByTelegramUserId = new Map<bigint, CharacterRecord>();
  resourceUpdateCount = 0;

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

  patch(userTelegramId: bigint, overrides: Partial<CharacterRecord>): void {
    const character = this.charactersByTelegramUserId.get(userTelegramId);
    if (!character) {
      throw new Error("Character not found.");
    }
    this.charactersByTelegramUserId.set(userTelegramId, { ...character, ...overrides });
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
      level: getLevelForXp(nextXp, { remortCount: character.remortCount ?? 0 })
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

  updateResourcesForTelegramUser(
    userTelegramId: bigint,
    input: {
      hpCurrent: number;
      manaCurrent: number;
      hpRegenAt: Date;
      manaRegenAt: Date;
    }
  ): Promise<CharacterRecord | null> {
    const character = this.charactersByTelegramUserId.get(userTelegramId);

    if (!character) {
      return Promise.resolve(null);
    }

    this.resourceUpdateCount += 1;
    const updated = {
      ...character,
      hpCurrent: input.hpCurrent,
      manaCurrent: input.manaCurrent,
      hpRegenAt: input.hpRegenAt,
      manaRegenAt: input.manaRegenAt
    };
    this.charactersByTelegramUserId.set(userTelegramId, updated);

    return Promise.resolve(updated);
  }

  updateResourcesByCharacterId(
    characterId: string,
    input: {
      hpCurrent: number;
      manaCurrent: number;
      hpRegenAt: Date;
      manaRegenAt: Date;
    }
  ): CharacterRecord | null {
    for (const [telegramUserId, character] of this.charactersByTelegramUserId.entries()) {
      if (character.id !== characterId) {
        continue;
      }

      this.resourceUpdateCount += 1;
      const updated = {
        ...character,
        hpCurrent: input.hpCurrent,
        manaCurrent: input.manaCurrent,
        hpRegenAt: input.hpRegenAt,
        manaRegenAt: input.manaRegenAt
      };
      this.charactersByTelegramUserId.set(telegramUserId, updated);
      return updated;
    }

    return null;
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

  constructor(
    private readonly characters: FakeCharacterRepository,
    private readonly options: { autoIssueFirstProblemStage?: boolean } = {}
  ) {}

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

    this.ensureDefaultFirstProblemStageIssue(character, input);

    return this.actions.get(`${character.id}:${input.key}:${input.localDate}`) ?? null;
  }

  addAction(
    userTelegramId: bigint,
    key: string,
    localDate = "2026-06-12",
    createdAt = fixedClock()
  ): void {
    const characterId = `character-${userTelegramId.toString()}`;
    const action = {
      id: `daily-action-${this.actions.size + 1}`,
      characterId,
      key,
      localDate,
      rewardXp: 0,
      rewardGold: 0,
      createdAt
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

    this.ensureDefaultFirstProblemStageIssue(character, input);

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
    const itemGrants = (input.itemGrants ?? []).map(({ itemId, quantity }) => ({
      itemId,
      quantity
    }));
    this.grantedItems.push(...itemGrants);

    return {
      state: "created",
      action,
      character: updatedCharacter,
      itemGrants,
      levelChange: {
        oldLevel: getLevelForXp(character.xp, { remortCount: character.remortCount ?? 0 }),
        newLevel: updatedCharacter.level,
        leveledUp:
          updatedCharacter.level > getLevelForXp(character.xp, { remortCount: character.remortCount ?? 0 })
      }
    };
  }

  private ensureDefaultFirstProblemStageIssue(
    character: CharacterRecord,
    input: { key: string; localDate: string }
  ): void {
    if (
      this.options.autoIssueFirstProblemStage === false ||
      input.key !== PROBLEM_QUEST_STAGES[0].issueKey ||
      input.localDate !== PROBLEM_QUEST_BUCKET
    ) {
      return;
    }

    const key = `${character.id}:${input.key}:${input.localDate}`;

    if (this.actions.has(key)) {
      return;
    }

    this.actions.set(key, {
      id: `daily-action-${this.actions.size + 1}`,
      characterId: character.id,
      key: input.key,
      localDate: input.localDate,
      rewardXp: 0,
      rewardGold: 0,
      createdAt: new Date("2026-06-12T00:00:00.000Z")
    });
  }
}

class FakeEquipmentRepository implements EquipmentRepository {
  constructor(private snapshot: CharacterEquipmentSnapshot | null) {}

  listByTelegramUserId(): Promise<CharacterEquipmentSnapshot | null> {
    return Promise.resolve(this.snapshot);
  }

  setSnapshot(snapshot: CharacterEquipmentSnapshot | null): void {
    this.snapshot = snapshot;
  }

  equipForCharacter(): Promise<CharacterEquipmentRecord> {
    throw new Error("Not needed in this test.");
  }

  unequipForCharacter(): Promise<boolean> {
    throw new Error("Not needed in this test.");
  }
}

class FakePendingPassageEncounterRepository implements PendingPassageEncounterRepository {
  private readonly encounters = new Map<string, PendingPassageEncounterRecord>();
  createCount = 0;
  consumeCount = 0;

  constructor(
    private readonly characters: FakeCharacterRepository,
    private readonly sessions: FakeSoloCombatSessionRepository
  ) {}

  async findReusableForTelegramUser(
    telegramUserId: bigint,
    originLocationId: string,
    now: Date,
    rulesVersion?: string
  ): Promise<PendingPassageEncounterRecord | null> {
    const character = await this.characters.findByTelegramUserId(telegramUserId);
    if (!character) {
      return null;
    }

    return clonePendingEncounter(
      [...this.encounters.values()].find(
        (encounter) =>
          encounter.characterId === character.id &&
          encounter.originLocationId === originLocationId &&
          encounter.status === "pending" &&
          (!rulesVersion || encounter.rulesVersion === rulesVersion) &&
          encounter.expiresAt > now
      ) ?? null
    );
  }

  async findByTokenForTelegramUser(
    telegramUserId: bigint,
    token: string,
    rulesVersion?: string
  ): Promise<PendingPassageEncounterRecord | null> {
    const character = await this.characters.findByTelegramUserId(telegramUserId);
    const encounter = this.encounters.get(token);

    return clonePendingEncounter(
      character &&
        encounter?.characterId === character.id &&
        (!rulesVersion || encounter.rulesVersion === rulesVersion)
        ? encounter
        : null
    );
  }

  async findLatestConsumedForTelegramUser(
    telegramUserId: bigint,
    originLocationId: string,
    now: Date,
    rulesVersion?: string
  ): Promise<{ encounter: PendingPassageEncounterRecord; session: SoloCombatSessionRecord | null } | null> {
    const character = await this.characters.findByTelegramUserId(telegramUserId);
    if (!character) {
      return null;
    }

    const encounter =
      [...this.encounters.values()]
        .filter(
          (candidate) =>
            candidate.characterId === character.id &&
            candidate.originLocationId === originLocationId &&
            candidate.status === "consumed" &&
            (!rulesVersion || candidate.rulesVersion === rulesVersion) &&
            candidate.expiresAt > now
        )
        .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())[0] ?? null;

    return encounter
      ? {
          encounter: clonePendingEncounter(encounter)!,
          session: encounter.combatSessionId ? this.sessions.getById(encounter.combatSessionId) : null
        }
      : null;
  }

  async createForTelegramUser(
    telegramUserId: bigint,
    input: CreatePendingPassageEncounterInput
  ): Promise<PendingPassageEncounterRecord | null> {
    const character = await this.characters.findByTelegramUserId(telegramUserId);
    if (!character) {
      return null;
    }

    const existing = await this.findReusableForTelegramUser(
      telegramUserId,
      input.originLocationId,
      fixedClock(),
      input.rulesVersion
    );
    if (existing) {
      return existing;
    }

    this.createCount += 1;
    const encounter: PendingPassageEncounterRecord = {
      id: `pending-${this.createCount}`,
      token: input.token,
      characterId: character.id,
      originLocationId: input.originLocationId,
      passage: input.passage,
      difficulty: input.difficulty,
      monsterId: input.monsterId,
      baseMonsterLevel: input.baseMonsterLevel,
      effectiveMonsterLevel: input.effectiveMonsterLevel,
      rulesVersion: input.rulesVersion,
      seedHash: input.seedHash,
      status: "pending",
      version: 1,
      combatSessionId: null,
      expiresAt: input.expiresAt,
      consumedAt: null,
      cancelledAt: null,
      createdAt: fixedClock(),
      updatedAt: fixedClock()
    };
    this.encounters.set(encounter.token, encounter);
    return clonePendingEncounter(encounter);
  }

  expireById(input: {
    id: string;
    expectedStatus: "pending";
    expectedVersion: number;
    now: Date;
  }): Promise<
    | { state: "expired"; encounter: PendingPassageEncounterRecord }
    | { state: "already-consumed"; encounter: PendingPassageEncounterRecord }
    | { state: "already-terminal"; encounter: PendingPassageEncounterRecord }
    | { state: "version-changed"; encounter: PendingPassageEncounterRecord }
    | { state: "missing" }
  > {
    const encounter = [...this.encounters.values()].find((candidate) => candidate.id === input.id);
    if (!encounter) {
      return Promise.resolve({ state: "missing" });
    }

    if (encounter.status === "consumed") {
      return Promise.resolve({ state: "already-consumed", encounter: clonePendingEncounter(encounter)! });
    }

    if (encounter.status === "expired" || encounter.status === "cancelled") {
      return Promise.resolve({ state: "already-terminal", encounter: clonePendingEncounter(encounter)! });
    }

    if (encounter.status !== input.expectedStatus || encounter.version !== input.expectedVersion) {
      return Promise.resolve({ state: "version-changed", encounter: clonePendingEncounter(encounter)! });
    }

    const updated: PendingPassageEncounterRecord = {
      ...encounter,
      status: "expired",
      version: encounter.version + 1,
      cancelledAt: input.now,
      updatedAt: input.now
    };
    this.encounters.set(updated.token, updated);
    return Promise.resolve({ state: "expired", encounter: clonePendingEncounter(updated)! });
  }

  async consumeForTelegramUser(
    telegramUserId: bigint,
    token: string,
    input: ConsumePendingPassageEncounterInput
  ): Promise<ConsumePendingPassageEncounterResult> {
    return this.createSessionForEncounter(telegramUserId, token, input, "pending");
  }

  async createSessionForConsumedEncounter(
    telegramUserId: bigint,
    token: string,
    input: ConsumePendingPassageEncounterInput
  ): Promise<ConsumePendingPassageEncounterResult> {
    return this.createSessionForEncounter(telegramUserId, token, input, "consumed");
  }

  private async createSessionForEncounter(
    telegramUserId: bigint,
    token: string,
    input: ConsumePendingPassageEncounterInput,
    expectedStatus: "pending" | "consumed"
  ): Promise<ConsumePendingPassageEncounterResult> {
    const character = await this.characters.findByTelegramUserId(telegramUserId);
    const encounter = this.encounters.get(token);

    if (!character || !encounter || encounter.characterId !== character.id) {
      return { state: "invalid" };
    }

    this.consumeCount += 1;
    if (input.expectedRulesVersion && encounter.rulesVersion !== input.expectedRulesVersion) {
      return { state: "invalid" };
    }

    if (encounter.version !== input.expectedEncounterVersion) {
      return { state: "version-changed", encounter: clonePendingEncounter(encounter)! };
    }

    if (expectedStatus === "pending" && encounter.status === "consumed") {
      return {
        state: "already-consumed",
        encounter: clonePendingEncounter(encounter)!,
        session: encounter.combatSessionId ? this.sessions.getById(encounter.combatSessionId) : null
      };
    }

    if (encounter.status !== expectedStatus) {
      return { state: "not-pending", encounter: clonePendingEncounter(encounter)! };
    }

    if (expectedStatus === "consumed" && encounter.combatSessionId !== input.expectedLinkedSessionId) {
      return { state: "version-changed", encounter: clonePendingEncounter(encounter)! };
    }

    const session = this.sessions.addSession({
      id: input.sessionId,
      characterId: character.id,
      monsterId: input.monsterId,
      status: input.state.status,
      turn: input.state.turn,
      state: cloneState(input.state),
      reward: null,
      createdAt: input.now,
      updatedAt: input.now,
      expiresAt: input.sessionExpiresAt
    });
    const updated: PendingPassageEncounterRecord = {
      ...encounter,
      status: "consumed",
      version: encounter.version + 1,
      combatSessionId: session.id,
      consumedAt: input.now,
      updatedAt: input.now
    };
    this.encounters.set(updated.token, updated);

    return { state: "consumed", encounter: clonePendingEncounter(updated)!, session };
  }

  expireToken(token: string): void {
    const encounter = this.encounters.get(token);
    if (!encounter) {
      return;
    }

    this.encounters.set(token, {
      ...encounter,
      expiresAt: new Date(fixedClock().getTime() - 1)
    });
  }

  setRulesVersion(token: string, rulesVersion: string): void {
    const encounter = this.encounters.get(token);
    if (!encounter) {
      return;
    }

    this.encounters.set(token, {
      ...encounter,
      rulesVersion
    });
  }
}

class FakeSoloCombatSessionRepository implements SoloCombatSessionRepository {
  private readonly sessions = new Map<string, SoloCombatSessionRecord>();
  private persistRewardReplay = true;
  activeSessionToReturnOnCreate: SoloCombatSessionRecord | null = null;
  createCount = 0;
  updateCount = 0;
  readonly combatItemStacks = new Map<string, number>();
  readonly consumedCombatItems: string[] = [];

  constructor(private readonly characters: FakeCharacterRepository) {}

  async countWonByTelegramUserId(
    telegramUserId: bigint,
    options: { excludeMonsterIds?: readonly string[]; since?: Date } = {}
  ): Promise<number> {
    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character) {
      return 0;
    }

    const excludedMonsterIds = new Set(options.excludeMonsterIds ?? []);

    return [...this.sessions.values()].filter(
      (candidate) =>
        candidate.characterId === character.id &&
        candidate.status === "won" &&
        (!options.since || candidate.createdAt > options.since) &&
        !excludedMonsterIds.has(candidate.monsterId)
    ).length;
  }

  async listCompletedByTelegramUserIdSince(
    telegramUserId: bigint,
    since: Date
  ): Promise<Array<Pick<SoloCombatSessionRecord, "monsterId" | "status" | "createdAt" | "updatedAt" | "state"> & { completedAt: Date }>> {
    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character) {
      return [];
    }

    return [...this.sessions.values()]
      .flatMap((candidate) => {
        const completedAt = getSessionCompletionTime(candidate);

        if (candidate.characterId !== character.id || !completedAt || completedAt < since) {
          return [];
        }

        return [{
          monsterId: candidate.monsterId,
          status: candidate.status,
          state: candidate.state,
          createdAt: candidate.createdAt,
          updatedAt: candidate.updatedAt,
          completedAt
        }];
      });
  }

  async listRecentCompletedByTelegramUserId(
    telegramUserId: bigint,
    limit: number
  ): Promise<Array<Pick<SoloCombatSessionRecord, "monsterId" | "status" | "createdAt" | "updatedAt" | "state"> & { completedAt: Date }>> {
    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character) {
      return [];
    }

    return [...this.sessions.values()]
      .flatMap((candidate) => {
        const completedAt = getSessionCompletionTime(candidate);

        if (candidate.characterId !== character.id || !completedAt) {
          return [];
        }

        return [{
          monsterId: candidate.monsterId,
          status: candidate.status,
          state: candidate.state,
          createdAt: candidate.createdAt,
          updatedAt: candidate.updatedAt,
          completedAt
        }];
      })
      .sort((left, right) => right.completedAt.getTime() - left.completedAt.getTime())
      .slice(0, Math.max(1, Math.floor(limit)));
  }

  async clearMonsterRestCooldownForTelegramUser(
    telegramUserId: bigint,
    input: { since: Date; completedAt: Date }
  ): Promise<number> {
    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character) {
      return 0;
    }

    let updated = 0;
    for (const session of this.sessions.values()) {
      const completedAt = getSessionCompletionTime(session);
      const state = session.state;
      if (
        session.characterId !== character.id ||
        state?.source !== "normal" ||
        !completedAt ||
        completedAt < input.since
      ) {
        continue;
      }

      this.sessions.set(session.id, {
        ...session,
        state: {
          ...state,
          completedAt: input.completedAt.toISOString()
        }
      });
      updated += 1;
    }

    return updated;
  }

  async listRecentOrdinaryMonsterIdsByTelegramUserId(
    telegramUserId: bigint,
    limit: number
  ): Promise<string[]> {
    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character) {
      return [];
    }

    const result: string[] = [];
    const seen = new Set<string>();
    for (const session of [...this.sessions.values()]
      .filter((candidate) => candidate.characterId === character.id && candidate.state?.source === "normal")
      .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())) {
      if (seen.has(session.monsterId)) {
        continue;
      }
      result.push(session.monsterId);
      seen.add(session.monsterId);
      if (result.length >= limit) {
        break;
      }
    }

    return result;
  }

  async findActiveByTelegramUserId(
    telegramUserId: bigint
  ): Promise<SoloCombatSessionRecord | null> {
    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character) {
      return null;
    }

    const session =
      [...this.sessions.values()]
        .filter((candidate) => candidate.characterId === character.id && candidate.status === "active")
        .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())[0] ?? null;

    return session ? cloneSession(session) : null;
  }

  async findByIdForTelegramUserId(
    telegramUserId: bigint,
    sessionId: string
  ): Promise<SoloCombatSessionRecord | null> {
    const character = await this.characters.findByTelegramUserId(telegramUserId);
    const session = this.sessions.get(sessionId);

    if (!character || !session || session.characterId !== character.id) {
      return null;
    }

    return cloneSession(session);
  }

  async createForTelegramUser(
    telegramUserId: bigint,
    input: CreateSoloCombatSessionInput
  ): Promise<SoloCombatSessionRecord | null> {
    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character) {
      return null;
    }

    this.createCount += 1;
    if (this.activeSessionToReturnOnCreate) {
      const activeSession = this.addSession(this.activeSessionToReturnOnCreate);
      this.activeSessionToReturnOnCreate = null;
      return activeSession;
    }

    const now = fixedClock();
    const session: SoloCombatSessionRecord = {
      id: input.id ?? `session-${this.createCount}`,
      characterId: character.id,
      monsterId: input.monsterId,
      status: input.state.status,
      turn: input.state.turn,
      state: cloneState(input.state),
      reward: null,
      createdAt: now,
      updatedAt: now,
      expiresAt: input.expiresAt
    };
    this.sessions.set(session.id, session);
    return cloneSession(session);
  }

  updateById(
    sessionId: string,
    input: UpdateSoloCombatSessionInput
  ): Promise<SoloCombatSessionRecord | null> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return Promise.resolve(null);
    }

    this.updateCount += 1;
    const updated: SoloCombatSessionRecord = {
      ...session,
      status: input.status,
      turn: input.state.turn,
      state: cloneState(input.state),
      updatedAt: fixedClock(),
      expiresAt: input.expiresAt ?? session.expiresAt
    };
    this.sessions.set(sessionId, updated);
    return Promise.resolve(cloneSession(updated));
  }

  updateByIdIfActiveTurn(
    sessionId: string,
    expectedTurn: number,
    input: UpdateSoloCombatSessionInput
  ): Promise<SoloCombatSessionRecord | null> {
    const session = this.sessions.get(sessionId);

    if (!session || session.status !== "active" || session.turn !== expectedTurn) {
      return Promise.resolve(null);
    }

    return this.updateById(sessionId, input);
  }

  async applyCombatItemTurnById(
    sessionId: string,
    expectedTurn: number,
    input: ApplyCombatItemTurnInput
  ): Promise<ApplyCombatItemTurnResult> {
    const quantity = this.combatItemStacks.get(input.itemId) ?? 0;
    if (quantity < 1) {
      return { outcome: "not-owned", session: null };
    }

    const updated = await this.updateByIdIfActiveTurn(sessionId, expectedTurn, input);
    if (!updated) {
      return { outcome: "stale-turn", session: null };
    }

    this.combatItemStacks.set(input.itemId, quantity - 1);
    this.consumedCombatItems.push(input.itemId);

    return { outcome: "updated", session: updated };
  }

  applyTerminalResourcesById(
    sessionId: string,
    input: {
      appliedAt: Date;
      resources: {
        hpCurrent: number;
        manaCurrent: number;
        hpRegenAt: Date;
        manaRegenAt: Date;
      };
    }
  ): Promise<{ outcome: "applied" | "already-applied" | "already-completed" | "already-forfeited"; session: SoloCombatSessionRecord | null }> {
    const session = this.sessions.get(sessionId);

    if (!session?.state) {
      return Promise.resolve({ outcome: "applied", session: session ? cloneSession(session) : null });
    }

    if (session.state.settlement?.status === "completed") {
      return Promise.resolve({ outcome: "already-completed", session: cloneSession(session) });
    }

    if (session.state.settlement?.status === "forfeited-by-remort") {
      return Promise.resolve({ outcome: "already-forfeited", session: cloneSession(session) });
    }

    if (session.state.settlement?.resources?.status === "applied") {
      return Promise.resolve({ outcome: "already-applied", session: cloneSession(session) });
    }

    this.characters.updateResourcesByCharacterId(session.characterId, input.resources);
    const state: CombatState = {
      ...session.state,
      settlement: {
        ...(session.state.settlement ?? { status: "pending" as const, version: 1 }),
        version: (session.state.settlement?.version ?? 1) + 1,
        resources: {
          status: "applied",
          appliedAt: input.appliedAt.toISOString(),
          hpCurrent: input.resources.hpCurrent,
          manaCurrent: input.resources.manaCurrent,
          hpRegenAt: input.resources.hpRegenAt.toISOString(),
          manaRegenAt: input.resources.manaRegenAt.toISOString()
        }
      }
    };
    const updated: SoloCombatSessionRecord = {
      ...session,
      state,
      status: state.status,
      turn: state.turn,
      updatedAt: fixedClock()
    };
    this.sessions.set(sessionId, updated);

    return Promise.resolve({ outcome: "applied", session: cloneSession(updated) });
  }

  recordRewardById(
    sessionId: string,
    input: RecordSoloCombatRewardInput
  ): Promise<SoloCombatSessionRecord | null> {
    const session = this.sessions.get(sessionId);

    if (!session || !this.persistRewardReplay) {
      return Promise.resolve(null);
    }

    const updated: SoloCombatSessionRecord = {
      ...session,
      reward: {
        xp: input.rewardXp,
        gold: input.rewardGold,
        itemGrants: input.itemGrants,
        claimedAt: input.claimedAt
      },
      updatedAt: fixedClock()
    };
    this.sessions.set(sessionId, updated);
    return Promise.resolve(cloneSession(updated));
  }

  completeSettlementById(
    sessionId: string,
    input: {
      expected?: {
        settlementVersion?: number;
      };
      settledAt: Date;
      reward?: {
        rewardXp: number;
        rewardGold: number;
        itemGrants: Array<{ itemId: string; quantity: number }>;
        claimedAt: Date;
      };
    }
  ): Promise<{
    outcome: "completed" | "already-completed" | "already-forfeited" | "version-changed";
    session: SoloCombatSessionRecord | null;
  }> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return Promise.resolve({ outcome: "completed", session: null });
    }

    if (session.state?.settlement?.status === "completed") {
      return Promise.resolve({ outcome: "already-completed", session: cloneSession(session) });
    }

    if (session.state?.settlement?.status === "forfeited-by-remort") {
      return Promise.resolve({ outcome: "already-forfeited", session: cloneSession(session) });
    }

    if (
      input.expected?.settlementVersion !== undefined &&
      session.state?.settlement?.version !== input.expected.settlementVersion
    ) {
      return Promise.resolve({ outcome: "version-changed", session: cloneSession(session) });
    }

    if (!input.reward) {
      this.updateCount += 1;
    }
    const state = session.state
      ? markCombatSettlementCompleted(session.state, input.settledAt)
      : session.state;
    const updated: SoloCombatSessionRecord = {
      ...session,
      ...(state ? { state, status: state.status, turn: state.turn } : {}),
      ...(input.reward && this.persistRewardReplay
        ? {
            reward: {
              xp: input.reward.rewardXp,
              gold: input.reward.rewardGold,
              itemGrants: input.reward.itemGrants,
              claimedAt: input.reward.claimedAt
            }
          }
        : {}),
      updatedAt: fixedClock()
    };
    this.sessions.set(sessionId, updated);
    return Promise.resolve({ outcome: "completed", session: cloneSession(updated) });
  }

  forfeitSettlementById(
    sessionId: string,
    input: { settledAt: Date; reason: "remort" | "life-mismatch" | "legacy-life-mismatch" }
  ): Promise<{ outcome: "forfeited" | "already-completed" | "already-forfeited"; session: SoloCombatSessionRecord | null }> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return Promise.resolve({ outcome: "forfeited", session: null });
    }

    if (session.state?.settlement?.status === "completed") {
      return Promise.resolve({ outcome: "already-completed", session: cloneSession(session) });
    }

    if (session.state?.settlement?.status === "forfeited-by-remort") {
      return Promise.resolve({ outcome: "already-forfeited", session: cloneSession(session) });
    }

    this.updateCount += 1;
    const state = session.state
      ? markCombatSettlementForfeitedByRemort(session.state, input.settledAt, input.reason)
      : session.state;
    const updated: SoloCombatSessionRecord = {
      ...session,
      ...(state ? { state, status: state.status, turn: state.turn } : {}),
      updatedAt: fixedClock()
    };
    this.sessions.set(sessionId, updated);
    return Promise.resolve({ outcome: "forfeited", session: cloneSession(updated) });
  }

  dropRewardReplayWrites(): void {
    this.persistRewardReplay = false;
  }

  getById(sessionId: string): SoloCombatSessionRecord | null {
    const session = this.sessions.get(sessionId);

    return session ? cloneSession(session) : null;
  }

  markStatusById(
    sessionId: string,
    status: SoloCombatSessionStatus
  ): Promise<SoloCombatSessionRecord | null> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return Promise.resolve(null);
    }

    const updated = {
      ...session,
      status,
      updatedAt: fixedClock()
    };
    this.sessions.set(sessionId, updated);
    return Promise.resolve(cloneSession(updated));
  }

  setExpiresAt(sessionId: string, expiresAt: Date): void {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return;
    }

    this.sessions.set(sessionId, {
      ...session,
      expiresAt
    });
  }

  setTurnExpiresAt(sessionId: string, turnExpiresAt: Date): void {
    const session = this.sessions.get(sessionId);

    if (!session?.state) {
      return;
    }

    this.sessions.set(sessionId, {
      ...session,
      state: {
        ...session.state,
        turnExpiresAt: turnExpiresAt.toISOString()
      }
    });
  }

  setTimeoutStreak(sessionId: string, consecutiveMissedTurns: number): void {
    const session = this.sessions.get(sessionId);

    if (!session?.state) {
      return;
    }

    this.sessions.set(sessionId, {
      ...session,
      state: {
        ...session.state,
        timeout: {
          consecutiveMissedTurns
        }
      }
    });
  }

  setMessageReference(sessionId: string, message: NonNullable<CombatState["message"]>): void {
    const session = this.sessions.get(sessionId);

    if (!session?.state) {
      return;
    }

    this.sessions.set(sessionId, {
      ...session,
      state: {
        ...session.state,
        message: { ...message }
      }
    });
  }

  setHeroMana(sessionId: string, mana: number): void {
    const session = this.sessions.get(sessionId);

    if (!session?.state) {
      return;
    }

    this.sessions.set(sessionId, {
      ...session,
      state: {
        ...session.state,
        hero: {
          ...session.state.hero,
          mana
        }
      }
    });
  }

  setHeroHp(sessionId: string, hp: number): void {
    const session = this.sessions.get(sessionId);

    if (!session?.state) {
      return;
    }

    this.sessions.set(sessionId, {
      ...session,
      state: {
        ...session.state,
        hero: {
          ...session.state.hero,
          hp
        }
      }
    });
  }

  setMonsterHp(sessionId: string, hp: number): void {
    const session = this.sessions.get(sessionId);

    if (!session?.state) {
      return;
    }

    this.sessions.set(sessionId, {
      ...session,
      state: {
        ...session.state,
        monster: {
          ...session.state.monster,
          hp
        }
      }
    });
  }

  clearMonsterRuntime(sessionId: string): void {
    const session = this.sessions.get(sessionId);

    if (!session?.state) {
      return;
    }

    const stateWithoutRuntime = { ...session.state };
    delete stateWithoutRuntime.monsterRuntime;
    this.sessions.set(sessionId, {
      ...session,
      state: stateWithoutRuntime
    });
  }

  addSession(session: SoloCombatSessionRecord): SoloCombatSessionRecord {
    const cloned = cloneSession(session);
    this.sessions.set(cloned.id, cloned);
    return cloneSession(cloned);
  }

  addWonSessions(
    characterId: string,
    count: number,
    monsterId = "monster.deadline-spider",
    options: { createdAt?: Date } = {}
  ): void {
    for (let index = 0; index < count; index += 1) {
      this.addSession(
        makeTerminalSession(
          "won",
          `session-won-${monsterId.replace(/[^a-z0-9]+/g, "-")}-${index + 1}`,
          characterId,
          monsterId,
          options
        )
      );
    }
  }
}

function makeActivePersistentSession(input: {
  id: string;
  characterId: string;
  monsterId: string;
}): SoloCombatSessionRecord {
  const createdAt = fixedClock();

  return {
    id: input.id,
    characterId: input.characterId,
    monsterId: input.monsterId,
    status: "active",
    turn: 1,
    state: {
      id: input.id,
      turn: 1,
      status: "active",
      hero: {
        hp: 20,
        hpMax: 24,
        mana: 10,
        manaMax: 12
      },
      monster: {
        id: input.monsterId,
        hp: 18,
        hpMax: 18,
        debugTrace: {
          interventionKind: "help",
          interventionSourceKey: "prypichnyk",
          baseMonsterLevel: 2,
          effectiveMonsterLevel: 1
        }
      }
    },
    reward: null,
    createdAt,
    updatedAt: createdAt,
    expiresAt: new Date("2026-06-12T11:00:00.000Z")
  };
}

function makeTerminalSession(
  status: Exclude<SoloCombatSessionStatus, "active">,
  id = `session-${status}`,
  characterId = "character-42",
  monsterId = "monster.deadline-spider",
  options: {
    createdAt?: Date;
    updatedAt?: Date;
    completedAt?: Date | null;
    settlement?: "pending" | "completed" | "forfeited-by-remort" | null;
  } = {}
): SoloCombatSessionRecord {
  const createdAt = options.createdAt ?? fixedClock();
  const completedAt = options.completedAt === undefined ? (options.updatedAt ?? createdAt) : options.completedAt;
  const updatedAt = options.updatedAt ?? completedAt ?? createdAt;
  const settlement = options.settlement === undefined ? "pending" : options.settlement;

  return {
    id,
    characterId,
    monsterId,
    status,
    turn: 2,
    state: {
      id,
      ...(completedAt ? { completedAt: completedAt.toISOString() } : {}),
      life: {
        characterId,
        remortCount: 0,
        startedAt: createdAt.toISOString()
      },
      ...(settlement
        ? {
            settlement: {
              status: settlement,
              version: 1,
              ...(settlement === "pending"
                ? {}
                : {
                    settledAt: updatedAt.toISOString(),
                    reason: settlement === "completed" ? "terminal" : "remort"
                  })
            }
          }
        : {}),
      turn: 2,
      status,
      hero: {
        hp: status === "lost" ? 0 : 20,
        hpMax: 24,
        mana: 10,
        manaMax: 12
      },
      monster: {
        id: monsterId,
        hp: status === "won" ? 0 : 5,
        hpMax: 18
      }
    },
    reward: null,
    createdAt,
    updatedAt,
    expiresAt: new Date("2026-06-12T11:00:00.000Z")
  };
}

function makeEligibleOrdinaryThreatSession(
  status: Exclude<SoloCombatSessionStatus, "active">,
  id: string,
  options: {
    completedAt: Date;
    characterId?: string;
    source?: "normal" | "yeger" | "adventure" | "training";
    monsterId?: string;
    enemyCount?: 1 | 2;
    escalated?: boolean;
    threatLineId?: string;
    threatLineVersion?: string;
    threatExclusion?: boolean;
    settlement?: "pending" | "completed" | "forfeited-by-remort" | null;
  }
): SoloCombatSessionRecord {
  const monsterId = options.monsterId ?? "monster.deadline-spider";
  const session = makeTerminalSession(
    status,
    id,
    options.characterId ?? `character-${telegramUserId.toString()}`,
    monsterId,
    {
      createdAt: new Date(options.completedAt.getTime() - 60_000),
      completedAt: options.completedAt,
      updatedAt: options.completedAt,
      settlement: options.settlement ?? "completed"
    }
  );
  const state: NonNullable<SoloCombatSessionRecord["state"]> = {
    ...session.state!,
    source: options.source ?? "normal",
    ...(options.escalated
      ? {
          threat: {
            version: 1 as const,
            enemyCount: 2 as const,
            reason: "ordinary-win-streak" as const,
            eligibleWins: 3 as const,
            lineId: options.threatLineId ?? "nyz-added-witnesses",
            lineVersion: options.threatLineVersion ?? "threat-escalation-v1"
          }
        }
      : {}),
    ...(options.threatExclusion
      ? {
          threatExclusion: {
            version: 1 as const,
            reason: "dev-forced-two-enemies" as const
          }
        }
      : {})
  };

  if (options.enemyCount === 2 || options.escalated) {
    state.enemies = [
      {
        enemyId: "enemy:1",
        id: monsterId,
        hp: status === "won" ? 0 : 5,
        hpMax: 18
      },
      {
        enemyId: "enemy:2",
        id: "monster.complaint-lantern",
        hp: status === "won" ? 0 : 7,
        hpMax: 16
      }
    ];
  }

  return {
    ...session,
    state
  };
}

function getSessionCompletionTime(session: SoloCombatSessionRecord): Date | null {
  if (session.status === "active" || session.state?.status === "active") {
    return null;
  }

  if (session.state?.completedAt) {
    const completedAt = new Date(session.state.completedAt);

    if (!Number.isNaN(completedAt.getTime())) {
      return completedAt;
    }
  }

  return session.createdAt;
}

function makeActiveTrainingSession(characterId = "character-42"): SoloCombatSessionRecord {
  const id = "training-session-1";
  const createdAt = fixedClock();

  return {
    id,
    characterId,
    monsterId: TRAINING_DOPPELGANGER_MONSTER_ID,
    status: "active",
    turn: 1,
    state: {
      id,
      turn: 1,
      status: "active",
      hero: {
        hp: 20,
        hpMax: 24,
        mana: 10,
        manaMax: 12
      },
      monster: {
        id: TRAINING_DOPPELGANGER_MONSTER_ID,
        hp: 20,
        hpMax: 24
      }
    },
    reward: null,
    createdAt,
    updatedAt: createdAt,
    expiresAt: new Date("2026-06-12T11:00:00.000Z")
  };
}

function cloneSession(session: SoloCombatSessionRecord): SoloCombatSessionRecord {
  return {
    ...session,
    reward: session.reward
      ? {
          ...session.reward,
          itemGrants: session.reward.itemGrants.map((grant) => ({ ...grant }))
        }
      : null,
    state: session.state ? cloneState(session.state) : null
  };
}

function clonePendingEncounter(
  encounter: PendingPassageEncounterRecord | null
): PendingPassageEncounterRecord | null {
  return encounter
    ? {
        ...encounter,
        expiresAt: new Date(encounter.expiresAt),
        consumedAt: encounter.consumedAt ? new Date(encounter.consumedAt) : null,
        cancelledAt: encounter.cancelledAt ? new Date(encounter.cancelledAt) : null,
        createdAt: new Date(encounter.createdAt),
        updatedAt: new Date(encounter.updatedAt)
      }
    : null;
}

function moveSessionToPostPrimaryDeath(
  sessions: FakeSoloCombatSessionRepository,
  sessionId: string
): CombatState {
  const session = sessions.getById(sessionId);
  const enemies = session?.state?.enemies;

  if (!session?.state || !enemies?.[0] || !enemies[1]) {
    throw new Error("Expected a two-enemy session.");
  }

  const livingEnemy = {
    ...enemies[1],
    hp: 60,
    hpMax: 60
  };
  const deadEnemy = {
    ...enemies[0],
    hp: 0
  };
  const monster = { ...livingEnemy } as CombatState["monster"] & {
    enemyId?: string;
    monsterRuntime?: unknown;
  };
  delete monster.enemyId;
  delete monster.monsterRuntime;
  const state: CombatState = {
    ...session.state,
    turn: 2,
    monster,
    ...(livingEnemy.monsterRuntime ? { monsterRuntime: livingEnemy.monsterRuntime } : {}),
    enemies: [livingEnemy, deadEnemy]
  };

  sessions.addSession({
    ...session,
    turn: 2,
    state
  });

  return state;
}

function cloneState(state: CombatState): CombatState {
  return JSON.parse(JSON.stringify(state)) as CombatState;
}
