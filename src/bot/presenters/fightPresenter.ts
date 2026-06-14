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

    return "Хід записано. Нагород поки немає: бойова бухгалтерія ще вчиться рахувати чесно.";
  })();

  return presentPersistentFightState({
    character: result.character,
    session: result.session,
    monsterName: result.monster?.name ?? "Невідомий монстр",
    monsterLevel: result.monster?.level ?? null,
    questProgress: result.questProgress,
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

  if (state?.status === "won") {
    lines.push(
      "",
      input.questReward
        ? "🎉 Ви перемогли. Сам бій лишається без окремої оплати, зате список корчмаря нарешті розщедрився."
        : "🎉 Ви перемогли. За сам бій поки не платять, але корчмар уважно рахує проблеми у списку."
    );
  } else if (state?.status === "lost") {
    lines.push(
      "",
      "💤 Ви програли. Корчмар каже, що це «цінні дані для балансу».",
      "Список дрібних проблем не зрушив, але зробив вигляд, що співчуває."
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
    lines.push("", "Що робимо?");
  }

  return lines.join("\n");
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
      `Прогрес справи: <b>${progress.target}/${progress.target}</b> · закрито.`
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
    return "Останній хід: мани не вистачило.";
  }

  if (summary.heroOutcome === "fled") {
    return "Останній хід: ви вийшли з бою без переможного фанфарства.";
  }

  if (summary.heroOutcome === "flee-failed") {
    return `Останній хід: втеча не вдалася, монстр відповів на ${summary.monsterDamage} шкоди.`;
  }

  if (summary.heroOutcome === "inactive") {
    return "Останній хід: бій прострочився без героїчного підпису.";
  }

  const action =
    summary.action === "skill"
      ? "вміння"
      : summary.action === "attack"
        ? "атака"
        : "відступ";
  const hit =
    summary.heroOutcome === "miss"
      ? "не влучає"
      : `влучає${summary.critical ? " критично" : ""}: ${summary.heroDamage} шкоди`;
  const response =
    summary.monsterDamage > 0
      ? ` Монстр відповів на ${summary.monsterDamage} шкоди.`
      : summary.monsterOutcome === "miss"
        ? " Монстр промахнувся й зробив вигляд, що так і планував."
        : "";

  return `Останній хід: ${action} ${hit}.${response}`;
}
