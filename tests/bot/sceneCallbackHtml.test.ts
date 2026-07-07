import { afterEach, describe, expect, it, vi } from "vitest";
import { createBot, type BotServices } from "../../src/bot/createBot";
import {
  clearMessageFreshnessTracking,
  rememberLatestMessageForChat
} from "../../src/bot/messageFreshness";
import { toQuestCallbackKey } from "../../src/content/questResolution";
import {
  makeAdventureApproachCallbackData,
  makeAdventureProblemHelpCallbackData,
  makeMimicShawarmaBackCallbackData,
  makeMimicShawarmaMethodCallbackData,
  makeMimicShawarmaHelpCallbackData,
  makeAdventureProblemCallbackData
} from "../../src/bot/callbacks/adventureCallbackData";
import {
  makeCellarCallbackData,
  makeCellarMethodBackCallbackData,
  makeCellarMethodHelpCallbackData,
  makeCellarMethodCallbackData
} from "../../src/bot/callbacks/cellarCallbackData";
import {
  makeFightCallbackData,
  makeFightGearActionCallbackData,
  makeFightItemUseCallbackData,
  makeFightJournalCallbackData,
  makeFightTurnCallbackData,
  makeFightViewCallbackData
} from "../../src/bot/callbacks/fightCallbackData";
import { makeTrainingDoppelgangerTurnCallbackData } from "../../src/bot/callbacks/trainingDoppelgangerCallbackData";
import {
  makeEquipItemCallbackData,
  makeInventoryCallbackData,
  makeInventoryPagePromptCallbackData
} from "../../src/bot/callbacks/itemCallbackData";
import { makeItemUsePreviewCallbackData } from "../../src/bot/callbacks/itemUseCallbackData";
import {
  makeLevelBarterAutoCallbackData,
  makeLevelBarterOpenCallbackData
} from "../../src/bot/callbacks/levelBarterCallbackData";
import { makeLatestEventsListCallbackData } from "../../src/bot/callbacks/latestEventsCallbackData";
import { makeConfirmCallbackData } from "../../src/bot/callbacks/onboardingCallbackData";
import { makePlaceCallbackData } from "../../src/bot/callbacks/placeCallbackData";
import { makeQuestCallbackData } from "../../src/bot/callbacks/questCallbackData";
import {
  makeRemortConfirmCallbackData,
  makeRemortOpenCallbackData
} from "../../src/bot/callbacks/remortCallbackData";
import {
  makeShynokBarrelRoundPreviewCallbackData,
  makeShynokDicePokerRollCallbackData,
  makeShynokDrinkConfirmCallbackData,
  makeShynokDoppelgangerModeCallbackData,
  makeShynokGameJoinCallbackData,
  makeShynokKostiDecisionCallbackData,
  makeShynokRoundConfirmCallbackData
} from "../../src/bot/callbacks/shynokCallbackData";
import { makeTavernCallbackData } from "../../src/bot/callbacks/tavernCallbackData";
import {
  makeYegerBandagesCallbackData,
  makeYegerOpenCallbackData,
  makeYegerTrackCallbackData,
  makeYegerTurnInCallbackData
} from "../../src/bot/callbacks/yegerCallbackData";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";
import { ITEM_CRAFT_RECIPES } from "../../src/domain/itemCraft";
import { getCombatItemUseKey } from "../../src/services/combatItemUse";
import { PRESENCE_LOCATION_KORCHMA_QUEST_TABLE } from "../../src/services/presenceService";
import { TRAINING_DOPPELGANGER_MONSTER_ID } from "../../src/domain/trainingDoppelganger";
import { startQuickDicePoker } from "../../src/domain/dicePoker";
import { mainMenuButtons, mainMenuLocationButtons } from "../../src/bot/keyboards/mainMenuKeyboard";
import { presentInventoryPagePrompt } from "../../src/bot/inventoryPagePrompt";

type MarkPresenceInput = Parameters<NonNullable<BotServices["presence"]>["markAction"]>[0];
type RecordPersistentFightMessageReferenceMock = (
  telegramUserId: bigint,
  sessionId: string,
  reference: { chatId: string; messageId: number }
) => Promise<void>;

describe("scene callback HTML options", () => {
  afterEach(() => {
    vi.useRealTimers();
    clearMessageFreshnessTracking();
    vi.restoreAllMocks();
  });

  it.each([
    {
      name: "tavern raid",
      callbackData: makeTavernCallbackData("raid"),
      services: servicesWith({
        tavern: {
          advanceFridayBarrelRaid: () => Promise.resolve({
            state: "already-completed",
            character,
            reward: {
              xp: 7,
              gold: 5,
              localDate: "12026-06-12",
              itemGrants: []
            },
            levelChange: null
          })
        }
      })
    },
    {
      name: "adventure",
      callbackData: makeAdventureApproachCallbackData({
        periodToken: "period93",
        problemId: "stew",
        methodId: adventureApproach.id
      }),
      services: servicesWith({
        adventure: {
          completeAdventureApproach: () => Promise.resolve({
            state: "completed",
            character,
            choice: adventureChoice,
            approach: adventureApproach,
            reward: {
              xp: 7,
              gold: 4,
              localDate: "12026-06-12",
              itemGrants: []
            },
            levelChange: noLevelChange,
            complication: false
          })
        }
      })
    },
    {
      name: "cellar errand",
      callbackData: makeCellarCallbackData("cheese-trap"),
      services: servicesWith({
        cellarErrand: {
          getForTelegramUser: () => Promise.resolve({ state: "ready", character }),
          complete: () =>
            Promise.resolve({
              state: "completed",
              action: "cheese-trap",
              character,
              reward: {
                xp: 2,
                gold: 1,
                itemGrants: []
              },
              availableAt: new Date("2026-06-13T10:03:00.000Z"),
              now: new Date("2026-06-13T10:00:00.000Z"),
              levelChange: noLevelChange
            })
        }
      })
    },
    {
      name: "fight",
      callbackData: makeFightCallbackData("attack"),
      services: servicesWith({
        fight: {
          completeMimicShawarma: () => Promise.resolve({
            state: "completed",
            action: "attack",
            character,
            combat: {
              action: "attack",
              playerDamage: 5,
              enemyDamage: 2,
              playerHpPreview: 18,
              playerHpMaxPreview: 20,
              enemyHpPreview: 9,
              enemyHpMaxPreview: 14
            },
            reward: {
              xp: 9,
              gold: 3,
              localDate: "12026-06-12",
              itemGrants: [{ name: "Підозрілий лавашний доказ", quantity: 1 }]
            },
            levelChange: noLevelChange,
            achievementUnlocks: []
          })
        }
      })
    },
    {
      name: "problem quest turn-in",
      callbackData: makeQuestCallbackData("problem"),
      services: servicesWith({
        presence: {
          markAction: () => Promise.resolve(),
          getRaidParticipantsForTelegramUser: () =>
            Promise.resolve({ state: "no-character" }),
          getAdventureParticipantsForTelegramUser: () =>
            Promise.resolve({ state: "no-character" }),
          getCurrentPlaceForTelegramUser: () =>
            Promise.resolve({
              state: "ready",
              locationId: "location.korchma.bar",
              locationName: "Шинок",
              insideKorchma: true
            }),
          getOnlineForTelegramUser: () => Promise.resolve({ state: "no-character" }),
          getLookForTelegramUser: () => Promise.resolve({ state: "no-character" })
        },
        fight: {
          turnInProblemQuestForTelegramUser: () =>
            Promise.resolve({
              state: "turned-in",
              character,
              progress: {
                stageId: "23",
                title: "Двадцять три підозрілі проблеми",
                wins: 0,
                target: 23,
                completed: false,
                rewardClaimed: false,
                issued: true,
                branchComplete: false
              },
              result: {
                state: "claimed",
                stage: {
                  id: "13",
                  title: "Тринадцять дрібних проблем",
                  target: 13,
                  reward: {
                    xp: 35,
                    gold: 10,
                    itemId: "item.badge-of-thirteen-small-problems"
                  },
                  issueKey: "quest.problem-chain.13.issued",
                  rewardKey: "quest.thirteen-small-problems",
                  nextStageId: "23"
                },
                reward: {
                  xp: 35,
                  gold: 10,
                  localDate: "once",
                  itemGrants: [
                    {
                      itemId: "item.badge-of-thirteen-small-problems",
                      name: "Жетон тринадцяти дрібних проблем",
                      quantity: 1
                    }
                  ]
                },
                levelChange: noLevelChange,
                nextStage: {
                  id: "23",
                  title: "Двадцять три підозрілі проблеми",
                  target: 23,
                  reward: {
                    xp: 55,
                    gold: 18,
                    itemId: "item.apophenia-receipt-of-twenty-three"
                  },
                  issueKey: "quest.problem-chain.23.issued",
                  rewardKey: "quest.problem-chain.23.reward",
                  nextStageId: "42"
                },
                nextStageAvailable: true,
                branchComplete: false,
                achievementUnlocks: []
              }
            })
        }
      })
    }
  ])("edits $name callback results with Telegram HTML parse mode", async ({ callbackData, services }) => {
    const calls = await captureApiCalls(callbackData, services);
    const edit = calls.find((call) => call.method === "editMessageText");

    expect(edit?.payload).toMatchObject({
      parse_mode: "HTML"
    });
    expect(String(edit?.payload.text)).toMatch(/<b>|<i>/);
  });

  it("marks Barrel tutorial raid progress before building the raid result quest markers", async () => {
    const markBarrelRaidCompletedForTelegramUser = vi.fn(() => Promise.resolve());
    const getBarrelBeerTutorial = vi.fn(() =>
      Promise.resolve({
        state: "in-progress" as const,
        character,
        progress: barrelBeerTutorialProgress(true, "location.korchma.barrel")
      })
    );

    await captureApiCalls(
      makeTavernCallbackData("raid"),
      servicesWith({
        tavern: {
          advanceFridayBarrelRaid: () =>
            Promise.resolve({
              state: "completed" as const,
              character: { ...character, level: 2 },
              reward: {
                xp: 7,
                gold: 5,
                localDate: "12026-06-12",
                itemGrants: []
              },
              levelChange: noLevelChange
            })
        },
        fight: questMarkerFightService(),
        yeger: questMarkerYegerService(),
        barrelBeerTutorial: {
          markVisitedBarrelForTelegramUser: () => Promise.resolve(),
          markBarrelRaidCompletedForTelegramUser,
          getForTelegramUser: getBarrelBeerTutorial
        }
      })
    );

    expect(markBarrelRaidCompletedForTelegramUser).toHaveBeenCalledWith(42n);
    expect(getBarrelBeerTutorial).toHaveBeenCalled();
    const markOrder = markBarrelRaidCompletedForTelegramUser.mock.invocationCallOrder[0] ?? 0;
    const markerSnapshotOrder = getBarrelBeerTutorial.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY;
    expect(markOrder).toBeLessThan(markerSnapshotOrder);
  });

  it("routes starter authored method callbacks to the mimic-shawarma completion path", async () => {
    const completeMimicShawarma = vi.fn(() =>
      Promise.resolve({
        state: "completed" as const,
        action: "inspect-folds" as const,
        method: {
          ...adventureApproach,
          id: "inspect-folds" as const,
          label: "🔎 Перевірити складки лаваша"
        },
        grade: "success" as const,
        outcome: {
          headline: "🌯 Шаурма дала свідчення",
          body: ["Складки перестали дихати так, ніби мають адвоката."]
        },
        spentGold: 0,
        character,
        reward: {
          xp: 7,
          gold: 4,
          localDate: "12026-06-20",
          itemGrants: []
        },
        levelChange: noLevelChange
      })
    );
    const completeAdventureApproach = vi.fn(() =>
      Promise.reject(new Error("starter method must not hit adventure choice completion"))
    );
    const calls = await captureApiCalls(
      makeMimicShawarmaMethodCallbackData("inspect-folds"),
      servicesWith({
        adventure: {
          completeMimicShawarma,
          completeAdventureApproach
        }
      })
    );
    const edit = calls.find((call) => call.method === "editMessageText");

    expect(completeMimicShawarma).toHaveBeenCalledWith(42n, {
      type: "method",
      methodId: "inspect-folds"
    });
    expect(completeAdventureApproach).not.toHaveBeenCalled();
    expect(String(edit?.payload.text)).toContain("Шаурма дала свідчення");
    expect(String(edit?.payload.text)).toContain("<i>Метод:</i> 🔎 Перевірити складки лаваша");
  });

  it("routes selected-problem authored method callbacks to adventure choice completion", async () => {
    const completeAdventureApproach = vi.fn(() =>
      Promise.resolve({
        state: "completed" as const,
        character,
        choice: adventureChoice,
        approach: adventureApproach,
        reward: {
          xp: 7,
          gold: 4,
          localDate: "12026-06-20",
          itemGrants: []
        },
        levelChange: noLevelChange,
        complication: false,
        grade: "success" as const,
        consequence: "full-reward" as const,
        outcome: {
          headline: "✅ Справу закрито",
          body: ["Казанок стишився."]
        },
        spentGold: 0,
        hpLoss: null,
        fightHandoff: false,
        fightEncounter: null,
        claim: {
          key: "adventure.choice",
          localDate: "12026-06-20",
        },
        check: {
          roll: 13,
          target: 45,
          total: 13,
          statBonus: 0,
          grade: "success"
        }
      })
    );
    const completeMimicShawarma = vi.fn(() =>
      Promise.reject(new Error("adventure choice method must not hit starter completion"))
    );
    const calls = await captureApiCalls(
      makeAdventureApproachCallbackData({
        periodToken: "period93",
        problemId: "stew",
        methodId: adventureApproach.id
      }),
      servicesWith({
        adventure: {
          completeAdventureApproach,
          completeMimicShawarma
        }
      })
    );
    const edit = calls.find((call) => call.method === "editMessageText");

    expect(completeAdventureApproach).toHaveBeenCalledWith(
      42n,
      expect.objectContaining({
        type: "approach",
        periodToken: "period93",
        problemId: "stew",
        methodId: adventureApproach.id
      })
    );
    expect(completeMimicShawarma).not.toHaveBeenCalled();
    expect(String(edit?.payload.text)).toContain("Казанок стишився");
    expect(String(edit?.payload.text)).toContain("<i>Метод:</i> 🎵 Продиригувати юшкою");
  });

  it("routes duplicate v2 adventure method taps through the bot without a second completion card", async () => {
    const completeAdventureApproach = vi
      .fn()
      .mockResolvedValueOnce({
        state: "completed" as const,
        character,
        choice: adventureChoice,
        approach: adventureApproach,
        reward: {
          xp: 7,
          gold: 4,
          localDate: "12026-06-20",
          itemGrants: []
        },
        levelChange: noLevelChange,
        complication: false,
        grade: "success" as const,
        consequence: "full-reward" as const,
        outcome: {
          headline: "✅ Справу закрито",
          body: ["Казанок стишився."]
        },
        spentGold: 0,
        hpLoss: null,
        fightHandoff: false,
        fightEncounter: null,
        claim: {
          key: "adventure.choice",
          localDate: "12026-06-20"
        },
        check: {
          roll: 13,
          target: 45,
          total: 13,
          statBonus: 0,
          grade: "success"
        }
      })
      .mockResolvedValueOnce({
        state: "already-completed" as const,
        character
      });
    const callbackData = makeAdventureApproachCallbackData({
      periodToken: "period93",
      problemId: "stew",
      methodId: adventureApproach.id
    });
    const calls = await captureRepeatedApiCalls(
      [callbackData, callbackData],
      servicesWith({
        adventure: {
          completeAdventureApproach
        }
      })
    );
    const edits = calls.filter((call) => call.method === "editMessageText");

    expect(completeAdventureApproach).toHaveBeenCalledTimes(2);
    expect(completeAdventureApproach).toHaveBeenNthCalledWith(
      1,
      42n,
      expect.objectContaining({
        type: "approach",
        periodToken: "period93",
        problemId: "stew",
        methodId: adventureApproach.id
      })
    );
    expect(completeAdventureApproach).toHaveBeenNthCalledWith(
      2,
      42n,
      expect.objectContaining({
        type: "approach",
        periodToken: "period93",
        problemId: "stew",
        methodId: adventureApproach.id
      })
    );
    expect(String(edits[0]?.payload.text)).toContain("Казанок стишився");
    expect(String(edits[0]?.payload.text)).toContain("XP");
    expect(String(edits[1]?.payload.text)).toContain("/hero");
    expect(String(edits[1]?.payload.text)).not.toContain("Казанок стишився");
  });

  it("routes duplicate v2 paid cellar method taps through cooldown after the first result", async () => {
    const complete = vi
      .fn()
      .mockResolvedValueOnce({
        state: "completed" as const,
        action: "bribe-cheese",
        method: {
          id: "bribe-cheese",
          callbackKey: toQuestCallbackKey("bribe-cheese"),
          label: "🪙 Дати миші 1 золоту «на сирний фонд»",
          hint: "Коштує 1 золото.",
          goldCost: 1
        },
        grade: "success" as const,
        outcome: {
          headline: "✅ Льохову справу закрито",
          body: ["Сирний фонд офіційно зашаршів."]
        },
        spentGold: 1,
        hpLoss: null,
        check: {
          roll: 13,
          target: 45,
          total: 13,
          statBonus: 0,
          grade: "success"
        },
        character,
        reward: {
          xp: 2,
          gold: 0,
          itemGrants: []
        },
        availableAt: new Date("2026-06-13T10:03:00.000Z"),
        now: new Date("2026-06-13T10:00:00.000Z"),
        levelChange: noLevelChange
      })
      .mockResolvedValueOnce({
        state: "on-cooldown" as const,
        character,
        availableAt: new Date("2026-06-13T10:03:00.000Z"),
        now: new Date("2026-06-13T10:00:30.000Z")
      });
    const callbackData = makeCellarMethodCallbackData("bribe-cheese");
    const calls = await captureRepeatedApiCalls(
      [callbackData, callbackData],
      servicesWith({
        cellarErrand: {
          getForTelegramUser: () => Promise.resolve({ state: "ready", character }),
          complete
        }
      })
    );
    const edits = calls.filter((call) => call.method === "editMessageText");

    expect(complete).toHaveBeenCalledTimes(2);
    expect(complete).toHaveBeenNthCalledWith(1, 42n, {
      type: "method",
      methodId: "bribe-cheese"
    });
    expect(complete).toHaveBeenNthCalledWith(2, 42n, {
      type: "method",
      methodId: "bribe-cheese"
    });
    expect(String(edits[0]?.payload.text)).toContain("Сирний фонд офіційно зашаршів");
    expect(String(edits[0]?.payload.text)).toContain("1");
    expect(String(edits[1]?.payload.text)).not.toContain("Сирний фонд офіційно зашаршів");
    expect(String(edits[1]?.payload.text)).not.toContain("Списано");
  });

  it("hides grownup mouse negotiation after unaffordable seal while cooldown is active", async () => {
    const cooldownNow = new Date("2026-06-13T10:00:00.000Z");
    const grownupCharacter = {
      ...character,
      level: 4,
      gold: 5
    };
    const calls = await captureApiCalls(
      makeCellarCallbackData("grownup-buy-seal"),
      servicesWith({
        cellarErrand: {
          getForTelegramUser: () =>
            Promise.resolve({
              state: "level-retired" as const,
              character: grownupCharacter,
              maxLevel: 3,
              completed: false
            }),
          complete: () => Promise.resolve({ state: "no-character" as const })
        },
        cellarGrownup: {
          buySeal: () =>
            Promise.resolve({
              state: "insufficient-gold" as const,
              character: grownupCharacter,
              price: 240,
              roleplayCooldown: {
                availableAt: new Date("2026-06-13T11:33:00.000Z"),
                now: cooldownNow
              }
            })
        }
      })
    );
    const edit = calls.find((call) => call.method === "editMessageText");
    const buttons = (edit?.payload as {
      reply_markup?: { inline_keyboard?: Array<Array<{ text: string }>> };
    }).reply_markup?.inline_keyboard?.flat().map((button) => button.text) ?? [];

    expect(String(edit?.payload.text)).toContain("🧀 Пломба дивиться дорого.");
    expect(String(edit?.payload.text)).toContain("Домовлятися можна буде за 93 хвилини.");
    expect(buttons).toEqual([
      "🧀 Купити пломбу",
      "🏹 Дошка полювання",
      "⬅️ До зали"
    ]);
    expect(buttons).not.toContain("🐭 Домовитись із мишею");
  });

  it("renders adventure method help without completing the selected problem", async () => {
    const completeAdventureApproach = vi.fn();
    const selectAdventureProblem = vi.fn(() =>
      Promise.resolve({
        state: "selected" as const,
        character,
        offer: adventureOffer,
        choice: adventureChoice,
        approaches: [adventureApproach]
      })
    );
    const calls = await captureApiCalls(
      makeAdventureProblemHelpCallbackData({
        periodToken: "period93",
        problemId: "stew"
      }),
      servicesWith({
        adventure: {
          selectAdventureProblem,
          completeAdventureApproach
        }
      })
    );
    const edit = calls.find((call) => call.method === "editMessageText");

    expect(selectAdventureProblem).toHaveBeenCalledWith(42n, {
      type: "problem-help",
      periodToken: "period93",
      problemId: "stew"
    });
    expect(completeAdventureApproach).not.toHaveBeenCalled();
    expect(edit?.payload.parse_mode).toBe("HTML");
    expect(String(edit?.payload.text)).toContain("Детальніше про способи:");
    expect(String(edit?.payload.text)).toContain("🎵 Продиригувати юшкою");
    expect(String(edit?.payload.text)).toContain("<i>винагорода звичайна. Непевно.</i>");
    expect(JSON.stringify(edit?.payload.reply_markup)).toContain("⬅️ Назад");
    expect(JSON.stringify(edit?.payload.reply_markup)).not.toContain("💡 Підказка");
  });

  it("renders starter shawarma help without completing the starter scene", async () => {
    const completeMimicShawarma = vi.fn();
    const calls = await captureApiCalls(
      makeMimicShawarmaHelpCallbackData(),
      servicesWith({
        adventure: {
          getMimicShawarmaForTelegramUser: () => Promise.resolve({ state: "ready", character }),
          completeMimicShawarma
        }
      })
    );
    const edit = calls.find((call) => call.method === "editMessageText");

    expect(completeMimicShawarma).not.toHaveBeenCalled();
    expect(edit?.payload.parse_mode).toBe("HTML");
    expect(String(edit?.payload.text)).toContain("Детальніше про способи:");
    expect(String(edit?.payload.text)).toContain("🔎 Перевірити, чому лаваш дихає не в ритм");
    expect(String(edit?.payload.text)).toContain("<i>Розслідування без поспіху");
    expect(JSON.stringify(edit?.payload.reply_markup)).toContain("⬅️ Назад");
    expect(JSON.stringify(edit?.payload.reply_markup)).not.toContain("💡 Підказка");
  });

  it("returns from starter shawarma help to the compact starter card", async () => {
    const completeMimicShawarma = vi.fn();
    const calls = await captureApiCalls(
      makeMimicShawarmaBackCallbackData(),
      servicesWith({
        adventure: {
          getMimicShawarmaForTelegramUser: () => Promise.resolve({ state: "ready", character }),
          completeMimicShawarma
        }
      })
    );
    const edit = calls.find((call) => call.method === "editMessageText");

    expect(completeMimicShawarma).not.toHaveBeenCalled();
    expect(String(edit?.payload.text)).toContain("🌯 Підозріла шаурма");
    expect(String(edit?.payload.text)).toContain("<i>Можливі способи:</i>");
    expect(String(edit?.payload.text)).not.toContain("Детальніше про способи:");
    expect(JSON.stringify(edit?.payload.reply_markup)).toContain("💡 Підказка");
    expect(JSON.stringify(edit?.payload.reply_markup)).not.toContain("⬅️ Назад");
  });

  it("renders cellar method help without completing the cellar errand", async () => {
    const complete = vi.fn();
    const calls = await captureApiCalls(
      makeCellarMethodHelpCallbackData(),
      servicesWith({
        cellarErrand: {
          getForTelegramUser: () => Promise.resolve({ state: "ready", character }),
          complete
        }
      })
    );
    const edit = calls.find((call) => call.method === "editMessageText");

    expect(complete).not.toHaveBeenCalled();
    expect(edit?.payload.parse_mode).toBe("HTML");
    expect(String(edit?.payload.text)).toContain("Детальніше про способи:");
    expect(String(edit?.payload.text)).toContain("🧀 Поставити пастку по маршруту крихт");
    expect(String(edit?.payload.text)).toContain("<i>Пастка й сліди");
    expect(JSON.stringify(edit?.payload.reply_markup)).toContain("⬅️ Назад");
    expect(JSON.stringify(edit?.payload.reply_markup)).not.toContain("💡 Підказка");
  });

  it("returns from cellar method help to the compact cellar action card", async () => {
    const complete = vi.fn();
    const calls = await captureApiCalls(
      makeCellarMethodBackCallbackData(),
      servicesWith({
        cellarErrand: {
          getForTelegramUser: () => Promise.resolve({ state: "ready", character }),
          complete
        }
      })
    );
    const edit = calls.find((call) => call.method === "editMessageText");

    expect(complete).not.toHaveBeenCalled();
    expect(String(edit?.payload.text)).toContain("🐭 Льохова справа");
    expect(String(edit?.payload.text)).toContain("<i>Можливі способи:</i>");
    expect(String(edit?.payload.text)).not.toContain("Детальніше про способи:");
    expect(JSON.stringify(edit?.payload.reply_markup)).toContain("💡 Підказка");
    expect(JSON.stringify(edit?.payload.reply_markup)).not.toContain("⬅️ Назад");
  });

  it("renders stale state for hidden v2 adventure method callbacks", async () => {
    const completeAdventureApproach = vi.fn(() =>
      Promise.resolve({
        state: "stale" as const,
        character,
        offer: adventureOffer
      })
    );
    const calls = await captureApiCalls(
      makeAdventureApproachCallbackData({
        periodToken: "period93",
        problemId: "stew",
        methodId: "sign-lease"
      }),
      servicesWith({
        adventure: {
          completeAdventureApproach
        }
      })
    );
    const edit = calls.find((call) => call.method === "editMessageText");

    expect(completeAdventureApproach).toHaveBeenCalledWith(
      42n,
      expect.objectContaining({
        type: "approach",
        periodToken: "period93",
        problemId: "stew",
        methodId: "sign-lease"
      })
    );
    expect(String(edit?.payload.text)).toContain("Цей папірець уже не актуальний");
    expect(String(edit?.payload.text)).toContain("Стіл зі справами перерахував актуальні проблеми");
    expect(String(edit?.payload.text)).toContain("Казанок репетирує оперу");
    expect(String(edit?.payload.text)).not.toContain("Винагорода за справу");
  });

  it("routes old safe-flair-risky adventure callbacks to stale paper refresh", async () => {
    const selectAdventureProblem = vi.fn(() =>
      Promise.resolve({
        state: "selected" as const,
        character,
        offer: adventureOffer,
        choice: adventureChoice,
        approaches: [adventureApproach]
      })
    );
    const completeAdventureApproach = vi.fn(() =>
      Promise.reject(new Error("legacy approach must stay stale-only"))
    );
    const calls = await captureApiCalls(
      makeAdventureApproachCallbackData({
        periodToken: "period93",
        problemId: "stew",
        approach: "safe"
      }),
      servicesWith({
        adventure: {
          selectAdventureProblem,
          completeAdventureApproach
        }
      })
    );
    const edit = calls.find((call) => call.method === "editMessageText");

    expect(selectAdventureProblem).toHaveBeenCalledWith(
      42n,
      expect.objectContaining({
        type: "legacy-approach",
        periodToken: "period93",
        problemId: "stew",
        approach: "safe"
      })
    );
    expect(completeAdventureApproach).not.toHaveBeenCalled();
    expect(String(edit?.payload.text)).toContain("Старий папірець утратив силу");
    expect(String(edit?.payload.text)).toContain("обережно-хитро-ризикову шкалу");
    expect(JSON.stringify(edit?.payload.reply_markup)).toMatch(/v2:adv:a:period93:q[0-9a-z]+:q[0-9a-z]+/u);
  });

  it("renders stale state for hidden v2 cellar method callbacks", async () => {
    const complete = vi.fn(() =>
      Promise.resolve({
        state: "stale" as const,
        character
      })
    );
    const calls = await captureApiCalls(
      "v2:cellar:conduct-duet",
      servicesWith({
        cellarErrand: {
          getForTelegramUser: () => Promise.resolve({ state: "ready", character }),
          complete
        }
      })
    );
    const edit = calls.find((call) => call.method === "editMessageText");

    expect(complete).toHaveBeenCalledWith(42n, {
      type: "method",
      methodId: "conduct-duet"
    });
    expect(String(edit?.payload.text)).toContain("Кнопка застаріла");
    expect(String(edit?.payload.text)).not.toContain("Винагорода за справу");
  });

  it("offers to buy everyone beer after the Barrel raid completes", async () => {
    const calls = await captureApiCalls(
      makeTavernCallbackData("raid"),
      servicesWith({
        tavern: {
          advanceFridayBarrelRaid: () =>
            Promise.resolve({
              state: "completed",
              character,
              reward: {
                xp: 31,
                gold: 18,
                localDate: "2026-06-16T10:23",
                itemGrants: [
                  {
                    itemId: "item.wet-hero-ticket",
                    name: "Квиток мокрого пригодника",
                    quantity: 1
                  }
                ]
              },
              levelChange: noLevelChange
            })
        }
      })
    );
    const edit = calls.find((call) => call.method === "editMessageText");

    expect(edit?.payload).toMatchObject({
      parse_mode: "HTML"
    });
    expect(JSON.stringify(edit?.payload.reply_markup)).toContain("🍺 Просте всім");
    expect(JSON.stringify(edit?.payload.reply_markup)).toContain("🍻 Якісне всім");
    expect(JSON.stringify(edit?.payload.reply_markup)).toContain("v1:sh:brp:simple");
    expect(JSON.stringify(edit?.payload.reply_markup)).toContain("v1:sh:brp:fine");
  });

  it("offers immediate Shynok turn-in after issuing a recovered completed problem paper", async () => {
    const calls = await captureApiCalls(
      makeQuestCallbackData("problem-next"),
      servicesWith({
        presence: {
          markAction: () => Promise.resolve(),
          getRaidParticipantsForTelegramUser: () =>
            Promise.resolve({ state: "no-character" }),
          getAdventureParticipantsForTelegramUser: () =>
            Promise.resolve({ state: "no-character" }),
          getCurrentPlaceForTelegramUser: () =>
            Promise.resolve({
              state: "ready",
              locationId: "location.korchma.bar",
              locationName: "Шинок",
              insideKorchma: true
            }),
          getOnlineForTelegramUser: () => Promise.resolve({ state: "no-character" }),
          getLookForTelegramUser: () => Promise.resolve({ state: "no-character" })
        },
        fight: {
          issueNextProblemQuestForTelegramUser: () =>
            Promise.resolve({
              state: "issued",
              character,
              progress: {
                stageId: "13",
                title: "Тринадцять дрібних проблем",
                wins: 14,
                target: 13,
                completed: true,
                rewardClaimed: false,
                issued: true,
                branchComplete: false
              },
              stage: {
                id: "13",
                title: "Тринадцять дрібних проблем",
                target: 13,
                reward: {
                  xp: 35,
                  gold: 10,
                  itemId: "item.badge-of-thirteen-small-problems"
                },
                issueKey: "quest.problem-chain.13.issued",
                rewardKey: "quest.thirteen-small-problems",
                nextStageId: "23"
              },
              nextStage: {
                id: "13",
                title: "Тринадцять дрібних проблем",
                target: 13,
                reward: {
                  xp: 35,
                  gold: 10,
                  itemId: "item.badge-of-thirteen-small-problems"
                },
                issueKey: "quest.problem-chain.13.issued",
                rewardKey: "quest.thirteen-small-problems",
                nextStageId: "23"
              },
              issued: "created"
            })
        }
      })
    );
    const edit = calls.find((call) => call.method === "editMessageText");

    expect(String(edit?.payload.text)).toContain("14/13");
    expect(String(edit?.payload.text)).not.toContain("Лічильник починається з нуля");
    expect(JSON.stringify(edit?.payload.reply_markup)).toContain("📋 Здати справу");
    expect(JSON.stringify(edit?.payload.reply_markup)).toContain(makeQuestCallbackData("problem"));
  });

  it.each([
    {
      name: "quest adventure route",
      callbackData: makeQuestCallbackData("adventure"),
      services: servicesWith({
        adventure: {
          getAdventureOfferForTelegramUser: () =>
            Promise.resolve({ state: "ready", character, offer: adventureOffer }),
          completeAdventureApproach: () => Promise.resolve({ state: "no-character" })
        }
      }),
      expectedText: "Три справи на найближчий час"
    },
    {
      name: "quest fight route",
      callbackData: makeQuestCallbackData("fight"),
      services: servicesWith({
        fight: {
          getFightForTelegramUser: () =>
            Promise.resolve({
              state: "ready",
              character
            }),
          completeMimicShawarma: () => Promise.resolve({ state: "no-character" })
        }
      }),
      expectedText: "Сутичка з підозрілим монстром"
    },
    {
      name: "quest cellar route",
      callbackData: makeQuestCallbackData("cellar"),
      services: servicesWith({
        cellarErrand: {
          getForTelegramUser: () => Promise.resolve({ state: "ready", character }),
          complete: () => Promise.resolve({ state: "no-character" })
        }
      }),
      expectedText: "Льохова справа"
    },
    {
      name: "place cellar route",
      callbackData: makePlaceCallbackData("cellar"),
      services: servicesWith({
        cellarErrand: {
          getForTelegramUser: () => Promise.resolve({ state: "ready", character }),
          complete: () => Promise.resolve({ state: "no-character" })
        }
      }),
      expectedText: "Льохова справа"
    }
  ])("opens $name as a fresh message so old action taps do not hit new choices", async ({ callbackData, services, expectedText }) => {
    const calls = await captureApiCalls(callbackData, services);
    const message = calls.find(
      (call) => call.method === "sendMessage" && String(call.payload.text).includes(expectedText)
    );

    expect(calls.some((call) => call.method === "editMessageText")).toBe(false);
    expect(message?.payload).toMatchObject({
      parse_mode: "HTML"
    });
    expect(String(message?.payload.text)).toContain(expectedText);
  });

  it("opens quest-table cellar route without duplicate cellar movement notices", async () => {
    let currentLocationId = "location.korchma.quest_table";
    const calls = await captureApiCalls(
      makeQuestCallbackData("cellar"),
      servicesWith({
        cellarErrand: {
          getForTelegramUser: () => Promise.resolve({ state: "ready" as const, character }),
          complete: () => Promise.resolve({ state: "no-character" as const })
        },
        presence: {
          markAction: (input) => {
            currentLocationId = input.locationId;
            return Promise.resolve();
          },
          getCurrentPlaceForTelegramUser: () =>
            Promise.resolve({
              state: "ready" as const,
              locationId: currentLocationId,
              locationName: currentLocationId === "location.korchma.cellar" ? "Льох" : "Стіл зі справами",
              insideKorchma: true
            })
        }
      })
    );
    const messages = calls.filter((call) => call.method === "sendMessage");
    const movementMessages = messages.filter((message) =>
      String(message.payload.text).includes("Ви спустилися до льоху корчми.")
    );

    expect(String(messages[0]?.payload.text)).toContain("Корчмар показує на люк під баром.");
    expect(String(messages[1]?.payload.text)).toContain("🐭 Льохова справа");
    expect(String(messages[2]?.payload.text)).toContain("Ви спустилися до льоху корчми.");
    expect(movementMessages).toHaveLength(1);
  });

  it("does not move the player to the quest table before Barrel tutorial turn-in validation", async () => {
    let currentLocationId = "location.korchma.bar";
    const markAction = vi.fn((input: MarkPresenceInput) => {
      if ("locationId" in input) {
        currentLocationId = input.locationId;
      }

      return Promise.resolve();
    });
    const turnInForTelegramUser = vi.fn(() =>
      Promise.resolve(
        currentLocationId === PRESENCE_LOCATION_KORCHMA_QUEST_TABLE
          ? {
              state: "completed" as const,
              character: { ...character, level: 2 },
              progress: barrelBeerTutorialProgress(true, currentLocationId),
              reward: { xp: 6, gold: 0, itemGrants: [] },
              levelChange: null,
              achievementUnlocks: []
            }
          : {
              state: "wrong-location" as const,
              character: { ...character, level: 2 },
              progress: barrelBeerTutorialProgress(true, currentLocationId)
            }
      )
    );

    const calls = await captureApiCalls(
      makeQuestCallbackData("barrel-tutorial-turn-in"),
      servicesWith({
        barrelBeerTutorial: {
          turnInForTelegramUser
        },
        presence: {
          markAction,
          getCurrentPlaceForTelegramUser: () =>
            Promise.resolve({
              state: "ready",
              locationId: currentLocationId,
              locationName: "Шинок",
              insideKorchma: true
            })
        }
      })
    );

    expect(turnInForTelegramUser).toHaveBeenCalledTimes(1);
    const turnInOrder = turnInForTelegramUser.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY;
    const questTableMarkOrders = markAction.mock.calls.flatMap(([input], index) =>
      "locationId" in input && input.locationId === PRESENCE_LOCATION_KORCHMA_QUEST_TABLE
        ? [markAction.mock.invocationCallOrder[index] ?? Number.POSITIVE_INFINITY]
        : []
    );
    expect(questTableMarkOrders.filter((order) => order < turnInOrder)).toEqual([]);
    expect(questTableMarkOrders).toHaveLength(0);
    const edit = calls.find((call) => call.method === "editMessageText");
    expect(edit?.payload.text).toContain("звітувати треба біля столу");
    expect(edit?.payload.text).not.toContain("+6 XP");
    expect(edit?.payload.text).not.toContain("Перстень Пивовладдя");
    expect(JSON.stringify(edit?.payload.reply_markup)).toContain(makePlaceCallbackData("quest-table"));
  });

  it("renders Barrel tutorial accept stipend with an HTML received label", async () => {
    const calls = await captureApiCalls(
      makeQuestCallbackData("barrel-tutorial"),
      servicesWith({
        barrelBeerTutorial: {
          acceptForTelegramUser: () =>
            Promise.resolve({
              state: "accepted" as const,
              character: { ...character, level: 2 },
              progress: {
                ...barrelBeerTutorialProgress(false, "location.korchma.quest-table"),
                accepted: true,
                stipendGranted: true
              },
              stipendGold: 39
            })
        }
      })
    );

    const edit = calls.find((call) => call.method === "editMessageText");
    expect(getParseMode(edit?.payload)).toBe("HTML");
    expect(edit?.payload.text).toContain("записку гномськими рунами");
    expect(edit?.payload.text).toContain("Потрібен зломщик");
    expect(edit?.payload.text).not.toContain("маленький аванс — 39 золота");
    expect(edit?.payload.text).toContain("<i>Отримано:</i>\n+39 золота");
  });

  it("sends level-up celebration as a separate HTML message after the result edit", async () => {
    const calls = await captureApiCalls(
      makeAdventureApproachCallbackData({
        periodToken: "period93",
        problemId: "stew",
        methodId: adventureApproach.id
      }),
      servicesWith({
        adventure: {
          completeAdventureApproach: () =>
            Promise.resolve({
              state: "completed",
              character: {
                ...character,
                classId: "class.rogue"
              },
              choice: adventureChoice,
              approach: adventureApproach,
              reward: {
                xp: 7,
                gold: 4,
                localDate: "12026-06-12",
                itemGrants: []
              },
              levelChange,
              complication: false
            })
        }
      })
    );
    const edit = calls.find((call) => call.method === "editMessageText");
    const celebration = calls.find(
      (call) => call.method === "sendMessage" && String(call.payload.text).includes("🎉 Рівень підріс!")
    );

    expect(String(edit?.payload.text)).not.toContain("Рівень підріс");
    expect(celebration?.payload.parse_mode).toBe("HTML");
    expect(String(celebration?.payload.text)).toContain("✨ <b>2 → 3</b>");
    expect(String(celebration?.payload.text)).toContain(
      "📈 Стало краще: <b>+4 HP · +2 мани · +1 Вдачі</b>"
    );
  });

  it("sends problem quest progress as a separate HTML message after a won fight turn", async () => {
    const calls = await captureApiCalls(
      makeFightTurnCallbackData({
        sessionId: "123e4567-e89b-42d3-a456-426614174000",
        turn: 3,
        action: "attack"
      }),
      servicesWith({
        fight: {
          resolvePersistentFightTurn: () =>
            Promise.resolve({
              state: "updated",
              character,
              session: {
                ...persistentSession("monster.deadline-spider"),
                id: "123e4567-e89b-42d3-a456-426614174000",
                status: "won",
                turn: 4,
                state: {
                  id: "123e4567-e89b-42d3-a456-426614174000",
                  status: "won",
                  turn: 4,
                  hero: {
                    hp: 17,
                    hpMax: 20,
                    mana: 7,
                    manaMax: 10
                  },
                  monster: {
                    id: "monster.deadline-spider",
                    hp: 0,
                    hpMax: 12
                  },
                  lastTurn: {
                    action: "attack",
                    heroOutcome: "hit",
                    heroDamage: 12,
                    monsterDamage: 0,
                    manaSpent: 0,
                    critical: false
                  }
                }
              },
              monster: {
                id: "monster.deadline-spider",
                name: "Павук дедлайнів",
                description: "Плете павутину з «сьогодні швиденько».",
                level: 2,
                tags: ["beast", "time", "web"]
              },
              questProgress: {
                stageId: "23",
                title: "Двадцять три підозрілі проблеми",
                wins: 7,
                target: 23,
                completed: false,
                rewardClaimed: false,
                issued: true,
                branchComplete: false
              },
              fightReward: {
                state: "claimed",
                reward: {
                  xp: 20,
                  gold: 0,
                  localDate: "123e4567-e89b-42d3-a456-426614174000",
                  itemGrants: []
                },
                levelChange
              }
            })
        }
      })
    );
    const edit = calls.find((call) => call.method === "editMessageText");
    const progress = calls.find(
      (call) => call.method === "sendMessage" && String(call.payload.text).includes("Прогрес справи зрушив")
    );

    expect(String(edit?.payload.text)).toContain("🎉 Ви перемогли");
    expect(String(edit?.payload.text)).not.toContain("Двадцять три підозрілі проблеми");
    expect(progress?.payload.parse_mode).toBe("HTML");
    expect(String(progress?.payload.text)).toContain(
      "<i>Двадцять три підозрілі проблеми</i>: <b>7/23</b>."
    );
    expect(String(progress?.payload.text)).not.toContain("Корчмар зараховує цей бій як одну проблему");
    const celebration = calls.find(
      (call) => call.method === "sendMessage" && String(call.payload.text).includes("🎉 Рівень підріс!")
    );

    expect(celebration?.payload.parse_mode).toBe("HTML");
    expect(String(celebration?.payload.text)).toContain("✨ <b>2 → 3</b>");
  });

  it("puts the single-problem reminder in the progress ping only for won multi-enemy problem fights", async () => {
    const calls = await captureApiCalls(
      makeFightTurnCallbackData({
        sessionId: "123e4567-e89b-42d3-a456-426614174001",
        turn: 3,
        action: "attack"
      }),
      servicesWith({
        fight: {
          resolvePersistentFightTurn: () =>
            Promise.resolve({
              state: "updated",
              character,
              session: {
                ...persistentSession("monster.deadline-spider"),
                id: "123e4567-e89b-42d3-a456-426614174001",
                status: "won",
                turn: 4,
                state: {
                  id: "123e4567-e89b-42d3-a456-426614174001",
                  status: "won",
                  turn: 4,
                  hero: {
                    hp: 17,
                    hpMax: 20,
                    mana: 7,
                    manaMax: 10
                  },
                  monster: {
                    id: "monster.deadline-spider",
                    hp: 0,
                    hpMax: 12
                  },
                  enemies: [
                    {
                      enemyId: "enemy:1",
                      id: "monster.deadline-spider",
                      hp: 0,
                      hpMax: 12
                    },
                    {
                      enemyId: "enemy:2",
                      id: "monster.complaint-lantern",
                      hp: 0,
                      hpMax: 16
                    }
                  ],
                  lastTurn: {
                    action: "attack",
                    heroOutcome: "hit",
                    heroDamage: 12,
                    monsterDamage: 0,
                    manaSpent: 0,
                    critical: false
                  }
                }
              },
              monster: {
                id: "monster.deadline-spider",
                name: "Павук дедлайнів",
                description: "Плете павутину з «сьогодні швиденько».",
                level: 2,
                tags: ["beast", "time", "web"]
              },
              questProgress: {
                stageId: "23",
                title: "Двадцять три підозрілі проблеми",
                wins: 8,
                target: 23,
                completed: false,
                rewardClaimed: false,
                issued: true,
                branchComplete: false
              },
              fightReward: {
                state: "claimed",
                reward: {
                  xp: 20,
                  gold: 0,
                  localDate: "123e4567-e89b-42d3-a456-426614174001",
                  itemGrants: []
                },
                levelChange: null
              }
            })
        }
      })
    );
    const edit = calls.find((call) => call.method === "editMessageText");
    const progress = calls.find(
      (call) => call.method === "sendMessage" && String(call.payload.text).includes("Прогрес справи зрушив")
    );

    expect(String(edit?.payload.text)).toContain("🎉 Ви перемогли");
    expect(String(edit?.payload.text)).not.toContain("Корчмар зараховує");
    expect(progress?.payload.parse_mode).toBe("HTML");
    expect(String(progress?.payload.text)).toContain(
      "<i>Двадцять три підозрілі проблеми</i>: <b>8/23</b>."
    );
    expect(String(progress?.payload.text)).toContain("Корчмар зараховує цей бій як одну проблему");
  });

  it("does not send a passage movement notice after a persistent skill turn", async () => {
    const markAction = vi.fn(() => Promise.resolve());
    const session = persistentSessionWithOrigin("location.korchma.deep.level1.straight");
    const calls = await captureApiCalls(
      makeFightTurnCallbackData({
        sessionId: session.id,
        turn: 1,
        action: "skill"
      }),
      servicesWith({
        fight: {
          resolvePersistentFightTurn: () =>
            Promise.resolve({
              state: "updated" as const,
              character,
              session: {
                ...session,
                turn: 2,
                state: {
                  ...session.state,
                  turn: 2,
                  lastTurn: {
                    action: "skill" as const,
                    heroOutcome: "hit" as const,
                    heroDamage: 4,
                    monsterDamage: 1,
                    manaSpent: 2,
                    critical: false,
                    skillId: "skill.strict-blessing"
                  }
                }
              },
              monster: {
                id: "monster.deadline-spider",
                name: "Павук дедлайнів",
                description: "Тестовий монстр.",
                level: 2,
                tags: ["beast"]
              },
              questProgress: null,
              fightReward: null
            })
        },
        presence: {
          markAction,
          getCurrentPlaceForTelegramUser: () =>
            Promise.resolve({
              state: "ready" as const,
              locationId: "location.korchma.hall",
              locationName: "Зала корчми",
              insideKorchma: true
            })
        }
      })
    );
    const movement = calls.find(
      (call) =>
        call.method === "sendMessage" &&
        String(call.payload.text).includes("Ви пішли у прямий прохід.")
    );

    expect(markAction).toHaveBeenCalledWith(
      expect.objectContaining({
        locationId: "location.korchma.deep.level1.straight",
        currentRaidId: null,
        currentAdventureId: "adventure.solo-fight"
      })
    );
    expect(movement).toBeUndefined();
  });

  it("does not send a Yeger corner movement notice after a persistent skill turn", async () => {
    const markAction = vi.fn(() => Promise.resolve());
    const session = persistentSessionWithOrigin("location.korchma.ranger_corner");
    const getCurrentPlaceForTelegramUser = vi.fn()
      .mockResolvedValueOnce({
        state: "ready" as const,
        locationId: "location.korchma.front",
        locationName: "Надворі біля корчми",
        insideKorchma: false
      })
      .mockResolvedValue({
        state: "ready" as const,
        locationId: "location.korchma.ranger_corner",
        locationName: "Єгерський куток",
        insideKorchma: true
      });
    const calls = await captureApiCalls(
      makeFightTurnCallbackData({
        sessionId: session.id,
        turn: 1,
        action: "skill"
      }),
      servicesWith({
        fight: {
          resolvePersistentFightTurn: () =>
            Promise.resolve({
              state: "updated" as const,
              character,
              session: {
                ...session,
                turn: 2,
                state: {
                  ...session.state,
                  turn: 2,
                  lastTurn: {
                    action: "skill" as const,
                    heroOutcome: "miss" as const,
                    heroDamage: 0,
                    monsterDamage: 7,
                    manaSpent: 2,
                    critical: false,
                    skillId: "skill.hot-spell"
                  }
                }
              },
              monster: {
                id: "monster.foam-auditor-boots",
                name: "Пінний ревізор у чоботях",
                description: "Тестовий неупокоєний ревізор.",
                level: 8,
                tags: ["unquiet"]
              },
              questProgress: null,
              fightReward: null
            })
        },
        presence: {
          markAction,
          getCurrentPlaceForTelegramUser
        }
      })
    );
    const movement = calls.find(
      (call) =>
        call.method === "sendMessage" &&
        String(call.payload.text).includes("Ви підійшли до єгерського кутка.")
    );

    expect(markAction).toHaveBeenCalledWith(
      expect.objectContaining({
        locationId: "location.korchma.ranger_corner",
        currentRaidId: null,
        currentAdventureId: "adventure.solo-fight"
      })
    );
    expect(movement).toBeUndefined();
  });

  it("answers combat field-kit repeat attempts with a concrete once-per-battle reason", async () => {
    const markAction = vi.fn(() => Promise.resolve());
    const session = persistentSessionWithOrigin("location.korchma.deep.level1.straight");
    const calls = await captureApiCalls(
      makeFightItemUseCallbackData({
        sessionId: session.id,
        turn: 1,
        itemKey: getCombatItemUseKey("item.field-kit")
      }),
      servicesWith({
        fight: {
          resolvePersistentFightItemTurn: () =>
            Promise.resolve({
              state: "item-unavailable" as const,
              reason: "item-limit-reached" as const,
              character,
              session,
              monster: {
                id: "monster.deadline-spider",
                name: "Павук дедлайнів",
                description: "Тестовий монстр.",
                level: 2,
                tags: ["beast"]
              },
              questProgress: null
            })
        },
        presence: {
          markAction,
          getCurrentPlaceForTelegramUser: () =>
            Promise.resolve({
              state: "ready" as const,
              locationId: "location.korchma.deep.level1.straight",
              locationName: "Прямий прохід",
              insideKorchma: true
            })
        }
      })
    );
    const callbackAnswer = calls.find((call) => call.method === "answerCallbackQuery");
    const edit = calls.find((call) => call.method === "editMessageText");

    expect(callbackAnswer?.payload).toMatchObject({
      text: "Манатка не спрацювала: польова аптечка працює лише раз на бій.",
      show_alert: true
    });
    expect(String(edit?.payload.text)).toContain("вже зробила свою справу в цьому бою");
    expect(markAction).toHaveBeenCalledWith(
      expect.objectContaining({
        locationId: "location.korchma.deep.level1.straight",
        currentRaidId: null,
        currentAdventureId: "adventure.solo-fight"
      })
    );
  });

  it("does not send a duplicate Yeger corner movement notice for Yeger callbacks", async () => {
    const markAction = vi.fn(() => Promise.resolve());
    const getCurrentPlaceForTelegramUser = vi.fn()
      .mockResolvedValueOnce({
        state: "ready" as const,
        locationId: "location.korchma.hall",
        locationName: "Зала корчми",
        insideKorchma: true
      })
      .mockResolvedValue({
        state: "ready" as const,
        locationId: "location.korchma.ranger_corner",
        locationName: "Єгерський куток",
        insideKorchma: true
      });
    const calls = await captureApiCalls(
      makeYegerOpenCallbackData(),
      servicesWith({
        yeger: {
          getForTelegramUser: () =>
            Promise.resolve({
              state: "completed" as const,
              character,
              progress: { wins: 17, target: 17, stageId: "second" as const },
              reward: {
                xp: 170,
                gold: 170,
                itemGrants: []
              }
            })
        },
        presence: {
          markAction,
          getCurrentPlaceForTelegramUser,
          getRaidParticipantsForTelegramUser: () => Promise.resolve({ state: "no-character" as const }),
          getAdventureParticipantsForTelegramUser: () => Promise.resolve({ state: "no-character" as const }),
          getOnlineForTelegramUser: () => Promise.resolve({ state: "no-character" as const }),
          getLookForTelegramUser: () => Promise.resolve({ state: "no-character" as const })
        }
      })
    );
    const edit = calls.find((call) => call.method === "editMessageText");
    const movement = calls.find(
      (call) =>
        call.method === "sendMessage" &&
        String(call.payload.text).includes("Ви підійшли до єгерського кутка.")
    );

    expect(String(edit?.payload.text)).toContain("Єгерський куток");
    expect(movement).toBeUndefined();
  });

  it("refreshes the location keyboard after a non-passage fight callback changes place", async () => {
    const markAction = vi.fn(() => Promise.resolve());
    const session = persistentSessionWithOrigin("location.korchma.deep.level1.straight");
    const getCurrentPlaceForTelegramUser = vi.fn()
      .mockResolvedValueOnce({
        state: "ready" as const,
        locationId: "location.korchma.hall",
        locationName: "Зала корчми",
        insideKorchma: true
      })
      .mockResolvedValue({
        state: "ready" as const,
        locationId: "location.korchma.deep.level1.straight",
        locationName: "Прямий прохід",
        insideKorchma: true
      });
    const calls = await captureApiCalls(
      makeFightViewCallbackData(session.id),
      servicesWith({
        fight: {
          getPersistentFightSnapshotForTelegramUser: () =>
            Promise.resolve({
              state: "found" as const,
              character,
              session,
              monster: {
                id: "monster.deadline-spider",
                name: "Павук дедлайнів",
                description: "Плете павутину з «сьогодні швиденько».",
                level: 2,
                tags: ["beast", "time", "web"]
              },
              questProgress: null,
              fightReward: null
            })
        },
        presence: {
          markAction,
          getCurrentPlaceForTelegramUser
        }
      })
    );
    const movement = calls.find(
      (call) =>
        call.method === "sendMessage" &&
        String(call.payload.text).includes("Ви пішли у прямий прохід.")
    );

    expect(markAction).toHaveBeenCalledWith(
      expect.objectContaining({
        locationId: "location.korchma.deep.level1.straight",
        currentAdventureId: "adventure.solo-fight"
      })
    );
    expect(movement).toBeDefined();
    expect(JSON.stringify(movement?.payload.reply_markup)).toContain(mainMenuLocationButtons.deepStraight);
  });

  it("adds a Shynok route button to completed problem quest progress", async () => {
    const calls = await captureApiCalls(
      makeFightTurnCallbackData({
        sessionId: "123e4567-e89b-42d3-a456-426614174222",
        turn: 3,
        action: "attack"
      }),
      servicesWith({
        fight: {
          resolvePersistentFightTurn: () =>
            Promise.resolve({
              state: "updated",
              character,
              session: {
                ...persistentSession("monster.deadline-spider"),
                id: "123e4567-e89b-42d3-a456-426614174222",
                status: "won",
                turn: 4,
                state: {
                  id: "123e4567-e89b-42d3-a456-426614174222",
                  status: "won",
                  turn: 4,
                  hero: {
                    hp: 17,
                    hpMax: 20,
                    mana: 7,
                    manaMax: 10
                  },
                  monster: {
                    id: "monster.deadline-spider",
                    hp: 0,
                    hpMax: 12
                  },
                  lastTurn: {
                    action: "attack",
                    heroOutcome: "hit",
                    heroDamage: 12,
                    monsterDamage: 0,
                    manaSpent: 0,
                    critical: false
                  }
                }
              },
              monster: {
                id: "monster.deadline-spider",
                name: "Павук дедлайнів",
                description: "Плете павутину з «сьогодні швиденько».",
                level: 2,
                tags: ["beast", "time", "web"]
              },
              questProgress: {
                stageId: "13",
                title: "Тринадцять дрібних проблем",
                wins: 13,
                target: 13,
                completed: true,
                rewardClaimed: false,
                issued: true,
                branchComplete: false
              },
              fightReward: null
            })
        }
      })
    );
    const progress = calls.find(
      (call) => call.method === "sendMessage" && String(call.payload.text).includes("Прогрес справи зрушив")
    );

    expect(progress?.payload.parse_mode).toBe("HTML");
    expect(String(progress?.payload.text)).toContain("Корчмар чекає в шинку.");
    expect(JSON.stringify(progress?.payload.reply_markup)).toContain("🍻 До шинку");
    expect(JSON.stringify(progress?.payload.reply_markup)).toContain(makePlaceCallbackData("bar"));
  });

  it("includes Yeger quest progress in the separate message when a matching won fight moved it", async () => {
    const yegerLookup = vi
      .fn()
      .mockResolvedValueOnce({
        state: "in-progress",
        character,
        progress: { wins: 4, target: 5 },
        tracking: { state: "none" }
      })
      .mockResolvedValueOnce({
        state: "turn-in-ready",
        character,
        progress: { wins: 5, target: 5 },
        tracking: { state: "none" }
      });
    const calls = await captureApiCalls(
      makeFightTurnCallbackData({
        sessionId: "123e4567-e89b-42d3-a456-426614174111",
        turn: 3,
        action: "attack"
      }),
      servicesWith({
        fight: {
          resolvePersistentFightTurn: () =>
            Promise.resolve({
              state: "updated",
              character,
              session: {
                ...persistentSession("monster.restless-auditor"),
                id: "123e4567-e89b-42d3-a456-426614174111",
                status: "won",
                turn: 4,
                state: {
                  id: "123e4567-e89b-42d3-a456-426614174111",
                  status: "won",
                  turn: 4,
                  hero: {
                    hp: 17,
                    hpMax: 20,
                    mana: 7,
                    manaMax: 10
                  },
                  monster: {
                    id: "monster.restless-auditor",
                    hp: 0,
                    hpMax: 12
                  },
                  lastTurn: {
                    action: "attack",
                    heroOutcome: "hit",
                    heroDamage: 12,
                    monsterDamage: 0,
                    manaSpent: 0,
                    critical: false
                  }
                }
              },
              monster: {
                id: "monster.restless-auditor",
                name: "Неспокійний аудитор",
                description: "Шурхотить формами навіть після смерті.",
                level: 4,
                tags: ["undead", "paperwork"]
              },
              questProgress: {
                stageId: "13",
                title: "Тринадцять дрібних проблем",
                wins: 13,
                target: 13,
                completed: true,
                rewardClaimed: false,
                issued: true,
                branchComplete: false
              },
              fightReward: null
            })
        },
        yeger: {
          getForTelegramUser: yegerLookup
        }
      })
    );
    const edit = calls.find((call) => call.method === "editMessageText");
    const progress = calls.find(
      (call) => call.method === "sendMessage" && String(call.payload.text).includes("Прогрес справ зрушив")
    );

    expect(yegerLookup).toHaveBeenCalledTimes(2);
    expect(String(edit?.payload.text)).not.toContain("Неспокійні справи");
    expect(progress?.payload.parse_mode).toBe("HTML");
    expect(String(progress?.payload.text)).toContain("📋 <b>Прогрес справ зрушив</b>");
    expect(String(progress?.payload.text)).toContain(
      "<i>Тринадцять дрібних проблем</i>: <b>13/13</b>. — Корчмар чекає в шинку."
    );
    expect(String(progress?.payload.text)).toContain("<i>Неспокійні справи</i>: <b>5/5</b>. — Єгер чекає дощечку.");
    expect(JSON.stringify(progress?.payload.reply_markup)).toContain("🍻 До шинку");
    expect(JSON.stringify(progress?.payload.reply_markup)).toContain("🏹 До Єгеря");
  });

  it("offers craft shortcuts after the completed second Yeger turn-in when craft options are available", async () => {
    const getCraftOptionsForTelegramUser = vi.fn(() =>
      Promise.resolve(ITEM_CRAFT_RECIPES.map((recipe) => ({ recipe })))
    );
    const calls = await captureApiCalls(
      makeYegerTurnInCallbackData(),
      servicesWith({
        itemCraft: {
          getCraftOptionsForTelegramUser
        },
        yeger: {
          turnInForTelegramUser: () =>
            Promise.resolve({
              state: "completed" as const,
              character,
              progress: { wins: 17, target: 17, stageId: "second" as const },
              reward: {
                xp: 56,
                gold: 170,
                itemGrants: [{ itemId: "item.yeger.first-notch", name: "Єгерська риска на дощечці", quantity: 2 }]
              },
              levelChange: null,
              achievementUnlocks: []
            }),
          getNotchExchangeForTelegramUser: () =>
            Promise.resolve({
              state: "ready" as const,
              character,
              summary: {
                availableNotches: 0,
                options: []
              }
            })
        }
      })
    );
    const edit = calls.find((call) => call.method === "editMessageText");
    const keyboard = JSON.stringify(edit?.payload.reply_markup);

    expect(getCraftOptionsForTelegramUser).toHaveBeenCalledWith(42n, "item.responsible-panic-bandage");
    expect(keyboard).toContain("v1:craft:p:dense");
    expect(keyboard).toContain("v1:craft:p:kit");
  });

  it("offers craft shortcuts from the Yeger bandages submenu when craft options are available", async () => {
    const getCraftOptionsForTelegramUser = vi.fn(() =>
      Promise.resolve(ITEM_CRAFT_RECIPES.map((recipe) => ({ recipe })))
    );
    const calls = await captureApiCalls(
      makeYegerBandagesCallbackData(),
      servicesWith({
        itemCraft: {
          getCraftOptionsForTelegramUser
        },
        yeger: {
          getForTelegramUser: () =>
            Promise.resolve({
              state: "completed" as const,
              character,
              progress: { wins: 17, target: 17, stageId: "second" as const },
              reward: {
                xp: 56,
                gold: 170,
                itemGrants: [{ itemId: "item.yeger.first-notch", name: "Єгерська риска на дощечці", quantity: 2 }]
              }
            })
        }
      })
    );
    const edit = calls.find((call) => call.method === "editMessageText");
    const keyboard = JSON.stringify(edit?.payload.reply_markup);

    expect(getCraftOptionsForTelegramUser).toHaveBeenCalledWith(42n, "item.responsible-panic-bandage");
    expect(keyboard).toContain("v1:craft:p:dense");
    expect(keyboard).toContain("v1:craft:p:kit");
  });

  it("edits equip requirement denials as message text instead of popup text", async () => {
    const calls = await captureApiCalls(
      makeEquipItemCallbackData("item.loot-v1-borgomanta-token-plus-3"),
      servicesWith({
        equipment: {
          equipItemForTelegramUser: () =>
            Promise.resolve({
              state: "requirements-not-met",
              reasons: ["min-level", "class"],
              item: {
                itemId: "item.loot-v1-borgomanta-token-plus-3",
                content: {
                  id: "item.loot-v1-borgomanta-token-plus-3",
                  name: "Жетон Боргоманта +3",
                  description: "Маленька річ, великий привід сперечатися з балансом.",
                  rarity: "rare",
                  slot: "accessory",
                  goldValue: 986
                }
              }
            })
        }
      })
    );
    const callbackAnswer = calls.find((call) => call.method === "answerCallbackQuery");
    const edit = calls.find((call) => call.method === "editMessageText");

    expect(callbackAnswer?.payload).not.toHaveProperty("text");
    expect(edit?.payload).toMatchObject({
      parse_mode: "HTML"
    });
    expect(String(edit?.payload.text)).toContain("Ще не екіпірується: <b>Жетон Боргоманта +3</b>.");
    expect(String(edit?.payload.text)).toContain(
      "<b>Жетон Боргоманта +3</b>.\n\nПотрібно: вищий рівень, сумісний клас."
    );
    expect(String(edit?.payload.text)).toContain("Це правило манатки, не помилка героя.");
  });

  it("shows replacement copy after successful equip callbacks", async () => {
    const equipItemForTelegramUser = vi.fn(() =>
      Promise.resolve({
        state: "equipped" as const,
        slot: "weapon" as const,
        item: {
          itemId: "item.pan-of-persuasion",
          content: {
            id: "item.pan-of-persuasion",
            name: "Пательня переконання",
            description: "Важкий аргумент для легких суперечок.",
            rarity: "common" as const,
            slot: "weapon" as const,
            equipmentSlot: "weapon" as const,
            goldValue: 25,
            effect: {
              weaponDamage: 2
            }
          }
        },
        replacedItem: {
          itemId: "item.old-pan",
          content: {
            id: "item.old-pan",
            name: "Стара пательня",
            description: "Вона бачила чергу ще до черги.",
            rarity: "common" as const,
            slot: "weapon" as const,
            goldValue: 1
          }
        },
        slots: [],
        achievementUnlocks: []
      })
    );
    const getEquipmentForTelegramUser = vi.fn(() => Promise.resolve({ state: "no-character" as const }));
    const calls = await captureApiCalls(
      makeEquipItemCallbackData("item.pan-of-persuasion"),
      servicesWith({
        equipment: {
          equipItemForTelegramUser,
          getEquipmentForTelegramUser
        }
      })
    );
    const edit = calls.find((call) => call.method === "editMessageText");
    const text = String(edit?.payload.text);
    const keyboard = JSON.stringify(edit?.payload.reply_markup);

    expect(equipItemForTelegramUser).toHaveBeenCalledWith(
      42n,
      "item.pan-of-persuasion",
      null,
      { confirmTwohand: false }
    );
    expect(getEquipmentForTelegramUser).not.toHaveBeenCalled();
    expect(text).toContain("Екіпіровано: <b>Пательня переконання</b>.");
    expect(text).toContain("Попередня манатка зі слота <i>Основна рука</i> лишилася в торбі:");
    expect(text).toContain("<b>Стара пательня</b>.");
    expect(keyboard).toContain("v1:item:inventory");
    expect(keyboard).toContain("v1:equip:view");
  });

  it("keeps duplicate successful equip callbacks from duplicating achievement notices", async () => {
    const firstUnlock = {
      id: "achievement.equipment.first-equipped",
      title: "Перший гачок",
      cosmeticTitleGrantId: null,
      unlockedAt: new Date("2026-07-03T10:00:00.000Z")
    };
    const equipItemForTelegramUser = vi
      .fn()
      .mockResolvedValueOnce({
        state: "equipped" as const,
        slot: "weapon" as const,
        item: {
          itemId: "item.pan-of-persuasion",
          content: {
            id: "item.pan-of-persuasion",
            name: "Пательня переконання",
            description: "Важкий аргумент для легких суперечок.",
            rarity: "common" as const,
            slot: "weapon" as const,
            equipmentSlot: "weapon" as const,
            goldValue: 25,
            effect: {
              weaponDamage: 2
            }
          }
        },
        replacedItem: null,
        slots: [],
        achievementUnlocks: [firstUnlock]
      })
      .mockResolvedValueOnce({
        state: "equipped" as const,
        slot: "weapon" as const,
        item: {
          itemId: "item.pan-of-persuasion",
          content: {
            id: "item.pan-of-persuasion",
            name: "Пательня переконання",
            description: "Важкий аргумент для легких суперечок.",
            rarity: "common" as const,
            slot: "weapon" as const,
            equipmentSlot: "weapon" as const,
            goldValue: 25,
            effect: {
              weaponDamage: 2
            }
          }
        },
        replacedItem: null,
        slots: [],
        achievementUnlocks: []
      });
    const callbackData = makeEquipItemCallbackData("item.pan-of-persuasion");
    const calls = await captureRepeatedApiCalls(
      [callbackData, callbackData],
      servicesWith({
        equipment: {
          equipItemForTelegramUser
        }
      })
    );
    const edits = calls.filter((call) => call.method === "editMessageText");
    const achievementMessages = calls.filter((call) =>
      call.method === "sendMessage" && String(call.payload.text).includes("Перший гачок")
    );

    expect(equipItemForTelegramUser).toHaveBeenCalledTimes(2);
    expect(edits).toHaveLength(2);
    expect(edits.every((edit) => String(edit.payload.text).includes("Екіпіровано: <b>Пательня переконання</b>."))).toBe(true);
    expect(achievementMessages).toHaveLength(1);
  });

  it("does not spend the Yeger trail cooldown while another fight is already active", async () => {
    const calls = await captureApiCalls(
      makeYegerTrackCallbackData(),
      servicesWith({
        yeger: {
          getForTelegramUser: () =>
            Promise.resolve({
              state: "in-progress",
              character,
              progress: { wins: 1, target: 5 },
              tracking: {
                state: "tracking-ready",
                availableAt: new Date("2026-06-15T10:04:00.000Z"),
                now: new Date("2026-06-15T10:05:00.000Z")
              }
            }),
          trackForTelegramUser: () =>
            Promise.resolve({
              state: "tracking-blocked-by-other-fight",
              character,
              progress: { wins: 1, target: 5 },
              tracking: {
                state: "tracking-ready",
                availableAt: new Date("2026-06-15T10:04:00.000Z"),
                now: new Date("2026-06-15T10:05:00.000Z")
              },
              fight: {
                state: "persistent-active",
                character,
                session: persistentSession("monster.deadline-spider"),
                monster: {
                  id: "monster.deadline-spider",
                  name: "Павук дедлайнів",
                  description: "Плете павутину з «сьогодні швиденько».",
                  level: 2,
                  tags: ["beast", "time", "web"]
                },
                questProgress: null
              }
            })
        }
      })
    );
    const edit = calls.find((call) => call.method === "editMessageText");
    const fight = calls.find((call) => call.method === "sendMessage");

    expect(String(edit?.payload.text)).toContain("У вас уже триває інша сутичка.");
    expect(String(edit?.payload.text)).not.toContain("Щось неупокоєне знайшлося");
    expect(String(fight?.payload.text)).toContain("❤️ Ви:");
    expect(String(fight?.payload.text)).toContain("⏳ На хід є 23 секунди.");
    expect(String(fight?.payload.text)).toContain("<b>Мандрівник</b>, що робимо?");
  });

  it.each([
    {
      name: "problem",
      callbackData: makeAdventureProblemCallbackData({
        periodToken: "period93",
        problemId: "stew"
      }),
      adventure: {
        selectAdventureProblem: () =>
          Promise.resolve({
            state: "active-fight" as const,
            character,
            session: persistentSession("monster.deadline-spider")
          }),
        completeAdventureApproach: () => Promise.resolve({ state: "no-character" as const })
      }
    },
    {
      name: "approach",
      callbackData: makeAdventureApproachCallbackData({
        periodToken: "period93",
        problemId: "stew",
        methodId: adventureApproach.id
      }),
      adventure: {
        selectAdventureProblem: () => Promise.resolve({ state: "no-character" as const }),
        completeAdventureApproach: () =>
          Promise.resolve({
            state: "active-fight" as const,
            character,
            session: persistentSession("monster.deadline-spider")
          })
      }
    }
  ])("does not stamp quest-table presence for active-fight adventure $name callbacks", async ({
    callbackData,
    adventure
  }) => {
    const markAction = vi.fn(() => Promise.resolve());
    const calls = await captureApiCalls(
      callbackData,
      servicesWith({
        adventure,
        presence: {
          markAction
        }
      })
    );
    const edit = calls.find((call) => call.method === "editMessageText");

    expect(String(edit?.payload.text)).toContain("Спершу завершіть поточний бій.");
    expect(
      markAction.mock.calls.some(([input]) => "locationId" in input)
    ).toBe(false);
  });

  it("records the edited callback message as the active persistent fight card", async () => {
    rememberLatestMessageForChat(42, 10);
    const markAction = vi.fn(() => Promise.resolve());
    const recordPersistentFightMessageReference = vi.fn(() => Promise.resolve());
    const calls = await captureApiCalls(
      makePlaceCallbackData("hall"),
      servicesWith({
        fight: {
          recordPersistentFightMessageReference,
          getFightOverviewForTelegramUser: () =>
            Promise.resolve({
              state: "persistent-active" as const,
              character,
              session: {
                ...persistentSession("monster.deadline-spider"),
                state: {
                  ...persistentSession("monster.deadline-spider").state,
                  source: "adventure",
                  originLocationId: "location.korchma.quest_table"
                }
              },
              monster: {
                id: "monster.deadline-spider",
                name: "Павук дедлайнів",
                description: "Плете павутину з «сьогодні швиденько».",
                level: 2,
                tags: ["beast", "time", "web"]
              },
              questProgress: null
            })
        },
        presence: {
          markAction
        }
      })
    );
    const edit = calls.find((call) => call.method === "editMessageText");

    expect(markAction).toHaveBeenCalledWith(
      expect.objectContaining({
        locationId: "location.korchma.quest_table",
        currentAdventureId: "adventure.solo-fight"
      })
    );
    expect(String(edit?.payload.text)).toContain("⚔️ <b>Бій тримає вас за рукав</b>");
    expect(String(edit?.payload.text)).toContain("Спершу завершіть цю сутичку");
    expect(String(edit?.payload.text)).toContain("❤️ Ви:");
    expect(String(edit?.payload.text)).toContain("⏳ На хід є 23 секунди.");
    expect(recordPersistentFightMessageReference).toHaveBeenCalledWith(42n, "session-1", {
      chatId: "42",
      messageId: 10
    });
  });

  it("records the new reply message when a stale combat-lock callback falls back to sendMessage", async () => {
    rememberLatestMessageForChat(42, 12);
    const markAction = vi.fn(() => Promise.resolve());
    const recordPersistentFightMessageReference = vi.fn(() => Promise.resolve());
    const calls = await captureApiCalls(
      makePlaceCallbackData("hall"),
      servicesWith({
        fight: {
          recordPersistentFightMessageReference,
          getFightOverviewForTelegramUser: () =>
            Promise.resolve({
              state: "persistent-active" as const,
              character,
              session: {
                ...persistentSession("monster.deadline-spider"),
                state: {
                  ...persistentSession("monster.deadline-spider").state,
                  source: "adventure",
                  originLocationId: "location.korchma.quest_table"
                }
              },
              monster: {
                id: "monster.deadline-spider",
                name: "Павук дедлайнів",
                description: "Плете павутину з «сьогодні швиденько».",
                level: 2,
                tags: ["beast", "time", "web"]
              },
              questProgress: null
            })
        },
        presence: {
          markAction
        }
      }),
      { messageResults: true }
    );
    const reply = calls.find(
      (call) =>
        call.method === "sendMessage" &&
        String(call.payload.text).includes("⚔️ <b>Бій тримає вас за рукав</b>")
    );

    expect(calls.some((call) => call.method === "editMessageText")).toBe(false);
    expect(reply?.payload.parse_mode).toBe("HTML");
    expect(JSON.stringify(reply?.payload.reply_markup)).toContain("v1:fight:turn:");
    expect(markAction).toHaveBeenCalledWith(
      expect.objectContaining({
        locationId: "location.korchma.quest_table",
        currentAdventureId: "adventure.solo-fight"
      })
    );
    expect(recordPersistentFightMessageReference).toHaveBeenCalledWith(42n, "session-1", {
      chatId: "42",
      messageId: 3
    });
    expect(recordPersistentFightMessageReference).not.toHaveBeenCalledWith(42n, "session-1", {
      chatId: "42",
      messageId: 10
    });
  });

  it("does not record a fabricated combat-lock reference when stale fallback delivery fails", async () => {
    rememberLatestMessageForChat(42, 12);
    const recordPersistentFightMessageReference = vi.fn(() => Promise.resolve());

    await expect(
      captureApiCalls(
        makePlaceCallbackData("hall"),
        servicesWith({
          fight: {
            recordPersistentFightMessageReference,
            getFightOverviewForTelegramUser: () =>
              Promise.resolve({
                state: "persistent-active" as const,
                character,
                session: persistentSession("monster.deadline-spider"),
                monster: {
                  id: "monster.deadline-spider",
                  name: "Павук дедлайнів",
                  description: "Плете павутину з «сьогодні швиденько».",
                  level: 2,
                  tags: ["beast", "time", "web"]
                },
                questProgress: null
              })
          }
        }),
        { failSendMessage: true }
      )
    ).rejects.toThrow("send failed");

    expect(recordPersistentFightMessageReference).not.toHaveBeenCalled();
  });

  it("records a combat-lock reply as the active persistent fight card", async () => {
    const recordPersistentFightMessageReference = vi.fn(() => Promise.resolve());
    const calls = await captureTextApiCalls(
      "/fight",
      servicesWith({
        fight: {
          recordPersistentFightMessageReference,
          getFightOverviewForTelegramUser: () =>
            Promise.resolve({
              state: "persistent-active" as const,
              character,
              session: persistentSession("monster.deadline-spider"),
              monster: {
                id: "monster.deadline-spider",
                name: "Павук дедлайнів",
                description: "Плете павутину з «сьогодні швиденько».",
                level: 2,
                tags: ["beast", "time", "web"]
              },
              questProgress: null
            })
        }
      }),
      { asCommand: true, messageResults: true }
    );
    const reply = calls.find((call) => call.method === "sendMessage");

    expect(String(reply?.payload.text)).toContain("⚔️ <b>Бій тримає вас за рукав</b>");
    expect(recordPersistentFightMessageReference).toHaveBeenCalledWith(42n, "session-1", {
      chatId: "42",
      messageId: 2
    });
  });

  it.each([
    mainMenuButtons.tavern,
    mainMenuButtons.quest,
    mainMenuLocationButtons.deepLeft
  ])("keeps main-menu text %s inside an active persistent fight", async (text) => {
    const calls = await captureTextApiCalls(
      text,
      servicesWith({
        fight: {
          getFightOverviewForTelegramUser: () =>
            Promise.resolve({
              state: "persistent-active" as const,
              character,
              session: persistentSession("monster.deadline-spider"),
              monster: {
                id: "monster.deadline-spider",
                name: "Павук дедлайнів",
                description: "Плете павутину з «сьогодні швиденько».",
                level: 2,
                tags: ["beast", "time", "web"]
              },
              questProgress: null
            })
        }
      })
    );
    const reply = calls.find((call) => call.method === "sendMessage");

    expect(String(reply?.payload.text)).toContain("⚔️ <b>Бій тримає вас за рукав</b>");
    expect(String(reply?.payload.text)).toContain("❤️ Ви:");
    expect(String(reply?.payload.text)).toContain("⏳ На хід є 23 секунди.");
  });

  it("opens the current place from the persistent location reply button", async () => {
    const markAction = vi.fn(() => Promise.resolve());
    const calls = await captureTextApiCalls(
      mainMenuLocationButtons.bar,
      servicesWith({
        presence: {
          markAction,
          getRaidParticipantsForTelegramUser: () =>
            Promise.resolve({ state: "no-character" }),
          getAdventureParticipantsForTelegramUser: () =>
            Promise.resolve({ state: "no-character" }),
          getCurrentPlaceForTelegramUser: () =>
            Promise.resolve({
              state: "ready",
              locationId: "location.korchma.bar",
              locationName: "Шинок",
              insideKorchma: true
            }),
          getOnlineForTelegramUser: () => Promise.resolve({ state: "no-character" }),
          getLookForTelegramUser: () => Promise.resolve({ state: "no-character" })
        },
        tavern: {
          getTavernForTelegramUser: () => Promise.resolve({ state: "ready", character }),
          completeFridayBarrelRaid: () => Promise.resolve({ state: "no-character" }),
          advanceFridayBarrelRaid: () => Promise.resolve({ state: "no-character" }),
          getActivePendingFridayBarrelRaidForTelegramUser: () =>
            Promise.resolve({ state: "none" })
        },
        fight: {
          getProblemQuestProgressForTelegramUser: () => Promise.resolve({ state: "no-character" })
        }
      })
    );
    const reply = calls.find((call) => call.method === "sendMessage");
    const keyboard = JSON.stringify(reply?.payload.reply_markup);

    expect(markAction).toHaveBeenCalledWith(
      expect.objectContaining({
        locationId: "location.korchma.bar",
        currentRaidId: null,
        currentAdventureId: null
      })
    );
    expect(String(reply?.payload.text)).toContain("🍻 Шинок");
    expect(keyboard).toContain("🍹 Напої для себе");
    expect(keyboard).toContain("v1:sh:dr");
  });

  it("reopens an active daily Korchma round scene from the persistent location reply button", async () => {
    const markAction = vi.fn(() => Promise.resolve());
    const cellarErrandLookup = vi.fn(() => Promise.resolve({ state: "no-character" as const }));
    const level3Character = {
      ...character,
      level: 3,
      hpCurrent: 24,
      hpMax: 24,
      manaCurrent: 12,
      manaMax: 12
    };
    const cellarScene = {
      id: "scene.cellar.inventory-bottle",
      icon: "🍾",
      title: "Пляшка шепоче інвентаризацію",
      locationId: "location.korchma.cellar",
      hook: "У льосі пляшка шепоче номери, яких немає в жодному списку, і явно насолоджується процесом.",
      actions: [
        {
          id: "repeat-last",
          label: "🔁 Повторити останній",
          outcome: "Пляшка повторила останній номер і підозріло задзвеніла."
        },
        {
          id: "turn-to-wall",
          label: "🧱 Розвернути до стіни",
          outcome: "Пляшка образилась на стіну, але список став коротшим."
        },
        {
          id: "mark-empty",
          label: "✅ Позначити порожньою",
          outcome: "Порожнечу зараховано. Пляшка виглядає бухгалтерськи переможеною."
        }
      ]
    };
    const offer = {
      dayKey: "2026-06-28",
      dayToken: "20260628",
      lifeToken: 0,
      requiredSteps: 2,
      scenes: [cellarScene],
      completedSceneIds: [],
      omittedSceneId: null
    };
    const openScene = vi.fn(() =>
      Promise.resolve({
        state: "scene" as const,
        character: level3Character,
        offer,
        scene: cellarScene,
        sceneIndex: 0,
        alreadyCompleted: false,
        locked: false
      })
    );
    const calls = await captureTextApiCalls(
      mainMenuLocationButtons.cellar,
      servicesWith({
        cellarErrand: {
          getForTelegramUser: cellarErrandLookup,
          complete: () => Promise.resolve({ state: "no-character" as const })
        },
        dailyKorchmaRound: {
          getExistingForTelegramUser: () =>
            Promise.resolve({
              state: "ready" as const,
              character: level3Character,
              offer
            }),
          openScene
        },
        presence: {
          markAction,
          getRaidParticipantsForTelegramUser: () =>
            Promise.resolve({ state: "no-character" as const }),
          getAdventureParticipantsForTelegramUser: () =>
            Promise.resolve({ state: "no-character" as const }),
          getCurrentPlaceForTelegramUser: () =>
            Promise.resolve({
              state: "ready" as const,
              locationId: "location.korchma.cellar",
              locationName: "Льох корчми",
              insideKorchma: true
            }),
          getOnlineForTelegramUser: () => Promise.resolve({ state: "no-character" as const }),
          getLookForTelegramUser: () => Promise.resolve({ state: "no-character" as const })
        }
      })
    );
    const reply = calls.find(
      (call) => call.method === "sendMessage" && String(call.payload.text).includes("🍾 Пляшка шепоче інвентаризацію")
    );
    const keyboard = JSON.stringify(reply?.payload.reply_markup);

    expect(openScene).toHaveBeenCalledWith(42n, {
      dayToken: "20260628",
      sceneIndex: 0
    });
    expect(cellarErrandLookup).not.toHaveBeenCalled();
    expect(markAction).toHaveBeenCalledWith(
      expect.objectContaining({
        locationId: "location.korchma.cellar",
        currentRaidId: null,
        currentAdventureId: null
      })
    );
    expect(String(reply?.payload.text)).toContain("🍾 Пляшка шепоче інвентаризацію");
    expect(String(reply?.payload.text)).not.toContain("Льох тимчасово тихий");
    expect(keyboard).toContain("v1:dkr:a:20260628:0:repeat-last:0");
  });

  it("opens an active daily Korchma round scene after physical cellar place navigation", async () => {
    const markAction = vi.fn(() => Promise.resolve());
    const cellarErrandLookup = vi.fn(() => Promise.resolve({ state: "no-character" as const }));
    const level3Character = {
      ...character,
      level: 3,
      hpCurrent: 24,
      hpMax: 24,
      manaCurrent: 12,
      manaMax: 12
    };
    const cellarScene = {
      id: "scene.cellar.inventory-bottle",
      icon: "🍾",
      title: "Пляшка шепоче інвентаризацію",
      locationId: "location.korchma.cellar",
      hook: "У льосі пляшка шепоче номери, яких немає в жодному списку, і явно насолоджується процесом.",
      actions: [
        {
          id: "repeat-last",
          label: "🔁 Повторити останній",
          outcome: "Пляшка повторила останній номер і підозріло задзвеніла."
        },
        {
          id: "turn-to-wall",
          label: "🧱 Розвернути до стіни",
          outcome: "Пляшка образилась на стіну, але список став коротшим."
        },
        {
          id: "mark-empty",
          label: "✅ Позначити порожньою",
          outcome: "Порожнечу зараховано. Пляшка виглядає бухгалтерськи переможеною."
        }
      ]
    };
    const offer = {
      dayKey: "2026-06-28",
      dayToken: "20260628",
      lifeToken: 0,
      requiredSteps: 2,
      scenes: [cellarScene],
      completedSceneIds: [],
      omittedSceneId: null
    };
    const openScene = vi.fn(() =>
      Promise.resolve({
        state: "scene" as const,
        character: level3Character,
        offer,
        scene: cellarScene,
        sceneIndex: 0,
        alreadyCompleted: false,
        locked: false
      })
    );
    const calls = await captureApiCalls(
      makePlaceCallbackData("cellar"),
      servicesWith({
        cellarErrand: {
          getForTelegramUser: cellarErrandLookup,
          complete: () => Promise.resolve({ state: "no-character" as const })
        },
        dailyKorchmaRound: {
          getExistingForTelegramUser: () =>
            Promise.resolve({
              state: "ready" as const,
              character: level3Character,
              offer
            }),
          openScene
        },
        presence: {
          markAction,
          getRaidParticipantsForTelegramUser: () =>
            Promise.resolve({ state: "no-character" as const }),
          getAdventureParticipantsForTelegramUser: () =>
            Promise.resolve({ state: "no-character" as const }),
          getCurrentPlaceForTelegramUser: () =>
            Promise.resolve({
              state: "ready" as const,
              locationId: "location.korchma.hall",
              locationName: "Зала корчми",
              insideKorchma: true
            }),
          getOnlineForTelegramUser: () => Promise.resolve({ state: "no-character" as const }),
          getLookForTelegramUser: () => Promise.resolve({ state: "no-character" as const })
        }
      })
    );
    const scene = calls.find(
      (call) =>
        call.method === "sendMessage" &&
        String(call.payload.text).includes("🍾 Пляшка шепоче інвентаризацію")
    );
    const keyboard = JSON.stringify(scene?.payload.reply_markup);

    expect(openScene).toHaveBeenCalledWith(42n, {
      dayToken: "20260628",
      sceneIndex: 0
    });
    expect(cellarErrandLookup).not.toHaveBeenCalled();
    expect(markAction).toHaveBeenCalledWith(
      expect.objectContaining({
        locationId: "location.korchma.cellar",
        currentRaidId: null,
        currentAdventureId: null
      })
    );
    expect(scene).toBeDefined();
    expect(calls.map((call) => String(call.payload.text))).not.toContain("Льох тимчасово тихий.");
    expect(keyboard).toContain("v1:dkr:a:20260628:0:repeat-last:0");
  });

  it("opens an active daily Korchma round scene after physical quest-table place navigation", async () => {
    const markAction = vi.fn(() => Promise.resolve());
    const level3Character = {
      ...character,
      level: 3,
      hpCurrent: 24,
      hpMax: 24,
      manaCurrent: 12,
      manaMax: 12
    };
    const questTableScene = {
      id: "scene.quest-table.ink",
      icon: "ink",
      title: "Ink needs a signature",
      locationId: "location.korchma.quest_table",
      hook: "The ink has a mood and no signature.",
      actions: [
        {
          id: "sign-ink",
          label: "Sign the ink",
          outcome: "The ink accepted the signature and stopped supervising the table."
        },
        {
          id: "dry-ink",
          label: "Dry the ink",
          outcome: "The ink became paperwork."
        }
      ]
    };
    const offer = {
      dayKey: "2026-06-28",
      dayToken: "20260628",
      lifeToken: 0,
      requiredSteps: 2,
      scenes: [questTableScene],
      completedSceneIds: [],
      omittedSceneId: null
    };
    const openScene = vi.fn(() =>
      Promise.resolve({
        state: "scene" as const,
        character: level3Character,
        offer,
        scene: questTableScene,
        sceneIndex: 0,
        alreadyCompleted: false,
        locked: false
      })
    );
    const calls = await captureApiCalls(
      makePlaceCallbackData("quest-table"),
      servicesWith({
        dailyKorchmaRound: {
          getExistingForTelegramUser: () =>
            Promise.resolve({
              state: "ready" as const,
              character: level3Character,
              offer
            }),
          openScene
        },
        presence: {
          markAction,
          getRaidParticipantsForTelegramUser: () =>
            Promise.resolve({ state: "no-character" as const }),
          getAdventureParticipantsForTelegramUser: () =>
            Promise.resolve({ state: "no-character" as const }),
          getCurrentPlaceForTelegramUser: () =>
            Promise.resolve({
              state: "ready" as const,
              locationId: "location.korchma.hall",
              locationName: "Зала корчми",
              insideKorchma: true
            }),
          getOnlineForTelegramUser: () => Promise.resolve({ state: "no-character" as const }),
          getLookForTelegramUser: () => Promise.resolve({ state: "no-character" as const })
        }
      })
    );
    const scene = calls.find(
      (call) => call.method === "sendMessage" && String(call.payload.text).includes("Ink needs a signature")
    );
    const keyboard = JSON.stringify(scene?.payload.reply_markup);

    expect(openScene).toHaveBeenCalledWith(42n, {
      dayToken: "20260628",
      sceneIndex: 0
    });
    expect(markAction).toHaveBeenCalledWith(
      expect.objectContaining({
        locationId: "location.korchma.quest_table",
        currentRaidId: null,
        currentAdventureId: null
      })
    );
    expect(scene).toBeDefined();
    expect(keyboard).toContain("v1:dkr:a:20260628:0:sign-ink:0");
  });

  it("falls through to ordinary location content when no daily Korchma offer was issued yet", async () => {
    const markAction = vi.fn(() => Promise.resolve());
    const getExistingForTelegramUser = vi.fn(() =>
      Promise.resolve({
        state: "not-issued" as const,
        character: {
          ...character,
          level: 3
        },
        dayToken: "20260628"
      })
    );
    const openScene = vi.fn(() => Promise.resolve({ state: "no-character" as const }));
    const cellarErrandLookup = vi.fn(() => Promise.resolve({ state: "ready" as const, character }));
    const calls = await captureTextApiCalls(
      mainMenuLocationButtons.cellar,
      servicesWith({
        cellarErrand: {
          getForTelegramUser: cellarErrandLookup,
          complete: () => Promise.resolve({ state: "no-character" as const })
        },
        dailyKorchmaRound: {
          getExistingForTelegramUser,
          openScene
        },
        presence: {
          markAction,
          getRaidParticipantsForTelegramUser: () =>
            Promise.resolve({ state: "no-character" as const }),
          getAdventureParticipantsForTelegramUser: () =>
            Promise.resolve({ state: "no-character" as const }),
          getCurrentPlaceForTelegramUser: () =>
            Promise.resolve({
              state: "ready" as const,
              locationId: "location.korchma.cellar",
              locationName: "Льох корчми",
              insideKorchma: true
            }),
          getOnlineForTelegramUser: () => Promise.resolve({ state: "no-character" as const }),
          getLookForTelegramUser: () => Promise.resolve({ state: "no-character" as const })
        }
      })
    );
    const reply = calls.find((call) => call.method === "sendMessage" && String(call.payload.text).includes("🐭 Льохова справа"));

    expect(getExistingForTelegramUser).toHaveBeenCalledWith(42n);
    expect(openScene).not.toHaveBeenCalled();
    expect(cellarErrandLookup).toHaveBeenCalledWith(42n);
    expect(String(reply?.payload.text)).toContain("🐭 Льохова справа");
    expect(calls.some((call) => String(call.payload.text).includes("🍾 Пляшка шепоче інвентаризацію"))).toBe(false);
    expect(markAction).toHaveBeenCalledWith(
      expect.objectContaining({
        locationId: "location.korchma.cellar",
        currentRaidId: null,
        currentAdventureId: "adventure.cellar.mouse-errand"
      })
    );
  });

  it("opens an active daily Korchma round scene after physical yard place navigation", async () => {
    const markAction = vi.fn(() => Promise.resolve());
    const level3Character = {
      ...character,
      level: 3,
      hpCurrent: 24,
      hpMax: 24,
      manaCurrent: 12,
      manaMax: 12
    };
    const yardScene = {
      id: "scene.yard.rope",
      icon: "bucket",
      title: "Rope tied up the unanswered question",
      locationId: "location.korchma.yard",
      hook: "The rope insists this is a meeting, not a knot.",
      actions: [
        {
          id: "untie-agenda",
          label: "Untie the agenda",
          outcome: "The agenda apologized and became a rope again."
        },
        {
          id: "ask-bucket",
          label: "Ask the bucket",
          outcome: "The bucket declined to chair the committee."
        },
        {
          id: "label-knot",
          label: "Label the knot",
          outcome: "The knot accepted the label and stopped escalating."
        }
      ]
    };
    const offer = {
      dayKey: "2026-06-28",
      dayToken: "20260628",
      lifeToken: 0,
      requiredSteps: 2,
      scenes: [yardScene],
      completedSceneIds: [],
      omittedSceneId: null
    };
    const openScene = vi.fn(() =>
      Promise.resolve({
        state: "scene" as const,
        character: level3Character,
        offer,
        scene: yardScene,
        sceneIndex: 0,
        alreadyCompleted: false,
        locked: false
      })
    );
    const calls = await captureApiCalls(
      makePlaceCallbackData("yard"),
      servicesWith({
        dailyKorchmaRound: {
          getExistingForTelegramUser: () =>
            Promise.resolve({
              state: "ready" as const,
              character: level3Character,
              offer
            }),
          openScene
        },
        presence: {
          markAction,
          getRaidParticipantsForTelegramUser: () =>
            Promise.resolve({ state: "no-character" as const }),
          getAdventureParticipantsForTelegramUser: () =>
            Promise.resolve({ state: "no-character" as const }),
          getCurrentPlaceForTelegramUser: () =>
            Promise.resolve({
              state: "ready" as const,
              locationId: "location.korchma.front",
              locationName: "Перед корчмою",
              insideKorchma: false
            }),
          getOnlineForTelegramUser: () => Promise.resolve({ state: "no-character" as const }),
          getLookForTelegramUser: () => Promise.resolve({ state: "no-character" as const })
        }
      })
    );
    const scene = calls.find(
      (call) =>
        call.method === "sendMessage" &&
        String(call.payload.text).includes("Rope tied up the unanswered question")
    );
    const keyboard = JSON.stringify(scene?.payload.reply_markup);

    expect(openScene).toHaveBeenCalledWith(42n, {
      dayToken: "20260628",
      sceneIndex: 0
    });
    expect(markAction).toHaveBeenCalledWith(
      expect.objectContaining({
        locationId: "location.korchma.yard",
        currentRaidId: null,
        currentAdventureId: null
      })
    );
    expect(scene).toBeDefined();
    expect(keyboard).toContain("v1:dkr:a:20260628:0:untie-agenda:0");
  });

  it("opens an active daily Korchma round scene from the tavern ranger route", async () => {
    const markAction = vi.fn(() => Promise.resolve());
    const yegerLookup = vi.fn(() => Promise.resolve({ state: "no-character" as const }));
    const level3Character = {
      ...character,
      level: 3,
      hpCurrent: 24,
      hpMax: 24,
      manaCurrent: 12,
      manaMax: 12
    };
    const rangerScene = {
      id: "scene.ranger.sneezing-map",
      icon: "map",
      title: "Map sneezed in the wrong direction",
      locationId: "location.korchma.ranger_corner",
      hook: "The map insists the table moved first.",
      actions: [
        {
          id: "fold-north",
          label: "Fold north",
          outcome: "North accepted the paperwork."
        },
        {
          id: "mark-crumbs",
          label: "Mark crumbs",
          outcome: "The crumbs formed a route."
        },
        {
          id: "ask-yeger",
          label: "Ask Yeger",
          outcome: "Yeger blamed licensed magic."
        }
      ]
    };
    const offer = {
      dayKey: "2026-06-28",
      dayToken: "20260628",
      lifeToken: 0,
      requiredSteps: 2,
      scenes: [rangerScene],
      completedSceneIds: [],
      omittedSceneId: null
    };
    const openScene = vi.fn(() =>
      Promise.resolve({
        state: "scene" as const,
        character: level3Character,
        offer,
        scene: rangerScene,
        sceneIndex: 0,
        alreadyCompleted: false,
        locked: false
      })
    );
    const calls = await captureApiCalls(
      makeTavernCallbackData("ranger"),
      servicesWith({
        dailyKorchmaRound: {
          getExistingForTelegramUser: () =>
            Promise.resolve({
              state: "ready" as const,
              character: level3Character,
              offer
            }),
          openScene
        },
        yeger: {
          getHuntBoardForTelegramUser: yegerLookup,
          completeHuntContract: () => Promise.resolve({ state: "no-character" as const })
        },
        presence: {
          markAction,
          getRaidParticipantsForTelegramUser: () =>
            Promise.resolve({ state: "no-character" as const }),
          getAdventureParticipantsForTelegramUser: () =>
            Promise.resolve({ state: "no-character" as const }),
          getCurrentPlaceForTelegramUser: () =>
            Promise.resolve({
              state: "ready" as const,
              locationId: "location.korchma.deep",
              locationName: "Низ",
              insideKorchma: true
            }),
          getOnlineForTelegramUser: () => Promise.resolve({ state: "no-character" as const }),
          getLookForTelegramUser: () => Promise.resolve({ state: "no-character" as const })
        }
      })
    );
    const scene = calls.find(
      (call) =>
        call.method === "sendMessage" &&
        String(call.payload.text).includes("Map sneezed in the wrong direction")
    );
    const movementNotice = calls.find(
      (call) =>
        call.method === "sendMessage" &&
        String(call.payload.text).includes("Ви підійшли до єгерського кутка.")
    );
    const keyboard = JSON.stringify(scene?.payload.reply_markup);

    expect(openScene).toHaveBeenCalledWith(42n, {
      dayToken: "20260628",
      sceneIndex: 0
    });
    expect(yegerLookup).not.toHaveBeenCalled();
    expect(markAction).toHaveBeenCalledWith(
      expect.objectContaining({
        locationId: "location.korchma.ranger_corner",
        currentRaidId: null,
        currentAdventureId: null
      })
    );
    expect(movementNotice).toBeUndefined();
    expect(scene).toBeDefined();
    expect(keyboard).toContain("v1:dkr:a:20260628:0:fold-north:0");
  });

  it("opens Shynok round preview from completed Barrel shortcut", async () => {
    const markAction = vi.fn(() => Promise.resolve());
    const createRoundOrder = vi.fn(() =>
      Promise.resolve({
        state: "preview" as const,
        character,
        token: "12345678-1234-4234-9234-123456789abc",
        tier: "simple" as const,
        drink: {
          key: "drink.simple-beer" as const,
          name: "Просте пиво",
          emoji: "🍺",
          priceGold: 13,
          durationMinutes: 23,
          recoveryMultiplierBp: 12300,
          accuracyPenaltyPp: 5
        },
        priceGold: 26,
        recipientCount: 2,
        leaderboard: { day: [], week: [], month: [] }
      })
    );
    const calls = await captureApiCalls(
      makeShynokBarrelRoundPreviewCallbackData("simple"),
      servicesWith({
        presence: {
          markAction,
          getRaidParticipantsForTelegramUser: () =>
            Promise.resolve({ state: "no-character" }),
          getAdventureParticipantsForTelegramUser: () =>
            Promise.resolve({ state: "no-character" }),
          getCurrentPlaceForTelegramUser: () =>
            Promise.resolve({
              state: "ready",
              locationId: "location.korchma.barrel",
              locationName: "Біля Бочки Пінного Міражу",
              insideKorchma: true
            }),
          getOnlineForTelegramUser: () => Promise.resolve({ state: "no-character" }),
          getLookForTelegramUser: () => Promise.resolve({ state: "no-character" })
        },
        shynok: {
          createRoundOrderForTelegramUser: createRoundOrder
        }
      })
    );
    const edit = calls.find((call) => call.method === "editMessageText");
    const keyboard = JSON.stringify(edit?.payload.reply_markup);

    expect(markAction).toHaveBeenCalledWith(
      expect.objectContaining({
        locationId: "location.korchma.bar",
        currentRaidId: null,
        currentAdventureId: null
      })
    );
    expect(createRoundOrder).toHaveBeenCalledWith(42n, "simple");
    expect(String(edit?.payload.text)).toContain("🍺 Просте всім");
    expect(String(edit?.payload.text)).toContain("Одержувачів у збереженому списку: <b>2</b>");
    expect(String(edit?.payload.text)).not.toContain("несвіжий");
    expect(keyboard).toContain("v1:sh:rc:simple:12345678-1234-4234-9234-123456789abc");
  });

  it("refreshes quest markers after a Shynok beer drink completes Barrel tutorial drink progress", async () => {
    let drinkMarked = false;
    const markBeerDrunkForTelegramUser = vi.fn(() => {
      drinkMarked = true;
      return Promise.resolve();
    });
    const getBarrelBeerTutorial = vi.fn(() =>
      Promise.resolve({
        state: drinkMarked ? "turn-in-ready" as const : "in-progress" as const,
        character: { ...character, level: 2 },
        progress: {
          ...barrelBeerTutorialProgress(true, "location.korchma.bar"),
          beerDrunk: drinkMarked,
          activeBeer: drinkMarked
        }
      })
    );

    const calls = await captureApiCalls(
      makeShynokDrinkConfirmCallbackData("12345678-1234-4234-9234-123456789abc"),
      servicesWith({
        shynok: {
          confirmSelfDrinkOrderForTelegramUser: () =>
            Promise.resolve({
              state: "completed" as const,
              character,
              drink: {
                key: "drink.simple-beer" as const,
                name: "Просте пиво",
                emoji: "🍺",
                priceGold: 13,
                durationMinutes: 23,
                recoveryMultiplierBp: 12300,
                accuracyPenaltyPp: 5,
                phase: "timed" as const,
                startedAt: new Date("2026-06-24T11:00:00.000Z"),
                expiresAt: new Date("2026-06-24T11:23:00.000Z")
              },
              spentGold: 13
            })
        },
        fight: questMarkerFightService(),
        yeger: questMarkerYegerService(),
        barrelBeerTutorial: {
          markBeerDrunkForTelegramUser,
          getForTelegramUser: getBarrelBeerTutorial
        }
      })
    );
    const edit = calls.find((call) => call.method === "editMessageText");

    expect(markBeerDrunkForTelegramUser).toHaveBeenCalledWith(42n);
    expect(getBarrelBeerTutorial).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(edit?.payload.reply_markup)).toContain("⬅️ До зали ✅");
  });

  it("notifies round recipients when a Shynok round is placed", async () => {
    const calls = await captureApiCalls(
      makeShynokRoundConfirmCallbackData("simple", "12345678-1234-4234-9234-123456789abc"),
      servicesWith({
        shynok: {
          confirmRoundOrderForTelegramUser: () =>
            Promise.resolve({
              state: "completed",
              character,
              tier: "simple",
              priceGold: 26,
              recipientCount: 2,
              recipients: [{
                telegramUserId: 93n,
                name: "Сусідній Пригодник",
                offer: {
                  id: "round-offer-93",
                  drink: {
                    key: "drink.simple-beer",
                    name: "Просте пиво",
                    emoji: "🍺",
                    priceGold: 13,
                    durationMinutes: 23,
                    recoveryMultiplierBp: 12300,
                    accuracyPenaltyPp: 5
                  },
                  expiresAt: new Date("2026-06-24T11:05:00.000Z")
                }
              }],
              leaderboard: { day: [], week: [], month: [] }
            })
        }
      }),
      { messageResults: true }
    );
    const recipientMessage = calls.find((call) =>
      call.method === "sendMessage" && call.payload.chat_id === 93
    );

    expect(String(recipientMessage?.payload.text)).toContain("<b>Мандрівник</b> ставить вам <b>Просте пиво</b>");
    expect(JSON.stringify(recipientMessage?.payload.reply_markup)).toContain("v1:sh:ra:round-offer-93");
    expect(JSON.stringify(recipientMessage?.payload.reply_markup)).toContain("v1:sh:rd:round-offer-93");
  });

  it("does not notify round recipients again on replayed Shynok round confirm", async () => {
    const calls = await captureApiCalls(
      makeShynokRoundConfirmCallbackData("simple", "12345678-1234-4234-9234-123456789abc"),
      servicesWith({
        shynok: {
          confirmRoundOrderForTelegramUser: () =>
            Promise.resolve({
              state: "replayed",
              character,
              tier: "simple",
              priceGold: 26,
              recipientCount: 2,
              recipients: [],
              leaderboard: { day: [], week: [], month: [] }
            })
        }
      }),
      { messageResults: true }
    );

    expect(calls.some((call) => call.method === "sendMessage")).toBe(false);
  });

  it("marks the legacy Tavern beer round path as Barrel tutorial round progress", async () => {
    const markBeerRoundOfferedForTelegramUser = vi.fn(() => Promise.resolve());
    const calls = await captureApiCalls(
      makeTavernCallbackData("round-simple"),
      servicesWith({
        tavern: {
          buyRoundForTelegramUser: () =>
            Promise.resolve({
              state: "simple-round" as const,
              character,
              spentGold: 10,
              remainingGold: 32,
              leaderboard: { day: [], week: [], month: [] },
              becameLeader: []
            })
        },
        fight: questMarkerFightService(),
        yeger: questMarkerYegerService(),
        barrelBeerTutorial: {
          markBeerRoundOfferedForTelegramUser,
          getForTelegramUser: () =>
            Promise.resolve({
              state: "in-progress" as const,
              character: { ...character, level: 2 },
              progress: barrelBeerTutorialProgress(true, "location.korchma.bar")
            })
        }
      })
    );
    const edit = calls.find((call) => call.method === "editMessageText");

    expect(markBeerRoundOfferedForTelegramUser).toHaveBeenCalledWith(42n);
    expect(String(edit?.payload.text)).toContain("Всім простого пива");
  });

  it("shows player gold on the Doppelganger stake picker callback", async () => {
    const getHub = vi.fn(() =>
      Promise.resolve({
        state: "ready" as const,
        maxStake: 93,
        tavleiEnabled: true,
        kostiEnabled: true,
        doppelgangerAvailable: true,
        character: { gold: 42 },
        openTables: []
      })
    );
    const calls = await captureApiCalls(
      makeShynokDoppelgangerModeCallbackData("quick"),
      servicesWith({
        shynok: {},
        tavernGames: {
          isDoppelgangerAtShynok: () => true,
          getMaxStake: () => 93,
          getHub,
          isTavleiEnabled: () => true,
          isKostiEnabled: () => true
        } as never
      })
    );
    const edit = calls.find((call) => call.method === "editMessageText");

    expect(getHub).toHaveBeenCalledWith(42n);
    expect(String(edit?.payload.text)).toContain("⚡ Швидкі кості з Допельґанґером");
    expect(String(edit?.payload.text)).toContain("Межа ставки зараз: <b>93 зол.</b>");
    expect(String(edit?.payload.text)).toContain("У тебе зараз: <b>42 зол.</b>");
  });

  it("notifies existing tavern game participants when another player joins", async () => {
    const session = tavernGameSession({
      status: "ready",
      participants: [
        tavernGameParticipant(93n, "character-creator", "Kyjivan BooksDragon", "joined", null),
        tavernGameParticipant(42n, "character-joiner", "Shannar de Kassal", "joined", null)
      ]
    });

    const calls = await captureApiCalls(
      makeShynokGameJoinCallbackData("12345678-1234-4234-9234-123456789abc"),
      servicesWith({
        shynok: {},
        tavernGames: {
          joinByTokenForTelegramUser: () => Promise.resolve({ state: "joined", session })
        } as never
      })
    );

    const notification = calls.find((call) =>
      call.method === "sendMessage" && call.payload.chat_id === 93
    );
    expect(notification?.payload.text).toContain("♟ Тавлеї · ставка <b>1 зол.</b>");
    expect(notification?.payload.text).toContain([
      "♟ Тавлеї · ставка <b>1 зол.</b>",
      "",
      "За столом: <b>Kyjivan BooksDragon</b>, <b>Shannar de Kassal</b>",
      "Банк: <b>2 зол.</b>",
      "",
      "Оберіть тактику."
    ].join("\n"));
    expect(notification?.payload.text).toContain("Оберіть тактику.");
    expect(JSON.stringify(notification?.payload.reply_markup)).toContain("v1:sh:gt:12345678-1234-4234-9234-123456789abc");
    expect(JSON.stringify(notification?.payload.reply_markup)).toContain("v1:sh:gm");
  });

  it("notifies other Kosti participants when a player chooses dice options", async () => {
    const session = tavernGameSession({
      gameKey: "kosti",
      status: "open",
      participants: [
        tavernGameParticipant(93n, "character-creator", "Kyjivan BooksDragon", "joined", null),
        tavernGameParticipant(42n, "character-joiner", "Shannar de Kassal", "decided", {
          gameKey: "kosti",
          style: "steady",
          sign: "two_pairs"
        })
      ]
    });

    const calls = await captureApiCalls(
      makeShynokKostiDecisionCallbackData("12345678-1234-4234-9234-123456789abc", "steady", "two_pairs"),
      servicesWith({
        shynok: {},
        tavernGames: {
          submitKostiDecisionForTelegramUser: () => Promise.resolve({ state: "decided", session })
        } as never
      })
    );

    const notification = calls.find((call) =>
      call.method === "sendMessage" && call.payload.chat_id === 93
    );
    expect(notification?.payload.text).toContain("За столом зроблено вибір.");
    expect(notification?.payload.text).toContain("🎲 Кості · ставка <b>1 зол.</b>");
    expect(notification?.payload.text).toContain("За столом: <b>Kyjivan BooksDragon</b>, <b>Shannar de Kassal</b>");
    expect(JSON.stringify(notification?.payload.reply_markup)).toContain("v1:sh:gk:12345678-1234-4234-9234-123456789abc");
    expect(JSON.stringify(notification?.payload.reply_markup)).toContain("v1:sh:gm");
  });

  it("notifies other quick dice participants with the terminal table result", async () => {
    const token = "12345678-1234-4234-9234-123456789abc";
    const firstPlayer = tavernGameParticipant(93n, "character-creator", "Shannar de Kassal", "completed", {
      ...startQuickDicePoker("quick-social-creator"),
      phase: "terminal"
    });
    const secondPlayer = tavernGameParticipant(42n, "character-joiner", "Kyjivan BooksDragon", "completed", {
      ...startQuickDicePoker("quick-social-joiner"),
      phase: "terminal"
    });
    const session = tavernGameSession({
      gameKey: "kosti",
      status: "completed",
      stakeGold: 13,
      potGold: 26,
      rulesVersion: "dice-poker-v1",
      result: {
        kind: "dice_poker_table",
        mode: "quick",
        phase: "terminal",
        playerCap: 8,
        drawRound: 1,
        outcomes: {
          "character-creator": "win",
          "character-joiner": "loss"
        }
      },
      participants: [
        {
          ...firstPlayer,
          stakeGold: 13,
          payoutGold: 26,
          character: {
            ...firstPlayer.character,
            activeCosmeticTitleGrantId: "cosmetic-title.level-two-stool"
          }
        },
        {
          ...secondPlayer,
          stakeGold: 13,
          payoutGold: 0,
          character: {
            ...secondPlayer.character,
            activeCosmeticTitleGrantId: "cosmetic-title.first-problem-clerk"
          }
        }
      ]
    });

    const calls = await captureApiCalls(
      makeShynokDicePokerRollCallbackData(token),
      servicesWith({
        shynok: {},
        tavernGames: {
          rollDicePokerForTelegramUser: () => Promise.resolve({
            state: "completed",
            session,
            dicePoker: secondPlayer.decision
          })
        } as never
      })
    );

    const notification = calls.find((call) =>
      call.method === "sendMessage" && call.payload.chat_id === 93
    );
    const keyboard = JSON.stringify(notification?.payload.reply_markup);

    expect(notification?.payload.text).toContain("⚡ Швидкі кості");
    expect(notification?.payload.text).toContain(
      "<b>Shannar de Kassal</b> (<i>«Табуретник»</i>): 3 2 1 6 5 — Старша кістка 6.\n🏆 перемога · виплата <b>26 зол.</b>\n\n<b>Kyjivan BooksDragon</b> (<i>«Перший писар»</i>): 2 3 6 1 4 — Старша кістка 6.\n💀 поразка"
    );
    expect(notification?.payload.text).toContain("Причина: старші значення в комбінації «Старша кістка» вирішили партію.");
    expect(keyboard).toContain("v1:sh:grm:12345678-1234-4234-9234-123456789abc");
    expect(keyboard).not.toContain(":gdr:");
    expect(keyboard).not.toContain(":gdt:");
    expect(keyboard).not.toContain(":gds:");
  });

  it("opens the pressed location label when the persistent reply keyboard is stale", async () => {
    const markAction = vi.fn(() => Promise.resolve());
    const calls = await captureTextApiCalls(
      mainMenuLocationButtons.deep,
      servicesWith({
        presence: {
          markAction,
          getRaidParticipantsForTelegramUser: () =>
            Promise.resolve({ state: "no-character" }),
          getAdventureParticipantsForTelegramUser: () =>
            Promise.resolve({ state: "no-character" }),
          getCurrentPlaceForTelegramUser: () =>
            Promise.resolve({
              state: "ready",
              locationId: "location.korchma.quest_table",
              locationName: "Стіл зі справами",
              insideKorchma: true
            }),
          getOnlineForTelegramUser: () => Promise.resolve({ state: "no-character" }),
          getLookForTelegramUser: () => Promise.resolve({ state: "no-character" })
        },
        tavern: {
          getTavernForTelegramUser: () =>
            Promise.resolve({ state: "ready", character: { ...character, level: 3 } }),
          completeFridayBarrelRaid: () => Promise.resolve({ state: "no-character" }),
          advanceFridayBarrelRaid: () => Promise.resolve({ state: "no-character" }),
          getActivePendingFridayBarrelRaidForTelegramUser: () =>
            Promise.resolve({ state: "none" })
        },
        fight: {
          getProblemQuestProgressForTelegramUser: () => Promise.resolve({ state: "no-character" })
        }
      })
    );
    const reply = calls.find(
      (call) => call.method === "sendMessage" && String(call.payload.text).includes("🪜 Спуск до Низу")
    );

    expect(markAction).toHaveBeenCalledWith(
      expect.objectContaining({
        locationId: "location.korchma.deep",
        currentRaidId: null,
        currentAdventureId: null
      })
    );
    expect(String(reply?.payload.text)).toContain("🪜 Спуск до Низу");
    expect(String(reply?.payload.text)).not.toContain("📋 Стіл зі справами");
  });

  it("sends the movement notice before opening a pressed cellar location label", async () => {
    const markAction = vi.fn(() => Promise.resolve());
    const calls = await captureTextApiCalls(
      mainMenuLocationButtons.cellar,
      servicesWith({
        cellarErrand: {
          getForTelegramUser: () => Promise.resolve({ state: "ready" as const, character }),
          complete: () => Promise.resolve({ state: "no-character" as const })
        },
        presence: {
          markAction,
          getRaidParticipantsForTelegramUser: () =>
            Promise.resolve({ state: "no-character" as const }),
          getAdventureParticipantsForTelegramUser: () =>
            Promise.resolve({ state: "no-character" as const }),
          getCurrentPlaceForTelegramUser: () =>
            Promise.resolve({
              state: "ready" as const,
              locationId: "location.korchma.hall",
              locationName: "Зала корчми",
              insideKorchma: true
            }),
          getOnlineForTelegramUser: () => Promise.resolve({ state: "no-character" as const }),
          getLookForTelegramUser: () => Promise.resolve({ state: "no-character" as const })
        }
      })
    );
    const messages = calls.filter((call) => call.method === "sendMessage");

    expect(String(messages[0]?.payload.text)).toContain("Ви спустилися до льоху корчми.");
    expect(String(messages[1]?.payload.text)).toContain("Корчмар показує на люк під баром.");
    expect(String(messages[2]?.payload.text)).toContain("🐭 Льохова справа");
    expect(markAction).toHaveBeenCalledWith(
      expect.objectContaining({
        locationId: "location.korchma.cellar",
        currentRaidId: null,
        currentAdventureId: "adventure.cellar.mouse-errand"
      })
    );
  });

  it("sends the fight card when current-location text resolves a due dangerous search", async () => {
    const searchResult = passageSearchMonsterAttackResult();
    const getFightOverviewForTelegramUser = vi.fn()
      .mockResolvedValueOnce({
        state: "persistent-ready" as const,
        character: {
          ...character,
          level: 3
        },
        questProgress: null
      })
      .mockResolvedValue(searchResult.fight);
    const recordPersistentFightMessageReference =
      vi.fn<RecordPersistentFightMessageReferenceMock>(() => Promise.resolve());
    const calls = await captureTextApiCalls(
      mainMenuLocationButtons.deepStraight,
      servicesWith({
        passageSearch: {
          getActiveSearch: vi.fn(() => Promise.resolve(searchResult))
        },
        fight: {
          getFightOverviewForTelegramUser,
          recordPersistentFightMessageReference
        },
        presence: {
          markAction: vi.fn(() => Promise.resolve()),
          getCurrentPlaceForTelegramUser: () =>
            Promise.resolve({
              state: "ready" as const,
              locationId: "location.korchma.deep.level1.straight",
              locationName: "Прямий прохід",
              insideKorchma: true
            })
        }
      }),
      { messageResults: true }
    );
    const messages = calls.filter((call) => call.method === "sendMessage").map((call) => String(call.payload.text));

    expect(messages).toEqual([
      expect.stringContaining("⚔️ <b>Пошук образив місцевого мешканця</b>"),
      expect.stringContaining("Проти вас: <b>Павук дедлайнів</b>"),
      expect.stringContaining("❤️ Ви:")
    ]);
    expect(messages[2]).not.toContain("Проти вас:");
    expect(recordPersistentFightMessageReference).toHaveBeenCalledTimes(1);
    expect(recordPersistentFightMessageReference.mock.calls[0]?.[0]).toBe(42n);
    expect(recordPersistentFightMessageReference.mock.calls[0]?.[1]).toBe(searchResult.fight.session.id);
    expect(recordPersistentFightMessageReference.mock.calls[0]?.[2].chatId).toBe("42");
    expect(typeof recordPersistentFightMessageReference.mock.calls[0]?.[2].messageId).toBe("number");
  });

  it("blocks a main-menu quest button with the active passage search card", async () => {
    const getProblemQuestProgressForTelegramUser = vi.fn();
    const markAction = vi.fn(() => Promise.resolve());
    const getCurrentPlaceForTelegramUser = vi.fn(() =>
      Promise.resolve({
        state: "ready" as const,
        locationId: "location.korchma.hall",
        locationName: "Зала корчми",
        insideKorchma: true
      })
    );
    const calls = await captureTextApiCalls(
      mainMenuButtons.quest,
      servicesWith({
        passageSearch: {
          getActiveSearch: vi.fn(() => Promise.resolve(passageSearchRunningResult()))
        },
        fight: {
          getProblemQuestProgressForTelegramUser
        },
        presence: {
          markAction,
          getCurrentPlaceForTelegramUser
        }
      })
    );
    const reply = calls.find((call) => call.method === "sendMessage");

    expect(String(reply?.payload.text)).toContain("🔎 <b>Пошук триває</b>");
    expect(JSON.stringify(reply?.payload.reply_markup)).toContain("v1:search:check:searchtok13");
    expect(getProblemQuestProgressForTelegramUser).not.toHaveBeenCalled();
    expect(getCurrentPlaceForTelegramUser).not.toHaveBeenCalled();
  });

  it("blocks /fight with the active passage search card before fight lookup", async () => {
    const getFightOverviewForTelegramUser = vi.fn(() => Promise.resolve({ state: "no-character" as const }));
    const calls = await captureTextApiCalls(
      "/fight",
      servicesWith({
        passageSearch: {
          getActiveSearch: vi.fn(() => Promise.resolve(passageSearchRunningResult()))
        },
        fight: {
          getFightOverviewForTelegramUser
        }
      }),
      { asCommand: true }
    );
    const reply = calls.find((call) => call.method === "sendMessage");

    expect(String(reply?.payload.text)).toContain("🔎 <b>Пошук триває</b>");
    expect(getFightOverviewForTelegramUser).toHaveBeenCalledTimes(1);
  });

  it("blocks quest fight descent while a passage search is running", async () => {
    const markAction = vi.fn(() => Promise.resolve());
    const getCurrentPlaceForTelegramUser = vi.fn(() =>
      Promise.resolve({
        state: "ready" as const,
        locationId: "location.korchma.hall",
        locationName: "Зала корчми",
        insideKorchma: true
      })
    );
    const getFightOverviewForTelegramUser = vi.fn(() => Promise.resolve({ state: "no-character" as const }));
    const calls = await captureApiCalls(
      makeQuestCallbackData("fight-descend"),
      servicesWith({
        passageSearch: {
          getActiveSearch: vi.fn(() => Promise.resolve(passageSearchRunningResult()))
        },
        fight: {
          getFightOverviewForTelegramUser
        },
        presence: {
          markAction,
          getCurrentPlaceForTelegramUser
        }
      })
    );
    const edit = calls.find((call) => call.method === "editMessageText");

    expect(String(edit?.payload.text)).toContain("🔎 <b>Пошук триває</b>");
    expect(markAction.mock.calls.some(([input]) => input.locationId === "location.korchma.deep.level1")).toBe(false);
    expect(getFightOverviewForTelegramUser).toHaveBeenCalledTimes(1);
  });

  it("replays a due passage search result before quest callbacks and does not descend", async () => {
    const markAction = vi.fn(() => Promise.resolve());
    const getCurrentPlaceForTelegramUser = vi.fn(() =>
      Promise.resolve({
        state: "ready" as const,
        locationId: "location.korchma.hall",
        locationName: "Зала корчми",
        insideKorchma: true
      })
    );
    const calls = await captureApiCalls(
      makeQuestCallbackData("fight-descend"),
      servicesWith({
        passageSearch: {
          getActiveSearch: vi.fn(() => Promise.resolve(passageSearchCompletedResult()))
        },
        presence: {
          markAction,
          getCurrentPlaceForTelegramUser
        }
      })
    );
    const edit = calls.find((call) => call.method === "editMessageText");

    expect(String(edit?.payload.text)).toContain("🎒 <b>Щось знайшлося</b>");
    expect(markAction.mock.calls.some(([input]) => input.locationId === "location.korchma.deep.level1")).toBe(false);
  });

  it("blocks item-use preview creation while a passage search is running", async () => {
    const createPreviewForTelegramUser = vi.fn();
    const calls = await captureApiCalls(
      makeItemUsePreviewCallbackData("item.responsible-panic-bandage"),
      servicesWith({
        passageSearch: {
          getActiveSearch: vi.fn(() => Promise.resolve(passageSearchRunningResult()))
        },
        itemUse: {
          createPreviewForTelegramUser
        }
      })
    );
    const edit = calls.find((call) => call.method === "editMessageText");

    expect(String(edit?.payload.text)).toContain("🔎 <b>Пошук триває</b>");
    expect(createPreviewForTelegramUser).not.toHaveBeenCalled();
  });

  it("replays a dangerous passage search through quest callbacks with the canonical fight handoff", async () => {
    const searchResult = passageSearchMonsterAttackResult();
    const markAction = vi.fn(() => Promise.resolve());
    const getFightOverviewForTelegramUser = vi.fn()
      .mockResolvedValueOnce({
        state: "persistent-ready" as const,
        character: {
          ...character,
          level: 3
        },
        questProgress: null
      })
      .mockResolvedValue(searchResult.fight);
    const recordPersistentFightMessageReference =
      vi.fn<RecordPersistentFightMessageReferenceMock>(() => Promise.resolve());
    const calls = await captureApiCalls(
      makeQuestCallbackData("fight-descend"),
      servicesWith({
        passageSearch: {
          getActiveSearch: vi.fn(() => Promise.resolve(searchResult))
        },
        fight: {
          getFightOverviewForTelegramUser,
          recordPersistentFightMessageReference
        },
        presence: {
          markAction
        }
      }),
      { messageResults: true }
    );
    const edit = calls.find((call) => call.method === "editMessageText");
    const messages = calls.filter((call) => call.method === "sendMessage").map((call) => String(call.payload.text));

    expect(String(edit?.payload.text)).toContain("⚔️ <b>Пошук образив місцевого мешканця</b>");
    expect(messages).toEqual([
      expect.stringContaining("Проти вас: <b>Павук дедлайнів</b>"),
      expect.stringContaining("❤️ Ви:")
    ]);
    expect(markAction.mock.calls.some(([input]) => input.locationId === "location.korchma.deep.level1")).toBe(false);
    expect(recordPersistentFightMessageReference).toHaveBeenCalledTimes(1);
  });

  it("combines onboarding completion with the Kvestarnia opened line without an outdoor movement notice", async () => {
    const calls = await captureApiCalls(
      makeConfirmCallbackData("he", "race.human-ish", "class.warrior"),
      servicesWith({
        onboarding: {
          complete: () => Promise.resolve({
            ok: true as const,
            value: {
              character,
              created: true,
              achievementUnlocks: [
                {
                  id: "achievement.character.created",
                  title: "Де тут вихід?",
                  cosmeticTitleGrantId: "cosmetic-title.first-ink",
                  unlockedAt: new Date("2026-06-28T09:00:00.000Z")
                }
              ]
            }
          })
        },
        presence: {
          markAction: () => Promise.resolve(),
          getRaidParticipantsForTelegramUser: () =>
            Promise.resolve({ state: "no-character" }),
          getAdventureParticipantsForTelegramUser: () =>
            Promise.resolve({ state: "no-character" }),
          getCurrentPlaceForTelegramUser: () =>
            Promise.resolve({
              state: "ready",
              locationId: "location.korchma.front",
              locationName: "Перед корчмою",
              insideKorchma: false
            }),
          getOnlineForTelegramUser: () => Promise.resolve({ state: "no-character" }),
          getLookForTelegramUser: () => Promise.resolve({ state: "no-character" })
        }
      })
    );
    const edit = calls.find((call) => call.method === "editMessageText");
    const messages = calls.filter((call) => call.method === "sendMessage");
    const achievement = messages.find((call) => String(call.payload.text).includes("Нова ачівка"));

    expect(String(edit?.payload.text)).toContain("🎒 Пригодника створено.");
    expect(String(edit?.payload.text)).toContain("🍺 Квестарня відчинена.");
    expect(messages.some((call) => String(call.payload.text) === "🍺 Квестарня відчинена.")).toBe(false);
    expect(messages.some((call) => String(call.payload.text).includes("Ви вийшли надвір."))).toBe(false);
    expect(JSON.stringify(achievement?.payload.reply_markup)).toContain(mainMenuButtons.hero);
  });

  it("tracks the latest events opener achievement after rendering the feed", async () => {
    const listRecent = vi.fn(() =>
      Promise.resolve({
        events: [],
        page: 0,
        pageSize: 5,
        hasNextPage: false
      })
    );
    const trackLatestEventsOpenedByTelegramUserId = vi.fn(() =>
      Promise.resolve([
        {
          id: "achievement.journey.latest-events-opened",
          title: "Хроніка відкрила око",
          cosmeticTitleGrantId: null,
          unlockedAt: new Date("2026-07-02T09:00:00.000Z")
        }
      ])
    );
    const calls = await captureApiCalls(
      makeLatestEventsListCallbackData(),
      servicesWith({
        activityEvents: {
          listRecent
        },
        hero: {
          trackLatestEventsOpenedByTelegramUserId
        }
      })
    );
    const edit = calls.find((call) => call.method === "editMessageText");
    const achievement = calls.find(
      (call) => call.method === "sendMessage" && String(call.payload.text).includes("Нова ачівка")
    );

    expect(listRecent).toHaveBeenCalledWith("all", { page: 0 });
    expect(trackLatestEventsOpenedByTelegramUserId).toHaveBeenCalledWith(42n);
    expect(String(edit?.payload.text)).toContain("📜 Хроніки Квестарні");
    expect(String(achievement?.payload.text)).toContain("Хроніка відкрила око");
  });

  it("uses an outdoor movement notice when leaving the korchma", async () => {
    const markAction = vi.fn(() => Promise.resolve());
    const calls = await captureApiCalls(
      makePlaceCallbackData("front"),
      servicesWith({
        presence: {
          markAction,
          getCurrentPlaceForTelegramUser: () =>
            Promise.resolve({
              state: "ready" as const,
              locationId: "location.korchma.hall",
              locationName: "Зала корчми",
              insideKorchma: true
            })
        },
        tavern: {
          getTavernForTelegramUser: () => Promise.resolve({ state: "ready" as const, character }),
          getActivePendingFridayBarrelRaidForTelegramUser: () =>
            Promise.resolve({ state: "none" as const })
        }
      })
    );
    const movement = calls.find(
      (call) =>
        call.method === "sendMessage" &&
        String(call.payload.text).includes("Ви вийшли надвір.")
    );
    const front = calls.find(
      (call) =>
        call.method === "sendMessage" &&
        String(call.payload.text).includes("🚪 Перед корчмою")
    );

    expect(markAction).toHaveBeenCalledWith(
      expect.objectContaining({
        locationId: "location.korchma.front",
        currentRaidId: null,
        currentAdventureId: null
      })
    );
    expect(String(movement?.payload.text)).not.toContain("перед корчму");
    expect(JSON.stringify(movement?.payload.reply_markup)).toContain(mainMenuLocationButtons.front);
    expect(String(front?.payload.text)).toContain("🚪 Перед корчмою");
  });

  it("marks quest-table presence before opening the quest hub from the Korchma yard", async () => {
    const level3Character = {
      ...character,
      level: 3,
      hpCurrent: 24,
      hpMax: 24,
      manaCurrent: 12,
      manaMax: 12
    };
    const problemQuestProgress = {
      stageId: "13" as const,
      title: "Тринадцять дрібних проблем" as const,
      wins: 0,
      target: 13,
      completed: false,
      rewardClaimed: false,
      issued: true,
      branchComplete: false
    };
    let currentPlace = {
      state: "ready" as const,
      locationId: "location.korchma.yard",
      locationName: "Задвірок корчми",
      insideKorchma: false
    };
    const markAction = vi.fn((input: MarkPresenceInput) => {
      currentPlace = {
        state: "ready",
        locationId: input.locationId,
        locationName: "Стіл зі справами",
        insideKorchma: input.locationId === "location.korchma.quest_table"
      };

      return Promise.resolve();
    });
    const calls = await captureApiCalls(
      makePlaceCallbackData("quest-table"),
      servicesWith({
        adventure: {
          getAdventureOfferForTelegramUser: () =>
            Promise.resolve({
              state: "ready" as const,
              character: level3Character,
              offer: adventureOffer
            }),
          completeAdventureApproach: () => Promise.resolve({ state: "no-character" as const }),
          getMimicShawarmaForTelegramUser: () =>
            Promise.resolve({
              state: "level-retired" as const,
              character: level3Character,
              maxLevel: 2
            })
        },
        cellarErrand: {
          getForTelegramUser: () =>
            Promise.resolve({
              state: "ready" as const,
              character: level3Character
            }),
          complete: () => Promise.resolve({ state: "no-character" as const })
        },
        fight: {
          getFightOverviewForTelegramUser: () =>
            Promise.resolve({
              state: "persistent-ready" as const,
              character: level3Character,
              questProgress: problemQuestProgress
            }),
          getProblemQuestProgressForTelegramUser: () =>
            Promise.resolve({
              state: "ready" as const,
              character: level3Character,
              progress: problemQuestProgress,
              archive: []
            }),
          getMimicShawarmaForTelegramUser: () =>
            Promise.resolve({
              state: "level-retired" as const,
              character: level3Character,
              maxLevel: 2
            }),
          completeMimicShawarma: () => Promise.resolve({ state: "no-character" as const })
        },
        presence: {
          markAction,
          getRaidParticipantsForTelegramUser: () =>
            Promise.resolve({ state: "no-character" as const }),
          getAdventureParticipantsForTelegramUser: () =>
            Promise.resolve({ state: "no-character" as const }),
          getCurrentPlaceForTelegramUser: () => Promise.resolve(currentPlace),
          getOnlineForTelegramUser: () => Promise.resolve({ state: "no-character" as const }),
          getLookForTelegramUser: () => Promise.resolve({ state: "no-character" as const })
        },
        tavern: {
          getTavernForTelegramUser: () => Promise.resolve({ state: "ready" as const, character: level3Character }),
          completeFridayBarrelRaid: () => Promise.resolve({ state: "no-character" as const }),
          advanceFridayBarrelRaid: () => Promise.resolve({ state: "no-character" as const }),
          getActivePendingFridayBarrelRaidForTelegramUser: () =>
            Promise.resolve({ state: "none" as const })
        },
        yeger: {
          getForTelegramUser: () =>
            Promise.resolve({
              state: "level-locked" as const,
              character: level3Character,
              requiredLevel: 4
            })
        }
      })
    );

    const messages = calls.filter((call) => call.method === "sendMessage").map((call) => String(call.payload.text));
    const questHub = calls.find(
      (call) =>
        call.method === "sendMessage" &&
        String(call.payload.text).includes("📋 Стіл зі справами")
    );

    expect(markAction).toHaveBeenCalledWith(
      expect.objectContaining({
        locationId: "location.korchma.quest_table",
        currentRaidId: null,
        currentAdventureId: null
      })
    );
    expect(messages).not.toContain("Квести видають усередині.");
    expect(questHub).toBeDefined();
    expect(JSON.stringify(questHub?.payload.reply_markup)).toContain("v1:quest:adventure");
  });

  it("does not send a standalone reply-keyboard refresh message when a place callback keeps the same location", async () => {
    const calls = await captureApiCalls(
      makePlaceCallbackData("bar"),
      servicesWith({
        presence: {
          markAction: () => Promise.resolve(),
          getRaidParticipantsForTelegramUser: () =>
            Promise.resolve({ state: "no-character" }),
          getAdventureParticipantsForTelegramUser: () =>
            Promise.resolve({ state: "no-character" }),
          getCurrentPlaceForTelegramUser: () =>
            Promise.resolve({
              state: "ready",
              locationId: "location.korchma.bar",
              locationName: "Шинок",
              insideKorchma: true
            }),
          getOnlineForTelegramUser: () => Promise.resolve({ state: "no-character" }),
          getLookForTelegramUser: () => Promise.resolve({ state: "no-character" })
        },
        tavern: {
          getTavernForTelegramUser: () => Promise.resolve({ state: "ready", character }),
          completeFridayBarrelRaid: () => Promise.resolve({ state: "no-character" }),
          advanceFridayBarrelRaid: () => Promise.resolve({ state: "no-character" }),
          getActivePendingFridayBarrelRaidForTelegramUser: () =>
            Promise.resolve({ state: "none" })
        },
        fight: {
          getProblemQuestProgressForTelegramUser: () => Promise.resolve({ state: "no-character" })
        }
      }),
      { messageResults: true }
    );
    const replyKeyboardRefreshes = calls.filter(
      (call) =>
        call.method === "sendMessage" &&
        Array.isArray((call.payload.reply_markup as { keyboard?: unknown } | undefined)?.keyboard)
    );

    expect(replyKeyboardRefreshes).toEqual([]);
    expect(calls.some((call) => call.method === "deleteMessage")).toBe(false);
  });

  it.each([
    ["deep-left"],
    ["deep-straight"],
    ["deep-right"]
  ] as const)("does not send a standalone reply-keyboard refresh when %s keeps the same location", async (place) => {
    const markAction = vi.fn(() => Promise.resolve());
    const getOrStartPersistentFightForTelegramUser = vi.fn();
    const previewPersistentFightForTelegramUser = vi.fn(() =>
      Promise.resolve({
        state: "persistent-preview" as const,
        character: {
          ...character,
          level: 3
        },
        monster: {
          id: "monster.deadline-spider",
          name: "Павук дедлайнів",
          description: "Плете павутину з «сьогодні швиденько».",
          level: 2,
          tags: ["beast", "time", "web"]
        },
        questProgress: null,
        difficulty: place === "deep-left" ? "hard" as const : place === "deep-right" ? "easy" as const : "normal" as const,
        originLocationId:
          place === "deep-left"
            ? "location.korchma.deep.level1.left"
            : place === "deep-right"
              ? "location.korchma.deep.level1.right"
              : "location.korchma.deep.level1.straight",
        encounterToken: "token13"
      })
    );
    const calls = await captureApiCalls(
      makePlaceCallbackData(place),
      servicesWith({
        fight: {
          previewPersistentFightForTelegramUser,
          getOrStartPersistentFightForTelegramUser,
          recordPersistentFightMessageReference: () => Promise.resolve()
        },
        presence: {
          markAction,
          getCurrentPlaceForTelegramUser: () =>
            Promise.resolve({
              state: "ready",
              locationId:
                place === "deep-left"
                  ? "location.korchma.deep.level1.left"
                  : place === "deep-right"
                    ? "location.korchma.deep.level1.right"
                    : "location.korchma.deep.level1.straight",
              locationName: "Прохід",
              insideKorchma: true
            })
        }
      }),
      { messageResults: true }
    );
    const replyKeyboardRefreshes = calls.filter(
      (call) =>
        call.method === "sendMessage" &&
        Array.isArray((call.payload.reply_markup as { keyboard?: unknown } | undefined)?.keyboard)
    );

    expect(previewPersistentFightForTelegramUser).toHaveBeenCalled();
    expect(getOrStartPersistentFightForTelegramUser).not.toHaveBeenCalled();
    expect(replyKeyboardRefreshes).toEqual([]);
    expect(calls.some((call) => call.method === "deleteMessage")).toBe(false);
  });

  it.each([
    ["inventory keyboard button", mainMenuButtons.inventory, false],
    ["inventory command", "/inventory", true]
  ])("lets %s through during an active persistent fight", async (_name, text, asCommand) => {
    let inventoryCalls = 0;
    const calls = await captureTextApiCalls(
      text,
      servicesWith({
        fight: activeFightServiceThatShouldNotBeChecked(),
        inventory: {
          listForTelegramUser: () => {
            inventoryCalls += 1;
            return Promise.resolve({
              state: "empty",
              character
            });
          }
        }
      }),
      { asCommand }
    );
    const reply = calls.find((call) => call.method === "sendMessage");

    expect(inventoryCalls).toBe(1);
    expect(String(reply?.payload.text)).toContain("🎒 Манатки");
    expect(String(reply?.payload.text)).not.toContain("Бій тримає вас за рукав");
  });

  it.each([
    ["general inventory", makeInventoryCallbackData(), "🎒 Манатки"],
    ["slot-filtered inventory", makeInventoryCallbackData(0, "head"), "🎩 <b>Манатки-шоломи</b>"],
    ["paginated slot-filtered inventory", makeInventoryCallbackData(1, "offhand"), "✋ <b>Манатки для другої руки</b>"]
  ])("lets %s callbacks through during an active persistent fight", async (_name, callbackData, expectedText) => {
    let inventoryCalls = 0;
    const calls = await captureApiCalls(
      callbackData,
      servicesWith({
        fight: activeFightServiceThatShouldNotBeChecked(),
        inventory: {
          listForTelegramUser: () => {
            inventoryCalls += 1;
            return Promise.resolve({
              state: "empty",
              character
            });
          }
        }
      })
    );
    const edit = calls.find((call) => call.method === "editMessageText");

    expect(inventoryCalls).toBe(1);
    expect(String(edit?.payload.text)).toContain(expectedText);
    expect(String(edit?.payload.text)).not.toContain("Бій тримає вас за рукав");
  });

  it("opens and paginates slot-filtered inventory callbacks with compatible equipment items", async () => {
    const offhandItems = Array.from({ length: 9 }, (_, index) => ({
      id: `character-item-offhand-${index}`,
      itemId: `item.test-offhand-${index}`,
      quantity: 1,
      content: {
        id: `item.test-offhand-${index}`,
        name: `Тестова друга рука ${index + 1}`,
        description: "Тестова манатка для другої руки.",
        rarity: "common" as const,
        slot: "weapon" as const,
        equipmentSlot: "offhand" as const,
        tags: ["offhand"],
        goldValue: 1
      }
    }));
    const getCompatibleItemIdsForSlotForTelegramUser = vi.fn((_telegramUserId: bigint, slot: string) =>
      Promise.resolve(slot === "offhand" ? new Set(offhandItems.map((item) => item.itemId)) : new Set<string>())
    );
    const services = servicesWith({
      inventory: {
        listForTelegramUser: () =>
          Promise.resolve({
            state: "found" as const,
            character,
            totalGoldValue: 9,
            items: offhandItems
          })
      },
      equipment: {
        getEquipmentForTelegramUser: () =>
          Promise.resolve({
            state: "ready" as const,
            slots: [
              { slot: "weapon" as const, item: null },
              { slot: "offhand" as const, item: null },
              { slot: "head" as const, item: null },
              { slot: "chest" as const, item: null },
              { slot: "legs" as const, item: null },
              { slot: "accessory" as const, item: null },
              { slot: "tool" as const, item: null }
            ]
          }),
        getCompatibleItemIdsForSlotForTelegramUser
      }
    });

    const firstPageCalls = await captureApiCalls(makeInventoryCallbackData(0, "offhand"), services);
    const firstPageEdit = firstPageCalls.find((call) => call.method === "editMessageText");

    expect(getCompatibleItemIdsForSlotForTelegramUser).toHaveBeenCalledWith(42n, "offhand");
    expect(String(firstPageEdit?.payload.text)).toContain("✋ <b>Манатки для другої руки</b>");
    expect(String(firstPageEdit?.payload.text)).toContain("Сторінка <b>1/2</b>");
    expect(JSON.stringify(firstPageEdit?.payload.reply_markup)).toContain(makeInventoryCallbackData(1, "offhand"));
    expect(JSON.stringify(firstPageEdit?.payload.reply_markup)).toContain(makeInventoryPagePromptCallbackData(2, "offhand"));

    const secondPageCalls = await captureApiCalls(makeInventoryCallbackData(1, "offhand"), services);
    const secondPageEdit = secondPageCalls.find((call) => call.method === "editMessageText");

    expect(String(secondPageEdit?.payload.text)).toContain("✋ <b>Манатки для другої руки</b>");
    expect(String(secondPageEdit?.payload.text)).toContain("Сторінка <b>2/2</b>");
    expect(JSON.stringify(secondPageEdit?.payload.reply_markup)).toContain(makeInventoryCallbackData(0, "offhand"));

    const promptCalls = await captureApiCalls(makeInventoryPagePromptCallbackData(2, "offhand"), services);
    const promptMessage = promptCalls.find((call) => call.method === "sendMessage");

    expect(String(promptMessage?.payload.text)).toBe(presentInventoryPagePrompt("offhand", 2));
    expect(promptMessage?.payload.reply_markup).toMatchObject({
      force_reply: true,
      input_field_placeholder: "1-2"
    });

    const replyCalls = await captureTextApiCalls("2", services, {
      replyToText: presentInventoryPagePrompt("offhand", 2)
    });
    const replyMessage = replyCalls.find((call) => call.method === "sendMessage");

    expect(String(replyMessage?.payload.text)).toContain("✋ <b>Манатки для другої руки</b>");
    expect(String(replyMessage?.payload.text)).toContain("Сторінка <b>2/2</b>");
  });

  it.each([
    ["inventory command", "/inventory", true],
    ["inventory callback", "v1:item:inventory", false]
  ])("marks equipped items in the general %s list", async (_name, input, asCommand) => {
    const getEquipmentForTelegramUser = vi.fn(() =>
      Promise.resolve({
        state: "ready" as const,
        character,
        slots: [
          {
            slot: "weapon" as const,
            item: {
              itemId: "item.pan-of-persuasion",
              content: {
                id: "item.pan-of-persuasion",
                name: "Пательня переконання",
                description: "Важкий аргумент.",
                rarity: "common" as const,
                slot: "weapon" as const,
                goldValue: 25
              }
            }
          }
        ]
      })
    );
    const inventory = {
      listForTelegramUser: () =>
        Promise.resolve({
          state: "found" as const,
          totalGoldValue: 25,
          items: [
            {
              id: "character-item-1",
              itemId: "item.pan-of-persuasion",
              quantity: 1,
              content: {
                id: "item.pan-of-persuasion",
                name: "Пательня переконання",
                description: "Важкий аргумент.",
                rarity: "common" as const,
                slot: "weapon" as const,
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
                rarity: "common" as const,
                slot: "junk" as const,
                priceless: true
              }
            }
          ]
        })
    };
    const services = servicesWith({
      inventory,
      equipment: {
        getEquipmentForTelegramUser
      }
    });
    const calls = asCommand
      ? await captureTextApiCalls(input, services, { asCommand })
      : await captureApiCalls(input, services);
    const message = calls.find((call) => call.method === (asCommand ? "sendMessage" : "editMessageText"));
    const keyboard = JSON.stringify(message?.payload.reply_markup);

    expect(getEquipmentForTelegramUser).toHaveBeenCalledWith(42n);
    expect(keyboard).toContain("✅ Пательня переконання");
    expect(keyboard).toContain("🔎 Квиток мокрого пригодника");
  });

  it("lets item detail callbacks through during an active persistent fight", async () => {
    let itemCalls = 0;
    const calls = await captureApiCalls(
      "v1:item:detail:item.pan-of-persuasion",
      servicesWith({
        fight: activeFightServiceThatShouldNotBeChecked(),
        inventory: {
          getItemForTelegramUser: () => {
            itemCalls += 1;
            return Promise.resolve({
              state: "not-owned"
            });
          }
        },
        equipment: {
          getEquipmentForTelegramUser: () => Promise.resolve({ state: "no-character" }),
          previewItemEquipForTelegramUser: () => Promise.resolve({ state: "not-owned" })
        }
      })
    );
    const edit = calls.find((call) => call.method === "editMessageText");

    expect(itemCalls).toBe(1);
    expect(String(edit?.payload.text)).toContain("Такої манатки в торбі не знайшлося");
    expect(String(edit?.payload.text)).not.toContain("Бій тримає вас за рукав");
  });

  it("lets remort callbacks through during an active persistent fight", async () => {
    const getFightOverviewForTelegramUser = vi.fn(() =>
      Promise.resolve({
        state: "persistent-active" as const,
        character,
        session: persistentSessionWithOrigin("location.korchma.deep.level1.straight"),
        monster: {
          id: "monster.deadline-spider",
          name: "Павук дедлайнів",
          description: "Плете павутину з «сьогодні швиденько».",
          level: 2,
          tags: ["beast", "time", "web"]
        },
        questProgress: null
      })
    );
    const openForTelegramUser = vi.fn(() =>
      Promise.resolve({
        state: "locked" as const,
        character,
        requiredLevel: 13
      })
    );
    const calls = await captureApiCalls(
      makeRemortOpenCallbackData(),
      servicesWith({
        fight: {
          getFightOverviewForTelegramUser
        },
        remort: {
          openForTelegramUser
        }
      })
    );
    const edit = calls.find((call) => call.method === "editMessageText");

    expect(openForTelegramUser).toHaveBeenCalledWith(42n);
    expect(getFightOverviewForTelegramUser).not.toHaveBeenCalled();
    expect(String(edit?.payload.text)).toContain("🕯️ Реморт ще не кличе");
    expect(String(edit?.payload.text)).not.toContain("Бій тримає вас за рукав");
  });

  it("keeps remort callbacks inside an active turn-based duel", async () => {
    const getActiveTurnBasedForTelegramUser = vi.fn(() =>
      Promise.resolve(activeTurnBasedDuel())
    );
    const openForTelegramUser = vi.fn(() =>
      Promise.resolve({
        state: "locked" as const,
        character,
        requiredLevel: 13
      })
    );
    const calls = await captureApiCalls(
      makeRemortOpenCallbackData(),
      servicesWith({
        duel: {
          getActiveTurnBasedForTelegramUser
        },
        remort: {
          openForTelegramUser
        }
      })
    );
    const edit = calls.find((call) => call.method === "editMessageText");

    expect(getActiveTurnBasedForTelegramUser).toHaveBeenCalledWith(42n);
    expect(openForTelegramUser).not.toHaveBeenCalled();
    expect(String(edit?.payload.text)).toContain("⚔️ <b>Бій тримає вас за рукав</b>");
    expect(String(edit?.payload.text)).toContain("♟️ <b>Покрокова дуель</b>");
  });

  it("keeps main-menu text inside an active training fight", async () => {
    const calls = await captureTextApiCalls(
      mainMenuButtons.tavern,
      servicesWith({
        fight: {
          getFightOverviewForTelegramUser: () =>
            Promise.resolve({
              state: "training-active" as const,
              character,
              session: trainingSession(),
              questProgress: null
            })
        },
        trainingDoppelganger: {
          getStartOptionsForTelegramUser: () =>
            Promise.resolve({
              state: "active" as const,
              character,
              session: trainingSession(),
              monster: trainingMonster()
            })
        }
      })
    );
    const reply = calls.find((call) => call.method === "sendMessage");

    expect(String(reply?.payload.text)).toContain("⚔️ <b>Бій тримає вас за рукав</b>");
    expect(String(reply?.payload.text)).toContain("🪞 Копія");
    expect(JSON.stringify(reply?.payload.reply_markup)).not.toContain("До справ");
  });

  it("renders a terminal training result when the combat lock catches an expired turn", async () => {
    const calls = await captureTextApiCalls(
      mainMenuButtons.tavern,
      servicesWith({
        fight: {
          getFightOverviewForTelegramUser: () =>
            Promise.resolve({
              state: "training-active" as const,
              character,
              session: trainingSession(),
              questProgress: null
            })
        },
        trainingDoppelganger: {
          getStartOptionsForTelegramUser: () =>
            Promise.resolve({
              state: "terminal" as const,
              character,
              session: terminalTrainingSession(),
              doppelganger: trainingMonster(),
              reward: {
                state: "claimed" as const,
                reward: {
                  xp: 4,
                  gold: 0,
                  localDate: "12026-06-15",
                  itemGrants: []
                },
                levelChange: null,
                availableAt: new Date("2026-06-15T10:30:00.000Z"),
                now: new Date("2026-06-15T10:00:00.000Z")
              }
            })
        }
      })
    );
    const reply = calls.find((call) => call.method === "sendMessage");
    const keyboard = JSON.stringify(reply?.payload.reply_markup);

    expect(String(reply?.payload.text)).toContain("Це тренування вже завершилось");
    expect(String(reply?.payload.text)).not.toContain("Тренування вже триває");
    expect(keyboard).toContain("fighting-corner");
    expect(keyboard).not.toContain("v1:spar:turn");
  });

  it("keeps main-menu text inside an active starter mimic fight", async () => {
    const calls = await captureTextApiCalls(
      mainMenuButtons.tavern,
      servicesWith({
        fight: {
          getFightOverviewForTelegramUser: () =>
            Promise.resolve({
              state: "ready" as const,
              character
            })
        },
        presence: {
          markAction: () => Promise.resolve(),
          getCurrentActivityForTelegramUser: () =>
            Promise.resolve({
              state: "ready" as const,
              currentRaidId: null,
              currentAdventureId: "adventure.mimic-shawarma-fight"
            })
        }
      })
    );
    const reply = calls.find((call) => call.method === "sendMessage");

    expect(String(reply?.payload.text)).toContain("⚔️ <b>Бій тримає вас за рукав</b>");
    expect(String(reply?.payload.text)).toContain("Сутичка з підозрілим монстром");
    expect(JSON.stringify(reply?.payload.reply_markup)).not.toContain("До справ");
  });

  it("keeps Help text available during an active fight", async () => {
    const calls = await captureTextApiCalls(
      mainMenuButtons.help,
      servicesWith({
        fight: {
          getFightOverviewForTelegramUser: () =>
            Promise.resolve({
              state: "persistent-active" as const,
              character,
              session: persistentSession("monster.deadline-spider"),
              monster: null,
              questProgress: null
            })
        }
      })
    );
    const reply = calls.find((call) => call.method === "sendMessage");

    expect(String(reply?.payload.text)).not.toContain("Бій тримає вас за рукав");
    expect(String(reply?.payload.text)).toContain("📖 Допомога Квестарні");
    expect(String(reply?.payload.text)).toContain("/start");
    expect(String(reply?.payload.text)).toContain("/help");
    expect(String(reply?.payload.text)).toContain("/support");
    expect(String(reply?.payload.text)).not.toContain("Підтримати:");
    expect(String(reply?.payload.text)).not.toContain("/dev_help");
  });

  it("opens dev help from the admin main-menu button when local grants are enabled", async () => {
    const calls = await captureTextApiCalls(
      mainMenuButtons.admin,
      servicesWith({
        devReset: {
          isEnabled: () => true
        },
        devGrant: {
          isEnabled: () => true
        }
      })
    );
    const reply = calls.find((call) => call.method === "sendMessage");

    expect(String(reply?.payload.text)).toContain("🧰 Dev-довідка Квестарні");
    expect(String(reply?.payload.text)).toContain("/dev_help");
    expect(String(reply?.payload.text)).toContain("/dev_add_xp");
    expect(JSON.stringify(reply?.payload.reply_markup)).toContain(mainMenuButtons.admin);
  });

  it("lets persistent, training, and starter combat callbacks reach their handlers", async () => {
    const resolvePersistentFightTurn = vi.fn(() =>
      Promise.resolve({
        state: "not-found" as const
      })
    );
    const resolveTrainingTurn = vi.fn(() =>
      Promise.resolve({
        state: "not-found" as const
      })
    );
    const completeMimicShawarma = vi.fn(() =>
      Promise.resolve({
        state: "no-character" as const
      })
    );

    await captureApiCalls(
      makeFightTurnCallbackData({
        sessionId: "123e4567-e89b-42d3-a456-426614174000",
        turn: 1,
        action: "attack"
      }),
      servicesWith({
        fight: {
          getFightOverviewForTelegramUser: () =>
            Promise.resolve({
              state: "persistent-active" as const,
              character,
              session: persistentSession("monster.deadline-spider"),
              monster: null,
              questProgress: null
            }),
          resolvePersistentFightTurn
        }
      })
    );
    await captureApiCalls(
      makeTrainingDoppelgangerTurnCallbackData({
        sessionId: "123e4567-e89b-42d3-a456-426614174000",
        turn: 1,
        action: "attack"
      }),
      servicesWith({
        fight: {
          getFightOverviewForTelegramUser: () =>
            Promise.resolve({
              state: "training-active" as const,
              character,
              session: trainingSession(),
              questProgress: null
            })
        },
        trainingDoppelganger: {
          resolveTurn: resolveTrainingTurn
        }
      })
    );
    await captureApiCalls(
      makeFightCallbackData("attack"),
      servicesWith({
        fight: {
          getFightOverviewForTelegramUser: () =>
            Promise.resolve({
              state: "ready" as const,
              character
            }),
          completeMimicShawarma
        },
        presence: {
          markAction: () => Promise.resolve(),
          getCurrentActivityForTelegramUser: () =>
            Promise.resolve({
              state: "ready" as const,
              currentRaidId: null,
              currentAdventureId: "adventure.mimic-shawarma-fight"
            })
        }
      })
    );

    expect(resolvePersistentFightTurn).toHaveBeenCalledTimes(1);
    expect(resolveTrainingTurn).toHaveBeenCalledTimes(1);
    expect(completeMimicShawarma).toHaveBeenCalledTimes(1);
  });

  it("routes persistent gear action callbacks through the fight turn handler", async () => {
    const sessionId = "123e4567-e89b-42d3-a456-426614174000";
    const session = {
      ...persistentSession("monster.deadline-spider"),
      id: sessionId,
      state: {
        ...persistentSession("monster.deadline-spider").state,
        id: sessionId,
        turn: 2,
        hero: {
          hp: 18,
          hpMax: 24,
          mana: 9,
          manaMax: 12
        },
        monster: {
          id: "monster.deadline-spider",
          hp: 7,
          hpMax: 12
        },
        equipmentAbilities: {
          version: 1 as const,
          grantIds: ["mantok-ability.red-line-dagger"]
        },
        lastTurn: {
          action: "gear" as const,
          heroOutcome: "hit" as const,
          heroDamage: 5,
          monsterDamage: 2,
          manaSpent: 1,
          critical: false,
          skillId: "gear.red-line-dagger",
          abilitySource: "equipment" as const
        }
      }
    };
    const resolvePersistentFightTurn = vi.fn(() =>
      Promise.resolve({
        state: "updated" as const,
        character: { ...character, level: 10 },
        session,
        monster: {
          id: "monster.deadline-spider",
          name: "Павук дедлайнів",
          description: "Плете павутину з «сьогодні швиденько».",
          level: 10,
          tags: ["beast", "time", "web"]
        },
        questProgress: null,
        fightReward: null
      })
    );

    const calls = await captureApiCalls(
      makeFightGearActionCallbackData({
        sessionId,
        turn: 1,
        grantKey: "rldagr"
      }),
      servicesWith({
        fight: {
          resolvePersistentFightTurn
        }
      })
    );

    const edit = calls.find((call) => call.method === "editMessageText");
    expect(resolvePersistentFightTurn).toHaveBeenCalledWith(42n, {
      sessionId,
      turn: 1,
      action: "gear",
      grantKey: "rldagr"
    });
    expect(String(edit?.payload.text)).toContain("Вміння 🩸 <i>Червоний рядок</i>");
    expect(JSON.stringify(edit?.payload.reply_markup ?? null)).toContain(`v1:fight:turn:${sessionId}:2:attack`);
  });

  it("keeps selected passage presence after persistent fight turn callbacks", async () => {
    const markAction = vi.fn(() => Promise.resolve());
    const session = persistentSessionWithOrigin("location.korchma.deep.level1.right");
    const calls = await captureApiCalls(
      makeFightTurnCallbackData({
        sessionId: session.id,
        turn: 1,
        action: "attack"
      }),
      servicesWith({
        fight: {
          resolvePersistentFightTurn: () =>
            Promise.resolve({
              state: "updated" as const,
              character,
              session,
              monster: {
                id: "monster.deadline-spider",
                name: "Павук дедлайнів",
                description: "Плете павутину з «сьогодні швиденько».",
                level: 2,
                tags: ["beast", "time", "web"]
              },
              questProgress: null,
              fightReward: null
            })
        },
        presence: { markAction }
      })
    );

    expect(calls.some((call) => call.method === "editMessageText")).toBe(true);
    const presenceInput = markAction.mock.calls
      .map(([input]) => input as MarkPresenceInput)
      .find((input) => input.locationId);
    if (!presenceInput) {
      throw new Error("Expected fight turn callback to mark a concrete presence location.");
    }
    expect(presenceInput).toMatchObject({
      locationId: "location.korchma.deep.level1.right",
      currentRaidId: null,
      currentAdventureId: "adventure.solo-fight"
    });
  });

  it("keeps duplicate persistent fight turn callbacks stale without duplicate side effects", async () => {
    const session = {
      ...persistentSessionWithOrigin("location.korchma.deep.level1.right"),
      status: "won" as const,
      turn: 2,
      state: {
        ...persistentSessionWithOrigin("location.korchma.deep.level1.right").state,
        status: "won" as const,
        turn: 2,
        monster: {
          id: "monster.deadline-spider",
          hp: 0,
          hpMax: 12
        },
        lastTurn: {
          action: "attack" as const,
          heroOutcome: "won" as const,
          heroDamage: 12,
          monsterDamage: 0,
          manaSpent: 0,
          critical: false
        }
      }
    };
    const resolvePersistentFightTurn = vi
      .fn()
      .mockResolvedValueOnce({
        state: "updated" as const,
        character,
        session,
        monster: {
          id: "monster.deadline-spider",
          name: "Павук дедлайнів",
          description: "Плете павутину з «сьогодні швиденько».",
          level: 2,
          tags: ["beast", "time", "web"]
        },
        questProgress: null,
        fightReward: {
          state: "claimed" as const,
          reward: {
            xp: 20,
            gold: 0,
            localDate: "12026-06-21",
            itemGrants: []
          },
          levelChange
        }
      })
      .mockResolvedValueOnce({
        state: "stale-turn" as const,
        character,
        session,
        monster: null,
        questProgress: null
      });
    const calls = await captureRepeatedApiCalls(
      [
        makeFightTurnCallbackData({
          sessionId: session.id,
          turn: 1,
          action: "attack"
        }),
        makeFightTurnCallbackData({
          sessionId: session.id,
          turn: 1,
          action: "attack"
        })
      ],
      servicesWith({
        fight: {
          resolvePersistentFightTurn
        }
      })
    );
    const edits = calls.filter((call) => call.method === "editMessageText");
    const levelUps = calls.filter(
      (call) => call.method === "sendMessage" && String(call.payload.text).includes("🎉 Рівень підріс!")
    );

    expect(resolvePersistentFightTurn).toHaveBeenCalledTimes(2);
    expect(String(edits[0]?.payload.text)).toContain("🎉 Ви перемогли");
    expect(String(edits[1]?.payload.text)).toContain("поточний стан");
    expect(levelUps).toHaveLength(1);
  });

  it("answers blocked persistent fight gear callbacks with gear-specific alert copy", async () => {
    const session = persistentSessionWithOrigin("location.korchma.deep.level1.right");
    const resolvePersistentFightTurn = vi.fn().mockResolvedValue({
      state: "not-enough-mana" as const,
      reason: "skill-on-cooldown" as const,
      character,
      session,
      monster: {
        id: "monster.deadline-spider",
        name: "Павук дедлайнів",
        description: "Плете павутину з «сьогодні швиденько».",
        level: 2,
        tags: ["beast", "time", "web"]
      },
      questProgress: null
    });
    const calls = await captureApiCalls(
      makeFightGearActionCallbackData({
        sessionId: session.id,
        turn: 1,
        grantKey: "rldagr"
      }),
      servicesWith({
        fight: {
          resolvePersistentFightTurn
        }
      })
    );
    const callbackAnswer = calls.find((call) => call.method === "answerCallbackQuery");
    const edit = calls.find((call) => call.method === "editMessageText");

    expect(resolvePersistentFightTurn).toHaveBeenCalledWith(42n, {
      sessionId: session.id,
      turn: 1,
      action: "gear",
      grantKey: "rldagr"
    });
    expect(callbackAnswer?.payload).toMatchObject({
      text: "Дія спорядження не спрацювала: ще відсапується.",
      show_alert: true
    });
    expect(String(edit?.payload.text)).toContain("Дія спорядження ще відсапується");
  });

  it("removes combat action buttons when a persistent turn callback needs recovery", async () => {
    const session = {
      ...persistentSession("monster.deadline-spider"),
      state: {
        ...persistentSession("monster.deadline-spider").state,
        hero: {
          hp: 0,
          hpMax: 24,
          mana: 4,
          manaMax: 12
        }
      }
    };
    const resolvePersistentFightTurn = vi.fn(() =>
      Promise.resolve({
        state: "needs-rest" as const,
        character: { ...character, hpCurrent: 0 },
        session,
        monster: null,
        questProgress: null
      })
    );

    const calls = await captureApiCalls(
      makeFightTurnCallbackData({
        sessionId: "123e4567-e89b-42d3-a456-426614174000",
        turn: 1,
        action: "attack"
      }),
      servicesWith({
        fight: {
          resolvePersistentFightTurn
        }
      })
    );

    const edit = calls.find((call) => call.method === "editMessageText");
    expect(String(edit?.payload.text)).toContain("Спершу прийдіть до тями");
    expect(JSON.stringify(edit?.payload.reply_markup ?? null)).not.toContain("Вдарити");
  });

  it.each([
    ["result replay", makeFightViewCallbackData("123e4567-e89b-42d3-a456-426614174321")],
    ["journal page", makeFightJournalCallbackData({ sessionId: "123e4567-e89b-42d3-a456-426614174321", page: 0 })]
  ])("does not move presence when viewing historical persistent fight %s callbacks", async (_name, callbackData) => {
    const markAction = vi.fn(() => Promise.resolve());
    const activeSession = persistentSessionWithOrigin("location.korchma.deep.level1.left");
    const session = {
      ...activeSession,
      status: "won" as const,
      turn: 2,
      state: {
        ...activeSession.state,
        status: "won" as const,
        turn: 2,
        monster: {
          hp: 0,
          hpMax: 12
        },
        lastTurn: {
          action: "attack" as const,
          heroOutcome: "won" as const,
          heroDamage: 9,
          monsterDamage: 0,
          manaSpent: 0,
          critical: false
        }
      }
    };
    const calls = await captureApiCalls(
      callbackData,
      servicesWith({
        fight: {
          getPersistentFightSnapshotForTelegramUser: () =>
            Promise.resolve({
              state: "found" as const,
              character,
              session,
              monster: {
                id: "monster.deadline-spider",
                name: "Павук дедлайнів",
                description: "Плете павутину з «сьогодні швиденько».",
                level: 2,
                tags: ["beast", "time", "web"]
              },
              questProgress: null,
              fightReward: null
            })
        },
        presence: { markAction }
      })
    );

    expect(calls.some((call) => call.method === "editMessageText")).toBe(true);
    expect(markAction.mock.calls
      .map(([input]) => input as MarkPresenceInput)
      .some((input) => input.locationId === "location.korchma.deep.level1.left")).toBe(false);
  });

  it("keeps starter mimic fight routes inside the active starter battle", async () => {
    const calls = await captureApiCalls(
      makePlaceCallbackData("hall"),
      servicesWith({
        fight: {
          getFightOverviewForTelegramUser: () =>
            Promise.resolve({
              state: "ready" as const,
              character
            })
        },
        presence: {
          markAction: () => Promise.resolve(),
          getCurrentActivityForTelegramUser: () =>
            Promise.resolve({
              state: "ready" as const,
              currentRaidId: null,
              currentAdventureId: "adventure.mimic-shawarma-fight"
            })
        }
      })
    );
    const edit = calls.find((call) => call.method === "editMessageText");

    expect(String(edit?.payload.text)).toContain("⚔️ <b>Бій тримає вас за рукав</b>");
    expect(String(edit?.payload.text)).toContain("Сутичка з підозрілим монстром");
    expect(String(edit?.payload.text)).toContain("Що робимо?");
    expect(JSON.stringify(edit?.payload.reply_markup)).not.toContain("До справ");
  });

  it("does not keep starter mimic fight locked after completion", async () => {
    const calls = await captureApiCalls(
      makePlaceCallbackData("hall"),
      servicesWith({
        fight: {
          getFightOverviewForTelegramUser: () =>
            Promise.resolve({
              state: "already-completed" as const,
              character,
              questAvailable: true
            })
        },
        presence: {
          markAction: () => Promise.resolve(),
          getCurrentActivityForTelegramUser: () =>
            Promise.resolve({
              state: "ready" as const,
              currentRaidId: null,
              currentAdventureId: "adventure.mimic-shawarma-fight"
            })
        }
      })
    );
    const edit = calls.find((call) => call.method === "editMessageText");

    expect(String(edit?.payload.text)).not.toContain("Бій тримає вас за рукав");
    expect(String(edit?.payload.text)).not.toContain("Сутичка з підозрілим монстром");
  });

  it("opens the Nyz descent for old quest-table fight callbacks", async () => {
    const markAction = vi.fn(() => Promise.resolve());
    const getOrStartPersistentFightForTelegramUser = vi.fn();
    const calls = await captureApiCalls(
      makeQuestCallbackData("fight"),
      servicesWith({
        fight: {
          getFightOverviewForTelegramUser: () =>
            Promise.resolve({
              state: "persistent-ready" as const,
              character: {
                ...character,
                level: 3
              },
              questProgress: null
            }),
          getOrStartPersistentFightForTelegramUser
        },
        presence: {
          markAction,
          getCurrentPlaceForTelegramUser: () =>
            Promise.resolve({
              state: "ready",
              locationId: "location.korchma.hall",
              locationName: "Зала корчми",
              insideKorchma: true
            })
        }
      })
    );
    const descent = calls.find((call) => call.method === "sendMessage");
    const replyKeyboardRefreshes = calls.filter(
      (call) =>
        call.method === "sendMessage" &&
        Array.isArray((call.payload.reply_markup as { keyboard?: unknown } | undefined)?.keyboard)
    );

    expect(getOrStartPersistentFightForTelegramUser).not.toHaveBeenCalled();
    expect(markAction).toHaveBeenCalledWith(
      expect.objectContaining({
        locationId: "location.korchma.deep",
        currentAdventureId: "adventure.solo-fight"
      })
    );
    expect(replyKeyboardRefreshes).toEqual([]);
    expect(String(descent?.payload.text)).toContain("🪜 Спуск до Низу");
    expect(String(descent?.payload.text)).toContain("За бочками в коморі є сходи.");
    expect(JSON.stringify(descent?.payload.reply_markup)).toContain("Спуститися");
  });

  it("opens the first Nyz tier from the descent place callback", async () => {
    const markAction = vi.fn(() => Promise.resolve());
    const getOrStartPersistentFightForTelegramUser = vi.fn();
    const getCurrentPlaceForTelegramUser = vi.fn()
      .mockResolvedValueOnce({
        state: "ready" as const,
        locationId: "location.korchma.deep",
        locationName: "Низ",
        insideKorchma: true
      })
      .mockResolvedValueOnce({
        state: "ready" as const,
        locationId: "location.korchma.deep.level1",
        locationName: "Сутерени Корчми",
        insideKorchma: true
      })
      .mockResolvedValue({
        state: "ready" as const,
        locationId: "location.korchma.deep.level1",
        locationName: "Сутерени Корчми",
        insideKorchma: true
      });
    const calls = await captureApiCalls(
      makePlaceCallbackData("deep-level1"),
      servicesWith({
        fight: {
          getFightOverviewForTelegramUser: () =>
            Promise.resolve({
              state: "persistent-ready" as const,
              character: {
                ...character,
                level: 3
              },
              questProgress: null
            }),
          getOrStartPersistentFightForTelegramUser
        },
        presence: {
          markAction,
          getCurrentPlaceForTelegramUser
        }
      })
    );
    const tier = calls.find(
      (call) =>
        call.method === "sendMessage" &&
        String(call.payload.text).includes("Ярус I: Сутерени Корчми")
    );
    const movement = calls.find(
      (call) =>
        call.method === "sendMessage" &&
        String(call.payload.text).includes("Ви спустилися до Сутеренів Корчми.")
    );

    expect(getOrStartPersistentFightForTelegramUser).not.toHaveBeenCalled();
    expect(markAction).toHaveBeenCalledWith(
      expect.objectContaining({
        locationId: "location.korchma.deep.level1",
        currentAdventureId: "adventure.solo-fight"
      })
    );
    expect(String(tier?.payload.text)).toContain("Ярус I: Сутерени Корчми");
    expect(String(tier?.payload.text)).toContain("Підсходник");
    expect(JSON.stringify(tier?.payload.reply_markup)).toContain("🚪 Прямий прохід");
    expect(String(movement?.payload.text)).not.toContain("Тепер");
    expect(JSON.stringify(movement?.payload.reply_markup)).toContain(mainMenuLocationButtons.deepLevel1);
  });

  it("sends the fight card when a place callback resolves a due dangerous search", async () => {
    const searchResult = passageSearchMonsterAttackResult();
    const getFightOverviewForTelegramUser = vi.fn()
      .mockResolvedValueOnce({
        state: "persistent-ready" as const,
        character: {
          ...character,
          level: 3
        },
        questProgress: null
      })
      .mockResolvedValue(searchResult.fight);
    const recordPersistentFightMessageReference =
      vi.fn<RecordPersistentFightMessageReferenceMock>(() => Promise.resolve());
    const calls = await captureApiCalls(
      makePlaceCallbackData("hall"),
      servicesWith({
        passageSearch: {
          getActiveSearch: vi.fn(() => Promise.resolve(searchResult))
        },
        fight: {
          getFightOverviewForTelegramUser,
          recordPersistentFightMessageReference
        }
      }),
      { messageResults: true }
    );
    const edit = calls.find((call) => call.method === "editMessageText");
    const messages = calls.filter((call) => call.method === "sendMessage").map((call) => String(call.payload.text));

    expect(String(edit?.payload.text)).toContain("⚔️ <b>Пошук образив місцевого мешканця</b>");
    expect(messages).toEqual([
      expect.stringContaining("Проти вас: <b>Павук дедлайнів</b>"),
      expect.stringContaining("❤️ Ви:")
    ]);
    expect(messages[1]).not.toContain("Проти вас:");
    expect(recordPersistentFightMessageReference).toHaveBeenCalledTimes(1);
    expect(recordPersistentFightMessageReference.mock.calls[0]?.[0]).toBe(42n);
    expect(recordPersistentFightMessageReference.mock.calls[0]?.[1]).toBe(searchResult.fight.session.id);
    expect(recordPersistentFightMessageReference.mock.calls[0]?.[2].chatId).toBe("42");
    expect(typeof recordPersistentFightMessageReference.mock.calls[0]?.[2].messageId).toBe("number");
  });

  it("uses an ascent movement notice when returning from a Nyz tier to the descent", async () => {
    const markAction = vi.fn(() => Promise.resolve());
    const calls = await captureApiCalls(
      makePlaceCallbackData("deep"),
      servicesWith({
        presence: {
          markAction,
          getCurrentPlaceForTelegramUser: () =>
            Promise.resolve({
              state: "ready" as const,
              locationId: "location.korchma.deep.level1.straight",
              locationName: "Прямий прохід",
              insideKorchma: true
            })
        },
        tavern: {
          getTavernForTelegramUser: () =>
            Promise.resolve({
              state: "ready" as const,
              character: {
                ...character,
                level: 3
              }
            }),
          getActivePendingFridayBarrelRaidForTelegramUser: () =>
            Promise.resolve({ state: "none" as const })
        }
      })
    );
    const movement = calls.find(
      (call) =>
        call.method === "sendMessage" &&
        String(call.payload.text).includes("Ви піднялися до спуску до Низу.")
    );
    const descent = calls.find(
      (call) =>
        call.method === "sendMessage" &&
        String(call.payload.text).includes("🪜 Спуск до Низу")
    );

    expect(markAction).toHaveBeenCalledWith(
      expect.objectContaining({
        locationId: "location.korchma.deep",
        currentRaidId: null,
        currentAdventureId: null
      })
    );
    expect(String(movement?.payload.text)).not.toContain("Ви пішли до Низу.");
    expect(JSON.stringify(movement?.payload.reply_markup)).toContain(mainMenuLocationButtons.deep);
    expect(String(descent?.payload.text)).toContain("🪜 Спуск до Низу");
  });

  it("blocks lower-level stale Nyz descent place callbacks", async () => {
    const markAction = vi.fn(() => Promise.resolve());
    const calls = await captureApiCalls(
      makePlaceCallbackData("deep"),
      servicesWith({
        tavern: {
          getTavernForTelegramUser: () =>
            Promise.resolve({
              state: "ready" as const,
              character: {
                ...character,
                level: 1
              }
            }),
          getActivePendingFridayBarrelRaidForTelegramUser: () =>
            Promise.resolve({ state: "none" as const })
        },
        presence: {
          markAction
        }
      })
    );
    const locked = calls.find(
      (call) =>
        (call.method === "sendMessage" || call.method === "editMessageText") &&
        String(call.payload.text).includes("Низ відкриється з 3 рівня")
    );

    expect(markAction).toHaveBeenCalledWith(
      expect.objectContaining({
        locationId: "location.korchma.hall"
      })
    );
    expect(String(locked?.payload.text)).toContain("Низ відкриється з 3 рівня");
    expect(JSON.stringify(locked?.payload.reply_markup)).not.toContain("deep-level1");
  });

  it("blocks lower-level stale Nyz tier callbacks before fight difficulty", async () => {
    const getOrStartPersistentFightForTelegramUser = vi.fn();
    const calls = await captureApiCalls(
      makePlaceCallbackData("deep-level1"),
      servicesWith({
        fight: {
          getFightOverviewForTelegramUser: () =>
            Promise.resolve({
              state: "ready" as const,
              character: {
                ...character,
                level: 1
              }
            }),
          getOrStartPersistentFightForTelegramUser
        },
        presence: {
          markAction: () => Promise.resolve()
        }
      })
    );
    const edit = calls.find((call) => call.method === "editMessageText");

    expect(getOrStartPersistentFightForTelegramUser).not.toHaveBeenCalled();
    expect(String(edit?.payload.text)).toContain("Низ відкриється з 3 рівня");
    expect(JSON.stringify(edit?.payload.reply_markup)).not.toContain("fight-normal");
  });

  it("marks canonical solo-fight presence when an adventure complication starts a new fight", async () => {
    const markAction = vi.fn(() => Promise.resolve());
    const getOrStartPersistentFightForTelegramUser = vi.fn(() =>
      Promise.resolve({
        state: "persistent-active" as const,
        started: true,
        character: {
          ...character,
          level: 3
        },
        session: persistentSession("monster.borshch-slime"),
        monster: {
          id: "monster.borshch-slime",
          name: "Борщовий слиз",
          description: "Булькає статутом і буряком.",
          level: 3,
          tags: ["slime", "food"]
        },
        questProgress: null
      })
    );
    const rollbackCurrentAdventureClaimForTelegramUser = vi.fn(() => Promise.resolve("missing" as const));
    const calls = await captureApiCalls(
      makeAdventureApproachCallbackData({
        periodToken: "period93",
        problemId: "stew",
        methodId: adventureApproach.id
      }),
      servicesWith({
        adventure: {
          completeAdventureApproach: () =>
            Promise.resolve({
              state: "completed" as const,
              character,
              choice: adventureChoice,
              approach: adventureApproach,
              reward: { xp: 0, gold: 0, localDate: "12026-06-12", itemGrants: [] },
              levelChange: noLevelChange,
              complication: true,
              grade: "complication",
              consequence: "fight-handoff",
              outcome: {
                headline: "⚔️ Казанок покликав бій",
                body: ["Кришка грюкнула, і слиз виліз із параграфа."]
              },
              spentGold: 0,
              hpLoss: null,
              fightHandoff: true,
              fightEncounter: { monsterId: "monster.borshch-slime" },
              claim: { key: "adventure.choice", localDate: "12026-06-12" },
              check: { roll: 13, target: 45, total: 13, statBonus: 0, grade: "complication" }
            }),
          rollbackCurrentAdventureClaimForTelegramUser
        },
        fight: {
          getOrStartPersistentFightForTelegramUser
        },
        presence: {
          markAction
        }
      })
    );

    expect(rollbackCurrentAdventureClaimForTelegramUser).not.toHaveBeenCalled();
    expect(markAction).toHaveBeenCalledWith(
      expect.objectContaining({
        locationId: "location.korchma.deep.level1",
        currentAdventureId: "adventure.solo-fight"
      })
    );
    expect(calls.some((call) => call.method === "sendMessage" && String(call.payload.text).includes("Борщовий слиз"))).toBe(true);
  });

  it("opens the selected Nyz passage preview without starting a fight", async () => {
    const markAction = vi.fn(() => Promise.resolve());
    const getOrStartPersistentFightForTelegramUser = vi.fn();
    const previewPersistentFightForTelegramUser = vi.fn(() =>
      Promise.resolve({
        state: "persistent-preview" as const,
        character: {
          ...character,
          level: 3
        },
        questProgress: null,
        monster: {
          id: "monster.deadline-spider",
          name: "Павук дедлайнів",
          description: "Плете павутину з «сьогодні швиденько».",
          level: 2,
          tags: ["beast", "time", "web"]
        },
        difficulty: "normal" as const,
        originLocationId: "location.korchma.deep.level1.straight",
        encounterToken: "token13"
      })
    );
    const calls = await captureApiCalls(
      makePlaceCallbackData("deep-straight"),
      servicesWith({
        fight: {
          previewPersistentFightForTelegramUser,
          getOrStartPersistentFightForTelegramUser
        },
        presence: {
          markAction,
          getCurrentPlaceForTelegramUser: () =>
            Promise.resolve({
              state: "ready",
              locationId: "location.korchma.hall",
              locationName: "Зала корчми",
              insideKorchma: true
            })
        }
      })
    );
    const preview = calls.find(
      (call) =>
        call.method === "sendMessage" &&
        String(call.payload.text).includes("Павук дедлайнів")
    );

    expect(previewPersistentFightForTelegramUser).toHaveBeenCalledWith(42n, {
      difficulty: "normal",
      originLocationId: "location.korchma.deep.level1.straight"
    });
    expect(getOrStartPersistentFightForTelegramUser).not.toHaveBeenCalled();
    expect(markAction).toHaveBeenCalledWith(
      expect.objectContaining({
        locationId: "location.korchma.deep.level1.straight",
        currentAdventureId: "adventure.solo-fight"
      })
    );
    expect(String(preview?.payload.text)).toContain("Павук дедлайнів");
    expect(JSON.stringify(preview?.payload.reply_markup)).toContain("v1:fight:pass:deep-straight:token13");
    expect(JSON.stringify(preview?.payload.reply_markup)).toContain("v1:place:deep-level1");
  });

  it("starts a passage preview encounter only after Attack", async () => {
    const markAction = vi.fn(() => Promise.resolve());
    const escalatedSession = {
      ...persistentSessionWithOrigin("location.korchma.deep.level1.straight"),
      state: {
        ...persistentSessionWithOrigin("location.korchma.deep.level1.straight").state,
        monster: {
          id: "monster.kvass-golem",
          name: "Квасний голем на заквасці",
          level: 5,
          hp: 31,
          hpMax: 32
        },
        enemies: [
          {
            enemyId: "enemy:1",
            id: "monster.kvass-golem",
            name: "Квасний голем на заквасці",
            level: 5,
            hp: 31,
            hpMax: 32
          },
          {
            enemyId: "enemy:2",
            id: "monster.fox",
            name: "Лис нечіткого дедлайну",
            level: 4,
            hp: 26,
            hpMax: 26
          }
        ],
        threat: {
          version: 1,
          enemyCount: 2,
          reason: "ordinary-win-streak",
          eligibleWins: 3,
          lineId: "fame-went-ahead",
          lineVersion: "threat-escalation-v1"
        }
      }
    };
    const attackPersistentPassageEncounterForTelegramUser = vi.fn(() =>
      Promise.resolve({
        state: "persistent-active" as const,
        started: true,
        character: {
          ...character,
          level: 3
        },
        session: escalatedSession,
        monster: {
          id: "monster.kvass-golem",
          name: "Квасний голем на заквасці",
          description: "Булькає так, ніби має план.",
          level: 5,
          tags: ["construct", "kvass"]
        },
        questProgress: null
      })
    );
    const getFightOverviewForTelegramUser = vi.fn()
      .mockResolvedValueOnce({
        state: "persistent-ready" as const,
        character: {
          ...character,
          level: 3
        },
        questProgress: null
      })
      .mockResolvedValue({
        state: "persistent-active" as const,
        started: true,
        character: {
          ...character,
          level: 3
        },
        session: escalatedSession,
        monster: {
          id: "monster.kvass-golem",
          name: "Квасний голем на заквасці",
          description: "Булькає так, ніби має план.",
          level: 5,
          tags: ["construct", "kvass"]
        },
        questProgress: null
      });
    const calls = await captureApiCalls(
      "v1:fight:pass:deep-straight:token13",
      servicesWith({
        fight: {
          getFightOverviewForTelegramUser,
          attackPersistentPassageEncounterForTelegramUser,
          recordPersistentFightMessageReference: () => Promise.resolve()
        },
        presence: {
          markAction,
          getCurrentPlaceForTelegramUser: () =>
            Promise.resolve({
              state: "ready",
              locationId: "location.korchma.deep.level1.straight",
              locationName: "Прямий прохід",
              insideKorchma: true
            })
        }
      })
    );
    const messages = calls.filter((call) => call.method === "sendMessage").map((call) => String(call.payload.text));
    const introMessages = messages.filter((text) => text.includes("Проти вас:"));
    const fight = messages.find((text) => text.includes("❤️ Ви:"));

    expect(attackPersistentPassageEncounterForTelegramUser).toHaveBeenCalledWith(42n, "token13", {
      callbackOriginLocationId: "location.korchma.deep.level1.straight",
      currentLocationId: "location.korchma.deep.level1.straight"
    });
    expect(markAction).toHaveBeenCalledWith(
      expect.objectContaining({
        locationId: "location.korchma.deep.level1.straight",
        currentAdventureId: "adventure.solo-fight"
      })
    );
    expect(introMessages).toHaveLength(1);
    expect(introMessages[0]).toContain("Слава далеко пішла. На шум прийшов ще один охочий подивитися");
    expect(introMessages[0]).toContain("👹 1. <b>Квасний голем на заквасці</b> · рівень 5");
    expect(introMessages[0]).toContain("👹 2. <b>Лис нечіткого дедлайну</b> · рівень 4");
    expect(introMessages[0]).toContain("<i>Порада дня:");
    expect(fight).toContain("⏳ На хід є 23 секунди.");
    expect(fight).not.toContain("Проти вас:");
    expect(
      calls.some(
        (call) =>
          call.method === "sendMessage" &&
          String(call.payload.text).includes("Ви пішли у прямий прохід.")
      )
    ).toBe(false);
  });

  it("routes a repeated passage attack callback through the same survivor token", async () => {
    const markAction = vi.fn(() => Promise.resolve());
    const getOrStartPersistentFightForTelegramUser = vi.fn();
    const survivorMonster = {
      id: "monster.deadline-spider",
      name: "Павук дедлайнів",
      description: "Плете павутину з «сьогодні швиденько».",
      level: 2,
      tags: ["beast", "time", "web"]
    };
    const firstSession = persistentSessionWithOrigin("location.korchma.deep.level1.straight");
    const secondSession = {
      ...persistentSessionWithOrigin("location.korchma.deep.level1.straight"),
      id: "123e4567-e89b-42d3-a456-426614174333",
      state: {
        ...persistentSessionWithOrigin("location.korchma.deep.level1.straight").state,
        id: "123e4567-e89b-42d3-a456-426614174333",
        monster: {
          hp: 7,
          hpMax: 12
        }
      }
    };
    const attackPersistentPassageEncounterForTelegramUser = vi.fn()
      .mockResolvedValueOnce({
        state: "persistent-active" as const,
        started: true,
        character: {
          ...character,
          level: 3
        },
        session: firstSession,
        monster: survivorMonster,
        questProgress: null
      })
      .mockResolvedValueOnce({
        state: "persistent-active" as const,
        started: true,
        character: {
          ...character,
          level: 3
        },
        session: secondSession,
        monster: survivorMonster,
        questProgress: null
      });
    const servicesForPress = (session: ReturnType<typeof persistentSessionWithOrigin>) =>
      servicesWith({
        fight: {
          getFightOverviewForTelegramUser: vi.fn()
            .mockResolvedValueOnce({
              state: "persistent-ready" as const,
              character: {
                ...character,
                level: 3
              },
              questProgress: null
            })
            .mockResolvedValue({
              state: "persistent-active" as const,
              started: true,
              character: {
                ...character,
                level: 3
              },
              session,
              monster: survivorMonster,
              questProgress: null
            }),
          getOrStartPersistentFightForTelegramUser,
          attackPersistentPassageEncounterForTelegramUser,
          recordPersistentFightMessageReference: () => Promise.resolve()
        },
        presence: {
          markAction,
          getCurrentPlaceForTelegramUser: () =>
            Promise.resolve({
              state: "ready",
              locationId: "location.korchma.deep.level1.straight",
              locationName: "Прямий прохід",
              insideKorchma: true
            })
        }
      });

    await captureApiCalls("v1:fight:pass:deep-straight:token13", servicesForPress(firstSession));
    const repeatedCalls = await captureApiCalls(
      "v1:fight:pass:deep-straight:token13",
      servicesForPress(secondSession)
    );
    const fightTexts = repeatedCalls
      .filter((call) => call.method === "sendMessage")
      .map((call) => String(call.payload.text));

    expect(attackPersistentPassageEncounterForTelegramUser).toHaveBeenCalledTimes(2);
    expect(attackPersistentPassageEncounterForTelegramUser).toHaveBeenNthCalledWith(1, 42n, "token13", {
      callbackOriginLocationId: "location.korchma.deep.level1.straight",
      currentLocationId: "location.korchma.deep.level1.straight"
    });
    expect(attackPersistentPassageEncounterForTelegramUser).toHaveBeenNthCalledWith(2, 42n, "token13", {
      callbackOriginLocationId: "location.korchma.deep.level1.straight",
      currentLocationId: "location.korchma.deep.level1.straight"
    });
    expect(getOrStartPersistentFightForTelegramUser).not.toHaveBeenCalled();
    expect(markAction).toHaveBeenLastCalledWith(
      expect.objectContaining({
        locationId: "location.korchma.deep.level1.straight",
        currentAdventureId: "adventure.solo-fight"
      })
    );
    expect(fightTexts.some((text) => text.includes("Павук"))).toBe(true);
    expect(
      fightTexts.some((text) => text.includes("Павук") && text.includes("7/12") && !text.includes("Проти вас:"))
    ).toBe(true);
  });

  it("keeps rapid duplicate passage attack taps on one active session", async () => {
    const activeSession = persistentSessionWithOrigin("location.korchma.deep.level1.straight");
    const monster = {
      id: "monster.deadline-spider",
      name: "First Passage Monster",
      description: "Started from the original passage token.",
      level: 2,
      tags: ["test"]
    };
    const getFightOverviewForTelegramUser = vi.fn()
      .mockResolvedValueOnce({
        state: "persistent-ready" as const,
        character: {
          ...character,
          level: 3
        },
        questProgress: null
      })
      .mockResolvedValueOnce({
        state: "persistent-active" as const,
        started: true,
        character: {
          ...character,
          level: 3
        },
        session: activeSession,
        monster,
        questProgress: null
      })
      .mockResolvedValueOnce({
        state: "persistent-ready" as const,
        character: {
          ...character,
          level: 3
        },
        questProgress: null
      })
      .mockResolvedValue({
        state: "persistent-active" as const,
        started: false,
        character: {
          ...character,
          level: 3
        },
        session: activeSession,
        monster,
        questProgress: null
      });
    const createdSessionIds: string[] = [];
    const attackPersistentPassageEncounterForTelegramUser = vi.fn(() => {
      createdSessionIds.push(activeSession.id);
      return Promise.resolve({
        state: "persistent-active" as const,
        started: false,
        character: {
          ...character,
          level: 3
        },
        session: activeSession,
        monster,
        questProgress: null
      });
    });

    const calls = await captureRepeatedApiCalls(
      ["v1:fight:pass:deep-straight:token13", "v1:fight:pass:deep-straight:token13"],
      servicesWith({
        fight: {
          getFightOverviewForTelegramUser,
          attackPersistentPassageEncounterForTelegramUser,
          recordPersistentFightMessageReference: () => Promise.resolve()
        },
        presence: {
          markAction: () => Promise.resolve(),
          getCurrentPlaceForTelegramUser: () =>
            Promise.resolve({
              state: "ready",
              locationId: "location.korchma.deep.level1.straight",
              locationName: "Straight passage",
              insideKorchma: true
            })
        }
      })
    );

    expect(attackPersistentPassageEncounterForTelegramUser).toHaveBeenCalledTimes(1);
    expect(attackPersistentPassageEncounterForTelegramUser).toHaveBeenNthCalledWith(1, 42n, "token13", {
      callbackOriginLocationId: "location.korchma.deep.level1.straight",
      currentLocationId: "location.korchma.deep.level1.straight"
    });
    expect(createdSessionIds).toEqual([activeSession.id]);
    expect(calls.some((call) => call.method === "sendMessage" || call.method === "editMessageText")).toBe(true);
  });

  it("refreshes the current passage instead of replaying a duplicate stale passage attack", async () => {
    const markAction = vi.fn(() => Promise.resolve());
    const activeSession = persistentSessionWithOrigin("location.korchma.deep.level1.straight");
    const getFightOverviewForTelegramUser = vi.fn()
      .mockResolvedValueOnce({
        state: "persistent-ready" as const,
        character: {
          ...character,
          level: 3
        },
        questProgress: null
      })
      .mockResolvedValueOnce({
        state: "persistent-active" as const,
        started: true,
        character: {
          ...character,
          level: 3
        },
        session: activeSession,
        monster: {
          id: "monster.deadline-spider",
          name: "First Passage Monster",
          description: "Started from the original passage token.",
          level: 2,
          tags: ["test"]
        },
        questProgress: null
      })
      .mockResolvedValue({
        state: "persistent-ready" as const,
        character: {
          ...character,
          level: 3
        },
        questProgress: null
      });
    const attackPersistentPassageEncounterForTelegramUser = vi.fn(() =>
      Promise.resolve({
        state: "persistent-active" as const,
        started: true,
        character: {
          ...character,
          level: 3
        },
        session: activeSession,
        monster: {
          id: "monster.deadline-spider",
          name: "First Passage Monster",
          description: "Started from the original passage token.",
          level: 2,
          tags: ["test"]
        },
        questProgress: null
      })
    );
    const previewPersistentFightForTelegramUser = vi.fn(() =>
      Promise.resolve({
        state: "persistent-preview" as const,
        character: {
          ...character,
          level: 3
        },
        questProgress: null,
        monster: {
          id: "monster.left-door",
          name: "Left Passage Monster",
          description: "Recovered from the actual current passage.",
          level: 6,
          tags: ["test"]
        },
        difficulty: "hard" as const,
        originLocationId: "location.korchma.deep.level1.left",
        encounterToken: "lefttoken93"
      })
    );
    const straightPlace = {
      state: "ready" as const,
      locationId: "location.korchma.deep.level1.straight",
      locationName: "Straight passage",
      insideKorchma: true
    };
    const leftPlace = {
      state: "ready" as const,
      locationId: "location.korchma.deep.level1.left",
      locationName: "Left passage",
      insideKorchma: true
    };
    const getCurrentPlaceForTelegramUser = vi.fn()
      .mockResolvedValueOnce(straightPlace)
      .mockResolvedValueOnce(straightPlace)
      .mockResolvedValueOnce(straightPlace)
      .mockResolvedValue(leftPlace);
    const calls = await captureRepeatedApiCalls(
      ["v1:fight:pass:deep-straight:token13", "v1:fight:pass:deep-straight:token13"],
      servicesWith({
        fight: {
          getFightOverviewForTelegramUser,
          attackPersistentPassageEncounterForTelegramUser,
          previewPersistentFightForTelegramUser,
          recordPersistentFightMessageReference: () => Promise.resolve()
        },
        presence: {
          markAction,
          getCurrentPlaceForTelegramUser
        }
      })
    );
    const refreshedPreview = calls.find(
      (call) =>
        call.method === "editMessageText" &&
        String(call.payload.text).includes("Left Passage Monster")
    );
    expect(attackPersistentPassageEncounterForTelegramUser).toHaveBeenCalledTimes(1);
    expect(attackPersistentPassageEncounterForTelegramUser).toHaveBeenCalledWith(42n, "token13", {
      callbackOriginLocationId: "location.korchma.deep.level1.straight",
      currentLocationId: "location.korchma.deep.level1.straight"
    });
    expect(previewPersistentFightForTelegramUser).toHaveBeenCalledTimes(1);
    expect(previewPersistentFightForTelegramUser).toHaveBeenCalledWith(42n, {
      difficulty: "hard",
      originLocationId: "location.korchma.deep.level1.left"
    });
    expect(markAction).toHaveBeenLastCalledWith(
      expect.objectContaining({
        locationId: "location.korchma.deep.level1.left",
        currentAdventureId: "adventure.solo-fight"
      })
    );
    expect(String(refreshedPreview?.payload.text)).toContain("Left Passage Monster");
    expect(JSON.stringify(refreshedPreview?.payload.reply_markup)).toContain(
      "v1:fight:pass:deep-left:lefttoken93"
    );
  });

  it("rolls back a complication claim when the follow-up fight needs rest", async () => {
    const markAction = vi.fn(() => Promise.resolve());
    const rollbackCurrentAdventureClaimForTelegramUser = vi.fn(() =>
      Promise.resolve("deleted" as const)
    );
    const getOrStartPersistentFightForTelegramUser = vi.fn(() =>
      Promise.resolve({
        state: "needs-rest" as const,
        character: {
          ...character,
          hpCurrent: 0
        }
      })
    );
    const calls = await captureApiCalls(
      makeAdventureApproachCallbackData({
        periodToken: "period93",
        problemId: "stew",
        methodId: adventureApproach.id
      }),
      servicesWith({
        adventure: {
          completeAdventureApproach: () =>
            Promise.resolve({
              state: "completed" as const,
              character,
              choice: adventureChoice,
              approach: adventureApproach,
              reward: {
                xp: 0,
                gold: 0,
                localDate: "12026-06-12",
                itemGrants: []
              },
              levelChange: noLevelChange,
              complication: true,
              grade: "complication",
              consequence: "fight-handoff",
              outcome: "Горщик викликав вас на чесний бій ложками.",
              spentGold: 0,
              hpLoss: null,
              fightHandoff: true,
              fightEncounter: { monsterId: "monster.borshch-slime" },
              claim: {
                key: "adventure.choice",
                localDate: "12026-06-12",
              },
              check: {
                roll: 13,
                target: 45,
                total: 13,
                statBonus: 0,
                grade: "complication"
              }
            }),
          rollbackCurrentAdventureClaimForTelegramUser
        },
        fight: {
          getOrStartPersistentFightForTelegramUser
        },
        presence: {
          markAction
        }
      })
    );
    const edit = calls.find((call) => call.method === "editMessageText");

    expect(getOrStartPersistentFightForTelegramUser).toHaveBeenCalledWith(42n, {
      source: "adventure",
      originLocationId: "location.korchma.quest_table",
      difficulty: "normal",
      target: { monsterIds: ["monster.borshch-slime"] }
    });
    expect(rollbackCurrentAdventureClaimForTelegramUser).toHaveBeenCalledWith(42n, {
      key: "adventure.choice",
      localDate: "12026-06-12"
    });
    expect(markAction).not.toHaveBeenCalled();
    expect(String(edit?.payload.text)).toContain("HP 0/20");
    expect(String(edit?.payload.text)).not.toContain("Нагорода не видана");
    expect(calls.some((call) => call.method === "sendMessage")).toBe(false);
  });

  it("rolls back a complication claim when another active fight wins the handoff race", async () => {
    const markAction = vi.fn(() => Promise.resolve());
    const rollbackCurrentAdventureClaimForTelegramUser = vi.fn(() =>
      Promise.resolve("deleted" as const)
    );
    const getOrStartPersistentFightForTelegramUser = vi.fn(() =>
      Promise.resolve({
        state: "persistent-active" as const,
        character: {
          ...character,
          level: 3
        },
        session: persistentSession("monster.deadline-spider"),
        monster: {
          id: "monster.deadline-spider",
          name: "Павук дедлайнів",
          description: "Плете павутину з «сьогодні швиденько».",
          level: 2,
          tags: ["beast", "time", "web"]
        },
        questProgress: null
      })
    );
    const calls = await captureApiCalls(
      makeAdventureApproachCallbackData({
        periodToken: "period93",
        problemId: "stew",
        methodId: adventureApproach.id
      }),
      servicesWith({
        adventure: {
          completeAdventureApproach: () =>
            Promise.resolve({
              state: "completed" as const,
              character,
              choice: adventureChoice,
              approach: adventureApproach,
              reward: {
                xp: 0,
                gold: 0,
                localDate: "12026-06-12",
                itemGrants: []
              },
              levelChange: noLevelChange,
              complication: true,
              grade: "complication",
              consequence: "fight-handoff",
              outcome: "Горщик викликав вас на чесний бій ложками.",
              spentGold: 0,
              hpLoss: null,
              fightHandoff: true,
              fightEncounter: { monsterId: "monster.borshch-slime" },
              claim: {
                key: "adventure.choice",
                localDate: "12026-06-12",
              },
              check: {
                roll: 13,
                target: 45,
                total: 13,
                statBonus: 0,
                grade: "complication"
              }
            }),
          rollbackCurrentAdventureClaimForTelegramUser
        },
        fight: {
          getOrStartPersistentFightForTelegramUser
        },
        presence: {
          markAction
        }
      })
    );
    const edit = calls.find((call) => call.method === "editMessageText");

    expect(getOrStartPersistentFightForTelegramUser).toHaveBeenCalledWith(42n, {
      source: "adventure",
      originLocationId: "location.korchma.quest_table",
      difficulty: "normal",
      target: { monsterIds: ["monster.borshch-slime"] }
    });
    expect(rollbackCurrentAdventureClaimForTelegramUser).toHaveBeenCalledWith(42n, {
      key: "adventure.choice",
      localDate: "12026-06-12"
    });
    const [presenceInput] = markAction.mock.calls[0] as [MarkPresenceInput];
    expect(presenceInput.user.telegramUserId).toBe(42n);
    expect(presenceInput).toMatchObject({
      locationId: "location.korchma.deep.level1",
      currentRaidId: null,
      currentAdventureId: "adventure.solo-fight"
    });
    expect(String(edit?.payload.text)).toContain("❤️ Ви:");
    expect(String(edit?.payload.text)).toContain("⏳ На хід є 23 секунди.");
    expect(String(edit?.payload.text)).not.toContain("Нагорода не видана");
    expect(calls.some((call) => call.method === "sendMessage")).toBe(false);
  });

  it("rolls back a complication claim when a training fight wins the handoff race", async () => {
    const markAction = vi.fn(() => Promise.resolve());
    const rollbackCurrentAdventureClaimForTelegramUser = vi.fn(() =>
      Promise.resolve("deleted" as const)
    );
    const getOrStartPersistentFightForTelegramUser = vi.fn(() =>
      Promise.resolve({
        state: "training-active" as const,
        character,
        session: trainingSession(),
        questProgress: null
      })
    );
    const calls = await captureApiCalls(
      makeAdventureApproachCallbackData({
        periodToken: "period93",
        problemId: "stew",
        methodId: adventureApproach.id
      }),
      servicesWith({
        adventure: {
          completeAdventureApproach: () =>
            Promise.resolve({
              state: "completed" as const,
              character,
              choice: adventureChoice,
              approach: adventureApproach,
              reward: { xp: 0, gold: 0, localDate: "12026-06-12", itemGrants: [] },
              levelChange: noLevelChange,
              complication: true,
              grade: "complication",
              consequence: "fight-handoff",
              outcome: "Казанок покликав не ту бійку.",
              spentGold: 0,
              hpLoss: null,
              fightHandoff: true,
              fightEncounter: { monsterId: "monster.borshch-slime" },
              claim: { key: "adventure.choice", localDate: "12026-06-12" },
              check: { roll: 13, target: 45, total: 13, statBonus: 0, grade: "complication" }
            }),
          rollbackCurrentAdventureClaimForTelegramUser
        },
        fight: {
          getOrStartPersistentFightForTelegramUser
        },
        presence: {
          markAction
        }
      })
    );
    const edit = calls.find((call) => call.method === "editMessageText");

    expect(rollbackCurrentAdventureClaimForTelegramUser).toHaveBeenCalledWith(42n, {
      key: "adventure.choice",
      localDate: "12026-06-12"
    });
    const [presenceInput] = markAction.mock.calls[0] as [MarkPresenceInput];
    expect(presenceInput.user.telegramUserId).toBe(42n);
    expect(presenceInput).toMatchObject({
      locationId: "location.korchma.fighting_corner",
      currentRaidId: null,
      currentAdventureId: "adventure.training-doppelganger"
    });
    expect(String(edit?.payload.text)).toContain("Тренування вже триває");
    expect(calls.some((call) => call.method === "sendMessage")).toBe(false);
  });

  it("rolls back a complication claim when an expired terminal fight is returned", async () => {
    const markAction = vi.fn(() => Promise.resolve());
    const rollbackCurrentAdventureClaimForTelegramUser = vi.fn(() =>
      Promise.resolve("deleted" as const)
    );
    const terminalSession = {
      ...persistentSession("monster.deadline-spider"),
      status: "won" as const,
      state: {
        ...persistentSession("monster.deadline-spider").state,
        status: "won" as const,
        lastTurn: {
          action: "attack" as const,
          heroOutcome: "won" as const,
          heroDamage: 18,
          monsterDamage: 0,
          manaSpent: 0,
          critical: false
        }
      }
    };
    const getOrStartPersistentFightForTelegramUser = vi.fn(() =>
      Promise.resolve({
        state: "persistent-terminal" as const,
        character,
        session: terminalSession,
        monster: {
          id: "monster.deadline-spider",
          name: "Павук дедлайнів",
          description: "Плете павутину з «сьогодні швиденько».",
          level: 2,
          tags: ["beast", "time", "web"]
        },
        questProgress: null,
        fightReward: null
      })
    );
    const calls = await captureApiCalls(
      makeAdventureApproachCallbackData({
        periodToken: "period93",
        problemId: "stew",
        methodId: adventureApproach.id
      }),
      servicesWith({
        adventure: {
          completeAdventureApproach: () =>
            Promise.resolve({
              state: "completed" as const,
              character,
              choice: adventureChoice,
              approach: adventureApproach,
              reward: { xp: 0, gold: 0, localDate: "12026-06-12", itemGrants: [] },
              levelChange: noLevelChange,
              complication: true,
              grade: "complication",
              consequence: "fight-handoff",
              outcome: "Казанок знайшов уже завершену бійку.",
              spentGold: 0,
              hpLoss: null,
              fightHandoff: true,
              fightEncounter: { monsterId: "monster.borshch-slime" },
              claim: { key: "adventure.choice", localDate: "12026-06-12" },
              check: { roll: 13, target: 45, total: 13, statBonus: 0, grade: "complication" }
            }),
          rollbackCurrentAdventureClaimForTelegramUser
        },
        fight: {
          getOrStartPersistentFightForTelegramUser
        },
        presence: {
          markAction
        }
      })
    );
    const edit = calls.find((call) => call.method === "editMessageText");

    expect(rollbackCurrentAdventureClaimForTelegramUser).toHaveBeenCalledWith(42n, {
      key: "adventure.choice",
      localDate: "12026-06-12"
    });
    const [presenceInput] = markAction.mock.calls[0] as [MarkPresenceInput];
    expect(presenceInput.user.telegramUserId).toBe(42n);
    expect(presenceInput).toMatchObject({
      locationId: "location.korchma.deep.level1",
      currentRaidId: null,
      currentAdventureId: "adventure.solo-fight"
    });
    expect(String(edit?.payload.text)).toContain("❤️ Ви:");
    expect(String(edit?.payload.text)).toContain("🎉 Ви перемогли.");
    expect(String(edit?.payload.text)).not.toContain("⏳ На хід є 23 секунди.");
    expect(calls.some((call) => call.method === "sendMessage")).toBe(false);
  });

  it("blocks level barter callbacks while the Barrel raid is pending", async () => {
    const calls = await captureApiCalls(
      makeLevelBarterAutoCallbackData(),
      servicesWith({
        tavern: {
          getTavernForTelegramUser: () => Promise.resolve({ state: "no-character" }),
          completeFridayBarrelRaid: () => Promise.resolve({ state: "no-character" }),
          advanceFridayBarrelRaid: () => Promise.resolve({ state: "no-character" }),
          getActivePendingFridayBarrelRaidForTelegramUser: () =>
            Promise.resolve({
              state: "pending",
              character,
              availableAt: new Date("2026-06-16T10:08:00.000Z"),
              now: new Date("2026-06-16T10:03:00.000Z")
            })
        },
        levelBarter: {
          createAutoPreviewForTelegramUser: vi.fn(() => Promise.reject(new Error("should not be called")))
        }
      })
    );
    const edit = calls.find((call) => call.method === "editMessageText");

    expect(String(edit?.payload.text)).toContain("Ви зараз у рейді");
  });

  it("allows the raid leaderboard shortcut while the Barrel raid is pending", async () => {
    const getRoundLeaderboardForTelegramUser = vi.fn(() =>
      Promise.resolve({
        state: "ready" as const,
        character,
        leaderboard: {
          day: [],
          week: [],
          month: []
        }
      })
    );
    const calls = await captureApiCalls(
      makeTavernCallbackData("raid-leaderboard"),
      servicesWith({
        tavern: {
          getTavernForTelegramUser: () => Promise.resolve({ state: "no-character" }),
          completeFridayBarrelRaid: () => Promise.resolve({ state: "no-character" }),
          advanceFridayBarrelRaid: () => Promise.resolve({ state: "no-character" }),
          getActivePendingFridayBarrelRaidForTelegramUser: () =>
            Promise.resolve({
              state: "pending",
              character,
              availableAt: new Date("2026-06-16T10:08:00.000Z"),
              now: new Date("2026-06-16T10:03:00.000Z")
            }),
          getRoundLeaderboardForTelegramUser
        }
      })
    );
    const edit = calls.find((call) => call.method === "editMessageText");

    expect(getRoundLeaderboardForTelegramUser).toHaveBeenCalledWith(42n);
    expect(String(edit?.payload.text)).toContain("Рейдовий доступ до рейтингу");
    expect(String(edit?.payload.text)).not.toContain("Ви зараз у рейді");
  });

  it.each([
    makeTavernCallbackData("raid-news"),
    "v1:news:rlist:0"
  ])("allows raid news callback %s while the Barrel raid is pending", async (callbackData) => {
    const calls = await captureApiCalls(
      callbackData,
      servicesWith({
        tavern: {
          getTavernForTelegramUser: () => Promise.resolve({ state: "no-character" }),
          completeFridayBarrelRaid: () => Promise.resolve({ state: "no-character" }),
          advanceFridayBarrelRaid: () => Promise.resolve({ state: "no-character" }),
          getActivePendingFridayBarrelRaidForTelegramUser: () =>
            Promise.resolve({
              state: "pending",
              character,
              availableAt: new Date("2026-06-16T10:08:00.000Z"),
              now: new Date("2026-06-16T10:03:00.000Z")
            })
        }
      })
    );
    const edit = calls.find((call) => call.method === "editMessageText");
    const keyboard = JSON.stringify(edit?.payload.reply_markup);

    expect(String(edit?.payload.text)).not.toContain("Ви зараз у рейді");
    expect(keyboard).toContain(makeTavernCallbackData("raid"));
  });

  it("returns from night Munchkin barter to the Nyz descent", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-19T18:30:00.000Z"));

    const calls = await captureApiCalls(
      makeLevelBarterOpenCallbackData(),
      servicesWith({
        levelBarter: {
          getOfferForTelegramUser: () =>
            Promise.resolve({
              state: "insufficient",
              character,
              eligibleTotalValue: 800,
              gold: 70,
              combinedValue: 870,
              cost: 1000
            })
        }
      })
    );
    const edit = calls.find((call) => call.method === "editMessageText");
    const keyboard = JSON.stringify(edit?.payload.reply_markup);

    expect(keyboard).toContain("↩️ До Низу");
    expect(keyboard).toContain(makePlaceCallbackData("deep"));
    expect(keyboard).not.toContain(makePlaceCallbackData("front"));
  });

  it("blocks remort callbacks while the Barrel raid is pending", async () => {
    const calls = await captureApiCalls(
      makeRemortConfirmCallbackData("0123456789abcdef"),
      servicesWith({
        tavern: {
          getTavernForTelegramUser: () => Promise.resolve({ state: "no-character" }),
          completeFridayBarrelRaid: () => Promise.resolve({ state: "no-character" }),
          advanceFridayBarrelRaid: () => Promise.resolve({ state: "no-character" }),
          getActivePendingFridayBarrelRaidForTelegramUser: () =>
            Promise.resolve({
              state: "pending",
              character,
              availableAt: new Date("2026-06-16T10:08:00.000Z"),
              now: new Date("2026-06-16T10:03:00.000Z")
            })
        },
        remort: {
          confirmForTelegramUser: vi.fn(() => Promise.reject(new Error("should not be called")))
        }
      })
    );
    const edit = calls.find((call) => call.method === "editMessageText");

    expect(String(edit?.payload.text)).toContain("Ви зараз у рейді");
  });

  it("keeps Yeger tracking flavor for active matching unquiet fights", async () => {
    const calls = await captureApiCalls(
      makeYegerTrackCallbackData(),
      servicesWith({
        yeger: {
          getForTelegramUser: () =>
            Promise.resolve({
              state: "in-progress",
              character,
              progress: { wins: 1, target: 5 },
              tracking: {
                state: "tracking-ready",
                availableAt: new Date("2026-06-15T10:04:00.000Z"),
                now: new Date("2026-06-15T10:05:00.000Z")
              }
            }),
          trackForTelegramUser: () =>
            Promise.resolve({
              state: "tracking-resolved-success",
              character,
              progress: { wins: 1, target: 5 },
              tracking: {
                state: "tracking-pending",
                availableAt: new Date("2026-06-15T10:08:00.000Z"),
                now: new Date("2026-06-15T10:05:00.000Z")
              },
              fight: {
                state: "persistent-active",
                character,
                session: persistentSession("monster.complaint-lantern"),
                monster: {
                  id: "monster.complaint-lantern",
                  name: "Скаргова лампа",
                  description: "Світить лише тоді, коли хтось починає жалітись.",
                  level: 4,
                  tags: ["paperwork", "sound", "time", "unquiet"]
                },
                questProgress: null
              }
            })
        }
      })
    );
    const edit = calls.find((call) => call.method === "editMessageText");

    expect(String(edit?.payload.text)).toContain("Щось неупокоєне знайшлося");
    expect(String(edit?.payload.text)).not.toContain("У вас уже триває інша сутичка.");
  });

  it("sends an HTML barrel raid completion notification after the pending timer ends", async () => {
    vi.useFakeTimers();

    const calls = await captureApiCalls(
      makeTavernCallbackData("raid"),
      servicesWith({
        tavern: {
          advanceFridayBarrelRaid: () =>
            Promise.resolve({
              state: "pending-started",
              character,
              availableAt: new Date("2026-06-13T10:31:00.000Z"),
              now: new Date("2026-06-13T10:30:00.000Z"),
              periodId: "2026-06-13T10:23"
            }),
          completeFridayBarrelRaid: () =>
            Promise.resolve({
              state: "completed",
              character,
              reward: {
                xp: 25,
                gold: 10,
                localDate: "2026-06-13T10:23",
                itemGrants: [
                  {
                    itemId: "item.wet-hero-ticket",
                    name: "Квиток мокрого пригодника",
                    quantity: 1
                  }
                ]
              },
              levelChange: noLevelChange
            })
        }
      })
    );

    expect(calls.find((call) => call.method === "sendMessage")).toBeUndefined();

    await vi.advanceTimersByTimeAsync(60_000);

    const notification = calls.find(
      (call) => call.method === "sendMessage" && String(call.payload.text).includes("Рейд завершено")
    );

    expect(getParseMode(notification?.payload)).toBe("HTML");
    expect(String(notification?.payload.text)).toContain("<b>+25 XP\n+10 золота</b>");
  });

  it("completes the Barrel beer tutorial through scheduled raid completion and beer callbacks", async () => {
    vi.useFakeTimers();

    const progress = {
      accepted: false,
      stipendGranted: false,
      visitedBarrel: false,
      raidCompleted: false,
      beerRoundOffered: false,
      beerDrunk: false,
      activeBeer: false,
      currentLocationId: "location.korchma.quest_table"
    };
    const barrelBeerTutorial = {
      acceptForTelegramUser: vi.fn(() => {
        progress.accepted = true;
        progress.stipendGranted = true;

        return Promise.resolve({
          state: "accepted" as const,
          character: { ...character, level: 2, gold: 39 },
          stipendGold: 39,
          progress: { ...progress }
        });
      }),
      getForTelegramUser: vi.fn(() =>
        Promise.resolve({
          state: progress.accepted && progress.visitedBarrel && progress.raidCompleted &&
            progress.beerRoundOffered && progress.beerDrunk && progress.activeBeer
            ? "turn-in-ready" as const
            : progress.accepted
              ? "in-progress" as const
              : "available" as const,
          character: { ...character, level: 2 },
          progress: { ...progress }
        })
      ),
      markVisitedBarrelForTelegramUser: vi.fn(() => {
        if (progress.accepted) {
          progress.visitedBarrel = true;
          progress.currentLocationId = "location.korchma.barrel";
        }

        return Promise.resolve();
      }),
      markBarrelRaidCompletedForTelegramUser: vi.fn(() => {
        if (progress.accepted && progress.visitedBarrel) {
          progress.raidCompleted = true;
        }

        return Promise.resolve();
      }),
      markBeerRoundOfferedForTelegramUser: vi.fn(() => {
        if (progress.accepted && progress.visitedBarrel && progress.raidCompleted) {
          progress.beerRoundOffered = true;
        }

        return Promise.resolve();
      }),
      markBeerDrunkForTelegramUser: vi.fn(() => {
        if (progress.accepted) {
          progress.beerDrunk = true;
          progress.activeBeer = true;
        }

        return Promise.resolve();
      }),
      turnInForTelegramUser: vi.fn(() => {
        if (progress.currentLocationId !== "location.korchma.quest_table") {
          return Promise.resolve({
            state: "wrong-location" as const,
            character: { ...character, level: 2 },
            progress: { ...progress }
          });
        }

        if (
          !progress.accepted ||
          !progress.visitedBarrel ||
          !progress.raidCompleted ||
          !progress.beerRoundOffered ||
          !progress.beerDrunk
        ) {
          return Promise.resolve({
            state: "missing-progress" as const,
            character: { ...character, level: 2 },
            progress: { ...progress }
          });
        }

        return Promise.resolve({
          state: "completed" as const,
          character: { ...character, level: 2, xp: 6 },
          reward: {
            xp: 6,
            gold: 0,
            itemGrants: [{
              itemId: "item.persten-pyvovladdia",
              name: "Перстень Пивовладдя",
              quantity: 1
            }]
          },
          levelChange: noLevelChange,
          progress: { ...progress },
          achievementUnlocks: []
        });
      })
    };
    const services = servicesWith({
      presence: {
        markAction: (input: MarkPresenceInput) => {
          if ("locationId" in input) {
            progress.currentLocationId = input.locationId;
          }

          return Promise.resolve();
        },
        getRaidParticipantsForTelegramUser: () => Promise.resolve({ state: "no-character" }),
        getAdventureParticipantsForTelegramUser: () => Promise.resolve({ state: "no-character" }),
        getCurrentPlaceForTelegramUser: () =>
          Promise.resolve({
            state: "ready",
            locationId: progress.currentLocationId,
            locationName: "Стіл зі справами",
            insideKorchma: true
          }),
        getOnlineForTelegramUser: () => Promise.resolve({ state: "no-character" }),
        getLookForTelegramUser: () => Promise.resolve({ state: "no-character" })
      },
      tavern: {
        advanceFridayBarrelRaid: () =>
          Promise.resolve({
            state: "pending-started" as const,
            character: { ...character, level: 2 },
            availableAt: new Date("2026-06-13T10:31:00.000Z"),
            now: new Date("2026-06-13T10:30:00.000Z"),
            periodId: "2026-06-13T10:23"
          }),
        completeFridayBarrelRaid: () =>
          Promise.resolve({
            state: "completed" as const,
            character: { ...character, level: 2 },
            reward: {
              xp: 25,
              gold: 10,
              localDate: "2026-06-13T10:23",
              itemGrants: []
            },
            levelChange: noLevelChange
          }),
        getActivePendingFridayBarrelRaidForTelegramUser: () =>
          Promise.resolve({ state: "none" as const })
      },
      shynok: {
        confirmRoundOrderForTelegramUser: () =>
          Promise.resolve({
            state: "completed" as const,
            character: { ...character, level: 2 },
            tier: "simple" as const,
            priceGold: 26,
            recipientCount: 0,
            recipients: [],
            leaderboard: { day: [], week: [], month: [] }
          }),
        confirmSelfDrinkOrderForTelegramUser: () =>
          Promise.resolve({
            state: "completed" as const,
            character: { ...character, level: 2 },
            drink: {
              key: "drink.simple-beer" as const,
              name: "Просте пиво",
              emoji: "🍺",
              priceGold: 13,
              durationMinutes: 23,
              recoveryMultiplierBp: 12300,
              accuracyPenaltyPp: 5,
              phase: "timed" as const,
              startedAt: new Date("2026-06-13T10:32:00.000Z"),
              expiresAt: new Date("2026-06-13T10:55:00.000Z")
            },
            spentGold: 13
          })
      },
      fight: questMarkerFightService(),
      yeger: questMarkerYegerService(),
      barrelBeerTutorial
    });

    await captureApiCalls(makeQuestCallbackData("barrel-tutorial"), services);
    await captureApiCalls(makeTavernCallbackData("raid"), services);
    await vi.advanceTimersByTimeAsync(60_000);
    await captureApiCalls(
      makeShynokRoundConfirmCallbackData("simple", "12345678-1234-4234-9234-123456789abc"),
      services
    );
    await captureApiCalls(
      makeShynokDrinkConfirmCallbackData("12345678-1234-4234-9234-123456789abc"),
      services
    );
    await captureApiCalls(makePlaceCallbackData("quest-table"), services);
    const turnInCalls = await captureApiCalls(makeQuestCallbackData("barrel-tutorial-turn-in"), services);
    const finalEdit = turnInCalls.find((call) => call.method === "editMessageText");

    expect(barrelBeerTutorial.markVisitedBarrelForTelegramUser).toHaveBeenCalledWith(42n);
    expect(barrelBeerTutorial.markBarrelRaidCompletedForTelegramUser).toHaveBeenCalledWith(42n);
    expect(barrelBeerTutorial.markBeerRoundOfferedForTelegramUser).toHaveBeenCalledWith(42n);
    expect(barrelBeerTutorial.markBeerDrunkForTelegramUser).toHaveBeenCalledWith(42n);
    expect(barrelBeerTutorial.turnInForTelegramUser).toHaveBeenCalledWith(42n);
    expect(String(finalEdit?.payload.text)).toContain("Здається, Бочка тепер запамʼятала тебе");
    expect(String(finalEdit?.payload.text)).toContain("<i>Отримано:</i>\n+6 XP");
    expect(String(finalEdit?.payload.text)).toContain("Перстень Пивовладдя");
  });

  it("does not send a barrel raid timer notification after manual completion claims the reward", async () => {
    vi.useFakeTimers();

    let rewardClaimed = false;
    const tavern: Partial<BotServices["tavern"]> = {
      advanceFridayBarrelRaid: () =>
        Promise.resolve({
          state: "pending-started",
          character,
          availableAt: new Date("2026-06-13T10:31:00.000Z"),
          now: new Date("2026-06-13T10:30:00.000Z"),
          periodId: "2026-06-13T10:23"
        }),
      completeFridayBarrelRaid: () => {
        if (rewardClaimed) {
          return Promise.resolve({
            state: "already-completed",
            character,
            reward: {
              xp: 25,
              gold: 10,
              localDate: "2026-06-13T10:23",
              itemGrants: []
            },
            levelChange: noLevelChange
          });
        }

        rewardClaimed = true;
        return Promise.resolve({
          state: "completed",
          character,
          reward: {
            xp: 25,
            gold: 10,
            localDate: "2026-06-13T10:23",
            itemGrants: []
          },
          levelChange: noLevelChange
        });
      }
    };

    const calls = await captureApiCalls(
      makeTavernCallbackData("raid"),
      servicesWith({
        tavern
      })
    );

    await tavern.completeFridayBarrelRaid?.(42n, "2026-06-13T10:23");
    await vi.advanceTimersByTimeAsync(60_000);

    expect(rewardClaimed).toBe(true);
    expect(
      calls.find((call) => call.method === "sendMessage" && String(call.payload.text).includes("Рейд завершено"))
    ).toBeUndefined();
  });
});

interface ApiCall {
  method: string;
  payload: Record<string, unknown>;
}

function getParseMode(payload: Record<string, unknown> | undefined): unknown {
  const maybeNested = payload?.other as { parse_mode?: unknown } | undefined;

  return payload?.parse_mode ?? maybeNested?.parse_mode;
}

const character: CharacterSummary = {
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
};

const noLevelChange = {
  leveledUp: false,
  oldLevel: 1,
  newLevel: 1
};

const levelChange = {
  leveledUp: true,
  oldLevel: 2,
  newLevel: 3
};

const adventureChoice = {
  id: "stew" as const,
  title: "Казанок репетирує оперу",
  hook: "Юшка вимагає райдер.",
  client: "Кухар",
  problem: "Юшка співає.",
  goal: "Стишити казанок."
};

const adventureApproach = {
  id: "conduct-duet" as const,
  callbackKey: toQuestCallbackKey("conduct-duet"),
  label: "🎵 Продиригувати юшкою",
  hint: "Добрі шанси, винагорода звичайна.",
  chanceHint: "непевно",
  reward: {
    xp: 7,
    gold: 4
  },
  source: "scene" as const,
  primaryStat: "charisma" as const,
  consequenceByGrade: {
    "strong-success": "full-reward",
    success: "full-reward",
    "mixed-success": "reduced-reward",
    complication: "cosmetic-mess"
  }
};

const adventureOffer = {
  localDate: "2026-06-12",
  periodToken: "period93",
  expiresAt: new Date("2026-06-12T11:23:00.000Z"),
  choices: [
    adventureChoice,
    {
      id: "barrel" as const,
      title: "Бочка вимагає орендну угоду",
      hook: "Бочка стала юридичною.",
      client: "Корчмар",
      problem: "Бочка вимагає оренду.",
      goal: "Повернути бочку до тари."
    },
    {
      id: "helmet" as const,
      title: "Шолом памʼятає чужу славу",
      hook: "Шолом просить овацій.",
      client: "Зброяр",
      problem: "Шолом хвалиться чужим.",
      goal: "Відділити славу від заліза."
    }
  ]
};

function persistentSession(monsterId: string) {
  return {
    id: "session-1",
    characterId: "character-1",
    monsterId,
    status: "active" as const,
    turn: 1,
    reward: null,
    createdAt: new Date("2026-06-15T10:00:00.000Z"),
    updatedAt: new Date("2026-06-15T10:00:00.000Z"),
    expiresAt: new Date("2026-06-15T10:20:00.000Z"),
    state: {
      id: "session-1",
      status: "active" as const,
      turn: 1,
      hero: {
        hp: 20,
        hpMax: 20,
        mana: 10,
        manaMax: 10
      },
      monster: {
        hp: 12,
        hpMax: 12
      }
    }
  };
}

function persistentSessionWithOrigin(originLocationId: string) {
  const session = persistentSession("monster.deadline-spider");
  const id = "123e4567-e89b-42d3-a456-426614174321";

  return {
    ...session,
    id,
    state: {
      ...session.state,
      id,
      originLocationId,
      turnLog: [
        {
          turn: 1,
          summary: {
            action: "attack" as const,
            heroOutcome: "hit" as const,
            heroDamage: 3,
            monsterDamage: 1,
            manaSpent: 0,
            critical: false
          },
          hero: {
            hp: 19,
            mana: 10
          },
          monster: {
            hp: 9
          }
        }
      ]
    }
  };
}

function passageSearchMonsterAttackResult() {
  const now = new Date("2026-06-27T09:00:00.000Z");
  const session = persistentSessionWithOrigin("location.korchma.deep.level1.straight");

  return {
    state: "monster-attack" as const,
    character: {
      ...character,
      level: 3
    },
    action: {
      id: "search-action-1",
      token: "searchtok13",
      characterId: "character-1",
      nodeKey: "passage:deep-straight",
      nodeKind: "passage" as const,
      status: "resolved" as const,
      startedAt: now,
      endsAt: new Date(now.getTime() + 42_000),
      createdAt: now,
      updatedAt: now,
      payload: {
        nodeKey: "passage:deep-straight",
        nodeKind: "passage" as const,
        originLocationId: "location.korchma.deep.level1.straight",
        passage: "deep-straight" as const,
        encounterToken: "token13",
        durationMs: 42_000,
        safeAtStart: false,
        dangerTier: 1,
        searchTier: 1,
        monsterIdAtStart: "monster.deadline-spider",
        monsterNameAtStart: "Павук дедлайнів",
        monsterLevelAtStart: 2,
        playerLuckSnapshot: 6,
        startedAt: now.toISOString(),
        endsAt: new Date(now.getTime() + 42_000).toISOString()
      },
      result: {
        outcome: "monster-attack" as const,
        encounterToken: "token13",
        passage: "deep-straight" as const
      }
    },
    fight: {
      state: "persistent-active" as const,
      started: true,
      character: {
        ...character,
        level: 3
      },
      session,
      monster: {
        id: "monster.deadline-spider",
        name: "Павук дедлайнів",
        description: "Плете павутину з «сьогодні швиденько».",
        level: 2,
        tags: ["beast", "time", "web"]
      },
      questProgress: null
    }
  };
}

function passageSearchRunningResult() {
  return {
    state: "running" as const,
    character: {
      ...character,
      level: 3
    },
    action: passageSearchAction("running"),
    remainingSeconds: 23
  };
}

function passageSearchCompletedResult() {
  return {
    state: "completed" as const,
    character: {
      ...character,
      level: 3
    },
    action: passageSearchAction("resolved", {
      outcome: "loot" as const,
      loot: {
        gold: 3,
        itemGrants: []
      }
    }),
    loot: {
      gold: 3,
      itemGrants: []
    }
  };
}

function passageSearchAction(
  status: "running" | "resolved",
  result: { outcome: "loot"; loot: { gold: number; itemGrants: [] } } | null = null
) {
  const now = new Date("2026-06-27T09:00:00.000Z");

  return {
    id: "search-action-1",
    token: "searchtok13",
    characterId: "character-1",
    nodeKey: "passage:deep-straight",
    nodeKind: "passage" as const,
    status,
    startedAt: now,
    endsAt: new Date(now.getTime() + 42_000),
    createdAt: now,
    updatedAt: now,
    payload: {
      nodeKey: "passage:deep-straight",
      nodeKind: "passage" as const,
      originLocationId: "location.korchma.deep.level1.straight",
      passage: "deep-straight" as const,
      encounterToken: "token13",
      durationMs: 42_000,
      safeAtStart: false,
      dangerTier: 1,
      searchTier: 1,
      monsterIdAtStart: "monster.deadline-spider",
      monsterNameAtStart: "Павук дедлайнів",
      monsterLevelAtStart: 2,
      playerLuckSnapshot: 6,
      startedAt: now.toISOString(),
      endsAt: new Date(now.getTime() + 42_000).toISOString()
    },
    result
  };
}

function activeFightServiceThatShouldNotBeChecked(): NonNullable<Partial<BotServices>["fight"]> {
  return {
    getFightOverviewForTelegramUser: () => {
      throw new Error("inventory surfaces should bypass the combat lock");
    },
    getMimicShawarmaForTelegramUser: () => Promise.resolve({ state: "no-character" }),
    completeMimicShawarma: () => Promise.resolve({ state: "no-character" })
  } as NonNullable<Partial<BotServices>["fight"]>;
}

function trainingSession() {
  return {
    id: "123e4567-e89b-42d3-a456-426614174000",
    characterId: "character-1",
    monsterId: TRAINING_DOPPELGANGER_MONSTER_ID,
    status: "active" as const,
    turn: 1,
    reward: null,
    createdAt: new Date("2026-06-15T10:00:00.000Z"),
    updatedAt: new Date("2026-06-15T10:00:00.000Z"),
    expiresAt: new Date("2026-06-15T10:20:00.000Z"),
    state: {
      id: "123e4567-e89b-42d3-a456-426614174000",
      status: "active" as const,
      turn: 1,
      source: "training" as const,
      hero: {
        hp: 20,
        hpMax: 20,
        mana: 10,
        manaMax: 10
      },
      monster: {
        id: TRAINING_DOPPELGANGER_MONSTER_ID,
        hp: 12,
        hpMax: 12
      }
    }
  };
}

function terminalTrainingSession() {
  const session = trainingSession();

  return {
    ...session,
    status: "won" as const,
    turn: 3,
    reward: {
      xp: 4,
      gold: 0,
      localDate: "12026-06-15",
      itemGrants: []
    },
    state: {
      ...session.state,
      status: "won" as const,
      turn: 3,
      monster: {
        ...session.state.monster,
        hp: 0
      },
      lastTurn: {
        action: "attack" as const,
        heroOutcome: "won" as const,
        monsterOutcome: "inactive" as const,
        heroDamage: 12,
        monsterDamage: 0,
        manaSpent: 0,
        critical: false
      }
    }
  };
}

function trainingMonster() {
  return {
    id: TRAINING_DOPPELGANGER_MONSTER_ID,
    name: "Сумлінний Допельґанґер" as const,
    raceName: "Людисько",
    className: "Воїн",
    title: "Пересічні Пригодники",
    level: 3,
    spawnMode: "COPY_TARGET" as const,
    source: "target" as const,
    copiedEquipmentCount: 0
  };
}

function activeTurnBasedDuel() {
  return {
    state: "active",
    challenge: {
      inviteToken: "abcDEF12",
      challengerCharacterId: "character-1",
      targetCharacterId: "character-2",
      challenger: {
        telegramUserId: 42n
      },
      target: {
        telegramUserId: 99n
      }
    },
    challenger: {
      ...character,
      name: "Перший Кухоль"
    },
    target: {
      ...character,
      name: "Другий Кухоль"
    },
    turnExpiresAt: new Date("2026-06-19T12:00:23.000Z"),
    now: new Date("2026-06-19T12:00:00.000Z"),
    session: {
      id: "session-1",
      status: "active",
      challengerCharacterId: "character-1",
      targetCharacterId: "character-2",
      turn: 1,
      version: 1,
      state: {
        mode: "turn-based",
        status: "active",
        rulesVersion: "turn-based-duel-v1",
        balanceVersion: "instant-duel-v2",
        turn: 1,
        actingCharacterId: "character-1",
        participants: {
          challenger: turnBasedParticipant("character-1", "Перший Кухоль"),
          target: turnBasedParticipant("character-2", "Другий Кухоль")
        }
      }
    }
  } as never;
}

function turnBasedParticipant(characterId: string, displayName: string) {
  return {
    characterId,
    displayName,
    title: "Пересічні Пригодники",
    raceId: "race.human-ish",
    raceName: "Людисько",
    classId: "class.warrior",
    className: "Воїн",
    level: 3,
    remortCount: 0,
    stats: {
      strength: 7,
      dexterity: 7,
      intelligence: 6,
      charisma: 6,
      luck: 6
    },
    hp: 24,
    hpMax: 24,
    mana: 12,
    manaMax: 12,
    combatStats: {
      level: 3,
      hpMax: 24,
      manaMax: 12,
      strength: 7,
      dexterity: 7,
      intelligence: 6,
      charisma: 6,
      luck: 6,
      classId: "class.warrior"
    }
  };
}

function tavernGameSession(overrides: Record<string, unknown> = {}) {
  const now = new Date("2026-07-02T10:00:00.000Z");
  const participants = (overrides.participants as ReturnType<typeof tavernGameParticipant>[] | undefined) ?? [
    tavernGameParticipant(93n, "character-creator", "Kyjivan BooksDragon", "joined", null)
  ];

  return {
    id: "tavern-game-session-1",
    token: "12345678-1234-4234-9234-123456789abc",
    gameKey: "tavlei",
    status: "open",
    creatorCharacterId: "character-creator",
    stakeGold: 1,
    potGold: participants.length,
    seed: "seed",
    rulesVersion: "test",
    result: null,
    openedAt: now,
    joinExpiresAt: new Date("2026-07-02T10:13:00.000Z"),
    decisionExpiresAt: new Date("2026-07-02T10:18:00.000Z"),
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    creator: tavernGameCharacter(93n, "character-creator", "Kyjivan BooksDragon"),
    participants,
    ...overrides
  };
}

function tavernGameParticipant(
  telegramUserId: bigint,
  characterId: string,
  displayName: string,
  status: string,
  decision: unknown
) {
  const now = new Date("2026-07-02T10:00:00.000Z");

  return {
    id: `participant-${characterId}`,
    sessionId: "tavern-game-session-1",
    characterId,
    telegramUserId,
    displayName,
    remortCount: 0,
    status,
    stakeGold: 1,
    payoutGold: 0,
    refundedGold: 0,
    decision,
    result: null,
    joinedAt: now,
    decidedAt: null,
    completedAt: null,
    character: tavernGameCharacter(telegramUserId, characterId, displayName)
  };
}

function tavernGameCharacter(telegramUserId: bigint, id: string, name: string) {
  return {
    id,
    userId: `user-${id}`,
    telegramUserId,
    currentLocationId: "location.korchma.bar",
    name,
    pronoun: "they",
    path: "path.boundary",
    raceId: "race.human-ish",
    classId: "class.warrior",
    level: 8,
    xp: 587,
    gold: 42,
    hpCurrent: 60,
    hpMax: 60,
    manaCurrent: 20,
    manaMax: 20,
    hpRegenAt: null,
    manaRegenAt: null,
    activeCosmeticTitleGrantId: null,
    statsJson: {},
    remortCount: 0
  };
}

function barrelBeerTutorialProgress(done: boolean, currentLocationId: string) {
  return {
    accepted: done,
    stipendGranted: done,
    visitedBarrel: done,
    raidCompleted: done,
    beerRoundOffered: done,
    beerDrunk: done,
    activeBeer: done,
    currentLocationId
  };
}

function questMarkerFightService() {
  return {
    getMimicShawarmaForTelegramUser: () => Promise.resolve({ state: "no-character" as const }),
    completeMimicShawarma: () => Promise.resolve({ state: "no-character" as const }),
    getFightOverviewForTelegramUser: () => Promise.resolve({ state: "no-character" as const }),
    getProblemQuestProgressForTelegramUser: () => Promise.resolve({ state: "no-character" as const })
  };
}

function questMarkerYegerService() {
  return {
    getForTelegramUser: () => Promise.resolve({ state: "no-character" as const })
  };
}

function servicesWith(overrides: Partial<BotServices>): BotServices {
  return {
    adventure: {
      getAdventureOfferForTelegramUser: () => Promise.resolve({ state: "no-character" }),
      completeAdventureApproach: () => Promise.resolve({ state: "no-character" })
    },
    cellarErrand: {
      getForTelegramUser: () => Promise.resolve({ state: "no-character" }),
      complete: () => Promise.resolve({ state: "no-character" })
    },
    fight: {
      getMimicShawarmaForTelegramUser: () => Promise.resolve({ state: "no-character" }),
      completeMimicShawarma: () => Promise.resolve({ state: "no-character" })
    },
    hunt: {
      getHuntBoardForTelegramUser: () => Promise.resolve({ state: "no-character" }),
      completeHuntContract: () => Promise.resolve({ state: "no-character" })
    },
    onboarding: {},
    hero: {},
    inventory: {},
    presence: {
      markAction: () => Promise.resolve(),
      getRaidParticipantsForTelegramUser: () =>
        Promise.resolve({ state: "no-character" }),
      getAdventureParticipantsForTelegramUser: () =>
        Promise.resolve({ state: "no-character" }),
      getCurrentPlaceForTelegramUser: () =>
        Promise.resolve({
          state: "ready",
          locationId: "location.korchma.hall",
          locationName: "Зала корчми",
          insideKorchma: true
        }),
      getOnlineForTelegramUser: () => Promise.resolve({ state: "no-character" }),
      getLookForTelegramUser: () => Promise.resolve({ state: "no-character" })
    },
    devReset: {
      isEnabled: () => false
    },
    restart: {},
    tavern: {
      getTavernForTelegramUser: () => Promise.resolve({ state: "no-character" }),
      completeFridayBarrelRaid: () => Promise.resolve({ state: "no-character" }),
      advanceFridayBarrelRaid: () => Promise.resolve({ state: "no-character" }),
      getActivePendingFridayBarrelRaidForTelegramUser: () =>
        Promise.resolve({ state: "none" })
    },
    ...overrides
  } as unknown as BotServices;
}

async function captureApiCalls(
  callbackData: string,
  services: BotServices,
  options: { messageResults?: boolean; failSendMessage?: boolean } = {}
): Promise<ApiCall[]> {
  const bot = createBot("123456:test-token", services);
  const calls: ApiCall[] = [];

  bot.api.config.use((_prev, method, payload) => {
    calls.push({
      method,
      payload
    });

    if (method === "getMe") {
      return Promise.resolve({
        ok: true,
        result: {
          id: 123456,
          is_bot: true,
          first_name: "Квестарня",
          username: "kvestarnia_bot"
        }
      });
    }

    if (options.failSendMessage && method === "sendMessage") {
      return Promise.reject(new Error("send failed"));
    }

    if (options.messageResults && method === "sendMessage") {
      return Promise.resolve({
        ok: true,
        result: {
          message_id: calls.length,
          date: 0,
          chat: {
            id: 42,
            type: "private"
          }
        }
      });
    }

    return Promise.resolve({
      ok: true,
      result: true
    });
  });

  await bot.init();

  await bot.handleUpdate({
    update_id: 1,
    callback_query: {
      id: "callback-1",
      from: {
        id: 42,
        is_bot: false,
        first_name: "Тест"
      },
      chat_instance: "chat-instance",
      data: callbackData,
      message: {
        message_id: 10,
        date: 0,
        chat: {
          id: 42,
          type: "private",
          first_name: "Тест"
        },
        text: "old"
      }
    }
  });

  return calls;
}

async function captureRepeatedApiCalls(
  callbackDataList: string[],
  services: BotServices
): Promise<ApiCall[]> {
  const bot = createBot("123456:test-token", services);
  const calls: ApiCall[] = [];

  bot.api.config.use((_prev, method, payload) => {
    calls.push({
      method,
      payload
    });

    if (method === "getMe") {
      return Promise.resolve({
        ok: true,
        result: {
          id: 123456,
          is_bot: true,
          first_name: "Квестарня",
          username: "kvestarnia_bot"
        }
      });
    }

    return Promise.resolve({
      ok: true,
      result: true
    });
  });

  await bot.init();

  for (const [index, callbackData] of callbackDataList.entries()) {
    await bot.handleUpdate({
      update_id: index + 1,
      callback_query: {
        id: `callback-${index + 1}`,
        from: {
          id: 42,
          is_bot: false,
          first_name: "Тест"
        },
        chat_instance: "chat-instance",
        data: callbackData,
        message: {
          message_id: 10,
          date: 0,
          chat: {
            id: 42,
            type: "private",
            first_name: "Тест"
          },
          text: "old"
        }
      }
    });
  }

  return calls;
}

async function captureTextApiCalls(
  text: string,
  services: BotServices,
  options: { asCommand?: boolean; messageResults?: boolean; replyToText?: string } = {}
): Promise<ApiCall[]> {
  const bot = createBot("123456:test-token", services);
  const calls: ApiCall[] = [];

  bot.api.config.use((_prev, method, payload) => {
    calls.push({
      method,
      payload
    });

    if (method === "getMe") {
      return Promise.resolve({
        ok: true,
        result: {
          id: 123456,
          is_bot: true,
          first_name: "Квестарня",
          username: "kvestarnia_bot"
        }
      });
    }

    if (options.messageResults && method === "sendMessage") {
      return Promise.resolve({
        ok: true,
        result: {
          message_id: calls.length,
          date: 0,
          chat: {
            id: 42,
            type: "private"
          }
        }
      });
    }

    return Promise.resolve({
      ok: true,
      result: true
    });
  });

  await bot.init();

  await bot.handleUpdate({
    update_id: 1,
    message: {
      message_id: 10,
      date: 0,
      chat: {
        id: 42,
        type: "private",
        first_name: "Тест"
      },
      from: {
        id: 42,
        is_bot: false,
        first_name: "Тест"
      },
      text,
      ...(options.replyToText
        ? {
            reply_to_message: {
              message_id: 9,
              date: 0,
              chat: {
                id: 42,
                type: "private" as const,
                first_name: "Тест"
              },
              from: {
                id: 123456,
                is_bot: true,
                first_name: "Квестарня",
                username: "kvestarnia_bot"
              },
              text: options.replyToText
            }
          }
        : {}),
      ...(options.asCommand
        ? {
            entities: [
              {
                type: "bot_command" as const,
                offset: 0,
                length: text.length
              }
            ]
          }
        : {})
    }
  });

  return calls;
}
