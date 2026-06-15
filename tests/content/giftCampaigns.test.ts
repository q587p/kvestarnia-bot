import { describe, expect, it } from "vitest";
import { giftCampaigns, items } from "../../src/content";
import {
  APOLOGY_P3009_STAMP_ITEM_ID,
  APOLOGY_REDEPLOY_CORK_ITEM_ID,
  APOLOGY_ROLLBACK_RECEIPT_ITEM_ID,
  TECHNICAL_APOLOGY_GIFT_CAMPAIGN_ID
} from "../../src/content/giftCampaigns";

const apologyItemIds = [
  APOLOGY_ROLLBACK_RECEIPT_ITEM_ID,
  APOLOGY_REDEPLOY_CORK_ITEM_ID,
  APOLOGY_P3009_STAMP_ITEM_ID
] as const;

describe("gift campaign content", () => {
  it("defines the technical apology campaign", () => {
    const campaign = giftCampaigns.find(
      (candidate) => candidate.id === TECHNICAL_APOLOGY_GIFT_CAMPAIGN_ID
    );

    expect(campaign).toBeDefined();
    expect(campaign).toMatchObject({
      id: TECHNICAL_APOLOGY_GIFT_CAMPAIGN_ID,
      key: TECHNICAL_APOLOGY_GIFT_CAMPAIGN_ID,
      localDate: "once",
      title: "Перепрошувальний набір корчмаря",
      rewardXp: 0,
      rewardGold: 0
    });
    expect(campaign?.itemGrants).toHaveLength(apologyItemIds.length);
  });

  it("points campaign grants at existing positive-quantity item ids", () => {
    const campaign = giftCampaigns.find(
      (candidate) => candidate.id === TECHNICAL_APOLOGY_GIFT_CAMPAIGN_ID
    );
    const itemIds = new Set(items.map((item) => item.id));

    expect(campaign).toBeDefined();

    for (const grant of campaign?.itemGrants ?? []) {
      expect(grant.quantity).toBeGreaterThan(0);
      expect(itemIds.has(grant.itemId)).toBe(true);
    }
  });

  it("keeps apology items non-power and valued around 100 gold", () => {
    for (const itemId of apologyItemIds) {
      const item = items.find((candidate) => candidate.id === itemId);

      expect(item, `missing apology item ${itemId}`).toBeDefined();
      expect(item).not.toHaveProperty("effect");
      expect(item).not.toHaveProperty("stats");
      expect(item).not.toHaveProperty("effects");
      expect(item).not.toHaveProperty("combatBonus");
      expect(item).not.toHaveProperty("rewardBonus");
      expect(item?.goldValue).toBeGreaterThanOrEqual(90);
      expect(item?.goldValue).toBeLessThanOrEqual(120);
    }
  });
});
