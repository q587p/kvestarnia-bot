import type { ThirteenSmallProblemsProgress } from "../../services/fightService";
import type {
  YegerQuestLookupResult,
  YegerQuestStartResult,
  YegerTrackingResult,
  YegerQuestTurnInResult,
  YegerBandageSupplyResult,
  YegerNotchExchangeLookupResult,
  YegerNotchExchangeResult,
  YegerRangerBandageResult,
  YegerRangerSupplyKind
} from "../../services/yegerQuestService";
import type { CharacterSummary } from "../../domain/characters/characterSummary";
import { presentQuestRewardAmount, presentRewardItemGrant } from "./rewardPresenter";
import { escapeHtml, npcQuote, presentCharacterHeader } from "./telegramHtml";
import { presentItemNameWithQuantity } from "./itemStackPresenter";
import { presentYegerQuestTitle } from "./yegerQuestTitle";

export function presentYegerQuest(
  result: Exclude<YegerQuestLookupResult, { state: "no-character" }>
): string {
  if (result.state === "level-locked") {
    return [
      "🧥 Єгерський куток",
      "",
      ...presentYegerCornerIntro(result.character),
      "",
      `Поверніться з ${result.requiredLevel} рівня.`
    ].join("\n");
  }

  if (result.state === "offered") {
    return [
      "🏹 Єгерська справа",
      "",
      "Доступна справа:",
      `<b>${presentYegerQuestTitle(result.progress)}</b>`,
      "",
      result.progress.target === 17
        ? "Перша дощечка закрита. Тепер Єгер просить наступні 17 неупокоєних проблем, бо хтось необережно сказав слово «серія»."
        : "Переможіть 5 неупокоєних проблем, які не зрозуміли, що робочий день скінчився.",
      "",
      result.progress.target === 17
        ? "Нагорода: XP і золото на дуже переконливу паузу біля Бочки. А ще крок до щільних бинтів і польової аптечки, які поки роблять вигляд, що їх нема в шафці."
        : "Нагорода: XP, золото на якісне пиво, єгерська риска в журналі."
    ].join("\n");
  }

  if (result.state === "completed") {
    return presentYegerCompleted({
      character: result.character,
      reward: result.reward,
      progress: result.progress,
      replay: true
    });
  }

  const lines = [
    `🏹 ${presentYegerQuestTitle(result.progress)}`,
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
    "",
    ...presentYegerCornerIntro(result.character)
  ];

  if (result.state === "level-locked") {
    lines.push("", `Єгер киває на ваші чоботи й радить повернутися з ${result.requiredLevel} рівня.`);
  } else if (result.state === "offered") {
    lines.push("", "На краю стола лежить справа. Вона вдає, що не дивиться на вас.");
  } else if (result.state === "completed") {
    lines.push("", `${presentYegerQuestTitle(result.progress)} закрито. Єгер удає, що це просто пил потрапив у повагу.`);
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

export function presentYegerBandages(
  result: Exclude<YegerQuestLookupResult, { state: "no-character" }>
): string {
  if (
    result.state !== "completed" &&
    (result.state === "level-locked" || result.progress.stageId !== "second")
  ) {
    return [
      "🩹 Бинти Єгеря",
      presentCharacterHeader(result.character),
      "",
      "Єгер тримає ящик бинтів закритим, доки на першій дощечці не буде 5 рисок.",
      "Спершу закрийте першу неспокійну справу."
    ].join("\n");
  }

  const lines = [
    "🩹 Бинти Єгеря",
    presentCharacterHeader(result.character),
    "",
    "Єгер розклав бинти так рівно, ніби вони самі винні.",
    "Платні пачки лежать окремо: порядок дивиться на них і майже не кліпає."
  ];

  if (result.character.classId === "class.ranger") {
    const supplyLines = [
      presentRangerSupplyMenuLine(result.rangerBandage),
      presentRangerSupplyMenuLine(result.rangerDenseBandage),
      presentRangerSupplyMenuLine(result.rangerFieldKit)
    ].filter((line): line is string => Boolean(line));

    if (supplyLines.length > 0) {
      lines.push("", ...supplyLines);
    }
  }

  return lines.join("\n");
}

export function presentYegerNotchExchange(result: YegerNotchExchangeLookupResult): string {
  if (result.state === "no-character") {
    return presentYegerNoCharacter();
  }

  if (result.state === "locked") {
    return [
      "🪵 Обмін рисок",
      "",
      "Єгер не міняє риски, доки друга дощечка не закрита.",
      "Спершу треба довести «Неспокійні справи 2.0» до 17/17."
    ].join("\n");
  }

  return [
    "🪵 Обмін рисок",
    "",
    `У торбі: <b>${result.summary.availableNotches}</b> ${formatNotchUnit(result.summary.availableNotches)}.`,
    result.summary.options.length > 0
      ? "Єгер приймає риски назад із виглядом людини, яка завжди так і планувала."
      : "Єгер дивиться на порожнє місце в торбі й нічого не обмінює з дивовижною принциповістю."
  ].join("\n");
}

export function presentYegerNotchExchangeResult(result: YegerNotchExchangeResult): string {
  if (result.state === "no-character") {
    return presentYegerNoCharacter();
  }

  if (result.state === "locked") {
    return [
      "🪵 Обмін рисок",
      presentCharacterHeader(result.character),
      "",
      "Єгер відсуває риски назад.",
      "«Спершу закрийте другу дощечку. Порядок теж має зуби»."
    ].join("\n");
  }

  if (result.state === "stale") {
    return [
      "🪵 Обмін рисок",
      presentCharacterHeader(result.character),
      "",
      `У старій кнопці було <b>${result.expectedNotches}</b>, а в торбі зараз <b>${result.currentNotches}</b> ${formatNotchUnit(result.currentNotches)}.`,
      "Єгер не любить старі кнопки. Відкрийте обмін ще раз."
    ].join("\n");
  }

  if (result.state === "not-enough") {
    return [
      "🪵 Обмін рисок",
      presentCharacterHeader(result.character),
      "",
      `У торбі: <b>${result.summary.availableNotches}</b> ${formatNotchUnit(result.summary.availableNotches)}.`,
      "На такий обмін рисок не вистачає. Єгер рахує мовчки, але дуже чутно."
    ].join("\n");
  }

  return [
    "🪵 Риску обміняно",
    presentCharacterHeader(result.character),
    "",
    `Витрачено: <b>${result.spentNotches}</b> ${formatNotchUnit(result.spentNotches)}.`,
    ...result.itemGrants.map((grant) =>
      presentRewardItemGrant({ name: escapeHtml(grant.name), quantity: grant.quantity })
    ),
    `Залишилось: <b>${result.summary.availableNotches}</b> ${formatNotchUnit(result.summary.availableNotches)}.`,
    "",
    "Єгер сховав риску в журнал і видав медицину так, ніби це не торг, а сувора екологія дощечок."
  ].join("\n");
}

export function presentYegerNoCharacter(): string {
  return "Спершу створіть пригодника через /start. Єгер не видає сліди порожнім чоботам.";
}

export function presentYegerBandageBuy(result: YegerBandageSupplyResult): string {
  if (result.state === "no-character") {
    return presentYegerNoCharacter();
  }

  if (result.state === "locked") {
    return presentYegerBandageLocked(result);
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

  if (result.state === "daily-limit") {
    return [
      "🩹 Бинти Єгеря",
      presentCharacterHeader(result.character),
      "",
      `Сьогодні куплено: <b>${result.purchasedToday}/${result.dailyLimit}</b>.`,
      "Єгер закрив ящик ліктем.",
      "«Бинти теж мають робочий день. Дуже малий, але гордий»."
    ].join("\n");
  }

  if (result.state === "cancelled") {
    return [
      "🩹 Бинти Єгеря",
      presentCharacterHeader(result.character),
      "",
      "Купівлю скасовано. Єгер сховав бинти так, ніби вони теж мають право на приватність."
    ].join("\n");
  }

  if (result.state === "preview") {
    const discountLine = result.unitPriceGold < 7
      ? "Єгерська знижка для єгерів уже врахована."
      : "Ціна звичайна, без таємних стежок у бухгалтерії.";

    return [
      "🩹 Купити бинти",
      presentCharacterHeader(result.character),
      "",
      `Планка на сьогодні: <b>${result.targetQuantity}</b>. Уже куплено: <b>${result.purchasedToday}</b>.`,
      `Єгер докладе: <b>${result.purchaseQuantity}</b>.`,
      `${result.itemGrants.map(presentPendingBandagePurchaseGrant).join(", ")}.`,
      `Ціна: <b>${result.priceGold} золота</b>.`,
      `У вас: <b>${result.currentGold} золота</b>.`,
      discountLine,
      "",
      "Єгер чекає підтвердження й робить вигляд, що це не ящик першої підозрілої допомоги."
    ].join("\n");
  }

  if (result.state === "insufficient-gold") {
    const affordable = result.affordablePreview;
    const fallbackLines = affordable
      ? [
          "",
          `На всю обрану пачку не стане, але гаманець ще дихає на <b>${affordable.purchaseQuantity}</b> ${formatBandageUnit(affordable.purchaseQuantity)}.`,
          `Це буде <b>${affordable.priceGold} золота</b>. У вас: <b>${affordable.currentGold} золота</b>.`,
          affordable.unitPriceGold < 7
            ? "Єгерська знижка вже в ціні. Єгер кивнув так, ніби це офіційний штамп."
            : "Єгер підсунув менший згорток і зробив вигляд, що це фінансова стратегія.",
          "Купити стільки, на скільки вистачає?"
        ]
      : [];

    return [
      "🩹 Бинти Єгеря",
      presentCharacterHeader(result.character),
      "",
      `Єгер показує ціну: <b>${result.requiredGold} золота</b>.`,
      "У торбі лунає фінансова тиша.",
      ...fallbackLines
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
    "Єгер сказав: «Не наклеюйте на гордість. На гордість не тримається. Я перевіряв»."
  ].filter((line, index, lines) => line !== "" || lines[index - 1] !== "").join("\n");
}

function presentPendingBandagePurchaseGrant(input: { name: string; quantity: number }): string {
  return `Після купівлі: <i>${presentItemNameWithQuantity({
    name: escapeHtml(input.name),
    quantity: input.quantity
  })}</i>`;
}

function formatBandageUnit(quantity: number): string {
  const mod10 = quantity % 10;
  const mod100 = quantity % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return "бинт";
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return "бинти";
  }

  return "бинтів";
}

function formatNotchUnit(quantity: number): string {
  const mod10 = quantity % 10;
  const mod100 = quantity % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return "риска";
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return "риски";
  }

  return "рисок";
}

export function presentYegerRangerBandage(result: YegerRangerBandageResult): string {
  if (result.state === "no-character") {
    return presentYegerNoCharacter();
  }

  if (result.state === "locked") {
    return presentYegerBandageLocked(result);
  }

  if (result.state === "class-locked") {
    return [
      presentRangerSupplyTitle(result.kind),
      presentCharacterHeader(result.character),
      "",
      "Єгер ховає безкоштовну пачку під карту.",
      "«Це для єгерів. Іншим продаю, бо виховання теж має бюджет»."
    ].join("\n");
  }

  if (result.state === "on-cooldown") {
    return [
      presentRangerSupplyTitle(result.kind),
      presentCharacterHeader(result.character),
      "",
      `${presentRangerSupplySubject(result.kind)} буде знову ${formatTrackingWait(result.nextAvailableAt, result.now)}.`,
      "Єгер каже, що запас теж має сліди."
    ].join("\n");
  }

  return [
    presentRangerSupplyTitle(result.kind),
    presentCharacterHeader(result.character),
    "",
    `${result.itemGrants.map((grant) => presentRewardItemGrant({ name: escapeHtml(grant.name), quantity: grant.quantity })).join(", ")}.`,
    `Наступний запас ${formatTrackingWait(result.nextAvailableAt, result.now)}.`,
    "",
    "Єгер кивнув так, ніби це не доброта, а техніка виживання."
  ].join("\n");
}

function presentRangerSupplyMenuLine(
  supply: Exclude<YegerQuestLookupResult, { state: "no-character" }>["rangerBandage"]
): string | null {
  if (!supply) {
    return null;
  }

  if (supply.state === "on-cooldown") {
    return `${presentRangerSupplySubject(supply.kind)} зараз перевʼязує власну важливість. Повернеться ${formatTrackingWait(supply.nextAvailableAt, supply.now)}.`;
  }

  switch (supply.kind) {
    case "bandage":
      return "Єгері можуть забрати 5 звичайних бинтів безкоштовно. Вони дивляться суворо й рахують до 93.";
    case "dense-bandage":
      return "Після другої дошки для єгерів лежить щільний бинт: один запас на знайомий слідовий відлік.";
    case "field-kit":
      return "Після другої дошки єгер може забрати польову аптечку раз на добу. Аптечка робить вигляд, що це не розкіш.";
  }
}

function presentRangerSupplyTitle(kind: YegerRangerSupplyKind): string {
  switch (kind) {
    case "bandage":
      return "🧰 Єгерські бинти";
    case "dense-bandage":
      return "🧵 Єгерський щільний бинт";
    case "field-kit":
      return "🧰 Єгерська аптечка";
  }
}

function presentRangerSupplySubject(kind: YegerRangerSupplyKind): string {
  switch (kind) {
    case "bandage":
      return "Безкоштовні бинти";
    case "dense-bandage":
      return "Щільний бинт";
    case "field-kit":
      return "Польова аптечка";
  }
}

function presentYegerBandageLocked(result: { character: CharacterSummary; requiredWins: number }): string {
  return [
    "🩹 Бинти Єгеря",
    presentCharacterHeader(result.character),
    "",
    `Єгер тримає ящик бинтів закритим, доки на першій дощечці не буде ${result.requiredWins} рисок.`,
    "Спершу закрийте першу неспокійну справу."
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
      progress: result.progress,
      replay: true
    });
  }

  return [
    `🏹 ${presentYegerQuestTitle(result.progress)}`,
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

export function presentYegerFieldKitHelp(
  input: { state?: "needs-yeger-boards" | "has-field-kit" } = {}
): string {
  if (input.state === "has-field-kit") {
    return [
      "🧰 Аптечка?",
      "",
      "Єгер дивиться на вашу торбу й киває так, ніби це він усе спланував.",
      "",
      npcQuote(
        "Єгер",
        "Молодець. Польова аптечка вже у вас. Тепер ідіть до мага в задвірок: хай він офіційно нервує біля іскор."
      )
    ].join("\n");
  }

  return [
    "🧰 Аптечка?",
    "",
    "Єгер дивиться на ваші руки так, ніби вони вже тримають неправильний бинт.",
    "",
    npcQuote(
      "Єгер",
      "Польова аптечка любить порядок. Спершу закрийте «Неспокійні справи», потім «Неспокійні справи 2.0». Після другої дощечки бинти починають слухати інструкції, а не лише паніку."
    )
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
      `🏹 ${presentYegerQuestTitle(result.progress)}`,
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
    progress: result.progress,
    replay: result.state === "already-completed"
  });
}

function presentYegerCompleted(input: {
  character: { name: string; title: string };
  progress: { target: number };
  reward: {
    xp: number;
    gold: number;
    itemGrants: Array<{ name: string; quantity: number }>;
    itemReplayUnavailable?: boolean;
  };
  replay: boolean;
}): string {
  const lines = [
    `🏹 ${presentYegerQuestTitle(input.progress)} закрито`,
    `<b>${escapeHtml(input.character.name)}</b> · <i>${escapeHtml(input.character.title)}</i>`,
    "",
    input.progress.target === 17
      ? "Сімнадцята наступна неупокоєна проблема нарешті лягла в журнал і попросила не нумерувати її родичів."
      : "П’ята неупокоєна проблема нарешті лягла в журнал.",
    "",
    "Журнал тихо зрадів і попросив не робити з цього традицію."
  ];

  if (input.replay) {
    lines.push("", input.progress.target === 17
      ? "Єгер уже поставив дві риски. Третю не ставить, бо це була б сильна емоція без окремої графи в журналі."
      : "Єгер уже поставив риску. Другу не ставить, бо це була б емоція.");
  } else if (input.progress.target === 17) {
    lines.push(
      "",
      "Єгер ставить дві риски на дощечці. Одну за справу, другу за те, що журнал не попросив відпустку."
    );
  }

  lines.push(
    "",
    presentQuestRewardAmount({ xp: input.reward.xp, gold: input.reward.gold }),
    ...input.reward.itemGrants.map((grant) =>
      presentRewardItemGrant({ name: escapeHtml(grant.name), quantity: grant.quantity })
    )
  );

  if (input.progress.target === 5) {
    lines.push(
      "",
      "Відкрито: Єгер перестав вдавати, що ящик із бинтами є частиною меблів. А на краю стола вже шарудить наступна справа — «Неспокійні справи 2.0»."
    );
  }

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

  return `приблизно за ${minutes} хв`;
}

function presentTrackingQuestLines(input?: {
  yegerProgress?: { wins: number; target: number };
  thirteenProgress?: ThirteenSmallProblemsProgress | null;
}): string[] {
  const lines: string[] = [];

  if (input?.yegerProgress) {
    lines.push(
      `• <b>${presentYegerQuestTitle(input.yegerProgress)}</b>: <b>${input.yegerProgress.wins}/${input.yegerProgress.target}</b> рисок.`
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
