import { createHash } from "node:crypto";
import type { ItemContent, ItemUseEffectContent } from "../content/schema";

export const ITEM_USE_RULES_VERSION = "item-use-v4";

export interface ItemUsePreviewSnapshot {
  rulesVersion: typeof ITEM_USE_RULES_VERSION;
  resource: "hp" | "mana" | "both";
  hpBefore: number;
  hpMax: number;
  healAmount: number;
  hpAfter: number;
  manaBefore: number;
  manaMax: number;
  manaRestoreAmount: number;
  manaAfter: number;
}

export interface ItemUseCompletedResult extends ItemUsePreviewSnapshot {
  kind: ItemUseEffectContent["kind"];
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
  return calculateItemUsePreview({
    hpCurrent: input.hpCurrent,
    hpMax: input.hpMax,
    manaCurrent: 0,
    manaMax: 1,
    effect: input.effect,
    resolutionSeed: "legacy-healing-preview"
  });
}

export function calculateItemUsePreview(input: {
  hpCurrent: number;
  hpMax: number;
  manaCurrent: number;
  manaMax: number;
  effect: ItemUseEffectContent;
  resolutionSeed: string;
}): ItemUsePreviewSnapshot {
  const hpMax = Math.max(1, Math.floor(input.hpMax));
  const hpBefore = Math.min(hpMax, Math.max(0, Math.floor(input.hpCurrent)));
  const manaMax = Math.max(0, Math.floor(input.manaMax));
  const manaBefore = Math.min(manaMax, Math.max(0, Math.floor(input.manaCurrent)));
  const resolved = resolveOutOfCombatEffect(input.effect, input.resolutionSeed);
  const healAmount = calculateHealAmount({
    hpBefore,
    hpMax,
    effect: resolved
  });
  const manaRestoreAmount = resolved.kind === "restore-mana" || resolved.kind === "restore-both"
    ? Math.min(
        Math.max(0, Math.floor(resolved.kind === "restore-both" ? resolved.manaAmount : resolved.amount)),
        Math.max(0, manaMax - manaBefore)
      )
    : 0;
  const resource = resolved.kind === "restore-mana"
    ? "mana"
    : resolved.kind === "restore-both"
      ? "both"
      : "hp";

  return {
    rulesVersion: ITEM_USE_RULES_VERSION,
    resource,
    hpBefore,
    hpMax,
    healAmount,
    hpAfter: Math.min(hpMax, hpBefore + healAmount),
    manaBefore,
    manaMax,
    manaRestoreAmount,
    manaAfter: Math.min(manaMax, manaBefore + manaRestoreAmount)
  };
}

export function getItemUsePreviewAppliedAmount(
  preview: Pick<ItemUsePreviewSnapshot, "healAmount"> & { manaRestoreAmount?: number }
): number {
  return preview.healAmount + (preview.manaRestoreAmount ?? 0);
}

export function isOutOfCombatItemUseEffect(effect: ItemUseEffectContent): boolean {
  return effect.kind === "heal-hp" ||
    effect.kind === "heal-hp-to-min-percent" ||
    effect.kind === "restore-mana" ||
    effect.kind === "restore-both" ||
    effect.kind === "random-resource" ||
    effect.kind === "heal-hp-below-percent";
}

function resolveOutOfCombatEffect(
  effect: ItemUseEffectContent,
  resolutionSeed: string
): ItemUseEffectContent {
  if (effect.kind !== "random-resource") {
    return effect;
  }

  const choices: ItemUseEffectContent[] = [
    { kind: "heal-hp", amount: effect.amount },
    { kind: "restore-mana", amount: effect.amount }
  ];
  if (effect.bothAmount !== undefined) {
    choices.push({ kind: "restore-both", hpAmount: effect.bothAmount, manaAmount: effect.bothAmount });
  }
  const byte = createHash("sha256").update(resolutionSeed).digest()[0] ?? 0;
  return choices[byte % choices.length]!;
}

function calculateHealAmount(input: {
  hpBefore: number;
  hpMax: number;
  effect: ItemUseEffectContent;
}): number {
  switch (input.effect.kind) {
    case "heal-hp":
      return Math.min(
        Math.max(0, Math.floor(input.effect.amount)),
        Math.max(0, input.hpMax - input.hpBefore)
      );
    case "heal-hp-to-min-percent": {
      const target = Math.min(
        input.hpMax,
        Math.ceil(input.hpMax * Math.max(1, Math.min(100, Math.floor(input.effect.percent))) / 100)
      );

      return Math.max(0, target - input.hpBefore);
    }
    case "restore-mana":
      return 0;
    case "restore-both":
      return Math.min(
        Math.max(0, Math.floor(input.effect.hpAmount)),
        Math.max(0, input.hpMax - input.hpBefore)
      );
    case "heal-hp-below-percent":
      return input.hpBefore <= Math.floor(input.hpMax * input.effect.thresholdPercent / 100)
        ? Math.min(
            Math.max(0, Math.floor(input.effect.amount)),
            Math.max(0, input.hpMax - input.hpBefore)
          )
        : 0;
    case "random-resource":
    case "paired-heal":
    case "party-heal":
    case "guard-response":
    case "evade-response":
    case "reduce-cooldowns":
    case "cleanse-negative":
    case "critical-damage":
      return 0;
  }
}
