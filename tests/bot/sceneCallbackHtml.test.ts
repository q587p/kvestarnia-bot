import { afterEach, describe, expect, it, vi } from "vitest";
import { createBot, type BotServices } from "../../src/bot/createBot";
import { toQuestCallbackKey } from "../../src/content/questResolution";
import {
  makeAdventureApproachCallbackData,
  makeMimicShawarmaMethodCallbackData,
  makeAdventureProblemCallbackData
} from "../../src/bot/callbacks/adventureCallbackData";
import {
  makeCellarCallbackData,
  makeCellarMethodCallbackData
} from "../../src/bot/callbacks/cellarCallbackData";
import {
  makeFightCallbackData,
  makeFightJournalCallbackData,
  makeFightTurnCallbackData,
  makeFightViewCallbackData
} from "../../src/bot/callbacks/fightCallbackData";
import { makeTrainingDoppelgangerTurnCallbackData } from "../../src/bot/callbacks/trainingDoppelgangerCallbackData";
import { makeEquipItemCallbackData } from "../../src/bot/callbacks/itemCallbackData";
import {
  makeLevelBarterAutoCallbackData,
  makeLevelBarterOpenCallbackData
} from "../../src/bot/callbacks/levelBarterCallbackData";
import { makePlaceCallbackData } from "../../src/bot/callbacks/placeCallbackData";
import { makeQuestCallbackData } from "../../src/bot/callbacks/questCallbackData";
import {
  makeRemortConfirmCallbackData,
  makeRemortOpenCallbackData
} from "../../src/bot/callbacks/remortCallbackData";
import { makeTavernCallbackData } from "../../src/bot/callbacks/tavernCallbackData";
import { makeYegerTrackCallbackData } from "../../src/bot/callbacks/yegerCallbackData";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";
import { TRAINING_DOPPELGANGER_MONSTER_ID } from "../../src/domain/trainingDoppelganger";
import { mainMenuButtons, mainMenuLocationButtons } from "../../src/bot/keyboards/mainMenuKeyboard";

type MarkPresenceInput = Parameters<NonNullable<BotServices["presence"]>["markAction"]>[0];

describe("scene callback HTML options", () => {
  afterEach(() => {
    vi.useRealTimers();
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
            levelChange: noLevelChange
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
                branchComplete: false
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
    expect(JSON.stringify(edit?.payload.reply_markup)).toContain("🍻 Всім пива");
    expect(JSON.stringify(edit?.payload.reply_markup)).toContain(makeTavernCallbackData("round"));
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
    const message = calls.find((call) => call.method === "sendMessage");

    expect(calls.some((call) => call.method === "editMessageText")).toBe(false);
    expect(message?.payload).toMatchObject({
      parse_mode: "HTML"
    });
    expect(String(message?.payload.text)).toContain(expectedText);
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
    const celebration = calls.find(
      (call) => call.method === "sendMessage" && String(call.payload.text).includes("🎉 Рівень підріс!")
    );

    expect(celebration?.payload.parse_mode).toBe("HTML");
    expect(String(celebration?.payload.text)).toContain("✨ <b>2 → 3</b>");
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
    expect(String(edit?.payload.text)).toContain("Ще не екіпірується: Жетон Боргоманта +3.");
    expect(String(edit?.payload.text)).toContain("Потрібно: вищий рівень, сумісний клас.");
    expect(String(edit?.payload.text)).toContain("Це правило манатки, не помилка героя.");
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

  it("shows a visible combat-lock explanation when a place button is pressed during a fight", async () => {
    const markAction = vi.fn(() => Promise.resolve());
    const calls = await captureApiCalls(
      makePlaceCallbackData("hall"),
      servicesWith({
        fight: {
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
    expect(keyboard).toContain("🍻 Всім пива");
    expect(keyboard).toContain("v1:tavern:round");
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
    const reply = calls.find((call) => call.method === "sendMessage");

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

  it("lets inventory callbacks through during an active persistent fight", async () => {
    let inventoryCalls = 0;
    const calls = await captureApiCalls(
      "v1:item:inventory",
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
    expect(String(edit?.payload.text)).toContain("🎒 Манатки");
    expect(String(edit?.payload.text)).not.toContain("Бій тримає вас за рукав");
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
    expect(String(reply?.payload.text)).toContain("/start");
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

  it.each([
    ["result replay", makeFightViewCallbackData("123e4567-e89b-42d3-a456-426614174321")],
    ["journal page", makeFightJournalCallbackData({ sessionId: "123e4567-e89b-42d3-a456-426614174321", page: 0 })]
  ])("keeps selected passage presence after persistent fight %s callbacks", async (_name, callbackData) => {
    const markAction = vi.fn(() => Promise.resolve());
    const session = persistentSessionWithOrigin("location.korchma.deep.level1.left");
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
    const presenceInput = markAction.mock.calls
      .map(([input]) => input as MarkPresenceInput)
      .find((input) => input.locationId);
    if (!presenceInput) {
      throw new Error("Expected fight replay callback to mark a concrete presence location.");
    }
    expect(presenceInput).toMatchObject({
      locationId: "location.korchma.deep.level1.left",
      currentRaidId: null,
      currentAdventureId: "adventure.solo-fight"
    });
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
    const tier = calls.find((call) => call.method === "sendMessage");
    const keyboardRefresh = calls.find(
      (call) =>
        call.method === "sendMessage" &&
        String(call.payload.text).includes("Тепер")
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
    expect(String(keyboardRefresh?.payload.text)).toContain(mainMenuLocationButtons.deepLevel1);
    expect(JSON.stringify(keyboardRefresh?.payload.reply_markup)).toContain(mainMenuLocationButtons.deepLevel1);
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
    const edit = calls.find((call) => call.method === "editMessageText");

    expect(markAction).toHaveBeenCalledWith(
      expect.objectContaining({
        locationId: "location.korchma.hall"
      })
    );
    expect(String(edit?.payload.text)).toContain("Низ відкриється з 3 рівня");
    expect(JSON.stringify(edit?.payload.reply_markup)).not.toContain("deep-level1");
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
    const preview = calls.find((call) => call.method === "editMessageText");

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
    const attackPersistentPassageEncounterForTelegramUser = vi.fn(() =>
      Promise.resolve({
        state: "persistent-active" as const,
        started: true,
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
        session: persistentSession("monster.deadline-spider"),
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
    const fight = calls.find((call) => call.method === "sendMessage" && String(call.payload.text).includes("❤️ Ви:"));

    expect(attackPersistentPassageEncounterForTelegramUser).toHaveBeenCalledWith(42n, "token13");
    expect(markAction).toHaveBeenCalledWith(
      expect.objectContaining({
        locationId: "location.korchma.deep.level1.straight",
        currentAdventureId: "adventure.solo-fight"
      })
    );
    expect(String(fight?.payload.text)).toContain("⏳ На хід є 23 секунди.");
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
  client: "Кухар"
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
      client: "Корчмар"
    },
    {
      id: "helmet" as const,
      title: "Шолом памʼятає чужу славу",
      hook: "Шолом просить овацій.",
      client: "Зброяр"
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
  options: { messageResults?: boolean } = {}
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
          first_name: "РљРІРµСЃС‚Р°СЂРЅСЏ",
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
          first_name: "РўРµСЃС‚"
        },
        chat_instance: "chat-instance",
        data: callbackData,
        message: {
          message_id: 10,
          date: 0,
          chat: {
            id: 42,
            type: "private",
            first_name: "РўРµСЃС‚"
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
  options: { asCommand?: boolean } = {}
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
