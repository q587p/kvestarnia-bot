import { describe, expect, it } from "vitest";
import {
  buildCosmeticTitlesKeyboard,
  buildHeroAchievementsKeyboard
} from "../../src/bot/keyboards/achievementKeyboard";
import {
  buildAdventureApproachHelpKeyboard,
  buildAdventureApproachKeyboard,
  buildMimicShawarmaMethodHelpKeyboard,
  buildAdventureParticipantsKeyboard,
  buildAdventureKeyboard,
  buildAdventureResultKeyboard
} from "../../src/bot/keyboards/adventureKeyboard";
import {
  buildCellarKeyboard,
  buildCellarGrownupKeyboard,
  buildCellarMethodHelpKeyboard,
  buildCellarParticipantsKeyboard,
  buildCellarResultKeyboard
} from "../../src/bot/keyboards/cellarKeyboard";
import type { SoloCombatSessionRecord } from "../../src/db/repositories/soloCombatSessionRepository";
import {
  buildFightKeyboard,
  buildFightResultKeyboard,
  buildPersistentFightDifficultyKeyboard,
  buildPersistentFightJournalKeyboard,
  buildPersistentFightKeyboard,
  buildPersistentFightPassagePreviewKeyboard,
  buildPersistentFightPassageRestKeyboard,
  buildPersistentFightResultKeyboard
} from "../../src/bot/keyboards/fightKeyboard";
import { buildDuelResultKeyboard, buildTurnBasedDuelKeyboard } from "../../src/bot/keyboards/duelKeyboard";
import { getCombatSkillDisplay, getPersistentFightSkillLabel } from "../../src/services/fightService";
import { buildAdventureMethodOptions } from "../../src/services/adventureService";
import { buildHuntBoardKeyboard } from "../../src/bot/keyboards/huntKeyboard";
import {
  buildEquipmentKeyboard,
  buildEquipItemResultKeyboard,
  buildInventoryKeyboard,
  buildItemCraftResultKeyboard,
  buildItemDetailKeyboard,
  buildItemUseResultKeyboard
} from "../../src/bot/keyboards/inventoryKeyboard";
import {
  buildMantokChestManualSelectionKeyboard,
  buildMantokChestOverviewKeyboard,
  buildMantokChestResultKeyboard
} from "../../src/bot/keyboards/mantokChestKeyboard";
import {
  buildDevResetKeyboard,
  buildMainMenuKeyboard,
  buildRestartKeyboard,
  getMainMenuLocationButtonPresenceId,
  getMainMenuLocationButtonText,
  mainMenuButtons,
  mainMenuLocationButtons
} from "../../src/bot/keyboards/mainMenuKeyboard";
import {
  buildLevelBarterOfferKeyboard,
  buildLevelBarterPreviewKeyboard,
  buildLevelBarterResultKeyboard
} from "../../src/bot/keyboards/levelBarterKeyboard";
import { buildQuestHubKeyboard } from "../../src/bot/keyboards/questHubKeyboard";
import {
  buildDailyKorchmaRoundOverviewKeyboard,
  buildDailyKorchmaRoundSceneKeyboard,
  buildDailyKorchmaRoundStepKeyboard
} from "../../src/bot/keyboards/dailyKorchmaRoundKeyboard";
import { dailyKorchmaRoundScenes } from "../../src/content/dailyKorchmaRoundContent";
import {
  buildBackToShynokKeyboard,
  buildShynokOverviewKeyboard,
  buildShynokRoundPreviewKeyboard,
  buildShynokRoundResultKeyboard
} from "../../src/bot/keyboards/shynokKeyboard";
import {
  buildEnterKorchmaKeyboard,
  buildDuelTournamentKeyboard,
  buildKorchmaArrivalBoardKeyboard,
  buildKorchmaBarKeyboard,
  buildKorchmaDeepKeyboard,
  buildKorchmaFightingCornerKeyboard,
  buildKorchmaFrontKeyboard,
  buildKorchmaHallKeyboard,
  buildKorchmaMemorialBoardKeyboard,
  buildKorchmaNewsCornerKeyboard,
  buildKorchmaYardKeyboard,
  buildKorchmaRoundOfferKeyboard,
  buildKorchmaRoundResultKeyboard,
  buildTavernParticipantsKeyboard,
  buildTavernKeyboard,
  buildTavernResultKeyboard
} from "../../src/bot/keyboards/tavernKeyboard";
import {
  buildTrainingDoppelgangerKeyboard,
  buildTrainingDoppelgangerStartKeyboard
} from "../../src/bot/keyboards/trainingDoppelgangerKeyboard";
import { TRAINING_DOPPELGANGER_MONSTER_ID } from "../../src/domain/trainingDoppelganger";
import { makeItemUpgradeListCallbackData } from "../../src/bot/callbacks/itemUpgradeCallbackData";

describe("main menu and scene keyboards", () => {
  it("builds the universal menu as a persistent reply keyboard", () => {
    const keyboard = buildMainMenuKeyboard();

    expect(replyKeyboardTexts(keyboard.keyboard)).toEqual([
      [mainMenuButtons.hero, mainMenuButtons.tavern],
      [mainMenuButtons.quest, mainMenuButtons.inventory],
      [mainMenuButtons.participants, mainMenuButtons.help]
    ]);
    expect(mainMenuButtons.equipment).toBe("🛡️ Спорядження");
    expect(mainMenuButtons.quest).toBe("🗺️ Квести");
    expect(replyKeyboardTexts(keyboard.keyboard).flat()).not.toContain(mainMenuButtons.equipment);
    expect(replyKeyboardTexts(keyboard.keyboard).flat()).not.toContain(mainMenuButtons.admin);
    expect(replyKeyboardTexts(keyboard.keyboard).flat()).not.toContain("👀 Озирнутися");
    expect(keyboard.resize_keyboard).toBe(true);
    expect(keyboard.is_persistent).toBe(true);
  });

  it("adds the admin button to the main keyboard only when requested", () => {
    const keyboard = buildMainMenuKeyboard({ includeAdmin: true });

    expect(replyKeyboardTexts(keyboard.keyboard)).toEqual([
      [mainMenuButtons.hero, mainMenuButtons.tavern],
      [mainMenuButtons.quest, mainMenuButtons.inventory],
      [mainMenuButtons.participants, mainMenuButtons.help, mainMenuButtons.admin]
    ]);
    expect(mainMenuButtons.admin).toBe("🧰 Адмінка");
  });

  it("builds hero inline actions with achievements and optional full restore", () => {
    expect(flatInlineButtonTexts(buildHeroAchievementsKeyboard())).toEqual([
      "🛡️ Спорядження",
      "🏅 Ачівки",
      "🏷️ Титули"
    ]);
    expect(flatInlineButtonCallbacks(buildHeroAchievementsKeyboard())).toEqual([
      "v1:equip:view",
      "v1:ach:list:all:0",
      "v1:ach:titles"
    ]);

    const keyboard = buildHeroAchievementsKeyboard({
      priestSelfHealCallbackData: "v1:nc:h:s:0:0:0",
      priestSelfBlessCallbackData: "v1:nc:b:s:0:0:0",
      restoreCallbackData: "v1:use:full:item.responsible-panic-bandage"
    });

    expect(inlineButtonRows(keyboard)).toEqual([
      ["🛡️ Спорядження"],
      ["🏅 Ачівки", "🏷️ Титули"],
      ["⚕️ Полікувати себе"],
      ["✨ Благословити себе"],
      ["🧻 До відновлення"]
    ]);
    expect(flatInlineButtonCallbacks(keyboard)).toEqual([
      "v1:equip:view",
      "v1:ach:list:all:0",
      "v1:ach:titles",
      "v1:nc:h:s:0:0:0",
      "v1:nc:b:s:0:0:0",
      "v1:use:full:item.responsible-panic-bandage"
    ]);
  });

  it("paginates cosmetic title selection buttons", () => {
    const keyboard = buildCosmeticTitlesKeyboard({
      entries: [
        {
          grantRowId: "title-row-11",
          titleGrantId: "cosmetic-title.11",
          title: "Одинадцятий",
          sourceAchievementTitle: "Ачівка 11",
          grantedAt: new Date("2026-06-28T09:00:00.000Z"),
          active: false,
          archived: false
        },
        {
          grantRowId: "title-row-12",
          titleGrantId: "cosmetic-title.12",
          title: "Дванадцятий",
          sourceAchievementTitle: "Ачівка 12",
          grantedAt: new Date("2026-06-28T09:00:00.000Z"),
          active: true,
          archived: false
        }
      ],
      activeTitleGrantId: "cosmetic-title.12",
      activeTitleMissing: false,
      remortCount: 0,
      page: 1,
      totalPages: 2,
      totalCount: 12
    });

    expect(inlineButtonRows(keyboard)).toEqual([
      ["🏷️ 11", "✅ 12"],
      ["◀️ Назад", "2/2"],
      ["🧹 Зняти титул"],
      ["🏅 Ачівки"],
      ["↩️ До персонажа"]
    ]);
    expect(flatInlineButtonCallbacks(keyboard)).toContain("v1:ach:titles");
    expect(flatInlineButtonCallbacks(keyboard)).toContain("v1:ach:tset:0:title-row-12:1");
    expect(flatInlineButtonCallbacks(keyboard)).toContain("v1:ach:tclr:0:1");
  });

  it("labels the persistent location button with the current place", () => {
    const keyboard = buildMainMenuKeyboard({
      locationId: "location.korchma.deep.level1.left"
    });

    expect(replyKeyboardTexts(keyboard.keyboard)[0]).toEqual([
      mainMenuButtons.hero,
      mainMenuLocationButtons.deepLeft
    ]);
  });

  it("round-trips the Korchma yard as a current location button", () => {
    const keyboard = buildMainMenuKeyboard({
      locationId: "location.korchma.yard"
    });

    expect(replyKeyboardTexts(keyboard.keyboard)[0]).toEqual([
      mainMenuButtons.hero,
      mainMenuLocationButtons.yard
    ]);
    expect(getMainMenuLocationButtonText("location.korchma.yard")).toBe(mainMenuLocationButtons.yard);
    expect(getMainMenuLocationButtonPresenceId(mainMenuLocationButtons.yard)).toBe("location.korchma.yard");
    expect(mainMenuLocationButtons.yard).not.toBe(mainMenuButtons.tavern);
  });

  it("appends quest markers to location reply buttons without marking the quest menu button", () => {
    const keyboard = buildMainMenuKeyboard({
      locationId: "location.korchma.hall",
      questMarkers: {
        characterLevel: 4,
        yeger: {
          state: "turn-in-ready",
          character,
          progress: { wins: 5, target: 5 }
        }
      }
    });

    expect(replyKeyboardTexts(keyboard.keyboard)).toEqual([
      [mainMenuButtons.hero, `${mainMenuLocationButtons.hall} ✅`],
      [mainMenuButtons.quest, mainMenuButtons.inventory],
      [mainMenuButtons.participants, mainMenuButtons.help]
    ]);
    expect(getMainMenuLocationButtonPresenceId(`${mainMenuLocationButtons.hall} ✅`)).toBe(
      "location.korchma.hall"
    );
  });

  it("builds korchma place navigation", () => {
    expect(flatInlineButtonTexts(buildKorchmaFrontKeyboard())).toEqual([
      "🚪 Зайти в корчму",
      "📜 Табличка прибулих",
      "🏅 Пропамʼятна дошка",
      "🎒 Манчкін-скупник"
    ]);
    expect(flatInlineButtonTexts(buildKorchmaFrontKeyboard({ characterLevel: 1 }))).toEqual([
      "🚪 Зайти в корчму",
      "📜 Табличка прибулих",
      "🏅 Пропамʼятна дошка"
    ]);
    expect(inlineButtonRows(buildKorchmaFrontKeyboard())).toEqual([
      ["🚪 Зайти в корчму"],
      ["📜 Табличка прибулих", "🏅 Пропамʼятна дошка"],
      ["🎒 Манчкін-скупник"]
    ]);
    expect(flatInlineButtonCallbacks(buildKorchmaFrontKeyboard())).toEqual([
      "v1:place:hall",
      "v1:place:arrivals",
      "v1:place:memorial",
      "v1:lvlx:open"
    ]);
    expect(flatInlineButtonTexts(buildKorchmaFrontKeyboard({ yegerAction: "hunt" }))).toEqual([
      "🚪 Зайти в корчму",
      "📜 Табличка прибулих",
      "🏅 Пропамʼятна дошка",
      "🎒 Манчкін-скупник",
      "🏹 До полювання"
    ]);
    expect(flatInlineButtonTexts(buildKorchmaFrontKeyboard({ characterLevel: 1, yegerAction: "hunt" }))).toEqual([
      "🚪 Зайти в корчму",
      "📜 Табличка прибулих",
      "🏅 Пропамʼятна дошка",
      "🏹 До полювання"
    ]);
    expect(inlineButtonRows(buildKorchmaFrontKeyboard({ dailyYard: true }))).toEqual([
      ["🚪 Зайти в корчму"],
      ["📜 Табличка прибулих", "🏅 Пропамʼятна дошка"],
      ["🪣 У задвірок"],
      ["🎒 Манчкін-скупник"]
    ]);
    expect(inlineButtonRows(buildKorchmaFrontKeyboard({ characterLevel: 3, dailyYard: true }))).toEqual([
      ["🚪 Зайти в корчму"],
      ["📜 Табличка прибулих", "🏅 Пропамʼятна дошка"],
      ["🪣 У задвірок"],
      ["🎒 Манчкін-скупник"]
    ]);
    expect(inlineButtonRows(buildKorchmaYardKeyboard())).toEqual([
      ["✨ Чароковальня"],
      ["⬅️ До дверей"]
    ]);
    expect(flatInlineButtonCallbacks(buildKorchmaYardKeyboard())).toEqual([
      "v1:up:l",
      "v1:place:front"
    ]);
    expect(inlineButtonRows(buildKorchmaYardKeyboard({
      questMarkers: {
        characterLevel: 5,
        itemUpgrades: {
          state: "unlock-required",
          character,
          fieldKitQuantity: 1,
          rewardXp: 13
        }
      }
    }))).toContainEqual(["✨ Чароковальня ⚠️"]);
    expect(flatInlineButtonTexts(buildKorchmaFrontKeyboard({ munchkinLocation: "nyz-descent" }))).toEqual([
      "🚪 Зайти в корчму",
      "📜 Табличка прибулих",
      "🏅 Пропамʼятна дошка"
    ]);
    expect(
      flatInlineButtonTexts(
        buildKorchmaFrontKeyboard({ yegerAction: "hunt", munchkinLocation: "nyz-descent" })
      )
    ).toEqual([
      "🚪 Зайти в корчму",
      "📜 Табличка прибулих",
      "🏅 Пропамʼятна дошка",
      "🏹 До полювання"
    ]);
    expect(inlineButtonRows(buildKorchmaFrontKeyboard({
      characterLevel: 2,
      questMarkers: {
        characterLevel: 2,
        cellar: {
          state: "ready",
          character
        }
      }
    }))).toContainEqual(["🚪 Зайти в корчму ⚠️"]);
    expect(inlineButtonRows(buildEnterKorchmaKeyboard())).toEqual([["🚪 Зайти в корчму"]]);
    expect(inlineButtonRows(buildEnterKorchmaKeyboard({ questMarkers: null }))).toEqual([["🚪 Зайти в корчму"]]);
    expect(inlineButtonRows(buildEnterKorchmaKeyboard({
      questMarkers: {
        characterLevel: 4,
        yeger: {
          state: "turn-in-ready",
          character,
          progress: { wins: 5, target: 5 }
        }
      }
    }))).toEqual([["🚪 Зайти в корчму ✅"]]);
    expect(inlineButtonRows(buildEnterKorchmaKeyboard({
      questMarkers: {
        characterLevel: 2,
        cellar: {
          state: "on-cooldown",
          character,
          availableAt: new Date("2026-07-07T14:05:00.000Z"),
          now: new Date("2026-07-07T14:00:00.000Z")
        }
      }
    }))).toEqual([["🚪 Зайти в корчму"]]);
    expect(flatInlineButtonCallbacks(buildEnterKorchmaKeyboard())).toEqual(["v1:place:hall"]);
    expect(flatInlineButtonTexts(buildKorchmaArrivalBoardKeyboard())).toEqual([
      "🚪 Зайти в корчму",
      "⬅️ До дверей"
    ]);
    expect(flatInlineButtonTexts(buildKorchmaMemorialBoardKeyboard())).toEqual([
      "🚪 Зайти в корчму",
      "⬅️ До дверей"
    ]);
    expect(flatInlineButtonTexts(buildKorchmaHallKeyboard())).toEqual([
      "🥊 Бійцівський куток",
      "📋 Стіл зі справами",
      "🛢️ Бочка",
      "🍻 Шинок",
      "📰 Дошка корчми",
      "🐭 Льох",
      "🚪 Надвір",
      "🪜 Спуск до Низу"
    ]);
    expect(flatInlineButtonCallbacks(buildKorchmaHallKeyboard())).toEqual([
      "v1:place:fighting-corner",
      "v1:place:quest-table",
      "v1:place:barrel",
      "v1:place:bar",
      "v1:place:news-corner",
      "v1:place:cellar",
      "v1:place:front",
      "v1:place:deep"
    ]);
    expect(flatInlineButtonTexts(buildKorchmaHallKeyboard({ characterLevel: 13 }))).toEqual([
      "🕯️ Реморт",
      "🥊 Бійцівський куток",
      "📋 Стіл зі справами",
      "🛢️ Бочка",
      "🍻 Шинок",
      "📰 Дошка корчми",
      "🐭 Льох",
      "🚪 Надвір",
      "🪜 Спуск до Низу"
    ]);
    expect(flatInlineButtonCallbacks(buildKorchmaHallKeyboard({ characterLevel: 13 }))).toEqual([
      "v1:rm:open",
      "v1:place:fighting-corner",
      "v1:place:quest-table",
      "v1:place:barrel",
      "v1:place:bar",
      "v1:place:news-corner",
      "v1:place:cellar",
      "v1:place:front",
      "v1:place:deep"
    ]);
    expect(flatInlineButtonTexts(buildKorchmaHallKeyboard({ characterLevel: 1 }))).not.toContain(
      "🪜 Спуск до Низу"
    );
    expect(flatInlineButtonTexts(buildKorchmaHallKeyboard({ characterLevel: 1 }))).not.toContain(
      "🥊 Бійцівський куток"
    );
    expect(flatInlineButtonCallbacks(buildKorchmaHallKeyboard({ characterLevel: 1 }))).not.toContain(
      "v1:place:deep"
    );
    expect(flatInlineButtonCallbacks(buildKorchmaHallKeyboard({ characterLevel: 1 }))).not.toContain(
      "v1:place:fighting-corner"
    );
    expect(inlineButtonRows(buildKorchmaHallKeyboard())).toEqual([
      ["🥊 Бійцівський куток", "📋 Стіл зі справами"],
      ["🛢️ Бочка", "🍻 Шинок"],
      ["📰 Дошка корчми", "🐭 Льох"],
      ["🚪 Надвір", "🪜 Спуск до Низу"]
    ]);
    expect(
      flatInlineButtonTexts(
        buildKorchmaHallKeyboard({
          questMarkers: {
            characterLevel: 2,
            cellar: { state: "ready", character }
          }
        })
      )
    ).toContain("🐭 Льох ⚠️");
    expect(
      flatInlineButtonTexts(
        buildKorchmaHallKeyboard({
          questMarkers: {
            characterLevel: 2,
            cellar: { state: "ready", character }
          }
        })
      )
    ).toContain("📋 Стіл зі справами");
    expect(
      flatInlineButtonTexts(
        buildKorchmaHallKeyboard({
          questMarkers: {
            characterLevel: 2,
            cellar: { state: "ready", character }
          }
        })
      )
    ).not.toContain("📋 Стіл зі справами ⚠️");
    expect(
      flatInlineButtonTexts(
        buildKorchmaHallKeyboard({
          questMarkers: {
            characterLevel: 3,
            cellar: { state: "ready", character },
            dailyKorchmaRound: { state: "not-issued", character, dayToken: "20260707" }
          }
        })
      )
    ).toEqual(expect.arrayContaining(["📋 Стіл зі справами ⚠️", "🐭 Льох ⚠️"]));
    expect(
      flatInlineButtonTexts(
        buildKorchmaHallKeyboard({
          questMarkers: {
            characterLevel: 4,
            yeger: {
              state: "offered",
              character,
              progress: { wins: 0, target: 5 }
            }
          }
        })
      )
    ).toContain("🛢️ Бочка ⚠️");
    expect(flatInlineButtonTexts(buildKorchmaFightingCornerKeyboard())).toEqual([
      "🥊 Потренуватися",
      "⚡ Миттєва дуель",
      "♟️ Покрокова дуель",
      "🏆 Турніри",
      "🏅 Переможці",
      "⬅️ До зали"
    ]);
    expect(flatInlineButtonCallbacks(buildKorchmaFightingCornerKeyboard())).toEqual([
      "v1:spar:open",
      "v1:duel:new",
      "v1:duel:new-t",
      "v1:tour:o:d",
      "v1:place:duel-winners",
      "v1:place:hall"
    ]);
    expect(flatInlineButtonTexts(buildKorchmaFightingCornerKeyboard({
      trainingDoppelgangerAvailable: false
    }))).toEqual([
      "⚡ Миттєва дуель",
      "♟️ Покрокова дуель",
      "🏆 Турніри",
      "🏅 Переможці",
      "⬅️ До зали"
    ]);
    expect(flatInlineButtonTexts(buildKorchmaFightingCornerKeyboard({
      tournamentPendingRewardCount: 2
    }))).toContain("🏆 Турніри (2)");
    expect(flatInlineButtonTexts(buildDuelTournamentKeyboard({
      period: "day",
      claim: {
        state: "available",
        periodKey: "2026-07-07",
        rank: 1,
        points: 3,
        reward: { gold: 42, items: [] }
      },
      pendingRewards: [
        {
          period: "day",
          periodKey: "2026-07-07",
          window: {
            period: "day",
            key: "2026-07-07",
            label: "Денний турнір",
            startsAt: new Date("2026-07-06T21:00:00.000Z"),
            endsAt: new Date("2026-07-07T21:00:00.000Z")
          },
          rank: 1,
          points: 3,
          reward: { gold: 42, items: [] }
        },
        {
          period: "week",
          periodKey: "2026-W27",
          window: {
            period: "week",
            key: "2026-W27",
            label: "Тижневий турнір",
            startsAt: new Date("2026-06-29T21:00:00.000Z"),
            endsAt: new Date("2026-07-06T21:00:00.000Z")
          },
          rank: 2,
          points: 1,
          reward: { gold: 42, items: [] }
        }
      ]
    }))).toEqual([
      "• День",
      "Тиждень",
      "Місяць",
      "🎁 Забрати скриньку",
      "🎁 Тиждень 12026-W27",
      "↩️ До Бійцівського кутка"
    ]);
    expect(flatInlineButtonTexts(buildKorchmaFightingCornerKeyboard({
      questMarkers: {
        characterLevel: 4,
        dailyKorchmaRound: { state: "not-issued", character, dayToken: "20260628" }
      }
    }))).toContain("⬅️ До зали ⚠️");
    expect(flatInlineButtonTexts(buildKorchmaBarKeyboard())).toEqual([
      "🍹 Напої для себе",
      "🍺 Просте всім",
      "🍻 Якісне всім",
      "💰 Продати манатки",
      "⬅️ До зали"
    ]);
    expect(flatInlineButtonCallbacks(buildKorchmaBarKeyboard())).toEqual([
      "v1:sh:dr",
      "v1:sh:rp:simple",
      "v1:sh:rp:fine",
      "v1:sh:so",
      "v1:place:hall"
    ]);
    expect(flatInlineButtonTexts(buildKorchmaBarKeyboard({ tavernGames: true }))).toContain("🎲 Ігри за столом");
    expect(flatInlineButtonTexts(buildKorchmaBarKeyboard({
      tavernGames: true,
      tavernGameTableCount: -1
    }))).toContain("🎲 Ігри за столом");
    expect(flatInlineButtonTexts(buildKorchmaBarKeyboard({
      tavernGames: true,
      tavernGameTableCount: 2
    }))).toContain("🎲 Ігри за столом (2)");
    expect(flatInlineButtonTexts(buildShynokOverviewKeyboard(undefined, {
      questMarkers: {
        characterLevel: 4,
        dailyKorchmaRound: { state: "not-issued", character, dayToken: "20260628" }
      }
    }))).toContain("⬅️ До зали ⚠️");
    expect(flatInlineButtonCallbacks(buildKorchmaBarKeyboard({ tavernGames: true }))).toContain("v1:sh:gm");
    expect(flatInlineButtonTexts(buildKorchmaBarKeyboard({ includeBottleTurnIn: true }))).toEqual([
      "🍹 Напої для себе",
      "🍺 Просте всім",
      "🍻 Якісне всім",
      "💰 Продати манатки",
      "🍾 Здати пляшку",
      "⬅️ До зали"
    ]);
    expect(flatInlineButtonCallbacks(buildKorchmaBarKeyboard({ includeBottleTurnIn: true }))).toEqual([
      "v1:sh:dr",
      "v1:sh:rp:simple",
      "v1:sh:rp:fine",
      "v1:sh:so",
      "v1:cellar:grownup-turn-in",
      "v1:place:hall"
    ]);
    expect(flatInlineButtonTexts(buildKorchmaNewsCornerKeyboard())).toEqual([
      "📰 Вісти",
      "📣 Останні події",
      "📖 Перекази",
      "🎁 Подарувати манатку",
      "📮 Пошта Квестарні",
      "⬅️ До зали"
    ]);
    expect(flatInlineButtonCallbacks(buildKorchmaNewsCornerKeyboard())).toEqual([
      "v1:news:list:0",
      "v1:ev:l:imp:0",
      "v1:lore:m",
      "v1:gift:open",
      "v1:post:open",
      "v1:place:hall"
    ]);
  });

  it("returns doppelganger training target choice to the fighting corner", () => {
    const keyboard = buildTrainingDoppelgangerStartKeyboard([
      {
        mode: "copy-target",
        buttonLabel: "🪞 Копія поточного",
        title: "Копія поточного",
        description: "Допельґанґер бере поточний образ."
      },
      {
        mode: "random-build",
        buttonLabel: "🎲 Випадковий пригодник",
        title: "Випадковий пригодник",
        description: "Дзеркало збирає випадковий образ."
      }
    ]);

    expect(flatInlineButtonTexts(keyboard)).toEqual([
      "🪞 Копія поточного",
      "🎲 Випадковий пригодник",
      "↩️ Повернутися до кутка"
    ]);
    expect(flatInlineButtonCallbacks(keyboard)).toEqual([
      "v1:spar:mode:copy-target",
      "v1:spar:mode:random-build",
      "v1:place:fighting-corner"
    ]);
  });

  it("offers safe passage search during a passage monster-rest card", () => {
    const keyboard = buildPersistentFightPassageRestKeyboard({ passage: "deep-left" });

    expect(inlineButtonRows(keyboard)).toEqual([
      ["🔎 Пошукати"],
      ["↩️ Повернутися до Сутеренів"]
    ]);
    expect(flatInlineButtonCallbacks(keyboard)).toEqual([
      "v1:search:start:ps:deep-left",
      "v1:place:deep-level1"
    ]);
  });

  it("offers safe location search from the deep level choice card", () => {
    const keyboard = buildPersistentFightDifficultyKeyboard();

    expect(inlineButtonRows(keyboard)).toEqual([
      ["⬆️ Піднятися назад"],
      ["⬅️ Лівий прохід"],
      ["🚪 Прямий прохід"],
      ["➡️ Правий прохід"],
      ["🔎 Пошукати"]
    ]);
    expect(flatInlineButtonCallbacks(keyboard)).toEqual([
      "v1:place:deep",
      "v1:place:deep-left",
      "v1:place:deep-straight",
      "v1:place:deep-right",
      "v1:search:start:l1"
    ]);
  });

  it("hides safe location search buttons while their node is on cooldown", () => {
    expect(flatInlineButtonTexts(buildPersistentFightDifficultyKeyboard({ searchAvailable: false }))).toEqual([
      "⬆️ Піднятися назад",
      "⬅️ Лівий прохід",
      "🚪 Прямий прохід",
      "➡️ Правий прохід"
    ]);
    expect(flatInlineButtonTexts(buildKorchmaDeepKeyboard({ searchAvailable: false }))).toEqual([
      "⬆️ Повернутися до зали",
      "⬇️ Спуститися"
    ]);
  });

  it("hides passage search buttons while their node is on cooldown", () => {
    expect(flatInlineButtonTexts(buildPersistentFightPassagePreviewKeyboard({
      passage: "deep-left",
      encounterToken: "token13",
      searchAvailable: false
    }))).toEqual([
      "⚔️ Атакувати",
      "↩️ Повернутися до Сутеренів"
    ]);
    expect(flatInlineButtonTexts(buildPersistentFightPassageRestKeyboard({
      passage: "deep-left",
      searchAvailable: false
    }))).toEqual([
      "↩️ Повернутися до Сутеренів"
    ]);
  });

  it("keeps tavern inline buttons scoped to tavern actions", () => {
    expect(flatInlineButtonTexts(buildTavernKeyboard())).toEqual([
      "🍺 У рейд на бочку",
      "🧥 Єгер",
      "⬅️ До зали"
    ]);
    const barrelQuestMarkers = {
      characterLevel: 2,
      barrelBeerTutorial: {
        state: "in-progress" as const,
        character,
        progress: {
          accepted: true,
          stipendGranted: true,
          visitedBarrel: false,
          raidCompleted: false,
          beerRoundOffered: false,
          beerDrunk: false,
          activeBeer: false,
          currentLocationId: "location.korchma.barrel"
        }
      }
    };
    expect(flatInlineButtonTexts(buildKorchmaHallKeyboard({ questMarkers: barrelQuestMarkers }))).toContain(
      "🛢️ Бочка ⚠️"
    );
    expect(flatInlineButtonTexts(buildTavernKeyboard({ questMarkers: barrelQuestMarkers }))).toEqual([
      "🍺 У рейд на бочку",
      "🧥 Єгер",
      "⬅️ До зали"
    ]);
    expect(flatInlineButtonTexts(buildTavernKeyboard({
      questMarkers: {
        ...barrelQuestMarkers,
        cellar: {
          state: "ready",
          character
        }
      }
    }))).toContain("⬅️ До зали ⚠️");
    expect(flatInlineButtonTexts(buildTavernResultKeyboard("completed"))).toEqual([
      "🍺 Просте всім",
      "🍻 Якісне всім",
      "🧥 Єгер",
      "⬅️ До зали"
    ]);
    expect(flatInlineButtonCallbacks(buildTavernResultKeyboard("completed"))).toEqual([
      "v1:sh:brp:simple",
      "v1:sh:brp:fine",
      "v1:tavern:ranger",
      "v1:place:hall"
    ]);
    expect(flatInlineButtonTexts(buildTavernResultKeyboard("completed", {
      questMarkers: {
        characterLevel: 4,
        yeger: {
          state: "offered",
          character,
          progress: { wins: 0, target: 5 }
        }
      }
    }))).toContain("🧥 Єгер ⚠️");
    expect(flatInlineButtonTexts(buildTavernResultKeyboard("completed", {
      questMarkers: {
        characterLevel: 4,
        yeger: {
          state: "offered",
          character,
          progress: { wins: 0, target: 5 }
        }
      }
    }))).toContain("⬅️ До зали ⚠️");
    expect(flatInlineButtonTexts(buildTavernResultKeyboard("already-completed"))).toEqual([
      "🍺 Просте всім",
      "🍻 Якісне всім",
      "🧥 Єгер",
      "⬅️ До зали"
    ]);
    expect(flatInlineButtonCallbacks(buildTavernResultKeyboard("already-completed"))).toEqual([
      "v1:sh:brp:simple",
      "v1:sh:brp:fine",
      "v1:tavern:ranger",
      "v1:place:hall"
    ]);
    expect(flatInlineButtonTexts(buildTavernResultKeyboard("audit-break"))).toEqual([
      "🧥 Єгер",
      "⬅️ До зали"
    ]);
    expect(flatInlineButtonTexts(buildTavernResultKeyboard("audit-break", {
      questMarkers: {
        characterLevel: 4,
        yeger: {
          state: "offered",
          character,
          progress: { wins: 0, target: 5 }
        }
      }
    }))).toEqual([
      "🧥 Єгер ⚠️",
      "⬅️ До зали ⚠️"
    ]);
    expect(flatInlineButtonTexts(buildTavernResultKeyboard("pending"))).toEqual([
      "🔄 Перевірити бочку",
      "🏅 Перевірити рейтинг",
      "📰 Перевірити новини"
    ]);
    expect(flatInlineButtonCallbacks(buildTavernResultKeyboard("pending"))).toEqual([
      "v1:tavern:raid",
      "v1:tavern:raid-leaderboard",
      "v1:tavern:raid-news"
    ]);
    expect(flatInlineButtonTexts(buildTavernParticipantsKeyboard())).toEqual(["⬅️ Назад"]);
    expect(flatInlineButtonCallbacks(buildTavernParticipantsKeyboard())).toEqual(["v1:place:barrel"]);
  });

  it("marks hall return buttons when another Korchma location has an available quest", () => {
    expect(flatInlineButtonTexts(buildKorchmaBarKeyboard({
      questMarkers: {
        characterLevel: 2,
        cellar: {
          state: "ready",
          character
        }
      }
    }))).toContain("⬅️ До зали ⚠️");

    expect(flatInlineButtonTexts(buildTavernResultKeyboard("completed", {
      questMarkers: {
        characterLevel: 4,
        yeger: {
          state: "offered",
          character,
          progress: { wins: 0, target: 5 }
        }
      }
    }))).toContain("⬅️ До зали ⚠️");
  });

  it("uses icons for destructive confirmation keyboards", () => {
    expect(flatInlineButtonTexts(buildRestartKeyboard())).toEqual([
      "🔄 Так, почати з початку",
      "⬅️ Ні, лишити персонажа"
    ]);
    expect(flatInlineButtonTexts(buildDevResetKeyboard())).toEqual([
      "✅ Так, скинути",
      "⬅️ Ні, лишити"
    ]);
  });

  it("asks for explicit confirmation before spending korchma round gold", () => {
    expect(
      flatInlineButtonTexts(
        buildKorchmaRoundOfferKeyboard({
          state: "ready",
          character,
          gold: 125,
          canBuySimple: true,
          canBuyFine: true,
          leaderboard: emptyRoundLeaderboard
        })
      )
    ).toEqual(["🍻 Якісне — 100", "🍺 Просте — 10", "⬅️ До шинку"]);
    expect(
      flatInlineButtonCallbacks(
        buildKorchmaRoundOfferKeyboard({
          state: "ready",
          character,
          gold: 25,
          canBuySimple: true,
          canBuyFine: false,
          leaderboard: emptyRoundLeaderboard
        })
      )
    ).toEqual(["v1:tavern:round-simple", "v1:place:bar"]);
  });

  it("keeps Munchkin barter outside the korchma hall", () => {
    expect(flatInlineButtonTexts(buildLevelBarterOfferKeyboard())).toEqual([
      "🧮 Автопідібрати манатки й золото",
      "↩️ До дверей"
    ]);
    expect(flatInlineButtonCallbacks(buildLevelBarterOfferKeyboard())).toEqual([
      "v1:lvlx:auto",
      "v1:place:front"
    ]);
    expect(flatInlineButtonTexts(buildLevelBarterPreviewKeyboard({
      state: "insufficient",
      character,
      eligibleTotalValue: 800,
      gold: 70,
      combinedValue: 870,
      cost: 1000
    }))).toEqual(["↩️ До дверей"]);
    expect(flatInlineButtonTexts(buildLevelBarterResultKeyboard())).toEqual([
      "👤 Персонаж",
      "↩️ До дверей"
    ]);
  });

  it("returns from night Munchkin barter to the Nyz descent", () => {
    const returnOptions = { munchkinLocation: "nyz-descent" as const };

    expect(flatInlineButtonTexts(buildLevelBarterOfferKeyboard(returnOptions))).toEqual([
      "🧮 Автопідібрати манатки й золото",
      "↩️ До Низу"
    ]);
    expect(flatInlineButtonCallbacks(buildLevelBarterOfferKeyboard(returnOptions))).toEqual([
      "v1:lvlx:auto",
      "v1:place:deep"
    ]);
    expect(flatInlineButtonTexts(buildLevelBarterPreviewKeyboard({
      state: "insufficient",
      character,
      eligibleTotalValue: 800,
      gold: 70,
      combinedValue: 870,
      cost: 1000
    }, returnOptions))).toEqual(["↩️ До Низу"]);
    expect(flatInlineButtonCallbacks(buildLevelBarterPreviewKeyboard({
      state: "insufficient",
      character,
      eligibleTotalValue: 800,
      gold: 70,
      combinedValue: 870,
      cost: 1000
    }, returnOptions))).toEqual(["v1:place:deep"]);
    expect(flatInlineButtonTexts(buildLevelBarterResultKeyboard(returnOptions))).toEqual([
      "👤 Персонаж",
      "↩️ До Низу"
    ]);
    expect(flatInlineButtonCallbacks(buildLevelBarterResultKeyboard(returnOptions))).toEqual([
      "v1:menu:hero",
      "v1:place:deep"
    ]);
  });

  it("links to the Barrel and hall when korchma rounds are blocked by an active raid", () => {
    const blockedByBarrel = {
      state: "raid-required" as const,
      character,
      leaderboard: emptyRoundLeaderboard
    };

    expect(flatInlineButtonTexts(buildKorchmaRoundOfferKeyboard(blockedByBarrel))).toEqual([
      "🛢️ До Бочки",
      "⬅️ До зали"
    ]);
    expect(flatInlineButtonCallbacks(buildKorchmaRoundOfferKeyboard(blockedByBarrel))).toEqual([
      "v1:place:barrel",
      "v1:place:hall"
    ]);
    expect(flatInlineButtonTexts(buildKorchmaRoundResultKeyboard(blockedByBarrel))).toEqual([
      "🛢️ До Бочки",
      "⬅️ До зали"
    ]);
    expect(flatInlineButtonCallbacks(buildKorchmaRoundResultKeyboard(blockedByBarrel))).toEqual([
      "v1:place:barrel",
      "v1:place:hall"
    ]);
    expect(flatInlineButtonTexts(buildKorchmaRoundResultKeyboard({
      ...blockedByBarrel,
      state: "completed"
    }, { tavernGames: true, tavernGameTableCount: 3 }))).toContain("🎲 Ігри за столом (3)");
  });

  it("links to the Barrel and hall when Shynok rounds are blocked by an active raid", () => {
    const blockedRoundPreview = {
      state: "raid-required" as const,
      character,
      leaderboard: emptyRoundLeaderboard
    };
    const blockedRoundResult = { state: "raid-required" as const };

    expect(flatInlineButtonTexts(buildShynokRoundPreviewKeyboard(blockedRoundPreview))).toEqual([
      "🛢️ До Бочки",
      "⬅️ До зали"
    ]);
    expect(flatInlineButtonCallbacks(buildShynokRoundPreviewKeyboard(blockedRoundPreview))).toEqual([
      "v1:place:barrel",
      "v1:place:hall"
    ]);
    expect(flatInlineButtonTexts(buildShynokRoundResultKeyboard(blockedRoundResult))).toEqual([
      "🛢️ До Бочки",
      "⬅️ До зали"
    ]);
    expect(flatInlineButtonCallbacks(buildShynokRoundResultKeyboard(blockedRoundResult))).toEqual([
      "v1:place:barrel",
      "v1:place:hall"
    ]);
  });

  it("routes stale Shynok fallback cards through the bar place callback", () => {
    expect(flatInlineButtonTexts(buildBackToShynokKeyboard())).toEqual([
      "⬅️ До Шинку",
      "⬅️ До зали"
    ]);
    expect(flatInlineButtonTexts(buildBackToShynokKeyboard({
      questMarkers: {
        characterLevel: 4,
        dailyKorchmaRound: { state: "not-issued", character, dayToken: "20260628" }
      }
    }))).toContain("⬅️ До зали ⚠️");
    expect(flatInlineButtonCallbacks(buildBackToShynokKeyboard())).toEqual([
      "v1:place:bar",
      "v1:place:hall"
    ]);
  });

  it("keeps adventure inline buttons scoped to quest actions", () => {
    const actionButtons = [
      "🌯 Тицьнути шаурму",
      "📋 Попросити чек",
      "🏃 Обережно відступити",
      "📋 До справ"
    ];

    expect(flatInlineButtonTexts(buildAdventureKeyboard())).toEqual(actionButtons);
    expect(flatInlineButtonTexts(buildAdventureResultKeyboard("completed"))).toEqual([
      "📋 До справ"
    ]);
    expect(flatInlineButtonTexts(buildAdventureResultKeyboard("already-completed"))).toEqual([
      "📋 До справ"
    ]);
    expect(flatInlineButtonTexts(buildAdventureParticipantsKeyboard())).toEqual(["⬅️ Назад"]);
    expect(flatInlineButtonCallbacks(buildAdventureParticipantsKeyboard())).toEqual([
      "v1:quest:adventure"
    ]);
  });

  it("adds adventure problem icons without changing problem callbacks", () => {
    const keyboard = buildAdventureKeyboard({
      localDate: "2026-06-12",
      periodToken: "period93",
      expiresAt: new Date("2026-06-12T11:23:00.000Z"),
      choices: [
        {
          id: "key",
          title: "Ключ забув, що він відкриває",
          hook: "Ключ пишається.",
          client: "Комірник",
          problem: "Ключ забув замок.",
          goal: "Нагадати ключу призначення."
        },
        {
          id: "door",
          title: "Двері беруть плату за вихід",
          hook: "Двері чекають.",
          client: "Гості",
          problem: "Двері беруть мито.",
          goal: "Відкрити вихід без плати."
        },
        {
          id: "cloak",
          title: "Плащ став у чергу замість власника",
          hook: "Плащ штовхається.",
          client: "Власник",
          problem: "Плащ тримає чергу.",
          goal: "Повернути тканину власнику."
        }
      ]
    });

    expect(flatInlineButtonTexts(keyboard)).toEqual([
      "🗝️ Ключ забув, що він відкриває",
      "🚪 Двері беруть плату за вихід",
      "🧥 Плащ став у чергу замість власника",
      "📋 До справ"
    ]);
    const callbacks = flatInlineButtonCallbacks(keyboard);
    expect(callbacks.slice(0, 3).every((callback) => /^v2:adv:p:period93:q[0-9a-z]+$/u.test(callback))).toBe(true);
    expect(callbacks[3]).toBe("v1:place:quest-table");
  });

  it("keeps character-aware adventure labels on the same callback actions", () => {
    const labels = flatInlineButtonTexts(buildAdventureKeyboard({ ...character, classId: "class.rogue" }));

    expect(labels.slice(0, -2).length).toBeGreaterThanOrEqual(5);
    expect(labels).toContain("📋 Вимагати чек і походження начинки");
    expect(labels.join("\n")).not.toMatch(/Звірити «|Витягти доказ|🏷️|Пересічні Пригодники/u);
    expect(labels.at(-2)).toBe("💡 Підказка");
    expect(labels.at(-1)).toBe("📋 До справ");
    const callbacks = flatInlineButtonCallbacks(buildAdventureKeyboard({ ...character, classId: "class.rogue" }));
    expect(callbacks.slice(0, -2).every((callback) => /^v2:adv:m:q[0-9a-z]+$/u.test(callback))).toBe(true);
    expect(callbacks.at(-2)).toBe("v2:adv:h:m");
    expect(callbacks.at(-1)).toBe("v1:place:quest-table");

    const helpLabels = flatInlineButtonTexts(buildMimicShawarmaMethodHelpKeyboard({ ...character, classId: "class.rogue" }));
    const helpCallbacks = flatInlineButtonCallbacks(buildMimicShawarmaMethodHelpKeyboard({ ...character, classId: "class.rogue" }));
    expect(helpLabels.slice(0, -2)).toEqual(labels.slice(0, -2));
    expect(helpLabels.at(-2)).toBe("⬅️ Назад");
    expect(helpCallbacks.at(-2)).toBe("v2:adv:b:m");
  });

  it("uses short authored method labels on selected adventure buttons", () => {
    const bard = {
      ...character,
      raceId: "race.dryland-rusalka",
      raceName: "Русалка сухопутна",
      classId: "class.bard",
      className: "Бард",
      title: "Співачка Без Моря",
      level: 3,
      xp: 25
    };
    const choice = {
      id: "class-bard-uniform",
      title: "Форма для «Барда» не влазить у клітинку",
      hook: "Клітинка просить ширини.",
      client: "Клітинка",
      problem: "Форма сперечається з клітинкою.",
      goal: "Повернути бланк до робочого стану."
    };

    const keyboard = buildAdventureApproachKeyboard({
      state: "selected",
      character: bard,
      offer: {
        localDate: "2026-06-12",
        periodToken: "period93",
        expiresAt: new Date("2026-06-12T11:23:00.000Z"),
        choices: [choice]
      },
      choice,
      approaches: buildAdventureMethodOptions(choice, bard)
    });

    const labels = flatInlineButtonTexts(keyboard);

    expect(labels.slice(0, -2).length).toBeGreaterThanOrEqual(5);
    expect(labels).toContain("🤝 Домовитися з канцелярським краєм");
    expect(labels.join("\n")).not.toMatch(/Приплив|Куплет|Співачка Без Моря|🏷️|: форму/u);
    expect(labels.at(-2)).toBe("💡 Підказка");
    expect(labels.at(-1)).toBe("⬅️ Інші справи");

    const helpLabels = flatInlineButtonTexts(buildAdventureApproachHelpKeyboard({
      state: "selected",
      character: bard,
      offer: {
        localDate: "2026-06-12",
        periodToken: "period93",
        expiresAt: new Date("2026-06-12T11:23:00.000Z"),
        choices: [choice]
      },
      choice,
      approaches: buildAdventureMethodOptions(choice, bard)
    }));
    const helpCallbacks = flatInlineButtonCallbacks(buildAdventureApproachHelpKeyboard({
      state: "selected",
      character: bard,
      offer: {
        localDate: "2026-06-12",
        periodToken: "period93",
        expiresAt: new Date("2026-06-12T11:23:00.000Z"),
        choices: [choice]
      },
      choice,
      approaches: buildAdventureMethodOptions(choice, bard)
    }));
    expect(helpLabels.slice(0, -2)).toEqual(labels.slice(0, -2));
    expect(helpLabels.at(-2)).toBe("⬅️ Назад");
    expect(helpCallbacks.at(-2)).toMatch(/^v2:adv:p:period93:q[0-9a-z]+$/u);
  });

  it("keeps cellar inline buttons scoped to repeatable errand actions", () => {
    const actionButtons = [
      "🧀 Поставити сирну пастку",
      "🧹 Підмести хоробро",
      "🤝 Домовитись із мишею",
      "⬅️ До зали"
    ];

    expect(flatInlineButtonTexts(buildCellarKeyboard())).toEqual(actionButtons);
    expect(flatInlineButtonTexts(buildCellarResultKeyboard("ready"))).toEqual(actionButtons);
    expect(flatInlineButtonTexts(buildCellarResultKeyboard("completed"))).toEqual([
      "⬅️ До зали"
    ]);
    expect(flatInlineButtonTexts(buildCellarResultKeyboard("on-cooldown"))).toEqual([
      "⬅️ До зали"
    ]);
    expect(flatInlineButtonTexts(buildCellarParticipantsKeyboard())).toEqual(["⬅️ Назад"]);
    expect(flatInlineButtonCallbacks(buildCellarParticipantsKeyboard())).toEqual(["v1:quest:cellar"]);
  });

  it("marks cellar hall return when another hall quest is available", () => {
    const questMarkers = {
      adventure: { state: "ready", character }
    } as const;

    expect(flatInlineButtonTexts(buildCellarKeyboard(undefined, { questMarkers }))).toContain("⬅️ До зали ⚠️");
    expect(flatInlineButtonTexts(buildCellarResultKeyboard("completed", undefined, { questMarkers }))).toEqual([
      "⬅️ До зали ⚠️"
    ]);
    expect(flatInlineButtonTexts(buildCellarGrownupKeyboard("bottle-obtained", { questMarkers }))).toContain(
      "⬅️ До зали ⚠️"
    );
  });

  it("keeps character-aware cellar labels on the same callback actions", () => {
    const domovyk = { ...character, raceId: "race.domovyk", classId: "class.rogue" };

    const cellarLabels = flatInlineButtonTexts(buildCellarKeyboard(domovyk));

    expect(cellarLabels.slice(0, -2).length).toBeGreaterThanOrEqual(5);
    expect(cellarLabels).toContain("🪙 Дати миші 1 золоту «на сирний фонд»");
    expect(cellarLabels.join("\n")).not.toMatch(/Оголосити правилом|Витягти доказ|🏷️|Пересічні Пригодники/u);
    expect(cellarLabels.at(-2)).toBe("💡 Підказка");
    expect(cellarLabels.at(-1)).toBe("⬅️ До зали");
    const callbacks = flatInlineButtonCallbacks(buildCellarKeyboard(domovyk));
    expect(callbacks.slice(0, -2).every((callback) => /^v2:cellar:q[0-9a-z]+$/u.test(callback))).toBe(true);
    expect(callbacks.at(-2)).toBe("v2:cellar:h");
    expect(callbacks.at(-1)).toBe("v1:place:hall");
    expect(flatInlineButtonTexts(buildCellarResultKeyboard("ready", domovyk))).toEqual(cellarLabels);

    const helpLabels = flatInlineButtonTexts(buildCellarMethodHelpKeyboard(domovyk));
    const helpCallbacks = flatInlineButtonCallbacks(buildCellarMethodHelpKeyboard(domovyk));
    expect(helpLabels.slice(0, -2)).toEqual(cellarLabels.slice(0, -2));
    expect(helpLabels.at(-2)).toBe("⬅️ Назад");
    expect(helpCallbacks.at(-2)).toBe("v2:cellar:b");
  });

  it("keeps fight inline buttons scoped to fight actions", () => {
    const actionButtons = [
      "🗡️ Вдарити",
      "📋 Збити з пантелику чеком",
      "🏃 Відступити красиво"
    ];

    expect(flatInlineButtonTexts(buildFightKeyboard())).toEqual(actionButtons);
    expect(flatInlineButtonTexts(buildFightResultKeyboard("completed"))).toEqual(actionButtons);
    expect(flatInlineButtonTexts(buildFightResultKeyboard("already-completed"))).toEqual([
      "📋 До справ"
    ]);
  });

  it("keeps character-aware fight labels on the same callback actions", () => {
    expect(flatInlineButtonTexts(buildFightKeyboard({ ...character, classId: "class.bard" }))).toEqual([
      "🎵 Вдарити приспівом",
      "📋 Заспівати про чек",
      "🏃 Піти на біс"
    ]);
    expect(flatInlineButtonCallbacks(buildFightKeyboard({ ...character, classId: "class.bard" }))).toEqual([
      "v1:fight:mimic:attack",
      "v1:fight:mimic:receipt",
      "v1:fight:mimic:flee"
    ]);
    expect(flatInlineButtonTexts(buildFightResultKeyboard("completed", { ...character, classId: "class.bard" }))).toEqual([
      "🎵 Вдарити приспівом",
      "📋 Заспівати про чек",
      "🏃 Піти на біс"
    ]);
  });

  it("keeps persistent fight buttons scoped to turn callbacks", () => {
    const session = persistentFightSession();

    expect(flatInlineButtonTexts(buildPersistentFightKeyboard(session, character))).toEqual([
      "🗡️ Вдарити",
      "🛡 Захищатися",
      "🪓 Силовий замах",
      "🧰 Практична імпровізація",
      "🏃 Відступити"
    ]);
    expect(inlineButtonRows(buildPersistentFightKeyboard(session, character))).toEqual([
      ["🗡️ Вдарити", "🛡 Захищатися"],
      ["🪓 Силовий замах", "🧰 Практична імпровізація"],
      ["🏃 Відступити"]
    ]);
    expect(flatInlineButtonTexts(buildPersistentFightKeyboard(session, { ...character, classId: "class.varenyk-mancer" }))).toContain(
      "🥟 Кипляча начинка"
    );
    expect(flatInlineButtonTexts(buildPersistentFightKeyboard(session, { ...character, classId: "class.rogue" }))).toContain(
      "🌘 Тіньовий розтин"
    );
    expect(flatInlineButtonTexts(buildKorchmaDeepKeyboard())).toEqual([
      "⬆️ Повернутися до зали",
      "🔎 Пошукати",
      "⬇️ Спуститися"
    ]);
    expect(flatInlineButtonCallbacks(buildKorchmaDeepKeyboard())).toEqual([
      "v1:place:hall",
      "v1:search:start:d",
      "v1:place:deep-level1"
    ]);
    expect(flatInlineButtonTexts(buildKorchmaDeepKeyboard({ munchkinLocation: "nyz-descent" }))).toEqual([
      "⬆️ Повернутися до зали",
      "🎒 Манчкін-скупник",
      "🔎 Пошукати",
      "⬇️ Спуститися"
    ]);
    expect(flatInlineButtonCallbacks(buildKorchmaDeepKeyboard({ munchkinLocation: "nyz-descent" }))).toEqual([
      "v1:place:hall",
      "v1:lvlx:open",
      "v1:search:start:d",
      "v1:place:deep-level1"
    ]);
    expect(flatInlineButtonCallbacks(buildPersistentFightKeyboard(session, character))).toEqual([
      "v1:fight:turn:123e4567-e89b-12d3-a456-426614174000:4:attack",
      "v1:fight:turn:123e4567-e89b-12d3-a456-426614174000:4:defend",
      "v1:fight:turn:123e4567-e89b-12d3-a456-426614174000:4:skill",
      "v1:fight:turn:123e4567-e89b-12d3-a456-426614174000:4:race",
      "v1:fight:turn:123e4567-e89b-12d3-a456-426614174000:4:flee"
    ]);
    expect(flatInlineButtonTexts(buildPersistentFightResultKeyboard({
      ...session,
      status: "won",
      state: {
        ...session.state!,
        status: "won"
      }
    }, character))).toEqual(["⚔️ Новий бій", "↩️ Повернутися до Низу"]);
    expect(flatInlineButtonCallbacks(buildPersistentFightResultKeyboard({
      ...session,
      status: "won",
      state: {
        ...session.state!,
        status: "won"
      }
    }, character))).toEqual(["v1:place:deep-straight", "v1:place:deep"]);
    expect(flatInlineButtonCallbacks(buildPersistentFightResultKeyboard({
      ...session,
      status: "won",
      state: {
        ...session.state!,
        originLocationId: "location.korchma.deep.level1.left",
        status: "won"
      }
    }, character))).toEqual(["v1:place:deep-left", "v1:place:deep-level1"]);
    expect(flatInlineButtonTexts(buildPersistentFightResultKeyboard({
      ...session,
      status: "won",
      state: {
        ...session.state!,
        source: "adventure",
        originLocationId: "location.korchma.quest_table",
        status: "won"
      }
    }, character))).toEqual(["↩️ Повернутися до столу"]);
    expect(flatInlineButtonCallbacks(buildPersistentFightResultKeyboard({
      ...session,
      status: "won",
      state: {
        ...session.state!,
        source: "adventure",
        originLocationId: "location.korchma.quest_table",
        status: "won"
      }
    }, character))).toEqual(["v1:place:quest-table"]);
  });

  it("hides unavailable persistent gear action buttons while the fight card explains the blocker", () => {
    const session = {
      ...persistentFightSession(),
      state: {
        ...persistentFightSession().state!,
        hero: {
          hp: 21,
          hpMax: 24,
          mana: 0,
          manaMax: 12
        },
        equipmentAbilities: {
          version: 1 as const,
          grantIds: ["mantok-ability.red-line-dagger"]
        }
      }
    };
    const keyboard = buildPersistentFightKeyboard(session, { ...character, level: 10 });

    expect(flatInlineButtonCallbacks(keyboard)).not.toContain(
      "v1:fight:gear:123e4567-e89b-12d3-a456-426614174000:4:rldagr"
    );
  });

  it("shows the barrel shield gear action on persistent fight keyboards", () => {
    const session = {
      ...persistentFightSession(),
      state: {
        ...persistentFightSession().state!,
        equipmentAbilities: {
          version: 1 as const,
          grantIds: ["mantok-ability.barrel-counter-shield"]
        }
      }
    };
    const keyboard = buildPersistentFightKeyboard(session, { ...character, level: 9 });

    expect(flatInlineButtonTexts(keyboard)).toContain("🛡 Контраргумент");
    expect(flatInlineButtonCallbacks(keyboard)).toContain(
      "v1:fight:gear:123e4567-e89b-12d3-a456-426614174000:4:bcshield"
    );
  });

  it("adds journal navigation only on persistent fight results", () => {
    const session = {
      ...persistentFightSession(),
      state: {
        ...persistentFightSession().state!,
        turnLog: [
          {
            turn: 1,
            hero: { hp: 21, mana: 12 },
            monster: { hp: 14 },
            summary: {
              action: "attack" as const,
              heroOutcome: "hit" as const,
              heroDamage: 4,
              monsterDamage: 2,
              manaSpent: 0,
              critical: false
            }
          },
          {
            turn: 2,
            hero: { hp: 21, mana: 12 },
            monster: { hp: 14 },
            summary: {
              action: "defend" as const,
              heroOutcome: "defended" as const,
              heroDamage: 0,
              monsterDamage: 0,
              manaSpent: 0,
              critical: false
            }
          }
        ]
      }
    };
    const terminalSession = {
      ...session,
      status: "won" as const,
      state: {
        ...session.state,
        status: "won" as const
      }
    };

    expect(flatInlineButtonTexts(buildPersistentFightKeyboard(session, character))).not.toContain("📜 Журнал бою");
    expect(flatInlineButtonTexts(buildPersistentFightResultKeyboard(terminalSession, character))).toContain("📜 Журнал бою");
    expect(flatInlineButtonCallbacks(buildPersistentFightResultKeyboard(terminalSession, character))).toContain(
      "v1:fight:log:123e4567-e89b-12d3-a456-426614174000:1"
    );
    expect(flatInlineButtonTexts(buildPersistentFightJournalKeyboard(session, 0))).toEqual([
      "1/2",
      "Далі ▶️",
      "Кінець ⏭️",
      "↩️ До бою"
    ]);
    expect(flatInlineButtonCallbacks(buildPersistentFightJournalKeyboard(session, 0))).toEqual([
      "v1:fight:log:123e4567-e89b-12d3-a456-426614174000:0",
      "v1:fight:log:123e4567-e89b-12d3-a456-426614174000:1",
      "v1:fight:log:123e4567-e89b-12d3-a456-426614174000:1",
      "v1:fight:view:123e4567-e89b-12d3-a456-426614174000"
    ]);
    expect(flatInlineButtonTexts(buildPersistentFightJournalKeyboard(session, 1))).toEqual([
      "⏮️ Початок",
      "◀️ Назад",
      "2/2",
      "↩️ До бою"
    ]);
    expect(flatInlineButtonTexts(buildPersistentFightJournalKeyboard(terminalSession, 1))).toContain("↩️ До результатів");
  });

  it("keeps active training doppelganger buttons scoped to turn callbacks", () => {
    const session: SoloCombatSessionRecord = {
      ...persistentFightSession(),
      monsterId: TRAINING_DOPPELGANGER_MONSTER_ID,
      state: {
        ...persistentFightSession().state!,
        source: "training",
        monster: {
          id: TRAINING_DOPPELGANGER_MONSTER_ID,
          hp: 18,
          hpMax: 18
        }
      }
    };

    expect(flatInlineButtonTexts(buildTrainingDoppelgangerKeyboard(session, character))).toEqual([
      "🗡️ Вдарити",
      "🛡 Захищатися",
      "🪓 Силовий замах",
      "🧰 Практична імпровізація",
      "🏃 Відступити"
    ]);
    expect(inlineButtonRows(buildTrainingDoppelgangerKeyboard(session, character))).toEqual([
      ["🗡️ Вдарити", "🛡 Захищатися"],
      ["🪓 Силовий замах", "🧰 Практична імпровізація"],
      ["🏃 Відступити"]
    ]);
    expect(flatInlineButtonTexts(buildTrainingDoppelgangerKeyboard(session, { ...character, classId: "class.varenyk-mancer" }))).toContain(
      "🥟 Кипляча начинка"
    );
    expect(flatInlineButtonTexts(buildTrainingDoppelgangerKeyboard(session, { ...character, classId: "class.rogue" }))).toContain(
      "🌘 Тіньовий розтин"
    );
    expect(flatInlineButtonCallbacks(buildTrainingDoppelgangerKeyboard(session, character))).toEqual([
      "v1:spar:turn:123e4567-e89b-12d3-a456-426614174000:4:attack",
      "v1:spar:turn:123e4567-e89b-12d3-a456-426614174000:4:defend",
      "v1:spar:turn:123e4567-e89b-12d3-a456-426614174000:4:skill",
      "v1:spar:turn:123e4567-e89b-12d3-a456-426614174000:4:race",
      "v1:spar:turn:123e4567-e89b-12d3-a456-426614174000:4:flee"
    ]);
  });

  it("returns terminal training doppelganger screens to the fighting corner", () => {
    expect(flatInlineButtonTexts(buildTrainingDoppelgangerKeyboard())).toEqual([
      "↩️ Повернутися до кутка"
    ]);
    expect(flatInlineButtonCallbacks(buildTrainingDoppelgangerKeyboard())).toEqual([
      "v1:place:fighting-corner"
    ]);
  });

  it("offers a journal on terminal training doppelganger screens with logged turns", () => {
    const session: SoloCombatSessionRecord = {
      ...persistentFightSession(),
      monsterId: TRAINING_DOPPELGANGER_MONSTER_ID,
      status: "won",
      state: {
        ...persistentFightSession().state!,
        source: "training",
        status: "won",
        turnLog: [
          {
            eventId: "turn:1",
            turn: 1,
            hero: { hp: 17, mana: 5 },
            monster: { hp: 0 },
            summary: {
              action: "attack",
              heroOutcome: "hit",
              heroDamage: 18,
              monsterDamage: 0,
              manaSpent: 0,
              critical: false
            }
          }
        ],
        monster: {
          id: TRAINING_DOPPELGANGER_MONSTER_ID,
          hp: 0,
          hpMax: 18
        }
      }
    };

    expect(flatInlineButtonTexts(buildTrainingDoppelgangerKeyboard(session, character))).toEqual([
      "📜 Журнал бою",
      "↩️ Повернутися до кутка"
    ]);
    expect(flatInlineButtonCallbacks(buildTrainingDoppelgangerKeyboard(session, character))).toEqual([
      "v1:spar:log:123e4567-e89b-12d3-a456-426614174000:0",
      "v1:place:fighting-corner"
    ]);
  });

  it("keeps active turn-based duel cards on recoverable refresh only", () => {
    const keyboard = buildTurnBasedDuelKeyboard(
      turnBasedDuelKeyboardResult({
        session: {
          actingCharacterId: "character-2",
          status: "resolved",
          turn: 6,
          version: 9
        }
      }),
      "character-1",
      "💪 Силовий удар"
    );

    expect(flatInlineButtonTexts(keyboard)).toEqual(["🔎 Оновити"]);
    expect(flatInlineButtonCallbacks(keyboard)).toEqual(["v1:duel:view:abcDEF12"]);
  });

  it("returns duel result cards to the fighting corner", () => {
    const keyboard = buildDuelResultKeyboard("abcDEF12");

    expect(flatInlineButtonTexts(keyboard)).toEqual([
      "🔁 Реванш",
      "📣 Картка",
      "🥊 Покликати ще когось",
      "↩️ Повернутися до кутка"
    ]);
    expect(flatInlineButtonCallbacks(keyboard)).toEqual([
      "v1:duel:rematch:abcDEF12",
      "v1:duel:share:abcDEF12",
      "v1:duel:new",
      "v1:place:fighting-corner"
    ]);
  });

  it("hides turn actions after the viewer already queued a duel choice", () => {
    const result = turnBasedDuelKeyboardResult({
      session: {
        state: {
          pendingActions: {
            challenger: {
              actorCharacterId: "character-1",
              action: "attack"
            }
          }
        }
      }
    });

    expect(flatInlineButtonTexts(buildTurnBasedDuelKeyboard(result, "character-1", "💪 Силовий удар"))).toEqual([
      "🔎 Оновити"
    ]);
    expect(inlineButtonRows(buildTurnBasedDuelKeyboard(result, "character-2", "💪 Силовий удар"))).toEqual([
      ["⚔️ Атакувати", "🛡 Захищатися"],
      ["💪 Силовий удар", "🧰 Практична імпровізація"],
      ["🏳️ Здатися", "🔎 Оновити"]
    ]);
  });

  it("hides a turn-based duel skill while the shared combat cooldown is active", () => {
    const result = turnBasedDuelKeyboardResult({
      session: {
        state: {
          participants: {
            challenger: turnBasedParticipant("character-1", {
              cooldowns: {
                skill: {
                  id: "skill.forceful-strike",
                  remainingTurns: 3
                }
              }
            })
          }
        }
      }
    });

    expect(inlineButtonRows(buildTurnBasedDuelKeyboard(result, "character-1", "💪 Силовий удар"))).toEqual([
      ["⚔️ Атакувати", "🛡 Захищатися"],
      ["🧰 Практична імпровізація"],
      ["🏳️ Здатися", "🔎 Оновити"]
    ]);
  });

  it("hides a turn-based duel gear action while its equipment cooldown is active", () => {
    const result = turnBasedDuelKeyboardResult({
      session: {
        state: {
          participants: {
            challenger: turnBasedParticipant("character-1", {
              equipmentAbilityGrantIds: ["mantok-ability.red-line-dagger"],
              cooldowns: {
                abilities: {
                  "gear.red-line-dagger": {
                    id: "gear.red-line-dagger",
                    remainingTurns: 2
                  }
                }
              }
            })
          }
        }
      }
    });

    expect(flatInlineButtonCallbacks(
      buildTurnBasedDuelKeyboard(result, "character-1", "💪 Силовий удар")
    )).not.toContain("v1:duel:g:abcDEF12:2:4:rldagr");
  });

  it("keeps persistent fight skill icons unique and away from common action icons", () => {
    const skillIds = [
      "skill.forceful-strike",
      "skill.hot-spell",
      "skill.boiling-filling",
      "skill.form-thirteen-b",
      "skill.dangerous-couplet",
      "skill.shadow-cut",
      "skill.trick-shot",
      "skill.strict-blessing",
      "skill.steppe-side-eye",
      "skill.careful-strike"
    ];
    const displays = skillIds.map(getCombatSkillDisplay);
    const reservedActionIcons = new Set(["🗡️", "🛡", "🏃", "🧾"]);

    expect(new Set(displays.map((display) => display.icon)).size).toBe(displays.length);
    expect(displays.filter((display) => reservedActionIcons.has(display.icon))).toEqual([]);
    expect(getCombatSkillDisplay("skill.boiling-filling")).toEqual({
      icon: "🥟",
      name: "Кипляча начинка"
    });
    expect(getCombatSkillDisplay("skill.shadow-cut")).toEqual({
      icon: "🌘",
      name: "Тіньовий розтин"
    });
    expect(getPersistentFightSkillLabel({ ...character, classId: "class.varenyk-mancer" })).toBe(
      "🥟 Кипляча начинка"
    );
    expect(getPersistentFightSkillLabel({ ...character, classId: "class.rogue" })).toBe(
      "🌘 Тіньовий розтин"
    );
    expect(getPersistentFightSkillLabel({ ...character, classId: "class.ranger" })).toBe(
      "🏹 Рикошетний постріл"
    );
    expect(getPersistentFightSkillLabel({ ...character, classId: "class.priest" })).toBe(
      "✨ Суворе благословення"
    );
  });

  it("keeps hunt board inline buttons scoped to hunt actions", () => {
    expect(flatInlineButtonTexts(buildHuntBoardKeyboard(readyHunt()))).toEqual([
      "🗡️ Вдарити по проблемі",
      "🎭 Обдурити проблему",
      "📋 Закрити актом",
      "📖 Запис у бестіарії",
      "📋 До справ"
    ]);
    expect(flatInlineButtonCallbacks(buildHuntBoardKeyboard(readyHunt()))).toEqual([
      "v1:hunt:act:2026-06-14T08:abc1234:strike",
      "v1:hunt:act:2026-06-14T08:abc1234:trick",
      "v1:hunt:act:2026-06-14T08:abc1234:retreat",
      "v1:bst:mon:monster.stamp-doorkeeper-skeleton:0",
      "v1:place:quest-table"
    ]);
  });

  it("builds inventory and equipment preview navigation", () => {
    expect(flatInlineButtonTexts(buildInventoryKeyboard({ state: "no-character" }))).toEqual([]);
    expect(
      flatInlineButtonTexts(
        buildInventoryKeyboard({
          state: "found",
          totalGoldValue: 0,
          items: [
            {
              id: "character-item-1",
              itemId: "item.wet-hero-ticket",
              quantity: 2,
              content: {
                id: "item.wet-hero-ticket",
                name: "Квиток мокрого пригодника",
                description: "Трофей.",
                rarity: "common",
                slot: "junk",
                priceless: true
              }
            }
          ]
        })
      )
    ).toEqual([
      "🛡️ Спорядження",
      "1️⃣ Разові",
      "♻️ До Дружньої Скрині",
      "🔎 Квиток мокрого пригодника (2)"
    ]);
    expect(
      flatInlineButtonCallbacks(
        buildInventoryKeyboard({
          state: "found",
          totalGoldValue: 0,
          items: [
            {
              id: "character-item-1",
              itemId: "item.wet-hero-ticket",
              quantity: 1,
              content: {
                id: "item.wet-hero-ticket",
                name: "Квиток мокрого пригодника",
                description: "Трофей.",
                rarity: "common",
                slot: "junk",
                priceless: true
              }
            }
          ]
        })
      )
    ).toEqual([
      "v1:equip:view",
      "v1:item:inventory:f:u",
      "v1:chest:open",
      "v1:item:detail:item.wet-hero-ticket"
    ]);
    expect(
      flatInlineButtonTexts(
        buildInventoryKeyboard(
          {
            state: "found",
            totalGoldValue: 0,
            items: [
              {
                id: "character-item-1",
                itemId: "item.pan-of-persuasion",
                quantity: 1,
                content: {
                  id: "item.pan-of-persuasion",
                  name: "Пательня переконання",
                  description: "Важкий аргумент.",
                  rarity: "common",
                  slot: "weapon",
                  goldValue: 25
                }
              },
              {
                id: "character-item-2",
                itemId: "item.wet-hero-ticket",
                quantity: 1,
                content: {
                  id: "item.wet-hero-ticket",
                  name: "Квиток мокрого пригодника",
                  description: "Трофей.",
                  rarity: "common",
                  slot: "junk",
                  priceless: true
                }
              }
            ]
          },
          0,
          null,
          { equippedItemIds: new Set(["item.pan-of-persuasion"]) }
        )
      )
    ).toEqual([
      "🛡️ Спорядження",
      "1️⃣ Разові",
      "♻️ До Дружньої Скрині",
      "🕒 Нові спершу",
      "🔤 А-Я",
      "✅ Пательня переконання",
      "🔎 Квиток мокрого пригодника"
    ]);
    expect(
      flatInlineButtonTexts(
        buildInventoryKeyboard(
          {
            state: "found",
            totalGoldValue: 0,
            items: Array.from({ length: 9 }, (_, index) => ({
              id: `character-item-${index + 1}`,
              itemId: `item.test-${index + 1}`,
              quantity: 1,
              content: {
                id: `item.test-${index + 1}`,
                name: `Манатка ${index + 1}`,
                description: "Трофей.",
                rarity: "common",
                slot: "junk",
                priceless: true
              }
            }))
          },
          1
        )
      )
    ).toEqual([
      "🛡️ Спорядження",
      "1️⃣ Разові",
      "♻️ До Дружньої Скрині",
      "🕒 Нові спершу",
      "🔤 А-Я",
      "🔎 Манатка 9",
      "◀️ Назад",
      "2/2"
    ]);
    expect(
      flatInlineButtonCallbacks(
        buildInventoryKeyboard(
          {
            state: "found",
            totalGoldValue: 0,
            items: Array.from({ length: 9 }, (_, index) => ({
              id: `character-item-${index + 1}`,
              itemId: `item.test-${index + 1}`,
              quantity: 1,
              content: {
                id: `item.test-${index + 1}`,
                name: `Манатка ${index + 1}`,
                description: "Трофей.",
                rarity: "common",
                slot: "junk",
                priceless: true
              }
            }))
          },
          1
        )
      )
    ).toEqual([
      "v1:equip:view",
      "v1:item:inventory:f:u",
      "v1:chest:open",
      "v1:item:inventory:r:dn",
      "v1:item:inventory:r:az",
      "v1:item:detail:item.test-9:1",
      "v1:item:inventory",
      "v1:item:page:2"
    ]);
    expect(
      inlineButtonRows(
        buildInventoryKeyboard(
          {
            state: "found",
            totalGoldValue: 0,
            items: [
              {
                id: "character-item-1",
                itemId: "item.test-beta",
                quantity: 1,
                createdAt: new Date("2026-06-12T10:00:00.000Z"),
                content: {
                  id: "item.test-beta",
                  name: "Бета",
                  description: "Трофей.",
                  rarity: "common",
                  slot: "junk",
                  priceless: true
                }
              },
              {
                id: "character-item-2",
                itemId: "item.test-alpha",
                quantity: 1,
                createdAt: new Date("2026-06-13T10:00:00.000Z"),
                content: {
                  id: "item.test-alpha",
                  name: "Альфа",
                  description: "Трофей.",
                  rarity: "common",
                  slot: "junk",
                  priceless: true
                }
              }
            ]
          },
          0,
          null,
          { sort: "date-desc" }
        )
      )
    ).toEqual([
      ["🛡️ Спорядження", "1️⃣ Разові"],
      ["♻️ До Дружньої Скрині"],
      ["🕒 Нові в кінці", "🔤 А-Я"],
      ["🔎 Альфа"],
      ["🔎 Бета"]
    ]);
    expect(
      flatInlineButtonTexts(
        buildInventoryKeyboard(
          {
            state: "found",
            totalGoldValue: 0,
            items: [
              {
                id: "character-item-1",
                itemId: "item.pan-of-persuasion",
                quantity: 1,
                content: {
                  id: "item.pan-of-persuasion",
                  name: "Пательня переконання",
                  description: "Важкий аргумент.",
                  rarity: "common",
                  slot: "weapon",
                  goldValue: 25
                }
              },
              {
                id: "character-item-2",
                itemId: "item.wet-hero-ticket",
                quantity: 1,
                content: {
                  id: "item.wet-hero-ticket",
                  name: "Квиток мокрого пригодника",
                  description: "Трофей.",
                  rarity: "common",
                  slot: "junk",
                  priceless: true
                }
              }
            ]
          },
          0,
          "weapon",
          {
            currentSlotItem: {
              itemId: "item.pan-of-persuasion",
              content: {
                id: "item.pan-of-persuasion",
                name: "Пательня переконання",
                description: "Важкий аргумент.",
                rarity: "common",
                slot: "weapon",
                goldValue: 25
              }
            }
          }
        )
      )
    ).toEqual(["🛡️ Спорядження", "🎒 Усі манатки", "✅ Пательня переконання"]);
    expect(
      flatInlineButtonCallbacks(
        buildInventoryKeyboard(
          {
            state: "found",
            totalGoldValue: 0,
            items: [
              {
                id: "character-item-1",
                itemId: "item.pan-of-persuasion",
                quantity: 1,
                content: {
                  id: "item.pan-of-persuasion",
                  name: "Пательня переконання",
                  description: "Важкий аргумент.",
                  rarity: "common",
                  slot: "weapon",
                  goldValue: 25
                }
              },
              {
                id: "character-item-2",
                itemId: "item.wet-hero-ticket",
                quantity: 1,
                content: {
                  id: "item.wet-hero-ticket",
                  name: "Квиток мокрого пригодника",
                  description: "Трофей.",
                  rarity: "common",
                  slot: "junk",
                  priceless: true
                }
              }
            ]
          },
          0,
          "weapon"
        )
      )
    ).toEqual(["v1:equip:view", "v1:item:inventory", "v1:item:detail:item.pan-of-persuasion:s:w"]);
    const longCallbackItemKeyboard = buildInventoryKeyboard(
      {
        state: "found",
        totalGoldValue: 0,
        items: [
          {
            id: "character-item-long-tool",
            itemId: "item.mantok.coverage.universal.lantern-of-suspicious-corners",
            quantity: 1,
            content: {
              id: "item.mantok.coverage.universal.lantern-of-suspicious-corners",
              name: "Ліхтар підозрілих кутків",
              description: "Світить туди, де інвентар робить вигляд, що все гаразд.",
              rarity: "common",
              slot: "accessory",
              equipmentSlot: "tool",
              goldValue: 23,
              effect: { luck: 1 }
            }
          }
        ]
      },
      12,
      "tool"
    );
    const longCallbackItemCallbacks = flatInlineButtonCallbacks(longCallbackItemKeyboard);

    expect(flatInlineButtonTexts(longCallbackItemKeyboard)).toEqual([
      "🛡️ Спорядження",
      "🎒 Усі манатки",
      "🔎 Ліхтар підозрілих кутків"
    ]);
    expect(longCallbackItemCallbacks).toEqual([
      "v1:equip:view",
      "v1:item:inventory",
      expect.stringMatching(/^v1:item:d:[a-z0-9]+:s:t$/)
    ]);
    expect(longCallbackItemCallbacks.every((callback) => Buffer.byteLength(callback, "utf8") <= 64)).toBe(true);
    expect(flatInlineButtonTexts(buildItemDetailKeyboard({ state: "not-owned" }))).toEqual([
      "⬅️ До манаток",
      "🛡️ Спорядження"
    ]);
    expect(flatInlineButtonTexts(buildItemDetailKeyboard({ state: "no-character" }))).toEqual([]);
    expect(
      flatInlineButtonTexts(
        buildItemDetailKeyboard({
          state: "found",
          item: {
            id: "character-item-1",
            itemId: "item.pan-of-persuasion",
            quantity: 1,
            content: {
              id: "item.pan-of-persuasion",
              name: "Пательня переконання",
              description: "Важкий аргумент.",
              rarity: "common",
              slot: "weapon",
              goldValue: 25
            }
          }
        })
      )
    ).toEqual(["🧥 Екіпірувати", "⬅️ До манаток", "🛡️ Спорядження"]);
    expect(
      flatInlineButtonTexts(
        buildItemDetailKeyboard(
          {
            state: "found",
            item: {
              id: "character-item-1",
              itemId: "item.pan-of-persuasion",
              quantity: 1,
              content: {
                id: "item.pan-of-persuasion",
                name: "Пательня переконання",
                description: "Важкий аргумент.",
                rarity: "common",
                slot: "weapon",
                goldValue: 25
              }
            }
          },
          null,
          0,
          null,
          { source: "item-upgrade" }
        )
      )
    ).toEqual(["✨ До Чароковальні"]);
    expect(
      flatInlineButtonTexts(
        buildItemDetailKeyboard(
          {
            state: "found",
            item: {
              id: "character-item-1",
              itemId: "item.pan-of-persuasion",
              quantity: 1,
              content: {
                id: "item.pan-of-persuasion",
                name: "Пательня переконання",
                description: "Важкий аргумент.",
                rarity: "common",
                slot: "weapon",
                goldValue: 25
              }
            }
          },
          "weapon"
        )
      )
    ).toEqual(["Зняти", "⬅️ До манаток", "🛡️ Спорядження"]);
    expect(
      flatInlineButtonTexts(
        buildItemDetailKeyboard(
          {
            state: "found",
            item: {
              id: "character-item-1",
              itemId: "item.pan-of-persuasion",
              quantity: 1,
              content: {
                id: "item.pan-of-persuasion",
                name: "Пательня переконання",
                description: "Важкий аргумент.",
                rarity: "common",
                slot: "weapon",
                goldValue: 25
              }
            }
          },
          null,
          0,
          "weapon"
        )
      )
    ).toEqual(["🧥 Екіпірувати", "⬅️ До списку слота", "🛡️ Спорядження"]);
    expect(
      flatInlineButtonCallbacks(
        buildItemDetailKeyboard(
          {
            state: "found",
            item: {
              id: "character-item-1",
              itemId: "item.pan-of-persuasion",
              quantity: 1,
              content: {
                id: "item.pan-of-persuasion",
                name: "Пательня переконання",
                description: "Важкий аргумент.",
                rarity: "common",
                slot: "weapon",
                goldValue: 25
              }
            }
          },
          null,
          0,
          "weapon"
        )
      )
    ).toEqual([
      "v1:equip:item:item.pan-of-persuasion:s:w",
      "v1:item:inventory:s:w",
      "v1:equip:view"
    ]);
    expect(
      flatInlineButtonTexts(
        buildItemDetailKeyboard(
          {
            state: "found",
            item: {
              id: "character-item-1",
              itemId: "item.pan-of-persuasion",
              quantity: 1,
              content: {
                id: "item.pan-of-persuasion",
                name: "Пательня переконання",
                description: "Важкий аргумент.",
                rarity: "common",
                slot: "weapon",
                goldValue: 25
              }
            }
          },
          null,
          0,
          "offhand",
          {
            equipPreview: {
              state: "can-equip",
              item: {
                itemId: "item.pan-of-persuasion",
                content: {
                  id: "item.pan-of-persuasion",
                  name: "Пательня переконання",
                  description: "Важкий аргумент.",
                  rarity: "common",
                  slot: "weapon",
                  goldValue: 25
                }
              },
              slot: "offhand",
              requirements: null,
              currentItem: null
            }
          }
        )
      )
    ).toEqual(["🧥 Екіпірувати в другу руку", "⬅️ До списку слота", "🛡️ Спорядження"]);
    expect(
      flatInlineButtonCallbacks(
        buildItemDetailKeyboard(
          {
            state: "found",
            item: {
              id: "character-item-1",
              itemId: "item.pan-of-persuasion",
              quantity: 1,
              content: {
                id: "item.pan-of-persuasion",
                name: "Пательня переконання",
                description: "Важкий аргумент.",
                rarity: "common",
                slot: "weapon",
                goldValue: 25
              }
            }
          },
          null,
          0,
          "offhand",
          {
            equipPreview: {
              state: "slot-not-allowed",
              item: {
                itemId: "item.pan-of-persuasion",
                content: {
                  id: "item.pan-of-persuasion",
                  name: "Пательня переконання",
                  description: "Важкий аргумент.",
                  rarity: "common",
                  slot: "weapon",
                  goldValue: 25
                }
              },
              slot: "offhand",
              reason: "offhand-restricted"
            }
          }
        )
      )
    ).toEqual(["v1:item:inventory:s:o", "v1:equip:view"]);
    expect(
      flatInlineButtonTexts(
        buildItemDetailKeyboard(
          {
            state: "found",
            item: {
              id: "character-item-bandage",
              itemId: "item.responsible-panic-bandage",
              quantity: 1,
              content: {
                id: "item.responsible-panic-bandage",
                name: "Бинт відповідальної паніки",
                description: "Для відповідальної паніки.",
                rarity: "common",
                tags: ["consumable", "one-use"],
                useEffect: { kind: "heal-hp", amount: 7 },
                goldValue: 3
              }
            }
          },
          null,
          0,
          "one-use"
        )
      )
    ).toEqual(["⬅️ До разових", "🛡️ Спорядження"]);
    expect(
      flatInlineButtonCallbacks(
        buildItemDetailKeyboard(
          {
            state: "found",
            item: {
              id: "character-item-bandage",
              itemId: "item.responsible-panic-bandage",
              quantity: 1,
              content: {
                id: "item.responsible-panic-bandage",
                name: "Бинт відповідальної паніки",
                description: "Для відповідальної паніки.",
                rarity: "common",
                tags: ["consumable", "one-use"],
                useEffect: { kind: "heal-hp", amount: 7 },
                goldValue: 3
              }
            }
          },
          null,
          0,
          "one-use"
        )
      )
    ).toEqual(["v1:item:inventory:f:u", "v1:equip:view"]);
    expect(
      flatInlineButtonTexts(
        buildItemDetailKeyboard(
          {
            state: "found",
            item: {
              id: "character-item-bandage",
              itemId: "item.responsible-panic-bandage",
              quantity: 1,
              content: {
                id: "item.responsible-panic-bandage",
                name: "Бинт відповідальної паніки",
                description: "Для відповідальної паніки.",
                rarity: "common",
                tags: ["consumable", "one-use"],
                useEffect: { kind: "heal-hp", amount: 7 },
                goldValue: 3
              }
            }
          },
          null,
          0,
          null,
          {
            canUse: true,
            combatUse: {
              kind: "fight",
              sessionId: "123e4567-e89b-42d3-a456-426614174321",
              turn: 2,
              itemKey: "item.responsible-panic-bandage"
            }
          }
        )
      )
    ).toEqual(["⚔️ Використати у бою", "⬅️ До манаток", "🛡️ Спорядження"]);
    expect(
      flatInlineButtonTexts(
        buildItemDetailKeyboard(
          {
            state: "found",
            item: {
              id: "character-item-bandage",
              itemId: "item.responsible-panic-bandage",
              quantity: 13,
              content: {
                id: "item.responsible-panic-bandage",
                name: "Бинт відповідальної паніки",
                description: "Для відповідальної паніки.",
                rarity: "common",
                slot: "consumable",
                tags: ["consumable", "one-use"],
                useEffect: { kind: "heal-hp", amount: 7 },
                goldValue: 7
              }
            }
          },
          null,
          0,
          null,
          {
            canUse: true,
            craftOptions: [
              {
                recipe: {
                  id: "dense-bandage",
                  code: "dense",
                  sourceItemId: "item.responsible-panic-bandage",
                  outputItemId: "item.dense-bandage",
                  sourceQuantity: 8,
                  outputQuantity: 1,
                  buttonLabel: "🧵 Створити щільний бинт"
                }
              },
              {
                recipe: {
                  id: "field-kit",
                  code: "kit",
                  sourceItemId: "item.responsible-panic-bandage",
                  outputItemId: "item.field-kit",
                  sourceQuantity: 13,
                  outputQuantity: 1,
                  buttonLabel: "🧰 Створити польову аптечку"
                }
              }
            ]
          }
        )
      )
    ).toEqual([
      "🧵 Створити щільний бинт",
      "🧰 Створити польову аптечку",
      "🩹 Використати",
      "⬅️ До манаток",
      "🛡️ Спорядження"
    ]);
    expect(
      flatInlineButtonTexts(
        buildItemDetailKeyboard(
          {
            state: "found",
            item: {
              id: "character-item-bandage",
              itemId: "item.responsible-panic-bandage",
              quantity: 1,
              content: {
                id: "item.responsible-panic-bandage",
                name: "Бинт відповідальної паніки",
                description: "Для відповідальної паніки.",
                rarity: "common",
                tags: ["consumable", "one-use"],
                useEffect: { kind: "heal-hp", amount: 7 },
                goldValue: 3
              }
            }
          },
          null,
          0,
          null,
          { canUse: false }
        )
      )
    ).toEqual(["⬅️ До манаток", "🛡️ Спорядження"]);
    expect(
      flatInlineButtonTexts(
        buildEquipItemResultKeyboard({
          state: "twohand-confirm-required",
          slot: "weapon",
          item: {
            itemId: "item.test-twohand-broom",
            content: {
              id: "item.test-twohand-broom",
              name: "Дворучна мітла протоколу",
              description: "Мете так переконливо.",
              rarity: "rare",
              slot: "weapon",
              tags: ["twohand"],
              goldValue: 93
            }
          },
          currentItem: null,
          clearedHandItem: {
            itemId: "item.stamp-of-minor-authority",
            content: {
              id: "item.stamp-of-minor-authority",
              name: "Печатка дрібної переваги",
              description: "Б'є не сильно.",
              rarity: "uncommon",
              slot: "weapon",
              goldValue: 16
            }
          }
        })
      )
    ).toEqual(["✅ Так, звільнити руку", "⬅️ До манаток", "🛡️ Спорядження"]);
    expect(
      flatInlineButtonCallbacks(
        buildEquipItemResultKeyboard({
          state: "twohand-confirm-required",
          slot: "weapon",
          item: {
            itemId: "item.test-twohand-broom",
            content: {
              id: "item.test-twohand-broom",
              name: "Дворучна мітла протоколу",
              description: "Мете так переконливо.",
              rarity: "rare",
              slot: "weapon",
              tags: ["twohand"],
              goldValue: 93
            }
          },
          currentItem: null,
          clearedHandItem: {
            itemId: "item.stamp-of-minor-authority",
            content: {
              id: "item.stamp-of-minor-authority",
              name: "Печатка дрібної переваги",
              description: "Б'є не сильно.",
              rarity: "uncommon",
              slot: "weapon",
              goldValue: 16
            }
          }
        })
      )[0]
    ).toBe("v1:equip:item:item.test-twohand-broom:s:w:c:2h");
    expect(
      flatInlineButtonCallbacks(
        buildItemDetailKeyboard(
          {
            state: "found",
            item: {
              id: "character-item-bandage",
              itemId: "item.responsible-panic-bandage",
              quantity: 1,
              content: {
                id: "item.responsible-panic-bandage",
                name: "Бинт відповідальної паніки",
                description: "Для відповідальної паніки.",
                rarity: "common",
                tags: ["consumable", "one-use"],
                useEffect: { kind: "heal-hp", amount: 7 },
                goldValue: 3
              }
            }
          },
          null,
          0,
          null,
          {
            canUse: true,
            combatUse: {
              kind: "fight",
              sessionId: "123e4567-e89b-42d3-a456-426614174321",
              turn: 2,
              itemKey: "item.responsible-panic-bandage"
            }
          }
        )
      )[0]
    ).toBe("v1:fight:item:123e4567-e89b-42d3-a456-426614174321:2:item.responsible-panic-bandage");
    expect(flatInlineButtonTexts(buildEquipmentKeyboard({ state: "no-character" }))).toEqual([]);
    expect(
      inlineButtonRows(
        buildEquipmentKeyboard({
          state: "ready",
          slots: [
            {
              slot: "weapon",
              item: {
                itemId: "item.pan-of-persuasion",
                content: {
                  id: "item.pan-of-persuasion",
                  name: "Пательня переконання",
                  description: "Важкий аргумент.",
                  rarity: "common",
                  slot: "weapon",
                  goldValue: 25
                }
              }
            },
            { slot: "offhand", item: null },
            { slot: "head", item: null },
            { slot: "chest", item: null },
            { slot: "legs", item: null },
            {
              slot: "accessory",
              item: {
                itemId: "item.cork-ring-of-serious-business",
                content: {
                  id: "item.cork-ring-of-serious-business",
                  name: "Корковий перстень серйозних справ",
                  description: "Малий гачок обережно блищить.",
                  rarity: "common",
                  slot: "accessory",
                  goldValue: 6
                }
              }
            }
          ]
        })
      )
    ).toEqual([
      ["🎩 Показати голову"],
      ["🧥 Показати тулуб"],
      ["🥾 Показати ноги"],
      ["💍 Показати аксесуари", "Зняти аксесуар"],
      ["🧰 Показати інструменти"],
      ["🗡️ Показати основну руку", "Зняти з основної руки"],
      ["✋ Показати другу руку"],
      ["⬅️ До манаток"]
    ]);
    expect(
      flatInlineButtonCallbacks(
        buildEquipmentKeyboard({
          state: "ready",
          slots: [
            {
              slot: "weapon",
              item: {
                itemId: "item.pan-of-persuasion",
                content: {
                  id: "item.pan-of-persuasion",
                  name: "Пательня переконання",
                  description: "Важкий аргумент.",
                  rarity: "common",
                  slot: "weapon",
                  goldValue: 25
                }
              }
            },
            { slot: "head", item: null },
            { slot: "chest", item: null },
            { slot: "legs", item: null },
            {
              slot: "accessory",
              item: {
                itemId: "item.cork-ring-of-serious-business",
                content: {
                  id: "item.cork-ring-of-serious-business",
                  name: "Корковий перстень серйозних справ",
                  description: "Малий гачок обережно блищить.",
                  rarity: "common",
                  slot: "accessory",
                  goldValue: 6
                }
              }
            },
            { slot: "tool", item: null }
          ]
        })
      )
    ).toEqual([
      "v1:item:inventory:s:h",
      "v1:item:inventory:s:c",
      "v1:item:inventory:s:l",
      "v1:item:inventory:s:a",
      "v1:equip:clear:accessory",
      "v1:item:inventory:s:t",
      "v1:item:inventory:s:w",
      "v1:equip:clear:weapon",
      "v1:item:inventory:s:o",
      "v1:item:inventory"
    ]);
  });

  it("adds another item-use button only when requested", () => {
    expect(flatInlineButtonTexts(buildItemUseResultKeyboard())).toEqual([
      "⬅️ До манаток",
      "🛡️ Спорядження"
    ]);
    expect(
      flatInlineButtonTexts(buildItemUseResultKeyboard({ repeatItemId: "item.responsible-panic-bandage" }))
    ).toEqual([
      "🩹 Ще один",
      "⬅️ До манаток",
      "🛡️ Спорядження"
    ]);
    expect(
      flatInlineButtonTexts(buildItemUseResultKeyboard({ detailItemId: "item.responsible-panic-bandage" }))
    ).toEqual([
      "🔎 До бинта",
      "⬅️ До манаток",
      "🛡️ Спорядження"
    ]);
    expect(
      flatInlineButtonCallbacks(buildItemUseResultKeyboard({ detailItemId: "item.responsible-panic-bandage" }))
    ).toEqual([
      "v1:item:detail:item.responsible-panic-bandage",
      "v1:item:inventory",
      "v1:equip:view"
    ]);
    expect(
      flatInlineButtonTexts(buildItemUseResultKeyboard({ detailItemId: "item.field-kit" }))
    ).toEqual([
      "🔎 До аптечки",
      "⬅️ До манаток",
      "🛡️ Спорядження"
    ]);
    expect(
      flatInlineButtonTexts(buildItemUseResultKeyboard({
        repeatItemId: "item.responsible-panic-bandage",
        restoreToFullItemId: "item.responsible-panic-bandage"
      }))
    ).toEqual([
      "🩹 Ще один",
      "🧻 До відновлення",
      "⬅️ До манаток",
      "🛡️ Спорядження"
    ]);
    expect(
      flatInlineButtonCallbacks(buildItemUseResultKeyboard({
        repeatItemId: "item.responsible-panic-bandage",
        restoreToFullItemId: "item.responsible-panic-bandage"
      }))
    ).toEqual([
      "v1:use:p:item.responsible-panic-bandage",
      "v1:use:full:item.responsible-panic-bandage",
      "v1:item:inventory",
      "v1:equip:view"
    ]);
  });

  it("adds another craft button only when enough source items remain", () => {
    expect(flatInlineButtonTexts(buildItemCraftResultKeyboard())).toEqual([
      "🔎 До бинта",
      "⬅️ До манаток"
    ]);
    expect(flatInlineButtonTexts(buildItemCraftResultKeyboard({ repeatRecipeCode: "dense" }))).toEqual([
      "✅ Створити ще",
      "🔎 До бинта",
      "⬅️ До манаток"
    ]);
    expect(flatInlineButtonCallbacks(buildItemCraftResultKeyboard({ repeatRecipeCode: "dense" }))).toEqual([
      "v1:craft:ok:dense",
      "v1:item:detail:item.responsible-panic-bandage",
      "v1:item:inventory"
    ]);
    expect(flatInlineButtonCallbacks(buildItemCraftResultKeyboard({ repeatRecipeCode: "kit" }))[0]).toBe(
      "v1:craft:ok:kit"
    );
  });

  it("offers manual Mantok Chest selection and compact item-index callbacks", () => {
    const token = "12345678-1234-4234-9234-123456789abc";

    expect(flatInlineButtonTexts(buildMantokChestOverviewKeyboard())).toEqual([
      "Згодувати 5 найдешевших",
      "Обрати вручну",
      "Що вона робить?",
      "⬅️ До манаток"
    ]);
    expect(flatInlineButtonCallbacks(buildMantokChestOverviewKeyboard())).toEqual([
      "v1:chest:auto",
      "v1:chest:manual",
      "v1:chest:help",
      "v1:chest:inventory"
    ]);

    const keyboard = buildMantokChestManualSelectionKeyboard({
      state: "selection",
      run: {
        id: "run-1",
        characterId: "character-42",
        token,
        status: "pending",
        inputItems: [],
        outputItems: [],
        averageInputScore: 30,
        minimumOutputScore: 31,
        outputScore: null,
        completedAt: null,
        createdAt: new Date("2026-06-15T07:30:00.000Z"),
        updatedAt: new Date("2026-06-15T07:30:00.000Z")
      },
      items: [
        {
          itemId: "item.generated-very-long-loot-id-that-must-not-enter-callback",
          quantity: 2,
          score: 30,
          manualOnly: false,
          index: 12,
          selectedQuantity: 1,
          availableQuantity: 2,
          content: {
            id: "item.generated-very-long-loot-id-that-must-not-enter-callback",
            name: "Довга манатка",
            description: "Тест.",
            rarity: "common",
            slot: "junk"
          }
        }
      ],
      selectedCount: 5,
      requiredCount: 5,
      eligibleCount: 9,
      page: 2,
      pageCount: 3
    });

    expect(flatInlineButtonTexts(keyboard)).toEqual([
      "➖ Довга манатка",
      "✅ До підтвердження",
      "◀️ Назад",
      "3/3",
      "⬅️ Не годувати",
      "⬅️ До манаток"
    ]);
    const callbacks = flatInlineButtonCallbacks(keyboard);
    expect(callbacks).toEqual([
      `v1:chest:rm:${token}:2:12`,
      `v1:chest:preview:${token}`,
      `v1:chest:page:${token}:1`,
      `v1:chest:page:${token}:2`,
      `v1:chest:cancel:${token}`,
      "v1:chest:inventory"
    ]);
    expect(callbacks.every((callback) => Buffer.byteLength(callback, "utf8") <= 64)).toBe(true);
  });

  it("links Iskrokamin item details to Charkokovalnia", () => {
    const keyboard = buildItemDetailKeyboard({
      state: "found",
      item: {
        id: "character-item-iskrokamin",
        itemId: "item.iskrokamin",
        quantity: 1000,
        content: {
          id: "item.iskrokamin",
          name: "Іскрокамінь",
          description: "Малий камінець.",
          rarity: "uncommon",
          slot: "resource",
          priceless: true,
          tags: ["tradeable"]
        }
      }
    });

    expect(flatInlineButtonTexts(keyboard)).toEqual([
      "✨ До Чароковальні",
      "⬅️ До манаток",
      "🛡️ Спорядження"
    ]);
    expect(flatInlineButtonCallbacks(keyboard)).toEqual([
      makeItemUpgradeListCallbackData(),
      "v1:item:inventory",
      "v1:equip:view"
    ]);
  });

  it("links Mantok Chest output directly to item details", () => {
    const keyboard = buildMantokChestResultKeyboard({
      itemId: "item.previous-approval-scale",
      content: {
        name: "Луска попереднього погодження"
      }
    });

    expect(flatInlineButtonTexts(keyboard)).toEqual([
      "🔎 Луска попереднього погодження",
      "♻️ Ще до Скрині",
      "⬅️ До манаток"
    ]);
    expect(flatInlineButtonCallbacks(keyboard)).toEqual([
      "v1:item:detail:item.previous-approval-scale",
      "v1:chest:open",
      "v1:chest:inventory"
    ]);
  });

  it("links kept grownup cellar bottle directly to item details", () => {
    const keyboard = buildCellarGrownupKeyboard("completed", {
      includeKeptBottle: true
    });

    expect(flatInlineButtonTexts(keyboard)).toEqual([
      "🔎 Пляшка Пінного Міражу",
      "📋 До справ",
      "⬅️ До зали"
    ]);
    expect(flatInlineButtonCallbacks(keyboard)).toEqual([
      "v1:item:detail:item.cellar.foamy-mirage-bottle",
      "v1:place:quest-table",
      "v1:place:hall"
    ]);
  });

  it("routes an obtained grownup cellar bottle to the Шинок for turn-in", () => {
    const keyboard = buildCellarGrownupKeyboard("bottle-obtained");

    expect(flatInlineButtonTexts(keyboard)).toEqual([
      "🍻 До шинку",
      "⬅️ До зали"
    ]);
    expect(flatInlineButtonCallbacks(keyboard)).toEqual([
      "v1:place:bar",
      "v1:place:hall"
    ]);
  });

  it("hides grownup cellar mouse roleplay while the roleplay cooldown is active", () => {
    const labels = flatInlineButtonTexts(buildCellarGrownupKeyboard("insufficient", {
      hideRoleplay: true
    }));

    expect(labels).toEqual([
      "🧀 Купити пломбу",
      "🏹 Дошка полювання",
      "⬅️ До зали"
    ]);
    expect(labels).not.toContain("🐭 Домовитись із мишею");
  });

  it("keeps daily Korchma round overview as a location list without scene teleport buttons", () => {
    const keyboard = buildDailyKorchmaRoundOverviewKeyboard({
      state: "ready",
      character,
      offer: {
        dayKey: "2026-06-28",
        dayToken: "20260628",
        lifeToken: 0,
        requiredSteps: 2,
        completedSceneIds: [],
        omittedSceneId: null,
        scenes: [
          {
            id: "scene.cellar.inventory-bottle",
            icon: "🍾",
            title: "Пляшка шепоче інвентаризацію",
            locationId: "location.korchma.cellar",
            hook: "У льосі пляшка шепоче номери.",
            actions: []
          },
          {
            id: "scene.yard.rope",
            icon: "🪢",
            title: "Мотузка завʼязала питання",
            locationId: "location.korchma.yard",
            hook: "У задвірку мотузка має думку.",
            actions: []
          }
        ]
      }
    });

    expect(flatInlineButtonTexts(keyboard)).toEqual(["📋 До справ", "🍺 До зали"]);
    expect(flatInlineButtonCallbacks(keyboard)).toEqual(["v1:place:quest-table", "v1:place:hall"]);
    expect(flatInlineButtonCallbacks(keyboard).some((callback) => callback.startsWith("v1:dkr:s:"))).toBe(false);
  });

  it("requires an explicit daily Korchma round start before issuing today's route", () => {
    const keyboard = buildDailyKorchmaRoundOverviewKeyboard({
      state: "not-issued",
      character,
      dayToken: "20260628"
    });

    expect(flatInlineButtonTexts(keyboard)).toEqual(["🧾 Берусь за обхід", "🍺 Пізніше"]);
    expect(flatInlineButtonCallbacks(keyboard)).toEqual(["v1:dkr:b:20260628", "v1:place:quest-table"]);
  });

  it("routes daily Korchma round turn-in-ready overview back to the quest table before claiming", () => {
    const keyboard = buildDailyKorchmaRoundOverviewKeyboard({
      state: "turn-in-ready",
      character,
      offer: {
        dayKey: "2026-06-28",
        dayToken: "20260628",
        lifeToken: 0,
        requiredSteps: 2,
        completedSceneIds: ["scene.cellar.inventory-bottle", "scene.yeger.map-sneeze"],
        omittedSceneId: "scene.yard.rope",
        scenes: [
          {
            id: "scene.cellar.inventory-bottle",
            icon: "🍾",
            title: "Пляшка шепоче інвентаризацію",
            locationId: "location.korchma.cellar",
            hook: "У льосі пляшка шепоче номери.",
            actions: []
          },
          {
            id: "scene.yeger.map-sneeze",
            icon: "🗺️",
            title: "Мапа чхнула не в той бік",
            locationId: "location.korchma.yeger-corner",
            hook: "У єгерському кутку мапа має думку.",
            actions: []
          },
          {
            id: "scene.yard.rope",
            icon: "🪢",
            title: "Мотузка зав’язала питання",
            locationId: "location.korchma.yard",
            hook: "У задвірку мотузка має думку.",
            actions: []
          }
        ]
      }
    });

    expect(flatInlineButtonTexts(keyboard)).toEqual(["📋 До Столу зі справами", "🍺 До зали"]);
    expect(flatInlineButtonCallbacks(keyboard)).toEqual(["v1:place:quest-table", "v1:place:hall"]);
    expect(flatInlineButtonCallbacks(keyboard).some((callback) => callback.startsWith("v1:dkr:c:"))).toBe(false);
  });

  it("routes stale daily Korchma round scene callbacks to the current overview", () => {
    const keyboard = buildDailyKorchmaRoundSceneKeyboard({
      state: "stale-day",
      current: {
        state: "ready",
        character,
        offer: {
          dayKey: "2026-06-29",
          dayToken: "20260629",
          lifeToken: 0,
          requiredSteps: 2,
          completedSceneIds: [],
          omittedSceneId: null,
          scenes: []
        }
      }
    });

    expect(flatInlineButtonTexts(keyboard)).toEqual(["🧾 До обходу"]);
    expect(flatInlineButtonCallbacks(keyboard)).toEqual(["v1:dkr:o:20260629"]);
  });

  it("adds help and back buttons for daily Korchma round scenes with action descriptions", () => {
    const sceneResult = {
      state: "scene",
      character,
      offer: {
        dayKey: "2026-06-28",
        dayToken: "20260628",
        lifeToken: 7,
        requiredSteps: 2,
        completedSceneIds: [],
        omittedSceneId: null,
        scenes: []
      },
      scene: {
        id: "scene.hall.stool",
        icon: "🪑",
        title: "Табурет оголосив перерву",
        locationId: "location.korchma.hall",
        hook: "Серед зали табурет стоїть набік.",
        actions: [
          {
            id: "offer-cushion",
            label: "🧺 Запропонувати подушку",
            description: "Мʼяка дипломатія без героїчного ремонту.",
            outcome: "Подушка допомогла."
          }
        ]
      },
      sceneIndex: 1,
      alreadyCompleted: false,
      locked: false
    } as const;

    expect(flatInlineButtonTexts(buildDailyKorchmaRoundSceneKeyboard(sceneResult))).toEqual([
      "🧺 Запропонувати подушку",
      "💡 Підказка",
      "🧾 До обходу",
      "🍺 До зали"
    ]);
    expect(flatInlineButtonCallbacks(buildDailyKorchmaRoundSceneKeyboard(sceneResult))).toEqual([
      "v1:dkr:a:20260628:1:offer-cushion:7",
      "v1:dkr:h:20260628:1",
      "v1:dkr:o:20260628",
      "v1:place:hall"
    ]);

    expect(flatInlineButtonTexts(buildDailyKorchmaRoundSceneKeyboard(sceneResult, { mode: "help" }))).toEqual([
      "🧺 Запропонувати подушку",
      "⬅️ Назад",
      "🧾 До обходу",
      "🍺 До зали"
    ]);
    expect(flatInlineButtonCallbacks(buildDailyKorchmaRoundSceneKeyboard(sceneResult, { mode: "help" }))).toEqual([
      "v1:dkr:a:20260628:1:offer-cushion:7",
      "v1:dkr:s:20260628:1",
      "v1:dkr:o:20260628",
      "v1:place:hall"
    ]);
  });

  it("adds help and back buttons for every shipped daily Korchma round scene", () => {
    for (const [sceneIndex, scene] of dailyKorchmaRoundScenes.entries()) {
      const sceneResult = {
        state: "scene",
        character,
        offer: {
          dayKey: "2026-06-28",
          dayToken: "20260628",
          lifeToken: 7,
          requiredSteps: 2,
          completedSceneIds: [],
          omittedSceneId: null,
          scenes: dailyKorchmaRoundScenes
        },
        scene,
        sceneIndex,
        alreadyCompleted: false,
        locked: false
      } as const;

      expect(flatInlineButtonTexts(buildDailyKorchmaRoundSceneKeyboard(sceneResult))).toContain("💡 Підказка");
      expect(flatInlineButtonTexts(buildDailyKorchmaRoundSceneKeyboard(sceneResult, { mode: "help" }))).toContain(
        "⬅️ Назад"
      );
    }
  });

  it("routes a daily Korchma round wrong-location step to the required scene place", () => {
    const keyboard = buildDailyKorchmaRoundStepKeyboard({
      state: "wrong-location",
      character,
      currentLocationName: "Зала корчми",
      scene: {
        id: "scene.yard.rope",
        icon: "🪢",
        title: "Мотузка зав’язала питання",
        locationId: "location.korchma.yard",
        hook: "У задвірку мотузка має думку.",
        actions: []
      },
      offer: {
        dayKey: "2026-06-28",
        dayToken: "20260628",
        lifeToken: 0,
        requiredSteps: 2,
        completedSceneIds: [],
        omittedSceneId: null,
        scenes: []
      }
    });

    expect(flatInlineButtonTexts(keyboard)).toEqual(["📍 До місцини", "🧾 До обходу"]);
    expect(flatInlineButtonCallbacks(keyboard)).toEqual(["v1:place:yard", "v1:dkr:o:20260628"]);
  });

  it("builds quest hub buttons from available actions", () => {
    const fullHubKeyboard = buildQuestHubKeyboard({
      adventure: { state: "ready", character },
      fight: { state: "ready", character },
      yeger: { state: "offered", character, progress: { wins: 0, target: 5 } },
      cellar: { state: "ready", character }
    });

    expect(
      flatInlineButtonTexts(
        fullHubKeyboard
      )
    ).toEqual([
      "🪧 Обрати пригоду ⚠️",
      "⚔️ До сутички",
      "🏹 До Єгеря ⚠️",
      "🧹 У льох ⚠️",
      "📦 Архів",
      "📖 Бестіарій",
      "🍺 До зали ⚠️"
    ]);
    expect(inlineButtonRows(fullHubKeyboard)).toContainEqual(["📦 Архів", "📖 Бестіарій"]);
    expect(flatInlineButtonTexts(buildEnterKorchmaKeyboard())).toContain("🚪 Зайти в корчму");
    expect(flatInlineButtonTexts(buildKorchmaHallKeyboard())).toContain("📋 Стіл зі справами");

    const level13HubKeyboard = buildQuestHubKeyboard({
      adventure: { state: "level-retired", character, maxLevel: 2 },
      fight: {
        state: "persistent-ready",
        character,
        questProgress: {
          stageId: "13",
          title: "Тринадцять дрібних проблем",
          wins: 13,
          target: 13,
          completed: true,
          rewardClaimed: true,
          issued: true,
          branchComplete: false
        }
      },
      yeger: {
        state: "completed",
        character,
        progress: { wins: 5, target: 5 },
        reward: { xp: 80, gold: 120, itemGrants: [] }
      },
      cellar: { state: "level-retired", character, maxLevel: 3, completed: false },
      characterLevel: 13
    });

    expect(flatInlineButtonTexts(level13HubKeyboard)).toEqual([
      "🕯️ Реморт",
      "🍻 До шинку ⚠️",
      "🪜 До Низу",
      "🧹 У льох",
      "📦 Архів",
      "📖 Бестіарій",
      "🍺 До зали ⚠️"
    ]);
    expect(flatInlineButtonCallbacks(level13HubKeyboard)).toContain("v1:rm:open");

    expect(
      flatInlineButtonTexts(
        buildQuestHubKeyboard({
          adventure: {
            state: "level-retired",
            character,
            maxLevel: 2
          },
          fight: {
            state: "persistent-ready",
            character,
            questProgress: {
              stageId: "13",
              title: "Тринадцять дрібних проблем",
              wins: 0,
              target: 13,
              completed: false,
              rewardClaimed: false,
              issued: true,
              branchComplete: false
            }
          },
          yeger: {
            state: "completed",
            character,
            progress: { wins: 5, target: 5 },
            reward: { xp: 80, gold: 120, itemGrants: [] }
          },
          cellar: { state: "level-retired", character, maxLevel: 3, completed: false }
        })
      )
    ).toEqual([
      "🪜 До Низу",
      "🧹 У льох",
      "📦 Архів",
      "📖 Бестіарій",
      "🍺 До зали"
    ]);

    expect(
      flatInlineButtonTexts(
        buildQuestHubKeyboard({
          adventure: {
            state: "level-retired",
            character,
            maxLevel: 2
          },
          fight: {
            state: "persistent-active",
            character,
            session: persistentFightSession(),
            monster: {
              id: "monster.test",
              name: "Проблема з тестами",
              description: "Стоїть, чекає.",
              level: 3,
              tags: []
            },
            questProgress: {
              stageId: "13",
              title: "Тринадцять дрібних проблем",
              wins: 4,
              target: 13,
              completed: false,
              rewardClaimed: false,
              issued: true,
              branchComplete: false
            }
          },
          yeger: {
            state: "completed",
            character,
            progress: { wins: 5, target: 5 },
            reward: { xp: 80, gold: 120, itemGrants: [] }
          },
          cellar: { state: "level-retired", character, maxLevel: 3, completed: false }
        })
      )
    ).toEqual([
      "🪜 До Низу",
      "🧹 У льох",
      "📦 Архів",
      "📖 Бестіарій",
      "🍺 До зали"
    ]);

    expect(
      flatInlineButtonTexts(
        buildQuestHubKeyboard({
          adventure: {
            state: "already-completed",
            character,
            fightAvailable: false
          },
          fight: {
            state: "already-completed",
            character,
            questAvailable: false
          },
          yeger: {
            state: "completed",
            character,
            progress: { wins: 5, target: 5 },
            reward: { xp: 80, gold: 120, itemGrants: [] }
          },
          cellar: { state: "ready", character }
        })
      )
    ).toEqual([
      "🧹 У льох ⚠️",
      "📦 Архів",
      "📖 Бестіарій",
      "🍺 До зали ⚠️"
    ]);

    expect(
      flatInlineButtonTexts(
        buildQuestHubKeyboard({
          adventure: {
            state: "level-retired",
            character,
            maxLevel: 2
          },
          fight: {
            state: "level-retired",
            character,
            maxLevel: 2
          },
          yeger: { state: "offered", character, progress: { wins: 0, target: 5 } },
          cellar: {
            state: "level-retired",
            character,
            maxLevel: 3,
            completed: false
          }
        })
      )
    ).toEqual([
      "🏹 До Єгеря ⚠️",
      "🧹 У льох",
      "📦 Архів",
      "📖 Бестіарій",
      "🍺 До зали ⚠️"
    ]);

    expect(
      flatInlineButtonTexts(
        buildQuestHubKeyboard({
          adventure: {
            state: "level-retired",
            character,
            maxLevel: 2
          },
          fight: {
            state: "level-retired",
            character,
            maxLevel: 2
          },
          yeger: {
            state: "completed",
            character,
            progress: { wins: 5, target: 5 },
            reward: { xp: 80, gold: 120, itemGrants: [] }
          },
          cellar: {
            state: "level-retired",
            character,
            maxLevel: 3,
            completed: false
          }
        })
      )
    ).toEqual([
      "🧹 У льох",
      "📦 Архів",
      "📖 Бестіарій",
      "🍺 До зали"
    ]);

    expect(
      flatInlineButtonTexts(
        buildQuestHubKeyboard({
          mode: "archive",
          adventure: {
            state: "level-retired",
            character,
            maxLevel: 2
          },
          fight: {
            state: "level-retired",
            character,
            maxLevel: 2
          },
          yeger: {
            state: "completed",
            character,
            progress: { wins: 5, target: 5 },
            reward: { xp: 80, gold: 120, itemGrants: [] }
          },
          cellar: {
            state: "level-retired",
            character,
            maxLevel: 3,
            completed: false
          }
        })
      )
    ).toEqual(["📋 До справ", "📖 Бестіарій", "🍺 До зали"]);
  });
});

const character = {
  name: "Мандрівник",
  pronoun: "they",
  pronounLabel: "Вони",
  path: "boundary",
  raceId: "race.human-ish",
  raceName: "Людисько",
  classId: "class.warrior",
  className: "Воїн",
  title: "Пересічні Пригодники",
  level: 1,
  xp: 0,
  nextLevelXp: 10,
  xpToNextLevel: 10,
  gold: 0,
  hpCurrent: 20,
  hpMax: 20,
  manaCurrent: 10,
  manaMax: 10,
  stats: {
    strength: 8,
    dexterity: 6,
    intelligence: 6,
    charisma: 6,
    luck: 6
  },
  levelBonus: {
    hpMax: 0,
    manaMax: 0,
    primaryStat: {
      stat: "strength",
      bonus: 0
    }
  }
} as const;

const huntContract = {
  localPeriodId: "2026-06-14T08",
  contractToken: "abc1234",
  monster: {
    id: "monster.stamp-doorkeeper-skeleton",
    name: "Скелет-вахтер печаток",
    description: "Не пускає навіть смерть без пропуску.",
    level: 2,
    tags: ["undead"]
  },
  startFlavor: null
} as const;

const emptyRoundLeaderboard = {
  day: [],
  week: [],
  month: []
};

function readyHunt() {
  return {
    state: "ready",
    character,
    contract: huntContract
  } as const;
}

function persistentFightSession(): SoloCombatSessionRecord {
  return {
    id: "123e4567-e89b-12d3-a456-426614174000",
    characterId: "character-42",
    monsterId: "monster.test",
    status: "active",
    turn: 4,
    state: {
      id: "123e4567-e89b-12d3-a456-426614174000",
      turn: 4,
      status: "active",
      hero: {
        hp: 20,
        hpMax: 20,
        mana: 10,
        manaMax: 10
      },
      monster: {
        id: "monster.test",
        hp: 8,
        hpMax: 18
      }
    },
    reward: null,
    createdAt: new Date("2026-06-12T10:30:00.000Z"),
    updatedAt: new Date("2026-06-12T10:30:00.000Z"),
    expiresAt: new Date("2026-06-12T11:00:00.000Z")
  };
}

function turnBasedDuelKeyboardResult(
  overrides: {
    session?: {
      actingCharacterId?: string;
      status?: "active" | "resolved";
      turn?: number;
      version?: number;
      state?: {
        pendingActions?: Record<string, unknown>;
        participants?: {
          challenger?: ReturnType<typeof turnBasedParticipant>;
          target?: ReturnType<typeof turnBasedParticipant>;
        };
      };
    };
  } = {}
) {
  return {
    challenge: { inviteToken: "abcDEF12" },
    session: {
      actingCharacterId: overrides.session?.actingCharacterId ?? "character-1",
      status: overrides.session?.status ?? "active",
      turn: overrides.session?.turn ?? 2,
      version: overrides.session?.version ?? 4,
      state: {
        pendingActions: overrides.session?.state?.pendingActions,
        participants: {
          challenger: overrides.session?.state?.participants?.challenger ?? turnBasedParticipant("character-1"),
          target: overrides.session?.state?.participants?.target ?? turnBasedParticipant("character-2")
        }
      }
    }
  } as never;
}

function turnBasedParticipant(
  characterId: string,
  overrides: {
    mana?: number;
    equipmentAbilityGrantIds?: string[];
    cooldowns?: {
      skill?: { id: string; remainingTurns: number };
      abilities?: Record<string, { id: string; remainingTurns: number }>;
    };
  } = {}
) {
  return {
    characterId,
    raceId: "race.human-ish",
    classId: "class.warrior",
    hp: 20,
    hpMax: 24,
    mana: overrides.mana ?? 10,
    manaMax: 10,
    equipmentAbilityGrantIds: overrides.equipmentAbilityGrantIds,
    cooldowns: overrides.cooldowns,
    combatStats: {
      level: 3,
      hpMax: 24,
      manaMax: 10,
      classId: "class.warrior",
      raceId: "race.human-ish",
      strength: 8,
      dexterity: 6,
      intelligence: 6,
      charisma: 6,
      luck: 6
    }
  };
}

function flatInlineButtonTexts(keyboard: { inline_keyboard: { text: string }[][] }): string[] {
  return keyboard.inline_keyboard.flat().map((button) => button.text);
}

function inlineButtonRows(keyboard: { inline_keyboard: { text: string }[][] }): string[][] {
  return keyboard.inline_keyboard.map((row) => row.map((button) => button.text));
}

function flatInlineButtonCallbacks(
  keyboard: { inline_keyboard: { callback_data?: string }[][] }
): string[] {
  return keyboard.inline_keyboard.flat().map((button) => button.callback_data ?? "");
}

function replyKeyboardTexts(keyboard: unknown): string[][] {
  const rows = keyboard as Array<Array<{ text: string }>>;

  return rows.map((row) => row.map((button) => button.text));
}
