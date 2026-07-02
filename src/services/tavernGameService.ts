import { randomUUID } from "node:crypto";
import type { AppConfig } from "../config/env";
import {
  isKostiSign,
  isKostiStyle,
  isTavleiTactic,
  type KostiSign,
  type KostiStyle,
  type TavernGameDecision,
  type TavernGameKey,
  type TavleiTactic
} from "../domain/tavernGames";
import type {
  TavernGameCancelResult,
  TavernGameCreateResult,
  TavernGameDecisionResult,
  TavernGameJoinResult,
  TavernGameRepository,
  TavernGameResolveResult,
  TavernGameSessionRecord
} from "../db/repositories/tavernGameRepository";

export const TAVERN_GAME_JOIN_TTL_MS = 13 * 60_000;
export const TAVERN_GAME_DECISION_TTL_MS = 5 * 60_000;

export type TavernGameFeatureResult = { state: "disabled" } | { state: "game-disabled"; gameKey: TavernGameKey };

export type TavernGameHubResult =
  | TavernGameFeatureResult
  | {
      state: "ready";
      maxStake: number;
      tavleiEnabled: boolean;
      kostiEnabled: boolean;
      openTables: TavernGameSessionRecord[];
    };

export type TavernGameCreateServiceResult = TavernGameFeatureResult | TavernGameCreateResult;
export type TavernGameJoinServiceResult = TavernGameFeatureResult | TavernGameJoinResult;
export type TavernGameDecisionServiceResult =
  | TavernGameFeatureResult
  | { state: "invalid-decision" }
  | TavernGameDecisionResult;
export type TavernGameResolveServiceResult = TavernGameFeatureResult | TavernGameResolveResult;
export type TavernGameCancelServiceResult = TavernGameFeatureResult | TavernGameCancelResult;

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
    private readonly now: () => Date = () => new Date()
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

    return {
      state: "ready",
      maxStake: this.config.tavernGameMaxStake,
      tavleiEnabled: this.isTavleiEnabled(),
      kostiEnabled: this.isKostiEnabled(),
      openTables
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
    return this.repository.createForTelegramUser(telegramUserId, {
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
  }

  async joinByTokenForTelegramUser(
    telegramUserId: bigint,
    token: string
  ): Promise<TavernGameJoinServiceResult> {
    if (!this.isEnabled()) {
      return { state: "disabled" };
    }

    const now = this.now();
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
    const gate = this.requireGame("kosti");
    if (gate) {
      return gate;
    }

    return this.repository.resolveKostiForTelegramUser(telegramUserId, token, this.now());
  }

  async cancelForTelegramUser(
    telegramUserId: bigint,
    token: string
  ): Promise<TavernGameCancelServiceResult> {
    if (!this.isEnabled()) {
      return { state: "disabled" };
    }

    return this.repository.cancelForTelegramUser(telegramUserId, token, this.now());
  }

  private async submitDecisionForTelegramUser(
    telegramUserId: bigint,
    token: string,
    decision: TavernGameDecision
  ): Promise<TavernGameDecisionServiceResult> {
    const gate = this.requireGame(decision.gameKey);
    if (gate) {
      return gate;
    }

    return this.repository.submitDecisionForTelegramUser(telegramUserId, token, decision, this.now());
  }

  private requireGame(gameKey: TavernGameKey): TavernGameFeatureResult | null {
    if (!this.isEnabled()) {
      return { state: "disabled" };
    }
    if (gameKey === "tavlei" && !this.isTavleiEnabled()) {
      return { state: "game-disabled", gameKey };
    }
    if (gameKey === "kosti" && !this.isKostiEnabled()) {
      return { state: "game-disabled", gameKey };
    }

    return null;
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
