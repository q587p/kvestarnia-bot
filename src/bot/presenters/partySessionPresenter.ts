import { resolveActiveCosmeticTitleLabel } from "../../content/cosmeticTitles";
import { selectCharacterFlavorLine } from "../../content/characterFlavor";
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
import { summarizeCharacter } from "../../domain/characters/characterSummary";
import { getCombatRaceAbilityProfile, getCombatSkillProfile } from "../../domain/combat";
import {
  buildBigBarrelLossXp,
  getPartyBossRetaliationPlan,
  isMeaningfulBigBarrelParticipant,
  type PartyBossRewardSnapshot,
  PARTY_BOSS_TURN_MS
} from "../../domain/partyBoss/partyBoss";
import { DENSE_BANDAGE_ITEM_ID, FIELD_KIT_ITEM_ID } from "../../domain/itemCraft";
import { getCombatSkillDisplay } from "../../services/fightService";
import type { PartyBossCombatItemMenuResult } from "../../services/partyBossService";
import { presentCharacterDisplayName } from "./characterDisplay";
import { presentRewardAmount, presentRewardItemGrant } from "./rewardPresenter";
import { escapeHtml } from "./telegramHtml";
import { presentBattleCombatantResourceLine } from "./battleCombatantPresenter";
import { presentBattleJournalPage } from "./battleJournalPresenter";
import { presentCombatSkillHtml, presentCombatSupportEffectLine } from "./combatActionPresenter";
import { presentActiveVarenykSatedBuff } from "./varenykSatedPresenter";

const BIG_BARREL_AOE_ATTACK_LABEL = "🛢️ <i>Бочковий гуркіт</i>";

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

  if (result.state === "ineligible") {
    return presentPartyCreateIneligible(result);
  }

  const notice = result.state === "created"
    ? isBigBarrelParty(result.session)
      ? null
      : "Запис відкрито. Це ще не бій і не рейдова нагорода, а збір тимчасової ватаги."
    : "У вас уже є жива ватага. Показую її канонічну картку.";

  return presentPartySession(result.session, {
    inviteUrl: options.inviteUrl,
    ...(notice ? { notice } : {})
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

  if (result.state === "ineligible") {
    return presentPartyJoinIneligible(result);
  }

  if (result.state === "stale") {
    return presentPartySession(result.session, {
      inviteUrl: options.inviteUrl,
      notice: "Стан ватаги змінився раніше за цей запис. Перевірте картку й спробуйте ще раз."
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

function presentPartyCreateIneligible(
  result: Extract<PartyCreateResult, { state: "ineligible" }>
): string {
  if (result.reason === "loss-cooldown") {
    return [
      "Рейдова канцелярія притримала новий збір. Після недавньої поразки Старший Брат Бочки вимагає короткий перепочинок.",
      `Спробуйте ще раз за <b>${formatRemainingWait(result.availableAt, result.now)}</b>.`
    ].join("\n");
  }

  return "Рейдова канцелярія притримала новий збір. Старший Брат Бочки приймає лише чинні заявки з правильною печаткою.";
}

function presentPartyJoinIneligible(
  result: Extract<PartyJoinResult, { state: "ineligible" }>
): string {
  const reason = result.reason;

  if (reason === "level-gate") {
    return "Рейдова канцелярія відсіяла запис: Старший Брат Бочки пускає в цю бійку пригодників від 8 рівня, або ремортованих від 3 рівня.";
  }

  if (reason === "active-combat") {
    return "Рейдова канцелярія відсіяла запис: ви вже в активному бою. Завершіть його, тоді подавайте заявку до ватаги.";
  }

  if (reason === "already-completed") {
    return "Рейдова канцелярія відсіяла запис: сьогоднішня Бочка вже зарахована. Старший Брат не приймає другий запис у цей самий період.";
  }

  if (reason === "loss-cooldown") {
    return [
      "Рейдова канцелярія відсіяла запис: після недавньої поразки Старший Брат Бочки вимагає короткий перепочинок.",
      `Спробуйте ще раз за <b>${formatRemainingWait(result.availableAt, result.now)}</b>.`
    ].join("\n");
  }

  return "Рейдова канцелярія відсіяла запис. Старший Брат Бочки приймає лише чинні заявки з правильною печаткою.";
}

export function formatRemainingWait(availableAt: Date, now: Date): string {
  const minutes = Math.max(1, Math.ceil((availableAt.getTime() - now.getTime()) / 60_000));
  return `${minutes} ${formatUkrainianMinutes(minutes)}`;
}

function formatUkrainianMinutes(value: number): string {
  const lastTwo = value % 100;
  const last = value % 10;

  if (lastTwo >= 11 && lastTwo <= 14) {
    return "хвилин";
  }

  if (last === 1) {
    return "хвилину";
  }

  if (last >= 2 && last <= 4) {
    return "хвилини";
  }

  return "хвилин";
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

  if (result.state === "stale") {
    return presentPartySession(result.session, {
      inviteUrl: options.inviteUrl,
      notice: "Стан ватаги змінився раніше за цей вихід. Перевірте картку й спробуйте ще раз."
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

  if (result.state === "stale") {
    return presentPartySession(result.session, {
      inviteUrl: options.inviteUrl,
      notice: "Стан ватаги змінився раніше за скасування. Показую актуальну картку."
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

export function presentPartyBossIntro(
  session: PartyBossSessionRecord,
  viewerCharacterId?: string | null
): string {
  const state = session.state;
  const big = isBigPartyBossSession(session);
  const participantNames = state.participants.map((participant) => escapeHtml(participant.name)).join(", ");
  const startTip = presentPartyBossStartTip(session, viewerCharacterId);
  const protocolIntro = state.personalProtocol
    ? `📄 Протокол 13-З перейшов у бій. Підписів: ${state.personalProtocol.signatures.length}.`
    : null;

  if (!big) {
    return [
      "🧪 <b>Контрольний бос прокинувся</b>",
      "",
      `👥 Ватага: ${participantNames || "протокол ще шукає учасників"}`,
      `👹 Проти вас: ${escapeHtml(state.boss.name ?? "Контрольний бос")} · рівень ${state.boss.level}`,
      "",
      startTip ?? "💡 Порада дня: відкрийте бойову картку й оберіть дію."
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
    ...(protocolIntro ? [protocolIntro, ""] : []),
    ...(startTip ? [startTip] : [])
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
      notice: "Цей вибір уже записано. Корчмар не ставить другу печатку на той самий лікоть."
    });
  }

  if (result.state === "updated") {
    return presentPartyBoss(result.session, {
      viewerCharacterId,
      notice: "Вибір оновлено. У хід піде остання записана дія."
    });
  }

  if (result.state === "item-unavailable") {
    if (!result.session) {
      return "Манатка не спрацювала. Корчмар підозрює стару кнопку.";
    }

    return presentPartyBoss(result.session, {
      viewerCharacterId,
      notice: presentPartyBossItemUnavailableNotice(result.reason)
    });
  }

  if (result.state === "gear-unavailable") {
    return presentPartyBoss(result.session, {
      viewerCharacterId,
      notice: presentPartyBossGearUnavailableNotice(result.reason)
    });
  }

  if (result.state === "taunt-unavailable") {
    return presentPartyBoss(result.session, {
      viewerCharacterId,
      notice: presentWarriorRaidTauntUnavailableNotice(result)
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

export function presentPartyBossItems(
  result: PartyBossCombatItemMenuResult,
  viewerCharacterId?: string | null
): string {
  if (result.state === "disabled") {
    return "🧪 Тестовий бос вимкнений.";
  }

  if (result.state === "no-character") {
    return "Квестарня не впізнала пригодника або його манатки. Спробуйте ще раз.";
  }

  if (result.state === "not-found") {
    return "Бій не знайшовся.";
  }

  if (result.state === "not-participant") {
    return presentPartyBoss(result.session, {
      viewerCharacterId,
      notice: "Це меню належить учасникам рейду. Манатки не люблять чужі кишені."
    });
  }

  if (result.state === "stale") {
    return presentPartyBoss(result.session, {
      viewerCharacterId,
      notice: "Це меню зі старого ходу. Показую канонічний стан."
    });
  }

  if (result.state === "terminal") {
    return presentPartyBoss(result.session, {
      viewerCharacterId,
      notice: "Бій уже завершився. Манатки прибралися з протоколу."
    });
  }

  return presentPartyBoss(result.session, {
    viewerCharacterId,
    notice: result.items.length > 0
      ? "🎒 Одноразові манатки: оберіть, що піде в цей хід. Новий вибір замінить попередній."
      : "🎒 Одноразові манатки: зараз немає корисних предметів для цього ходу."
  });
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

  lines.push(presentBattleCombatantResourceLine({
    icon: "👹",
    name: bossName,
    hp: state.boss.hp,
    hpMax: state.boss.hpMax,
    showHpLabel: true
  }));
  lines.push(...presentParticipantResourceRows(state.participants, {
    viewerCharacterId: session.status === "active" ? viewer?.characterId ?? null : null,
    targetedCharacterIds
  }));
  if (big && state.wardSign) {
    lines.push(presentKharakternykWardBossLine(state.wardSign));
  }
  if (big && state.personalProtocol) {
    lines.push(presentBureaucramancerProtocolBossLine(state.personalProtocol));
  }
  if (big && state.warriorTaunt?.active) {
    lines.push(presentWarriorRaidTauntBossLine(state));
  }
  if (session.status === "active") {
    lines.push(...presentPartyBossCooldownLines(viewer ?? null, state));
    if (viewer?.varenykSated && Date.parse(viewer.varenykSated.expiresAt) > Date.now()) {
      const satedBuff = presentActiveVarenykSatedBuff(new Date(viewer.varenykSated.expiresAt));
      if (satedBuff) lines.push(satedBuff);
    }
  }

  const lastRound = state.roundLog.at(-1);
  if (lastRound) {
    lines.push("", `<b>Останні дії:</b>`);
    lines.push(...presentLastRoundLines(lastRound, state.participants, bossName, {
      isBig: big,
      viewerCharacterId: viewer?.characterId ?? null
    }));
    const nextFocus = big ? presentNextRetaliationFocus(state, lastRound) : null;
    if (nextFocus) {
      lines.push(nextFocus);
    }
  }

  if (viewer && session.status === "active") {
    lines.push("");
    lines.push(viewerCanAct
      ? presentPartyBossViewerTurnPrompt(session, viewer)
      : big
        ? "Ви вибиті з рейду. Картка лишається для спостереження й оновлення."
        : "Ви вибиті з тестового бою. Картка лишається для спостереження й оновлення.");
  } else if (session.status === "active") {
    lines.push("", `⏳ На хід є ${formatSecondsLong(PARTY_BOSS_TURN_MS)}. Потім Корчма поставить мовчунів у захист.`);
  }

  if (session.status !== "active") {
    lines.push("", session.status === "won"
      ? big
        ? presentBigBarrelVictoryResult(session, viewer?.characterId ?? null)
        : "Ватага перемогла контрольного боса. Нагород тут немає: це тестовий бій, а не рейдовий лут."
      : big
        ? presentBigBarrelLossResult(session, viewer?.characterId ?? null)
        : "Тестовий бій завершено без рейдової нагороди.");
  }

  return lines.join("\n");
}

function presentPartyBossViewerTurnPrompt(
  session: PartyBossSessionRecord,
  viewer: PartyBossSessionRecord["state"]["participants"][number]
): string {
  const queuedAction = findPartyBossQueuedAction(session, viewer.characterId);
  const prompt = queuedAction
    ? `<b>${escapeHtml(viewer.name)}</b>, ви плануєте ${presentPartyBossQueuedActionPlan(queuedAction, viewer)}.`
    : `<b>${escapeHtml(viewer.name)}</b>, що робимо?`;

  return queuedAction
    ? prompt
    : `${prompt}\n⏳ На хід є ${formatSecondsLong(PARTY_BOSS_TURN_MS)}. Потім Корчма поставить вас у захист.`;
}

function findPartyBossQueuedAction(
  session: PartyBossSessionRecord,
  characterId: string
): NonNullable<PartyBossSessionRecord["queuedActions"]>[number] | null {
  return session.queuedActions?.find((action) =>
    action.turn === session.turn && action.characterId === characterId
  ) ?? null;
}

function presentPartyBossQueuedActionPlan(
  action: NonNullable<PartyBossSessionRecord["queuedActions"]>[number],
  viewer: PartyBossSessionRecord["state"]["participants"][number]
): string {
  switch (action.action) {
    case "attack":
      return "вдарити";
    case "defend":
      return "захищатися";
    case "skill":
      return presentCombatSkillHtml(getCombatSkillProfile(viewer.combatStats.classId).id);
    case "race": {
      const ability = getCombatRaceAbilityProfile(viewer.combatStats.raceId);

      return ability ? presentCombatSkillHtml(ability.id) : "расову дію";
    }
    case "gear":
      return action.gearAbility
        ? `дію спорядження ${presentCombatSkillHtml(action.gearAbility.profile.id)}`
        : "дію спорядження";
    case "item":
      return action.item
        ? `одноразову манатку <i>${escapeHtml(action.item.name)}</i>`
        : "одноразову манатку";
    case "taunt":
      return "гукнути «🛡️ На мене!»";
    default:
      return "дію";
  }
}

export function presentPartyBossJournal(session: PartyBossSessionRecord, requestedPage?: number | null): string {
  const rounds = session.state.roundLog;
  const names = new Map(session.state.participants.map((participant) => [participant.characterId, participant.name]));
  const participantsByCharacterId = new Map(session.state.participants.map((participant) => [participant.characterId, participant]));
  const page = clampPage(requestedPage ?? rounds.length - 1, Math.max(1, rounds.length));

  if (rounds.length === 0) {
    return presentBattleJournalPage({
      title: isBigPartyBossSession(session) ? "📜 <b>Журнал бою</b>" : "📜 <b>Журнал тестового бою</b>",
      headerLines: ["", getBossStatusLine(session)],
      emptyText: "Журнал поки порожній. Корчмар уже відкрив чорнильницю, але хід ще не розписався."
    });
  }

  const round = rounds[page]!;
  const actionLines: string[] = [];
  if (round.actions.length === 0) {
    actionLines.push("Журнал не знайшов записаних дій учасників.");
  } else {
    for (const action of round.actions) {
      actionLines.push(presentPartyBossActionLine(action, participantsByCharacterId.get(action.characterId), null));
      const recovery = presentVarenykSatedRecoveryLine(action);
      if (recovery) {
        actionLines.push(recovery);
      }
    }
  }

  if (round.bossRetaliations.length > 0) {
    if (isBigPartyBossSession(session) && round.bossRetaliations.length > 1) {
      actionLines.push(presentBigBarrelAoeRetaliationLine(round.bossRetaliations, names, "застосував"));
    } else {
      for (const retaliation of round.bossRetaliations) {
        const name = names.get(retaliation.characterId) ?? "учасник";
        actionLines.push(presentBossRetaliationLine(session.state.boss.name ?? "Бос", name, retaliation, "атакує"));
      }
    }
  } else if (round.statusAfter === "active") {
    actionLines.push(`${escapeHtml(session.state.boss.name ?? "Бос")} не завдав шкоди цього ходу.`);
  }

  if (round.wardSign) {
    actionLines.push(presentKharakternykWardTriggeredLine(round.wardSign));
  }
  if (round.personalProtocol) {
    actionLines.push(presentBureaucramancerProtocolTriggeredLine(round.personalProtocol));
  }
  if (round.warriorTaunt) {
    actionLines.push(...presentWarriorRaidTauntRoundLines(round.warriorTaunt, names));
  }

  return presentBattleJournalPage({
    title: isBigPartyBossSession(session) ? "📜 <b>Журнал бою</b>" : "📜 <b>Журнал тестового бою</b>",
    headerLines: ["", getBossStatusLine(session)],
    turn: round.turn,
    page,
    totalPages: rounds.length,
    opponentRows: [
      presentBattleCombatantResourceLine({
        icon: "👹",
        name: session.state.boss.name ?? "Бос",
        hp: round.bossHpAfter,
        hpMax: session.state.boss.hpMax,
        afterTurn: true
      })
    ],
    actorRows: presentJournalParticipantResourceRows(round, session.state.participants),
    actionLines,
    noticeLines: presentPartyBossJournalNotices(session, round)
  });
}

function presentJournalParticipantResourceRows(
  round: PartyBossSessionRecord["state"]["roundLog"][number],
  participants: PartyBossSessionRecord["state"]["participants"]
): string[] {
  const hitHpAfterByCharacterId = new Map(round.bossRetaliations.map((retaliation) => [
    retaliation.characterId,
    retaliation.hpAfter
  ]));
  const targetedCharacterIds = new Set(round.bossRetaliations.map((retaliation) => retaliation.characterId));
  const resourcesByCharacterId = new Map(round.participantsAfter?.map((participant) => [
    participant.characterId,
    participant
  ]) ?? []);

  return participants.map((participant) => {
    const resources = resourcesByCharacterId.get(participant.characterId);
    const hp = resources?.hp ?? hitHpAfterByCharacterId.get(participant.characterId) ?? participant.resources.hp;
    const hpMax = resources?.hpMax ?? participant.resources.hpMax;
    const mana = resources?.mana ?? participant.resources.mana;
    const manaMax = resources?.manaMax ?? participant.resources.manaMax;
    const status = resources?.status ?? participant.status;
    return presentBattleCombatantResourceLine({
      icon: "▪️",
      name: participant.name,
      hp,
      hpMax,
      mana,
      manaMax,
      afterTurn: true,
      showHpLabel: true,
      knockedOut: hp <= 0 || status === "knocked-out",
      targetLabel: targetedCharacterIds.has(participant.characterId) ? "🎯 ціль боса" : undefined
    });
  });
}

function presentPartyBossJournalNotices(
  session: PartyBossSessionRecord,
  round: PartyBossSessionRecord["state"]["roundLog"][number]
): string[] {
  const nextFocus = presentNextRetaliationFocusAfterRound(session, round);
  const notices = [
    ...presentJournalCooldownLines(round, session.state.participants),
    ...(nextFocus ? [nextFocus] : []),
    ...(round.statusAfter !== "active" ? [`Після ходу: ${presentBossTerminalStatus(round.statusAfter)}.`] : [])
  ];

  return Array.from(new Set(notices));
}

function presentJournalCooldownLines(
  round: PartyBossSessionRecord["state"]["roundLog"][number],
  participants: PartyBossSessionRecord["state"]["participants"]
): string[] {
  const resourcesByCharacterId = new Map(round.participantsAfter?.map((participant) => [
    participant.characterId,
    participant
  ]) ?? []);

  return participants.flatMap((participant) => {
    const resourceSnapshot = resourcesByCharacterId.get(participant.characterId);
    const activeAfterRound = resourceSnapshot
      ? resourceSnapshot.status === "active" && resourceSnapshot.hp > 0
      : participant.status === "active" && participant.resources.hp > 0;
    if (!activeAfterRound) {
      return [];
    }

    const cooldowns = resourceSnapshot
      ? resourceSnapshot.cooldowns
      : participant.resources.cooldowns;
    const combatItems = resourceSnapshot
      ? resourceSnapshot.combatItems
      : participant.combatItems;

    const skillLines = presentCooldownLines(cooldowns).map((line) =>
      `${escapeHtml(participant.name)}: ${line}`
    );
    const itemLines = presentItemCooldownLines(combatItems).map((line) =>
      `${escapeHtml(participant.name)}: ${line}`
    );

    return [...skillLines, ...itemLines];
  });
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
    const name = isViewer ? "Ви" : participant.name;
    return presentBattleCombatantResourceLine({
      icon,
      name,
      hp: participant.resources.hp,
      hpMax: participant.resources.hpMax,
      mana: participant.resources.mana,
      manaMax: participant.resources.manaMax,
      showHpLabel: true,
      knockedOut: participant.status === "knocked-out",
      targetLabel: options.targetedCharacterIds.has(participant.characterId) && participant.status === "active"
        ? "🎯 ціль боса"
        : undefined,
      escapeName: true
    });
  });
}

function presentLastRoundLines(
  round: PartyBossSessionRecord["state"]["roundLog"][number],
  participants: PartyBossSessionRecord["state"]["participants"],
  bossName: string,
  options: { isBig: boolean; viewerCharacterId: string | null }
): string[] {
  const byCharacterId = new Map(participants.map((participant) => [participant.characterId, participant]));
  const lines = round.actions.flatMap((action) => {
    const actionLine = presentPartyBossActionLine(
      action,
      byCharacterId.get(action.characterId),
      options.viewerCharacterId
    );
    const recovery = presentVarenykSatedRecoveryLine(action);
    return recovery ? [actionLine, recovery] : [actionLine];
  });

  if (round.bossRetaliations.length > 0) {
    if (options.isBig && round.bossRetaliations.length > 1) {
      lines.push(presentBigBarrelAoeRetaliationLine(
        round.bossRetaliations,
        new Map(participants.map((participant) => [participant.characterId, participant.name])),
        "застосовує"
      ));
    } else {
      for (const retaliation of round.bossRetaliations) {
        const name = byCharacterId.get(retaliation.characterId)?.name ?? "учасника";
        lines.push(presentBossRetaliationLine(bossName, name, retaliation, "атакує"));
      }
    }
  } else if (round.statusAfter === "active") {
    lines.push(`${escapeHtml(bossName)} не завдав шкоди цього ходу.`);
  }
  if (round.wardSign) {
    lines.push(presentKharakternykWardTriggeredLine(round.wardSign));
  }
  if (round.personalProtocol) {
    lines.push(presentBureaucramancerProtocolTriggeredLine(round.personalProtocol));
  }
  if (round.warriorTaunt) {
    lines.push(...presentWarriorRaidTauntRoundLines(
      round.warriorTaunt,
      new Map(participants.map((participant) => [participant.characterId, participant.name])),
      { includeActiveStatus: false }
    ));
  }
  return lines;
}

function presentKharakternykWardTriggeredLine(
  wardSign: NonNullable<PartyBossSessionRecord["state"]["roundLog"][number]["wardSign"]>
): string {
  const usesRemaining = Math.max(0, Math.floor(wardSign.usesRemaining ?? 0));
  const preventedDamage = Math.max(0, Math.floor(wardSign.preventedDamage));
  if (preventedDamage <= 0) {
    if (wardSign.supportCount > 0 && usesRemaining > 0) {
      return `🧿 Знак характерника частково луснув, але цього разу шкода прослизнула повз нього. Підпор лишилося: ${usesRemaining}.`;
    }

    if (wardSign.supportCount > 0) {
      return "🧿 Знак характерника луснув зовсім, але цього разу шкода прослизнула повз нього. Підпор не лишилося.";
    }

    return "🧿 Знак характерника луснув зовсім, але цього разу шкода прослизнула повз нього.";
  }

  if (wardSign.supportCount > 0 && usesRemaining > 0) {
    return `🧿 Знак характерника частково луснув і цього разу забрав на себе ${preventedDamage} шкоди. Підпор лишилося: ${usesRemaining}.`;
  }

  if (wardSign.supportCount > 0) {
    return `🧿 Знак характерника луснув зовсім і цього разу забрав на себе ${preventedDamage} шкоди. Підпор не лишилося.`;
  }

  return `🧿 Знак характерника луснув зовсім і цього разу забрав на себе ${preventedDamage} шкоди.`;
}

function presentBigBarrelAoeRetaliationLine(
  retaliations: PartyBossSessionRecord["state"]["roundLog"][number]["bossRetaliations"],
  names: Map<string, string>,
  verb: "застосовує" | "застосував"
): string {
  const targets = retaliations
    .map((retaliation) => `${escapeHtml(names.get(retaliation.characterId) ?? "учасник")} отримує ${retaliation.damage} шкоди`)
    .join("; ");

  return `Старший Брат Бочки ${verb} ${BIG_BARREL_AOE_ATTACK_LABEL}: ${targets}.`;
}

function presentBossRetaliationLine(
  bossName: string,
  targetName: string,
  retaliation: PartyBossSessionRecord["state"]["roundLog"][number]["bossRetaliations"][number],
  verb: "атакує"
): string {
  if (retaliation.tauntRedirected && retaliation.tauntOriginalKind === "broad") {
    return `${BIG_BARREL_AOE_ATTACK_LABEL} згортається в один удар. Ціль: ${escapeHtml(targetName)}. Завдано ${retaliation.damage} шкоди.`;
  }
  if (retaliation.tauntRedirected) {
    return `${escapeHtml(bossName)} приймає виклик. Ціль: ${escapeHtml(targetName)}. Завдано ${retaliation.damage} шкоди.`;
  }
  if ((retaliation.protocolPreventedDamage ?? 0) > 0) {
    return `${escapeHtml(bossName)} ${verb} ${escapeHtml(targetName)} у відповідь, але удар застряг у паперах і завдає 0 шкоди.`;
  }

  return `${escapeHtml(bossName)} ${verb} ${escapeHtml(targetName)} у відповідь і завдає ${retaliation.damage} шкоди.`;
}

function presentBureaucramancerProtocolTriggeredLine(
  protocol: NonNullable<PartyBossSessionRecord["state"]["roundLog"][number]["personalProtocol"]>
): string {
  return [
    `📄 Протокол 13-З спрацьовує: Бочка знаходить персональну претензію й бʼє по паперах замість ребер. Запобігло ${protocol.preventedDamage} шкоди.`,
    `Підпис витрачено: ${protocol.spentCount}/${protocol.signatureCount}.`
  ].join("\n");
}

function presentWarriorRaidTauntRoundLines(
  taunt: NonNullable<PartyBossSessionRecord["state"]["roundLog"][number]["warriorTaunt"]>,
  names: Map<string, string>,
  options: { includeActiveStatus?: boolean } = {}
): string[] {
  const lines: string[] = [];
  if (options.includeActiveStatus !== false && taunt.redirectedCharacterId && (taunt.bossAttacksRemaining ?? 0) > 0) {
    lines.push(
      `🛡️ Увага Бочки: ${escapeHtml(names.get(taunt.redirectedCharacterId) ?? "воїн")}, ще ${formatTurns(taunt.bossAttacksRemaining ?? 0)}.`
    );
  }
  if (taunt.expiredCharacterId) {
    lines.push("🫥 Виклик згас: Бочка знову дивиться на всю ватагу.");
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

  if (big && session.wardSign) {
    lines.push(presentKharakternykWardLobbyLine(session), "");
  }
  if (big && session.personalProtocol) {
    lines.push(presentBureaucramancerProtocolLobbyLine(session), "");
  }

  if (joined.length === 0) {
    lines.push("Запис порожній. Це вже майже філософія.");
  } else {
    lines.push(...joined.map((participant, index) => `${index + 1}. ${presentRecruitingParticipantName(participant, {
      showReadiness: big && session.status === "recruiting"
    })}`));
  }

  if (session.status === "recruiting" && options.inviteUrl && !big) {
    lines.push("", presentPartyInviteLine(session, options.inviteUrl));
  }

  if (session.status === "recruiting") {
    lines.push("", big
      ? "Це справжній ризиковий маршрут: один спільний бос, видимий стан ватаги й жодного точного прогнозу винагород. Коли час добіжить, рейд почнеться автоматично."
      : "Бою, винагород і рейдового боса тут ще немає: тільки безпечний збір ватаги.");
  }

  return lines.join("\n");
}

function presentKharakternykWardBossLine(
  wardSign: NonNullable<PartyBossSessionRecord["state"]["wardSign"]>
): string {
  const preventedDamage = Math.max(0, Math.floor(wardSign.preventedDamage ?? 0));
  if (wardSign.status === "broken") {
    return preventedDamage > 0
      ? `🧿 Знак характерника вже зовсім тріснув і всього забрав на себе ${preventedDamage} шкоди.`
      : "🧿 Знак характерника вже зовсім тріснув, але шкода так і прослизнула повз нього.";
  }

  if (wardSign.supportCount > 0) {
    const remaining = Math.max(0, Math.floor(wardSign.usesRemaining ?? wardSign.supportCount));
    const supportCap = Math.max(wardSign.supportCount, Math.floor(wardSign.supportCap ?? 7));
    if (wardSign.triggeredTurn) {
      return preventedDamage > 0
        ? `🧿 Знак характерника частково тріснув і всього забрав на себе ${preventedDamage} шкоди. Підпор: ${remaining}/${supportCap}.`
        : `🧿 Знак характерника частково тріснув, але шкода поки прослизає повз нього. Підпор: ${remaining}/${supportCap}.`;
    }

    return `🧿 Знак характерника тримається. Підпор: ${remaining}/${supportCap}.`;
  }

  return "🧿 Знак характерника тримається.";
}

function presentBureaucramancerProtocolBossLine(
  protocol: NonNullable<PartyBossSessionRecord["state"]["personalProtocol"]>
): string {
  const total = protocol.signatures.length;
  const spent = protocol.signatures.filter((signature) => signature.status === "spent").length;
  const unspent = Math.max(0, total - spent);
  const preventedDamage = protocol.signatures.reduce(
    (sum, signature) => sum + Math.max(0, Math.floor(signature.preventedDamage ?? 0)),
    0
  );

  if (unspent > 0) {
    return preventedDamage > 0
      ? `📄 Протокол 13-З у бою. Невитрачених підписів: ${unspent}/${total}. Уже запобігло: ${preventedDamage} шкоди.`
      : `📄 Протокол 13-З у бою. Невитрачених підписів: ${unspent}/${total}.`;
  }

  return preventedDamage > 0
    ? `📄 Протокол 13-З уже витратив усі підписи. Запобігло: ${preventedDamage} шкоди.`
    : "📄 Протокол 13-З уже витратив усі підписи.";
}

function presentWarriorRaidTauntBossLine(state: PartyBossSessionRecord["state"]): string {
  const active = state.warriorTaunt?.active;
  if (!active) {
    return "";
  }
  const name = state.participants.find((participant) => participant.characterId === active.characterId)?.name ?? "воїн";
  return `🛡️ Увага Бочки: ${escapeHtml(name)}, ще ${formatTurns(active.bossAttacksRemaining)}.`;
}

function presentWarriorRaidTauntUnavailableNotice(
  result: Extract<PartyBossActionResult, { state: "taunt-unavailable" }>
): string {
  if (result.reason === "cooldown" && result.availableTurn !== undefined) {
    return `«🛡️ На мене!» ще відсапується: чекати ${formatTurns(Math.max(1, result.availableTurn - result.session.turn))}.`;
  }
  if (result.reason === "active-taunt") {
    return "Бочка вже слухає один виклик. Другий зараз загубиться в гуркоті.";
  }
  if (result.reason === "not-warrior") {
    return "Цей рейдовий виклик слухається лише воїна.";
  }
  return "Цей виклик більше не діє. Показую свіжий стан рейду.";
}

function presentKharakternykWardLobbyLine(session: PartySessionRecord): string {
  const supportCount = session.wardSign?.supportCount ?? 0;
  const supportCap = session.wardSign?.supportCap ?? 7;
  if (supportCount <= 0) {
    return "🧿 Знак характерника стоїть біля бочки.";
  }

  return `🧿 Знак характерника стоїть біля бочки. Підпор: ${supportCount}/${supportCap}.`;
}

function presentBureaucramancerProtocolLobbyLine(session: PartySessionRecord): string {
  const signatureCount = Math.max(0, Math.floor(session.personalProtocol?.signatureCount ?? 0));
  return `📄 Протокол 13-З відкрито. Підписів: ${signatureCount}.`;
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
    return [
      `Стан: рейд почнеться автоматично о ${formatTime(session.expiresAt)}.`,
      "Лідер ватаги може почати бій раніше. До того зайдіть у збір і полікуйтеся."
    ].join("\n");
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

function presentBigBarrelVictoryResult(
  session: PartyBossSessionRecord,
  viewerCharacterId: string | null
): string {
  const reward = getViewerResultParticipant(session, viewerCharacterId)?.reward;
  const lines = [
    "🎉 Ватага перемогла. Проблема закрита, журнал задоволено хрумтить сторінкою."
  ];

  if (!reward) {
    const publicReward = summarizeBigBarrelRewards(session);
    if (publicReward) {
      lines.push("", presentBigBarrelPublicReward(publicReward));
    } else {
      lines.push("", "Загальну винагороду рейду не знайдено в старому записі. Якщо ви билися, відкрийте власну бойову картку або результати за рейдовим посиланням.");
    }
    return lines.join("\n");
  }

  lines.push("", presentRewardAmount({
    xp: reward.xp,
    gold: reward.gold,
    label: "Ваша винагорода за рейд"
  }));

  for (const grant of reward.itemGrants) {
    lines.push(presentRewardItemGrant({
      name: escapeHtml(grant.name),
      quantity: grant.quantity
    }));
  }

  return lines.join("\n");
}

function summarizeBigBarrelRewards(session: PartyBossSessionRecord): PartyBossRewardSnapshot | null {
  const rewards = session.result?.participants
    .map((participant) => participant.reward)
    .filter((reward): reward is PartyBossRewardSnapshot => Boolean(reward)) ?? [];

  if (rewards.length === 0) {
    return null;
  }

  const itemGrants = new Map<string, PartyBossRewardSnapshot["itemGrants"][number]>();
  for (const reward of rewards) {
    for (const grant of reward.itemGrants) {
      const key = `${grant.itemId}\u0000${grant.name}`;
      const existing = itemGrants.get(key);
      itemGrants.set(key, existing
        ? { ...existing, quantity: existing.quantity + grant.quantity }
        : { ...grant });
    }
  }

  return {
    xp: rewards.reduce((sum, reward) => sum + reward.xp, 0),
    gold: rewards.reduce((sum, reward) => sum + reward.gold, 0),
    itemGrants: [...itemGrants.values()]
  };
}

function presentBigBarrelPublicReward(reward: PartyBossRewardSnapshot): string {
  const lines = [presentRewardAmount({
    xp: reward.xp,
    gold: reward.gold,
    label: "Загальна винагорода рейду"
  })];

  for (const grant of reward.itemGrants) {
    lines.push(presentRewardItemGrant({
      name: escapeHtml(grant.name),
      quantity: grant.quantity
    }).replace("Здобуто:", "Здобуто загалом:"));
  }

  return lines.join("\n");
}

function presentBigBarrelLossResult(
  session: PartyBossSessionRecord,
  viewerCharacterId: string | null
): string {
  const state = session.state;
  const viewer = viewerCharacterId
    ? state.participants.find((participant) => participant.characterId === viewerCharacterId)
    : null;
  const storedAttemptXp = getStoredAttemptXpValues(session, viewerCharacterId);
  const xpValues = storedAttemptXp.length > 0
    ? storedAttemptXp
    : (viewer ? [viewer] : state.participants)
        .filter(isMeaningfulBigBarrelParticipant)
        .map((participant) => buildBigBarrelLossXp(state, participant))
        .filter((xp) => xp > 0);
  const uniqueXpValues = [...new Set(xpValues)].sort((left, right) => left - right);
  const rewardLine = uniqueXpValues.length === 0
    ? "XP не нараховано: журнал не побачив реальної участі."
    : uniqueXpValues.length === 1
      ? `+${uniqueXpValues[0]} XP`
      : `+${uniqueXpValues[0]}-${uniqueXpValues.at(-1)} XP залежно від участі`;

  return [
    `💤 Ватага програла. Старший Брат Бочки вистояв із ${state.boss.hp}/${state.boss.hpMax} HP.`,
    "Пива цього разу не виставити: Бочка поставила кухлі під нагляд.",
    "",
    "🎒 За спробу:",
    rewardLine
  ].join("\n");
}

function presentPartyBossItemUnavailableNotice(
  reason: Extract<PartyBossActionResult, { state: "item-unavailable" }>["reason"]
): string {
  switch (reason) {
    case "full-hp":
      return "Манатка покрутилася в руках і не знайшла синця, який варто драматизувати.";
    case "not-owned":
      return "Манатки не знайшлося в торбі. Можливо, вона відповідально панікує деінде.";
    case "reserved":
      return "Цю манатку вже тримає інша квестарняна канцелярія.";
    case "item-on-cooldown":
      return "Ця манатка ще відсапується після минулого застосування.";
    case "item-limit-reached":
      return "Ця манатка вже зробила свою справу в цьому рейді.";
    case "not-usable":
      return "Ця манатка не підходить для бойового лікування.";
  }
}

function presentPartyBossGearUnavailableNotice(
  reason: Extract<PartyBossActionResult, { state: "gear-unavailable" }>["reason"]
): string {
  switch (reason) {
    case "not-enough-mana":
      return "Дія спорядження не спрацювала: мани замало для рейдового протоколу.";
    case "skill-on-cooldown":
      return "Дія спорядження ще відсапується. Корчмар показує свіжу картку бою.";
  }
}

function getViewerResultParticipant(
  session: PartyBossSessionRecord,
  viewerCharacterId: string | null
): NonNullable<PartyBossSessionRecord["result"]>["participants"][number] | null {
  if (!session.result) {
    return null;
  }

  if (viewerCharacterId) {
    return session.result.participants.find((participant) => participant.characterId === viewerCharacterId) ?? null;
  }

  return null;
}

function getStoredAttemptXpValues(
  session: PartyBossSessionRecord,
  viewerCharacterId: string | null
): number[] {
  if (!session.result) {
    return [];
  }

  return session.result.participants
    .filter((participant) => !viewerCharacterId || participant.characterId === viewerCharacterId)
    .map((participant) => participant.attemptXp ?? 0)
    .filter((xp) => xp > 0);
}

function isBigPartyBossSession(session: PartyBossSessionRecord): boolean {
  return session.rulesVersion === "big-barrel-brother-v1" ||
    session.bossKey === "big-barrel-brother" ||
    session.state.boss.monsterId === "big-barrel-brother";
}

function presentPartyBossStartTip(
  session: PartyBossSessionRecord,
  viewerCharacterId: string | null | undefined
): string | null {
  const participant = viewerCharacterId
    ? session.participants.find((candidate) => candidate.id === viewerCharacterId)
    : session.participants[0] ?? null;

  if (!participant) {
    return null;
  }

  const flavor = selectCharacterFlavorLine(summarizeCharacter(participant, {
    remortCount: participant.remortCount
  }), {
    placement: "raid.prep-hint",
    scene: "barrel",
    seed: `party-boss-start:${session.id}:${viewerCharacterId ?? participant.id}`
  });

  return flavor ? `<i>Порада дня: ${escapeHtml(flavor.text)}</i>` : null;
}

function presentPartyBossActionLine(
  action: PartyBossSessionRecord["state"]["roundLog"][number]["actions"][number],
  participant: PartyBossSessionRecord["state"]["participants"][number] | undefined,
  viewerCharacterId: string | null
): string {
  const isViewer = Boolean(viewerCharacterId && action.characterId === viewerCharacterId);
  const name = escapeHtml(participant?.name ?? "Учасник");

  if (action.outcome === "taunt-activated") {
    return isViewer
      ? "Ви гукаєте «🛡️ На мене!» — увага Бочки переходить до вас."
      : `${name} гукає «🛡️ На мене!» — увага Бочки переходить туди.`;
  }
  if (action.outcome === "taunt-failed") {
    return isViewer
      ? "Ваш виклик запізнився: Бочка вже обрала, кого слухати."
      : `${name} гукає до Бочки, але виклик запізнюється.`;
  }

  if (action.outcome === "item-used") {
    const itemName = presentPartyBossItemName(action.itemId, action.itemName ?? "манатку");
    const healing = presentPartyBossItemHealing(action);

    return isViewer
      ? `Ви застосували ${itemName}.${healing}`
      : `${name} застосовує ${itemName}.${healing}`;
  }

  if (action.outcome === "defended") {
    if (action.origin === "timeout") {
      return isViewer
        ? "Корчма не дочекалася вашого вибору й поставила вас у захист: ворогові важче влучити, а удар буде слабшим."
        : `${name}: Корчма не дочекалася вибору й поставила в захист: ворогові важче влучити, а удар буде слабшим.`;
    }

    return isViewer
      ? "Ви стали в захист: ворогові важче влучити, а удар буде слабшим."
      : `${name} у захисті: ворогові важче влучити, а удар буде слабшим.`;
  }

  const subject = presentPartyBossActionSubject(action, name, isViewer);
  const support = presentPartyBossActionSupport(action);

  switch (action.outcome) {
    case "miss":
      return `${subject} не влучає.`;
    case "not-enough-mana":
      return `${subject} не спрацьовує: не вистачило мани.`;
    case "skill-on-cooldown":
      return `${subject} не спрацьовує: ще відсапується.`;
    case "critical-fumble":
      return `${subject} зривається критично.`;
    case "critical-hit":
      return action.damage > 0
        ? `${subject} критично влучає на ${action.damage} шкоди.${support}`
        : `${subject} критично спрацьовує без прямої шкоди.${support}`;
    case "won":
      return action.damage > 0
        ? `${subject} влучає на ${action.damage} шкоди й добиває боса.${support}`
        : `${subject} ставить фінальну крапку без прямої шкоди.${support}`;
    case "hit":
      return action.damage > 0
        ? `${subject} влучає на ${action.damage} шкоди.${support}`
        : `${subject} спрацьовує без прямої шкоди.${support}`;
    default:
      return action.damage > 0
        ? `${subject} влучає на ${action.damage} шкоди.${support}`
        : `${subject} спрацьовує без прямої шкоди.${support}`;
  }
}

function presentVarenykSatedRecoveryLine(
  action: PartyBossSessionRecord["state"]["roundLog"][number]["actions"][number]
): string | null {
  const recovery = action.satedRecovery;
  if (!recovery || (recovery.hpRestored <= 0 && recovery.manaRestored <= 0)) {
    return null;
  }
  const parts = [
    ...(recovery.hpRestored > 0 ? [`+${recovery.hpRestored} HP`] : []),
    ...(recovery.manaRestored > 0 ? [`+${recovery.manaRestored} мани`] : [])
  ];
  return `😋 «Ситий» підклав до журналу ${parts.join(" і ")}.`;
}

function presentPartyBossActionSupport(
  action: PartyBossSessionRecord["state"]["roundLog"][number]["actions"][number]
): string {
  const line = presentCombatSupportEffectLine(action, {
    healingPrefix: "HP відновлено на"
  });

  return line ? ` ${line}` : "";
}

function presentPartyBossItemHealing(
  action: PartyBossSessionRecord["state"]["roundLog"][number]["actions"][number]
): string {
  if (!action.healing || action.healing <= 0) {
    return " Але журнал не знайшов браку HP.";
  }

  if (isPartyBossFieldKit(action.itemId, action.itemName) && action.hpAfter !== undefined) {
    return ` HP підтягнуто до ${action.hpAfter}.`;
  }

  return ` HP відновлено на ${action.healing}.`;
}

function presentPartyBossActionSubject(
  action: PartyBossSessionRecord["state"]["roundLog"][number]["actions"][number],
  name: string,
  isViewer: boolean
): string {
  if (action.action === "skill" || action.action === "race" || action.action === "gear") {
    const skillLabel = presentCombatSkillHtml(action.skillId);

    if (action.action === "gear") {
      return isViewer
        ? `Ваша дія спорядження ${skillLabel}:`
        : `${name} застосовує ${skillLabel}:`;
    }

    return isViewer
      ? `Ваше вміння ${skillLabel}:`
      : `${name} застосовує ${skillLabel}:`;
  }

  if (action.action === "attack") {
    return isViewer ? "Ваша атака" : `Атака ${name}`;
  }

  return isViewer ? "Ваша дія" : `Дія ${name}`;
}

function presentPartyBossCooldownLines(
  viewer: PartyBossSessionRecord["state"]["participants"][number] | null,
  state: PartyBossSessionRecord["state"]
): string[] {
  if (!viewer || viewer.status !== "active" || viewer.resources.hp <= 0) {
    return [];
  }

  const skillLines = presentCooldownLines(viewer.resources.cooldowns);
  const itemLines = presentItemCooldownLines(viewer.combatItems);
  const tauntAvailableTurn = state.warriorTaunt?.cooldowns[viewer.characterId]?.availableTurn;
  const tauntLines = viewer.combatStats.classId === "class.warrior" && tauntAvailableTurn !== undefined && tauntAvailableTurn > state.turn
    ? [`🫁 🛡️ «На мене!» відсапується: ще ${formatTurns(tauntAvailableTurn - state.turn)}.`]
    : [];

  return [...skillLines, ...itemLines, ...tauntLines];
}

function presentItemCooldownLines(
  combatItems: PartyBossSessionRecord["state"]["participants"][number]["combatItems"] | undefined
): string[] {
  return Object.values(combatItems?.cooldowns ?? {})
    .filter((cooldown) => cooldown.remainingTurns > 0)
    .map((cooldown) =>
      `🫁 ${getPartyBossItemIcon(cooldown.itemId)} ${escapeHtml(getPartyBossItemName(cooldown.itemId))} відсапується: ще ${formatTurns(cooldown.remainingTurns)}.`
    );
}

function presentCooldownLines(
  cooldowns: PartyBossSessionRecord["state"]["participants"][number]["resources"]["cooldowns"]
): string[] {
  return getCooldownEntries(cooldowns).map((cooldown) => {
    const skill = getCombatSkillDisplay(cooldown.id);

    return `🫁 ${skill.icon} <i>${escapeHtml(skill.name)}</i> відсапується: ще ${formatTurns(cooldown.remainingTurns)}.`;
  });
}

function presentPartyBossItemName(itemId: string | undefined, fallbackName: string): string {
  const icon = getPartyBossItemIcon(itemId, fallbackName);
  return `${icon} <b>${escapeHtml(fallbackName)}</b>`;
}

function getPartyBossItemName(itemId: string | undefined): string {
  if (isPartyBossFieldKit(itemId)) {
    return "Польова аптечка";
  }

  if (itemId === DENSE_BANDAGE_ITEM_ID) {
    return "Щільний бинт";
  }

  return "Манатка";
}

function getPartyBossItemIcon(itemId: string | undefined, itemName?: string): string {
  if (isPartyBossFieldKit(itemId, itemName)) {
    return "🩺";
  }

  return "🩹";
}

function isPartyBossFieldKit(itemId: string | undefined, itemName?: string): boolean {
  return itemId === FIELD_KIT_ITEM_ID || itemName === "Польова аптечка";
}

function getCooldownEntries(
  cooldowns: PartyBossSessionRecord["state"]["participants"][number]["resources"]["cooldowns"]
): Array<{ id: string; remainingTurns: number }> {
  const entries: Array<{ id: string; remainingTurns: number }> = [];
  const seen = new Set<string>();

  if (cooldowns?.skill?.remainingTurns) {
    entries.push(cooldowns.skill);
    seen.add(cooldowns.skill.id);
  }

  for (const cooldown of Object.values(cooldowns?.abilities ?? {})) {
    if (cooldown.remainingTurns > 0 && !seen.has(cooldown.id)) {
      entries.push(cooldown);
      seen.add(cooldown.id);
    }
  }

  return entries;
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

function presentNextRetaliationFocus(
  state: PartyBossSessionRecord["state"],
  previousRound: PartyBossSessionRecord["state"]["roundLog"][number]
): string | null {
  const plan = getPartyBossRetaliationPlan(state);
  if (isSameRetaliationFocus(plan.characterIds, previousRound.bossRetaliations.map((retaliation) => retaliation.characterId))) {
    return null;
  }

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

  const activeTauntTargetId = round.warriorTaunt?.expiredCharacterId
    ? null
    : (round.warriorTaunt?.bossAttacksRemaining ?? 0) > 0
      ? round.warriorTaunt?.redirectedCharacterId ?? round.warriorTaunt?.activatedCharacterId
      : null;
  if (activeTauntTargetId) {
    const targetName = session.state.participants.find((participant) => participant.characterId === activeTauntTargetId)?.name;
    return targetName ? `🎯 На наступний хід увага боса незмінна. Ціль: ${escapeHtml(targetName)}.` : null;
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
  if (targetId && isSameRetaliationFocus([targetId], round.bossRetaliations.map((retaliation) => retaliation.characterId))) {
    return null;
  }

  const targetName = session.state.participants.find((participant) => participant.characterId === targetId)?.name;

  return targetName ? `🎯 На наступний хід увага боса переходить на ${escapeHtml(targetName)}.` : null;
}

function isSameRetaliationFocus(nextCharacterIds: string[], previousCharacterIds: string[]): boolean {
  return previousCharacterIds.length > 0 &&
    nextCharacterIds.length === previousCharacterIds.length &&
    nextCharacterIds.every((characterId, index) => characterId === previousCharacterIds[index]);
}

function formatSecondsLong(milliseconds: number): string {
  const seconds = Math.max(1, Math.round(milliseconds / 1000));
  return `${seconds} ${pluralizeUk(seconds, "секунда", "секунди", "секунд")}`;
}

function formatTurns(turns: number): string {
  const safeTurns = Math.max(1, Math.floor(turns));

  return `${safeTurns} ${pluralizeUk(safeTurns, "хід", "ходи", "ходів")}`;
}

function presentPartyInviteLine(session: PartySessionRecord, inviteUrl: string): string {
  const flavor = isBigBarrelParty(session)
    ? BIG_BARREL_INVITE_TEMPLATES[pickInviteTemplateIndex(session.inviteToken)]?.body[0] ?? BIG_BARREL_INVITE_TEMPLATES[0]?.body[0]
    : "Передайте це посилання тому, хто має прийти у ватагу:";

  return `${flavor}\nЗапрошення: <a href="${escapeHtml(inviteUrl)}">${escapeHtml(inviteUrl)}</a>`;
}

export function presentPartyInviteShare(
  session: PartySessionRecord,
  inviteUrl: string,
  options: { templateIndex: number }
): string {
  const template = BIG_BARREL_INVITE_TEMPLATES[normalizeBigBarrelInviteTemplateIndex(options.templateIndex)] ??
    BIG_BARREL_INVITE_TEMPLATES[0];

  if (!template) {
    throw new Error("Big Barrel invite templates must not be empty.");
  }

  const leaderName = presentCharacterDisplayName(session.leader);
  const participantCount = session.participants.filter((participant) => participant.status === "joined").length;

  return [
    `<b>${template.header}</b>`,
    "",
    ...template.body.flatMap((line) => [line, ""]).slice(0, -1),
    "",
    `Ватажок: ${leaderName}`,
    `Учасників: <b>${participantCount}/${session.participantCap}</b>`,
    "Формат: гуртовий рейд проти Старшого Брата Бочки.",
    "",
    escapeHtml(inviteUrl)
  ].join("\n");
}

export function presentBigBarrelApproachNotice(
  seed: string,
  options: { templateIndex?: number | null | undefined } = {}
): string {
  const index = options.templateIndex ?? getInitialBigBarrelApproachTemplateIndex(seed);
  const template = BIG_BARREL_APPROACH_TEMPLATES[normalizeBigBarrelApproachTemplateIndex(index)] ??
    BIG_BARREL_APPROACH_TEMPLATES[0];

  if (!template) {
    throw new Error("Big Barrel approach templates must not be empty.");
  }

  return [
    "Ви підійшли до Бочки Пінного Міражу.",
    "",
    ...template.body
  ].join("\n");
}

export function getInitialBigBarrelApproachTemplateIndex(seed: string): number {
  return stableIndex(seed, BIG_BARREL_APPROACH_TEMPLATES.length);
}

export function getNextBigBarrelApproachTemplateIndex(seed: string, currentIndex: number): number {
  const current = normalizeBigBarrelApproachTemplateIndex(currentIndex);

  if (BIG_BARREL_APPROACH_TEMPLATES.length <= 1) {
    return current;
  }

  const offset = stableIndex(`${seed}:approach-step`, BIG_BARREL_APPROACH_TEMPLATES.length - 1) + 1;

  return (current + offset) % BIG_BARREL_APPROACH_TEMPLATES.length;
}

export function normalizeBigBarrelApproachTemplateIndex(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value >= BIG_BARREL_APPROACH_TEMPLATES.length) {
    return 0;
  }

  return value;
}

export function getInitialBigBarrelInviteTemplateIndex(token: string): number {
  return stableIndex(token, BIG_BARREL_INVITE_TEMPLATES.length);
}

export function getNextBigBarrelInviteTemplateIndex(token: string, currentIndex: number): number {
  const current = normalizeBigBarrelInviteTemplateIndex(currentIndex);

  if (BIG_BARREL_INVITE_TEMPLATES.length <= 1) {
    return current;
  }

  const offset = stableIndex(`${token}:step`, BIG_BARREL_INVITE_TEMPLATES.length - 1) + 1;

  return (current + offset) % BIG_BARREL_INVITE_TEMPLATES.length;
}

export function normalizeBigBarrelInviteTemplateIndex(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value >= BIG_BARREL_INVITE_TEMPLATES.length) {
    return 0;
  }

  return value;
}

export const BIG_BARREL_INVITE_TEMPLATES = [
  {
    id: "barrel-counts",
    header: "🛢️ Рейдові двері біля Бочки",
    body: [
      "Бочка підозріло хлюпає. Покличте ще когось, поки вона не навчилася рахувати.",
      "Переходьте за посиланням, заходьте у збір і полікуйтеся до старту."
    ]
  },
  {
    id: "official-foam",
    header: "📜 Пінний протокол відкрито",
    body: [
      "Корчмар видав рейдові двері й попросив не грюкати ними по реальності.",
      "Старший Брат Бочки вже дивиться у журнал. Ватага ще може стати більшою."
    ]
  },
  {
    id: "solo-legends",
    header: "🍺 Самовпевненість просить підмогу",
    body: [
      "Піна шепоче, що самотні пригодники швидше стають легендами.",
      "Краще перейти за посиланням і додати себе до списку до того, як Корчма зробить це за вас."
    ]
  },
  {
    id: "group-protocol",
    header: "🧾 Гуртовий протокол Бочки",
    body: [
      "Біля Бочки відкрився гуртовий протокол. Він не кусається першим.",
      "Переходьте за посиланням, доки протокол не згадав, що вміє закриватися."
    ]
  },
  {
    id: "more-hands",
    header: "🤲 Рейдовий кухоль кличе руки",
    body: [
      "Рейдовий кухоль просить більше рук і менше самовпевненості.",
      "Усередині буде Старший Брат Бочки, тож героїзм краще приносити гуртом."
    ]
  },
  {
    id: "forward-heroism",
    header: "📣 Героїзм для пересилання",
    body: [
      "Корчма дозволяє форвардити цей шматок героїзму без довідки.",
      "Посилання веде просто у збір. Далі Корчмар рахуватиме тих, хто встиг."
    ]
  },
  {
    id: "where-trouble-starts",
    header: "🚪 Де починається біда",
    body: [
      "Якщо хтось питає, де починається біда, покажіть ці двері.",
      "Біда офіційна, пінна й дуже хоче, щоб учасників було більше одного."
    ]
  },
  {
    id: "useful-witnesses",
    header: "👀 Свідки корисніші з кнопками",
    body: [
      "Бочка не проти глядачів, але корисніші ті, хто натискає кнопки.",
      "Переходьте за посиланням і станьте не просто свідком, а рядком у рейдовому списку."
    ]
  },
  {
    id: "full-list",
    header: "🗂️ Старший Брат любить списки",
    body: [
      "Старший Брат Бочки любить повні списки. Допишіть ще пригодників.",
      "Посилання нижче веде до збору, де список поки не дивиться на вас осудливо."
    ]
  },
  {
    id: "smells-like-try",
    header: "🫧 Пахне піною й ризиком",
    body: [
      "Це посилання пахне піною, ризиком і дуже офіційним «ну спробуйте».",
      "Заходьте у збір, перевірте HP і ману, а тоді вже сперечайтеся з Бочкою."
    ]
  },
  {
    id: "almost-ready",
    header: "⏳ Для тих, хто майже готовий",
    body: [
      "Ватага ще збирається. Саме час покликати того, хто завжди «майже готовий».",
      "Переходьте за посиланням: Корчма терпляча, але таймер ні."
    ]
  },
  {
    id: "open-enough",
    header: "🔓 Двері прочинені рівно настільки",
    body: [
      "Корчмар лишив рейдові двері прочиненими рівно настільки, щоб їх переслати.",
      "Далі двері можуть зачинитися, а Старший Брат Бочки — почати виховну роботу."
    ]
  },
  {
    id: "foam-audit",
    header: "🧮 Пінна ревізія учасників",
    body: [
      "Бочка почала рахувати образи й підозріло швидко дійшла до ватаги.",
      "Переходьте за посиланням, поки ревізія ще приймає добровольців."
    ]
  }
] as const;

export const BIG_BARREL_APPROACH_TEMPLATES = [
  {
    id: "furniture-offense",
    body: [
      "Бочку довго ображали словом «меблі». Старший Брат Бочки підняв кришку, подивився в журнал і вирішив втрутитися.",
      "Тепер це не легенький соло-рейд, а повноцінна бійка. Збирайте ватагу."
    ]
  },
  {
    id: "solo-retired",
    body: [
      "Корчмар уже дістав старий бочковий протокол, але зсередини хтось дописав: «соло-героїзм тимчасово не приймаємо».",
      "Старший Брат Бочки хоче бачити ватагу, а не одного сміливця з підозрілою впевненістю."
    ]
  },
  {
    id: "lid-vote",
    body: [
      "Кришка Бочки піднялася так повільно, ніби голосувала проти ваших планів.",
      "Це вже гуртовий рейд. Покличте ще пригодників, поки журнал не призначив вас усім відділом."
    ]
  },
  {
    id: "foam-committee",
    body: [
      "Піна зібралася в коло й дуже схожа на комітет із поганих новин.",
      "Старший Брат Бочки виходить на повну бійку: потрібна ватага, бинти й колективна відсутність сорому."
    ]
  },
  {
    id: "old-raid-closed",
    body: [
      "Стара Бочка ще тут, але її старший родич уже перегорнув сторінку правил.",
      "Легкий рейд закінчився. Далі — збір ватаги й справжня бочкова суперечка."
    ]
  },
  {
    id: "ledger-summons",
    body: [
      "Журнал біля Бочки сам розкрився на сторінці «попросити підкріплення».",
      "Старший Брат Бочки не приймає одиночних пояснень. Відкривайте рейдовий збір і кличте ватагу."
    ]
  },
  {
    id: "hoop-warning",
    body: [
      "Обручі на Бочці дзенькнули так, ніби хтось розігріває рейдовий гонг.",
      "Попереду не коротка вилазка, а бійка з босом. Саме час зробити вигляд, що у вас є план і ватага."
    ]
  },
  {
    id: "foam-notice",
    body: [
      "На піні проступив службовий напис: «одного пригодника замало для цієї дурниці».",
      "Старший Брат Бочки чекає гуртового рейду. Збирайте людей, поки напис не став претензією."
    ]
  },
  {
    id: "korchmar-squints",
    body: [
      "Корчмар примружився на Бочку й перестав називати це «маленькою справою».",
      "Тепер потрібна ватага: Старший Брат Бочки готує рейдовий бій, де самотня хоробрість швидко стає бухгалтерією травм."
    ]
  },
  {
    id: "barrel-clears-throat",
    body: [
      "Бочка прочистила горло. У меблів, як виявилося, теж буває старший брат і довга памʼять.",
      "Не йдіть самі: це вже не прогулянка до нагороди, а рейдова бійка для ватаги."
    ]
  },
  {
    id: "chairs-step-back",
    body: [
      "Стільці біля Бочки непомітно відсунулися. Це ніколи не добрий знак.",
      "Старший Брат Бочки бере сцену на себе. Відкривайте рейдовий збір і приводьте ватагу."
    ]
  },
  {
    id: "foam-briefing",
    body: [
      "Піна на Бочці згорнулася в короткий інструктаж, який ніхто не просив.",
      "Суть проста: соло-рейд пішов у відпустку, натомість починається повноцінна рейдова бійка."
    ]
  },
  {
    id: "barrel-audit",
    body: [
      "Бочка провела внутрішній аудит і виявила забагато самовпевнених одинаків.",
      "Старший Брат Бочки виправляє процес: збирайте ватагу, бо тепер це гуртовий протокол із ударами."
    ]
  }
] as const;

function pickInviteTemplateIndex(token: string): number {
  return getInitialBigBarrelInviteTemplateIndex(token);
}

function stableIndex(seed: string, modulo: number): number {
  if (modulo <= 0) {
    return 0;
  }

  let hash = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) % modulo;
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

function presentRecruitingParticipantName(
  participant: PartyParticipantRecord,
  options: { showReadiness: boolean }
): string {
  const marker = options.showReadiness
    ? participant.readiness === "ready" ? "✅ " : "⏳ "
    : "";

  return `${marker}${presentParticipantName(participant)}`;
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
