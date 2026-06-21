import { randomUUID } from "node:crypto";
import type { CharacterRepository } from "../db/repositories/characterRepository";
import type { CooldownRepository } from "../db/repositories/cooldownRepository";
import type { DailyActionRepository, RewardLevelChange } from "../db/repositories/dailyActionRepository";
import type {
  DuelCharacterSnapshot,
  ResolvedDuelChallengeRecord
} from "../db/repositories/duelChallengeRepository";
import type { EquipmentRepository } from "../db/repositories/equipmentRepository";
import type {
  DueSoloCombatSessionRecord,
  SoloCombatSessionRecord,
  SoloCombatSessionRepository
} from "../db/repositories/soloCombatSessionRepository";
import { summarizeCharacter, type CharacterSummary } from "../domain/characters/characterSummary";
import {
  expireCombat,
  markCombatTurnTimeoutMode,
  recordCombatTimeout,
  resetCombatTimeout,
  resolveCombatTurn,
  startCombat,
  type CombatActionType
} from "../domain/combat";
import {
  buildTrainingDoppelgangerCombatStatsFromState,
  buildTrainingDoppelgangerSpawn,
  getTrainingDoppelgangerRecoveryMs,
  isTrainingDoppelgangerMonsterId,
  rollTrainingDoppelgangerXpReward,
  TRAINING_DOPPELGANGER_MIN_LEVEL,
  TRAINING_DOPPELGANGER_MONSTER_ID,
  type TrainingDoppelgangerSpawnConfig,
  type TrainingDoppelgangerSpawnMode,
  type TrainingDoppelgangerXpReward
} from "../domain/trainingDoppelganger";
import { CryptoRandomSource, type RandomSource } from "../shared/random";
import { systemClock, type Clock } from "../shared/time";
import { getEquippedItemContents } from "./equipmentService";
import type { CombatBalanceAnalyticsService } from "./combatBalanceAnalyticsService";

export const TRAINING_DOPPELGANGER_COOLDOWN_KEY = "training.doppelganger.spar";
export const TRAINING_DOPPELGANGER_REWARD_KEY = "training.doppelganger.reward";

const DAY_MS = 24 * 60 * 60 * 1000;
const TRAINING_FIGHT_TURN_SECONDS = 23;

export type TrainingDoppelgangerStartMode =
  | "copy-target"
  | "random-build"
  | "champion-day"
  | "champion-week"
  | "champion-month";
export type TrainingDoppelgangerChampionPeriod = "day" | "week" | "month";

export interface TrainingDoppelgangerStartChoice {
  mode: TrainingDoppelgangerStartMode;
  buttonLabel: string;
  title: string;
  description: string;
  championName?: string;
}

export interface TrainingDoppelgangerChampionSource {
  listResolvedSince(since: Date): Promise<ResolvedDuelChallengeRecord[]>;
}

interface TrainingDoppelgangerChampionChoice {
  period: TrainingDoppelgangerChampionPeriod;
  name: string;
  character: CharacterSummary;
  equippedItems: Awaited<ReturnType<typeof getEquippedItemContents>>;
}

export type TrainingDoppelgangerLookupResult =
  | { state: "no-character" }
  | { state: "level-gated"; character: CharacterSummary; minLevel: number }
  | { state: "needs-rest"; character: CharacterSummary }
  | { state: "on-cooldown"; character: CharacterSummary; availableAt: Date; now: Date }
  | { state: "another-fight-active"; character: CharacterSummary }
  | { state: "ready"; character: CharacterSummary; choices: TrainingDoppelgangerStartChoice[] }
  | {
      state: "active";
      character: CharacterSummary;
      doppelganger: TrainingDoppelgangerCopy;
      session: SoloCombatSessionRecord;
    }
  | {
      state: "terminal";
      character: CharacterSummary;
      doppelganger: TrainingDoppelgangerCopy;
      session: SoloCombatSessionRecord;
      reward: TrainingDoppelgangerRewardClaim | null;
    };

export type TrainingDoppelgangerTurnResult =
  | { state: "no-character" }
  | { state: "level-gated"; character: CharacterSummary; minLevel: number }
  | { state: "not-found"; character: CharacterSummary }
  | {
      state: "stale-turn";
      character: CharacterSummary;
      doppelganger: TrainingDoppelgangerCopy;
      session: SoloCombatSessionRecord;
    }
  | {
      state: "not-enough-mana";
      reason?: "not-enough-mana" | "skill-on-cooldown";
      character: CharacterSummary;
      doppelganger: TrainingDoppelgangerCopy;
      session: SoloCombatSessionRecord;
    }
  | {
      state: "updated";
      character: CharacterSummary;
      doppelganger: TrainingDoppelgangerCopy;
      session: SoloCombatSessionRecord;
      reward: TrainingDoppelgangerRewardClaim | null;
    }
  | {
      state: "terminal";
      character: CharacterSummary;
      doppelganger: TrainingDoppelgangerCopy;
      session: SoloCombatSessionRecord;
      reward: TrainingDoppelgangerRewardClaim | null;
    };

export type TrainingDoppelgangerTimeoutResult =
  | { state: "skipped" }
  | {
      state: "updated";
      telegramUserId: bigint;
      character: CharacterSummary;
      doppelganger: TrainingDoppelgangerCopy;
      session: SoloCombatSessionRecord;
      reward: TrainingDoppelgangerRewardClaim | null;
    }
  | {
      state: "terminal";
      telegramUserId: bigint;
      character: CharacterSummary;
      doppelganger: TrainingDoppelgangerCopy;
      session: SoloCombatSessionRecord;
      reward: TrainingDoppelgangerRewardClaim | null;
    };

export interface TrainingCombatMessageReferenceInput {
  chatId: string;
  messageId: number;
}

export interface TrainingDoppelgangerCopy {
  name: string;
  raceName: string;
  className: string;
  title: string;
  level: number;
  spawnMode: "COPY_TARGET" | "RANDOM_BUILD";
  source: "target" | "random-build" | "champion-fallback";
  championPeriod?: TrainingDoppelgangerChampionPeriod;
  championName?: string;
  copiedEquipmentCount: number;
}

export interface TrainingDoppelgangerRewardClaim {
  state: "claimed" | "replayed" | "already-claimed";
  reward: TrainingDoppelgangerXpReward & { localDate: string };
  availableAt: Date | null;
  now: Date;
  levelChange: RewardLevelChange | null;
}

export class TrainingDoppelgangerService {
  constructor(
    private readonly characters: CharacterRepository,
    private readonly cooldowns: CooldownRepository,
    private readonly dailyActions: DailyActionRepository,
    private readonly combatSessions: SoloCombatSessionRepository,
    private readonly equipment?: EquipmentRepository,
    private readonly clock: Clock = systemClock,
    private readonly rng: RandomSource = new CryptoRandomSource(),
    private readonly spawnConfig: TrainingDoppelgangerSpawnConfig = {},
    private readonly championSource?: TrainingDoppelgangerChampionSource,
    private readonly combatAnalytics?: CombatBalanceAnalyticsService
  ) {}

  private async advanceExpiredTrainingTurn(
    telegramUserId: bigint,
    session: SoloCombatSessionRecord,
    character: CharacterSummary,
    mode: "auto-attack" | "skip" = "auto-attack"
  ): Promise<SoloCombatSessionRecord> {
    if (session.status !== "active" || session.state?.status !== "active") {
      return session;
    }

    const now = this.clock();
    if (session.expiresAt <= now) {
      return this.expireTrainingSession(telegramUserId, session);
    }

    if (!session.state.turnExpiresAt) {
      const state = withNextTrainingTurnExpiry(session.state, now);
      const updated = await this.combatSessions.updateByIdIfActiveTurn(session.id, session.state.turn, {
        state,
        status: state.status
      });

      return updated ?? { ...session, state };
    }

    if (!isTrainingTurnExpired(session.state, now)) {
      return session;
    }

    const timeoutMode = getNextTrainingTimeoutMode(mode);

    const resolved = resolveCombatTurn({
      state: session.state,
      action: timeoutMode === "skip" ? "skip" : "attack",
      actionOrigin: timeoutMode === "skip" ? "timeout-skip" : "timeout-auto-attack",
      hero: buildHeroCombatStats(character),
      monster: buildTrainingDoppelgangerCombatStatsFromState(session.state, character),
      rng: this.rng
    });
    const state = resolved.ok
      ? markCombatTurnTimeoutMode(
          withNextTrainingTurnExpiry(recordCombatTimeout(resolved.state, now), now),
          timeoutMode
        )
      : null;

    if (!state) {
      return session;
    }
    const updated = await this.combatSessions.updateByIdIfActiveTurn(session.id, session.state.turn, {
      state,
      status: state.status
    });

    if (updated && updated.status !== "active") {
      await this.persistCharacterResources(telegramUserId, updated);
    }

    return updated ?? session;
  }

  private async expireTrainingSession(
    telegramUserId: bigint,
    session: SoloCombatSessionRecord
  ): Promise<SoloCombatSessionRecord> {
    if (!session.state) {
      return await this.combatSessions.markStatusById(session.id, "expired") ?? {
        ...session,
        status: "expired"
      };
    }

    const expiredState = expireCombat(session.state);
    const updated = await this.combatSessions.updateByIdIfActiveTurn(session.id, session.state.turn, {
      state: expiredState,
      status: expiredState.status
    });

    if (!updated) {
      return session;
    }

    await this.persistCharacterResources(telegramUserId, updated);

    return updated;
  }

  async getStartOptionsForTelegramUser(
    telegramUserId: bigint,
    options: { expiredTurnMode?: "auto-attack" | "skip" } = {}
  ): Promise<TrainingDoppelgangerLookupResult> {
    const base = await this.getStartBaseForTelegramUser(telegramUserId, options);

    if (base.state !== "startable") {
      return base.result;
    }

    return {
      state: "ready",
      character: base.character,
      choices: await this.buildStartChoices(base.character)
    };
  }

  async getOrStartForTelegramUser(
    telegramUserId: bigint,
    options: { mode?: TrainingDoppelgangerStartMode } = {}
  ): Promise<TrainingDoppelgangerLookupResult> {
    const base = await this.getStartBaseForTelegramUser(telegramUserId);

    if (base.state !== "startable") {
      return base.result;
    }

    const now = this.clock();
    const character = base.character;
    const spawnInput = await this.resolveSpawnInput(character, base.equippedItems, options.mode ?? "copy-target");

    if (!spawnInput) {
      return {
        state: "ready",
        character,
        choices: await this.buildStartChoices(character)
      };
    }

    const sessionId = randomUUID();
    const spawn = buildTrainingDoppelgangerSpawn(spawnInput.character, {
      equippedItems: spawnInput.equippedItems,
      rng: this.rng,
      spawnConfig: {
        ...this.spawnConfig,
        mode: spawnInput.spawnMode
      }
    });
    const state = startCombat({
      id: sessionId,
      hero: buildHeroCombatStats(character),
      monster: spawn.monster
    });
    state.turnExpiresAt = getTrainingTurnExpiry(now).toISOString();
    state.source = "training";
    const analytics = this.combatAnalytics?.createInitialState({
      characterId: base.characterId,
      character,
      monster: spawn.monster,
      combatSource: "training",
      startedAt: now,
      monsterType: "training_doppelganger",
      difficultyTier: spawnInput.spawnMode.toLowerCase().replace(/_/g, "-")
    });
    if (analytics) {
      state.analytics = analytics;
    }
    const session = await this.combatSessions.createForTelegramUser(telegramUserId, {
      id: sessionId,
      monsterId: TRAINING_DOPPELGANGER_MONSTER_ID,
      state,
      expiresAt: getTrainingSessionExpiry(now)
    });

    if (!session) {
      return { state: "no-character" };
    }

    return {
      state: "active",
      character,
      doppelganger: buildDoppelgangerCopy(spawn.character, session.state),
      session
    };
  }

  async listDueTrainingTurns(options: { limit?: number } = {}): Promise<DueSoloCombatSessionRecord[]> {
    if (!this.combatSessions.listDueActiveSessions) {
      return [];
    }

    const due = await this.combatSessions.listDueActiveSessions(this.clock(), {
      ...options,
      monsterIds: [TRAINING_DOPPELGANGER_MONSTER_ID]
    });

    return due.filter((session) =>
      session.status === "active" &&
      session.state?.status === "active" &&
      isTrainingDoppelgangerMonsterId(session.monsterId)
    );
  }

  async resolveDueTrainingTurn(
    due: DueSoloCombatSessionRecord
  ): Promise<TrainingDoppelgangerTimeoutResult> {
    if (!due.state || due.status !== "active" || due.state.status !== "active") {
      return { state: "skipped" };
    }

    const current = await this.cooldowns.findForTelegramUser(
      due.telegramUserId,
      TRAINING_DOPPELGANGER_COOLDOWN_KEY
    );

    if (!current) {
      return { state: "skipped" };
    }

    const equippedItems = await this.getEquippedItemContents(due.telegramUserId);
    const character = summarizeCharacter(current.character, { equippedItems });
    const refreshedSession = await this.advanceExpiredTrainingTurn(
      due.telegramUserId,
      due,
      character
    );

    const doppelganger = buildDoppelgangerCopy(character, refreshedSession.state);

    if (refreshedSession.status !== "active" || refreshedSession.state?.status !== "active") {
      return {
        state: "terminal",
        telegramUserId: due.telegramUserId,
        character,
        doppelganger,
        session: refreshedSession,
        reward: await this.claimOrRecoverTerminalReward(due.telegramUserId, character, refreshedSession)
      };
    }

    if (refreshedSession.id === due.id && refreshedSession.state?.turn === due.state.turn) {
      return { state: "skipped" };
    }

    return {
      state: "updated",
      telegramUserId: due.telegramUserId,
      character,
      doppelganger,
      session: refreshedSession,
      reward: null
    };
  }

  async recordTrainingDoppelgangerMessageReference(
    telegramUserId: bigint,
    sessionId: string,
    reference: TrainingCombatMessageReferenceInput
  ): Promise<void> {
    const session = await this.combatSessions.findByIdForTelegramUserId(telegramUserId, sessionId);

    if (
      session?.status !== "active" ||
      session.state?.status !== "active" ||
      !isTrainingDoppelgangerMonsterId(session.monsterId)
    ) {
      return;
    }

    await this.combatSessions.updateByIdIfActiveTurn(session.id, session.state.turn, {
      state: {
        ...session.state,
        message: reference
      },
      status: session.state.status,
      expiresAt: session.expiresAt
    });
  }

  async resolveTurn(
    telegramUserId: bigint,
    input: { sessionId: string; turn: number; action: CombatActionType }
  ): Promise<TrainingDoppelgangerTurnResult> {
    const current = await this.cooldowns.findForTelegramUser(
      telegramUserId,
      TRAINING_DOPPELGANGER_COOLDOWN_KEY
    );

    if (!current) {
      return { state: "no-character" };
    }

    const equippedItems = await this.getEquippedItemContents(telegramUserId);
    const character = summarizeCharacter(current.character, { equippedItems });

    if (character.level < TRAINING_DOPPELGANGER_MIN_LEVEL) {
      return { state: "level-gated", character, minLevel: TRAINING_DOPPELGANGER_MIN_LEVEL };
    }

    const session = await this.combatSessions.findByIdForTelegramUserId(
      telegramUserId,
      input.sessionId
    );

    if (!session || !isTrainingDoppelgangerMonsterId(session.monsterId)) {
      return { state: "not-found", character };
    }

    const doppelganger = buildDoppelgangerCopy(character, session.state);

    if (session.status !== "active") {
      return {
        state: "terminal",
        character,
        doppelganger,
        session,
        reward: await this.claimOrRecoverTerminalReward(telegramUserId, character, session)
      };
    }

    if (!session.state) {
      const expired = await this.combatSessions.markStatusById(session.id, "expired");
      return {
        state: "terminal",
        character,
        doppelganger,
        session: expired ?? { ...session, status: "expired" },
        reward: null
      };
    }

    if (session.expiresAt <= this.clock()) {
      const expiredState = expireCombat(session.state);
      const expired = await this.combatSessions.updateById(session.id, {
        state: expiredState,
        status: expiredState.status
      });

      return {
        state: "terminal",
        character,
        doppelganger,
        session: expired ?? { ...session, state: expiredState, status: "expired" },
        reward: null
      };
    }

    const deadlineSession = await this.advanceExpiredTrainingTurn(telegramUserId, session, character);
    if (deadlineSession.state?.turn !== session.state.turn) {
      const refreshedDoppelganger = buildDoppelgangerCopy(character, deadlineSession.state);
      if (deadlineSession.status === "active" && deadlineSession.state?.status === "active") {
        return {
          state: "stale-turn",
          character,
          doppelganger: refreshedDoppelganger,
          session: deadlineSession
        };
      }

      return {
        state: "terminal",
        character,
        doppelganger: refreshedDoppelganger,
        session: deadlineSession,
        reward: await this.claimOrRecoverTerminalReward(telegramUserId, character, deadlineSession)
      };
    }

    const currentSession = deadlineSession;
    const currentDoppelganger = buildDoppelgangerCopy(character, currentSession.state);

    if (currentSession.state?.turn !== input.turn) {
      return {
        state: "stale-turn",
        character,
        doppelganger: currentDoppelganger,
        session: currentSession
      };
    }

    const resolved = resolveCombatTurn({
      state: currentSession.state,
      action: input.action,
      hero: buildHeroCombatStats(character),
      monster: buildTrainingDoppelgangerCombatStatsFromState(session.state, character),
      rng: this.rng
    });

    if (!resolved.ok && resolved.reason !== "not-enough-mana" && resolved.reason !== "skill-on-cooldown") {
      return {
        state: "terminal",
        character,
        doppelganger,
        session,
        reward: await this.claimOrRecoverTerminalReward(telegramUserId, character, session)
      };
    }

    if (!resolved.ok) {
      return {
        state: "not-enough-mana",
        reason: resolved.reason === "skill-on-cooldown" ? "skill-on-cooldown" : "not-enough-mana",
        character,
        doppelganger: currentDoppelganger,
        session: currentSession
      };
    }

    const resolvedState = withNextTrainingTurnExpiry(resetCombatTimeout(resolved.state), this.clock());
    const updated = await this.combatSessions.updateByIdIfActiveTurn(currentSession.id, input.turn, {
      state: resolvedState,
      status: resolvedState.status,
      expiresAt: getTrainingSessionExpiry(this.clock())
    });

    if (!updated) {
      const currentSession = await this.combatSessions.findByIdForTelegramUserId(
        telegramUserId,
        input.sessionId
      );
      const fallbackSession = currentSession ?? session;

      if (fallbackSession.status === "active" && fallbackSession.state?.status === "active") {
        return {
          state: "stale-turn",
          character,
          doppelganger: buildDoppelgangerCopy(character, fallbackSession.state),
          session: fallbackSession
        };
      }

      return {
        state: "terminal",
        character,
        doppelganger: buildDoppelgangerCopy(character, fallbackSession.state),
        session: fallbackSession,
        reward: await this.claimOrRecoverTerminalReward(telegramUserId, character, fallbackSession)
      };
    }

    const reward =
      updated.status === "won" || updated.status === "lost"
      ? await this.claimOrRecoverTerminalReward(telegramUserId, character, updated)
      : null;

    if (updated.status !== "active") {
      await this.persistCharacterResources(telegramUserId, updated);
    }

    return {
      state: "updated",
      character,
      doppelganger: buildDoppelgangerCopy(character, updated.state),
      session: updated,
      reward
    };
  }

  private async getStartBaseForTelegramUser(
    telegramUserId: bigint,
    options: { expiredTurnMode?: "auto-attack" | "skip" } = {}
  ): Promise<
      | {
        state: "startable";
        characterId: string;
        character: CharacterSummary;
        equippedItems: Awaited<ReturnType<TrainingDoppelgangerService["getEquippedItemContents"]>>;
      }
    | { state: "blocked"; result: TrainingDoppelgangerLookupResult }
  > {
    const now = this.clock();
    const current = await this.cooldowns.findForTelegramUser(
      telegramUserId,
      TRAINING_DOPPELGANGER_COOLDOWN_KEY
    );

    if (!current) {
      return { state: "blocked", result: { state: "no-character" } };
    }

    const equippedItems = await this.getEquippedItemContents(telegramUserId);
    const character = summarizeCharacter(current.character, { equippedItems });

    if (character.level < TRAINING_DOPPELGANGER_MIN_LEVEL) {
      return {
        state: "blocked",
        result: { state: "level-gated", character, minLevel: TRAINING_DOPPELGANGER_MIN_LEVEL }
      };
    }

    const activeSession = await this.combatSessions.findActiveByTelegramUserId(telegramUserId);

    if (activeSession) {
      if (!isTrainingDoppelgangerMonsterId(activeSession.monsterId)) {
        return { state: "blocked", result: { state: "another-fight-active", character } };
      }

      return {
        state: "blocked",
      result: await this.getExistingTrainingSession(telegramUserId, character, activeSession, options)
      };
    }

    if (current.cooldown && current.cooldown.availableAt > now) {
      return {
        state: "blocked",
        result: {
          state: "on-cooldown",
          character,
          availableAt: current.cooldown.availableAt,
          now
        }
      };
    }

    if (character.hpCurrent <= 0) {
      return { state: "blocked", result: { state: "needs-rest", character } };
    }

    return { state: "startable", characterId: current.character.id, character, equippedItems };
  }

  private async buildStartChoices(
    character: CharacterSummary
  ): Promise<TrainingDoppelgangerStartChoice[]> {
    const choices: TrainingDoppelgangerStartChoice[] = [
      {
        mode: "copy-target",
        buttonLabel: "🪞 Копія поточного",
        title: "Копія поточного",
        description: "Допельґанґер бере ваші теперішні расу, клас і пасивне спорядження."
      },
      {
        mode: "random-build",
        buttonLabel: "🎲 Випадковий пригодник",
        title: "Випадковий пригодник",
        description: "Корчемне дзеркало збирає випадкову расу, клас і тренувальні манатки."
      }
    ];
    const champions = await this.getChampionChoices(character);

    for (const period of ["day", "week", "month"] as const) {
      const champion = champions[period];

      if (!champion) {
        continue;
      }

      choices.push({
        mode: `champion-${period}`,
        buttonLabel: `${getChampionPeriodIcon(period)} Чемпіон ${getChampionPeriodShortLabel(period)}`,
        title: `Копія чемпіона ${getChampionPeriodTitle(period)}`,
        description: `Дзеркало бере ${champion.name} з дуельної дошки й не вдає, що це просто ви з іншою зачіскою.`,
        championName: champion.name
      });
    }

    return choices;
  }

  private async resolveSpawnInput(
    character: CharacterSummary,
    equippedItems: Awaited<ReturnType<TrainingDoppelgangerService["getEquippedItemContents"]>>,
    mode: TrainingDoppelgangerStartMode
  ): Promise<{
    character: CharacterSummary;
    equippedItems: Awaited<ReturnType<TrainingDoppelgangerService["getEquippedItemContents"]>>;
    spawnMode: TrainingDoppelgangerSpawnMode;
  } | null> {
    if (mode === "copy-target") {
      return { character, equippedItems, spawnMode: "COPY_TARGET" };
    }

    if (mode === "random-build") {
      return { character, equippedItems: [], spawnMode: "RANDOM_BUILD" };
    }

    const period = mode.replace("champion-", "") as TrainingDoppelgangerChampionPeriod;
    const champion = (await this.getChampionChoices(character))[period];

    if (!champion) {
      return null;
    }

    return {
      character: champion.character,
      equippedItems: champion.equippedItems,
      spawnMode: getChampionSpawnMode(period)
    };
  }

  private async getChampionChoices(
    character: CharacterSummary
  ): Promise<Partial<Record<TrainingDoppelgangerChampionPeriod, TrainingDoppelgangerChampionChoice>>> {
    if (!this.championSource) {
      return {};
    }

    const now = this.clock();
    const records = await this.championSource.listResolvedSince(new Date(now.getTime() - 31 * DAY_MS));
    const result: Partial<Record<TrainingDoppelgangerChampionPeriod, TrainingDoppelgangerChampionChoice>> = {};
    const seenFingerprints = new Set([buildCharacterFingerprint(character)]);

    for (const period of ["day", "week", "month"] as const) {
      const champion = selectDuelChampion(records, getChampionSince(now, period));

      if (!champion) {
        continue;
      }

      const equippedItems = getEquippedItemContents(champion.equipment);
      const championSummary = summarizeCharacter(champion, { equippedItems });
      const fingerprint = buildCharacterFingerprint(championSummary);

      if (seenFingerprints.has(fingerprint)) {
        continue;
      }

      seenFingerprints.add(fingerprint);
      result[period] = {
        period,
        name: championSummary.name,
        character: championSummary,
        equippedItems
      };
    }

    return result;
  }

  private async getExistingTrainingSession(
    telegramUserId: bigint,
    character: CharacterSummary,
    session: SoloCombatSessionRecord,
    options: { expiredTurnMode?: "auto-attack" | "skip" } = {}
  ): Promise<Extract<TrainingDoppelgangerLookupResult, { state: "active" | "terminal" }>> {
    if (!session.state) {
      const expired = await this.combatSessions.markStatusById(session.id, "expired");

      return {
        state: "terminal",
        character,
        doppelganger: buildDoppelgangerCopy(character, session.state),
        session: expired ?? { ...session, status: "expired" },
        reward: null
      };
    }

    if (session.expiresAt <= this.clock()) {
      const expiredState = expireCombat(session.state);
      const expired = await this.combatSessions.updateById(session.id, {
        state: expiredState,
        status: expiredState.status
      });
      const terminalSession = expired ?? { ...session, state: expiredState, status: "expired" };

      return {
        state: "terminal",
        character,
        doppelganger: buildDoppelgangerCopy(character, session.state),
        session: terminalSession,
        reward: null
      };
    }

    if (session.state.status !== "active") {
      return {
        state: "terminal",
        character,
        doppelganger: buildDoppelgangerCopy(character, session.state),
        session,
        reward: await this.claimOrRecoverTerminalReward(telegramUserId, character, session)
      };
    }

    const refreshedSession = await this.advanceExpiredTrainingTurn(
      telegramUserId,
      session,
      character,
      options.expiredTurnMode ?? "auto-attack"
    );
    if (refreshedSession.status !== "active" || refreshedSession.state?.status !== "active") {
      return {
        state: "terminal",
        character,
        doppelganger: buildDoppelgangerCopy(character, refreshedSession.state),
        session: refreshedSession,
        reward: await this.claimOrRecoverTerminalReward(telegramUserId, character, refreshedSession)
      };
    }

    return {
      state: "active",
      character,
      doppelganger: buildDoppelgangerCopy(character, refreshedSession.state),
      session: refreshedSession
    };
  }

  private async claimOrRecoverTerminalReward(
    telegramUserId: bigint,
    character: CharacterSummary,
    session: SoloCombatSessionRecord
  ): Promise<TrainingDoppelgangerRewardClaim | null> {
    await this.combatAnalytics?.recordTerminalSession(session);
    const terminalStatus = session.state?.status ?? session.status;

    if (terminalStatus === "won" || terminalStatus === "lost") {
      return this.claimRewardAndCooldown(telegramUserId, character, session);
    }

    return this.getStoredRewardReplay(telegramUserId, session);
  }

  private async claimRewardAndCooldown(
    telegramUserId: bigint,
    character: CharacterSummary,
    session: SoloCombatSessionRecord
  ): Promise<TrainingDoppelgangerRewardClaim | null> {
    const replay = buildRewardReplay(session);

    if (replay) {
      return replay;
    }

    const terminalStatus = session.state?.status ?? session.status;

    if (terminalStatus !== "won" && terminalStatus !== "lost") {
      return null;
    }

    const reward = rollTrainingDoppelgangerXpReward(character, terminalStatus, this.rng);
    const claim = await this.dailyActions.claimForTelegramUser(telegramUserId, {
      key: TRAINING_DOPPELGANGER_REWARD_KEY,
      localDate: session.id,
      rewardXp: reward.xp,
      rewardGold: 0,
      itemGrants: []
    });

    if (!claim) {
      return null;
    }

    if (claim.state === "insufficient-gold") {
      throw new Error("Training doppelganger daily claim unexpectedly required gold.");
    }

    if (claim.state === "existing") {
      await this.combatSessions.recordRewardById(session.id, {
        rewardXp: claim.action.rewardXp,
        rewardGold: 0,
        itemGrants: [],
        claimedAt: this.clock()
      });
      return {
        state: "already-claimed",
        reward: {
          xp: claim.action.rewardXp,
          gold: 0,
          localDate: claim.action.localDate
        },
        availableAt: null,
        now: this.clock(),
        levelChange: null
      };
    }

    const availableAt = new Date(
      this.clock().getTime() +
        getTrainingDoppelgangerRecoveryMs({
          character,
          doppelgangerHp: session.state?.monster.hp ?? 0,
          doppelgangerHpMax: session.state?.monster.hpMax ?? character.hpMax
        })
    );
    await this.cooldowns.claimRewardForTelegramUser(telegramUserId, {
      key: TRAINING_DOPPELGANGER_COOLDOWN_KEY,
      now: this.clock(),
      availableAt,
      rewardXp: 0,
      rewardGold: 0,
      itemGrants: []
    });
    const stored = await this.combatSessions.recordRewardById(session.id, {
      rewardXp: claim.action.rewardXp,
      rewardGold: 0,
      itemGrants: [],
      claimedAt: this.clock()
    });

    return {
      state: stored ? "claimed" : "already-claimed",
      reward: {
        xp: claim.action.rewardXp,
        gold: 0,
        localDate: claim.action.localDate
      },
      availableAt,
      now: this.clock(),
      levelChange: claim.levelChange
    };
  }

  private async getStoredRewardReplay(
    telegramUserId: bigint,
    session: SoloCombatSessionRecord
  ): Promise<TrainingDoppelgangerRewardClaim | null> {
    const replay = buildRewardReplay(session);

    if (replay) {
      return replay;
    }

    const action = await this.dailyActions.findForTelegramUser(telegramUserId, {
      key: TRAINING_DOPPELGANGER_REWARD_KEY,
      localDate: session.id
    });

    if (!action) {
      return null;
    }

    return {
      state: "already-claimed",
      reward: {
        xp: action.rewardXp,
        gold: 0,
        localDate: action.localDate
      },
      availableAt: null,
      now: this.clock(),
      levelChange: null
    };
  }

  private async getEquippedItemContents(telegramUserId: bigint) {
    const equipmentSnapshot = this.equipment
      ? await this.equipment.listByTelegramUserId(telegramUserId)
      : null;

    return equipmentSnapshot ? getEquippedItemContents(equipmentSnapshot.equipment) : [];
  }

  private async persistCharacterResources(
    telegramUserId: bigint,
    session: SoloCombatSessionRecord
  ): Promise<void> {
    if (!session.state) {
      return;
    }

    await this.characters.updateResourcesForTelegramUser?.(telegramUserId, {
      hpCurrent: session.state.hero.hp,
      manaCurrent: session.state.hero.mana,
      hpRegenAt: this.clock(),
      manaRegenAt: this.clock()
    });
    await this.combatAnalytics?.recordTerminalSession(session);
  }
}

function buildDoppelgangerCopy(
  character: CharacterSummary,
  state?: SoloCombatSessionRecord["state"]
): TrainingDoppelgangerCopy {
  const trace = state?.monster.debugTrace ?? state?.lastTurn?.debugTrace;
  const source = getDoppelgangerCopySource(trace);

  return {
    name: state?.monster.name ?? "Сумлінний Допельґанґер",
    raceName: state?.monster.raceName ?? character.raceName,
    className: state?.monster.className ?? character.className,
    title: state?.monster.title ?? character.title,
    level: state?.monster.level ?? character.level,
    spawnMode: trace?.spawnMode === "RANDOM_BUILD" ? "RANDOM_BUILD" : "COPY_TARGET",
    source,
    ...(isChampionPeriod(trace?.championPeriod)
      ? { championPeriod: trace.championPeriod }
      : {}),
    ...(trace?.championName?.trim() ? { championName: trace.championName.trim() } : {}),
    copiedEquipmentCount: trace?.copiedEquipmentCount ?? 0
  };
}

function getDoppelgangerCopySource(
  trace: NonNullable<SoloCombatSessionRecord["state"]>["monster"]["debugTrace"] | undefined
): TrainingDoppelgangerCopy["source"] {
  if (trace?.source === "random-build" || trace?.spawnMode === "RANDOM_BUILD") {
    return "random-build";
  }

  if (trace?.source === "champion-fallback" || trace?.spawnMode?.startsWith("COPY_CHAMPION")) {
    return "champion-fallback";
  }

  return "target";
}

function isChampionPeriod(
  period: string | undefined
): period is TrainingDoppelgangerChampionPeriod {
  return period === "day" || period === "week" || period === "month";
}

function buildHeroCombatStats(character: CharacterSummary) {
  const effects = character.equipmentEffects;

  return {
    level: character.level,
    hpMax: character.hpMax,
    manaMax: character.manaMax,
    hpCurrent: character.hpCurrent,
    manaCurrent: character.manaCurrent,
    classId: character.classId,
    ...character.stats,
    armor: effects?.armor ?? 0,
    resist: effects?.resist ?? 0,
    weaponDamage: effects?.weaponDamage ?? 0,
    spellPower: effects?.spellPower ?? 0
  };
}

function buildRewardReplay(
  session: SoloCombatSessionRecord
): TrainingDoppelgangerRewardClaim | null {
  if (!session.reward) {
    return null;
  }

  return {
    state: "replayed",
    reward: {
      xp: session.reward.xp,
      gold: 0,
      localDate: session.id
    },
    availableAt: null,
    now: session.reward.claimedAt,
    levelChange: null
  };
}

function getTrainingSessionExpiry(now: Date): Date {
  return new Date(now.getTime() + 30 * 60 * 1000);
}

function getTrainingTurnExpiry(now: Date): Date {
  return new Date(now.getTime() + TRAINING_FIGHT_TURN_SECONDS * 1000);
}

function isTrainingTurnExpired(state: SoloCombatSessionRecord["state"], now: Date): boolean {
  return Boolean(state?.turnExpiresAt && Date.parse(state.turnExpiresAt) <= now.getTime());
}

function getNextTrainingTimeoutMode(
  fallbackMode: "auto-attack" | "skip"
): "auto-attack" | "skip" {
  return fallbackMode;
}

function withNextTrainingTurnExpiry(
  state: NonNullable<SoloCombatSessionRecord["state"]>,
  now: Date
): NonNullable<SoloCombatSessionRecord["state"]> {
  if (state.status !== "active") {
    const next = { ...state };
    delete next.turnExpiresAt;
    return next;
  }

  return {
    ...state,
    turnExpiresAt: getTrainingTurnExpiry(now).toISOString()
  };
}

function getChampionSince(now: Date, period: TrainingDoppelgangerChampionPeriod): Date {
  if (period === "day") {
    return new Date(now.getTime() - DAY_MS);
  }

  if (period === "week") {
    return new Date(now.getTime() - 7 * DAY_MS);
  }

  return new Date(now.getTime() - 31 * DAY_MS);
}

function getChampionSpawnMode(
  period: TrainingDoppelgangerChampionPeriod
): Extract<TrainingDoppelgangerSpawnMode, "COPY_CHAMPION_DAY" | "COPY_CHAMPION_WEEK" | "COPY_CHAMPION_MONTH"> {
  if (period === "day") {
    return "COPY_CHAMPION_DAY";
  }

  if (period === "week") {
    return "COPY_CHAMPION_WEEK";
  }

  return "COPY_CHAMPION_MONTH";
}

function getChampionPeriodIcon(period: TrainingDoppelgangerChampionPeriod): string {
  if (period === "day") {
    return "☀️";
  }

  if (period === "week") {
    return "📅";
  }

  return "🌙";
}

function getChampionPeriodShortLabel(period: TrainingDoppelgangerChampionPeriod): string {
  if (period === "day") {
    return "дня";
  }

  if (period === "week") {
    return "тижня";
  }

  return "місяця";
}

function getChampionPeriodTitle(period: TrainingDoppelgangerChampionPeriod): string {
  return getChampionPeriodShortLabel(period);
}

function selectDuelChampion(
  records: readonly ResolvedDuelChallengeRecord[],
  since: Date
): DuelCharacterSnapshot | null {
  const entries = new Map<
    string,
    { character: DuelCharacterSnapshot; winCount: number; drawCount: number; lossCount: number }
  >();

  for (const record of records) {
    if (record.resolvedAt < since) {
      continue;
    }

    const challenger = getOrCreateDuelChampionEntry(entries, record.challenger);
    const target = getOrCreateDuelChampionEntry(entries, record.target);

    if (record.result.outcome === "draw") {
      challenger.drawCount += 1;
      target.drawCount += 1;
    } else if (record.result.outcome === "challenger") {
      challenger.winCount += 1;
      target.lossCount += 1;
    } else {
      target.winCount += 1;
      challenger.lossCount += 1;
    }
  }

  return [...entries.values()]
    .filter((entry) => entry.winCount > 0)
    .sort((left, right) => {
      const winDiff = right.winCount - left.winCount;
      const drawDiff = right.drawCount - left.drawCount;
      const lossDiff = left.lossCount - right.lossCount;

      if (winDiff !== 0) {
        return winDiff;
      }

      if (drawDiff !== 0) {
        return drawDiff;
      }

      return lossDiff === 0 ? left.character.name.localeCompare(right.character.name, "uk") : lossDiff;
    })[0]?.character ?? null;
}

function getOrCreateDuelChampionEntry(
  entries: Map<
    string,
    { character: DuelCharacterSnapshot; winCount: number; drawCount: number; lossCount: number }
  >,
  character: DuelCharacterSnapshot
) {
  const current = entries.get(character.id);

  if (current) {
    return current;
  }

  const entry = {
    character,
    winCount: 0,
    drawCount: 0,
    lossCount: 0
  };
  entries.set(character.id, entry);

  return entry;
}

function buildCharacterFingerprint(character: CharacterSummary): string {
  return JSON.stringify({
    name: character.name,
    raceId: character.raceId,
    classId: character.classId,
    level: character.level,
    stats: character.stats,
    equipmentEffects: character.equipmentEffects ?? null
  });
}
