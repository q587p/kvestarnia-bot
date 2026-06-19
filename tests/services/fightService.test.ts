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
  CreateSoloCombatSessionInput,
  SoloCombatSessionRecord,
  SoloCombatSessionRepository,
  SoloCombatSessionStatus,
  RecordSoloCombatRewardInput,
  UpdateSoloCombatSessionInput
} from "../../src/db/repositories/soloCombatSessionRepository";
import type {
  CharacterEquipmentRecord,
  CharacterEquipmentSnapshot,
  EquipmentRepository
} from "../../src/db/repositories/equipmentRepository";
import type { TelegramUserProfile } from "../../src/db/repositories/userRepository";
import type { CombatState } from "../../src/domain/combat";
import { getLevelForXp } from "../../src/domain/progression/level";
import { TRAINING_DOPPELGANGER_MONSTER_ID } from "../../src/domain/trainingDoppelganger";
import { FakeRandomSource } from "../../src/shared/random";
import { MIMIC_SHAWARMA_ADVENTURE_KEY } from "../../src/services/adventureService";
import {
  FightService,
  getPersistentFightDifficultyConfig,
  MIMIC_SHAWARMA_COMBAT_PROBE_KEY,
  PERSISTENT_SOLO_FIGHT_REWARD_KEY,
  PROBLEM_QUEST_BUCKET,
  PROBLEM_QUEST_STAGES,
  selectPersistentFightMonsterLevel,
  THIRTEEN_SMALL_PROBLEMS_QUEST_KEY
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
      xp: 7,
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
      xp: 9,
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
      xpMultiplier: 0.6,
      goldMultiplier: 0.7,
      dropChanceMultiplier: 0.5,
      lootPowerOffset: -2
    });
    expect(getPersistentFightDifficultyConfig("normal")).toMatchObject({
      xpMultiplier: 1,
      goldMultiplier: 1,
      dropChanceMultiplier: 1
    });
    expect(getPersistentFightDifficultyConfig("hard")).toMatchObject({
      levelDelta: 2,
      xpMultiplier: 1.1,
      goldMultiplier: 1.1,
      dropChanceMultiplier: 1.2,
      lootPowerOffset: 1
    });
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
      expect(started.monster.level).toBe(1);
      expect(started.session.state?.monster.debugTrace).toMatchObject({
        interventionKind: "help",
        interventionSourceKey: "prypichnyk",
        baseMonsterLevel: started.session.state.monster.debugTrace?.baseMonsterLevel,
        effectiveMonsterLevel: 1
      });
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
      expect(second.monster.level).toBe(1);
      expect(second.session.state?.monster.debugTrace?.interventionKind).toBe("help");
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
    }
    expect(sessions.updateCount).toBe(1);
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
      expect(result.fightReward?.reward.itemGrants.length).toBeLessThanOrEqual(1);
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
    expect(rewardRecords).toHaveLength(1);
  });

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

  it("rounds easy passage rewards down while preserving left-center-right ordering", async () => {
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

    expect(easy).toEqual({ xp: 8, gold: 3 });
    expect(normal).toEqual({ xp: 14, gold: 7 });
    expect(hard).toEqual({ xp: 15, gold: 8 });
    expect(easy.xp).toBeLessThan(normal.xp);
    expect(normal.xp).toBeLessThan(hard.xp);
    expect(easy.gold).toBeLessThan(normal.gold);
    expect(normal.gold).toBeLessThan(hard.gold);
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
    expect(easy.gold).toBeLessThan(normal.gold);
    expect(normal.gold).toBeLessThan(hard.gold);
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
      expect(recovered.fightReward?.reward.xp).toBe(3);
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

  it("blocks a new ordinary monster fight for three minutes after the third eligible fight completes", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(characters, dailyActions, fixedClock, sessions);

    await service.issueNextProblemQuestForTelegramUser(telegramUserId);

    for (const [index, createdAt] of [
      new Date("2026-06-12T10:28:00.000Z"),
      new Date("2026-06-12T10:29:00.000Z"),
      new Date("2026-06-12T10:29:30.000Z")
    ].entries()) {
      const completedAt = new Date(`2026-06-12T10:29:${40 + index}.000Z`);
      sessions.addSession({
        ...makeTerminalSession(
          "won",
          `ordinary-rest-${index + 1}`,
          `character-${telegramUserId.toString()}`,
          "monster.deadline-spider",
          { createdAt, updatedAt: completedAt }
        ),
        state: {
          ...makeTerminalSession(
            "won",
            `ordinary-rest-${index + 1}`,
            `character-${telegramUserId.toString()}`,
            "monster.deadline-spider",
            { createdAt, updatedAt: completedAt }
          ).state!,
          source: "normal"
        }
      });
    }

    const overview = await service.getFightOverviewForTelegramUser(telegramUserId);

    expect(overview).toMatchObject({
      state: "monster-rest",
      availableAt: new Date("2026-06-12T10:32:42.000Z"),
      now: fixedClock()
    });
  });

  it("keeps monster rest active until the exact third-completion boundary", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    let now = new Date("2026-06-12T10:32:59.999Z");
    const service = new FightService(characters, dailyActions, () => now, sessions);

    await service.issueNextProblemQuestForTelegramUser(telegramUserId);

    for (const [index, completedAt] of [
      new Date("2026-06-12T10:29:00.000Z"),
      new Date("2026-06-12T10:29:30.000Z"),
      new Date("2026-06-12T10:30:00.000Z")
    ].entries()) {
      const session = makeTerminalSession(
        "won",
        `ordinary-boundary-${index + 1}`,
        `character-${telegramUserId.toString()}`,
        "monster.deadline-spider",
        {
          createdAt: new Date("2026-06-12T09:00:00.000Z"),
          updatedAt: completedAt
        }
      );
      sessions.addSession({
        ...session,
        state: {
          ...session.state!,
          source: "normal"
        }
      });
    }

    await expect(service.getFightOverviewForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "monster-rest",
      availableAt: new Date("2026-06-12T10:33:00.000Z")
    });

    now = new Date("2026-06-12T10:33:00.000Z");

    await expect(service.getFightOverviewForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "persistent-ready"
    });
  });

  it("does not extend monster rest when a terminal fight is reward-recorded later", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      () => new Date("2026-06-12T10:32:59.999Z"),
      sessions
    );

    await service.issueNextProblemQuestForTelegramUser(telegramUserId);

    for (const [index, completedAt] of [
      new Date("2026-06-12T10:29:00.000Z"),
      new Date("2026-06-12T10:29:30.000Z"),
      new Date("2026-06-12T10:30:00.000Z")
    ].entries()) {
      const session = makeTerminalSession(
        "won",
        `ordinary-reward-later-${index + 1}`,
        `character-${telegramUserId.toString()}`,
        "monster.deadline-spider",
        {
          createdAt: new Date("2026-06-12T10:28:00.000Z"),
          completedAt,
          updatedAt: index === 2 ? new Date("2026-06-12T10:31:00.000Z") : completedAt
        }
      );
      sessions.addSession({
        ...session,
        state: {
          ...session.state!,
          source: "normal"
        }
      });
    }

    await expect(service.getFightOverviewForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "monster-rest",
      availableAt: new Date("2026-06-12T10:33:00.000Z")
    });
  });

  it("does not start monster rest while the long-running third eligible fight is still active", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(characters, dailyActions, fixedClock, sessions);

    await service.issueNextProblemQuestForTelegramUser(telegramUserId);

    for (const index of [1, 2]) {
      const session = makeTerminalSession(
        "won",
        `ordinary-long-${index}`,
        `character-${telegramUserId.toString()}`,
        "monster.deadline-spider",
        {
          createdAt: new Date("2026-06-12T09:00:00.000Z"),
          updatedAt: new Date(`2026-06-12T10:2${index}:00.000Z`)
        }
      );
      sessions.addSession({
        ...session,
        state: {
          ...session.state!,
          source: "normal"
        }
      });
    }

    sessions.addSession({
      id: "ordinary-long-active-third",
      characterId: `character-${telegramUserId.toString()}`,
      monsterId: "monster.deadline-spider",
      status: "active",
      turn: 9,
      reward: null,
      createdAt: new Date("2026-06-12T09:00:00.000Z"),
      updatedAt: fixedClock(),
      expiresAt: new Date("2026-06-12T10:40:00.000Z"),
      state: {
        id: "ordinary-long-active-third",
        source: "normal",
        turn: 9,
        status: "active",
        hero: { hp: 20, hpMax: 24, mana: 10, manaMax: 12 },
        monster: { id: "monster.deadline-spider", hp: 5, hpMax: 18 }
      }
    });

    await expect(service.getFightOverviewForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "persistent-active"
    });
  });

  it("excludes adventure, training, and legacy sessions from monster rest", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(characters, dailyActions, fixedClock, sessions);

    await service.issueNextProblemQuestForTelegramUser(telegramUserId);

    const normal = makeTerminalSession(
      "won",
      "ordinary-excluded-normal",
      `character-${telegramUserId.toString()}`,
      "monster.deadline-spider",
      { updatedAt: new Date("2026-06-12T10:29:00.000Z") }
    );
    sessions.addSession({
      ...normal,
      state: {
        ...normal.state!,
        source: "normal"
      }
    });

    const adventure = makeTerminalSession(
      "won",
      "ordinary-excluded-adventure",
      `character-${telegramUserId.toString()}`,
      "monster.deadline-spider",
      { updatedAt: new Date("2026-06-12T10:29:30.000Z") }
    );
    sessions.addSession({
      ...adventure,
      state: {
        ...adventure.state!,
        source: "adventure"
      }
    });

    const training = makeTerminalSession(
      "won",
      "ordinary-excluded-training",
      `character-${telegramUserId.toString()}`,
      TRAINING_DOPPELGANGER_MONSTER_ID,
      { updatedAt: new Date("2026-06-12T10:29:40.000Z") }
    );
    sessions.addSession({
      ...training,
      state: {
        ...training.state!,
        source: "training"
      }
    });

    sessions.addSession(
      makeTerminalSession(
        "won",
        "ordinary-excluded-legacy",
        `character-${telegramUserId.toString()}`,
        "monster.deadline-spider",
        { updatedAt: new Date("2026-06-12T10:29:50.000Z") }
      )
    );

    await expect(service.getFightOverviewForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "persistent-ready"
    });
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

  it("wastes the persistent turn when a current skill action lacks mana", async () => {
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

    expect(result.state).toBe("updated");
    if (result.state === "updated") {
      expect(result.session.state?.turn).toBe(2);
      expect(result.session.state?.lastTurn?.heroOutcome).toBe("not-enough-mana");
    }
    expect(sessions.updateCount).toBe(1);
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
        oldLevel: getLevelForXp(character.xp),
        newLevel: updatedCharacter.level,
        leveledUp: updatedCharacter.level > getLevelForXp(character.xp)
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

class FakeSoloCombatSessionRepository implements SoloCombatSessionRepository {
  private readonly sessions = new Map<string, SoloCombatSessionRecord>();
  private persistRewardReplay = true;
  createCount = 0;
  updateCount = 0;

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

function makeTerminalSession(
  status: Exclude<SoloCombatSessionStatus, "active">,
  id = `session-${status}`,
  characterId = "character-42",
  monsterId = "monster.deadline-spider",
  options: { createdAt?: Date; updatedAt?: Date; completedAt?: Date | null } = {}
): SoloCombatSessionRecord {
  const createdAt = options.createdAt ?? fixedClock();
  const completedAt = options.completedAt === undefined ? (options.updatedAt ?? createdAt) : options.completedAt;
  const updatedAt = options.updatedAt ?? completedAt ?? createdAt;

  return {
    id,
    characterId,
    monsterId,
    status,
    turn: 2,
    state: {
      id,
      ...(completedAt ? { completedAt: completedAt.toISOString() } : {}),
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

function cloneState(state: CombatState): CombatState {
  return JSON.parse(JSON.stringify(state)) as CombatState;
}
