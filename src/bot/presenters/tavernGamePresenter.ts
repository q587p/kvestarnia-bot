import { KOSTI_PLAYER_CAP, TAVLEI_PLAYER_CAP, type TavernGameResolution, type TavernGameKey } from "../../domain/tavernGames";
import {
  DICE_POKER_SCORE_CATEGORIES,
  evaluateQuickHand,
  isDicePokerState,
  isDicePokerTableState,
  previewScorecardScores,
  totalScorecard,
  type DicePokerQuickHand,
  type DicePokerQuickRank,
  type DicePokerScoreCategory,
  type DicePokerState
} from "../../domain/dicePoker";
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
    "🎲 Кості й покер",
    "",
    "Кості в Корчмі нарешті пояснили правила людською мовою.",
    "",
    "⚡ Швидкі кості — коротка дуель: 5 костей, один перекид, сильніша комбінація перемагає.",
    "📜 Табличні кості — довша партія на 13 ходів із клітинками для очок.",
    "",
    "Спершу оберіть режим. Ставку корчма спитає наступним кроком.",
    `Межа ставки зараз: <b>${maxStake} зол.</b>`
  ].join("\n");
}

export function presentDicePokerStakeMenu(
  mode: "quick" | "scorecard",
  maxStake: number,
  options: { doppelgangerAvailable?: boolean } = {}
): string {
  const doppelgangerAvailable = options.doppelgangerAvailable ?? true;

  return [
    mode === "quick" ? "⚡ Швидкі кості" : "📜 Табличні кості",
    "",
    mode === "quick"
      ? "Коротка дуель: один кидок, один перекид, далі сильніша комбінація бере партію."
      : "Таблична партія на 13 ходів: кидаєте кості, перекидаєте до двох разів і вписуєте рахунок у клітинки.",
    "",
    doppelgangerAvailable
      ? "Оберіть ставку: 👥 відкриє стіл для інших гравців, 🪞 посадить Допельґанґера."
      : "Оберіть ставку для столу. Допельґанґер зараз у бійцівському кутку.",
    `Межа ставки зараз: <b>${maxStake} зол.</b>`
  ].join("\n");
}

export function presentDicePokerRules(): string {
  return [
    "❔ Правила костяного покеру",
    "",
    "⚡ Швидкі кості: дуель двох гравців. У кожного 5 костей і один перекид; далі перемагає сильніша комбінація.",
    "",
    "Сила рук: Покер, Каре, Фул-хаус, Великий стріт, Малий стріт, Трійка, Дві пари, Пара, Старша кістка.",
    "",
    "📜 Табличні кості: стіл на 2–8 гравців. У кожного 13 ходів; у ході є перший кидок і до двох перекидів, потім результат іде у вільну клітинку.",
    "",
    "Нічиї, скасування й протерміновані партії не забирають манатки й не дублюють винагороду."
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
    "Корчмар рахує завершені тавлеї та кості. Нагород тут немає, зате є крейда, яка все бачила.",
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
  dicePoker?: DicePokerState;
  viewerTelegramUserId?: bigint | undefined;
  character?: { gold: number };
  now?: Date;
}): string {
  if (result.resolution) {
    return presentTavernGameResolution(result.resolution);
  }
  const dicePoker = result.dicePoker ?? getSessionDicePoker(result.session, result.viewerTelegramUserId);
  if (dicePoker && ["created", "started", "saved", "completed", "active-session"].includes(result.state)) {
    if (result.session && isDicePokerTableState(result.session.result)) {
      return presentDicePokerTableState(result.session, dicePoker, result.state);
    }
    return presentDicePokerState(result.session, dicePoker, result.state);
  }
  if (result.session && isDicePokerTableState(result.session.result) && ["created", "joined", "started", "saved", "replayed", "active-session"].includes(result.state)) {
    return presentDicePokerTableSession(result.session);
  }

  switch (result.state) {
    case "disabled":
      return "🎲 Ігри за столом ще не відчинені.";
    case "game-disabled":
      return "Цей стіл ще не виставили. Корчмар ховає правила під рахівницею.";
    case "game-disabled-refunded":
      return "Цей стіл зараз зачинений. Корчмар повернув ставки й вдає, що так і було задумано.";
    case "invalid-stake":
      return `Ставка має бути від 1 до ${result.maxStake ?? 93} зол.`;
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
    case "stale":
      return "Стара кнопка від старих костей більше не діє. Якщо там була ставка, корчмар уже повернув її без зайвої драми.";
    case "full":
      return "На жаль, за столом уже немає місця.";
    case "self-join":
      return "У тавлеї потрібен інший пригодник. Власна тінь уже відмовилась підписувати рівну ставку.";
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
    case "started":
      return result.session ? presentTavernGameSession(result.session) : "Партія почалась.";
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
  const dicePoker = getSessionDicePoker(session);
  if (dicePoker) {
    return presentDicePokerState(session, dicePoker, "active-session");
  }
  if (isDicePokerTableState(session.result)) {
    return presentDicePokerTableSession(session);
  }

  const lines = [
    `${gameLabel(session.gameKey)} · ставка <b>${session.stakeGold} зол.</b>`,
    `За столом: ${session.participants.map((participant) => escapeHtml(participant.displayName)).join(", ")}`,
    `Банк: <b>${session.potGold} зол.</b>`
  ];

  if (session.status === "open") {
    lines.push(session.gameKey === "kosti"
      ? "Можна обрати стиль і знак. Кидок почнеться, коли творець натисне «Кинути зараз», стіл заповниться або час збору добіжить кінця."
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
  const table = isDicePokerTableState(session.result) ? session.result : null;
  const cap = table?.playerCap ?? (session.gameKey === "kosti" ? KOSTI_PLAYER_CAP : TAVLEI_PLAYER_CAP);
  const label = table ? dicePokerTableTitle(table.mode) : gameLabel(session.gameKey);
  return `• ${label} · ${session.participants.length}/${cap} · ставка ${session.stakeGold} зол. · тримає ${escapeHtml(session.creator.name)}`;
}

function presentDicePokerState(
  session: TavernGameSessionRecord | undefined,
  state: DicePokerState,
  resultState: string
): string {
  const stakeLine = session ? `Ставка: <b>${session.stakeGold} зол.</b>` : null;

  if (state.mode === "quick") {
    if (state.phase === "terminal") {
      const rewardLine = presentDicePokerStakeResult(session, state.outcome);
      return [
        "⚡ Швидкі кості",
        "",
        `Твої кості: ${state.playerDice.join(" ")} — ${quickHandLabel(state.playerHand)}.`,
        "",
        `Кості Допельґанґера: ${state.opponentDice.join(" ")} — ${quickHandLabel(state.opponentHand)}.`,
        "",
        presentQuickOutcomeLine(state),
        "",
        rewardLine
      ].join("\n");
    }

    return [
      "⚡ Швидкі кості",
      "",
      state.drawRound > 1 ? `Додатковий раунд: ${state.drawRound}/3` : null,
      `Твої кості: ${state.playerDice.join(" ")} — ${quickHandLabel(evaluateQuickHand(state.playerDice))}.`,
      `Кості Допельґанґера: ${state.opponentDice.join(" ")} — ${quickHandLabel(evaluateQuickHand(state.opponentDice))}.`,
      `Вибрано для перекиду: ${presentSelectedDice(state.playerDice, state.selectedMask)}.`,
      "",
      "Обери кості для одного перекиду або лиши кидок як є.",
      stakeLine
    ].filter((line): line is string => line !== null).join("\n");
  }

  if (state.phase === "terminal") {
    const rewardLine = presentDicePokerStakeResult(session, "scorecard-complete", state.total);
    return [
      "📜 Табличні кості завершено",
      "",
      `Останні кості: ${state.dice.join(" ")}`,
      presentScorecardSummary(state.scores),
      "",
      `Підсумок: <b>${state.total}</b> очк.`,
      rewardLine
    ].join("\n");
  }

  const previews = previewScorecardScores(state.dice, state.scores);
  return [
    "📜 Табличні кості",
    "",
    `Хід ${state.turn}/13`,
    `Кидок ${state.roll}/3`,
    `Кості: ${state.dice.join(" ")}`,
    `Вибрано: ${presentSelectedDice(state.dice, state.selectedMask)}.`,
    "",
    presentScorecardSummary(state.scores),
    "",
    "Попередній рахунок:",
    ...presentScorePreview(previews),
    "",
    resultState === "saved" ? "Обери перекид або клітинку для запису." : "Обери кості для перекиду або клітинку для запису.",
    stakeLine
  ].filter(Boolean).join("\n");
}

function presentDicePokerTableSession(session: TavernGameSessionRecord): string {
  const table = isDicePokerTableState(session.result) ? session.result : null;
  if (!table) {
    return presentTavernGameSession(session);
  }

  const lines = [
    dicePokerTableTitle(table.mode),
    "",
    `За столом: ${session.participants.map((participant) => escapeHtml(participant.displayName)).join(", ")}`,
    `Місця: ${session.participants.length}/${table.playerCap}`,
    `Ставка: <b>${session.stakeGold} зол.</b> · банк: <b>${session.potGold} зол.</b>`
  ];

  if (table.phase === "waiting") {
    lines.push(
      "",
      table.mode === "quick"
        ? "Чекаємо другого гравця. Як тільки він сяде, дуель почнеться."
        : "Чекаємо гравців. Почати можна від двох учасників; максимум — вісім."
    );
  } else if (table.phase === "playing") {
    lines.push("", "Партія йде. Кожен гравець робить свій хід на своїй картці.");
  } else {
    lines.push("", ...presentDicePokerTableResults(session, table.outcomes ?? {}, table.totals));
  }

  return lines.join("\n");
}

function presentDicePokerTableState(
  session: TavernGameSessionRecord,
  state: DicePokerState,
  resultState: string
): string {
  const table = isDicePokerTableState(session.result) ? session.result : null;
  if (!table) {
    return presentDicePokerState(session, state, resultState);
  }
  if (table.phase === "waiting") {
    return presentDicePokerTableSession(session);
  }

  if (table.phase === "terminal") {
    return [
      dicePokerTableTitle(table.mode),
      "",
      ...presentDicePokerTableResults(session, table.outcomes ?? {}, table.totals)
    ].join("\n");
  }

  if (state.phase === "terminal") {
    return [
      dicePokerTableTitle(table.mode),
      "",
      table.mode === "quick"
        ? `Твої кості: ${state.mode === "quick" ? state.playerDice.join(" ") : ""} — ${state.mode === "quick" ? quickHandLabel(state.playerHand) : "записано"}.`
        : "Твій лист записано.",
      "",
      "Чекаємо, доки решта гравців завершить свій хід.",
      "",
      `За столом: ${session.participants.length}/${table.playerCap}`,
      `Банк: <b>${session.potGold} зол.</b>`
    ].join("\n");
  }

  if (state.mode === "quick") {
    return [
      "⚡ Швидкі кості",
      "",
      `Твої кості: ${state.playerDice.join(" ")} — ${quickHandLabel(evaluateQuickHand(state.playerDice))}.`,
      `Вибрано для перекиду: ${presentSelectedDice(state.playerDice, state.selectedMask)}.`,
      "",
      "Обери кості для одного перекиду або лиши кидок як є.",
      "",
      `За столом: ${session.participants.length}/${table.playerCap}`,
      `Ставка: <b>${session.stakeGold} зол.</b> · банк: <b>${session.potGold} зол.</b>`
    ].join("\n");
  }

  return [
    presentDicePokerState(session, state, resultState),
    "",
    `За столом: ${session.participants.length}/${table.playerCap}`,
    `Банк: <b>${session.potGold} зол.</b>`
  ].join("\n");
}

function presentDicePokerTableResults(
  session: TavernGameSessionRecord,
  outcomes: Record<string, string>,
  totals?: Record<string, number>
): string[] {
  return session.participants.map((participant) => {
    const outcome = outcomes[participant.characterId] ?? "draw";
    const score = totals?.[participant.characterId];
    const result = outcome === "win" ? "🏆 перемога" : outcome === "loss" ? "💀 поразка" : "🤝 нічия";
    const money = participant.payoutGold > 0
      ? ` · виплата ${participant.payoutGold} зол.`
      : participant.refundedGold > 0
        ? ` · повернено ${participant.refundedGold} зол.`
        : "";
    return `${escapeHtml(participant.displayName)}${score !== undefined ? ` · ${score} очк.` : ""}: ${result}${money}`;
  });
}

function dicePokerTableTitle(mode: "quick" | "scorecard"): string {
  return mode === "quick" ? "⚡ Швидкі кості" : "📜 Табличні кості";
}

function presentQuickOutcomeLine(state: Extract<DicePokerState, { mode: "quick"; phase: "terminal" }>): string {
  if (state.outcome === "refund") {
    return "🤝 Нічия: третій рівний раунд поспіль, ставку повернено.";
  }
  if (state.outcome === "draw") {
    return "🤝 Нічия: комбінації повністю однакові.";
  }

  const winner = state.outcome === "win" ? state.playerHand : state.opponentHand;
  const loser = state.outcome === "win" ? state.opponentHand : state.playerHand;
  const prefix = state.outcome === "win" ? "🏆 Перемога" : "💀 Поразка";
  const why = winner.rank === loser.rank
    ? `старші значення в комбінації «${quickRankLabel(winner.rank)}» вирішили партію`
    : `${quickRankSubjectLabel(winner.rank)} сильніша за ${quickRankObjectLabel(loser.rank)}`;

  return `${prefix}: ${why}.`;
}

function presentDicePokerStakeResult(
  session: TavernGameSessionRecord | undefined,
  outcome: string,
  score?: number
): string {
  const participant = session?.participants[0];
  if (!participant) {
    return outcome === "loss" ? "💸 Ставка лишилась на столі." : "💰 Ставку оброблено без дублювання.";
  }
  if (participant.payoutGold > 0) {
    return `💰 Виплата: <b>${participant.payoutGold} зол.</b>`;
  }
  if (participant.refundedGold > 0) {
    return `💰 Повернено: <b>${participant.refundedGold} зол.</b>`;
  }
  if (outcome === "loss") {
    return `💸 Ставка програна: <b>${participant.stakeGold} зол.</b>`;
  }
  if (score !== undefined) {
    return "💸 Ставка лишилась на столі. Повторна кнопка не змінить рахунок.";
  }

  return "💰 Ставку оброблено без дублювання.";
}

function presentSelectedDice(dice: readonly number[], mask: number): string {
  const selected = dice.filter((_, index) => (mask & (1 << index)) !== 0);
  return selected.length > 0 ? selected.join(" ") : "нічого";
}

function presentScorecardSummary(scores: Partial<Record<DicePokerScoreCategory, number>>): string {
  const totals = totalScorecard(scores);
  const filled = Object.keys(scores).length;
  return [
    `Клітинки: ${filled}/13`,
    `Верх: ${totals.upperTotal}${totals.upperBonus > 0 ? " +35" : ""}`,
    `Разом зараз: ${totals.total}`
  ].join(" · ");
}

function presentScorePreview(previews: Array<{ category: DicePokerScoreCategory; score: number }>): string[] {
  const upper = previews.filter((preview) => isUpperScoreCategory(preview.category));
  const lower = previews.filter((preview) => !isUpperScoreCategory(preview.category));
  return [
    `Верх: ${upper.map((preview) => `${scoreCategoryLabel(preview.category)} ${preview.score}`).join(", ")}`,
    `Низ: ${lower.map((preview) => `${scoreCategoryLabel(preview.category)} ${preview.score}`).join(", ")}`
  ];
}

function quickHandLabel(hand: DicePokerQuickHand): string {
  const primary = hand.tieBreak[0] ?? 0;
  const secondary = hand.tieBreak[1] ?? 0;
  switch (hand.rank) {
    case "poker":
      return `Покер ${faceGenitivePlural(primary)}`;
    case "four_kind":
      return `Каре ${faceGenitivePlural(primary)}`;
    case "full_house":
      return `Фул-хаус: ${facePlural(primary)} й ${facePlural(secondary)}`;
    case "large_straight":
      return "Великий стріт";
    case "small_straight":
      return "Малий стріт";
    case "triple":
      return `Трійка ${faceGenitivePlural(primary)}`;
    case "two_pairs":
      return `Дві пари: ${facePlural(primary)} й ${facePlural(secondary)}`;
    case "pair":
      return `Пара ${faceGenitivePlural(primary)}`;
    case "high":
      return `Старша кістка ${primary}`;
  }
}

function quickRankLabel(rank: DicePokerQuickRank): string {
  return {
    poker: "Покер",
    four_kind: "Каре",
    full_house: "Фул-хаус",
    large_straight: "Великий стріт",
    small_straight: "Малий стріт",
    triple: "Трійка",
    two_pairs: "Дві пари",
    pair: "Пара",
    high: "Старша кістка"
  }[rank];
}

function quickRankSubjectLabel(rank: DicePokerQuickRank): string {
  return quickRankLabel(rank).toLowerCase();
}

function quickRankObjectLabel(rank: DicePokerQuickRank): string {
  return {
    poker: "покер",
    four_kind: "каре",
    full_house: "фул-хаус",
    large_straight: "великий стріт",
    small_straight: "малий стріт",
    triple: "трійку",
    two_pairs: "дві пари",
    pair: "пару",
    high: "старшу кістку"
  }[rank];
}

function scoreCategoryLabel(category: DicePokerScoreCategory): string {
  return {
    ones: "Одиниці",
    twos: "Двійки",
    threes: "Трійки",
    fours: "Четвірки",
    fives: "Пʼятірки",
    sixes: "Шістки",
    triple: "Трійка",
    four_kind: "Каре",
    full_house: "Фул-хаус",
    small_straight: "Малий стріт",
    large_straight: "Великий стріт",
    poker: "Покер",
    chance: "Шанс"
  }[category];
}

function isUpperScoreCategory(category: DicePokerScoreCategory): boolean {
  return DICE_POKER_SCORE_CATEGORIES.slice(0, 6).includes(category);
}

function facePlural(face: number): string {
  return {
    1: "одиниці",
    2: "двійки",
    3: "трійки",
    4: "четвірки",
    5: "пʼятірки",
    6: "шістки"
  }[face] ?? `${face}`;
}

function faceGenitivePlural(face: number): string {
  return {
    1: "одиниць",
    2: "двійок",
    3: "трійок",
    4: "четвірок",
    5: "пʼятірок",
    6: "шісток"
  }[face] ?? `${face}`;
}

function getSessionDicePoker(
  session: TavernGameSessionRecord | undefined,
  viewerTelegramUserId?: bigint
): DicePokerState | null {
  if (!session) {
    return null;
  }
  if (isDicePokerState(session.result)) {
    return session.result;
  }
  if (viewerTelegramUserId !== undefined && isDicePokerTableState(session.result)) {
    const participant = session.participants.find((row) =>
      row.telegramUserId === viewerTelegramUserId && (row.status === "joined" || row.status === "decided")
    );
    return participant && isDicePokerState(participant.decision) ? participant.decision : null;
  }

  return null;
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
  if (reason === "doppelganger-at-fighting-corner") {
    return "Сумлінний Допельґанґер зараз у бійцівському кутку. До костей у Шинку він сідає після 23:00 і до 07:00.";
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
