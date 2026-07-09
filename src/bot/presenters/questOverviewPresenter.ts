import { BARREL_BEER_TUTORIAL_TITLE } from "../../services/barrelBeerTutorialService";
import {
  BESTIARY_MIN_LEVEL,
  FIGHTING_CORNER_MIN_LEVEL,
  STARTER_ACTIVITY_MAX_LEVEL,
  meetsActivityLevel
} from "../../domain/progression/activityGates";
import { makeDailyKorchmaRoundOverviewCallbackData } from "../callbacks/dailyKorchmaRoundCallbackData";
import { makePlaceCallbackData } from "../callbacks/placeCallbackData";
import { makeQuestCallbackData } from "../callbacks/questCallbackData";
import { makeTavernCallbackData } from "../callbacks/tavernCallbackData";
import type { QuestHubSnapshot } from "./questHubPresenter";
import { escapeHtml } from "./telegramHtml";
import { presentYegerQuestTitle } from "./yegerQuestTitle";

export type QuestOverviewPriority = "claimable" | "active" | "available" | "locked" | "completed";

export interface QuestOverviewRoute {
  label: string;
  callbackData: string;
}

export interface QuestOverviewRow {
  id: string;
  priority: QuestOverviewPriority;
  title: string;
  body: string;
  route?: QuestOverviewRoute;
}

interface RankedQuestOverviewRow extends QuestOverviewRow {
  order: number;
}

const PRIORITY_RANK: Record<QuestOverviewPriority, number> = {
  claimable: 0,
  active: 1,
  available: 2,
  locked: 3,
  completed: 4
};

const MAX_OVERVIEW_ROWS = 8;

export function presentQuestOverview(snapshot: QuestHubSnapshot): string {
  const rows = buildQuestOverviewRows(snapshot);
  const body = rows.length > 0
    ? rows.flatMap((row) => [`${row.title}`, row.body, ""]).slice(0, -1)
    : ["Справи зараз удають меблі. Навіть журнал тихо закрив обкладинку."];

  return [
    "🗺️ <b>Квести</b>",
    "",
    "Стіл зі справами, Єгерський куток і кілька дрібних катастроф дивляться на вас по черзі.",
    "",
    ...body,
    "",
    snapshot.character.level >= BESTIARY_MIN_LEVEL
      ? "Оберіть напрямок нижче. Журнал тільки показує дороги, а не завершує справи за вас."
      : "Оберіть напрямок нижче. Журнал не чіпає нагороди, бо має інстинкт самозбереження."
  ].join("\n");
}

export function buildQuestOverviewRows(snapshot: QuestHubSnapshot): QuestOverviewRow[] {
  const rows: RankedQuestOverviewRow[] = [];
  let order = 0;
  const add = (row: QuestOverviewRow | null): void => {
    if (row) {
      rows.push({ ...row, order });
      order += 1;
    }
  };

  add(getDailyKorchmaRoundOverviewRow(snapshot));
  add(getProblemQuestOverviewRow(snapshot));
  add(getAdventureOverviewRow(snapshot));
  add(getStarterAdventureOverviewRow(snapshot));
  add(getStarterFightOverviewRow(snapshot));
  add(getCellarOverviewRow(snapshot));
  add(getYegerOverviewRow(snapshot));
  add(getBarrelBeerTutorialOverviewRow(snapshot));
  add(getCharkokovalniaOverviewRow(snapshot));

  return rows
    .sort((left, right) => PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority] || left.order - right.order)
    .slice(0, MAX_OVERVIEW_ROWS)
    .map(stripOverviewOrder);
}

function stripOverviewOrder(row: RankedQuestOverviewRow): QuestOverviewRow {
  const overviewRow = {
    id: row.id,
    title: row.title,
    body: row.body,
    priority: row.priority
  };

  return row.route ? { ...overviewRow, route: row.route } : overviewRow;
}

function getDailyKorchmaRoundOverviewRow(snapshot: QuestHubSnapshot): QuestOverviewRow | null {
  const daily = snapshot.dailyKorchmaRound;
  const title = "🧾 <b>Корчмарський обхід</b>";

  if (!daily) {
    return null;
  }

  if (daily.state === "level-locked") {
    return {
      id: "daily-korchma-round",
      priority: "locked",
      title: `${title} — з ${daily.requiredLevel} рівня`,
      body: "Книга вже має список дрібниць, але ще не довіряє вашим підписам."
    };
  }

  if (daily.state === "hp-blocked") {
    return {
      id: "daily-korchma-round",
      priority: "locked",
      title: `${title} — пауза`,
      body: "Спершу відновіть хоча б 1 HP. Корчмар не видає обхід тим, хто тримається на репутації."
    };
  }

  if (daily.state === "active-fight") {
    return {
      id: "daily-korchma-round",
      priority: "locked",
      title: `${title} — бій попереду журналу`,
      body: "Спершу завершіть сутичку. Книга не любить, коли її плямують бойовою логікою."
    };
  }

  if (daily.state === "pending-barrel") {
    return {
      id: "daily-korchma-round",
      priority: "locked",
      title: `${title} — Бочка тримає чергу`,
      body: "Поки Бочка ревнує до розкладу, обхід чемно чекає збоку."
    };
  }

  if (daily.state === "not-issued") {
    return {
      id: "daily-korchma-round",
      priority: "available",
      title: `${title} — доступно`,
      body: "Список дрібних катастроф ще не вручено. Це найкращий його стан.",
      route: {
        label: "🧾 До обходу",
        callbackData: makeDailyKorchmaRoundOverviewCallbackData(daily.dayToken)
      }
    };
  }

  const completed = daily.offer.completedSceneIds.length;
  const total = daily.offer.requiredSteps;

  if (daily.state === "turn-in-ready") {
    return {
      id: "daily-korchma-round",
      priority: "claimable",
      title: `${title} — ${completed}/${total}`,
      body: "Дві дрібниці в журналі. Корчмар чекає так, ніби це він усе виніс на плечах.",
      route: {
        label: "🧾 До обходу",
        callbackData: makeDailyKorchmaRoundOverviewCallbackData(daily.offer.dayToken)
      }
    };
  }

  if (daily.state === "completed") {
    return {
      id: "daily-korchma-round",
      priority: "completed",
      title: `${title} — виконано`,
      body: "Сьогодні Книга вже закрилась і робить вигляд, що не підглядала."
    };
  }

  return {
    id: "daily-korchma-round",
    priority: "active",
    title: `${title} — ${completed}/${total}`,
    body: "Ще одна дрібниця — і Книга перестане дивитися осудливо.",
    route: {
      label: "🧾 До обходу",
      callbackData: makeDailyKorchmaRoundOverviewCallbackData(daily.offer.dayToken)
    }
  };
}

function getAdventureOverviewRow(snapshot: QuestHubSnapshot): QuestOverviewRow | null {
  const adventure = snapshot.adventure;
  const title = "📋 <b>Три справи</b>";

  if (adventure.state === "ready") {
    return {
      id: "adventure",
      priority: "available",
      title: `${title} — доступно`,
      body: "Методи тепер різні: безпечне спокійніше, ризиковане щедріше.",
      route: {
        label: "📋 До Трьох справ",
        callbackData: makeQuestCallbackData("adventure")
      }
    };
  }

  if (adventure.state === "active-fight" || adventure.state === "combat-blocked") {
    return {
      id: "adventure",
      priority: "locked",
      title: `${title} — бій триває`,
      body: "Спершу завершіть поточну сутичку. Папірці не люблять паралельного героїзму."
    };
  }

  if (adventure.state === "already-completed") {
    return {
      id: "adventure",
      priority: "completed",
      title: `${title} — виконано`,
      body: "Сьогоднішній вибір уже записано. Стіл прикидається, що не хоче продовження."
    };
  }

  if (snapshot.character.level <= STARTER_ACTIVITY_MAX_LEVEL && snapshot.starterAdventure?.state === "ready") {
    return null;
  }

  return {
    id: "adventure",
    priority: "locked",
    title: `${title} — з ${adventure.requiredLevel} рівня`,
    body: "Корчмар тримає серйозніші папери вище, щоб вони самі не втекли."
  };
}

function getStarterAdventureOverviewRow(snapshot: QuestHubSnapshot): QuestOverviewRow | null {
  const starter = snapshot.starterAdventure;

  if (!starter) {
    return null;
  }

  if (starter.state === "ready") {
    return {
      id: "starter-adventure",
      priority: "available",
      title: "🌯 <b>Підозріла шаурма</b> — готова",
      body: "Перша підозра лежить на столі й пахне вступним протоколом.",
      route: {
        label: "📋 До Столу зі справами",
        callbackData: makeQuestCallbackData("list")
      }
    };
  }

  if (starter.state === "already-completed") {
    return {
      id: "starter-adventure",
      priority: "completed",
      title: "🌯 <b>Підозріла шаурма</b> — виконано",
      body: "Соус лишився в журналі як свідок із дуже впевненою плямою."
    };
  }

  return {
    id: "starter-adventure",
    priority: "completed",
    title: "🌯 <b>Підозріла шаурма</b> — новачкова справа",
    body: `Працює до ${starter.maxLevel} рівня. Далі стіл видає доросліші підозри.`
  };
}

function getStarterFightOverviewRow(snapshot: QuestHubSnapshot): QuestOverviewRow | null {
  const fight = snapshot.starterFight;

  if (!fight) {
    return null;
  }

  if (fight.state === "ready") {
    return {
      id: "starter-fight",
      priority: "available",
      title: "⚔️ <b>Новачкова сутичка</b> — готова",
      body: "Перший бій чекає біля столу й удає, що це просто знайомство.",
      route: {
        label: "📋 До Столу зі справами",
        callbackData: makeQuestCallbackData("list")
      }
    };
  }

  if (fight.state === "already-completed") {
    return {
      id: "starter-fight",
      priority: "completed",
      title: "⚔️ <b>Новачкова сутичка</b> — виконано",
      body: "Перший висновок вижив у журналі. Це вже щось."
    };
  }

  if (fight.state === "level-retired") {
    return {
      id: "starter-fight",
      priority: "completed",
      title: "⚔️ <b>Новачкова сутичка</b> — новачкова",
      body: `Працює до ${fight.maxLevel} рівня. Далі Низ дивиться значно професійніше.`
    };
  }

  return null;
}

function getProblemQuestOverviewRow(snapshot: QuestHubSnapshot): QuestOverviewRow | null {
  const progress = snapshot.problemQuest;
  const title = `🧾 <b>${escapeHtml(progress.title)}</b>`;

  if (!meetsActivityLevel(snapshot.character.level, FIGHTING_CORNER_MIN_LEVEL)) {
    return {
      id: "problem-quest",
      priority: "locked",
      title: `${title} — з ${FIGHTING_CORNER_MIN_LEVEL} рівня`,
      body: "Корчмар має папірці, але ще не впевнений, що ви переживете їхній почерк."
    };
  }

  if (progress.branchComplete) {
    return {
      id: "problem-quest",
      priority: "completed",
      title: `${title} — гілку закрито`,
      body: "Корчмар тимчасово робить вигляд, що не вміє рахувати далі."
    };
  }

  if (progress.completed && !progress.rewardClaimed) {
    return {
      id: "problem-quest",
      priority: "claimable",
      title: `${title} — ${progress.wins}/${progress.target}`,
      body: "Проблеми записано. Корчмар чекає в шинку з печаткою й підозрою.",
      route: {
        label: "🧾 До Корчмаря",
        callbackData: makePlaceCallbackData("bar")
      }
    };
  }

  if (!progress.issued) {
    return {
      id: "problem-quest",
      priority: "available",
      title: `${title} — доступно`,
      body: "Новий папірець лежить у шинку й намагається виглядати офіційно.",
      route: {
        label: "🧾 До Корчмаря",
        callbackData: makePlaceCallbackData("bar")
      }
    };
  }

  return {
    id: "problem-quest",
    priority: "active",
    title: `${title} — ${progress.wins}/${progress.target}`,
    body: progress.completed
      ? "Справу здано. Корчмар має наступний папірець і вираз службового натхнення."
      : "Низ має проблеми, а журнал має клітинки. Це підозріло зручно.",
    route: {
      label: progress.completed ? "🧾 До Корчмаря" : "🪜 До Низу",
      callbackData: progress.completed ? makePlaceCallbackData("bar") : makePlaceCallbackData("deep")
    }
  };
}

function getCellarOverviewRow(snapshot: QuestHubSnapshot): QuestOverviewRow | null {
  const cellar = snapshot.cellar;

  if (cellar.state === "level-locked") {
    return {
      id: "cellar",
      priority: "locked",
      title: `🐭 <b>Льохова справа</b> — з ${cellar.requiredLevel} рівня`,
      body: "Миша ще не готова приймати аргументи від настільки свіжих пригодників."
    };
  }

  if (cellar.state === "ready") {
    return {
      id: "cellar",
      priority: "available",
      title: "🐭 <b>Льохова справа</b> — готова",
      body: "Вона знову має позицію, крихти й юридичну інтонацію.",
      route: {
        label: "🐭 До льоху",
        callbackData: makeQuestCallbackData("cellar")
      }
    };
  }

  if (cellar.state === "on-cooldown") {
    return {
      id: "cellar",
      priority: "locked",
      title: "🐭 <b>Льохова справа</b> — пауза",
      body: `Миша радиться з крихтами ще ${formatCooldown(cellar.availableAt, cellar.now)}.`,
      route: {
        label: "🐭 До льоху",
        callbackData: makeQuestCallbackData("cellar")
      }
    };
  }

  const grownup = snapshot.cellarGrownup;

  if (grownup?.state === "completed") {
    return {
      id: "cellar-grownup",
      priority: "completed",
      title: "🐭 <b>Справа не до миші</b> — виконано",
      body: "Дорослу льохову справу закрито. Пляшка в журналі поводиться пристойно."
    };
  }

  if (grownup?.state === "bottle-obtained") {
    return {
      id: "cellar-grownup",
      priority: "claimable",
      title: "🐭 <b>Справа не до миші</b> — пляшка з вами",
      body: "Корчмар чекає в шинку. Пляшка робить вигляд, що це вона веде переговори.",
      route: {
        label: "🧾 До Корчмаря",
        callbackData: makePlaceCallbackData("bar")
      }
    };
  }

  if (grownup) {
    return {
      id: "cellar-grownup",
      priority: grownup.state === "roleplay-cooldown" ? "locked" : "available",
      title: "🐭 <b>Справа не до миші</b> — доступно",
      body: grownup.state === "roleplay-cooldown"
        ? `Льохова дипломатія відсапується ще ${formatCooldown(grownup.availableAt, grownup.now)}.`
        : "У льосі є інша справа для старших пригодників, і вона тримає інтонацію.",
      route: {
        label: "🐭 До льоху",
        callbackData: makeQuestCallbackData("cellar")
      }
    };
  }

  return {
    id: "cellar",
    priority: "completed",
    title: "🐭 <b>Льохова справа</b> — новачкова",
    body: `Працює до ${cellar.maxLevel} рівня. Далі миша вимагає доросліший протокол.`
  };
}

function getYegerOverviewRow(snapshot: QuestHubSnapshot): QuestOverviewRow | null {
  const yeger = snapshot.yeger;

  if (yeger.state === "level-locked") {
    return {
      id: "yeger",
      priority: "locked",
      title: `🏹 <b>Єгерська дошка</b> — з ${yeger.requiredLevel} рівня`,
      body: "Сліди вже є, але Єгер поки не дає їм юридичного статусу."
    };
  }

  if (yeger.state === "offered") {
    return {
      id: "yeger",
      priority: "available",
      title: "🏹 <b>Єгерська дошка</b> — доступно",
      body: "Єгер має роботу для тих, хто не плутає слід із мотузкою.",
      route: {
        label: "🏹 До Єгеря",
        callbackData: makeTavernCallbackData("ranger")
      }
    };
  }

  if (yeger.state === "in-progress" || yeger.state === "turn-in-ready") {
    return {
      id: "yeger",
      priority: yeger.state === "turn-in-ready" ? "claimable" : "active",
      title: `🏹 <b>${escapeHtml(presentYegerQuestTitle(yeger.progress))}</b> — ${yeger.progress.wins}/${yeger.progress.target}`,
      body: yeger.state === "turn-in-ready"
        ? "Сліди є. Єгер теж є. Хтось із них перебільшує, але дощечку можна нести."
        : "Сліди є. Єгер теж є. Журнал просить ще кілька переконливих доказів.",
      route: {
        label: "🏹 До Єгеря",
        callbackData: makeTavernCallbackData("ranger")
      }
    };
  }

  return {
    id: "yeger",
    priority: "completed",
    title: `🏹 <b>${escapeHtml(presentYegerQuestTitle(yeger.progress))}</b> — виконано`,
    body: "Єгер удає, що не пишається, але дощечка все бачила."
  };
}

function getBarrelBeerTutorialOverviewRow(snapshot: QuestHubSnapshot): QuestOverviewRow | null {
  const quest = snapshot.barrelBeerTutorial;
  const title = `🍺 <b>${escapeHtml(BARREL_BEER_TUTORIAL_TITLE)}</b>`;

  if (!quest) {
    return null;
  }

  if (quest.state === "level-locked") {
    return {
      id: "barrel-beer-tutorial",
      priority: "locked",
      title: `${title} — з ${quest.requiredLevel} рівня`,
      body: "Бочка ще робить вигляд, що новачкова піна не для вас."
    };
  }

  if (quest.state === "level-retired") {
    return {
      id: "barrel-beer-tutorial",
      priority: "completed",
      title: `${title} — новачкова`,
      body: `Працює до ${quest.maxLevel} рівня. Далі Бочка вимагає дорослішого драматизму.`
    };
  }

  if (quest.state === "completed") {
    return {
      id: "barrel-beer-tutorial",
      priority: "completed",
      title: `${title} — виконано`,
      body: "Бочка тепер робить вигляд, що так і планувала."
    };
  }

  if (quest.state === "available") {
    return {
      id: "barrel-beer-tutorial",
      priority: "available",
      title: `${title} — доступно`,
      body: "На столі лежить записка з круглим слідом від кухля.",
      route: {
        label: "📋 До Столу зі справами",
        callbackData: makeQuestCallbackData("list")
      }
    };
  }

  const route = getBarrelBeerTutorialRoute(quest.progress);

  return {
    id: "barrel-beer-tutorial",
    priority: quest.state === "turn-in-ready" ? "claimable" : "active",
    title: `${title} — ${quest.state === "turn-in-ready" ? "готово здати" : "триває"}`,
    body: getBarrelBeerTutorialBody(quest.progress, quest.state === "turn-in-ready"),
    route
  };
}

function getCharkokovalniaOverviewRow(snapshot: QuestHubSnapshot): QuestOverviewRow | null {
  if (snapshot.itemUpgrades?.state !== "unlock-required") {
    return null;
  }

  return {
    id: "charkokovalnia",
    priority: "available",
    title: "✨ <b>Доступ до Чароковальні</b> — доступно",
    body: "Ельф-маг у задвірку кличе до справи й обіцяє офіційні суперечки манаток.",
    route: {
      label: "✨ До задвірка",
      callbackData: makePlaceCallbackData("yard")
    }
  };
}

function getBarrelBeerTutorialRoute(progress: { visitedBarrel: boolean; raidCompleted: boolean; beerRoundOffered: boolean; beerDrunk: boolean; activeBeer: boolean }): QuestOverviewRoute {
  if (!progress.visitedBarrel || !progress.raidCompleted) {
    return {
      label: "🍺 До бочки",
      callbackData: makePlaceCallbackData("barrel")
    };
  }

  if (!progress.beerRoundOffered || !progress.beerDrunk || !progress.activeBeer) {
    return {
      label: "🍻 До шинку",
      callbackData: makePlaceCallbackData("bar")
    };
  }

  return {
    label: "📋 До Столу зі справами",
    callbackData: makeQuestCallbackData("list")
  };
}

function getBarrelBeerTutorialBody(
  progress: { visitedBarrel: boolean; raidCompleted: boolean; beerRoundOffered: boolean; beerDrunk: boolean; activeBeer: boolean },
  ready: boolean
): string {
  if (ready) {
    return "Піна ще тримається. Стіл чекає повернення з Бочки.";
  }

  if (!progress.visitedBarrel) {
    return "Бочка сама себе не знайде, хоч і поводиться так, ніби вже знайшла вас.";
  }

  if (!progress.raidCompleted) {
    return "Ви біля Бочки. Для початку потрібна місцева новачкова колотнеча.";
  }

  if (!progress.beerRoundOffered || !progress.beerDrunk) {
    return "Рейд позаду. Тепер шинок чекає на пінну формальність.";
  }

  return "Пивна відвага має бути активною, інакше журнал почне тверезіти.";
}

function formatCooldown(availableAt: Date, now: Date): string {
  const remainingMs = Math.max(0, availableAt.getTime() - now.getTime());
  const minutes = Math.max(1, Math.ceil(remainingMs / 60_000));

  return `${minutes} ${pluralize(minutes, "хвилину", "хвилини", "хвилин")}`;
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
