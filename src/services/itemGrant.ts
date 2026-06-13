import { items } from "../content";

export const WET_HERO_TICKET_ITEM_ID = "item.wet-hero-ticket";
export const PAN_OF_PERSUASION_ITEM_ID = "item.pan-of-persuasion";
export const CHEESE_OF_PROCEDURAL_DOUBT_ITEM_ID = "item.cheese-of-procedural-doubt";
export const BRISTLE_OF_BASEMENT_ORDER_ITEM_ID = "item.bristle-of-basement-order";
export const NAPKIN_OF_MOUSE_DIPLOMACY_ITEM_ID = "item.napkin-of-mouse-diplomacy";
export const SUSPICIOUS_SHAWARMA_WRAPPER_ITEM_ID = "item.suspicious-shawarma-wrapper";
export const RECEIPT_OF_FORMAL_SUSPICION_ITEM_ID = "item.receipt-of-formal-suspicion";

export interface RewardItemGrant {
  itemId: string;
  name: string;
  quantity: number;
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
