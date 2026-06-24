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
    select: { itemId: true }
  });
}
