import type {
  ItemUpgradeAttemptServiceResult,
  ItemUpgradeListResult,
  ItemUpgradePreviewResult
} from "../../services/itemUpgradeService";
import { items } from "../../content";
import { presentItemEffect } from "./itemEffectPresenter";
import { escapeHtml } from "./telegramHtml";

export function presentItemUpgradeList(result: ItemUpgradeListResult): string {
  if (result.state === "no-character") {
    return "Спершу створіть пригодника через /start. Чароковальня не кує порожнечу без техзавдання.";
  }

  if (result.items.length === 0) {
    return [
      "✨ <b>Чароковальня</b>",
      "",
      "Коваль дивиться в торбу й не знаходить манатки, яку зараз варто підсилювати.",
      "",
      `Іскрокамінь: <b>${result.iskrokamin}</b>`
    ].join("\n");
  }

  return [
    "✨ <b>Чароковальня</b>",
    "",
    "Тут одну манатку зі стосу можна підсилити до наступного «+». Попередній перегляд нічого не витрачає.",
    "",
    `Іскрокамінь: <b>${result.iskrokamin}</b>`,
    result.canUseSelfTemper
      ? "Магічна самозакалка доступна: менше золота, більше мани й трохи більше нервів."
      : "Магічна самозакалка доступна лише магам і спорідненим майстрам іскор."
  ].join("\n");
}

export function presentItemUpgradePreview(result: ItemUpgradePreviewResult): string {
  if (result.state === "no-character") {
    return "Спершу створіть пригодника через /start. Іскри не мають кому летіти в рукав.";
  }

  if (result.state === "not-owned") {
    return "Цієї манатки вже немає в торбі. Вона або втекла, або стала доказом у іншій справі.";
  }

  if (result.state === "not-upgradeable") {
    return "Цю манатку Чароковальня поки не бере. Коваль каже: «Не все, що блищить, треба бити молотом».";
  }

  if (result.state === "cap-reached") {
    return `✨ <b>${escapeHtml(result.item.name)}</b>\n\nДалі вже нікуди: +5 тримається так гордо, що молот сам просить перерву.`;
  }

  const methodLine = result.method === "self"
    ? "Спосіб: <b>самозакалка</b> — без золота, але з маною."
    : "Спосіб: <b>майстер Чароковальні</b> — золото за відповідальний стукіт.";
  const donorLine = result.donor
    ? `Донор: <b>${escapeHtml(result.donor.name)}</b> — після спроби зникне зі стосу.`
    : "Донор: <i>не вибрано</i>.";

  return [
    `✨ <b>${escapeHtml(result.item.name)}</b> → <b>+${result.item.targetLevel}</b>`,
    "",
    methodLine,
    `Ціна: ${presentCosts(result.costs)}`,
    donorLine,
    "",
    `Шанс до натискання: <b>${presentQualitativeChance(result.chance.finalChance)}</b>.`,
    result.chance.guaranteed
      ? "Жалісливий молот уже кивнув: наступна спроба гарантована."
      : result.pityFailures > 0
        ? `Жалісливий молот памʼятає невдачі: <b>${result.pityFailures}</b>.`
        : "Жалісливий молот ще нічого не памʼятає.",
    "",
    "Після натискання ресурси витрачаються одразу, а повтор старої кнопки має відмовити без другого списання."
  ].join("\n");
}

export function presentItemUpgradeAttempt(result: ItemUpgradeAttemptServiceResult): string {
  if (result.state === "no-character") {
    return "Спершу створіть пригодника через /start. Молот не знайшов замовника.";
  }

  if (result.state === "not-owned") {
    return "Манатки вже немає в торбі. Спробу не почато.";
  }

  if (result.state === "not-upgradeable") {
    return "Чароковальня відмовила: цю манатку зараз не підсилюють. Нічого не витрачено.";
  }

  if (result.state === "cap-reached") {
    return "Манатка вже на +5. Молот чемно лежить і не провокує долю.";
  }

  if (result.state === "stale-snapshot") {
    return "Стара кнопка. Стос, рівень або памʼять невдач уже змінилися, тому нічого не витрачено.";
  }

  if (result.state === "class-not-allowed") {
    return "Самозакалка доступна лише тим, хто вміє домовлятися з іскрами без зайвого диму. Нічого не витрачено.";
  }

  if (result.state === "invalid-donor") {
    return "Донорська манатка не підходить або вже зникла. Нічого не витрачено.";
  }

  if (result.state === "not-enough-gold") {
    return `Не вистачає золота: треба <b>${result.required}</b>, у кишені <b>${result.available}</b>.`;
  }

  if (result.state === "not-enough-iskrokamin") {
    return `Не вистачає Іскрокаменю: треба <b>${result.required}</b>, у торбі <b>${result.available}</b>.`;
  }

  if (result.state === "not-enough-mana") {
    return `Не вистачає мани: треба <b>${result.required}</b>, зараз <b>${result.available}</b>.`;
  }

  const itemName = escapeHtml(items.find((item) => item.id === result.item.itemId)?.name ?? result.item.itemId);
  const outcome = result.success
    ? `✅ <b>Підсилено до +${result.targetLevel}</b>`
    : "🧯 <b>Не вийшло</b>";
  const pityLine = result.success
    ? "Жалісливий молот забув невдачі для цього кроку."
    : `Жалісливий молот запамʼятав невдачу: <b>${result.pityFailuresAfter}</b>.`;

  return [
    "✨ <b>Чароковальня</b>",
    "",
    outcome,
    `Манатка: <b>${itemName}</b>`,
    `Витрачено: ${presentCosts(result.spent)}${result.donorConsumed ? " · донорська манатка" : ""}`,
    `Фактичний шанс цієї спроби: <b>${result.finalChance}%</b>${result.pityGuaranteed ? " (гарантія)" : ""}.`,
    pityLine
  ].join("\n");
}

export function presentItemUpgradeEffectDelta(before: { effect?: Parameters<typeof presentItemEffect>[0] }, after: { effect?: Parameters<typeof presentItemEffect>[0] }): string | null {
  const beforeEffect = presentItemEffect(before.effect) ?? "без видимого ефекту";
  const afterEffect = presentItemEffect(after.effect) ?? "без видимого ефекту";

  return beforeEffect === afterEffect ? null : `Ефект: <i>${beforeEffect}</i> → <b>${afterEffect}</b>`;
}

function presentCosts(costs: { gold: number; iskrokamin: number; mana: number }): string {
  return [
    costs.gold > 0 ? `${costs.gold} золота` : null,
    `${costs.iskrokamin} Іскрокамінь`,
    costs.mana > 0 ? `${costs.mana} мани` : null
  ].filter((part): part is string => Boolean(part)).join(" · ");
}

function presentQualitativeChance(chance: number): string {
  if (chance >= 95) {
    return "майже певно";
  }

  if (chance >= 75) {
    return "надійно";
  }

  if (chance >= 50) {
    return "ризиковано, але чесно";
  }

  if (chance >= 30) {
    return "нервово";
  }

  return "дуже нервово";
}
