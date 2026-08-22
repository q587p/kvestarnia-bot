import { Prisma, type PrismaClient } from "@prisma/client";

export type InventoryMutationTx = Prisma.TransactionClient;

const MAX_INVENTORY_TRANSACTION_ATTEMPTS = 3;

export class InventoryMutationContentionError extends Error {
  constructor(readonly cause: unknown) {
    super("Inventory mutation could not acquire its shared serialization point.");
  }
}

export async function runSerializableInventoryMutation<T>(
  prisma: PrismaClient,
  operation: (tx: InventoryMutationTx) => Promise<T>
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_INVENTORY_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 10_000
      });
    } catch (error) {
      if (!isRetryableInventoryContention(error)) throw error;
      if (attempt === MAX_INVENTORY_TRANSACTION_ATTEMPTS) {
        throw new InventoryMutationContentionError(error);
      }
    }
  }

  throw new Error("Inventory transaction retry loop exhausted unexpectedly.");
}

export async function lockInventoryItemStack(
  tx: InventoryMutationTx,
  characterId: string,
  itemId: string,
  now: Date
): Promise<void> {
  await tx.characterItem.updateMany({
    where: { characterId, itemId },
    data: { updatedAt: now }
  });
}

export async function lockInventoryItemStacks(
  tx: InventoryMutationTx,
  characterId: string,
  itemIds: readonly string[],
  now: Date
): Promise<void> {
  await tx.characterItem.updateMany({
    where: { characterId, itemId: { in: [...new Set(itemIds)] } },
    data: { updatedAt: now }
  });
}

function isRetryableInventoryContention(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2034" || error.code === "P2028";
  }

  const message = error instanceof Error ? error.message : String(error);
  return /SQLITE_BUSY|database is locked|write conflict|transaction.*closed/i.test(message);
}
