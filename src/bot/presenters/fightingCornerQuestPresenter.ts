import type {
  FightingCornerQuestAcceptResult,
  FightingCornerQuestClaimResult,
  FightingCornerQuestLookupResult,
  FightingCornerQuestProgress,
  FightingCornerQuestProgressUpdate,
  FightingCornerQuestReward
} from "../../services/fightingCornerQuestService";
import { PINK_SOAP_OF_FIRST_RULE_ITEM_ID } from "../../services/itemGrant";
import { presentQuestRewardBlock } from "./rewardPresenter";

export function presentFightingCornerQuestLookup(result: FightingCornerQuestLookupResult): string {
  if (result.state === "disabled") {
    return "📜 Цей аркуш ще лежить у корчмаря під ліктем.";
  }
  if (result.state === "no-character") {
    return "Спершу створіть пригодника через /start. Правила без підписанта нервуються.";
  }
  if (result.state === "level-locked") {
    return `📜 «Перше правило Бійцівського кутка» відкриється з ${result.requiredLevel} рівня.`;
  }
  if (result.state === "completed") {
    return presentCompleted(result.reward);
  }

  return presentQuestCard(result.progress, result.state === "available");
}

export function presentFightingCornerQuestAccept(result: FightingCornerQuestAcceptResult): string {
  if (result.state === "disabled") {
    return presentFightingCornerQuestLookup(result);
  }
  if (result.state === "no-character") {
    return presentFightingCornerQuestLookup(result);
  }
  if (result.state === "level-locked") {
    return presentFightingCornerQuestLookup(result);
  }
  if (result.state === "wrong-location") {
    return [
      "📜 <b>Аркуш лишився на столі</b>",
      "",
      "Цю справу приймають тільки біля фізичного столу зі справами. Стара кнопка не рахується як особиста присутність."
    ].join("\n");
  }
  if (result.state === "already-completed") {
    return presentCompleted(result.reward);
  }

  if ("progress" in result) {
    return presentQuestCard(result.progress, false);
  }
  return "📜 Аркуш не вдалося прочитати. Спробуйте ще раз за столом зі справами.";
}

export function presentFightingCornerQuestClaim(result: FightingCornerQuestClaimResult): string {
  if (result.state === "disabled") {
    return presentFightingCornerQuestLookup(result);
  }
  if (result.state === "no-character") {
    return presentFightingCornerQuestLookup(result);
  }
  if (result.state === "level-locked") {
    return presentFightingCornerQuestLookup(result);
  }
  if (result.state === "wrong-location") {
    return [
      "🎁 <b>Нагорода не телепортується</b>",
      "",
      "Поверніться до фізичного столу зі справами. Корчмар не передає Іскрокамінь через стіни після того випадку з фіранкою."
    ].join("\n");
  }
  if (result.state === "not-started") {
    return "📜 Спершу прийміть «Перше правило Бійцівського кутка» за столом зі справами.";
  }
  if (result.state === "missing-progress") {
    return presentQuestCard(result.progress, false);
  }

  if ("reward" in result) {
    return presentCompleted(result.reward, result.state === "already-completed");
  }
  return "🎁 Запис про нагороду не вдалося прочитати. Спробуйте ще раз за столом зі справами.";
}

export function presentFightingCornerQuestProgressNotification(
  update: FightingCornerQuestProgressUpdate
): string {
  const objective = {
    training: "тренування із Сумлінним Допельґанґером",
    "quick-duel": "миттєву дуель",
    "turn-based-duel": "покрокову дуель"
  }[update.objective];
  const lines = [
    "📜 <b>Перше правило Бійцівського кутка</b>",
    `Зараховано ${objective}: ${update.progress.completedObjectives}/3.`
  ];

  if (update.progress.readyToClaim) {
    lines.push(
      "",
      "Усі три правила перевірено. Поверніться до столу зі справами: нагороди в кутку не тримають, бо їх там постійно хтось випадково бʼє."
    );
  }

  return lines.join("\n");
}

function presentQuestCard(progress: FightingCornerQuestProgress, available: boolean): string {
  return [
    "📜 <b>Перше правило Бійцівського кутка</b>",
    "",
    "На аркуші написано: «Не говорити про Бійцівський куток». Корчмар закреслив «не»: «Говорити. Інакше звідки візьметься другий боєць?»",
    "",
    "Друге правило: перешліть посилання-запрошення іншому гравцеві або відкрийте «👀 Хто поруч» → «Кинути виклик присутнім».",
    "",
    "Третє правило: обидва бійці заходять добровільно, а корчмар — із журналом. Сорочки, чоботи й манатки не знімають: гігієна Корчми перемогла драматизм.",
    "",
    objectiveLine(progress.trainingCompleted, "Потренуватися із Сумлінним Допельґанґером"),
    objectiveLine(progress.quickDuelCompleted, "Завершити миттєву дуель"),
    objectiveLine(progress.turnBasedDuelCompleted, "Завершити покрокову дуель"),
    "",
    available
      ? "Прийміть справу тут, за столом зі справами. Старі бійки заднім числом не переписують."
      : progress.readyToClaim
        ? "Усі три правила перевірено. Нагорода чекає тільки за фізичним столом зі справами."
        : "Перемога не обовʼязкова. Завершіть три дії в будь-якому порядку."
  ].join("\n");
}

function objectiveLine(done: boolean, text: string): string {
  return `${done ? "✅" : "▫️"} ${text}`;
}

function presentCompleted(reward: FightingCornerQuestReward, replay = false): string {
  const itemGrants = canonicalizePresentedItemGrants(reward.itemGrants);
  const soapLine = itemGrants.some((grant) => grant.itemId === PINK_SOAP_OF_FIRST_RULE_ITEM_ID)
    ? "🧼 Рожеве мило першого правила відтепер числиться інструментом. Бійцівський куток уперше занепокоївся."
    : null;
  return [
    "🎁 <b>Перше правило перевірено</b>",
    "",
    replay
      ? "Корчмар показує вже закритий запис. Нагорода та сама; ще раз видати її цей папірець не дозволяє."
      : "Корчмар ставить три галочки й відсуває нагороду подалі від ліктів Бійцівського кутка.",
    "",
    ...(soapLine ? [soapLine, ""] : []),
    presentQuestRewardBlock({ ...reward, itemGrants })
  ].join("\n");
}

function canonicalizePresentedItemGrants(
  grants: FightingCornerQuestReward["itemGrants"]
): FightingCornerQuestReward["itemGrants"] {
  const byItemId = new Map<string, FightingCornerQuestReward["itemGrants"][number]>();

  for (const grant of grants) {
    const existing = byItemId.get(grant.itemId);
    byItemId.set(grant.itemId, existing
      ? { ...existing, quantity: existing.quantity + grant.quantity }
      : grant);
  }

  return [...byItemId.values()];
}
