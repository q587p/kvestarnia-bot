import {
  buildDoppelgangerCounterFlavor,
  type CombatTurnSummary
} from "../../domain/combat";
import type {
  TrainingDoppelgangerLookupResult,
  TrainingDoppelgangerTurnResult
} from "../../services/trainingDoppelgangerService";
import { presentLevelUpCelebration } from "./levelGrowthPresenter";
import { presentRewardAmount } from "./rewardPresenter";
import { escapeHtml, presentCharacterHeader } from "./telegramHtml";

export function presentTrainingDoppelgangerNoCharacter(): string {
  return "Спершу створіть пригодника через /start. Допельґанґер не копіює порожні анкети.";
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
  return [
    "🥊 <b>Бійцівський куток</b>",
    presentCharacterHeader(result.character),
    "",
    "У кутку корчми стає ваша копія. Не метафорично: Корчмар уже просить не сперечатися з власним відображенням.",
    "",
    `Проти вас: <b>${escapeHtml(result.doppelganger.name)}</b> · ${escapeHtml(result.doppelganger.raceName)} · ${escapeHtml(result.doppelganger.className)} · рівень ${result.doppelganger.level}`
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
      return "Мани не вистачило. Дія не витрачена, копія не отримала безкоштовного шансу.";
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
    `❤️ Ви: ${state?.hero.hp ?? "?"}/${state?.hero.hpMax ?? "?"} · мана ${state?.hero.mana ?? "?"}/${state?.hero.manaMax ?? "?"}`,
    `🪞 Копія: ${state?.monster.hp ?? "?"}/${state?.monster.hpMax ?? "?"}`,
    `Хід: ${state?.turn ?? "?"}`
  ];

  if (input.intro) {
    lines.push("", input.intro);
  }

  if (state?.lastTurn) {
    lines.push("", presentTrainingTurnSummary(state.lastTurn));
    const flavor = presentTrainingCounterFlavor(input.character, state);

    if (flavor) {
      lines.push("", flavor);
    }
  }

  if (input.reward) {
    lines.push("", ...presentTrainingReward(input.reward, input.character.classId));
  }

  if (state?.status === "won") {
    lines.push(
      "",
      "🎉 Ви перемогли власну копію. Це не вирішує внутрішні конфлікти, але добре тренує зовнішні.",
      "Золота й манаток немає: це тренування, не фарм."
    );
  } else if (state?.status === "lost") {
    lines.push(
      "",
      "💤 Копія перемогла. Неприємно, зате дуже інформативно.",
      "Золота й манаток немає: це тренування, не фарм."
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
    lines.push("", `<b>${escapeHtml(input.character.name)}</b>, що робимо?`);
  }

  return lines.join("\n");
}

function presentTrainingReward(
  reward: NonNullable<Extract<TrainingDoppelgangerTurnResult, { state: "updated" }>["reward"]>,
  classId: string
): string[] {
  const lines = [
    presentRewardAmount({ ...reward.reward, label: "Тренувальний досвід" })
  ];
  const levelUp = reward.levelChange
    ? presentLevelUpCelebration(reward.levelChange, classId)
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
    return "Мани не вистачило.";
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
    return "Тренування прострочилось без героїчного підпису.";
  }

  const action =
    summary.action === "skill"
      ? "Вміння"
      : summary.action === "attack"
        ? "Атака"
        : "Відступ";
  const hit =
    summary.heroOutcome === "miss"
      ? `${action} не влучає.`
      : `${action} влучає${summary.critical ? " критично" : ""} на ${summary.heroDamage} шкоди.`;
  const response =
    summary.monsterDamage > 0
      ? `Копія відповіла на ${summary.monsterDamage} шкоди.`
      : summary.monsterOutcome === "miss"
        ? "Копія промахнулась і дуже професійно вдала, що це була демонстрація."
        : "";

  return [hit, response].filter(Boolean).join("\n");
}

function presentTrainingCounterFlavor(
  character: Extract<TrainingDoppelgangerLookupResult, { state: "active" }>["character"],
  state: NonNullable<Extract<TrainingDoppelgangerLookupResult, { state: "active" }>["session"]["state"]>
): string | null {
  const lastTurn = state.lastTurn;

  if (!lastTurn || lastTurn.monsterDamage <= 0) {
    return null;
  }

  const flavor = buildDoppelgangerCounterFlavor({
    actorKind: "doppelganger",
    classId: character.classId,
    raceId: character.raceId,
    title: character.title,
    heroHpRatio: ratio(state.hero.hp, state.hero.hpMax),
    monsterHpRatio: ratio(state.monster.hp, state.monster.hpMax),
    turn: state.turn,
    action: lastTurn.action
  });

  return `<i>${escapeHtml(flavor.text)}</i>`;
}

function ratio(current: number, max: number): number {
  if (max <= 0) {
    return 0;
  }

  return current / max;
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
