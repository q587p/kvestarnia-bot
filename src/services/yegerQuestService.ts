import { randomUUID } from "node:crypto";
import { monsters } from "../content/monsters";
import type { MonsterContent } from "../content/schema";
import type { CharacterRepository } from "../db/repositories/characterRepository";
import type { CooldownRepository } from "../db/repositories/cooldownRepository";
import {
  DailyActionQuantityLimitExceededError,
  type ClaimDailyActionResult,
  type DailyActionRecord,
  type DailyActionRepository,
  type RewardLevelChange
} from "../db/repositories/dailyActionRepository";
import type { SoloCombatSessionRepository } from "../db/repositories/soloCombatSessionRepository";
import { summarizeCharacter, type CharacterSummary } from "../domain/characters/characterSummary";
import { CryptoRandomSource, type RandomSource } from "../shared/random";
import type { FightLookupResult, FightService } from "./fightService";
import {
  YEGER_BANDAGE_PURCHASE_CANCEL_KEY,
  YEGER_BANDAGE_PURCHASE_CONFIRM_KEY,
  YEGER_BANDAGE_PURCHASE_PREVIEW_KEY,
  YEGER_UNQUIET_TRIAL_COMPLETED_KEY,
  YEGER_UNQUIET_TRIAL_SECOND_COMPLETED_KEY,
  YEGER_UNQUIET_TRIAL_SECOND_STARTED_KEY,
  YEGER_UNQUIET_TRIAL_STARTED_KEY
} from "./dailyActionKeys";
import {
  BANDAGE_ITEM_ID,
  enrichRewardItemGrants,
  YEGER_FIRST_NOTCH_ITEM_ID,
  type RewardItemGrant
} from "./itemGrant";
import { PRESENCE_LOCATION_KORCHMA_RANGER_CORNER } from "./presenceService";
import { toIsoDate } from "../shared/time";
import type { AchievementService, AchievementUnlock } from "./achievementService";
import { trackRewardAchievementsSafely } from "./achievementTracking";

export {
  YEGER_UNQUIET_TRIAL_COMPLETED_KEY,
  YEGER_UNQUIET_TRIAL_SECOND_COMPLETED_KEY,
  YEGER_UNQUIET_TRIAL_SECOND_STARTED_KEY,
  YEGER_UNQUIET_TRIAL_STARTED_KEY
} from "./dailyActionKeys";

export const YEGER_UNQUIET_TRIAL_MIN_LEVEL = 4;
export const YEGER_UNQUIET_TRIAL_TARGET = 5;
export const YEGER_UNQUIET_TRIAL_SECOND_TARGET = 17;
export const YEGER_UNQUIET_TRIAL_BUCKET = "once";
export const YEGER_UNQUIET_TRIAL_TAGS = ["undead", "ghost", "cursed", "unquiet"] as const;
export const YEGER_UNQUIET_TRIAL_REWARD = {
  maxXp: 80,
  gold: 120,
  itemId: YEGER_FIRST_NOTCH_ITEM_ID
};
export const YEGER_UNQUIET_TRIAL_SECOND_REWARD = {
  maxXp: 170,
  gold: 170
};
export const YEGER_TRACKING_COOLDOWN_KEY = "quest.yeger.unquiet-trial.tracking";
export const YEGER_TRACKING_MIN_MINUTES = 3;
export const YEGER_TRACKING_MAX_MINUTES = 7;
export const YEGER_TRACKING_BASE_EXACT_CHANCE = 0.65;
export const YEGER_TRACKING_RANGER_BONUS = 0.15;
export const YEGER_TRACKING_STAT_BONUS_CAP = 0.1;
export const YEGER_TRACKING_NEAR_MISS_CHANCE = 0.2;
export const YEGER_BANDAGE_SUPPLY_KEY = "yeger.bandage.supply.buy";
export const YEGER_RANGER_FREE_BANDAGE_KEY = "yeger.bandage.supply.ranger-free";
export const YEGER_BANDAGE_PRICE = 7;
export const YEGER_RANGER_BANDAGE_PRICE = 4;
export const YEGER_RANGER_FREE_BANDAGE_MINUTES = 93;
export const YEGER_BANDAGE_PURCHASE_TTL_MINUTES = 23;
export const YEGER_BANDAGE_PURCHASE_DAILY_LIMIT = 93;
export const YEGER_BANDAGE_PURCHASE_TARGETS = [1, 5, 17, 93] as const;

export type YegerBandagePurchaseTarget = typeof YEGER_BANDAGE_PURCHASE_TARGETS[number];

export type YegerQuestStageId = "first" | "second";

interface YegerQuestStage {
  id: YegerQuestStageId;
  startedKey: string;
  completedKey: string;
  target: number;
  reward: {
    maxXp: number;
    gold: number;
    itemId?: string;
  };
}

const YEGER_UNQUIET_TRIAL_FIRST_STAGE: YegerQuestStage = {
  id: "first",
  startedKey: YEGER_UNQUIET_TRIAL_STARTED_KEY,
  completedKey: YEGER_UNQUIET_TRIAL_COMPLETED_KEY,
  target: YEGER_UNQUIET_TRIAL_TARGET,
  reward: YEGER_UNQUIET_TRIAL_REWARD
};

const YEGER_UNQUIET_TRIAL_SECOND_STAGE: YegerQuestStage = {
  id: "second",
  startedKey: YEGER_UNQUIET_TRIAL_SECOND_STARTED_KEY,
  completedKey: YEGER_UNQUIET_TRIAL_SECOND_COMPLETED_KEY,
  target: YEGER_UNQUIET_TRIAL_SECOND_TARGET,
  reward: YEGER_UNQUIET_TRIAL_SECOND_REWARD
};

const YEGER_UNQUIET_TRIAL_STAGES: readonly YegerQuestStage[] = [
  YEGER_UNQUIET_TRIAL_FIRST_STAGE,
  YEGER_UNQUIET_TRIAL_SECOND_STAGE
];

export interface YegerQuestProgress {
  wins: number;
  target: number;
  stageId?: YegerQuestStageId;
}

export type YegerTrackingSummary =
  | { state: "none" }
  | { state: "tracking-pending"; availableAt: Date; now: Date }
  | { state: "tracking-ready"; availableAt: Date; now: Date };

export type YegerRangerBandageSummary =
  | { state: "available" }
  | { state: "on-cooldown"; nextAvailableAt: Date; now: Date };

interface YegerRangerBandageLookup {
  rangerBandage?: YegerRangerBandageSummary;
}

export type YegerQuestLookupResult =
  | { state: "no-character" }
  | ({ state: "level-locked"; character: CharacterSummary; requiredLevel: number } & YegerRangerBandageLookup)
  | ({ state: "offered"; character: CharacterSummary; progress: YegerQuestProgress } & YegerRangerBandageLookup)
  | ({
      state: "in-progress";
      character: CharacterSummary;
      progress: YegerQuestProgress;
      tracking: YegerTrackingSummary;
    } & YegerRangerBandageLookup)
  | ({ state: "turn-in-ready"; character: CharacterSummary; progress: YegerQuestProgress } & YegerRangerBandageLookup)
  | ({
      state: "completed";
      character: CharacterSummary;
      progress: YegerQuestProgress;
      reward: YegerQuestReward;
    } & YegerRangerBandageLookup);

export type YegerQuestStartResult =
  | { state: "no-character" }
  | { state: "level-locked"; character: CharacterSummary; requiredLevel: number }
  | Extract<YegerQuestLookupResult, { state: "in-progress" | "turn-in-ready" | "completed" }>;

export type YegerTrackingResult =
  | { state: "no-character" }
  | { state: "not-in-progress"; quest: Exclude<YegerQuestLookupResult, { state: "no-character" | "in-progress" }> }
  | {
      state: "tracking-started" | "tracking-pending";
      character: CharacterSummary;
      progress: YegerQuestProgress;
      tracking: Extract<YegerTrackingSummary, { state: "tracking-pending" }>;
    }
  | {
      state: "tracking-resolved-none";
      character: CharacterSummary;
      progress: YegerQuestProgress;
      tracking: Extract<YegerTrackingSummary, { state: "tracking-pending" }>;
      outcome: "near-miss" | "none";
    }
  | {
      state: "tracking-blocked-by-other-fight";
      character: CharacterSummary;
      progress: YegerQuestProgress;
      tracking: Extract<YegerTrackingSummary, { state: "tracking-ready" }>;
      fight: Extract<FightLookupResult, { state: "persistent-active" }>;
    }
  | {
      state: "tracking-blocked-by-monster-rest";
      character: CharacterSummary;
      progress: YegerQuestProgress;
      tracking: Extract<YegerTrackingSummary, { state: "tracking-ready" }>;
      fight: Extract<FightLookupResult, { state: "monster-rest" }>;
    }
  | {
      state: "tracking-resolved-success";
      character: CharacterSummary;
      progress: YegerQuestProgress;
      tracking: Extract<YegerTrackingSummary, { state: "tracking-pending" }>;
      fight: FightLookupResult;
    };

export type YegerQuestTurnInResult =
  | { state: "no-character" }
  | { state: "level-locked"; character: CharacterSummary; requiredLevel: number }
  | { state: "not-started"; character: CharacterSummary; progress: YegerQuestProgress }
  | { state: "not-ready"; character: CharacterSummary; progress: YegerQuestProgress }
  | {
      state: "completed" | "already-completed";
      character: CharacterSummary;
      progress: YegerQuestProgress;
      reward: YegerQuestReward;
      levelChange: RewardLevelChange | null;
      achievementUnlocks?: AchievementUnlock[];
    };

export interface YegerQuestReward {
  xp: number;
  gold: number;
  itemGrants: RewardItemGrant[];
  itemReplayUnavailable?: boolean;
}

export type YegerBandageSupplyResult =
  | { state: "no-character" }
  | { state: "locked"; character: CharacterSummary; requiredWins: number }
  | {
      state: "preview";
      character: CharacterSummary;
      token: string;
      targetQuantity: YegerBandagePurchaseTarget;
      purchaseQuantity: number;
      purchasedToday: number;
      dailyLimit: number;
      priceGold: number;
      unitPriceGold: number;
      currentGold: number;
      itemGrants: RewardItemGrant[];
      expiresAt: Date;
      now: Date;
    }
  | {
      state: "bought" | "replayed";
      character: CharacterSummary;
      spentGold: number;
      itemGrants: RewardItemGrant[];
      achievementUnlocks?: AchievementUnlock[];
    }
  | { state: "daily-limit"; character: CharacterSummary; purchasedToday: number; dailyLimit: number }
  | { state: "cancelled"; character: CharacterSummary }
  | { state: "invalid-token" }
  | { state: "stale-token"; character: CharacterSummary }
  | {
      state: "insufficient-gold";
      character: CharacterSummary;
      requiredGold: number;
      affordablePreview?: YegerBandageAffordablePreview;
    };

export interface YegerBandageAffordablePreview {
  token: string;
  purchaseQuantity: number;
  purchasedToday: number;
  dailyLimit: number;
  priceGold: number;
  unitPriceGold: number;
  currentGold: number;
  itemGrants: RewardItemGrant[];
  expiresAt: Date;
  now: Date;
}

export type YegerRangerBandageResult =
  | { state: "no-character" }
  | { state: "locked"; character: CharacterSummary; requiredWins: number }
  | { state: "class-locked"; character: CharacterSummary }
  | { state: "claimed"; character: CharacterSummary; itemGrants: RewardItemGrant[]; nextAvailableAt: Date; now: Date; achievementUnlocks?: AchievementUnlock[] }
  | { state: "on-cooldown"; character: CharacterSummary; nextAvailableAt: Date; now: Date };

export class YegerQuestService {
  constructor(
    private readonly characters: CharacterRepository,
    private readonly dailyActions: DailyActionRepository,
    private readonly combatSessions: SoloCombatSessionRepository,
    private readonly fight: FightService,
    private readonly cooldowns: CooldownRepository,
    private readonly now: () => Date = () => new Date(),
    private readonly rng: RandomSource = new CryptoRandomSource(),
    private readonly achievements?: AchievementService
  ) {}

  async getForTelegramUser(telegramUserId: bigint): Promise<YegerQuestLookupResult> {
    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character) {
      return { state: "no-character" };
    }

    const summary = summarizeCharacter(character);
    const rangerBandage = await this.getRangerBandageSummary(telegramUserId, summary);

    if (summary.level < YEGER_UNQUIET_TRIAL_MIN_LEVEL) {
      return {
        state: "level-locked",
        character: summary,
        requiredLevel: YEGER_UNQUIET_TRIAL_MIN_LEVEL,
        ...withRangerBandage(rangerBandage)
      };
    }

    const stage = await this.getCurrentStage(telegramUserId);

    if (!stage) {
      const completed = await this.dailyActions.findForTelegramUser(telegramUserId, {
        key: YEGER_UNQUIET_TRIAL_SECOND_COMPLETED_KEY,
        localDate: YEGER_UNQUIET_TRIAL_BUCKET
      });

      const replayReward = {
        ...(completed?.rewardXp === undefined ? {} : { xp: completed.rewardXp }),
        ...(completed?.rewardGold === undefined ? {} : { gold: completed.rewardGold }),
        replayUnavailable: true
      };

      return {
        state: "completed",
        character: summary,
        progress: buildYegerQuestProgress(YEGER_UNQUIET_TRIAL_SECOND_STAGE, YEGER_UNQUIET_TRIAL_SECOND_TARGET),
        reward: buildYegerQuestReward(YEGER_UNQUIET_TRIAL_SECOND_STAGE, replayReward),
        ...withRangerBandage(rangerBandage)
      };
    }

    const started = await this.dailyActions.findForTelegramUser(telegramUserId, {
      key: stage.startedKey,
      localDate: YEGER_UNQUIET_TRIAL_BUCKET
    });

    if (!started) {
      return {
        state: "offered",
        character: summary,
        progress: buildYegerQuestProgress(stage, 0),
        ...withRangerBandage(rangerBandage)
      };
    }

    const progress = await this.countProgress(telegramUserId, started.createdAt, stage);

    if (progress.wins >= stage.target) {
      return { state: "turn-in-ready", character: summary, progress, ...withRangerBandage(rangerBandage) };
    }

    return {
      state: "in-progress",
      character: summary,
      progress,
      tracking: await this.getTrackingSummary(telegramUserId),
      ...withRangerBandage(rangerBandage)
    };
  }

  async startForTelegramUser(telegramUserId: bigint): Promise<YegerQuestStartResult> {
    const current = await this.getForTelegramUser(telegramUserId);

    if (current.state !== "offered") {
      return current;
    }

    const stage = getYegerQuestStage(current.progress);
    const claim = await this.dailyActions.claimForTelegramUser(telegramUserId, {
      key: stage.startedKey,
      localDate: YEGER_UNQUIET_TRIAL_BUCKET,
      rewardXp: 0,
      rewardGold: 0
    });

    if (!claim) {
      return { state: "no-character" };
    }

    return {
      state: "in-progress",
      character: summarizeCharacter(claim.character),
      progress: buildYegerQuestProgress(stage, 0),
      tracking: { state: "none" }
    };
  }

  async trackForTelegramUser(telegramUserId: bigint): Promise<YegerTrackingResult> {
    const current = await this.getForTelegramUser(telegramUserId);

    if (current.state === "no-character") {
      return { state: "no-character" };
    }

    if (current.state !== "in-progress") {
      return { state: "not-in-progress", quest: current };
    }

    if (current.tracking.state === "tracking-pending") {
      return {
        state: "tracking-pending",
        character: current.character,
        progress: current.progress,
        tracking: current.tracking
      };
    }

    if (current.tracking.state === "tracking-ready") {
      const activeFight = await this.fight.getFightOverviewForTelegramUser(telegramUserId);

      if (activeFight.state === "persistent-active" && !isYegerUnquietTarget(activeFight.monster)) {
        return {
          state: "tracking-blocked-by-other-fight",
          character: current.character,
          progress: current.progress,
          tracking: current.tracking,
          fight: activeFight
        };
      }
    }

    const now = this.now();
    const availableAt = addMinutes(now, this.rollTrackingMinutes());
    const claim = await this.cooldowns.claimRewardForTelegramUser(telegramUserId, {
      key: YEGER_TRACKING_COOLDOWN_KEY,
      now,
      availableAt,
      rewardXp: 0,
      rewardGold: 0
    });

    if (!claim) {
      return { state: "no-character" };
    }

    if (claim.state === "insufficient-gold") {
      throw new Error("Yeger tracking claim does not spend gold.");
    }

    const tracking = {
      state: "tracking-pending" as const,
      availableAt: claim.cooldown.availableAt,
      now
    };

    if (claim.state === "on-cooldown") {
      return {
        state: "tracking-pending",
        character: summarizeCharacter(claim.character),
        progress: current.progress,
        tracking
      };
    }

    if (current.tracking.state !== "tracking-ready") {
      return {
        state: "tracking-started",
        character: summarizeCharacter(claim.character),
        progress: current.progress,
        tracking
      };
    }

    const outcome = rollYegerTrackingOutcome(summarizeCharacter(claim.character), this.rng);

    if (outcome !== "success") {
      return {
        state: "tracking-resolved-none",
        character: summarizeCharacter(claim.character),
        progress: current.progress,
        tracking,
        outcome
      };
    }

    const fight = await this.fight.getOrStartPersistentFightForTelegramUser(telegramUserId, {
      source: "yeger",
      originLocationId: PRESENCE_LOCATION_KORCHMA_RANGER_CORNER,
      target: { tagsAny: [...YEGER_UNQUIET_TRIAL_TAGS] }
    });

    return {
      state: "tracking-resolved-success",
      character: summarizeCharacter(claim.character),
      progress: current.progress,
      tracking,
      fight
    };
  }

  async turnInForTelegramUser(telegramUserId: bigint): Promise<YegerQuestTurnInResult> {
    const current = await this.getForTelegramUser(telegramUserId);

    if (current.state === "no-character" || current.state === "level-locked") {
      return current;
    }

    if (current.state === "offered") {
      const stage = getYegerQuestStage(current.progress);
      if (stage.id === "second") {
        const previousCompleted = await this.dailyActions.findForTelegramUser(telegramUserId, {
          key: YEGER_UNQUIET_TRIAL_COMPLETED_KEY,
          localDate: YEGER_UNQUIET_TRIAL_BUCKET
        });

        if (previousCompleted) {
          return {
            state: "already-completed",
            character: current.character,
            progress: buildYegerQuestProgress(YEGER_UNQUIET_TRIAL_FIRST_STAGE, YEGER_UNQUIET_TRIAL_TARGET),
            reward: buildYegerQuestReward(YEGER_UNQUIET_TRIAL_FIRST_STAGE, {
              xp: previousCompleted.rewardXp,
              gold: previousCompleted.rewardGold,
              replayUnavailable: true
            }),
            levelChange: null
          };
        }
      }

      return {
        state: "not-started",
        character: current.character,
        progress: current.progress
      };
    }

    if (current.state === "in-progress") {
      return {
        state: "not-ready",
        character: current.character,
        progress: current.progress
      };
    }

    if (current.state === "completed") {
      return {
        state: "already-completed",
        character: current.character,
        progress: current.progress,
        reward: current.reward,
        levelChange: null
      };
    }

    const stage = getYegerQuestStage(current.progress);
    const itemGrants = stage.reward.itemId
      ? [{ itemId: stage.reward.itemId, quantity: 1, maxOwnedQuantity: 1 }]
      : [];
    const claim = await this.dailyActions.claimForTelegramUser(telegramUserId, {
      key: stage.completedKey,
      localDate: YEGER_UNQUIET_TRIAL_BUCKET,
      rewardXp: getYegerUnquietTrialTurnInXp(current.character, stage.id),
      rewardGold: stage.reward.gold,
      itemGrants
    });

    if (!claim) {
      return { state: "no-character" };
    }

    if (claim.state === "insufficient-gold") {
      throw new Error("Yeger quest daily claim unexpectedly required gold.");
    }

    const rewardInput = {
      xp: claim.action.rewardXp,
      gold: claim.action.rewardGold,
      ...(claim.state === "created" ? { itemGrants: claim.itemGrants } : {}),
      replayUnavailable: claim.state === "existing"
    };
    const achievementUnlocks = claim.state === "created"
      ? await trackRewardAchievementsSafely(this.achievements, {
          characterId: claim.character.id,
          sourceId: claim.action.id,
          occurredAt: claim.action.createdAt,
          levelChange: claim.levelChange,
          itemGrants: claim.itemGrants,
          events: ["yeger.trial.completed"]
        })
      : [];

    return {
      state: claim.state === "created" ? "completed" : "already-completed",
      character: summarizeCharacter(claim.character),
      progress: current.progress,
      reward: buildYegerQuestReward(stage, rewardInput),
      levelChange: claim.levelChange,
      achievementUnlocks
    };
  }

  async previewBandagePurchaseForTelegramUser(
    telegramUserId: bigint,
    targetQuantity: YegerBandagePurchaseTarget = 1
  ): Promise<YegerBandageSupplyResult> {
    const character = await this.characters.findByTelegramUserId(telegramUserId);
    if (!character) {
      return { state: "no-character" };
    }

    const summary = summarizeCharacter(character);
    if (!await this.hasCompletedBaseQuest(telegramUserId)) {
      return { state: "locked", character: summary, requiredWins: YEGER_UNQUIET_TRIAL_TARGET };
    }

    const now = this.now();
    const purchaseDay = toIsoDate(now);
    const purchasedToday = await this.countPaidBandagesPurchasedToday(telegramUserId, purchaseDay);
    const requestedQuantity = normalizeBandagePurchaseTarget(targetQuantity);
    if (purchasedToday >= YEGER_BANDAGE_PURCHASE_DAILY_LIMIT) {
      return {
        state: "daily-limit",
        character: summary,
        purchasedToday,
        dailyLimit: YEGER_BANDAGE_PURCHASE_DAILY_LIMIT
      };
    }

    const unitPrice = getYegerBandagePrice(summary);
    const purchaseQuantity = Math.min(
      requestedQuantity,
      YEGER_BANDAGE_PURCHASE_DAILY_LIMIT - purchasedToday
    );
    const preview = await this.createBandagePurchasePreview(telegramUserId, {
      summary,
      purchaseQuantity,
      purchasedToday,
      purchaseDay,
      unitPrice,
      now
    });

    if (!preview) {
      return { state: "no-character" };
    }

    return {
      state: "preview",
      character: preview.character,
      token: preview.token,
      targetQuantity: YEGER_BANDAGE_PURCHASE_DAILY_LIMIT,
      purchaseQuantity: preview.purchaseQuantity,
      purchasedToday: preview.purchasedToday,
      dailyLimit: YEGER_BANDAGE_PURCHASE_DAILY_LIMIT,
      priceGold: preview.priceGold,
      unitPriceGold: preview.unitPriceGold,
      currentGold: preview.currentGold,
      itemGrants: preview.itemGrants,
      expiresAt: preview.expiresAt,
      now: preview.now
    };
  }

  async confirmBandagePurchaseForTelegramUser(
    telegramUserId: bigint,
    token: string
  ): Promise<YegerBandageSupplyResult> {
    if (!isPurchaseToken(token)) {
      return { state: "invalid-token" };
    }

    const character = await this.characters.findByTelegramUserId(telegramUserId);
    if (!character) {
      return { state: "no-character" };
    }

    const summary = summarizeCharacter(character);
    if (!await this.hasCompletedBaseQuest(telegramUserId)) {
      return { state: "locked", character: summary, requiredWins: YEGER_UNQUIET_TRIAL_TARGET };
    }

    const decision = await this.dailyActions.findForTelegramUser(telegramUserId, {
      key: YEGER_BANDAGE_PURCHASE_CONFIRM_KEY,
      localDate: token
    });
    if (decision) {
      return mapPurchaseDecision(summary, decision, "replayed");
    }

    const legacyCancelled = await this.dailyActions.findForTelegramUser(telegramUserId, {
      key: YEGER_BANDAGE_PURCHASE_CANCEL_KEY,
      localDate: token
    });
    if (legacyCancelled) {
      return { state: "cancelled", character: summary };
    }

    const preview = await this.dailyActions.findForTelegramUser(telegramUserId, {
      key: YEGER_BANDAGE_PURCHASE_PREVIEW_KEY,
      localDate: token
    });
    if (!preview) {
      return { state: "invalid-token" };
    }

    const snapshot = parsePurchasePreview(preview.resultJson);
    const unitPrice = getYegerBandagePrice(summary);
    const now = this.now();
    const purchaseDay = toIsoDate(now);
    const purchasedToday = await this.countPaidBandagesPurchasedToday(telegramUserId, purchaseDay);
    if (
      !snapshot ||
      snapshot.expiresAt <= now ||
      snapshot.itemId !== BANDAGE_ITEM_ID ||
      snapshot.classId !== summary.classId ||
      snapshot.unitPrice !== unitPrice ||
      snapshot.price !== unitPrice * snapshot.purchaseQuantity ||
      snapshot.remortCount !== (summary.remortCount ?? 0) ||
      snapshot.purchaseDay !== purchaseDay ||
      purchasedToday !== snapshot.purchasedToday ||
      purchasedToday >= YEGER_BANDAGE_PURCHASE_DAILY_LIMIT
    ) {
      return await this.replayBandagePurchaseDecision(telegramUserId, token, summary) ??
        { state: "stale-token", character: summary };
    }

    if (
      snapshot.purchaseQuantity > YEGER_BANDAGE_PURCHASE_DAILY_LIMIT - purchasedToday ||
      snapshot.purchaseQuantity <= 0
    ) {
      return await this.replayBandagePurchaseDecision(telegramUserId, token, summary) ??
        { state: "stale-token", character: summary };
    }

    const claim = await this.claimBandagePurchase(telegramUserId, {
      token,
      summary,
      snapshot,
      purchaseDay,
      unitPrice
    });
    if (claim === "quantity-limit") {
      return await this.replayBandagePurchaseDecision(telegramUserId, token, summary) ??
        { state: "stale-token", character: summary };
    }

    if (!claim) {
      return { state: "no-character" };
    }

    if (claim.state === "insufficient-gold") {
      const remainingDailyLimit = YEGER_BANDAGE_PURCHASE_DAILY_LIMIT - purchasedToday;
      const affordableQuantity = Math.min(
        remainingDailyLimit,
        Math.floor(summary.gold / unitPrice)
      );
      const affordablePreview = affordableQuantity > 0
        ? await this.createBandagePurchasePreview(telegramUserId, {
            summary,
            purchaseQuantity: affordableQuantity,
            purchasedToday,
            purchaseDay,
            unitPrice,
            now
          })
        : null;

      return {
        state: "insufficient-gold",
        character: summarizeCharacter(claim.character),
        requiredGold: claim.requiredGold,
        ...(affordablePreview ? { affordablePreview } : {})
      };
    }

    const result = mapPurchaseDecision(
      summarizeCharacter(claim.character),
      claim.action,
      claim.state === "created" ? "bought" : "replayed",
      claim.state === "created" ? claim.itemGrants : undefined
    );
    const achievementUnlocks = result.state === "bought" && claim.state === "created"
      ? await trackRewardAchievementsSafely(this.achievements, {
          characterId: claim.character.id,
          sourceId: claim.action.id,
          occurredAt: claim.action.createdAt,
          itemGrants: claim.itemGrants
        })
      : [];

    return result.state === "bought" ? { ...result, achievementUnlocks } : result;
  }

  async cancelBandagePurchaseForTelegramUser(
    telegramUserId: bigint,
    token: string
  ): Promise<YegerBandageSupplyResult> {
    if (!isPurchaseToken(token)) {
      return { state: "invalid-token" };
    }

    const character = await this.characters.findByTelegramUserId(telegramUserId);
    if (!character) {
      return { state: "no-character" };
    }

    const summary = summarizeCharacter(character);
    if (!await this.hasCompletedBaseQuest(telegramUserId)) {
      return { state: "locked", character: summary, requiredWins: YEGER_UNQUIET_TRIAL_TARGET };
    }

    const completed = await this.dailyActions.findForTelegramUser(telegramUserId, {
      key: YEGER_BANDAGE_PURCHASE_CONFIRM_KEY,
      localDate: token
    });
    if (completed) {
      return mapPurchaseDecision(summary, completed, "replayed");
    }

    const preview = await this.dailyActions.findForTelegramUser(telegramUserId, {
      key: YEGER_BANDAGE_PURCHASE_PREVIEW_KEY,
      localDate: token
    });
    if (!preview) {
      return { state: "invalid-token" };
    }

    const cancel = await this.dailyActions.claimForTelegramUser(telegramUserId, {
      key: YEGER_BANDAGE_PURCHASE_CONFIRM_KEY,
      localDate: token,
      rewardXp: 0,
      rewardGold: 0,
      expectedLife: {
        remortCount: summary.remortCount ?? 0
      },
      resultJson: {
        kind: "yeger-bandage-purchase-cancel",
        rulesVersion: "yeger-bandage-purchase-v1",
        token
      }
    });

    if (!cancel) {
      return { state: "no-character" };
    }

    if (cancel.state === "insufficient-gold") {
      throw new Error("Yeger bandage cancel unexpectedly required gold.");
    }

    return mapPurchaseDecision(summarizeCharacter(cancel.character), cancel.action, "replayed");
  }

  async buyBandageForTelegramUser(telegramUserId: bigint): Promise<YegerBandageSupplyResult> {
    const preview = await this.previewBandagePurchaseForTelegramUser(telegramUserId, 1);

    return preview.state === "preview"
      ? this.confirmBandagePurchaseForTelegramUser(telegramUserId, preview.token)
      : preview;
  }

  async claimRangerBandageForTelegramUser(telegramUserId: bigint): Promise<YegerRangerBandageResult> {
    const character = await this.characters.findByTelegramUserId(telegramUserId);
    if (!character) {
      return { state: "no-character" };
    }

    const summary = summarizeCharacter(character);
    if (!await this.hasCompletedBaseQuest(telegramUserId)) {
      return { state: "locked", character: summary, requiredWins: YEGER_UNQUIET_TRIAL_TARGET };
    }

    if (summary.classId !== "class.ranger") {
      return { state: "class-locked", character: summary };
    }

    const now = this.now();
    const nextAvailableAt = addMinutes(now, YEGER_RANGER_FREE_BANDAGE_MINUTES);
    const claim = await this.cooldowns.claimRewardForTelegramUser(telegramUserId, {
      key: YEGER_RANGER_FREE_BANDAGE_KEY,
      now,
      availableAt: nextAvailableAt,
      rewardXp: 0,
      rewardGold: 0,
      itemGrants: [{ itemId: BANDAGE_ITEM_ID, quantity: 1 }],
      expectedLife: {
        remortCount: summary.remortCount ?? 0
      },
      resultJson: {
        kind: "yeger-ranger-free-bandage",
        minutes: YEGER_RANGER_FREE_BANDAGE_MINUTES
      }
    });

    if (!claim) {
      return { state: "no-character" };
    }

    if (claim.state === "on-cooldown") {
      return {
        state: "on-cooldown",
        character: summarizeCharacter(claim.character),
        nextAvailableAt: claim.cooldown.availableAt,
        now
      };
    }

    if (claim.state === "insufficient-gold") {
      throw new Error("Free Yeger bandage unexpectedly required gold.");
    }

    const achievementUnlocks = await trackRewardAchievementsSafely(this.achievements, {
      characterId: claim.character.id,
      sourceId: claim.cooldown.id,
      occurredAt: claim.cooldown.updatedAt,
      itemGrants: claim.itemGrants,
      events: ["yeger.free-bandage.claimed"]
    });

    return {
      state: "claimed",
      character: summarizeCharacter(claim.character),
      itemGrants: enrichRewardItemGrants(claim.itemGrants),
      nextAvailableAt: claim.cooldown.availableAt,
      now,
      achievementUnlocks
    };
  }

  private async getCurrentStage(telegramUserId: bigint): Promise<YegerQuestStage | null> {
    for (const stage of YEGER_UNQUIET_TRIAL_STAGES) {
      const completed = await this.dailyActions.findForTelegramUser(telegramUserId, {
        key: stage.completedKey,
        localDate: YEGER_UNQUIET_TRIAL_BUCKET
      });

      if (!completed) {
        return stage;
      }
    }

    return null;
  }

  private async hasCompletedBaseQuest(telegramUserId: bigint): Promise<boolean> {
    return Boolean(await this.dailyActions.findForTelegramUser(telegramUserId, {
      key: YEGER_UNQUIET_TRIAL_COMPLETED_KEY,
      localDate: YEGER_UNQUIET_TRIAL_BUCKET
    }));
  }

  private async getRangerBandageSummary(
    telegramUserId: bigint,
    character: CharacterSummary
  ): Promise<YegerRangerBandageSummary | undefined> {
    if (character.classId !== "class.ranger") {
      return undefined;
    }

    const now = this.now();
    const lookup = await this.cooldowns.findForTelegramUser(telegramUserId, YEGER_RANGER_FREE_BANDAGE_KEY);
    const cooldown = lookup?.cooldown;

    if (cooldown && cooldown.availableAt > now) {
      return {
        state: "on-cooldown",
        nextAvailableAt: cooldown.availableAt,
        now
      };
    }

    return { state: "available" };
  }

  private async countProgress(
    telegramUserId: bigint,
    startedAt: Date,
    stage: YegerQuestStage
  ): Promise<YegerQuestProgress> {
    const sessions = await this.combatSessions.listCompletedByTelegramUserIdSince(telegramUserId, startedAt);
    const wins = sessions.filter((session) => {
      const monster = monsters.find((candidate) => candidate.id === session.monsterId);

      return session.status === "won" && !!monster && isYegerUnquietTarget(monster);
    }).length;

    return buildYegerQuestProgress(stage, Math.min(wins, stage.target));
  }

  private async getTrackingSummary(telegramUserId: bigint): Promise<YegerTrackingSummary> {
    const result = await this.cooldowns.findForTelegramUser(telegramUserId, YEGER_TRACKING_COOLDOWN_KEY);
    const now = this.now();

    if (!result?.cooldown) {
      return { state: "none" };
    }

    if (result.cooldown.availableAt > now) {
      return {
        state: "tracking-pending",
        availableAt: result.cooldown.availableAt,
        now
      };
    }

    return {
      state: "tracking-ready",
      availableAt: result.cooldown.availableAt,
      now
    };
  }

  private rollTrackingMinutes(): number {
    return this.rng.nextInt(YEGER_TRACKING_MIN_MINUTES, YEGER_TRACKING_MAX_MINUTES);
  }

  private async replayBandagePurchaseDecision(
    telegramUserId: bigint,
    token: string,
    character: CharacterSummary
  ): Promise<Extract<YegerBandageSupplyResult, { state: "bought" | "replayed" | "cancelled" | "stale-token" }> | null> {
    const decision = await this.dailyActions.findForTelegramUser(telegramUserId, {
      key: YEGER_BANDAGE_PURCHASE_CONFIRM_KEY,
      localDate: token
    });

    return decision ? mapPurchaseDecision(character, decision, "replayed") : null;
  }

  private async createBandagePurchasePreview(
    telegramUserId: bigint,
    input: {
      summary: CharacterSummary;
      purchaseQuantity: number;
      purchasedToday: number;
      purchaseDay: string;
      unitPrice: number;
      now: Date;
    }
  ): Promise<(YegerBandageAffordablePreview & { character: CharacterSummary }) | null> {
    const token = randomUUID();
    const expiresAt = addMinutes(input.now, YEGER_BANDAGE_PURCHASE_TTL_MINUTES);
    const price = input.unitPrice * input.purchaseQuantity;
    const preview = await this.dailyActions.claimForTelegramUser(telegramUserId, {
      key: YEGER_BANDAGE_PURCHASE_PREVIEW_KEY,
      localDate: token,
      rewardXp: 0,
      rewardGold: 0,
      expectedLife: {
        remortCount: input.summary.remortCount ?? 0
      },
      resultJson: {
        kind: "yeger-bandage-purchase-preview",
        rulesVersion: "yeger-bandage-purchase-v1",
        token,
        targetQuantity: YEGER_BANDAGE_PURCHASE_DAILY_LIMIT,
        purchaseQuantity: input.purchaseQuantity,
        purchasedToday: input.purchasedToday,
        dailyLimit: YEGER_BANDAGE_PURCHASE_DAILY_LIMIT,
        purchaseDay: input.purchaseDay,
        unitPrice: input.unitPrice,
        price,
        classId: input.summary.classId,
        itemId: BANDAGE_ITEM_ID,
        remortCount: input.summary.remortCount ?? 0,
        expiresAt: expiresAt.toISOString()
      }
    });

    if (!preview) {
      return null;
    }

    return {
      character: summarizeCharacter(preview.character),
      token,
      purchaseQuantity: input.purchaseQuantity,
      purchasedToday: input.purchasedToday,
      dailyLimit: YEGER_BANDAGE_PURCHASE_DAILY_LIMIT,
      priceGold: price,
      unitPriceGold: input.unitPrice,
      currentGold: input.summary.gold,
      itemGrants: enrichRewardItemGrants([{ itemId: BANDAGE_ITEM_ID, quantity: input.purchaseQuantity }]),
      expiresAt,
      now: input.now
    };
  }

  private async claimBandagePurchase(
    telegramUserId: bigint,
    input: {
      token: string;
      summary: CharacterSummary;
      snapshot: PurchasePreviewSnapshot;
      purchaseDay: string;
      unitPrice: number;
    }
  ): Promise<ClaimDailyActionResult | "quantity-limit" | null> {
    try {
      return await this.dailyActions.claimForTelegramUser(telegramUserId, {
        key: YEGER_BANDAGE_PURCHASE_CONFIRM_KEY,
        localDate: input.token,
        rewardXp: 0,
        rewardGold: 0,
        spentGold: input.snapshot.price,
        itemGrants: [{ itemId: BANDAGE_ITEM_ID, quantity: input.snapshot.purchaseQuantity }],
        expectedLife: {
          remortCount: input.summary.remortCount ?? 0
        },
        quantityLimit: {
          key: YEGER_BANDAGE_PURCHASE_CONFIRM_KEY,
          purchaseDay: input.purchaseDay,
          itemId: BANDAGE_ITEM_ID,
          resultKind: "yeger-bandage-purchase-confirm",
          quantity: input.snapshot.purchaseQuantity,
          maxQuantity: YEGER_BANDAGE_PURCHASE_DAILY_LIMIT
        },
        resultJson: {
          kind: "yeger-bandage-purchase-confirm",
          rulesVersion: "yeger-bandage-purchase-v1",
          token: input.token,
          targetQuantity: input.snapshot.targetQuantity,
          purchaseQuantity: input.snapshot.purchaseQuantity,
          purchasedToday: input.snapshot.purchasedToday,
          dailyLimit: YEGER_BANDAGE_PURCHASE_DAILY_LIMIT,
          purchaseDay: input.purchaseDay,
          unitPrice: input.unitPrice,
          price: input.snapshot.price,
          classId: input.summary.classId,
          itemId: BANDAGE_ITEM_ID
        }
      });
    } catch (error) {
      if (error instanceof DailyActionQuantityLimitExceededError) {
        return "quantity-limit";
      }

      throw error;
    }
  }

  private async countPaidBandagesPurchasedToday(telegramUserId: bigint, purchaseDay: string): Promise<number> {
    const actions = await this.dailyActions.listForTelegramUser?.(telegramUserId, {
      key: YEGER_BANDAGE_PURCHASE_CONFIRM_KEY
    });

    if (!actions) {
      return 0;
    }

    return Math.min(
      YEGER_BANDAGE_PURCHASE_DAILY_LIMIT,
      actions.reduce((sum, action) => sum + readPurchasedBandageQuantityForDay(action, purchaseDay), 0)
    );
  }
}

export function isYegerUnquietTarget(monster: Pick<MonsterContent, "tags">): boolean {
  return monster.tags.some((tag) => YEGER_UNQUIET_TRIAL_TAGS.includes(tag as typeof YEGER_UNQUIET_TRIAL_TAGS[number]));
}

export function getYegerTrackingExactChance(character: CharacterSummary): number {
  const classBonus = character.classId === "class.ranger" ? YEGER_TRACKING_RANGER_BONUS : 0;
  const statBonus = Math.min(
    YEGER_TRACKING_STAT_BONUS_CAP,
    Math.max(0, character.stats.intelligence - 6) * 0.01 + Math.max(0, character.stats.luck - 6) * 0.01
  );

  return Math.min(0.95, YEGER_TRACKING_BASE_EXACT_CHANCE + classBonus + statBonus);
}

export function getYegerBandagePrice(character: Pick<CharacterSummary, "classId">): number {
  return character.classId === "class.ranger" ? YEGER_RANGER_BANDAGE_PRICE : YEGER_BANDAGE_PRICE;
}

export function rollYegerTrackingOutcome(
  character: CharacterSummary,
  rng: RandomSource
): "success" | "near-miss" | "none" {
  if (rng.nextFloat() < getYegerTrackingExactChance(character)) {
    return "success";
  }

  return rng.nextFloat() < YEGER_TRACKING_NEAR_MISS_CHANCE ? "near-miss" : "none";
}

export function getYegerUnquietTrialTurnInXp(
  character: Pick<CharacterSummary, "level">,
  stageId: YegerQuestStageId = "first"
): number {
  const stage = stageId === "second" ? YEGER_UNQUIET_TRIAL_SECOND_STAGE : YEGER_UNQUIET_TRIAL_FIRST_STAGE;

  return Math.min(stage.reward.maxXp, Math.max(1, Math.floor(character.level * 7)));
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function isPurchaseToken(token: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token);
}

interface PurchasePreviewSnapshot {
  itemId: string;
  classId: string;
  targetQuantity: YegerBandagePurchaseTarget;
  purchaseQuantity: number;
  purchasedToday: number;
  dailyLimit: number;
  purchaseDay: string;
  unitPrice: number;
  price: number;
  remortCount: number;
  expiresAt: Date;
}

function parsePurchasePreview(value: unknown): PurchasePreviewSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const expiresAt = typeof record.expiresAt === "string" ? new Date(record.expiresAt) : null;
  if (!expiresAt || !Number.isFinite(expiresAt.getTime())) {
    return null;
  }

  const targetQuantity = normalizeBandagePurchaseTarget(record.targetQuantity);
  const purchaseQuantity = normalizePositiveInteger(record.purchaseQuantity);
  const purchasedToday = normalizeNonNegativeInteger(record.purchasedToday);
  const dailyLimit = normalizePositiveInteger(record.dailyLimit) ?? YEGER_BANDAGE_PURCHASE_DAILY_LIMIT;
  const purchaseDay = typeof record.purchaseDay === "string" ? record.purchaseDay : null;
  const unitPrice = normalizePositiveInteger(record.unitPrice);

  return typeof record.itemId === "string" &&
    typeof record.classId === "string" &&
    typeof record.price === "number" &&
    typeof record.remortCount === "number" &&
    purchaseQuantity !== null &&
    purchasedToday !== null &&
    purchaseDay !== null &&
    unitPrice !== null
    ? {
        itemId: record.itemId,
        classId: record.classId,
        targetQuantity,
        purchaseQuantity,
        purchasedToday,
        dailyLimit,
        purchaseDay,
        unitPrice,
        price: Math.max(0, Math.floor(record.price)),
        remortCount: Math.max(0, Math.floor(record.remortCount)),
        expiresAt
      }
    : null;
}

function getPurchaseDecisionKind(value: unknown): "confirm" | "cancel" | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const kind = (value as { kind?: unknown }).kind;
  if (kind === "yeger-bandage-purchase-confirm") {
    return "confirm";
  }

  if (kind === "yeger-bandage-purchase-cancel") {
    return "cancel";
  }

  return null;
}

function readPurchasedBandageQuantityForDay(action: DailyActionRecord, purchaseDay: string): number {
  if (getPurchaseDecisionKind(action.resultJson) !== "confirm") {
    return 0;
  }

  const receiptDay = readPurchaseReceiptDay(action.resultJson) ?? toIsoDate(action.createdAt);
  if (receiptDay !== purchaseDay) {
    return 0;
  }

  const receipt = readPurchaseReceipt(action);
  if (!receipt) {
    return 0;
  }

  return receipt.itemGrants
    .filter((grant) => grant.itemId === BANDAGE_ITEM_ID)
    .reduce((sum, grant) => sum + grant.quantity, 0);
}

function mapPurchaseDecision(
  character: CharacterSummary,
  action: DailyActionRecord,
  successState: "bought" | "replayed",
  createdItemGrants?: Array<{ itemId: string; quantity: number }>
): Extract<YegerBandageSupplyResult, { state: "bought" | "replayed" | "cancelled" | "stale-token" }> {
  const kind = getPurchaseDecisionKind(action.resultJson);

  if (kind === "cancel") {
    return { state: "cancelled", character };
  }

  if (kind !== "confirm") {
    return { state: "stale-token", character };
  }

  const receipt = createdItemGrants
    ? {
        spentGold: action.spentGold,
        itemGrants: createdItemGrants
      }
    : readPurchaseReceipt(action);

  if (!receipt || receipt.itemGrants.length <= 0) {
    return { state: "stale-token", character };
  }

  return {
    state: successState,
    character,
    spentGold: receipt.spentGold,
    itemGrants: enrichRewardItemGrants(receipt.itemGrants)
  };
}

function readPurchaseReceipt(
  action: DailyActionRecord
): { spentGold: number; itemGrants: Array<{ itemId: string; quantity: number }> } | null {
  if (getPurchaseDecisionKind(action.resultJson) !== "confirm") {
    return null;
  }

  const itemGrants = readStrictAppliedItemGrants(action.resultJson);
  if (itemGrants.length > 0) {
    return {
      spentGold: action.spentGold,
      itemGrants
    };
  }

  return isKnownLegacySingleBandageReceipt(action)
    ? {
        spentGold: action.spentGold,
        itemGrants: [{ itemId: BANDAGE_ITEM_ID, quantity: 1 }]
      }
    : null;
}

function readStrictAppliedItemGrants(value: unknown): Array<{ itemId: string; quantity: number }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  const reward = (value as { reward?: unknown }).reward;
  if (!reward || typeof reward !== "object" || Array.isArray(reward)) {
    return [];
  }

  const applied = (reward as { appliedItemGrants?: unknown }).appliedItemGrants;
  if (!Array.isArray(applied)) {
    return [];
  }

  return applied.flatMap((grant) => {
    if (!grant || typeof grant !== "object" || Array.isArray(grant)) {
      return [];
    }

    const itemId = (grant as { itemId?: unknown }).itemId;
    const quantity = (grant as { quantity?: unknown }).quantity;

    return typeof itemId === "string" && typeof quantity === "number" && Number.isFinite(quantity) && quantity > 0
      ? [{ itemId, quantity: Math.floor(quantity) }]
      : [];
  });
}

function isKnownLegacySingleBandageReceipt(action: DailyActionRecord): boolean {
  const value = action.resultJson;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  const price = normalizePositiveInteger(record.price);
  const purchaseQuantity = record.purchaseQuantity === undefined
    ? 1
    : normalizePositiveInteger(record.purchaseQuantity);

  return record.kind === "yeger-bandage-purchase-confirm" &&
    record.itemId === BANDAGE_ITEM_ID &&
    purchaseQuantity === 1 &&
    price !== null &&
    action.spentGold === price;
}

function readPurchaseReceiptDay(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const purchaseDay = (value as { purchaseDay?: unknown }).purchaseDay;

  return typeof purchaseDay === "string" ? purchaseDay : null;
}

function normalizeBandagePurchaseTarget(value: unknown): YegerBandagePurchaseTarget {
  return YEGER_BANDAGE_PURCHASE_TARGETS.includes(value as YegerBandagePurchaseTarget)
    ? value as YegerBandagePurchaseTarget
    : 1;
}

function withRangerBandage(summary: YegerRangerBandageSummary | undefined): YegerRangerBandageLookup {
  return summary ? { rangerBandage: summary } : {};
}

function normalizePositiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : null;
}

function normalizeNonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null;
}

function getYegerQuestStage(progress: YegerQuestProgress): YegerQuestStage {
  return progress.stageId === "second" ? YEGER_UNQUIET_TRIAL_SECOND_STAGE : YEGER_UNQUIET_TRIAL_FIRST_STAGE;
}

function buildYegerQuestProgress(stage: YegerQuestStage, wins: number): YegerQuestProgress {
  return {
    wins,
    target: stage.target,
    stageId: stage.id
  };
}

function buildYegerQuestReward(stage: YegerQuestStage, input?: {
  xp?: number;
  gold?: number;
  itemGrants?: Array<{ itemId: string; quantity: number }>;
  replayUnavailable?: boolean;
}): YegerQuestReward {
  const defaultItemGrants = stage.reward.itemId
    ? [{ itemId: stage.reward.itemId, quantity: 1 }]
    : [];

  return {
    xp: input?.xp ?? stage.reward.maxXp,
    gold: input?.gold ?? stage.reward.gold,
    itemGrants: enrichRewardItemGrants(input?.itemGrants ?? defaultItemGrants),
    ...(input?.replayUnavailable ? { itemReplayUnavailable: true } : {})
  };
}
