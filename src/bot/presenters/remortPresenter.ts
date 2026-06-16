import type { RemortConfirmResult, RemortUpdateResult, RemortViewResult } from "../../services/remortService";
import { REMORT_MAX_PRESERVED_ITEMS } from "../../domain/remort";
import { escapeHtml, presentCharacterHeader } from "./telegramHtml";

export function presentRemort(result: RemortViewResult): string {
  if (result.state === "no-character") {
    return "Спершу створіть пригодника через /start. Реморт без пригодника виглядає як переоблік порожньої торби.";
  }

  if (result.state === "locked") {
    return [
      "🕯️ Реморт ще не кличе.",
      "",
      presentCharacterHeader(result.character),
      "",
      `Реморт відкривається на <b>${result.requiredLevel}</b> рівні.`,
      "",
      "Корчмар каже: спершу доростіть до тринадцятої проблеми, тоді поговоримо про нове життя."
    ].join("\n");
  }

  return [
    "🕯️ Реморт",
    presentCharacterHeader(result.character),
    "",
    "Тринадцятий рівень — не стеля. Це двері, які питають, чи ви точно прочитали табличку.",
    "",
    "Після підтвердження персонаж почне нове життя з 1 рівня: XP і золото скинуться, спорядження знімуть, активні бійки закриються.",
    "",
    `Памʼять після реморту: <b>${result.memoryRankAfter}</b>/5 · бонус <b>+${result.memoryRankAfter * 2} HP</b> і <b>+${result.memoryRankAfter} мани</b>.`,
    "",
    "<b>Нова анкета</b>",
    `✅ Звертання: <b>${escapeHtml(result.identity.pronounLabel)}</b>`,
    `✅ Раса: <b>${escapeHtml(result.identity.raceName)}</b>`,
    `✅ Клас: <b>${escapeHtml(result.identity.className)}</b>`,
    "",
    "<b>Манатки в наступне життя</b>",
    presentSelectedItems(result),
    "",
    "Натискайте варіянти нижче, якщо хочете переписати біографію. Підтвердження — окрема кнопка з попередженням."
  ].join("\n");
}

export function presentRemortUpdate(result: RemortUpdateResult): string {
  if (result.state === "invalid-selection") {
    return [
      "🕯️ Реморт",
      "",
      `Канцелярія реморту хитнула свічкою: <i>${escapeHtml(result.reason)}</i>`,
      "",
      result.view ? presentRemort(result.view) : "Відкрийте /remort ще раз."
    ].join("\n");
  }

  return presentRemort(result);
}

export function presentRemortConfirm(result: RemortConfirmResult): string {
  if (result.state === "no-character") {
    return "Спершу створіть пригодника через /start.";
  }

  if (result.state === "invalid-token") {
    return "🕯️ Цей реморт не впізнали. Можливо, свічка вже догоріла. Відкрийте /remort ще раз.";
  }

  if (result.state === "locked") {
    return `🕯️ Реморт відкривається на <b>${result.requiredLevel}</b> рівні. Зараз у вас рівень ${result.level}.`;
  }

  if (result.state === "invalid-draft") {
    return [
      "🕯️ Реморт зупинився.",
      "",
      escapeHtml(result.reason),
      "",
      "Відкрийте /remort ще раз: корчмар видасть свіжу свічку й менш підозрілий бланк."
    ].join("\n");
  }

  const replayLine =
    result.state === "replayed"
      ? "Цей реморт уже записано. Дошка просто ще раз урочисто кашлянула."
      : "Свічка згасла, бланк клацнув, корчма зробила вигляд, що все так і планувала.";

  return [
    "🕯️ Реморт завершено.",
    "",
    replayLine,
    "",
    `<b>${escapeHtml(result.character.name)}</b> знову на 1 рівні.`,
    `Реморт: <b>${result.remortNumber}</b> · памʼять <b>${result.memoryRank}</b>/5.`,
    `Спомин дав: <b>+${result.hpBonus} HP</b> · <b>+${result.manaBonus} мани</b>.`,
    "",
    ...presentPreservedItemLines(result.preservedItems),
    "",
    "Корчмар каже: тепер це не початок з нуля. Це початок із підозрілою статистикою."
  ].join("\n");
}

function presentSelectedItems(result: Extract<RemortViewResult, { state: "ready" }>): string {
  if (result.eligibleItems.length === 0) {
    return "Немає відомих манаток для перенесення. Торба дивиться на свічку й робить вигляд, що так легше.";
  }

  if (result.selectedItems.length === 0) {
    return `Можна вибрати до ${REMORT_MAX_PRESERVED_ITEMS} манаток, по 1 одиниці кожної. Поки що нічого не вибрано.`;
  }

  return [
    `Вибрано ${result.selectedItems.length}/${REMORT_MAX_PRESERVED_ITEMS} (по 1 одиниці):`,
    ...result.selectedItems.map((item) => {
      const quantity = item.quantity > 1 ? ` · у торбі ${item.quantity}` : "";
      return `• <i>${escapeHtml(item.name)}</i>${quantity}`;
    })
  ].join("\n");
}

function presentPreservedItemLines(items: Array<{ name: string; quantity: number }>): string[] {
  if (items.length === 0) {
    return ["Манатки не переносились. Торба починає нове життя з чистим сумлінням."];
  }

  return [
    "Перенесено в нове життя (по 1 одиниці):",
    ...items.map((item) => {
      const quantity = item.quantity > 1 ? ` ×${item.quantity}` : "";
      return `• <i>${escapeHtml(item.name)}</i>${quantity}`;
    })
  ];
}
