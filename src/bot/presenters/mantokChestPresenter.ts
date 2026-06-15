import type {
  MantokChestOverviewResult,
  MantokChestPresentedItem,
  MantokChestPreviewResult,
  MantokChestRecycleResult
} from "../../services/mantokChestService";
import { presentItemStackLine } from "./itemStackPresenter";
import { escapeHtml } from "./telegramHtml";

export function presentMantokChestOverview(result: MantokChestOverviewResult): string {
  if (result.state === "no-character") {
    return "Спершу створіть пригодника через /start. Скриня не їсть біографічну порожнечу.";
  }

  return [
    "🧰 <b>Дружня Скриня</b>",
    "",
    "Скриня з грушениці стоїть поруч.",
    "",
    "Точніше, не стоїть. Переступає з ніжки на ніжку. Їх у неї забагато, щоб рахувати без ризику для пальців.",
    "",
    "Вона може зʼїсти 5 зайвих манаток і виплюнути 1 нову — кращу за середнє з того, що було всередині.",
    "",
    `Доступних манаток: <b>${result.eligibleCount}</b>`
  ].join("\n");
}

export function presentMantokChestHelp(): string {
  return [
    "🧰 <b>Що робить Дружня Скриня</b>",
    "",
    "Вона бере рівно 5 доступних манаток і повертає 1 нову.",
    "",
    "Екіпіровані, безцінні й сюжетні речі не чіпає. Бо має манери. Або юриста.",
    "",
    "У цьому MVP Скриня сама вибирає 5 найдешевших доступних манаток. Ручний вибір буде пізніше, коли вона навчиться не рахувати ніжками."
  ].join("\n");
}

export function presentMantokChestPreview(result: MantokChestPreviewResult): string {
  if (result.state === "no-character") {
    return "Спершу створіть пригодника через /start. Скриня чемно відсунула тарілку.";
  }

  if (result.state === "not-enough-items") {
    return [
      "🧰 <b>Дружня Скриня</b>",
      "",
      `Скриня чемно постукала кришкою: їй треба 5 доступних манаток, а зараз <b>${result.eligibleCount}</b>.`
    ].join("\n");
  }

  return [
    "🧰 <b>Скриня обрала меню</b>",
    "",
    "⚠️ Скриня зʼїсть ці 5 манаток назавжди й поверне 1 нову. Вкладені речі не повернуться.",
    "",
    ...result.inputItems.map(presentMantokChestItemLine),
    "",
    `Мінімальний score нової манатки: <b>${result.minimumOutputScore}</b>.`,
    "",
    "Годуємо?"
  ].join("\n");
}

export function presentMantokChestRecycleResult(result: MantokChestRecycleResult): string {
  if (result.state === "no-character") {
    return "Спершу створіть пригодника через /start. Скриня не приймає анонімні обіди.";
  }

  if (result.state === "invalid-token") {
    return "🧰 Скриня не впізнала цей талон. Можливо, його вже зʼїв хтось із ніжок.";
  }

  if (result.state === "cancelled") {
    return "🧰 Скриня зітхнула кришкою й відпустила манатки назад у торбу.";
  }

  if (result.state === "stale-inputs") {
    return [
      "🧰 <b>Скриня вже приготувалася, але одна манатка втекла з меню.</b>",
      "",
      "Онови вибір: частина речей більше не доступна для переробки."
    ].join("\n");
  }

  if (result.state === "no-output-candidate") {
    return [
      "🧰 <b>Скриня зависла над тарілкою.</b>",
      "",
      "Вона не знайшла манатку, яка була б кращою за середнє меню. Речі лишились у торбі."
    ].join("\n");
  }

  if (result.state === "replayed") {
    return [
      "🧰 <b>Цю вечерю Скриня вже доїла.</b>",
      "",
      result.outputItem
        ? `У журналі записано:\n${presentMantokChestOutputCard(result.outputItem)}`
        : "У журналі є запис, але манатка соромʼязливо сховалась від опису."
    ].join("\n");
  }

  return [
    "<i>Хрум. Шурх. Дуже ділове «клац».</i>",
    "",
    "Скриня зʼїла 5 манаток і виплюнула:",
    "",
    presentMantokChestOutputCard(result.outputItem),
    "",
    "Вона виглядає задоволеною. Ти — на 4 рядки інвентаря легше."
  ].join("\n");
}

function presentMantokChestOutputCard(item: MantokChestPresentedItem): string {
  return [
    presentItemStackLine({
      name: `<b>${escapeHtml(item.content.name)}</b>`,
      quantity: item.quantity
    }),
    `<i>${escapeHtml(item.content.description)}</i>`
  ].join("\n");
}

function presentMantokChestItemLine(item: MantokChestPresentedItem): string {
  return presentItemStackLine({
    name: `<b>${escapeHtml(item.content.name)}</b>`,
    quantity: item.quantity
  });
}
