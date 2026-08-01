import { MIMIC_SHAWARMA_HP } from "../../domain/combat/combatProbe";
import type { CharacterSummary } from "../../domain/characters/characterSummary";
import {
  findThreatEscalationLine,
  getCombatActionAvailability,
  getCombatClassAbilityProfile,
  getCombatGearActionAvailability,
  getCombatRaceAbilityProfile,
  getTerminalCombatTurnLogEventId,
  normalizeCombatEnemies,
  presentActiveMonsterRuntimeEffectNotices,
  type CombatState,
  type CombatTurnLogEntry,
  type CombatTurnSummary
} from "../../domain/combat";
import { FIELD_KIT_ITEM_ID } from "../../domain/itemCraft";
import { getCombatMantokAbilityGrantsByIds, items } from "../../content";
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
import { presentMonsterBarkBlockquote } from "./monsterBarkPresenter";
import {
  getShortMonsterName,
  presentShortMonsterName
} from "./monsterNamePresenter";
import { presentRewardAmount, presentRewardBlock } from "./rewardPresenter";
import { escapeHtml, presentCharacterHeader } from "./telegramHtml";
import { presentBattleCombatantResourceLine } from "./battleCombatantPresenter";
import { presentBattleJournalPage } from "./battleJournalPresenter";
import {
  presentCombatActionCooldownNotice,
  presentCombatSupportEffectLine
} from "./combatActionPresenter";
import {
  presentVarenykSatedCombatEffectLines,
  presentVarenykSatedJournalRecovery
} from "./varenykSatedPresenter";
import { presentBardInspirationCombatEffectLines } from "./bardInspirationPresenter";

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
  const remaining = presentDuration(
    Math.ceil((result.availableAt.getTime() - result.now.getTime()) / 1000)
  );
  if (result.restKind === "left-passage-tier-two-discovery") {
    return [
      "🪜 <b>Сходи, яких учора не було</b>",
      "",
      "Після перемоги ви помітили прохід униз, до другого ярусу. Каміння ще тепле, пил дуже діловий, а монстри вирішили не повертатися, доки ви тут усе розглядаєте.",
      "",
      `Прохід лишатиметься на видноті ще <b>${remaining}</b>.`
    ].join("\n");
  }
  return [
    "🪜 <b>Низ просить тихіше</b>",
    "",
    "Монстри щойно взяли коротку корчемну перерву. Кажуть, без неї вони починають випадати з ролі й просити профспілку.",
    "",
    `Поверніться за <b>${remaining}</b>.`
  ].join("\n");
}

export function presentTierTwoConstruction(): string {
  return [
    "🚧 <b>Ярус II тимчасово вдає будівельний майданчик</b>",
    "",
    "За сходами тривають ремонтні роботи: стукають молотки, сперечаються кошториси й хтось дуже переконливо каже, що поручні «майже готові».",
    "",
    "Шлях відкриється в одній із наступних пригод. Поки що зачекайте й не підписуйте нічого, що простягають із темряви."
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

export function presentPersistentFightDifficultyChoice(): string {
  return [
    "🧱 <b>Ярус I: Сутерени Корчми</b>",
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
    presentActionHeading(result.action),
    "",
    `❤️ Ви: ${result.combat.playerHpPreview}/${result.combat.playerHpMaxPreview}`,
    `🌯 Мімік-шаурма: ${result.combat.enemyHpPreview}/${result.combat.enemyHpMaxPreview}`,
    "",
    ...presentOutcome(result),
    ...presentVictoryFlavor(result),
    "",
    presentRewardBlock({
      ...result.reward,
      label: "Винагорода за бій",
      itemGrants: result.reward.itemGrants.map((grant) => ({
        name: escapeHtml(grant.name),
        quantity: grant.quantity
      }))
    })
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
    "Бій починається. Корчма відкриває журнал ходів і робить вигляд, що це звичайний облік."
  ];
  const threatLines = presentThreatEscalationLines(result.session.state);
  if (threatLines.length > 0) {
    lines.push("", ...threatLines);
  }
  const remortPressureLines = presentRemortMonsterPressureLines(result.session.state);
  if (remortPressureLines.length > 0) {
    lines.push("", ...remortPressureLines);
  }
  lines.push("", ...presentPersistentFightIntroOpponents(result));

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
        ? `${presentCombatActionCooldownNotice(result.action)} Корчма показує поточний стан без зайвого удару.`
        : "Мани не стало навіть на драматичний жест. Корчма показує поточний стан без зайвого удару.";
    }

    if (result.state === "item-unavailable") {
      switch (result.reason) {
        case "not-owned":
          return "Цієї манатки в торбі вже немає. Корчма показує поточний стан без витрачання ходу.";
        case "reserved":
          return "Ця манатка вже зайнята іншою дією. Корчма показує поточний стан без витрачання ходу.";
        case "full-hp":
          return "HP уже повні. Корчма не дозволила витрачати манатку для красивого жесту.";
        case "full-mana":
          return "Мана вже повна. Корчма не дозволила переливати її через край.";
        case "full-resources":
          return "HP і мана вже повні. Манатка лишилася в торбі, а хід — за вами.";
        case "effect-unavailable":
          return "Манатці зараз нема на що подіяти. Вона лишилася в торбі, а хід не змінився.";
        case "item-on-cooldown":
          return "Ця манатка ще відсапується після минулого застосування. Корчма показує поточний стан.";
        case "item-limit-reached":
          return "Ця манатка вже зробила свою справу в цьому бою. Корчма показує поточний стан.";
        case "not-usable":
          return "Цю манатку зараз не можна застосувати в бою. Корчма показує поточний стан.";
      }
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
    ...(intro ? { statusNote: intro } : {}),
    suppressLastTurn: result.state === "item-unavailable" || result.state === "not-enough-mana"
  });
}

export function presentPersistentFightItemUnavailableNotice(
  result: Exclude<PersistentFightTurnResult, { state: "no-character" }>
): string | null {
  if (result.state !== "item-unavailable") {
    return null;
  }

  switch (result.reason) {
    case "item-limit-reached":
      return "Манатка не спрацювала: польова аптечка працює лише раз на бій.";
    case "item-on-cooldown":
      return "Манатка не спрацювала: щільний бинт ще відсапується.";
    case "full-hp":
      return "Манатка не спрацювала: HP уже повні.";
    case "full-mana":
      return "Манатка не спрацювала: мана вже повна.";
    case "full-resources":
      return "Манатка не спрацювала: HP і мана вже повні.";
    case "effect-unavailable":
      return "Манатка не спрацювала: зараз для її ефекту немає придатної цілі.";
    case "not-owned":
      return "Манатка не спрацювала: її вже немає в торбі.";
    case "reserved":
      return "Манатка не спрацювала: вона зайнята іншою дією.";
    case "not-usable":
      return "Манатка не спрацювала: у цьому бою її не застосувати.";
  }
}

export function presentPersistentFightGearUnavailableNotice(
  result: Exclude<PersistentFightTurnResult, { state: "no-character" }>
): string | null {
  if (result.state === "stale-turn") {
    return "Дія спорядження не спрацювала: цей хід уже змінився.";
  }

  if (result.state !== "not-enough-mana") {
    return null;
  }

  return result.reason === "skill-on-cooldown"
    ? "Дія спорядження не спрацювала: ще відсапується."
    : "Дія спорядження не спрацювала: мани замало.";
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
    return presentBattleJournalPage({
      title: "📜 <b>Журнал бою</b>",
      headerLines: [presentCharacterHeader(result.character)],
      emptyText: "У цьому бою ще немає записаних ходів. Журнал робить вигляд, що це мінімалізм."
    });
  }

  const page = Math.max(0, Math.min(Math.floor(requestedPage), log.length - 1));
  const entry = log[page] ?? log[log.length - 1]!;
  const state = result.session.state;
  const notices = presentJournalTurnNotices(entry);
  return presentBattleJournalPage({
    title: "📜 <b>Журнал бою</b>",
    headerLines: [presentCharacterHeader(result.character)],
    turn: entry.turn,
    page,
    totalPages: log.length,
    actorRows: [
      presentBattleCombatantResourceLine({
        icon: "❤️",
        name: "Ви",
        hp: entry.hero.hp,
        hpMax: state?.hero.hpMax ?? "?",
        mana: entry.hero.mana,
        manaMax: state?.hero.manaMax ?? "?",
        afterTurn: true
      })
    ],
    opponentRows: presentJournalEnemyHpRows(entry, state),
    actionLines: [presentTurnSummary(entry.summary, {
      includeHeading: false,
      satedRecipientHtml: escapeHtml(result.character.name)
    })],
    noticeLines: notices
  });
}

function presentJournalTurnNotices(entry: CombatTurnLogEntry): string[] {
  return [
    ...presentAbilityCooldowns(entry.cooldowns),
    ...(entry.notices ?? []).map((notice) => `🧷 ${escapeHtml(trimTerminalPunctuation(notice))}.`),
    ...presentVarenykSatedCombatEffectLines([{ sated: entry.varenykSated }]),
    ...presentBardInspirationCombatEffectLines([{ inspiration: entry.bardInspiration }])
  ];
}

function presentActiveFightEffectNotices(
  state: NonNullable<Extract<PersistentFightSnapshotResult, { state: "found" }>["session"]["state"]>
): string[] {
  const notices = normalizeCombatEnemies(state)
    .flatMap((enemy) =>
      enemy.monsterRuntime
        ? presentActiveMonsterRuntimeEffectNotices(enemy.monsterRuntime)
        : []
    )
    .map((notice) => `🧷 Ефект триває: ${escapeHtml(trimTerminalPunctuation(notice))}.`);
  const bleedNotices = Object.values(state.enemyStatuses?.enemies ?? {})
    .flatMap((status) => status.bleed ? [status.bleed] : [])
    .map((bleed) =>
      `🩸 Кровотеча триває: ${bleed.damagePerActivation} шкоди, ще ${bleed.remainingHeroActivations} активац.`
    );

  const satedNotice = presentVarenykSatedCombatEffectLines([{ sated: state.varenykSated }]);
  const inspirationNotice = presentBardInspirationCombatEffectLines([
    { inspiration: state.bardInspiration }
  ]);

  return Array.from(new Set([...notices, ...bleedNotices, ...satedNotice, ...inspirationNotice]));
}

function presentJournalEnemyHpRows(
  entry: CombatTurnLogEntry,
  state: Extract<PersistentFightSnapshotResult, { state: "found" }>["session"]["state"] | null
): string[] {
  if (!entry.enemies || entry.enemies.length <= 1) {
    return [
      presentBattleCombatantResourceLine({
        icon: "👹",
        name: "Монстр",
        hp: entry.monster.hp,
        hpMax: state?.monster.hpMax ?? "?",
        afterTurn: true
      })
    ];
  }

  const stateEnemies = state ? normalizeCombatEnemies(state) : [];

  return entry.enemies.map((enemy, index) => {
    const stateEnemy = stateEnemies.find((candidate) => candidate.enemyId === enemy.enemyId);
    const fallbackName = index === 0 ? state?.monster.name : undefined;
    const name = presentShortMonsterName(stateEnemy?.name ?? fallbackName, `Монстр ${index + 1}`);

    return presentBattleCombatantResourceLine({
      icon: "👹",
      name: `${index + 1}. ${name}`,
      hp: enemy.hp,
      hpMax: stateEnemy?.hpMax ?? "?",
      afterTurn: true,
      escapeName: false
    });
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
    const label = names.map((enemy) => presentBoldEnemyFullLabel(enemy, monster)).join(", ");

    return label
      ? ["", `🧾 Знешкоджено: ${label}. У бойовій відомості Корчми навпроти супротивників стоїть «досить».`]
      : [];
  }

  const nextTarget = enemies.find((enemy) => enemy.hp > 0);
  if (defeated.length === 0 || !nextTarget) {
    return [];
  }

  const defeatedLabel = defeated.map((enemy) => presentBoldEnemyFullLabel(enemy, monster)).join(", ");
  const nextTargetLabel = presentBoldEnemyFullLabel(nextTarget, monster);

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

function presentEnemyFullLabel(
  enemy: ReturnType<typeof normalizeCombatEnemies>[number],
  monster?: { name: string; level: number } | null
): string {
  const name = enemy.name ?? (enemy.enemyId === "enemy:1" ? monster?.name : undefined) ?? "Монстр";
  const plainName = name.replace(/<[^>]*>/g, "").trim();

  return escapeHtml(plainName || "Монстр");
}

function presentBoldEnemyFullLabel(
  enemy: ReturnType<typeof normalizeCombatEnemies>[number],
  monster?: { name: string; level: number } | null
): string {
  return `<b>${presentEnemyFullLabel(enemy, monster)}</b>`;
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

function presentActionHeading(action: "attack" | "receipt" | "flee"): string {
  if (action === "attack") {
    return "⚔️ <b>Бій</b>: ви вдарили Міміка-шаурму.";
  }

  if (action === "receipt") {
    return "⚔️ <b>Бій</b>: ви показали чек.";
  }

  return "⚔️ <b>Бій</b>: ви відступили красиво.";
}

function presentOutcome(
  result: Exclude<FightResult, { state: "no-character" | "already-completed" | "level-retired" }>
): string[] {
  const enemyReply =
    result.combat.enemyDamage > 0
      ? [`Мімік атакує у відповідь і завдає ${result.combat.enemyDamage} шкоди.`]
      : [];

  if (result.action === "attack") {
    return [
      `Мімік отримав ${result.combat.playerDamage} шкоди й задумався про карʼєру салату.`,
      ...enemyReply
    ];
  }

  if (result.action === "receipt") {
    return [
      `Мімік отримав ${result.combat.playerDamage} шкоди від формальної ввічливості.`,
      ...enemyReply
    ];
  }

  return [`${escapeHtml(result.character.name)} зберіг обличчя, нерви й підозру до лаваша.`];
}

function presentVictoryFlavor(
  result: Exclude<FightResult, { state: "no-character" | "already-completed" | "level-retired" }>
): string[] {
  if (result.combat.outcome === "flee") {
    return [];
  }

  const flavor = selectCharacterFlavorLine(result.character, {
    placement: "quest.outcome",
    scene: "fight",
    action: result.action
  });

  return ["", `🎉 Ви перемогли.${flavor ? ` ${escapeHtml(flavor.text)}` : ""}`];
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
  suppressLastTurn?: boolean;
}): string {
  const state = input.session.state;
  const enemyRows = state ? presentEnemyHpRows(state, input.monster) : [`👹 Монстр: ?/?`];
  const lines = [
    state ? `⚔️ <b>Бій</b>: ${formatBattleTurn(state.turn)}` : "⚔️ <b>Бій</b>",
    "",
    presentBattleCombatantResourceLine({
      icon: "❤️",
      name: "Ви",
      hp: state?.hero.hp ?? "?",
      hpMax: state?.hero.hpMax ?? "?",
      mana: state?.hero.mana ?? "?",
      manaMax: state?.hero.manaMax ?? "?"
    }),
    ...enemyRows
  ];
  if (input.statusNote) {
    lines.push("", input.statusNote);
  }

  const shouldShowLastTurn = !input.suppressLastTurn;
  const timeoutNotice = shouldShowLastTurn ? presentTimeoutNotice(state?.lastTurn) : null;
  if (timeoutNotice) {
    lines.push("", timeoutNotice);
  }

  if (state?.status === "active") {
    lines.push(...presentAbilityCooldowns(state.cooldowns));
    lines.push(...presentCombatItemCooldowns(state.combatItems));
    lines.push(...presentUnavailableAbilityNotices(state, input.character));
  }

  if (state?.status === "active") {
    lines.push(...presentActiveFightEffectNotices(state));
  }

  if (state?.status === "active" && state.turn === 1 && !state.lastTurn && state.context?.cue) {
    lines.push("", `🌗 <i>${escapeHtml(state.context.cue.text)}</i>`);
  }

  if ((shouldShowLastTurn && state?.lastTurn) || state?.status === "won") {
    if (shouldShowLastTurn && state.lastTurn) {
      lines.push("", presentTurnSummary(state.lastTurn, {
        includeHeading: false,
        satedRecipientHtml: escapeHtml(input.character.name)
      }));
    }
    lines.push(...presentDefeatedEnemyLines(state, input.monster));
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

  if (state?.status && state.status !== "active" && input.fightReward) {
    lines.push("", ...presentPersistentFightReward(input.fightReward));
  }

  return lines.join("\n");
}

function presentThreatEscalationLines(
  state: Parameters<typeof presentPersistentFightState>[0]["session"]["state"] | null | undefined
): string[] {
  const lines: string[] = [];
  const line = findThreatEscalationLine(state?.threat?.lineId);
  if (line) {
    lines.push(`⚠️ <i>${escapeHtml(line.text)}</i>`);
  }

  const pressureLine = presentThreatPressureLine(state);
  if (pressureLine) {
    lines.push(pressureLine);
  }

  return lines;
}

function presentThreatPressureLine(
  state: Parameters<typeof presentPersistentFightState>[0]["session"]["state"] | null | undefined
): string | null {
  const pressure = state?.threat?.pressure;
  if (!pressure || pressure.appliedSecondEnemyLevelBonus <= 0) {
    return null;
  }

  const enemy = state
    ? normalizeCombatEnemies(state).find((candidate) =>
        candidate.enemyId === pressure.boostedEnemyId || candidate.id === pressure.boostedEnemyId
      )
    : null;
  const enemyName = escapeHtml(enemy?.name ?? "Супротивник");
  const requestedLevelBonus = pressure.requestedSecondEnemyLevelBonus;
  const appliedLevelBonus = pressure.appliedSecondEnemyLevelBonus;
  const capped = pressure.boostedEnemyEffectiveLevel >= pressure.levelCap &&
    requestedLevelBonus > appliedLevelBonus;

  if (capped) {
    return `📈 <i>Натиск Низу:</i> <b>${enemyName}</b> дійшов до межі ${pressure.levelCap}; зайві рівні Корчма вперла в стелю.`;
  }

  return `📈 <i>Натиск Низу:</i> <b>${enemyName}</b> має +${appliedLevelBonus} ${formatLevelPoints(appliedLevelBonus)} — рівень ${pressure.boostedEnemyEffectiveLevel} із межі ${pressure.levelCap}; як підмога не тисне щохідно й бʼє мʼякше, доки основний ворог живий.`;
}

function formatLevelPoints(value: number): string {
  const abs = Math.abs(value);
  const mod10 = abs % 10;
  const mod100 = abs % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return "рівень";
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return "рівні";
  }

  return "рівнів";
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

function presentItemUseHealingSummary(summary: CombatTurnSummary): string {
  if (summary.heroHealing && summary.heroManaRestored) {
    return ` HP підросли на ${summary.heroHealing}, а мана — на ${summary.heroManaRestored}.`;
  }

  if (summary.heroManaRestored) {
    return ` Мана підросла на ${summary.heroManaRestored}.`;
  }

  if (!summary.heroHealing) {
    return "";
  }

  if (summary.itemId === FIELD_KIT_ITEM_ID && summary.heroHpAfter !== undefined) {
    return ` HP підтягнулись до ${summary.heroHpAfter}.`;
  }

  return ` HP підросли на ${summary.heroHealing}.`;
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

  lines.push(presentRewardBlock({
    ...reward.reward,
    label: "Винагорода за бій",
    itemGrants: reward.reward.itemGrants.map((grant) => ({
      name: escapeHtml(grant.name),
      quantity: grant.quantity
    }))
  }));

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
    presentRewardBlock({
      ...result.result.reward,
      label: "Нагорода за справу",
      itemGrants: result.result.reward.itemGrants.map((grant) => ({
        name: escapeHtml(grant.name),
        quantity: grant.quantity
      }))
    })
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
  if (result.state === "level-locked") {
    return [
      "🍺 <b>Корчмар притримує папірець</b>",
      presentCharacterHeader(result.character),
      "",
      `Цю справу можна взяти з ${result.requiredLevel} рівня. Спершу доростіть до проблем, які вже вміють рахувати до тринадцяти.`
    ].join("\n");
  }

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
  options: { includeHeading?: boolean; satedRecipientHtml?: string } = {}
): string {
  const heading = options.includeHeading === false ? [] : ["Остання дія"];
  const monsterResponse = presentMonsterResponse(summary);
  const enemyResponses = presentEnemyResponses(summary);
  const enemyPressureSkips = presentEnemyPressureSkips(summary);
  const heroEffectResponse = presentHeroEffectDamage(summary);
  const withStoredContext = (lines: string[]) =>
    withMonsterBark(summary, lines, options.satedRecipientHtml);

  if (summary.heroOutcome === "not-enough-mana") {
    return withStoredContext([
      ...heading,
      "Мани не стало навіть на драматичний жест.",
      withEnemyPressureSkips(
        enemyResponses || monsterResponse || "Монстр скористався паузою, але перечепився об власну впевненість.",
        enemyPressureSkips
      )
    ]);
  }

  if (summary.heroOutcome === "skill-on-cooldown") {
    return withStoredContext([
      ...heading,
      "Навичка ще відсапується. Пригодник зробив вигляд, що так і планував.",
      withEnemyPressureSkips(
        enemyResponses || monsterResponse || "Монстр промахнувся й теж назвав це планом.",
        enemyPressureSkips
      )
    ]);
  }

  if (summary.heroOutcome === "defended") {
    const defenseLine =
      summary.action === "skill" || summary.action === "race" || summary.action === "gear"
        ? `${presentSkillAction(summary.skillId)}: спрацьовує, ви стали в захист, ворогові важче влучити, а удар буде слабшим.`
        : "Ви стали в захист: ворогові важче влучити, а удар буде слабшим.";

    return withStoredContext([
      ...heading,
      defenseLine,
      heroEffectResponse,
      withEnemyPressureSkips(
        enemyResponses || monsterResponse || "Монстр не знайшов переконливого кута атаки.",
        enemyPressureSkips
      ),
      summary.heroCounterDamage
        ? `Контрудар зачепив монстра на ${summary.heroCounterDamage} шкоди.`
        : ""
    ].filter(Boolean));
  }

  if (summary.heroOutcome === "item-used") {
    const itemName = escapeHtml(summary.itemName ?? "манатку");
    const healing = presentItemUseHealingSummary(summary);

    return withStoredContext([
      ...heading,
      `Ви використали <b>${itemName}</b>.${healing}`,
      heroEffectResponse,
      withEnemyPressureSkips(
        enemyResponses || monsterResponse || "Монстр відреагував паузою, яка майже виглядала професійно.",
        enemyPressureSkips
      )
    ].filter(Boolean));
  }

  if (summary.heroOutcome === "fled") {
    return withStoredContext([...heading, "Ви вийшли з бою без переможного фанфарства."]);
  }

  if (summary.heroOutcome === "flee-failed") {
    return withStoredContext([
      ...heading,
      "Втеча не вдалася.",
      heroEffectResponse,
      presentBasicMonsterAttack(summary)
    ].filter(Boolean));
  }

  if (summary.heroOutcome === "inactive") {
    return withStoredContext([
      ...heading,
      "Ви не встигли обрати дію.",
      heroEffectResponse,
      withEnemyPressureSkips(
        enemyResponses || monsterResponse || "Монстр скористався паузою, але не знайшов переконливого кута.",
        enemyPressureSkips
      )
    ].filter(Boolean));
  }

  const action =
    summary.action === "skill" || summary.action === "race" || summary.action === "gear"
      ? presentSkillAction(summary.skillId)
      : summary.action === "attack"
        ? "Атака"
        : "Відступ";
  const hit = presentHeroActionResult(summary, action);
  const response =
    withEnemyPressureSkips(
      enemyResponses ||
      monsterResponse ||
      (summary.monsterOutcome === "miss"
        ? "Монстр промахнувся й зробив вигляд, що так і планував."
        : ""),
      enemyPressureSkips
    );

  return withStoredContext([
    ...heading,
    hit,
    ...presentAllyAbilityResults(summary),
    heroEffectResponse,
    response
  ].filter(Boolean));
}

function presentEnemyHpRows(
  state: NonNullable<Parameters<typeof presentPersistentFightState>[0]["session"]["state"]>,
  monster?: { name: string; level: number } | null
): string[] {
  const enemies = normalizeCombatEnemies(state);

  if (enemies.length <= 1) {
    return [
      presentBattleCombatantResourceLine({
        icon: "👹",
        name: presentShortMonsterName(state.monster.name ?? monster?.name, "Монстр"),
        hp: state.monster.hp,
        hpMax: state.monster.hpMax,
        escapeName: false
      })
    ];
  }

  const primaryEnemyId = enemies.find((enemy) => enemy.hp > 0)?.enemyId ?? enemies[0]?.enemyId;

  return enemies.map((enemy, index) => {
    const marker = enemy.hp > 0 && enemy.enemyId === primaryEnemyId ? " ← ціль" : "";
    const fallbackName =
      index === 0 && (state.monster.name ?? monster?.name)
        ? state.monster.name ?? monster?.name
        : `Монстр ${index + 1}`;
    const name = ` ${presentShortMonsterName(enemy.name ?? fallbackName, `Монстр ${index + 1}`)}`;

    return presentBattleCombatantResourceLine({
      icon: "👹",
      name: `${index + 1}.${name}`,
      hp: enemy.hp,
      hpMax: enemy.hpMax,
      targetLabel: marker ? "ціль" : undefined,
      escapeName: false
    });
  });
}

function presentRemortMonsterPressureLines(state: CombatState | null | undefined): string[] {
  const remortCount = state?.life?.remortCount ?? 0;

  const visiblePressureFreeRanks = state?.source === "yeger" ? 2 : 3;

  if (!state || remortCount <= visiblePressureFreeRanks || normalizeCombatEnemies(state).length > 1) {
    return [];
  }

  if (state.source === "adventure") {
    return [
      "🧿 Відплата за минулі пригоди: монстр бʼється з поправкою на ремортну памʼять."
    ];
  }

  const label = state.source === "yeger"
    ? "Відплата за минулі пригоди"
    : "Відлуння минулих пригод";

  return [
    `🧿 <i>${label}:</i> монстр бʼється з поправкою на ремортну памʼять.`
  ];
}

function getEnemyActionDisplayIndex(entry: NonNullable<CombatTurnSummary["enemyActions"]>[number], actionIndex: number): number {
  const match = /^enemy:(\d+)$/u.exec(entry.enemyId);
  const parsed = match ? Number.parseInt(match[1] ?? "", 10) : Number.NaN;

  return Number.isInteger(parsed) && parsed > 0 ? parsed : actionIndex + 1;
}

function presentEnemyResponses(summary: CombatTurnSummary): string {
  if (!summary.enemyActions || summary.enemyActions.length <= 1) {
    return "";
  }

  const shortNames = summary.enemyActions.map((entry, index) =>
    getShortMonsterName(entry.monsterName, `Монстр ${index + 1}`)
  );
  const shortNameCounts = shortNames.reduce((counts, name) => {
    counts.set(name, (counts.get(name) ?? 0) + 1);

    return counts;
  }, new Map<string, number>());

  return summary.enemyActions
    .map((entry, index) => {
      const shortName = shortNames[index] ?? `Монстр ${index + 1}`;
      const disambiguatedName = (shortNameCounts.get(shortName) ?? 0) > 1
        ? `${shortName} ${getEnemyActionDisplayIndex(entry, index)}`
        : shortName;
      const name = escapeHtml(disambiguatedName);
      if (entry.monsterAction === "telegraph" && entry.monsterTelegraphAbilityId) {
        const skill = getCombatSkillDisplay(entry.monsterTelegraphAbilityId);
        const signatureLine = getMonsterSignatureLine(entry.monsterTelegraphAbilityId, "telegraph");
        const telegraphText = signatureLine ?? "наступний удар буде помітно серйозніший";

        return `${name} готує ${skill.icon} <i>${escapeHtml(skill.name)}</i>: ${escapeHtml(telegraphText)}.`;
      }

      if (entry.monsterAction === "skill" && entry.monsterSkillId) {
        const skill = getCombatSkillDisplay(entry.monsterSkillId);
        const signatureLine = hasStoredMonsterSkillImpact({
          damage: entry.monsterDamage,
          effectText: entry.monsterEffectText
        })
          ? getMonsterSignatureLine(entry.monsterSkillId, "impact")
          : null;
        const consequences = [
          ...(entry.monsterDamage > 0 ? [`завдав ${entry.monsterDamage} шкоди`] : []),
          ...(signatureLine ? [signatureLine] : []),
          ...(entry.monsterEffectText ? [trimTerminalPunctuation(entry.monsterEffectText)] : [])
        ];

        return `${name} застосовує ${skill.icon} <i>${escapeHtml(skill.name)}</i>${
          consequences.length > 0 ? `: ${consequences.map(escapeHtml).join("; ")}.` : " без прямої шкоди цього ходу."
        }`;
      }

      if (entry.monsterDamage > 0) {
        return entry.simultaneousFinalResponse
          ? `${name} устиг відповісти в ту саму мить і завдав ${entry.monsterDamage} шкоди.`
          : `${name} атакує у відповідь і завдає ${entry.monsterDamage} шкоди.`;
      }

      if (entry.monsterAction === "telegraph") {
        return entry.simultaneousFinalResponse
          ? `${name} устиг відповісти в ту саму мить і готує неприємність.`
          : `${name} готує неприємність і дуже пишається паузою.`;
      }

      if (entry.monsterAction === "defend") {
        return entry.simultaneousFinalResponse
          ? `${name} устиг відповісти в ту саму мить і став у захист.`
          : `${name} стає в захист.`;
      }

      if (entry.monsterOutcome === "miss") {
        return entry.simultaneousFinalResponse
          ? `${name} устиг відповісти в ту саму мить, але промахнувся.`
          : `${name} промахується й удає, що це був маневр.`;
      }

      return entry.simultaneousFinalResponse
        ? `${name} устиг відповісти в ту саму мить, але шкоди не додав.`
        : `${name} відповідає на ваш хід, але шкоди цього разу не додає.`;
    })
    .join("\n");
}

function presentEnemyPressureSkips(summary: CombatTurnSummary): string {
  if (!summary.enemyPressureSkips || summary.enemyPressureSkips.length === 0) {
    return "";
  }

  return summary.enemyPressureSkips
    .map((entry, index) => {
      const name = escapeHtml(getShortMonsterName(entry.monsterName, `Монстр ${index + 2}`));

      return `${name} займає позицію і поки не б’є: підмога тисне через хід.`;
    })
    .join("\n");
}

function withEnemyPressureSkips(response: string, skips: string): string {
  return [response, skips].filter(Boolean).join("\n");
}

function presentMonsterResponse(summary: CombatTurnSummary): string {
  const directMonsterDamage = getDirectMonsterDamage(summary);
  const finalResponsePrefix = summary.simultaneousFinalResponse
    ? "Монстр устиг відповісти в ту саму мить.\n"
    : "";

  if (summary.monsterAction === "telegraph" && summary.monsterTelegraphAbilityId) {
    const skill = getCombatSkillDisplay(summary.monsterTelegraphAbilityId);
    const signatureLine = getMonsterSignatureLine(summary.monsterTelegraphAbilityId, "telegraph");
    return `${finalResponsePrefix}⚠️ Монстр готує ${skill.icon} <i>${escapeHtml(skill.name)}</i>. ${
      signatureLine ? escapeHtml(signatureLine) : "Захист може помʼякшити удар."
    }`;
  }

  if (summary.monsterAction === "defend") {
    return `${finalResponsePrefix}${summary.monsterEffectText || "Монстр став у захист."}`;
  }

  if (summary.monsterAction === "skill" && summary.monsterSkillId) {
    const skill = getCombatSkillDisplay(summary.monsterSkillId);
    const signatureLine = hasStoredMonsterSkillImpact({
      damage: directMonsterDamage,
      effectText: summary.monsterEffectText
    })
      ? getMonsterSignatureLine(summary.monsterSkillId, "impact")
      : null;
    const consequences = [
      ...(directMonsterDamage > 0 ? [`завдав ${directMonsterDamage} шкоди`] : []),
      ...(signatureLine ? [escapeHtml(signatureLine)] : []),
      ...(summary.monsterEffectText ? [escapeHtml(trimTerminalPunctuation(summary.monsterEffectText))] : [])
    ];

    if (consequences.length === 0) {
      return `${finalResponsePrefix}Монстр застосував ${skill.icon} <i>${escapeHtml(skill.name)}</i> без прямої шкоди цього ходу.`;
    }

    return `${finalResponsePrefix}Монстр застосував ${skill.icon} <i>${escapeHtml(skill.name)}</i>: ${consequences.join("; ")}.`;
  }

  if (directMonsterDamage > 0) {
    return `${finalResponsePrefix}${presentBasicMonsterAttack(summary)}`;
  }

  return finalResponsePrefix.trimEnd();
}

function presentBasicMonsterAttack(summary: CombatTurnSummary): string {
  const directMonsterDamage = getDirectMonsterDamage(summary);

  if (directMonsterDamage <= 0) {
    return "Монстр не завдав шкоди.";
  }

  return `Монстр атакував у відповідь на ваш хід і завдав ${directMonsterDamage} шкоди.`;
}

type MonsterSignatureLineKind = "impact" | "telegraph";

const monsterSignatureProofLines: Record<string, Partial<Record<MonsterSignatureLineKind, string>>> = {
  "monster.preapproved-bite": {
    impact: "Папери клацнули зубами: погодження виявилося гострим"
  },
  "monster.queue-number": {
    impact: "Черга посунулася не туди, і ваша точність слухняно стала в кінець"
  },
  "monster.ledger-charge": {
    impact: "Кабан вписав шкоду в обидві колонки й підкріпив це копитом",
    telegraph: "Кабан шкрябає копитом рядок для великого тарана; захист тут дуже доречний."
  },
  "monster.salted-oath": {
    impact: "Крендель затягнув обіцянку вузлом; пробити її стало незручно"
  },
  "monster.chimera-veto": {
    impact: "Одна голова химери підписала удар, друга подала окрему думку"
  },
  "monster.inventory-prophecy": {
    impact: "Пророк звірив інвентар і знайшов нестачу саме у вашій впевненості"
  },
  "monster.balance-the-tide": {
    impact: "Водяний звів приплив із відпливом; частина шкоди повернулася хвилею"
  }
};

function getMonsterSignatureLine(
  abilityId: string | undefined,
  kind: MonsterSignatureLineKind
): string | null {
  return abilityId ? monsterSignatureProofLines[abilityId]?.[kind] ?? null : null;
}

function hasStoredMonsterSkillImpact(input: { damage?: number; effectText?: string | null | undefined }): boolean {
  return (input.damage ?? 0) > 0 || Boolean(input.effectText?.trim());
}

function presentHeroEffectDamage(summary: CombatTurnSummary): string {
  const damage = getHeroEffectDamage(summary);

  return damage > 0
    ? `Накладений ефект спрацював і завдав ${damage} шкоди.`
    : "";
}

function getDirectMonsterDamage(summary: CombatTurnSummary): number {
  return Math.max(0, summary.monsterDamage - getHeroEffectDamage(summary));
}

function getHeroEffectDamage(summary: CombatTurnSummary): number {
  return Math.max(0, summary.heroEffectDamage ?? 0);
}

function presentSkillCooldown(cooldown: { id: string; remainingTurns: number }): string {
  const skill = getCombatSkillDisplay(cooldown.id);

  return `🫁 ${skill.icon} ${escapeHtml(skill.name)} відсапується: ще ${formatTurns(cooldown.remainingTurns)}.`;
}

function presentCombatItemCooldowns(
  combatItems: NonNullable<Parameters<typeof presentPersistentFightState>[0]["session"]["state"]>["combatItems"]
): string[] {
  return Object.values(combatItems?.cooldowns ?? {})
    .filter((cooldown) => cooldown.remainingTurns > 0)
    .map((cooldown) => {
      const itemName = items.find((item) => item.id === cooldown.itemId)?.name ?? "Манатка";

      return `🫁 🩹 ${escapeHtml(itemName)} відсапується: ще ${formatTurns(cooldown.remainingTurns)}.`;
    });
}

function presentAbilityCooldowns(
  cooldowns: CombatTurnLogEntry["cooldowns"] | undefined
): string[] {
  const entries: Array<{ id: string; remainingTurns: number }> = [];
  const seen = new Set<string>();

  if (cooldowns?.skill?.remainingTurns) {
    entries.push(cooldowns.skill);
    seen.add(cooldowns.skill.id);
  }

  for (const cooldown of Object.values(cooldowns?.abilities ?? {})) {
    if (cooldown.remainingTurns > 0 && !seen.has(cooldown.id)) {
      entries.push(cooldown);
      seen.add(cooldown.id);
    }
  }

  return entries.map(presentSkillCooldown);
}

function presentUnavailableAbilityNotices(
  state: NonNullable<Parameters<typeof presentPersistentFightState>[0]["session"]["state"]>,
  character: CharacterSummary
): string[] {
  const availability = getCombatActionAvailability(state, {
    classId: character.classId,
    raceId: character.raceId
  });
  const notices: string[] = [];

  if (availability.skill.available === false && availability.skill.reason === "not-enough-mana") {
    notices.push(presentNotEnoughManaAbility(getCombatClassAbilityProfile(character.classId), state.hero.mana));
  }

  if (availability.race.available === false && availability.race.reason === "not-enough-mana" && availability.race.ability) {
    notices.push(presentNotEnoughManaAbility(getCombatRaceAbilityProfile(character.raceId) ?? availability.race.ability, state.hero.mana));
  }

  const gearGrants = getCombatMantokAbilityGrantsByIds({
    grantIds: state.equipmentAbilities?.grantIds ?? [],
    characterLevel: character.level
  });
  for (const grant of gearGrants) {
    if (!grant.combat) {
      continue;
    }
    const gearAvailability = getCombatGearActionAvailability(state, grant.combat.profile);
    if (gearAvailability.available === false && gearAvailability.reason === "not-enough-mana") {
      notices.push(presentNotEnoughManaAbility(grant.combat.profile, state.hero.mana));
    }
  }

  return notices;
}

function presentNotEnoughManaAbility(
  ability: { id: string; manaCost: number },
  currentMana: number
): string {
  const skill = getCombatSkillDisplay(ability.id);

  return `🪫 ${skill.icon} ${escapeHtml(skill.name)}: треба ${ability.manaCost} мани, зараз ${currentMana}.`;
}

function presentHeroActionResult(summary: CombatTurnSummary, action: string): string {
  const actionLead = presentHeroActionLead(action);

  if (summary.fumble) {
    return presentPlayerAbilityFumble(summary.fumble);
  }

  if (summary.enemyResults && summary.enemyResults.length > 1) {
    const results = summary.enemyResults
      .map((entry) => {
        const name = escapeHtml(getShortMonsterName(entry.monsterName, "Монстр"));

        return entry.outcome === "miss"
          ? `${name} — повз`
          : `${name} — ${entry.damage}`;
      })
      .join("; ");

    return `${actionLead} зачіпає супротивників: ${results}.`;
  }

  if (summary.heroOutcome === "miss") {
    return `${actionLead} не влучає.`;
  }

  if (summary.heroDamage <= 0 && (summary.allyResults?.length ?? 0) > 0) {
    return `${actionLead} спрацьовує без прямої шкоди.`;
  }

  return `${actionLead} влучає${summary.critical ? " критично" : ""} на ${summary.heroDamage} шкоди.`;
}

function presentHeroActionLead(action: string): string {
  return action === "Атака" || action === "Відступ" ? action : `${action}:`;
}

function presentPlayerAbilityFumble(fumble: NonNullable<CombatTurnSummary["fumble"]>): string {
  const consequence =
    fumble.kind === "enemy-heal"
      ? fumble.enemyHealing && fumble.enemyHealing > 0
        ? ` Супротивник відновлює ${fumble.enemyHealing} HP.`
        : " Супротивник уже був цілий, але морально вдячний."
      : ` Ви отримуєте ${fumble.selfDamage ?? 0} шкоди.`;

  return `Критична невдача: ${escapeHtml(fumble.line)}${consequence}`;
}

function presentAllyAbilityResults(summary: CombatTurnSummary): string[] {
  const results = summary.allyResults ?? [];

  if (results.length === 0 && !summary.heroHealing) {
    return [];
  }

  return results.length > 0
    ? results.map((entry) => {
        return presentCombatSupportEffectLine(entry, {
          separator: ", ",
          showGuardAmount: false,
          guardWithoutAmountText: "захист став міцнішим"
        });
      }).filter(Boolean)
    : [presentCombatSupportEffectLine({ healing: summary.heroHealing ?? 0 })];
}

function trimTerminalPunctuation(text: string): string {
  return text.trim().replace(/[.!?]+$/u, "");
}

function withMonsterBark(
  summary: CombatTurnSummary,
  lines: string[],
  satedRecipientHtml?: string
): string {
  const bark = summary.monsterBarkId ? findMonsterBark(summary.monsterBarkId) : null;
  const satedRecovery = summary.satedRecovery && satedRecipientHtml
    ? presentVarenykSatedJournalRecovery(summary.satedRecovery, satedRecipientHtml)
    : null;

  return [
    ...(bark ? [presentMonsterBarkBlockquote(bark.text), ""] : []),
    ...lines,
    ...(satedRecovery ? [satedRecovery] : [])
  ].join("\n");
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

function formatBattleTurn(turn: number): string {
  return `${turn} хід`;
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
