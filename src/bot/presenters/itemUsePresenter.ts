import type {
  ItemUseCancelRepositoryResult,
  ItemUseConfirmRepositoryResult,
  ItemUsePreviewRepositoryResult
} from "../../db/repositories/itemUseRepository";
import { escapeHtml } from "./telegramHtml";

export function presentItemUsePreview(result: ItemUsePreviewRepositoryResult): string {
  if (result.state === "no-character") {
    return "Спершу створіть пригодника через /start. Бинти не лікують порожні анкети.";
  }

  if (result.state === "not-owned") {
    return "Цього бинта в торбі вже немає. Торба мовчить підозріло переконливо.";
  }

  if (result.state === "not-usable") {
    return "Цю манатку зараз не можна використати. Єгер каже, що не все з назвою лікує.";
  }

  if (result.state === "combat-locked") {
    return "Під час бою бинти не слухаються. Спершу завершіть сутичку.";
  }

  if (result.state === "reserved") {
    return "Ця манатка вже зайнята іншою дією. Інвентар тримає чергу суворіше за Корчмаря.";
  }

  if (result.state === "full-hp") {
    return [
      "🩹 Бинт чекає",
      "",
      `HP уже повні: <b>${result.preview.hpBefore}/${result.preview.hpMax}</b>.`,
      "Єгер не дозволив витрачати бинт просто для драматичного вигляду."
    ].join("\n");
  }

  return [
    "🩹 Використати бинт?",
    "",
    `<b>${escapeHtml(result.order.itemName)}</b> зникне з торби.`,
    `HP: <b>${result.order.preview.hpBefore}/${result.order.preview.hpMax}</b> → <b>${result.order.preview.hpAfter}/${result.order.preview.hpMax}</b>.`,
    "",
    "Підтвердження ще раз перевірить торбу, бій і здоров'я."
  ].join("\n");
}

export function presentItemUseConfirm(result: ItemUseConfirmRepositoryResult): string {
  if (result.state === "no-character") {
    return "Спершу створіть пригодника через /start.";
  }

  if (result.state === "invalid-token") {
    return "Цей бинт загубив службову записку. Відкрийте манатку ще раз.";
  }

  if (result.state === "combat-locked") {
    return "Під час бою бинт не витрачається. Він чекає, поки ви перестанете героїчно махати руками.";
  }

  if (result.state === "expired") {
    return "Це підтвердження прострочилось. Бинт повернувся в торбу й робить вигляд, що так і планував.";
  }

  if (result.state === "cancelled") {
    return "Використання скасовано. Бинт лишився цілим і трохи самовдоволеним.";
  }

  if (result.state === "stale-selection") {
    return "Торба змінилась до підтвердження. Відкрийте манатку ще раз.";
  }

  if (result.state === "full-hp") {
    return [
      "🩹 Бинт не витрачено",
      "",
      `HP уже повні: <b>${result.order.preview.hpBefore}/${result.order.preview.hpMax}</b>.`,
      "Єгер схвалює економію."
    ].join("\n");
  }

  const replay = result.state === "replayed" ? "Результат уже записано раніше." : "Бинт використано.";
  const outcome = result.order.result ?? result.order.preview;

  return [
    "🩹 Бинт спрацював",
    "",
    `${replay}`,
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
    return "Бинт уже використано. Скасування запізнилось, як герой після вступної заставки.";
  }

  if (result.state === "expired") {
    return "Підтвердження вже прострочилось. Бинт не витрачено.";
  }

  return "Використання скасовано. Бинт лишився в торбі.";
}
