import type {
  PresentedDrinkDefinition,
  PresentedShynokDrinkState,
  ShynokDrinkConfirmResult,
  ShynokDrinkMenuResult,
  ShynokDrinkOrderResult,
  ShynokOverviewResult,
  ShynokRoundConfirmResult,
  ShynokRoundOfferRespondResult,
  ShynokRoundPreviewResult,
  ShynokSaleConfirmResult,
  ShynokSaleSelectionResult
} from "../../services/shynokService";
import type {
  KorchmaRoundLeaderboard,
  KorchmaRoundLeaderboardEntry
} from "../../db/repositories/korchmaRoundPurchaseRepository";
import { presentCharacterHeader } from "./telegramHtml";
import { escapeHtml } from "./telegramHtml";

export function presentShynokGate(result: { state: string }): string {
  switch (result.state) {
    case "no-character":
      return "Спершу створіть пригодника через /start. Корчмар не наливає порожній анкеті.";
    case "wrong-place":
      return "🍻 Цей шинковий чек уже несвіжий. Поверніться до Шинку з корчми, і корчмар знову покаже стійку.";
    case "active-combat":
      return "🍻 Корчмар прикрив рахівницю: спершу завершіть бій, тоді вже напої й манатки.";
    case "pending-raid":
      return "🍻 Корчмар ховає кухоль. Спершу завершіть рейд на Бочку в цьому відтинку.";
    default:
      return "🍻 Корчмар не впізнав цей чек. Відкрийте Шинок ще раз.";
  }
}

export function presentShynokOverview(result: ShynokOverviewResult): string {
  if (result.state !== "ready") {
    return presentShynokGate(result);
  }

  return [
    "🍻 Шинок",
    presentCharacterHeader(result.character),
    "",
    "Корчмар виставив напої, рахівницю й табличку «манатки приймаємо не всі, бо маємо очі».",
    "",
    ...presentActiveDrinkLines(result.activeDrink),
    ...presentRoundOfferLines(result),
    "",
    "Що робимо зі стійкою?"
  ].join("\n");
}

export function presentShynokDrinkMenu(result: ShynokDrinkMenuResult): string {
  if (result.state !== "ready") {
    return presentShynokGate(result);
  }

  return [
    "🍹 Напої для себе",
    presentCharacterHeader(result.character),
    "",
    "Корчмар виставив чотири варіянти. Три з них рідкі. Четвертий теж, але має характер.",
    "",
    ...presentActiveDrinkLines(result.activeDrink),
    "",
    "Золото спишеться лише після підтвердження."
  ].join("\n");
}

export function presentShynokDrinkPreview(result: ShynokDrinkOrderResult): string {
  if (result.state !== "preview") {
    return presentShynokGate(result);
  }

  return [
    `${result.drink.emoji} ${escapeHtml(result.drink.name)} — ${result.drink.priceGold} золота`,
    presentCharacterHeader(result.character),
    "",
    presentDrinkEffectLine(result.drink),
    ...presentReplacementWarning(result.activeDrink, result.drink),
    "",
    "Наливаємо?"
  ].join("\n");
}

export function presentShynokDrinkConfirmResult(result: ShynokDrinkConfirmResult): string {
  if (result.state === "completed" || result.state === "replayed") {
    return [
      result.state === "replayed" ? "🍹 Цей напій уже записано." : "🍹 Налито.",
      "",
      result.drink
        ? `${result.drink.emoji} <b>${escapeHtml(result.drink.name)}</b> діє до ${formatTime(result.drink.expiresAt)}.`
        : "У журналі є запис, але кухоль соромиться опису.",
      "",
      `Списано: <b>${result.spentGold} золота</b>.`
    ].join("\n");
  }

  if (result.state === "not-enough-gold") {
    return [
      "🍹 Корчмар рахує монети.",
      "",
      `Для цього кухля треба <b>${result.priceGold} золота</b>. У торбі чути скромніше дзеленькання.`
    ].join("\n");
  }

  if (result.state === "expired") {
    return "🍹 Корчмар прибрав старий кухоль. Відкрийте напої ще раз.";
  }

  return presentShynokGate(result);
}

export function presentShynokRoundPreview(result: ShynokRoundPreviewResult): string {
  if (result.state === "preview") {
    return [
      result.tier === "fine" ? "🍻 Якісне всім" : "🍺 Просте всім",
      presentCharacterHeader(result.character),
      "",
      `Одержувачів у збереженому списку: <b>${result.recipientCount}</b>.`,
      `Ціна раунду: <b>${result.priceGold} золота</b>.`,
      "",
      "Кожен отримає кухоль: випити або чемно відмовитися.",
      "",
      ...presentKorchmaRoundLeaderboard(result.leaderboard),
      "",
      "Ставимо?"
    ].join("\n");
  }

  if (result.state === "raid-required") {
    return presentShynokGate({ state: "pending-raid" });
  }

  if (result.state === "not-enough-gold") {
    return [
      "🍻 Корчмар рахує монети.",
      "",
      `Раунд коштує <b>${result.priceGold} золота</b>, а у вас <b>${result.gold}</b>.`
    ].join("\n");
  }

  return presentShynokGate(result);
}

export function presentShynokRoundConfirm(result: ShynokRoundConfirmResult): string {
  if (result.state === "completed" || result.state === "replayed") {
    return [
      result.state === "replayed" ? "🍻 Цей раунд уже поставлено." : "🍻 Корчмар поставив кухлі.",
      "",
      `Одержувачів: <b>${result.recipientCount}</b>.`,
      `Списано: <b>${result.priceGold} золота</b>.`,
      "",
      "Хто схоче, випʼє сам. Хто не схоче, збереже точність і легенду.",
      "",
      ...presentKorchmaRoundLeaderboard(result.leaderboard)
    ].join("\n");
  }

  if (result.state === "raid-required") {
    return presentShynokGate({ state: "pending-raid" });
  }

  if (result.state === "not-enough-gold") {
    return `🍻 Для цього раунду треба <b>${result.priceGold} золота</b>.`;
  }

  if (result.state === "expired") {
    return "🍻 Список кухлів протермінувався. Оновіть раунд.";
  }

  return presentShynokGate(result);
}

export function presentShynokRoundOfferResponse(result: ShynokRoundOfferRespondResult): string {
  if (result.state === "replacement-preview") {
    return [
      "🍺 На вас уже діє інший напій.",
      "",
      `Зараз: ${result.activeDrink.emoji} <b>${escapeHtml(result.activeDrink.name)}</b> до ${formatTime(result.activeDrink.expiresAt)}.`,
      `Новий кухоль: ${result.drink.emoji} <b>${escapeHtml(result.drink.name)}</b>.`,
      "",
      "Якщо підтвердите, новий кухоль замінить поточний. Поки що нічого не змінено."
    ].join("\n");
  }

  if (result.state === "accepted" || result.state === "replayed") {
    return [
      result.state === "replayed" ? "🍺 Цей кухоль уже враховано." : "🍺 Ви взяли кухоль.",
      "",
      result.drink
        ? `${result.drink.emoji} <b>${escapeHtml(result.drink.name)}</b> діє до ${formatTime(result.drink.expiresAt)}.`
        : "Журнал каже, що кухоль був. Кухоль каже, що його вже нема."
    ].join("\n");
  }

  if (result.state === "declined") {
    return "🍺 Ви чемно відмовились. Точність зітхнула з полегшенням.";
  }

  if (result.state === "expired") {
    return "🍺 Кухоль протермінувався. Корчмар уже пустив його в історію піни.";
  }

  if (result.state === "stale-replacement") {
    return "🍺 Напій уже змінився, тож старе підтвердження не годиться. Оновіть Шинок і виберіть знову.";
  }

  return presentShynokGate(result);
}

export function presentShynokSaleSelection(result: ShynokSaleSelectionResult): string {
  if (result.state !== "selection") {
    return presentShynokGate(result);
  }

  const lines = [
    "💰 Оцінка манаток",
    presentCharacterHeader(result.character),
    "",
    "Корчмар платить корчмарську частку від написаної вартости. Решта іде на ризик, пил, полиці та дуже складну математику стійки.",
    "",
    `Обрано: <b>${result.selectedCount}</b> із <b>${result.eligibleCount}</b> придатних.`,
    `Номінальна вартість: <b>${result.nominalValue} золота</b>.`,
    `Корчмарська виплата: <b>${result.payoutGold} золота</b>.`,
    `Сторінка <b>${result.page + 1}/${result.pageCount}</b>.`,
    ""
  ];

  if (result.items.length === 0) {
    lines.push("Корчмар не бачить придатних манаток. Екіпіроване, памʼятне й безцінне лишається в торбі.");
  } else {
    lines.push(...result.items.map((item) =>
      `• <b>${escapeHtml(item.content.name)}</b> ×${item.availableQuantity} · обрано <b>${item.selectedQuantity}</b> · ${item.unitGoldValue} золота`
    ));
  }

  if (result.selectedCount > 0 && result.payoutGold === 0) {
    lines.push("", "Виплата нульова. Додайте ще дешевих речей або очистіть кошик.");
  }

  if (result.selectedCount > 0) {
    lines.push("", "Продаж остаточний. Памʼятне, екіпіроване й безцінне лишилося в торбі.");
  }

  return lines.join("\n");
}

export function presentShynokSaleConfirm(result: ShynokSaleConfirmResult): string {
  if (result.state === "sold" || result.state === "replayed") {
    return [
      result.state === "replayed"
        ? "💰 Цей продаж уже записано."
        : "💰 Продано. Корчмар поклав манатки під стійку, де вони миттєво стали «майже колекційними».",
      "",
      `Номінальна вартість: <b>${result.sale.nominalValue} золота</b>.`,
      `Виплата: <b>${result.sale.payoutGold} золота</b>.`,
      "",
      ...result.items.slice(0, 6).map((item) => `• ${escapeHtml(item.content.name)} ×${item.quantity}`)
    ].join("\n");
  }

  if (result.state === "stale-selection") {
    return "💰 Манатки встигли змінити диспозицію. Оновіть оцінку: продаж не проведено.";
  }

  if (result.state === "zero-payout") {
    return "💰 Корчмар не може провести нульову виплату. Додайте щось дорожче.";
  }

  if (result.state === "cancelled") {
    return "💰 Оцінку скасовано. Манатки лишилися в торбі й роблять вигляд, що не хвилювались.";
  }

  if (result.state === "expired") {
    return "💰 Стару оцінку прибрано зі стійки. Відкрийте продаж ще раз.";
  }

  return presentShynokGate(result);
}

function presentActiveDrinkLines(drink: PresentedShynokDrinkState | null): string[] {
  if (!drink) {
    return ["Поточний напій: <i>немає</i>."];
  }

  return [
    `Поточний напій: ${drink.emoji} <b>${escapeHtml(drink.name)}</b> до ${formatTime(drink.expiresAt)}.`
  ];
}

function presentRoundOfferLines(result: Extract<ShynokOverviewResult, { state: "ready" }>): string[] {
  if (result.openRoundOffers.length === 0) {
    return [];
  }

  return [
    "",
    `На вас чекає ${result.openRoundOffers.length} ${result.openRoundOffers.length === 1 ? "кухоль" : "кухлі"} від щедрих пригодників.`
  ];
}

function presentReplacementWarning(
  activeDrink: PresentedShynokDrinkState | null,
  drink: PresentedDrinkDefinition
): string[] {
  if (!activeDrink) {
    return [];
  }

  return [
    "",
    `На вас іще діє «${escapeHtml(activeDrink.name)}». «${escapeHtml(drink.name)}» замінить цей ефект. Перелити долю в інший кухоль?`
  ];
}

function presentDrinkEffectLine(drink: PresentedDrinkDefinition): string {
  if (drink.key === "drink.thyme-tea") {
    return "На 42 хвилини трохи пришвидшує відновлення HP і мани поза боєм. Без бойового штрафу.";
  }
  if (drink.key === "drink.simple-beer") {
    return "На 23 хвилини краще повертає сили між бійками, але точні рухи стають трохи менш переконливими.";
  }
  if (drink.key === "drink.fine-beer") {
    return "Довше й сильніше допомагає відновлюватись, зате приціл починає поважати свободу вибору.";
  }

  return "Чекає наступної сутички: ви битимете болючіше й так само чесно отримуватимете більше у відповідь.";
}

function presentKorchmaRoundLeaderboard(leaderboard: KorchmaRoundLeaderboard): string[] {
  return [
    "🏅 Рейтинг щедрості",
    "",
    ...presentLeaderboardSection("За добу", leaderboard.day),
    "",
    ...presentLeaderboardSection("За тиждень", leaderboard.week),
    "",
    ...presentLeaderboardSection("За місяць", leaderboard.month)
  ];
}

function presentLeaderboardSection(
  title: string,
  entries: KorchmaRoundLeaderboardEntry[]
): string[] {
  if (entries.length === 0) {
    return [`<b>${title}</b>: ще ніхто не пригощав. Корчмар тримає крейду напоготові.`];
  }

  return [
    `<b>${title}</b>:`,
    ...entries.map((entry, index) => presentLeaderboardEntry(entry, index + 1))
  ];
}

function presentLeaderboardEntry(entry: KorchmaRoundLeaderboardEntry, rank: number): string {
  const count = `${entry.roundCount} ${presentRoundCount(entry.roundCount)}`;

  return `${rank}. ${escapeHtml(entry.name)} — ${count} · ${entry.spentGold} золота`;
}

function presentRoundCount(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;

  if (lastTwo >= 11 && lastTwo <= 14) {
    return "частувань";
  }

  if (last === 1) {
    return "частування";
  }

  if (last >= 2 && last <= 4) {
    return "частування";
  }

  return "частувань";
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("uk-UA", {
    timeZone: "Europe/Kyiv",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}
