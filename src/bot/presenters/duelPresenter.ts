import type {
  DuelAcceptResult,
  DuelCancelResult,
  DuelChallengeView,
  DuelCreateResult,
  DuelDeclineResult
} from "../../services/duelChallengeService";
import type { CharacterSummary } from "../../domain/characters/characterSummary";
import { escapeHtml, presentCharacterHeader } from "./telegramHtml";

export function presentDuelEntry(): string {
  return [
    "🥊 <b>Корчемний виклик</b>",
    "",
    "Тут можна кинути короткий дружній виклик іншому пригоднику.",
    "",
    "Без ставок, крадіжок, травм на пів сезону й іншої героїчної бухгалтерії. Хтось має натиснути «Прийняти» явно."
  ].join("\n");
}

export interface DuelPresenterOptions {
  inviteUrl?: string | null;
}

export function presentDuelCreate(result: DuelCreateResult, options: DuelPresenterOptions = {}): string {
  if (result.state === "no-character") {
    return presentDuelNoCharacterInvite();
  }

  if (result.state === "level-gated") {
    return presentDuelLevelGate(result.character, result.minLevel);
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

  if (result.state === "self-challenge") {
    return [
      "🥊 <b>Самодуель відхилено</b>",
      presentCharacterHeader(result.challenger),
      "",
      "Корчмар дозволяє внутрішні конфлікти, але не записує їх як соціяльний бій.",
      "Для цього вже є Сумлінний Допельґанґер."
    ].join("\n");
  }

  if (result.state === "resource-warning") {
    return [
      "🥊 <b>Прийняти виклик?</b>",
      presentDuelParticipant("Запрошує", result.challenger),
      presentDuelParticipant("Ви", result.target),
      "",
      "Виклик готовий, але ваш пригодник не зовсім відпочив.",
      "",
      presentResourceWarning(result.warning),
      "",
      "Можна прийняти все одно. Корчмар тільки просить не казати потім, що кухоль не попереджав."
    ].join("\n");
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

export function presentDuelDecline(result: DuelDeclineResult): string {
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

  return presentDuelView(result);
}

export function presentDuelView(result: DuelChallengeView, options: DuelPresenterOptions = {}): string {
  if (result.state === "pending") {
    return presentPendingDuel(result, options);
  }

  if (result.state === "resolved") {
    return presentResolvedDuel(result);
  }

  const statusLine =
    result.state === "expired"
      ? "Виклик прострочився. Кухоль охолов, а Корчмар уже підклав бланк під ніжку столу."
      : result.state === "cancelled"
        ? "Виклик скасовано. Ніхто не постраждав, крім пафосу."
        : "Виклик відхилено. Це теж добровільна згода, просто кнопка пішла в інший бік.";

  return [
    "🥊 <b>Корчемний виклик</b>",
    presentDuelParticipant("Запрошує", result.challenger),
    "",
    statusLine
  ].join("\n");
}

function presentPendingDuel(
  result: Extract<DuelCreateResult | DuelChallengeView, { state: "pending" }>,
  options: DuelPresenterOptions = {}
): string {
  const lines = [
    "🥊 <b>Корчемний виклик</b>",
    presentDuelParticipant("Запрошує", result.challenger),
    "",
    "Виклик уже на столі. Погляд такий, ніби це стратегія.",
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

export function presentDuelInviteShare(character: CharacterSummary, inviteUrl: string): string {
  return [
    "🥊 <b>Дружній корчемний виклик</b>",
    "",
    `<b>${escapeHtml(character.name)}</b> · рівень ${character.level} лишає рукавицю на столі й удає, що це не виглядає підозріло урочисто.`,
    "Переходьте за посиланням, приймайте виклик, а Корчмар зробить вигляд, що все було за правилами.",
    "",
    escapeHtml(inviteUrl)
  ].join("\n");
}

function presentResolvedDuel(result: Extract<DuelChallengeView, { state: "resolved" }>): string {
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
    ? `🏁 <b>${escapeHtml(winner.name)}</b> перемагає у корчемному виклику`
    : "🏁 <b>Корчемна нічия</b>";
  const line = winner && loser
    ? presentDuelFlavor(result.result.flavorKey, winner, loser)
    : "Обидва пригодники зробили щось настільки переконливе, що Корчмар записав: «перевірити правила пізніше»";

  return [
    "🥊 <b>Результат виклику</b>",
    "",
    `${presentDuelParticipantInline(result.challenger)} проти ${presentDuelParticipantInline(result.target)}`,
    "",
    "Перший і останній хід:",
    "",
    line,
    "",
    headline,
    "",
    "Без XP, золота й манаток. Це корчемний запис для слави, не фарм."
  ].join("\n");
}

function presentDuelParticipant(label: string, character: CharacterSummary): string {
  return `${label}: <b>${escapeHtml(character.name)}</b> · ${escapeHtml(character.title)} · ${presentCharacterLevel(character)}`;
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

function presentDuelNoCharacterInvite(): string {
  return [
    "🥊 <b>Виклик чекає біля стійки</b>",
    "",
    "Схоже, ви ще не створили пригодника в Квестарні.",
    "",
    "Це кілька хвилин: /start, вибір анкети, перша манатка — і можна буде приймати дружні дуелі. На жаль, виклики вимагають зовсім трохи знань гри й бажано хоч трохи манаток, які ви зможете отримати на старті."
  ].join("\n");
}

function presentResourceWarning(warning: { hpBelowMax: boolean; manaBelowMax: boolean }): string {
  if (warning.hpBelowMax && warning.manaBelowMax) {
    return "Попередження: HP і мана не повні.";
  }

  if (warning.hpBelowMax) {
    return "Попередження: HP не повні.";
  }

  return "Попередження: мана не повна.";
}

function presentDuelFlavor(key: string, winner: CharacterSummary, loser: CharacterSummary): string {
  if (key === "lucky-upset") {
    return `${escapeHtml(winner.name)} перемагає не тому, що так мало бути, а тому що удача теж любить сидіти біля стійки. ${escapeHtml(loser.name)} просить переглянути кухоль як доказ.`;
  }

  if (key === "paperwork-stall") {
    return `${escapeHtml(winner.name)} зупиняє сутичку папірцем такого вигляду, що ${escapeHtml(loser.name)} на мить визнає силу документа.`;
  }

  if (key === "clever-trick") {
    return `${escapeHtml(winner.name)} виграє трюком, жестом і виразом обличчя «це було за планом». ${escapeHtml(loser.name)} не певен, але Корчмар уже записав.`;
  }

  return `${escapeHtml(winner.name)} проходить прямо крізь план суперника. ${escapeHtml(loser.name)} лишається при честі, але без головного рядка в протоколі.`;
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
