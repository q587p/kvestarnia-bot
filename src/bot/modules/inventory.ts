import { type Bot,type Context } from "grammy";
import { findItemContent } from "../../content/itemLookup";
import { getItemUseEffect } from "../../domain/itemUse";
import { RESPONSIBLE_PANIC_BANDAGE_ITEM_ID } from "../../domain/itemCraft";
import { getMunchkinLocationAt } from "../../domain/levelBarter/munchkinSchedule";
import { getCombatUsableItem } from "../../services/combatItemUse";
import { isEquippableItem } from "../../services/equipmentService";
import type { BotServices } from "../botServices";
import { registerParsedCallbackRoute } from "../callbackRoute";
import {
parseEquipmentCallbackData,
parseItemCallbackData,
type EquipmentCallback,
type ItemCallback
} from "../callbacks/itemCallbackData";
import {
parseItemCraftCallbackData,
type ItemCraftCallback
} from "../callbacks/itemCraftCallbackData";
import {
parseItemUpgradeCallbackData,
type ItemUpgradeCallback
} from "../callbacks/itemUpgradeCallbackData";
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
import { sendItemUpgradeList } from "../commands/itemUpgradeCommand";
import { playerFromContext } from "../context";
import {
getInventoryPagePromptPlaceholder,
parseInventoryPageNumber,
parseInventoryPagePrompt,
presentInventoryPagePrompt
} from "../inventoryPagePrompt";
import {
getItemUpgradePagePromptPlaceholder,
parseItemUpgradePageNumber,
parseItemUpgradePagePrompt,
presentItemUpgradePagePrompt
} from "../itemUpgradePagePrompt";
import {
buildEquipItemResultKeyboard,
buildEquipmentKeyboard,
buildItemCraftPreviewKeyboard,
buildItemCraftResultKeyboard,
buildItemDetailKeyboard,
buildItemUsePreviewKeyboard,
buildItemUseResultKeyboard
} from "../keyboards/inventoryKeyboard";
import {
buildItemUpgradePreviewKeyboard,
buildItemUpgradeResultKeyboard,
buildItemUpgradeUnlockResultKeyboard
} from "../keyboards/itemUpgradeKeyboard";
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
import { isInventoryEquipmentSlotFilter } from "../inventoryFilter";
import { editPendingRaidBlockIfNeeded } from "../middleware/pendingRaidGuard";
import { startPerfSpan } from "../performanceLogger";
import { presentAchievementUnlockNotification } from "../presenters/achievementPresenter";
import {
presentEquipItemResult,
presentEquipment,
presentUnequipSlotResult
} from "../presenters/equipmentPresenter";
import { presentItemDetail } from "../presenters/itemDetailPresenter";
import {
presentItemCraftPreview,
presentItemCraftResult
} from "../presenters/itemCraftPresenter";
import {
presentItemUpgradeAttempt,
presentItemUpgradePreview,
presentItemUpgradeUnlock
} from "../presenters/itemUpgradePresenter";
import {
presentItemUseCancel,
presentItemUseConfirm,
presentItemUsePreview,
presentItemUseRestoreToFull
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

import {
guardActivePassageSearchCommand,
showActivePassageSearchIfNeeded
} from "./passageSearchGuard";
import type { BotModuleDependencies } from "./types";

const HTML_MESSAGE_OPTIONS = {
  parse_mode: "HTML" as const
};

function startCallbackTiming(route: string, telegramUserId: bigint) {
  const span = startPerfSpan(route, { telegramUserId });

  return {
    measureDb: <T>(operation: () => Promise<T>) => span.measureDb(operation),
    measureCompute: <T>(operation: () => T) => span.measureCompute(operation),
    measureTelegram: <T>(operation: () => Promise<T>) => span.measureTelegramEdit(operation),
    log(fields: {
      itemCount?: number | null;
      filter?: string | null;
      sort?: string | null;
      page?: number | null;
    } = {}): void {
      span.end(fields);
    }
  };
}

export function registerInventoryBotModule(
  bot: Bot,
  { services }: BotModuleDependencies
): void {
  bot.command(["inventory", "items", "bag", "equipment", "gear", "equip"], async (ctx, next) => {
    await guardActivePassageSearchCommand(ctx, services, next);
  });

  bot.on("message:text", async (ctx, next) => {
    if (await handleInventoryPageReply(ctx, services)) {
      return;
    }

    await next();
  });

  registerInventoryCommand(bot, services.inventory, services.equipment);
  registerEquipmentCommand(bot, services.equipment);

  registerParsedCallbackRoute(bot, /^v1:equip:/, parseEquipmentCallbackData, async (ctx, action) => {
    await handleEquipmentCallback(ctx, action, services);
  });

  registerParsedCallbackRoute(bot, /^v1:item:/, parseItemCallbackData, async (ctx, action) => {
    await handleItemCallback(ctx, action, services);
  });

  registerParsedCallbackRoute(bot, /^v1:use:/, parseItemUseCallbackData, async (ctx, action) => {
    await handleItemUseCallback(ctx, action, services);
  });

  registerParsedCallbackRoute(bot, /^v1:craft:/, parseItemCraftCallbackData, async (ctx, action) => {
    await handleItemCraftCallback(ctx, action, services);
  });

  registerParsedCallbackRoute(bot, /^v1:up:/, parseItemUpgradeCallbackData, async (ctx, action) => {
    await handleItemUpgradeCallback(ctx, action, services);
  });

  registerParsedCallbackRoute(bot, /^v1:chest:/, parseMantokChestCallbackData, async (ctx, action) => {
    await handleMantokChestCallback(ctx, action, services);
  });

  registerParsedCallbackRoute(bot, /^v1:lvlx:/, parseLevelBarterCallbackData, async (ctx, action) => {
    await handleLevelBarterCallback(ctx, action, services);
  });
}

async function handleItemCallback(
  ctx: Context,
  action: ItemCallback,
  services: BotServices
): Promise<void> {
  if (action.type === "inventory") {
    await safeAnswerCallbackQuery(ctx);
    await sendInventory(ctx, services.inventory, "edit", action.page, action.filter, services.equipment, action.sort);
    return;
  }

  if (action.type === "page-prompt") {
    await safeAnswerCallbackQuery(ctx, {
      text: "Напишіть номер сторінки у відповідь на підказку.",
      show_alert: false
    });
    await ctx.reply(presentInventoryPagePrompt(action.filter, action.totalPages, action.sort), {
      reply_markup: {
        force_reply: true,
        input_field_placeholder: getInventoryPagePromptPlaceholder(action.totalPages)
      }
    });
    return;
  }

  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

  if (!telegramUserId) {
    await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
    return;
  }

  if (await showActivePassageSearchIfNeeded(ctx, services, telegramUserId, "edit")) {
    return;
  }

  const perf = startPerfSpan("item.detail", { telegramUserId });
  const { result, equipment, equipPreview, craftOptions } = await perf.measureDb(async () => {
    const itemResult = await services.inventory.getItemForTelegramUser(telegramUserId, action.itemId);
    const targetSlot = isInventoryEquipmentSlotFilter(action.filter) ? action.filter : null;
    const canPreviewEquip = itemResult.state === "found" && isEquippableItem(itemResult.item.content);
    const shouldCheckCraftOptions =
      itemResult.state === "found" && itemResult.item.itemId === RESPONSIBLE_PANIC_BANDAGE_ITEM_ID;
    const equipmentPromise = itemResult.state === "found"
      ? services.equipment.getEquipmentForTelegramUser(telegramUserId)
      : Promise.resolve({ state: "no-character" as const });
    const equipPreviewPromise = canPreviewEquip
      ? services.equipment.previewItemEquipForTelegramUser(telegramUserId, action.itemId, targetSlot)
      : Promise.resolve(null);
    const craftOptionsPromise = shouldCheckCraftOptions
      ? services.itemCraft.getCraftOptionsForTelegramUser(telegramUserId, itemResult.item.itemId)
      : Promise.resolve([]);
    const [equipmentResult, previewResult, craftOptionResults] = await Promise.all([
      equipmentPromise,
      equipPreviewPromise,
      craftOptionsPromise
    ]);
    return {
      result: itemResult,
      equipment: equipmentResult,
      equipPreview: previewResult,
      craftOptions: craftOptionResults
    };
  });
  const itemUse = perf.measureCompute(() => result.state === "found"
    ? services.itemUse.getAvailability(result.item.content)
    : null);
  const combatUse = await perf.measureDb(() => result.state === "found" && itemUse?.state === "usable"
    ? getCombatUseStateForItem(services, telegramUserId, result.item.content)
    : Promise.resolve(null));
  const { text, keyboard } = perf.measureCompute(() => {
    const equippedSlot =
      equipment.state === "ready"
        ? (equipment.slots.find((slot) => slot.item?.itemId === action.itemId)?.slot ?? null)
        : null;
    const equippedItemIds =
      equipment.state === "ready"
        ? [...new Set(equipment.slots.flatMap((slot) => (slot.item ? [slot.item.itemId] : [])))]
        : [];
    const canUse = itemUse?.state === "usable" && !(combatUse?.combatLocked && !combatUse.action);

    return {
      text: presentItemDetail(result, {
        equippedSlot,
        equipPreview,
        itemUse,
        combatUseAvailable: Boolean(combatUse?.action),
        equippedItemIds
      }),
      keyboard: buildItemDetailKeyboard(result, equippedSlot, action.page, action.filter, {
        canUse,
        ...(combatUse?.action ? { combatUse: combatUse.action } : {}),
        craftOptions,
        equipPreview,
        sort: action.sort,
        source: action.source
      })
    };
  });

  await perf.measureTelegram(() => safeAnswerCallbackQuery(ctx));
  await perf.measureTelegramEdit(() => safeEditMessageText(
    ctx,
    text,
    {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: keyboard
    }
  ));
  perf.end({
    itemCount: result.state === "found" ? result.item.quantity : 0,
    filter: action.filter,
    sort: action.sort,
    page: action.page
  });
}

async function handleInventoryPageReply(
  ctx: Context,
  services: BotServices
): Promise<boolean> {
  const replyText = ctx.message?.reply_to_message?.text;
  const prompt = parseInventoryPagePrompt(replyText);

  if (prompt) {
    const pageNumber = parseInventoryPageNumber(ctx.message?.text, prompt.totalPages);

    if (pageNumber === null) {
      await ctx.reply(`Введіть число від 1 до ${prompt.totalPages}.`);
      return true;
    }

    await sendInventory(ctx, services.inventory, "reply", pageNumber - 1, prompt.filter, services.equipment, prompt.sort);
    return true;
  }

  const itemUpgradePrompt = parseItemUpgradePagePrompt(replyText);
  if (!itemUpgradePrompt) {
    return false;
  }

  const pageNumber = parseItemUpgradePageNumber(ctx.message?.text, itemUpgradePrompt.totalPages);

  if (pageNumber === null) {
    await ctx.reply(`Введіть число від 1 до ${itemUpgradePrompt.totalPages}.`);
    return true;
  }

  await sendItemUpgradeList(ctx, services.itemUpgrades, "reply", pageNumber - 1, itemUpgradePrompt.sort);
  return true;
}

async function getCombatUseStateForItem(
  services: BotServices,
  telegramUserId: bigint,
  item: Parameters<typeof getCombatUsableItem>[0]
): Promise<{
  action:
    | { kind: "fight"; sessionId: string; turn: number; itemKey: string }
    | { kind: "party-boss"; token: string; turn: number; itemKey: string }
    | null;
  combatLocked: boolean;
}> {
  const combatItem = getCombatUsableItem(item);
  if (!combatItem || typeof services.fight.getFightOverviewForTelegramUser !== "function") {
    return { action: null, combatLocked: false };
  }

  const fight = await services.fight.getFightOverviewForTelegramUser(telegramUserId);
  if (fight.state !== "persistent-active" || fight.session.state?.status !== "active") {
    const partyBoss = await services.partyBoss?.getActiveForTelegramUser(telegramUserId);
    if (partyBoss?.status === "active") {
      const viewer = partyBoss.state.participants.find((participant) =>
        partyBoss.participants.some((snapshot) =>
          snapshot.telegramUserId === telegramUserId &&
          snapshot.id === participant.characterId
        )
      );

      return {
        action: viewer?.status === "active" && viewer.resources.hp > 0
          ? {
              kind: "party-boss",
              token: partyBoss.partyInviteToken,
              turn: partyBoss.turn,
              itemKey: combatItem.key
            }
          : null,
        combatLocked: true
      };
    }

    return {
      action: null,
      combatLocked: fight.state === "combat-blocked" || fight.state === "training-active"
    };
  }

  return {
    action: {
      kind: "fight",
      sessionId: fight.session.id,
      turn: fight.session.state.turn,
      itemKey: combatItem.key
    },
    combatLocked: true
  };
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

  if (await showActivePassageSearchIfNeeded(ctx, services, telegramUserId, "edit")) {
    return;
  }

  if (action.type === "preview") {
    const result = await services.itemUse.createPreviewForTelegramUser(telegramUserId, action.itemId);
    const combatUseAvailable = result.state === "combat-locked"
      ? await hasCombatUseActionForItemId(services, telegramUserId, action.itemId)
      : false;

    await safeAnswerCallbackQuery(ctx, {
      show_alert:
        result.state === "combat-locked" ||
        result.state === "full-hp" ||
        result.state === "reserved"
    });
    await safeEditMessageText(ctx, presentItemUsePreview(result, { combatUseAvailable }), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup:
        result.state === "preview-created" || result.state === "preview-replayed"
          ? buildItemUsePreviewKeyboard(result.order.token)
          : buildItemUseResultKeyboard(result.state === "full-hp" ? { detailItemId: action.itemId } : {})
    });
    return;
  }

  if (action.type === "cancel") {
    const result = await services.itemUse.cancelForTelegramUser(telegramUserId, action.token);

    await safeAnswerCallbackQuery(
      ctx,
      result.state === "cancelled" || result.state === "replayed"
        ? { text: "Скасовано." }
        : { show_alert: result.state === "invalid-token" || result.state === "stale-selection" }
    );
    await safeEditMessageText(ctx, presentItemUseCancel(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildItemUseResultKeyboard()
    });
    return;
  }

  if (action.type === "restore-to-full") {
    const result = await services.itemUse.restoreToFullForTelegramUser(telegramUserId, action.itemId);
    const combatUseAvailable = result.state === "combat-locked"
      ? await hasCombatUseActionForItemId(services, telegramUserId, action.itemId)
      : false;

    await safeAnswerCallbackQuery(
      ctx,
      result.state === "preview-created" || result.state === "preview-replayed"
        ? undefined
        : {
            show_alert:
              result.state === "not-owned" ||
              result.state === "not-usable" ||
              result.state === "reserved" ||
              result.state === "not-enough" ||
              result.state === "combat-locked"
          }
    );
    await safeEditMessageText(ctx, presentItemUseRestoreToFull(result, { combatUseAvailable }), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup:
        result.state === "preview-created" || result.state === "preview-replayed"
          ? buildItemUsePreviewKeyboard(result.order.token)
          : buildItemUseResultKeyboard(result.state === "full-hp" ? { detailItemId: action.itemId } : {})
    });
    return;
  }

  const result = await services.itemUse.confirmForTelegramUser(telegramUserId, action.token);
  const repeat = await getRepeatItemUseOptions(services, telegramUserId, result);
  const combatUseAvailable = result.state === "combat-locked"
    ? await hasCombatUseActionForItemId(services, telegramUserId, result.order.itemId)
    : false;

  await safeAnswerCallbackQuery(
    ctx,
    result.state === "used"
      ? { text: "Манатку використано." }
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
  await safeEditMessageText(ctx, presentItemUseConfirm(result, { combatUseAvailable }), {
    ...HTML_MESSAGE_OPTIONS,
    reply_markup: buildItemUseResultKeyboard(
      result.state === "full-hp"
        ? { detailItemId: result.order.itemId }
        : repeat
    )
  });
  const achievementText = presentAchievementUnlockNotification(result.achievementUnlocks ?? []);
  if (achievementText) {
    await ctx.reply(achievementText, HTML_MESSAGE_OPTIONS);
  }
}

async function handleItemCraftCallback(
  ctx: Context,
  action: ItemCraftCallback,
  services: BotServices
): Promise<void> {
  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

  if (!telegramUserId) {
    await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
    return;
  }

  if (await showActivePassageSearchIfNeeded(ctx, services, telegramUserId, "edit")) {
    return;
  }

  if (action.type === "preview") {
    const result = await services.itemCraft.previewForTelegramUser(telegramUserId, action.recipeCode);

    await safeAnswerCallbackQuery(ctx, {
      show_alert:
        result.state === "locked" ||
        result.state === "combat-locked" ||
        result.state === "not-enough"
    });
    await safeEditMessageText(ctx, presentItemCraftPreview(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup:
        result.state === "preview"
          ? buildItemCraftPreviewKeyboard(action.recipeCode)
          : buildItemCraftResultKeyboard()
    });
    return;
  }

  const result = await services.itemCraft.craftForTelegramUser(telegramUserId, action.recipeCode);

  await safeAnswerCallbackQuery(
    ctx,
    result.state === "crafted"
      ? { text: "Створено." }
      : {
          show_alert:
            result.state === "locked" ||
            result.state === "combat-locked" ||
            result.state === "not-enough"
        }
  );
  await safeEditMessageText(ctx, presentItemCraftResult(result), {
    ...HTML_MESSAGE_OPTIONS,
    reply_markup: buildItemCraftResultKeyboard(
      result.state === "crafted" && result.remainingSourceQuantity >= result.recipe.sourceQuantity
        ? { repeatRecipeCode: result.recipe.code }
        : undefined
    )
  });
  const achievementText = presentAchievementUnlockNotification(
    result.state === "crafted" ? result.achievementUnlocks ?? [] : []
  );
  if (achievementText) {
    await ctx.reply(achievementText, HTML_MESSAGE_OPTIONS);
  }
}

async function handleItemUpgradeCallback(
  ctx: Context,
  action: ItemUpgradeCallback,
  services: BotServices
): Promise<void> {
  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

  if (!telegramUserId) {
    await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
    return;
  }

  if (await showActivePassageSearchIfNeeded(ctx, services, telegramUserId, "edit")) {
    return;
  }

  if (action.type === "list") {
    await safeAnswerCallbackQuery(ctx);
    await sendItemUpgradeList(ctx, services.itemUpgrades, "edit", action.page, action.sort);
    return;
  }

  if (action.type === "page-prompt") {
    await safeAnswerCallbackQuery(ctx, {
      text: "Напишіть номер сторінки у відповідь на підказку.",
      show_alert: false
    });
    await ctx.reply(presentItemUpgradePagePrompt(action.totalPages, action.sort), {
      reply_markup: {
        force_reply: true,
        input_field_placeholder: getItemUpgradePagePromptPlaceholder(action.totalPages)
      }
    });
    return;
  }

  if (action.type === "unlock") {
    const result = await services.itemUpgrades.unlockForTelegramUser(telegramUserId);

    await safeAnswerCallbackQuery(
      ctx,
      result.state === "unlocked"
        ? { text: "Чароковальню відкрито." }
        : result.state === "already-unlocked"
          ? { text: "Уже відкрито." }
          : {
              show_alert:
                result.state === "wrong-place" ||
                result.state === "level-locked" ||
                result.state === "missing-field-kit"
            }
    );
    await safeEditMessageText(ctx, presentItemUpgradeUnlock(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildItemUpgradeUnlockResultKeyboard(result)
    });
    return;
  }

  if (action.type === "preview") {
    const timing = startCallbackTiming("item-upgrade.preview", telegramUserId);
    const result = await timing.measureDb(() => services.itemUpgrades.previewForTelegramUser(
      telegramUserId,
      action.itemId,
      action.method,
      action.donorItemId
    ));
    const rendered = timing.measureCompute(() => ({
      text: presentItemUpgradePreview(result),
      replyMarkup: buildItemUpgradePreviewKeyboard(result)
    }));

    await timing.measureTelegram(() => safeAnswerCallbackQuery(ctx, {
      show_alert:
        result.state === "not-owned" ||
        result.state === "not-upgradeable" ||
        result.state === "cap-reached" ||
        result.state === "wrong-place" ||
        result.state === "level-locked" ||
        result.state === "unlock-required"
    }));
    await timing.measureTelegram(() => safeEditMessageText(ctx, rendered.text, {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: rendered.replyMarkup
    }));
    timing.log({
      itemCount: result.state === "ready" ? result.item.quantity : 0
    });
    return;
  }

  const timing = startCallbackTiming("item-upgrade.attempt", telegramUserId);
  const result = await timing.measureDb(() => services.itemUpgrades.attemptForTelegramUser(telegramUserId, {
    itemId: action.itemId,
    method: action.method,
    donorItemId: action.donorItemId,
    attemptGuard: action.attemptGuard,
    expectedFromLevel: action.expectedFromLevel,
    expectedQuantity: action.expectedQuantity,
    expectedPityFailures: action.expectedPityFailures
  }));
  const rendered = timing.measureCompute(() => ({
    text: presentItemUpgradeAttempt(result),
    replyMarkup: buildItemUpgradeResultKeyboard(result.state === "attempted" ? result.item.itemId : action.itemId)
  }));

  await timing.measureTelegram(() => safeAnswerCallbackQuery(
    ctx,
    result.state === "attempted"
      ? { text: result.success ? "Підсилено." : "Спроба записана." }
      : {
          show_alert:
            result.state === "stale-snapshot" ||
            result.state === "invalid-donor" ||
            result.state === "not-enough-gold" ||
            result.state === "not-enough-iskrokamin" ||
            result.state === "not-enough-mana" ||
            result.state === "class-not-allowed" ||
            result.state === "wrong-place" ||
            result.state === "level-locked" ||
            result.state === "unlock-required"
        }
  ));
  await timing.measureTelegram(() => safeEditMessageText(ctx, rendered.text, {
    ...HTML_MESSAGE_OPTIONS,
    reply_markup: rendered.replyMarkup
  }));
  const achievementText = timing.measureCompute(() => presentAchievementUnlockNotification(
    result.state === "attempted" ? result.achievementUnlocks ?? [] : []
  ));
  if (achievementText) {
    await timing.measureTelegram(() => ctx.reply(achievementText, HTML_MESSAGE_OPTIONS));
  }
  timing.log({
    itemCount: result.state === "attempted" ? result.item.quantity : 0
  });
}

async function hasCombatUseActionForItemId(
  services: BotServices,
  telegramUserId: bigint,
  itemId: string
): Promise<boolean> {
  const item = findItemContent(itemId);
  if (!item) {
    return false;
  }

  return (await getCombatUseStateForItem(services, telegramUserId, item)).action !== null;
}

async function getRepeatItemUseOptions(
  services: BotServices,
  telegramUserId: bigint,
  result: Awaited<ReturnType<BotServices["itemUse"]["confirmForTelegramUser"]>>
): Promise<{ repeatItemId?: string | null; restoreToFullItemId?: string | null }> {
  if (result.state !== "used" && result.state !== "replayed") {
    return {};
  }

  const outcome = result.order.result ?? result.order.preview;
  if (outcome.hpAfter >= outcome.hpMax) {
    return {};
  }

  const inventory = await services.inventory.listForTelegramUser(telegramUserId);
  if (inventory.state !== "found") {
    return {};
  }

  const itemId = result.order.itemId;
  const stack = inventory.items.find((item) => item.itemId === itemId);
  if (!stack || stack.quantity <= 0) {
    return {};
  }

  const item = findItemContent(itemId);
  const effect = item ? getItemUseEffect(item) : null;
  const missingHp = Math.max(0, outcome.hpMax - outcome.hpAfter);
  const neededQuantity = effect?.kind === "heal-hp" && effect.amount > 0
    ? Math.ceil(missingHp / Math.max(1, Math.floor(effect.amount)))
    : Number.POSITIVE_INFINITY;

  return {
    repeatItemId: itemId,
    ...(itemId === "item.responsible-panic-bandage" && stack.quantity >= neededQuantity
      ? { restoreToFullItemId: itemId }
      : {})
  };
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

  if (action.type === "manage") {
    await safeAnswerCallbackQuery(ctx);
    await sendEquipment(ctx, services.equipment, "edit", { expanded: true });
    return;
  }

  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

  if (!telegramUserId) {
    await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
    return;
  }

  if (await showActivePassageSearchIfNeeded(ctx, services, telegramUserId, "edit")) {
    return;
  }

  if (action.type === "equip-item") {
    const result = await services.equipment.equipItemForTelegramUser(
      telegramUserId,
      action.itemId,
      action.targetSlot,
      {
        confirmTwohand: action.confirmTwohand,
        confirmAttunement: action.confirmAttunement,
        confirmAttunementInterrupt: action.confirmAttunementInterrupt
      }
    );

    await safeAnswerCallbackQuery(ctx);

    if (result.state === "equipped") {
      await safeEditMessageText(ctx, presentEquipItemResult(result), {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildEquipItemResultKeyboard(result)
      });
      const achievementText = presentAchievementUnlockNotification(result.achievementUnlocks);
      if (achievementText) {
        await ctx.reply(achievementText, HTML_MESSAGE_OPTIONS);
      }
      return;
    }

    await safeEditMessageText(ctx, presentEquipItemResult(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildEquipItemResultKeyboard(result)
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
    reply_markup: buildEquipmentKeyboard(equipment, { expanded: true })
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

  if (await showActivePassageSearchIfNeeded(ctx, services, telegramUserId, "edit")) {
    return;
  }

  if (action.type === "inventory") {
    await safeAnswerCallbackQuery(ctx);
    await sendInventory(ctx, services.inventory, "edit", 0, null, services.equipment);
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

  const timing = startCallbackTiming(`mantok-chest.${action.type}`, telegramUserId);

  if (action.type === "open") {
    const overview = await timing.measureDb(() => services.mantokChest.getOverviewForTelegramUser(telegramUserId));
    const rendered = timing.measureCompute(() => ({
      text: presentMantokChestOverview(overview),
      replyMarkup: buildMantokChestOverviewKeyboard()
    }));

    await timing.measureTelegram(() => safeAnswerCallbackQuery(ctx));
    await timing.measureTelegram(() => safeEditMessageText(ctx, rendered.text, {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: rendered.replyMarkup
    }));
    timing.log({ itemCount: overview.state === "ready" ? overview.eligibleCount : 0 });
    return;
  }

  if (action.type === "auto") {
    const preview = await timing.measureDb(() => services.mantokChest.createAutoPickPreviewForTelegramUser(telegramUserId));
    const rendered = timing.measureCompute(() => ({
      text: presentMantokChestPreview(preview),
      replyMarkup:
        preview.state === "preview-created"
          ? buildMantokChestPreviewKeyboard(preview.run.token)
          : buildMantokChestOverviewKeyboard()
    }));

    await timing.measureTelegram(() => safeAnswerCallbackQuery(
      ctx,
      preview.state === "not-enough-items"
        ? { text: "Скрині треба 5 доступних манаток.", show_alert: true }
        : { show_alert: preview.state === "no-character" }
    ));
    await timing.measureTelegram(() => safeEditMessageText(ctx, rendered.text, {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: rendered.replyMarkup
    }));
    timing.log({
      itemCount:
        preview.state === "preview-created"
          ? preview.inputItems.reduce((sum, item) => sum + item.quantity, 0)
          : preview.state === "not-enough-items"
            ? preview.eligibleCount
            : 0
    });
    return;
  }

  if (action.type === "manual") {
    const selection = await timing.measureDb(() => services.mantokChest.startManualSelectionForTelegramUser(telegramUserId));
    const rendered = timing.measureCompute(() => ({
      text: presentMantokChestManualSelection(selection),
      replyMarkup:
        selection.state === "selection"
          ? buildMantokChestManualSelectionKeyboard(selection)
          : buildMantokChestOverviewKeyboard()
    }));

    await timing.measureTelegram(() => safeAnswerCallbackQuery(ctx));
    await timing.measureTelegram(() => safeEditMessageText(ctx, rendered.text, {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: rendered.replyMarkup
    }));
    timing.log({
      itemCount: selection.state === "selection" ? selection.eligibleCount : 0,
      page: selection.state === "selection" ? selection.page : 0
    });
    return;
  }

  if (action.type === "page") {
    const selection = await timing.measureDb(() => services.mantokChest.getManualSelectionForTelegramUser(
      telegramUserId,
      action.token,
      action.page
    ));
    const rendered = timing.measureCompute(() => ({
      text: presentMantokChestManualSelection(selection),
      replyMarkup:
        selection.state === "selection"
          ? buildMantokChestManualSelectionKeyboard(selection)
          : buildMantokChestOverviewKeyboard()
    }));

    await timing.measureTelegram(() => safeAnswerCallbackQuery(ctx));
    await timing.measureTelegram(() => safeEditMessageText(ctx, rendered.text, {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: rendered.replyMarkup
    }));
    timing.log({
      itemCount: selection.state === "selection" ? selection.eligibleCount : 0,
      page: selection.state === "selection" ? selection.page : action.page
    });
    return;
  }

  if (action.type === "add" || action.type === "remove") {
    const selection = await timing.measureDb(() =>
      action.type === "add"
        ? services.mantokChest.addManualSelectionUnitForTelegramUser(telegramUserId, action)
        : services.mantokChest.removeManualSelectionUnitForTelegramUser(telegramUserId, action)
    );
    const rendered = timing.measureCompute(() => ({
      text: presentMantokChestManualSelection(selection),
      replyMarkup:
        selection.state === "selection"
          ? buildMantokChestManualSelectionKeyboard(selection)
          : buildMantokChestOverviewKeyboard()
    }));

    await timing.measureTelegram(() => safeAnswerCallbackQuery(
      ctx,
      selection.state === "selection" && selection.selectedCount === selection.requiredCount
        ? { text: "На виделці рівно 5 манаток." }
        : undefined
    ));
    await timing.measureTelegram(() => safeEditMessageText(ctx, rendered.text, {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: rendered.replyMarkup
    }));
    timing.log({
      itemCount: selection.state === "selection" ? selection.eligibleCount : 0,
      page: selection.state === "selection" ? selection.page : action.page
    });
    return;
  }

  if (action.type === "preview") {
    const preview = await timing.measureDb(() => services.mantokChest.getManualPreviewForTelegramUser(
      telegramUserId,
      action.token
    ));
    const rendered = timing.measureCompute(() => ({
      text: presentMantokChestPreview(preview),
      replyMarkup:
        preview.state === "preview-created"
          ? buildMantokChestPreviewKeyboard(preview.run.token)
          : buildMantokChestOverviewKeyboard()
    }));

    await timing.measureTelegram(() => safeAnswerCallbackQuery(
      ctx,
      preview.state === "selection-incomplete"
        ? { text: "Скрині треба рівно 5 манаток.", show_alert: true }
        : { show_alert: preview.state !== "preview-created" }
    ));
    await timing.measureTelegram(() => safeEditMessageText(ctx, rendered.text, {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: rendered.replyMarkup
    }));
    timing.log({
      itemCount:
        preview.state === "preview-created"
          ? preview.inputItems.reduce((sum, item) => sum + item.quantity, 0)
          : preview.state === "selection-incomplete"
            ? preview.selectedCount
            : 0
    });
    return;
  }

  if (action.type === "cancel") {
    const result = await timing.measureDb(() => services.mantokChest.cancelRecycleForTelegramUser(
      telegramUserId,
      action.token
    ));

    await timing.measureTelegram(() => safeAnswerCallbackQuery(ctx, {
      text: result.state === "cancelled" ? "Скриня відпустила манатки." : presentInvalidCallback(),
      show_alert: result.state !== "cancelled"
    }));

    const overview = await timing.measureDb(() => services.mantokChest.getOverviewForTelegramUser(telegramUserId));
    const rendered = timing.measureCompute(() => ({
      text: presentMantokChestOverview(overview),
      replyMarkup: buildMantokChestOverviewKeyboard()
    }));
    await timing.measureTelegram(() => safeEditMessageText(ctx, rendered.text, {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: rendered.replyMarkup
    }));
    timing.log({ itemCount: overview.state === "ready" ? overview.eligibleCount : 0 });
    return;
  }

  const result = await timing.measureDb(() => services.mantokChest.confirmRecycleForTelegramUser(
    telegramUserId,
    action.token
  ));

  await timing.measureTelegram(() => safeAnswerCallbackQuery(
    ctx,
    result.state === "recycled"
      ? { text: "Скриня хрумкнула." }
      : {
          show_alert:
            result.state === "invalid-token" ||
            result.state === "stale-inputs" ||
            result.state === "expired"
        }
  ));
  const rendered = timing.measureCompute(() => ({
    text: presentMantokChestRecycleResult(result),
    replyMarkup: buildMantokChestResultKeyboard(
      result.state === "recycled" || result.state === "replayed" ? result.outputItem : null
    )
  }));

  await timing.measureTelegram(() => safeEditMessageText(ctx, rendered.text, {
    ...HTML_MESSAGE_OPTIONS,
    reply_markup: rendered.replyMarkup
  }));
  const achievementText = timing.measureCompute(() => presentAchievementUnlockNotification(
    result.state === "recycled" ? result.achievementUnlocks ?? [] : []
  ));
  if (achievementText) {
    await timing.measureTelegram(() => ctx.reply(achievementText, HTML_MESSAGE_OPTIONS));
  }
  timing.log({
    itemCount:
      result.state === "recycled" || result.state === "replayed"
        ? result.run.inputItems.reduce((sum, item) => sum + item.quantity, 0)
        : 0
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

  if (await showActivePassageSearchIfNeeded(ctx, services, telegramUserId, "edit")) {
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
  const achievementText = presentAchievementUnlockNotification(
    result.state === "exchanged" ? result.achievementUnlocks ?? [] : []
  );
  if (achievementText) {
    await ctx.reply(achievementText, HTML_MESSAGE_OPTIONS);
  }
}
