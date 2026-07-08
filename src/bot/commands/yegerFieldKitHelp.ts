import type { BotServices } from "../botServices";
import { safeOptionalUiLookup } from "../optionalUiLookup";

export type YegerFieldKitHelpState =
  | { state: "hidden" }
  | { state: "needs-yeger-boards" }
  | { state: "can-craft-kit" }
  | { state: "has-field-kit" };

type YegerFieldKitHelpServices = Pick<BotServices, "itemCraft" | "itemUpgrades">;

export async function getYegerFieldKitHelpStateForTelegramUser(
  telegramUserId: bigint,
  services: YegerFieldKitHelpServices
): Promise<YegerFieldKitHelpState> {
  return safeOptionalUiLookup("yeger field-kit help", async () => {
    if (
      typeof services.itemUpgrades?.getUnlockQuestForTelegramUser !== "function" ||
      typeof services.itemCraft?.previewForTelegramUser !== "function"
    ) {
      return { state: "hidden" };
    }

    const unlockQuest = await services.itemUpgrades.getUnlockQuestForTelegramUser(telegramUserId);
    if (unlockQuest.state !== "unlock-required") {
      return { state: "hidden" };
    }

    if (unlockQuest.fieldKitQuantity > 0) {
      return { state: "has-field-kit" };
    }

    const kitPreview = await services.itemCraft.previewForTelegramUser(telegramUserId, "kit");

    return kitPreview.state === "locked"
      ? { state: "needs-yeger-boards" }
      : { state: "can-craft-kit" };
  }, { state: "hidden" });
}

export async function shouldShowYegerFieldKitHelp(
  telegramUserId: bigint,
  services: YegerFieldKitHelpServices
): Promise<boolean> {
  const state = await getYegerFieldKitHelpStateForTelegramUser(telegramUserId, services);

  return state.state !== "hidden";
}
