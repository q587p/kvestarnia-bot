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
import {
  previewScorecardScores,
  isDicePokerTableState,
  type DicePokerScoreCategory,
  type DicePokerState
} from "../../domain/dicePoker";
import { listShynokDrinkDefinitions } from "../../services/shynokService";
import { makePlaceCallbackData } from "../callbacks/placeCallbackData";
import { formatTavernGamesButtonLabel } from "./tavernKeyboard";
import {
  decorateButtonLabel,
  resolveQuestMarkerForTarget,
  type QuestMarkerInput
} from "./questButtonMarkers";
import {
  makeShynokDrinkConfirmCallbackData,
  makeShynokDrinkPreviewCallbackData,
  makeShynokDrinksCallbackData,
  makeShynokDicePokerCancelCallbackData,
  makeShynokDicePokerCreateCallbackData,
  makeShynokDicePokerDoppelgangerCreateCallbackData,
  makeShynokDicePokerModeCallbackData,
  makeShynokDicePokerRollCallbackData,
  makeShynokDicePokerRulesCallbackData,
  makeShynokDicePokerViewCallbackData,
  makeShynokDicePokerScoreCallbackData,
  makeShynokDicePokerToggleCallbackData,
  makeShynokDoppelgangerMenuCallbackData,
  makeShynokDoppelgangerModeCallbackData,
  makeShynokGameCancelCallbackData,
  makeShynokGameCreateCallbackData,
  makeShynokGameInviteRotateCallbackData,
  makeShynokGameJoinCallbackData,
  makeShynokGameLeaderboardCallbackData,
  makeShynokGameRematchCallbackData,
  makeShynokGameResolveCallbackData,
  makeShynokGameRulesCallbackData,
  makeShynokGameShareCallbackData,
  makeShynokGamesCallbackData,
  makeShynokKostiDecisionCallbackData,
  makeShynokTavleiDoppelgangerCreateCallbackData,
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
  options: { tavernGames?: boolean; tavernGameTableCount?: number; questMarkers?: QuestMarkerInput | null } = {}
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

  return keyboard.text(buildBackToHallLabel(options), makePlaceCallbackData("hall"));
}

export function buildShynokGameHubKeyboard(
  result: TavernGameHubResult,
  options: ShynokNavigationOptions = {}
): InlineKeyboard {
  if (result.state !== "ready") {
    return buildBackToShynokKeyboard(options);
  }

  const keyboard = new InlineKeyboard();

  keyboard.text("🏆 Рейтинг", makeShynokGameLeaderboardCallbackData()).row();

  if (result.tavleiEnabled) {
    keyboard.text("♟ Тавлеї", makeShynokGameRulesCallbackData("tavlei")).row();
  }
  if (result.kostiEnabled) {
    keyboard.text("🎲 Кості", makeShynokGameRulesCallbackData("kosti")).row();
  }
  if (result.doppelgangerAvailable && (result.tavleiEnabled || result.kostiEnabled)) {
    keyboard.text("🪞 Допельґанґер", makeShynokDoppelgangerMenuCallbackData()).row();
  }

  for (const table of result.openTables.slice(0, 8)) {
    keyboard
      .text(
        formatShynokOpenTableButtonLabel(table.gameKey, table.participants.length, table.stakeGold, table.result),
        makeShynokGameJoinCallbackData(table.token)
      )
      .row();
  }

  return keyboard.text("↩ Назад", makeShynokOverviewCallbackData());
}

export function buildShynokGameRulesKeyboard(gameKey: TavernGameKey, maxStake: number): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  if (gameKey === "kosti") {
    return keyboard
      .text("⚡ Швидкі кості", makeShynokDicePokerModeCallbackData("quick"))
      .row()
      .text("📜 Табличні кості", makeShynokDicePokerModeCallbackData("scorecard"))
      .row()
      .text("❔ Правила", makeShynokDicePokerRulesCallbackData())
      .row()
      .text("↩ До ігор", makeShynokGamesCallbackData());
  }

  for (const stake of listTavernGameStakeOptions(maxStake)) {
    keyboard.text(`💰 ${stake}`, makeShynokGameCreateCallbackData(gameKey, stake));
  }

  return keyboard
    .row()
    .text("↩ До ігор", makeShynokGamesCallbackData());
}

export function buildShynokDicePokerStakeKeyboard(
  mode: "quick" | "scorecard",
  maxStake: number
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const stakes = listTavernGameStakeOptions(maxStake);

  for (const stake of stakes) {
    keyboard.text(`👥 ${stake}`, makeShynokDicePokerCreateCallbackData(mode, stake));
  }
  keyboard.row();

  return keyboard
    .text("❔ Правила", makeShynokDicePokerRulesCallbackData())
    .row()
    .text("↩ До костей", makeShynokGameRulesCallbackData("kosti"));
}

export function buildShynokDoppelgangerMenuKeyboard(options: {
  tavleiEnabled: boolean;
  kostiEnabled: boolean;
}): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (options.kostiEnabled) {
    keyboard
      .text("⚡ Швидкі кості", makeShynokDoppelgangerModeCallbackData("quick"))
      .row()
      .text("📜 Табличні кості", makeShynokDoppelgangerModeCallbackData("scorecard"))
      .row();
  }
  if (options.tavleiEnabled) {
    keyboard.text("♟ Тавлеї", makeShynokDoppelgangerModeCallbackData("tavlei")).row();
  }

  return keyboard.text("↩ До ігор", makeShynokGamesCallbackData());
}

export function buildShynokDoppelgangerStakeKeyboard(
  gameKey: "quick" | "scorecard" | "tavlei",
  maxStake: number
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  for (const stake of listTavernGameStakeOptions(maxStake)) {
    if (gameKey === "tavlei") {
      keyboard.text(`${stake}`, makeShynokTavleiDoppelgangerCreateCallbackData(stake));
    } else {
      keyboard.text(`${stake}`, makeShynokDicePokerDoppelgangerCreateCallbackData(gameKey, stake));
    }
  }

  return keyboard
    .row()
    .text("↩ До Допельґанґера", makeShynokDoppelgangerMenuCallbackData());
}

export function buildBackToShynokGamesKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("↩ До ігор", makeShynokGamesCallbackData());
}

export function buildBackToDicePokerKeyboard(token: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("↩ До партії", makeShynokDicePokerViewCallbackData(token))
    .row()
    .text("↩ До ігор", makeShynokGamesCallbackData());
}

export function buildShynokGameRematchInviteKeyboard(token: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Сісти за стіл", makeShynokGameJoinCallbackData(token))
    .row()
    .text("↩ До ігор", makeShynokGamesCallbackData());
}

export function buildShynokGameSessionKeyboard(result: {
  state: string;
  session?: {
    token: string;
    gameKey: TavernGameKey;
    status: string;
    creatorCharacterId: string;
    participants: Array<{ characterId: string; status: string; telegramUserId?: bigint }>;
    result?: unknown;
  };
}, options: {
  viewerTelegramUserId?: bigint;
  questMarkers?: QuestMarkerInput | null;
  inviteUrl?: string | null | undefined;
} = {}): InlineKeyboard {
  if (!result.session) {
    return buildBackToShynokKeyboard(options);
  }

  const keyboard = new InlineKeyboard();
  const viewer = result.session.participants.find((participant) =>
    participant.telegramUserId === options.viewerTelegramUserId
  );
  const viewerIsCreator = viewer?.characterId === result.session.creatorCharacterId;
  const table = isDicePokerTableState(result.session.result) ? result.session.result : null;
  if (result.session.status === "completed") {
    keyboard.text("🔁 Зіграти ще", makeShynokGameRematchCallbackData(result.session.token)).row();
    return keyboard.text("↩ До ігор", makeShynokGamesCallbackData());
  }

  if (
    result.state !== "not-cancellable" &&
    (result.session.gameKey === "tavlei" || table?.phase === "waiting") &&
    result.session.status === "open" &&
    result.session.participants.length < 2 &&
    viewerIsCreator
  ) {
    keyboard.text("✖ Скасувати", makeShynokGameCancelCallbackData(result.session.token)).row();
  }
  if (!viewer && canJoinTavernGameSession(result.session)) {
    keyboard.text("✅ Сісти за стіл", makeShynokGameJoinCallbackData(result.session.token)).row();
  }
  if (viewer && canInviteToTavernGameSession(result.session) && options.inviteUrl) {
    keyboard.text("📣 Запрошення до столу", makeShynokGameShareCallbackData(result.session.token)).row();
    keyboard.url("🔗 Запросити до столу", buildTelegramShareUrl(options.inviteUrl)).row();
  }
  if (
    result.session.gameKey === "kosti" &&
    (result.session.status === "open" || result.session.status === "ready") &&
    result.session.participants.length >= 2 &&
    table?.phase !== "playing" &&
    viewerIsCreator
  ) {
    keyboard.text("▶️ Почати партію", makeShynokGameResolveCallbackData(result.session.token)).row();
  }

  return keyboard.text("↩ До ігор", makeShynokGamesCallbackData());
}

export function buildShynokGameInviteShareKeyboard(token: string, templateIndex: number): InlineKeyboard {
  return new InlineKeyboard().text(
    "🎲 Інший текст",
    makeShynokGameInviteRotateCallbackData(token, templateIndex)
  );
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

export function buildShynokDrinkPreviewKeyboard(
  result: ShynokDrinkOrderResult,
  options: ShynokNavigationOptions = {}
): InlineKeyboard {
  if (result.state !== "preview") {
    return buildBackToShynokKeyboard(options);
  }

  return new InlineKeyboard()
    .text(`✅ Купити за ${result.drink.priceGold}`, makeShynokDrinkConfirmCallbackData(result.token))
    .row()
    .text("⬅️ До напоїв", makeShynokDrinksCallbackData())
    .text("⬅️ До Шинку", makeShynokOverviewCallbackData());
}

export function buildShynokDrinkResultKeyboard(options: ShynokNavigationOptions = {}): InlineKeyboard {
  return buildBackToShynokKeyboard(options);
}

export function buildShynokDicePokerKeyboard(
  token: string,
  state: DicePokerState,
  options: { allowCancel?: boolean; allowRematch?: boolean } = {}
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const allowCancel = options.allowCancel ?? true;

  if (state.phase === "terminal") {
    if (options.allowRematch) {
      keyboard.text("🔁 Зіграти ще", makeShynokGameRematchCallbackData(token)).row();
    }
    return keyboard.text("↩ До ігор", makeShynokGamesCallbackData());
  }

  if (state.mode === "quick") {
    for (let index = 0; index < state.playerDice.length; index += 1) {
      keyboard.text(
        diceButtonLabel(state.playerDice[index] ?? 1, state.selectedMask, index),
        makeShynokDicePokerToggleCallbackData(token, index)
      );
    }
    keyboard
      .row()
      .text(
        state.selectedMask === 0 ? "🎲 Лишити як є" : "🎲 Перекинути вибране",
        makeShynokDicePokerRollCallbackData(token)
      )
      .row()
      .text("❔ Правила", makeShynokDicePokerRulesCallbackData(token));
    if (allowCancel) {
      keyboard.text("✖ Скасувати", makeShynokDicePokerCancelCallbackData(token));
    }
    keyboard.row()
      .text("↩ До ігор", makeShynokGamesCallbackData());

    return keyboard;
  }

  for (let index = 0; index < state.dice.length; index += 1) {
    keyboard.text(
      diceButtonLabel(state.dice[index] ?? 1, state.selectedMask, index),
      makeShynokDicePokerToggleCallbackData(token, index)
    );
  }
  keyboard.row();

  if (state.roll < 3 && state.selectedMask !== 0) {
    keyboard.text("🎲 Перекинути вибране", makeShynokDicePokerRollCallbackData(token)).row();
  }

  const previews = previewScorecardScores(state.dice, state.scores);
  previews.forEach((preview, index) => {
    keyboard.text(
      `${scoreCategoryButtonLabel(preview.category)}: ${preview.score}`,
      makeShynokDicePokerScoreCallbackData(token, preview.category)
    );
    if (index % 2 === 1) {
      keyboard.row();
    }
  });

  keyboard
    .row()
    .text("❔ Правила", makeShynokDicePokerRulesCallbackData(token));
  if (allowCancel) {
    keyboard.text("✖ Скасувати", makeShynokDicePokerCancelCallbackData(token));
  }

  return keyboard
    .row()
    .text("↩ До ігор", makeShynokGamesCallbackData());
}

export function buildShynokRoundPreviewKeyboard(
  result: ShynokRoundPreviewResult,
  options: ShynokNavigationOptions = {}
): InlineKeyboard {
  if (result.state !== "preview") {
    if (result.state === "raid-required") {
      return buildShynokRaidRequiredKeyboard(options);
    }

    return buildBackToShynokKeyboard(options);
  }

  return new InlineKeyboard()
    .text(`✅ Поставити за ${result.priceGold}`, makeShynokRoundConfirmCallbackData(result.tier, result.token))
    .row()
    .text("⬅️ До Шинку", makeShynokOverviewCallbackData());
}

export function buildShynokRoundResultKeyboard(
  result: ShynokRoundConfirmResult,
  options: ShynokNavigationOptions = {}
): InlineKeyboard {
  if (result.state === "raid-required") {
    return buildShynokRaidRequiredKeyboard(options);
  }

  return buildBackToShynokKeyboard(options);
}

export function buildShynokRoundOfferResponseKeyboard(
  result: ShynokRoundOfferRespondResult,
  options: ShynokNavigationOptions = {}
): InlineKeyboard {
  if (result.state !== "replacement-preview") {
    return buildBackToShynokKeyboard(options);
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

export function buildShynokSaleSelectionKeyboard(
  result: ShynokSaleSelectionResult,
  options: ShynokNavigationOptions = {}
): InlineKeyboard {
  if (result.state !== "selection") {
    return buildBackToShynokKeyboard(options);
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
    .text(buildBackToHallLabel(options), makePlaceCallbackData("hall"));
}

export function buildBackToShynokKeyboard(options: ShynokNavigationOptions = {}): InlineKeyboard {
  return new InlineKeyboard()
    .text("⬅️ До Шинку", makePlaceCallbackData("bar"))
    .row()
    .text(buildBackToHallLabel(options), makePlaceCallbackData("hall"));
}

interface ShynokNavigationOptions {
  questMarkers?: QuestMarkerInput | null;
}

function buildBackToHallLabel(options: ShynokNavigationOptions = {}): string {
  return decorateButtonLabel(
    "⬅️ До зали",
    resolveQuestMarkerForTarget(options.questMarkers ?? undefined, "location.korchma.hall")
  );
}

export function formatShynokOpenTableButtonLabel(
  gameKey: TavernGameKey,
  participantCount: number,
  stakeGold: number,
  result?: unknown
): string {
  const table = isDicePokerTableState(result) ? result : null;
  const cap = table?.playerCap ?? (gameKey === "kosti" ? KOSTI_PLAYER_CAP : TAVLEI_PLAYER_CAP);
  const label = table?.mode === "quick"
    ? "⚡ Швидкі кості"
    : table?.mode === "scorecard"
      ? "📜 Табличні кості"
      : gameKey === "kosti" ? "🎲 Кості" : "♟ Тавлеї";
  return `${label} · ${participantCount}/${cap} · ${stakeGold} зол.`;
}

function canInviteToTavernGameSession(session: {
  gameKey: TavernGameKey;
  status: string;
  participants: Array<unknown>;
  result?: unknown;
}): boolean {
  if (session.status !== "open") {
    return false;
  }

  const table = isDicePokerTableState(session.result) ? session.result : null;
  if (table) {
    return table.phase === "waiting" && session.participants.length < table.playerCap;
  }

  return session.gameKey === "tavlei" && session.participants.length < TAVLEI_PLAYER_CAP;
}

function canJoinTavernGameSession(session: {
  gameKey: TavernGameKey;
  status: string;
  participants: Array<unknown>;
  result?: unknown;
}): boolean {
  return canInviteToTavernGameSession(session);
}

function buildTelegramShareUrl(inviteUrl: string): string {
  const text = "Квестарня кличе за стіл у шинку.";

  return `https://t.me/share/url?url=${encodeURIComponent(inviteUrl)}&text=${encodeURIComponent(text)}`;
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

function buildShynokRaidRequiredKeyboard(options: ShynokNavigationOptions = {}): InlineKeyboard {
  return new InlineKeyboard()
    .text("🛢️ До Бочки", makePlaceCallbackData("barrel"))
    .row()
    .text(buildBackToHallLabel(options), makePlaceCallbackData("hall"));
}

function diceButtonLabel(value: number, mask: number, index: number): string {
  return `${(mask & (1 << index)) !== 0 ? "✅" : "⬜"} ${value}`;
}

function scoreCategoryButtonLabel(category: DicePokerScoreCategory): string {
  return {
    ones: "Одиниці",
    twos: "Двійки",
    threes: "Трійки",
    fours: "Четвірки",
    fives: "Пʼятірки",
    sixes: "Шістки",
    triple: "Трійка",
    four_kind: "Каре",
    full_house: "Фул-хаус",
    small_straight: "Малий стріт",
    large_straight: "Великий стріт",
    poker: "Покер",
    chance: "Шанс"
  }[category];
}
