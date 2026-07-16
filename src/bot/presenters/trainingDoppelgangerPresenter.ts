import {
  buildDoppelgangerCounterFlavor,
  selectDoppelgangerLine,
  type CombatState,
  type CombatTurnLogEntry,
  type CombatTurnSummary
} from "../../domain/combat";
import type {
  TrainingDoppelgangerLookupResult,
  TrainingDoppelgangerSnapshotResult,
  TrainingDoppelgangerTurnResult
} from "../../services/trainingDoppelgangerService";
import { selectCharacterFlavorLine } from "../../content/characterFlavor";
import { getCombatSkillDisplay } from "../../services/fightService";
import { presentLevelUpCelebration } from "./levelGrowthPresenter";
import { presentRewardAmount } from "./rewardPresenter";
import { escapeHtml, presentCharacterHeader } from "./telegramHtml";
import {
  presentActiveVarenykSatedCombatState,
  presentVarenykSatedJournalRecovery
} from "./varenykSatedPresenter";

export function presentTrainingDoppelgangerNoCharacter(): string {
  return "Спершу створіть пригодника через /start. Допельґанґер не копіює порожні анкети.";
}

export function presentTrainingDoppelgangerAtShynok(): string {
  return [
    "🥊 <b>Бійцівський куток</b>",
    "",
    "Сумлінного Допельґанґера зараз тут немає. У Шинку підозріло дзвенять кості.",
    "",
    "Тренування з ним тут поки не починаються. Спробуйте зазирнути до 🎲 Кості й покер."
  ].join("\n");
}

export function presentTrainingDoppelgangerNeedsRest(
  result: Extract<TrainingDoppelgangerLookupResult, { state: "needs-rest" }>
): string {
  return [
    "🥊 <b>Бійцівський куток</b>",
    presentCharacterHeader(result.character),
    "",
    "Сумлінний Допельґанґер чемно розминається, але герой тримається на чесному слові.",
    "",
    "Спершу віддихайтеся. Тренування не має починатися з інструкції «підберіть себе з підлоги»."
  ].join("\n");
}

export function presentTrainingDoppelgangerLevelGate(result: {
  character: Extract<TrainingDoppelgangerLookupResult, { state: "level-gated" }>["character"];
  minLevel: number;
}): string {
  return [
    "🥊 <b>Бійцівський куток ще не підписав вашу довідку</b>",
    presentCharacterHeader(result.character),
    "",
    `Сумлінний Допельґанґер уже намагається скопіювати героя, але Корчмар забрав дзеркало до ${result.minLevel} рівня.`,
    "",
    `Поверніться з <b>${result.minLevel} рівня</b>. До того — шаурма, льох і малі неприємності без юридично складного самопобиття.`
  ].join("\n");
}

export function presentTrainingDoppelgangerCooldown(
  result: Extract<TrainingDoppelgangerLookupResult, { state: "on-cooldown" }>
): string {
  return [
    "🥊 <b>Бійцівський куток</b>",
    presentCharacterHeader(result.character),
    "",
    "Сумлінний Допельґанґер зараз відновлюється після попередньої науки.",
    "",
    `Поверніться через <b>${formatTrainingCooldown(result.availableAt, result.now)}</b>.`,
    "Корчмар каже, що навіть копії мають право на пластир."
  ].join("\n");
}

export function presentTrainingDoppelgangerStartChoice(
  result: Extract<TrainingDoppelgangerLookupResult, { state: "ready" }>
): string {
  return [
    "🥊 <b>Бійцівський куток</b>",
    presentCharacterHeader(result.character),
    "",
    "Сумлінний Допельґанґер тримає дзеркало під таким кутом, що воно вже має власну думку.",
    "",
    "Оберіть, кого сьогодні копіювати:",
    "",
    ...result.choices.map((choice) => `• <b>${escapeHtml(choice.title)}</b> — ${escapeHtml(choice.description)}`)
  ].join("\n");
}

export function presentTrainingDoppelgangerAnotherFight(
  result: Extract<TrainingDoppelgangerLookupResult, { state: "another-fight-active" }>
): string {
  return [
    "🥊 <b>Бійцівський куток зачекає</b>",
    presentCharacterHeader(result.character),
    "",
    "У вас уже триває інша бійка. Допельґанґер відмовляється копіювати хаос у дві зміни.",
    "",
    "Спершу завершіть активний бій."
  ].join("\n");
}

export function presentTrainingDoppelganger(
  result: Extract<TrainingDoppelgangerLookupResult, { state: "active" | "terminal" }>
): string {
  return presentTrainingDoppelgangerState({
    character: result.character,
    doppelganger: result.doppelganger,
    session: result.session,
    reward: result.state === "terminal" ? result.reward : null,
    intro:
      result.state === "terminal"
        ? "Це тренування вже завершилось. Корчма показує запис без повторного нарахування."
        : null
  });
}

export function presentTrainingDoppelgangerIntro(
  result: Extract<TrainingDoppelgangerLookupResult, { state: "active" }>
): string {
  const spawnLine = selectDoppelgangerLine({
    category: getDoppelgangerSpawnLineCategory(result.doppelganger),
    seed: result.session.id,
    targetName: result.character.name,
    doppelName: result.doppelganger.name,
    raceName: result.doppelganger.raceName,
    className: result.doppelganger.className,
    title: result.doppelganger.title,
    championPeriod: getChampionPeriodLabel(result.doppelganger.championPeriod),
    turn: result.session.state?.turn
  });

  return [
    "🥊 <b>Бійцівський куток</b>",
    presentCharacterHeader(result.character),
    "",
    escapeHtml(spawnLine.text),
    "",
    `Проти вас: <b>${escapeHtml(result.doppelganger.name)}</b> · ${escapeHtml(result.doppelganger.raceName)} · ${escapeHtml(result.doppelganger.className)} · рівень ${result.doppelganger.level}`,
    "",
    presentBattleStartTip(result.character, result.session.id)
  ].join("\n");
}

export function presentTrainingDoppelgangerTurn(
  result: Exclude<TrainingDoppelgangerTurnResult, { state: "no-character" }>
): string {
  if (result.state === "level-gated") {
    return presentTrainingDoppelgangerLevelGate(result);
  }

  if (result.state === "not-found") {
    return [
      "🥊 Тренування не знайшлося.",
      "",
      "Можливо, старий бланк уже прибрали зі стійки. Спробуйте /spar ще раз."
    ].join("\n");
  }

  const intro = (() => {
    if (result.state === "stale-turn") {
      return "Цей хід уже не перший у черзі. Корчма показує поточний стан, без повторного удару.";
    }

    if (result.state === "not-enough-mana") {
      return result.reason === "skill-on-cooldown"
        ? "Вміння ще відсапується. Копія чемно чекає справжнього ходу."
        : "Мани не стало навіть на драматичний жест. Копія записала це як навчальний матеріял без удару.";
    }

    if (result.state === "terminal") {
      return "Це тренування вже завершилось. Повторні натискання не переписують протокол.";
    }

    return null;
  })();

  return presentTrainingDoppelgangerState({
    character: result.character,
    doppelganger: result.doppelganger,
    session: result.session,
    reward: result.state === "updated" || result.state === "terminal" ? result.reward : null,
    intro
  });
}

function presentTrainingDoppelgangerState(input: {
  character: Extract<TrainingDoppelgangerLookupResult, { state: "active" }>["character"];
  doppelganger: Extract<TrainingDoppelgangerLookupResult, { state: "active" }>["doppelganger"];
  session: Extract<TrainingDoppelgangerLookupResult, { state: "active" }>["session"];
  reward?: Extract<TrainingDoppelgangerTurnResult, { state: "updated" }>["reward"];
  intro?: string | null;
}): string {
  const state = input.session.state;
  const lines = [
    state?.status === "active"
      ? `🥊 <b>Бій: ${state.turn} хід</b>`
      : "🥊 <b>Бій: завершено</b>",
    "",
    `❤️ Ви: ${state?.hero.hp ?? "?"}/${state?.hero.hpMax ?? "?"} · мана ${state?.hero.mana ?? "?"}/${state?.hero.manaMax ?? "?"}`,
    `🪞 Копія: ${state?.monster.hp ?? "?"}/${state?.monster.hpMax ?? "?"}`,
    ...(state?.varenykSated
      ? [presentActiveVarenykSatedCombatState(
          state.varenykSated
        )]
          .filter((line): line is string => line !== null)
      : [])
  ];

  if (state?.status === "active") {
    lines.push(...presentAbilityCooldowns(state.cooldowns));
  }

  if (input.intro) {
    lines.push("", input.intro);
  }

  if (state?.lastTurn) {
    lines.push("", presentTrainingTurnSummary(state.lastTurn));
    if (state.lastTurn.satedRecovery) {
      const satedRecovery = presentVarenykSatedJournalRecovery(
        state.lastTurn.satedRecovery,
        escapeHtml(input.character.name)
      );
      if (satedRecovery) {
        lines.push(satedRecovery);
      }
    }
    const flavor = presentTrainingCounterFlavor(input.character, input.doppelganger, state);

    if (flavor) {
      lines.push("", flavor);
    }
  }

  if (input.reward) {
    lines.push("", ...presentTrainingReward(input.reward, input.character));
  }

  if (state?.status === "won") {
    lines.push(
      "",
      presentTrainingWonLine(input.doppelganger),
      "Золота й манаток немає: це корчемний запис для слави, а не спосіб заробітку."
    );
  } else if (state?.status === "lost") {
    lines.push(
      "",
      presentTrainingLostLine(input.doppelganger),
      "Золота й манаток немає: це корчемний запис для слави, а не спосіб заробітку."
    );
  } else if (state?.status === "fled") {
    lines.push(
      "",
      "🏃 Ви відступили. Допельґанґер теж робить вигляд, що це була частина методики.",
      "XP за втечу немає."
    );
  } else if (state?.status === "expired") {
    lines.push(
      "",
      "⌛ Тренування видихнулося. Копія пішла звіряти протокол із дзеркалом.",
      "XP за прострочене тренування немає."
    );
  } else {
    lines.push(
      "",
      `<b>${escapeHtml(input.character.name)}</b>, що робимо?`,
      "⏳ На хід є 23 секунди. Потім Корчма поставить вас у захист."
    );
  }

  return lines.join("\n");
}

export function presentTrainingDoppelgangerJournal(
  result: Extract<TrainingDoppelgangerSnapshotResult, { state: "found" }>,
  requestedPage: number
): string {
  const log = result.session.state?.turnLog ?? [];

  if (log.length === 0) {
    return [
      "📜 <b>Журнал бою</b>",
      presentCharacterHeader(result.character),
      "",
      "У цьому тренуванні ще немає записаних ходів. Дзеркало називає це підготовчим томом."
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
    `🪞 Копія після ходу: ${entry.monster.hp}/${state?.monster.hpMax ?? "?"}`,
    "",
    presentTrainingTurnSummary(entry.summary)
  ];
  if (entry.summary.satedRecovery) {
    const satedRecovery = presentVarenykSatedJournalRecovery(
      entry.summary.satedRecovery,
      escapeHtml(result.character.name)
    );
    if (satedRecovery) {
      lines.push(satedRecovery);
    }
  }
  const notices = presentJournalTurnNotices(entry);

  if (notices.length > 0) {
    lines.push("", ...notices);
  }

  return lines.join("\n");
}

function presentJournalTurnNotices(entry: CombatTurnLogEntry): string[] {
  const satedBuff = entry.varenykSated
    ? presentActiveVarenykSatedCombatState(
        entry.varenykSated
      )
    : null;
  return [
    ...presentAbilityCooldowns(entry.cooldowns),
    ...(entry.notices ?? []).map((notice) => `🧷 ${escapeHtml(trimTerminalPunctuation(notice))}.`),
    ...(satedBuff ? [satedBuff] : [])
  ];
}

function presentTrainingReward(
  reward: NonNullable<Extract<TrainingDoppelgangerTurnResult, { state: "updated" }>["reward"]>,
  character: Extract<TrainingDoppelgangerTurnResult, { state: "updated" }>["character"]
): string[] {
  const lines = [
    presentRewardAmount({ ...reward.reward, label: "Тренувальний досвід" })
  ];
  const levelUp = reward.levelChange
    ? presentLevelUpCelebration(reward.levelChange, character.classId, {
        raceId: character.raceId,
        path: character.path
      })
    : null;

  if (reward.state !== "claimed") {
    lines.unshift("Цей результат уже занесено в журнал. Корчмар показує запис, а не додає XP вдруге.");
  }

  if (reward.availableAt) {
    lines.push(
      `Допельґанґер буде готовий знову за <b>${formatTrainingCooldown(reward.availableAt, reward.now)}</b>.`
    );
  }

  if (levelUp) {
    lines.push("", levelUp);
  }

  return lines;
}

function presentTrainingTurnSummary(summary: CombatTurnSummary): string {
  if (summary.heroOutcome === "not-enough-mana") {
    return [
      "Мани не стало навіть на драматичний жест.",
      summary.monsterDamage > 0
        ? `Копія використала паузу на ${summary.monsterDamage} шкоди.`
        : "Копія використала паузу для промаху з педагогічною впевненістю."
    ].join("\n");
  }

  if (summary.heroOutcome === "skill-on-cooldown") {
    return [
      "Навичка ще відсапується. Пригодник зробив вигляд, що це методика.",
      summary.monsterDamage > 0
        ? `Копія відповіла на ${summary.monsterDamage} шкоди.`
        : "Копія промахнулась і теж назвала це тренуванням."
    ].join("\n");
  }

  if (summary.heroOutcome === "defended") {
    return [
      "Ви стали в захист: копії важче влучити, а удар буде слабшим.",
      summary.monsterDamage > 0
        ? `Копія таки дістала на ${summary.monsterDamage} шкоди.`
        : "Копія не знайшла переконливого кута атаки.",
      summary.heroCounterDamage
        ? `Контрудар зачепив копію на ${summary.heroCounterDamage} шкоди.`
        : ""
    ].filter(Boolean).join("\n");
  }

  if (summary.heroOutcome === "fled") {
    return "Ви вийшли з тренування без переможного фанфарства.";
  }

  if (summary.heroOutcome === "flee-failed") {
    return [
      "Втеча не вдалася.",
      `Копія відповіла на ${summary.monsterDamage} шкоди.`
    ].join("\n");
  }

  if (summary.heroOutcome === "inactive") {
    return [
      "Ви не встигли обрати дію.",
      summary.monsterDamage > 0
        ? `Копія використала паузу на ${summary.monsterDamage} шкоди.`
        : "Копія використала паузу, але промахнулась із педагогічною впевненістю."
    ].join("\n");
  }

  const action =
    summary.action === "skill" || summary.action === "race"
      ? presentSkillAction(summary.skillId)
      : summary.action === "attack"
        ? "Атака"
        : "Відступ";
  const hit = presentHeroActionResult(summary, action);
  const response =
    summary.monsterDamage > 0
      ? summary.monsterAction === "skill" && summary.monsterSkillId
        ? `Копія відповіла прийомом «${escapeHtml(presentCombatSkillName(summary.monsterSkillId))}» на ${summary.monsterDamage} шкоди.`
        : `Копія відповіла на ${summary.monsterDamage} шкоди.`
      : summary.monsterOutcome === "miss"
        ? "Копія промахнулась і дуже професійно вдала, що це була демонстрація."
        : "";

  return [hit, ...presentAllyAbilityResults(summary), response].filter(Boolean).join("\n");
}

function presentSkillCooldown(cooldown: { id: string; remainingTurns: number }): string {
  const skill = getCombatSkillDisplay(cooldown.id);

  return `🫁 ${skill.icon} ${escapeHtml(skill.name)} відсапується: ще ${formatTurns(cooldown.remainingTurns)}.`;
}

function presentAbilityCooldowns(
  cooldowns: CombatState["cooldowns"] | undefined
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

function presentHeroActionResult(summary: CombatTurnSummary, action: string): string {
  const actionLead = presentHeroActionLead(action);

  if (summary.fumble) {
    return presentPlayerAbilityFumble(summary.fumble);
  }

  if (summary.enemyResults && summary.enemyResults.length > 1) {
    const results = summary.enemyResults
      .map((entry) => entry.outcome === "miss"
        ? `${escapeHtml(entry.monsterName ?? "Копія")} — повз`
        : `${escapeHtml(entry.monsterName ?? "Копія")} — ${entry.damage}`)
      .join("; ");

    return `${actionLead} зачіпає цілі: ${results}.`;
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
        ? ` Копія відновлює ${fumble.enemyHealing} HP.`
        : " Копія вже ціла, але педагогічно вдячна."
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
        const parts = [
          entry.healing ? `HP підросли на ${entry.healing}` : "",
          entry.guard ? "захист став міцнішим" : ""
        ].filter(Boolean);

        return parts.length > 0 ? `Підтримка: ${parts.join(", ")}.` : "";
      }).filter(Boolean)
    : [`Підтримка: HP підросли на ${summary.heroHealing}.`];
}

function presentTrainingCounterFlavor(
  character: Extract<TrainingDoppelgangerLookupResult, { state: "active" }>["character"],
  doppelganger: Extract<TrainingDoppelgangerLookupResult, { state: "active" }>["doppelganger"],
  state: NonNullable<Extract<TrainingDoppelgangerLookupResult, { state: "active" }>["session"]["state"]>
): string | null {
  const lastTurn = state.lastTurn;

  if (!lastTurn || lastTurn.monsterDamage <= 0) {
    return null;
  }

  const flavor = buildDoppelgangerCounterFlavor({
    actorKind: "doppelganger",
    classId: state.monster.classId ?? character.classId,
    className: state.monster.className ?? doppelganger.className ?? character.className,
    raceId: state.monster.raceId ?? character.raceId,
    raceName: state.monster.raceName ?? doppelganger.raceName ?? character.raceName,
    title: state.monster.title ?? doppelganger.title ?? character.title,
    targetName: character.name,
    doppelName: state.monster.name ?? doppelganger.name,
    seed: state.id,
    abilityName: lastTurn.monsterSkillId ? presentCombatSkillName(lastTurn.monsterSkillId) : null,
    heroHpRatio: ratio(state.hero.hp, state.hero.hpMax),
    monsterHpRatio: ratio(state.monster.hp, state.monster.hpMax),
    turn: state.turn,
    action: getMonsterCounterAction(lastTurn)
  });

  return `<i>${escapeHtml(flavor.text)}</i>`;
}

function ratio(current: number, max: number): number {
  if (max <= 0) {
    return 0;
  }

  return current / max;
}

function getDoppelgangerSpawnLineCategory(
  doppelganger: Extract<TrainingDoppelgangerLookupResult, { state: "active" }>["doppelganger"]
) {
  if (doppelganger.source === "champion-fallback") {
    return "spawn.champion" as const;
  }

  return doppelganger.spawnMode === "RANDOM_BUILD" ? "spawn.random" : "spawn.copy";
}

function presentTrainingWonLine(
  doppelganger: Extract<TrainingDoppelgangerLookupResult, { state: "active" }>["doppelganger"]
): string {
  if (doppelganger.source === "champion-fallback") {
    return "🎉 Ви перемогли чемпіонську подобу. Дзеркало робить вигляд, що саме так і планувало.";
  }

  if (doppelganger.source === "random-build") {
    return "🎉 Ви перемогли випадкового дзеркального пригодника. Це не впорядковує чужу біографію, зате добре тренує ваші рефлекси.";
  }

  return "🎉 Ви перемогли власну копію. Це не вирішує внутрішні конфлікти, але добре тренує зовнішні.";
}

function presentTrainingLostLine(
  doppelganger: Extract<TrainingDoppelgangerLookupResult, { state: "active" }>["doppelganger"]
): string {
  if (doppelganger.source === "champion-fallback") {
    return "💤 Чемпіонська подоба перемогла. Неприємно, зате дошка переможців тепер виглядає переконливіше.";
  }

  if (doppelganger.source === "random-build") {
    return "💤 Дзеркальний пригодник переміг. Неприємно, зате дуже інформативно.";
  }

  return "💤 Копія перемогла. Неприємно, зате дуже інформативно.";
}

function getChampionPeriodLabel(period: "day" | "week" | "month" | undefined): string | null {
  if (period === "day") {
    return "дня";
  }

  if (period === "week") {
    return "тижня";
  }

  if (period === "month") {
    return "місяця";
  }

  return null;
}

function getMonsterCounterAction(summary: CombatTurnSummary): "attack" | "skill" | "flee" {
  if (summary.monsterSkillId || summary.monsterAction === "skill") {
    return "skill";
  }

  if (summary.monsterAction === "attack") {
    return "attack";
  }

  return summary.action === "flee" ? "flee" : "attack";
}

function presentCombatSkillName(skillId: string): string {
  return getCombatSkillDisplay(skillId).name.toLocaleLowerCase("uk-UA");
}

function presentSkillAction(skillId: string | undefined): string {
  const skill = getCombatSkillDisplay(skillId);

  return `Вміння ${skill.icon} <i>${escapeHtml(skill.name)}</i>`;
}

function presentBattleStartTip(
  character: Extract<TrainingDoppelgangerLookupResult, { state: "active" }>["character"],
  seed: string
): string {
  const flavor = selectCharacterFlavorLine(character, {
    placement: "quest.start",
    scene: "fight",
    seed
  });

  return flavor
    ? `<i>Порада дня: ${escapeHtml(flavor.text)}</i>`
    : "<i>Порада дня: якщо дзеркало копіює ваш план, змініть хоча б вираз обличчя.</i>";
}

function trimTerminalPunctuation(value: string): string {
  return value.trim().replace(/[.!?…]+$/u, "");
}

function formatTrainingCooldown(availableAt: Date, now: Date): string {
  const remainingMs = Math.max(0, availableAt.getTime() - now.getTime());
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes <= 0) {
    return `${Math.max(1, seconds)} с`;
  }

  if (seconds === 0) {
    return `${minutes} хв`;
  }

  return `${minutes} хв ${seconds} с`;
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
