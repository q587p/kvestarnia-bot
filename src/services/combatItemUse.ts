import type { ItemContent } from "../content/schema";
import { DENSE_BANDAGE_ITEM_ID, FIELD_KIT_ITEM_ID } from "../domain/itemCraft";
import { blocksAccidentalItemUse, getItemUseEffect } from "../domain/itemUse";
import { BANDAGE_ITEM_ID } from "./itemGrant";

export interface CombatUsableItem {
  key: string;
  item: ItemContent;
  effect: NonNullable<ReturnType<typeof getItemUseEffect>>;
}

const MEDICAL_COMBAT_ITEM_IDS = new Set([
  BANDAGE_ITEM_ID,
  DENSE_BANDAGE_ITEM_ID,
  FIELD_KIT_ITEM_ID
]);

export function getCombatUsableItem(item: ItemContent, nonMedicalEnabled = true): CombatUsableItem | null {
  const effect = getItemUseEffect(item);

  if (!effect || blocksAccidentalItemUse(item) || (!nonMedicalEnabled && !isMedicalCombatItemId(item.id))) {
    return null;
  }

  return {
    key: getCombatItemUseKey(item.id),
    item,
    effect
  };
}

export function findCombatUsableItemByKey(
  itemContents: readonly ItemContent[],
  key: string,
  nonMedicalEnabled = true
): CombatUsableItem | null {
  const matches = itemContents.flatMap((item) => {
    const combatItem = getCombatUsableItem(item, nonMedicalEnabled);
    return combatItem?.key === key ? [combatItem] : [];
  });

  return matches.length === 1 ? matches[0]! : null;
}

export function getCombatItemUseKey(itemId: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < itemId.length; index += 1) {
    hash ^= itemId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash.toString(36).padStart(6, "0").slice(-6);
}

export function isMedicalCombatItemId(itemId: string): boolean {
  return MEDICAL_COMBAT_ITEM_IDS.has(itemId);
}
