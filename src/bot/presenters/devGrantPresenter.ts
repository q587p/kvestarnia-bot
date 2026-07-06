import type { DevGrantItemsResult, DevGrantResult } from "../../services/devGrantService";
import { presentAchievementUnlockNotification } from "./achievementPresenter";

export function presentDevGrantDisabled(): string {
  return "Ця команда доступна лише в локальній майстерні.";
}

export function presentDevGrantNoCharacter(): string {
  return "Немає персонажа, якому підсипати цифри. Спершу /start.";
}

export function presentDevGrantInvalidAmount(command: string): string {
  if (command === "dev_add_item") {
    return "Формат: /dev_add_item [додатне ціле число] itemId=<item.id>. Наприклад: /dev_add_item itemId=item.ability.last-page-rapier.";
  }

  if (command === "dev_add_random_item") {
    return "Формат: /dev_add_random_item [додатне ціле число] [slot=weapon|offhand|head|chest|legs|accessory|tool] [tag=twohand|offhand]. Без числа корчмар підставить 1.";
  }

  if (command === "dev_set_item_plus") {
    return "Формат: /dev_set_item_plus itemId=<item.id> level=0..5.";
  }

  if (command === "dev_set_upgrade_pity") {
    return "Формат: /dev_set_upgrade_pity itemId=<item.id> target=1..5 failures=0..5.";
  }

  if (command === "dev_heal") {
    return "Формат: /dev_heal [додатне ціле число HP]. Без числа корчмар лікує до максимуму.";
  }

  if (command === "dev_restore_mana") {
    return "Формат: /dev_restore_mana [додатне ціле число мани]. Без числа корчмар відновлює ману до максимуму.";
  }

  return `Формат: /${command} [додатне ціле число]. Без числа корчмар підставить 1.`;
}

export function presentDevGrantResult(result: DevGrantResult | DevGrantItemsResult): string {
  if (result.state === "disabled") {
    return presentDevGrantDisabled();
  }

  if (result.state === "no-character") {
    return presentDevGrantNoCharacter();
  }

  if (result.state === "unknown-item") {
    return [
      "🧪 Dev: корчмар не знайшов такої манатки в каталозі.",
      "",
      `itemId: ${result.itemId}`
    ].join("\n");
  }

  if (result.state === "no-matching-items") {
    const filterLines = [
      result.filter.equipmentSlot ? `slot=${result.filter.equipmentSlot}` : null,
      result.filter.tag ? `tag=${result.filter.tag}` : null
    ].filter((line): line is string => Boolean(line));

    return [
      "🧪 Dev: корчмар порився в торбі, але під такий фільтр нічого не знайшов.",
      "",
      filterLines.length > 0 ? `Фільтр: ${filterLines.join(" ")}` : "Фільтр: без уточнень"
    ].join("\n");
  }

  if (result.kind === "level") {
    return appendAchievementUnlocks([
      `🧪 Dev: додано ${result.amount} ${formatUnit(result.amount, ["рівень", "рівні", "рівнів"])}.`,
      "",
      `Рівень: ${result.levelChange?.oldLevel ?? result.character.level} → ${result.character.level}`
    ], result);
  }

  if (result.kind === "xp") {
    return appendAchievementUnlocks([
      `🧪 Dev: додано ${result.amount} XP.`,
      "",
      `XP: ${result.character.xp}`,
      `Рівень: ${result.character.level}`
    ], result);
  }

  if (result.kind === "gold") {
    return [
      `🧪 Dev: додано ${result.amount} ${formatUnit(result.amount, ["золото", "золота", "золота"])}.`,
      "",
      `Золото: ${result.character.gold}`
    ].join("\n");
  }

  if (result.kind === "heal") {
    return [
      "🧪 Dev: персонажа підлатано.",
      "",
      `HP: ${result.character.hpCurrent}/${result.character.hpMax}`,
      ...(result.combat
        ? [`Бій: HP ${result.combat.hpCurrent}/${result.combat.hpMax}`]
        : [])
    ].join("\n");
  }

  if (result.kind === "mana") {
    return [
      "🧪 Dev: ману повернуто в робочий стан.",
      "",
      `Мана: ${result.character.manaCurrent}/${result.character.manaMax}`
    ].join("\n");
  }

  if (result.kind === "item-upgrade-level") {
    return [
      "🧪 Dev: рівень підсилення виставлено.",
      "",
      `itemId: ${result.itemId}`,
      `+${result.level}`
    ].join("\n");
  }

  if (result.kind === "item-upgrade-pity") {
    return [
      "🧪 Dev: жаль-лічильник Чароковальні виставлено.",
      "",
      `itemId: ${result.itemId}`,
      `Ціль: +${result.targetLevel}`,
      `Провали: ${result.failureCount}`
    ].join("\n");
  }

  if (result.kind === "item-upgrade-orders") {
    return result.status === "ready"
      ? `🧪 Dev: замовлення Чароковальні готові. Змінено: ${result.changed}.`
      : `🧪 Dev: замовлення Чароковальні скасовано. Змінено: ${result.changed}.`;
  }

  if (result.kind === "yeger-bandage-cooldown") {
    return result.cleared
      ? "🧪 Dev: таймер безкоштовного бинта Єгеря скинуто."
      : "🧪 Dev: безкоштовний бинт Єгеря і так доступний.";
  }

  if (result.kind === "yeger-tracking-cooldown") {
    return result.cleared
      ? "🧪 Dev: очікування Єгерського сліду завершено."
      : "🧪 Dev: Єгерський слід уже готовий або ще не взятий.";
  }

  if (result.kind === "priest-blessing-cooldown") {
    return result.cleared
      ? "🧪 Dev: жрецьке благословення знову готове до локальної перевірки."
      : "🧪 Dev: жрецьке благословення і так без активного cooldown.";
  }

  if (result.kind === "quiet-pocket-cooldown") {
    return result.cleared
      ? "🧪 Dev: «Тиха кишеня» знову готова до локальної перевірки."
      : "🧪 Dev: «Тиха кишеня» і так без активного cooldown.";
  }

  if (result.kind === "rogue-reset") {
    if (result.clearedCooldown || result.deletedAttempts > 0) {
      return [
        "🧪 Dev: злодійський QA reset виконано.",
        "",
        result.clearedCooldown
          ? "Пальці відсапались: cooldown скинуто."
          : "Пальці й так були готові: активного cooldown не було.",
        result.deletedAttempts > 0
          ? `Сьогоднішні кишені забуто: ${result.deletedAttempts} ${formatUnit(result.deletedAttempts, ["запис", "записи", "записів"])}.`
          : "Сьогоднішній список кишень уже був чистий."
      ].join("\n");
    }

    return "🧪 Dev: злодій і так готовий до локальної перевірки.";
  }

  if (result.kind === "yeger-bandage-day") {
    return result.deleted > 0
      ? `🧪 Dev: день купівлі бинтів Єгеря скинуто. Прибрано ${result.deleted} ${formatUnit(result.deleted, ["запис", "записи", "записів"])}.`
      : "🧪 Dev: день купівлі бинтів Єгеря і так чистий.";
  }

  if (result.kind === "yeger-quest-progress") {
    if (result.state === "blocked") {
      return "🧪 Dev: друга Єгерська дощечка ще не може закритись. Спершу здай «Неспокійні справи».";
    }

    const questName = result.stage === "second" ? "Неспокійні справи 2.0" : "Неспокійні справи";
    const addedLine = result.addedWins > 0
      ? `Додано перемог: ${result.addedWins}.`
      : "Бракуючих перемог уже не було.";

    return [
      `🧪 Dev: «${questName}» доведено до ${result.wins}/${result.target}.`,
      "",
      addedLine,
      ...(result.started ? ["Квест також позначено як розпочатий."] : []),
      "Тепер його можна здати звичайною кнопкою Єгеря."
    ].join("\n");
  }

  if (result.kind === "items") {
    const itemLines = result.itemGrants.map((grant) =>
      grant.quantity === 1 ? `• ${grant.name}` : `• ${grant.name} ×${grant.quantity}`
    );

    return appendAchievementUnlocks([
      `🧪 Dev: додано ${result.amount} ${formatUnit(result.amount, ["манатку", "манатки", "манаток"])}.`,
      "",
      "У торбі зʼявилось:",
      ...itemLines
    ], result);
  }

  return presentDevGrantNoCharacter();
}

function appendAchievementUnlocks(
  lines: string[],
  result: DevGrantResult | DevGrantItemsResult
): string {
  const notification = "achievementUnlocks" in result
    ? presentAchievementUnlockNotification(result.achievementUnlocks ?? [])
    : null;

  return notification ? [...lines, "", notification].join("\n") : lines.join("\n");
}

function formatUnit(amount: number, forms: [string, string, string]): string {
  const absolute = Math.abs(amount);
  const lastTwo = absolute % 100;
  const last = absolute % 10;

  if (lastTwo >= 11 && lastTwo <= 14) {
    return forms[2];
  }

  if (last === 1) {
    return forms[0];
  }

  if (last >= 2 && last <= 4) {
    return forms[1];
  }

  return forms[2];
}
