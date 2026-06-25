import { MIMIC_SHAWARMA_HP } from "../../domain/combat/combatProbe";
import type { CharacterSummary } from "../../domain/characters/characterSummary";
import {
  findThreatEscalationLine,
  getTerminalCombatTurnLogEventId,
  normalizeCombatEnemies,
  type CombatTurnLogEntry,
  type CombatTurnSummary
} from "../../domain/combat";
import type {
  FightLookupResult,
  FightResult,
  PersistentFightSnapshotResult,
  PersistentFightPreviewResult,
  ProblemQuestIssueNextLookupResult,
  ProblemQuestTurnInLookupResult,
  PersistentFightTurnResult,
  ThirteenSmallProblemsProgress
} from "../../services/fightService";
import { getCombatSkillDisplay, PERSISTENT_FIGHT_TURN_SECONDS } from "../../services/fightService";
import { selectCharacterFlavorLine } from "../../content/characterFlavor";
import { findMonsterBark } from "../../content/monsterBarks";
import { presentRewardAmount, presentRewardItemGrant } from "./rewardPresenter";
import { escapeHtml, presentCharacterHeader } from "./telegramHtml";

export interface QuestProgressAfterFightEntry {
  title: string;
  wins: number;
  target: number;
  completed?: boolean;
  readyHint?: string;
  action?: "bar" | "yeger";
  singleProblemHint?: boolean;
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
    "Спершу трохи відновіться: бій знову відчиниться, коли HP буде хоча б 1."
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
    "",
    "🚪 Прямий прохід — як є: чесний корчмарський хаос.",
    "",
    "➡️ Правий прохід — обережніше: нижчий рівень і скромніша винагорода."
  ].join("\n");
}

export function presentPersistentFightPassagePreview(
  result: Extract<PersistentFightPreviewResult, { state: "persistent-preview" }>
): string {
  const passage = getPersistentFightPassagePreviewCopy(result.originLocationId);
  const refreshLine = getPassagePreviewRefreshLine(result.refreshed);
  const monsterLevel = ` · рівень ${result.monster.level}`;
  const monsterHpLine = result.monsterHp
    ? `Поранений слід: ${result.monsterHp.current}/${result.monsterHp.max} здоров’я.`
    : null;

  return [
    `${passage.icon} <b>${escapeHtml(passage.title)}</b>`,
    presentCharacterHeader(result.character),
    "",
    ...(refreshLine ? [refreshLine, ""] : []),
    `Ви у ${passage.locative}. Попереду — <b>${escapeHtml(result.monster.name)}</b>${monsterLevel}. Увага ще не впала на вас.`,
    ...(monsterHpLine ? [monsterHpLine] : [])
  ].join("\n");
}

export function presentFightCombatBlocked(
  result: Extract<FightLookupResult, { state: "combat-blocked" }>
): string {
  return [
    "⚔️ <b>Бій уже тримає місце</b>",
    presentCharacterHeader(result.character),
    "",
    "Спершу завершіть поточну бійку. Корчма не ставить другий стіл на той самий лікоть."
  ].join("\n");
}

function getPassagePreviewRefreshLine(reason: Extract<PersistentFightPreviewResult, { state: "persistent-preview" }>["refreshed"]): string | null {
  switch (reason) {
    case "expired":
      return "Старий слід розсипався. Низ показав іншу підозрілу тінь.";
    case "missing-monster":
      return "Попередня тінь зникла з корчемного обліку. Корчма показала свіжу.";
    case "stale":
      return "Цей сувій уже не веде в бій. Ось поточний слід.";
    default:
      return null;
  }
}

function getPersistentFightPassagePreviewCopy(originLocationId: string): {
  icon: string;
  title: string;
  locative: string;
} {
  if (originLocationId.endsWith(".left")) {
    return {
      icon: "⬅️",
      title: "Лівий прохід",
      locative: "лівому проході"
    };
  }

  if (originLocationId.endsWith(".right")) {
    return {
      icon: "➡️",
      title: "Правий прохід",
      locative: "правому проході"
    };
  }

  return {
    icon: "🚪",
    title: "Прямий прохід",
    locative: "прямому проході"
  };
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

  return lines.join("\n");
}

export function presentPersistentFightIntro(
  result: Extract<FightLookupResult, { state: "persistent-active" }>
): string {
  const lines = [
    "⚔️ Бій",
    presentCharacterHeader(result.character),
    "",
    "Бій триває. Корчма тримає рахунок ходів, але поки не видає нагород."
  ];
  lines.push("", ...presentPersistentFightIntroOpponents(result));
  const threatLine = presentThreatEscalationLine(result.session.state);
  if (threatLine) {
    lines.push("", threatLine);
  }

  const startTip = presentBattleStartTip(result.character, result.session.id ?? result.session.state?.id ?? "active");
  if (startTip) {
    lines.push("", startTip);
  }

  return lines.join("\n");
}

function presentPersistentFightIntroOpponents(
  result: Extract<FightLookupResult, { state: "persistent-active" }>
): string[] {
  const state = result.session.state;
  const enemies = state?.enemies ? normalizeCombatEnemies(state) : [];

  if (enemies.length > 1) {
    return [
      "Проти вас:",
      ...enemies.map((enemy, index) => {
        const level = enemy.level ? ` · рівень ${enemy.level}` : "";
        const name =
          enemy.name ??
          (index === 0 && state?.monster.name ? state.monster.name : `Монстр ${index + 1}`);

        return `👹 ${index + 1}. <b>${escapeHtml(name)}</b>${level}`;
      })
    ];
  }

  const monsterName = result.monster?.name ?? state?.monster.name ?? "Невідомий монстр";
  const monsterLevel = result.monster?.level ?? state?.monster.level;
  const level = monsterLevel ? ` · рівень ${monsterLevel}` : "";

  return [`Проти вас: <b>${escapeHtml(monsterName)}</b>${level}`];
}

export function presentPersistentFight(
  result: Extract<FightLookupResult, { state: "persistent-active" | "persistent-terminal" }>
): string {
  return presentPersistentFightState({
    character: result.character,
    session: result.session,
    monster: result.monster,
    questProgress: result.questProgress,
    fightReward: result.state === "persistent-terminal" ? result.fightReward : null
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

  if (result.state === "needs-rest") {
    const hpMax = result.session?.state?.hero.hpMax ?? result.character.hpMax;
    const hpCurrent = result.session?.state?.hero.hp ?? result.character.hpCurrent;

    return [
      "❤️ <b>Спершу прийдіть до тями</b>",
      presentCharacterHeader(result.character),
      "",
      `Зараз HP ${hpCurrent}/${hpMax}. Корчма цінує бойовий запал, але не приймає удари з горизонтального положення.`,
      "",
      "Відновіться хоча б до 1 HP, тоді монстри знову матимуть шанс пошкодувати про знайомство."
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

    return null;
  })();

  return presentPersistentFightState({
    character: result.character,
    session: result.session,
    monster: "monster" in result ? result.monster : null,
    questProgress: result.questProgress,
    fightReward: result.state === "updated" || result.state === "terminal" ? result.fightReward : null,
    ...(intro ? { statusNote: intro } : {})
  });
}

export function presentPersistentFightSnapshot(
  result: Extract<PersistentFightSnapshotResult, { state: "found" }>
): string {
  return presentPersistentFightState({
    character: result.character,
    session: result.session,
    monster: result.monster,
    questProgress: result.questProgress,
    fightReward: result.fightReward
  });
}

export function presentPersistentFightJournal(
  result: Extract<PersistentFightSnapshotResult, { state: "found" }>,
  requestedPage: number
): string {
  const log = getPersistentFightJournalEntries(result.session.state ?? null);

  if (log.length === 0) {
    return [
      "📜 <b>Журнал бою</b>",
      presentCharacterHeader(result.character),
      "",
      "У цьому бою ще немає записаних ходів. Журнал робить вигляд, що це мінімалізм."
    ].join("\n");
  }

  const page = Math.max(0, Math.min(Math.floor(requestedPage), log.length - 1));
  const entry = log[page] ?? log[log.length - 1]!;
  const state = result.session.state;
  const lines = [
    "📜 <b>Журнал бою</b>",
    presentCharacterHeader(result.character),
    "",
    `Хід <b>${entry.turn}</b> · запис ${page + 1}/${log.length}`,
    `❤️ Ви після ходу: ${entry.hero.hp}/${state?.hero.hpMax ?? "?"} · мана ${entry.hero.mana}/${state?.hero.manaMax ?? "?"}`,
    ...presentJournalEnemyHpRows(entry, state),
    "",
    presentTurnSummary(entry.summary, { includeHeading: false })
  ];

  return lines.join("\n");
}

function presentJournalEnemyHpRows(
  entry: CombatTurnLogEntry,
  state: Extract<PersistentFightSnapshotResult, { state: "found" }>["session"]["state"] | null
): string[] {
  if (!entry.enemies || entry.enemies.length <= 1) {
    return [`👹 Монстр після ходу: ${entry.monster.hp}/${state?.monster.hpMax ?? "?"}`];
  }

  const stateEnemies = state ? normalizeCombatEnemies(state) : [];

  return entry.enemies.map((enemy, index) => {
    const stateEnemy = stateEnemies.find((candidate) => candidate.enemyId === enemy.enemyId);
    const fallbackName = index === 0 ? state?.monster.name : undefined;
    const name = presentShortMonsterName(stateEnemy?.name ?? fallbackName, `Монстр ${index + 1}`);

    return `👹 ${index + 1}. ${name} після ходу: ${enemy.hp}/${stateEnemy?.hpMax ?? "?"}`;
  });
}

function presentDefeatedEnemyLines(
  state: NonNullable<Parameters<typeof presentPersistentFightState>[0]["session"]["state"]>,
  monster?: { name: string; level: number } | null
): string[] {
  if (state.status !== "won" && (!state.lastTurn || state.lastTurn.heroDamage <= 0)) {
    return [];
  }

  const enemies = normalizeCombatEnemies(state);
  const defeated = findEnemiesDefeatedOnLastTurn(state, enemies);

  if (state.status === "won") {
    const names = defeated.length > 0 ? defeated : enemies.filter((enemy) => enemy.hp <= 0);
    const label = names.map((enemy) => presentEnemyShortLabel(enemy, monster)).join(", ");

    return label
      ? ["", `🧾 Знешкоджено: ${label}. У бойовій відомості Корчми навпроти супротивників стоїть «досить».`]
      : [];
  }

  const nextTarget = enemies.find((enemy) => enemy.hp > 0);
  if (defeated.length === 0 || !nextTarget) {
    return [];
  }

  const defeatedLabel = defeated.map((enemy) => presentEnemyShortLabel(enemy, monster)).join(", ");
  const nextTargetLabel = presentEnemyShortLabel(nextTarget, monster);

  return [
    "",
    `🧾 Знешкоджено: ${defeatedLabel}. Нова ціль — ${nextTargetLabel}; Корчма переставила табличку без голосування.`
  ];
}

function findEnemiesDefeatedOnLastTurn(
  state: NonNullable<Parameters<typeof presentPersistentFightState>[0]["session"]["state"]>,
  enemies: ReturnType<typeof normalizeCombatEnemies>
): ReturnType<typeof normalizeCombatEnemies> {
  const latest = state.turnLog?.at(-1);
  const previous = state.turnLog?.at(-2);

  if (latest?.enemies && previous?.enemies) {
    const previousHpById = new Map(previous.enemies.map((enemy) => [enemy.enemyId, enemy.hp]));

    return enemies.filter((enemy) => {
      const latestHp = latest.enemies?.find((entry) => entry.enemyId === enemy.enemyId)?.hp ?? enemy.hp;
      const previousHp = previousHpById.get(enemy.enemyId);

      return typeof previousHp === "number" && previousHp > 0 && latestHp <= 0;
    });
  }

  if (latest?.enemies) {
    const actedEnemyIds = new Set(state.lastTurn?.enemyActions?.map((entry) => entry.enemyId) ?? []);

    return enemies.filter((enemy) => {
      const latestHp = latest.enemies?.find((entry) => entry.enemyId === enemy.enemyId)?.hp ?? enemy.hp;

      return latestHp <= 0 && !actedEnemyIds.has(enemy.enemyId);
    });
  }

  if (state.status === "won" && state.monster.hp <= 0) {
    return enemies.filter((enemy, index) => index === 0 && enemy.hp <= 0);
  }

  return [];
}

function presentEnemyShortLabel(
  enemy: ReturnType<typeof normalizeCombatEnemies>[number],
  monster?: { name: string; level: number } | null
): string {
  return presentShortMonsterName(enemy.name ?? (enemy.enemyId === "enemy:1" ? monster?.name : undefined), "Монстр");
}

export function presentProblemQuestProgressAfterFight(
  progress: ThirteenSmallProblemsProgress | null,
  options: { singleProblemHint?: boolean } = {}
): string | null {
  const entry = buildProblemQuestProgressAfterFightEntry(progress, options);

  return presentQuestProgressAfterFight(entry ? [entry] : []);
}

export function buildProblemQuestProgressAfterFightEntry(
  progress: ThirteenSmallProblemsProgress | null,
  options: { singleProblemHint?: boolean } = {}
): QuestProgressAfterFightEntry | null {
  if (!progress || !progress.issued || progress.branchComplete || progress.rewardClaimed) {
    return null;
  }

  return {
    title: progress.title,
    wins: progress.wins,
    target: progress.target,
    completed: progress.completed,
    ...(options.singleProblemHint ? { singleProblemHint: true } : {}),
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

  if (entries.some((entry) => entry.singleProblemHint)) {
    lines.push(
      "",
      "Корчмар зараховує цей бій як одну проблему: у журналі один рядок, хоч зубів було більше."
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
  session: {
    id?: string;
    state: Extract<PersistentFightTurnResult, { state: "updated" }>["session"]["state"];
  };
  monster?: { name: string; level: number } | null;
  questProgress: ThirteenSmallProblemsProgress | null;
  fightReward?: Extract<PersistentFightTurnResult, { state: "updated" }>["fightReward"];
  statusNote?: string;
}): string {
  const state = input.session.state;
  const threatLine = presentThreatEscalationLine(state);
  const enemyRows = state ? presentEnemyHpRows(state, input.monster) : [`👹 Монстр: ?/?`];
  const lines = [
    state ? `⚔️ <b>Бій</b>: ${formatTurns(state.turn)}` : "⚔️ <b>Бій</b>",
    ...(threatLine ? ["", threatLine] : []),
    "",
    `❤️ Ви: ${state?.hero.hp ?? "?"}/${state?.hero.hpMax ?? "?"} · мана ${state?.hero.mana ?? "?"}/${state?.hero.manaMax ?? "?"}`,
    ...enemyRows
  ];

  if (input.statusNote) {
    lines.push("", input.statusNote);
  }

  const timeoutNotice = presentTimeoutNotice(state?.lastTurn);
  if (timeoutNotice) {
    lines.push("", timeoutNotice);
  }

  if (state?.status === "active" && state.cooldowns?.skill?.remainingTurns) {
    lines.push(presentSkillCooldown(state.cooldowns.skill));
  }

  if (state?.status === "active" && state.turn === 1 && !state.lastTurn && state.context?.cue) {
    lines.push("", `🌗 <i>${escapeHtml(state.context.cue.text)}</i>`);
  }

  if (state?.lastTurn || state?.status === "won") {
    if (state.lastTurn) {
      lines.push("", presentTurnSummary(state.lastTurn, { includeHeading: false }));
    }
    lines.push(...presentDefeatedEnemyLines(state, input.monster));
  }

  if (input.fightReward) {
    lines.push("", ...presentPersistentFightReward(input.fightReward));
  }

  if (state?.status === "won") {
    const readyQuestLine =
      input.questProgress?.completed && !input.questProgress.rewardClaimed
        ? "Корчмар уже чує, що проблем вистачило — занесіть це в шинок."
        : null;

    lines.push(
      "",
      "🎉 Ви перемогли. Проблема закрита, журнал задоволено хрумтить сторінкою."
    );

    if (readyQuestLine) {
      lines.push(readyQuestLine);
    }
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
      `<b>${escapeHtml(input.character.name)}</b>, що робимо?`
    );

    lines.push(`⏳ На хід є ${PERSISTENT_FIGHT_TURN_SECONDS} секунди. Потім Корчма поставить вас у захист.`);
  }

  return lines.join("\n");
}

function presentThreatEscalationLine(
  state: Parameters<typeof presentPersistentFightState>[0]["session"]["state"] | null | undefined
): string | null {
  const line = findThreatEscalationLine(state?.threat?.lineId);

  return line ? `⚠️ <i>${escapeHtml(line.text)}</i>` : null;
}

function getPersistentFightJournalEntries(
  state: Extract<PersistentFightTurnResult, { state: "updated" }>["session"]["state"] | null
): CombatTurnLogEntry[] {
  const entries = [...(state?.turnLog ?? [])];

  if (!state?.lastTurn || state.status === "active") {
    return entries;
  }

  const terminalEventId = getTerminalCombatTurnLogEventId(state.status);
  if (entries.some((entry) => entry.eventId === terminalEventId)) {
    return entries;
  }

  const expectedFinalTurn = Math.max(1, state.turn - 1);
  const lastLoggedEntry = entries[entries.length - 1];
  const lastLoggedTurn = lastLoggedEntry?.turn;

  if (lastLoggedTurn === expectedFinalTurn && areCombatTurnSummariesEquivalent(lastLoggedEntry?.summary, state.lastTurn)) {
    return entries;
  }

  entries.push({
    eventId: terminalEventId,
    turn: expectedFinalTurn,
    summary: state.lastTurn,
    hero: {
      hp: state.hero.hp,
      mana: state.hero.mana
    },
    monster: {
      hp: state.monster.hp
    },
    ...(state.enemies
      ? { enemies: normalizeCombatEnemies(state).map((enemy) => ({ enemyId: enemy.enemyId, hp: enemy.hp })) }
      : {})
  });

  return entries;
}

function areCombatTurnSummariesEquivalent(
  left: CombatTurnSummary | undefined,
  right: CombatTurnSummary
): boolean {
  return Boolean(left) && JSON.stringify(left) === JSON.stringify(right);
}

function presentTimeoutNotice(summary: CombatTurnSummary | undefined): string | null {
  if (summary?.debugTrace?.timeoutMode === "auto-attack") {
    return "⏱️ Попередній хід прострочено: Корчма зарахувала звичайну атаку.";
  }

  if (summary?.debugTrace?.timeoutMode === "auto-defend") {
    return "⏱️ Попередній хід прострочено: Корчма поставила вас у захист.";
  }

  if (summary?.debugTrace?.timeoutMode === "skip") {
    return "⏱️ Попередній хід прострочено: дію пропущено, а монстр не чекав.";
  }

  return null;
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

function presentTurnSummary(
  summary: CombatTurnSummary,
  options: { includeHeading?: boolean } = {}
): string {
  const heading = options.includeHeading === false ? [] : ["Остання дія"];
  const monsterResponse = presentMonsterResponse(summary);
  const enemyResponses = presentEnemyResponses(summary);

  if (summary.heroOutcome === "not-enough-mana") {
    return withMonsterBark(summary, [
      ...heading,
      "Мани не стало навіть на драматичний жест.",
      enemyResponses || monsterResponse || "Монстр скористався паузою, але перечепився об власну впевненість."
    ]);
  }

  if (summary.heroOutcome === "skill-on-cooldown") {
    return withMonsterBark(summary, [
      ...heading,
      "Навичка ще відсапується. Пригодник зробив вигляд, що так і планував.",
      enemyResponses || monsterResponse || "Монстр промахнувся й теж назвав це планом."
    ]);
  }

  if (summary.heroOutcome === "defended") {
    return withMonsterBark(summary, [
      ...heading,
      "Ви стали в захист: ворогові важче влучити, а удар буде слабшим.",
      enemyResponses || monsterResponse || "Монстр не знайшов переконливого кута атаки.",
      summary.heroCounterDamage
        ? `Контрудар зачепив монстра на ${summary.heroCounterDamage} шкоди.`
        : ""
    ].filter(Boolean));
  }

  if (summary.heroOutcome === "fled") {
    return withMonsterBark(summary, [...heading, "Ви вийшли з бою без переможного фанфарства."]);
  }

  if (summary.heroOutcome === "flee-failed") {
    return withMonsterBark(summary, [
      ...heading,
      "Втеча не вдалася.",
      presentBasicMonsterAttack(summary)
    ]);
  }

  if (summary.heroOutcome === "inactive") {
    return withMonsterBark(summary, [
      ...heading,
      "Ви не встигли обрати дію.",
      enemyResponses || monsterResponse || "Монстр скористався паузою, але не знайшов переконливого кута."
    ]);
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
    enemyResponses ||
    monsterResponse ||
    (summary.monsterOutcome === "miss"
      ? "Монстр промахнувся й зробив вигляд, що так і планував."
      : "");

  return withMonsterBark(summary, [...heading, hit, response].filter(Boolean));
}

function presentEnemyHpRows(
  state: NonNullable<Parameters<typeof presentPersistentFightState>[0]["session"]["state"]>,
  monster?: { name: string; level: number } | null
): string[] {
  const enemies = normalizeCombatEnemies(state);

  if (enemies.length <= 1) {
    return [`👹 ${presentShortMonsterName(state.monster.name ?? monster?.name, "Монстр")}: ${state.monster.hp}/${state.monster.hpMax}`];
  }

  const primaryEnemyId = enemies.find((enemy) => enemy.hp > 0)?.enemyId ?? enemies[0]?.enemyId;

  return enemies.map((enemy, index) => {
    const marker = enemy.hp > 0 && enemy.enemyId === primaryEnemyId ? " ← ціль" : "";
    const fallbackName =
      index === 0 && (state.monster.name ?? monster?.name)
        ? state.monster.name ?? monster?.name
        : `Монстр ${index + 1}`;
    const name = ` ${presentShortMonsterName(enemy.name ?? fallbackName, `Монстр ${index + 1}`)}`;

    return `👹 ${index + 1}.${name}: ${enemy.hp}/${enemy.hpMax}${marker}`;
  });
}

function presentShortMonsterName(name: string | null | undefined, fallback: string): string {
  const plainName = name?.replace(/<[^>]*>/g, "").trim() ?? "";
  const shortName = plainName.split(/[\s\-–—]+/u).find(Boolean) ?? fallback;

  return escapeHtml(shortName);
}

function presentEnemyResponses(summary: CombatTurnSummary): string {
  if (!summary.enemyActions || summary.enemyActions.length <= 1) {
    return "";
  }

  return summary.enemyActions
    .map((entry, index) => {
      const name = presentShortMonsterName(entry.monsterName, `Монстр ${index + 1}`);
      if (entry.monsterDamage > 0) {
        return `${name} діє окремо й завдає ${entry.monsterDamage} шкоди.`;
      }

      if (entry.monsterAction === "telegraph") {
        return `${name} готує неприємність і дуже пишається паузою.`;
      }

      if (entry.monsterAction === "defend") {
        return `${name} стає в захист.`;
      }

      if (entry.monsterOutcome === "miss") {
        return `${name} промахується й удає, що це був маневр.`;
      }

      return `${name} діє окремо, але шкоди цього разу не додає.`;
    })
    .join("\n");
}

function presentMonsterResponse(summary: CombatTurnSummary): string {
  if (summary.monsterAction === "telegraph" && summary.monsterTelegraphAbilityId) {
    const skill = getCombatSkillDisplay(summary.monsterTelegraphAbilityId);
    return `⚠️ Монстр готує ${skill.icon} <i>${escapeHtml(skill.name)}</i>. Захист може помʼякшити удар.`;
  }

  if (summary.monsterAction === "defend") {
    return summary.monsterEffectText || "Монстр став у захист.";
  }

  if (summary.monsterAction === "skill" && summary.monsterSkillId) {
    const skill = getCombatSkillDisplay(summary.monsterSkillId);
    const consequences = [
      ...(summary.monsterDamage > 0 ? [`завдав ${summary.monsterDamage} шкоди`] : []),
      ...(summary.monsterEffectText ? [escapeHtml(trimTerminalPunctuation(summary.monsterEffectText))] : [])
    ];

    if (consequences.length === 0) {
      return `Монстр застосував ${skill.icon} <i>${escapeHtml(skill.name)}</i> без прямої шкоди цього ходу.`;
    }

    return `Монстр застосував ${skill.icon} <i>${escapeHtml(skill.name)}</i>: ${consequences.join("; ")}.`;
  }

  if (summary.monsterDamage > 0) {
    return presentBasicMonsterAttack(summary);
  }

  return "";
}

function presentBasicMonsterAttack(summary: CombatTurnSummary): string {
  if (summary.monsterDamage <= 0) {
    return "Монстр не завдав шкоди.";
  }

  return `Монстр атакував у відповідь на ваш хід і завдав ${summary.monsterDamage} шкоди.`;
}

function presentSkillCooldown(cooldown: { id: string; remainingTurns: number }): string {
  const skill = getCombatSkillDisplay(cooldown.id);

  return `🫁 ${skill.icon} ${escapeHtml(skill.name)} відсапується: ще ${formatTurns(cooldown.remainingTurns)}.`;
}

function trimTerminalPunctuation(text: string): string {
  return text.trim().replace(/[.!?]+$/u, "");
}

function withMonsterBark(summary: CombatTurnSummary, lines: string[]): string {
  const bark = summary.monsterBarkId ? findMonsterBark(summary.monsterBarkId) : null;

  return [
    ...(bark ? [presentMonsterBarkBlockquote(bark.text), ""] : []),
    ...lines
  ].join("\n");
}

function presentMonsterBarkBlockquote(text: string): string {
  const barkText = stripOuterUkrainianQuotes(text.trim());

  return `🗣️ Монстр:\n<blockquote>${escapeHtml(barkText)}</blockquote>`;
}

function stripOuterUkrainianQuotes(text: string): string {
  return text.startsWith("«") && text.endsWith("»") ? text.slice(1, -1).trim() : text;
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
