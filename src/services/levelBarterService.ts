import { items } from "../content";
import type { ItemContent } from "../content/schema";
import type {
  LevelBarterExchangePlan,
  LevelBarterPlanResult,
  LevelBarterRepository,
  LevelBarterSnapshot
} from "../db/repositories/levelBarterRepository";
import type { AchievementService, AchievementUnlock } from "./achievementService";
import { trackRewardAchievementsSafely } from "./achievementTracking";
import { summarizeCharacter, type CharacterSummary } from "../domain/characters/characterSummary";
import {
  LEVEL_BARTER_COST_GOLD,
  buildLevelBarterEligibleStacks,
  buildLevelBarterProgression,
  canLevelBarterProgress,
  createLevelBarterToken,
  getLevelBarterEligibleTotalValue,
  pickItemsForLevelBarter
} from "../domain/levelBarter";

export type LevelBarterOfferResult =
  | { state: "no-character" }
  | { state: "battle-only-level"; character: CharacterSummary; level: number }
  | {
      state: "insufficient";
      character: CharacterSummary;
      eligibleTotalValue: number;
      gold: number;
      combinedValue: number;
      cost: number;
    }
  | {
      state: "ready";
      character: CharacterSummary;
      offer: LevelBarterPresentedOffer;
    };

export type LevelBarterPreviewResult =
  | { state: "no-character" }
  | { state: "battle-only-level"; character: CharacterSummary; level: number }
  | {
      state: "insufficient";
      character: CharacterSummary;
      eligibleTotalValue: number;
      gold: number;
      combinedValue: number;
      cost: number;
    }
  | {
      state: "preview";
      character: CharacterSummary;
      offer: LevelBarterPresentedOffer;
    };

export type LevelBarterConfirmResult =
  | { state: "no-character" }
  | { state: "battle-only-level"; level: number }
  | {
      state: "insufficient";
      eligibleTotalValue: number;
      gold: number;
      combinedValue: number;
      cost: number;
    }
  | { state: "stale-selection" }
  | { state: "exchanged"; character: CharacterSummary; offer: LevelBarterPresentedOffer; achievementUnlocks?: AchievementUnlock[] }
  | { state: "replayed"; character: CharacterSummary; offer: LevelBarterPresentedOffer };

export interface LevelBarterPresentedOffer {
  token: string;
  itemTotalValue: number;
  goldSpent: number;
  selectedTotalValue: number;
  overpay: number;
  levelBefore: number;
  levelAfter: number;
  xpCarry: number;
  xpBefore: number;
  xpAfter: number;
  cost: number;
  items: LevelBarterPresentedItem[];
}

export interface LevelBarterPresentedItem {
  itemId: string;
  quantity: number;
  unitGoldValue: number;
  totalGoldValue: number;
  content: ItemContent;
}

export class LevelBarterService {
  constructor(
    private readonly repository: LevelBarterRepository,
    private readonly clock: () => Date = () => new Date(),
    private readonly achievements?: AchievementService
  ) {}

  async getOfferForTelegramUser(telegramUserId: bigint): Promise<LevelBarterOfferResult> {
    const snapshot = await this.repository.getSnapshotForTelegramUser(telegramUserId, this.clock());

    if (!snapshot) {
      return { state: "no-character" };
    }

    const result = buildPlanForSnapshot(snapshot);

    if (result.state === "battle-only-level") {
      return {
        state: "battle-only-level",
        character: summarizeCharacter(snapshot.character, { remortCount: snapshot.remortCount }),
        level: result.level
      };
    }

    if (result.state === "insufficient") {
      return {
        state: "insufficient",
        character: summarizeCharacter(snapshot.character, { remortCount: snapshot.remortCount }),
        eligibleTotalValue: result.eligibleTotalValue,
        gold: result.gold,
        combinedValue: result.eligibleTotalValue + result.gold,
        cost: LEVEL_BARTER_COST_GOLD
      };
    }

    if (result.state === "token-mismatch") {
      return { state: "no-character" };
    }

    return {
      state: "ready",
      character: summarizeCharacter(snapshot.character, { remortCount: snapshot.remortCount }),
      offer: presentPlan(result.plan)
    };
  }

  async createAutoPreviewForTelegramUser(telegramUserId: bigint): Promise<LevelBarterPreviewResult> {
    const offer = await this.getOfferForTelegramUser(telegramUserId);

    if (offer.state === "ready") {
      return {
        state: "preview",
        character: offer.character,
        offer: offer.offer
      };
    }

    return offer;
  }

  async confirmAutoExchangeForTelegramUser(
    telegramUserId: bigint,
    token: string
  ): Promise<LevelBarterConfirmResult> {
    const result = await this.repository.confirmAutoExchangeForTelegramUser(telegramUserId, {
      expectedToken: token,
      now: this.clock(),
      createPlan: (snapshot) => buildPlanForSnapshot(snapshot, token)
    });

    if (result.state === "exchanged" || result.state === "replayed") {
      const now = this.clock();
      const achievementUnlocks = result.state === "exchanged"
        ? await trackRewardAchievementsSafely(this.achievements, {
            characterId: result.character.id,
            sourceId: result.plan.token,
            occurredAt: now,
            levelChange: {
              oldLevel: result.plan.levelBefore,
              newLevel: result.plan.levelAfter,
              leveledUp: result.plan.levelAfter > result.plan.levelBefore
            },
            events: ["level.barter.completed"]
          })
        : [];

      return {
        state: result.state,
        character: summarizeCharacter(result.character, { remortCount: result.remortCount }),
        offer: presentPlan(result.plan),
        ...(result.state === "exchanged" ? { achievementUnlocks } : {})
      };
    }

    if (result.state === "insufficient") {
      return {
        state: "insufficient",
        eligibleTotalValue: result.eligibleTotalValue,
        gold: result.gold,
        combinedValue: result.eligibleTotalValue + result.gold,
        cost: LEVEL_BARTER_COST_GOLD
      };
    }

    return result;
  }
}

function buildPlanForSnapshot(
  snapshot: LevelBarterSnapshot,
  expectedToken?: string
): LevelBarterPlanResult {
  const progression = buildLevelBarterProgression({
    storedLevel: snapshot.character.level,
    xp: snapshot.character.xp,
    remortCount: snapshot.remortCount
  });

  if (!canLevelBarterProgress(progression)) {
    return {
      state: "battle-only-level",
      level: progression.levelAfter
    };
  }

  const eligibleStacks = buildLevelBarterEligibleStacks({
    stacks: snapshot.items,
    equippedItemIds: new Set(snapshot.equippedItemIds),
    reservedItemIds: new Set(snapshot.reservedItemIds ?? []),
    itemContents: items
  });
  const eligibleTotalValue = getLevelBarterEligibleTotalValue(eligibleStacks);
  const selection = pickItemsForLevelBarter(
    eligibleStacks,
    LEVEL_BARTER_COST_GOLD,
    snapshot.character.gold
  );

  if (!selection) {
    return {
      state: "insufficient",
      eligibleTotalValue,
      gold: snapshot.character.gold
    };
  }

  const token = createLevelBarterToken({
    items: selection.items,
    goldSpent: selection.goldSpent,
    selectedTotalValue: selection.selectedTotalValue,
    progression
  });

  if (expectedToken && token !== expectedToken) {
    return { state: "token-mismatch" };
  }

  return {
    state: "ready",
    plan: {
      token,
      items: selection.items,
      goldSpent: selection.goldSpent,
      levelBefore: progression.levelBefore,
      levelAfter: progression.levelAfter,
      xpBefore: progression.xpBefore,
      xpAfter: progression.xpAfter,
      xpCarry: progression.xpCarry,
      itemTotalValue: selection.itemTotalValue,
      selectedTotalValue: selection.selectedTotalValue,
      overpay: selection.overpay
    }
  };
}

function presentPlan(plan: LevelBarterExchangePlan): LevelBarterPresentedOffer {
  return {
    token: plan.token,
    itemTotalValue: plan.itemTotalValue,
    goldSpent: plan.goldSpent,
    selectedTotalValue: plan.selectedTotalValue,
    overpay: plan.overpay,
    levelBefore: plan.levelBefore,
    levelAfter: plan.levelAfter,
    xpCarry: plan.xpCarry,
    xpBefore: plan.xpBefore,
    xpAfter: plan.xpAfter,
    cost: LEVEL_BARTER_COST_GOLD,
    items: plan.items.map(presentPlanItem)
  };
}

function presentPlanItem(item: { itemId: string; quantity: number }): LevelBarterPresentedItem {
  const content = items.find((candidate) => candidate.id === item.itemId) ?? unknownItem(item.itemId);
  const unitGoldValue = Math.max(0, Math.floor(content.goldValue ?? 0));

  return {
    itemId: item.itemId,
    quantity: item.quantity,
    unitGoldValue,
    totalGoldValue: unitGoldValue * item.quantity,
    content
  };
}

function unknownItem(itemId: string): ItemContent {
  return {
    id: itemId,
    name: "Невідома манатка",
    description: "Ярлик утік раніше, ніж манчкін встиг його прочитати.",
    rarity: "common",
    slot: "junk",
    priceless: true
  };
}
