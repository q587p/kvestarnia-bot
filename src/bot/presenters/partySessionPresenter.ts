import { resolveActiveCosmeticTitleLabel } from "../../content/cosmeticTitles";
import type {
  PartyCancelResult,
  PartyCreateResult,
  PartyJoinResult,
  PartyLeaveResult,
  PartyViewResult
} from "../../services/partySessionService";
import type { NearbyDuelCandidatesSnapshot, PresencePerson } from "../../services/presenceService";
import type { PartyParticipantRecord, PartySessionRecord } from "../../db/repositories/partySessionRepository";
import type { PartyBossActionResult, PartyBossSessionRecord, PartyBossStartResult } from "../../db/repositories/partyBossRepository";
import { getPartyBossRetaliationPlan, PARTY_BOSS_TURN_MS } from "../../domain/partyBoss/partyBoss";
import { presentCharacterDisplayName } from "./characterDisplay";
import { escapeHtml } from "./telegramHtml";

export function presentPartyCreate(
  result: PartyCreateResult,
  options: { inviteUrl: string | null }
): string {
  if (result.state === "disabled") {
    return [
      "🧪 <b>Ватага ще під ковпаком</b>",
      "",
      "Збір ватаги доступний тільки в локальному/dev-режимі або під прапорцем. Корчмар не випускає недописаний рейд у залу."
    ].join("\n");
  }

  if (result.state === "no-character") {
    return "Спершу створіть пригодника через /start. Порожню ватагу Корчмар називає меблями.";
  }

  if (result.state === "live-membership") {
    return presentPartySession(result.session, {
      inviteUrl: options.inviteUrl,
      notice: "Ви вже записані в іншу живу ватагу. Спершу вийдіть із неї або дочекайтеся завершення."
    });
  }

  return presentPartySession(result.session, {
    inviteUrl: options.inviteUrl,
    notice: result.state === "created"
      ? isBigBarrelParty(result.session)
        ? "Бочку довго ображали словом «меблі». Старший Брат Бочки підняв кришку, подивився в журнал і вирішив втрутитися."
        : "Запис відкрито. Це ще не бій і не рейдова нагорода, а збір тимчасової ватаги."
      : "У вас уже є жива ватага. Показую її канонічну картку."
  });
}

export function presentPartyJoin(
  result: PartyJoinResult,
  options: { inviteUrl?: string | null | undefined } = {}
): string {
  if (result.state === "no-character") {
    return "Спершу створіть пригодника через /start. Ватага не приймає таємничі силуети без анкети.";
  }

  if (result.state === "not-found") {
    return "Запрошення не знайшлося. Можливо, посилання впало за шинквас і прикинулося серветкою.";
  }

  if (result.state === "live-membership") {
    return presentPartySession(result.session, {
      inviteUrl: options.inviteUrl,
      notice: "Ви вже в іншій живій ватазі. Квестарня поважає ентузіязм, але не телепортацію між протоколами."
    });
  }

  if (result.state === "full") {
    return presentPartySession(result.session, {
      inviteUrl: options.inviteUrl,
      notice: "Ватага вже повна. Восьмеро пригодників — це межа, після якої стіл починає подавати скарги."
    });
  }

  if (result.state === "cancelled") {
    return presentPartySession(result.session, {
      notice: "Цю ватагу вже скасовано. Старі кнопки показують архів, а не новий набір."
    });
  }

  if (result.state === "expired") {
    return presentPartySession(result.session, {
      notice: "Строк збору минув. Посилання лишилося як доказ, що хтось майже організувався."
    });
  }

  return presentPartySession(result.session, {
    inviteUrl: options.inviteUrl,
    notice: result.state === "already-joined"
      ? "Ви вже в цій ватазі. Повторний запис не створює другого вас, хоча бюрократія мріяла."
      : "Ви приєдналися до ватаги."
  });
}

export function presentPartyLeave(
  result: PartyLeaveResult,
  options: { inviteUrl?: string | null | undefined } = {}
): string {
  if (result.state === "no-character") {
    return "Квестарня не впізнала пригодника. Спробуйте ще раз із особистого акаунта.";
  }

  if (result.state === "not-found") {
    return "Ватага не знайшлася.";
  }

  if (result.state === "not-member") {
    return presentPartySession(result.session, {
      inviteUrl: options.inviteUrl,
      notice: "Ця кнопка вже не є вашим записом у ватазі. Показую актуальний стан."
    });
  }

  if (result.state === "expired") {
    return presentPartySession(result.session, {
      notice: "Строк збору минув, тож виходити вже нікуди. Протокол просто закрив двері."
    });
  }

  return presentPartySession(result.session, {
    inviteUrl: options.inviteUrl,
    notice: result.state === "leader-transferred"
      ? "Ви вийшли. Лідерство перейшло до найраніше записаного пригодника."
      : result.state === "cancelled"
        ? "Останній учасник вийшов, тож ватагу скасовано."
        : "Ви вийшли з ватаги."
  });
}

export function presentPartyCancel(
  result: PartyCancelResult,
  options: { inviteUrl?: string | null | undefined } = {}
): string {
  if (result.state === "no-character") {
    return "Квестарня не впізнала пригодника. Спробуйте ще раз із особистого акаунта.";
  }

  if (result.state === "not-found") {
    return "Ватага не знайшлася.";
  }

  if (result.state === "not-leader") {
    return presentPartySession(result.session, {
      inviteUrl: options.inviteUrl,
      notice: "Скасувати ватагу може тільки поточний лідер. Протокол суворий, бо стіл уже бачив усе."
    });
  }

  return presentPartySession(result.session, {
    notice: result.state === "expired"
      ? "Строк збору вже минув. Старі кнопки не відкривають запис назад."
      : "Лідер скасував збір ватаги."
  });
}

export function presentPartyView(
  result: PartyViewResult,
  options: { inviteUrl?: string | null | undefined } = {}
): string {
  return result.state === "ready"
    ? presentPartySession(result.session, { inviteUrl: options.inviteUrl })
    : "Ватага не знайшлася або вже стала легендою без протоколу.";
}

export function presentPartyBossStart(result: PartyBossStartResult, viewerCharacterId?: string | null): string {
  if (result.state === "disabled") {
    return "🧪 Тестовий бос вимкнений. Корчмар прибрав картонного боса в комору.";
  }

  if (result.state === "no-character") {
    return "Спершу створіть пригодника через /start.";
  }

  if (result.state === "not-found") {
    return "Ватага не знайшлася.";
  }

  if (result.state === "not-leader") {
    return "Бій із босом може почати тільки лідер ватаги.";
  }

  if (result.state === "expired") {
    return "Строк збору минув. Старі кнопки не запускають новий протокол.";
  }

  if (result.state === "too-small") {
    return "У ватазі замало пригодників навіть для контрольного боса з фанери.";
  }

  if (result.state === "blocked") {
    return result.blockerName
      ? `Бій не стартував: «${escapeHtml(result.blockerName)}» уже в іншому активному бою.`
      : "Бій не стартував: хтось із ватаги вже в іншому активному бою.";
  }

  if (result.state === "ineligible") {
    return "Рейдова канцелярія відсіяла частину записів. Старший Брат Бочки приймає лише чинні записи без боргів у бочковому архіві.";
  }

  if (result.state === "not-recruiting") {
    return result.session
      ? presentPartyBoss(result.session, { viewerCharacterId })
      : "Ця ватага вже не в режимі збору.";
  }

  if (!("session" in result)) {
    return "Бій не стартував. Показати канонічну картку не вдалося.";
  }

  return presentPartyBoss(result.session, {
    viewerCharacterId,
    notice: result.state === "started"
      ? isBigPartyBossSession(result.session)
        ? "Бойова картка рейду."
        : "Тестового боса запущено. Це не Старший Брат Бочки і не справжній рейдовий маршрут."
      : isBigPartyBossSession(result.session)
        ? "Показую поточний рейд Старшого Брата Бочки."
        : "Показую поточний тестовий бій."
  });
}

export function presentPartyBossIntro(session: PartyBossSessionRecord): string {
  const state = session.state;
  const big = isBigPartyBossSession(session);
  const participantNames = state.participants.map((participant) => escapeHtml(participant.name)).join(", ");

  if (!big) {
    return [
      "🧪 <b>Контрольний бос прокинувся</b>",
      "",
      `👥 Ватага: ${participantNames || "протокол ще шукає учасників"}`,
      `👹 Проти вас: ${escapeHtml(state.boss.name ?? "Контрольний бос")} · рівень ${state.boss.level}`,
      "",
      "💡 Порада дня: відкрийте бойову картку й оберіть дію."
    ].join("\n");
  }

  return [
    "🛢️ <b>Старший Брат Бочки втрутився</b>",
    "",
    "Бочку довго ображали, штовхали й називали меблями. Тепер із піни виліз старший родич і попросив журнал пригодників.",
    "",
    `👥 Ватага: ${participantNames || "Корчмар рахує пальці"}`,
    `👹 Проти вас: ${escapeHtml(state.boss.name ?? "Старший Брат Бочки")} · рівень ${state.boss.level}`,
    "",
    "💡 Порада дня: зайдіть у бойову картку й полікуйтеся або бийте. Якщо зависнути, Корчма поставить вас у захист."
  ].join("\n");
}

export function presentPartyBossAction(result: PartyBossActionResult, viewerCharacterId?: string | null): string {
  if (result.state === "disabled") {
    return "🧪 Тестовий бос вимкнений.";
  }

  if (result.state === "no-character") {
    return "Квестарня не впізнала пригодника. Спробуйте ще раз.";
  }

  if (result.state === "not-found") {
    return "Бій не знайшовся.";
  }

  if (result.state === "not-participant") {
    return presentPartyBoss(result.session, {
      viewerCharacterId,
      notice: "Ця кнопка не належить вашій участі у ватазі."
    });
  }

  if (result.state === "stale") {
    return presentPartyBoss(result.session, {
      viewerCharacterId,
      notice: "Ця кнопка зі старого ходу. Показую канонічний стан."
    });
  }

  if (result.state === "duplicate") {
    return presentPartyBoss(result.session, {
      viewerCharacterId,
      notice: "Вашу дію для цього ходу вже прийнято. Друга кнопка не додає другого ліктя."
    });
  }

  if (result.state === "queued") {
    const big = isBigPartyBossSession(result.session);
    return presentPartyBoss(result.session, {
      viewerCharacterId,
      notice: big
        ? "Дію записано. Якщо хтось зависне, таймер поставить його в захист."
        : "Дію записано. Якщо хтось зависне, таймер поставить його в захист."
    });
  }

  return presentPartyBoss(result.session, { viewerCharacterId });
}

export function presentPartyBoss(
  session: PartyBossSessionRecord,
  options: {
    viewerCharacterId?: string | null | undefined;
    notice?: string;
  } = {}
): string {
  const state = session.state;
  const big = isBigPartyBossSession(session);
  const viewer = options.viewerCharacterId
    ? state.participants.find((participant) => participant.characterId === options.viewerCharacterId)
    : null;
  const viewerCanAct = viewer?.status === "active" && viewer.resources.hp > 0;
  const retaliationPlan = getPartyBossRetaliationPlan(state);
  const targetedCharacterIds = new Set(retaliationPlan.characterIds);
  const title = big ? `🛢️ <b>Бій: ${session.turn} хід</b>` : `🧪 <b>Бій: ${session.turn} хід</b>`;
  const bossName = state.boss.name ?? (big ? "Старший Брат Бочки" : "Контрольний бос");
  const lines = session.status === "active"
    ? [title, ""]
    : [title, "", getBossStatusLine(session), ""];

  if (options.notice) {
    lines.push(escapeHtml(options.notice), "");
  }

  lines.push(`👹 ${escapeHtml(bossName)}: HP ${state.boss.hp}/${state.boss.hpMax}`);
  lines.push(...presentParticipantResourceRows(state.participants, {
    viewerCharacterId: viewer?.characterId ?? null,
    targetedCharacterIds
  }));

  const lastRound = state.roundLog.at(-1);
  if (lastRound) {
    lines.push("", `<b>Остання дія</b>`);
    lines.push(...presentLastRoundLines(lastRound, state.participants, bossName));
    const nextFocus = big ? presentNextRetaliationFocus(state) : null;
    if (nextFocus) {
      lines.push(nextFocus);
    }
  }

  if (viewer && session.status === "active") {
    lines.push("");
    lines.push(viewerCanAct
      ? `<b>${escapeHtml(viewer.name)}</b>, що робимо?\n⏳ На хід є ${formatSecondsLong(PARTY_BOSS_TURN_MS)}. Потім Корчма поставить вас у захист.`
      : big
        ? "Ви вибиті з рейду. Картка лишається для спостереження й оновлення."
        : "Ви вибиті з тестового бою. Картка лишається для спостереження й оновлення.");
  } else if (session.status === "active") {
    lines.push("", `⏳ На хід є ${formatSecondsLong(PARTY_BOSS_TURN_MS)}. Потім Корчма поставить мовчунів у захист.`);
  }

  if (session.status !== "active") {
    lines.push("", session.status === "won"
      ? big
        ? "Ватага перемогла. Участь зараховано як успішну Бочку цього періоду; нагороди збережено й не дублюються."
        : "Ватага перемогла контрольного боса. Нагород тут немає: це тестовий бій, а не рейдовий лут."
      : big
        ? `Старший Брат Бочки вистояв із ${state.boss.hp}/${state.boss.hpMax} HP. Успіх Бочки не зараховано, але учасники з реальною участю отримали досвід за спробу.`
        : "Тестовий бій завершено без рейдової нагороди.");
  }

  return lines.join("\n");
}

export function presentPartyBossJournal(session: PartyBossSessionRecord, requestedPage?: number | null): string {
  const rounds = session.state.roundLog;
  const names = new Map(session.state.participants.map((participant) => [participant.characterId, participant.name]));
  const page = clampPage(requestedPage ?? rounds.length - 1, Math.max(1, rounds.length));
  const lines = [
    isBigPartyBossSession(session) ? "📜 <b>Журнал бою</b>" : "📜 <b>Журнал тестового бою</b>",
    "",
    getBossStatusLine(session)
  ];

  if (rounds.length === 0) {
    lines.push("", "Журнал поки порожній. Корчмар уже відкрив чорнильницю, але хід ще не розписався.");
    return lines.join("\n");
  }

  const round = rounds[page]!;
  const pageMarker = page === 0
    ? "Початок"
    : page === rounds.length - 1 && round.statusAfter !== "active"
      ? "Кінець"
      : "Запис";
  lines.push("", `${pageMarker}: хід <b>${round.turn}</b> · ${page + 1}/${rounds.length}`);

  for (const action of round.actions) {
    const name = names.get(action.characterId) ?? "Учасник";
    lines.push(
      `— ${escapeHtml(name)}: ${presentBossActionSummary(action)}`
    );
  }

  const retaliationDamage = round.bossRetaliations.reduce((sum, retaliation) => sum + retaliation.damage, 0);
  lines.push(`Бос отримав: ${round.bossDamage}. HP після ходу: ${round.bossHpAfter}/${session.state.boss.hpMax}.`);
  if (round.bossRetaliations.length > 0) {
    lines.push(`🎯 Ціль боса: ${presentRetaliationNames(round.bossRetaliations.map((retaliation) => retaliation.characterId), names)}.`);
    lines.push(`Бос огризнувся: ${retaliationDamage} шкоди разом.`);
  }
  const nextFocus = presentNextRetaliationFocusAfterRound(session, round);
  if (nextFocus) {
    lines.push(nextFocus);
  }
  if (round.statusAfter !== "active") {
    lines.push(`Після ходу: ${presentBossTerminalStatus(round.statusAfter)}.`);
  }

  return lines.join("\n");
}

function presentRetaliationNames(characterIds: string[], names: Map<string, string>): string {
  return characterIds
    .map((characterId) => escapeHtml(names.get(characterId) ?? "учасник"))
    .join(", ");
}

function presentParticipantResourceRows(
  participants: PartyBossSessionRecord["state"]["participants"],
  options: {
    viewerCharacterId: string | null;
    targetedCharacterIds: Set<string>;
  }
): string[] {
  const ordered = [
    ...participants.filter((participant) => participant.characterId === options.viewerCharacterId),
    ...participants.filter((participant) => participant.characterId !== options.viewerCharacterId)
  ];

  return ordered.map((participant) => {
    const isViewer = participant.characterId === options.viewerCharacterId;
    const icon = isViewer ? "❤️" : participant.status === "knocked-out" ? "▫️" : "▪️";
    const name = isViewer ? "Ви" : escapeHtml(participant.name);
    const target = options.targetedCharacterIds.has(participant.characterId) && participant.status === "active"
      ? " ← 🎯 ціль боса"
      : "";
    const knocked = participant.status === "knocked-out" ? " · вибито" : "";

    return `${icon} ${name}: HP ${participant.resources.hp}/${participant.resources.hpMax} · мана ${participant.resources.mana}/${participant.resources.manaMax}${knocked}${target}`;
  });
}

function presentLastRoundLines(
  round: PartyBossSessionRecord["state"]["roundLog"][number],
  participants: PartyBossSessionRecord["state"]["participants"],
  bossName: string
): string[] {
  const names = new Map(participants.map((participant) => [participant.characterId, participant.name]));
  const lines = round.actions.map((action) => {
    const name = names.get(action.characterId) ?? "Учасник";
    return `— ${escapeHtml(name)}: ${presentBossActionSummary(action)}.`;
  });

  if (round.bossDamage > 0) {
    lines.push(`— Ватага зняла з ${escapeHtml(bossName)} ${round.bossDamage} HP.`);
  }

  if (round.bossRetaliations.length > 0) {
    for (const retaliation of round.bossRetaliations) {
      const name = names.get(retaliation.characterId) ?? "учасника";
      lines.push(`— ${escapeHtml(bossName)} влучає у ${escapeHtml(name)} на ${retaliation.damage}.`);
    }
  } else if (round.statusAfter === "active") {
    lines.push(`— ${escapeHtml(bossName)} не встиг огризнутися.`);
  }

  return lines;
}

export function presentPartyNearbyCandidates(snapshot: NearbyDuelCandidatesSnapshot): string {
  if (snapshot.state === "no-character") {
    return "Спершу створіть пригодника через /start. Ватага не записує тіні без анкети.";
  }

  const lines = [
    "🧭 <b>Покликати у ватагу</b>",
    "",
    `📍 ${escapeHtml(snapshot.location.name)}`,
    ""
  ];

  if (snapshot.total === 0) {
    lines.push("Активних пригодників у цій локації зараз немає. Можна оновити список або запросити посиланням із картки ватаги.");
    return lines.join("\n");
  }

  lines.push("Оберіть пригодника поруч:");
  lines.push("");
  lines.push(...snapshot.visible.map(presentNearbyCandidate));

  if (snapshot.totalPages > 1) {
    lines.push("");
    lines.push(`Сторінка ${snapshot.page + 1}/${snapshot.totalPages}`);
  }

  return lines.join("\n");
}

export function presentPartySession(
  session: PartySessionRecord,
  options: {
    inviteUrl?: string | null | undefined;
    notice?: string;
  } = {}
): string {
  const joined = getJoinedParticipants(session);
  const leader = joined.find((participant) => participant.characterId === session.leaderCharacterId);
  const big = session.originLocationId === "barrel.big-brother";
  const lines = [
    big ? "🛢️ <b>Збір до Старшого Брата Бочки</b>" : "🧭 <b>Рейдова ватага</b>",
    "",
    getStatusLine(session),
    `Учасники: ${joined.length}/${session.participantCap}`,
    `Лідер: ${leader ? presentParticipantName(leader) : presentCharacterDisplayName(toDisplay(session.leader))}`,
    ""
  ];

  if (options.notice) {
    lines.push(escapeHtml(options.notice), "");
  }

  if (joined.length === 0) {
    lines.push("Запис порожній. Це вже майже філософія.");
  } else {
    lines.push(...joined.map((participant, index) => `${index + 1}. ${presentParticipantName(participant)}`));
  }

  if (session.status === "recruiting" && options.inviteUrl) {
    lines.push("", presentPartyInviteLine(session, options.inviteUrl));
  }

  if (session.status === "recruiting") {
    lines.push("", big
      ? "Це справжній ризиковий маршрут: один спільний бос, видимий стан ватаги й жодного точного прогнозу винагород. Коли час добіжить, рейд почнеться автоматично."
      : "Бою, винагород і рейдового боса тут ще немає: тільки безпечний збір ватаги.");
  }

  return lines.join("\n");
}

function isBigBarrelParty(session: PartySessionRecord): boolean {
  return session.originLocationId === "barrel.big-brother";
}

export function presentPartyNearbyInviteSent(
  result: Extract<PartyViewResult, { state: "ready" }>,
  targetName: string
): string {
  return presentPartySession(result.session, {
    notice: `Запрошення для «${targetName}» надіслано приватно, якщо Telegram дозволив. Стан ватаги від цього не залежить.`
  });
}

export function presentPartyNearbyInviteNotification(
  session: PartySessionRecord,
  inviteUrl: string | null
): string {
  const leader = session.leader;
  const big = isBigBarrelParty(session);
  return [
    big ? "🛢️ <b>Вас кличуть до Старшого Брата Бочки</b>" : "🧭 <b>Вас кличуть у ватагу</b>",
    "",
    `Кличе: ${presentCharacterDisplayName(toDisplay(leader))}`,
    `Учасники: ${getJoinedParticipants(session).length}/${session.participantCap}`,
    "",
    big
      ? "Це збір до групового рейду: бій почнеться після старту ватаги або коли добіжить час збору."
      : "Це поки збір тимчасової ватаги: без боса, нагород і бойового зобовʼязання.",
    ...(inviteUrl ? ["", presentPartyInviteLine(session, inviteUrl)] : [])
  ].join("\n");
}

function getStatusLine(session: PartySessionRecord): string {
  if (session.status === "cancelled") {
    return "Стан: скасовано";
  }

  if (session.status === "expired") {
    return "Стан: строк збору минув";
  }

  if (session.status !== "recruiting") {
    return "Стан: архівний запис";
  }

  if (isBigBarrelParty(session)) {
    return `Стан: рейд почнеться автоматично о ${formatTime(session.expiresAt)}. До того зайдіть у збір і полікуйтеся.`;
  }

  return `Стан: збір відкрито до ${formatTime(session.expiresAt)}`;
}

function getBossStatusLine(session: PartyBossSessionRecord): string {
  const big = isBigPartyBossSession(session);
  if (session.status === "won") {
    return big ? "Стан: Старшого Брата Бочки приборкано" : "Стан: перемога proof-протоколу";
  }

  if (session.status === "lost") {
    return big ? "Стан: Старший Брат Бочки пережив рейд" : "Стан: бос пережив коротку перевірку";
  }

  if (session.status === "cancelled") {
    return "Стан: скасовано";
  }

  return "Стан: бій триває";
}

function isBigPartyBossSession(session: PartyBossSessionRecord): boolean {
  return session.rulesVersion === "big-barrel-brother-v1" ||
    session.bossKey === "big-barrel-brother" ||
    session.state.boss.monsterId === "big-barrel-brother";
}

function presentBossActionLabel(action: string): string {
  switch (action) {
    case "attack":
      return "удар";
    case "defend":
      return "захист";
    case "skill":
      return "вміння";
    case "race":
      return "расова дія";
    default:
      return "дія";
  }
}

function presentBossActionSummary(
  action: PartyBossSessionRecord["state"]["roundLog"][number]["actions"][number]
): string {
  const timeout = action.origin === "timeout" ? " · таймаут" : "";
  const label = `${presentBossActionLabel(action.action)}${timeout}`;

  switch (action.outcome) {
    case "defended":
      return `${label}: захист без прямої шкоди`;
    case "miss":
      return `${label}: промах`;
    case "not-enough-mana":
      return `${label}: не вистачило мани`;
    case "skill-on-cooldown":
      return `${label}: дія ще відсапується`;
    case "critical-fumble":
      return `${label}: критичний збій`;
    case "hit":
      return action.damage > 0
        ? `${label}: ${action.damage} шкоди`
        : `${label}: ефект без прямої шкоди`;
    case "critical-hit":
      return `${label}: критично, ${action.damage} шкоди`;
    case "won":
      return `${label}: ${action.damage} шкоди, добито`;
    default:
      return `${label}: ${action.damage} шкоди`;
  }
}

function presentBossTerminalStatus(status: string): string {
  switch (status) {
    case "won":
      return "перемога ватаги";
    case "lost":
      return "бос вистояв";
    case "cancelled":
      return "скасовано";
    default:
      return "бій триває";
  }
}

function presentNextRetaliationFocus(state: PartyBossSessionRecord["state"]): string | null {
  const plan = getPartyBossRetaliationPlan(state);

  if (plan.kind === "broad") {
    return "🎯 Увага боса перемкнулася на всю живу ватагу.";
  }

  if (plan.kind === "focused") {
    const targetName = state.participants.find((participant) => participant.characterId === plan.characterIds[0])?.name;

    return targetName ? `🎯 Увага боса перемкнулася на ${escapeHtml(targetName)}.` : null;
  }

  return null;
}

function presentNextRetaliationFocusAfterRound(
  session: PartyBossSessionRecord,
  round: PartyBossSessionRecord["state"]["roundLog"][number]
): string | null {
  if (!isBigPartyBossSession(session) || round.statusAfter !== "active") {
    return null;
  }

  if ((round.turn + 1) % 4 === 0) {
    return "🎯 На наступний хід увага боса переходить на всю живу ватагу.";
  }

  const byPosition = new Map(session.state.participants.map((participant, index) => [participant.characterId, index]));
  const topDamage = round.actions
    .filter((action) => action.damage > 0)
    .sort((left, right) =>
      right.damage - left.damage ||
      (byPosition.get(left.characterId) ?? 0) - (byPosition.get(right.characterId) ?? 0)
    )[0];
  const fallbackLeaderId = session.state.participants[0]?.characterId;
  const targetId = topDamage?.characterId ?? fallbackLeaderId;
  const targetName = session.state.participants.find((participant) => participant.characterId === targetId)?.name;

  return targetName ? `🎯 На наступний хід увага боса переходить на ${escapeHtml(targetName)}.` : null;
}

function formatSecondsLong(milliseconds: number): string {
  const seconds = Math.max(1, Math.round(milliseconds / 1000));
  return `${seconds} ${pluralizeUk(seconds, "секунда", "секунди", "секунд")}`;
}

function presentPartyInviteLine(session: PartySessionRecord, inviteUrl: string): string {
  const flavor = isBigBarrelParty(session)
    ? BIG_BARREL_INVITE_LINES[pickInviteTemplateIndex(session.inviteToken)] ?? BIG_BARREL_INVITE_LINES[0]
    : "Передайте це посилання тому, хто має прийти у ватагу:";

  return `${flavor}\nЗапрошення: <a href="${escapeHtml(inviteUrl)}">${escapeHtml(inviteUrl)}</a>`;
}

const BIG_BARREL_INVITE_LINES = [
  "Бочка підозріло хлюпає. Покличте ще когось, поки вона не навчилася рахувати:",
  "Корчмар видав рейдові двері й попросив не грюкати ними по реальності:",
  "Старший Брат Бочки вже дивиться у журнал. Ватага ще може стати більшою:",
  "Піна шепоче, що самотні пригодники швидше стають легендами. Краще покличте підмогу:",
  "Біля Бочки відкрився гуртовий протокол. Він не кусається першим:",
  "Рейдовий кухоль просить більше рук і менше самовпевненості:",
  "Корчма дозволяє форвардити цей шматок героїзму без довідки:",
  "Якщо хтось питає, де починається біда, покажіть ці двері:",
  "Бочка не проти глядачів, але корисніші ті, хто натискає кнопки:",
  "Старший Брат Бочки любить повні списки. Допишіть ще пригодників:",
  "Це посилання пахне піною, ризиком і дуже офіційним «ну спробуйте»:",
  "Ватага ще збирається. Саме час покликати того, хто завжди «майже готовий»:",
  "Корчмар лишив рейдові двері прочиненими рівно настільки, щоб їх переслати:"
] as const;

function pickInviteTemplateIndex(token: string): number {
  let hash = 0;
  for (const char of token) {
    hash = (hash * 31 + char.charCodeAt(0)) % BIG_BARREL_INVITE_LINES.length;
  }

  return hash;
}

function clampPage(page: number, total: number): number {
  if (!Number.isFinite(page)) {
    return 0;
  }

  return Math.min(Math.max(0, Math.floor(page)), Math.max(0, total - 1));
}

function pluralizeUk(count: number, one: string, few: string, many: string): string {
  const mod10 = Math.abs(count) % 10;
  const mod100 = Math.abs(count) % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return one;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return few;
  }

  return many;
}

function getJoinedParticipants(session: PartySessionRecord): PartyParticipantRecord[] {
  return session.participants.filter((participant) => participant.status === "joined");
}

function presentParticipantName(participant: PartyParticipantRecord): string {
  return presentCharacterDisplayName(toDisplay(participant.character), {
    maxNameLength: 32,
    maxTitleLength: 32
  });
}

function presentNearbyCandidate(candidate: PresencePerson): string {
  return `— ${presentCharacterDisplayName(candidate, { boldName: false })}${candidate.level ? ` · рівень ${candidate.level}` : ""}`;
}

function toDisplay(character: { name: string; activeCosmeticTitleGrantId?: string | null }): {
  name: string;
  activeCosmeticTitle?: string | null;
} {
  return {
    name: character.name,
    activeCosmeticTitle: resolveActiveCosmeticTitleLabel(character.activeCosmeticTitleGrantId)
  };
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("uk-UA", {
    timeZone: "Europe/Kyiv",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}
