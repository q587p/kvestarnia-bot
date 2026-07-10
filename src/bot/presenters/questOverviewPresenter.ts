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
    "Стіл зі справами, єгерський куток і кілька дрібних катастроф дивляться на вас по черзі.",
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
        "<i>Зроблено:</i> персонаж уже є, і це сміливий адміністративний початок.",
        "<i>Далі:</i> зайдіть у Корчму.",
        "<i>Де:</i> натисніть «🚪 Зайти в корчму», а потім шукайте Стіл зі справами."
      ].join("\n")
    };
  }

  return {
    id: "first-korchma",
    priority: "active",
    title: "📋 <b>Перший крок до столу</b> — 1/2",
    body: [
      "<i>Зроблено:</i> Корчму знайдено, двері пережили знайомство.",
      "<i>Далі:</i> дійдіть до Столу зі справами.",
      "<i>Де:</i> у залі натисніть «📋 Стіл зі справами»."
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
        `<i>Далі:</i> доростіть до ${daily.requiredLevel} рівня.`,
        "<i>Де:</i> стіл зі справами покаже обхід, коли Корчма визнає ваш почерк."
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
        "<i>Далі:</i> відновіть хоча б 1 HP.",
        "<i>Де:</i> після відпочинку шукайте список за столом зі справами."
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
        "<i>Далі:</i> завершіть поточну сутичку.",
        "<i>Де:</i> обхід повернеться на стіл зі справами після бою."
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
        "<i>Далі:</i> дочекайтеся завершення рейдової черги.",
        "<i>Де:</i> стіл зі справами знову заговорить після Бочки."
      ].join("\n")
    };
  }

  if (daily.state === "not-issued") {
    return {
      id: "daily-korchma-round",
      priority: "available",
      title: `${title} — доступно`,
      body: [
        "<i>Зроблено:</i> сьогоднішній список ще не взято.",
        "<i>Далі:</i> візьміть дрібні катастрофи, якщо готові до канцелярії з пилом.",
        "<i>Де:</i> старт і здача — за столом зі справами."
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
        "<i>Далі:</i> здайте обхід, поки Книга не додала ще одну пляму як свідка.",
        "<i>Де:</i> здати — за столом зі справами."
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
        "<i>Далі:</i> сьогодні Книга вже закрилась і робить вигляд, що не підглядала.",
        "<i>Де:</i> новий обхід чекатиме за столом зі справами іншого київського дня."
      ].join("\n")
    };
  }

  return {
    id: "daily-korchma-round",
    priority: "active",
    title: `${title} — ${completed}/${total}`,
    body: [
      doneLine,
      `<i>Далі:</i> владнайте ще ${total - completed} ${pluralize(total - completed, "дрібницю", "дрібниці", "дрібниць")}.`,
      "<i>Де:</i> шукайте сьогоднішні сцени у відповідних місцинах корчми. Здати — за столом зі справами."
    ].join("\n")
  };
}

function getAdventureOverviewRow(snapshot: QuestHubSnapshot): QuestOverviewRow | null {
  const adventure = snapshot.adventure;
  const title = "🪧 <b>Три справи на найближчий час</b>";

  if (adventure.state === "ready") {
    return {
      id: "adventure",
      priority: "active",
      title: `${title} — три проблеми чекають вибору`,
      body: [
        "<i>Зроблено:</i> стіл уже виклав три папірці й удає, що це нейтральна пропозиція.",
        "<i>Далі:</i> оберіть одну справу й метод, коли будете біля столу.",
        "<i>Де:</i> стіл зі справами."
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
        "<i>Далі:</i> завершіть поточну сутичку.",
        "<i>Де:</i> після бою новий вибір чекатиме за столом зі справами."
      ].join("\n")
    };
  }

  if (adventure.state === "already-completed") {
    return {
      id: "adventure",
      priority: "completed",
      title: `${title} — виконано`,
      body: [
        "<i>Зроблено:</i> сьогоднішній вибір уже записано.",
        "<i>Далі:</i> стіл прикидається, що не хоче продовження.",
        "<i>Де:</i> нові три справи зʼявляться за столом зі справами в наступному періоді."
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
      `<i>Далі:</i> доростіть до ${adventure.requiredLevel} рівня.`,
      "<i>Де:</i> доросліші підозри живуть за столом зі справами."
    ].join("\n")
  };
}

function getStarterAdventureOverviewRow(snapshot: QuestHubSnapshot): QuestOverviewRow | null {
  const starter = snapshot.starterAdventure;

  if (!starter || snapshot.firstKorchmaQuest?.state !== "completed") {
    return null;
  }

  if (starter.state === "ready") {
    return {
      id: "starter-adventure",
      priority: "active",
      title: "🌯 <b>Підозріла шаурма</b> — новачкова підозра",
      body: [
        "<i>Зроблено:</i> перший шлях до столу пройдено, і на папері вже є соусний натяк.",
        "<i>Далі:</i> відкрийте підозрілу шаурму й оберіть, як із нею розібратися.",
        "<i>Де:</i> стіл зі справами."
      ].join("\n")
    };
  }

  if (starter.state === "already-completed") {
    return {
      id: "starter-adventure",
      priority: "completed",
      title: "🌯 <b>Підозріла шаурма</b> — виконано",
      body: [
        "<i>Зроблено:</i> шаурма дала перші підозрілі свідчення.",
        "<i>Далі:</i> шукайте наступну новачкову сутичку або доросліші справи за рівнем.",
        "<i>Де:</i> стіл зі справами."
      ].join("\n")
    };
  }

  return {
    id: "starter-adventure",
    priority: "completed",
    title: "🌯 <b>Підозріла шаурма</b> — новачкова справа",
    body: [
      `Статус: працює до ${starter.maxLevel} рівня.`,
      "<i>Далі:</i> стіл видає доросліші підозри.",
      "<i>Де:</i> старі соусні сліди лишаються в журналі, нові справи — за столом."
    ].join("\n")
  };
}

function getStarterFightOverviewRow(snapshot: QuestHubSnapshot): QuestOverviewRow | null {
  const fight = snapshot.starterFight;

  if (!fight || snapshot.firstKorchmaQuest?.state !== "completed") {
    return null;
  }

  if (fight.state === "ready") {
    return {
      id: "starter-fight",
      priority: "active",
      title: "⚔️ <b>Новачкова сутичка</b> — чекає свідчень",
      body: [
        "<i>Зроблено:</i> шаурма ще не дала свідчень, тож бій чемно тримає чергу.",
        "<i>Далі:</i> спершу розберіться з підозрілою шаурмою, потім поверніться до сутички.",
        "<i>Де:</i> стіл зі справами."
      ].join("\n")
    };
  }

  if (fight.state === "already-completed") {
    return {
      id: "starter-fight",
      priority: "completed",
      title: "⚔️ <b>Новачкова сутичка</b> — виконано",
      body: [
        "<i>Зроблено:</i> перший висновок вижив у журналі.",
        "<i>Далі:</i> Низ і доросліші справи відкриватимуться за рівнем.",
        "<i>Де:</i> стіл зі справами покаже, що вже доречно чіпати."
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
        "<i>Далі:</i> Низ дивиться значно професійніше.",
        "<i>Де:</i> бойові проблеми шукайте через звичайний рух до спуску до Низу."
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
        `<i>Далі:</i> доростіть до ${FIGHTING_CORNER_MIN_LEVEL} рівня.`,
        "<i>Де:</i> Корчмар у шинку видасть папірець, коли спуск до Низу перестане бути передчасною ідеєю."
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
        `<i>Зроблено:</i> ${progress.wins} ${pluralize(progress.wins, "перемогу", "перемоги", "перемог")}.`,
        "<i>Далі:</i> здайте папірець, поки проблеми не попросили власний журнал.",
        "<i>Де:</i> Корчмар у шинку приймає здачу."
      ].join("\n")
    };
  }

  if (!progress.issued) {
    return {
      id: "problem-quest",
      priority: "available",
      title: `${title} — доступно`,
      body: [
        "<i>Зроблено:</i> новий папірець ще не взято.",
        "<i>Далі:</i> візьміть справу в Корчмаря, якщо готові до проблем із підписом.",
        "<i>Де:</i> шинок."
      ].join("\n")
    };
  }

  return {
    id: "problem-quest",
    priority: "active",
    title: `${title} — ${progress.wins}/${progress.target}`,
    body: progress.completed
      ? [
          `<i>Зроблено:</i> ${progress.wins} ${pluralize(progress.wins, "перемогу", "перемоги", "перемог")}.`,
          "<i>Далі:</i> Корчмар має наступний папірець і вираз службового натхнення.",
          "<i>Де:</i> шинок."
        ].join("\n")
      : [
          `<i>Зроблено:</i> ${progress.wins} ${pluralize(progress.wins, "перемогу", "перемоги", "перемог")}.`,
          `<i>Далі:</i> ще ${progress.target - progress.wins} ${pluralize(progress.target - progress.wins, "проблема", "проблеми", "проблем")} у Низу.`,
          "<i>Де:</i> спуск до Низу. Здати — Корчмарю в шинку."
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
        `<i>Далі:</i> доростіть до ${cellar.requiredLevel} рівня.`,
        "<i>Де:</i> льох корчми відкриє дрібну дипломатію пізніше."
      ].join("\n")
    };
  }

  if (cellar.state === "ready") {
    const starterPathCompleted =
      snapshot.starterAdventure?.state === "already-completed" &&
      snapshot.starterFight?.state === "already-completed";

    if (starterPathCompleted) {
      const repeatedCellarRun = Boolean(cellar.completed);
      return {
        id: "cellar",
        priority: "active",
        title: `🐭 <b>Льохова справа</b> — ${repeatedCellarRun ? "не перший спуск" : "перший спуск"}`,
        body: [
          "<i>Зроблено:</i> підозріла шаурма дала свідчення, а новачкова сутичка вже записана в журнал.",
          repeatedCellarRun
            ? "<i>Далі:</i> ще раз спустіться в льох і спробуйте ще раз владнати мишачу дрібницю."
            : "<i>Далі:</i> спустіться в льох і спробуйте владнати мишачу дрібницю.",
          "<i>Де:</i> льох корчми."
        ].join("\n")
      };
    }

    return {
      id: "cellar",
      priority: "available",
      title: "🐭 <b>Льохова справа</b> — готова",
      body: [
        "Статус: миша знову має позицію, крихти й юридичну інтонацію.",
        "<i>Далі:</i> спробуйте владнати льохову дрібницю.",
        "<i>Де:</i> льох корчми."
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
        "<i>Далі:</i> дочекайтеся кінця паузи.",
        "<i>Де:</i> льох корчми памʼятає, хто вже сперечався."
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
        "<i>Зроблено:</i> дорослу льохову справу закрито.",
        "<i>Далі:</i> пляшка в журналі поводиться пристойно.",
        "<i>Де:</i> льох і шинок повернулися до звичайної підозрілої рівноваги."
      ].join("\n")
    };
  }

  if (grownup?.state === "bottle-obtained") {
    return {
      id: "cellar-grownup",
      priority: "claimable",
      title: "🐭 <b>Справа не до миші</b> — пляшка з вами",
      body: [
        "<i>Зроблено:</i> пляшка з вами й робить вигляд, що це вона веде переговори.",
        "<i>Далі:</i> віднесіть її Корчмарю.",
        "<i>Де:</i> здати — у шинку."
      ].join("\n")
    };
  }

  if (grownup) {
    if (grownup.state === "roleplay-cooldown") {
      return {
        id: "cellar-grownup",
        priority: "active",
        title: "🐭 <b>Справа не до миші</b> — пауза",
        body: [
          `<i>Зроблено:</i> льохова дипломатія відсапується ще ${formatCooldown(grownup.availableAt, grownup.now)}.`,
          "<i>Далі:</i> дочекайтеся, поки крихти закінчать нараду, або поверніться з дорослішим аргументом.",
          "<i>Де:</i> льох корчми."
        ].join("\n")
      };
    }

    return {
      id: "cellar-grownup",
      priority: "active",
      title: "🐭 <b>Справа не до миші</b> — у льосі є інша справа для старших пригодників",
      body: [
        "<i>Зроблено:</i> новачкова миша вже не єдина бюрократія в льосі.",
        "<i>Далі:</i> домовтеся з мишею або знайдіть доросліший аргумент.",
        "<i>Де:</i> льох корчми."
      ].join("\n")
    };
  }

  return {
    id: "cellar",
    priority: "completed",
    title: "🐭 <b>Льохова справа</b> — новачкова",
    body: [
      `Статус: працює до ${cellar.maxLevel} рівня.`,
      "<i>Далі:</i> миша вимагає доросліший протокол.",
      "<i>Де:</i> льох корчми лишається місцем переговорів із крихтами."
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
        `<i>Далі:</i> доростіть до ${yeger.requiredLevel} рівня.`,
        "<i>Де:</i> єгерський куток чекатиме біля Бочки."
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
        "<i>Далі:</i> візьміть дошку й умови полювання.",
        "<i>Де:</i> єгерський куток показує умови, але саме полювання лишається через звичайні маршрути."
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
            `<i>Зроблено:</i> ${yeger.progress.wins} ${pluralize(yeger.progress.wins, "слід", "сліди", "слідів")}.`,
            "<i>Далі:</i> здайте дощечку, поки вона не почала перебільшувати.",
            "<i>Де:</i> єгерський куток біля Бочки."
          ].join("\n")
        : [
            `<i>Зроблено:</i> ${yeger.progress.wins} ${pluralize(yeger.progress.wins, "слід", "сліди", "слідів")}.`,
            `<i>Далі:</i> ще ${yeger.progress.target - yeger.progress.wins} відповідних ${pluralize(yeger.progress.target - yeger.progress.wins, "монстр", "монстри", "монстрів")}.`,
            "<i>Де:</i> єгерський куток показує умови, але полювання лишається через звичайні маршрути."
          ].join("\n")
    };
  }

  return {
    id: "yeger",
    priority: "completed",
    title: `🏹 <b>${escapeHtml(presentYegerQuestTitle(yeger.progress))}</b> — виконано`,
    body: [
      `<i>Зроблено:</i> ${yeger.progress.wins} ${pluralize(yeger.progress.wins, "слід", "сліди", "слідів")}.`,
      "<i>Далі:</i> Єгер удає, що не пишається, але дощечка все бачила.",
      "<i>Де:</i> наступні умови, якщо будуть, зʼявляться в єгерському кутку."
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
        `<i>Далі:</i> доростіть до ${quest.requiredLevel} рівня.`,
        "<i>Де:</i> записка зʼявиться за столом зі справами."
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
        "<i>Далі:</i> Бочка вимагає дорослішого драматизму.",
        "<i>Де:</i> стару записку лишено в журналі як мокрий доказ."
      ].join("\n")
    };
  }

  if (quest.state === "completed") {
    return {
      id: "barrel-beer-tutorial",
      priority: "completed",
      title: `${title} — виконано`,
      body: [
        "<i>Зроблено:</i> Бочка, рейд і пінна формальність пережиті.",
        "<i>Далі:</i> Бочка робить вигляд, що так і планувала.",
        "<i>Де:</i> новачкова записка лишається в архіві столу зі справами."
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
        "<i>Далі:</i> візьміть записку, якщо готові до піни з навчальним нахилом.",
        "<i>Де:</i> стіл зі справами."
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
  const itemUpgrades = snapshot.itemUpgrades;

  if (itemUpgrades?.state !== "unlock-required") {
    return null;
  }

  const hasFieldKit = itemUpgrades.fieldKitQuantity > 0;

  return {
    id: "charkokovalnia",
    priority: "active",
    title: "✨ <b>Доступ до Чароковальні</b> — потрібна Польова аптечка",
    body: hasFieldKit
      ? [
          "<i>Зроблено:</i> ельф-маг уже попросив Польову аптечку, і вона є в торбі.",
          "<i>Далі:</i> віднесіть аптечку до Чароковальні й запустіть іскри офіційно.",
          "<i>Де:</i> задвірок корчми."
        ].join("\n")
      : [
          "<i>Зроблено:</i> ельф-маг уже попросив Польову аптечку для першого запуску.",
          "<i>Далі:</i> добудьте Польову аптечку; єгер, як завжди, виглядає так, ніби знає, де її шукати.",
          "<i>Де:</i> задвірок корчми для Чароковальні; єгерський куток — за підказкою до аптечки."
        ].join("\n")
  };
}

function getBarrelBeerTutorialBody(
  progress: { visitedBarrel: boolean; raidCompleted: boolean; beerRoundOffered: boolean; beerDrunk: boolean; activeBeer: boolean },
  ready: boolean
): string {
  if (ready) {
    return [
      "<i>Зроблено:</i> Бочка відвідана, рейд пережито, пиво випито.",
      "<i>Далі:</i> поверніться зі свіжою піною до столу.",
      "<i>Де:</i> здати — за столом зі справами."
    ].join("\n");
  }

  if (!progress.visitedBarrel) {
    return [
      "<i>Зроблено:</i> записку взято.",
      "<i>Далі:</i> знайдіть Бочку, хоч вона поводиться так, ніби вже знайшла вас.",
      "<i>Де:</i> Бочка Пінного Міражу."
    ].join("\n");
  }

  if (!progress.raidCompleted) {
    return [
      "<i>Зроблено:</i> Бочка знайдена.",
      "<i>Далі:</i> завершіть місцеву новачкову колотнечу.",
      "<i>Де:</i> Бочка Пінного Міражу."
    ].join("\n");
  }

  if (!progress.beerRoundOffered || !progress.beerDrunk) {
    return [
      "<i>Зроблено:</i> рейд біля Бочки пережито.",
      "<i>Далі:</i> проведіть пінну формальність.",
      "<i>Де:</i> шинок."
    ].join("\n");
  }

  return [
    "<i>Зроблено:</i> пиво випито, але відвага вже сперечається з годинником.",
    "<i>Далі:</i> тримайте активну пивну відвагу перед здачею.",
    "<i>Де:</i> шинок для піни, стіл зі справами для здачі."
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
    return `<i>Зроблено:</i> ${labels.map(escapeHtml).join(", ")}.`;
  }

  if (count > 0) {
    return `<i>Зроблено:</i> ${count} ${fallbackNoun}.`;
  }

  return "<i>Зроблено:</i> ще нічого, журнал аж підозріло чистий.";
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
