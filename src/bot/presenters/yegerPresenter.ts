import type {
  YegerQuestLookupResult,
  YegerQuestStartResult,
  YegerQuestTurnInResult
} from "../../services/yegerQuestService";
import { YEGER_UNQUIET_TRIAL_REWARD } from "../../services/yegerQuestService";
import { presentRewardAmount, presentRewardItemGrant } from "./rewardPresenter";
import { escapeHtml, presentCharacterHeader } from "./telegramHtml";

export function presentYegerQuest(
  result: Exclude<YegerQuestLookupResult, { state: "no-character" }>
): string {
  if (result.state === "level-locked") {
    return [
      "🏹 Єгерська дошка",
      presentCharacterHeader(result.character),
      "",
      "Єгер дивиться на ваші чоботи й каже, що сліди ще плутають вас із новачком.",
      "",
      `Поверніться з ${result.requiredLevel} рівня.`
    ].join("\n");
  }

  if (result.state === "offered") {
    return [
      "🏹 Єгерська дошка",
      presentCharacterHeader(result.character),
      "",
      "Єгер сидить у кутку так, ніби куток сам попросив охорону.",
      "",
      "Доступна справа:",
      "<b>Неспокійні справи</b>",
      "",
      "Переможіть 5 неупокоєних проблем, які не зрозуміли, що робочий день скінчився.",
      "",
      "Нагорода: XP, золото на якісне пиво, єгерська риска в журналі."
    ].join("\n");
  }

  if (result.state === "completed") {
    return presentYegerCompleted({
      character: result.character,
      reward: result.reward,
      replay: true
    });
  }

  return [
    "🏹 Неспокійні справи",
    presentCharacterHeader(result.character),
    "",
    presentProgressLine(result.progress),
    "",
    result.state === "turn-in-ready"
      ? "Дощечка має всі риски. Єгер має вираз обличчя «непогано, але я не скажу»."
      : "Єгер провів пальцем по мапі. Мапа зробила вигляд, що не лоскотно."
  ].join("\n");
}

export function presentYegerNoCharacter(): string {
  return "Спершу створіть пригодника через /start. Єгер не видає сліди порожнім чоботам.";
}

export function presentYegerStart(result: YegerQuestStartResult): string {
  if (result.state === "no-character") {
    return presentYegerNoCharacter();
  }

  if (result.state === "level-locked") {
    return presentYegerQuest(result);
  }

  if (result.state === "completed") {
    return presentYegerCompleted({
      character: result.character,
      reward: result.reward,
      replay: true
    });
  }

  return [
    "🏹 Неспокійні справи",
    presentCharacterHeader(result.character),
    "",
    "Єгер робить першу риску на полях журналу.",
    "",
    "«Це не прогрес. Це дозвіл на прогрес».",
    "",
    presentProgressLine(result.progress)
  ].join("\n");
}

export function presentYegerHelp(): string {
  return [
    "📖 Кого шукати?",
    "",
    "Неупокоєні — це скелети, привиди, прокляті речі й службові проблеми, які не прийняли власний кінець.",
    "",
    "Єгер радить бити не назву, а поведінку: якщо воно гримить кістками, шурхотить правилами або просить ще один підпис після смерті — це, ймовірно, ваше.",
    "",
    "Перемагає тільки справжній persistent-бій. Втеча, поразка й протермінована сутичка в журнал не лягають."
  ].join("\n");
}

export function presentYegerTrackingStart(): string {
  return [
    "👣 Ви виходите на слід.",
    "",
    "Слід спершу вдавав, що він просто подряпина на підлозі, але Єгер не повірив.",
    "",
    "Щось неупокоєне знайшлося.",
    "",
    "Воно теж вас помітило, але тепер уже пізно робити вигляд, що всі прийшли випадково."
  ].join("\n");
}

export function presentYegerTurnIn(result: YegerQuestTurnInResult): string {
  if (result.state === "no-character") {
    return presentYegerNoCharacter();
  }

  if (result.state === "level-locked") {
    return presentYegerQuest(result);
  }

  if (result.state === "not-started") {
    return [
      "🏹 Єгерська дошка",
      presentCharacterHeader(result.character),
      "",
      "Єгер дивиться на порожню дощечку.",
      "",
      "Спершу треба взяти справу. Навіть підозра любить порядок."
    ].join("\n");
  }

  if (result.state === "not-ready") {
    return [
      "🏹 Неспокійні справи",
      presentCharacterHeader(result.character),
      "",
      presentProgressLine(result.progress),
      "",
      "Єгер не забирає напівпорожню дощечку. Каже, що вона ще має апетит до рисок."
    ].join("\n");
  }

  return presentYegerCompleted({
    character: result.character,
    reward: result.reward,
    replay: result.state === "already-completed"
  });
}

function presentYegerCompleted(input: {
  character: { name: string; title: string };
  reward: {
    xp: number;
    gold: number;
    itemGrants: Array<{ name: string; quantity: number }>;
    itemReplayUnavailable?: boolean;
  };
  replay: boolean;
}): string {
  const lines = [
    "🏹 Неспокійні справи закрито",
    `<b>${escapeHtml(input.character.name)}</b> · <i>${escapeHtml(input.character.title)}</i>`,
    "",
    "П’ята неупокоєна проблема нарешті лягла в журнал.",
    "",
    "Журнал тихо зрадів і попросив не робити з цього традицію."
  ];

  if (input.replay) {
    lines.push("", "Єгер уже поставив риску. Другу не ставить, бо це була б емоція.");
  }

  lines.push(
    "",
    "Нагорода:",
    presentRewardAmount({ xp: input.reward.xp, gold: input.reward.gold }),
    ...input.reward.itemGrants.map((grant) =>
      presentRewardItemGrant({ name: escapeHtml(grant.name), quantity: grant.quantity })
    )
  );

  if (input.reward.itemReplayUnavailable) {
    lines.push("", `Сувенір уже шукайте в манатках: ${escapeHtml(YEGER_UNQUIET_TRIAL_REWARD.itemId)}.`);
  }

  return lines.join("\n");
}

function presentProgressLine(progress: { wins: number; target: number }): string {
  return `Прогрес: <b>${progress.wins}/${progress.target}</b>.`;
}
