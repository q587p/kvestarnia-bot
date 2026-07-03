import type {
  ClassNoncombatOpenResult,
  PriestBlessResult,
  PriestHealResult,
  RoguePickpocketResult
} from "../../services/classNoncombatService";
import type { PriestBlessingRecord } from "../../db/repositories/classNoncombatRepository";
import { presentCharacterDisplayName } from "./characterDisplay";
import { escapeHtml } from "./telegramHtml";

export function presentClassNoncombatOpen(result: ClassNoncombatOpenResult): string {
  if (result.state === "no-character") {
    return "Спершу створіть пригодника через /start. Кишені й милосердя не працюють без біографії.";
  }

  if (result.state === "not-eligible") {
    return [
      result.character.classId === "class.priest"
        ? "✨ <b>Жрецька поміч ще вчиться не плутати кадило з чайником</b>"
        : "🗡️ <b>Тиха кишеня ще не отримала службовий дозвіл</b>",
      "",
      `Класова дія відкривається з рівня ${result.requiredLevel}.`
    ].join("\n");
  }

  const lines = result.mode === "priest"
    ? [
        "✨ <b>Жрецька поміч</b>",
        "",
        `📍 ${escapeHtml(result.locationName)}`,
        `Мана: <b>${result.character.manaCurrent}/${result.character.manaMax}</b>. Лікування бере ману, не бинти.`,
        presentCooldownLine("🩹 Лікування", result.priestHealCooldownAvailableAt),
        presentCooldownLine("✨ Благословення", result.priestBlessCooldownAvailableAt),
        "",
        "Оберіть себе або когось активного поруч:"
      ]
    : [
        "🗡️ <b>Тиха кишеня</b>",
        "",
        `📍 ${escapeHtml(result.locationName)}`,
        "Ризик малий не буває: можна нічого не знайти, засвітитись або дуже невдало зустріти чужий лікоть.",
        presentCooldownLine("🕯️ Спроба", result.roguePickpocketCooldownAvailableAt),
        "",
        "Оберіть активну ціль поруч:"
      ];

  if (result.targets.length === 0 && result.mode === "rogue") {
    lines.push("", "Активних цілей поруч немає. Кишені теж мають графік роботи.");
  }
  if (result.targets.length === 0 && result.mode === "priest") {
    lines.push("", "Поруч нікого активного немає, але себе можна підтримати без черги.");
  }

  return lines.filter(Boolean).join("\n");
}

export function presentPriestHealResult(result: PriestHealResult): string {
  if (result.state === "blocked") {
    return presentBlocked("🩹", "Лікування не відбулося", result.reason, result.availableAt, result.blessing);
  }

  const targetSelf = result.action.actorTelegramUserId === result.action.targetTelegramUserId;
  return [
    "🩹 <b>Лікування спрацювало</b>",
    "",
    targetSelf
      ? "Жрець приклав ману до себе. Мана трохи обурилась, але виконала обов’язок."
      : `${presentCharacterDisplayName(result.actor)} полікував ${presentCharacterDisplayName(result.target, { boldName: false })}.`,
    `HP: <b>+${result.action.healAmount}</b> · тепер <b>${result.target.hpCurrent}/${result.target.hpMax}</b>.`,
    `Мана витрачена: <b>${result.action.manaCost}</b>.`,
    `Відпочинок техніки: ${formatRemaining(result.action.cooldownAvailableAt)}.`
  ].join("\n");
}

export function presentPriestBlessResult(result: PriestBlessResult): string {
  if (result.state === "blocked") {
    return presentBlocked("✨", "Благословення не лягло", result.reason, result.availableAt, result.blessing);
  }

  const targetSelf = result.action.actorTelegramUserId === result.action.targetTelegramUserId;
  return [
    "✨ <b>Благословення тримається</b>",
    "",
    targetSelf
      ? "Жрець благословив себе. Корчма це записала як самодогляд із кадилом."
      : `${presentCharacterDisplayName(result.actor)} благословив ${presentCharacterDisplayName(result.target, { boldName: false })}.`,
    `Стан діє ще: ${formatRemaining(result.blessing.expiresAt)}.`,
    "Бонус поки видимий і не складається в стос.",
    `Мана витрачена: <b>${result.action.manaCost}</b>.`
  ].join("\n");
}

export function presentRoguePickpocketResult(result: RoguePickpocketResult): string {
  if (result.state === "blocked") {
    return presentBlocked("🗡️", "Кишеня не піддалася", result.reason, result.availableAt);
  }

  const replayLine = result.created ? "" : "\nЦей запис уже зафіксовано: повтор не перекидає долю.";
  const outcome = result.attempt.outcome;
  const body = outcome === "clean-success"
    ? `Чисто. У протоколі з’явилось <b>${result.attempt.stolenGold}</b> золота, і навіть протяг соромиться.`
    : outcome === "noticed-success"
      ? `Вийшло, але не зовсім тихо: <b>${result.attempt.stolenGold}</b> золота змінило кишеню.`
      : outcome === "empty"
        ? "Нічого. Кишеня або порожня, або надто добре вихована."
        : outcome === "noticed-failure"
          ? "Не вийшло. Ціль щось відчула, а злодій отримав досвід у жанрі «ой»."
          : "Дуже невдало. Чужий лікоть пояснив техніку переконливіше за підручник.";

  return [
    "🗡️ <b>Тиха кишеня</b>",
    "",
    `Ціль: ${presentCharacterDisplayName(result.target, { boldName: false })}`,
    body,
    outcome === "caught-badly" ? "HP злодія: <b>0</b>." : "",
    `Наступна спроба: ${formatRemaining(result.attempt.cooldownAvailableAt)}.${replayLine}`
  ].filter(Boolean).join("\n");
}

export function presentPriestHealTargetNotification(result: Extract<PriestHealResult, { state: "completed" }>): string {
  return [
    "🩹 <b>Вас полікували</b>",
    "",
    `${presentCharacterDisplayName(result.actor)} полікував вас без бинтів, зате з маною.`,
    `HP: <b>+${result.action.healAmount}</b> · тепер <b>${result.target.hpCurrent}/${result.target.hpMax}</b>.`
  ].join("\n");
}

export function presentPriestBlessTargetNotification(result: Extract<PriestBlessResult, { state: "completed" }>): string {
  return [
    "✨ <b>Вас благословили</b>",
    "",
    `${presentCharacterDisplayName(result.actor)} благословив вас. Корчма зробила вигляд, що це планувала.`,
    `Стан діє ще: ${formatRemaining(result.blessing.expiresAt)}.`
  ].join("\n");
}

export function presentRoguePickpocketTargetNotification(result: Extract<RoguePickpocketResult, { state: "completed" }>): string | null {
  if (!result.created) {
    return null;
  }

  const outcome = result.attempt.outcome;
  if (outcome === "clean-success" && result.attempt.stolenGold > 0) {
    return [
      "🪙 <b>Кишеня стала легшою</b>",
      "",
      `Зникло <b>${result.attempt.stolenGold}</b> золота. Корчма підозрює протяг, але протяг мовчить.`
    ].join("\n");
  }

  if (outcome === "noticed-success" && result.attempt.stolenGold > 0) {
    return [
      "🪙 <b>Кишеня подала скаргу</b>",
      "",
      `${presentCharacterDisplayName(result.actor)} був надто близько, а <b>${result.attempt.stolenGold}</b> золота вже ні.`
    ].join("\n");
  }

  if (outcome === "noticed-failure") {
    return [
      "🗡️ <b>Біля кишені хтось крутився</b>",
      "",
      `${presentCharacterDisplayName(result.actor)} зробив невдалу спробу виглядати частиною меблів. Золото на місці.`
    ].join("\n");
  }

  if (outcome === "caught-badly") {
    return [
      "🗡️ <b>Кишеня перемогла</b>",
      "",
      `${presentCharacterDisplayName(result.actor)} поліз не туди й упав до <b>0 HP</b>. Золото на місці.`
    ].join("\n");
  }

  return null;
}

function presentBlocked(
  icon: string,
  title: string,
  reason: string,
  availableAt?: Date,
  blessing?: PriestBlessingRecord
): string {
  const detail = (() => {
    switch (reason) {
      case "no-character":
        return "Спершу створіть пригодника через /start.";
      case "target-not-found":
      case "target-inactive":
        return "Ціль уже не стоїть активною поруч.";
      case "self-target":
        return "Себе обчистити не можна. Бухгалтерія й так плаче.";
      case "not-priest":
        return "Це техніка жерця.";
      case "not-rogue":
        return "Це техніка злодія.";
      case "level-locked":
        return "Класова дія відкривається з 3 рівня.";
      case "target-level-locked":
        return "Новачків ця техніка не чіпає.";
      case "actor-remort-mismatch":
      case "target-remort-mismatch":
      case "stale":
        return "Кнопка застаріла. Оновіть «Хто поруч» і спробуйте з нового рядка.";
      case "wrong-location":
        return "Корчемна географія змістилася: ви вже не в одній локації.";
      case "actor-blocked":
        return "Ваш пригодник зараз зайнятий іншим активним протоколом.";
      case "target-blocked":
        return "Ціль зараз зайнята іншим активним протоколом.";
      case "actor-defeated":
        return "При 0 HP кишені бачать вас першими.";
      case "full-hp":
        return "HP уже повне. Мана лишається на місці.";
      case "insufficient-mana":
        return "Мани не вистачає. Жрець суворо дивиться на порожню шкалу.";
      case "already-blessed":
        return blessing
          ? `На цілі вже тримається благословення ще ${formatRemaining(blessing.expiresAt)}.`
          : "На цілі вже тримається таке благословення.";
      case "cooldown":
        return availableAt
          ? `Техніка відсапується ще ${formatRemaining(availableAt)}.`
          : "Техніка ще відсапується.";
      case "pair-daily-used":
        return "Ця пара вже мала сьогоднішню кишенькову історію.";
      default:
        return "Протокол відмовився робити вигляд, що це працює.";
    }
  })();

  return [`${icon} <b>${title}</b>`, "", detail].join("\n");
}

function presentCooldownLine(label: string, availableAt: Date | null): string {
  return availableAt ? `${label}: ще ${formatRemaining(availableAt)}.` : `${label}: готово.`;
}

function formatRemaining(availableAt: Date, now = new Date()): string {
  const minutes = Math.max(1, Math.ceil((availableAt.getTime() - now.getTime()) / 60_000));
  return `${minutes} ${pluralize(minutes, "хвилину", "хвилини", "хвилин")}`;
}

function pluralize(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) {
    return one;
  }
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return few;
  }
  return many;
}
