import { monsters } from "../content/monsters";
import type { MonsterContent } from "../content/schema";
import type { CharacterRepository } from "../db/repositories/characterRepository";
import type { DailyActionRepository, RewardLevelChange } from "../db/repositories/dailyActionRepository";
import type { SoloCombatSessionRepository } from "../db/repositories/soloCombatSessionRepository";
import { summarizeCharacter, type CharacterSummary } from "../domain/characters/characterSummary";
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
  xp: 80,
  gold: 120,
  itemId: YEGER_FIRST_NOTCH_ITEM_ID
};

export interface YegerQuestProgress {
  wins: number;
  target: number;
}

export type YegerQuestLookupResult =
  | { state: "no-character" }
  | { state: "level-locked"; character: CharacterSummary; requiredLevel: number }
  | { state: "offered"; character: CharacterSummary; progress: YegerQuestProgress }
  | { state: "in-progress"; character: CharacterSummary; progress: YegerQuestProgress }
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
    private readonly fight: FightService
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
        reward: buildYegerQuestReward({ replayUnavailable: true })
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

    return { state: "in-progress", character: summary, progress };
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
      progress: { wins: 0, target: YEGER_UNQUIET_TRIAL_TARGET }
    };
  }

  async trackForTelegramUser(telegramUserId: bigint): Promise<FightLookupResult> {
    return this.fight.getOrStartPersistentFightForTelegramUser(telegramUserId, {
      source: "yeger",
      target: { tagsAny: [...YEGER_UNQUIET_TRIAL_TAGS] }
    });
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
      rewardXp: YEGER_UNQUIET_TRIAL_REWARD.xp,
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
    const sessions = await this.combatSessions.listByTelegramUserIdSince(telegramUserId, startedAt);
    const wins = sessions.filter((session) => {
      const monster = monsters.find((candidate) => candidate.id === session.monsterId);

      return session.status === "won" && !!monster && isYegerUnquietTarget(monster);
    }).length;

    return {
      wins: Math.min(wins, YEGER_UNQUIET_TRIAL_TARGET),
      target: YEGER_UNQUIET_TRIAL_TARGET
    };
  }
}

export function isYegerUnquietTarget(monster: Pick<MonsterContent, "tags">): boolean {
  return monster.tags.some((tag) => YEGER_UNQUIET_TRIAL_TAGS.includes(tag as typeof YEGER_UNQUIET_TRIAL_TAGS[number]));
}

function buildYegerQuestReward(input?: {
  itemGrants?: Array<{ itemId: string; quantity: number }>;
  replayUnavailable?: boolean;
}): YegerQuestReward {
  return {
    xp: YEGER_UNQUIET_TRIAL_REWARD.xp,
    gold: YEGER_UNQUIET_TRIAL_REWARD.gold,
    itemGrants:
      input?.itemGrants && input.itemGrants.length > 0
        ? enrichRewardItemGrants(input.itemGrants)
        : enrichRewardItemGrants([{ itemId: YEGER_UNQUIET_TRIAL_REWARD.itemId, quantity: 1 }]),
    ...(input?.replayUnavailable ? { itemReplayUnavailable: true } : {})
  };
}
