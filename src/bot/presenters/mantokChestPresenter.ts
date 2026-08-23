import type {
  MantokChestManualSelectionResult,
  MantokChestOverviewResult,
  MantokChestPresentedItem,
  MantokChestPreviewResult,
  MantokChestRecycleResult
} from "../../services/mantokChestService";
import { FRIENDLY_CHEST_ICON } from "../itemActionIcons";
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
    "Екіпіровані речі не чіпає. Бо має манери. Або юриста.",
    "",
    "Автоматично вона бере тільки безпечний мотлох. У ручному виборі Скриню можна переконати зʼїсти безцінну чи сюжетну манатку, якщо ви дуже впевнені.",
    "",
    "Екіпіроване все одно не їсть: спершу зніміть річ, а тоді вже ведіть із меблями переговори."
  ].join("\n");
}

export function presentMantokChestManualSelection(result: MantokChestManualSelectionResult): string {
  if (result.state === "no-character") {
    return "Спершу створіть пригодника через /start. Скриня не обирає з порожньої анкети.";
  }

  if (result.state === "invalid-token") {
    return "🧰 Скриня загубила цей список. Відкрий її ще раз, поки вона не зробила вигляд, що так і було.";
  }

  const lines = [
    `${FRIENDLY_CHEST_ICON} <b>Дружня Скриня</b>`,
    `Обрано: <b>${result.selectedCount}/${result.requiredCount}</b>`,
    "",
    "Скриня киває кришкою. Це не згода, це апетит.",
    "",
    `Доступних манаток: <b>${result.eligibleCount}</b>`,
    `Сторінка <b>${result.page + 1}/${result.pageCount}</b>`,
    ""
  ];

  if (result.items.length === 0) {
    lines.push("Скриня не бачить нічого їстівного. Екіпіроване вона чемно не чіпає, навіть якщо дуже дивитися.");
  } else {
    lines.push(
      ...result.items.map((item) => {
        const selected = item.selectedQuantity > 0
          ? ` · на виделці <b>${item.selectedQuantity}</b>`
          : "";
        const manualOnly = item.manualOnly ? " · ручне переконання" : "";

        return `• <b>${escapeHtml(item.content.name)}</b> ×${item.availableQuantity}${selected}${manualOnly}`;
      })
    );
  }

  if (result.selectedCount === result.requiredCount) {
    lines.push("", "Можна переходити до підтвердження. Після нього ці 5 манаток зникнуть назавжди.");
  }

  return lines.join("\n");
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

  if (result.state === "selection-incomplete") {
    return [
      "🧰 <b>Дружня Скриня</b>",
      "",
      `Скриня порахувала виделки: обрано <b>${result.selectedCount}/5</b>. До підтвердження треба рівно 5 манаток.`
    ].join("\n");
  }

  const manualOnlyWarning = result.inputItems.some((item) => item.manualOnly)
    ? [
        "",
        "⚠️ У меню є памʼятна/безцінна/сюжетна манатка. Автоматично Скриня б таке не брала; це ручне переконання."
      ]
    : [];

  return [
    "🧰 <b>Скриня обрала меню</b>",
    "",
    "⚠️ Скриня зʼїсть ці 5 манаток назавжди й поверне 1 нову. Вкладені речі не повернуться.",
    ...manualOnlyWarning,
    "",
    ...result.inputItems.map(presentMantokChestItemLine),
    "",
    `Нова манатка має тягнути щонайменше на <b>${result.minimumOutputScore}</b> умовних скринячих одиниць. Що це за одиниці, Скриня не каже. Має право.`,
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

  if (result.state === "expired") {
    return [
      "🧰 <b>Скриня вже прибрала старий бланк.</b>",
      "",
      "Відкрийте Дружню Скриню ще раз: старе меню вона чемно здала в архів."
    ].join("\n");
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
