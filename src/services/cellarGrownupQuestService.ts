import type {
  CellarGrownupFinalEnding,
  CellarGrownupQuestRepository,
  CellarGrownupQuestSnapshot
} from "../db/repositories/cellarGrownupQuestRepository";
import type { CooldownRepository } from "../db/repositories/cooldownRepository";
import type {
  DailyActionRepository,
  RewardLevelChange
} from "../db/repositories/dailyActionRepository";
import { summarizeCharacter, type CharacterSummary } from "../domain/characters/characterSummary";
import { getLevelForXp } from "../domain/progression/level";
import { systemClock, type Clock } from "../shared/time";
import {
  CELLAR_CHEESE_SEAL_ITEM_ID,
  CELLAR_FOAMY_MIRAGE_BOTTLE_ITEM_ID,
  enrichRewardItemGrants,
  type RewardItemGrant
} from "./itemGrant";

export const CELLAR_GROWNUP_MIN_LEVEL = 4;
export const CELLAR_GROWNUP_ONCE = "once";
export const CELLAR_GROWNUP_SEAL_PURCHASE_KEY = "cellar.grownup.seal-purchase";
export const CELLAR_GROWNUP_BOTTLE_KEY = "cellar.grownup.bottle";
export const CELLAR_GROWNUP_COMPLETION_KEY = "cellar.grownup.completed";
export const CELLAR_GROWNUP_ROLEPLAY_COOLDOWN_KEY = "cellar.grownup.roleplay";
export const CELLAR_GROWNUP_ROLEPLAY_COOLDOWN_MS = 93 * 60 * 1000;
export const CELLAR_GROWNUP_SEAL_PRICE = 240;
export const CELLAR_GROWNUP_ROLEPLAY_MAX_CHANCE = 0.13;

const TURN_IN_REWARD = {
  xp: 40,
  gold: 180
};

const KEEP_BOTTLE_REWARD = {
  xp: 40,
  gold: 0
};

export type CellarGrownupQuestLookupResult =
  | { state: "no-character" }
  | { state: "too-young"; character: CharacterSummary; requiredLevel: number }
  | { state: "completed"; character: CharacterSummary; ending: CellarGrownupFinalEnding; reward: CellarGrownupReward }
  | { state: "bottle-obtained"; character: CharacterSummary; bottleQuantity: number }
  | { state: "has-seal"; character: CharacterSummary; sealQuantity: number }
  | { state: "roleplay-cooldown"; character: CharacterSummary; availableAt: Date; now: Date }
  | { state: "offered"; character: CharacterSummary; price: number };

export type CellarGrownupQuestAction =
  | "grownup-buy-seal"
  | "grownup-roleplay"
  | "grownup-show-seal"
  | "grownup-turn-in"
  | "grownup-keep-bottle";

export type CellarGrownupQuestResult =
  | { state: "no-character" }
  | { state: "too-young"; character: CharacterSummary; requiredLevel: number }
  | { state: "already-completed"; character: CharacterSummary; ending: CellarGrownupFinalEnding; reward: CellarGrownupReward }
  | { state: "seal-purchased"; character: CharacterSummary; price: number }
  | { state: "seal-already-owned"; character: CharacterSummary }
  | { state: "insufficient-gold"; character: CharacterSummary; price: number }
  | { state: "roleplay-cooldown"; character: CharacterSummary; availableAt: Date; now: Date }
  | { state: "roleplay-failed"; character: CharacterSummary; availableAt: Date; now: Date; chance: number }
  | { state: "bottle-obtained"; character: CharacterSummary; reward: CellarGrownupBottleReward; source: "seal" | "roleplay" }
  | { state: "missing-seal"; character: CharacterSummary }
  | { state: "missing-bottle"; character: CharacterSummary }
  | {
      state: "completed";
      character: CharacterSummary;
      ending: CellarGrownupFinalEnding;
      reward: CellarGrownupReward;
      levelChange: RewardLevelChange;
    };

export interface CellarGrownupBottleReward {
  itemGrants: RewardItemGrant[];
}

export interface CellarGrownupReward {
  xp: number;
  gold: number;
}

export class CellarGrownupQuestService {
  constructor(
    private readonly quests: CellarGrownupQuestRepository,
    private readonly dailyActions: DailyActionRepository,
    private readonly cooldowns: CooldownRepository,
    private readonly clock: Clock = systemClock,
    private readonly roll: () => number = Math.random
  ) {}

  async getForTelegramUser(telegramUserId: bigint): Promise<CellarGrownupQuestLookupResult> {
    const snapshot = await this.quests.getSnapshotForTelegramUser(telegramUserId, questKeys());

    if (!snapshot) {
      return { state: "no-character" };
    }

    return this.presentSnapshot(snapshot);
  }

  async buySeal(telegramUserId: bigint): Promise<CellarGrownupQuestResult> {
    const now = this.clock();
    const snapshot = await this.quests.getSnapshotForTelegramUser(telegramUserId, questKeys());

    if (!snapshot) {
      return { state: "no-character" };
    }

    const gated = this.guardGrownupLevel(snapshot);

    if (gated) {
      return gated;
    }

    const result = await this.quests.buyCheeseSealForTelegramUser(telegramUserId, {
      keys: questKeys(),
      price: CELLAR_GROWNUP_SEAL_PRICE,
      now
    });

    if (result.state === "no-character") {
      return { state: "no-character" };
    }

    if (result.state === "already-completed") {
      return this.completedResult(result.snapshot, "already-completed");
    }

    if (result.state === "already-owned") {
      return {
        state: "seal-already-owned",
        character: summarizeCharacter(result.snapshot.character)
      };
    }

    if (result.state === "insufficient") {
      return {
        state: "insufficient-gold",
        character: summarizeCharacter(result.snapshot.character),
        price: result.price
      };
    }

    return {
      state: "seal-purchased",
      character: summarizeCharacter(result.snapshot.character),
      price: result.price
    };
  }

  async showSeal(telegramUserId: bigint): Promise<CellarGrownupQuestResult> {
    const snapshot = await this.quests.getSnapshotForTelegramUser(telegramUserId, questKeys());

    if (!snapshot) {
      return { state: "no-character" };
    }

    const gated = this.guardGrownupLevel(snapshot);

    if (gated) {
      return gated;
    }

    if (snapshot.completedAction) {
      return this.completedResult(snapshot, "already-completed");
    }

    if (snapshot.cheeseSealQuantity <= 0) {
      return {
        state: "missing-seal",
        character: summarizeCharacter(snapshot.character)
      };
    }

    return this.grantBottle(telegramUserId, "seal");
  }

  async attemptRoleplay(telegramUserId: bigint): Promise<CellarGrownupQuestResult> {
    const now = this.clock();
    const snapshot = await this.quests.getSnapshotForTelegramUser(telegramUserId, questKeys());

    if (!snapshot) {
      return { state: "no-character" };
    }

    const gated = this.guardGrownupLevel(snapshot);

    if (gated) {
      return gated;
    }

    if (snapshot.completedAction) {
      return this.completedResult(snapshot, "already-completed");
    }

    if (snapshot.roleplayCooldown && snapshot.roleplayCooldown.availableAt > now) {
      return {
        state: "roleplay-cooldown",
        character: summarizeCharacter(snapshot.character),
        availableAt: snapshot.roleplayCooldown.availableAt,
        now
      };
    }

    const character = summarizeCharacter(snapshot.character);
    const chance = snapshot.roleplayCooldown ? getRoleplayChance(character) : 0;

    if (this.roll() < chance) {
      return this.grantBottle(telegramUserId, "roleplay");
    }

    const availableAt = new Date(now.getTime() + CELLAR_GROWNUP_ROLEPLAY_COOLDOWN_MS);
    const claim = await this.cooldowns.claimRewardForTelegramUser(telegramUserId, {
      key: CELLAR_GROWNUP_ROLEPLAY_COOLDOWN_KEY,
      now,
      availableAt,
      rewardXp: 0,
      rewardGold: 0
    });

    if (!claim) {
      return { state: "no-character" };
    }

    if (claim.state === "on-cooldown") {
      return {
        state: "roleplay-cooldown",
        character: summarizeCharacter(claim.character),
        availableAt: claim.cooldown.availableAt,
        now
      };
    }

    if (claim.state === "insufficient-gold") {
      throw new Error("Cellar grownup roleplay does not spend gold.");
    }

    return {
      state: "roleplay-failed",
      character: summarizeCharacter(claim.character),
      availableAt: claim.cooldown.availableAt,
      now,
      chance
    };
  }

  async complete(
    telegramUserId: bigint,
    ending: CellarGrownupFinalEnding
  ): Promise<CellarGrownupQuestResult> {
    const reward = ending === "turn-in" ? TURN_IN_REWARD : KEEP_BOTTLE_REWARD;
    const result = await this.quests.completeWithBottleForTelegramUser(telegramUserId, {
      keys: questKeys(),
      ending,
      rewardXp: reward.xp,
      rewardGold: reward.gold,
      now: this.clock()
    });

    if (result.state === "no-character") {
      return { state: "no-character" };
    }

    if (result.state === "already-completed") {
      return this.completedResult(result.snapshot, "already-completed", result.ending);
    }

    if (result.state === "missing-bottle") {
      return {
        state: "missing-bottle",
        character: summarizeCharacter(result.snapshot.character)
      };
    }

    return {
      state: "completed",
      character: summarizeCharacter(result.snapshot.character),
      ending: result.ending,
      reward,
      levelChange: result.levelChange
    };
  }

  private async grantBottle(
    telegramUserId: bigint,
    source: "seal" | "roleplay"
  ): Promise<CellarGrownupQuestResult> {
    const claim = await this.dailyActions.claimForTelegramUser(telegramUserId, {
      key: CELLAR_GROWNUP_BOTTLE_KEY,
      localDate: CELLAR_GROWNUP_ONCE,
      rewardXp: 0,
      rewardGold: 0,
      itemGrants: [
        {
          itemId: CELLAR_FOAMY_MIRAGE_BOTTLE_ITEM_ID,
          quantity: 1,
          maxOwnedQuantity: 1
        }
      ]
    });

    if (!claim) {
      return { state: "no-character" };
    }

    return {
      state: "bottle-obtained",
      character: summarizeCharacter(claim.character),
      source,
      reward: {
        itemGrants: enrichRewardItemGrants(
          claim.state === "created"
            ? claim.itemGrants
            : [
                {
                  itemId: CELLAR_FOAMY_MIRAGE_BOTTLE_ITEM_ID,
                  quantity: 1
                }
              ]
        )
      }
    };
  }

  private presentSnapshot(snapshot: CellarGrownupQuestSnapshot): CellarGrownupQuestLookupResult {
    const gated = this.guardGrownupLevel(snapshot);

    if (gated) {
      return gated;
    }

    if (snapshot.completedAction) {
      return this.completedResult(snapshot, "lookup");
    }

    if (snapshot.bottleQuantity > 0) {
      return {
        state: "bottle-obtained",
        character: summarizeCharacter(snapshot.character),
        bottleQuantity: snapshot.bottleQuantity
      };
    }

    if (snapshot.cheeseSealQuantity > 0) {
      return {
        state: "has-seal",
        character: summarizeCharacter(snapshot.character),
        sealQuantity: snapshot.cheeseSealQuantity
      };
    }

    const now = this.clock();

    if (snapshot.roleplayCooldown && snapshot.roleplayCooldown.availableAt > now) {
      return {
        state: "roleplay-cooldown",
        character: summarizeCharacter(snapshot.character),
        availableAt: snapshot.roleplayCooldown.availableAt,
        now
      };
    }

    return {
      state: "offered",
      character: summarizeCharacter(snapshot.character),
      price: CELLAR_GROWNUP_SEAL_PRICE
    };
  }

  private guardGrownupLevel(
    snapshot: CellarGrownupQuestSnapshot
  ): Extract<CellarGrownupQuestLookupResult, { state: "too-young" }> | null {
    const level = getLevelForXp(snapshot.character.xp);

    if (level >= CELLAR_GROWNUP_MIN_LEVEL) {
      return null;
    }

    return {
      state: "too-young",
      character: summarizeCharacter(snapshot.character),
      requiredLevel: CELLAR_GROWNUP_MIN_LEVEL
    };
  }

  private completedResult(
    snapshot: CellarGrownupQuestSnapshot,
    mode: "lookup"
  ): Extract<CellarGrownupQuestLookupResult, { state: "completed" }>;
  private completedResult(
    snapshot: CellarGrownupQuestSnapshot,
    mode: "already-completed",
    endingOverride?: CellarGrownupFinalEnding
  ): Extract<CellarGrownupQuestResult, { state: "already-completed" }>;
  private completedResult(
    snapshot: CellarGrownupQuestSnapshot,
    mode: "lookup" | "already-completed",
    endingOverride?: CellarGrownupFinalEnding
  ):
    | Extract<CellarGrownupQuestLookupResult, { state: "completed" }>
    | Extract<CellarGrownupQuestResult, { state: "already-completed" }> {
    const action = snapshot.completedAction;
    const reward = {
      xp: action?.rewardXp ?? 0,
      gold: action?.rewardGold ?? 0
    };
    const ending = endingOverride ?? (reward.gold > 0 ? "turn-in" : "keep");

    if (mode === "lookup") {
      return {
        state: "completed",
        character: summarizeCharacter(snapshot.character),
        ending,
        reward
      };
    }

    return {
      state: "already-completed",
      character: summarizeCharacter(snapshot.character),
      ending,
      reward
    };
  }
}

function questKeys() {
  return {
    sealPurchaseKey: CELLAR_GROWNUP_SEAL_PURCHASE_KEY,
    completionKey: CELLAR_GROWNUP_COMPLETION_KEY,
    onceLocalDate: CELLAR_GROWNUP_ONCE,
    roleplayCooldownKey: CELLAR_GROWNUP_ROLEPLAY_COOLDOWN_KEY,
    cheeseSealItemId: CELLAR_CHEESE_SEAL_ITEM_ID,
    bottleItemId: CELLAR_FOAMY_MIRAGE_BOTTLE_ITEM_ID
  };
}

export function getRoleplayChance(character: CharacterSummary): number {
  let chance = 0.45 + character.stats.charisma * 0.015 + character.stats.luck * 0.01;

  if (character.raceId === "race.domovyk") {
    chance += 0.18;
  }

  if (character.classId === "class.bard" || character.classId === "class.bureaucramancer") {
    chance += 0.14;
  }

  if (character.classId === "class.rogue" || character.classId === "class.ranger") {
    chance += 0.08;
  }

  return Math.min(CELLAR_GROWNUP_ROLEPLAY_MAX_CHANCE, Math.max(0.05, chance));
}
