import { InlineKeyboard } from "grammy";
import type { CharacterSummary } from "../../domain/characters/characterSummary";
import type { SoloCombatSessionRecord } from "../../db/repositories/soloCombatSessionRepository";
import { getCombatActionAvailability } from "../../domain/combat";
import { getPersistentFightSkillLabel } from "../../services/fightService";
import {
  normalizePresenceLocationId,
  PRESENCE_LOCATION_KORCHMA_BAR,
  PRESENCE_LOCATION_KORCHMA_BARREL,
  PRESENCE_LOCATION_KORCHMA_CELLAR,
  PRESENCE_LOCATION_KORCHMA_DEEP,
  PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1,
  PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER,
  PRESENCE_LOCATION_KORCHMA_FRONT,
  PRESENCE_LOCATION_KORCHMA_HALL,
  PRESENCE_LOCATION_KORCHMA_NEWS_CORNER,
  PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
  PRESENCE_LOCATION_KORCHMA_RANGER_CORNER
} from "../../services/presenceService";
import {
  makeFightCallbackData,
  makeFightJournalCallbackData,
  makeFightTurnCallbackData,
  makeFightViewCallbackData
} from "../callbacks/fightCallbackData";
import { makePlaceCallbackData, type PlaceCallback } from "../callbacks/placeCallbackData";
import { makeQuestCallbackData } from "../callbacks/questCallbackData";

export type FightResultKeyboardState = "completed" | "already-completed";

export function buildFightKeyboard(character?: CharacterSummary): InlineKeyboard {
  const labels = getFightActionLabels(character);

  return new InlineKeyboard()
    .text(labels.attack, makeFightCallbackData("attack"))
    .row()
    .text(labels.receipt, makeFightCallbackData("receipt"))
    .row()
    .text(labels.flee, makeFightCallbackData("flee"));
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
  const availability = session.state
    ? getCombatActionAvailability(session.state, { classId: character.classId }).skill
    : null;
  const keyboard = new InlineKeyboard()
    .text("🗡️ Вдарити", makeFightTurnCallbackData({ sessionId: session.id, turn, action: "attack" }))
    .row();

  keyboard
    .text("🛡 Захищатися", makeFightTurnCallbackData({ sessionId: session.id, turn, action: "defend" }))
    .row();

  if (availability?.available !== false) {
    keyboard.text(
      getPersistentFightSkillLabel(character),
      makeFightTurnCallbackData({ sessionId: session.id, turn, action: "skill" })
    ).row();
  }

  keyboard
    .text("🏃 Відступити", makeFightTurnCallbackData({ sessionId: session.id, turn, action: "flee" }));

  return addPersistentFightJournalButton(keyboard, session);
}

export function buildPersistentFightResultKeyboard(
  session: SoloCombatSessionRecord,
  character: CharacterSummary
): InlineKeyboard {
  if (session.state?.status !== "active") {
    const navigation = getPersistentFightReturnNavigation(session);
    const keyboard = new InlineKeyboard();

    addPersistentFightJournalButton(keyboard, session);

    if (navigation.allowNewFight) {
      keyboard.text("⚔️ Новий бій", makePlaceCallbackData("deep-level1")).row();
    }

    return keyboard.text(navigation.returnLabel, makePlaceCallbackData(navigation.returnPlace));
  }

  return buildPersistentFightKeyboard(session, character);
}

export function buildPersistentFightJournalKeyboard(
  session: SoloCombatSessionRecord,
  requestedPage: number
): InlineKeyboard {
  const totalPages = getPersistentFightJournalPageCount(session);
  const page = clampJournalPage(requestedPage, totalPages);
  const keyboard = new InlineKeyboard();

  if (totalPages > 1) {
    if (page > 0) {
      keyboard.text("⏮️ Початок", makeFightJournalCallbackData({ sessionId: session.id, page: 0 }));
      keyboard.text("◀️ Назад", makeFightJournalCallbackData({ sessionId: session.id, page: page - 1 }));
      keyboard.row();
    }

    keyboard.text(`${page + 1}/${totalPages}`, makeFightJournalCallbackData({ sessionId: session.id, page })).row();

    if (page < totalPages - 1) {
      keyboard.text("Далі ▶️", makeFightJournalCallbackData({ sessionId: session.id, page: page + 1 }));
      keyboard.text("Кінець ⏭️", makeFightJournalCallbackData({ sessionId: session.id, page: totalPages - 1 }));
      keyboard.row();
    }
  }

  return keyboard.text("↩️ До бою", makeFightViewCallbackData(session.id));
}

function addPersistentFightJournalButton(
  keyboard: InlineKeyboard,
  session: SoloCombatSessionRecord
): InlineKeyboard {
  const log = session.state?.turnLog ?? [];

  if (log.length === 0) {
    return keyboard;
  }

  return keyboard
    .row()
    .text("📜 Журнал бою", makeFightJournalCallbackData({ sessionId: session.id, page: log.length - 1 }));
}

function getPersistentFightJournalPageCount(session: SoloCombatSessionRecord): number {
  return Math.max(1, session.state?.turnLog?.length ?? 0);
}

function clampJournalPage(requestedPage: number, totalPages: number): number {
  return Math.max(0, Math.min(Math.floor(requestedPage), totalPages - 1));
}

export function getPersistentFightOriginLocationId(session: SoloCombatSessionRecord): string {
  const stored = session.state?.originLocationId;

  if (stored) {
    return normalizePresenceLocationId(stored);
  }

  if (session.state?.source === "adventure") {
    return PRESENCE_LOCATION_KORCHMA_QUEST_TABLE;
  }

  if (session.state?.source === "yeger") {
    return PRESENCE_LOCATION_KORCHMA_RANGER_CORNER;
  }

  return PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1;
}

function getPersistentFightReturnNavigation(session: SoloCombatSessionRecord): {
  allowNewFight: boolean;
  returnLabel: string;
  returnPlace: PlaceCallback;
} {
  const origin = getPersistentFightOriginLocationId(session);

  switch (origin) {
    case PRESENCE_LOCATION_KORCHMA_HALL:
      return { allowNewFight: false, returnLabel: "↩️ Повернутися до зали", returnPlace: "hall" };
    case PRESENCE_LOCATION_KORCHMA_QUEST_TABLE:
      return { allowNewFight: false, returnLabel: "↩️ Повернутися до столу", returnPlace: "quest-table" };
    case PRESENCE_LOCATION_KORCHMA_BAR:
      return { allowNewFight: false, returnLabel: "↩️ Повернутися до шинку", returnPlace: "bar" };
    case PRESENCE_LOCATION_KORCHMA_BARREL:
      return { allowNewFight: false, returnLabel: "↩️ Повернутися до Бочки", returnPlace: "barrel" };
    case PRESENCE_LOCATION_KORCHMA_CELLAR:
      return { allowNewFight: false, returnLabel: "↩️ Повернутися до льоху", returnPlace: "cellar" };
    case PRESENCE_LOCATION_KORCHMA_NEWS_CORNER:
      return { allowNewFight: false, returnLabel: "↩️ Повернутися до вістей", returnPlace: "news-corner" };
    case PRESENCE_LOCATION_KORCHMA_RANGER_CORNER:
      return { allowNewFight: false, returnLabel: "↩️ Повернутися до Єгеря", returnPlace: "ranger-corner" };
    case PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER:
      return { allowNewFight: false, returnLabel: "↩️ Повернутися до кутка", returnPlace: "fighting-corner" };
    case PRESENCE_LOCATION_KORCHMA_FRONT:
      return { allowNewFight: false, returnLabel: "↩️ Повернутися надвір", returnPlace: "front" };
    case PRESENCE_LOCATION_KORCHMA_DEEP:
    case PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1:
    default:
      return { allowNewFight: true, returnLabel: "↩️ Повернутися до Низу", returnPlace: "deep" };
  }
}

export function buildPersistentFightReadyKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🪜 Спуск до Низу", makePlaceCallbackData("deep"))
    .row()
    .text("📋 До справ", makePlaceCallbackData("quest-table"));
}

export function buildPersistentFightDifficultyKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("⬅️ Лівий прохід", makeQuestCallbackData("fight-hard"))
    .row()
    .text("🚪 Прямий прохід", makeQuestCallbackData("fight-normal"))
    .row()
    .text("➡️ Правий прохід", makeQuestCallbackData("fight-easy"))
    .row()
    .text("⬆️ Піднятися назад", makePlaceCallbackData("deep"));
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
