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
  makeTrainingDoppelgangerModeCallbackData,
  makeTrainingDoppelgangerTurnCallbackData
} from "../callbacks/trainingDoppelgangerCallbackData";
import { makePlaceCallbackData } from "../callbacks/placeCallbackData";

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
    const keyboard = new InlineKeyboard()
      .text("🗡️ Вдарити", makeTrainingDoppelgangerTurnCallbackData({ sessionId: session.id, turn, action: "attack" }))
      .text("🛡 Захищатися", makeTrainingDoppelgangerTurnCallbackData({ sessionId: session.id, turn, action: "defend" }))
      .row();

    if (availability.skill.available) {
      keyboard.text(
        getPersistentFightSkillLabel(character),
        makeTrainingDoppelgangerTurnCallbackData({ sessionId: session.id, turn, action: "skill" })
      );
    }

    if (availability.race.available) {
      const raceLabel = getPersistentFightRaceAbilityLabel(character);
      if (raceLabel) {
        keyboard.text(
          raceLabel,
          makeTrainingDoppelgangerTurnCallbackData({ sessionId: session.id, turn, action: "race" })
        );
      }
    }

    keyboard.row();

    return keyboard.text(
      "🏃 Відступити",
      makeTrainingDoppelgangerTurnCallbackData({ sessionId: session.id, turn, action: "flee" })
    );
  }

  return new InlineKeyboard().text(
    "↩️ Повернутися до кутка",
    makePlaceCallbackData("fighting-corner")
  );
}
