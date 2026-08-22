import { InlineKeyboard } from "grammy";
import type { CharacterSummary } from "../../domain/characters/characterSummary";
import type { SoloCombatSessionRecord } from "../../db/repositories/soloCombatSessionRepository";
import {
  getCombatActionAvailability,
  getCombatGearActionAvailability,
  getTerminalCombatTurnLogEventId
} from "../../domain/combat";
import { getCombatMantokAbilityGrantsByIds } from "../../content";
import {
  getPersistentFightRaceAbilityLabel,
  getPersistentFightSkillLabel
} from "../../services/fightService";
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
  PRESENCE_LOCATION_KORCHMA_RANGER_CORNER,
  PRESENCE_LOCATION_KORCHMA_YARD,
  PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT,
  PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_RIGHT,
  PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_STRAIGHT
} from "../../services/presenceService";
import {
  makeFightCallbackData,
  makeFightGearActionCallbackData,
  makeFightItemsCallbackData,
  makeFightJournalCallbackData,
  makeFightStatisticsCallbackData,
  makeFightItemUseCallbackData,
  makeFightPassageAttackCallbackData,
  makeFightTierTwoCallbackData,
  makeFightTurnCallbackData,
  makeFightViewCallbackData
} from "../callbacks/fightCallbackData";
import { makeLeftPassagePartyInviteCallbackData } from "../callbacks/groupCombatCallbackData";
import { makePartySessionViewCallbackData } from "../callbacks/partySessionCallbackData";
import {
  makeDescentSearchStartCallbackData,
  makeDeepLevelOneSearchStartCallbackData,
  makePassageSearchAskCancelCallbackData,
  makePassageSearchCancelCallbackData,
  makePassageSearchCheckCallbackData,
  makePassageSearchKeepCallbackData,
  makePassageSearchStartCallbackData,
  makeSafePassageSearchStartCallbackData
} from "../callbacks/passageSearchCallbackData";
import { makePlaceCallbackData, type PlaceCallback } from "../callbacks/placeCallbackData";
import {
  buildCombatActionKeyboard,
  combatActionButtonLabels,
  type CombatActionKeyboardButton
} from "./combatActionKeyboardLayout";

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
  character: CharacterSummary,
  options: { includeCombatItems?: boolean } = {}
): InlineKeyboard {
  const turn = session.state?.turn ?? 1;
  const availability = session.state
    ? getCombatActionAvailability(session.state, { classId: character.classId, raceId: character.raceId })
    : null;
  const abilityButtons: CombatActionKeyboardButton[] = [];

  if (availability?.skill.available !== false) {
    abilityButtons.push({
      label: getPersistentFightSkillLabel(character),
      callbackData: makeFightTurnCallbackData({ sessionId: session.id, turn, action: "skill" })
    });
  }

  if (availability?.race.available) {
    const raceLabel = getPersistentFightRaceAbilityLabel(character);
    if (raceLabel) {
      abilityButtons.push({
        label: raceLabel,
        callbackData: makeFightTurnCallbackData({ sessionId: session.id, turn, action: "race" })
      });
    }
  }

  const gearGrants = session.state
    ? getCombatMantokAbilityGrantsByIds({
        grantIds: session.state.equipmentAbilities?.grantIds ?? [],
        characterLevel: character.level
      }).filter((grant) =>
        grant.combat && getCombatGearActionAvailability(session.state!, grant.combat.profile).available
      )
    : [];

  abilityButtons.push(...gearGrants.map((grant) => ({
    label: grant.buttonLabel ?? grant.label,
    callbackData: makeFightGearActionCallbackData({ sessionId: session.id, turn, grantKey: grant.key })
  })));

  return buildCombatActionKeyboard({
    attackButtons: [{
      label: combatActionButtonLabels.attack,
      callbackData: makeFightTurnCallbackData({ sessionId: session.id, turn, action: "attack" })
    }],
    defendButton: {
      label: combatActionButtonLabels.defend,
      callbackData: makeFightTurnCallbackData({ sessionId: session.id, turn, action: "defend" })
    },
    abilityButtons,
    ...(options.includeCombatItems ? {
      itemsButton: {
        label: combatActionButtonLabels.items,
        callbackData: makeFightItemsCallbackData({ sessionId: session.id, turn })
      }
    } : {}),
    fleeButton: {
      label: combatActionButtonLabels.flee,
      callbackData: makeFightTurnCallbackData({ sessionId: session.id, turn, action: "flee" })
    }
  });
}

export function buildPersistentFightResultKeyboard(
  session: SoloCombatSessionRecord,
  character: CharacterSummary,
  options: { includeCombatItems?: boolean } = {}
): InlineKeyboard {
  if (session.state?.status !== "active") {
    const navigation = getPersistentFightReturnNavigation(session);
    const keyboard = new InlineKeyboard();

    addPersistentFightJournalButton(keyboard, session);

    if (navigation.allowNewFight) {
      keyboard.text("⚔️ Новий бій", makePlaceCallbackData(navigation.newFightPlace)).row();
    }

    return keyboard.text(navigation.returnLabel, makePlaceCallbackData(navigation.returnPlace));
  }

  return buildPersistentFightKeyboard(session, character, options);
}

export function buildPersistentFightItemsKeyboard(input: {
  sessionId: string;
  turn: number;
  items: readonly {
    itemKey: string;
    name: string;
    quantity: number;
  }[];
}): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  for (const item of input.items) {
    keyboard
      .text(
        `${item.name}${item.quantity > 1 ? ` (${item.quantity})` : ""}`,
        makeFightItemUseCallbackData({
          sessionId: input.sessionId,
          turn: input.turn,
          itemKey: item.itemKey
        })
      )
      .row();
  }

  return keyboard.text("↩️ До бою", makeFightViewCallbackData(input.sessionId));
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

  return keyboard.text(getPersistentFightJournalReturnLabel(session), makeFightViewCallbackData(session.id));
}

export function buildPersistentFightStatisticsKeyboard(
  session: SoloCombatSessionRecord
): InlineKeyboard {
  return new InlineKeyboard().text(
    "↩️ До результатів",
    makeFightViewCallbackData(session.id)
  );
}

function addPersistentFightJournalButton(
  keyboard: InlineKeyboard,
  session: SoloCombatSessionRecord
): InlineKeyboard {
  const logLength = getPersistentFightJournalPageCount(session);

  keyboard.row();
  if (logLength > 0) {
    keyboard.text(
      "📜 Журнал бою",
      makeFightJournalCallbackData({ sessionId: session.id, page: logLength - 1 })
    );
  }

  return keyboard.text("📊 Статистика", makeFightStatisticsCallbackData(session.id));
}

function getPersistentFightJournalPageCount(session: SoloCombatSessionRecord): number {
  const logLength = session.state?.turnLog?.length ?? 0;

  return logLength + getMissingTerminalTurnLogCount(session);
}

function clampJournalPage(requestedPage: number, totalPages: number): number {
  return Math.max(0, Math.min(Math.floor(requestedPage), totalPages - 1));
}

function getMissingTerminalTurnLogCount(session: SoloCombatSessionRecord): number {
  const state = session.state;

  if (!state?.lastTurn || state.status === "active") {
    return 0;
  }

  const terminalEventId = getTerminalCombatTurnLogEventId(state.status);
  if (state.turnLog?.some((entry) => entry.eventId === terminalEventId)) {
    return 0;
  }

  const expectedFinalTurn = Math.max(1, state.turn - 1);
  const lastLoggedEntry = state.turnLog?.[state.turnLog.length - 1];
  const lastLoggedTurn = lastLoggedEntry?.turn;

  return lastLoggedTurn === expectedFinalTurn && JSON.stringify(lastLoggedEntry?.summary) === JSON.stringify(state.lastTurn) ? 0 : 1;
}

function getPersistentFightJournalReturnLabel(session: SoloCombatSessionRecord): string {
  return session.state?.status === "active" ? "↩️ До бою" : "↩️ До результатів";
}

export function resolvePersistentFightPresenceLocation(session: SoloCombatSessionRecord): string {
  return getPersistentFightOriginLocationId(session);
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
  newFightPlace: PlaceCallback;
  returnLabel: string;
  returnPlace: PlaceCallback;
} {
  const origin = getPersistentFightOriginLocationId(session);
  const passagePlace = getPersistentFightPassagePlace(session);

  switch (origin) {
    case PRESENCE_LOCATION_KORCHMA_HALL:
      return { allowNewFight: false, newFightPlace: "deep-straight", returnLabel: "↩️ Повернутися до зали", returnPlace: "hall" };
    case PRESENCE_LOCATION_KORCHMA_YARD:
      return { allowNewFight: false, newFightPlace: "deep-straight", returnLabel: "↩️ Повернутися до задвірка", returnPlace: "yard" };
    case PRESENCE_LOCATION_KORCHMA_QUEST_TABLE:
      return { allowNewFight: false, newFightPlace: "deep-straight", returnLabel: "↩️ Повернутися до столу", returnPlace: "quest-table" };
    case PRESENCE_LOCATION_KORCHMA_BAR:
      return { allowNewFight: false, newFightPlace: "deep-straight", returnLabel: "↩️ Повернутися до шинку", returnPlace: "bar" };
    case PRESENCE_LOCATION_KORCHMA_BARREL:
      return { allowNewFight: false, newFightPlace: "deep-straight", returnLabel: "↩️ Повернутися до Бочки", returnPlace: "barrel" };
    case PRESENCE_LOCATION_KORCHMA_CELLAR:
      return { allowNewFight: false, newFightPlace: "deep-straight", returnLabel: "↩️ Повернутися до льоху", returnPlace: "cellar" };
    case PRESENCE_LOCATION_KORCHMA_NEWS_CORNER:
      return { allowNewFight: false, newFightPlace: "deep-straight", returnLabel: "↩️ Повернутися до вістей", returnPlace: "news-corner" };
    case PRESENCE_LOCATION_KORCHMA_RANGER_CORNER:
      return { allowNewFight: false, newFightPlace: "deep-straight", returnLabel: "↩️ Повернутися до Єгеря", returnPlace: "ranger-corner" };
    case PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER:
      return { allowNewFight: false, newFightPlace: "deep-straight", returnLabel: "↩️ Повернутися до кутка", returnPlace: "fighting-corner" };
    case PRESENCE_LOCATION_KORCHMA_FRONT:
      return { allowNewFight: false, newFightPlace: "deep-straight", returnLabel: "↩️ Повернутися надвір", returnPlace: "front" };
    case PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT:
      return { allowNewFight: true, newFightPlace: "deep-left", returnLabel: "↩️ Повернутися до Сутеренів", returnPlace: "deep-level1" };
    case PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_STRAIGHT:
      return { allowNewFight: true, newFightPlace: "deep-straight", returnLabel: "↩️ Повернутися до Сутеренів", returnPlace: "deep-level1" };
    case PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_RIGHT:
      return { allowNewFight: true, newFightPlace: "deep-right", returnLabel: "↩️ Повернутися до Сутеренів", returnPlace: "deep-level1" };
    case PRESENCE_LOCATION_KORCHMA_DEEP:
    case PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1:
    default:
      return { allowNewFight: true, newFightPlace: passagePlace, returnLabel: "↩️ Повернутися до Низу", returnPlace: "deep" };
  }
}

function getPersistentFightPassagePlace(session: SoloCombatSessionRecord): PlaceCallback {
  const origin = getPersistentFightOriginLocationId(session);

  if (origin === PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT) {
    return "deep-left";
  }

  if (origin === PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_RIGHT) {
    return "deep-right";
  }

  if (origin === PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_STRAIGHT) {
    return "deep-straight";
  }

  const difficulty = session.state?.analytics?.mob.difficultyTier;

  if (difficulty === "hard") {
    return "deep-left";
  }

  if (difficulty === "easy") {
    return "deep-right";
  }

  return "deep-straight";
}

export function buildPersistentFightReadyKeyboard(
  options: { descentSearchAvailable?: boolean } = {}
): InlineKeyboard {
  const keyboard = new InlineKeyboard()
    .text("🪜 Спуск до Низу", makePlaceCallbackData("deep"))
    .row();

  if (options.descentSearchAvailable !== false) {
    keyboard.text("🔎 Пошукати", makeDescentSearchStartCallbackData()).row();
  }

  return keyboard.text("📋 До справ", makePlaceCallbackData("quest-table"));
}

export function buildPersistentFightDifficultyKeyboard(
  options: { searchAvailable?: boolean } = {}
): InlineKeyboard {
  const keyboard = new InlineKeyboard()
    .text("⬆️ Піднятися назад", makePlaceCallbackData("deep"))
    .row()
    .text("⬅️ Лівий прохід", makePlaceCallbackData("deep-left"))
    .row()
    .text("🚪 Прямий прохід", makePlaceCallbackData("deep-straight"))
    .row()
    .text("➡️ Правий прохід", makePlaceCallbackData("deep-right"))
    .row();

  if (options.searchAvailable !== false) {
    keyboard.text("🔎 Пошукати", makeDeepLevelOneSearchStartCallbackData());
  }

  return keyboard;
}

export function buildPersistentFightPassagePreviewKeyboard(input: {
  passage: Extract<PlaceCallback, "deep-left" | "deep-straight" | "deep-right">;
  encounterToken: string;
  searchAvailable?: boolean;
  leftPassagePartyAttackEnabled?: boolean;
  reservedPartyInviteToken?: string;
}): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  if (input.reservedPartyInviteToken) {
    keyboard.text(
      "🤝 Відкрити збір ватаги",
      makePartySessionViewCallbackData(input.reservedPartyInviteToken)
    ).row();
  } else {
    keyboard.text("⚔️ Атакувати самостійно", makeFightPassageAttackCallbackData(input)).row();
  }

  if (
    !input.reservedPartyInviteToken &&
    input.passage === "deep-left" &&
    input.leftPassagePartyAttackEnabled
  ) {
    keyboard.text(
      "🤝 Зібрати ватагу",
      makeLeftPassagePartyInviteCallbackData(input.encounterToken)
    ).row();
  }

  if (!input.reservedPartyInviteToken && input.searchAvailable !== false) {
    keyboard.text("🔎 Пошукати", makePassageSearchStartCallbackData(input)).row();
  }

  return keyboard.text("↩️ Повернутися до Сутеренів", makePlaceCallbackData("deep-level1"));
}

export function buildPersistentFightPassageRestKeyboard(input: {
  passage: Extract<PlaceCallback, "deep-left" | "deep-straight" | "deep-right">;
  searchAvailable?: boolean;
  showTierTwo?: boolean;
}): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (input.showTierTwo) {
    return keyboard
      .text("↩️ Повернутися до Сутеренів", makePlaceCallbackData("deep-level1"))
      .row()
      .text("🪜 Ярус II", makeFightTierTwoCallbackData());
  }

  if (input.searchAvailable !== false) {
    keyboard.text("🔎 Пошукати", makeSafePassageSearchStartCallbackData(input)).row();
  }

  return keyboard.text("↩️ Повернутися до Сутеренів", makePlaceCallbackData("deep-level1"));
}

export function buildPassageSearchRunningKeyboard(token: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("🔎 Перевірити", makePassageSearchCheckCallbackData(token))
    .row()
    .text("✋ Збити пошук", makePassageSearchAskCancelCallbackData(token));
}

export function buildPassageSearchCancelKeyboard(token: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Збити", makePassageSearchCancelCallbackData(token))
    .row()
    .text("↩️ Шукати далі", makePassageSearchKeepCallbackData(token));
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
