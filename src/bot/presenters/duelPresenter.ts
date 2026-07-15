import type {
  DuelAcceptResult,
  DuelCancelResult,
  DuelChallengeView,
  DuelCreateResult,
  DuelDeclineResult,
  DuelPairLimit,
  DuelRematchResult,
  DuelResourceWarning,
  DuelTurnBasedJournalResult
} from "../../services/duelChallengeService";
import type { CharacterSummary } from "../../domain/characters/characterSummary";
import {
  DUEL_INVITE_FAIRNESS_LINE,
  DUEL_INVITE_MODE_LINE,
  DUEL_TURN_BASED_INVITE_MODE_LINE,
  renderDuelInviteTemplate
} from "../../content/duelInviteFlavor";
import { selectCharacterFlavorLine } from "../../content/characterFlavor";
import { pickDuelDrawFlavor, pickDuelResultFlavor } from "../../content/duelResultFlavor";
import { getCombatSkillDisplay } from "../../services/fightService";
import { presentCharacterDisplayName } from "./characterDisplay";
import { presentCombatSkillHtml, presentCombatSupportEffectLine } from "./combatActionPresenter";
import { presentBattleCombatantResourceLine } from "./battleCombatantPresenter";
import { presentBattleJournalPage } from "./battleJournalPresenter";
import { escapeHtml, presentCharacterHeader } from "./telegramHtml";
import { presentActiveVarenykSatedBuff } from "./varenykSatedPresenter";

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
    "Миттєва — без нагород. Покрокова — з малим досвідом. Без ставок, золота чи втрат манаток."
  ].join("\n");
}

export function presentDuelKorchmaGate(): string {
  return "Дружні виклики кидають у Бійцівському кутку Корчми. Зайдіть усередину, і Корчмар знайде чистий рядок у протоколі.";
}

export interface DuelPresenterOptions {
  inviteUrl?: string | null;
  replayNotice?: boolean;
  mode?: "quick" | "turn-based";
}

export function presentDuelCreate(result: DuelCreateResult, options: DuelPresenterOptions = {}): string {
  if (result.state === "no-character") {
    return presentDuelNoCharacterInvite();
  }

  if (result.state === "level-gated") {
    return presentDuelLevelGate(result.character, result.minLevel);
  }

  if (result.state === "resource-warning") {
    return presentDuelCreateResourceWarning(result.character, result.warning, options.mode ?? "quick");
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

export function presentDuelDeclineNotification(
  result: Extract<DuelChallengeView, { state: "expired" | "cancelled" | "declined" }> & { state: "declined" }
): string {
  const targetName = result.challenge.target
    ? `<b>${escapeHtml(result.challenge.target.name)}</b>`
    : "Інший пригодник";

  return [
    `${presentDuelModeBadge(result.challenge.mode)} <b>Виклик відхилено</b>`,
    "",
    `${targetName} не приймає ваш виклик на дуель.`,
    "Корчмар занотував: добровільність усе ще добровільна."
  ].join("\n");
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
    result.challenge.mode === "turn-based"
      ? "За покрокову дуель лишиться трохи досвіду. Ставок, золота й втрат немає."
      : "Нагород, ставок і втрат немає: це безпечний запис бійцівського кутка."
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
    escapedName: presentCharacterDisplayName(character),
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
  const viewerParticipant = viewerSide ? state.participants[viewerSide] : null;
  const remaining = formatRemaining(result.turnExpiresAt, result.now);
  const actionLine = presentTurnBasedRoundState(state, viewerSide);

  const lines = [
    `♟️ <b>Покрокова дуель: хід ${result.session.turn}</b>`,
    presentDuelVitals(challenger),
    presentDuelVitals(target)
  ];

  if (result.session.status === "active" && viewerParticipant?.cooldowns) {
    lines.push(...presentAbilityCooldowns(viewerParticipant.cooldowns));
  }
  if (
    result.session.status === "active" &&
    viewerParticipant?.varenykSated &&
    Date.parse(viewerParticipant.varenykSated.expiresAt) > result.now.getTime()
  ) {
    const satedBuff = presentActiveVarenykSatedBuff(
      new Date(viewerParticipant.varenykSated.expiresAt),
      result.now
    );
    if (satedBuff) lines.push(satedBuff);
  }

  lines.push("", actionLine, "");

  if (result.session.status !== "active") {
    lines.push("Бій завершено. Запис уже не перекидається.");
  } else if (viewerPending) {
    lines.push(
      `Ваш вибір: <b>${presentQueuedDuelAction(viewerPending.action)}</b>.`,
      `⏳ Чекаємо другого учасника або таймер: ${remaining}.`
    );
  } else if (viewerSide) {
    lines.push(
      "Що робимо?",
      `⏳ На хід є <b>${remaining}</b>. Потім Корчма поставить вас в атаку.`
    );
  } else {
    lines.push(`⏳ На хід є <b>${remaining}</b>. Потім Корчма поставить мовчунів в атаку.`);
  }

  lines.push(
    "",
    "<i>Справжні HP/мана, золото й манатки не рухаються. Турнірні нагороди Корчма видає після завершення відповідного періоду.</i>"
  );

  return lines.join("\n");
}

export function presentTurnBasedDuelIntro(result: Extract<DuelChallengeView, { state: "active" }>): string {
  const state = result.session.state;
  const challenger = state.participants.challenger;
  const target = state.participants.target;
  const startTip = presentTurnBasedDuelStartTip(result.challenger, result.session.id);

  return [
    "♟️ <b>Покрокова дуель</b>",
    presentTurnBasedDuelIntroParticipant("Перший кухоль", challenger, result.challenger),
    presentTurnBasedDuelIntroParticipant("Другий кухоль", target, result.target),
    "",
    "Бійцівський куток відкриває протокол і робить вигляд, що табурет між вами — це тактична мапа.",
    ...(startTip ? ["", startTip] : [])
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
    ? `🏁 ${presentDuelRepeatedName(winner)} переміг у ${result.challenge.mode === "turn-based" ? "корчемній" : "миттєвій корчемній"} дуелі`
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
    ...presentDuelRewardLines(result),
    result.challenge.mode === "turn-based"
      ? "<i>Золото й манатки не переходять між гравцями. Якщо дуель зарахується в турнір, Корчма видасть нагороду після завершення відповідного періоду.</i>"
      : "<i>Без XP, золота й манаток. Тільки слава, кухоль і трохи підозрілий запис у журналі.</i>"
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
    ? `🏁 ${presentDuelRepeatedName(winner)} перемагає у ${mode === "turn-based" ? "дуелі" : "миттєвій дуелі"}`
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
    ...presentDuelRewardLines(result),
    mode === "turn-based"
      ? "<i>Золото й манатки не переходять між гравцями. Якщо дуель зарахується в турнір, Корчма видасть нагороду після завершення відповідного періоду.</i>"
      : "<i>Без XP, золота й манаток. Це корчемний запис для слави, а не спосіб заробітку.</i>"
  ];

  if (options.replayNotice !== false) {
    lines.push("", "<i>Запис збережено: це той самий результат, без повторного кидка.</i>");
  }

  return lines.join("\n");
}

function presentDuelModeBadge(mode: "quick" | "turn-based"): string {
  return mode === "turn-based" ? "♟️" : "⚡";
}

function presentDuelRewardLines(result: Extract<DuelChallengeView, { state: "resolved" }>): string[] {
  if (result.challenge.mode !== "turn-based" || !result.result.xpRewards) {
    return [];
  }

  return [
    "Досвід за дуель:",
    `<b>${escapeHtml(result.challenger.name)} +${result.result.xpRewards.challenger} XP\n${escapeHtml(result.target.name)} +${result.result.xpRewards.target} XP</b>`,
    ""
  ];
}

function presentDuelVitals(participant: {
  displayName: string;
  hp: number;
  hpMax: number;
  mana: number;
  manaMax: number;
}): string {
  return presentBattleCombatantResourceLine({
    name: firstName(participant.displayName),
    hp: participant.hp,
    hpMax: participant.hpMax,
    mana: participant.mana,
    manaMax: participant.manaMax,
    showHpLabel: true
  });
}

function presentTurnBasedRoundState(
  state: Extract<DuelChallengeView, { state: "active" }>["session"]["state"],
  viewerSide: "challenger" | "target" | null
): string {
  const pending = viewerSide ? state.pendingActions?.[viewerSide] : null;

  if (state.status === "active" && pending) {
    return "Результат відкриється, коли обидва учасники зроблять хід або спливе таймер.";
  }

  if (state.status === "active" && state.pendingActions) {
    return "⏳ Корчмар тримає записи закритими, доки обидва учасники не зроблять хід.";
  }

  if (state.lastRound) {
    return state.lastRound.actions.flatMap((action) => [
      presentTurnBasedActionLine(action, state),
      ...(presentTurnBasedSatedRecoveryLine(action) ? [presentTurnBasedSatedRecoveryLine(action)!] : [])
    ]).join("\n");
  }

  if (state.lastAction) {
    return [
      presentTurnBasedActionLine(state.lastAction, state),
      presentTurnBasedSatedRecoveryLine(state.lastAction)
    ].filter(Boolean).join("\n");
  }

  return "Корчмар відкрив чистий рядок. Поки що в ньому тільки очікування й пляма від кухля.";
}

function presentQueuedDuelAction(action: string): string {
  return action === "skill"
    ? "класова дія"
    : action === "race"
      ? "расова дія"
    : action === "gear"
      ? "дія спорядження"
    : action === "defend"
      ? "захист"
    : action === "surrender"
      ? "здатися"
      : "звичайна атака";
}

export function presentTurnBasedDuelJournal(
  result: Extract<DuelTurnBasedJournalResult, { state: "ready" }>,
  requestedPage = 0
): string {
  const rounds = result.rounds;
  const state = result.session.state;

  if (rounds.length === 0) {
    return presentBattleJournalPage({
      title: "📜 <b>Журнал дуелі</b>",
      headerLines: [
        "",
        `${escapeHtml(state.participants.challenger.displayName)} проти ${escapeHtml(state.participants.target.displayName)}.`
      ],
      emptyText: "Журнал поки порожній. Корчмар відкрив чорнильницю, але ще не має чим хвалитися."
    });
  }

  const page = clampPage(requestedPage, rounds.length);
  const round = rounds[page]!;

  return presentBattleJournalPage({
    title: "📜 <b>Журнал дуелі</b>",
    headerLines: [
      "",
      `${escapeHtml(state.participants.challenger.displayName)} проти ${escapeHtml(state.participants.target.displayName)}.`
    ],
    turn: round.turn,
    page,
    totalPages: rounds.length,
    actorRows: [
      presentDuelVitals(state.participants.challenger),
      presentDuelVitals(state.participants.target)
    ],
    actionLines: round.actions.length > 0
      ? round.actions.flatMap((action) => [
          presentTurnBasedActionLine(action, state),
          ...(presentTurnBasedSatedRecoveryLine(action) ? [presentTurnBasedSatedRecoveryLine(action)!] : [])
        ])
      : ["Журнал не знайшов записаних дій. Дуель, можливо, моргнула в інший бік."]
  });
}

function presentTurnBasedActionLine(
  action: {
  actorCharacterId: string;
  defenderCharacterId: string;
  action: string;
  outcome: string;
  damage: number;
  healing?: number;
  guard?: number;
  manaSpent: number;
  critical: boolean;
  skillId?: string;
  fumble?: {
    kind: "self-damage" | "enemy-heal";
    line: string;
    selfDamage?: number | undefined;
    enemyHealing?: number | undefined;
} | undefined;
},
  state: Extract<DuelChallengeView, { state: "active" }>["session"]["state"]
): string {
  const actor = findTurnBasedParticipant(state, action.actorCharacterId);
  const actorName = actor?.displayName ? escapeHtml(actor.displayName) : "Учасник";

  if (action.action === "gear") {
    const skillLabel = presentCombatSkillHtml(action.skillId);
    const hitLine =
      action.fumble
        ? presentTurnBasedDuelFumble(action.fumble)
        : action.damage > 0
          ? `влучає на <b>${action.damage}</b> шкоди${action.critical ? " · критично" : ""}.`
          : action.healing || action.guard
            ? "спрацьовує без прямої шкоди."
          : action.outcome === "not-enough-mana"
            ? "не спрацьовує: мани не вистачило, але хід уже пішов у запис."
          : action.outcome === "skill-on-cooldown"
            ? "ще відсапується від попереднього разу."
            : "не пробиває захист.";
    const supportLine = presentCombatSupportEffectLine(action, { boldNumbers: true });

    return [
      `${actorName} застосовує ${skillLabel}: ${hitLine}`,
      supportLine
    ].filter(Boolean).join("\n");
  }

  if (action.action === "defend") {
    return `${actorName} у захисті: ворогові важче влучити, а удар буде слабшим.`;
  }

  if (action.action === "surrender") {
    return `${actorName} здається. Корчмар записує це без зайвих запитань.`;
  }

  const actionLine =
    action.action === "surrender"
      ? "здається"
      : action.action === "timeout-attack"
        ? "мовчить, тож Корчма ставить звичайну атаку"
        : action.action === "defend"
          ? "стає в захист"
        : action.action === "skill"
          ? `застосовує ${presentCombatSkillHtml(action.skillId)}:`
        : action.action === "race"
          ? `застосовує ${presentCombatSkillHtml(action.skillId)}:`
          : "атакує";
  const hitLine =
    action.fumble
      ? presentTurnBasedDuelFumble(action.fumble)
      : action.damage > 0
      ? `влучає на <b>${action.damage}</b> шкоди${action.critical ? " · критично" : ""}.`
      : action.healing || action.guard
        ? "спрацьовує без прямої шкоди."
      : action.outcome === "not-enough-mana"
        ? "не спрацьовує: мани не вистачило, але хід уже пішов у запис."
        : action.outcome === "skill-on-cooldown"
          ? "ще відсапується від попереднього разу."
          : "не пробиває захист.";

  const supportLine = presentCombatSupportEffectLine(action, { boldNumbers: true });

  return [`${actorName} ${actionLine} ${hitLine}`, supportLine].filter(Boolean).join("\n");
}

function presentTurnBasedSatedRecoveryLine(action: {
  satedRecovery?: { hpRestored: number; manaRestored: number };
}): string | null {
  const recovery = action.satedRecovery;
  if (!recovery || (recovery.hpRestored <= 0 && recovery.manaRestored <= 0)) {
    return null;
  }
  const parts = [
    ...(recovery.hpRestored > 0 ? [`+${recovery.hpRestored} HP`] : []),
    ...(recovery.manaRestored > 0 ? [`+${recovery.manaRestored} мани`] : [])
  ];
  return `😋 «Ситий» підсунув ${parts.join(" і ")}.`;
}

function findTurnBasedParticipant(
  state: Extract<DuelChallengeView, { state: "active" }>["session"]["state"],
  characterId: string
): typeof state.participants.challenger | null {
  if (state.participants.challenger.characterId === characterId) {
    return state.participants.challenger;
  }

  if (state.participants.target.characterId === characterId) {
    return state.participants.target;
  }

  return null;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

function clampPage(page: number, total: number): number {
  if (!Number.isFinite(page)) {
    return Math.max(0, total - 1);
  }

  return Math.min(Math.max(0, Math.floor(page)), Math.max(0, total - 1));
}

function presentTurnBasedDuelFumble(action: {
  kind: "self-damage" | "enemy-heal";
  line: string;
  selfDamage?: number | undefined;
  enemyHealing?: number | undefined;
}): string {
  const consequence =
    action.kind === "enemy-heal"
      ? action.enemyHealing && action.enemyHealing > 0
        ? ` Супротивник відновлює <b>${action.enemyHealing}</b> HP.`
        : " Супротивник уже цілий, але дуже вдячний."
      : ` Автор дії отримує <b>${action.selfDamage ?? 0}</b> шкоди.`;

  return `Критична невдача: ${escapeHtml(action.line)}${consequence}`;
}

function presentDuelParticipant(label: string, character: CharacterSummary): string {
  return `${label}: ${presentCharacterDisplayName(character)} · ${escapeHtml(character.title)} · ${presentCharacterLevel(character)}`;
}

function presentDuelParticipantWithItalicTitle(label: string, character: CharacterSummary): string {
  return `${label}: ${presentCharacterDisplayName(character)} · <i>${escapeHtml(character.title)}</i> · ${presentCharacterLevel(character)}`;
}

function presentDuelParticipantInline(character: CharacterSummary): string {
  return `${presentCharacterDisplayName(character)} · ${presentCharacterLevel(character)}`;
}

function presentTurnBasedDuelIntroParticipant(
  label: string,
  participant: {
    displayName?: string;
    activeCosmeticTitle?: string | null;
    title?: string;
    level?: number;
    remortCount?: number;
  },
  fallback: CharacterSummary
): string {
  const activeCosmeticTitle = participant.activeCosmeticTitle ?? fallback.activeCosmeticTitle;
  const identity = {
    name: participant.displayName ?? fallback.name,
    ...(activeCosmeticTitle === undefined ? {} : { activeCosmeticTitle })
  };
  const title = participant.title ?? fallback.title;
  const level =
    typeof participant.level === "number" && Number.isFinite(participant.level)
      ? participant.level
      : fallback.level;
  const remortCount =
    typeof participant.remortCount === "number" && Number.isFinite(participant.remortCount)
      ? participant.remortCount
      : fallback.remortCount;
  const remort = remortCount && remortCount > 0 ? ` (реморт: ${remortCount})` : "";

  return `${label}: ${presentCharacterDisplayName(identity)} · <i>${escapeHtml(title)}</i> · рівень ${level}${remort}`;
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

function presentDuelCreateResourceWarning(
  character: CharacterSummary,
  warning: DuelResourceWarning,
  mode: "quick" | "turn-based"
): string {
  return [
    mode === "turn-based"
      ? "♟️ <b>Кидати покрокову дуель зараз?</b>"
      : "⚡ <b>Кидати миттєву дуель зараз?</b>",
    presentCharacterHeader(character),
    "",
    "Корчмар бачить, що ви ще не зовсім віддихалися.",
    mode === "turn-based"
      ? "Після згоди почнеться бій із закритими виборами за раунд."
      : "Результат з’явиться одразу після згоди.",
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
  return presentDuelRepeatedName(character);
}

function presentTurnBasedDuelStartTip(character: CharacterSummary, seed: string): string | null {
  const flavor = selectCharacterFlavorLine(character, {
    placement: "raid.prep-hint",
    scene: "barrel",
    seed: `battle-start:${seed}`
  });

  return flavor ? `<i>Порада дня: ${escapeHtml(flavor.text)}</i>` : null;
}

function presentDuelRepeatedName(character: CharacterSummary): string {
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

function formatTurns(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `${count} хід`;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} ходи`;
  }

  return `${count} ходів`;
}

function presentSkillCooldown(cooldown: { id: string; remainingTurns: number }): string {
  const skill = getCombatSkillDisplay(cooldown.id);

  return `🫁 ${skill.icon} ${escapeHtml(skill.name)} відсапується: ще ${formatTurns(cooldown.remainingTurns)}.`;
}

function presentAbilityCooldowns(cooldowns: {
  skill?: { id: string; remainingTurns: number };
  abilities?: Record<string, { id: string; remainingTurns: number }>;
}): string[] {
  const uniqueCooldowns = new Map<string, { id: string; remainingTurns: number }>();

  for (const cooldown of Object.values(cooldowns.abilities ?? {})) {
    if (cooldown.remainingTurns > 0) {
      uniqueCooldowns.set(cooldown.id, cooldown);
    }
  }

  if (cooldowns.skill?.remainingTurns) {
    uniqueCooldowns.set(cooldowns.skill.id, cooldowns.skill);
  }

  return [...uniqueCooldowns.values()].map(presentSkillCooldown);
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
