import type { Prisma } from "@prisma/client";

type RemortCountDelegate = {
  characterRemort?: {
    count(input: { where: { characterId: string } }): Promise<number>;
  };
};

export async function countCharacterRemorts(
  tx: Prisma.TransactionClient,
  characterId: string
): Promise<number> {
  const delegate = (tx as unknown as RemortCountDelegate).characterRemort;

  if (!delegate) {
    return 0;
  }

  return delegate.count({
    where: {
      characterId
    }
  });
}

export function getIncludedRemortCount(character: { _count?: { remorts?: number } }): number {
  return character._count?.remorts ?? 0;
}
