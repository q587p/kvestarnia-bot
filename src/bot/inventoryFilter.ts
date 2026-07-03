import {
  equipmentSlots,
  type EquipmentSlot
} from "../services/equipmentService";

export const ONE_USE_INVENTORY_FILTER = "one-use";
export const ONE_USE_INVENTORY_FILTER_ICON = "1️⃣";

export type InventoryFilter = EquipmentSlot | typeof ONE_USE_INVENTORY_FILTER | null;

export function isInventoryEquipmentSlotFilter(filter: InventoryFilter): filter is EquipmentSlot {
  return equipmentSlots.includes(filter as EquipmentSlot);
}

export function isOneUseInventoryFilter(
  filter: InventoryFilter
): filter is typeof ONE_USE_INVENTORY_FILTER {
  return filter === ONE_USE_INVENTORY_FILTER;
}
