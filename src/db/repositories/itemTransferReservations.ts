import { Prisma } from "@prisma/client";

type TxClient = Prisma.TransactionClient;

export function findActiveTransferReservedItems(
  tx: TxClient,
  input: {
    senderCharacterId: string;
    now: Date;
    exceptTransferId?: string;
  }
): Promise<Array<{ itemId: string }>> {
  const itemTransfer = (tx as TxClient & { itemTransfer?: TxClient["itemTransfer"] }).itemTransfer;
  if (!itemTransfer) {
    return Promise.resolve([]);
  }

  return itemTransfer.findMany({
    where: {
      senderCharacterId: input.senderCharacterId,
      ...(input.exceptTransferId ? { id: { not: input.exceptTransferId } } : {}),
      OR: [
        { status: "processing" },
        {
          status: "pending",
          expiresAt: { gt: input.now }
        }
      ]
    },
    select: { itemId: true, packageJson: true }
  }).then((rows) => {
    const reserved = new Set<string>();
    for (const row of rows) {
      reserved.add(row.itemId);
      for (const itemId of parsePackageItemIds(row.packageJson)) {
        reserved.add(itemId);
      }
    }

    return [...reserved].map((itemId) => ({ itemId }));
  });
}

export async function findAllActiveReservedItemIds(
  tx: TxClient,
  input: { characterId: string; now: Date }
): Promise<string[]> {
  const client = tx as TxClient & {
    mantokChestRun?: TxClient["mantokChestRun"];
    levelBarterExchange?: TxClient["levelBarterExchange"];
    korchmaMantokSale?: TxClient["korchmaMantokSale"];
    itemUseOrder?: TxClient["itemUseOrder"];
  };
  const [chests, barters, sales, transfers, uses] = await Promise.all([
    client.mantokChestRun?.findMany({
      where: { characterId: input.characterId, status: "pending" },
      select: { inputItemsJson: true }
    }) ?? [],
    client.levelBarterExchange?.findMany({
      where: { characterId: input.characterId, status: "pending" },
      select: { inputItemsJson: true }
    }) ?? [],
    client.korchmaMantokSale?.findMany({
      where: {
        characterId: input.characterId,
        status: { in: ["pending", "processing"] },
        expiresAt: { gt: input.now }
      },
      select: { selectionJson: true }
    }) ?? [],
    findActiveTransferReservedItems(tx, { senderCharacterId: input.characterId, now: input.now }),
    client.itemUseOrder?.findMany({
      where: {
        characterId: input.characterId,
        status: { in: ["pending", "processing"] },
        expiresAt: { gt: input.now }
      },
      select: { itemId: true }
    }) ?? []
  ]);
  const reserved = new Set<string>();
  for (const row of chests) addJsonItemIds(reserved, row.inputItemsJson);
  for (const row of barters) addJsonItemIds(reserved, row.inputItemsJson);
  for (const row of sales) addJsonItemIds(reserved, row.selectionJson);
  for (const row of transfers) reserved.add(row.itemId);
  for (const row of uses) reserved.add(row.itemId);
  return [...reserved];
}

function addJsonItemIds(target: Set<string>, value: unknown): void {
  if (!Array.isArray(value)) return;
  for (const entry of value) {
    if (entry && typeof entry === "object" && typeof (entry as { itemId?: unknown }).itemId === "string") {
      target.add((entry as { itemId: string }).itemId);
    }
  }
}

function parsePackageItemIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) =>
    typeof entry === "object" &&
    entry !== null &&
    typeof (entry as { itemId?: unknown }).itemId === "string"
      ? [(entry as { itemId: string }).itemId]
      : []
  );
}
