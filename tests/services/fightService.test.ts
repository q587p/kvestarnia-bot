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
import { FakeRandomSource } from "../../src/shared/random";
import { MIMIC_SHAWARMA_ADVENTURE_KEY } from "../../src/services/adventureService";
import {
  FightService,
  MIMIC_SHAWARMA_COMBAT_PROBE_KEY,
  PERSISTENT_SOLO_FIGHT_REWARD_KEY,
  THIRTEEN_SMALL_PROBLEMS_QUEST_BUCKET,
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
      expect(started.monster.level).toBe(3);
      expect(started.monster.id).not.toBe("monster.mimic-shawarma");
    }
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
      hp: 30,
      hpMax: 30,
      mana: 14,
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
      expect(result.questReward).toBeNull();
    }
    expect(sessions.updateCount).toBe(1);
    expect(dailyActions.records).toHaveLength(1);
    expect(dailyActions.records[0]).toMatchObject({
      key: PERSISTENT_SOLO_FIGHT_REWARD_KEY,
      localDate: started.session.id
    });
    await expect(characters.findByTelegramUserId(telegramUserId)).resolves.toMatchObject({
      xp: 25 + (result.state === "updated" ? result.fightReward?.reward.xp ?? 0 : 0),
      gold: result.state === "updated" ? result.fightReward?.reward.gold ?? 0 : 0
    });

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
    expect(dailyActions.records).toHaveLength(1);
  });

  it("limits XP to one for persistent fight rewards from much weaker monsters", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 225 });
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
    expect(started.character.level - started.monster.level).toBeGreaterThan(2);
    sessions.setMonsterHp(started.session.id, 1);

    const result = await service.resolvePersistentFightTurn(telegramUserId, {
      sessionId: started.session.id,
      turn: 1,
      action: "attack"
    });

    expect(result.state).toBe("updated");
    if (result.state === "updated") {
      expect(result.session.status).toBe("won");
      expect(result.fightReward?.reward.xp).toBe(1);
    }
    expect(dailyActions.records).toHaveLength(1);
    expect(dailyActions.records[0]).toMatchObject({
      key: PERSISTENT_SOLO_FIGHT_REWARD_KEY,
      rewardXp: 1
    });
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
    expect(dailyActions.records).toHaveLength(1);
    expect(sessions.getById(started.session.id)?.reward).toBeNull();
    const action = dailyActions.records[0];

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
    expect(dailyActions.records).toHaveLength(1);
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
    expect(dailyActions.records).toHaveLength(1);
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
    expect(dailyActions.records).toHaveLength(1);
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
      expect(result.questReward).toBeNull();
    }
    expect(dailyActions.createCount).toBe(1);
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

  it("claims the thirteen small problems reward once on the thirteenth win", async () => {
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
        rewardClaimed: true
      });
      expect(result.questReward).toMatchObject({
        state: "claimed",
        reward: {
          xp: 35,
          gold: 10,
          localDate: THIRTEEN_SMALL_PROBLEMS_QUEST_BUCKET,
          itemGrants: [
            {
              itemId: "item.badge-of-thirteen-small-problems",
              name: "Жетон тринадцяти дрібних проблем",
              quantity: 1
            }
          ]
        }
      });
    }
    expect(repeated.state).toBe("terminal");
    if (repeated.state === "terminal") {
      expect(repeated.questProgress).toMatchObject({
        wins: 13,
        completed: true,
        rewardClaimed: true
      });
    }
    expect(
      dailyActions.records.filter((record) => record.key === THIRTEEN_SMALL_PROBLEMS_QUEST_KEY)
    ).toHaveLength(1);
    expect(
      dailyActions.records.filter((record) => record.key === PERSISTENT_SOLO_FIGHT_REWARD_KEY)
    ).toHaveLength(1);
    expect(dailyActions.createCount).toBe(2);
    expect(dailyActions.grantedItems).toEqual(
      expect.arrayContaining([
        {
          itemId: "item.badge-of-thirteen-small-problems",
          quantity: 1
        }
      ])
    );
    if (result.state === "updated") {
      await expect(characters.findByTelegramUserId(telegramUserId)).resolves.toMatchObject({
        xp: 25 + 35 + (result.fightReward?.reward.xp ?? 0),
        gold: 10 + (result.fightReward?.reward.gold ?? 0),
        level: getLevelForXp(25 + 35 + (result.fightReward?.reward.xp ?? 0))
      });
    }
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

  it("does not mutate when a persistent skill lacks mana", async () => {
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
    expect(sessions.updateCount).toBe(0);
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

  async countWonByTelegramUserId(telegramUserId: bigint): Promise<number> {
    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character) {
      return 0;
    }

    return [...this.sessions.values()].filter(
      (candidate) => candidate.characterId === character.id && candidate.status === "won"
    ).length;
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

  addWonSessions(characterId: string, count: number): void {
    for (let index = 0; index < count; index += 1) {
      this.addSession(makeTerminalSession("won", `session-won-${index + 1}`, characterId));
    }
  }
}

function makeTerminalSession(
  status: Exclude<SoloCombatSessionStatus, "active">,
  id = `session-${status}`,
  characterId = "character-42"
): SoloCombatSessionRecord {
  return {
    id,
    characterId,
    monsterId: "monster.deadline-spider",
    status,
    turn: 2,
    state: {
      id,
      turn: 2,
      status,
      hero: {
        hp: status === "lost" ? 0 : 20,
        hpMax: 24,
        mana: 10,
        manaMax: 12
      },
      monster: {
        id: "monster.deadline-spider",
        hp: status === "won" ? 0 : 5,
        hpMax: 18
      }
    },
    reward: null,
    createdAt: fixedClock(),
    updatedAt: fixedClock(),
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
