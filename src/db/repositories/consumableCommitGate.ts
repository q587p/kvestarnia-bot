import { Prisma } from "@prisma/client";
import { isMedicalConsumableItemId } from "../../content/consumableManatkaUses";

const QUEST_BOTTLE_ITEM_ID = "item.cellar.foamy-mirage-bottle";

export async function isConsumableCommitAllowed(
  tx: Prisma.TransactionClient,
  input: {
    characterId: string;
    itemId: string;
    allowNonmedicalConsumables: boolean;
  }
): Promise<boolean> {
  if (!isMedicalConsumableItemId(input.itemId) && !input.allowNonmedicalConsumables) {
    return false;
  }
  if (input.itemId !== QUEST_BOTTLE_ITEM_ID) {
    return true;
  }

  const [acquisition, completion] = await Promise.all([
    tx.dailyAction.findUnique({
      where: {
        characterId_key_localDate: {
          characterId: input.characterId,
          key: "cellar.grownup.bottle",
          localDate: "once"
        }
      },
      select: { id: true }
    }),
    tx.dailyAction.findUnique({
      where: {
        characterId_key_localDate: {
          characterId: input.characterId,
          key: "cellar.grownup.completed",
          localDate: "once"
        }
      },
      select: { resultJson: true }
    })
  ]);

  return !acquisition || (
    isRecord(completion?.resultJson) &&
    completion.resultJson.ending === "keep"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
