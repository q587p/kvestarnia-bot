import { findMantokAbilityGrantByItemId } from "../../content/mantokAbilityGrants";
import { getMantokSetForItem } from "./mantokSetBonuses";
import { getItemUpgradeLevelFromItemId, isMageClassForItemSelfUpgrade } from "../itemUpgrades";

export const EQUIPMENT_ATTUNEMENT_ACTION_KEY = "equipment.attunement";
export const WEAK_EQUIPMENT_ATTUNEMENT_MS = 13 * 60 * 1000;
export const STRONG_EQUIPMENT_ATTUNEMENT_MS = 42 * 60 * 1000;
export const MAGE_WEAK_EQUIPMENT_ATTUNEMENT_MS = 5 * 60 * 1000;
export const MAGE_STRONG_EQUIPMENT_ATTUNEMENT_MS = 23 * 60 * 1000;
export const MAX_EQUIPMENT_ATTUNEMENT_MS = STRONG_EQUIPMENT_ATTUNEMENT_MS;

export type EquipmentMagicStrength = "weak" | "strong";
export type EquipmentAttunementState = "tuning" | "attuned";

export interface EquipmentAttunementRecord {
  state: EquipmentAttunementState;
  strength: EquipmentMagicStrength;
  startedAt: Date;
  readyAt: Date;
}

export interface EquipmentAttunementPayload {
  version: 1;
  status: "tuning" | "cancelled";
  slot: string;
  itemId: string;
  itemName: string;
  equipmentUpdatedAt: string;
  strength: EquipmentMagicStrength;
  startedAt: string;
  readyAt: string;
  cancelledAt?: string;
  notifiedAt?: string;
}

export function getEquipmentMagicStrength(itemId: string): EquipmentMagicStrength | null {
  const level = getItemUpgradeLevelFromItemId(itemId);

  if (level >= 4) {
    return "strong";
  }

  if (getMantokSetForItem(itemId) || findMantokAbilityGrantByItemId(itemId)) {
    return "strong";
  }

  if (level >= 1) {
    return "weak";
  }

  return null;
}

export function getEquipmentAttunementDurationMs(
  strength: EquipmentMagicStrength,
  classId?: string | null
): number {
  if (classId && isMageClassForItemSelfUpgrade(classId)) {
    return strength === "strong"
      ? MAGE_STRONG_EQUIPMENT_ATTUNEMENT_MS
      : MAGE_WEAK_EQUIPMENT_ATTUNEMENT_MS;
  }

  return strength === "strong"
    ? STRONG_EQUIPMENT_ATTUNEMENT_MS
    : WEAK_EQUIPMENT_ATTUNEMENT_MS;
}

export function buildEquipmentAttunementPayload(input: {
  slot: string;
  itemId: string;
  itemName: string;
  equipmentUpdatedAt: Date;
  strength: EquipmentMagicStrength;
  startedAt: Date;
  readyAt: Date;
}): EquipmentAttunementPayload {
  return {
    version: 1,
    status: "tuning",
    slot: input.slot,
    itemId: input.itemId,
    itemName: input.itemName,
    equipmentUpdatedAt: input.equipmentUpdatedAt.toISOString(),
    strength: input.strength,
    startedAt: input.startedAt.toISOString(),
    readyAt: input.readyAt.toISOString()
  };
}

export function parseEquipmentAttunementPayload(value: unknown): EquipmentAttunementPayload | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Partial<Record<keyof EquipmentAttunementPayload, unknown>>;

  if (
    record.version !== 1 ||
    (record.status !== "tuning" && record.status !== "cancelled") ||
    typeof record.slot !== "string" ||
    typeof record.itemId !== "string" ||
    typeof record.itemName !== "string" ||
    typeof record.equipmentUpdatedAt !== "string" ||
    (record.strength !== "weak" && record.strength !== "strong") ||
    typeof record.startedAt !== "string" ||
    typeof record.readyAt !== "string"
  ) {
    return null;
  }

  const cancelledAt = typeof record.cancelledAt === "string" ? record.cancelledAt : undefined;
  const notifiedAt = typeof record.notifiedAt === "string" ? record.notifiedAt : undefined;

  return {
    version: 1,
    status: record.status,
    slot: record.slot,
    itemId: record.itemId,
    itemName: record.itemName,
    equipmentUpdatedAt: record.equipmentUpdatedAt,
    strength: record.strength,
    startedAt: record.startedAt,
    readyAt: record.readyAt,
    ...(cancelledAt ? { cancelledAt } : {}),
    ...(notifiedAt ? { notifiedAt } : {})
  };
}

export function isEquipmentAttunementReady(payload: EquipmentAttunementPayload, now: Date): boolean {
  return Date.parse(payload.readyAt) <= now.getTime();
}

export function matchesEquipmentAttunementRow(
  payload: EquipmentAttunementPayload,
  row: { slot: string; itemId: string; updatedAt: Date }
): boolean {
  return payload.status === "tuning" &&
    payload.slot === row.slot &&
    payload.itemId === row.itemId &&
    payload.equipmentUpdatedAt === row.updatedAt.toISOString();
}

export function isEquipmentAttunementPendingForRow(input: {
  row: { slot: string; itemId: string; updatedAt: Date };
  actionPayloads: readonly unknown[];
  now: Date;
}): boolean {
  return input.actionPayloads.some((value) => {
    const payload = parseEquipmentAttunementPayload(value);

    return Boolean(
      payload &&
      matchesEquipmentAttunementRow(payload, input.row) &&
      !isEquipmentAttunementReady(payload, input.now)
    );
  });
}
