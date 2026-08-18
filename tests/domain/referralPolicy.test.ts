import { describe, expect, it } from "vitest";
import {
  REFERRAL_POLICY_V1,
  getReferralStagesCrossed,
  referralTrackTotals,
  validateFrozenReferralReward
} from "../../src/domain/referral/referralPolicy";

describe("referral reward policy", () => {
  it("freezes the four owner-approved full bundles and totals", () => {
    expect(REFERRAL_POLICY_V1).toEqual({
      version: 1,
      rewardFamily: "REFERRAL_INVITER_LEVEL_TRACK",
      stages: [
        { key: "LEVEL_3", level: 3, achievementId: "achievement.level.3", gold: 50, itemGrants: [
          { itemId: "item.dense-bandage", quantity: 1 }, { itemId: "item.iskrokamin", quantity: 5 }
        ] },
        { key: "LEVEL_5", level: 5, achievementId: "achievement.level.5", gold: 120, itemGrants: [
          { itemId: "item.field-kit", quantity: 1 }, { itemId: "item.iskrokamin", quantity: 13 }
        ] },
        { key: "LEVEL_8", level: 8, achievementId: "achievement.level.8", gold: 760, itemGrants: [
          { itemId: "item.field-kit", quantity: 2 }, { itemId: "item.iskrokamin", quantity: 65 }
        ] },
        { key: "LEVEL_13", level: 13, achievementId: "achievement.level.13", gold: 900, itemGrants: [
          { itemId: "item.field-kit", quantity: 3 }, { itemId: "item.iskrokamin", quantity: 193 }
        ] }
      ]
    });
    expect(referralTrackTotals()).toEqual({ gold: 1_830, iskrokamin: 276, fieldKits: 6 });
    expect(getReferralStagesCrossed(1, 13).map((stage) => stage.key))
      .toEqual(["LEVEL_3", "LEVEL_5", "LEVEL_8", "LEVEL_13"]);
  });

  it("fails closed on missing, extra, reordered, unknown, or malformed grant parts", () => {
    const valid = {
      rewardPlanVersion: 1,
      rewardFamily: "REFERRAL_INVITER_LEVEL_TRACK",
      milestoneKey: "LEVEL_5",
      sourceAchievementId: "achievement.level.5",
      rewardGold: 120,
      rewardItemsJson: [
        { itemId: "item.field-kit", quantity: 1 },
        { itemId: "item.iskrokamin", quantity: 13 }
      ]
    };
    expect(validateFrozenReferralReward(valid)).toEqual({ ok: true, items: valid.rewardItemsJson });
    expect(validateFrozenReferralReward({ ...valid, rewardGold: 121 })).toEqual({ ok: false, code: "INVALID_BUNDLE" });
    expect(validateFrozenReferralReward({ ...valid, rewardItemsJson: [valid.rewardItemsJson[0]] }))
      .toEqual({ ok: false, code: "INVALID_BUNDLE" });
    expect(validateFrozenReferralReward({ ...valid, rewardItemsJson: [...valid.rewardItemsJson].reverse() }))
      .toEqual({ ok: false, code: "INVALID_BUNDLE" });
    expect(validateFrozenReferralReward({ ...valid, rewardItemsJson: [{ itemId: "item.nope", quantity: 1 }] }))
      .toEqual({ ok: false, code: "UNKNOWN_ITEM" });
    expect(validateFrozenReferralReward({ ...valid, rewardItemsJson: [{ itemId: "item.field-kit", quantity: 0 }] }))
      .toEqual({ ok: false, code: "INVALID_QUANTITY" });
  });
});
