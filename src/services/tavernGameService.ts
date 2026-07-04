import { randomUUID } from "node:crypto";
import type { AppConfig } from "../config/env";
import { resolveActiveCosmeticTitleLabel } from "../content/cosmeticTitles";
import type { AchievementService, AchievementUnlock } from "./achievementService";
import {
  DICE_POKER_RULES_VERSION,
  isDicePokerState,
  resolveQuickDicePokerRound,
  rerollScorecardDice,
  scoreScorecardCategory,
  startQuickDicePoker,
  startScorecardDicePoker,
  toggleDieSelection,
  type DicePokerMode,
  type DicePokerScoreCategory,
  type DicePokerState
} from "../domain/dicePoker";
import {
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
      openTables: TavernGameSessionRecord[];
    };

type TavernGameCreateCooldownServiceResult = Extract<TavernGameCreateResult, { state: "cooldown" }> & {
  now: Date;
};

export type TavernGameCreateServiceResult =
  | TavernGameFeatureResult
  | Exclude<TavernGameCreateResult, { state: "cooldown" }>
  | TavernGameCreateCooldownServiceResult;
export type TavernGameJoinServiceResult = TavernGameFeatureResult | TavernGameJoinResult;
export type TavernGameDecisionServiceResult =
  | TavernGameFeatureResult
  | { state: "invalid-decision" }
  | TavernGameDecisionResultWithAchievements;
export type TavernGameResolveServiceResult = TavernGameFeatureResult | TavernGameResolveResultWithAchievements;
export type TavernGameCancelServiceResult = TavernGameFeatureResult | TavernGameCancelResult;
export type DicePokerServiceResult =
  | TavernGameFeatureResult
  | Exclude<TavernGameCreateResult, { state: "cooldown" }>
  | TavernGameCreateCooldownServiceResult
  | (DicePokerActionResult & TavernGameAchievementPayload);

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

  async resetCreateCooldownForDev(telegramUserId: bigint): Promise<TavernGameDevResetResult> {
    if (!this.isEnabled()) {
      return { state: "disabled" };
    }

    return this.repository.resetCreateCooldownForTelegramUser(telegramUserId, {
      now: this.now(),
      cooldownMs: this.config.tavernGameCreateCooldownSec * 1000
    });
  }

  async getHub(): Promise<TavernGameHubResult> {
    if (!this.isEnabled()) {
      return { state: "disabled" };
    }

    const now = this.now();
    const openTables = await this.repository.listOpen(now);
    const enabledOpenTables = openTables.filter((session) =>
      this.isGameEnabled(session.gameKey) &&
      !(session.gameKey === "kosti" && session.rulesVersion !== DICE_POKER_RULES_VERSION)
    );

    return {
      state: "ready",
      maxStake: this.config.tavernGameMaxStake,
      tavleiEnabled: this.isTavleiEnabled(),
      kostiEnabled: this.isKostiEnabled(),
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
      cooldownMs: this.config.tavernGameCreateCooldownSec * 1000,
      now
    });

    return result.state === "cooldown" ? { ...result, now } : result;
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
    const result = await this.repository.createDicePokerForTelegramUser(telegramUserId, {
      mode,
      token: randomUUID(),
      seed,
      stakeGold: Math.trunc(stakeGold),
      maxStake: this.config.tavernGameMaxStake,
      expiresAt: getDicePokerExpiresAt(now, mode),
      cooldownMs: this.config.tavernGameCreateCooldownSec * 1000,
      now,
      state: mode === "quick" ? startQuickDicePoker(seed) : startScorecardDicePoker(seed)
    });

    if (result.state === "active-session" && result.session.gameKey === "kosti") {
      const stale = await this.refundOldKostiTable(result.session.token, now);
      if (stale) {
        return stale;
      }
    }

    return result.state === "cooldown" ? { ...result, now } : result;
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
      decisionExpiresAt: new Date(now.getTime() + TAVERN_GAME_DECISION_TTL_MS)
    });
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

  async scoreScorecardCategoryForTelegramUser(
    telegramUserId: bigint,
    token: string,
    category: DicePokerScoreCategory
  ): Promise<DicePokerServiceResult> {
    const current = await this.getDicePokerStateForAction(token);
    if (!current) {
      return { state: "not-found" };
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

    const participant = result.session.participants[0];
    if (!participant) {
      return result;
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

    return unlocks.length > 0
      ? {
          ...result,
          achievementNotifications: [{
            telegramUserId: participant.telegramUserId,
            unlocks
          }]
        }
      : result;
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
    for (const participant of record.participants) {
      const outcome = outcomes.get(participant.characterId);
      if (!outcome) {
        continue;
      }

      const entry = getOrCreateLeaderboardEntry(entries, participant);
      if (outcome === "win") {
        entry.winCount += 1;
      } else if (outcome === "draw") {
        entry.drawCount += 1;
      } else {
        entry.lossCount += 1;
      }
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
    return null;
  }

  return new Map([[participant.characterId, dicePokerOutcome]]);
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
  return new Date(now.getTime() + (mode === "scorecard" ? DICE_POKER_SCORECARD_TTL_MS : TAVERN_GAME_DECISION_TTL_MS));
}

function getDicePokerRefreshExpiresAt(now: Date, state: DicePokerState): Date | undefined {
  return state.mode === "scorecard" ? getDicePokerExpiresAt(now, "scorecard") : undefined;
}
