import type {
  KorchmaRoundLeaderboardPeriod,
  TavernLookupResult,
  TavernPendingRaidResult,
  TavernRaidResult,
  TavernRoundOfferResult,
  TavernRoundResult
} from "../../services/tavernRaidService";
import type { CharacterSummary } from "../../domain/characters/characterSummary";
import type {
  KorchmaRoundLeaderboard,
  KorchmaRoundLeaderboardEntry
} from "../../db/repositories/korchmaRoundPurchaseRepository";
import type { PresenceGroup } from "../../services/presenceService";
import { selectCharacterFlavorLine } from "../../content/characterFlavor";
import { presentRewardAmount, presentRewardItemGrant } from "./rewardPresenter";
import { escapeHtml, npcQuote } from "./telegramHtml";

export function presentKorchmaFront(character: CharacterSummary): string {
  return [
    "🚪 Перед корчмою",
    presentCharacterHeader(character),
    "",
    "За дверима гуде Корчма Квестарні. Там видають квести, сперечаються з бочками й іноді не питають зайвого.",
    "",
    "Усередині вже чекають:",
    "• Стіл зі справами: квести, сутички й документи, які самі себе не підозрюють.",
    "• Бочка Пінного Міражу: рейд, піна й бухгалтерія з характером.",
    "• Підвал: миша, дрібний бізнес і дуже серйозні серветки.",
    "• Дошка вістей: новини, які корчмар прибив, поки вони не втекли.",
    "",
    "Натисніть «🚪 Зайти в корчму» або відкрийте двері через /tavern."
  ].join("\n");
}

export function presentKorchmaHall(
  character: CharacterSummary,
  presence?: PresenceGroup | null,
  viewerTelegramUserId?: bigint
): string {
  return [
    "🍺 Зала корчми",
    presentCharacterHeader(character),
    "",
    "Корчма Квестарні тримає тепло, шум і кілька справ, які краще не залишати без нагляду.",
    "",
    "Праворуч стоїть <i>Стіл зі справами</i>, у кутку піниться <i>Бочка Пінного Міражу</i>, під ногами бурчить <i>Підвал</i>, а біля дверей висить <i>Дошка вістей</i>.",
    "",
    ...presentKorchmaGreeting(character),
    "",
    ...presentTavernPresence(presence, viewerTelegramUserId),
    "",
    "Куди йдемо?"
  ].join("\n");
}

export function presentTavern(character: CharacterSummary): string {
  return [
    "🛢️ Біля Бочки Пінного Міражу",
    presentCharacterHeader(character),
    "",
    "У кутку героїчно піниться Бочка Пінного Міражу.",
    "",
    "Поруч із нею сидить людисько-єгер у капюшоні, курить трубку й дивиться на всіх так, ніби вже бачив їхні сліди.",
    "",
    npcQuote("Корчмар", "Це не проблема. Дві-три хвилини. Максимум."),
    ...presentRaidPrepHint(character),
    "",
    "Що робимо?"
  ].join("\n");
}

export function presentTavernAlreadyRaided(character: CharacterSummary): string {
  return [
    "🛢️ Біля Бочки Пінного Міражу",
    presentCharacterHeader(character),
    "",
    "Бочка Пінного Міражу в цьому відтинку вже пережила ваш героїзм.",
    "Єгер у капюшоні все ще сидить у кутку. Схоже, він підозрював, що цим усе й скінчиться.",
    "",
    npcQuote("Корчмар", "Лічильник клацне на 23-й хвилині. Бочка зробить вигляд, що це інша бочка."),
    "",
    "Поки що можна пригостити всіх пивом або перевірити героя: /hero"
  ].join("\n");
}

export function presentTavernRaidAuditBreak(
  result: Extract<TavernLookupResult | TavernRaidResult, { state: "audit-break" }>
): string {
  return [
    "🛢️ Бочка на переобліку.",
    "З 04:00 до 08:23 корчмар рахує піну, єгер рахує підозри, а Бочка рахує, скільки разів її сьогодні назвали меблями.",
    "",
    npcQuote("Корчмар", "Після переобліку знову можна буде героїчно втручатись у бухгалтерію."),
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

  return [
    intro,
    "Ви пішли розбиратися з Бочкою Пінного Міражу. Бочка робить вигляд, що це довга стратегія, а не паніка.",
    "Єгер у капюшоні не втручається. Тільки курить трубку й дивиться так, ніби вже знає, кому дістанеться піна.",
    "",
    npcQuote("Корчмар", "Поки ви там, я не видаю нових пригод. У корчмі теж є техніка безпеки."),
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
  return "Спершу створіть героя через /start. Бочка не воює з анонімами.";
}

export function presentTavernRanger(character: CharacterSummary): string {
  return [
    "🧥 Єгер у кутку",
    "",
    "У темному кутку сидить людисько-єгер у капюшоні. Він курить трубку, підозріло дивиться на всіх і має вигляд людини, яка точно не чекає на сюжетний гачок.",
    "",
    npcQuote("Єгер", presentRangerReaction(character))
  ].join("\n");
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
      "Новий відтинок відкриється на 23-й хвилині наступної години. Або перевірте героя: /hero"
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
  return [
    "🍺 Ви зараз у рейді.",
    "Інші пригоди тимчасово недоступні: Бочка Пінного Міражу не любить, коли її ігнорують посеред драматичної піни.",
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
        "На всіх не вистачить. Заробіть ще трохи. Кажуть, у підвалі миші ведуть дрібний бізнес."
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

function presentCharacterHeader(character: CharacterSummary): string {
  return `<b>${escapeHtml(character.name)}</b> · <i>${escapeHtml(character.title)}</i>`;
}

function presentKorchmaGreeting(character: CharacterSummary): string[] {
  const flavor = selectCharacterFlavorLine(character, {
    placement: "korchma.greeting"
  });

  return flavor ? [npcQuote("Корчмар", flavor.text)] : [];
}

function presentRaidPrepHint(character: CharacterSummary): string[] {
  const flavor = selectCharacterFlavorLine(character, {
    placement: "raid.prep-hint",
    scene: "barrel"
  });

  return flavor ? ["", `<i>Порада дня: ${escapeHtml(flavor.text)}</i>`] : [];
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

function presentTavernPresence(
  presence: PresenceGroup | null | undefined,
  viewerTelegramUserId?: bigint
): string[] {
  if (isOnlyActiveViewer(presence, viewerTelegramUserId)) {
    return ["За столами: поки тільки ви й підозрілий єгер у кутку біля бочки."];
  }

  if (!presence || presence.total === 0) {
    return [
      "За столами: живих героїв не видно. Єгер у кутку біля бочки стверджує, що це теж статистика."
    ];
  }

  const activeCount = presence.active.length;
  const idleCount = presence.idle.length;
  const summary = [`${activeCount} ${pluralizeActive(activeCount)}`];

  if (idleCount > 0) {
    summary.push(`${idleCount} ${pluralizeIdle(idleCount)}`);
  }

  const lines = [
    `За столами й закутками корчми: ${summary.join(", ")}. Єгер у кутку біля бочки не рахується, бо відмовився бути числом.`
  ];
  const people = [...presence.active, ...presence.idle].slice(0, 5);
  const hiddenCount = Math.max(0, presence.total - people.length);
  lines.push(...people.map((person) => `• ${presentPresencePerson(person)}`));

  if (hiddenCount > 0) {
    lines.push(`• і ще ${hiddenCount}`);
  }

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

function presentPresencePerson(person: PresenceGroup["active"][number]): string {
  const level = person.level === undefined ? "" : ` · рівень ${person.level}`;

  return `${escapeHtml(person.name)}${level}`;
}

function presentRangerReaction(character: CharacterSummary): string {
  if (character.raceId === "race.human-ish" && character.classId === "class.ranger") {
    return "Людисько-єгер. Нарешті хтось, хто розуміє, що капюшон — це не стиль, а документація намірів.";
  }

  if (character.raceId === "race.domovyk") {
    return "На мить я подумав про гобітів. Але їх тут немає з причин, які корчмар називає «ліцензійною магією».";
  }

  if (character.classId === "class.ranger") {
    return "Єгер єгеря бачить здалеку. Навіть якщо один із них робить вигляд, що просто сидить біля бочки.";
  }

  if (character.classId === "class.rogue") {
    return "Ваші руки надто чесно поводяться. Це мене непокоїть.";
  }

  if (character.raceId === "race.elf") {
    return "Ельф у корчмі — це завжди або балада, або скарга на дим. Сьогодні перевіримо, що швидше.";
  }

  if (character.classId === "class.bureaucramancer") {
    return "Якщо у вас є форма на підозрілий погляд, не показуйте. Я працюю без печаток.";
  }

  return "Сидіть рівно. Не тому, що небезпечно. Просто так легше зрозуміти, хто першим збреше.";
}
