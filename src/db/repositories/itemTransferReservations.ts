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
