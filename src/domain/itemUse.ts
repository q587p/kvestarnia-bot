import { createHash } from "node:crypto";
import type { ItemContent, ItemUseEffectContent } from "../content/schema";

export const ITEM_USE_RULES_VERSION = "item-use-v1";

export interface ItemUsePreviewSnapshot {
  rulesVersion: typeof ITEM_USE_RULES_VERSION;
  hpBefore: number;
  hpMax: number;
  healAmount: number;
  hpAfter: number;
}

export interface ItemUseCompletedResult extends ItemUsePreviewSnapshot {
  kind: "heal-hp";
  itemId: string;
  itemName: string;
}

export function createItemUseFingerprint(item: ItemContent): string {
  const stable = JSON.stringify({
    id: item.id,
    name: item.name,
    slot: item.slot,
    priceless: item.priceless === true,
    tags: [...(item.tags ?? [])].sort(),
    useEffect: item.useEffect ?? null
  });

  return createHash("sha256").update(stable).digest("hex").slice(0, 32);
}

export function getItemUseEffect(item: ItemContent): ItemUseEffectContent | null {
  const tags = new Set(item.tags ?? []);

  if (
    item.slot !== "consumable" ||
    !item.useEffect ||
    item.useEffect.kind !== "heal-hp" ||
    !tags.has("consumable") ||
    !tags.has("one-use")
  ) {
    return null;
  }

  return item.useEffect;
}

export function blocksAccidentalItemUse(item: ItemContent): boolean {
  const tags = new Set(item.tags ?? []);

  return (
    item.priceless === true ||
    tags.has("story") ||
    tags.has("memory") ||
    tags.has("sentimental") ||
    tags.has("soulbound")
  );
}

export function calculateHealingPreview(input: {
  hpCurrent: number;
  hpMax: number;
  effect: ItemUseEffectContent;
}): ItemUsePreviewSnapshot {
  const hpMax = Math.max(1, Math.floor(input.hpMax));
  const hpBefore = Math.min(hpMax, Math.max(0, Math.floor(input.hpCurrent)));
  const healAmount = Math.min(
    Math.max(0, Math.floor(input.effect.amount)),
    Math.max(0, hpMax - hpBefore)
  );

  return {
    rulesVersion: ITEM_USE_RULES_VERSION,
    hpBefore,
    hpMax,
    healAmount,
    hpAfter: Math.min(hpMax, hpBefore + healAmount)
  };
}
