import { BARREL_BEER_TUTORIAL_TITLE } from "../../services/barrelBeerTutorialService";
import {
  BESTIARY_MIN_LEVEL,
  FIGHTING_CORNER_MIN_LEVEL,
  STARTER_ACTIVITY_MAX_LEVEL,
  meetsActivityLevel
} from "../../domain/progression/activityGates";
import type { QuestHubSnapshot } from "./questHubPresenter";
import { escapeHtml } from "./telegramHtml";
import { presentYegerQuestTitle } from "./yegerQuestTitle";

export type QuestOverviewPriority = "claimable" | "active" | "available" | "locked" | "completed";

export interface QuestOverviewRow {
  id: string;
  priority: QuestOverviewPriority;
  title: string;
  body: string;
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

  if (rows.length === 0) {
    return [
      "🗺️ <b>Квести</b>",
      "",
      "Активних справ зараз немає.",
      "",
      "Нові папери, пригоди й дрібні катастрофи беруться за Столом зі справами.",
      "Журнал тільки показує вже взяте, щоб не тягнути вас за рукав."
    ].join("\n");
  }

  const body = rows.flatMap((row) => [`${row.title}`, row.body, ""]).slice(0, -1);

  return [
    "🗺️ <b>Квести</b>",
    "",
    "Стіл зі справами, Єгерський куток і кілька дрібних катастроф дивляться на вас по черзі.",
    "",
    ...body,
    "",
    snapshot.character.level >= BESTIARY_MIN_LEVEL
      ? "Нижче — шлях до столу. Журнал тільки показує дороги, а не завершує справи за вас."
      : "Нижче — шлях до столу. Журнал не чіпає нагороди, бо має інстинкт самозбереження."
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

  add(getFirstKorchmaQuestOverviewRow(snapshot));
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
    .filter(isActionableOverviewRow)
    .sort((left, right) => PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority] || left.order - right.order)
    .slice(0, MAX_OVERVIEW_ROWS)
    .map(stripOverviewOrder);
}

function getFirstKorchmaQuestOverviewRow(snapshot: QuestHubSnapshot): QuestOverviewRow | null {
  const quest = snapshot.firstKorchmaQuest;

  if (!quest || quest.state === "completed") {
    return null;
  }

  if (!quest.progress.enteredKorchma) {
    return {
      id: "first-korchma",
      priority: "active",
      title: "📋 <b>Перший крок до столу</b> — 0/2",
      body: [
        "Зроблено: персонаж уже є, і це сміливий адміністративний початок.",
        "Далі: зайдіть у Корчму.",
        "Де: натисніть «🚪 Зайти в корчму», а потім шукайте Стіл зі справами."
      ].join("\n")
    };
  }

  return {
    id: "first-korchma",
    priority: "active",
    title: "📋 <b>Перший крок до столу</b> — 1/2",
    body: [
      "Зроблено: Корчму знайдено, двері пережили знайомство.",
      "Далі: дійдіть до Столу зі справами.",
      "Де: у залі натисніть «📋 Стіл зі справами»."
    ].join("\n")
  };
}

function isActionableOverviewRow(row: QuestOverviewRow): boolean {
  return row.priority === "claimable" || row.priority === "active";
}

function stripOverviewOrder(row: RankedQuestOverviewRow): QuestOverviewRow {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    priority: row.priority
  };
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
      body: [
        "Статус: Книга вже має список дрібниць, але ще не довіряє вашим підписам.",
        `Далі: доростіть до ${daily.requiredLevel} рівня.`,
        "Де: стіл зі справами покаже обхід, коли Корчма визнає ваш почерк."
      ].join("\n")
    };
  }

  if (daily.state === "hp-blocked") {
    return {
      id: "daily-korchma-round",
      priority: "locked",
      title: `${title} — пауза`,
      body: [
        "Статус: Корчмар не видає обхід тим, хто тримається на репутації.",
        "Далі: відновіть хоча б 1 HP.",
        "Де: після відпочинку шукайте список за столом зі справами."
      ].join("\n")
    };
  }

  if (daily.state === "active-fight") {
    return {
      id: "daily-korchma-round",
      priority: "locked",
      title: `${title} — бій попереду журналу`,
      body: [
        "Статус: Книга не любить, коли її плямують бойовою логікою.",
        "Далі: завершіть поточну сутичку.",
        "Де: обхід повернеться на стіл зі справами після бою."
      ].join("\n")
    };
  }

  if (daily.state === "pending-barrel") {
    return {
      id: "daily-korchma-round",
      priority: "locked",
      title: `${title} — Бочка тримає чергу`,
      body: [
        "Статус: Бочка ревнує до розкладу, тож обхід чемно чекає збоку.",
        "Далі: дочекайтеся завершення рейдової черги.",
        "Де: стіл зі справами знову заговорить після Бочки."
      ].join("\n")
    };
  }

  if (daily.state === "not-issued") {
    return {
      id: "daily-korchma-round",
      priority: "available",
      title: `${title} — доступно`,
      body: [
        "Зроблено: сьогоднішній список ще не взято.",
        "Далі: візьміть дрібні катастрофи, якщо готові до канцелярії з пилом.",
        "Де: старт і здача — за столом зі справами."
      ].join("\n")
    };
  }

  const completed = daily.offer.completedSceneIds.length;
  const total = daily.offer.requiredSteps;
  const doneLine = formatDoneLine(
    getCompletedDailySceneTitles(daily.offer),
    completed,
    pluralize(completed, "дрібницю", "дрібниці", "дрібниць")
  );

  if (daily.state === "turn-in-ready") {
    return {
      id: "daily-korchma-round",
      priority: "claimable",
      title: `${title} — ${completed}/${total}`,
      body: [
        doneLine,
        "Далі: здайте обхід, поки Книга не додала ще одну пляму як свідка.",
        "Де: здати — за столом зі справами."
      ].join("\n")
    };
  }

  if (daily.state === "completed") {
    return {
      id: "daily-korchma-round",
      priority: "completed",
      title: `${title} — виконано`,
      body: [
        doneLine,
        "Далі: сьогодні Книга вже закрилась і робить вигляд, що не підглядала.",
        "Де: новий обхід чекатиме за столом зі справами іншого київського дня."
      ].join("\n")
    };
  }

  return {
    id: "daily-korchma-round",
    priority: "active",
    title: `${title} — ${completed}/${total}`,
    body: [
      doneLine,
      `Далі: владнайте ще ${total - completed} ${pluralize(total - completed, "дрібницю", "дрібниці", "дрібниць")}.`,
      "Де: шукайте сьогоднішні сцени у відповідних місцинах корчми. Здати — за столом зі справами."
    ].join("\n")
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
      body: [
        "Статус: три папірці лежать і роблять вигляд, що вони вибір долі.",
        "Далі: оберіть одну справу й метод, коли будете біля столу.",
        "Де: стіл зі справами."
      ].join("\n")
    };
  }

  if (adventure.state === "active-fight" || adventure.state === "combat-blocked") {
    return {
      id: "adventure",
      priority: "locked",
      title: `${title} — бій триває`,
      body: [
        "Статус: папірці не люблять паралельного героїзму.",
        "Далі: завершіть поточну сутичку.",
        "Де: після бою новий вибір чекатиме за столом зі справами."
      ].join("\n")
    };
  }

  if (adventure.state === "already-completed") {
    return {
      id: "adventure",
      priority: "completed",
      title: `${title} — виконано`,
      body: [
        "Зроблено: сьогоднішній вибір уже записано.",
        "Далі: стіл прикидається, що не хоче продовження.",
        "Де: нові три справи зʼявляться за столом зі справами в наступному періоді."
      ].join("\n")
    };
  }

  if (snapshot.character.level <= STARTER_ACTIVITY_MAX_LEVEL && snapshot.starterAdventure?.state === "ready") {
    return null;
  }

  return {
    id: "adventure",
    priority: "locked",
    title: `${title} — з ${adventure.requiredLevel} рівня`,
    body: [
      "Статус: Корчмар тримає серйозніші папери вище, щоб вони самі не втекли.",
      `Далі: доростіть до ${adventure.requiredLevel} рівня.`,
      "Де: доросліші підозри живуть за столом зі справами."
    ].join("\n")
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
      body: [
        "Статус: перша підозра лежить на столі й пахне вступним протоколом.",
        "Далі: розберіться з шаурмою без зайвої довіри до лаваша.",
        "Де: стіл зі справами."
      ].join("\n")
    };
  }

  if (starter.state === "already-completed") {
    return {
      id: "starter-adventure",
      priority: "completed",
      title: "🌯 <b>Підозріла шаурма</b> — виконано",
      body: [
        "Зроблено: шаурма дала перші підозрілі свідчення.",
        "Далі: шукайте наступну новачкову сутичку або доросліші справи за рівнем.",
        "Де: стіл зі справами."
      ].join("\n")
    };
  }

  return {
    id: "starter-adventure",
    priority: "completed",
    title: "🌯 <b>Підозріла шаурма</b> — новачкова справа",
    body: [
      `Статус: працює до ${starter.maxLevel} рівня.`,
      "Далі: стіл видає доросліші підозри.",
      "Де: старі соусні сліди лишаються в журналі, нові справи — за столом."
    ].join("\n")
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
      body: [
        "Статус: перший бій чекає біля столу й удає, що це просто знайомство.",
        "Далі: завершіть новачкову сутичку.",
        "Де: стіл зі справами."
      ].join("\n")
    };
  }

  if (fight.state === "already-completed") {
    return {
      id: "starter-fight",
      priority: "completed",
      title: "⚔️ <b>Новачкова сутичка</b> — виконано",
      body: [
        "Зроблено: перший висновок вижив у журналі.",
        "Далі: Низ і доросліші справи відкриватимуться за рівнем.",
        "Де: стіл зі справами покаже, що вже доречно чіпати."
      ].join("\n")
    };
  }

  if (fight.state === "level-retired") {
    return {
      id: "starter-fight",
      priority: "completed",
      title: "⚔️ <b>Новачкова сутичка</b> — новачкова",
      body: [
        `Статус: працює до ${fight.maxLevel} рівня.`,
        "Далі: Низ дивиться значно професійніше.",
        "Де: бойові проблеми шукайте через звичайний рух до спуску до Низу."
      ].join("\n")
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
      body: [
        "Статус: Корчмар має папірці, але ще не впевнений, що ви переживете їхній почерк.",
        `Далі: доростіть до ${FIGHTING_CORNER_MIN_LEVEL} рівня.`,
        "Де: Корчмар у шинку видасть папірець, коли Спуск до Низу перестане бути передчасною ідеєю."
      ].join("\n")
    };
  }

  if (progress.branchComplete || (progress.completed && progress.rewardClaimed)) {
    return null;
  }

  if (progress.completed && !progress.rewardClaimed) {
    return {
      id: "problem-quest",
      priority: "claimable",
      title: `${title} — ${progress.wins}/${progress.target}`,
      body: [
        `Зроблено: ${progress.wins} ${pluralize(progress.wins, "перемогу", "перемоги", "перемог")}.`,
        "Далі: здайте папірець, поки проблеми не попросили власний журнал.",
        "Де: Корчмар у шинку приймає здачу."
      ].join("\n")
    };
  }

  if (!progress.issued) {
    return {
      id: "problem-quest",
      priority: "available",
      title: `${title} — доступно`,
      body: [
        "Зроблено: новий папірець ще не взято.",
        "Далі: візьміть справу в Корчмаря, якщо готові до проблем із підписом.",
        "Де: шинок."
      ].join("\n")
    };
  }

  return {
    id: "problem-quest",
    priority: "active",
    title: `${title} — ${progress.wins}/${progress.target}`,
    body: progress.completed
      ? [
          `Зроблено: ${progress.wins} ${pluralize(progress.wins, "перемогу", "перемоги", "перемог")}.`,
          "Далі: Корчмар має наступний папірець і вираз службового натхнення.",
          "Де: шинок."
        ].join("\n")
      : [
          `Зроблено: ${progress.wins} ${pluralize(progress.wins, "перемогу", "перемоги", "перемог")}.`,
          `Далі: ще ${progress.target - progress.wins} ${pluralize(progress.target - progress.wins, "проблема", "проблеми", "проблем")} у Низу.`,
          "Де: Спуск до Низу. Здати — Корчмарю в шинку."
        ].join("\n")
  };
}

function getCellarOverviewRow(snapshot: QuestHubSnapshot): QuestOverviewRow | null {
  const cellar = snapshot.cellar;

  if (cellar.state === "level-locked") {
    return {
      id: "cellar",
      priority: "locked",
      title: `🐭 <b>Льохова справа</b> — з ${cellar.requiredLevel} рівня`,
      body: [
        "Статус: миша ще не готова приймати аргументи від настільки свіжих пригодників.",
        `Далі: доростіть до ${cellar.requiredLevel} рівня.`,
        "Де: льох корчми відкриє дрібну дипломатію пізніше."
      ].join("\n")
    };
  }

  if (cellar.state === "ready") {
    return {
      id: "cellar",
      priority: "available",
      title: "🐭 <b>Льохова справа</b> — готова",
      body: [
        "Статус: миша знову має позицію, крихти й юридичну інтонацію.",
        "Далі: спробуйте владнати льохову дрібницю.",
        "Де: льох корчми."
      ].join("\n")
    };
  }

  if (cellar.state === "on-cooldown") {
    return {
      id: "cellar",
      priority: "locked",
      title: "🐭 <b>Льохова справа</b> — пауза",
      body: [
        `Статус: миша радиться з крихтами ще ${formatCooldown(cellar.availableAt, cellar.now)}.`,
        "Далі: дочекайтеся кінця паузи.",
        "Де: льох корчми памʼятає, хто вже сперечався."
      ].join("\n")
    };
  }

  const grownup = snapshot.cellarGrownup;

  if (grownup?.state === "completed") {
    return {
      id: "cellar-grownup",
      priority: "completed",
      title: "🐭 <b>Справа не до миші</b> — виконано",
      body: [
        "Зроблено: дорослу льохову справу закрито.",
        "Далі: пляшка в журналі поводиться пристойно.",
        "Де: льох і шинок повернулися до звичайної підозрілої рівноваги."
      ].join("\n")
    };
  }

  if (grownup?.state === "bottle-obtained") {
    return {
      id: "cellar-grownup",
      priority: "claimable",
      title: "🐭 <b>Справа не до миші</b> — пляшка з вами",
      body: [
        "Зроблено: пляшка з вами й робить вигляд, що це вона веде переговори.",
        "Далі: віднесіть її Корчмарю.",
        "Де: здати — у шинку."
      ].join("\n")
    };
  }

  if (grownup) {
    return {
      id: "cellar-grownup",
      priority: grownup.state === "roleplay-cooldown" ? "locked" : "available",
      title: "🐭 <b>Справа не до миші</b> — доступно",
      body: grownup.state === "roleplay-cooldown"
        ? [
            `Статус: льохова дипломатія відсапується ще ${formatCooldown(grownup.availableAt, grownup.now)}.`,
            "Далі: дочекайтеся, поки крихти закінчать нараду.",
            "Де: льох корчми."
          ].join("\n")
        : [
            "Статус: у льосі є інша справа для старших пригодників, і вона тримає інтонацію.",
            "Далі: домовтеся з мишею або знайдіть доросліший аргумент.",
            "Де: льох корчми."
          ].join("\n")
    };
  }

  return {
    id: "cellar",
    priority: "completed",
    title: "🐭 <b>Льохова справа</b> — новачкова",
    body: [
      `Статус: працює до ${cellar.maxLevel} рівня.`,
      "Далі: миша вимагає доросліший протокол.",
      "Де: льох корчми лишається місцем переговорів із крихтами."
    ].join("\n")
  };
}

function getYegerOverviewRow(snapshot: QuestHubSnapshot): QuestOverviewRow | null {
  const yeger = snapshot.yeger;

  if (yeger.state === "level-locked") {
    return {
      id: "yeger",
      priority: "locked",
      title: `🏹 <b>Єгерська дошка</b> — з ${yeger.requiredLevel} рівня`,
      body: [
        "Статус: сліди вже є, але Єгер поки не дає їм юридичного статусу.",
        `Далі: доростіть до ${yeger.requiredLevel} рівня.`,
        "Де: Єгерський куток чекатиме біля Бочки."
      ].join("\n")
    };
  }

  if (yeger.state === "offered") {
    return {
      id: "yeger",
      priority: "available",
      title: "🏹 <b>Єгерська дошка</b> — доступно",
      body: [
        "Статус: Єгер має роботу для тих, хто не плутає слід із мотузкою.",
        "Далі: візьміть дошку й умови полювання.",
        "Де: Єгерський куток показує умови, але саме полювання лишається через звичайні маршрути."
      ].join("\n")
    };
  }

  if (yeger.state === "in-progress" || yeger.state === "turn-in-ready") {
    return {
      id: "yeger",
      priority: yeger.state === "turn-in-ready" ? "claimable" : "active",
      title: `🏹 <b>${escapeHtml(presentYegerQuestTitle(yeger.progress))}</b> — ${yeger.progress.wins}/${yeger.progress.target}`,
      body: yeger.state === "turn-in-ready"
        ? [
            `Зроблено: ${yeger.progress.wins} ${pluralize(yeger.progress.wins, "слід", "сліди", "слідів")}.`,
            "Далі: здайте дощечку, поки вона не почала перебільшувати.",
            "Де: Єгерський куток біля Бочки."
          ].join("\n")
        : [
            `Зроблено: ${yeger.progress.wins} ${pluralize(yeger.progress.wins, "слід", "сліди", "слідів")}.`,
            `Далі: ще ${yeger.progress.target - yeger.progress.wins} відповідних ${pluralize(yeger.progress.target - yeger.progress.wins, "монстр", "монстри", "монстрів")}.`,
            "Де: Єгерський куток показує умови, але полювання лишається через звичайні маршрути."
          ].join("\n")
    };
  }

  return {
    id: "yeger",
    priority: "completed",
    title: `🏹 <b>${escapeHtml(presentYegerQuestTitle(yeger.progress))}</b> — виконано`,
    body: [
      `Зроблено: ${yeger.progress.wins} ${pluralize(yeger.progress.wins, "слід", "сліди", "слідів")}.`,
      "Далі: Єгер удає, що не пишається, але дощечка все бачила.",
      "Де: наступні умови, якщо будуть, зʼявляться в Єгерському кутку."
    ].join("\n")
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
      body: [
        "Статус: Бочка ще робить вигляд, що новачкова піна не для вас.",
        `Далі: доростіть до ${quest.requiredLevel} рівня.`,
        "Де: записка зʼявиться за столом зі справами."
      ].join("\n")
    };
  }

  if (quest.state === "level-retired") {
    return {
      id: "barrel-beer-tutorial",
      priority: "completed",
      title: `${title} — новачкова`,
      body: [
        `Статус: працює до ${quest.maxLevel} рівня.`,
        "Далі: Бочка вимагає дорослішого драматизму.",
        "Де: стару записку лишено в журналі як мокрий доказ."
      ].join("\n")
    };
  }

  if (quest.state === "completed") {
    return {
      id: "barrel-beer-tutorial",
      priority: "completed",
      title: `${title} — виконано`,
      body: [
        "Зроблено: Бочка, рейд і пінна формальність пережиті.",
        "Далі: Бочка робить вигляд, що так і планувала.",
        "Де: новачкова записка лишається в архіві столу зі справами."
      ].join("\n")
    };
  }

  if (quest.state === "available") {
    return {
      id: "barrel-beer-tutorial",
      priority: "available",
      title: `${title} — доступно`,
      body: [
        "Статус: на столі лежить записка з круглим слідом від кухля.",
        "Далі: візьміть записку, якщо готові до піни з навчальним нахилом.",
        "Де: стіл зі справами."
      ].join("\n")
    };
  }

  return {
    id: "barrel-beer-tutorial",
    priority: quest.state === "turn-in-ready" ? "claimable" : "active",
    title: `${title} — ${quest.state === "turn-in-ready" ? "готово здати" : "триває"}`,
    body: getBarrelBeerTutorialBody(quest.progress, quest.state === "turn-in-ready")
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
    body: [
      "Статус: ельф-маг у задвірку кличе до справи й обіцяє офіційні суперечки манаток.",
      "Далі: принесіть потрібну аптечку й домовтеся з іскрами.",
      "Де: задвірок корчми."
    ].join("\n")
  };
}

function getBarrelBeerTutorialBody(
  progress: { visitedBarrel: boolean; raidCompleted: boolean; beerRoundOffered: boolean; beerDrunk: boolean; activeBeer: boolean },
  ready: boolean
): string {
  if (ready) {
    return [
      "Зроблено: Бочка відвідана, рейд пережито, пиво випито.",
      "Далі: поверніться зі свіжою піною до столу.",
      "Де: здати — за столом зі справами."
    ].join("\n");
  }

  if (!progress.visitedBarrel) {
    return [
      "Зроблено: записку взято.",
      "Далі: знайдіть Бочку, хоч вона поводиться так, ніби вже знайшла вас.",
      "Де: Бочка Пінного Міражу."
    ].join("\n");
  }

  if (!progress.raidCompleted) {
    return [
      "Зроблено: Бочка знайдена.",
      "Далі: завершіть місцеву новачкову колотнечу.",
      "Де: Бочка Пінного Міражу."
    ].join("\n");
  }

  if (!progress.beerRoundOffered || !progress.beerDrunk) {
    return [
      "Зроблено: рейд біля Бочки пережито.",
      "Далі: проведіть пінну формальність.",
      "Де: шинок."
    ].join("\n");
  }

  return [
    "Зроблено: пиво випито, але відвага вже сперечається з годинником.",
    "Далі: тримайте активну пивну відвагу перед здачею.",
    "Де: шинок для піни, стіл зі справами для здачі."
  ].join("\n");
}

function getCompletedDailySceneTitles(offer: {
  completedSceneIds: readonly string[];
  scenes: readonly { id: string; title: string }[];
}): string[] {
  const titlesById = new Map(offer.scenes.map((scene) => [scene.id, scene.title]));

  return offer.completedSceneIds
    .map((sceneId) => titlesById.get(sceneId))
    .filter((title): title is string => Boolean(title));
}

function formatDoneLine(labels: string[], count: number, fallbackNoun: string): string {
  if (labels.length > 0) {
    return `Зроблено: ${labels.map(escapeHtml).join(", ")}.`;
  }

  if (count > 0) {
    return `Зроблено: ${count} ${fallbackNoun}.`;
  }

  return "Зроблено: ще нічого, журнал аж підозріло чистий.";
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
