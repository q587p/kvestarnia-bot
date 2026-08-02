import type { DailyActionRepository } from "../db/repositories/dailyActionRepository";
import {
  CELLAR_GROWNUP_BOTTLE_KEY,
  CELLAR_GROWNUP_COMPLETION_KEY,
  CELLAR_GROWNUP_ONCE
} from "./cellarGrownupQuestService";
import { CELLAR_FOAMY_MIRAGE_BOTTLE_ITEM_ID } from "./itemGrant";

export async function isQuestConsumableUseUnlocked(
  dailyActions: Pick<DailyActionRepository, "findForTelegramUser">,
  telegramUserId: bigint,
  itemId: string
): Promise<boolean> {
  if (itemId !== CELLAR_FOAMY_MIRAGE_BOTTLE_ITEM_ID) {
    return true;
  }

  const [acquisition, completion] = await Promise.all([
    dailyActions.findForTelegramUser(telegramUserId, {
      key: CELLAR_GROWNUP_BOTTLE_KEY,
      localDate: CELLAR_GROWNUP_ONCE
    }),
    dailyActions.findForTelegramUser(telegramUserId, {
      key: CELLAR_GROWNUP_COMPLETION_KEY,
      localDate: CELLAR_GROWNUP_ONCE
    })
  ]);

  return !acquisition || readEnding(completion?.resultJson) === "keep";
}

function readEnding(value: unknown): string | null {
  return value && typeof value === "object" && !Array.isArray(value) && typeof (value as { ending?: unknown }).ending === "string"
    ? (value as { ending: string }).ending
    : null;
}
