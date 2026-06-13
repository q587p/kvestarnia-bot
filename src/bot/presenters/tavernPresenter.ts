import type { TavernRaidResult } from "../../services/tavernRaidService";
import type { CharacterSummary } from "../../domain/characters/characterSummary";
import type { PresenceGroup } from "../../services/presenceService";
import { presentRewardLevelGrowth } from "./levelGrowthPresenter";
import { presentRewardAmount, presentRewardItemGrant } from "./rewardPresenter";
import { escapeHtml, npcQuote } from "./telegramHtml";

export function presentKorchmaFront(character: CharacterSummary): string {
  return [
    "🚪 Перед корчмою",
    `${escapeHtml(character.name)} · ${escapeHtml(character.title)}`,
    "",
    "За дверима гуде Корчма Квестарні. Там видають квести, сперечаються з бочками й іноді не питають зайвого.",
    "",
    "Квести видають усередині."
  ].join("\n");
}

export function presentKorchmaHall(
  character: CharacterSummary,
  presence?: PresenceGroup | null
): string {
  return [
    "🍺 Зала корчми",
    `${escapeHtml(character.name)} · ${escapeHtml(character.title)}`,
    "",
    "Корчма Квестарні тримає тепло, шум і кілька справ, які краще не залишати без нагляду.",
    "",
    ...presentTavernPresence(presence),
    "",
    "Куди йдемо?"
  ].join("\n");
}

export function presentTavern(character: CharacterSummary, presence?: PresenceGroup | null): string {
  return [
    "🛢️ Біля Бочки Пінного Міражу",
    `${escapeHtml(character.name)} · ${escapeHtml(character.title)}`,
    "",
    "У кутку героїчно піниться Бочка Пінного Міражу.",
    "",
    npcQuote("Корчмар", "Це не проблема. Це рейд на 1-3 хвилини."),
    "",
    ...presentTavernPresence(presence),
    "",
    "Що робимо?"
  ].join("\n");
}

export function presentTavernAlreadyRaided(
  character: CharacterSummary,
  presence?: PresenceGroup | null
): string {
  return [
    "🛢️ Біля Бочки Пінного Міражу",
    `${escapeHtml(character.name)} · ${escapeHtml(character.title)}`,
    "",
    "Бочка Пінного Міражу сьогодні вже пережила ваш героїзм.",
    "",
    npcQuote("Корчмар", "Вона просила передати: завтра знову буде хоробра. Можливо."),
    "",
    ...presentTavernPresence(presence),
    "",
    "Поки що можна перевірити героя: /hero"
  ].join("\n");
}

export function presentTavernNoCharacter(): string {
  return "Спершу створіть героя через /start. Бочка не воює з анонімами.";
}

export function presentTavernRaidResult(result: Exclude<TavernRaidResult, { state: "no-character" }>): string {
  if (result.state === "already-completed") {
    return [
      "🍺 Бочка вас пам’ятає.",
      "Сьогоднішній рейд уже зараховано. Вона все ще трохи нервує.",
      "",
      presentRewardAmount({
        xp: result.reward.xp,
        gold: result.reward.gold,
        label: "Вже отримано"
      }),
      "Повертайтесь завтра або перевірте героя: /hero"
    ].join("\n");
  }

  const lines = [
    "🍺 Рейд завершено!",
    "Ви штурмували Бочку Пінного Міражу. Бочка відступила стратегічною піною.",
    "",
    presentRewardAmount(result.reward),
    ...presentItemGrantLines(result.reward.itemGrants)
  ];

  lines.push(...presentRewardLevelGrowth(result.levelChange, result.character.classId));

  return lines.join("\n");
}

function presentItemGrantLines(itemGrants: Array<{ name: string; quantity: number }>): string[] {
  if (itemGrants.length === 0) {
    return [];
  }

  return itemGrants.map(
    (grant) =>
      presentRewardItemGrant({
        name: escapeHtml(grant.name),
        quantity: grant.quantity
      })
  );
}

function presentTavernPresence(presence: PresenceGroup | null | undefined): string[] {
  if (!presence || presence.total <= 1) {
    return ["За столами: поки тільки ви й підозрілий стілець."];
  }

  const people = [...presence.active, ...presence.idle].slice(0, 5);
  const hiddenCount = Math.max(0, presence.total - people.length);
  const lines = ["За столами:", ...people.map((person) => `• ${presentPresencePerson(person)}`)];

  if (hiddenCount > 0) {
    lines.push(`• і ще ${hiddenCount}`);
  }

  return lines;
}

function presentPresencePerson(person: PresenceGroup["active"][number]): string {
  const level = person.level === undefined ? "" : ` · рівень ${person.level}`;

  return `${escapeHtml(person.name)}${level}`;
}
