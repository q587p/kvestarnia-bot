import type { CharacterRecord, CharacterRepository } from "../db/repositories/characterRepository";
import type {
  DailyActionRecord,
  DailyActionRepository,
  RewardLevelChange
} from "../db/repositories/dailyActionRepository";
import { summarizeCharacter, type CharacterSummary } from "../domain/characters/characterSummary";

import type { AchievementService, AchievementUnlock } from "./achievementService";
import {
  isKorchmaInteriorLocation,
  normalizePresenceLocationId,
  PRESENCE_LOCATION_KORCHMA_QUEST_TABLE
} from "./presenceService";

export const FIRST_KORCHMA_QUEST_ID = "first_korchma_steps";
export const FIRST_KORCHMA_QUEST_TITLE = "Перший крок до столу";
export const FIRST_KORCHMA_QUEST_REWARD_XP = 1;

const ENTERED_KEY = "quest.first-korchma.entered";
const COMPLETED_KEY = "quest.first-korchma.completed";

export interface FirstKorchmaQuestProgress {
  enteredKorchma: boolean;
  reachedQuestTable: boolean;
  currentLocationId: string | null;
}

export type FirstKorchmaQuestLookupResult =
  | { state: "no-character" }
  | { state: "active"; character: CharacterSummary; progress: FirstKorchmaQuestProgress }
  | {
      state: "completed";
      character: CharacterSummary;
      progress: FirstKorchmaQuestProgress;
      reward: FirstKorchmaQuestReward;
    };

export type FirstKorchmaQuestCompletionResult =
  | { state: "no-character" }
  | {
      state: "completed";
      character: CharacterSummary;
      progress: FirstKorchmaQuestProgress;
      reward: FirstKorchmaQuestReward;
      levelChange: RewardLevelChange | null;
      achievementUnlocks: AchievementUnlock[];
    }
  | {
      state: "already-completed";
      character: CharacterSummary;
      progress: FirstKorchmaQuestProgress;
      reward: FirstKorchmaQuestReward;
      levelChange: RewardLevelChange | null;
      achievementUnlocks: AchievementUnlock[];
    };

export interface FirstKorchmaQuestReward {
  xp: number;
  gold: number;
}

interface FirstKorchmaQuestContext {
  character: CharacterRecord;
  lifeToken: string;
  entered: DailyActionRecord | null;
  completed: DailyActionRecord | null;
  progress: FirstKorchmaQuestProgress;
}

export class FirstKorchmaQuestService {
  constructor(
    private readonly characters: CharacterRepository,
    private readonly dailyActions: DailyActionRepository,
    private readonly achievements?: AchievementService
  ) {}

  async getForTelegramUser(telegramUserId: bigint): Promise<FirstKorchmaQuestLookupResult> {
    const context = await this.getContext(telegramUserId);

    if (!context) {
      return { state: "no-character" };
    }

    const character = summarizeCharacter(context.character);

    if (context.completed) {
      return {
        state: "completed",
        character,
        progress: context.progress,
        reward: buildReward(context.completed)
      };
    }

    return {
      state: "active",
      character,
      progress: context.progress
    };
  }

  async markEnteredForTelegramUser(telegramUserId: bigint): Promise<void> {
    const context = await this.getContext(telegramUserId);

    if (!context || context.entered || context.completed) {
      return;
    }

    await this.dailyActions.claimForTelegramUser(telegramUserId, {
      key: ENTERED_KEY,
      localDate: context.lifeToken,
      rewardXp: 0,
      rewardGold: 0,
      expectedLife: {
        remortCount: context.character.remortCount ?? 0
      },
      resultJson: {
        kind: "first-korchma-entered",
        version: 1,
        questId: FIRST_KORCHMA_QUEST_ID
      }
    });
  }

  async completeForTelegramUser(telegramUserId: bigint): Promise<FirstKorchmaQuestCompletionResult> {
    const context = await this.getContext(telegramUserId);

    if (!context) {
      return { state: "no-character" };
    }

    const character = summarizeCharacter(context.character);

    if (context.completed) {
      return {
        state: "already-completed",
        character,
        progress: context.progress,
        reward: buildReward(context.completed),
        levelChange: null,
        achievementUnlocks: []
      };
    }

    const claim = await this.dailyActions.claimForTelegramUser(telegramUserId, {
      key: COMPLETED_KEY,
      localDate: context.lifeToken,
      rewardXp: FIRST_KORCHMA_QUEST_REWARD_XP,
      rewardGold: 0,
      expectedLife: {
        remortCount: context.character.remortCount ?? 0
      },
      resultJson: {
        kind: "first-korchma-completed",
        version: 1,
        questId: FIRST_KORCHMA_QUEST_ID
      }
    });

    if (!claim) {
      return { state: "no-character" };
    }

    if (claim.state === "insufficient-gold") {
      throw new Error("First Korchma quest completion unexpectedly required gold.");
    }

    const achievementUnlocks = claim.state === "created"
      ? await this.achievements?.trackEventSafely({
          type: "quest.first-korchma.completed",
          characterId: claim.character.id,
          occurredAt: claim.action.createdAt,
          sourceId: claim.action.id
        }) ?? []
      : [];

    return {
      state: claim.state === "created" ? "completed" : "already-completed",
      character: summarizeCharacter(claim.character),
      progress: {
        enteredKorchma: true,
        reachedQuestTable: true,
        currentLocationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE
      },
      reward: buildReward(claim.action),
      levelChange: claim.state === "created" ? claim.levelChange : null,
      achievementUnlocks
    };
  }

  private async getContext(telegramUserId: bigint): Promise<FirstKorchmaQuestContext | null> {
    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character) {
      return null;
    }

    const lifeToken = buildLifeToken(character.remortCount ?? 0);
    const [entered, completed] = await Promise.all([
      this.dailyActions.findForTelegramUser(telegramUserId, {
        key: ENTERED_KEY,
        localDate: lifeToken
      }),
      this.dailyActions.findForTelegramUser(telegramUserId, {
        key: COMPLETED_KEY,
        localDate: lifeToken
      })
    ]);
    const currentLocationId = normalizePresenceLocationId(character.currentLocationId);

    return {
      character,
      lifeToken,
      entered,
      completed,
      progress: {
        enteredKorchma: Boolean(entered) || isKorchmaInteriorLocation(currentLocationId),
        reachedQuestTable: Boolean(completed) || currentLocationId === PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
        currentLocationId
      }
    };
  }
}

function buildReward(action: Pick<DailyActionRecord, "rewardXp" | "rewardGold">): FirstKorchmaQuestReward {
  return {
    xp: action.rewardXp,
    gold: action.rewardGold
  };
}

function buildLifeToken(remortCount: number): string {
  return `life:${remortCount}`;
}
