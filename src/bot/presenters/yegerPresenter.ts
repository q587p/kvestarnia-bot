import type { ThirteenSmallProblemsProgress } from "../../services/fightService";
import type {
  YegerQuestLookupResult,
  YegerQuestStartResult,
  YegerQuestTurnInResult
} from "../../services/yegerQuestService";
import type { CharacterSummary } from "../../domain/characters/characterSummary";
import { presentRewardAmount, presentRewardItemGrant } from "./rewardPresenter";
import { escapeHtml, npcQuote, presentCharacterHeader } from "./telegramHtml";

export function presentYegerQuest(
  result: Exclude<YegerQuestLookupResult, { state: "no-character" }>
): string {
  if (result.state === "level-locked") {
    return [
      "🧥 Єгерський куток",
      presentCharacterHeader(result.character),
      "",
      ...presentYegerCornerIntro(result.character),
      "",
      `Поверніться з ${result.requiredLevel} рівня.`
    ].join("\n");
  }

  if (result.state === "offered") {
    return [
      "🧥 Єгерський куток",
      presentCharacterHeader(result.character),
      "",
      ...presentYegerCornerIntro(result.character),
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
    "🧥 Єгерський куток",
    presentCharacterHeader(result.character),
    "",
    ...presentYegerCornerIntro(result.character),
    "",
    presentProgressLine(result.progress),
    "",
    result.state === "turn-in-ready"
      ? "Дощечка має всі риски. Єгер має вираз обличчя «непогано, але я не скажу»."
      : "Єгер провів пальцем по мапі. Мапа зробила вигляд, що не лоскотно."
  ].join("\n");
}

export function presentYegerCorner(
  result: Exclude<YegerQuestLookupResult, { state: "no-character" }>
): string {
  const lines = [
    "🧥 Єгерський куток",
    presentCharacterHeader(result.character),
    "",
    ...presentYegerCornerIntro(result.character)
  ];

  if (result.state === "level-locked") {
    lines.push("", `Єгер киває на ваші чоботи й радить повернутися з ${result.requiredLevel} рівня.`);
  } else if (result.state === "offered") {
    lines.push("", "На краю стола лежить справа. Вона вдає, що не дивиться на вас.");
  } else if (result.state === "completed") {
    lines.push("", "Неспокійні справи закрито. Єгер удає, що це просто пил потрапив у повагу.");
  } else {
    lines.push(
      "",
      presentProgressLine(result.progress),
      "",
      result.state === "turn-in-ready"
        ? "Дощечка має всі риски. Єгер має вираз обличчя «непогано, але я не скажу»."
        : "Єгер провів пальцем по мапі. Мапа зробила вигляд, що не лоскотно."
    );
  }

  return lines.join("\n");
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
    "У журнал лягає тільки справжня збережена сутичка. Втеча, поразка й протермінований бій лишаються корчемними чутками."
  ].join("\n");
}

export function presentYegerTrackingStart(input?: {
  yegerProgress?: { wins: number; target: number };
  thirteenProgress?: ThirteenSmallProblemsProgress | null;
}): string {
  const lines = [
    "👣 Ви виходите на слід.",
    "",
    "Слід спершу вдавав, що він просто подряпина на підлозі, але Єгер не повірив.",
    "",
    "Щось неупокоєне знайшлося.",
    "",
    "Воно теж вас помітило, але тепер уже пізно робити вигляд, що всі прийшли випадково."
  ];
  const questLines = presentTrackingQuestLines(input);

  if (questLines.length > 0) {
    lines.push(
      "",
      "Справи, які прислухаються до цього бою:",
      ...questLines,
      "",
      "Якщо переможете, відповідні журнали самі посунуть рахунок. Корчмар каже, що це майже магія, тільки з паперами."
    );
  }

  return lines.join("\n");
}

export function presentYegerTrackingBlockedByOtherFight(): string {
  return [
    "🏹 Єгер притримує мапу.",
    "",
    "У вас уже триває інша сутичка. Закрийте її, тоді знову вийдемо на неупокоєних."
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
      "🧥 Єгерський куток",
      presentCharacterHeader(result.character),
      "",
      ...presentYegerCornerIntro(result.character),
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

  return lines.join("\n");
}

function presentProgressLine(progress: { wins: number; target: number }): string {
  return `Прогрес: <b>${progress.wins}/${progress.target}</b>.`;
}

function presentTrackingQuestLines(input?: {
  yegerProgress?: { wins: number; target: number };
  thirteenProgress?: ThirteenSmallProblemsProgress | null;
}): string[] {
  const lines: string[] = [];

  if (input?.yegerProgress) {
    lines.push(
      `• <b>Неспокійні справи</b>: <b>${input.yegerProgress.wins}/${input.yegerProgress.target}</b> рисок до здачі Єгерю.`
    );
  }

  const thirteen = input?.thirteenProgress;

  if (thirteen && !thirteen.completed) {
    lines.push(
      `• <b>Тринадцять дрібних проблем</b>: <b>${thirteen.wins}/${thirteen.target}</b> проблем у журналі.`
    );
  }

  if (thirteen?.completed) {
    lines.push("• <b>Тринадцять дрібних проблем</b>: список уже закрито й поводиться як ветеран паперової війни.");
  }

  return lines;
}

function presentYegerCornerIntro(character: CharacterSummary): string[] {
  return [
    "У темному кутку сидить людисько-єгер у капюшоні. Він курить трубку, підозріло дивиться на всіх і має вигляд людини, яка точно не чекає на сюжетний гачок.",
    "",
    npcQuote("Єгер", presentYegerReaction(character))
  ];
}

function presentYegerReaction(character: CharacterSummary): string {
  const title = character.title.toLocaleLowerCase("uk-UA");

  if (character.raceId === "race.human-ish" && character.classId === "class.ranger") {
    return "Людисько-єгер. Нарешті хтось, хто розуміє, що капюшон — це не стиль, а документація намірів.";
  }

  if (title.includes("поли")) {
    return "Завідувачі полиць рідко губляться. Якщо не знають дороги, то ставлять її в правильний розділ.";
  }

  if (title.includes("місцев")) {
    return "Місцеве значення — це добре. Сліди теж починають із місцевого, а тоді раптом стають особистими.";
  }

  if (character.raceId === "race.domovyk") {
    return "На мить я подумав про гобітів. Але їх тут немає з причин, які корчмар називає «ліцензійною магією».";
  }

  if (character.classId === "class.ranger") {
    return "Єгер єгеря бачить здалеку. Навіть якщо один із них робить вигляд, що просто сидить біля бочки.";
  }

  if (character.classId === "class.rogue") {
    return "Ваші руки надто чесно поводяться. Це мене непокоїть.";
  }

  if (character.raceId === "race.elf") {
    return "Ельф у корчмі — це завжди або балада, або скарга на дим. Сьогодні перевіримо, що швидше.";
  }

  if (character.classId === "class.bureaucramancer") {
    return "Якщо у вас є форма на підозрілий погляд, не показуйте. Я працюю без печаток.";
  }

  return "Сидіть рівно. Не тому, що небезпечно. Просто так легше зрозуміти, хто першим збреше.";
}
