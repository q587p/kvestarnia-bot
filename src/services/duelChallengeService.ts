import { randomBytes, randomUUID } from "node:crypto";
import type { CharacterRepository } from "../db/repositories/characterRepository";
import {
  findMantokAbilityGrantByKey,
  getCombatMantokAbilityGrantsForEquippedItems
} from "../content";
import { resolveActiveCosmeticTitleLabel } from "../content/cosmeticTitles";
import type {
  DuelChallengeRecord,
  DuelChallengeRepository,
  DuelCombatSessionRecord,
  DuelCharacterSnapshot,
  DuelMode,
  DuelResultParticipantSnapshot,
  DuelResultPayload,
  ResolvedDuelChallengeRecord
} from "../db/repositories/duelChallengeRepository";
import { summarizeCharacter, type CharacterSummary } from "../domain/characters/characterSummary";
import { resolveQuickDuel, type DuelistSummary } from "../domain/duels/duelResolver";
import type { CombatGearAbilityInput } from "../domain/combat";
import {
  resolveTurnBasedDuelAction,
  resolveTurnBasedDuelTimeout,
  rollTurnBasedDuelXpRewards,
  TURN_BASED_DUEL_RULES_VERSION,
  TURN_BASED_DUEL_TURN_SECONDS,
  type TurnBasedDuelAction,
  type TurnBasedDuelParticipantSnapshot,
  type TurnBasedDuelRoundSummary,
  type TurnBasedDuelState
} from "../domain/duels/turnBasedDuel";
import { CryptoRandomSource, type RandomSource } from "../shared/random";
import { systemClock, type Clock } from "../shared/time";
import { summarizeAndSyncCharacterResources } from "./characterResourceService";
import { getEquippedItemContents } from "./equipmentService";
import type { AchievementService, AchievementUnlock } from "./achievementService";
import type { NearbyDuelTargetValidator } from "./presenceService";
import type { PublicActivityEventPublisher } from "./publicActivityEventPublisher";
import type {
  FightingCornerQuestProgressUpdate,
  FightingCornerQuestService
} from "./fightingCornerQuestService";

export const DUEL_INVITE_MIN_LEVEL = 3;
const DUEL_INVITE_TTL_MS = 13 * 60 * 1000;
const DUEL_PAIR_HOURLY_LIMIT = 3;
const DUEL_PAIR_RESET_MINUTE = 23;
const DUEL_LEADERBOARD_LIMIT = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface DuelResourceWarning {
  hpBelowMax: boolean;
  manaBelowMax: boolean;
}

export interface DuelPairLimit {
  challenger: CharacterSummary;
  target: CharacterSummary;
  limit: number;
  count: number;
  resetAt: Date;
}

export interface DuelLeaderboardEntry {
  characterId: string;
  name: string;
  activeCosmeticTitle?: string | null;
  winCount: number;
  drawCount: number;
  lossCount: number;
}

export interface DuelLeaderboard {
  day: DuelLeaderboardEntry[];
  week: DuelLeaderboardEntry[];
  month: DuelLeaderboardEntry[];
}

export type DuelChallengeView =
  | {
      state: "pending";
      challenge: DuelChallengeRecord;
      challenger: CharacterSummary;
      challengerResourceWarning: DuelResourceWarning | null;
      expiresAt: Date;
      now: Date;
      transitioned?: boolean;
    }
  | {
      state: "active";
      challenge: DuelChallengeRecord;
      session: DuelCombatSessionRecord;
      challenger: CharacterSummary;
      target: CharacterSummary;
      turnExpiresAt: Date;
      now: Date;
      transitioned?: boolean;
    }
  | {
      state: "resolved";
      challenge: DuelChallengeRecord;
      challenger: CharacterSummary;
      target: CharacterSummary;
      result: NonNullable<DuelChallengeRecord["result"]>;
      transitioned?: boolean;
      questProgressUpdates?: FightingCornerQuestProgressUpdate[];
    }
  | {
      state: "expired" | "cancelled" | "declined";
      challenge: DuelChallengeRecord;
      challenger: CharacterSummary;
      transitioned?: boolean;
    };

export type DuelCreateResult =
  | { state: "no-character" }
  | { state: "level-gated"; character: CharacterSummary; minLevel: number }
  | { state: "resource-warning"; character: CharacterSummary; warning: DuelResourceWarning }
  | Extract<DuelChallengeView, { state: "pending" }>;

export type DuelTargetedCreateResult =
  | DuelCreateResult
  | { state: "target-not-found"; character: CharacterSummary }
  | { state: "self-challenge"; character: CharacterSummary };

export type DuelRematchResult =
  | { state: "no-character" }
  | { state: "not-found" }
  | { state: "not-resolved"; challenge: DuelChallengeRecord; challenger: CharacterSummary }
  | { state: "not-participant"; challenge: DuelChallengeRecord; challenger: CharacterSummary }
  | { state: "level-gated"; character: CharacterSummary; minLevel: number }
  | ({ state: "pair-limited"; challenge: DuelChallengeRecord } & DuelPairLimit)
  | {
      state: "resource-warning";
      character: CharacterSummary;
      warning: DuelResourceWarning;
      original: Extract<DuelChallengeView, { state: "resolved" }>;
    }
  | Extract<DuelChallengeView, { state: "pending" }>;

export type DuelAcceptResult =
  | { state: "no-character" }
  | { state: "not-found" }
  | { state: "self-challenge"; challenge: DuelChallengeRecord; challenger: CharacterSummary }
  | {
      state: "not-target";
      challenge: DuelChallengeRecord;
      challenger: CharacterSummary;
      target: CharacterSummary;
    }
  | { state: "level-gated"; character: CharacterSummary; minLevel: number }
  | ({ state: "pair-limited"; challenge: DuelChallengeRecord } & DuelPairLimit)
  | {
      state: "busy";
      challenge: DuelChallengeRecord;
      challenger: CharacterSummary;
      target: CharacterSummary;
      busyCharacter: CharacterSummary;
    }
  | {
      state: "confirmation";
      challenge: DuelChallengeRecord;
      challenger: CharacterSummary;
      target: CharacterSummary;
    }
  | {
      state: "resource-warning";
      challenge: DuelChallengeRecord;
      challenger: CharacterSummary;
      target: CharacterSummary;
      warning: DuelResourceWarning;
    }
  | DuelChallengeView;

export type DuelCancelResult =
  | { state: "no-character" }
  | { state: "not-found" }
  | { state: "not-owner"; challenge: DuelChallengeRecord; challenger: CharacterSummary }
  | DuelChallengeView;

export type DuelDeclineResult =
  | { state: "no-character" }
  | { state: "not-found" }
  | { state: "open-invite"; challenge: DuelChallengeRecord; challenger: CharacterSummary }
  | DuelChallengeView;

export type DuelInviteRotationResult =
  | { state: "not-found" }
  | { state: "not-owner"; challenge: DuelChallengeRecord; challenger: CharacterSummary }
  | { state: "not-pending"; view: DuelChallengeView }
  | { state: "ready"; challenge: DuelChallengeRecord; challenger: CharacterSummary };

export type DuelTurnBasedJournalResult =
  | { state: "not-found" }
  | { state: "not-ready" }
  | {
      state: "ready";
      session: DuelCombatSessionRecord;
      rounds: TurnBasedDuelRoundSummary[];
    };

export type TurnBasedDuelTurnResult =
  | { state: "no-character" }
  | { state: "not-found" }
  | { state: "not-participant"; session: DuelCombatSessionRecord }
  | { state: "already-acted"; session: DuelCombatSessionRecord }
  | { state: "not-enough-mana"; session: DuelCombatSessionRecord }
  | { state: "skill-on-cooldown"; session: DuelCombatSessionRecord }
  | { state: "wrong-turn"; session: DuelCombatSessionRecord }
  | { state: "stale"; session: DuelCombatSessionRecord }
  | {
      state: "updated";
      session: DuelCombatSessionRecord;
      achievementUnlocksByCharacterId?: Record<string, AchievementUnlock[]>;
      questProgressUpdates?: FightingCornerQuestProgressUpdate[];
    };

export class DuelChallengeService {
  constructor(
    private readonly challenges: DuelChallengeRepository,
    private readonly characters: CharacterRepository,
    private readonly clock: Clock = systemClock,
    private readonly rng: RandomSource = new CryptoRandomSource(),
    private readonly nearbyDuelTargets?: NearbyDuelTargetValidator,
    private readonly achievements?: AchievementService,
    private readonly activityEvents?: Pick<PublicActivityEventPublisher, "recordDuelCompletedSafely">,
    private readonly fightingCornerQuest?: Pick<
      FightingCornerQuestService,
      "isEnabled" | "recordResolvedDuelSafely"
    >
  ) {}

  async createOpenChallengeForTelegramUser(
    telegramUserId: bigint,
    input: { contextChatId?: bigint | null; ignoreResourceWarning?: boolean; mode?: DuelMode } = {}
  ): Promise<DuelCreateResult> {
    const now = this.clock();
    const challengerSnapshot = await this.challenges.findCharacterByTelegramUser(telegramUserId);

    if (!challengerSnapshot) {
      return { state: "no-character" };
    }

    const challenger = await this.syncDuelCharacterForTelegramUser(telegramUserId, challengerSnapshot, now);

    if (challenger.level < DUEL_INVITE_MIN_LEVEL) {
      return {
        state: "level-gated",
        character: challenger,
        minLevel: DUEL_INVITE_MIN_LEVEL
      };
    }

    const warning = getResourceWarning(challenger);

    if (warning && input.ignoreResourceWarning !== true) {
      return {
        state: "resource-warning",
        character: challenger,
        warning
      };
    }

    const challenge = await this.challenges.createOpenForTelegramUser(telegramUserId, {
      inviteToken: createInviteToken(),
      mode: input.mode ?? "quick",
      contextChatId: input.contextChatId ?? null,
      expiresAt: new Date(now.getTime() + DUEL_INVITE_TTL_MS)
    });

    if (!challenge) {
      return { state: "no-character" };
    }

    return {
      state: "pending",
      challenge,
      challenger,
      challengerResourceWarning: warning,
      expiresAt: challenge.expiresAt,
      now
    };
  }

  async createRematchForTelegramUser(
    telegramUserId: bigint,
    inviteToken: string,
    input: { contextChatId?: bigint | null; ignoreResourceWarning?: boolean } = {}
  ): Promise<DuelRematchResult> {
    const now = this.clock();
    const original = await this.getFreshChallenge(inviteToken, now);

    if (!original) {
      return { state: "not-found" };
    }

    const challenger = summarizeDuelCharacter(original.challenger);

    if (original.status !== "resolved" || !original.target || !original.result) {
      return { state: "not-resolved", challenge: original, challenger };
    }

    const currentCharacter = await this.challenges.findCharacterByTelegramUser(telegramUserId);

    if (!currentCharacter) {
      return { state: "no-character" };
    }

    const rematchTarget =
      currentCharacter.id === original.challengerCharacterId
        ? original.target
        : currentCharacter.id === original.targetCharacterId
          ? original.challenger
          : null;

    if (!rematchTarget) {
      return { state: "not-participant", challenge: original, challenger };
    }

    const current = await this.syncDuelCharacterForTelegramUser(telegramUserId, currentCharacter, now);

    if (current.level < DUEL_INVITE_MIN_LEVEL) {
      return {
        state: "level-gated",
        character: current,
        minLevel: DUEL_INVITE_MIN_LEVEL
      };
    }

    const originalView = this.viewChallenge(original, now);

    if (originalView.state !== "resolved") {
      return { state: "not-resolved", challenge: original, challenger };
    }

    const pairLimit = await this.getPairLimit(currentCharacter.id, rematchTarget.id, now);

    if (pairLimit) {
      return {
        state: "pair-limited",
        challenge: original,
        challenger: current,
        target: summarizeDuelCharacter(rematchTarget),
        ...pairLimit
      };
    }

    const warning = getResourceWarning(current);

    if (warning && input.ignoreResourceWarning !== true) {
      return {
        state: "resource-warning",
        character: current,
        warning,
        original: originalView
      };
    }

    const challenge = await this.challenges.createTargetedForTelegramUser(
      telegramUserId,
      rematchTarget.id,
      {
        inviteToken: createInviteToken(),
        mode: original.result.mode ?? original.mode,
        contextChatId: input.contextChatId ?? null,
        expiresAt: new Date(now.getTime() + DUEL_INVITE_TTL_MS)
      }
    );

    if (!challenge) {
      return { state: "not-found" };
    }

    return {
      state: "pending",
      challenge,
      challenger: current,
      challengerResourceWarning: warning,
      expiresAt: challenge.expiresAt,
      now
    };
  }

  async acceptForTelegramUser(
    telegramUserId: bigint,
    inviteToken: string,
    options: {
      confirmed?: boolean;
      ignoreResourceWarning?: boolean;
      expectedMode?: DuelMode;
      chatId?: bigint | null;
      messageId?: number | null;
    } = {}
  ): Promise<DuelAcceptResult> {
    const now = this.clock();
    const challenge = await this.getFreshChallenge(inviteToken, now);

    if (!challenge) {
      return { state: "not-found" };
    }

    if (options.expectedMode && challenge.mode !== options.expectedMode) {
      return this.viewChallengeOrActive(challenge, now);
    }

    let challenger = summarizeDuelCharacter(challenge.challenger);

    if (challenge.status !== "pending") {
      return this.viewChallengeOrActive(challenge, now);
    }

    if (challenge.challenger.telegramUserId === telegramUserId) {
      return { state: "self-challenge", challenge, challenger };
    }

    if (
      challenge.target &&
      challenge.targetCharacterId &&
      challenge.target.telegramUserId !== telegramUserId
    ) {
      return {
        state: "not-target",
        challenge,
        challenger,
        target: summarizeDuelCharacter(challenge.target)
      };
    }

    const equipmentAt = challenge.mode === "turn-based" ? now : undefined;
    const [targetCharacter, currentChallengerCharacter] = await Promise.all([
      this.challenges.findCharacterByTelegramUser(telegramUserId, equipmentAt),
      equipmentAt
        ? this.challenges.findCharacterByTelegramUser(challenge.challenger.telegramUserId, equipmentAt)
        : Promise.resolve(challenge.challenger)
    ]);

    if (!targetCharacter || !currentChallengerCharacter) {
      return { state: "no-character" };
    }

    const currentTarget = await this.syncDuelCharacterForTelegramUser(
      telegramUserId,
      targetCharacter,
      now,
      equipmentAt
    );
    challenger = await this.syncDuelCharacterForTelegramUser(
      challenge.challenger.telegramUserId,
      currentChallengerCharacter,
      now,
      equipmentAt
    );

    if (currentTarget.level < DUEL_INVITE_MIN_LEVEL) {
      return {
        state: "level-gated",
        character: currentTarget,
        minLevel: DUEL_INVITE_MIN_LEVEL
      };
    }

    const pairLimit = await this.getPairLimit(challenge.challenger.id, targetCharacter.id, now);

    if (pairLimit) {
      return {
        state: "pair-limited",
        challenge,
        challenger,
        target: currentTarget,
        ...pairLimit
      };
    }

    const warning = getResourceWarning(currentTarget);

    if (warning && options.ignoreResourceWarning !== true) {
      return {
        state: "resource-warning",
        challenge,
        challenger,
        target: currentTarget,
        warning
      };
    }

    if (options.confirmed !== true) {
      return {
        state: "confirmation",
        challenge,
        challenger,
        target: currentTarget
      };
    }

    if (challenge.mode === "turn-based") {
      const started = await this.challenges.startTurnBasedByTokenForTelegramUser(
        inviteToken,
        telegramUserId,
        now,
        {
          sessionId: randomUUID(),
          rng: this.rng,
          turnExpiresAt: getNextTurnExpiry(now),
          targetChatId: options.chatId ?? null,
          targetMessageId: options.messageId ?? null
        }
      );

      if (!started.record) {
        const active = await this.challenges.findActiveTurnBasedByTelegramUserId(telegramUserId);

        if (active) {
          return this.buildActiveView(active, now);
        }

        const busyCharacterId = await this.challenges.findActiveCombatBlockerCharacterId([
          challenge.challenger.id,
          targetCharacter.id
        ]);

        return {
          state: "busy",
          challenge,
          challenger,
          target: currentTarget,
          busyCharacter:
            busyCharacterId === challenge.challenger.id ? challenger : currentTarget
        };
      }

      return {
        ...this.buildActiveView(started.record, now),
        transitioned: started.transitioned
      };
    }

    const result = resolveQuickDuel({
      challenger: { ...challenger, id: challenge.challenger.id },
      target: { ...currentTarget, id: targetCharacter.id },
      rng: this.rng
    });
    const accepted = await this.challenges.acceptByTokenForTelegramUser(
      inviteToken,
      telegramUserId,
      now,
      buildStoredDuelResult(result, {
        challenger: { id: challenge.challenger.id, character: challenger },
        target: { id: targetCharacter.id, character: currentTarget }
      }, "quick")
    );

    if (!accepted.record) {
      return { state: "no-character" };
    }

    if (accepted.transitioned) {
      await this.recordDuelCompletedActivity(accepted.record, now);
    }

    const questProgressUpdates = await this.recordFightingCornerQuestProgressSafely(accepted.record);

    return {
      ...this.viewChallenge(accepted.record, now),
      transitioned: accepted.transitioned,
      ...(questProgressUpdates.length > 0 ? { questProgressUpdates } : {})
    };
  }

  async cancelForTelegramUser(
    telegramUserId: bigint,
    inviteToken: string
  ): Promise<DuelCancelResult> {
    const now = this.clock();
    const before = await this.getFreshChallenge(inviteToken, now);

    if (!before) {
      return { state: "not-found" };
    }

    const challenger = summarizeDuelCharacter(before.challenger);

    if (before.status !== "pending") {
      return this.viewChallenge(before, now);
    }

    if (before.challenger.telegramUserId !== telegramUserId) {
      return { state: "not-owner", challenge: before, challenger };
    }

    const updated = await this.challenges.cancelByTokenForTelegramUser(inviteToken, telegramUserId, now);

    return updated.record
      ? { ...this.viewChallenge(updated.record, now), transitioned: updated.transitioned }
      : { state: "not-found" };
  }

  async declineForTelegramUser(
    telegramUserId: bigint,
    inviteToken: string
  ): Promise<DuelDeclineResult> {
    const now = this.clock();
    const before = await this.getFreshChallenge(inviteToken, now);

    if (!before) {
      return { state: "not-found" };
    }

    const challenger = summarizeDuelCharacter(before.challenger);

    if (before.status !== "pending") {
      return this.viewChallenge(before, now);
    }

    if (!before.targetCharacterId) {
      void telegramUserId;
      return { state: "open-invite", challenge: before, challenger };
    }

    const updated = await this.challenges.declineByTokenForTelegramUser(inviteToken, telegramUserId, now);

    return updated.record
      ? { ...this.viewChallenge(updated.record, now), transitioned: updated.transitioned }
      : { state: "not-found" };
  }

  async getByToken(inviteToken: string): Promise<DuelChallengeView | { state: "not-found" }> {
    const now = this.clock();
    const challenge = await this.getFreshChallenge(inviteToken, now);

    return challenge ? this.viewChallengeOrActive(challenge, now) : { state: "not-found" };
  }

  async getActiveTurnBasedForTelegramUser(
    telegramUserId: bigint
  ): Promise<Extract<DuelChallengeView, { state: "active" }> | null> {
    const session = await this.challenges.findActiveTurnBasedByTelegramUserId(telegramUserId);

    return session ? this.buildActiveView(session, this.clock()) : null;
  }

  async getTurnBasedByTokenForTelegramUser(
    telegramUserId: bigint,
    inviteToken: string
  ): Promise<Extract<DuelChallengeView, { state: "active" }> | { state: "not-found" }> {
    const session = await this.challenges.findTurnBasedByTokenForTelegramUserId(inviteToken, telegramUserId);

    return session ? this.buildActiveView(session, this.clock()) : { state: "not-found" };
  }

  async getTurnBasedJournalByToken(inviteToken: string): Promise<DuelTurnBasedJournalResult> {
    const session = await this.challenges.findTurnBasedByToken(inviteToken);

    if (!session) {
      return { state: "not-found" };
    }

    if (session.status === "active") {
      return { state: "not-ready" };
    }

    const actions = await this.challenges.listTurnBasedActionsByToken(inviteToken);
    const rounds = actions
      .map((action) => parseTurnBasedDuelRoundSummary(action.result))
      .filter((round): round is TurnBasedDuelRoundSummary => round !== null);

    return {
      state: "ready",
      session,
      rounds
    };
  }

  async resolveTurnBasedActionForTelegramUser(
    telegramUserId: bigint,
    input: {
      inviteToken: string;
      expectedTurn: number;
      expectedVersion: number;
      action: TurnBasedDuelAction;
      grantKey?: string | undefined;
    }
  ): Promise<TurnBasedDuelTurnResult> {
    const character = await this.challenges.findCharacterByTelegramUser(telegramUserId);

    if (!character) {
      return { state: "no-character" };
    }

    const session = await this.challenges.findTurnBasedByTokenForTelegramUserId(
      input.inviteToken,
      telegramUserId
    );

    if (!session) {
      return { state: "not-found" };
    }

    const now = this.clock();

    if (
      session.turn !== input.expectedTurn ||
      session.state.status !== "active" ||
      session.version < input.expectedVersion ||
      session.turnExpiresAt <= now
    ) {
      return { state: "stale", session };
    }

    const gearAbility = input.action === "gear"
      ? resolveTurnBasedDuelGearAbility(session.state, character.id, input.grantKey) ?? undefined
      : undefined;
    if (input.action === "gear" && !gearAbility) {
      return { state: "stale", session };
    }

    const first = await this.tryResolveTurnBasedAction(session, character.id, input.action, now, gearAbility);

    if (first.state !== "stale") {
      return first;
    }

    const latest = await this.challenges.findTurnBasedByTokenForTelegramUserId(
      input.inviteToken,
      telegramUserId
    );

    if (
      !latest ||
      latest.turn !== input.expectedTurn ||
      latest.state.status !== "active" ||
      latest.version < input.expectedVersion ||
      latest.turnExpiresAt <= now
    ) {
      return first;
    }

    const actorSide = getTurnBasedParticipantSide(latest.state, character.id);

    if (!actorSide || latest.state.pendingActions?.[actorSide]) {
      return first;
    }

    const latestGearAbility = input.action === "gear"
      ? resolveTurnBasedDuelGearAbility(latest.state, character.id, input.grantKey) ?? undefined
      : undefined;
    if (input.action === "gear" && !latestGearAbility) {
      return first;
    }

    return this.tryResolveTurnBasedAction(latest, character.id, input.action, now, latestGearAbility);
  }

  async resolveDueTurnBasedSession(session: DuelCombatSessionRecord): Promise<TurnBasedDuelTurnResult> {
    const now = this.clock();
    const resolved = resolveTurnBasedDuelTimeout({
      state: session.state,
      sated: { sessionId: session.id, committedTurn: session.turn, now },
      rng: this.rng
    });

    if (!resolved.ok || resolved.resolution !== "resolved") {
      return { state: "stale", session };
    }

    const state = resolved.state;
    const result = buildStoredTurnBasedResult(
      state,
      rollTurnBasedDuelXpRewards(state, this.rng)
    );
    const updated = await this.challenges.updateTurnBasedIfActiveVersion(
      session.id,
      session.turn,
      session.version,
      {
        state,
        status: state.status,
        now,
        deadlineMode: "timeout",
        turnExpiresAt: state.status === "active" ? getNextTurnExpiry(now) : session.turnExpiresAt,
        completedAt: state.status === "active" ? null : now,
        result,
        action: {
          actorCharacterId: session.actingCharacterId,
          turn: session.turn,
          actionKey: "timeout-attack",
          result: resolved.round
        }
      }
    );

    if (!updated) {
      return { state: "stale", session };
    }

    if (updated.status !== "active") {
      await this.recordDuelCompletedActivity(updated.challenge, now);
    }

    const questProgressUpdates = updated.status !== "active"
      ? await this.recordFightingCornerQuestProgressSafely(updated.challenge)
      : [];

    return {
      state: "updated",
      session: updated,
      ...(questProgressUpdates.length > 0 ? { questProgressUpdates } : {})
    };
  }

  private async tryResolveTurnBasedAction(
    session: DuelCombatSessionRecord,
    actorCharacterId: string,
    action: TurnBasedDuelAction,
    now: Date,
    gearAbility?: CombatGearAbilityInput
  ): Promise<TurnBasedDuelTurnResult> {
    const resolved = resolveTurnBasedDuelAction({
      state: session.state,
      actorCharacterId,
      action,
      ...(gearAbility ? { gearAbility } : {}),
      sated: { sessionId: session.id, committedTurn: session.turn, now },
      rng: this.rng
    });

    if (!resolved.ok) {
      return {
        state: resolved.reason === "already-acted"
          ? "already-acted"
          : resolved.reason === "not-participant"
            ? "not-participant"
            : resolved.reason === "not-enough-mana"
              ? "not-enough-mana"
              : resolved.reason === "skill-on-cooldown"
                ? "skill-on-cooldown"
                : "wrong-turn",
        session
      };
    }

    const committedState = resolved.state;
    const result = buildStoredTurnBasedResult(
      committedState,
      rollTurnBasedDuelXpRewards(committedState, this.rng)
    );
    const updated = await this.challenges.updateTurnBasedIfActiveVersion(
      session.id,
      session.turn,
      session.version,
      {
        state: committedState,
        status: committedState.status,
        now,
        deadlineMode: "player-action",
        turnExpiresAt: resolved.resolution === "resolved" && committedState.status === "active"
          ? getNextTurnExpiry(now)
          : session.turnExpiresAt,
        completedAt: committedState.status === "active" ? null : now,
        result,
        ...(resolved.resolution === "resolved"
          ? {
              action: {
                actorCharacterId,
                turn: session.turn,
                actionKey: action === "surrender" ? action : "round",
                result: resolved.round
              }
            }
          : {})
      }
    );

    if (!updated) {
      return { state: "stale", session };
    }

    if (updated.status !== "active") {
      await this.recordDuelCompletedActivity(updated.challenge, now);
    }

    const questProgressUpdates = updated.status !== "active"
      ? await this.recordFightingCornerQuestProgressSafely(updated.challenge)
      : [];

    const achievementUnlocksByCharacterId = resolved.resolution === "resolved"
      ? await this.trackCommittedTurnBasedGearActions(updated, resolved.round, now)
      : {};

    return {
      state: "updated",
      session: updated,
      ...(Object.keys(achievementUnlocksByCharacterId).length > 0 ? { achievementUnlocksByCharacterId } : {}),
      ...(questProgressUpdates.length > 0 ? { questProgressUpdates } : {})
    };
  }

  private async trackCommittedTurnBasedGearActions(
    session: DuelCombatSessionRecord,
    round: TurnBasedDuelRoundSummary,
    occurredAt: Date
  ): Promise<Record<string, AchievementUnlock[]>> {
    if (!this.achievements) {
      return {};
    }

    const unlocksByCharacterId: Record<string, AchievementUnlock[]> = {};
    for (const action of round.actions) {
      if (
        action.action !== "gear" ||
        action.outcome === "not-enough-mana" ||
        action.outcome === "skill-on-cooldown"
      ) {
        continue;
      }

      const unlocks = await this.achievements.trackEventSafely({
        type: "mantok.gear-action.used",
        characterId: action.actorCharacterId,
        occurredAt,
        sourceId: `${session.id}:turn:${round.turn}:gear:${action.skillId ?? "unknown"}`
      });
      if (unlocks.length > 0) {
        unlocksByCharacterId[action.actorCharacterId] = [
          ...(unlocksByCharacterId[action.actorCharacterId] ?? []),
          ...unlocks
        ];
      }
    }

    return unlocksByCharacterId;
  }

  private async recordDuelCompletedActivity(challenge: DuelChallengeRecord, occurredAt: Date): Promise<void> {
    if (!this.activityEvents || challenge.status !== "resolved" || !challenge.target || !challenge.result) {
      return;
    }

    await this.activityEvents.recordDuelCompletedSafely({
      challengeId: challenge.id,
      mode: challenge.result.mode ?? challenge.mode,
      challengerCharacterId: challenge.challengerCharacterId,
      challengerDisplayName: challenge.result.participants?.challenger.displayName ?? challenge.challenger.name,
      targetCharacterId: challenge.targetCharacterId ?? challenge.target.id,
      targetDisplayName: challenge.result.participants?.target.displayName ?? challenge.target.name,
      outcome: challenge.result.outcome,
      occurredAt
    });
  }

  private async recordFightingCornerQuestProgressSafely(
    challenge: DuelChallengeRecord
  ): Promise<FightingCornerQuestProgressUpdate[]> {
    if (
      !this.fightingCornerQuest ||
      !this.fightingCornerQuest.isEnabled() ||
      challenge.status !== "resolved"
    ) {
      return [];
    }

    try {
      const hasResolvedRound = challenge.mode === "turn-based"
        ? await this.challenges.hasResolvedTurnBasedRoundByToken(challenge.inviteToken)
        : undefined;

      return this.fightingCornerQuest.recordResolvedDuelSafely(challenge, {
        ...(hasResolvedRound === undefined ? {} : { hasResolvedRound })
      });
    } catch (error) {
      console.warn("Kvestarnia: Fighting Corner duel progress recovery failed.", error);
      return [];
    }
  }

  async listDueTurnBasedSessions(): Promise<DuelCombatSessionRecord[]> {
    await this.repairTurnBasedCombatState();
    return this.challenges.listDueTurnBasedSessions(this.clock());
  }

  async repairTurnBasedCombatState(): Promise<{
    repairedSessions: number;
    removedOrphanLeases: number;
  }> {
    return this.challenges.repairTurnBasedCombatState(this.clock());
  }

  async recordTurnBasedMessageReference(
    sessionId: string,
    participant: "challenger" | "target",
    reference: { chatId: bigint; messageId: number }
  ): Promise<void> {
    await this.challenges.recordTurnBasedMessageReference(sessionId, participant, reference);
  }

  async getInviteRotationForTelegramUser(
    telegramUserId: bigint,
    inviteToken: string
  ): Promise<DuelInviteRotationResult> {
    const now = this.clock();
    const challenge = await this.getFreshChallenge(inviteToken, now);

    if (!challenge) {
      return { state: "not-found" };
    }

    const challenger = summarizeDuelCharacter(challenge.challenger);

    if (challenge.status !== "pending") {
      return { state: "not-pending", view: this.viewChallenge(challenge, now) };
    }

    if (challenge.challenger.telegramUserId !== telegramUserId) {
      return { state: "not-owner", challenge, challenger };
    }

    return { state: "ready", challenge, challenger };
  }

  async getLeaderboard(): Promise<DuelLeaderboard> {
    const now = this.clock();
    const daySince = new Date(now.getTime() - DAY_MS);
    const weekSince = new Date(now.getTime() - 7 * DAY_MS);
    const monthSince = new Date(now.getTime() - 31 * DAY_MS);
    const records = await this.challenges.listResolvedSince(monthSince);

    return {
      day: buildLeaderboard(records, daySince),
      week: buildLeaderboard(records, weekSince),
      month: buildLeaderboard(records, monthSince)
    };
  }

  private async getFreshChallenge(
    inviteToken: string,
    now: Date
  ): Promise<DuelChallengeRecord | null> {
    const challenge = await this.challenges.findByToken(inviteToken);

    if (!challenge) {
      return null;
    }

    if (challenge.status === "pending" && challenge.expiresAt <= now) {
      return this.challenges.markExpiredByToken(inviteToken, now);
    }

    return challenge;
  }

  private async getPairLimit(
    characterAId: string,
    characterBId: string,
    now: Date
  ): Promise<Pick<DuelPairLimit, "limit" | "count" | "resetAt"> | null> {
    const window = getPairLimitWindow(now);
    const count = await this.challenges.countResolvedBetweenCharacterPairSince(
      characterAId,
      characterBId,
      window.since
    );

    return count >= DUEL_PAIR_HOURLY_LIMIT
      ? {
          limit: DUEL_PAIR_HOURLY_LIMIT,
          count,
          resetAt: window.resetAt
        }
      : null;
  }

  private viewChallenge(challenge: DuelChallengeRecord, now: Date): DuelChallengeView {
    const challenger = summarizeDuelCharacterWithResultSnapshot(
      challenge.challenger,
      challenge.result?.participants?.challenger
    );

    if (challenge.status === "resolved" && challenge.target && challenge.result) {
      return {
        state: "resolved",
        challenge,
        challenger,
        target: summarizeDuelCharacterWithResultSnapshot(
          challenge.target,
          challenge.result.participants?.target
        ),
        result: challenge.result
      };
    }

    if (
      challenge.status === "cancelled" ||
      challenge.status === "declined" ||
      challenge.status === "expired" ||
      challenge.status === "forfeited"
    ) {
      return {
        state: challenge.status === "forfeited" ? "expired" : challenge.status,
        challenge,
        challenger
      };
    }

    return {
      state: "pending",
      challenge,
      challenger,
      challengerResourceWarning: null,
      expiresAt: challenge.expiresAt,
      now
    };
  }

  private async viewChallengeOrActive(
    challenge: DuelChallengeRecord,
    now: Date
  ): Promise<DuelChallengeView> {
    if (challenge.status === "active" && challenge.mode === "turn-based") {
      const session = await this.challenges.findTurnBasedByToken(challenge.inviteToken);

      if (session) {
        return this.buildActiveView(session, now);
      }
    }

    const view = this.viewChallenge(challenge, now);
    if (view.state !== "resolved") {
      return view;
    }

    const questProgressUpdates = await this.recordFightingCornerQuestProgressSafely(challenge);
    return {
      ...view,
      ...(questProgressUpdates.length > 0 ? { questProgressUpdates } : {})
    };
  }

  private buildActiveView(
    session: DuelCombatSessionRecord,
    now: Date
  ): Extract<DuelChallengeView, { state: "active" }> {
    return {
      state: "active",
      challenge: session.challenge,
      session,
      challenger: summarizeTurnBasedParticipant(session.state.participants.challenger),
      target: summarizeTurnBasedParticipant(session.state.participants.target),
      turnExpiresAt: session.turnExpiresAt,
      now
    };
  }

  async createTargetedChallengeForTelegramUser(
    telegramUserId: bigint,
    targetTelegramUserId: bigint,
    input: { contextChatId?: bigint | null; ignoreResourceWarning?: boolean; mode?: DuelMode } = {}
  ): Promise<DuelTargetedCreateResult> {
    const now = this.clock();
    const challengerSnapshot = await this.challenges.findCharacterByTelegramUser(telegramUserId);

    if (!challengerSnapshot) {
      return { state: "no-character" };
    }

    const challenger = await this.syncDuelCharacterForTelegramUser(telegramUserId, challengerSnapshot, now);

    if (challenger.level < DUEL_INVITE_MIN_LEVEL) {
      return {
        state: "level-gated",
        character: challenger,
        minLevel: DUEL_INVITE_MIN_LEVEL
      };
    }

    const target = await this.challenges.findCharacterByTelegramUser(targetTelegramUserId);

    if (!target) {
      return { state: "target-not-found", character: challenger };
    }

    if (target.id === challengerSnapshot.id) {
      return { state: "self-challenge", character: challenger };
    }

    if (
      this.nearbyDuelTargets &&
      !(await this.nearbyDuelTargets.isNearbyDuelTargetAvailable(
        telegramUserId,
        targetTelegramUserId
      ))
    ) {
      return { state: "target-not-found", character: challenger };
    }

    const warning = getResourceWarning(challenger);

    if (warning && input.ignoreResourceWarning !== true) {
      return {
        state: "resource-warning",
        character: challenger,
        warning
      };
    }

    const challenge = await this.challenges.createTargetedForTelegramUser(
      telegramUserId,
      target.id,
      {
        inviteToken: createInviteToken(),
        mode: input.mode ?? "quick",
        contextChatId: input.contextChatId ?? null,
        expiresAt: new Date(now.getTime() + DUEL_INVITE_TTL_MS)
      }
    );

    if (!challenge) {
      return { state: "target-not-found", character: challenger };
    }

    return {
      state: "pending",
      challenge,
      challenger,
      challengerResourceWarning: warning,
      expiresAt: challenge.expiresAt,
      now
    };
  }

  private async syncDuelCharacterForTelegramUser(
    telegramUserId: bigint,
    character: DuelCharacterSnapshot,
    now: Date,
    equipmentAt?: Date
  ): Promise<DuelistSummary> {
    const result = await summarizeAndSyncCharacterResources({
      characters: this.characters,
      telegramUserId,
      character,
      equippedItems: getEquippedItemContents(character.equipment),
      ...(character.remortCount !== undefined ? { remortCount: character.remortCount } : {}),
      now,
      ...(equipmentAt ? { persistCanonicalClamp: true } : {}),
      reloadLatest: async () => {
        const latest = await this.challenges.findCharacterByTelegramUser(telegramUserId, equipmentAt);

        if (!latest) {
          return null;
        }

        return {
          character: latest,
          equippedItems: getEquippedItemContents(latest.equipment),
          ...(latest.remortCount !== undefined ? { remortCount: latest.remortCount } : {})
        };
      }
    });

    return withActiveCosmeticTitle(
      withDuelEquipmentAbilityGrantIds({ ...result.character, id: character.id }, character),
      character.activeCosmeticTitleGrantId
    );
  }

}

function buildLeaderboard(
  records: ResolvedDuelChallengeRecord[],
  since: Date
): DuelLeaderboardEntry[] {
  const entries = new Map<string, DuelLeaderboardEntry>();

  for (const record of records) {
    if (record.resolvedAt < since) {
      continue;
    }

    const challenger = getOrCreateLeaderboardEntry(
      entries,
      record.challenger,
      record.result.participants?.challenger.displayName,
      record.result.participants?.challenger.activeCosmeticTitle
    );
    const target = getOrCreateLeaderboardEntry(
      entries,
      record.target,
      record.result.participants?.target.displayName,
      record.result.participants?.target.activeCosmeticTitle
    );

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

      return lossDiff === 0 ? left.name.localeCompare(right.name, "uk") : lossDiff;
    })
    .slice(0, DUEL_LEADERBOARD_LIMIT);
}

function getOrCreateLeaderboardEntry(
  entries: Map<string, DuelLeaderboardEntry>,
  character: DuelCharacterSnapshot,
  snapshotName?: string,
  snapshotActiveCosmeticTitle?: string | null
): DuelLeaderboardEntry {
  const current = entries.get(character.id);

  if (current) {
    return current;
  }

  const next = {
    characterId: character.id,
    name: snapshotName ?? character.name,
    ...(snapshotActiveCosmeticTitle ? { activeCosmeticTitle: snapshotActiveCosmeticTitle } : {}),
    winCount: 0,
    drawCount: 0,
    lossCount: 0
  };

  entries.set(character.id, next);

  return next;
}

function summarizeDuelCharacter(
  character: DuelCharacterSnapshot
): DuelistSummary {
  const summary = summarizeCharacter(character, {
    equippedItems: getEquippedItemContents(character.equipment)
  });
  return withActiveCosmeticTitle(
    withDuelEquipmentAbilityGrantIds({ ...summary, id: character.id }, character),
    character.activeCosmeticTitleGrantId
  );
}

function withActiveCosmeticTitle(
  character: DuelistSummary,
  titleGrantId: string | null | undefined
): DuelistSummary {
  const activeCosmeticTitle = resolveActiveCosmeticTitleLabel(titleGrantId);

  return activeCosmeticTitle ? { ...character, activeCosmeticTitle } : character;
}

function withDuelEquipmentAbilityGrantIds<T extends CharacterSummary & { id: string }>(
  character: T,
  source: Pick<DuelCharacterSnapshot, "equipment">
): T {
  const grantIds = getCombatMantokAbilityGrantsForEquippedItems({
    itemIds: source.equipment.map((item) => item.itemId),
    characterLevel: character.level
  }).map((grant) => grant.id);

  return grantIds.length > 0 ? { ...character, equipmentAbilityGrantIds: grantIds } : character;
}

function resolveTurnBasedDuelGearAbility(
  state: TurnBasedDuelState,
  characterId: string,
  grantKey: string | undefined
): CombatGearAbilityInput | null {
  const grant = grantKey ? findMantokAbilityGrantByKey(grantKey) : null;
  const side = getTurnBasedParticipantSide(state, characterId);
  const participant = side ? state.participants[side] : null;

  if (!grant?.combat || !participant?.equipmentAbilityGrantIds?.includes(grant.id)) {
    return null;
  }

  return {
    profile: grant.combat.profile,
    ...(grant.combat.bleed
      ? {
          bleed: {
            sourceAbilityId: grant.combat.profile.id,
            ...grant.combat.bleed
          }
        }
      : {})
  };
}

function summarizeDuelCharacterWithResultSnapshot(
  character: DuelCharacterSnapshot,
  snapshot: DuelResultParticipantSnapshot | undefined
): CharacterSummary {
  const summary = summarizeDuelCharacterForReplay(character);

  if (!snapshot) {
    return summary;
  }

  const { remortCount, remortMemoryRank, ...summaryWithoutLiveRemort } = summary;
  void remortCount;
  void remortMemoryRank;

  const replay = {
    ...summaryWithoutLiveRemort,
    name: snapshot.displayName,
    title: snapshot.title,
    raceId: snapshot.raceId,
    raceName: snapshot.raceName,
    classId: snapshot.classId,
    className: snapshot.className,
    level: snapshot.level,
    ...(snapshot.activeCosmeticTitle ? { activeCosmeticTitle: snapshot.activeCosmeticTitle } : {})
  };

  return snapshot.remortCount > 0
    ? {
        ...replay,
        remortCount: snapshot.remortCount,
        remortMemoryRank: snapshot.remortCount
      }
    : replay;
}

function summarizeDuelCharacterForReplay(
  character: DuelCharacterSnapshot
): CharacterSummary {
  const { activeCosmeticTitle, ...summary } = summarizeDuelCharacter(character);
  void activeCosmeticTitle;

  return summary;
}

function buildStoredDuelResult(
  result: ReturnType<typeof resolveQuickDuel>,
  participants: {
    challenger: { id: string; character: CharacterSummary };
    target: { id: string; character: CharacterSummary };
  },
  mode: DuelMode = "quick"
): DuelResultPayload {
  return {
    mode,
    outcome: result.outcome,
    winnerCharacterId: result.winnerCharacterId,
    loserCharacterId: result.loserCharacterId,
    challengerScore: result.challengerScore,
    targetScore: result.targetScore,
    swing: result.swing,
    flavorKey: result.flavorKey,
    balanceVersion: result.balanceVersion,
    participants: {
      challenger: buildParticipantSnapshot(participants.challenger.id, participants.challenger.character),
      target: buildParticipantSnapshot(participants.target.id, participants.target.character)
    },
    audit: result.audit
  };
}

function buildStoredTurnBasedResult(
  state: TurnBasedDuelState,
  xpRewards: DuelResultPayload["xpRewards"] | null = null
): DuelResultPayload | null {
  if (state.status === "active" || !state.outcome) {
    return null;
  }

  return {
    mode: "turn-based",
    rulesVersion: TURN_BASED_DUEL_RULES_VERSION,
    terminalReason: state.outcome.reason,
    ...(xpRewards ? { xpRewards } : {}),
    outcome: state.outcome.outcome,
    winnerCharacterId: state.outcome.winnerCharacterId,
    loserCharacterId: state.outcome.loserCharacterId,
    challengerScore: state.participants.challenger.hp,
    targetScore: state.participants.target.hp,
    swing: state.turn,
    flavorKey: state.outcome.outcome === "draw" ? "dramatic-draw" : "direct-hit",
    balanceVersion: state.balanceVersion,
    participants: {
      challenger: buildStoredTurnBasedParticipantSnapshot(state.participants.challenger),
      target: buildStoredTurnBasedParticipantSnapshot(state.participants.target)
    },
    audit: {
      challenger: state.participants.challenger.balanceAudit,
      target: state.participants.target.balanceAudit
    }
  };
}

function getTurnBasedParticipantSide(
  state: TurnBasedDuelState,
  characterId: string
): "challenger" | "target" | null {
  if (state.participants.challenger.characterId === characterId) {
    return "challenger";
  }

  if (state.participants.target.characterId === characterId) {
    return "target";
  }

  return null;
}

function buildStoredTurnBasedParticipantSnapshot(
  participant: TurnBasedDuelParticipantSnapshot
): NonNullable<DuelResultPayload["participants"]>["challenger"] {
  return {
    characterId: participant.characterId,
    displayName: participant.displayName,
    ...(participant.activeCosmeticTitle ? { activeCosmeticTitle: participant.activeCosmeticTitle } : {}),
    title: participant.title,
    raceId: participant.raceId,
    raceName: participant.raceName,
    classId: participant.classId,
    className: participant.className,
    level: participant.level,
    remortCount: participant.remortCount
  };
}

function summarizeTurnBasedParticipant(participant: TurnBasedDuelParticipantSnapshot): CharacterSummary {
  return {
    name: participant.displayName,
    ...(participant.activeCosmeticTitle ? { activeCosmeticTitle: participant.activeCosmeticTitle } : {}),
    pronoun: "they",
    pronounLabel: "вони",
    path: "boundary",
    raceId: participant.raceId,
    raceName: participant.raceName,
    classId: participant.classId,
    className: participant.className,
    title: participant.title,
    level: participant.level,
    xp: 0,
    nextLevelXp: null,
    xpToNextLevel: null,
    gold: 0,
    hpCurrent: participant.hp,
    hpMax: participant.hpMax,
    manaCurrent: participant.mana,
    manaMax: participant.manaMax,
    stats: participant.stats,
    levelBonus: {
      hpMax: 0,
      manaMax: 0,
      stats: {
        strength: 0,
        dexterity: 0,
        intelligence: 0,
        charisma: 0,
        luck: 0
      }
    },
    ...(participant.equipmentEffects ? { equipmentEffects: participant.equipmentEffects } : {}),
    ...(participant.remortCount > 0
      ? {
          remortCount: participant.remortCount,
          remortMemoryRank: participant.remortCount
        }
      : {})
  };
}

function getNextTurnExpiry(now: Date): Date {
  return new Date(now.getTime() + TURN_BASED_DUEL_TURN_SECONDS * 1000);
}

function buildParticipantSnapshot(
  characterId: string,
  character: CharacterSummary
): NonNullable<DuelResultPayload["participants"]>["challenger"] {
  return {
    characterId,
    displayName: character.name,
    ...(character.activeCosmeticTitle ? { activeCosmeticTitle: character.activeCosmeticTitle } : {}),
    title: character.title,
    raceId: character.raceId,
    raceName: character.raceName,
    classId: character.classId,
    className: character.className,
    level: character.level,
    remortCount: character.remortCount ?? 0
  };
}

function createInviteToken(): string {
  return randomBytes(8).toString("base64url");
}

function getPairLimitWindow(now: Date): { since: Date; resetAt: Date } {
  const since = new Date(now);

  since.setUTCSeconds(0, 0);

  if (now.getUTCMinutes() >= DUEL_PAIR_RESET_MINUTE) {
    since.setUTCMinutes(DUEL_PAIR_RESET_MINUTE, 0, 0);
  } else {
    since.setUTCHours(since.getUTCHours() - 1, DUEL_PAIR_RESET_MINUTE, 0, 0);
  }

  const resetAt = new Date(since);
  resetAt.setUTCHours(resetAt.getUTCHours() + 1);

  return { since, resetAt };
}

function getResourceWarning(character: CharacterSummary): DuelResourceWarning | null {
  const warning = {
    hpBelowMax: character.hpCurrent < character.hpMax,
    manaBelowMax: character.manaCurrent < character.manaMax
  };

  return warning.hpBelowMax || warning.manaBelowMax ? warning : null;
}

function parseTurnBasedDuelRoundSummary(value: unknown): TurnBasedDuelRoundSummary | null {
  if (!isRecord(value) || typeof value.turn !== "number" || !Array.isArray(value.actions)) {
    return null;
  }

  const actions = value.actions
    .map(parseTurnBasedDuelActionSummary)
    .filter((action): action is TurnBasedDuelRoundSummary["actions"][number] => action !== null);

  return {
    turn: Math.max(1, Math.floor(value.turn)),
    actions
  };
}

function parseTurnBasedDuelActionSummary(value: unknown): TurnBasedDuelRoundSummary["actions"][number] | null {
  if (
    !isRecord(value) ||
    typeof value.actorCharacterId !== "string" ||
    typeof value.defenderCharacterId !== "string" ||
    !isTurnBasedDuelStoredAction(value.action) ||
    typeof value.outcome !== "string" ||
    typeof value.damage !== "number" ||
    typeof value.manaSpent !== "number" ||
    typeof value.critical !== "boolean"
  ) {
    return null;
  }

  const fumble = parseTurnBasedDuelFumbleSummary(value.fumble);

  return {
    actorCharacterId: value.actorCharacterId,
    defenderCharacterId: value.defenderCharacterId,
    action: value.action,
    outcome: value.outcome as TurnBasedDuelRoundSummary["actions"][number]["outcome"],
    damage: Math.max(0, Math.floor(value.damage)),
    ...(typeof value.healing === "number" ? { healing: Math.max(0, Math.floor(value.healing)) } : {}),
    ...(typeof value.guard === "number" ? { guard: Math.max(0, Math.floor(value.guard)) } : {}),
    manaSpent: Math.max(0, Math.floor(value.manaSpent)),
    critical: value.critical,
    ...(typeof value.skillId === "string" ? { skillId: value.skillId } : {}),
    ...(fumble ? { fumble } : {})
  };
}

function parseTurnBasedDuelFumbleSummary(
  value: unknown
): TurnBasedDuelRoundSummary["actions"][number]["fumble"] | null {
  if (
    !isRecord(value) ||
    typeof value.abilityId !== "string" ||
    (value.kind !== "self-damage" && value.kind !== "enemy-heal") ||
    typeof value.line !== "string"
  ) {
    return null;
  }

  return {
    abilityId: value.abilityId,
    kind: value.kind,
    line: value.line,
    ...(typeof value.selfDamage === "number" ? { selfDamage: Math.max(0, Math.floor(value.selfDamage)) } : {}),
    ...(typeof value.enemyHealing === "number" ? { enemyHealing: Math.max(0, Math.floor(value.enemyHealing)) } : {})
  };
}

function isTurnBasedDuelStoredAction(value: unknown): value is TurnBasedDuelRoundSummary["actions"][number]["action"] {
  return value === "attack" ||
    value === "defend" ||
    value === "skill" ||
    value === "race" ||
    value === "gear" ||
    value === "surrender" ||
    value === "timeout-attack";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
