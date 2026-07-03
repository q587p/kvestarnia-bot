export const equipmentSlots = [
  "weapon",
  "offhand",
  "head",
  "chest",
  "legs",
  "accessory",
  "tool"
] as const;

export type EquipmentSlot = (typeof equipmentSlots)[number];

export type LegacyEquipmentSlot = "armor";

export function normalizeEquipmentSlot(value: string): EquipmentSlot | null {
  if (value === "armor") {
    return "chest";
  }

  return equipmentSlots.includes(value as EquipmentSlot) ? (value as EquipmentSlot) : null;
}

export function getEquipmentSlotStorageKeys(slot: EquipmentSlot): readonly string[] {
  return slot === "chest" ? ["chest", "armor"] : [slot];
}
