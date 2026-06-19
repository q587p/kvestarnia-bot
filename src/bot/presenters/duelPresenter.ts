import type {
  DuelAcceptResult,
  DuelCancelResult,
  DuelChallengeView,
  DuelCreateResult,
  DuelDeclineResult,
  DuelPairLimit,
  DuelRematchResult,
  DuelResourceWarning
} from "../../services/duelChallengeService";
import type { CharacterSummary } from "../../domain/characters/characterSummary";
import {
  DUEL_INVITE_FAIRNESS_LINE,
  DUEL_INVITE_MODE_LINE,
  DUEL_TURN_BASED_INVITE_MODE_LINE,
  renderDuelInviteTemplate
} from "../../content/duelInviteFlavor";
import { pickDuelDrawFlavor, pickDuelResultFlavor } from "../../content/duelResultFlavor";
import { escapeHtml, presentCharacterHeader } from "./telegramHtml";

export function presentDuelEntry(): string {
  return [
    "🥊 <b>Бійцівський куток</b>",
    "",
    "⚡ <b>Миттєва дуель</b>",
    "Результат одразу після згоди.",
    "",
    "♟️ <b>Покрокова дуель</b>",
    "Гравці таємно обирають дії за раунд.",
    "",
    DUEL_INVITE_FAIRNESS_LINE,
    "",
    "Без ставок, крадіжок, XP, золота чи втрат манаток."
  ].join("\n");
}

export function presentDuelKorchmaGate(): string {
  return "Дружні виклики кидають у Бійцівському кутку Корчми. Зайдіть усередину, і Корчмар знайде чистий рядок у протоколі.";
}

export interface DuelPresenterOptions {
  inviteUrl?: string | null;
  replayNotice?: boolean;
}

export function presentDuelCreate(result: DuelCreateResult, options: DuelPresenterOptions = {}): string {
  if (result.state === "no-character") {
    return presentDuelNoCharacterInvite();
  }

  if (result.state === "level-gated") {
    return presentDuelLevelGate(result.character, result.minLevel);
  }

  if (result.state === "resource-warning") {
    return presentDuelCreateResourceWarning(result.character, result.warning);
  }

  return presentPendingDuel(result, options);
}

export function presentDuelAccept(result: DuelAcceptResult): string {
  if (result.state === "no-character") {
    return presentDuelNoCharacterInvite();
  }

  if (result.state === "not-found") {
    return "Цей виклик уже загубився між кухлем і протоколом. Попросіть кинути новий.";
  }

  if (result.state === "level-gated") {
    return presentDuelLevelGate(result.character, result.minLevel);
  }

  if (result.state === "pair-limited") {
    return presentDuelPairLimit(result);
  }

  if (result.state === "self-challenge") {
    return [
      "🥊 <b>Самодуель відхилено</b>",
      presentCharacterHeader(result.challenger),
      "",
      "Корчмар дозволяє внутрішні конфлікти, але не записує їх як соціяльний бій.",
      "Для цього вже є Сумлінний Допельґанґер.",
      "",
      "Перешліть це повідомлення іншому пригоднику. Корчмару для дуелі потрібні дві різні чашки й одна спільна згода."
    ].join("\n");
  }

  if (result.state === "not-target") {
    return [
      "🥊 <b>Адресний реванш</b>",
      presentDuelParticipant("Запрошує", result.challenger),
      presentDuelParticipant("Чекає", result.target),
      "",
      "Цей виклик підписаний під конкретного пригодника. Корчмар не дає забирати чужу драму зі столу."
    ].join("\n");
  }

  if (result.state === "busy") {
    return [
      `${presentDuelModeBadge(result.challenge.mode)} <b>Дуель почекає</b>`,
      "",
      presentDuelParticipant("Зайнятий пригодник", result.busyCharacter),
      "",
      "Корчмар бачить, що хтось із цієї пари вже в бою. Спершу завершіть поточну пригоду, тоді протокол знову відкриється."
    ].join("\n");
  }

  if (result.state === "confirmation") {
    return [
      result.challenge.mode === "turn-based"
        ? "♟️ <b>Прийняти покрокову дуель?</b>"
        : "⚡ <b>Прийняти миттєву дуель?</b>",
      "",
      presentDuelParticipantWithItalicTitle("Запрошує", result.challenger),
      presentDuelParticipantWithItalicTitle("Ви", result.target),
      "",
      `${presentDuelFlavorName(result.challenger)} виходить проти вас у безпечному корчемному порядку.`,
      result.challenge.mode === "turn-based"
        ? "Після згоди почнеться бій із закритими виборами за раунд."
        : "Результат з’явиться одразу після згоди.",
      DUEL_INVITE_FAIRNESS_LINE,
      "",
      "Корчмар тримає перо над протоколом і питає: приймаємо?"
    ].join("\n");
  }

  if (result.state === "resource-warning") {
    return [
      result.challenge.mode === "turn-based"
        ? "♟️ <b>Прийняти покрокову дуель?</b>"
        : "⚡ <b>Прийняти миттєву дуель?</b>",
      presentDuelParticipant("Запрошує", result.challenger),
      presentDuelParticipant("Ви", result.target),
      "",
      "Виклик готовий, але ваш пригодник не зовсім відпочив.",
      result.challenge.mode === "turn-based"
        ? "Після згоди почнеться бій із закритими виборами за раунд."
        : "Результат з’явиться одразу після згоди.",
      "",
      presentResourceWarning(result.warning),
      "",
      "Можна прийняти все одно. Корчмар тільки просить не казати потім, що кухоль не попереджав."
    ].join("\n");
  }

  if (result.state === "resolved") {
    return presentResolvedDuel(result, { replayNotice: false });
  }

  if (result.state === "active") {
    return presentTurnBasedDuel(result);
  }

  return presentDuelView(result);
}

export function presentDuelCancel(result: DuelCancelResult): string {
  if (result.state === "no-character") {
    return "Квестарня не знайшла пригодника для скасування.";
  }

  if (result.state === "not-found") {
    return "Виклик не знайшовся. Можливо, його вже прибрали зі стійки.";
  }

  if (result.state === "not-owner") {
    return [
      "🥊 <b>Чужий виклик</b>",
      "",
      "Скасувати його може тільки той пригодник, який першим поставив кухоль на лінію."
    ].join("\n");
  }

  return presentDuelView(result);
}

export function presentDuelDecline(
  result: DuelDeclineResult,
  options: DuelPresenterOptions = {}
): string {
  if (result.state === "no-character") {
    return "Квестарня не знайшла пригодника. Відмова теж любить документи.";
  }

  if (result.state === "not-found") {
    return "Цей виклик уже не актуальний. Корчмар здув пил і зробив вигляд, що так і було.";
  }

  if (result.state === "open-invite") {
    return [
      "🥊 <b>Не зараз</b>",
      "",
      "Ви чемно не прийняли відкритий виклик. Він лишається на столі для когось іншого, бо це не адресна образа, а корчемний папірець."
    ].join("\n");
  }

  return presentDuelView(result, options);
}

export function presentDuelRematch(
  result: DuelRematchResult,
  options: DuelPresenterOptions = {}
): string {
  if (result.state === "no-character") {
    return presentDuelNoCharacterInvite();
  }

  if (result.state === "not-found") {
    return "Запис дуелі не знайшовся. Можливо, Корчмар уже використав його як підставку під кухоль.";
  }

  if (result.state === "not-resolved") {
    return [
      "🔁 <b>Реванш ще не готовий</b>",
      presentDuelParticipant("Запрошував", result.challenger),
      "",
      "Реванш можна кинути тільки після збереженого результату. Спершу треба, щоб хтось чесно натиснув «Прийняти»."
    ].join("\n");
  }

  if (result.state === "not-participant") {
    return [
      "🔁 <b>Чужий реванш</b>",
      "",
      "Реванш можуть кинути тільки учасники цієї дуелі. Підглядати можна, привласнювати образу — ні."
    ].join("\n");
  }

  if (result.state === "level-gated") {
    return presentDuelLevelGate(result.character, result.minLevel);
  }

  if (result.state === "pair-limited") {
    return presentDuelPairLimit(result);
  }

  if (result.state === "resource-warning") {
    return [
      "🔁 <b>Кинути реванш зараз?</b>",
      presentDuelParticipant("Було", result.original.challenger),
      presentDuelParticipant("Проти", result.original.target),
      "",
      "Реванш готовий, але ваш пригодник не зовсім віддихався.",
      "",
      presentResourceWarning(result.warning),
      "",
      "Можна кинути реванш усе одно. Корчмар лише занотує, що ви самі попросили драму з недосипом."
    ].join("\n");
  }

  return presentPendingDuel(result, options);
}

export function presentDuelView(result: DuelChallengeView, options: DuelPresenterOptions = {}): string {
  if (result.state === "pending") {
    return presentPendingDuel(result, options);
  }

  if (result.state === "resolved") {
    return presentResolvedDuel(result);
  }

  if (result.state === "active") {
    return presentTurnBasedDuel(result);
  }

  const statusLine =
    result.state === "expired"
      ? "Виклик прострочився. Кухоль охолов, а Корчмар уже підклав бланк під ніжку столу."
      : result.state === "cancelled"
        ? "Виклик скасовано. Ніхто не постраждав, крім пафосу."
        : "Виклик відхилено. Це теж добровільна згода, просто кнопка пішла в інший бік.";

  return [
    `${presentDuelModeBadge(result.challenge.mode)} <b>Дуель</b>`,
    presentDuelParticipant("Запрошує", result.challenger),
    "",
    statusLine,
    "",
    "Це старий запис цього виклику. Повторний перехід за посиланням не створить нову дуель."
  ].join("\n");
}

function presentPendingDuel(
  result: Extract<DuelCreateResult | DuelChallengeView, { state: "pending" }>,
  options: DuelPresenterOptions = {}
): string {
  const lines = [
    `${presentDuelModeBadge(result.challenge.mode)} <b>${result.challenge.mode === "turn-based" ? "Покрокова дуель" : "Миттєва дуель"}</b>`,
    presentDuelParticipant("Запрошує", result.challenger),
    "",
    "Виклик уже на столі. Погляд такий, ніби це стратегія.",
    "",
    result.challenge.mode === "turn-based"
      ? "Гравці таємно обирають дії за раунд."
      : "Результат з’явиться одразу після згоди.",
    DUEL_INVITE_FAIRNESS_LINE,
    "",
    `Виклик відкритий ще <b>${formatRemaining(result.expiresAt, result.now)}</b>. Інший пригодник має натиснути «Прийняти».`,
    "Нагород, ставок і втрат немає: це перший безпечний запис бійцівського кутка."
  ];

  if (result.challengerResourceWarning) {
    lines.push("", presentResourceWarning(result.challengerResourceWarning));
  }

  lines.push("");

  if (options.inviteUrl) {
    lines.push("Окреме повідомлення з інвайтом можна переслати в приват або чат.");
  } else {
    lines.push("⚠️ Посилання для копіювання ще не зібралося: Корчмар не знає username цього бота.");
  }

  return lines.join("\n");
}

export function presentDuelInviteShare(
  character: CharacterSummary,
  inviteUrl: string,
  options: { templateIndex: number; mode?: "quick" | "turn-based" }
): string {
  return renderDuelInviteTemplate({
    templateIndex: options.templateIndex,
    escapedName: `<b>${escapeHtml(character.name)}</b>`,
    modeLine: options.mode === "turn-based" ? DUEL_TURN_BASED_INVITE_MODE_LINE : DUEL_INVITE_MODE_LINE,
    fairnessLine: DUEL_INVITE_FAIRNESS_LINE,
    escapedInviteUrl: escapeHtml(inviteUrl)
  });
}

export function presentTurnBasedDuel(
  result: Extract<DuelChallengeView, { state: "active" }>,
  options: { viewerCharacterId?: string | null } = {}
): string {
  const state = result.session.state;
  const challenger = state.participants.challenger;
  const target = state.participants.target;
  const viewerSide =
    options.viewerCharacterId === challenger.characterId
      ? "challenger"
      : options.viewerCharacterId === target.characterId
        ? "target"
        : null;
  const viewerPending = viewerSide ? state.pendingActions?.[viewerSide] : null;
  const statusLine =
    result.session.status === "active"
      ? viewerPending
        ? `Ваш вибір записано · ${formatRemaining(result.turnExpiresAt, result.now)}`
        : `Оберіть дію · ${formatRemaining(result.turnExpiresAt, result.now)}`
      : "Бій завершено. Запис уже не перекидається.";
  const actionLine = presentTurnBasedRoundState(state, viewerSide);

  return [
    "♟️ <b>Покрокова дуель</b>",
    "",
    `${presentDuelParticipantInline(result.challenger)} ⚔️ ${presentDuelParticipantInline(result.target)}`,
    "",
    presentDuelVitals(challenger),
    presentDuelVitals(target),
    "",
    `Раунд: <b>${result.session.turn}</b>`,
    statusLine,
    "",
    actionLine,
    "",
    "<i>Дуель не змінює справжні HP/ману, XP, золото чи манатки.</i>"
  ].join("\n");
}

export function presentDuelResultShare(result: Extract<DuelChallengeView, { state: "resolved" }>): string {
  const winner =
    result.result.outcome === "draw"
      ? null
      : result.result.outcome === "challenger"
        ? result.challenger
        : result.target;
  const loser =
    result.result.outcome === "draw"
      ? null
      : result.result.outcome === "challenger"
        ? result.target
        : result.challenger;
  const headline = winner
    ? `🏁 <b>${escapeHtml(winner.name)}</b> переміг у ${result.challenge.mode === "turn-based" ? "корчемній" : "миттєвій корчемній"} дуелі`
    : "🏁 <b>Корчемна нічия</b>";
  const line = winner && loser
    ? presentDuelFlavor(result.result, winner, loser)
    : presentDuelDrawFlavor(result.result, result.challenger, result.target);

  return [
    `📣 <b>Картка корчемної дуелі: ${presentDuelModeBadge(result.challenge.mode)} ${result.challenge.mode === "turn-based" ? "Покрокова дуель" : "Миттєва дуель"}</b>`,
    "",
    `${presentDuelParticipantInline(result.challenger)} ⚔️ ${presentDuelParticipantInline(result.target)}`,
    "",
    line,
    "",
    headline,
    "",
    "<i>Без XP, золота й манаток. Тільки слава, кухоль і трохи підозрілий запис у журналі.</i>"
  ].join("\n");
}

function presentResolvedDuel(
  result: Extract<DuelChallengeView, { state: "resolved" }>,
  options: Pick<DuelPresenterOptions, "replayNotice"> = {}
): string {
  const mode = result.challenge.mode ?? "quick";
  const winner =
    result.result.outcome === "draw"
      ? null
      : result.result.outcome === "challenger"
        ? result.challenger
        : result.target;
  const loser =
    result.result.outcome === "draw"
      ? null
      : result.result.outcome === "challenger"
        ? result.target
        : result.challenger;
  const headline = winner
    ? `🏁 <b>${escapeHtml(winner.name)}</b> перемагає у ${mode === "turn-based" ? "дуелі" : "миттєвій дуелі"}`
    : "🏁 <b>Корчемна нічия</b>";
  const line = winner && loser
    ? presentDuelFlavor(result.result, winner, loser)
    : presentDuelDrawFlavor(result.result, result.challenger, result.target);

  const lines = [
    `${presentDuelModeBadge(mode)} <b>Результат ${mode === "turn-based" ? "покрокової дуелі" : "миттєвої дуелі"}</b>`,
    "",
    `${presentDuelParticipantInline(result.challenger)} ⚔️ ${presentDuelParticipantInline(result.target)}`,
    "",
    mode === "turn-based" ? "Останній запис:" : "Перший і останній хід:",
    "",
    line,
    "",
    headline,
    "",
    "<i>Без XP, золота й манаток. Це корчемний запис для слави, а не спосіб заробітку.</i>"
  ];

  if (options.replayNotice !== false) {
    lines.push("", "<i>Запис збережено: це той самий результат, без повторного кидка.</i>");
  }

  return lines.join("\n");
}

function presentDuelModeBadge(mode: "quick" | "turn-based"): string {
  return mode === "turn-based" ? "♟️" : "⚡";
}

function presentDuelVitals(participant: {
  displayName: string;
  hp: number;
  hpMax: number;
  mana: number;
  manaMax: number;
}): string {
  return `<b>${escapeHtml(participant.displayName)}</b>: HP ${participant.hp}/${participant.hpMax} · мана ${participant.mana}/${participant.manaMax}`;
}

function presentTurnBasedRoundState(
  state: Extract<DuelChallengeView, { state: "active" }>["session"]["state"],
  viewerSide: "challenger" | "target" | null
): string {
  const pending = viewerSide ? state.pendingActions?.[viewerSide] : null;

  if (state.status === "active" && pending) {
    return `Ваш вибір: <b>${presentQueuedDuelAction(pending.action)}</b>.\nРезультат відкриється, коли обидва учасники зроблять хід або спливе таймер.`;
  }

  if (state.status === "active" && state.pendingActions) {
    return "⏳ Корчмар тримає записи закритими, доки обидва учасники не зроблять хід.";
  }

  if (state.lastRound) {
    return state.lastRound.actions.map(presentTurnBasedLastAction).join("\n");
  }

  if (state.lastAction) {
    return presentTurnBasedLastAction(state.lastAction);
  }

  return "⏳ На хід є 23 секунди. Потім Корчмар зарахує звичайну атаку.";
}

function presentQueuedDuelAction(action: string): string {
  return action === "skill"
    ? "класова дія"
    : action === "surrender"
      ? "здатися"
      : "звичайна атака";
}

function presentTurnBasedLastAction(action: {
  actorCharacterId: string;
  action: string;
  outcome: string;
  damage: number;
  manaSpent: number;
  critical: boolean;
}): string {
  const actionLine =
    action.action === "surrender"
      ? "🏳️ Учасник здався. Корчмар записав це без зайвих запитань."
      : action.action === "timeout-attack"
        ? "⏳ Тиша зробила звичайну атаку замість гравця."
        : action.action === "skill"
          ? "✨ Класова дія записана в протокол."
          : "⚔️ Звичайна атака записана в протокол.";
  const hitLine =
    action.damage > 0
      ? `Шкода: <b>${action.damage}</b>${action.critical ? " · критично" : ""}.`
      : action.outcome === "not-enough-mana"
        ? "Мани не вистачило, але хід усе одно пішов у протокол."
        : action.outcome === "skill-on-cooldown"
          ? "Дія ще не відлипла від попереднього разу."
          : "Шкода не пройшла.";

  return [actionLine, hitLine].join("\n");
}

function presentDuelParticipant(label: string, character: CharacterSummary): string {
  return `${label}: <b>${escapeHtml(character.name)}</b> · ${escapeHtml(character.title)} · ${presentCharacterLevel(character)}`;
}

function presentDuelParticipantWithItalicTitle(label: string, character: CharacterSummary): string {
  return `${label}: <b>${escapeHtml(character.name)}</b> · <i>${escapeHtml(character.title)}</i> · ${presentCharacterLevel(character)}`;
}

function presentDuelParticipantInline(character: CharacterSummary): string {
  return `<b>${escapeHtml(character.name)}</b> · ${presentCharacterLevel(character)}`;
}

function presentCharacterLevel(character: CharacterSummary): string {
  const remort = character.remortCount && character.remortCount > 0 ? ` (реморт: ${character.remortCount})` : "";

  return `рівень ${character.level}${remort}`;
}

function presentDuelLevelGate(character: CharacterSummary, minLevel: number): string {
  return [
    "🥊 <b>Бійцівський куток ще не видає рукавиць</b>",
    presentCharacterHeader(character),
    "",
    `Корчмар допускає до дружніх викликів із <b>${minLevel} рівня</b>.`,
    "До того краще потренуватися на шаурмі, льохові й власній самовпевненості."
  ].join("\n");
}

function presentDuelPairLimit(result: DuelPairLimit): string {
  return [
    "🥊 <b>Ця пара вже нагримілася</b>",
    "",
    presentDuelParticipantWithItalicTitle("Перший кухоль", result.challenger),
    presentDuelParticipantWithItalicTitle("Другий кухоль", result.target),
    "",
    `Корчмар кладе крейду впоперек столу: у цієї пари вже <b>${result.count}</b> ${pluralDuel(result.count)} за поточний корчемний відтинок.`,
    "",
    `Новий рядок для них відкриється о <b>${formatHourMinute(result.resetAt)}</b>.`,
    "",
    "Порада Корчмаря: запросіть когось іншого, поки ця образа охолоджується."
  ].join("\n");
}

function presentDuelCreateResourceWarning(character: CharacterSummary, warning: DuelResourceWarning): string {
  return [
    "⚡ <b>Кидати миттєву дуель зараз?</b>",
    presentCharacterHeader(character),
    "",
    "Корчмар бачить, що ви ще не зовсім віддихалися.",
    "Результат з’явиться одразу після згоди.",
    "",
    presentResourceWarning(warning),
    "",
    "Можна кинути виклик усе одно, але посилання краще роздавати з повним кухлем і цілими колінами."
  ].join("\n");
}

function presentDuelNoCharacterInvite(): string {
  return [
    "🥊 <b>Виклик чекає біля стійки</b>",
    "",
    "Схоже, ви ще не створили пригодника в Квестарні.",
    "",
    "Це кілька хвилин: кнопки нижче почнуть анкету, а після першої манатки можна буде приймати дружні дуелі. На жаль, виклики вимагають зовсім трохи знань гри й бажано хоч трохи манаток, які ви зможете отримати на старті."
  ].join("\n");
}

function presentResourceWarning(warning: { hpBelowMax: boolean; manaBelowMax: boolean }): string {
  if (warning.hpBelowMax && warning.manaBelowMax) {
    return "Попередження: здоров’я й мана не повні.";
  }

  if (warning.hpBelowMax) {
    return "Попередження: здоров’я не повне.";
  }

  return "Попередження: мана не повна.";
}

function presentDuelFlavor(
  result: Extract<DuelChallengeView, { state: "resolved" }>["result"],
  winner: CharacterSummary,
  loser: CharacterSummary
): string {
  if (result.mode === "turn-based" && result.terminalReason === "surrender") {
    return `🏳️ ${presentDuelFlavorName(loser)} здається. ${presentDuelFlavorName(winner)} отримує перемогу, а Корчмар — рядок у протоколі без зайвої драматургії.`;
  }

  const winnerName = presentDuelFlavorName(winner);
  const loserName = presentDuelFlavorName(loser);

  return pickDuelResultFlavor({
    result,
    winner,
    loser,
    winnerName,
    loserName
  });
}

function presentDuelDrawFlavor(
  result: Extract<DuelChallengeView, { state: "resolved" }>["result"],
  challenger: CharacterSummary,
  target: CharacterSummary
): string {
  return pickDuelDrawFlavor({
    result,
    challenger,
    target,
    challengerName: presentDuelFlavorName(challenger),
    targetName: presentDuelFlavorName(target)
  });
}

function presentDuelFlavorName(character: CharacterSummary): string {
  return `<b>${escapeHtml(character.name)}</b>`;
}

function formatRemaining(expiresAt: Date, now: Date): string {
  const totalSeconds = Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / 1000));
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

function formatHourMinute(date: Date): string {
  return `${date.getUTCHours().toString().padStart(2, "0")}:${date
    .getUTCMinutes()
    .toString()
    .padStart(2, "0")}`;
}

function pluralDuel(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return "дуель";
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return "дуелі";
  }

  return "дуелей";
}
