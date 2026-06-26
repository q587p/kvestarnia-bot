import type { ItemContent } from "../content/schema";
import { blocksAccidentalItemUse, getItemUseEffect } from "../domain/itemUse";

export interface CombatUsableItem {
  key: string;
  item: ItemContent;
  effect: NonNullable<ReturnType<typeof getItemUseEffect>>;
}

export function getCombatUsableItem(item: ItemContent): CombatUsableItem | null {
  const effect = getItemUseEffect(item);

  if (!effect || blocksAccidentalItemUse(item)) {
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
  key: string
): CombatUsableItem | null {
  const matches = itemContents.flatMap((item) => {
    const combatItem = getCombatUsableItem(item);
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
