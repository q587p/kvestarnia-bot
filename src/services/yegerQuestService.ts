import { monsters } from "../content/monsters";
import type { MonsterContent } from "../content/schema";
import type { CharacterRepository } from "../db/repositories/characterRepository";
import type { CooldownRepository } from "../db/repositories/cooldownRepository";
import type { DailyActionRepository, RewardLevelChange } from "../db/repositories/dailyActionRepository";
import type { SoloCombatSessionRepository } from "../db/repositories/soloCombatSessionRepository";
import { summarizeCharacter, type CharacterSummary } from "../domain/characters/characterSummary";
import { CryptoRandomSource, type RandomSource } from "../shared/random";
import type { FightLookupResult, FightService } from "./fightService";
import {
  YEGER_UNQUIET_TRIAL_COMPLETED_KEY,
  YEGER_UNQUIET_TRIAL_STARTED_KEY
} from "./dailyActionKeys";
import {
  enrichRewardItemGrants,
  YEGER_FIRST_NOTCH_ITEM_ID,
  type RewardItemGrant
} from "./itemGrant";

export { YEGER_UNQUIET_TRIAL_COMPLETED_KEY, YEGER_UNQUIET_TRIAL_STARTED_KEY } from "./dailyActionKeys";

export const YEGER_UNQUIET_TRIAL_MIN_LEVEL = 4;
export const YEGER_UNQUIET_TRIAL_TARGET = 5;
export const YEGER_UNQUIET_TRIAL_BUCKET = "once";
export const YEGER_UNQUIET_TRIAL_TAGS = ["undead", "ghost", "cursed", "unquiet"] as const;
export const YEGER_UNQUIET_TRIAL_REWARD = {
  maxXp: 80,
  gold: 120,
  itemId: YEGER_FIRST_NOTCH_ITEM_ID
};
export const YEGER_TRACKING_COOLDOWN_KEY = "quest.yeger.unquiet-trial.tracking";
export const YEGER_TRACKING_MIN_MINUTES = 3;
export const YEGER_TRACKING_MAX_MINUTES = 7;
export const YEGER_TRACKING_BASE_EXACT_CHANCE = 0.65;
export const YEGER_TRACKING_RANGER_BONUS = 0.15;
export const YEGER_TRACKING_STAT_BONUS_CAP = 0.1;
export const YEGER_TRACKING_NEAR_MISS_CHANCE = 0.2;

export interface YegerQuestProgress {
  wins: number;
  target: number;
}

export type YegerTrackingSummary =
  | { state: "none" }
  | { state: "tracking-pending"; availableAt: Date; now: Date }
  | { state: "tracking-ready"; availableAt: Date; now: Date };

export type YegerQuestLookupResult =
  | { state: "no-character" }
  | { state: "level-locked"; character: CharacterSummary; requiredLevel: number }
  | { state: "offered"; character: CharacterSummary; progress: YegerQuestProgress }
  | {
      state: "in-progress";
      character: CharacterSummary;
      progress: YegerQuestProgress;
      tracking: YegerTrackingSummary;
    }
  | { state: "turn-in-ready"; character: CharacterSummary; progress: YegerQuestProgress }
  | {
      state: "completed";
      character: CharacterSummary;
      progress: YegerQuestProgress;
      reward: YegerQuestReward;
    };

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
    };

export interface YegerQuestReward {
  xp: number;
  gold: number;
  itemGrants: RewardItemGrant[];
  itemReplayUnavailable?: boolean;
}

export class YegerQuestService {
  constructor(
    private readonly characters: CharacterRepository,
    private readonly dailyActions: DailyActionRepository,
    private readonly combatSessions: SoloCombatSessionRepository,
    private readonly fight: FightService,
    private readonly cooldowns: CooldownRepository,
    private readonly now: () => Date = () => new Date(),
    private readonly rng: RandomSource = new CryptoRandomSource()
  ) {}

  async getForTelegramUser(telegramUserId: bigint): Promise<YegerQuestLookupResult> {
    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character) {
      return { state: "no-character" };
    }

    const summary = summarizeCharacter(character);

    if (summary.level < YEGER_UNQUIET_TRIAL_MIN_LEVEL) {
      return {
        state: "level-locked",
        character: summary,
        requiredLevel: YEGER_UNQUIET_TRIAL_MIN_LEVEL
      };
    }

    const completed = await this.dailyActions.findForTelegramUser(telegramUserId, {
      key: YEGER_UNQUIET_TRIAL_COMPLETED_KEY,
      localDate: YEGER_UNQUIET_TRIAL_BUCKET
    });

    if (completed) {
      return {
        state: "completed",
        character: summary,
        progress: { wins: YEGER_UNQUIET_TRIAL_TARGET, target: YEGER_UNQUIET_TRIAL_TARGET },
        reward: buildYegerQuestReward({
          xp: completed.rewardXp,
          gold: completed.rewardGold,
          replayUnavailable: true
        })
      };
    }

    const started = await this.dailyActions.findForTelegramUser(telegramUserId, {
      key: YEGER_UNQUIET_TRIAL_STARTED_KEY,
      localDate: YEGER_UNQUIET_TRIAL_BUCKET
    });

    if (!started) {
      return {
        state: "offered",
        character: summary,
        progress: { wins: 0, target: YEGER_UNQUIET_TRIAL_TARGET }
      };
    }

    const progress = await this.countProgress(telegramUserId, started.createdAt);

    if (progress.wins >= YEGER_UNQUIET_TRIAL_TARGET) {
      return { state: "turn-in-ready", character: summary, progress };
    }

    return {
      state: "in-progress",
      character: summary,
      progress,
      tracking: await this.getTrackingSummary(telegramUserId)
    };
  }

  async startForTelegramUser(telegramUserId: bigint): Promise<YegerQuestStartResult> {
    const current = await this.getForTelegramUser(telegramUserId);

    if (current.state !== "offered") {
      return current;
    }

    const claim = await this.dailyActions.claimForTelegramUser(telegramUserId, {
      key: YEGER_UNQUIET_TRIAL_STARTED_KEY,
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
      progress: { wins: 0, target: YEGER_UNQUIET_TRIAL_TARGET },
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

      if (activeFight.state === "monster-rest") {
        return {
          state: "tracking-blocked-by-monster-rest",
          character: current.character,
          progress: current.progress,
          tracking: current.tracking,
          fight: activeFight
        };
      }

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

    const claim = await this.dailyActions.claimForTelegramUser(telegramUserId, {
      key: YEGER_UNQUIET_TRIAL_COMPLETED_KEY,
      localDate: YEGER_UNQUIET_TRIAL_BUCKET,
      rewardXp: getYegerUnquietTrialTurnInXp(current.character),
      rewardGold: YEGER_UNQUIET_TRIAL_REWARD.gold,
      itemGrants: [{ itemId: YEGER_UNQUIET_TRIAL_REWARD.itemId, quantity: 1, maxOwnedQuantity: 1 }]
    });

    if (!claim) {
      return { state: "no-character" };
    }

    return {
      state: claim.state === "created" ? "completed" : "already-completed",
      character: summarizeCharacter(claim.character),
      progress: current.progress,
      reward: buildYegerQuestReward({
        xp: claim.action.rewardXp,
        gold: claim.action.rewardGold,
        itemGrants: claim.state === "created" ? claim.itemGrants : [],
        replayUnavailable: claim.state === "existing"
      }),
      levelChange: claim.levelChange
    };
  }

  private async countProgress(
    telegramUserId: bigint,
    startedAt: Date
  ): Promise<YegerQuestProgress> {
    const sessions = await this.combatSessions.listCompletedByTelegramUserIdSince(telegramUserId, startedAt);
    const wins = sessions.filter((session) => {
      const monster = monsters.find((candidate) => candidate.id === session.monsterId);

      return session.status === "won" && !!monster && isYegerUnquietTarget(monster);
    }).length;

    return {
      wins: Math.min(wins, YEGER_UNQUIET_TRIAL_TARGET),
      target: YEGER_UNQUIET_TRIAL_TARGET
    };
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

export function rollYegerTrackingOutcome(
  character: CharacterSummary,
  rng: RandomSource
): "success" | "near-miss" | "none" {
  if (rng.nextFloat() < getYegerTrackingExactChance(character)) {
    return "success";
  }

  return rng.nextFloat() < YEGER_TRACKING_NEAR_MISS_CHANCE ? "near-miss" : "none";
}

export function getYegerUnquietTrialTurnInXp(character: Pick<CharacterSummary, "level">): number {
  return Math.min(YEGER_UNQUIET_TRIAL_REWARD.maxXp, Math.max(1, Math.floor(character.level * 7)));
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function buildYegerQuestReward(input?: {
  xp?: number;
  gold?: number;
  itemGrants?: Array<{ itemId: string; quantity: number }>;
  replayUnavailable?: boolean;
}): YegerQuestReward {
  return {
    xp: input?.xp ?? YEGER_UNQUIET_TRIAL_REWARD.maxXp,
    gold: input?.gold ?? YEGER_UNQUIET_TRIAL_REWARD.gold,
    itemGrants:
      input?.itemGrants && input.itemGrants.length > 0
        ? enrichRewardItemGrants(input.itemGrants)
        : enrichRewardItemGrants([{ itemId: YEGER_UNQUIET_TRIAL_REWARD.itemId, quantity: 1 }]),
    ...(input?.replayUnavailable ? { itemReplayUnavailable: true } : {})
  };
}
