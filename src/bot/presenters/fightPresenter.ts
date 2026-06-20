import { MIMIC_SHAWARMA_HP } from "../../domain/combat/combatProbe";
import type { CharacterSummary } from "../../domain/characters/characterSummary";
import type { CombatTurnSummary } from "../../domain/combat";
import type {
  FightLookupResult,
  FightResult,
  ProblemQuestIssueNextLookupResult,
  ProblemQuestTurnInLookupResult,
  PersistentFightTurnResult,
  ThirteenSmallProblemsProgress
} from "../../services/fightService";
import { getCombatSkillDisplay } from "../../services/fightService";
import { selectCharacterFlavorLine } from "../../content/characterFlavor";
import { presentRewardAmount, presentRewardItemGrant } from "./rewardPresenter";
import { escapeHtml, presentCharacterHeader } from "./telegramHtml";

export interface QuestProgressAfterFightEntry {
  title: string;
  wins: number;
  target: number;
  completed?: boolean;
  readyHint?: string;
  action?: "bar" | "yeger";
}

export function presentFightStart(character: CharacterSummary): string {
  return [
    "⚔️ Сутичка з підозрілим монстром",
    "",
    "Те, що мало бути простою шаурмою, розкриває зуби. Вечеря щойно стала переговорами.",
    ...presentCharacterFlavor(character, "quest.start", "fight"),
    "",
    `❤️ Ви: ${character.hpCurrent}/${character.hpMax}   🌯 Монстр: ${MIMIC_SHAWARMA_HP}/${MIMIC_SHAWARMA_HP}`,
    "",
    "Що робимо?"
  ].join("\n");
}

export function presentFightNoCharacter(): string {
  return "Спершу створіть пригодника через /start. Мімік-шаурма не бʼється з анонімами: погано для бухгалтерії.";
}

export function presentFightAlreadyCompleted(
  result:
    | Extract<FightLookupResult, { state: "already-completed" }>
    | Extract<FightResult, { state: "already-completed" }>
): string {
  const lines = [
    "🌯 Сьогоднішню сутичку вже зараховано.",
    "",
    "Мімік лежить тихо й робить вигляд, що він просто лаваш."
  ];

  if (result.questAvailable) {
    lines.push("", "Якщо шаурму ще не допитували, можна в /quest.");
  } else {
    lines.push("", "Повертайтесь завтра або перевірте персонажа: /hero");
  }

  return lines.join("\n");
}

export function presentFightLevelRetired(
  result:
    | Extract<FightLookupResult, { state: "level-retired" }>
    | Extract<FightResult, { state: "level-retired" }>
): string {
  return [
    "⚔️ Навчальна сутичка закрита.",
    "",
    `Після ${result.maxLevel} рівня підозрілий монстр більше не погоджується бути тренажером.`,
    "",
    "Корчмар киває на дошку полювання: /hunt"
  ].join("\n");
}

export function presentFightNeedsRest(
  result: Extract<FightLookupResult, { state: "needs-rest" }>
): string {
  const recovery = result.character.resourceRecovery;
  const hpEta =
    recovery && recovery.hpSecondsToFull > 0
      ? ` Орієнтовно до повного HP: ~${presentDuration(recovery.hpSecondsToFull)}.`
      : "";

  return [
    "❤️ Пригодник ще не тримається на ногах.",
    "",
    `Зараз HP ${result.character.hpCurrent}/${result.character.hpMax}, мана ${result.character.manaCurrent}/${result.character.manaMax}.${hpEta}`,
    "",
    "Спершу /hero: бій знову відчиниться, коли HP буде хоча б 1."
  ].join("\n");
}

export function presentFightMonsterRest(
  result: Extract<FightLookupResult, { state: "monster-rest" }>
): string {
  return [
    "🪜 <b>Низ просить тихіше</b>",
    presentCharacterHeader(result.character),
    "",
    "Монстри щойно взяли коротку корчемну перерву. Кажуть, без неї вони починають випадати з ролі й просити профспілку.",
    "",
    `Поверніться за <b>${presentDuration(Math.ceil((result.availableAt.getTime() - result.now.getTime()) / 1000))}</b>.`
  ].join("\n");
}

export function presentFightTrainingActive(
  result: Extract<FightLookupResult, { state: "training-active" }>
): string {
  return [
    "🥊 Тренування вже триває.",
    presentCharacterHeader(result.character),
    "",
    "Сумлінний Допельґанґер тримає місце в Бійцівському кутку й дуже просить не відкривати паралельну проблему.",
    "",
    "Завершіть /spar, а тоді повертайтесь до звичайних сутичок."
  ].join("\n");
}

export function presentPersistentFightDifficultyChoice(
  result: Extract<FightLookupResult, { state: "persistent-ready" }>
): string {
  return [
    "🧱 <b>Ярус I: Сутерени Корчми</b>",
    presentCharacterHeader(result.character),
    "",
    "Підсходник сидить на нижній сходинці й крейдою малює три проходи на стіні. Каже, що Низ любить, коли вибір здається простим.",
    "",
    "⬅️ Лівий прохід — глибше й небезпечніше: сильніший монстр, трохи щедріша здобич.",
    "🚪 Прямий прохід — як є: чесний корчмарський хаос.",
    "➡️ Правий прохід — обережніше: нижчий рівень і скромніша винагорода."
  ].join("\n");
}

export function presentFightResult(result: Exclude<FightResult, { state: "no-character" }>): string {
  if (result.state === "level-retired") {
    return presentFightLevelRetired(result);
  }

  if (result.state === "already-completed") {
    return presentFightAlreadyCompleted(result);
  }

  const lines = [
    ...presentOutcome(result),
    ...presentCharacterFlavor(result.character, "quest.outcome", "fight", result.action),
    "",
    `❤️ Ви: ${result.combat.playerHpPreview}/${result.combat.playerHpMaxPreview}   🌯 Мімік-шаурма: ${result.combat.enemyHpPreview}/${result.combat.enemyHpMaxPreview}`,
    "",
    presentRewardAmount({ ...result.reward, label: "Нагорода" }),
    ...presentItemGrantBlock(result.reward.itemGrants)
  ];

  lines.push("", "Наступний крок: /hero");

  return lines.join("\n");
}

export function presentPersistentFight(
  result: Extract<FightLookupResult, { state: "persistent-active" | "persistent-terminal" }>
): string {
  const intro =
    result.state === "persistent-active"
      ? "Бій триває. Корчма тримає рахунок ходів, але поки не видає нагород."
      : "Цей бій уже завершився. Корчма записала стан і не чіпає нагороди.";
  const startTip = result.state === "persistent-active" && result.started
    ? presentBattleStartTip(result.character, result.session.id)
    : null;

  return presentPersistentFightState({
    character: result.character,
    session: result.session,
    monsterName: result.monster?.name ?? "Невідомий монстр",
    monsterLevel: result.monster?.level ?? null,
    questProgress: result.questProgress,
    fightReward: result.state === "persistent-terminal" ? result.fightReward : null,
    intro,
    startTip
  });
}

export function presentPersistentFightTurn(
  result: Exclude<PersistentFightTurnResult, { state: "no-character" }>
): string {
  if (result.state === "not-found") {
    return [
      "⚔️ Бій не знайшовся.",
      "",
      "Можливо, старий сувій уже прибрали зі столу. Спробуйте /fight ще раз."
    ].join("\n");
  }

  const intro = (() => {
    if (result.state === "stale-turn") {
      return "Цей хід уже не перший у черзі. Корчма показує поточний стан, без повторного удару.";
    }

    if (result.state === "not-enough-mana") {
      return result.reason === "skill-on-cooldown"
        ? "Вміння ще відсапується. Корчма показує поточний стан без зайвого удару."
        : "Мани не стало навіть на драматичний жест. Корчма показує поточний стан без зайвого удару.";
    }

    if (result.state === "terminal") {
      return "Цей бій уже завершився. Повторні натискання не переписують історію.";
    }

    return "Хід записано. Корчма звіряє винагороду без зайвого дзенькоту.";
  })();

  return presentPersistentFightState({
    character: result.character,
    session: result.session,
    monsterName: result.monster?.name ?? "Невідомий монстр",
    monsterLevel: result.monster?.level ?? null,
    questProgress: result.questProgress,
    fightReward: result.state === "updated" || result.state === "terminal" ? result.fightReward : null,
    intro
  });
}

export function presentProblemQuestProgressAfterFight(
  progress: ThirteenSmallProblemsProgress | null
): string | null {
  const entry = buildProblemQuestProgressAfterFightEntry(progress);

  return presentQuestProgressAfterFight(entry ? [entry] : []);
}

export function buildProblemQuestProgressAfterFightEntry(
  progress: ThirteenSmallProblemsProgress | null
): QuestProgressAfterFightEntry | null {
  if (!progress || !progress.issued || progress.branchComplete || progress.rewardClaimed) {
    return null;
  }

  return {
    title: progress.title,
    wins: progress.wins,
    target: progress.target,
    completed: progress.completed,
    ...(progress.completed
      ? { readyHint: "Корчмар чекає в шинку.", action: "bar" as const }
      : {})
  };
}

export function presentQuestProgressAfterFight(
  entries: readonly QuestProgressAfterFightEntry[]
): string | null {
  if (entries.length === 0) {
    return null;
  }

  const plural = entries.length > 1;
  const lines = [
    plural
      ? "📋 <b>Прогрес справ зрушив</b>"
      : "📋 <b>Прогрес справи зрушив</b>",
    ""
  ];

  for (const entry of entries) {
    const readyHint = entry.completed && entry.readyHint ? ` — ${escapeHtml(entry.readyHint)}` : "";

    lines.push(
      `<i>${escapeHtml(entry.title)}</i>: <b>${entry.wins}/${entry.target}</b>.${readyHint}`
    );
  }

  lines.push(
    "",
    plural
      ? "Журнал і дощечка задоволено хрумтять та вдають, що це була стратегія."
      : "Журнал задоволено хрумтить і вдає, що це була стратегія."
  );

  return lines.join("\n");
}

function presentCharacterFlavor(
  character: CharacterSummary,
  placement: "quest.start" | "quest.outcome",
  scene: "fight",
  action?: "attack" | "receipt" | "flee"
): string[] {
  const flavor = selectCharacterFlavorLine(character, {
    placement,
    scene,
    ...(action ? { action } : {})
  });

  return flavor ? ["", escapeHtml(flavor.text)] : [];
}

function presentOutcome(
  result: Exclude<FightResult, { state: "no-character" | "already-completed" | "level-retired" }>
): string[] {
  if (result.action === "attack") {
    return [
      "🗡️ Ви вдарили Міміка-шаурму.",
      "",
      `Він отримав ${result.combat.playerDamage} шкоди й задумався про карʼєру салату.`
    ];
  }

  if (result.action === "receipt") {
    return [
      "📋 Ви показали чек.",
      "",
      `Мімік отримав ${result.combat.playerDamage} шкоди від формальної ввічливості.`
    ];
  }

  return [
    "🏃 Ви відступили красиво.",
    "",
    `${escapeHtml(result.character.name)} зберіг обличчя, нерви й підозру до лаваша.`
  ];
}

function presentItemGrantBlock(itemGrants: Array<{ name: string; quantity: number }>): string[] {
  if (itemGrants.length === 0) {
    return [];
  }

  return [
    "",
    ...itemGrants.map((grant) =>
      presentRewardItemGrant({
        name: escapeHtml(grant.name),
        quantity: grant.quantity
      })
    )
  ];
}

function presentPersistentFightState(input: {
  character: CharacterSummary;
  session: { state: Extract<PersistentFightTurnResult, { state: "updated" }>["session"]["state"] };
  monsterName: string;
  monsterLevel: number | null;
  questProgress: ThirteenSmallProblemsProgress | null;
  fightReward?: Extract<PersistentFightTurnResult, { state: "updated" }>["fightReward"];
  intro: string;
  startTip?: string | null;
}): string {
  const state = input.session.state;
  const monsterLevel = input.monsterLevel ? ` · рівень ${input.monsterLevel}` : "";
  const lines = [
    "⚔️ Бій",
    presentCharacterHeader(input.character),
    "",
    input.intro,
    ...(input.startTip ? ["", input.startTip] : []),
    "",
    `Проти вас: <b>${escapeHtml(input.monsterName)}</b>${monsterLevel}`,
    "",
    `❤️ Ви: ${state?.hero.hp ?? "?"}/${state?.hero.hpMax ?? "?"} · мана ${state?.hero.mana ?? "?"}/${state?.hero.manaMax ?? "?"}`,
    `👹 Монстр: ${state?.monster.hp ?? "?"}/${state?.monster.hpMax ?? "?"}`,
    `Хід: ${state?.turn ?? "?"}`
  ];

  if (state?.status === "active" && state.cooldowns?.skill?.remainingTurns) {
    lines.push(`🫁 Вміння відсапується: ще ${formatTurns(state.cooldowns.skill.remainingTurns)}.`);
  }

  if (state?.lastTurn) {
    lines.push("", presentTurnSummary(state.lastTurn));
  }

  if (input.fightReward) {
    lines.push("", ...presentPersistentFightReward(input.fightReward));
  }

  if (state?.status === "won") {
    const readyQuestLine =
      input.questProgress?.completed && !input.questProgress.rewardClaimed
        ? "Корчмар уже чує, що проблем вистачило — занесіть це в шинок."
        : "Наступний крок: /hero або /quest.";

    lines.push(
      "",
      "🎉 Ви перемогли. Проблема закрита, журнал задоволено хрумтить сторінкою.",
      readyQuestLine
    );
  } else if (state?.status === "lost") {
    const questLines = presentLostFightQuestLines(input.questProgress);

    lines.push(
      "",
      questLines.length > 0 ? `💤 Ви програли. ${questLines[0]}` : "💤 Ви програли."
    );
  } else if (state?.status === "fled") {
    lines.push(
      "",
      "🏃 Ви відступили. Тактичний вітер підтримав ваше рішення.",
      "Справу не зараховано: проблема лишилась дрібною, нахабною і живою."
    );
  } else if (state?.status === "expired") {
    lines.push(
      "",
      "⌛ Бій видихнувся. Монстр теж мав справи.",
      "Корчмар не ставить галочку за бій, який розійшовся на перерву."
    );
  } else {
    lines.push(
      "",
      "Що робимо?"
    );
  }

  return lines.join("\n");
}

function presentLostFightQuestLines(progress: ThirteenSmallProblemsProgress | null): string[] {
  if (progress?.completed) {
    return [];
  }

  return ["Список дрібних проблем не зрушив, але зробив вигляд, що співчуває."];
}

function presentPersistentFightReward(
  reward: Extract<PersistentFightTurnResult, { state: "updated" }>["fightReward"]
): string[] {
  if (!reward) {
    return [];
  }

  if (isConsolationFightReward(reward)) {
    return ["🎒 За спробу:", presentRewardAmount(reward.reward)];
  }

  const lines: string[] = [];

  if (reward.state === "already-claimed") {
    lines.push("🎒 Цю винагороду вже занесли в журнал. Корчмар показує запис, а не відкриває касу вдруге.", "");
  }

  if (reward.state === "replayed") {
    lines.push("🎒 Винагорода вже видана. Корчмар перегортає журнал і показує той самий запис.", "");
  }

  lines.push(
    presentRewardAmount({ ...reward.reward, label: "Винагорода за бій" }),
    ...presentItemGrantBlock(reward.reward.itemGrants)
  );

  if (reward.itemReplayUnavailable) {
    lines.push("", "Детальний лут уже в торбі або журналі; повторно його не перекидаємо.");
  }

  return lines;
}

function isConsolationFightReward(
  reward: NonNullable<Extract<PersistentFightTurnResult, { state: "updated" }>["fightReward"]>
): boolean {
  return (
    reward.reward.xp === 1 &&
    reward.reward.gold === 0 &&
    reward.reward.itemGrants.length === 0
  );
}

function presentDuration(seconds: number): string {
  const minutes = Math.ceil(Math.max(0, seconds) / 60);

  return `${Math.max(1, minutes)} хв`;
}

export function presentProblemQuestTurnIn(result: Exclude<ProblemQuestTurnInLookupResult, { state: "no-character" }>): string {
  if (result.state === "branch-complete") {
    return [
      "🍺 <b>Корчмар перегортає останню сторінку</b>",
      presentCharacterHeader(result.character),
      "",
      "Ця гілка проблем поки закрита. Девʼяносто три проблеми — це вже не список, а меблі.",
      "",
      "Далі Корчмар радить шукати інші справи й інших підозрілих людей. Не все ж йому одному рахувати."
    ].join("\n");
  }

  if (result.state === "not-ready") {
    return [
      "🍺 <b>Корчмар звіряє журнал</b>",
      presentCharacterHeader(result.character),
      "",
      `<i>${escapeHtml(result.progress.title)}</i>: ${result.progress.wins}/${result.progress.target}.`,
      "",
      "Проблем ще замало для офіційного шуму. Корчмар радить розвʼязати ще кілька через /fight."
    ].join("\n");
  }

  const lines = [
    "🍺 <b>Корчмар приймає справу</b>",
    presentCharacterHeader(result.character),
    "",
    `<i>${escapeHtml(result.result.stage.title)}</i> закрито. Корчмар ставить печатку так, ніби вона сама просила.`,
    "",
    presentRewardAmount({ ...result.result.reward, label: "Нагорода за справу" }),
    ...presentItemGrantBlock(result.result.reward.itemGrants)
  ];

  if (result.result.state === "already-claimed") {
    lines.push("", "Цю винагороду вже видали. Корчмар показує запис, а не відкриває касу вдруге.");
  }

  if (result.result.nextStage) {
    lines.push(
      "",
      `Корчмар дістає наступний папірець: <i>${escapeHtml(result.result.nextStage.title)}</i>. Якщо беретеся — хай відкриє новий лічильник.`
    );
  } else {
    lines.push(
      "",
      "На цьому Корчмарський список поки закінчується. Далі проблему має підхопити хтось інший, бо навіть Корчмарю іноді треба мовчки дивитися в кухоль."
    );
  }

  return lines.join("\n");
}

export function presentProblemQuestIssueNext(
  result: Exclude<ProblemQuestIssueNextLookupResult, { state: "no-character" }>
): string {
  if (result.state === "branch-complete") {
    return [
      "🍺 <b>Корчмар ховає чисті бланки</b>",
      presentCharacterHeader(result.character),
      "",
      "Ця гілка проблем поки закрита. Далі навіть журнал робить вигляд, що йому треба перерва."
    ].join("\n");
  }

  if (result.state === "not-available") {
    return [
      "🍺 <b>Корчмар притримує папірець</b>",
      presentCharacterHeader(result.character),
      "",
      `<i>${escapeHtml(result.progress.title)}</i>: ${result.progress.wins}/${result.progress.target}.`,
      "",
      result.progress.rewardClaimed
        ? "Наступної справи тут не видно. Можливо, вона вже втекла в архів."
        : "Спершу здайте поточну справу, тоді Корчмар дістане наступну."
    ].join("\n");
  }

  return [
    "🍺 <b>Корчмар відкриває нову справу</b>",
    presentCharacterHeader(result.character),
    "",
    presentProblemQuestIssueLine(result),
    "",
    result.issued === "already-issued"
      ? "Цей папірець уже лежав у журналі. Корчмар просто постукав по ньому для драматичного ефекту."
      : "Корчмар ставить чисту риску й робить вигляд, що це оптимізм."
  ].join("\n");
}

function presentProblemQuestIssueLine(
  result: Extract<ProblemQuestIssueNextLookupResult, { state: "issued" }>
): string {
  const title = escapeHtml(result.nextStage.title);

  if (result.stage.id === result.nextStage.id && result.progress.wins > 0) {
    const ready = result.progress.completed
      ? " Список уже повний: можна здати справу Корчмарю."
      : "";

    return `Справу «<i>${title}</i>» видано. У старому журналі вже <b>${result.progress.wins}/${result.progress.target}</b> проблем.${ready}`;
  }

  return `Справу «<i>${title}</i>» видано. Лічильник починається з нуля, без старих подвигів у кишені.`;
}

function presentTurnSummary(summary: CombatTurnSummary): string {
  if (summary.heroOutcome === "not-enough-mana") {
    return [
      "Остання дія",
      "Мани не стало навіть на драматичний жест.",
      summary.monsterDamage > 0
        ? `Монстр скористався паузою на ${summary.monsterDamage} шкоди.`
        : "Монстр скористався паузою, але перечепився об власну впевненість."
    ].join("\n");
  }

  if (summary.heroOutcome === "skill-on-cooldown") {
    return [
      "Остання дія",
      "Навичка ще відсапується. Пригодник зробив вигляд, що так і планував.",
      summary.monsterDamage > 0
        ? `Монстр відповів на ${summary.monsterDamage} шкоди.`
        : "Монстр промахнувся й теж назвав це планом."
    ].join("\n");
  }

  if (summary.heroOutcome === "defended") {
    return [
      "Остання дія",
      "Ви стали в захист: ворогові важче влучити, а удар буде слабшим.",
      summary.monsterDamage > 0
        ? `Монстр таки дістав на ${summary.monsterDamage} шкоди.`
        : "Монстр не знайшов переконливого кута атаки.",
      summary.heroCounterDamage
        ? `Контрудар зачепив монстра на ${summary.heroCounterDamage} шкоди.`
        : ""
    ].filter(Boolean).join("\n");
  }

  if (summary.heroOutcome === "fled") {
    return ["Останній хід", "Ви вийшли з бою без переможного фанфарства."].join("\n");
  }

  if (summary.heroOutcome === "flee-failed") {
    return [
      "Останній хід",
      "Втеча не вдалася.",
      `Монстр відповів на ${summary.monsterDamage} шкоди.`
    ].join("\n");
  }

  if (summary.heroOutcome === "inactive") {
    return ["Останній хід", "Бій прострочився без героїчного підпису."].join("\n");
  }

  const action =
    summary.action === "skill"
      ? presentSkillAction(summary.skillId)
      : summary.action === "attack"
        ? "Атака"
        : "Відступ";
  const hit =
    summary.heroOutcome === "miss"
      ? `${action} не влучає.`
      : `${action} влучає${summary.critical ? " критично" : ""} на ${summary.heroDamage} шкоди.`;
  const response =
    summary.monsterDamage > 0
      ? `Монстр відповів на ${summary.monsterDamage} шкоди.`
      : summary.monsterOutcome === "miss"
        ? "Монстр промахнувся й зробив вигляд, що так і планував."
        : "";

  return ["Остання дія", hit, response].filter(Boolean).join("\n");
}

function presentSkillAction(skillId: string | undefined): string {
  const skill = getCombatSkillDisplay(skillId);

  return `Вміння ${skill.icon} <i>${escapeHtml(skill.name)}</i>`;
}

function presentBattleStartTip(character: CharacterSummary, seed: string): string | null {
  const flavor = selectCharacterFlavorLine(character, {
    placement: "raid.prep-hint",
    scene: "barrel",
    seed: `battle-start:${seed}`
  });

  return flavor ? `<i>Порада дня: ${escapeHtml(flavor.text)}</i>` : null;
}

function formatTurns(count: number): string {
  return `${count} ${pluralize(count, "хід", "ходи", "ходів")}`;
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
