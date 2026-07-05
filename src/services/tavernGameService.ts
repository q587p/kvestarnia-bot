import { randomUUID } from "node:crypto";
import type { AppConfig } from "../config/env";
import { resolveActiveCosmeticTitleLabel } from "../content/cosmeticTitles";
import type { AchievementService, AchievementUnlock } from "./achievementService";
import {
  DICE_POKER_RULES_VERSION,
  DICE_POKER_QUICK_SOCIAL_TTL_MS,
  getStoredDicePokerState,
  isDicePokerState,
  isDicePokerTableState,
  resolveQuickDicePokerRound,
  resolveQuickPlayerHand,
  rerollScorecardDice,
  scoreScorecardCategory,
  startDicePokerTable,
  startQuickDicePoker,
  startScorecardDicePoker,
  toggleDieSelection,
  type DicePokerMode,
  type DicePokerScoreCategory,
  type DicePokerState,
  type DicePokerTableState
} from "../domain/dicePoker";
import {
  TAVLEI_DOPPELGANGER_CHARACTER_ID,
  TAVLEI_DOPPELGANGER_NAME,
  TAVLEI_PLAYER_CAP,
  isKostiSign,
  isKostiStyle,
  isTavleiTactic,
  type KostiSign,
  type KostiStyle,
  type TavernGameDecision,
  type TavernGameKey,
  type TavernGameResolution,
  type TavleiTactic
} from "../domain/tavernGames";
import { isTrainingDoppelgangerAtShynok } from "../domain/trainingDoppelganger";
import type {
  TavernGameCancelResult,
  TavernGameCreateResult,
  TavernGameDecisionResult,
  DicePokerActionResult,
  TavernGameLeaderboard,
  TavernGameLeaderboardEntry,
  TavernGameJoinResult,
  TavernGameRepository,
  TavernGameResolveResult,
  TavernGameSessionRecord
} from "../db/repositories/tavernGameRepository";

export const TAVERN_GAME_JOIN_TTL_MS = 13 * 60_000;
export const TAVERN_GAME_DECISION_TTL_MS = 5 * 60_000;
export const DICE_POKER_SCORECARD_TTL_MS = 93 * 60_000;
const TAVERN_GAME_LEADERBOARD_LIMIT = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

export type TavernGameFeatureResult =
  | { state: "disabled" }
  | { state: "game-disabled"; gameKey: TavernGameKey }
  | { state: "game-disabled-refunded"; gameKey: TavernGameKey; session: TavernGameSessionRecord };

export type TavernGameHubResult =
  | TavernGameFeatureResult
  | {
      state: "ready";
      maxStake: number;
      tavleiEnabled: boolean;
      kostiEnabled: boolean;
      doppelgangerAvailable: boolean;
      character?: { gold: number };
      openTables: TavernGameSessionRecord[];
    };

export interface TavernGameRematchInvite {
  telegramUserId: bigint;
  displayName: string;
}

export type TavernGameCreateServiceResult = TavernGameFeatureResult | TavernGameCreateResult;
export type TavernGameJoinServiceResult = TavernGameFeatureResult | TavernGameJoinResult;
export type TavernGameDecisionServiceResult =
  | TavernGameFeatureResult
  | { state: "invalid-decision" }
  | TavernGameDecisionResultWithAchievements;
export type TavernGameResolveServiceResult = TavernGameFeatureResult | TavernGameResolveResultWithAchievements;
export type TavernGameCancelServiceResult = TavernGameFeatureResult | TavernGameCancelResult;
export type DicePokerServiceResult =
  | TavernGameFeatureResult
  | TavernGameCreateResult
  | (DicePokerActionResult & TavernGameAchievementPayload);
export type TavernGameRematchServiceResult = (
  | TavernGameCreateServiceResult
  | DicePokerServiceResult
  | { state: "stale"; session: TavernGameSessionRecord }
  | { state: "not-participant"; session: TavernGameSessionRecord }
) & {
  rematchInvitees?: TavernGameRematchInvite[];
};
export type TavernGameInviteViewResult =
  | TavernGameFeatureResult
  | { state: "not-found" }
  | { state: "not-participant"; session: TavernGameSessionRecord }
  | { state: "not-creator"; session: TavernGameSessionRecord }
  | { state: "stale"; session: TavernGameSessionRecord }
  | { state: "ready"; session: TavernGameSessionRecord };

export type TavernGameDevResetResult =
  | { state: "disabled" }
  | { state: "no-character" }
  | { state: "reset"; updated: number };

export interface TavernGameAchievementNotification {
  telegramUserId: bigint;
  unlocks: AchievementUnlock[];
}

type TavernGameAchievementPayload = {
  achievementNotifications?: TavernGameAchievementNotification[];
};

type TavernGameDecisionResultWithAchievements = TavernGameDecisionResult & TavernGameAchievementPayload;
type TavernGameResolveResultWithAchievements = TavernGameResolveResult & TavernGameAchievementPayload;

export class TavernGameService {
  constructor(
    private readonly repository: TavernGameRepository,
    private readonly config: Pick<
      AppConfig,
      | "tavernGamesEnabled"
      | "tavernGameTavleiEnabled"
      | "tavernGameKostiEnabled"
      | "tavernGameMaxStake"
      | "tavernGameCreateCooldownSec"
    >,
    private readonly now: () => Date = () => new Date(),
    private readonly achievements?: AchievementService
  ) {}

  isEnabled(): boolean {
    return this.config.tavernGamesEnabled && (this.isTavleiEnabled() || this.isKostiEnabled());
  }

  isTavleiEnabled(): boolean {
    return this.config.tavernGamesEnabled && this.config.tavernGameTavleiEnabled;
  }

  isKostiEnabled(): boolean {
    return this.config.tavernGamesEnabled && this.config.tavernGameKostiEnabled;
  }

  getMaxStake(): number {
    return this.config.tavernGameMaxStake;
  }

  isDoppelgangerAtShynok(): boolean {
    return isTrainingDoppelgangerAtShynok(this.now());
  }

  async resetCreateCooldownForDev(telegramUserId: bigint): Promise<TavernGameDevResetResult> {
    if (!this.isEnabled()) {
      return { state: "disabled" };
    }

    const character = await this.repository.findCharacterByTelegramUser(telegramUserId);
    return character ? { state: "reset", updated: 0 } : { state: "no-character" };
  }

  async getHub(telegramUserId?: bigint): Promise<TavernGameHubResult> {
    if (!this.isEnabled()) {
      return { state: "disabled" };
    }

    const now = this.now();
    const [openTables, character] = await Promise.all([
      this.repository.listOpen(now),
      telegramUserId === undefined ? Promise.resolve(null) : this.repository.findCharacterByTelegramUser(telegramUserId)
    ]);
    const enabledOpenTables = openTables.filter((session) =>
      this.isGameEnabled(session.gameKey) &&
      !(session.gameKey === "kosti" && session.rulesVersion !== DICE_POKER_RULES_VERSION)
    );

    return {
      state: "ready",
      maxStake: this.config.tavernGameMaxStake,
      tavleiEnabled: this.isTavleiEnabled(),
      kostiEnabled: this.isKostiEnabled(),
      doppelgangerAvailable: this.isDoppelgangerAtShynok(),
      ...(character ? { character: { gold: character.gold } } : {}),
      openTables: enabledOpenTables
    };
  }

  async getLeaderboard(): Promise<TavernGameFeatureResult | { state: "ready"; leaderboard: TavernGameLeaderboard }> {
    if (!this.isEnabled()) {
      return { state: "disabled" };
    }

    const now = this.now();
    const daySince = new Date(now.getTime() - DAY_MS);
    const weekSince = new Date(now.getTime() - 7 * DAY_MS);
    const monthSince = new Date(now.getTime() - 31 * DAY_MS);
    const records = await this.repository.listCompletedSince(monthSince);

    return {
      state: "ready",
      leaderboard: {
        day: buildLeaderboard(records, daySince),
        week: buildLeaderboard(records, weekSince),
        month: buildLeaderboard(records, monthSince)
      }
    };
  }

  async createForTelegramUser(
    telegramUserId: bigint,
    gameKey: TavernGameKey,
    stakeGold: number
  ): Promise<TavernGameCreateServiceResult> {
    const gate = this.requireGame(gameKey);
    if (gate) {
      return gate;
    }

    const now = this.now();
    const stake = Math.trunc(stakeGold);
    const result = await this.repository.createForTelegramUser(telegramUserId, {
      gameKey,
      token: randomUUID(),
      seed: `${gameKey}:${randomUUID()}`,
      stakeGold: stake,
      maxStake: this.config.tavernGameMaxStake,
      joinExpiresAt: new Date(now.getTime() + TAVERN_GAME_JOIN_TTL_MS),
      decisionExpiresAt: new Date(now.getTime() + TAVERN_GAME_DECISION_TTL_MS),
      cooldownMs: 0,
      now
    });

    return result;
  }

  async createDicePokerForTelegramUser(
    telegramUserId: bigint,
    mode: DicePokerMode,
    stakeGold: number
  ): Promise<DicePokerServiceResult> {
    const gate = this.requireGame("kosti");
    if (gate) {
      return gate;
    }

    const now = this.now();
    const seed = `dice-poker:${mode}:${randomUUID()}`;
    const tableState = startDicePokerTable(mode);
    const result = await this.repository.createDicePokerForTelegramUser(telegramUserId, {
      mode,
      token: randomUUID(),
      seed,
      stakeGold: Math.trunc(stakeGold),
      maxStake: this.config.tavernGameMaxStake,
      expiresAt: new Date(now.getTime() + TAVERN_GAME_JOIN_TTL_MS),
      joinExpiresAt: new Date(now.getTime() + TAVERN_GAME_JOIN_TTL_MS),
      decisionExpiresAt: null,
      status: "open",
      cooldownMs: 0,
      now,
      state: tableState,
      participantState: createDicePokerParticipantState(tableState, seed, `${telegramUserId}`)
    });

    if (result.state === "active-session" && result.session.gameKey === "kosti") {
      const stale = await this.refundOldKostiTable(result.session.token, now);
      if (stale) {
        return stale;
      }
    }

    return result;
  }

  async createDicePokerWithDoppelgangerForTelegramUser(
    telegramUserId: bigint,
    mode: DicePokerMode,
    stakeGold: number
  ): Promise<DicePokerServiceResult> {
    const gate = this.requireGame("kosti");
    if (gate) {
      return gate;
    }

    const now = this.now();
    if (!isTrainingDoppelgangerAtShynok(now)) {
      return { state: "blocked", reason: "doppelganger-at-fighting-corner" };
    }

    const seed = `dice-poker:doppelganger:${mode}:${randomUUID()}`;
    const result = await this.repository.createDicePokerForTelegramUser(telegramUserId, {
      mode,
      token: randomUUID(),
      seed,
      stakeGold: Math.trunc(stakeGold),
      maxStake: this.config.tavernGameMaxStake,
      expiresAt: getDicePokerExpiresAt(now, mode),
      cooldownMs: 0,
      now,
      state: mode === "quick" ? startQuickDicePoker(seed) : startScorecardDicePoker(seed)
    });

    if (result.state === "active-session" && result.session.gameKey === "kosti") {
      const stale = await this.refundOldKostiTable(result.session.token, now);
      if (stale) {
        return stale;
      }
    }

    return result;
  }

  async createTavleiWithDoppelgangerForTelegramUser(
    telegramUserId: bigint,
    stakeGold: number
  ): Promise<TavernGameCreateServiceResult> {
    const gate = this.requireGame("tavlei");
    if (gate) {
      return gate;
    }

    const now = this.now();
    if (!isTrainingDoppelgangerAtShynok(now)) {
      return { state: "blocked", reason: "doppelganger-at-fighting-corner" };
    }

    const result = await this.repository.createTavleiDoppelgangerForTelegramUser(telegramUserId, {
      token: randomUUID(),
      seed: `tavlei:doppelganger:${randomUUID()}`,
      stakeGold: Math.trunc(stakeGold),
      maxStake: this.config.tavernGameMaxStake,
      expiresAt: new Date(now.getTime() + TAVERN_GAME_DECISION_TTL_MS),
      cooldownMs: 0,
      now,
      state: { kind: "tavlei_doppelganger", opponent: "doppelganger" }
    });

    if (result.state === "active-session" && result.session.gameKey === "kosti") {
      const stale = await this.refundOldKostiTable(result.session.token, now);
      if (stale) {
        return stale;
      }
    }

    return result;
  }

  async createRematchForTelegramUser(
    telegramUserId: bigint,
    token: string
  ): Promise<TavernGameRematchServiceResult> {
    const previous = await this.repository.getByToken(token, this.now());
    if (!previous) {
      return { state: "not-found" };
    }

    const participant = previous.participants.find((row) => row.telegramUserId === telegramUserId);
    if (!participant) {
      return { state: "not-participant", session: previous };
    }
    if (previous.status !== "completed") {
      return { state: "stale", session: previous };
    }

    const previousDicePokerState = getStoredDicePokerState(previous.result);
    if (previousDicePokerState) {
      return this.createDicePokerWithDoppelgangerForTelegramUser(
        telegramUserId,
        previousDicePokerState.mode,
        previous.stakeGold
      );
    }
    if (isDicePokerTableState(previous.result)) {
      const result = await this.createDicePokerForTelegramUser(
        telegramUserId,
        previous.result.mode,
        previous.stakeGold
      );
      return withRematchInvitees(result, previous, telegramUserId);
    }
    if (previous.gameKey === "tavlei" && isDoppelgangerTavleiResolution(previous.result)) {
      return this.createTavleiWithDoppelgangerForTelegramUser(telegramUserId, previous.stakeGold);
    }
    if (previous.gameKey === "tavlei") {
      const result = await this.createForTelegramUser(telegramUserId, "tavlei", previous.stakeGold);
      return withRematchInvitees(result, previous, telegramUserId);
    }

    return { state: "stale", session: previous };
  }

  async joinByTokenForTelegramUser(
    telegramUserId: bigint,
    token: string
  ): Promise<TavernGameJoinServiceResult> {
    const now = this.now();
    const tokenGate = await this.refundIfTokenGameDisabled(token, now);
    if (tokenGate) {
      return tokenGate;
    }
    const stale = await this.refundOldKostiTable(token, now);
    if (stale) {
      return stale;
    }

    return this.repository.joinByTokenForTelegramUser(telegramUserId, token, {
      now,
      decisionExpiresAt: new Date(now.getTime() + TAVERN_GAME_DECISION_TTL_MS),
      quickStartExpiresAt: new Date(now.getTime() + DICE_POKER_QUICK_SOCIAL_TTL_MS)
    });
  }

  async getInviteViewForTelegramUser(
    telegramUserId: bigint,
    token: string
  ): Promise<TavernGameInviteViewResult> {
    const now = this.now();
    if (!this.isEnabled()) {
      return { state: "disabled" };
    }

    const session = await this.repository.peekByToken(token);
    if (!session) {
      return { state: "not-found" };
    }
    if (!this.isGameEnabled(session.gameKey)) {
      return { state: "game-disabled", gameKey: session.gameKey };
    }

    const participant = session.participants.find((row) => row.telegramUserId === telegramUserId);
    if (!participant) {
      return { state: "not-participant", session };
    }
    if (participant.characterId !== session.creatorCharacterId) {
      return { state: "not-creator", session };
    }

    return isInviteableTavernGameSession(session) && session.joinExpiresAt > now
      ? { state: "ready", session }
      : { state: "stale", session };
  }

  async submitTavleiDecisionForTelegramUser(
    telegramUserId: bigint,
    token: string,
    tactic: string
  ): Promise<TavernGameDecisionServiceResult> {
    if (!isTavleiTactic(tactic)) {
      return { state: "invalid-decision" };
    }

    return this.submitDecisionForTelegramUser(telegramUserId, token, { gameKey: "tavlei", tactic });
  }

  async submitKostiDecisionForTelegramUser(
    telegramUserId: bigint,
    token: string,
    style: string,
    sign: string
  ): Promise<TavernGameDecisionServiceResult> {
    if (!isKostiStyle(style) || !isKostiSign(sign)) {
      return { state: "invalid-decision" };
    }

    const stale = await this.refundOldKostiTable(token, this.now());
    if (stale) {
      return stale;
    }

    return this.submitDecisionForTelegramUser(telegramUserId, token, { gameKey: "kosti", style, sign });
  }

  async resolveKostiForTelegramUser(
    telegramUserId: bigint,
    token: string
  ): Promise<TavernGameResolveServiceResult> {
    const now = this.now();
    const tokenGate = await this.refundIfTokenGameDisabled(token, now);
    if (tokenGate) {
      return tokenGate;
    }
    const stale = await this.refundOldKostiTable(token, now);
    if (stale) {
      return stale;
    }

    const result = await this.repository.resolveKostiForTelegramUser(telegramUserId, token, now);
    return this.withResolvedAchievements(result, now);
  }

  async toggleDicePokerDieForTelegramUser(
    telegramUserId: bigint,
    token: string,
    index: number
  ): Promise<DicePokerServiceResult> {
    const current = await this.getDicePokerStateForAction(token);
    if (!current) {
      return { state: "not-found" };
    }
    if (isDicePokerTableState(current.result) && current.result.phase !== "playing") {
      return { state: "stale", session: current };
    }
    const tablePlayer = getDicePokerParticipantState(current, telegramUserId);
    if (tablePlayer) {
      if (tablePlayer.phase === "terminal") {
        return { state: "closed", session: current };
      }
      const state = {
        ...tablePlayer,
        selectedMask: toggleDieSelection(tablePlayer.selectedMask, index)
      } as DicePokerState;
      const now = this.now();
      return this.repository.saveDicePokerParticipantStateForTelegramUser(
        telegramUserId,
        token,
        state,
        now,
        getDicePokerRefreshExpiresAt(now, state)
      );
    }
    if (!isDicePokerState(current.result)) {
      return { state: "stale", session: current };
    }
    if (current.result.phase === "terminal") {
      return { state: "closed", session: current };
    }

    const state = {
      ...current.result,
      selectedMask: toggleDieSelection(current.result.selectedMask, index)
    } as DicePokerState;

    const now = this.now();
    return this.repository.saveDicePokerStateForTelegramUser(
      telegramUserId,
      token,
      state,
      now,
      getDicePokerRefreshExpiresAt(now, state)
    );
  }

  async resolveQuickDicePokerForTelegramUser(
    telegramUserId: bigint,
    token: string
  ): Promise<DicePokerServiceResult> {
    const current = await this.getDicePokerStateForAction(token);
    if (!current) {
      return { state: "not-found" };
    }
    if (!isDicePokerState(current.result) || current.result.mode !== "quick" || current.result.phase !== "quick-reroll") {
      return { state: "stale", session: current };
    }

    const next = resolveQuickDicePokerRound(current.result, current.seed);
    if (next.phase !== "terminal") {
      const now = this.now();
      return this.repository.saveDicePokerStateForTelegramUser(
        telegramUserId,
        token,
        next,
        now,
        getDicePokerRefreshExpiresAt(now, next)
      );
    }

    const result = await this.repository.completeDicePokerForTelegramUser(telegramUserId, token, {
      state: next,
      outcome: next.outcome === "win" ? "win" : next.outcome === "loss" ? "loss" : "draw",
      payoutGold: next.outcome === "win" ? current.stakeGold : 0,
      refundedGold: next.outcome === "refund" ? current.stakeGold : 0,
      now: this.now()
    });
    return this.withDicePokerAchievements(result, this.now(), next.outcome === "win" ? "win" : next.outcome === "loss" ? "loss" : "draw");
  }

  async rollDicePokerForTelegramUser(
    telegramUserId: bigint,
    token: string
  ): Promise<DicePokerServiceResult> {
    const current = await this.getDicePokerStateForAction(token);
    if (!current) {
      return { state: "not-found" };
    }
    if (isDicePokerTableState(current.result) && current.result.phase !== "playing") {
      return { state: "stale", session: current };
    }
    const tablePlayer = getDicePokerParticipantState(current, telegramUserId);
    if (tablePlayer) {
      if (tablePlayer.phase === "terminal") {
        return { state: "closed", session: current };
      }
      return tablePlayer.mode === "quick"
        ? this.resolveQuickDicePokerTableForTelegramUser(telegramUserId, token, current, tablePlayer)
        : this.rerollScorecardDiceTableForTelegramUser(telegramUserId, token, current, tablePlayer);
    }
    if (!isDicePokerState(current.result)) {
      return { state: "stale", session: current };
    }
    if (current.result.phase === "terminal") {
      return { state: "closed", session: current };
    }

    return current.result.mode === "quick"
      ? this.resolveQuickDicePokerForTelegramUser(telegramUserId, token)
      : this.rerollScorecardDiceForTelegramUser(telegramUserId, token);
  }

  async rerollScorecardDiceForTelegramUser(
    telegramUserId: bigint,
    token: string
  ): Promise<DicePokerServiceResult> {
    const current = await this.getDicePokerStateForAction(token);
    if (!current) {
      return { state: "not-found" };
    }
    if (isDicePokerTableState(current.result) && current.result.phase !== "playing") {
      return { state: "stale", session: current };
    }
    const tablePlayer = getDicePokerParticipantState(current, telegramUserId);
    if (tablePlayer) {
      if (tablePlayer.phase === "terminal") {
        return { state: "closed", session: current };
      }
      return tablePlayer.mode === "scorecard"
        ? this.rerollScorecardDiceTableForTelegramUser(telegramUserId, token, current, tablePlayer)
        : { state: "stale", session: current };
    }
    if (!isDicePokerState(current.result) || current.result.mode !== "scorecard" || current.result.phase !== "scorecard-roll") {
      return { state: "stale", session: current };
    }
    if (current.result.roll >= 3) {
      return { state: "saved", session: current, dicePoker: current.result };
    }
    if (current.result.selectedMask === 0) {
      return { state: "saved", session: current, dicePoker: current.result };
    }

    const next = rerollScorecardDice(current.result, current.seed);
    const now = this.now();
    return this.repository.saveDicePokerStateForTelegramUser(
      telegramUserId,
      token,
      next,
      now,
      getDicePokerRefreshExpiresAt(now, next)
    );
  }

  private async resolveQuickDicePokerTableForTelegramUser(
    telegramUserId: bigint,
    token: string,
    session: TavernGameSessionRecord,
    state: Extract<DicePokerState, { mode: "quick"; phase: "quick-reroll" }>
  ): Promise<DicePokerServiceResult> {
    const next = resolveQuickPlayerHand(state, session.seed, `${telegramUserId}`);
    const result = await this.repository.saveDicePokerParticipantStateForTelegramUser(
      telegramUserId,
      token,
      next,
      this.now()
    );
    return this.withDicePokerAchievements(result, this.now(), "draw");
  }

  private async rerollScorecardDiceTableForTelegramUser(
    telegramUserId: bigint,
    token: string,
    session: TavernGameSessionRecord,
    state: Extract<DicePokerState, { mode: "scorecard"; phase: "scorecard-roll" }>
  ): Promise<DicePokerServiceResult> {
    if (state.roll >= 3 || state.selectedMask === 0) {
      return {
        state: "saved",
        session,
        dicePoker: state
      };
    }

    const next = rerollScorecardDice(state, `${token}:${telegramUserId}`);
    const now = this.now();
    return this.repository.saveDicePokerParticipantStateForTelegramUser(
      telegramUserId,
      token,
      next,
      now,
      getDicePokerRefreshExpiresAt(now, next)
    );
  }

  async scoreScorecardCategoryForTelegramUser(
    telegramUserId: bigint,
    token: string,
    category: DicePokerScoreCategory
  ): Promise<DicePokerServiceResult> {
    const current = await this.getDicePokerStateForAction(token);
    if (!current) {
      return { state: "not-found" };
    }
    if (isDicePokerTableState(current.result) && current.result.phase !== "playing") {
      return { state: "stale", session: current };
    }
    const tablePlayer = getDicePokerParticipantState(current, telegramUserId);
    if (tablePlayer) {
      if (tablePlayer.phase === "terminal") {
        return { state: "closed", session: current };
      }
      if (tablePlayer.mode !== "scorecard" || tablePlayer.phase !== "scorecard-roll") {
        return { state: "stale", session: current };
      }
      if (tablePlayer.scores[category] !== undefined) {
        return { state: "saved", session: current, dicePoker: tablePlayer };
      }

      const next = scoreScorecardCategory(tablePlayer, category, `${current.seed}:${telegramUserId}`);
      const now = this.now();
      const result = await this.repository.saveDicePokerParticipantStateForTelegramUser(
        telegramUserId,
        token,
        next,
        now,
        getDicePokerRefreshExpiresAt(now, next)
      );
      return this.withDicePokerAchievements(result, now, "draw");
    }
    if (!isDicePokerState(current.result) || current.result.mode !== "scorecard" || current.result.phase !== "scorecard-roll") {
      return { state: "stale", session: current };
    }
    if (current.result.scores[category] !== undefined) {
      return { state: "saved", session: current, dicePoker: current.result };
    }

    const next = scoreScorecardCategory(current.result, category, current.seed);
    if (next.phase !== "terminal") {
      const now = this.now();
      return this.repository.saveDicePokerStateForTelegramUser(
        telegramUserId,
        token,
        next,
        now,
        getDicePokerRefreshExpiresAt(now, next)
      );
    }

    const outcome = next.total >= 200 ? "win" : "draw";
    const result = await this.repository.completeDicePokerForTelegramUser(telegramUserId, token, {
      state: next,
      outcome,
      payoutGold: next.total >= 200 ? current.stakeGold : 0,
      refundedGold: next.total >= 200 ? 0 : current.stakeGold,
      now: this.now()
    });
    return this.withDicePokerAchievements(result, this.now(), outcome);
  }

  async cancelDicePokerForTelegramUser(
    telegramUserId: bigint,
    token: string
  ): Promise<DicePokerServiceResult> {
    const gate = await this.refundIfTokenGameDisabled(token, this.now());
    if (gate) {
      return gate;
    }

    return this.repository.cancelDicePokerForTelegramUser(telegramUserId, token, this.now());
  }

  async viewDicePokerForTelegramUser(
    telegramUserId: bigint,
    token: string
  ): Promise<DicePokerServiceResult> {
    const current = await this.getDicePokerStateForAction(token);
    if (!current) {
      return { state: "not-found" };
    }
    const tablePlayer = getDicePokerParticipantState(current, telegramUserId);
    if (tablePlayer) {
      return current.status === "completed"
        ? { state: "closed", session: current }
        : { state: "saved", session: current, dicePoker: tablePlayer };
    }
    if (isDicePokerTableState(current.result)) {
      const participant = current.participants.find((row) =>
        row.telegramUserId === telegramUserId && (row.status === "joined" || row.status === "decided")
      );
      return participant ? { state: "stale", session: current } : { state: "not-participant", session: current };
    }
    if (!isDicePokerState(current.result)) {
      return { state: "stale", session: current };
    }

    const participant = current.participants.find((row) =>
      row.telegramUserId === telegramUserId && (row.status === "joined" || row.status === "decided")
    );
    if (!participant) {
      return { state: "not-participant", session: current };
    }
    if (current.result.phase === "terminal" || current.status === "completed") {
      return { state: "closed", session: current };
    }

    return { state: "saved", session: current, dicePoker: current.result };
  }

  async cancelForTelegramUser(
    telegramUserId: bigint,
    token: string
  ): Promise<TavernGameCancelServiceResult> {
    const now = this.now();
    const tokenGate = await this.refundIfTokenGameDisabled(token, now);
    if (tokenGate) {
      return tokenGate;
    }

    return this.repository.cancelForTelegramUser(telegramUserId, token, now);
  }

  private async submitDecisionForTelegramUser(
    telegramUserId: bigint,
    token: string,
    decision: TavernGameDecision
  ): Promise<TavernGameDecisionServiceResult> {
    const now = this.now();
    const tokenGate = await this.refundIfTokenGameDisabled(token, now);
    if (tokenGate) {
      return tokenGate;
    }

    const result = await this.repository.submitDecisionForTelegramUser(telegramUserId, token, decision, now);
    return this.withResolvedAchievements(result, now);
  }

  private async withResolvedAchievements<
    T extends TavernGameDecisionResult | TavernGameResolveResult
  >(
    result: T,
    now: Date
  ): Promise<T & TavernGameAchievementPayload> {
    if (result.state !== "resolved" || !this.achievements) {
      return result;
    }

    const notifications: TavernGameAchievementNotification[] = [];
    const outcomes = getParticipantOutcomes(result.resolution);

    for (const participant of result.session.participants) {
      const outcome = outcomes.get(participant.characterId);
      if (!outcome) {
        continue;
      }

      const unlocks: AchievementUnlock[] = [];
      unlocks.push(...await this.achievements.trackEventSafely({
        type: "tavern.game.played",
        characterId: participant.characterId,
        occurredAt: now,
        sourceId: result.session.id
      }));
      unlocks.push(...await this.achievements.trackEventSafely({
        type: outcome === "win"
          ? "tavern.game.won"
          : outcome === "draw"
            ? "tavern.game.drawn"
            : "tavern.game.lost",
        characterId: participant.characterId,
        occurredAt: now,
        sourceId: result.session.id
      }));

      if (unlocks.length > 0) {
        notifications.push({
          telegramUserId: participant.telegramUserId,
          unlocks
        });
      }
    }

    return notifications.length > 0
      ? { ...result, achievementNotifications: notifications }
      : result;
  }

  private async withDicePokerAchievements<T extends DicePokerActionResult>(
    result: T,
    now: Date,
    outcome: "win" | "draw" | "loss"
  ): Promise<T & TavernGameAchievementPayload> {
    if (result.state !== "completed" || !this.achievements) {
      return result;
    }

    const outcomes = getStoredOutcomes(result.session);
    if (!outcomes) {
      return result;
    }

    const notifications: TavernGameAchievementNotification[] = [];
    for (const participant of result.session.participants) {
      const storedOutcome = outcomes.get(participant.characterId) ?? outcome;
      const unlocks: AchievementUnlock[] = [];
      unlocks.push(...await this.achievements.trackEventSafely({
        type: "tavern.game.played",
        characterId: participant.characterId,
        occurredAt: now,
        sourceId: result.session.id
      }));
      unlocks.push(...await this.achievements.trackEventSafely({
        type: storedOutcome === "win"
          ? "tavern.game.won"
          : storedOutcome === "draw"
            ? "tavern.game.drawn"
            : "tavern.game.lost",
        characterId: participant.characterId,
        occurredAt: now,
        sourceId: result.session.id
      }));
      if (unlocks.length > 0) {
        notifications.push({
          telegramUserId: participant.telegramUserId,
          unlocks
        });
      }
    }

    return notifications.length > 0 ? { ...result, achievementNotifications: notifications } : result;
  }

  private requireGame(gameKey: TavernGameKey): TavernGameFeatureResult | null {
    if (!this.isEnabled()) {
      return { state: "disabled" };
    }
    if (!this.isGameEnabled(gameKey)) {
      return { state: "game-disabled", gameKey };
    }

    return null;
  }

  private isGameEnabled(gameKey: TavernGameKey): boolean {
    return gameKey === "tavlei" ? this.isTavleiEnabled() : this.isKostiEnabled();
  }

  private async refundIfTokenGameDisabled(
    token: string,
    now: Date
  ): Promise<TavernGameFeatureResult | null> {
    const session = await this.repository.peekByToken(token);
    if (!session) {
      return this.isEnabled() ? null : { state: "disabled" };
    }
    if (this.isGameEnabled(session.gameKey)) {
      return null;
    }

    const refunded = await this.repository.refundDisabledByToken(token, now);
    return {
      state: "game-disabled-refunded",
      gameKey: session.gameKey,
      session: refunded ?? session
    };
  }

  private async refundOldKostiTable(
    token: string,
    now: Date
  ): Promise<TavernGameFeatureResult | null> {
    const session = await this.repository.peekByToken(token);
    if (!session || session.gameKey !== "kosti" || session.rulesVersion === DICE_POKER_RULES_VERSION) {
      return null;
    }

    const refunded = await this.repository.refundDisabledByToken(token, now);
    return {
      state: "game-disabled-refunded",
      gameKey: "kosti",
      session: refunded ?? session
    };
  }

  private async getDicePokerStateForAction(token: string): Promise<TavernGameSessionRecord | null> {
    return this.repository.getByToken(token, this.now());
  }
}

export function listTavernGameStakeOptions(maxStake: number): number[] {
  return [1, 5, 13, 23, 42, 93]
    .filter((stake) => stake <= maxStake)
    .filter((stake, index, values) => values.indexOf(stake) === index);
}

export type PresentedKostiStyle = KostiStyle;
export type PresentedKostiSign = KostiSign;
export type PresentedTavleiTactic = TavleiTactic;

function withRematchInvitees<T extends TavernGameCreateServiceResult | DicePokerServiceResult>(
  result: T,
  previous: TavernGameSessionRecord,
  actorTelegramUserId: bigint
): T & { rematchInvitees?: TavernGameRematchInvite[] } {
  if (result.state !== "created") {
    return result;
  }

  const invitees = previous.participants
    .filter((participant) => participant.telegramUserId !== actorTelegramUserId)
    .map((participant) => ({
      telegramUserId: participant.telegramUserId,
      displayName: participant.displayName
    }));

  return invitees.length > 0 ? { ...result, rematchInvitees: invitees } : result;
}

function isDoppelgangerTavleiResolution(input: unknown): boolean {
  return Boolean(
    input &&
    typeof input === "object" &&
    !Array.isArray(input) &&
    (input as { gameKey?: unknown; opponentKind?: unknown }).gameKey === "tavlei" &&
    (input as { opponentKind?: unknown }).opponentKind === "doppelganger"
  );
}

function isInviteableTavernGameSession(session: TavernGameSessionRecord): boolean {
  if (session.status !== "open") {
    return false;
  }

  const table = isDicePokerTableState(session.result) ? session.result : null;
  if (table) {
    return table.phase === "waiting" && session.participants.length < table.playerCap;
  }

  return session.gameKey === "tavlei" && session.participants.length < TAVLEI_PLAYER_CAP;
}

function buildLeaderboard(
  records: TavernGameSessionRecord[],
  since: Date
): TavernGameLeaderboardEntry[] {
  const entries = new Map<string, TavernGameLeaderboardEntry>();

  for (const record of records) {
    if (!record.completedAt || record.completedAt < since) {
      continue;
    }

    const outcomes = getStoredOutcomes(record);
    if (!outcomes) {
      continue;
    }
    const participantCharacterIds = new Set(record.participants.map((participant) => participant.characterId));
    for (const participant of record.participants) {
      const outcome = outcomes.get(participant.characterId);
      if (!outcome) {
        continue;
      }

      const entry = getOrCreateLeaderboardEntry(entries, participant);
      addLeaderboardOutcome(entry, outcome);
    }

    const doppelgangerOutcome = getDoppelgangerLeaderboardOutcome(record, outcomes, participantCharacterIds);
    if (doppelgangerOutcome) {
      addLeaderboardOutcome(getOrCreateDoppelgangerLeaderboardEntry(entries), doppelgangerOutcome);
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
    .slice(0, TAVERN_GAME_LEADERBOARD_LIMIT);
}

function addLeaderboardOutcome(entry: TavernGameLeaderboardEntry, outcome: "win" | "draw" | "loss"): void {
  if (outcome === "win") {
    entry.winCount += 1;
  } else if (outcome === "draw") {
    entry.drawCount += 1;
  } else {
    entry.lossCount += 1;
  }
}

function getOrCreateLeaderboardEntry(
  entries: Map<string, TavernGameLeaderboardEntry>,
  participant: TavernGameSessionRecord["participants"][number]
): TavernGameLeaderboardEntry {
  const current = entries.get(participant.characterId);

  if (current) {
    return current;
  }

  const activeCosmeticTitle = resolveActiveCosmeticTitleLabel(participant.character.activeCosmeticTitleGrantId);
  const next: TavernGameLeaderboardEntry = {
    characterId: participant.characterId,
    name: participant.displayName,
    ...(activeCosmeticTitle ? { activeCosmeticTitle } : {}),
    winCount: 0,
    drawCount: 0,
    lossCount: 0
  };

  entries.set(participant.characterId, next);
  return next;
}

function getOrCreateDoppelgangerLeaderboardEntry(
  entries: Map<string, TavernGameLeaderboardEntry>
): TavernGameLeaderboardEntry {
  const current = entries.get(TAVLEI_DOPPELGANGER_CHARACTER_ID);
  if (current) {
    return current;
  }

  const next: TavernGameLeaderboardEntry = {
    characterId: TAVLEI_DOPPELGANGER_CHARACTER_ID,
    name: TAVLEI_DOPPELGANGER_NAME,
    winCount: 0,
    drawCount: 0,
    lossCount: 0
  };
  entries.set(TAVLEI_DOPPELGANGER_CHARACTER_ID, next);
  return next;
}

function getParticipantOutcomes(resolution: TavernGameResolution): Map<string, "win" | "draw" | "loss"> {
  const outcomes = new Map<string, "win" | "draw" | "loss">();

  if (resolution.gameKey === "tavlei") {
    for (const player of resolution.players) {
      outcomes.set(
        player.characterId,
        resolution.outcome === "draw"
          ? "draw"
          : player.characterId === resolution.winnerCharacterId
            ? "win"
            : "loss"
      );
    }
    return outcomes;
  }

  for (const player of resolution.players) {
    outcomes.set(player.characterId, player.characterId === resolution.mainWinnerCharacterId ? "win" : "loss");
  }

  return outcomes;
}

function parseStoredResolution(input: unknown): TavernGameResolution | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }

  const value = input as { gameKey?: unknown; players?: unknown };
  if ((value.gameKey === "tavlei" || value.gameKey === "kosti") && Array.isArray(value.players)) {
    return input as TavernGameResolution;
  }

  return null;
}

function getStoredOutcomes(record: TavernGameSessionRecord): Map<string, "win" | "draw" | "loss"> | null {
  const resolution = parseStoredResolution(record.result);
  if (resolution) {
    return getParticipantOutcomes(resolution);
  }

  const dicePokerOutcome = parseStoredDicePokerOutcome(record.result);
  const participant = record.participants.length === 1 ? record.participants[0] : null;
  if (!dicePokerOutcome || !participant) {
    return parseStoredDicePokerTableOutcomes(record.result);
  }

  return new Map([[participant.characterId, dicePokerOutcome]]);
}

function getDoppelgangerLeaderboardOutcome(
  record: TavernGameSessionRecord,
  outcomes: Map<string, "win" | "draw" | "loss">,
  participantCharacterIds: Set<string>
): "win" | "draw" | "loss" | null {
  const storedOutcome = outcomes.get(TAVLEI_DOPPELGANGER_CHARACTER_ID);
  if (storedOutcome && !participantCharacterIds.has(TAVLEI_DOPPELGANGER_CHARACTER_ID)) {
    return storedOutcome;
  }

  const playerDicePokerOutcome = parseStoredDicePokerOutcome(record.result);
  return playerDicePokerOutcome && record.participants.length === 1
    ? invertLeaderboardOutcome(playerDicePokerOutcome)
    : null;
}

function invertLeaderboardOutcome(outcome: "win" | "draw" | "loss"): "win" | "draw" | "loss" {
  return outcome === "win" ? "loss" : outcome === "loss" ? "win" : "draw";
}

function parseStoredDicePokerTableOutcomes(input: unknown): Map<string, "win" | "draw" | "loss"> | null {
  if (!isDicePokerTableState(input) || input.phase !== "terminal" || !input.outcomes) {
    return null;
  }

  const entries = Object.entries(input.outcomes).filter((entry): entry is [string, "win" | "draw" | "loss"] =>
    entry[1] === "win" || entry[1] === "draw" || entry[1] === "loss"
  );
  return entries.length > 0 ? new Map(entries) : null;
}

function parseStoredDicePokerOutcome(input: unknown): "win" | "draw" | "loss" | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }

  const value = input as { kind?: unknown; outcome?: unknown };
  if (value.kind !== "dice_poker") {
    return null;
  }
  return value.outcome === "win" || value.outcome === "draw" || value.outcome === "loss"
    ? value.outcome
    : null;
}

function getDicePokerExpiresAt(now: Date, mode: DicePokerMode): Date {
  return new Date(now.getTime() + (mode === "scorecard" ? DICE_POKER_SCORECARD_TTL_MS : DICE_POKER_QUICK_SOCIAL_TTL_MS));
}

function getDicePokerRefreshExpiresAt(now: Date, state: DicePokerState): Date | undefined {
  return state.mode === "scorecard" ? getDicePokerExpiresAt(now, "scorecard") : undefined;
}

function getDicePokerParticipantState(
  session: TavernGameSessionRecord,
  telegramUserId: bigint
): DicePokerState | null {
  if (!isDicePokerTableState(session.result)) {
    return null;
  }

  const participant = session.participants.find((row) =>
    row.telegramUserId === telegramUserId && (row.status === "joined" || row.status === "decided")
  );
  return participant && isDicePokerState(participant.decision) ? participant.decision : null;
}

function createDicePokerParticipantState(
  table: DicePokerTableState,
  seed: string,
  participantSalt: string
): DicePokerState {
  const participantSeed = `${seed}:participant:${participantSalt}:round:${table.drawRound}`;
  return table.mode === "quick"
    ? startQuickDicePoker(participantSeed)
    : startScorecardDicePoker(participantSeed);
}
