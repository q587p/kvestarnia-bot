import { items } from "../content";

export const WET_HERO_TICKET_ITEM_ID = "item.wet-hero-ticket";
export const PAN_OF_PERSUASION_ITEM_ID = "item.pan-of-persuasion";
export const STAMP_OF_MINOR_AUTHORITY_ITEM_ID = "item.stamp-of-minor-authority";
export const APRON_OF_FOAM_RESISTANCE_ITEM_ID = "item.apron-of-foam-resistance";
export const BARREL_SPLINTER_OF_OPTIMISM_ITEM_ID = "item.barrel-splinter-of-optimism";
export const CORK_RING_OF_SERIOUS_BUSINESS_ITEM_ID = "item.cork-ring-of-serious-business";
export const FOAM_CORK_OF_ACCOUNTING_ITEM_ID = "item.foam-cork-of-accounting";
export const MIRAGE_FOAM_SAMPLE_ITEM_ID = "item.mirage-foam-sample";
export const CHEESE_OF_PROCEDURAL_DOUBT_ITEM_ID = "item.cheese-of-procedural-doubt";
export const BRISTLE_OF_BASEMENT_ORDER_ITEM_ID = "item.bristle-of-basement-order";
export const NAPKIN_OF_MOUSE_DIPLOMACY_ITEM_ID = "item.napkin-of-mouse-diplomacy";
export const SUSPICIOUS_SHAWARMA_WRAPPER_ITEM_ID = "item.suspicious-shawarma-wrapper";
export const RECEIPT_OF_FORMAL_SUSPICION_ITEM_ID = "item.receipt-of-formal-suspicion";
export const BADGE_OF_THIRTEEN_SMALL_PROBLEMS_ITEM_ID =
  "item.badge-of-thirteen-small-problems";
export const STARTER_EQUIPMENT_MAX_OWNED_QUANTITY = 1;

export interface RewardItemGrant {
  itemId: string;
  name: string;
  quantity: number;
}

export function starterEquipmentGrant(itemId: string): {
  itemId: string;
  quantity: number;
  maxOwnedQuantity: number;
} {
  return {
    itemId,
    quantity: 1,
    maxOwnedQuantity: STARTER_EQUIPMENT_MAX_OWNED_QUANTITY
  };
}

export function enrichRewardItemGrants(
  grants: Array<{ itemId: string; quantity: number }>
): RewardItemGrant[] {
  return grants.map((grant) => {
    const item = items.find((candidate) => candidate.id === grant.itemId);

    return {
      itemId: grant.itemId,
      name: item?.name ?? "Невідома манатка",
      quantity: grant.quantity
    };
  });
}
