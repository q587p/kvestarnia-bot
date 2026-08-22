import { InlineKeyboard } from "grammy";
import type { CharacterSummary } from "../../domain/characters/characterSummary";
import type { SoloCombatSessionRecord } from "../../db/repositories/soloCombatSessionRepository";
import { getCombatActionAvailability } from "../../domain/combat";
import type { TrainingDoppelgangerStartChoice } from "../../services/trainingDoppelgangerService";
import {
  getPersistentFightRaceAbilityLabel,
  getPersistentFightSkillLabel
} from "../../services/fightService";
import {
  makeTrainingDoppelgangerJournalCallbackData,
  makeTrainingDoppelgangerModeCallbackData,
  makeTrainingDoppelgangerStatisticsCallbackData,
  makeTrainingDoppelgangerTurnCallbackData,
  makeTrainingDoppelgangerViewCallbackData
} from "../callbacks/trainingDoppelgangerCallbackData";
import { makePlaceCallbackData } from "../callbacks/placeCallbackData";
import {
  buildCombatActionKeyboard,
  combatActionButtonLabels,
  type CombatActionKeyboardButton
} from "./combatActionKeyboardLayout";

export function buildTrainingDoppelgangerStartKeyboard(
  choices: readonly TrainingDoppelgangerStartChoice[]
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  for (const choice of choices) {
    keyboard.text(choice.buttonLabel, makeTrainingDoppelgangerModeCallbackData(choice.mode)).row();
  }

  return keyboard.text("↩️ Повернутися до кутка", makePlaceCallbackData("fighting-corner"));
}

export function buildTrainingDoppelgangerKeyboard(
  session?: SoloCombatSessionRecord,
  character?: CharacterSummary
): InlineKeyboard {
  if (session?.state?.status === "active" && character) {
    const turn = session.state.turn;
    const availability = getCombatActionAvailability(session.state, {
      classId: character.classId,
      raceId: character.raceId
    });
    const abilityButtons: CombatActionKeyboardButton[] = [];

    if (availability.skill.available) {
      abilityButtons.push({
        label: getPersistentFightSkillLabel(character),
        callbackData: makeTrainingDoppelgangerTurnCallbackData({ sessionId: session.id, turn, action: "skill" })
      });
    }

    if (availability.race.available) {
      const raceLabel = getPersistentFightRaceAbilityLabel(character);
      if (raceLabel) {
        abilityButtons.push({
          label: raceLabel,
          callbackData: makeTrainingDoppelgangerTurnCallbackData({ sessionId: session.id, turn, action: "race" })
        });
      }
    }

    return buildCombatActionKeyboard({
      attackButtons: [{
        label: combatActionButtonLabels.attack,
        callbackData: makeTrainingDoppelgangerTurnCallbackData({ sessionId: session.id, turn, action: "attack" })
      }],
      defendButton: {
        label: combatActionButtonLabels.defend,
        callbackData: makeTrainingDoppelgangerTurnCallbackData({ sessionId: session.id, turn, action: "defend" })
      },
      abilityButtons,
      fleeButton: {
        label: combatActionButtonLabels.flee,
        callbackData: makeTrainingDoppelgangerTurnCallbackData({ sessionId: session.id, turn, action: "flee" })
      }
    });
  }

  const keyboard = new InlineKeyboard();
  const logLength = session?.state?.turnLog?.length ?? 0;

  if (session) {
    if (logLength > 0) {
      keyboard.text(
        "📜 Журнал бою",
        makeTrainingDoppelgangerJournalCallbackData({
          sessionId: session.id,
          page: logLength - 1
        })
      );
    }
    keyboard.text(
      "📊 Статистика",
      makeTrainingDoppelgangerStatisticsCallbackData(session.id)
    ).row();
  }

  return keyboard.text("↩️ Повернутися до кутка", makePlaceCallbackData("fighting-corner"));
}

export function buildTrainingDoppelgangerJournalKeyboard(
  session: SoloCombatSessionRecord,
  requestedPage: number
): InlineKeyboard {
  const totalPages = Math.max(1, session.state?.turnLog?.length ?? 0);
  const page = Math.max(0, Math.min(Math.floor(requestedPage), totalPages - 1));
  const keyboard = new InlineKeyboard();

  if (totalPages > 1) {
    if (page > 0) {
      keyboard.text(
        "⏮️ Початок",
        makeTrainingDoppelgangerJournalCallbackData({ sessionId: session.id, page: 0 })
      );
      keyboard.text(
        "◀️ Назад",
        makeTrainingDoppelgangerJournalCallbackData({ sessionId: session.id, page: page - 1 })
      );
      keyboard.row();
    }

    keyboard
      .text(
        `${page + 1}/${totalPages}`,
        makeTrainingDoppelgangerJournalCallbackData({ sessionId: session.id, page })
      )
      .row();

    if (page < totalPages - 1) {
      keyboard.text(
        "Далі ▶️",
        makeTrainingDoppelgangerJournalCallbackData({ sessionId: session.id, page: page + 1 })
      );
      keyboard.text(
        "Кінець ⏭️",
        makeTrainingDoppelgangerJournalCallbackData({ sessionId: session.id, page: totalPages - 1 })
      );
      keyboard.row();
    }
  }

  return keyboard.text(
    session.state?.status === "active" ? "↩️ До тренування" : "↩️ До результатів",
    makeTrainingDoppelgangerViewCallbackData(session.id)
  );
}

export function buildTrainingDoppelgangerStatisticsKeyboard(
  session: SoloCombatSessionRecord
): InlineKeyboard {
  return new InlineKeyboard().text(
    "↩️ До результатів",
    makeTrainingDoppelgangerViewCallbackData(session.id)
  );
}
