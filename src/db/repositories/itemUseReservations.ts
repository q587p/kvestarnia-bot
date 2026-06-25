import { Prisma } from "@prisma/client";

type TxClient = Prisma.TransactionClient;

export function findActiveItemUseReservedItems(
  tx: TxClient,
  input: {
    characterId: string;
    now: Date;
    exceptOrderId?: string;
  }
): Promise<Array<{ itemId: string }>> {
  const itemUseOrder = (tx as TxClient & { itemUseOrder?: TxClient["itemUseOrder"] }).itemUseOrder;
  if (!itemUseOrder) {
    return Promise.resolve([]);
  }

  return itemUseOrder.findMany({
    where: {
      characterId: input.characterId,
      ...(input.exceptOrderId ? { id: { not: input.exceptOrderId } } : {}),
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
