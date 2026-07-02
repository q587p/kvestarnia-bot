import type {
  ItemUseCancelRepositoryResult,
  ItemUseConfirmRepositoryResult,
  ItemUsePreviewRepositoryResult,
  ItemUseRestoreToFullRepositoryResult
} from "../../db/repositories/itemUseRepository";
import { escapeHtml } from "./telegramHtml";

interface CombatLockedItemUseOptions {
  combatUseAvailable?: boolean;
}

export function presentItemUsePreview(
  result: ItemUsePreviewRepositoryResult,
  options: CombatLockedItemUseOptions = {}
): string {
  if (result.state === "no-character") {
    return "Спершу створіть пригодника через /start. Манатки не лікують порожні анкети.";
  }

  if (result.state === "not-owned") {
    return "Цієї манатки в торбі вже немає. Торба мовчить підозріло переконливо.";
  }

  if (result.state === "not-usable") {
    return "Цю манатку зараз не можна використати. Єгер каже, що не все з назвою лікує.";
  }

  if (result.state === "combat-locked") {
    return presentCombatLockedItemUse(options);
  }

  if (result.state === "reserved") {
    return "Ця манатка вже зайнята іншою дією. Інвентар не витрачатиме її вдруге.";
  }

  if (result.state === "full-hp") {
    return [
      "🩹 Манатка чекає",
      "",
      presentHpNoopLine(result.preview),
      "Єгер не дозволив витрачати медицину просто для драматичного вигляду."
    ].join("\n");
  }

  return [
    "🩹 Використати манатку?",
    "",
    `<b>${escapeHtml(result.order.itemName)}</b> зникне з торби.`,
    `HP: <b>${result.order.preview.hpBefore}/${result.order.preview.hpMax}</b> → <b>${result.order.preview.hpAfter}/${result.order.preview.hpMax}</b>.`,
    "",
    "Підтвердження ще раз перевірить торбу й здоров'я."
  ].join("\n");
}

export function presentItemUseConfirm(
  result: ItemUseConfirmRepositoryResult,
  options: CombatLockedItemUseOptions = {}
): string {
  if (result.state === "no-character") {
    return "Спершу створіть пригодника через /start.";
  }

  if (result.state === "invalid-token") {
    return "Ця манатка загубила службову записку. Відкрийте її ще раз.";
  }

  if (result.state === "combat-locked") {
    return presentCombatLockedItemUse(options);
  }

  if (result.state === "expired") {
    return "Це підтвердження прострочилось. Манатка повернулася в торбу й робить вигляд, що так і планувала.";
  }

  if (result.state === "cancelled") {
    return "Використання скасовано. Манатка лишилася цілою і трохи самовдоволеною.";
  }

  if (result.state === "stale-selection") {
    return "Торба змінилась до підтвердження. Відкрийте манатку ще раз.";
  }

  if (result.state === "full-hp") {
    const outcome = result.order.result ?? result.order.preview;

    return [
      "🩹 Манатку не витрачено",
      "",
      presentHpNoopLine(outcome),
      "Єгер схвалює економію."
    ].join("\n");
  }

  const replay = result.state === "replayed" ? "Результат уже записано раніше." : "Манатку використано.";
  const outcome = result.order.result ?? result.order.preview;
  const restoredToFull = result.order.preview.mode === "restore-to-full";

  return [
    restoredToFull ? "🩹 Відновлення завершено" : "🩹 Манатка спрацювала",
    "",
    `${replay}`,
    ...(restoredToFull ? [`Використано бинтів: <b>${result.order.quantity}</b>.`] : []),
    `HP: <b>${outcome.hpBefore}/${outcome.hpMax}</b> → <b>${outcome.hpAfter}/${outcome.hpMax}</b>.`,
    "",
    "Єгер сказав: «Не героїзм, але бухгалтерія виживання схвалила»."
  ].join("\n");
}

export function presentItemUseCancel(result: ItemUseCancelRepositoryResult): string {
  if (result.state === "no-character") {
    return "Спершу створіть пригодника через /start.";
  }

  if (result.state === "invalid-token") {
    return "Це підтвердження вже не знайдено. Відкрийте манатку ще раз.";
  }

  if (result.state === "completed") {
    return "Манатку вже використано. Скасування запізнилось, як герой після вступної заставки.";
  }

  if (result.state === "expired") {
    return "Підтвердження вже прострочилось. Бинт не витрачено.";
  }

  if (result.state === "stale-selection") {
    return "Манатка зараз завершує іншу дію. Відкрийте її ще раз.";
  }

  return "Використання скасовано. Манатка лишилася в торбі.";
}

export function presentItemUseRestoreToFull(
  result: ItemUseRestoreToFullRepositoryResult,
  options: CombatLockedItemUseOptions = {}
): string {
  if (result.state === "no-character") {
    return "Спершу створіть пригодника через /start.";
  }

  if (result.state === "not-usable") {
    return "Цю манатку зараз не можна використати для відновлення.";
  }

  if (result.state === "combat-locked") {
    return presentCombatLockedItemUse(options);
  }

  if (result.state === "reserved") {
    return "Ця манатка вже зайнята іншою дією. Інвентар не витрачатиме її вдруге.";
  }

  if (result.state === "not-owned") {
    return "Бинтів у торбі вже немає. Єгер підозрює, що вони виконали план.";
  }

  if (result.state === "not-enough") {
    return [
      "🩹 Бинтів замало",
      "",
      `До повного HP треба: <b>${result.neededQuantity}</b>.`,
      `У торбі зараз: <b>${result.availableQuantity}</b>.`
    ].join("\n");
  }

  if (result.state === "preview-created" || result.state === "preview-replayed") {
    return [
      "🩹 Відновитися до повного HP?",
      "",
      `<b>${escapeHtml(result.order.itemName)}</b> зникнуть з торби лише після підтвердження.`,
      `HP: <b>${result.order.preview.hpBefore}/${result.order.preview.hpMax}</b> → <b>${result.order.preview.hpAfter}/${result.order.preview.hpMax}</b>.`,
      `Бракує HP: <b>${result.order.preview.healAmount}</b>.`,
      `Буде витрачено бинтів: <b>${result.neededQuantity}</b>.`,
      `У торбі зараз: <b>${result.availableQuantity}</b>.`
    ].join("\n");
  }

  if (result.state === "full-hp") {
    return [
      "🩹 Бинти чекають",
      "",
      `HP уже повні: <b>${result.preview.hpBefore}/${result.preview.hpMax}</b>.`,
      "Єгер схвалює економію."
    ].join("\n");
  }

  if (result.state === "restored") {
    return [
      "🩹 Відновлення завершено",
      "",
      `Використано бинтів: <b>${result.result.quantity}</b>.`,
      `HP: <b>${result.result.hpBefore}/${result.result.hpMax}</b> → <b>${result.result.hpAfter}/${result.result.hpMax}</b>.`,
      "",
      "Єгер мовчки поставив печатку «виживе»."
    ].join("\n");
  }

  return "Це відновлення вже не можна застосувати. Відкрийте манатку ще раз.";
}

function presentCombatLockedItemUse(options: CombatLockedItemUseOptions): string {
  if (options.combatUseAvailable) {
    return "Під час бою манатку треба використати як бойову дію. Відкрийте її з торби ще раз: кнопка піде в поточний хід.";
  }

  return "Під час цього бою манатку не можна використати з торби. Завершіть бій або поверніться до бойової картки з доступними діями.";
}

function presentHpNoopLine(preview: { hpBefore: number; hpMax: number }): string {
  return preview.hpBefore >= preview.hpMax
    ? `HP уже повні: <b>${preview.hpBefore}/${preview.hpMax}</b>.`
    : `HP уже достатньо для цієї манатки: <b>${preview.hpBefore}/${preview.hpMax}</b>.`;
}
