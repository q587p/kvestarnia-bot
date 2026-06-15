import { MIMIC_SHAWARMA_HP } from "../../domain/combat/combatProbe";
import type { CharacterSummary } from "../../domain/characters/characterSummary";
import type { CombatTurnSummary } from "../../domain/combat";
import type {
  FightLookupResult,
  FightResult,
  PersistentFightTurnResult,
  ThirteenSmallProblemsProgress,
  ThirteenSmallProblemsReward
} from "../../services/fightService";
import { selectCharacterFlavorLine } from "../../content/characterFlavor";
import { presentRewardAmount, presentRewardItemGrant } from "./rewardPresenter";
import { escapeHtml, presentCharacterHeader } from "./telegramHtml";

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

  return presentPersistentFightState({
    character: result.character,
    session: result.session,
    monsterName: result.monster?.name ?? "Невідомий монстр",
    monsterLevel: result.monster?.level ?? null,
    questProgress: result.questProgress,
    fightReward: result.state === "persistent-terminal" ? result.fightReward : null,
    intro
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
      return "Мани не вистачило. Дія не витрачена, монстр теж не отримав права на додаткову драму.";
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
    questReward: result.state === "updated" ? result.questReward : null,
    intro
  });
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
  questReward?: ThirteenSmallProblemsReward | null;
  intro: string;
}): string {
  const state = input.session.state;
  const monsterLevel = input.monsterLevel ? ` · рівень ${input.monsterLevel}` : "";
  const lines = [
    "⚔️ Бій",
    presentCharacterHeader(input.character),
    "",
    input.intro,
    "",
    ...presentThirteenSmallProblemsBlock(input.questProgress),
    "",
    `Проти вас: <b>${escapeHtml(input.monsterName)}</b>${monsterLevel}`,
    "",
    `❤️ Ви: ${state?.hero.hp ?? "?"}/${state?.hero.hpMax ?? "?"} · мана ${state?.hero.mana ?? "?"}/${state?.hero.manaMax ?? "?"}`,
    `👹 Монстр: ${state?.monster.hp ?? "?"}/${state?.monster.hpMax ?? "?"}`,
    `Хід: ${state?.turn ?? "?"}`
  ];

  if (state?.lastTurn) {
    lines.push("", presentTurnSummary(state.lastTurn));
  }

  if (input.questReward) {
    lines.push("", ...presentThirteenSmallProblemsReward(input.questReward));
  }

  if (input.fightReward) {
    lines.push("", ...presentPersistentFightReward(input.fightReward));
  }

  if (state?.status === "won") {
    lines.push(
      "",
      `Після бою: ❤️ ${state.hero.hp}/${state.hero.hpMax}, 🔮 ${state.hero.mana}/${state.hero.manaMax}.`,
      "",
      input.questReward
        ? "🎉 Ви перемогли. Корчмар записав бій і список дрібних проблем теж не відвертівся."
        : "🎉 Ви перемогли. Проблема закрита, журнал задоволено хрумтить сторінкою.",
      "Наступний крок: /hero або /quest."
    );
  } else if (state?.status === "lost") {
    lines.push(
      "",
      `Після бою: ❤️ ${state.hero.hp}/${state.hero.hpMax}, 🔮 ${state.hero.mana}/${state.hero.manaMax}.`,
      "",
      "💤 Ви програли. Корчмар каже, що це «цінні дані для балансу».",
      "Список дрібних проблем не зрушив, але зробив вигляд, що співчуває.",
      "Спершу /hero, тоді новий бій."
    );
  } else if (state?.status === "fled") {
    lines.push(
      "",
      `Після бою: ❤️ ${state.hero.hp}/${state.hero.hpMax}, 🔮 ${state.hero.mana}/${state.hero.manaMax}.`,
      "",
      "🏃 Ви відступили. Тактичний вітер підтримав ваше рішення.",
      "Справу не зараховано: проблема лишилась дрібною, нахабною і живою.",
      "Спершу /hero, тоді новий бій."
    );
  } else if (state?.status === "expired") {
    lines.push(
      "",
      "⌛ Бій видихнувся. Монстр теж мав справи.",
      "Корчмар не ставить галочку за бій, який розійшовся на перерву.",
      "Спершу /hero, тоді новий бій."
    );
  } else {
    lines.push("", "Що робимо?");
  }

  return lines.join("\n");
}

function presentPersistentFightReward(
  reward: Extract<PersistentFightTurnResult, { state: "updated" }>["fightReward"]
): string[] {
  if (!reward) {
    return [];
  }

  const intro =
    reward.state === "claimed"
      ? "🎒 Корчмар підсунув малу оплату за закриту проблему."
      : reward.state === "already-claimed"
        ? "🎒 Цю винагороду вже занесли в журнал. Корчмар показує запис, а не відкриває касу вдруге."
        : "🎒 Винагорода вже видана. Корчмар перегортає журнал і показує той самий запис.";
  const lines = [
    intro,
    "",
    presentRewardAmount({ ...reward.reward, label: "Винагорода за бій" }),
    ...presentItemGrantBlock(reward.reward.itemGrants)
  ];

  if (reward.itemReplayUnavailable) {
    lines.push("", "Детальний лут уже в торбі або журналі; повторно його не перекидаємо.");
  }

  return lines;
}

function presentDuration(seconds: number): string {
  const minutes = Math.ceil(Math.max(0, seconds) / 60);

  return `${Math.max(1, minutes)} хв`;
}

function presentThirteenSmallProblemsBlock(
  progress: ThirteenSmallProblemsProgress | null
): string[] {
  if (!progress) {
    return [];
  }

  if (progress.completed) {
    return [
      "📋 <b>Тринадцять дрібних проблем</b>",
      "Перший список корчмаря закрито. Подальші бійки поки для практики, шуму й майбутньої бухгалтерії.",
      `Прогрес справи: <b>${progress.wins}/${progress.target}</b> · закрито.`
    ];
  }

  return [
    "📋 <b>Тринадцять дрібних проблем</b>",
    "Корчмар видав список. Список дивиться так, ніби сам себе не схвалює.",
    `Прогрес справи: <b>${progress.wins}/${progress.target}</b> проблем записано в журнал.`
  ];
}

function presentThirteenSmallProblemsReward(reward: ThirteenSmallProblemsReward): string[] {
  if (reward.state === "already-claimed") {
    return [
      "📋 Тринадцята проблема вже в журналі.",
      "Винагороду теж уже занесено: корчмар не дає списку двічі відкусити бюджет."
    ];
  }

  return [
    "📋 Тринадцята проблема впала. Корчмар урочисто ставить галочку, потім ще одну — для драматургії.",
    "",
    presentRewardAmount({ ...reward.reward, label: "Нагорода за справу" }),
    ...presentItemGrantBlock(reward.reward.itemGrants)
  ];
}

function presentTurnSummary(summary: CombatTurnSummary): string {
  if (summary.heroOutcome === "not-enough-mana") {
    return ["Останній хід", "Мани не вистачило."].join("\n");
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
      ? `Монстр відповів на ${summary.monsterDamage} шкоди.`
      : summary.monsterOutcome === "miss"
        ? "Монстр промахнувся й зробив вигляд, що так і планував."
        : "";

  return ["Останній хід", hit, response].filter(Boolean).join("\n");
}
