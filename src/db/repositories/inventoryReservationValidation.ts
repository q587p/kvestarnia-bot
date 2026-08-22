import { Prisma } from "@prisma/client";
import { findAllActiveReservedItemIds } from "./itemTransferReservations";

type TxClient = Prisma.TransactionClient;

export interface InventoryReservationExclusions {
  exceptMantokChestRunId?: string;
  exceptLevelBarterExchangeId?: string;
  exceptKorchmaMantokSaleId?: string;
  exceptTransferId?: string;
  exceptItemUseOrderId?: string;
}

export async function isInventorySelectionAvailable(
  tx: TxClient,
  input: {
    characterId: string;
    items: ReadonlyArray<{ itemId: string; quantity: number }>;
    now: Date;
    exclusions?: InventoryReservationExclusions;
  }
): Promise<boolean> {
  const quantities = new Map<string, number>();
  for (const item of input.items) {
    if (!item.itemId || !Number.isInteger(item.quantity) || item.quantity <= 0) return false;
    quantities.set(item.itemId, (quantities.get(item.itemId) ?? 0) + item.quantity);
  }
  if (quantities.size === 0) return true;

  const itemIds = [...quantities.keys()];
  const [stacks, equipment, reservedItemIds] = await Promise.all([
    tx.characterItem.findMany({
      where: { characterId: input.characterId, itemId: { in: itemIds } },
      select: { itemId: true, quantity: true }
    }),
    tx.characterEquipment.findMany({
      where: { characterId: input.characterId, itemId: { in: itemIds } },
      select: { itemId: true }
    }),
    findAllActiveReservedItemIds(tx, {
      characterId: input.characterId,
      now: input.now,
      ...input.exclusions
    })
  ]);
  const stackQuantities = new Map(stacks.map((stack) => [stack.itemId, stack.quantity]));
  const unavailableIds = new Set([
    ...equipment.map((row) => row.itemId),
    ...reservedItemIds
  ]);

  return itemIds.every((itemId) =>
    !unavailableIds.has(itemId) && (stackQuantities.get(itemId) ?? 0) >= (quantities.get(itemId) ?? 0)
  );
}
