import { InlineKeyboard } from "grammy";
import type {
  ShynokDrinkOrderResult,
  ShynokOverviewResult,
  ShynokRoundOfferRespondResult,
  ShynokRoundConfirmResult,
  ShynokRoundPreviewResult,
  ShynokSaleSelectionResult
} from "../../services/shynokService";
import type { TavernGameHubResult } from "../../services/tavernGameService";
import { listTavernGameStakeOptions } from "../../services/tavernGameService";
import {
  listBardPerformanceTipOptions,
  type BardPerformanceRespondResult
} from "../../services/bardPerformanceService";
import {
  KOSTI_PLAYER_CAP,
  KOSTI_SIGNS,
  KOSTI_STYLES,
  TAVLEI_PLAYER_CAP,
  TAVLEI_TACTICS,
  type TavernGameKey
} from "../../domain/tavernGames";
import { listShynokDrinkDefinitions } from "../../services/shynokService";
import { makePlaceCallbackData } from "../callbacks/placeCallbackData";
import { formatTavernGamesButtonLabel } from "./tavernKeyboard";
import {
  makeShynokDrinkConfirmCallbackData,
  makeShynokDrinkPreviewCallbackData,
  makeShynokDrinksCallbackData,
  makeShynokGameCancelCallbackData,
  makeShynokGameCreateCallbackData,
  makeShynokGameJoinCallbackData,
  makeShynokGameLeaderboardCallbackData,
  makeShynokGameResolveCallbackData,
  makeShynokGameRulesCallbackData,
  makeShynokGamesCallbackData,
  makeShynokKostiDecisionCallbackData,
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
  makeShynokSaleRemoveCallbackData,
  makeShynokTavleiDecisionCallbackData
} from "../callbacks/shynokCallbackData";

export function buildShynokOverviewKeyboard(
  result?: ShynokOverviewResult,
  options: { tavernGames?: boolean; tavernGameTableCount?: number } = {}
): InlineKeyboard {
  const keyboard = new InlineKeyboard()
    .text("🍹 Напої для себе", makeShynokDrinksCallbackData())
    .row()
    .text("🍺 Просте всім", makeShynokRoundPreviewCallbackData("simple"))
    .text("🍻 Якісне всім", makeShynokRoundPreviewCallbackData("fine"))
    .row()
    .text("💰 Продати манатки", makeShynokSaleOpenCallbackData())
    .row();

  if (options.tavernGames) {
    keyboard.text(formatTavernGamesButtonLabel(options.tavernGameTableCount), makeShynokGamesCallbackData()).row();
  }

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

export function buildShynokGameHubKeyboard(result: TavernGameHubResult): InlineKeyboard {
  if (result.state !== "ready") {
    return buildBackToShynokKeyboard();
  }

  const keyboard = new InlineKeyboard();

  keyboard.text("🏆 Рейтинг", makeShynokGameLeaderboardCallbackData()).row();

  if (result.tavleiEnabled) {
    keyboard.text("♟ Тавлеї", makeShynokGameRulesCallbackData("tavlei")).row();
  }
  if (result.kostiEnabled) {
    keyboard.text("🎲 Кості", makeShynokGameRulesCallbackData("kosti")).row();
  }

  for (const table of result.openTables.slice(0, 8)) {
    keyboard
      .text(
        formatShynokOpenTableButtonLabel(table.gameKey, table.participants.length, table.stakeGold),
        makeShynokGameJoinCallbackData(table.token)
      )
      .row();
  }

  return keyboard.text("↩ Назад", makeShynokOverviewCallbackData());
}

export function buildShynokGameRulesKeyboard(gameKey: TavernGameKey, maxStake: number): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (const stake of listTavernGameStakeOptions(maxStake)) {
    keyboard.text(`💰 ${stake}`, makeShynokGameCreateCallbackData(gameKey, stake));
  }

  return keyboard
    .row()
    .text("↩ До ігор", makeShynokGamesCallbackData());
}

export function buildBackToShynokGamesKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("↩ До ігор", makeShynokGamesCallbackData());
}

export function buildShynokGameSessionKeyboard(result: {
  state: string;
  session?: {
    token: string;
    gameKey: TavernGameKey;
    status: string;
    creatorCharacterId: string;
    participants: Array<{ characterId: string; status: string; telegramUserId?: bigint }>;
  };
}, options: { viewerTelegramUserId?: bigint } = {}): InlineKeyboard {
  if (!result.session) {
    return buildBackToShynokKeyboard();
  }

  const keyboard = new InlineKeyboard();
  const viewer = result.session.participants.find((participant) =>
    participant.telegramUserId === options.viewerTelegramUserId
  );
  const viewerIsCreator = viewer?.characterId === result.session.creatorCharacterId;
  if (
    result.state !== "not-cancellable" &&
    result.session.gameKey === "tavlei" &&
    result.session.status === "open" &&
    result.session.participants.length < 2 &&
    viewerIsCreator
  ) {
    keyboard.text("✖ Скасувати", makeShynokGameCancelCallbackData(result.session.token)).row();
  }
  if (
    result.session.gameKey === "kosti" &&
    (result.session.status === "open" || result.session.status === "ready") &&
    result.session.participants.length >= 2 &&
    viewerIsCreator
  ) {
    keyboard.text("🎲 Кинути зараз", makeShynokGameResolveCallbackData(result.session.token)).row();
  }

  return keyboard.text("↩ До ігор", makeShynokGamesCallbackData());
}

export function buildShynokTavleiDecisionKeyboard(token: string): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (const tactic of TAVLEI_TACTICS) {
    keyboard.text(tavleiTacticButtonLabel(tactic), makeShynokTavleiDecisionCallbackData(token, tactic)).row();
  }

  return keyboard.text("↩ До ігор", makeShynokGamesCallbackData());
}

export function buildShynokKostiDecisionKeyboard(token: string): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  for (const sign of KOSTI_SIGNS) {
    for (const style of KOSTI_STYLES) {
      keyboard.text(kostiDecisionButtonLabel(style, sign), makeShynokKostiDecisionCallbackData(token, style, sign));
    }
    keyboard.row();
  }

  return keyboard.text("↩ До ігор", makeShynokGamesCallbackData());
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

export function formatShynokOpenTableButtonLabel(
  gameKey: TavernGameKey,
  participantCount: number,
  stakeGold: number
): string {
  const cap = gameKey === "kosti" ? KOSTI_PLAYER_CAP : TAVLEI_PLAYER_CAP;
  const label = gameKey === "kosti" ? "🎲 Кості" : "♟ Тавлеї";
  return `${label} · ${participantCount}/${cap} · ${stakeGold} зол.`;
}

function tavleiTacticButtonLabel(tactic: (typeof TAVLEI_TACTICS)[number]): string {
  return {
    careful_defense: "🛡 Обачна оборона",
    quiet_trap: "🕯 Тиха пастка",
    sharp_opening: "⚔️ Гострий дебют",
    long_game: "⏳ Довга партія"
  }[tactic];
}

function kostiDecisionButtonLabel(
  style: (typeof KOSTI_STYLES)[number],
  sign: (typeof KOSTI_SIGNS)[number]
): string {
  const styleLabel = {
    steady: "✋",
    push: "🔥",
    sign_hunter: "✨"
  }[style];
  const signLabel = {
    two_pairs: "2п",
    triple: "3",
    high_hand: "22+",
    straight: "шлях",
    tower: "вежа",
    no_sign: "без"
  }[sign];

  return `${styleLabel} ${signLabel}`;
}

function buildShynokRaidRequiredKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🛢️ До Бочки", makePlaceCallbackData("barrel"))
    .row()
    .text("⬅️ До зали", makePlaceCallbackData("hall"));
}
