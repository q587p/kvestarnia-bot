import { KOSTI_PLAYER_CAP, TAVLEI_PLAYER_CAP, type TavernGameResolution, type TavernGameKey } from "../../domain/tavernGames";
import type { TavernGameHubResult } from "../../services/tavernGameService";
import type {
  TavernGameLeaderboard,
  TavernGameLeaderboardEntry,
  TavernGameSessionRecord
} from "../../db/repositories/tavernGameRepository";
import { presentCharacterDisplayName } from "./characterDisplay";
import { escapeHtml } from "./telegramHtml";

export function presentTavernGameHub(result: TavernGameHubResult): string {
  if (result.state === "disabled") {
    return "🎲 Ігри за столом ще не відчинені. Корчмар уже свариться з правилами, але гостей поки не садить.";
  }
  if (result.state !== "ready") {
    return "🎲 Цей стіл ще не відчинений.";
  }

  const lines = [
    "🎲 Ігри за столом",
    "",
    "У кутку шинку стукають фішки, гримлять кості й хтось уже шепоче, що сьогодні рука добра.",
    "",
    `Найбільша ставка зараз: <b>${result.maxStake} зол.</b>`,
    ""
  ];

  if (result.openTables.length === 0) {
    lines.push(
      "Поки що ніхто не тримає стіл.",
      "Можеш першим розкласти тавлеї або покликати людей на кості."
    );
  } else {
    lines.push("Відкриті столи:");
    lines.push(...result.openTables.slice(0, 8).map(presentOpenTableLine));
  }

  return lines.join("\n");
}

export function presentTavernGameRules(gameKey: TavernGameKey, maxStake: number): string {
  if (gameKey === "tavlei") {
    return [
      "♟ Тавлеї",
      "",
      "Двоє гравців ставлять однакову суму й обирають тактику.",
      "Партія розігрується автоматично: важать розум, трохи вдачі й те, чи вгадав ти намір суперника.",
      "",
      "Нічия повертає ставки.",
      "",
      `Межа ставки зараз: <b>${maxStake} зол.</b>`
    ].join("\n");
  }

  return [
    "🎲 Кості",
    "",
    "За стіл сідають від двох до семи гравців. Кожен обирає стиль кидка й знак.",
    "Найкраща рука бере основний банк. Ті, чий знак справдився, ділять знаковий банк.",
    "",
    `Межа ставки зараз: <b>${maxStake} зол.</b>`
  ].join("\n");
}

export function presentTavernGameLeaderboard(result: {
  state: string;
  leaderboard?: TavernGameLeaderboard;
}): string {
  if (result.state === "disabled") {
    return "🎲 Ігри за столом ще не відчинені.";
  }
  if (result.state !== "ready" || !result.leaderboard) {
    return "🏆 Рейтинг столів зараз не читається. Крейда образилась на дошку.";
  }

  const shownTitleCharacterIds = new Set<string>();

  return [
    "🏆 Рейтинг ігор за столом",
    "",
    "Корчмар рахує завершені Тавлеї та Кості. Нагород тут немає, зате є крейда, яка все бачила.",
    "",
    ...presentLeaderboardSection("За добу", result.leaderboard.day, shownTitleCharacterIds),
    "",
    ...presentLeaderboardSection("За тиждень", result.leaderboard.week, shownTitleCharacterIds),
    "",
    ...presentLeaderboardSection("За місяць", result.leaderboard.month, shownTitleCharacterIds)
  ].join("\n");
}

export function presentTavernGameActionResult(result: {
  state: string;
  reason?: string;
  gameKey?: TavernGameKey;
  maxStake?: number;
  stakeGold?: number;
  availableAt?: Date;
  session?: TavernGameSessionRecord;
  resolution?: TavernGameResolution | null;
  character?: { gold: number };
  now?: Date;
}): string {
  if (result.resolution) {
    return presentTavernGameResolution(result.resolution);
  }

  switch (result.state) {
    case "disabled":
      return "🎲 Ігри за столом ще не відчинені.";
    case "game-disabled":
      return "Цей стіл ще не виставили. Корчмар ховає правила під рахівницею.";
    case "game-disabled-refunded":
      return "Цей стіл зараз зачинений. Корчмар повернув ставки й вдає, що так і було задумано.";
    case "invalid-stake":
      return `Ставка має бути від 1 до ${result.maxStake ?? 25} зол.`;
    case "invalid-decision":
      return "Ця кнопка вже не діє, але стіл не постраждав.";
    case "no-character":
      return "Спершу створіть пригодника через /start. Корчмар не садить за стіл порожню анкету.";
    case "blocked":
      return presentBlockReason(result.reason);
    case "not-found":
      return "Цей стіл уже зник зі шинку.";
    case "closed":
      return "Цей стіл уже закритий.";
    case "full":
      return "На жаль, за столом уже немає місця.";
    case "self-join":
      return "У тавлеї потрібен суперник. Грати проти власної тіні корчмар дозволяє лише після опівночі.";
    case "already-joined":
      return result.session ? presentTavernGameSession(result.session) : "Ви вже сидите за цим столом.";
    case "insufficient-gold":
      return "Бракує золота для цієї ставки.";
    case "active-session":
      return result.session
        ? ["Ти вже сидиш за іншим ставковим столом.", "", presentTavernGameSession(result.session)].join("\n")
        : "Ти вже сидиш за іншим ставковим столом.";
    case "cooldown":
      return presentCreateCooldown(result.availableAt, result.now);
    case "created":
      return result.session ? presentTavernGameSession(result.session) : "Стіл відкрито.";
    case "joined":
      return result.session ? presentTavernGameSession(result.session) : "Ви сіли за стіл.";
    case "decided":
      return result.session ? ["Вибір записано.", "", presentTavernGameSession(result.session)].join("\n") : "Вибір записано.";
    case "replayed":
      return result.session ? ["Цей вибір уже записано.", "", presentTavernGameSession(result.session)].join("\n") : "Цей вибір уже записано.";
    case "not-participant":
      return "За цим столом для вас немає стільця.";
    case "not-creator":
      return "Цю дію може зробити лише той, хто тримає стіл.";
    case "not-ready":
      return result.session ? presentTavernGameSession(result.session) : "Стіл ще не готовий.";
    case "cancelled":
      return "Стіл скасовано, ставку повернено.";
    case "not-cancellable":
      return "Скасувати можна лише відкритий стіл, де ще ніхто не підсів. Цей стіл уже рушив, тож скасування більше не діє.";
    case "failed-refund":
      return "Стіл спіткнувся на підрахунку. Корчмар повернув ставки й записав це у ганебну книгу.";
    default:
      return "Ця кнопка вже не діє, але стіл не постраждав.";
  }
}

export function presentTavernGameSession(session: TavernGameSessionRecord): string {
  const lines = [
    `${gameLabel(session.gameKey)} · ставка <b>${session.stakeGold} зол.</b>`,
    `За столом: ${session.participants.map((participant) => escapeHtml(participant.displayName)).join(", ")}`,
    `Банк: <b>${session.potGold} зол.</b>`
  ];

  if (session.status === "open") {
    lines.push(session.gameKey === "kosti"
      ? "Можна обрати стиль і знак. Кидок почнеться, коли стіл матиме щонайменше двох гравців."
      : "Чекаємо другого гравця.");
  } else if (session.status === "ready") {
    lines.push(session.gameKey === "tavlei"
      ? "Оберіть тактику. Коли обидва зроблять вибір, партія завершиться сама."
      : "Кості вже готові гримнути по столу.");
  }

  return lines.join("\n");
}

function presentTavernGameResolution(resolution: TavernGameResolution): string {
  if (resolution.gameKey === "tavlei") {
    if (resolution.outcome === "draw") {
      return [
        "♟ Тавлеї завершено.",
        "",
        "Партія вперлася в глухий кут. Обоє бачили перемогу, але жоден не дав їй сісти за стіл.",
        "",
        "🤝 Нічия.",
        "💰 Ставки повернено."
      ].join("\n");
    }

    return [
      "♟ Тавлеї завершено.",
      "",
      `${escapeHtml(resolution.winnerName)} забрав партію саме тоді, коли фішки вже почали робити вигляд, що вони тут головні.`,
      "",
      `🏆 Перемога: <b>${escapeHtml(resolution.winnerName)}</b>`,
      `💰 Виграш: <b>${resolution.payouts[resolution.winnerCharacterId] ?? resolution.potGold} зол.</b>`
    ].join("\n");
  }

  const rows = resolution.players
    .map((player) =>
      `${escapeHtml(player.name)}: ${player.dice.join(" ")} — ${kostiHandLabel(player.handLabel)}.`
    )
    .join("\n");
  const signLine = resolution.signWinnerNames.length === 0
    ? "✨ Жоден знак не справдився, тож решта банку лишається переможцю."
    : resolution.signWinnerNames.length === 1
      ? `✨ Знаковий банк бере ${escapeHtml(resolution.signWinnerNames[0] ?? "")}: <b>${resolution.signShareGold} зол.</b>`
      : `✨ Знаковий банк ділять ${resolution.signWinnerNames.map(escapeHtml).join(", ")}: по <b>${resolution.signShareGold} зол.</b>`;

  return [
    "🎲 Кості гримнули по столу.",
    "",
    rows,
    "",
    `🏆 Основний банк бере <b>${escapeHtml(resolution.mainWinnerName)}</b>: <b>${resolution.payouts[resolution.mainWinnerCharacterId] ?? resolution.mainPoolGold} зол.</b>`,
    signLine
  ].join("\n");
}

function presentOpenTableLine(session: TavernGameSessionRecord): string {
  const cap = session.gameKey === "kosti" ? KOSTI_PLAYER_CAP : TAVLEI_PLAYER_CAP;
  return `• ${gameLabel(session.gameKey)} · ${session.participants.length}/${cap} · ставка ${session.stakeGold} зол. · тримає ${escapeHtml(session.creator.name)}`;
}

function presentLeaderboardSection(
  title: string,
  entries: TavernGameLeaderboardEntry[],
  shownTitleCharacterIds: Set<string>
): string[] {
  if (entries.length === 0) {
    return [`<b>${title}</b>: ще ніхто не дограв. Дошка тримає крейду напоготові.`];
  }

  return [
    `<b>${title}</b>:`,
    ...entries.map((entry, index) =>
      presentLeaderboardEntry(entry, index + 1, shownTitleCharacterIds)
    )
  ];
}

function presentLeaderboardEntry(
  entry: TavernGameLeaderboardEntry,
  rank: number,
  shownTitleCharacterIds: Set<string>
): string {
  const displayEntry = shownTitleCharacterIds.has(entry.characterId)
    ? { ...entry, activeCosmeticTitle: null }
    : entry;

  shownTitleCharacterIds.add(entry.characterId);

  return [
    `${rank}. ${presentCharacterDisplayName(displayEntry, { boldName: false })} — `,
    `${entry.winCount} ${pluralize(entry.winCount, "перемога", "перемоги", "перемог")}`,
    `, ${entry.drawCount} ${pluralize(entry.drawCount, "нічия", "нічиї", "нічиїх")}`,
    `, ${entry.lossCount} ${pluralize(entry.lossCount, "поразка", "поразки", "поразок")}`
  ].join("");
}

function presentBlockReason(reason: string | undefined): string {
  if (reason === "wrong-place") {
    return "Зараз не до шинкових ігор. Поверніться до Шинку.";
  }
  if (reason === "active-combat") {
    return "Спершу завершіть бій. Кості не люблять, коли ними кидають у монстрів.";
  }
  if (reason === "pending-raid") {
    return "Спершу завершіть рейд на Бочку. Вона ревниво ставиться до ставок.";
  }

  return "Зараз не до шинкових ігор.";
}

function presentCreateCooldown(availableAt: Date | undefined, now: Date | undefined): string {
  const lines = [
    "Новий стіл ще на паузі.",
    "Ви вже створювали стіл зовсім недавно. Це обмеження на створення нових столів, а не ознака, що десь уже відкрита партія."
  ];

  if (availableAt && now) {
    lines.push(`Спробуйте ще раз за ${formatCooldown(availableAt, now)}.`);
  } else {
    lines.push("Спробуйте ще раз трохи згодом.");
  }

  return lines.join("\n");
}

function gameLabel(gameKey: TavernGameKey): string {
  return gameKey === "kosti" ? "🎲 Кості" : "♟ Тавлеї";
}

function kostiHandLabel(label: string): string {
  const labels: Record<string, string> = {
    five_kind: "пʼятірня",
    straight: "шлях",
    four_kind: "четвірня",
    full_house: "повна хата",
    triple: "трійня",
    two_pairs: "дві пари",
    pair: "пара",
    high: "старша кістка"
  };
  return labels[label] ?? "рука";
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
