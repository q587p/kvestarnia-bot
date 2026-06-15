export interface GiftCampaignItemGrant {
  itemId: string;
  quantity: number;
  maxOwnedQuantity?: number;
}

export interface GiftCampaignContent {
  id: string;
  key: string;
  localDate: string;
  title: string;
  description: string;
  rewardXp: number;
  rewardGold: number;
  itemGrants: GiftCampaignItemGrant[];
}

export const TECHNICAL_APOLOGY_GIFT_CAMPAIGN_ID = "gift.technical-apology.12026-06-15";
export const APOLOGY_ROLLBACK_RECEIPT_ITEM_ID = "item.apology.rollback-receipt";
export const APOLOGY_REDEPLOY_CORK_ITEM_ID = "item.apology.redeploy-cork";
export const APOLOGY_P3009_STAMP_ITEM_ID = "item.apology.p3009-stamp";

export const giftCampaigns = [
  {
    id: TECHNICAL_APOLOGY_GIFT_CAMPAIGN_ID,
    key: TECHNICAL_APOLOGY_GIFT_CAMPAIGN_ID,
    localDate: "once",
    title: "Перепрошувальний набір корчмаря",
    description:
      "Корчмар перепрошує за технічний збій: підлога деплоїлася двічі, база даних сиділа під ковдрою, а міграція робила вигляд, що це частина квесту.",
    rewardXp: 0,
    rewardGold: 0,
    itemGrants: [
      {
        itemId: APOLOGY_ROLLBACK_RECEIPT_ITEM_ID,
        quantity: 1,
        maxOwnedQuantity: 1
      },
      {
        itemId: APOLOGY_REDEPLOY_CORK_ITEM_ID,
        quantity: 1,
        maxOwnedQuantity: 1
      },
      {
        itemId: APOLOGY_P3009_STAMP_ITEM_ID,
        quantity: 1,
        maxOwnedQuantity: 1
      }
    ]
  }
] satisfies GiftCampaignContent[];

export function findGiftCampaign(campaignId: string): GiftCampaignContent | undefined {
  return giftCampaigns.find((campaign) => campaign.id === campaignId);
}
