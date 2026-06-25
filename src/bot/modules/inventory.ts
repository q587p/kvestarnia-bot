import { type Bot,type Context } from "grammy";
import { getMunchkinLocationAt } from "../../domain/levelBarter/munchkinSchedule";
import type { BotServices } from "../botServices";
import {
parseEquipmentCallbackData,
parseItemCallbackData,
type EquipmentCallback,
type ItemCallback
} from "../callbacks/itemCallbackData";
import {
parseItemUseCallbackData,
type ItemUseCallback
} from "../callbacks/itemUseCallbackData";
import {
parseLevelBarterCallbackData,
type LevelBarterCallback
} from "../callbacks/levelBarterCallbackData";
import {
parseMantokChestCallbackData,
type MantokChestCallback
} from "../callbacks/mantokChestCallbackData";
import { registerEquipmentCommand,sendEquipment } from "../commands/equipmentCommand";
import { registerInventoryCommand,sendInventory } from "../commands/inventoryCommand";
import { playerFromContext } from "../context";
import {
buildEquipItemResultKeyboard,
buildEquipmentKeyboard,
buildItemDetailKeyboard,
buildItemUsePreviewKeyboard,
buildItemUseResultKeyboard
} from "../keyboards/inventoryKeyboard";
import {
buildLevelBarterOfferKeyboard,
buildLevelBarterPreviewKeyboard,
buildLevelBarterResultKeyboard
} from "../keyboards/levelBarterKeyboard";
import {
buildMantokChestHelpKeyboard,
buildMantokChestManualSelectionKeyboard,
buildMantokChestOverviewKeyboard,
buildMantokChestPreviewKeyboard,
buildMantokChestResultKeyboard
} from "../keyboards/mantokChestKeyboard";
import { editPendingRaidBlockIfNeeded } from "../middleware/pendingRaidGuard";
import {
presentEquipItemResult,
presentEquipment,
presentUnequipSlotResult
} from "../presenters/equipmentPresenter";
import { presentItemDetail } from "../presenters/itemDetailPresenter";
import {
presentItemUseCancel,
presentItemUseConfirm,
presentItemUsePreview
} from "../presenters/itemUsePresenter";
import {
presentLevelBarterConfirmResult,
presentLevelBarterOffer,
presentLevelBarterPreview
} from "../presenters/levelBarterPresenter";
import {
presentMantokChestHelp,
presentMantokChestManualSelection,
presentMantokChestOverview,
presentMantokChestPreview,
presentMantokChestRecycleResult
} from "../presenters/mantokChestPresenter";
import {
presentInvalidCallback
} from "../presenters/onboardingPresenter";
import { safeAnswerCallbackQuery } from "../safeAnswerCallbackQuery";
import { safeEditMessageText } from "../safeEditMessageText";

import type { BotModuleDependencies } from "./types";

const HTML_MESSAGE_OPTIONS = {
  parse_mode: "HTML" as const
};

export function registerInventoryBotModule(
  bot: Bot,
  { services }: BotModuleDependencies
): void {
  registerInventoryCommand(bot, services.inventory);
  registerEquipmentCommand(bot, services.equipment);

  bot.callbackQuery(/^v1:equip:/, async (ctx) => {
    const parsed = parseEquipmentCallbackData(ctx.callbackQuery.data);

    if (!parsed.ok) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await handleEquipmentCallback(ctx, parsed.value, services);
  });

  bot.callbackQuery(/^v1:item:/, async (ctx) => {
    const parsed = parseItemCallbackData(ctx.callbackQuery.data);

    if (!parsed.ok) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await handleItemCallback(ctx, parsed.value, services);
  });

  bot.callbackQuery(/^v1:use:/, async (ctx) => {
    const parsed = parseItemUseCallbackData(ctx.callbackQuery.data);

    if (!parsed.ok) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await handleItemUseCallback(ctx, parsed.value, services);
  });

  bot.callbackQuery(/^v1:chest:/, async (ctx) => {
    const parsed = parseMantokChestCallbackData(ctx.callbackQuery.data);

    if (!parsed.ok) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await handleMantokChestCallback(ctx, parsed.value, services);
  });

  bot.callbackQuery(/^v1:lvlx:/, async (ctx) => {
    const parsed = parseLevelBarterCallbackData(ctx.callbackQuery.data);

    if (!parsed.ok) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await handleLevelBarterCallback(ctx, parsed.value, services);
  });
}

async function handleItemCallback(
  ctx: Context,
  action: ItemCallback,
  services: BotServices
): Promise<void> {
  if (action.type === "inventory") {
    await safeAnswerCallbackQuery(ctx);
    await sendInventory(ctx, services.inventory, "edit", action.page, action.slot, services.equipment);
    return;
  }

  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

  if (!telegramUserId) {
    await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
    return;
  }

  const result = await services.inventory.getItemForTelegramUser(telegramUserId, action.itemId);
  const equipment = await services.equipment.getEquipmentForTelegramUser(telegramUserId);
  const equipPreview = await services.equipment.previewItemEquipForTelegramUser(
    telegramUserId,
    action.itemId
  );
  const equippedSlot =
    equipment.state === "ready"
      ? (equipment.slots.find((slot) => slot.item?.itemId === action.itemId)?.slot ?? null)
      : null;
  const itemUse = result.state === "found"
    ? services.itemUse.getAvailability(result.item.content)
    : null;

  await safeAnswerCallbackQuery(ctx);
  await safeEditMessageText(ctx, presentItemDetail(result, { equippedSlot, equipPreview, itemUse }), {
    ...HTML_MESSAGE_OPTIONS,
    reply_markup: buildItemDetailKeyboard(result, equippedSlot, action.page, action.slot, {
      canUse: itemUse?.state === "usable"
    })
  });
}

async function handleItemUseCallback(
  ctx: Context,
  action: ItemUseCallback,
  services: BotServices
): Promise<void> {
  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

  if (!telegramUserId) {
    await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
    return;
  }

  if (action.type === "preview") {
    const result = await services.itemUse.createPreviewForTelegramUser(telegramUserId, action.itemId);

    await safeAnswerCallbackQuery(ctx, {
      show_alert:
        result.state === "combat-locked" ||
        result.state === "full-hp" ||
        result.state === "reserved"
    });
    await safeEditMessageText(ctx, presentItemUsePreview(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup:
        result.state === "preview-created" || result.state === "preview-replayed"
          ? buildItemUsePreviewKeyboard(result.order.token)
          : buildItemUseResultKeyboard()
    });
    return;
  }

  if (action.type === "cancel") {
    const result = await services.itemUse.cancelForTelegramUser(telegramUserId, action.token);

    await safeAnswerCallbackQuery(
      ctx,
      result.state === "cancelled" || result.state === "replayed"
        ? { text: "Скасовано." }
        : { show_alert: result.state === "invalid-token" }
    );
    await safeEditMessageText(ctx, presentItemUseCancel(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildItemUseResultKeyboard()
    });
    return;
  }

  const result = await services.itemUse.confirmForTelegramUser(telegramUserId, action.token);

  await safeAnswerCallbackQuery(
    ctx,
    result.state === "used"
      ? { text: "Бинт використано." }
      : result.state === "replayed"
        ? { text: "Уже записано." }
        : {
            show_alert:
              result.state === "invalid-token" ||
              result.state === "stale-selection" ||
              result.state === "combat-locked" ||
              result.state === "full-hp" ||
              result.state === "expired"
          }
  );
  await safeEditMessageText(ctx, presentItemUseConfirm(result), {
    ...HTML_MESSAGE_OPTIONS,
    reply_markup: buildItemUseResultKeyboard()
  });
}

async function handleEquipmentCallback(
  ctx: Context,
  action: EquipmentCallback,
  services: BotServices
): Promise<void> {
  if (action.type === "view") {
    await safeAnswerCallbackQuery(ctx);
    await sendEquipment(ctx, services.equipment, "edit");
    return;
  }

  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

  if (!telegramUserId) {
    await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
    return;
  }

  if (action.type === "equip-item") {
    const result = await services.equipment.equipItemForTelegramUser(
      telegramUserId,
      action.itemId
    );

    await safeAnswerCallbackQuery(ctx);

    if (result.state === "equipped") {
      const equipment = await services.equipment.getEquipmentForTelegramUser(telegramUserId);
      await safeEditMessageText(ctx, presentEquipment(equipment), {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildEquipmentKeyboard(equipment)
      });
      return;
    }

    await safeEditMessageText(ctx, presentEquipItemResult(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildEquipItemResultKeyboard()
    });
    return;
  }

  const result = await services.equipment.unequipSlotForTelegramUser(telegramUserId, action.slot);

  await safeAnswerCallbackQuery(ctx, {
    text: presentUnequipSlotResult(result),
    show_alert: result.state === "no-character"
  });

  const equipment =
    result.state === "no-character"
      ? await services.equipment.getEquipmentForTelegramUser(telegramUserId)
      : { state: "ready" as const, slots: result.slots };

  await safeEditMessageText(ctx, presentEquipment(equipment), {
    ...HTML_MESSAGE_OPTIONS,
    reply_markup: buildEquipmentKeyboard(equipment)
  });
}

async function handleMantokChestCallback(
  ctx: Context,
  action: MantokChestCallback,
  services: BotServices
): Promise<void> {
  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

  if (!telegramUserId) {
    await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
    return;
  }

  if (action.type === "inventory") {
    await safeAnswerCallbackQuery(ctx);
    await sendInventory(ctx, services.inventory, "edit");
    return;
  }

  if (action.type === "help") {
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentMantokChestHelp(), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildMantokChestHelpKeyboard()
    });
    return;
  }

  if (action.type === "open") {
    const overview = await services.mantokChest.getOverviewForTelegramUser(telegramUserId);

    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentMantokChestOverview(overview), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildMantokChestOverviewKeyboard()
    });
    return;
  }

  if (action.type === "auto") {
    const preview = await services.mantokChest.createAutoPickPreviewForTelegramUser(telegramUserId);

    await safeAnswerCallbackQuery(
      ctx,
      preview.state === "not-enough-items"
        ? { text: "Скрині треба 5 доступних манаток.", show_alert: true }
        : { show_alert: preview.state === "no-character" }
    );
    await safeEditMessageText(ctx, presentMantokChestPreview(preview), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup:
        preview.state === "preview-created"
          ? buildMantokChestPreviewKeyboard(preview.run.token)
          : buildMantokChestOverviewKeyboard()
    });
    return;
  }

  if (action.type === "manual") {
    const selection = await services.mantokChest.startManualSelectionForTelegramUser(telegramUserId);

    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentMantokChestManualSelection(selection), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup:
        selection.state === "selection"
          ? buildMantokChestManualSelectionKeyboard(selection)
          : buildMantokChestOverviewKeyboard()
    });
    return;
  }

  if (action.type === "page") {
    const selection = await services.mantokChest.getManualSelectionForTelegramUser(
      telegramUserId,
      action.token,
      action.page
    );

    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentMantokChestManualSelection(selection), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup:
        selection.state === "selection"
          ? buildMantokChestManualSelectionKeyboard(selection)
          : buildMantokChestOverviewKeyboard()
    });
    return;
  }

  if (action.type === "add" || action.type === "remove") {
    const selection =
      action.type === "add"
        ? await services.mantokChest.addManualSelectionUnitForTelegramUser(telegramUserId, action)
        : await services.mantokChest.removeManualSelectionUnitForTelegramUser(telegramUserId, action);

    await safeAnswerCallbackQuery(
      ctx,
      selection.state === "selection" && selection.selectedCount === selection.requiredCount
        ? { text: "На виделці рівно 5 манаток." }
        : undefined
    );
    await safeEditMessageText(ctx, presentMantokChestManualSelection(selection), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup:
        selection.state === "selection"
          ? buildMantokChestManualSelectionKeyboard(selection)
          : buildMantokChestOverviewKeyboard()
    });
    return;
  }

  if (action.type === "preview") {
    const preview = await services.mantokChest.getManualPreviewForTelegramUser(
      telegramUserId,
      action.token
    );

    await safeAnswerCallbackQuery(
      ctx,
      preview.state === "selection-incomplete"
        ? { text: "Скрині треба рівно 5 манаток.", show_alert: true }
        : { show_alert: preview.state !== "preview-created" }
    );
    await safeEditMessageText(ctx, presentMantokChestPreview(preview), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup:
        preview.state === "preview-created"
          ? buildMantokChestPreviewKeyboard(preview.run.token)
          : buildMantokChestOverviewKeyboard()
    });
    return;
  }

  if (action.type === "cancel") {
    const result = await services.mantokChest.cancelRecycleForTelegramUser(
      telegramUserId,
      action.token
    );

    await safeAnswerCallbackQuery(ctx, {
      text: result.state === "cancelled" ? "Скриня відпустила манатки." : presentInvalidCallback(),
      show_alert: result.state !== "cancelled"
    });

    const overview = await services.mantokChest.getOverviewForTelegramUser(telegramUserId);
    await safeEditMessageText(ctx, presentMantokChestOverview(overview), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildMantokChestOverviewKeyboard()
    });
    return;
  }

  const result = await services.mantokChest.confirmRecycleForTelegramUser(
    telegramUserId,
    action.token
  );

  await safeAnswerCallbackQuery(
    ctx,
    result.state === "recycled"
      ? { text: "Скриня хрумкнула." }
      : {
          show_alert:
            result.state === "invalid-token" ||
            result.state === "stale-inputs" ||
            result.state === "expired"
        }
  );
  const outputItem =
    result.state === "recycled" || result.state === "replayed" ? result.outputItem : null;

  await safeEditMessageText(ctx, presentMantokChestRecycleResult(result), {
    ...HTML_MESSAGE_OPTIONS,
    reply_markup: buildMantokChestResultKeyboard(outputItem)
  });
}

async function handleLevelBarterCallback(
  ctx: Context,
  action: LevelBarterCallback,
  services: BotServices
): Promise<void> {
  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

  if (!telegramUserId) {
    await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
    return;
  }

  if (await editPendingRaidBlockIfNeeded(ctx, telegramUserId, services.tavern)) {
    return;
  }

  const levelBarterReturnOptions = {
    munchkinLocation: getMunchkinLocationAt(new Date())
  };

  if (action.type === "open") {
    const offer = await services.levelBarter.getOfferForTelegramUser(telegramUserId);

    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentLevelBarterOffer(offer), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildLevelBarterOfferKeyboard(levelBarterReturnOptions)
    });
    return;
  }

  if (action.type === "auto") {
    const preview = await services.levelBarter.createAutoPreviewForTelegramUser(telegramUserId);

    await safeAnswerCallbackQuery(
      ctx,
      preview.state === "insufficient"
        ? { text: "Манчкінові ще не вистачає добра на рівень.", show_alert: true }
        : { show_alert: preview.state === "no-character" || preview.state === "battle-only-level" }
    );
    await safeEditMessageText(ctx, presentLevelBarterPreview(preview), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildLevelBarterPreviewKeyboard(preview, levelBarterReturnOptions)
    });
    return;
  }

  const result = await services.levelBarter.confirmAutoExchangeForTelegramUser(
    telegramUserId,
    action.token
  );

  await safeAnswerCallbackQuery(
    ctx,
    result.state === "exchanged" || result.state === "replayed"
      ? { text: result.state === "replayed" ? "Цей обмін уже записано." : "Манчкін підкинув рівень." }
      : { show_alert: result.state !== "stale-selection" }
  );
  await safeEditMessageText(ctx, presentLevelBarterConfirmResult(result), {
    ...HTML_MESSAGE_OPTIONS,
    reply_markup: buildLevelBarterResultKeyboard(levelBarterReturnOptions)
  });
}
