import { randomUUID } from "node:crypto";
import type { AppConfig } from "../config/env";
import { resolveActiveCosmeticTitleLabel } from "../content/cosmeticTitles";
import type { AchievementService, AchievementUnlock } from "./achievementService";
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
  TavernGameLeaderboard,
  TavernGameLeaderboardEntry,
  TavernGameJoinResult,
  TavernGameRepository,
  TavernGameResolveResult,
  TavernGameSessionRecord
} from "../db/repositories/tavernGameRepository";

export const TAVERN_GAME_JOIN_TTL_MS = 13 * 60_000;
export const TAVERN_GAME_DECISION_TTL_MS = 5 * 60_000;
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

  async getHub(): Promise<TavernGameHubResult> {
    if (!this.isEnabled()) {
      return { state: "disabled" };
    }

    const now = this.now();
    const openTables = await this.repository.listOpen(now);
    const enabledOpenTables = openTables.filter((session) => this.isGameEnabled(session.gameKey));

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

  async joinByTokenForTelegramUser(
    telegramUserId: bigint,
    token: string
  ): Promise<TavernGameJoinServiceResult> {
    const now = this.now();
    const tokenGate = await this.refundIfTokenGameDisabled(token, now);
    if (tokenGate) {
      return tokenGate;
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

    const result = await this.repository.resolveKostiForTelegramUser(telegramUserId, token, now);
    return this.withResolvedAchievements(result, now);
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
}

export function listTavernGameStakeOptions(maxStake: number): number[] {
  return [1, 3, 5, 13, 25]
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

    const resolution = parseStoredResolution(record.result);
    if (!resolution) {
      continue;
    }

    const outcomes = getParticipantOutcomes(resolution);
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
