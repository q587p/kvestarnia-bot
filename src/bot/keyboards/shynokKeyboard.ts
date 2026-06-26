import { InlineKeyboard } from "grammy";
import type {
  ShynokDrinkOrderResult,
  ShynokOverviewResult,
  ShynokRoundOfferRespondResult,
  ShynokRoundConfirmResult,
  ShynokRoundPreviewResult,
  ShynokSaleSelectionResult
} from "../../services/shynokService";
import {
  listBardPerformanceTipOptions,
  type BardPerformanceRespondResult
} from "../../services/bardPerformanceService";
import { listShynokDrinkDefinitions } from "../../services/shynokService";
import { makeItemGiftOpenCallbackData } from "../callbacks/itemGiftCallbackData";
import { makePlaceCallbackData } from "../callbacks/placeCallbackData";
import {
  makeShynokDrinkConfirmCallbackData,
  makeShynokDrinkPreviewCallbackData,
  makeShynokDrinksCallbackData,
  makeShynokBardPerformanceApplaudCallbackData,
  makeShynokBardPerformanceDeclineCallbackData,
  makeShynokBardPerformanceStartCallbackData,
  makeShynokBardPerformanceTipCallbackData,
  makeShynokOverviewCallbackData,
  makeShynokRoundAcceptCallbackData,
  makeShynokRoundConfirmCallbackData,
  makeShynokRoundDeclineCallbackData,
  makeShynokRoundReplacementConfirmCallbackData,
  makeShynokRoundPreviewCallbackData,
  makeShynokSaleAddCallbackData,
  makeShynokSaleAllCallbackData,
  makeShynokSaleCancelCallbackData,
  makeShynokSaleClearCallbackData,
  makeShynokSaleConfirmCallbackData,
  makeShynokSaleOpenCallbackData,
  makeShynokSalePageCallbackData,
  makeShynokSaleRemoveCallbackData
} from "../callbacks/shynokCallbackData";

export function buildShynokOverviewKeyboard(result?: ShynokOverviewResult): InlineKeyboard {
  const keyboard = new InlineKeyboard()
    .text("🍹 Напої для себе", makeShynokDrinksCallbackData())
    .row()
    .text("🍺 Просте всім", makeShynokRoundPreviewCallbackData("simple"))
    .text("🍻 Якісне всім", makeShynokRoundPreviewCallbackData("fine"))
    .row()
    .text("💰 Продати манатки", makeShynokSaleOpenCallbackData())
    .row()
    .text("🎁 Подарувати манатку", makeItemGiftOpenCallbackData())
    .row();

  if (
    result?.state === "ready" &&
    result.character.classId === "class.bard" &&
    result.character.level >= 3
  ) {
    keyboard.text("🎶 Виступити", makeShynokBardPerformanceStartCallbackData()).row();
  }

  if (result?.state === "ready") {
    for (const offer of result.openRoundOffers) {
      keyboard
        .text(`🍺 Випити`, makeShynokRoundAcceptCallbackData(offer.id))
        .text("Ні, дякую", makeShynokRoundDeclineCallbackData(offer.id))
        .row();
    }
  }

  return keyboard.text("⬅️ До зали", makePlaceCallbackData("hall"));
}

export function buildShynokDrinkMenuKeyboard(): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  for (const drink of listShynokDrinkDefinitions()) {
    keyboard.text(`${drink.emoji} ${drink.name} — ${drink.priceGold}`, makeShynokDrinkPreviewCallbackData(drink.key)).row();
  }

  return keyboard.text("⬅️ До Шинку", makeShynokOverviewCallbackData());
}

export function buildShynokDrinkPreviewKeyboard(result: ShynokDrinkOrderResult): InlineKeyboard {
  if (result.state !== "preview") {
    return buildBackToShynokKeyboard();
  }

  return new InlineKeyboard()
    .text(`✅ Купити за ${result.drink.priceGold}`, makeShynokDrinkConfirmCallbackData(result.token))
    .row()
    .text("⬅️ До напоїв", makeShynokDrinksCallbackData())
    .text("⬅️ До Шинку", makeShynokOverviewCallbackData());
}

export function buildShynokDrinkResultKeyboard(): InlineKeyboard {
  return buildBackToShynokKeyboard();
}

export function buildShynokRoundPreviewKeyboard(result: ShynokRoundPreviewResult): InlineKeyboard {
  if (result.state !== "preview") {
    if (result.state === "raid-required") {
      return buildShynokRaidRequiredKeyboard();
    }

    return buildBackToShynokKeyboard();
  }

  return new InlineKeyboard()
    .text(`✅ Поставити за ${result.priceGold}`, makeShynokRoundConfirmCallbackData(result.tier, result.token))
    .row()
    .text("⬅️ До Шинку", makeShynokOverviewCallbackData());
}

export function buildShynokRoundResultKeyboard(result: ShynokRoundConfirmResult): InlineKeyboard {
  if (result.state === "raid-required") {
    return buildShynokRaidRequiredKeyboard();
  }

  return buildBackToShynokKeyboard();
}

export function buildShynokRoundOfferResponseKeyboard(result: ShynokRoundOfferRespondResult): InlineKeyboard {
  if (result.state !== "replacement-preview") {
    return buildBackToShynokKeyboard();
  }

  return new InlineKeyboard()
    .text(
      "✅ Замінити й випити",
      makeShynokRoundReplacementConfirmCallbackData(result.offer.id, result.replacementGuard)
    )
    .row()
    .text("Ні, дякую", makeShynokRoundDeclineCallbackData(result.offer.id))
    .row()
    .text("⬅️ До Шинку", makeShynokOverviewCallbackData());
}

export function buildShynokRoundOfferNotificationKeyboard(offerId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("🍺 Випити", makeShynokRoundAcceptCallbackData(offerId))
    .text("Ні, дякую", makeShynokRoundDeclineCallbackData(offerId))
    .row()
    .text("⬅️ До Шинку", makePlaceCallbackData("bar"));
}

export function buildBardPerformanceResponseKeyboard(reactionId: string): InlineKeyboard {
  const keyboard = new InlineKeyboard()
    .text("👏 Аплодувати", makeShynokBardPerformanceApplaudCallbackData(reactionId))
    .text("Ні, дякую", makeShynokBardPerformanceDeclineCallbackData(reactionId))
    .row();

  for (const tip of listBardPerformanceTipOptions()) {
    keyboard.text(`🪙 ${tip}`, makeShynokBardPerformanceTipCallbackData(reactionId, tip));
  }

  return keyboard.row().text("↩️ До місцини", makePlaceCallbackData("current"));
}

export function buildBardPerformanceRespondResultKeyboard(result: BardPerformanceRespondResult): InlineKeyboard {
  if (result.state === "insufficient-gold") {
    return buildBardPerformanceResponseKeyboard(result.reaction.id);
  }

  return buildBackToCurrentPlaceKeyboard();
}

export function buildBackToCurrentPlaceKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("↩️ До місцини", makePlaceCallbackData("current"));
}

export function buildShynokSaleSelectionKeyboard(result: ShynokSaleSelectionResult): InlineKeyboard {
  if (result.state !== "selection") {
    return buildBackToShynokKeyboard();
  }

  const keyboard = new InlineKeyboard();

  for (const item of result.items) {
    if (item.selectedQuantity > 0) {
      keyboard.text("➖", makeShynokSaleRemoveCallbackData(result.sale.token, result.page, item.index));
    }

    if (item.selectedQuantity < item.availableQuantity) {
      keyboard.text("➕", makeShynokSaleAddCallbackData(result.sale.token, result.page, item.index));
    }

    keyboard.text(`${item.content.name} ${item.selectedQuantity}/${item.availableQuantity}`, makeShynokSalePageCallbackData(result.sale.token, result.page)).row();
  }

  keyboard
    .text("📦 Усе придатне", makeShynokSaleAllCallbackData(result.sale.token, result.page))
    .row()
    .text("🧹 Очистити", makeShynokSaleClearCallbackData(result.sale.token, result.page))
    .row();

  if (result.payoutGold > 0) {
    keyboard.text(`💰 Продати за ${result.payoutGold}`, makeShynokSaleConfirmCallbackData(result.sale.token)).row();
  }

  if (result.pageCount > 1) {
    if (result.page > 0) {
      keyboard.text("◀️", makeShynokSalePageCallbackData(result.sale.token, result.page - 1));
    }

    keyboard.text(`${result.page + 1}/${result.pageCount}`, makeShynokSalePageCallbackData(result.sale.token, result.page));

    if (result.page < result.pageCount - 1) {
      keyboard.text("▶️", makeShynokSalePageCallbackData(result.sale.token, result.page + 1));
    }

    keyboard.row();
  }

  return keyboard
    .text("⬅️ До Шинку", makeShynokSaleCancelCallbackData(result.sale.token))
    .row()
    .text("⬅️ До зали", makePlaceCallbackData("hall"));
}

export function buildBackToShynokKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("⬅️ До Шинку", makePlaceCallbackData("bar"))
    .row()
    .text("⬅️ До зали", makePlaceCallbackData("hall"));
}

function buildShynokRaidRequiredKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🛢️ До Бочки", makePlaceCallbackData("barrel"))
    .row()
    .text("⬅️ До зали", makePlaceCallbackData("hall"));
}
