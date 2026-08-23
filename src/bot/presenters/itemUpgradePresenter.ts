import type {
  ItemUpgradeAttemptServiceResult,
  ItemDismantleListResult,
  ItemDismantlePreviewResult,
  ItemUpgradeListResult,
  ItemUpgradePreviewResult,
  ItemUpgradeUnlockServiceResult
} from "../../services/itemUpgradeService";
import type { ItemDismantleConfirmResult } from "../../db/repositories/itemUpgradeRepository";
import { enrichRewardItemGrants } from "../../services/itemGrant";
import { findItemContent } from "../../content/itemLookup";
import { presentItemEffect } from "./itemEffectPresenter";
import { presentQuestRewardBlock } from "./rewardPresenter";
import { escapeHtml } from "./telegramHtml";
import { ITEM_DISMANTLE_ICON } from "../itemActionIcons";

export function presentItemUpgradeList(result: ItemUpgradeListResult): string {
  if (result.state === "no-character") {
    return "Спершу створіть пригодника через /start. Чароковальня не кує порожнечу без техзавдання.";
  }

  if (result.state === "wrong-place" || result.state === "level-locked" || result.state === "unlock-required") {
    return presentItemUpgradeGate(result);
  }

  if (result.items.length === 0) {
    return [
      "✨ <b>Чароковальня</b>",
      "",
      "Маг дивиться в торбу й не знаходить манатки, яку зараз варто підсилювати.",
      "",
      `Іскрокамінь: <b>${result.iskrokamin}</b>`
    ].join("\n");
  }

  return [
    "✨ <b>Чароковальня</b>",
    "",
    "У задвірку корчми маг тримає іскри в банці й підсилює одну манатку зі стосу до наступного «+». Попередній перегляд нічого не витрачає.",
    "",
    `Іскрокамінь: <b>${result.iskrokamin}</b>`,
    "",
    result.canUseSelfTemper
      ? "Як маг, ви можете зробити іскровий підкрут самі: менше золота, більше мани й трохи більше нервів."
      : "Якщо ви не маг, він робить відповідальний стукіт сам."
  ].join("\n");
}

export function presentItemUpgradePreview(result: ItemUpgradePreviewResult): string {
  if (result.state === "no-character") {
    return "Спершу створіть пригодника через /start. Іскри не мають кому летіти в рукав.";
  }

  if (result.state === "wrong-place" || result.state === "level-locked" || result.state === "unlock-required") {
    return presentItemUpgradeGate(result);
  }

  if (result.state === "not-owned") {
    return "Цієї манатки вже немає в торбі. Вона або втекла, або стала доказом у іншій справі.";
  }

  if (result.state === "not-upgradeable") {
    return "Цю манатку Чароковальня поки не бере. Маг каже: «Не все, що блищить, треба бити молотом».";
  }

  if (result.state === "cap-reached") {
    return `✨ <b>${escapeHtml(result.item.name)}</b>\n\nДалі вже нікуди: +5 тримається так гордо, що молот сам просить перерву.`;
  }

  const methodLine = result.method === "self"
    ? "Спосіб: <b>іскровий підкрут</b> — без золота, але з маною."
    : "Спосіб: <b>маг Чароковальні</b> — золото за відповідальний стукіт.";
  const donorLine = result.donor
    ? `Донор: <b>${escapeHtml(result.donor.name)}</b> — після спроби зникне зі стосу.`
    : "Донор: <i>не вибрано</i>.";
  const traitLines = presentItemUpgradeTraitLines(result.item);

  return [
    `✨ <b>${escapeHtml(result.item.name)}</b> → <b>+${result.item.targetLevel}</b>`,
    "",
    methodLine,
    ...traitLines,
    `Ціна: ${presentCosts(result.costs)}`,
    `У вас: <b>${result.available.gold}</b> золота · <b>${result.available.iskrokamin}</b> Іскрокаменю`,
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

  if (result.state === "wrong-place" || result.state === "level-locked" || result.state === "unlock-required") {
    return presentItemUpgradeGate(result);
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

  const item = findItemContent(result.item.itemId);
  const itemName = escapeHtml(item?.name ?? result.item.itemId);
  const outcome = result.success
    ? `✅ <b>Підсилено до +${result.targetLevel}</b>`
    : "🧯 <b>Не вийшло</b>";
  const pityLine = result.success
    ? "Жалісливий молот забув невдачі для цього кроку."
    : `Жалісливий молот запамʼятав невдачу: <b>${result.pityFailuresAfter}</b>.`;
  const effect = item && "effect" in item ? item.effect : undefined;
  const effectLine = result.success ? presentItemUpgradeResultEffectLine(effect) : null;

  return [
    "✨ <b>Чароковальня</b>",
    "",
    outcome,
    `Манатка: <b>${itemName}</b>`,
    ...(effectLine ? [effectLine] : []),
    "",
    `Витрачено: ${presentCosts(result.spent)}${result.donorConsumed ? " · донорська манатка" : ""}`,
    "",
    pityLine
  ].join("\n");
}

export function presentItemUpgradeUnlock(result: ItemUpgradeUnlockServiceResult): string {
  if (result.state === "no-character") {
    return "Спершу створіть пригодника через /start. Маг не приймає аптечки від туману.";
  }

  if (result.state === "wrong-place" || result.state === "level-locked") {
    return presentItemUpgradeGate(result);
  }

  if (result.state === "missing-field-kit") {
    return [
      "✨ <b>Чароковальня</b>",
      "",
      "Маг просить принести <b>Польову аптечку</b>. Без неї він відмовляється пояснювати, чому іскри іноді поводяться як бухгалтерія.",
      "",
      "Якщо аптечки немає, Єгер знає, з якого кінця починається здобування."
    ].join("\n");
  }

  if (result.state === "already-unlocked") {
    return [
      "✨ <b>Чароковальня вже відкрита</b>",
      "",
      "Маг дивиться на журнал і киває: аптечка вже пішла на безпеку, іскри вже підписалися під правилами."
    ].join("\n");
  }

  return [
    "✨ <b>Чароковальня відкрита</b>",
    "",
    "Маг приймає <b>Польову аптечку</b>, кладе її біля банки з Іскрокаменем і урочисто пояснює: манатки можна підсилювати тільки по одній одиниці зі стосу, а стара кнопка не має права вдруге брати плату.",
    "",
    "Іскрокамінь тримає іскру, донорські манатки можуть допомогти, а невдачі памʼятає Жалісливий молот.",
    "",
    presentQuestRewardBlock({
      xp: result.rewardXp,
      gold: 0,
      itemGrants: enrichRewardItemGrants(result.itemGrants)
    })
  ].join("\n");
}

export function presentItemDismantleList(result: ItemDismantleListResult): string {
  if (result.state === "no-character") return "Спершу створіть пригодника через /start. Розбирати поки нікого й нічого.";
  if (result.state === "wrong-place" || result.state === "level-locked" || result.state === "unlock-required") {
    return presentItemUpgradeGate(result);
  }
  return [
    `${ITEM_DISMANTLE_ICON} <b>Розбір манатки</b>`,
    "",
    result.items.length > 0
      ? "Оберіть одну доступну манатку. Спершу буде точний перегляд; він нічого не резервує і не витрачає."
      : "Немає безпечної манатки для розбору: споряджені, зарезервовані та захищені речі маг не чіпає.",
    "",
    "Розбір незворотний і перетворює рівно одну одиницю на Іскрокамінь."
  ].join("\n");
}

export function presentItemDismantlePreview(result: ItemDismantlePreviewResult): string {
  if (result.state === "no-character") return "Спершу створіть пригодника через /start.";
  if (result.state === "wrong-place" || result.state === "level-locked" || result.state === "unlock-required") {
    return presentItemUpgradeGate(result);
  }
  if (result.state === "not-owned") return "Цієї манатки вже немає в торбі. Розбір не почато.";
  if (result.state === "equipped") return "Манатка зараз споряджена. Зніміть її, тоді поверніться до розбору.";
  if (result.state === "reserved") return "Манатка вже зарезервована для іншої справи. Завершіть або скасуйте її, тоді спробуйте знову.";
  if (result.state === "protected-last-copy") return "Останню захищену копію маг не розбирає. Залиште її в архіві пригодника.";
  if (result.state === "not-eligible") return "Цю манатку не можна безпечно розібрати: вона не є придатним спорядженням або має захищену історію.";
  if (result.state !== "ready") return "Перегляд розбору застарів. Відкрийте список ще раз.";
  const balanceAfter = result.available - result.paymentAmount;
  return [
    `${ITEM_DISMANTLE_ICON} <b>Підтвердження розбору</b>`,
    "",
    `Манатка: <b>${escapeHtml(result.item.name)}</b>`,
    `Рівень: <b>+${result.item.enhancementLevel}</b> · у стосі: <b>${result.item.quantity}</b>`,
    `Вихід: <b>${result.item.yield}</b> Іскрокаменю`,
    `Оплата: <b>${result.paymentAmount}</b> ${result.payment === "mana" ? "мани" : "золота"}`,
    `Після оплати: <b>${Math.max(0, balanceAfter)}</b>`,
    "",
    "Буде знищено рівно одну одиницю. Повтор цієї кнопки поверне той самий чек без другого списання."
  ].join("\n");
}

export function presentItemDismantleResult(
  result: ItemDismantleConfirmResult | { state: "unavailable" }
): string {
  if (result.state === "dismantled" || result.state === "replayed") {
    const item = findItemContent(result.itemId);
    return [
      `${ITEM_DISMANTLE_ICON} <b>${result.state === "replayed" ? "Чек розбору" : "Манатку розібрано"}</b>`,
      "",
      `Манатка: <b>${escapeHtml(item?.name ?? result.itemId)}</b>`,
      `Витрачено: <b>${result.paymentAmount}</b> ${result.payment === "mana" ? "мани" : "золота"}`,
      `Отримано: <b>${result.yield}</b> Іскрокаменю`,
      `Іскрокаменю після операції: <b>${result.iskrokaminAfter}</b>`
    ].join("\n");
  }
  if (result.state === "not-enough-gold") return `Не вистачає золота: треба <b>${result.required}</b>, є <b>${result.available}</b>. Манатку не розібрано.`;
  if (result.state === "not-enough-mana") return `Не вистачає мани: треба <b>${result.required}</b>, є <b>${result.available}</b>. Манатку не розібрано.`;
  if (result.state === "equipped") return "Манатка споряджена. Зніміть її й відкрийте свіжий перегляд.";
  if (result.state === "reserved") return "Манатка зарезервована для іншої справи. Розбір нічого не змінив.";
  if (result.state === "protected-last-copy") return "Остання захищена копія лишилася цілою.";
  if (result.state === "wrong-place") return "Розбір працює лише в Чароковальні на задвірку корчми.";
  if (result.state === "level-locked" || result.state === "unlock-required") return "Чароковальня ще недоступна для цього пригодника.";
  if (result.state === "not-owned") return "Манатки вже немає в торбі. Нічого не списано.";
  if (result.state === "not-eligible") return "Цю манатку не можна розібрати. Нічого не списано.";
  if (result.state === "no-character") return "Пригодника не знайдено.";
  if (result.state === "unavailable") return "Розбір тимчасово недоступний. Нічого не списано.";
  return "Стара кнопка: життя пригодника, стос, правила або ціна вже змінилися. Нічого не списано.";
}

export function presentItemUpgradeEffectDelta(before: { effect?: Parameters<typeof presentItemEffect>[0] }, after: { effect?: Parameters<typeof presentItemEffect>[0] }): string | null {
  const beforeEffect = presentItemEffect(before.effect) ?? "без видимого ефекту";
  const afterEffect = presentItemEffect(after.effect) ?? "без видимого ефекту";

  return beforeEffect === afterEffect ? null : `Ефект: <i>${beforeEffect}</i> → <b>${afterEffect}</b>`;
}

function presentItemUpgradeResultEffectLine(effect: Parameters<typeof presentItemEffect>[0] | undefined): string | null {
  const presented = presentItemEffect(effect);

  return presented ? `Новий ефект: <b>${escapeHtml(presented)}</b>` : null;
}

function presentCosts(costs: { gold: number; iskrokamin: number; mana: number }): string {
  return [
    costs.gold > 0 ? `${costs.gold} золота` : null,
    `${costs.iskrokamin} Іскрокамінь`,
    costs.mana > 0 ? `${costs.mana} мани` : null
  ].filter((part): part is string => Boolean(part)).join(" · ");
}

function presentItemUpgradeTraitLines(
  item: Extract<ItemUpgradePreviewResult, { state: "ready" }>["item"]
): string[] {
  if (item.isSetPiece && item.rarity === "legendary") {
    return [
      `Тип: <b>сетова легендарна манатка</b>${item.setName ? ` — ${escapeHtml(item.setName)}` : ""}. Маг стабілізує обережніше: у цієї речі більше думок.`
    ];
  }

  if (item.isSetPiece) {
    return [
      `Тип: <b>Сетова манатка</b>${item.setName ? ` — ${escapeHtml(item.setName)}` : ""}. Маг стабілізує обережніше: у комплектних речей більше думок.`
    ];
  }

  if (item.rarity === "legendary") {
    return [
      "Рідкість: <b>легендарна</b>. Маг стабілізує обережніше: у такої манатки більше думок."
    ];
  }

  return [];
}

function presentItemUpgradeGate(result: Extract<
  ItemUpgradeListResult | ItemUpgradePreviewResult | ItemUpgradeAttemptServiceResult | ItemUpgradeUnlockServiceResult |
    ItemDismantleListResult | ItemDismantlePreviewResult,
  { state: "wrong-place" | "level-locked" | "unlock-required" }
>): string {
  if (result.state === "wrong-place") {
    return [
      "✨ <b>Чароковальня</b>",
      "",
      "Маг працює не в торбі, а в <b>задвірку корчми</b>. Тут кнопка тільки чемно показує дорогу й нічого не витрачає."
    ].join("\n");
  }

  if (result.state === "level-locked") {
    const remortLine = result.character.remortCount && result.character.remortCount > 0
      ? `Після реморту маг пускає з <b>${result.requiredLevel}</b> рівня.`
      : `Маг пускає до іскор з <b>${result.requiredLevel}</b> рівня.`;

    return [
      "✨ <b>Чароковальня ще зачинена</b>",
      "",
      remortLine,
      "Поки що задвірок чує тільки підозрілий дзвін і робить вигляд, що це вітер."
    ].join("\n");
  }

  return [
    "✨ <b>Чароковальня</b>",
    "",
    "Ельф-маг просить <b>Польову аптечку</b> для першого запуску: іскри люблять безпеку, навіть якщо соромляться цього слова.",
    "",
    result.fieldKitQuantity > 0
      ? "Аптечка у вас є. Можна віддати її магу й відкрити роботу з Іскрокаменем."
      : "Аптечки в торбі немає. Єгер, як завжди, виглядає так, ніби знає, де її шукати."
  ].join("\n");
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
