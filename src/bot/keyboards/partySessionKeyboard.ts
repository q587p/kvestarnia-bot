import { InlineKeyboard } from "grammy";
import {
  getActorCombatActionAvailability,
  getCombatGearActionAvailabilityForActor,
  getCombatRaceAbilityProfile,
  getCombatSkillProfile
} from "../../domain/combat";
import { getCombatMantokAbilityGrantsByIds } from "../../content";
import { getWarriorRaidTauntAvailability } from "../../domain/partyBoss/partyBoss";
import type { PartySessionRecord } from "../../db/repositories/partySessionRepository";
import type { PartyBossSessionRecord } from "../../db/repositories/partyBossRepository";
import type { PartyBossCombatItemMenuEntry } from "../../services/partyBossService";
import type { NearbyDuelCandidatesSnapshot, PresencePerson } from "../../services/presenceService";
import { getCombatSkillDisplay } from "../../services/fightService";
import {
  makePartyBossActionCallbackData,
  makePartyBossGearActionCallbackData,
  makePartyBossItemsMenuCallbackData,
  makePartyBossItemUseCallbackData,
  makePartyBossJournalCallbackData,
  makePartyBossStartCallbackData,
  makePartyBossTimeoutCallbackData,
  makePartyRaidChatComposeCallbackData,
  makePartyRaidChatOpenCallbackData,
  makePartySessionCancelCallbackData,
  makePartySessionExpireCallbackData,
  makePartySessionInviteRotateCallbackData,
  makePartySessionJoinCallbackData,
  makePartySessionLeaveCallbackData,
  makePartySessionNearbyInviteCallbackData,
  makePartySessionNearbyOpenCallbackData,
  makePartySessionProtocolFileCallbackData,
  makePartySessionProtocolSignCallbackData,
  makePartySessionReadinessCallbackData,
  makePartySessionWardPlaceCallbackData,
  makePartySessionWardSupportCallbackData,
  makePartySessionShareCallbackData,
  makePartySessionViewCallbackData
} from "../callbacks/partySessionCallbackData";
import { appendGearActionButtons } from "./gearActionKeyboard";
import { addPaginationControls } from "./pagination";

const MAX_BUTTON_NAME_LENGTH = 32;

export function buildPartySessionKeyboard(
  session: PartySessionRecord,
  options: {
    viewerCharacterId?: string | null | undefined;
    inviteUrl?: string | null | undefined;
    includeDevExpire?: boolean | undefined;
    includeBossStart?: boolean | undefined;
    includeRaidChat?: boolean | undefined;
  } = {}
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const token = session.inviteToken;
  let refreshPlaced = false;

  if (session.status === "recruiting") {
    const isBigBarrel = session.originLocationId === "barrel.big-brother";
    const joinedParticipantCount = session.participants.filter((participant) => participant.status === "joined").length;
    const viewer = options.viewerCharacterId
      ? session.participants.find(
          (participant) =>
            participant.characterId === options.viewerCharacterId && participant.status === "joined"
        )
      : null;

    if (!viewer) {
      keyboard.text("🤝 Приєднатися", makePartySessionJoinCallbackData(token)).row();
    } else {
      if (session.originLocationId === "barrel.big-brother") {
        const ready = viewer.readiness === "ready";
        keyboard.text(
          ready ? "⏳ Зачекайте" : getReadyButtonLabel(viewer.character.pronoun),
          makePartySessionReadinessCallbackData(token, ready ? "waiting" : "ready")
        ).text("🔎 Оновити", makePartySessionViewCallbackData(token)).row();
        refreshPlaced = true;
        if (!session.wardSign && canPlaceKharakternykWardSign(viewer)) {
          keyboard.text("🧿 Поставити знак", makePartySessionWardPlaceCallbackData(token)).row();
        } else if (canSupportKharakternykWardSign(session, viewer)) {
          keyboard.text("✋ Підперти знак", makePartySessionWardSupportCallbackData(token)).row();
        }
        if (!session.personalProtocol && canFileBureaucramancerProtocol(viewer)) {
          keyboard.text("📄 Форма 13-А", makePartySessionProtocolFileCallbackData(token)).row();
        } else if (canSignBureaucramancerProtocol(session, viewer)) {
          keyboard.text("✍️ Підписати протокол", makePartySessionProtocolSignCallbackData(token)).row();
        }
      }
      keyboard.text("🚪 Вийти", makePartySessionLeaveCallbackData(token));
      if (options.viewerCharacterId === session.leaderCharacterId && joinedParticipantCount < 2) {
        keyboard.text("🧹 Скасувати збір", makePartySessionCancelCallbackData(token));
      }
      keyboard.row();
    }

    if (!options.includeBossStart && options.includeDevExpire && options.viewerCharacterId === session.leaderCharacterId) {
      keyboard.text("🧪 Dev: бос-проба", makePartyBossStartCallbackData(token)).row();
    }

    if (viewer && options.includeRaidChat) {
      keyboard.text("💬 Написати в рейд-чат", makePartyRaidChatComposeCallbackData(token)).row();
    }

    if (isBigBarrel && options.inviteUrl) {
      keyboard
        .text("📣 Картка запрошення", makePartySessionShareCallbackData(token))
        .url("🔗 Запросити на рейд", buildTelegramShareUrl(options.inviteUrl))
        .row();
    }

    if (options.includeDevExpire) {
      keyboard.text("⏱️ Dev: завершити строк", makePartySessionExpireCallbackData(token)).row();
    }

    if (options.includeBossStart && options.viewerCharacterId === session.leaderCharacterId) {
      keyboard.text("🛢️ Почати рейд", makePartyBossStartCallbackData(token)).row();
    }
  }

  if (!refreshPlaced) {
    keyboard.text("🔎 Оновити", makePartySessionViewCallbackData(token));
  }

  return keyboard;
}

function canPlaceKharakternykWardSign(
  viewer: PartySessionRecord["participants"][number]
): boolean {
  return viewer.character.classId === "class.kharakternyk" && viewer.character.level >= 3;
}

function canSupportKharakternykWardSign(
  session: PartySessionRecord,
  viewer: PartySessionRecord["participants"][number]
): boolean {
  return Boolean(
    session.wardSign &&
    session.wardSign.placerCharacterId !== viewer.characterId &&
    viewer.wardSignSupport?.placerCharacterId !== session.wardSign.placerCharacterId
  );
}

function canFileBureaucramancerProtocol(
  viewer: PartySessionRecord["participants"][number]
): boolean {
  return viewer.character.classId === "class.bureaucramancer" && viewer.character.level >= 3;
}

function canSignBureaucramancerProtocol(
  session: PartySessionRecord,
  viewer: PartySessionRecord["participants"][number]
): boolean {
  return Boolean(
    session.personalProtocol &&
    (
      viewer.personalProtocolSignature?.protocolId !== session.personalProtocol.protocolId ||
      viewer.personalProtocolSignature.filerCharacterId !== session.personalProtocol.filerCharacterId
    )
  );
}

export function buildPartyBossKeyboard(
  session: PartyBossSessionRecord,
  viewerCharacterId: string | null,
  options: {
    includeCombatItems?: boolean | undefined;
    includeDevTimeout?: boolean | undefined;
    now?: Date | undefined;
    includeRaidChat?: boolean | undefined;
  } = {}
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const viewer = viewerCharacterId
    ? session.state.participants.find((participant) => participant.characterId === viewerCharacterId)
    : null;
  const canAct = viewer?.status === "active" && viewer.resources.hp > 0;
  const lamentLocked = Boolean(
    viewer &&
    session.state.bardMusic?.kind === "lament" &&
    session.state.bardMusic.sourceCharacterId === viewer.characterId &&
    session.state.bardMusic.activatedTurn === session.turn
  );
  const availability = viewer
    ? getActorCombatActionAvailability(viewer.resources, viewer.combatStats)
    : null;

  if (session.status === "active" && viewerCharacterId && canAct && !lamentLocked) {
    keyboard
      .text("🗡️ Вдарити", makePartyBossActionCallbackData(session.partyInviteToken, session.turn, "attack"))
      .text("🧱 Захищатися", makePartyBossActionCallbackData(session.partyInviteToken, session.turn, "defend"))
      .row();

    if (getWarriorRaidTauntAvailability(session.state, viewer.characterId).available) {
      keyboard.text(
        "🛡️ На мене!",
        makePartyBossActionCallbackData(session.partyInviteToken, session.turn, "taunt")
      ).row();
    }

    const bardMusicReady = !viewer.bardMusicAvailableAt ||
      Date.parse(viewer.bardMusicAvailableAt) <= (options.now ?? new Date()).getTime();
    if (
      viewer.combatStats.classId === "class.bard" &&
      session.state.bardMusic?.kind === "none" &&
      bardMusicReady
    ) {
      keyboard.text(
        "🎻 Заграти журливу баладу",
        makePartyBossActionCallbackData(session.partyInviteToken, session.turn, "lament")
      ).row();
    }

    if (availability?.skill.available !== false) {
      keyboard.text(
        getPartyBossSkillButtonLabel(viewer.combatStats.classId),
        makePartyBossActionCallbackData(session.partyInviteToken, session.turn, "skill")
      );
    }

    const raceLabel = getPartyBossRaceAbilityButtonLabel(viewer.combatStats.raceId);
    if (raceLabel && availability?.race.available) {
      keyboard.text(
        raceLabel,
        makePartyBossActionCallbackData(session.partyInviteToken, session.turn, "race")
      );
    }

    if ((availability?.skill.available !== false) || (raceLabel && availability?.race.available)) {
      keyboard.row();
    }

    const gearGrants = getCombatMantokAbilityGrantsByIds({
      grantIds: viewer.equipmentAbilityGrantIds ?? [],
      characterLevel: viewer.combatStats.level
    }).filter((grant) =>
      grant.combat && getCombatGearActionAvailabilityForActor(viewer.resources, grant.combat.profile).available
    );
    appendGearActionButtons(
      keyboard,
      gearGrants,
      (grant) => makePartyBossGearActionCallbackData({
        token: session.partyInviteToken,
        turn: session.turn,
        grantKey: grant.key
      })
    );

    if (options.includeCombatItems === true) {
      keyboard
        .text("🎒 Одноразові манатки", makePartyBossItemsMenuCallbackData(session.partyInviteToken, session.turn))
        .row();
    }
  }

  if (session.status === "active" && options.includeDevTimeout) {
    keyboard.text("⏱️ Dev: добити хід", makePartyBossTimeoutCallbackData(session.partyInviteToken)).row();
  }

  if (session.status !== "active") {
    keyboard.text("📜 Журнал", makePartyBossJournalCallbackData(session.partyInviteToken)).row();
  }
  if (options.includeRaidChat && viewer) {
    keyboard.text("💬 Рейд-чат", makePartyRaidChatOpenCallbackData(session.partyInviteToken)).row();
  }

  return keyboard.text("🔎 Оновити", makePartySessionViewCallbackData(session.partyInviteToken));
}

export function buildPartyRaidChatKeyboard(input: {
  token: string;
  writable: boolean;
  active: boolean;
  terminal?: boolean | undefined;
}): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  if (input.writable) {
    keyboard.text("💬 Написати в рейд-чат", makePartyRaidChatComposeCallbackData(input.token)).row();
  }
  return keyboard.text(
    input.active ? "↩️ До рейду" : input.terminal ? "↩️ До результатів" : "↩️ До збору",
    makePartySessionViewCallbackData(input.token)
  );
}

export function buildPartyBossItemsKeyboard(input: {
  token: string;
  turn: number;
  items: PartyBossCombatItemMenuEntry[];
}): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  for (const item of input.items) {
    keyboard.text(
      formatCombatItemButton(item),
      makePartyBossItemUseCallbackData({
        token: input.token,
        turn: input.turn,
        itemKey: item.itemKey
      })
    ).row();
  }

  return keyboard.text("↩️ До бою", makePartySessionViewCallbackData(input.token));
}

export function buildPartyBossJournalKeyboard(
  session: PartyBossSessionRecord,
  page: number
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const total = Math.max(1, session.state.roundLog.length);
  const current = clampPage(page, total);

  if (total > 1) {
    if (current > 0) {
      keyboard.text("⏮️ Початок", makePartyBossJournalCallbackData(session.partyInviteToken, 0));
      keyboard.text("◀️ Назад", makePartyBossJournalCallbackData(session.partyInviteToken, current - 1));
      keyboard.row();
    }

    keyboard.text(`${current + 1}/${total}`, makePartyBossJournalCallbackData(session.partyInviteToken, current)).row();

    if (current + 1 < total) {
      keyboard.text("Далі ▶️", makePartyBossJournalCallbackData(session.partyInviteToken, current + 1));
      keyboard.text("Кінець ⏭️", makePartyBossJournalCallbackData(session.partyInviteToken, total - 1));
      keyboard.row();
    }
  }

  return keyboard.text(session.status === "active" ? "↩️ До бою" : "↩️ До результатів", makePartySessionViewCallbackData(session.partyInviteToken));
}

export function buildPartySessionInviteKeyboard(session: PartySessionRecord): InlineKeyboard {
  return new InlineKeyboard()
    .text("🤝 Приєднатися", makePartySessionJoinCallbackData(session.inviteToken))
    .row()
    .text("🔎 Оновити", makePartySessionViewCallbackData(session.inviteToken));
}

export function buildPartySessionInviteShareKeyboard(token: string, templateIndex: number): InlineKeyboard {
  return new InlineKeyboard().text(
    "🎲 Інший текст",
    makePartySessionInviteRotateCallbackData(token, templateIndex)
  );
}

export function buildPartySessionNearbyCandidatesKeyboard(
  snapshot: Extract<NearbyDuelCandidatesSnapshot, { state: "ready" }>
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  for (const candidate of snapshot.visible) {
    keyboard
      .text(
        `🧭 Покликати у ватагу: ${formatCandidateButton(candidate)}`,
        makePartySessionNearbyInviteCallbackData(candidate.telegramUserId, snapshot.page)
      )
      .row();
  }

  addPaginationControls(keyboard, {
    page: snapshot.page,
    totalPages: snapshot.totalPages,
    makeCallbackData: makePartySessionNearbyOpenCallbackData
  });

  keyboard.text("🔎 Оновити", makePartySessionNearbyOpenCallbackData(snapshot.page));
  return keyboard;
}

function formatCandidateButton(candidate: PresencePerson): string {
  const level = candidate.level ? ` · ${candidate.level}` : "";
  const name = candidate.name.length > MAX_BUTTON_NAME_LENGTH
    ? `${candidate.name.slice(0, MAX_BUTTON_NAME_LENGTH - 1)}…`
    : candidate.name;

  return `${name}${level}`;
}

function formatCombatItemButton(item: PartyBossCombatItemMenuEntry): string {
  const quantity = item.quantity > 1 ? ` ×${item.quantity}` : "";
  const label = `${getCombatItemIcon(item.itemId)} ${item.name}${quantity}`;

  return label.length > MAX_BUTTON_NAME_LENGTH
    ? `${label.slice(0, MAX_BUTTON_NAME_LENGTH - 1)}…`
    : label;
}

function getCombatItemIcon(itemId: string): string {
  if (itemId === "item.field-kit") {
    return "⚕️";
  }

  return "🩹";
}

function clampPage(page: number, total: number): number {
  if (!Number.isFinite(page)) {
    return 0;
  }

  return Math.min(Math.max(0, Math.floor(page)), Math.max(0, total - 1));
}

function buildTelegramShareUrl(inviteUrl: string): string {
  const text = "Квестарня кличе у рейд до Старшого Брата Бочки.";

  return `https://t.me/share/url?url=${encodeURIComponent(inviteUrl)}&text=${encodeURIComponent(text)}`;
}

function getReadyButtonLabel(pronoun: string): string {
  if (pronoun === "he") {
    return "✅ Готовий";
  }

  if (pronoun === "she") {
    return "✅ Готова";
  }

  return "✅ Готові";
}

function getPartyBossSkillButtonLabel(classId: string | undefined): string {
  const skill = getCombatSkillProfile(classId);
  const display = getCombatSkillDisplay(skill.id);

  return `${display.icon} ${display.name}`;
}

function getPartyBossRaceAbilityButtonLabel(raceId: string | undefined): string | null {
  const ability = getCombatRaceAbilityProfile(raceId);

  if (!ability) {
    return null;
  }

  const display = getCombatSkillDisplay(ability.id);

  return `${display.icon} ${display.name}`;
}
