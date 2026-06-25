import type { ThirteenSmallProblemsProgress } from "../../services/fightService";
import type {
  YegerQuestLookupResult,
  YegerQuestStartResult,
  YegerTrackingResult,
  YegerQuestTurnInResult,
  YegerBandageSupplyResult,
  YegerRangerBandageResult
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

  const lines = [
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
  ];

  if (result.state === "in-progress") {
    const trackingLine = presentTrackingStatusLine(result.tracking);

    if (trackingLine) {
      lines.push("", trackingLine);
    }
  }

  return lines.join("\n");
}

export function presentYegerHuntOutside(
  result: Extract<YegerQuestLookupResult, { state: "in-progress" }>
): string {
  const lines = [
    "🚪 Надворі біля корчми",
    presentCharacterHeader(result.character),
    "",
    "Єгер лишився біля Бочки, а вас відправив сюди, де сліди не можуть сховатися під піною.",
    "",
    presentProgressLine(result.progress)
  ];
  const trackingLine = presentOutdoorTrackingStatusLine(result.tracking);

  if (trackingLine) {
    lines.push("", trackingLine);
  }

  return lines.join("\n");
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

export function presentYegerBandageBuy(result: YegerBandageSupplyResult): string {
  if (result.state === "no-character") {
    return presentYegerNoCharacter();
  }

  if (result.state === "invalid-token") {
    return [
      "🩹 Бинти Єгеря",
      "",
      "Цей папірець уже не схожий на єгерський. Краще відкрити купівлю наново."
    ].join("\n");
  }

  if (result.state === "stale-token") {
    return [
      "🩹 Бинти Єгеря",
      presentCharacterHeader(result.character),
      "",
      "Єгер перерахував ціну й підозріло глянув на стару кнопочку.",
      "Краще відкрити купівлю наново."
    ].join("\n");
  }

  if (result.state === "cancelled") {
    return [
      "🩹 Бинти Єгеря",
      presentCharacterHeader(result.character),
      "",
      "Купівлю скасовано. Єгер сховав бинт так, ніби він теж має право на приватність."
    ].join("\n");
  }

  if (result.state === "preview") {
    const discountLine = result.priceGold < 7
      ? "Єгерська знижка для єгерів уже врахована."
      : "Ціна звичайна, без таємних стежок у бухгалтерії.";

    return [
      "🩹 Купити бинт",
      presentCharacterHeader(result.character),
      "",
      `${result.itemGrants.map((grant) => presentRewardItemGrant({ name: escapeHtml(grant.name), quantity: grant.quantity })).join(", ")}.`,
      `Ціна: <b>${result.priceGold} золота</b>.`,
      `У вас: <b>${result.currentGold} золота</b>.`,
      discountLine,
      "",
      "Єгер чекає підтвердження й робить вигляд, що це не каса."
    ].join("\n");
  }

  if (result.state === "insufficient-gold") {
    return [
      "🩹 Бинти Єгеря",
      presentCharacterHeader(result.character),
      "",
      `Єгер показує ціну: <b>${result.requiredGold} золота</b>.`,
      "У торбі лунає фінансова тиша."
    ].join("\n");
  }

  return [
    "🩹 Бинти Єгеря",
    presentCharacterHeader(result.character),
    "",
    `Куплено: ${result.itemGrants.map((grant) => presentRewardItemGrant({ name: escapeHtml(grant.name), quantity: grant.quantity })).join(", ")}.`,
    `Витрачено: <b>${result.spentGold} золота</b>.`,
    result.state === "replayed" ? "Цей чек уже проведено. Другий раз золото не зникло." : "",
    "",
    "Єгер сказав: «Не наклеюйте на гордість. На гордість не тримається»."
  ].filter((line, index, lines) => line !== "" || lines[index - 1] !== "").join("\n");
}

export function presentYegerRangerBandage(result: YegerRangerBandageResult): string {
  if (result.state === "no-character") {
    return presentYegerNoCharacter();
  }

  if (result.state === "class-locked") {
    return [
      "🏹 Єгерський бинт",
      presentCharacterHeader(result.character),
      "",
      "Єгер ховає безкоштовну пачку під карту.",
      "«Це для єгерів. Іншим продаю, бо виховання теж має бюджет»."
    ].join("\n");
  }

  if (result.state === "on-cooldown") {
    return [
      "🏹 Єгерський бинт",
      presentCharacterHeader(result.character),
      "",
      `Безкоштовний бинт буде знову ${formatTrackingWait(result.nextAvailableAt, result.now)}.`,
      "Єгер каже, що запас теж має сліди."
    ].join("\n");
  }

  return [
    "🏹 Єгерський бинт",
    presentCharacterHeader(result.character),
    "",
    `${result.itemGrants.map((grant) => presentRewardItemGrant({ name: escapeHtml(grant.name), quantity: grant.quantity })).join(", ")}.`,
    `Наступний безкоштовний бинт: ${formatTrackingWait(result.nextAvailableAt, result.now)}.`,
    "",
    "Єгер кивнув так, ніби це не доброта, а техніка виживання."
  ].join("\n");
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
      "Поруч із цим боєм:",
      ...questLines
    );
  }

  return lines.join("\n");
}

export function presentYegerTrackingPending(
  result: Extract<YegerTrackingResult, { state: "tracking-started" | "tracking-pending" }>
): string {
  const intro = result.state === "tracking-started"
    ? "Єгер кладе мапу на стіл. Мапа одразу вдає, що вона тут головна."
    : "Слід ще гріється десь між підлогою і підозрою.";

  return [
    "👣 Слід узято.",
    "",
    intro,
    "",
    `Перевірити можна буде ${formatTrackingWait(result.tracking.availableAt, result.tracking.now)}.`
  ].join("\n");
}

export function presentYegerTrackingNone(
  result: Extract<YegerTrackingResult, { state: "tracking-resolved-none" }>
): string {
  const line = result.outcome === "near-miss"
    ? "Слід привів до дуже переконливої тіні. Тінь виявилася тінню, але трималася професійно."
    : "Слід зробив коло, подивився на Єгеря й удав, що його неправильно зрозуміли.";

  return [
    "🔎 Слід перевірено.",
    "",
    line,
    "",
    "Неупокоєне сьогодні не знайшлося. Єгер каже, що це не провал, а економія бинтів.",
    "",
    `Новий слід можна буде взяти ${formatTrackingWait(result.tracking.availableAt, result.tracking.now)}.`
  ].join("\n");
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

function presentTrackingStatusLine(tracking: { state: string; availableAt?: Date; now?: Date }): string | null {
  if (tracking.state === "tracking-pending" && tracking.availableAt && tracking.now) {
    return `Слід шукається. Перевірити можна ${formatTrackingWait(tracking.availableAt, tracking.now)}.`;
  }

  if (tracking.state === "tracking-ready") {
    return "Слід уже чекає перевірки. Єгер робить вигляд, що не хвилюється.";
  }

  return null;
}

function presentOutdoorTrackingStatusLine(
  tracking: { state: string; availableAt?: Date; now?: Date }
): string | null {
  if (tracking.state === "tracking-pending" && tracking.availableAt && tracking.now) {
    return `Слід уже взято. Перевірити можна ${formatTrackingWait(tracking.availableAt, tracking.now)}.`;
  }

  if (tracking.state === "tracking-ready") {
    return "Слід чекає перевірки. Це підозріло чемно з його боку.";
  }

  return "Можна взяти новий слід. Двір робить вигляд, що нічого не знає.";
}

function formatTrackingWait(availableAt: Date, now: Date): string {
  const diffMs = availableAt.getTime() - now.getTime();

  if (diffMs <= 0) {
    return "зараз";
  }

  const minutes = Math.max(1, Math.ceil(diffMs / 60_000));

  return `приблизно за ${minutes} хв.`;
}

function presentTrackingQuestLines(input?: {
  yegerProgress?: { wins: number; target: number };
  thirteenProgress?: ThirteenSmallProblemsProgress | null;
}): string[] {
  const lines: string[] = [];

  if (input?.yegerProgress) {
    lines.push(
      `• <b>Неспокійні справи</b>: <b>${input.yegerProgress.wins}/${input.yegerProgress.target}</b> рисок.`
    );
  }

  const thirteen = input?.thirteenProgress;

  if (thirteen?.issued && !thirteen.completed) {
    lines.push(
      `• <b>${escapeHtml(thirteen.title)}</b>: <b>${thirteen.wins}/${thirteen.target}</b> проблем.`
    );
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
