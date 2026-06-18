import { InlineKeyboard } from "grammy";
import type { CharacterSummary } from "../../domain/characters/characterSummary";
import type { SoloCombatSessionRecord } from "../../db/repositories/soloCombatSessionRepository";
import type { TrainingDoppelgangerStartChoice } from "../../services/trainingDoppelgangerService";
import { getPersistentFightSkillLabel } from "../../services/fightService";
import {
  makeTrainingDoppelgangerModeCallbackData,
  makeTrainingDoppelgangerTurnCallbackData
} from "../callbacks/trainingDoppelgangerCallbackData";
import { makeQuestCallbackData } from "../callbacks/questCallbackData";
import { makePlaceCallbackData } from "../callbacks/placeCallbackData";

export function buildTrainingDoppelgangerStartKeyboard(
  choices: readonly TrainingDoppelgangerStartChoice[]
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  for (const choice of choices) {
    keyboard.text(choice.buttonLabel, makeTrainingDoppelgangerModeCallbackData(choice.mode)).row();
  }

  return keyboard
    .text("📋 До справ", makeQuestCallbackData("list"))
    .row()
    .text("🍺 До зали", makePlaceCallbackData("hall"));
}

export function buildTrainingDoppelgangerKeyboard(
  session?: SoloCombatSessionRecord,
  character?: CharacterSummary
): InlineKeyboard {
  if (session?.state?.status === "active" && character) {
    const turn = session.state.turn;

    return new InlineKeyboard()
      .text("🗡️ Вдарити", makeTrainingDoppelgangerTurnCallbackData({ sessionId: session.id, turn, action: "attack" }))
      .row()
      .text(
        getPersistentFightSkillLabel(character),
        makeTrainingDoppelgangerTurnCallbackData({ sessionId: session.id, turn, action: "skill" })
      )
      .row()
      .text("🏃 Відступити", makeTrainingDoppelgangerTurnCallbackData({ sessionId: session.id, turn, action: "flee" }))
      .row()
      .text("📋 До справ", makeQuestCallbackData("list"))
      .row()
      .text("🍺 До зали", makePlaceCallbackData("hall"));
  }

  return new InlineKeyboard()
    .text("📋 До справ", makeQuestCallbackData("list"))
    .row()
    .text("🍺 До зали", makePlaceCallbackData("hall"));
}
