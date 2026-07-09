import type { CooldownRepository } from "../db/repositories/cooldownRepository";
import type { EquipmentRepository } from "../db/repositories/equipmentRepository";
import type { HpLossAudit, RewardLevelChange } from "../db/repositories/dailyActionRepository";
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
import {
  type QuestConsequenceKind,
  type QuestMethodDefinition,
  type QuestResolutionGrade
} from "../content/questResolution";
import { resolveQuestCheck, type QuestCheckResult } from "../domain/quests/questChecks";
import {
  findQuestMethodByLegacyAction,
  findVisibleQuestMethodByCallbackKey,
  resolveQuestMethodsForCharacter
} from "../domain/quests/questMethodResolver";
import { getEquippedItemContents } from "./equipmentService";

export const CELLAR_MOUSE_ERRAND_KEY = "cellar.mouse-errand";
export const CELLAR_MOUSE_ERRAND_COOLDOWN_MS = 3 * 60 * 1000;
const CELLAR_DEFAULT_SCENE_SLOT = "bribe-cheese";
const CELLAR_VISIBLE_METHOD_COUNT = 4;

export type CellarErrandAction = string;
export type CellarErrandCompletionInput =
  | { type: "legacy-action"; action: CellarErrandAction }
  | { type: "method"; methodId: string };

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
      hpLoss: HpLossAudit | null;
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
      state: "stale";
      character: CharacterSummary;
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
  callbackKey?: string;
  label: string;
  buttonLabel?: string;
  hint: string;
  goldCost?: number;
}

export class CellarErrandService {
  constructor(
    private readonly cooldowns: CooldownRepository,
    private readonly clock: Clock = systemClock,
    private readonly equipment?: EquipmentRepository
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

    const equippedItems = await this.getEquippedItemContents(telegramUserId);
    const character = summarizeCharacter(current.character, { equippedItems });

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
    input: CellarErrandAction | CellarErrandCompletionInput
  ): Promise<CellarErrandResult> {
    const completionInput =
      typeof input === "string" ? { type: "legacy-action" as const, action: input } : input;
    const now = this.clock();
    const current = await this.cooldowns.findForTelegramUser(
      telegramUserId,
      CELLAR_MOUSE_ERRAND_KEY
    );

    if (!current) {
      return { state: "no-character" };
    }

    const equippedItems = await this.getEquippedItemContents(telegramUserId);
    const character = summarizeCharacter(current.character, { equippedItems });

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

    const scene = buildStarterQuestResolutionScene("cellar-mouse", character);
    const method =
      completionInput.type === "method"
        ? findVisibleQuestMethodByCallbackKey(scene, character, completionInput.methodId, {
            maxMethods: CELLAR_VISIBLE_METHOD_COUNT,
            minMethods: CELLAR_VISIBLE_METHOD_COUNT,
            sceneSlotKey: CELLAR_DEFAULT_SCENE_SLOT
          })
        : findQuestMethodByLegacyAction(scene, completionInput.action);

    if (!method) {
      return {
        state: "stale",
        character
      };
    }

    const methodOption = toCellarMethodOption(method);
    const check = resolveQuestCheck({
      characterId: current.character.id,
      periodKey: buildCellarCycleKey(current.cooldown),
      sceneId: scene.sceneId,
      method,
      stats: character.stats,
      raceId: character.raceId,
      classId: character.classId
    });
    const consequence = method.consequenceByGrade[check.grade];
    const reward = buildCellarReward(method, check.grade, consequence);
    const spentGold = method.goldCost ?? 0;
    const availableAt = new Date(now.getTime() + CELLAR_MOUSE_ERRAND_COOLDOWN_MS);
    const cycleKey = buildCellarCycleKey(current.cooldown);
    const hpLoss = buildCellarHpLoss({
      characterId: current.character.id,
      cycleKey,
      sceneId: scene.sceneId,
      methodId: method.id,
      grade: check.grade,
      consequence,
      hpMax: character.hpMax
    });
    const itemGrants = buildCellarItemGrants(
      method.itemIntent ??
        method.legacyAction ??
        (completionInput.type === "legacy-action" ? completionInput.action : completionInput.methodId)
    );
    const claim = await this.cooldowns.claimRewardForTelegramUser(telegramUserId, {
      key: CELLAR_MOUSE_ERRAND_KEY,
      now,
      availableAt,
      rewardXp: reward.xp,
      rewardGold: reward.gold,
      spentGold,
      hpLoss: {
        requested: hpLoss,
        effectiveHpMax: character.hpMax
      },
      resultJson: buildCellarResultPayload({
        sceneId: scene.sceneId,
        method,
        grade: check.grade,
        consequence,
        reward,
        spentGold,
        itemGrants,
        check,
        cycleKey
      }),
      itemGrants
    });

    if (!claim) {
      return { state: "no-character" };
    }

    if (claim.state === "on-cooldown") {
      return {
        state: "on-cooldown",
        character: summarizeCharacter(claim.character, { equippedItems }),
        availableAt: claim.cooldown.availableAt,
        now
      };
    }

    if (claim.state === "insufficient-gold") {
      return {
        state: "insufficient-gold",
        character: summarizeCharacter(claim.character, { equippedItems }),
        method: methodOption,
        requiredGold: claim.requiredGold
      };
    }

    return {
      state: "completed",
      action: completionInput.type === "legacy-action" ? completionInput.action : completionInput.methodId,
      method: methodOption,
      grade: check.grade,
      outcome: method.outcomeText[check.grade],
      spentGold,
      hpLoss: claim.hpLoss,
      check,
      character: summarizeCharacter(claim.character, { equippedItems }),
      reward: {
        ...reward,
        itemGrants: enrichRewardItemGrants(claim.itemGrants)
      },
      availableAt: claim.cooldown.availableAt,
      now,
      levelChange: claim.levelChange
    };
  }

  private async getEquippedItemContents(telegramUserId: bigint) {
    const equipmentSnapshot = await this.equipment?.listByTelegramUserId(telegramUserId);

    return equipmentSnapshot ? getEquippedItemContents(equipmentSnapshot.equipment) : [];
  }
}

export function buildCellarMethodOptions(character: CharacterSummary): CellarErrandMethodOption[] {
  const scene = buildStarterQuestResolutionScene("cellar-mouse", character);
  return resolveQuestMethodsForCharacter(scene, character, {
    maxMethods: CELLAR_VISIBLE_METHOD_COUNT,
    minMethods: CELLAR_VISIBLE_METHOD_COUNT,
    sceneSlotKey: CELLAR_DEFAULT_SCENE_SLOT
  }).map(toCellarMethodOption);
}

function toCellarMethodOption(method: QuestMethodDefinition): CellarErrandMethodOption {
  return {
    id: method.id,
    ...(method.callbackKey ? { callbackKey: method.callbackKey } : {}),
    label: method.label,
    ...(method.buttonLabel ? { buttonLabel: method.buttonLabel } : {}),
    hint: method.hint,
    ...(method.goldCost ? { goldCost: method.goldCost } : {})
  };
}

function buildCellarReward(
  method: QuestMethodDefinition,
  grade: QuestResolutionGrade,
  consequence: QuestConsequenceKind
): { xp: number; gold: number } {
  const reward = getConservativeCellarReward(method);

  if (grade === "strong-success" || grade === "success") {
    return reward;
  }

  if (consequence === "minor-injury") {
    return {
      xp: Math.max(1, Math.floor(reward.xp * 0.5)),
      gold: 0
    };
  }

  if (grade === "mixed-success") {
    return {
      xp: Math.max(1, Math.floor(reward.xp * 0.5)),
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

function buildCellarHpLoss(input: {
  characterId: string;
  cycleKey: string;
  sceneId: string;
  methodId: string;
  grade: QuestResolutionGrade;
  consequence: QuestConsequenceKind;
  hpMax: number;
}): number {
  if (input.consequence !== "minor-injury") {
    return 0;
  }

  let hash = 0x811c9dc5;
  const seed = `cellar-hp-loss-v1:${input.characterId}:${input.cycleKey}:${input.sceneId}:${input.methodId}:${input.grade}`;

  for (const char of seed) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return Math.min(3, Math.max(1, Math.ceil(Math.max(1, input.hpMax) * (0.04 + (hash % 4) / 100))));
}

function buildCellarResultPayload(input: {
  sceneId: string;
  method: QuestMethodDefinition;
  grade: QuestResolutionGrade;
  consequence: QuestConsequenceKind;
  reward: { xp: number; gold: number };
  spentGold: number;
  itemGrants: Array<{ itemId: string; quantity: number }>;
  check: QuestCheckResult;
  cycleKey: string;
}): unknown {
  return {
    version: 1,
    sceneId: input.sceneId,
    methodId: input.method.id,
    grade: input.grade,
    consequence: input.consequence,
    reward: {
      xp: input.reward.xp,
      gold: input.reward.gold,
      itemGrants: input.itemGrants
    },
    spentGold: input.spentGold,
    cycleKey: input.cycleKey,
    check: input.check
  };
}

function getConservativeCellarReward(method: QuestMethodDefinition): { xp: number; gold: number } {
  const action = method.itemIntent ?? method.legacyAction ?? method.id;

  if (action === "cheese-trap") {
    return { xp: 2, gold: 1 };
  }

  if (action === "sweep-bravely") {
    return { xp: 1, gold: 0 };
  }

  return { xp: 2, gold: 0 };
}

function buildCellarCycleKey(cooldown: { availableAt: Date } | null): string {
  return `${CELLAR_MOUSE_ERRAND_KEY}:${cooldown ? cooldown.availableAt.toISOString() : "initial"}`;
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
