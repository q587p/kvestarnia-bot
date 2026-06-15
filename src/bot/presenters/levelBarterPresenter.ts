import type {
  LevelBarterConfirmResult,
  LevelBarterOfferResult,
  LevelBarterPresentedOffer,
  LevelBarterPreviewResult
} from "../../services/levelBarterService";
import { escapeHtml, npcQuote, presentCharacterHeader } from "./telegramHtml";

export function presentLevelBarterOffer(result: LevelBarterOfferResult): string {
  if (result.state === "no-character") {
    return presentLevelBarterNoCharacter();
  }

  if (result.state === "battle-only-level") {
    return presentLevelBarterBattleOnlyLevel(result.character.name);
  }

  const lines = [
    "🎒 Манчкін-скупник",
    presentCharacterHeader(result.character),
    "",
    "За корчмою переминається з ноги на ногу клункастий манчкін. Клунок у нього такий повний, ніби вже має власний інвентар.",
    "",
    npcQuote(
      "Манчкін",
      "Мені треба манатки, золото й переконлива відсутність свідків. Назбираєш на 1000 золота — підтягну тобі рівень. До тринадцятого не лізу: там уже тільки бій, піт і дуже підозріла статистика."
    ),
    "",
    presentLevelBarterTotals({
      eligibleTotalValue: result.state === "ready" ? result.offer.itemTotalValue : result.eligibleTotalValue,
      gold: result.character.gold,
      combinedValue:
        result.state === "ready"
          ? result.offer.itemTotalValue + result.character.gold
          : result.combinedValue,
      cost: result.state === "ready" ? result.offer.cost : result.cost
    })
  ];

  if (result.state === "insufficient") {
    lines.push(
      "",
      "Манчкін сумно хитає головою. Каже, що це ще не хабар долі, а тільки вступний внесок у сором."
    );
  } else {
    lines.push(
      "",
      "Можна попросити його швидко скласти купку. Він робить це так, ніби народився у бухгалтерській пригоді."
    );
  }

  return lines.join("\n");
}

export function presentLevelBarterPreview(result: LevelBarterPreviewResult): string {
  if (result.state === "no-character") {
    return presentLevelBarterNoCharacter();
  }

  if (result.state === "battle-only-level") {
    return presentLevelBarterBattleOnlyLevel(result.character.name);
  }

  if (result.state === "insufficient") {
    return [
      "🎒 Манчкін рахує і зітхає.",
      presentCharacterHeader(result.character),
      "",
      presentLevelBarterTotals(result),
      "",
      npcQuote(
        "Манчкін",
        "Тут ще не вистачає на рівень. Принеси манаток, золота або хоча б дуже впевнений гаманець."
      )
    ].join("\n");
  }

  return [
    "🎒 Манчкін склав купку.",
    presentCharacterHeader(result.character),
    "",
    "Він перебирає манатки й золото так швидко, що кілька ремінців подали заяву на профспілку.",
    "",
    ...presentLevelBarterOfferDetails(result.offer),
    "",
    "Після підтвердження манатки зникнуть, золото піде за ними, а рівень підстрибне рівно на один."
  ].join("\n");
}

export function presentLevelBarterConfirmResult(result: LevelBarterConfirmResult): string {
  if (result.state === "no-character") {
    return presentLevelBarterNoCharacter();
  }

  if (result.state === "battle-only-level") {
    return [
      "🎒 Манчкін притримує клунок.",
      "",
      "Тринадцятий рівень він не продає й не вимінює. Каже, що такі речі беруться тільки боями, бо інакше дошка видатних жителів почне кашляти."
    ].join("\n");
  }

  if (result.state === "insufficient") {
    return [
      "🎒 Манчкін перерахував ще раз.",
      "",
      presentLevelBarterTotals(result),
      "",
      "Не зійшлося. Схоже, частина добра вже втекла в іншу історію."
    ].join("\n");
  }

  if (result.state === "stale-selection") {
    return [
      "🎒 Манчкін примружується.",
      "",
      npcQuote("Манчкін", "Щойно тут було більше добра. Порахуємо ще раз, поки клунок не почав брехати самостійно.")
    ].join("\n");
  }

  return [
    "🎒 Манчкін зникає в шелесті ремінців, пряжок і монет, які ще вчора мали плани.",
    presentCharacterHeader(result.character),
    "",
    "+1 рівень!",
    "",
    `Тепер ви <b>${result.offer.levelAfter}</b> рівня.`,
    "",
    `Прогрес досвіду збережено: <b>+${result.offer.xpCarry} XP</b> від старту рівня.`,
    "",
    `Списано манаток: <b>${result.offer.itemTotalValue} золота</b>`,
    `Списано з гаманця: <b>${result.offer.goldSpent} золота</b>`
  ].join("\n");
}

function presentLevelBarterOfferDetails(offer: LevelBarterPresentedOffer): string[] {
  const itemLines =
    offer.items.length === 0
      ? ["• манатки не чіпаємо; сьогодні працює гаманець"]
      : offer.items.map(
          (item) =>
            `• ${escapeHtml(item.content.name)} ×${item.quantity} — ${item.totalGoldValue} золота`
        );

  return [
    "Купка:",
    ...itemLines,
    "",
    `Манатками: <b>${offer.itemTotalValue}</b>`,
    `З гаманця: <b>${offer.goldSpent}</b>`,
    `Разом: <b>${offer.selectedTotalValue}</b> / ${offer.cost} золота`,
    `Переплата речами: <b>${offer.overpay}</b>`,
    "",
    `Результат: рівень <b>${offer.levelBefore}</b> → <b>${offer.levelAfter}</b>`,
    `XP лишається при вас: <b>+${offer.xpCarry}</b> від старту нового рівня.`
  ];
}

function presentLevelBarterTotals(input: {
  eligibleTotalValue: number;
  gold: number;
  combinedValue: number;
  cost: number;
}): string {
  return [
    `Манаток, які можна віддати: <b>${input.eligibleTotalValue}</b> / ${input.cost} золота.`,
    `👛 У гаманці: <b>${input.gold}</b> золота.`,
    `Разом для манчкінської математики: <b>${input.combinedValue}</b> / ${input.cost}.`
  ].join("\n");
}

function presentLevelBarterNoCharacter(): string {
  return "Спершу створіть пригодника через /start. Манчкін не торгує з туманом, бо туман не підписує акти.";
}

function presentLevelBarterBattleOnlyLevel(name: string): string {
  return [
    "🎒 Манчкін ховає лінійку рівнів.",
    "",
    npcQuote(
      "Манчкін",
      `${name}, тринадцятий рівень так не береться. Його треба вибити в боях, щоб корчма потім мала що перебільшувати.`
    )
  ].join("\n");
}
