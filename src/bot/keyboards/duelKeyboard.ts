import { InlineKeyboard } from "grammy";
import type {
  DuelChallengeView,
  DuelCreateResult
} from "../../services/duelChallengeService";
import {
  getActorCombatActionAvailability,
  getCombatGearActionAvailabilityForActor,
  getCombatRaceAbilityProfile
} from "../../domain/combat";
import { getCombatMantokAbilityGrantsByIds } from "../../content";
import { getCombatSkillDisplay } from "../../services/fightService";
import {
  makeDuelAcceptCallbackData,
  makeDuelAcceptRiskCallbackData,
  makeDuelCancelCallbackData,
  makeDuelDeclineCallbackData,
  makeDuelGearActionCallbackData,
  makeDuelInviteRotateCallbackData,
  makeDuelJournalCallbackData,
  makeDuelNewCallbackData,
  makeDuelNewTurnBasedCallbackData,
  makeDuelNewTurnBasedRiskCallbackData,
  makeDuelNewRiskCallbackData,
  makeDuelRematchCallbackData,
  makeDuelRematchRiskCallbackData,
  makeDuelShareCallbackData,
  makeDuelTurnCallbackData,
  makeDuelViewCallbackData
} from "../callbacks/duelCallbackData";
import { makeQuestCallbackData } from "../callbacks/questCallbackData";
import { makePlaceCallbackData } from "../callbacks/placeCallbackData";
import { appendGearActionButtons } from "./gearActionKeyboard";

export function buildDuelEntryKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("⚡ Миттєва дуель", makeDuelNewCallbackData())
    .row()
    .text("♟️ Покрокова дуель", makeDuelNewTurnBasedCallbackData())
    .row()
    .text("📋 До справ", makeQuestCallbackData("list"))
    .row()
    .text("🍺 До зали", makePlaceCallbackData("hall"));
}

export function buildDuelChallengeKeyboard(
  result: Extract<DuelCreateResult | DuelChallengeView, { state: "pending" }>
): InlineKeyboard {
  const token = result.challenge.inviteToken;

  return new InlineKeyboard()
    .text("🤝 Прийняти", makeDuelAcceptCallbackData(token))
    .row()
    .text("🙅 Не зараз", makeDuelDeclineCallbackData(token))
    .row()
    .text("🧹 Скасувати виклик", makeDuelCancelCallbackData(token))
    .row()
    .text("🔎 Оновити", makeDuelViewCallbackData(token));
}

export function buildDuelTargetedInviteKeyboard(
  result: Extract<DuelCreateResult | DuelChallengeView, { state: "pending" }>
): InlineKeyboard {
  const token = result.challenge.inviteToken;

  return new InlineKeyboard()
    .text("🤝 Прийняти", makeDuelAcceptCallbackData(token))
    .row()
    .text("🙅 Не зараз", makeDuelDeclineCallbackData(token))
    .row()
    .text("🔎 Оновити", makeDuelViewCallbackData(token));
}

export function buildDuelInviteShareKeyboard(token: string, templateIndex: number): InlineKeyboard {
  return new InlineKeyboard().text(
    "🎲 Інший текст",
    makeDuelInviteRotateCallbackData(token, templateIndex)
  );
}

export function buildDuelResultKeyboard(token?: string, mode?: "quick" | "turn-based"): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (token) {
    keyboard
      .text("🔁 Реванш", makeDuelRematchCallbackData(token))
      .text("📣 Картка", makeDuelShareCallbackData(token))
      .row();

    if (mode === "turn-based") {
      keyboard
        .text("📜 Журнал бою", makeDuelJournalCallbackData(token))
        .row();
    }
  }

  return keyboard
    .text("🥊 Покликати ще когось", makeDuelNewCallbackData())
    .row()
    .text("↩️ Повернутися до кутка", makePlaceCallbackData("fighting-corner"));
}

export function buildDuelJournalKeyboard(token: string, requestedPage: number, totalPages: number): InlineKeyboard {
  const page = Math.min(Math.max(0, Math.floor(requestedPage)), Math.max(0, totalPages - 1));
  const keyboard = new InlineKeyboard();

  if (totalPages > 1) {
    if (page > 0) {
      keyboard
        .text("⏮️ Початок", makeDuelJournalCallbackData(token, 0))
        .text("◀️ Назад", makeDuelJournalCallbackData(token, page - 1))
        .row();
    }

    keyboard.text(`${page + 1}/${totalPages}`, makeDuelJournalCallbackData(token, page)).row();

    if (page < totalPages - 1) {
      keyboard
        .text("Далі ▶️", makeDuelJournalCallbackData(token, page + 1))
        .text("Кінець ⏭️", makeDuelJournalCallbackData(token, totalPages - 1))
        .row();
    }
  }

  return keyboard.text("↩️ До дуелі", makeDuelViewCallbackData(token));
}

export function buildDuelCreateResourceWarningKeyboard(mode: "quick" | "turn-based" = "quick"): InlineKeyboard {
  return new InlineKeyboard()
    .text(
      "🥊 Так, кинути виклик",
      mode === "turn-based" ? makeDuelNewTurnBasedRiskCallbackData() : makeDuelNewRiskCallbackData()
    )
    .row()
    .text("📋 До справ", makeQuestCallbackData("list"))
    .row()
    .text("🍺 До зали", makePlaceCallbackData("hall"));
}

export function buildTurnBasedDuelKeyboard(
  result: Extract<DuelChallengeView, { state: "active" }>,
  viewerCharacterId: string | null,
  skillLabel: string,
  raceAbilityLabel?: string | null
): InlineKeyboard {
  const token = result.challenge.inviteToken;
  const session = result.session;
  const viewerSide =
    viewerCharacterId === session.state.participants.challenger.characterId
      ? "challenger"
      : viewerCharacterId === session.state.participants.target.characterId
        ? "target"
        : null;
  const canAct =
    viewerSide !== null &&
    session.status === "active" &&
    !session.state.pendingActions?.[viewerSide];
  const viewer = viewerSide ? session.state.participants[viewerSide] : null;
  const skillAvailability = viewer
    ? getActorCombatActionAvailability(
        {
          mana: viewer.mana,
          cooldowns: viewer.cooldowns
        },
        viewer.combatStats
      ).skill
    : null;
  const raceAvailability = viewer
    ? getActorCombatActionAvailability(
        {
          mana: viewer.mana,
          cooldowns: viewer.cooldowns
        },
        viewer.combatStats
      ).race
    : null;
  const resolvedRaceAbilityLabel = raceAbilityLabel === undefined && viewer
    ? getTurnBasedRaceAbilityButtonLabel(viewer.raceId)
    : raceAbilityLabel;
  const keyboard = new InlineKeyboard();

  if (canAct && viewer) {
    keyboard
      .text("⚔️ Атакувати", makeDuelTurnCallbackData(token, "attack", session.turn, session.version))
      .text("🛡 Захищатися", makeDuelTurnCallbackData(token, "defend", session.turn, session.version))
      .row();

    const skillAvailable = skillAvailability?.available !== false;
    const raceAvailable = Boolean(resolvedRaceAbilityLabel && raceAvailability?.available);

    if (skillAvailable) {
      keyboard.text(skillLabel, makeDuelTurnCallbackData(token, "skill", session.turn, session.version));
    }

    if (resolvedRaceAbilityLabel && raceAvailable) {
      keyboard.text(resolvedRaceAbilityLabel, makeDuelTurnCallbackData(token, "race", session.turn, session.version));
    }

    if (skillAvailable || raceAvailable) {
      keyboard.row();
    }

    const gearGrants = getCombatMantokAbilityGrantsByIds({
      grantIds: viewer.equipmentAbilityGrantIds ?? [],
      characterLevel: viewer.level
    }).filter((grant) =>
      grant.combat &&
      getCombatGearActionAvailabilityForActor(
        {
          mana: viewer.mana,
          cooldowns: viewer.cooldowns
        },
        grant.combat.profile
      ).available
    );
    appendGearActionButtons(
      keyboard,
      gearGrants,
      (grant) => makeDuelGearActionCallbackData({
        token,
        turn: session.turn,
        version: session.version,
        grantKey: grant.key
      })
    );

    keyboard.text("🏳️ Здатися", makeDuelTurnCallbackData(token, "surrender", session.turn, session.version));
  }

  if (session.state.lastRound) {
    keyboard
      .row()
      .text("📜 Журнал бою", makeDuelJournalCallbackData(token));
  }

  return keyboard.text("🔎 Оновити", makeDuelViewCallbackData(token));
}

function getTurnBasedRaceAbilityButtonLabel(raceId: string): string | null {
  const ability = getCombatRaceAbilityProfile(raceId);

  if (!ability) {
    return null;
  }

  const display = getCombatSkillDisplay(ability.id);

  return `${display.icon} ${display.name}`;
}

export function buildDuelNavigationKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("📋 До справ", makeQuestCallbackData("list"))
    .row()
    .text("🍺 До зали", makePlaceCallbackData("hall"));
}

export function buildDuelAcceptConfirmationKeyboard(token: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("🤝 Так, прийняти", makeDuelAcceptRiskCallbackData(token))
    .row()
    .text("🙅 Ні, не зараз", makeDuelDeclineCallbackData(token))
    .row()
    .text("🔎 Оновити", makeDuelViewCallbackData(token));
}

export function buildDuelResourceWarningKeyboard(token: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("🤝 Прийняти все одно", makeDuelAcceptRiskCallbackData(token))
    .row()
    .text("🙅 Не зараз", makeDuelDeclineCallbackData(token))
    .row()
    .text("🔎 Оновити", makeDuelViewCallbackData(token));
}

export function buildDuelRematchResourceWarningKeyboard(token: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("🔁 Реванш усе одно", makeDuelRematchRiskCallbackData(token))
    .row()
    .text("📣 Картка", makeDuelShareCallbackData(token))
    .row()
    .text("📋 До справ", makeQuestCallbackData("list"));
}
