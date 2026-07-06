import {
  mantokSetDefinitions,
  type MantokSetBonusDefinition,
  type MantokSetDefinition,
  type MantokSetPieceDefinition
} from "../../content/mantokSetItems";
import { getBaseItemIdForUpgradeVariant } from "../itemUpgrades";

export interface ActiveMantokSetSummary {
  set: MantokSetDefinition;
  equippedPieces: MantokSetPieceDefinition[];
  activeBonuses: MantokSetBonusDefinition[];
  inactiveBonuses: MantokSetBonusDefinition[];
  nextBonus: MantokSetBonusDefinition | null;
}

export function getActiveMantokSets(equippedItemIds: readonly string[]): ActiveMantokSetSummary[] {
  const equipped = new Set(equippedItemIds.map(getBaseItemIdForUpgradeVariant));

  return mantokSetDefinitions.flatMap((set) => {
    const equippedPieces = set.pieces.filter((piece) => equipped.has(piece.itemId));
    const activeBonuses = set.bonuses.filter((bonus) => equippedPieces.length >= bonus.pieces);
    const inactiveBonuses = set.bonuses.filter((bonus) => equippedPieces.length < bonus.pieces);
    const nextBonus = [...inactiveBonuses].sort((left, right) => left.pieces - right.pieces)[0] ?? null;

    return equippedPieces.length > 0
      ? [{ set, equippedPieces, activeBonuses, inactiveBonuses, nextBonus }]
      : [];
  });
}

export function getActiveMantokSetBonuses(equippedItemIds: readonly string[]): MantokSetBonusDefinition[] {
  return getActiveMantokSets(equippedItemIds).flatMap((summary) => summary.activeBonuses);
}

export function getMantokSetForItem(itemId: string): MantokSetDefinition | null {
  const baseItemId = getBaseItemIdForUpgradeVariant(itemId);

  return mantokSetDefinitions.find((set) => set.pieces.some((piece) => piece.itemId === baseItemId)) ?? null;
}

export function getMantokSetProgressForItem(
  itemId: string,
  equippedItemIds: readonly string[]
): ActiveMantokSetSummary | null {
  const set = getMantokSetForItem(itemId);

  if (!set) {
    return null;
  }

  const equipped = new Set(equippedItemIds.map(getBaseItemIdForUpgradeVariant));
  const equippedPieces = set.pieces.filter((piece) => equipped.has(piece.itemId));
  const activeBonuses = set.bonuses.filter((bonus) => equippedPieces.length >= bonus.pieces);
  const inactiveBonuses = set.bonuses.filter((bonus) => equippedPieces.length < bonus.pieces);
  const nextBonus = [...inactiveBonuses].sort((left, right) => left.pieces - right.pieces)[0] ?? null;

  return {
    set,
    equippedPieces,
    activeBonuses,
    inactiveBonuses,
    nextBonus
  };
}

export function getActiveMantokSetBonusContributions(
  equippedItemIds: readonly string[]
): Array<{
  set: MantokSetDefinition;
  bonus: MantokSetBonusDefinition;
}> {
  return getActiveMantokSets(equippedItemIds).flatMap((summary) =>
    summary.activeBonuses.map((bonus) => ({ set: summary.set, bonus }))
  );
}

export function summarizeMantokSetBonusEffects(
  equippedItemIds: readonly string[]
): Partial<Record<keyof NonNullable<MantokSetBonusDefinition["effect"]>, number>> {
  const summary: Partial<Record<keyof NonNullable<MantokSetBonusDefinition["effect"]>, number>> = {};

  for (const bonus of getActiveMantokSetBonuses(equippedItemIds)) {
    for (const [key, value] of Object.entries(bonus.effect ?? {})) {
      const statKey = key as keyof NonNullable<MantokSetBonusDefinition["effect"]>;
      summary[statKey] = (summary[statKey] ?? 0) + (value ?? 0);
    }
  }

  return summary;
}
