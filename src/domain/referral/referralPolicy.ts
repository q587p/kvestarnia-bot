import { items } from "../../content";

export const REFERRAL_REWARD_FAMILY = "REFERRAL_INVITER_LEVEL_TRACK" as const;

export const REFERRAL_POLICY_V1 = {
  version: 1,
  rewardFamily: REFERRAL_REWARD_FAMILY,
  stages: [
    {
      key: "LEVEL_3",
      level: 3,
      achievementId: "achievement.level.3",
      gold: 50,
      itemGrants: [
        { itemId: "item.dense-bandage", quantity: 1 },
        { itemId: "item.iskrokamin", quantity: 5 }
      ]
    },
    {
      key: "LEVEL_5",
      level: 5,
      achievementId: "achievement.level.5",
      gold: 120,
      itemGrants: [
        { itemId: "item.field-kit", quantity: 1 },
        { itemId: "item.iskrokamin", quantity: 13 }
      ]
    },
    {
      key: "LEVEL_8",
      level: 8,
      achievementId: "achievement.level.8",
      gold: 760,
      itemGrants: [
        { itemId: "item.field-kit", quantity: 2 },
        { itemId: "item.iskrokamin", quantity: 65 }
      ]
    },
    {
      key: "LEVEL_13",
      level: 13,
      achievementId: "achievement.level.13",
      gold: 900,
      itemGrants: [
        { itemId: "item.field-kit", quantity: 3 },
        { itemId: "item.iskrokamin", quantity: 193 }
      ]
    }
  ]
} as const;

export type ReferralMilestoneKey = (typeof REFERRAL_POLICY_V1.stages)[number]["key"];
export type ReferralRewardItem = { itemId: string; quantity: number };
export type ReferralRewardFailureCode =
  | "INVALID_BUNDLE"
  | "UNKNOWN_ITEM"
  | "INVALID_QUANTITY"
  | "INVALID_GOLD"
  | "NO_CHARACTER"
  | "TRANSIENT";

export interface FrozenReferralReward {
  rewardPlanVersion: number;
  rewardFamily: string;
  milestoneKey: string;
  sourceAchievementId: string;
  rewardGold: number;
  rewardItemsJson: unknown;
}

export function getReferralPolicy(version: number): typeof REFERRAL_POLICY_V1 | null {
  return version === REFERRAL_POLICY_V1.version ? REFERRAL_POLICY_V1 : null;
}

export function getReferralStagesCrossed(oldLevel: number, newLevel: number) {
  if (newLevel <= oldLevel) {
    return [];
  }
  return REFERRAL_POLICY_V1.stages.filter(
    (stage) => oldLevel < stage.level && newLevel >= stage.level
  );
}

export function validateFrozenReferralReward(
  reward: FrozenReferralReward
): { ok: true; items: ReferralRewardItem[] } | { ok: false; code: ReferralRewardFailureCode } {
  if (!Number.isSafeInteger(reward.rewardGold) || reward.rewardGold <= 0) {
    return { ok: false, code: "INVALID_GOLD" };
  }
  const policy = getReferralPolicy(reward.rewardPlanVersion);
  if (!policy || reward.rewardFamily !== policy.rewardFamily) {
    return { ok: false, code: "INVALID_BUNDLE" };
  }
  const stage = policy.stages.find((candidate) => candidate.key === reward.milestoneKey);
  if (
    !stage ||
    stage.achievementId !== reward.sourceAchievementId ||
    stage.gold !== reward.rewardGold
  ) {
    return { ok: false, code: "INVALID_BUNDLE" };
  }
  if (!Array.isArray(reward.rewardItemsJson)) {
    return { ok: false, code: "INVALID_BUNDLE" };
  }

  const knownItemIds = new Set(items.map((item) => item.id));
  const parsed: ReferralRewardItem[] = [];
  let previousItemId = "";
  for (const entry of reward.rewardItemsJson) {
    const value: unknown = entry;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { ok: false, code: "INVALID_BUNDLE" };
    }
    const keys = Object.keys(value).sort();
    if (keys.length !== 2 || keys[0] !== "itemId" || keys[1] !== "quantity") {
      return { ok: false, code: "INVALID_BUNDLE" };
    }
    const itemId = (value as { itemId?: unknown }).itemId;
    const quantity = (value as { quantity?: unknown }).quantity;
    if (typeof itemId !== "string" || !knownItemIds.has(itemId)) {
      return { ok: false, code: "UNKNOWN_ITEM" };
    }
    if (typeof quantity !== "number" || !Number.isSafeInteger(quantity) || quantity <= 0) {
      return { ok: false, code: "INVALID_QUANTITY" };
    }
    if (itemId <= previousItemId) {
      return { ok: false, code: "INVALID_BUNDLE" };
    }
    previousItemId = itemId;
    parsed.push({ itemId, quantity });
  }

  const expected = stage.itemGrants;
  if (
    parsed.length !== expected.length ||
    parsed.some(
      (entry, index) =>
        entry.itemId !== expected[index]?.itemId || entry.quantity !== expected[index]?.quantity
    )
  ) {
    return { ok: false, code: "INVALID_BUNDLE" };
  }
  return { ok: true, items: parsed };
}

export function referralTrackTotals(): { gold: number; iskrokamin: number; fieldKits: number } {
  return REFERRAL_POLICY_V1.stages.reduce(
    (total, stage) => ({
      gold: total.gold + stage.gold,
      iskrokamin:
        total.iskrokamin +
        (stage.itemGrants.find((item) => item.itemId === "item.iskrokamin")?.quantity ?? 0),
      fieldKits:
        total.fieldKits +
        (stage.itemGrants.find((item) => item.itemId === "item.field-kit")?.quantity ?? 0)
    }),
    { gold: 0, iskrokamin: 0, fieldKits: 0 }
  );
}
