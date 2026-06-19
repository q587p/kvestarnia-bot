import type { CooldownRepository } from "../db/repositories/cooldownRepository";
import type { RewardLevelChange } from "../db/repositories/dailyActionRepository";
import { summarizeCharacter, type CharacterSummary } from "../domain/characters/characterSummary";
import {
  CELLAR_MAX_LEVEL,
  CELLAR_MIN_LEVEL,
  isWithinActivityMaxLevel,
  meetsActivityLevel
} from "../domain/progression/activityGates";
import { systemClock, type Clock } from "../shared/time";
import {
  BRISTLE_OF_BASEMENT_ORDER_ITEM_ID,
  CHEESE_OF_PROCEDURAL_DOUBT_ITEM_ID,
  CORK_RING_OF_SERIOUS_BUSINESS_ITEM_ID,
  enrichRewardItemGrants,
  NAPKIN_OF_MOUSE_DIPLOMACY_ITEM_ID,
  starterEquipmentGrant,
  type RewardItemGrant
} from "./itemGrant";
import { buildStarterQuestResolutionScene } from "../content/starterQuestResolutionContent";
import { QUEST_REWARD_PROFILES, type QuestMethodDefinition, type QuestResolutionGrade } from "../content/questResolution";
import { resolveQuestCheck, type QuestCheckResult } from "../domain/quests/questChecks";
import {
  findQuestMethod,
  findQuestMethodByLegacyAction,
  resolveQuestMethodsForCharacter
} from "../domain/quests/questMethodResolver";

export const CELLAR_MOUSE_ERRAND_KEY = "cellar.mouse-errand";
export const CELLAR_MOUSE_ERRAND_COOLDOWN_MS = 3 * 60 * 1000;

export type CellarErrandAction = string;

export const CELLAR_MOUSE_ERRAND_REWARDS = {
  "cheese-trap": {
    xp: 2,
    gold: 1
  },
  "sweep-bravely": {
    xp: 1,
    gold: 0
  },
  negotiate: {
    xp: 2,
    gold: 0
  }
} as const;

export type CellarErrandLookupResult =
  | { state: "no-character" }
  | { state: "level-locked"; character: CharacterSummary; requiredLevel: number }
  | { state: "level-retired"; character: CharacterSummary; maxLevel: number; completed: boolean }
  | { state: "ready"; character: CharacterSummary }
  | { state: "on-cooldown"; character: CharacterSummary; availableAt: Date; now: Date };

export type CellarErrandResult =
  | { state: "no-character" }
  | { state: "level-locked"; character: CharacterSummary; requiredLevel: number }
  | { state: "level-retired"; character: CharacterSummary; maxLevel: number; completed: boolean }
  | {
      state: "completed";
      action: CellarErrandAction;
      method: CellarErrandMethodOption;
      grade: QuestResolutionGrade;
      outcome: QuestMethodDefinition["outcomeText"][QuestResolutionGrade];
      spentGold: number;
      check: QuestCheckResult;
      character: CharacterSummary;
      reward: CellarErrandReward;
      availableAt: Date;
      now: Date;
      levelChange: RewardLevelChange;
    }
  | {
      state: "on-cooldown";
      character: CharacterSummary;
      availableAt: Date;
      now: Date;
    }
  | {
      state: "insufficient-gold";
      character: CharacterSummary;
      method: CellarErrandMethodOption;
      requiredGold: number;
    };

export interface CellarErrandReward {
  xp: number;
  gold: number;
  itemGrants: RewardItemGrant[];
}

export interface CellarErrandMethodOption {
  id: string;
  label: string;
  buttonLabel?: string;
  hint: string;
  goldCost?: number;
}

export class CellarErrandService {
  constructor(
    private readonly cooldowns: CooldownRepository,
    private readonly clock: Clock = systemClock
  ) {}

  async getForTelegramUser(telegramUserId: bigint): Promise<CellarErrandLookupResult> {
    const now = this.clock();
    const current = await this.cooldowns.findForTelegramUser(
      telegramUserId,
      CELLAR_MOUSE_ERRAND_KEY
    );

    if (!current) {
      return { state: "no-character" };
    }

    const character = summarizeCharacter(current.character);

    if (!meetsActivityLevel(character.level, CELLAR_MIN_LEVEL)) {
      return {
        state: "level-locked",
        character,
        requiredLevel: CELLAR_MIN_LEVEL
      };
    }

    if (!isWithinActivityMaxLevel(character.level, CELLAR_MAX_LEVEL)) {
      return {
        state: "level-retired",
        character,
        maxLevel: CELLAR_MAX_LEVEL,
        completed: current.cooldown !== null
      };
    }

    if (current.cooldown && current.cooldown.availableAt > now) {
      return {
        state: "on-cooldown",
        character,
        availableAt: current.cooldown.availableAt,
        now
      };
    }

    return {
      state: "ready",
      character
    };
  }

  async complete(
    telegramUserId: bigint,
    action: CellarErrandAction
  ): Promise<CellarErrandResult> {
    const now = this.clock();
    const current = await this.cooldowns.findForTelegramUser(
      telegramUserId,
      CELLAR_MOUSE_ERRAND_KEY
    );

    if (!current) {
      return { state: "no-character" };
    }

    const character = summarizeCharacter(current.character);

    if (!meetsActivityLevel(character.level, CELLAR_MIN_LEVEL)) {
      return {
        state: "level-locked",
        character,
        requiredLevel: CELLAR_MIN_LEVEL
      };
    }

    if (!isWithinActivityMaxLevel(character.level, CELLAR_MAX_LEVEL)) {
      return {
        state: "level-retired",
        character,
        maxLevel: CELLAR_MAX_LEVEL,
        completed: current.cooldown !== null
      };
    }

    const scene = buildStarterQuestResolutionScene("cellar-mouse", character);
    const method =
      findQuestMethod(scene, action) ?? findQuestMethodByLegacyAction(scene, action);

    if (!method) {
      return {
        state: "on-cooldown",
        character,
        availableAt: now,
        now
      };
    }

    const methodOption = toCellarMethodOption(method);
    const check = resolveQuestCheck({
      characterId: current.character.id,
      periodKey: `${CELLAR_MOUSE_ERRAND_KEY}:${now.toISOString()}`,
      sceneId: scene.sceneId,
      method,
      stats: character.stats,
      raceId: character.raceId,
      classId: character.classId
    });
    const reward = buildCellarReward(method, check.grade);
    const spentGold = method.goldCost ?? 0;
    const availableAt = new Date(now.getTime() + CELLAR_MOUSE_ERRAND_COOLDOWN_MS);
    const claim = await this.cooldowns.claimRewardForTelegramUser(telegramUserId, {
      key: CELLAR_MOUSE_ERRAND_KEY,
      now,
      availableAt,
      rewardXp: reward.xp,
      rewardGold: reward.gold,
      spentGold,
      itemGrants: buildCellarItemGrants(method.itemIntent ?? method.legacyAction ?? action)
    });

    if (!claim) {
      return { state: "no-character" };
    }

    if (claim.state === "on-cooldown") {
      return {
        state: "on-cooldown",
        character: summarizeCharacter(claim.character),
        availableAt: claim.cooldown.availableAt,
        now
      };
    }

    if (claim.state === "insufficient-gold") {
      return {
        state: "insufficient-gold",
        character: summarizeCharacter(claim.character),
        method: methodOption,
        requiredGold: claim.requiredGold
      };
    }

    return {
      state: "completed",
      action,
      method: methodOption,
      grade: check.grade,
      outcome: method.outcomeText[check.grade],
      spentGold,
      check,
      character: summarizeCharacter(claim.character),
      reward: {
        ...reward,
        itemGrants: enrichRewardItemGrants(claim.itemGrants)
      },
      availableAt: claim.cooldown.availableAt,
      now,
      levelChange: claim.levelChange
    };
  }
}

export function buildCellarMethodOptions(character: CharacterSummary): CellarErrandMethodOption[] {
  const scene = buildStarterQuestResolutionScene("cellar-mouse", character);

  return resolveQuestMethodsForCharacter(scene, character, { maxMethods: 4, minMethods: 3 })
    .map(toCellarMethodOption);
}

function toCellarMethodOption(method: QuestMethodDefinition): CellarErrandMethodOption {
  return {
    id: method.id,
    label: method.label,
    ...(method.buttonLabel ? { buttonLabel: method.buttonLabel } : {}),
    hint: method.hint,
    ...(method.goldCost ? { goldCost: method.goldCost } : {})
  };
}

function buildCellarReward(
  method: QuestMethodDefinition,
  grade: QuestResolutionGrade
): { xp: number; gold: number } {
  const reward = QUEST_REWARD_PROFILES[method.rewardProfile];

  if (grade === "strong-success" || grade === "success") {
    return reward;
  }

  if (grade === "mixed-success") {
    return {
      xp: Math.ceil(reward.xp * 0.5),
      gold: Math.floor(reward.gold * 0.5)
    };
  }

  if (method.goldCost) {
    return reward;
  }

  return {
    xp: Math.max(1, Math.ceil(reward.xp * 0.35)),
    gold: 0
  };
}

function buildCellarItemGrants(action: string): Array<{ itemId: string; quantity: number }> {
  if (action === "cheese-trap") {
    return [
      {
        itemId: CHEESE_OF_PROCEDURAL_DOUBT_ITEM_ID,
        quantity: 1
      }
    ];
  }

  if (action === "sweep-bravely") {
    return [
      {
        itemId: BRISTLE_OF_BASEMENT_ORDER_ITEM_ID,
        quantity: 1
      }
    ];
  }

  return [
    starterEquipmentGrant(CORK_RING_OF_SERIOUS_BUSINESS_ITEM_ID),
    {
      itemId: NAPKIN_OF_MOUSE_DIPLOMACY_ITEM_ID,
      quantity: 1
    }
  ];
}
