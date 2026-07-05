import type {
  KorchmaRoundLeaderboardPeriod,
  TavernLookupResult,
  TavernPendingRaidResult,
  TavernRoundLeaderboardResult,
  TavernRaidResult,
  TavernRoundOfferResult,
  TavernRoundResult
} from "../../services/tavernRaidService";
import type { CharacterSummary } from "../../domain/characters/characterSummary";
import type {
  KorchmaRoundLeaderboard,
  KorchmaRoundLeaderboardEntry
} from "../../db/repositories/korchmaRoundPurchaseRepository";
import type { DuelLeaderboard, DuelLeaderboardEntry } from "../../services/duelChallengeService";
import type { KorchmaArrivalBoard, PresenceGroup } from "../../services/presenceService";
import type { LevelMilestoneBoard } from "../../db/repositories/levelMilestoneRepository";
import type { RemortBoard } from "../../db/repositories/remortRepository";
import {
  selectCharacterFlavorLine,
  selectCharacterFlavorLines,
  selectKorchmaGreetingLine
} from "../../content/characterFlavor";
import { presentRewardAmount, presentRewardItemGrant } from "./rewardPresenter";
import { presentCharacterDisplayName } from "./characterDisplay";
import { escapeHtml, npcQuote } from "./telegramHtml";
import type { MunchkinLocation } from "../../domain/levelBarter/munchkinSchedule";

export function presentKorchmaFront(
  character: CharacterSummary,
  options: { munchkinLocation?: MunchkinLocation; showEntryHint?: boolean } = {}
): string {
  return [
    "🚪 Перед корчмою",
    "",
    "За дверима гуде <b>Корчма Квестарні</b>. Там видають квести, сперечаються з бочками й іноді не питають зайвого.",
    "",
    "Зліва від дверей висить <i>табличка прибулих</i>: хто вже проходив повз і не був стертий дощем. Справа від дверей висить <i>пропамʼятна дошка</i>. Вона міряє рівні, але робить вигляд, що це історія.",
    "",
    "За рогом починається <i>задвірок корчми</i>: там дрібні катастрофи сушаться біля відра й чекають слушного пригодника.",
    ...presentFrontMunchkinLines(character.level, options.munchkinLocation ?? "front"),
    ...(options.showEntryHint === false
      ? []
      : [
          "",
          "Натисніть «🚪 Зайти в корчму» або відкрийте двері через /tavern."
        ])
  ].join("\n");
}

export function presentKorchmaArrivalBoard(
  character: CharacterSummary,
  board: KorchmaArrivalBoard
): string {
  return [
    "📜 Табличка прибулих",
    "",
    "Зліва від дверей висить дошка з іменами тих, кого корчма вже бачила й поки не заперечує.",
    "",
    ...presentKorchmaArrivalEntries(board),
    "",
    "Корчмар каже, що це не список боржників. Табличка тактовно мовчить."
  ].join("\n");
}

export function presentKorchmaYard(_character: CharacterSummary): string {
  void _character;

  return [
    "🪣 Задвірок корчми",
    "",
    "За корчмою пахне мокрим деревом, самовпевненим пилом і дрібними проблемами, які не пройшли через головні двері.",
    "",
    "Якщо сьогоднішній Корчмарський обхід прислав вас сюди, дрібницю треба владнати саме тут. Якщо ні, задвірок чемно вдає пейзаж.",
    "",
    "Що робимо?"
  ].join("\n");
}

export function presentKorchmaMemorialBoard(
  character: CharacterSummary,
  milestones?: LevelMilestoneBoard,
  remorts?: RemortBoard
): string {
  return [
    "🏅 Пропамʼятна дошка",
    "",
    "Справа від дверей висить дошка для тих, хто першим доріс до числа й не впав з табурета.",
    "",
    ...presentLevelMilestoneEntries(milestones),
    "",
    ...presentRemortBoardEntries(remorts),
    "",
    "Корчмар каже, що це не змагання. Дошка вже рахує місця."
  ].join("\n");
}

export function presentKorchmaRemortMilestoneBoard(
  character: CharacterSummary,
  remortNumber: number,
  milestones?: LevelMilestoneBoard
): string {
  return [
    "🏅 Пропамʼятна дошка",
    "",
    `Перші зарубки за рівні після реморту ${remortNumber}:`,
    "",
    ...presentRemortLevelMilestoneEntries(milestones),
    "",
    "Корчмар каже, що окремі життя рахуються окремо. Дошка киває й просить не сперечатися з хронологією."
  ].join("\n");
}

export function presentKorchmaHall(
  character: CharacterSummary,
  presence?: PresenceGroup | null,
  viewerTelegramUserId?: bigint,
  options: { flavorSeed?: string } = {}
): string {
  return [
    "🍺 Зала корчми",
    "",
    "Корчма Квестарні тримає тепло, шум і кілька справ, які краще не залишати без нагляду.",
    "",
    "Ліворуч гупає <i>бійцівський куток</i>, праворуч терпить життя <i>стіл зі справами</i>. Далі піниться <i>Бочка Пінного Міражу</i>, шумить <i>шинок</i>, за бочками чекає <i>спуск до Низу</i>, а поруч скромно пахне <i>льох</i>.",
    "",
    "Біля дверей висить <i>дошка корчми</i>, а самі двері роблять вигляд, що <i>надвір</i> теж варіянт.",
    ...presentRemortCandleHint(character),
    "",
    ...presentKorchmaGreeting(character, options.flavorSeed),
    "",
    ...presentTavernPresence(presence, viewerTelegramUserId),
    "",
    `<b>${escapeHtml(character.name)}</b>, куди йдемо?`
  ].join("\n");
}

export function presentKorchmaFightingCorner(
  _character: CharacterSummary,
  options: { trainingDoppelgangerAvailable?: boolean } = {}
): string {
  void _character;
  const trainingLine = options.trainingDoppelgangerAvailable === false
    ? "Сумлінного Допельґанґера зараз немає в кутку. Тут лишилися дуелі й дошка переможців."
    : "Можна потренуватися з Сумлінним Допельґанґером, глянути переможців або кинути дружній виклик іншому пригоднику.";

  return [
    "🥊 Бійцівський куток",
    "",
    "Тут не бʼються одразу. Спершу Корчмар показує пальцем на дошку правил, потім на ваші манатки, потім знову на дошку правил.",
    "",
    trainingLine,
    "",
    "⚡ Миттєва дуель — результат одразу після згоди.",
    "♟️ Покрокова дуель — гравці таємно обирають дії за раунд.",
    "",
    "Що обираємо?"
  ].join("\n");
}

export function presentKorchmaFightingCornerLevelLocked(
  _character: CharacterSummary,
  requiredLevel = 3
): string {
  return [
    `🥊 Бійцівський куток відкриється з ${requiredLevel} рівня`,
    "",
    "Куток поки вдає, що це просто дуже підозрілий закуток. Корчмар радить спершу закрити кілька справ і не сваритися з рукавицями.",
    "",
    "Поверніться до зали або до Столу зі справами."
  ].join("\n");
}

export function presentKorchmaDeepClosed(
  _character: CharacterSummary,
  options: { munchkinLocation?: MunchkinLocation } = {}
): string {
  return [
    "🪜 Спуск до Низу",
    "",
    "За бочками в коморі є сходи. Перші тринадцять сходинок ще пахнуть пивом і мишами. Далі — гарячим каменем, старою кров’ю і чимось, що не мало б дихати.",
    ...presentDeepMunchkinLines(options.munchkinLocation ?? "front")
  ].join("\n");
}

function presentFrontMunchkinLines(characterLevel: number, location: MunchkinLocation): string[] {
  if (characterLevel < 3 || location !== "front") {
    return [];
  }

  return [
    "",
    "Трохи збоку стоїть <i>Манчкін-скупник</i>. Він каже, що манатки, золото й рівні мають домовлятися без зайвої моралі."
  ];
}

function presentDeepMunchkinLines(location: MunchkinLocation): string[] {
  if (location !== "nyz-descent") {
    return [];
  }

  return [
    "",
    "Біля перил причаївся <i>Манчкін-скупник</i>. Уночі він каже, що рівні краще купувати ближче до небезпеки: так чесніше звучить."
  ];
}

export function presentKorchmaDeepLevelLocked(
  _character: CharacterSummary,
  requiredLevel = 3
): string {
  return [
    `🪜 Низ відкриється з ${requiredLevel} рівня`,
    "",
    "Сходи за бочками чемно скриплять і роблять вигляд, що їх ще не вигадали.",
    "",
    "Корчмар радить спершу розібратися з підозрілою шаурмою та новачковими справами."
  ].join("\n");
}

export function presentDuelWinnersBoard(
  character: CharacterSummary,
  leaderboard: DuelLeaderboard
): string {
  const shownTitleCharacterIds = new Set<string>();

  return [
    "🏆 Переможці дуелей",
    "",
    "На дошці Бійцівського кутка Корчмар рахує тільки дружні перемоги. Нагород тут немає, зате є крейда й надмірна офіційність.",
    "",
    ...presentDuelLeaderboardSection("За добу", leaderboard.day, shownTitleCharacterIds),
    "",
    ...presentDuelLeaderboardSection("За тиждень", leaderboard.week, shownTitleCharacterIds),
    "",
    ...presentDuelLeaderboardSection("За місяць", leaderboard.month, shownTitleCharacterIds)
  ].join("\n");
}

function presentRemortCandleHint(character: CharacterSummary): string[] {
  if (character.level < 13) {
    return [];
  }

  return [
    "",
    "На стійці запалилася свічка персонально для вас. Раніше вона вдавала вічно згаслу, але тринадцятий рівень змушує навіть віск переглянути позицію."
  ];
}

export function presentKorchmaBar(
  _character: CharacterSummary,
  options: {
    includeBottleTurnIn?: boolean;
    problemQuestAction?: "turn-in" | "take" | "next";
    bardPerformance?: boolean;
    tavernGames?: boolean;
  } = {}
): string {
  const actionLines = presentKorchmaBarActionLines(options);

  return [
    "🍻 Шинок",
    "",
    "<i>Шинок</i> тримає кухлі, чеки й корчмаря в одному місці. Корчмар каже, що це не бардак, а логістика.",
    "",
    "Тут частують пивом, сперечаються з цінами й роблять вигляд, що золото саме просилося на добру справу.",
    ...actionLines,
    "",
    "Що наливаємо?"
  ].join("\n");
}

export function presentKorchmaNewsCorner(_character: CharacterSummary): string {
  void _character;

  return [
    "📰 Дошка корчми",
    "",
    "Біля дверей висить <i>дошка корчми</i>. На ній свіжі вісти, старі цвяшки й один клаптик паперу, який явно знає більше, ніж каже.",
    "",
    "Тут можна глянути вісти Квестарні, відкрити останні події, погортати перекази, подарувати манатку тому, хто поруч, або передати пакунок через пошту за невелику плату. Дошка робить вигляд, що це все її ідея.",
    "",
    "Що дивимося?"
  ].join("\n");
}

function presentKorchmaBarActionLines(options: {
  includeBottleTurnIn?: boolean;
  problemQuestAction?: "turn-in" | "take" | "next";
  bardPerformance?: boolean;
  tavernGames?: boolean;
}): string[] {
  const lines: string[] = [];

  if (options.bardPerformance) {
    lines.push("Бардівський кут стійки сьогодні вільний. Корчмар удає, що не підспівує.");
  }

  if (options.problemQuestAction === "take") {
    lines.push("На краю стійки лежить чистий корчмарський папірець: його можна взяти як нову справу.");
  }

  if (options.problemQuestAction === "turn-in") {
    lines.push("Корчмар уже тримає журнал відкритим: готову справу можна здати просто тут.");
  }

  if (options.problemQuestAction === "next") {
    lines.push("Поруч шарудить наступна папка: якщо беретеся, Корчмар відкриє новий лічильник.");
  }

  if (options.includeBottleTurnIn) {
    lines.push("За стійкою є місце для пляшки з льоху: Корчмар приймає такі речі не відходячи від журналу.");
  }

  if (options.tavernGames) {
    lines.push("У кутку скрипить ігровий стіл: тавлеї й кості чекають охочих виглядати спокійно.");
  }

  return lines.length > 0 ? ["", ...lines] : [];
}

export function presentTavern(_character: CharacterSummary): string {
  void _character;

  return [
    "🛢️ Біля Бочки Пінного Міражу",
    "",
    "У кутку героїчно піниться Бочка Пінного Міражу.",
    "",
    npcQuote("Корчмар", "Це не проблема. Дві-три хвилини. Максимум."),
    "",
    "Що робимо?"
  ].join("\n");
}

export function presentTavernAlreadyRaided(_character: CharacterSummary): string {
  void _character;

  return [
    "🛢️ Біля Бочки Пінного Міражу",
    "",
    "Бочка Пінного Міражу в цьому відтинку вже пережила ваше втручання.",
    "",    
    "Єгер у капюшоні все ще сидить у кутку. Схоже, він підозрював, що цим усе й скінчиться.",
    "",
    npcQuote("Корчмар", "Корчемний лічильник клацне на 23-й хвилині. Бочка зробить вигляд, що це інша бочка."),
    "",
    "Поки що можна пригостити всіх пивом."
  ].join("\n");
}

export function presentTavernRaidAuditBreak(
  result: Extract<TavernLookupResult | TavernRaidResult, { state: "audit-break" }>
): string {
  return [
    "🛢️ Бочка на переобліку.",
    "",
    "За київським корчемним часом з 03:00 до 07:00 триває ранковий переоблік: корчмар рахує піну, єгер рахує підозри, а Бочка рахує, скільки разів її сьогодні назвали меблями.",
    "",
    npcQuote("Корчмар", "Після переобліку знову можна буде пригодницьки втручатись у бухгалтерію."),
    "",
    `Наступний рейдовий відтинок відкриється через <b>${formatRaidWait(result.nextAvailableAt, result.now)}</b>`
  ].join("\n");
}

export function presentTavernRaidPending(
  result: Extract<TavernRaidResult, { state: "pending" | "pending-started" }>
): string {
  const intro =
    result.state === "pending-started"
      ? "🍺 Рейд почався."
      : "🍺 Рейд ще триває.";
  const flavorSeed = buildPendingRaidFlavorSeed(result);

  return [
    intro,
    "",
    "Ви пішли розбиратися з Бочкою Пінного Міражу. Бочка робить вигляд, що це довга стратегія, а не паніка.",
    "",
    presentRangerRaidAction(result.character, flavorSeed),
    "",
    npcQuote("Корчмар", "Поки ви там, я не видаю нових пригод. У корчмі теж є техніка безпеки."),
    "",
    ...presentRaidPrepHint(result.character, flavorSeed, result.state === "pending"),
    "",
    `Поверніться через <b>${formatRaidWait(result.availableAt, result.now)}</b>`
  ].join("\n");
}

export function presentTavernRaidReadyToComplete(
  result: Extract<TavernLookupResult, { state: "pending-complete" }>
): string {
  return [
    "🍺 Бочка підозріло притихла.",
    "Рейд мав уже завершитись. Лишилось урочисто перевірити, хто кого переміг і чому це знову піна.",
    "",
    `Очікування <b>${result.availableAt <= result.now ? "вже скінчилось" : formatRaidWait(result.availableAt, result.now)}</b>`,
    "",
    "Натисніть <b>🍺 Перевірити бочку</b>."
  ].join("\n");
}

export function presentTavernNoCharacter(): string {
  return "Спершу створіть пригодника через /start. Бочка не воює з анонімами.";
}

export function presentTavernRaidResult(result: Exclude<TavernRaidResult, { state: "no-character" }>): string {
  if (result.state === "pending" || result.state === "pending-started") {
    return presentTavernRaidPending(result);
  }

  if (result.state === "already-completed") {
    return [
      "🍺 Бочка вас пам’ятає.",
      "Цей рейдовий відтинок уже зараховано. Вона все ще трохи нервує.",
      "",
      presentRewardAmount({
        xp: result.reward.xp,
        gold: result.reward.gold,
        label: "Вже отримано"
      }),
      "Новий відтинок відкриється на 23-й хвилині за корчемним лічильником. Або перевірте персонажа: /hero"
    ].join("\n");
  }

  if (result.state === "audit-break") {
    return presentTavernRaidAuditBreak(result);
  }

  const lines = [
    "🍺 Рейд завершено!",
    "Ви штурмували Бочку Пінного Міражу. Бочка відступила стратегічною піною.",
    "",
    presentRewardAmount(result.reward),
    ...presentItemGrantLines(result.reward.itemGrants)
  ];

  return lines.join("\n");
}

export function presentPendingRaidActionBlock(
  result: Extract<TavernPendingRaidResult, { state: "pending" }>
): string {
  const flavorSeed = `${result.periodId}|block:${result.now.toISOString()}`;

  return [
    "🍺 Ви зараз у рейді.",
    "",
    "Інші пригоди тимчасово недоступні: Бочка Пінного Міражу не любить, коли її ігнорують посеред драматичної піни.",
    "",
    ...presentRaidPrepHint(result.character, flavorSeed, true),
    "",
    `Перевірте бочку через <b>${formatRaidWait(result.availableAt, result.now)}</b>`
  ].join("\n");
}

export function presentTavernRoundResult(
  result: Exclude<TavernRoundResult, { state: "no-character" }>
): string {
  if (result.state === "raid-required") {
    return [
      "🍻 Корчмар ховає кухоль.",
      "",
      npcQuote(
        "Корчмар",
        "Не можу підійти. Спочатку розберіться з Бочкою, вона знову робить вигляд, що це її заклад."
      ),
      "",
      ...presentKorchmaRoundLeaderboard(result.leaderboard)
    ].join("\n");
  }

  if (result.state === "not-enough-gold") {
    return [
      "🍻 Корчмар рахує монети.",
      "",
      npcQuote(
        "Корчмар",
        "На всіх не вистачить. Заробіть ще трохи. Кажуть, у льосі миші ведуть дрібний бізнес."
      ),
      "",
      `Маєте: <b>${result.gold} золота</b>`,
      "",
      ...presentKorchmaRoundLeaderboard(result.leaderboard)
    ].join("\n");
  }

  const quality =
    result.state === "fine-round"
      ? "Корчмар виставив якісне пиво. Таке, після якого навіть табурети тримають поставу."
      : "Корчмар виставив просте пиво. Воно просте тільки за ціною; характер у нього складний.";
  const rangerReaction =
    result.state === "fine-round"
      ? "Єгер у кутку двічі плескає в долоні. Для нього це вже майже овація."
      : "Єгер у кутку мовчки піднімає кухоль. Підозріло, але ввічливо.";

  return [
    result.state === "fine-round" ? "🍻 Всім якісного пива!" : "🍻 Всім простого пива!",
    "",
    quality,
    "",
    rangerReaction,
    "",
    `Списано: <b>${result.spentGold} золота</b>`,
    `Залишилось: <b>${result.remainingGold} золота</b>`,
    ...presentNewLeaderLines(result.becameLeader),
    "",
    ...presentKorchmaRoundLeaderboard(result.leaderboard)
  ].join("\n");
}

export function presentTavernRoundOffer(
  result: Exclude<TavernRoundOfferResult, { state: "no-character" }>
): string {
  if (result.state === "raid-required") {
    return presentTavernRoundResult(result);
  }

  if (result.state === "not-enough-gold") {
    return presentTavernRoundResult(result);
  }

  const options = result.canBuyFine
    ? "Можна замовити якісне за 100 золота або просте за 10."
    : "На якісне ще не тягне, але просте за 10 золота вже дивиться у ваш бік.";

  return [
    "🍻 Пригостити всіх пивом",
    "",
    npcQuote(
      "Корчмар",
      "Після Бочки я вже можу підійти. Тільки пальцем покажіть, що саме наливаємо."
    ),
    "",
    options,
    "",
    `У кишені: <b>${result.gold} золота</b>`,
    "",
    ...presentKorchmaRoundLeaderboard(result.leaderboard)
  ].join("\n");
}

export function presentTavernRoundLeaderboard(
  result: Exclude<TavernRoundLeaderboardResult, { state: "no-character" }>
): string {
  return [
    "🍺 Рейдовий доступ до рейтингу",
    "",
    "Корчмар дозволяє дивитися в крейду навіть під час рейду. Торкатися крейди не дозволяє.",
    "",
    ...presentKorchmaRoundLeaderboard(result.leaderboard)
  ].join("\n");
}

function presentKorchmaGreeting(character: CharacterSummary, seed = "korchma-hall"): string[] {
  const flavor = selectKorchmaGreetingLine(character, seed);

  return flavor ? [npcQuote("Корчмар", flavor.text)] : [];
}

function presentRaidPrepHint(character: CharacterSummary, seed: string, rotate: boolean): string[] {
  const flavors = selectCharacterFlavorLines(character, {
    placement: "raid.prep-hint",
    scene: "barrel",
    seed
  }, {
    includeFallback: true,
    limit: 2
  });
  const flavor = rotate ? selectRotatingFlavor(flavors, seed) : flavors[0] ?? null;

  return flavor ? [`<i>Порада дня: ${escapeHtml(flavor.text)}</i>`] : [];
}

function selectRotatingFlavor<T>(flavors: readonly T[], seed: string): T | null {
  if (flavors.length === 0) {
    return null;
  }

  return flavors[hashString(seed) % flavors.length] ?? flavors[0] ?? null;
}

function hashString(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function presentRangerRaidAction(character: CharacterSummary, seed: string): string {
  const flavor = selectCharacterFlavorLine(character, {
    placement: "raid.ranger-action",
    scene: "barrel",
    seed
  });

  return flavor
    ? escapeHtml(flavor.text)
    : "Єгер у капюшоні не втручається. Він мовчить так, ніби це теж професія.";
}

function buildPendingRaidFlavorSeed(
  result: Extract<TavernRaidResult, { state: "pending" | "pending-started" }>
): string {
  if (result.state === "pending-started") {
    return `${result.periodId}|started`;
  }

  return `${result.periodId}|check:${result.now.toISOString()}`;
}

function presentNewLeaderLines(periods: KorchmaRoundLeaderboardPeriod[]): string[] {
  if (periods.length === 0) {
    return [];
  }

  const label = periods.map(presentLeaderboardPeriodName).join(", ");

  return [
    "",
    `🏆 Ви вирвались на перше місце: <b>${label}</b>. Відвідувачі це не забудуть, бо корчмар записав на видному місці.`
  ];
}

function formatRaidWait(availableAt: Date, now: Date): string {
  const remainingMs = Math.max(0, availableAt.getTime() - now.getTime());
  const minutes = Math.max(1, Math.ceil(remainingMs / 60_000));

  return `${minutes} хв.`;
}

function presentKorchmaRoundLeaderboard(leaderboard: KorchmaRoundLeaderboard): string[] {
  return [
    "🏅 Рейтинг щедрості",
    "",
    ...presentLeaderboardSection("За добу", leaderboard.day),
    "",
    ...presentLeaderboardSection("За тиждень", leaderboard.week),
    "",
    ...presentLeaderboardSection("За місяць", leaderboard.month)
  ];
}

function presentDuelLeaderboardSection(
  title: string,
  entries: DuelLeaderboardEntry[],
  shownTitleCharacterIds: Set<string>
): string[] {
  if (entries.length === 0) {
    return [`<b>${title}</b>: ще ніхто не переміг. Крейда лежить гостро, але безробітно.`];
  }

  return [
    `<b>${title}</b>:`,
    ...entries.map((entry, index) =>
      presentDuelLeaderboardEntry(entry, index + 1, shownTitleCharacterIds)
    )
  ];
}

function presentDuelLeaderboardEntry(
  entry: DuelLeaderboardEntry,
  rank: number,
  shownTitleCharacterIds: Set<string>
): string {
  const displayEntry = shownTitleCharacterIds.has(entry.characterId)
    ? { ...entry, activeCosmeticTitle: null }
    : entry;

  shownTitleCharacterIds.add(entry.characterId);

  return [
    `${rank}. ${presentCharacterDisplayName(displayEntry, { boldName: false })} — `,
    `${entry.winCount} ${presentUkrainianCount(entry.winCount, "перемога", "перемоги", "перемог")}`,
    `, ${entry.drawCount} ${presentUkrainianCount(entry.drawCount, "нічия", "нічиї", "нічиїх")}`,
    `, ${entry.lossCount} ${presentUkrainianCount(entry.lossCount, "поразка", "поразки", "поразок")}`
  ].join("");
}

function presentUkrainianCount(
  count: number,
  one: string,
  few: string,
  many: string
): string {
  const lastTwo = count % 100;
  const last = count % 10;

  if (lastTwo >= 11 && lastTwo <= 14) {
    return many;
  }

  if (last === 1) {
    return one;
  }

  if (last >= 2 && last <= 4) {
    return few;
  }

  return many;
}

function presentLeaderboardSection(
  title: string,
  entries: KorchmaRoundLeaderboardEntry[]
): string[] {
  if (entries.length === 0) {
    return [`<b>${title}</b>: ще ніхто не пригощав. Корчмар тримає крейду напоготові.`];
  }

  return [
    `<b>${title}</b>:`,
    ...entries.map((entry, index) => presentLeaderboardEntry(entry, index + 1))
  ];
}

function presentLeaderboardEntry(entry: KorchmaRoundLeaderboardEntry, rank: number): string {
  const count = `${entry.roundCount} ${presentRoundCount(entry.roundCount)}`;

  return `${rank}. ${escapeHtml(entry.name)} — ${count} · ${entry.spentGold} золота`;
}

function presentRoundCount(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;

  if (lastTwo >= 11 && lastTwo <= 14) {
    return "частувань";
  }

  if (last === 1) {
    return "частування";
  }

  if (last >= 2 && last <= 4) {
    return "частування";
  }

  return "частувань";
}

function presentLeaderboardPeriodName(period: KorchmaRoundLeaderboardPeriod): string {
  switch (period) {
    case "day":
      return "доба";
    case "week":
      return "тиждень";
    case "month":
      return "місяць";
  }
}

function presentItemGrantLines(itemGrants: Array<{ name: string; quantity: number }>): string[] {
  if (itemGrants.length === 0) {
    return [];
  }

  return itemGrants.map(
    (grant) =>
      presentRewardItemGrant({
        name: escapeHtml(grant.name),
        quantity: grant.quantity
      })
  );
}

function presentKorchmaArrivalEntries(board: KorchmaArrivalBoard): string[] {
  if (board.entries.length === 0) {
    return [
      "Зарубок ще немає. Навіть пил намагається не брати на себе відповідальність."
    ];
  }

  return [
    "Останні зарубки:",
    ...board.entries.map((entry) => {
      const level = entry.level === undefined ? "" : ` · рівень ${entry.level}`;

      return `• ${presentCharacterDisplayName(entry, { boldName: false })}${level} · ${escapeHtml(entry.locationName)}`;
    })
  ];
}

function presentLevelMilestoneEntries(milestones: LevelMilestoneBoard | undefined): string[] {
  if (!milestones || milestones.levels.length === 0) {
    return [
      "<b>Видатні жителі</b>",
      "Поки що ніхто не встиг офіційно вирости настільки, щоб дошка перестала вдавати меблі."
    ];
  }

  return [
    "<b>Видатні жителі</b>",
    "Перші зарубки за рівні:",
    ...milestones.levels.map((group) => {
      const entries = group.entries
        .map((entry) => `${presentMilestoneRank(entry.rank)} ${escapeHtml(entry.name)}`)
        .join(" · ");

      return `• рівень ${group.level}: ${entries}`;
    })
  ];
}

function presentRemortLevelMilestoneEntries(milestones: LevelMilestoneBoard | undefined): string[] {
  if (!milestones || milestones.levels.length === 0) {
    return [
      "Для цього реморту зарубок за рівні ще немає. Або їх ніхто не зробив, або дошка тоді ще вдавала полицю."
    ];
  }

  return milestones.levels.map((group) => {
    const entries = group.entries
      .map((entry) => `${presentMilestoneRank(entry.rank)} ${escapeHtml(entry.name)}`)
      .join(" · ");

    return `• рівень ${group.level}: ${entries}`;
  });
}

function presentRemortBoardEntries(remorts: RemortBoard | undefined): string[] {
  if (!remorts || remorts.remorts.length === 0) {
    return [
      "<b>🕯️ Реморти Тринадцятки</b>",
      "Ще ніхто не повертався з тринадцятого рівня так офіційно, щоб дошка попросила другу свічку."
    ];
  }

  if (remorts.remorts.length === 1 && remorts.remorts[0]?.remortNumber === 1) {
    const entries = remorts.remorts[0].entries
      .slice(0, 3)
      .map((entry) => `${presentMilestoneRank(entry.rank)} ${escapeHtml(entry.name)}`)
      .join(" · ");

    return ["<b>🕯️ Реморти Тринадцятки</b>", entries];
  }

  return [
    "<b>🕯️ Реморти Тринадцятки</b>",
    ...remorts.remorts.map((group) => {
      const entries = group.entries
        .slice(0, 3)
        .map((entry) => `${presentMilestoneRank(entry.rank)} ${escapeHtml(entry.name)}`)
        .join(" · ");

      return `• реморт ${group.remortNumber}: ${entries}`;
    })
  ];
}

function presentMilestoneRank(rank: number): string {
  if (rank === 1) {
    return "🥇";
  }

  if (rank === 2) {
    return "🥈";
  }

  if (rank === 3) {
    return "🥉";
  }

  return `${rank}.`;
}

function presentTavernPresence(
  presence: PresenceGroup | null | undefined,
  viewerTelegramUserId?: bigint
): string[] {
  if (isOnlyActiveViewer(presence, viewerTelegramUserId)) {
    return ["За столами: поки тільки ви й підозрілий єгер у кутку біля бочки."];
  }

  if (!presence || presence.total === 0) {
    return [
      "За столами: живих пригодників не видно. Підозрілий єгер у кутку біля бочки стверджує, що це теж статистика."
    ];
  }

  const activeCount = presence.active.length;
  const idleCount = presence.idle.length;
  const summary = [`${activeCount} ${pluralizeActive(activeCount)}`];

  if (idleCount > 0) {
    summary.push(`${idleCount} ${pluralizeIdle(idleCount)}`);
  }

  const lines = [
    `За столами й закутками корчми: ${summary.join(", ")}. Підозрілий єгер у кутку біля бочки не рахується, бо відмовився бути числом.`
  ];

  return lines;
}

function isOnlyActiveViewer(
  presence: PresenceGroup | null | undefined,
  viewerTelegramUserId?: bigint
): boolean {
  return (
    viewerTelegramUserId !== undefined &&
    presence?.total === 1 &&
    presence.active.length === 1 &&
    presence.idle.length === 0 &&
    presence.active[0]?.telegramUserId === viewerTelegramUserId
  );
}

function pluralizeActive(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;

  if (lastTwo >= 11 && lastTwo <= 14) {
    return "активних";
  }

  if (last === 1) {
    return "активний";
  }

  if (last >= 2 && last <= 4) {
    return "активні";
  }

  return "активних";
}

function pluralizeIdle(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;

  if (lastTwo >= 11 && lastTwo <= 14) {
    return "притихлих";
  }

  if (last === 1) {
    return "притихлий";
  }

  if (last >= 2 && last <= 4) {
    return "притихлі";
  }

  return "притихлих";
}
