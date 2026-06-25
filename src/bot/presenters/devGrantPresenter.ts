import type { DevGrantItemsResult, DevGrantResult } from "../../services/devGrantService";

export function presentDevGrantDisabled(): string {
  return "Ця команда доступна лише в локальній майстерні.";
}

export function presentDevGrantNoCharacter(): string {
  return "Немає персонажа, якому підсипати цифри. Спершу /start.";
}

export function presentDevGrantInvalidAmount(command: string): string {
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

  if (result.kind === "level") {
    return [
      `🧪 Dev: додано ${result.amount} ${formatUnit(result.amount, ["рівень", "рівні", "рівнів"])}.`,
      "",
      `Рівень: ${result.levelChange?.oldLevel ?? result.character.level} → ${result.character.level}`
    ].join("\n");
  }

  if (result.kind === "xp") {
    return [
      `🧪 Dev: додано ${result.amount} XP.`,
      "",
      `XP: ${result.character.xp}`,
      `Рівень: ${result.character.level}`
    ].join("\n");
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
      `HP: ${result.character.hpCurrent}/${result.character.hpMax}`
    ].join("\n");
  }

  if (result.kind === "mana") {
    return [
      "🧪 Dev: ману повернуто в робочий стан.",
      "",
      `Мана: ${result.character.manaCurrent}/${result.character.manaMax}`
    ].join("\n");
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

  if (result.kind === "items") {
    const itemLines = result.itemGrants.map((grant) =>
      grant.quantity === 1 ? `• ${grant.name}` : `• ${grant.name} ×${grant.quantity}`
    );

    return [
      `🧪 Dev: додано ${result.amount} ${formatUnit(result.amount, ["манатку", "манатки", "манаток"])}.`,
      "",
      "У торбі зʼявилось:",
      ...itemLines
    ].join("\n");
  }

  return presentDevGrantNoCharacter();
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
