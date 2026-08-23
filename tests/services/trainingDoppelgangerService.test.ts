import { describe, expect, it, vi } from "vitest";
import type { Context } from "grammy";
import { sendTrainingDoppelganger } from "../../src/bot/commands/trainingDoppelgangerCommand";
import type { BotServices } from "../../src/bot/botServices";
import { handleTrainingDoppelgangerCallback } from "../../src/bot/modules/combat";
import type {
  CharacterRecord,
  CharacterRepository,
  CreateCharacterInput,
  CreateCharacterResult
} from "../../src/db/repositories/characterRepository";
import type {
  CharacterCooldownRecord,
  ClaimCooldownRewardInput,
  ClaimCooldownRewardResult,
  CooldownRepository
} from "../../src/db/repositories/cooldownRepository";
import type {
  ClaimDailyActionInput,
  ClaimDailyActionResult,
  DailyActionRecord,
  DailyActionRepository
} from "../../src/db/repositories/dailyActionRepository";
import type {
  DuelCharacterSnapshot,
  ResolvedDuelChallengeRecord
} from "../../src/db/repositories/duelChallengeRepository";
import type {
  CreateSoloCombatSessionInput,
  RecordSoloCombatRewardInput,
  SoloCombatLeaseLookupResult,
  SoloCombatSessionRecord,
  SoloCombatSessionRepository,
  UpdateSoloCombatSessionInput
} from "../../src/db/repositories/soloCombatSessionRepository";
import type { TelegramUserProfile } from "../../src/db/repositories/userRepository";
import { summarizeCharacter } from "../../src/domain/characters/characterSummary";
import {
  getTrainingDoppelgangerRecoveryMs,
  TRAINING_DOPPELGANGER_MIN_LEVEL,
  TRAINING_DOPPELGANGER_MONSTER_ID
} from "../../src/domain/trainingDoppelganger";
import {
  markCombatSettlementCompleted,
  markCombatSettlementForfeitedByRemort
} from "../../src/domain/combat";
import { FakeRandomSource } from "../../src/shared/random";
import {
  TrainingDoppelgangerService,
  type TrainingDoppelgangerChampionSource,
  TRAINING_DOPPELGANGER_COOLDOWN_KEY,
  TRAINING_DOPPELGANGER_REWARD_KEY
} from "../../src/services/trainingDoppelgangerService";
import {
  PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
  type PresenceService
} from "../../src/services/presenceService";
import {
  FightingCornerQuestService,
  FIGHTING_CORNER_QUEST_KEYS
} from "../../src/services/fightingCornerQuestService";
import {
  presentTrainingDoppelganger,
  presentTrainingDoppelgangerJournal,
  presentTrainingDoppelgangerStatistics
} from "../../src/bot/presenters/trainingDoppelgangerPresenter";

const telegramUserId = 42n;
const fixedNow = () => new Date("2026-06-17T09:30:00.000Z");

describe("TrainingDoppelgangerService", () => {
  it("returns no-character without mutating anything", async () => {
    const world = new FakeWorld();
    const service = buildService(world);

    await expect(service.getOrStartForTelegramUser(telegramUserId)).resolves.toEqual({
      state: "no-character"
    });
    expect(world.sessions.size).toBe(0);
    expect(world.actions.size).toBe(0);
  });

  it("starts a turn-based training session instead of an instant result card", async () => {
    const world = new FakeWorld();
    world.addCharacter(telegramUserId);
    const service = buildService(world);

    const result = await service.getOrStartForTelegramUser(telegramUserId);

    expect(result).toMatchObject({
      state: "active",
      session: {
        monsterId: TRAINING_DOPPELGANGER_MONSTER_ID,
        status: "active"
      }
    });
    expect(world.actions.size).toBe(0);
    expect(world.cooldowns.size).toBe(0);
  });

  it("reads Training statistics without adopting, settling, or otherwise mutating the session", async () => {
    const world = new FakeWorld();
    world.addCharacter(telegramUserId);
    const service = buildService(world);
    const started = await service.getOrStartForTelegramUser(telegramUserId);
    if (started.state !== "active") {
      throw new Error("Expected active training.");
    }
    const before = JSON.stringify([...world.sessions.entries()]);

    await expect(service.getTrainingDoppelgangerStatisticsForTelegramUser(
      telegramUserId,
      started.session.id
    )).resolves.toMatchObject({
      state: "found",
      session: { id: started.session.id }
    });

    expect(JSON.stringify([...world.sessions.entries()])).toBe(before);
    expect(world.actions.size).toBe(0);
    expect(world.cooldowns.size).toBe(0);
    expect(world.resourceMutations).toBe(0);
  });

  it("reads a terminal Training artifact by opaque session id without viewer or persistence writes", async () => {
    const world = new FakeWorld();
    world.addCharacter(telegramUserId);
    const service = buildService(world);
    const started = await service.getOrStartForTelegramUser(telegramUserId);
    if (started.state !== "active" || !started.session.state) throw new Error("Expected active training.");
    await expect(service.getPublicTerminalArtifact(started.session.id)).resolves.toEqual({ state: "active" });
    await expect(service.getPublicTerminalArtifact("123e4567-e89b-42d3-a456-426614174999"))
      .resolves.toEqual({ state: "not-found" });
    world.sessions.set("123e4567-e89b-42d3-a456-426614174998", {
      ...started.session,
      id: "123e4567-e89b-42d3-a456-426614174998",
      monsterId: "monster.deadline-spider",
      status: "won",
      state: { ...started.session.state, status: "won" }
    });
    await expect(service.getPublicTerminalArtifact("123e4567-e89b-42d3-a456-426614174998"))
      .resolves.toEqual({ state: "not-found" });
    world.sessions.set(started.session.id, {
      ...started.session,
      status: "won",
      state: { ...started.session.state, status: "won" }
    });
    const before = JSON.stringify([...world.sessions.entries()]);

    const first = await service.getPublicTerminalArtifact(started.session.id);
    expect(first).toMatchObject({
      state: "ready",
      character: { name: "Мандрівник" },
      session: { id: started.session.id, status: "won" }
    });
    if (first.state !== "ready") throw new Error("Expected terminal Training artifact.");
    const firstSnapshot = { ...first, state: "found" as const };
    const rendered = [
      presentTrainingDoppelganger({ ...first, state: "terminal", reward: null }),
      presentTrainingDoppelgangerJournal(firstSnapshot, 0),
      presentTrainingDoppelgangerStatistics(firstSnapshot)
    ];
    world.addCharacter(telegramUserId, {
      name: "Нова особа після тренування",
      raceId: "race.orc-ish",
      classId: "class.mage",
      guildCrest: "⚔️",
      level: 13,
      xp: 1300,
      remortCount: 1
    });
    const replay = await service.getPublicTerminalArtifact(started.session.id);
    expect(replay).toMatchObject({
      state: "ready",
      character: { name: "Мандрівник", raceId: "race.human-ish", classId: "class.warrior", level: 3 }
    });
    if (replay.state !== "ready") throw new Error("Expected replay Training artifact.");
    const replaySnapshot = { ...replay, state: "found" as const };
    expect([
      presentTrainingDoppelganger({ ...replay, state: "terminal", reward: null }),
      presentTrainingDoppelgangerJournal(replaySnapshot, 0),
      presentTrainingDoppelgangerStatistics(replaySnapshot)
    ]).toEqual(rendered);
    await service.getPublicTerminalArtifact(started.session.id);

    expect(JSON.stringify([...world.sessions.entries()])).toBe(before);
    expect(world.actions.size).toBe(0);
    expect(world.cooldowns.size).toBe(0);
    expect(world.resourceMutations).toBe(0);
  });

  it("keeps Training self-fumble damage truthful without crediting it to the doppelganger", async () => {
    const world = new FakeWorld();
    world.addCharacter(telegramUserId, { hpCurrent: 66, hpMax: 66 });
    const service = buildService(world, new FakeRandomSource([0, 0, 0, 0, 0, 0]));
    const started = await service.getOrStartForTelegramUser(telegramUserId);
    if (started.state !== "active" || !started.session.state) {
      throw new Error("Expected active training.");
    }
    const state = started.session.state;
    state.playerAbilityFumbles = {
      version: 1,
      abilities: {
        "skill.forceful-strike": { version: 1, cycle: 0, usesInCycle: 0, triggerAt: 1 }
      }
    };
    world.sessions.set(started.session.id, { ...started.session, state });
    const hpBefore = state.hero.hp;

    const result = await service.resolveTurn(telegramUserId, {
      sessionId: started.session.id,
      turn: state.turn,
      action: "skill"
    });

    expect(result.state).toBe("updated");
    if (result.state === "updated" && result.session.state) {
      const resolved = result.session.state;
      const selfDamage = resolved.lastTurn?.fumble?.selfDamage ?? 0;
      const enemyRecorded = Object.values(resolved.statistics?.enemies ?? {})
        .reduce((total, contribution) => total + contribution.damage, 0);
      const heroDamageTaken = resolved.statistics?.hero.damageTaken ?? 0;

      expect(selfDamage).toBeGreaterThan(0);
      expect(heroDamageTaken).toBe(hpBefore - resolved.hero.hp);
      expect(enemyRecorded).toBe(heroDamageTaken - Math.min(heroDamageTaken, selfDamage));
      expect(enemyRecorded).toBeLessThan(heroDamageTaken);
    }
  });

  it("persists a Sated pulse on the Training Doppelganger turn after its hostile response", async () => {
    const world = new FakeWorld();
    world.addCharacter(telegramUserId);
    const service = buildService(world, new FakeRandomSource([0.9, 0.9, 0.9]));
    const started = await service.getOrStartForTelegramUser(telegramUserId);
    if (started.state !== "active" || !started.session.state) {
      throw new Error("Expected active training.");
    }
    const state = started.session.state;
    state.hero.hp -= 2;
    state.hero.mana = 0;
    state.varenykSated = {
      version: 1,
      activationId: "training-sated",
      recipientCharacterId: started.session.characterId,
      recipientRemortCount: 0,
      rank: 1,
      expiresAt: new Date(fixedNow().getTime() + 13 * 60_000).toISOString(),
      cursorAt: fixedNow().toISOString(),
      leaseStartedAt: fixedNow().toISOString(),
      outsideRemainderMs: 0,
      pulseIds: []
    };
    state.bardInspiration = {
      version: 1,
      activationId: "training-inspiration",
      sourcePerformanceId: "performance-training",
      sourceLocationId: "location.korchma.bar",
      recipientCharacterId: started.session.characterId,
      recipientRemortCount: 0,
      grade: "memorable",
      accuracyBonusPp: 3,
      expiresAt: new Date(fixedNow().getTime() + 13 * 60_000).toISOString(),
      cursorAt: fixedNow().toISOString(),
      leaseStartedAt: fixedNow().toISOString(),
      outsideRemainderMs: 0,
      pulseIds: []
    };
    world.sessions.set(started.session.id, { ...started.session, state });

    const result = await service.resolveTurn(telegramUserId, {
      sessionId: started.session.id,
      turn: state.turn,
      action: "defend"
    });

    expect(result.state).toBe("updated");
    if (result.state === "updated") {
      expect(result.session.state?.lastTurn?.satedRecovery).toEqual({ hpRestored: 1, manaRestored: 1 });
      expect(result.session.state?.varenykSated?.pulseIds).toEqual([
        `training-sated:training-doppelganger:${started.session.id}:1:${started.session.characterId}`
      ]);
      expect(result.session.state?.varenykSated?.expiresAt).toBe(
        new Date(fixedNow().getTime() + 12 * 60_000).toISOString()
      );
      expect(result.session.state?.bardInspiration?.pulseIds).toEqual([
        `training-inspiration:training-doppelganger:${started.session.id}:1:${started.session.characterId}`
      ]);
      expect(result.session.state?.bardInspiration?.expiresAt).toBe(
        new Date(fixedNow().getTime() + 12 * 60_000).toISOString()
      );
    }
  });

  it("consumes the final Inspiration minute on a fatal committed Training turn exactly once", async () => {
    const world = new FakeWorld();
    world.addCharacter(telegramUserId);
    const service = buildService(world, new FakeRandomSource([0.1, 0.1, 0.1, 0.1]));
    const started = await service.getOrStartForTelegramUser(telegramUserId);
    if (started.state !== "active" || !started.session.state) throw new Error("Expected training.");
    const state = started.session.state;
    state.hero.hp = 1;
    state.bardInspiration = {
      version: 1,
      activationId: "fatal-training-inspiration",
      sourcePerformanceId: "performance-fatal-training",
      sourceLocationId: "location.korchma.bar",
      recipientCharacterId: started.session.characterId,
      recipientRemortCount: 0,
      grade: "legendary",
      accuracyBonusPp: 5,
      expiresAt: new Date(fixedNow().getTime() + 60_000).toISOString(),
      cursorAt: fixedNow().toISOString(),
      leaseStartedAt: fixedNow().toISOString(),
      outsideRemainderMs: 0,
      pulseIds: []
    };
    world.sessions.set(started.session.id, { ...started.session, state });

    await service.resolveTurn(telegramUserId, {
      sessionId: started.session.id,
      turn: state.turn,
      action: "attack"
    });
    const afterFirst = world.sessions.get(started.session.id)!;
    await service.resolveTurn(telegramUserId, {
      sessionId: started.session.id,
      turn: state.turn,
      action: "attack"
    });
    const afterReplay = world.sessions.get(started.session.id)!;

    expect(afterFirst.state?.hero.hp).toBe(0);
    expect(afterFirst.state?.bardInspiration?.expiresAt).toBe(fixedNow().toISOString());
    expect(afterReplay.state?.bardInspiration?.pulseIds).toEqual(afterFirst.state?.bardInspiration?.pulseIds);
  });

  it("shows start choices without creating a training session", async () => {
    const world = new FakeWorld();
    world.addCharacter(telegramUserId);
    const service = buildService(world);

    const result = await service.getStartOptionsForTelegramUser(telegramUserId);

    expect(result).toMatchObject({
      state: "ready",
      choices: [
        { mode: "copy-target" },
        { mode: "random-build" }
      ]
    });
    expect(world.sessions.size).toBe(0);
  });

  it("blocks training start under an unsupported active combat lease", async () => {
    const world = new FakeWorld();
    world.addCharacter(telegramUserId);
    world.leaseLookup = {
      state: "unsupported",
      kind: "turn-duel",
      referenceId: "duel-session"
    };
    const service = buildService(world);

    const result = await service.getStartOptionsForTelegramUser(telegramUserId);

    expect(result).toMatchObject({
      state: "another-fight-active"
    });
    expect(world.sessions.size).toBe(0);
  });

  it("passes the observed cleanup clock when expiring malformed Doppelganger state", async () => {
    const world = new FakeWorld();
    world.addCharacter(telegramUserId);
    const malformed = makeTerminalTrainingSession("training-malformed-observed", "lost");
    world.sessions.set(malformed.id, { ...malformed, status: "active", state: null });
    const service = buildService(world);

    await expect(service.resolveTurn(telegramUserId, {
      sessionId: malformed.id,
      turn: malformed.turn,
      action: "attack"
    })).resolves.toMatchObject({ state: "terminal" });
    expect(world.lastStatusMark).toEqual({
      sessionId: malformed.id,
      status: "expired",
      observedAt: fixedNow()
    });
  });

  it("offers distinct duel champions and starts the selected champion copy", async () => {
    const world = new FakeWorld();
    world.addCharacter(telegramUserId);
    const championSource = new FakeChampionSource([
      resolvedDuel("day-a", duelSnapshot("character-a", "Ада", "class.rogue"), new Date("2026-06-17T03:30:00.000Z")),
      resolvedDuel("week-b-1", duelSnapshot("character-b", "Боривітер", "class.bard"), new Date("2026-06-15T09:30:00.000Z")),
      resolvedDuel("week-b-2", duelSnapshot("character-b", "Боривітер", "class.bard"), new Date("2026-06-15T10:30:00.000Z")),
      resolvedDuel("month-c-1", duelSnapshot("character-c", "Варта", "class.mage"), new Date("2026-06-07T09:30:00.000Z")),
      resolvedDuel("month-c-2", duelSnapshot("character-c", "Варта", "class.mage"), new Date("2026-06-07T10:30:00.000Z")),
      resolvedDuel("month-c-3", duelSnapshot("character-c", "Варта", "class.mage"), new Date("2026-06-07T11:30:00.000Z"))
    ]);
    const service = buildService(world, new FakeRandomSource([0.5]), championSource);

    const preview = await service.getStartOptionsForTelegramUser(telegramUserId);

    expect(preview.state).toBe("ready");
    if (preview.state === "ready") {
      expect(preview.choices.map((choice) => choice.mode)).toEqual([
        "copy-target",
        "random-build",
        "champion-day",
        "champion-week",
        "champion-month"
      ]);
    }

    const started = await service.getOrStartForTelegramUser(telegramUserId, {
      mode: "champion-week"
    });

    expect(started.state).toBe("active");
    if (started.state === "active") {
      expect(started.doppelganger.className).toBe("Бард");
      expect(started.doppelganger.championPeriod).toBe("week");
      expect(started.doppelganger.championName).toBe("Боривітер");
      expect(started.session.state?.monster.debugTrace).toMatchObject({
        spawnMode: "COPY_CHAMPION_WEEK",
        source: "champion-fallback",
        championPeriod: "week",
        championName: "Боривітер"
      });
    }
    expect(world.sessions.size).toBe(1);
  });

  it("gates level 1-2 heroes before sessions, cooldowns, rewards or resource mutations", async () => {
    const world = new FakeWorld();
    world.addCharacter(telegramUserId, { level: 2, xp: 13, hpCurrent: 0 });
    const service = buildService(world);

    const result = await service.getOrStartForTelegramUser(telegramUserId);

    expect(result).toMatchObject({
      state: "level-gated",
      minLevel: TRAINING_DOPPELGANGER_MIN_LEVEL
    });
    expect(world.sessions.size).toBe(0);
    expect(world.cooldowns.size).toBe(0);
    expect(world.actions.size).toBe(0);
    expect(world.resourceMutations).toBe(0);
  });

  it("blocks repeat training while the doppelganger recovers", async () => {
    const world = new FakeWorld();
    world.addCharacter(telegramUserId);
    world.cooldowns.set(TRAINING_DOPPELGANGER_COOLDOWN_KEY, {
      id: "cooldown-1",
      characterId: "character-42",
      key: TRAINING_DOPPELGANGER_COOLDOWN_KEY,
      availableAt: new Date("2026-06-17T09:35:00.000Z"),
      updatedAt: fixedNow()
    });
    const service = buildService(world);

    const result = await service.getOrStartForTelegramUser(telegramUserId);

    expect(result).toMatchObject({
      state: "on-cooldown",
      availableAt: new Date("2026-06-17T09:35:00.000Z")
    });
    expect(world.sessions.size).toBe(0);
  });

  it("resets the training doppelganger cooldown for local QA", async () => {
    const world = new FakeWorld();
    world.addCharacter(telegramUserId);
    world.cooldowns.set(TRAINING_DOPPELGANGER_COOLDOWN_KEY, {
      id: "cooldown-1",
      characterId: "character-42",
      key: TRAINING_DOPPELGANGER_COOLDOWN_KEY,
      availableAt: new Date("2026-06-17T09:35:00.000Z"),
      updatedAt: fixedNow()
    });
    const service = buildService(world);

    const result = await service.resetCooldownForDev(telegramUserId);

    expect(result).toMatchObject({
      state: "reset",
      previousAvailableAt: new Date("2026-06-17T09:35:00.000Z"),
      availableAt: fixedNow()
    });
    expect(world.cooldowns.get(TRAINING_DOPPELGANGER_COOLDOWN_KEY)?.availableAt).toEqual(fixedNow());
  });

  it("resolves terminal training with XP only and a recovery cooldown", async () => {
    const world = new FakeWorld();
    world.addCharacter(telegramUserId, { hpCurrent: 6 });
    const service = buildService(world, new FakeRandomSource([0, 0, 0, 0, 0, 0]));
    const started = await service.getOrStartForTelegramUser(telegramUserId);

    if (started.state !== "active") {
      throw new Error(`Expected active training, got ${started.state}`);
    }

    let result = await service.resolveTurn(telegramUserId, {
      sessionId: started.session.id,
      turn: started.session.state?.turn ?? 1,
      action: "attack"
    });

    for (let index = 0; index < 5 && result.state === "updated" && result.session.status === "active"; index += 1) {
      result = await service.resolveTurn(telegramUserId, {
        sessionId: result.session.id,
        turn: result.session.state?.turn ?? 1,
        action: "attack"
      });
    }

    expect(result).toMatchObject({
      state: "updated",
      reward: {
        reward: {
          gold: 0
        }
      }
    });
    expect(result.state === "updated" && ["won", "lost"].includes(result.session.status)).toBe(true);
    expect(result.state === "updated" ? result.session.state?.settlement?.status : null).toBe("completed");
    expect(world.actions.get(`${TRAINING_DOPPELGANGER_REWARD_KEY}:${started.session.id}`)).toMatchObject({
      rewardGold: 0
    });
    expect(world.cooldowns.get(TRAINING_DOPPELGANGER_COOLDOWN_KEY)?.availableAt.getTime()).toBeGreaterThan(
      fixedNow().getTime()
    );
    expect(world.resourceMutations).toBe(1);
    const settlement = world.sessions.get(started.session.id)?.state?.settlement;
    expect(settlement).toMatchObject({
      status: "completed",
      version: 4,
      resources: {
        status: "applied"
      }
    });
    expect(typeof settlement?.training?.availableAt).toBe("string");
    expect(typeof settlement?.training?.cooldownClaimedAt).toBe("string");
    expect(world.sessions.get(started.session.id)?.reward).toMatchObject({ gold: 0 });
  });

  it("skips the hero action but lets the copy act when an expired turn is recovered from start options", async () => {
    const world = new FakeWorld();
    world.addCharacter(telegramUserId);
    const service = buildService(world, new FakeRandomSource([0.6]));
    const started = await service.getOrStartForTelegramUser(telegramUserId);

    if (started.state !== "active" || !started.session.state) {
      throw new Error(`Expected active training, got ${started.state}`);
    }
    world.sessions.set(started.session.id, {
      ...started.session,
      state: {
        ...started.session.state,
        turnExpiresAt: new Date("2026-06-17T09:29:59.000Z").toISOString(),
        timeout: {
          consecutiveMissedTurns: 1
        }
      }
    });

    const result = await service.getStartOptionsForTelegramUser(telegramUserId, {
      expiredTurnMode: "skip"
    });

    expect(result.state).toBe("active");
    if (result.state === "active") {
      expect(result.session.state?.turn).toBe(2);
      expect(result.session.state?.lastTurn).toMatchObject({
        action: "skip",
        heroOutcome: "inactive",
        heroDamage: 0,
        debugTrace: {
          timeoutMode: "skip"
        }
      });
      expect(result.session.state?.lastTurn?.monsterDamage ?? 0).toBeGreaterThan(0);
      expect(result.session.state?.monster.hp).toBe(started.session.state.monster.hp);
      expect(result.session.state?.hero.hp ?? 0).toBeLessThan(started.session.state.hero.hp);
      expect(result.session.state?.timeout?.consecutiveMissedTurns).toBe(2);
      expect(result.session.state?.turnExpiresAt).toBe("2026-06-17T09:30:23.000Z");
    }
  });

  it("does not expire the third consecutive unattended training turn", async () => {
    const world = new FakeWorld();
    world.addCharacter(telegramUserId);
    const service = buildService(world, new FakeRandomSource([0.1, 0.9, 0.1, 0.9]));
    const started = await service.getOrStartForTelegramUser(telegramUserId);

    if (started.state !== "active" || !started.session.state) {
      throw new Error(`Expected active training, got ${started.state}`);
    }
    world.sessions.set(started.session.id, {
      ...started.session,
      state: {
        ...started.session.state,
        monster: {
          ...started.session.state.monster,
          hp: 1
        },
        turnExpiresAt: new Date("2026-06-17T09:29:59.000Z").toISOString(),
        timeout: {
          consecutiveMissedTurns: 2
        }
      }
    });

    const result = await service.resolveDueTrainingTurn({
      ...started.session,
      state: world.sessions.get(started.session.id)?.state ?? null,
      telegramUserId
    });

    expect(result.state).toBe("terminal");
    if (result.state === "terminal") {
      expect(result.session.state?.status).toBe("won");
      expect(result.session.state?.timeout?.consecutiveMissedTurns).toBe(3);
      expect(result.reward).toMatchObject({
        reward: {
          gold: 0,
          localDate: started.session.id
        }
      });
    }
    expect(world.actions.get(`${TRAINING_DOPPELGANGER_REWARD_KEY}:${started.session.id}`)).toBeDefined();
    expect(world.cooldowns.get(TRAINING_DOPPELGANGER_COOLDOWN_KEY)).toBeDefined();
    expect(world.sessions.get(started.session.id)?.reward).toMatchObject({ gold: 0 });
  });

  it("claims a training reward when lazy timeout recovery auto-wins", async () => {
    const world = new FakeWorld();
    world.addCharacter(telegramUserId);
    const service = buildService(world, new FakeRandomSource([0.1, 0.9, 0.1, 0.9, 0.1, 0.1, 0.1]));
    const started = await service.getOrStartForTelegramUser(telegramUserId);

    if (started.state !== "active" || !started.session.state) {
      throw new Error(`Expected active training, got ${started.state}`);
    }
    world.sessions.set(started.session.id, {
      ...started.session,
      state: {
        ...started.session.state,
        monster: {
          ...started.session.state.monster,
          hp: 1
        },
        turnExpiresAt: new Date("2026-06-17T09:29:59.000Z").toISOString()
      }
    });

    const result = await service.getStartOptionsForTelegramUser(telegramUserId);

    expect(result.state).toBe("terminal");
    if (result.state === "terminal") {
      expect(result.session.state?.status).toBe("won");
      expect(result.session.state?.settlement?.status).toBe("completed");
      expect(result.reward?.state).toBe("claimed");
      expect(result.reward?.reward.localDate).toBe(started.session.id);
    }
    expect([...world.actions.values()].filter((action) =>
      action.key === TRAINING_DOPPELGANGER_REWARD_KEY && action.localDate === started.session.id
    )).toHaveLength(1);
    expect(world.cooldowns.size).toBe(1);
    expect(world.sessions.get(started.session.id)?.reward).toBeDefined();
  });

  it("records a lazily settled terminal session exactly once through repeated shared command recovery", async () => {
    const world = new FakeWorld();
    world.addCharacter(telegramUserId, {
      currentLocationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE
    });
    const service = buildService(world, new FakeRandomSource([0.1, 0.9, 0.1, 0.9, 0.1, 0.1, 0.1]));
    const fightingCornerQuest = new FightingCornerQuestService(
      world,
      world,
      { isRogueRetaliationDuelInviteToken: () => Promise.resolve(false) },
      { enabled: true, devHelpersEnabled: false },
      () => new Date("2026-06-17T09:29:58.123Z")
    );
    await expect(fightingCornerQuest.acceptForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "accepted"
    });
    const started = await service.getOrStartForTelegramUser(telegramUserId);
    if (started.state !== "active" || !started.session.state) {
      throw new Error(`Expected active training, got ${started.state}`);
    }
    world.sessions.set(started.session.id, {
      ...started.session,
      state: {
        ...started.session.state,
        monster: { ...started.session.state.monster, hp: 1 },
        turnExpiresAt: new Date("2026-06-17T09:29:59.000Z").toISOString()
      }
    });

    const replies: string[] = [];
    const ctx = {
      from: { id: Number(telegramUserId), first_name: "Тестовий" },
      reply: (text: string) => {
        replies.push(text);
        return Promise.resolve({ message_id: replies.length });
      }
    } as unknown as Context;
    const presence = {
      markAction: () => Promise.resolve(undefined)
    } as unknown as PresenceService;

    await sendTrainingDoppelganger(ctx, service, "reply", {
      presence,
      fightingCornerQuest,
      now: fixedNow
    });
    const xpAfterFirst = (await world.findByTelegramUserId(telegramUserId))?.xp;
    const cooldownAfterFirst = world.cooldowns.get(TRAINING_DOPPELGANGER_COOLDOWN_KEY)?.availableAt;
    const rewardAfterFirst = world.sessions.get(started.session.id)?.reward;

    expect(world.sessions.get(started.session.id)?.state?.settlement?.status).toBe("completed");
    expect([...world.actions.values()].filter((action) =>
      action.key === FIGHTING_CORNER_QUEST_KEYS.training && action.localDate === "life:0"
    )).toHaveLength(1);
    expect(replies.filter((text) => text.includes("Зараховано тренування із Сумлінним Допельґанґером")))
      .toHaveLength(1);

    await sendTrainingDoppelganger(ctx, service, "reply", {
      presence,
      fightingCornerQuest,
      now: fixedNow
    });

    expect((await world.findByTelegramUserId(telegramUserId))?.xp).toBe(xpAfterFirst);
    expect(world.cooldowns.get(TRAINING_DOPPELGANGER_COOLDOWN_KEY)?.availableAt).toEqual(cooldownAfterFirst);
    expect(world.sessions.get(started.session.id)?.reward).toEqual(rewardAfterFirst);
    expect([...world.actions.values()].filter((action) =>
      action.key === TRAINING_DOPPELGANGER_REWARD_KEY && action.localDate === started.session.id
    )).toHaveLength(1);
    expect([...world.actions.values()].filter((action) =>
      action.key === FIGHTING_CORNER_QUEST_KEYS.training && action.localDate === "life:0"
    )).toHaveLength(1);
    expect(replies.filter((text) => text.includes("Зараховано тренування із Сумлінним Допельґанґером")))
      .toHaveLength(1);
  });

  it("records a normal terminal player turn on its first callback and replays it idempotently", async () => {
    const world = new FakeWorld();
    world.addCharacter(telegramUserId, {
      currentLocationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE
    });
    const service = buildService(world, new FakeRandomSource([0, 0, 0, 0, 0, 0]));
    const fightingCornerQuest = new FightingCornerQuestService(
      world,
      world,
      { isRogueRetaliationDuelInviteToken: () => Promise.resolve(false) },
      { enabled: true, devHelpersEnabled: false },
      () => new Date("2026-06-17T09:29:58.123Z")
    );
    await fightingCornerQuest.acceptForTelegramUser(telegramUserId);
    const started = await service.getOrStartForTelegramUser(telegramUserId);
    if (started.state !== "active" || !started.session.state) {
      throw new Error(`Expected active training, got ${started.state}`);
    }
    world.sessions.set(started.session.id, {
      ...started.session,
      state: {
        ...started.session.state,
        monster: { ...started.session.state.monster, hp: 1 }
      }
    });
    const reply = vi.fn(() => Promise.resolve({ message_id: 42 }));
    const ctx = {
      from: { id: Number(telegramUserId), first_name: "Тестовий" },
      answerCallbackQuery: vi.fn(() => Promise.resolve(true)),
      editMessageText: vi.fn(() => Promise.resolve(true)),
      reply
    } as unknown as Context;
    const services = {
      trainingDoppelganger: service,
      fightingCornerQuest,
      presence: { markAction: () => Promise.resolve(undefined) },
      tavern: {
        getActivePendingFridayBarrelRaidForTelegramUser: () => Promise.resolve({ state: "none" })
      }
    } as unknown as BotServices;
    const callback = {
      type: "turn" as const,
      sessionId: started.session.id,
      turn: started.session.state.turn,
      action: "attack" as const
    };

    await handleTrainingDoppelgangerCallback(ctx, callback, services);

    expect(world.sessions.get(started.session.id)).toMatchObject({
      status: "won",
      state: { settlement: { status: "completed" } }
    });
    expect([...world.actions.values()].filter((action) =>
      action.key === FIGHTING_CORNER_QUEST_KEYS.training && action.localDate === "life:0"
    )).toHaveLength(1);
    expect(reply.mock.calls.filter(([text]) =>
      String(text).includes("Зараховано тренування із Сумлінним Допельґанґером")
    )).toHaveLength(1);
    const xpAfterFirst = (await world.findByTelegramUserId(telegramUserId))?.xp;
    const cooldownAfterFirst = world.cooldowns.get(TRAINING_DOPPELGANGER_COOLDOWN_KEY)?.availableAt;
    const rewardAfterFirst = world.sessions.get(started.session.id)?.reward;

    await handleTrainingDoppelgangerCallback(ctx, callback, services);

    expect((await world.findByTelegramUserId(telegramUserId))?.xp).toBe(xpAfterFirst);
    expect(world.cooldowns.get(TRAINING_DOPPELGANGER_COOLDOWN_KEY)?.availableAt).toEqual(cooldownAfterFirst);
    expect(world.sessions.get(started.session.id)?.reward).toEqual(rewardAfterFirst);
    expect([...world.actions.values()].filter((action) =>
      action.key === TRAINING_DOPPELGANGER_REWARD_KEY && action.localDate === started.session.id
    )).toHaveLength(1);
    expect([...world.actions.values()].filter((action) =>
      action.key === FIGHTING_CORNER_QUEST_KEYS.training && action.localDate === "life:0"
    )).toHaveLength(1);
    expect(reply.mock.calls.filter(([text]) =>
      String(text).includes("Зараховано тренування із Сумлінним Допельґанґером")
    )).toHaveLength(1);
  });

  it(
    "records the first view-lazily-settled terminal session without a second recovery call",
    async () => {
    const world = new FakeWorld();
    world.addCharacter(telegramUserId, {
      currentLocationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE
    });
    const service = buildService(world, new FakeRandomSource([0.1, 0.9, 0.1, 0.9, 0.1, 0.1, 0.1]));
    const fightingCornerQuest = new FightingCornerQuestService(
      world,
      world,
      { isRogueRetaliationDuelInviteToken: () => Promise.resolve(false) },
      { enabled: true, devHelpersEnabled: false },
      () => new Date("2026-06-17T09:29:58.123Z")
    );
    await expect(fightingCornerQuest.acceptForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "accepted"
    });

    const started = await service.getOrStartForTelegramUser(telegramUserId);
    if (started.state !== "active" || !started.session.state) {
      throw new Error(`Expected active training, got ${started.state}`);
    }
    world.sessions.set(started.session.id, {
      ...started.session,
      state: {
        ...started.session.state,
        monster: { ...started.session.state.monster, hp: 1 },
        turnExpiresAt: new Date("2026-06-17T09:29:59.000Z").toISOString()
      }
    });

    const reply = vi.fn(() => Promise.resolve({ message_id: 42 }));
    const ctx = {
      from: { id: Number(telegramUserId), first_name: "Тестовий" },
      answerCallbackQuery: vi.fn(() => Promise.resolve(true)),
      editMessageText: vi.fn(() => Promise.resolve(true)),
      reply
    } as unknown as Context;
    const services = {
      trainingDoppelganger: service,
      fightingCornerQuest,
      tavern: {
        getActivePendingFridayBarrelRaidForTelegramUser: () => Promise.resolve({ state: "none" })
      }
    } as unknown as BotServices;

    const callback = { type: "view" as const, sessionId: started.session.id };

    await handleTrainingDoppelgangerCallback(ctx, callback, services);

    expect(world.sessions.get(started.session.id)).toMatchObject({
      status: "won",
      state: { settlement: { status: "completed" } }
    });
    expect([...world.actions.values()].filter((action) =>
      action.key === FIGHTING_CORNER_QUEST_KEYS.training && action.localDate === "life:0"
    )).toHaveLength(1);
    expect(reply.mock.calls.filter(([text]) =>
      String(text).includes("Зараховано тренування із Сумлінним Допельґанґером")
    )).toHaveLength(1);
    const xpAfterFirst = (await world.findByTelegramUserId(telegramUserId))?.xp;
    const cooldownAfterFirst = world.cooldowns.get(TRAINING_DOPPELGANGER_COOLDOWN_KEY)?.availableAt;
    const rewardAfterFirst = world.sessions.get(started.session.id)?.reward;

    await handleTrainingDoppelgangerCallback(ctx, callback, services);

    expect((await world.findByTelegramUserId(telegramUserId))?.xp).toBe(xpAfterFirst);
    expect(world.cooldowns.get(TRAINING_DOPPELGANGER_COOLDOWN_KEY)?.availableAt).toEqual(cooldownAfterFirst);
    expect(world.sessions.get(started.session.id)?.reward).toEqual(rewardAfterFirst);
    expect([...world.actions.values()].filter((action) =>
      action.key === TRAINING_DOPPELGANGER_REWARD_KEY && action.localDate === started.session.id
    )).toHaveLength(1);
    expect([...world.actions.values()].filter((action) =>
      action.key === FIGHTING_CORNER_QUEST_KEYS.training && action.localDate === "life:0"
    )).toHaveLength(1);
    expect(reply.mock.calls.filter(([text]) =>
      String(text).includes("Зараховано тренування із Сумлінним Допельґанґером")
    )).toHaveLength(1);
  });

  it("claims a training reward when scheduled timeout auto-loses", async () => {
    const world = new FakeWorld();
    world.addCharacter(telegramUserId, {
      hpCurrent: 1,
      currentLocationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE
    });
    const service = buildService(world, new FakeRandomSource([0.9, 0.9, 0.1, 0.9]));
    const fightingCornerQuest = new FightingCornerQuestService(
      world,
      world,
      { isRogueRetaliationDuelInviteToken: () => Promise.resolve(false) },
      { enabled: true, devHelpersEnabled: false },
      () => new Date("2026-06-17T09:29:58.123Z")
    );
    await fightingCornerQuest.acceptForTelegramUser(telegramUserId);
    const started = await service.getOrStartForTelegramUser(telegramUserId);

    if (started.state !== "active" || !started.session.state) {
      throw new Error(`Expected active training, got ${started.state}`);
    }
    world.sessions.set(started.session.id, {
      ...started.session,
      state: {
        ...started.session.state,
        hero: {
          ...started.session.state.hero,
          hp: 1
        },
        monster: {
          ...started.session.state.monster,
          hp: 999,
          attack: 50
        },
        turnExpiresAt: new Date("2026-06-17T09:29:59.000Z").toISOString()
      }
    });

    const result = await service.resolveDueTrainingTurn({
      ...started.session,
      state: world.sessions.get(started.session.id)?.state ?? null,
      telegramUserId
    });

    expect(result.state).toBe("terminal");
    if (result.state === "terminal") {
      expect(result.session.state?.status).toBe("lost");
      expect(result.session.state?.settlement?.status).toBe("completed");
      await expect(fightingCornerQuest.recordTrainingSessionSafely(telegramUserId, result.session))
        .resolves.toHaveLength(1);
      expect(result.reward).toMatchObject({
        reward: {
          xp: 1,
          gold: 0,
          localDate: started.session.id
        }
      });
    }
    expect([...world.actions.values()].filter((action) =>
      action.key === TRAINING_DOPPELGANGER_REWARD_KEY && action.localDate === started.session.id
    )).toHaveLength(1);
    expect(world.cooldowns.size).toBe(1);
    expect(world.resourceMutations).toBe(1);
    expect([...world.actions.values()].filter((action) =>
      action.key === FIGHTING_CORNER_QUEST_KEYS.training && action.localDate === "life:0"
    )).toHaveLength(1);
    const xpAfterFirst = (await world.findByTelegramUserId(telegramUserId))?.xp;
    const rewardAfterFirst = world.sessions.get(started.session.id)?.reward;

    if (result.state === "terminal") {
      await expect(fightingCornerQuest.recordTrainingSessionSafely(telegramUserId, result.session))
        .resolves.toEqual([]);
    }
    expect((await world.findByTelegramUserId(telegramUserId))?.xp).toBe(xpAfterFirst);
    expect(world.sessions.get(started.session.id)?.reward).toEqual(rewardAfterFirst);
    expect([...world.actions.values()].filter((action) =>
      action.key === TRAINING_DOPPELGANGER_REWARD_KEY && action.localDate === started.session.id
    )).toHaveLength(1);
  });

  it("repairs a missing cooldown when XP was committed before training settlement completion", async () => {
    const world = new FakeWorld();
    world.addCharacter(telegramUserId, { hpCurrent: 10 });
    const session = makeTerminalTrainingSession("training-crash-after-xp", "won");
    world.sessions.set(session.id, session);
    world.actions.set(`${TRAINING_DOPPELGANGER_REWARD_KEY}:${session.id}`, {
      id: "action-crash-after-xp",
      characterId: session.characterId,
      key: TRAINING_DOPPELGANGER_REWARD_KEY,
      localDate: session.id,
      rewardXp: 13,
      rewardGold: 0,
      spentGold: 0,
      resultJson: null,
      createdAt: fixedNow()
    });
    const service = buildService(world);

    const result = await service.getStartOptionsForTelegramUser(telegramUserId);

    expect(result.state).toBe("terminal");
    expect(world.cooldowns.get(TRAINING_DOPPELGANGER_COOLDOWN_KEY)).toBeDefined();
    expect(world.sessions.get(session.id)?.reward).toMatchObject({ xp: 13, gold: 0 });
    const settlement = world.sessions.get(session.id)?.state?.settlement;
    expect(settlement).toMatchObject({
      status: "completed",
      training: {}
    });
    expect(typeof settlement?.training?.availableAt).toBe("string");
    expect(typeof settlement?.training?.cooldownClaimedAt).toBe("string");
  });

  it("anchors repaired training cooldown to terminal completedAt after a resource-marker crash", async () => {
    const world = new FakeWorld();
    world.addCharacter(telegramUserId, { hpCurrent: 10 });
    const session = makeTerminalTrainingSession("training-crash-after-resources", "lost");
    world.sessions.set(session.id, {
      ...session,
      updatedAt: new Date("2026-06-17T10:30:00.000Z"),
      state: session.state
        ? {
            ...session.state,
            settlement: {
              status: "pending",
              version: 2,
              resources: {
                status: "applied",
                appliedAt: "2026-06-17T09:30:00.000Z",
                hpCurrent: session.state.hero.hp,
                manaCurrent: session.state.hero.mana,
                hpRegenAt: "2026-06-17T09:30:00.000Z",
                manaRegenAt: "2026-06-17T09:30:00.000Z"
              }
            }
          }
        : null
    });
    world.actions.set(`${TRAINING_DOPPELGANGER_REWARD_KEY}:${session.id}`, {
      id: "action-crash-after-resources",
      characterId: session.characterId,
      key: TRAINING_DOPPELGANGER_REWARD_KEY,
      localDate: session.id,
      rewardXp: 7,
      rewardGold: 0,
      spentGold: 0,
      resultJson: null,
      createdAt: fixedNow()
    });
    const service = buildService(world);

    await service.getStartOptionsForTelegramUser(telegramUserId);

    const expectedAvailableAt = new Date(
      new Date("2026-06-17T09:30:00.000Z").getTime() +
        getTrainingDoppelgangerRecoveryMs({
          character: summarizeCharacter(world.findCharacter(telegramUserId)!),
          doppelgangerHp: session.state?.monster.hp ?? 0,
          doppelgangerHpMax: session.state?.monster.hpMax ?? 22
        })
    );
    expect(world.cooldowns.get(TRAINING_DOPPELGANGER_COOLDOWN_KEY)?.availableAt.toISOString()).toBe(
      expectedAvailableAt.toISOString()
    );
    expect(world.sessions.get(session.id)?.state?.settlement?.training?.availableAt).toBe(
      expectedAvailableAt.toISOString()
    );
  });

  it("does not extend an already-claimed training cooldown during duplicate recovery", async () => {
    const world = new FakeWorld();
    world.addCharacter(telegramUserId, { hpCurrent: 10 });
    const session = makeTerminalTrainingSession("training-crash-after-cooldown", "lost");
    world.sessions.set(session.id, session);
    world.actions.set(`${TRAINING_DOPPELGANGER_REWARD_KEY}:${session.id}`, {
      id: "action-crash-after-cooldown",
      characterId: session.characterId,
      key: TRAINING_DOPPELGANGER_REWARD_KEY,
      localDate: session.id,
      rewardXp: 7,
      rewardGold: 0,
      spentGold: 0,
      resultJson: null,
      createdAt: fixedNow()
    });
    world.cooldowns.set(TRAINING_DOPPELGANGER_COOLDOWN_KEY, {
      id: "cooldown-crash-after-cooldown",
      characterId: session.characterId,
      key: TRAINING_DOPPELGANGER_COOLDOWN_KEY,
      availableAt: new Date("2026-06-17T10:13:00.000Z"),
      resultJson: null,
      updatedAt: new Date("2026-06-17T09:31:00.000Z")
    });
    const service = buildService(world);

    await service.getStartOptionsForTelegramUser(telegramUserId);
    const firstAvailableAt = world.cooldowns.get(TRAINING_DOPPELGANGER_COOLDOWN_KEY)?.availableAt.toISOString();
    await service.getStartOptionsForTelegramUser(telegramUserId);

    expect(world.cooldowns.get(TRAINING_DOPPELGANGER_COOLDOWN_KEY)?.availableAt.toISOString()).toBe(
      firstAvailableAt
    );
    expect(world.sessions.get(session.id)?.state?.settlement?.status).toBe("completed");
    expect(world.sessions.get(session.id)?.reward).toMatchObject({ xp: 7, gold: 0 });
  });

  it("replays a scheduled terminal reward without granting XP or cooldown twice", async () => {
    const world = new FakeWorld();
    world.addCharacter(telegramUserId);
    const service = buildService(world, new FakeRandomSource([0.1, 0.9, 0.1, 0.9, 0.1, 0.1, 0.1]));
    const started = await service.getOrStartForTelegramUser(telegramUserId);

    if (started.state !== "active" || !started.session.state) {
      throw new Error(`Expected active training, got ${started.state}`);
    }
    world.sessions.set(started.session.id, {
      ...started.session,
      state: {
        ...started.session.state,
        monster: {
          ...started.session.state.monster,
          hp: 1
        },
        turnExpiresAt: new Date("2026-06-17T09:29:59.000Z").toISOString()
      }
    });
    const scheduled = await service.resolveDueTrainingTurn({
      ...started.session,
      state: world.sessions.get(started.session.id)?.state ?? null,
      telegramUserId
    });
    const xpAfterScheduled = world.findCharacter(telegramUserId)?.xp;

    const replay = await service.resolveTurn(telegramUserId, {
      sessionId: started.session.id,
      turn: started.session.state.turn,
      action: "attack"
    });

    expect(scheduled.state).toBe("terminal");
    expect(replay.state).toBe("terminal");
    if (replay.state === "terminal") {
      expect(replay.reward?.state).toBe("replayed");
      expect(replay.reward?.reward.localDate).toBe(started.session.id);
    }
    expect(world.findCharacter(telegramUserId)?.xp).toBe(xpAfterScheduled);
    expect(world.actions.size).toBe(1);
    expect(world.cooldowns.size).toBe(1);
  });

  it("resets the training timeout streak after an explicit player action", async () => {
    const world = new FakeWorld();
    world.addCharacter(telegramUserId);
    const service = buildService(world, new FakeRandomSource([0.99, 0.9, 0.99, 0.9]));
    const started = await service.getOrStartForTelegramUser(telegramUserId);

    if (started.state !== "active" || !started.session.state) {
      throw new Error(`Expected active training, got ${started.state}`);
    }
    world.sessions.set(started.session.id, {
      ...started.session,
      state: {
        ...started.session.state,
        monster: {
          ...started.session.state.monster,
          hp: 80
        },
        timeout: {
          consecutiveMissedTurns: 1
        },
        message: {
          chatId: "42",
          messageId: 587
        }
      }
    });

    const result = await service.resolveTurn(telegramUserId, {
      sessionId: started.session.id,
      turn: started.session.state.turn,
      action: "attack"
    });

    expect(result.state).toBe("updated");
    if (result.state === "updated") {
      expect(result.session.state?.timeout).toBeUndefined();
      expect(result.session.state?.message).toEqual({ chatId: "42", messageId: 587 });
    }
  });

  it("hard-expires overdue training without auto-attacking or granting a reward", async () => {
    const world = new FakeWorld();
    world.addCharacter(telegramUserId);
    const service = buildService(world, new FakeRandomSource([0.1, 0.9]));
    const started = await service.getOrStartForTelegramUser(telegramUserId);

    if (started.state !== "active" || !started.session.state) {
      throw new Error(`Expected active training, got ${started.state}`);
    }
    world.sessions.set(started.session.id, {
      ...started.session,
      expiresAt: new Date("2026-06-17T09:00:00.000Z"),
      state: {
        ...started.session.state,
        monster: {
          ...started.session.state.monster,
          hp: 1
        },
        turnExpiresAt: new Date("2026-06-17T09:29:59.000Z").toISOString()
      }
    });

    const result = await service.resolveTurn(telegramUserId, {
      sessionId: started.session.id,
      turn: started.session.state.turn,
      action: "attack"
    });

    expect(result.state).toBe("terminal");
    if (result.state === "terminal") {
      expect(result.session.state?.status).toBe("expired");
      expect(result.reward).toBeNull();
    }
    expect(world.actions.has(`${TRAINING_DOPPELGANGER_REWARD_KEY}:${started.session.id}`)).toBe(false);
    expect(world.cooldowns.has(TRAINING_DOPPELGANGER_COOLDOWN_KEY)).toBe(false);
  });

  it("keeps random-build source for terminal replay copy text", async () => {
    const world = new FakeWorld();
    world.addCharacter(telegramUserId);
    const service = buildService(world, new FakeRandomSource([0.2, 0.4, 0.6]));
    const started = await service.getOrStartForTelegramUser(telegramUserId, {
      mode: "random-build"
    });

    if (started.state !== "active" || !started.session.state) {
      throw new Error(`Expected active training, got ${started.state}`);
    }

    const trace = started.session.state.monster.debugTrace;
    const monsterWithoutTrace = { ...started.session.state.monster };
    delete monsterWithoutTrace.debugTrace;
    const wonState = {
      ...started.session.state,
      status: "won" as const,
      monster: {
        ...monsterWithoutTrace,
        hp: 0
      },
      lastTurn: {
        action: "attack" as const,
        heroOutcome: "won" as const,
        heroDamage: 93,
        monsterDamage: 0,
        manaSpent: 0,
        critical: false,
        ...(trace ? { debugTrace: trace } : {})
      }
    };
    world.sessions.set(started.session.id, {
      ...started.session,
      status: "won",
      state: wonState
    });

    const replay = await service.resolveTurn(telegramUserId, {
      sessionId: started.session.id,
      turn: started.session.state.turn,
      action: "attack"
    });

    expect(replay.state).toBe("terminal");
    if (replay.state === "terminal") {
      expect(replay.doppelganger.source).toBe("random-build");
      expect(replay.doppelganger.spawnMode).toBe("RANDOM_BUILD");
    }
  });
});

function buildService(
  world: FakeWorld,
  rng = new FakeRandomSource([0.5]),
  championSource?: TrainingDoppelgangerChampionSource
): TrainingDoppelgangerService {
  return new TrainingDoppelgangerService(
    world,
    world,
    world,
    world,
    undefined,
    fixedNow,
    rng,
    {},
    championSource
  );
}

function makeTerminalTrainingSession(
  id: string,
  status: "won" | "lost"
): SoloCombatSessionRecord {
  const completedAt = new Date("2026-06-17T09:30:00.000Z");

  return {
    id,
    characterId: `character-${telegramUserId.toString()}`,
    monsterId: TRAINING_DOPPELGANGER_MONSTER_ID,
    status: "active",
    turn: 3,
    state: {
      id,
      source: "training",
      life: {
        characterId: `character-${telegramUserId.toString()}`,
        remortCount: 0,
        startedAt: new Date("2026-06-17T09:20:00.000Z").toISOString()
      },
      settlement: {
        status: "pending",
        version: 1
      },
      completedAt: completedAt.toISOString(),
      turn: 3,
      status,
      hero: {
        hp: status === "won" ? 8 : 0,
        hpMax: 66,
        mana: 20,
        manaMax: 32
      },
      monster: {
        id: TRAINING_DOPPELGANGER_MONSTER_ID,
        name: "Сумлінний Допельґанґер",
        level: 9,
        hp: status === "won" ? 0 : 12,
        hpMax: 42
      }
    },
    reward: null,
    createdAt: new Date("2026-06-17T09:20:00.000Z"),
    updatedAt: completedAt,
    expiresAt: new Date("2026-06-17T09:25:00.000Z")
  };
}

class FakeChampionSource implements TrainingDoppelgangerChampionSource {
  constructor(private readonly records: ResolvedDuelChallengeRecord[]) {}

  listResolvedSince(since: Date): Promise<ResolvedDuelChallengeRecord[]> {
    return Promise.resolve(this.records.filter((record) => record.resolvedAt >= since));
  }
}

function resolvedDuel(
  id: string,
  winner: DuelCharacterSnapshot,
  resolvedAt: Date
): ResolvedDuelChallengeRecord {
  const loser = duelSnapshot(`${id}-loser`, `${winner.name} тінь`, "class.warrior");

  return {
    id,
    challengerCharacterId: loser.id,
    targetCharacterId: winner.id,
    contextChatId: null,
    inviteToken: `token-${id}`,
    status: "resolved",
    expiresAt: resolvedAt,
    resolvedAt,
    result: {
      outcome: "target",
      winnerCharacterId: winner.id,
      loserCharacterId: loser.id,
      challengerScore: 3,
      targetScore: 13,
      swing: 2,
      flavorKey: "direct-hit"
    },
    createdAt: resolvedAt,
    updatedAt: resolvedAt,
    challenger: loser,
    target: winner
  };
}

function duelSnapshot(
  id: string,
  name: string,
  classId: string
): DuelCharacterSnapshot {
  return {
    id,
    userId: `user-${id}`,
    telegramUserId: BigInt(1000 + id.length),
    name,
    pronoun: "they",
    path: "path.sun",
    raceId: "race.human-ish",
    classId,
    level: 5,
    xp: 90,
    gold: 0,
    hpCurrent: 24,
    hpMax: 24,
    manaCurrent: 12,
    manaMax: 12,
    statsJson: {
      strength: 8,
      dexterity: 8,
      intelligence: 8,
      charisma: 8,
      luck: 8
    },
    equipment: []
  };
}

class FakeWorld implements CharacterRepository, CooldownRepository, DailyActionRepository, SoloCombatSessionRepository {
  private readonly charactersByTelegramUserId = new Map<bigint, CharacterRecord>();
  readonly cooldowns = new Map<string, CharacterCooldownRecord>();
  readonly actions = new Map<string, DailyActionRecord>();
  readonly sessions = new Map<string, SoloCombatSessionRecord>();
  leaseLookup: SoloCombatLeaseLookupResult | null = null;
  resourceMutations = 0;
  lastStatusMark: {
    sessionId: string;
    status: SoloCombatSessionRecord["status"];
    observedAt?: Date;
  } | null = null;

  addCharacter(userTelegramId: bigint, overrides: Partial<CharacterRecord> = {}): void {
    this.charactersByTelegramUserId.set(userTelegramId, {
      id: `character-${userTelegramId.toString()}`,
      userId: `user-${userTelegramId.toString()}`,
      name: "Мандрівник",
      pronoun: "they",
      path: "path.sun",
      raceId: "race.human-ish",
      classId: "class.warrior",
      level: 3,
      xp: 25,
      gold: 7,
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

  findCharacter(userTelegramId: bigint): CharacterRecord | undefined {
    return this.charactersByTelegramUserId.get(userTelegramId);
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
    resources: {
      hpCurrent: number;
      manaCurrent: number;
      hpRegenAt?: Date | null;
      manaRegenAt?: Date | null;
    }
  ): Promise<CharacterRecord | null> {
    this.resourceMutations += 1;
    const character = this.charactersByTelegramUserId.get(userTelegramId);

    if (!character) {
      return Promise.resolve(null);
    }

    const updated = {
      ...character,
      hpCurrent: resources.hpCurrent,
      manaCurrent: resources.manaCurrent
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

  claimRewardForTelegramUser(
    userTelegramId: bigint,
    input: ClaimCooldownRewardInput
  ): Promise<ClaimCooldownRewardResult | null> {
    const character = this.charactersByTelegramUserId.get(userTelegramId);

    if (!character) {
      return Promise.resolve(null);
    }

    const existing = this.cooldowns.get(input.key);

    if (existing && existing.availableAt > input.now) {
      return Promise.resolve({
        state: "on-cooldown",
        cooldown: existing,
        character
      });
    }

    const cooldown = {
      id: existing?.id ?? `cooldown-${this.cooldowns.size + 1}`,
      characterId: character.id,
      key: input.key,
      availableAt: input.availableAt,
      updatedAt: input.now
    };
    this.cooldowns.set(input.key, cooldown);

    return Promise.resolve({
      state: "completed",
      cooldown,
      character,
      levelChange: {
        oldLevel: character.level,
        newLevel: character.level,
        leveledUp: false
      },
      itemGrants: []
    });
  }

  findForTelegramUserAction(
    userTelegramId: bigint,
    input: { key: string; localDate: string }
  ): Promise<DailyActionRecord | null> {
    void userTelegramId;
    return Promise.resolve(this.actions.get(`${input.key}:${input.localDate}`) ?? null);
  }

  claimForTelegramUser(
    userTelegramId: bigint,
    input: ClaimDailyActionInput
  ): Promise<ClaimDailyActionResult | null> {
    const character = this.charactersByTelegramUserId.get(userTelegramId);

    if (!character) {
      return Promise.resolve(null);
    }

    const key = `${input.key}:${input.localDate}`;
    const existing = this.actions.get(key);

    if (existing) {
      return Promise.resolve({
        state: "existing",
        action: existing,
        character,
        levelChange: null,
        itemGrants: []
      });
    }

    const action = {
      id: `action-${this.actions.size + 1}`,
      characterId: character.id,
      key: input.key,
      localDate: input.localDate,
      rewardXp: input.rewardXp,
      rewardGold: input.rewardGold,
      resultJson: input.resultJson ?? null,
      createdAt: fixedNow()
    };
    this.actions.set(key, action);
    const updated = {
      ...character,
      xp: character.xp + input.rewardXp,
      gold: character.gold + input.rewardGold
    };
    this.charactersByTelegramUserId.set(userTelegramId, updated);

    return Promise.resolve({
      state: "created",
      action,
      character: updated,
      levelChange: {
        oldLevel: character.level,
        newLevel: updated.level,
        leveledUp: false
      },
      itemGrants: []
    });
  }

  listForCharacterByKeys(
    characterId: string,
    input: { keys: readonly string[]; localDate: string; take: number }
  ): Promise<DailyActionRecord[]> {
    return Promise.resolve([...this.actions.values()]
      .filter((action) =>
        action.characterId === characterId &&
        action.localDate === input.localDate &&
        input.keys.includes(action.key)
      )
      .slice(0, input.take));
  }

  findForTelegramUser(
    userTelegramId: bigint,
    input: { key: string; localDate: string }
  ): Promise<DailyActionRecord | null>;
  findForTelegramUser(
    userTelegramId: bigint,
    key: string
  ): Promise<{ cooldown: CharacterCooldownRecord | null; character: CharacterRecord } | null>;
  findForTelegramUser(
    userTelegramId: bigint,
    input: string | { key: string; localDate: string }
  ): Promise<DailyActionRecord | { cooldown: CharacterCooldownRecord | null; character: CharacterRecord } | null> {
    if (typeof input === "string") {
      const character = this.charactersByTelegramUserId.get(userTelegramId);

      if (!character) {
        return Promise.resolve(null);
      }

      return Promise.resolve({
        character,
        cooldown: this.cooldowns.get(input) ?? null
      });
    }

    return Promise.resolve(this.actions.get(`${input.key}:${input.localDate}`) ?? null);
  }

  setAvailableAtForTelegramUser(
    userTelegramId: bigint,
    input: { key: string; availableAt: Date }
  ) {
    const character = this.charactersByTelegramUserId.get(userTelegramId);

    if (!character) {
      return Promise.resolve(null);
    }

    const cooldown = this.cooldowns.get(input.key);

    if (!cooldown) {
      return Promise.resolve({
        state: "not-found" as const,
        character
      });
    }

    const updated = {
      ...cooldown,
      availableAt: input.availableAt,
      updatedAt: input.availableAt
    };

    this.cooldowns.set(input.key, updated);

    return Promise.resolve({
      state: "updated" as const,
      cooldown: updated,
      character
    });
  }

  findActiveByTelegramUserId(): Promise<SoloCombatSessionRecord | null> {
    return Promise.resolve(
      [...this.sessions.values()].find((session) => session.status === "active") ?? null
    );
  }

  findLeasedByTelegramUserId(): Promise<SoloCombatLeaseLookupResult> {
    return Promise.resolve(this.leaseLookup ?? { state: "none" });
  }

  countWonByTelegramUserId(
    _telegramUserId: bigint,
    options: { excludeMonsterIds?: readonly string[] } = {}
  ): Promise<number> {
    const excludedMonsterIds = new Set(options.excludeMonsterIds ?? []);

    return Promise.resolve(
      [...this.sessions.values()].filter(
        (session) => session.status === "won" && !excludedMonsterIds.has(session.monsterId)
      ).length
    );
  }

  listCompletedByTelegramUserIdSince(): Promise<Array<Pick<SoloCombatSessionRecord, "monsterId" | "status" | "createdAt" | "updatedAt"> & { completedAt: Date }>> {
    return Promise.resolve([]);
  }

  findByIdForTelegramUserId(
    _userTelegramId: bigint,
    sessionId: string
  ): Promise<SoloCombatSessionRecord | null> {
    return Promise.resolve(this.sessions.get(sessionId) ?? null);
  }

  findPublicTerminalById(sessionId: string) {
    const session = this.sessions.get(sessionId);
    return Promise.resolve(session && session.status !== "active" ? { session } : null);
  }

  findPublicArtifactById(sessionId: string) {
    const session = this.sessions.get(sessionId);
    return Promise.resolve(session ? { session } : null);
  }

  createForTelegramUser(
    userTelegramId: bigint,
    input: CreateSoloCombatSessionInput
  ): Promise<SoloCombatSessionRecord | null> {
    const character = this.charactersByTelegramUserId.get(userTelegramId);

    if (!character) {
      return Promise.resolve(null);
    }

    const session = {
      id: input.id ?? `session-${this.sessions.size + 1}`,
      characterId: character.id,
      monsterId: input.monsterId,
      status: input.state.status,
      turn: input.state.turn,
      state: input.state,
      reward: null,
      createdAt: fixedNow(),
      updatedAt: fixedNow(),
      expiresAt: input.expiresAt
    };
    this.sessions.set(session.id, session);

    return Promise.resolve(session);
  }

  updateById(
    sessionId: string,
    input: UpdateSoloCombatSessionInput
  ): Promise<SoloCombatSessionRecord | null> {
    const existing = this.sessions.get(sessionId);

    if (!existing) {
      return Promise.resolve(null);
    }

    const updated = {
      ...existing,
      status: input.status,
      turn: input.state.turn,
      state: input.state,
      expiresAt: input.expiresAt ?? existing.expiresAt,
      updatedAt: fixedNow()
    };
    this.sessions.set(sessionId, updated);

    return Promise.resolve(updated);
  }

  updateByIdIfActiveTurn(
    sessionId: string,
    expectedTurn: number,
    input: UpdateSoloCombatSessionInput
  ): Promise<SoloCombatSessionRecord | null> {
    const existing = this.sessions.get(sessionId);

    if (!existing || existing.status !== "active" || existing.state?.turn !== expectedTurn) {
      return Promise.resolve(null);
    }

    return this.updateById(sessionId, input);
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
    const existing = this.sessions.get(sessionId);

    if (!existing?.state) {
      return Promise.resolve({ outcome: "applied", session: existing ?? null });
    }

    if (existing.state.settlement?.status === "completed") {
      return Promise.resolve({ outcome: "already-completed", session: existing });
    }

    if (existing.state.settlement?.status === "forfeited-by-remort") {
      return Promise.resolve({ outcome: "already-forfeited", session: existing });
    }

    if (existing.state.settlement?.resources?.status === "applied") {
      return Promise.resolve({ outcome: "already-applied", session: existing });
    }

    for (const [telegramUserId, character] of this.charactersByTelegramUserId.entries()) {
      if (character.id !== existing.characterId) {
        continue;
      }

      this.charactersByTelegramUserId.set(telegramUserId, {
        ...character,
        hpCurrent: input.resources.hpCurrent,
        manaCurrent: input.resources.manaCurrent,
        hpRegenAt: input.resources.hpRegenAt,
        manaRegenAt: input.resources.manaRegenAt
      });
      this.resourceMutations += 1;
      break;
    }

    const state = {
      ...existing.state,
      settlement: {
        ...(existing.state.settlement ?? { status: "pending" as const, version: 1 }),
        version: (existing.state.settlement?.version ?? 1) + 1,
        resources: {
          status: "applied" as const,
          appliedAt: input.appliedAt.toISOString(),
          hpCurrent: input.resources.hpCurrent,
          manaCurrent: input.resources.manaCurrent,
          hpRegenAt: input.resources.hpRegenAt.toISOString(),
          manaRegenAt: input.resources.manaRegenAt.toISOString()
        }
      }
    };
    const updated = { ...existing, state, updatedAt: fixedNow() };
    this.sessions.set(sessionId, updated);

    return Promise.resolve({ outcome: "applied", session: updated });
  }

  applyTrainingCooldownById(
    sessionId: string,
    input: {
      expected?: {
        settlementVersion?: number;
      };
      now: Date;
      availableAt: Date;
      cooldownKey: string;
    }
  ): Promise<{
    outcome: "applied" | "already-applied" | "already-completed" | "already-forfeited" | "cooldown-conflict" | "version-changed";
    session: SoloCombatSessionRecord | null;
    availableAt: Date | null;
  }> {
    const existing = this.sessions.get(sessionId);

    if (!existing?.state) {
      return Promise.resolve({ outcome: "cooldown-conflict", session: existing ?? null, availableAt: null });
    }

    if (existing.state.settlement?.status === "completed") {
      return Promise.resolve({
        outcome: "already-completed",
        session: existing,
        availableAt: existing.state.settlement.training?.availableAt
          ? new Date(existing.state.settlement.training.availableAt)
          : null
      });
    }

    if (existing.state.settlement?.status === "forfeited-by-remort") {
      return Promise.resolve({ outcome: "already-forfeited", session: existing, availableAt: null });
    }

    if (existing.state.settlement?.training?.availableAt && existing.state.settlement.training.cooldownClaimedAt) {
      return Promise.resolve({
        outcome: "already-applied",
        session: existing,
        availableAt: new Date(existing.state.settlement.training.availableAt)
      });
    }

    if (
      input.expected?.settlementVersion !== undefined &&
      existing.state.settlement?.version !== input.expected.settlementVersion
    ) {
      return Promise.resolve({ outcome: "version-changed", session: existing, availableAt: null });
    }

    const current = this.cooldowns.get(input.cooldownKey);
    const cooldown = current && current.availableAt > input.now
      ? current
      : {
          id: current?.id ?? `cooldown-${this.cooldowns.size + 1}`,
          characterId: existing.characterId,
          key: input.cooldownKey,
          availableAt: input.availableAt,
          resultJson: {
            trainingSettlement: {
              sessionId,
              remortCount: 0,
              availableAt: input.availableAt.toISOString()
            }
          },
          updatedAt: fixedNow()
        };
    this.cooldowns.set(input.cooldownKey, cooldown);

    const state = {
      ...existing.state,
      settlement: {
        ...(existing.state.settlement ?? { status: "pending" as const, version: 1 }),
        version: (existing.state.settlement?.version ?? 1) + 1,
        training: {
          availableAt: cooldown.availableAt.toISOString(),
          cooldownClaimedAt: cooldown.updatedAt.toISOString()
        }
      }
    };
    const updated = { ...existing, state, updatedAt: fixedNow() };
    this.sessions.set(sessionId, updated);

    return Promise.resolve({ outcome: "applied", session: updated, availableAt: cooldown.availableAt });
  }

  recordRewardById(
    sessionId: string,
    input: RecordSoloCombatRewardInput
  ): Promise<SoloCombatSessionRecord | null> {
    const existing = this.sessions.get(sessionId);

    if (!existing) {
      return Promise.resolve(null);
    }

    const updated = {
      ...existing,
      reward: {
        xp: input.rewardXp,
        gold: input.rewardGold,
        itemGrants: input.itemGrants,
        claimedAt: input.claimedAt
      }
    };
    this.sessions.set(sessionId, updated);

    return Promise.resolve(updated);
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
    const existing = this.sessions.get(sessionId);

    if (!existing) {
      return Promise.resolve({ outcome: "completed", session: null });
    }

    if (existing.state?.settlement?.status === "completed") {
      return Promise.resolve({ outcome: "already-completed", session: existing });
    }

    if (existing.state?.settlement?.status === "forfeited-by-remort") {
      return Promise.resolve({ outcome: "already-forfeited", session: existing });
    }

    if (
      input.expected?.settlementVersion !== undefined &&
      existing.state?.settlement?.version !== input.expected.settlementVersion
    ) {
      return Promise.resolve({ outcome: "version-changed", session: existing });
    }

    const state = existing.state
      ? markCombatSettlementCompleted(existing.state, input.settledAt)
      : existing.state;
    const updated = {
      ...existing,
      ...(state ? { state, status: state.status, turn: state.turn } : {}),
      ...(input.reward
        ? {
            reward: {
              xp: input.reward.rewardXp,
              gold: input.reward.rewardGold,
              itemGrants: input.reward.itemGrants,
              claimedAt: input.reward.claimedAt
            }
          }
        : {}),
      updatedAt: fixedNow()
    };
    this.sessions.set(sessionId, updated);

    return Promise.resolve({ outcome: "completed", session: updated });
  }

  forfeitSettlementById(
    sessionId: string,
    input: { settledAt: Date; reason: "remort" | "life-mismatch" | "legacy-life-mismatch" }
  ): Promise<{ outcome: "forfeited" | "already-completed" | "already-forfeited"; session: SoloCombatSessionRecord | null }> {
    const existing = this.sessions.get(sessionId);

    if (!existing) {
      return Promise.resolve({ outcome: "forfeited", session: null });
    }

    if (existing.state?.settlement?.status === "completed") {
      return Promise.resolve({ outcome: "already-completed", session: existing });
    }

    if (existing.state?.settlement?.status === "forfeited-by-remort") {
      return Promise.resolve({ outcome: "already-forfeited", session: existing });
    }

    const state = existing.state
      ? markCombatSettlementForfeitedByRemort(existing.state, input.settledAt, input.reason)
      : existing.state;
    const updated = {
      ...existing,
      ...(state ? { state, status: state.status, turn: state.turn } : {}),
      updatedAt: fixedNow()
    };
    this.sessions.set(sessionId, updated);

    return Promise.resolve({ outcome: "forfeited", session: updated });
  }

  markStatusById(
    sessionId: string,
    status: SoloCombatSessionRecord["status"],
    observedAt?: Date
  ): Promise<SoloCombatSessionRecord | null> {
    this.lastStatusMark = { sessionId, status, ...(observedAt ? { observedAt } : {}) };
    const existing = this.sessions.get(sessionId);

    if (!existing) {
      return Promise.resolve(null);
    }

    const updated = {
      ...existing,
      status,
      state: existing.state ? { ...existing.state, status } : existing.state
    };
    this.sessions.set(sessionId, updated);

    return Promise.resolve(updated);
  }
}
