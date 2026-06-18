import { InlineKeyboard } from "grammy";
import type { CharacterSummary } from "../../domain/characters/characterSummary";
import type { SoloCombatSessionRecord } from "../../db/repositories/soloCombatSessionRepository";
import { getPersistentFightSkillLabel } from "../../services/fightService";
import { makeFightCallbackData, makeFightTurnCallbackData } from "../callbacks/fightCallbackData";
import { makePlaceCallbackData } from "../callbacks/placeCallbackData";
import { makeQuestCallbackData } from "../callbacks/questCallbackData";

export type FightResultKeyboardState = "completed" | "already-completed";

export function buildFightKeyboard(character?: CharacterSummary): InlineKeyboard {
  const labels = getFightActionLabels(character);

  return new InlineKeyboard()
    .text(labels.attack, makeFightCallbackData("attack"))
    .row()
    .text(labels.receipt, makeFightCallbackData("receipt"))
    .row()
    .text(labels.flee, makeFightCallbackData("flee"))
    .row()
    .text("📋 До справ", makePlaceCallbackData("quest-table"));
}

export function buildFightResultKeyboard(
  state: FightResultKeyboardState,
  character?: CharacterSummary
): InlineKeyboard {
  if (state === "already-completed") {
    return new InlineKeyboard().text("📋 До справ", makePlaceCallbackData("quest-table"));
  }

  return buildFightKeyboard(character);
}

export function buildPersistentFightKeyboard(
  session: SoloCombatSessionRecord,
  character: CharacterSummary
): InlineKeyboard {
  const turn = session.state?.turn ?? 1;

  return new InlineKeyboard()
    .text("🗡️ Вдарити", makeFightTurnCallbackData({ sessionId: session.id, turn, action: "attack" }))
    .row()
    .text(
      getPersistentFightSkillLabel(character),
      makeFightTurnCallbackData({ sessionId: session.id, turn, action: "skill" })
    )
    .row()
    .text("🏃 Відступити", makeFightTurnCallbackData({ sessionId: session.id, turn, action: "flee" }))
    .row()
    .text("📋 До справ", makePlaceCallbackData("quest-table"));
}

export function buildPersistentFightResultKeyboard(
  session: SoloCombatSessionRecord,
  character: CharacterSummary
): InlineKeyboard {
  if (session.state?.status !== "active") {
    return new InlineKeyboard()
      .text("⚔️ Новий бій", makeQuestCallbackData("fight"))
      .row()
      .text("📋 До справ", makePlaceCallbackData("quest-table"))
      .row()
      .text("🍺 До зали", makePlaceCallbackData("hall"));
  }

  return buildPersistentFightKeyboard(session, character);
}

export function buildPersistentFightReadyKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("⚔️ Новий бій", makeQuestCallbackData("fight"))
    .row()
    .text("📋 До справ", makePlaceCallbackData("quest-table"));
}

export function buildPersistentFightDifficultyKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🕯 Легше: -3 рів.", makeQuestCallbackData("fight-easy"))
    .row()
    .text("🍺 Як є", makeQuestCallbackData("fight-normal"))
    .row()
    .text("🌶 Важче: +2 рів.", makeQuestCallbackData("fight-hard"))
    .row()
    .text("📋 До справ", makePlaceCallbackData("quest-table"));
}

function getFightActionLabels(character?: CharacterSummary): {
  attack: string;
  receipt: string;
  flee: string;
} {
  if (character?.classId === "class.rogue") {
    return {
      attack: "🗡️ Вдарити з тіні",
      receipt: "📋 Підсунути чек",
      flee: "🏃 Розчинитись у драмі"
    };
  }

  if (character?.classId === "class.bureaucramancer") {
    return {
      attack: "🗡️ Поставити силову печатку",
      receipt: "📋 Збити актом",
      flee: "🏃 Взяти відвід"
    };
  }

  if (character?.raceId === "race.intellectual-orc") {
    return {
      attack: "🗡️ Аргументувати плечем",
      receipt: "📋 Додати протокол",
      flee: "🏃 Відійти з гідністю"
    };
  }

  if (character?.classId === "class.bard") {
    return {
      attack: "🎵 Вдарити приспівом",
      receipt: "📋 Заспівати про чек",
      flee: "🏃 Піти на біс"
    };
  }

  return {
    attack: "🗡️ Вдарити",
    receipt: "📋 Збити з пантелику чеком",
    flee: "🏃 Відступити красиво"
  };
}
