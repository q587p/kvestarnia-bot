import type { Context } from "grammy";
import { describe, expect, it, vi } from "vitest";
import { makePlaceCallbackData } from "../../src/bot/callbacks/placeCallbackData";
import { makeQuestCallbackData } from "../../src/bot/callbacks/questCallbackData";
import { makeBestiaryListCallbackData } from "../../src/bot/callbacks/bestiaryCallbackData";
import { makeYegerTurnInCallbackData } from "../../src/bot/callbacks/yegerCallbackData";
import { sendQuestHub } from "../../src/bot/commands/questHubCommand";
import type { SoloCombatSessionRecord } from "../../src/db/repositories/soloCombatSessionRepository";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";
import { TRAINING_DOPPELGANGER_MONSTER_ID } from "../../src/domain/trainingDoppelganger";
import type { AdventureService } from "../../src/services/adventureService";
import type { CellarErrandService } from "../../src/services/cellarErrandService";
import type { CellarGrownupQuestService } from "../../src/services/cellarGrownupQuestService";
import type { DailyKorchmaRoundService } from "../../src/services/dailyKorchmaRoundService";
import type { FightService } from "../../src/services/fightService";
import type { TavernRaidService } from "../../src/services/tavernRaidService";
import type { YegerQuestService } from "../../src/services/yegerQuestService";
import {
  PRESENCE_LOCATION_KORCHMA_FRONT,
  PRESENCE_LOCATION_KORCHMA_HALL,
  PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
  type MarkPlayerPresenceInput
} from "../../src/services/presenceService";

describe("quest hub command", () => {
  it("asks outside players to enter instead of moving them to the quest table", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const presence = new CapturingPresenceService({
      locationId: PRESENCE_LOCATION_KORCHMA_FRONT,
      insideKorchma: false
    });

    await sendQuestHub(makeContext(replies), servicesWith({ presence }), "reply");

    expect(replies[0]?.text).toBe("Квести видають усередині.");
    expect(replies[0]?.options).toMatchObject({
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🚪 Зайти в корчму ⚠️",
              callback_data: makePlaceCallbackData("hall")
            }
          ]
        ]
      }
    });
    expect(presence.marks).toEqual([]);
  });

  it("shows the quest hub inside the korchma and marks the quest table", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const presence = new CapturingPresenceService({
      locationId: PRESENCE_LOCATION_KORCHMA_HALL,
      insideKorchma: true
    });

    await sendQuestHub(makeContext(replies), servicesWith({ presence }), "reply");

    expect(replies[0]?.text).toContain("📋 Стіл зі справами");
    expect(replies[0]?.text).not.toContain("Бійцівський куток тепер окремо гупає збоку");
    expect(replies[0]?.text).not.toContain("тренування, дружні виклики й дошка переможців");
    expect(replies[0]?.text).not.toContain("<b>Мандрівник</b> · <i>Пересічні Пригодники</i>");
    expect(replies[0]?.text).not.toContain("🌯 <i>Підозріла шаурма</i> — перша підозра для 1-2 рівнів.");
    expect(replies[0]?.text).toContain(
      "🧾 <i>Тринадцять дрібних проблем</i> — 0/13 проблем у журналі."
    );
    expect(replies[0]?.text).not.toContain("🏹 <i>Єгерська справа</i> — відкриється з 4 рівня.");
    expect(replies[0]?.text).not.toContain("Мімік-шаурма");
    expect(replies[0]?.text).toContain("🧹 <i>Льохова справа</i> — миша приймає аргументи.");
    const buttons = (
      replies[0]?.options as {
        reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> };
      }
    ).reply_markup.inline_keyboard.flat();
    expect(buttons.map((button) => button.text)).toEqual([
      "🪧 Обрати пригоду ⚠️",
      "🪜 До Низу",
      "🧹 У льох ⚠️",
      "📦 Архів",
      "📖 Бестіарій",
      "🍺 До зали ⚠️"
    ]);
    expect(buttons).toEqual(expect.arrayContaining([
      { text: "🪧 Обрати пригоду ⚠️", callback_data: makeQuestCallbackData("adventure") },
      { text: "🪜 До Низу", callback_data: makePlaceCallbackData("deep") },
      { text: "🧹 У льох ⚠️", callback_data: makeQuestCallbackData("cellar") }
    ]));
    expect(presence.marks[0]).toMatchObject({
      locationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
      currentRaidId: null,
      currentAdventureId: null
    });
  });

  it("does not offer a hall return when the quest hub is already opened from the quest table", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const presence = new CapturingPresenceService({
      locationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
      insideKorchma: true
    });

    await sendQuestHub(makeContext(replies), servicesWith({ presence }), "reply");

    const buttons = (
      replies[0]?.options as {
        reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> };
      }
    ).reply_markup.inline_keyboard.flat();

    expect(buttons.map((button) => button.text)).toEqual([
      "🪧 Обрати пригоду ⚠️",
      "🪜 До Низу",
      "🧹 У льох ⚠️",
      "📦 Архів",
      "📖 Бестіарій"
    ]);
    expect(buttons.map((button) => button.callback_data)).not.toContain(makePlaceCallbackData("hall"));
    expect(presence.marks[0]).toMatchObject({
      locationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE
    });
  });

  it("shows an untaken daily Korchma round without issuing it from the quest table view", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const getExistingForTelegramUser = vi.fn(() =>
      Promise.resolve({
        state: "not-issued" as const,
        character: characterAtLevel(3),
        dayToken: "20260628"
      })
    );
    const getForTelegramUser = vi.fn();

    await sendQuestHub(
      makeContext(replies),
      servicesWith({
        dailyKorchmaRound: {
          getExistingForTelegramUser,
          getForTelegramUser
        } as unknown as DailyKorchmaRoundService
      }),
      "reply"
    );

    expect(getExistingForTelegramUser).toHaveBeenCalledWith(42n);
    expect(getForTelegramUser).not.toHaveBeenCalled();
    expect(replies[0]?.text).toContain("🧾 <i>Корчмарський обхід</i> — доступний сьогодні");
    const buttons = (
      replies[0]?.options as {
        reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> };
      }
    ).reply_markup.inline_keyboard.flat();
    const dailyButton = buttons.find((button) => button.text === "🧾 Корчмарський обхід ⚠️");
    expect(dailyButton?.callback_data).toMatch(/^v1:dkr:o:\d{8}$/);
  });

  it("keeps locked cellar and hunt out of the active list on level one", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const levelOneCharacter = characterAtLevel(1);

    await sendQuestHub(
      makeContext(replies),
      servicesWith({
        adventure: readyAdventureService(levelOneCharacter),
        fight: readyFightService(levelOneCharacter),
        yeger: readyYegerService(levelOneCharacter),
        cellarErrand: readyCellarService(levelOneCharacter),
        dailyKorchmaRound: lockedDailyKorchmaRoundService(levelOneCharacter)
      }),
      "reply"
    );

    expect(replies[0]?.text).not.toContain("🏹 <i>Єгерська справа</i> — відкриється з 4 рівня.");
    expect(replies[0]?.text).not.toContain("🧹 <i>Льохова справа</i> — відкриється з 2 рівня.");
    expect(replies[0]?.text).toContain("🌯 <i>Підозріла шаурма</i> — новачкова підозра чекає на столі.");
    expect(replies[0]?.text).toContain("⚔️ <i>Новачкова сутичка</i> — підозріла шаурма ще не дала свідчень.");
    expect(replies[0]?.text).not.toContain("🧾 <i>Корчмарський обхід</i>");
    expect(replies[0]?.text).not.toContain("🧾 <i>Тринадцять дрібних проблем</i> — відкриється з 3 рівня.");
    expect(replies[0]?.text).not.toContain("🪜 <i>Низ</i> — можна починати.");
    const buttons = (
      replies[0]?.options as {
        reply_markup: { inline_keyboard: Array<Array<{ text: string }>> };
      }
    ).reply_markup.inline_keyboard.flat();
    expect(buttons.map((button) => button.text)).toEqual([
      "🌯 До підозрілої шаурми",
      "⚔️ До сутички",
      "📦 Архів",
      "🍺 До зали ⚠️"
    ]);
  });

  it("opens cellar from level two but keeps Yeger out of the active list until level four", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const levelTwoCharacter = characterAtLevel(2);

    await sendQuestHub(
      makeContext(replies),
      servicesWith({
        adventure: readyAdventureService(levelTwoCharacter),
        fight: readyFightService(levelTwoCharacter),
        yeger: readyYegerService(levelTwoCharacter),
        cellarErrand: readyCellarService(levelTwoCharacter),
        dailyKorchmaRound: lockedDailyKorchmaRoundService(levelTwoCharacter)
      }),
      "reply"
    );

    expect(replies[0]?.text).not.toContain("🏹 <i>Єгерська справа</i> — відкриється з 4 рівня.");
    expect(replies[0]?.text).toContain("🌯 <i>Підозріла шаурма</i> — новачкова підозра чекає на столі.");
    expect(replies[0]?.text).toContain("⚔️ <i>Новачкова сутичка</i> — підозріла шаурма ще не дала свідчень.");
    expect(replies[0]?.text).toContain("🧹 <i>Льохова справа</i> — миша приймає аргументи.");
    expect(replies[0]?.text).not.toContain("🧾 <i>Корчмарський обхід</i>");
    expect(replies[0]?.text).not.toContain("🧾 <i>Тринадцять дрібних проблем</i> — відкриється з 3 рівня.");
    expect(replies[0]?.text).not.toContain("🪜 <i>Низ</i> — можна починати.");
    const buttons = (
      replies[0]?.options as {
        reply_markup: { inline_keyboard: Array<Array<{ text: string }>> };
      }
    ).reply_markup.inline_keyboard.flat();
    expect(buttons.map((button) => button.text)).toEqual([
      "🌯 До підозрілої шаурми",
      "⚔️ До сутички",
      "🧹 У льох ⚠️",
      "📦 Архів",
      "🍺 До зали ⚠️"
    ]);
  });

  it("keeps completed daily Korchma round out of the active list and in the archive", async () => {
    const activeReplies: Array<{ text: string; options: unknown }> = [];
    const archiveReplies: Array<{ text: string; options: unknown }> = [];
    const grownCharacter = characterAtLevel(4);
    const services = servicesWith({
      dailyKorchmaRound: completedDailyKorchmaRoundService(grownCharacter)
    });

    await sendQuestHub(makeContext(activeReplies), services, "reply");
    await sendQuestHub(makeContext(archiveReplies), services, "reply", "archive");

    expect(activeReplies[0]?.text).not.toContain("🧾 <i>Корчмарський обхід</i>");
    expect(archiveReplies[0]?.text).toContain(
      "🧾 <i>Корчмарський обхід</i> — сьогодні закрито; Корчмар удає, що так і було заплановано."
    );
  });

  it("moves locked problem quests to the archive for starter levels", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const levelOneCharacter = characterAtLevel(1);

    await sendQuestHub(
      makeContext(replies),
      servicesWith({
        adventure: readyAdventureService(levelOneCharacter),
        fight: readyFightService(levelOneCharacter),
        yeger: readyYegerService(levelOneCharacter),
        cellarErrand: readyCellarService(levelOneCharacter)
      }),
      "reply",
      "archive"
    );

    expect(replies[0]?.text).toContain("📦 Архів справ");
    expect(replies[0]?.text).toContain("🧾 <i>Тринадцять дрібних проблем</i> — відкриється з 3 рівня.");
    expect(replies[0]?.text).not.toContain("🌯 <i>Підозріла шаурма</i>");
    expect(replies[0]?.text).not.toContain("⚔️ <i>Новачкова сутичка</i>");
    expect(replies[0]?.text).not.toContain("🪜 <i>Низ</i> — можна починати.");
  });

  it("keeps a completed starter fight separate from Nyz in the archive", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const levelOneCharacter = characterAtLevel(1);

    await sendQuestHub(
      makeContext(replies),
      servicesWith({
        adventure: completedStarterAdventureService(levelOneCharacter),
        fight: {
          getProblemQuestProgressForTelegramUser: () =>
            Promise.resolve({
              state: "ready",
              character: levelOneCharacter,
              progress: questProgress(0),
              archive: []
            }),
          getFightOverviewForTelegramUser: () =>
            Promise.resolve({
              state: "already-completed",
              character: levelOneCharacter,
              questAvailable: false
            }),
          completeMimicShawarma: () => Promise.resolve({ state: "no-character" })
        } as unknown as FightService,
        yeger: readyYegerService(levelOneCharacter),
        cellarErrand: readyCellarService(levelOneCharacter)
      }),
      "reply",
      "archive"
    );

    expect(replies[0]?.text).toContain("📦 Архів справ");
    expect(replies[0]?.text).toContain("🌯 <i>Підозріла шаурма</i> — сьогодні вже дала свідчення.");
    expect(replies[0]?.text).toContain("⚔️ <i>Новачкова сутичка</i> — сьогодні вже зараховано.");
    expect(replies[0]?.text).not.toContain("🪜 <i>Низ</i> — сьогодні вже зараховано.");
  });

  it("does not offer starter shawarma from the quest hub after it is completed", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const levelTwoCharacter = characterAtLevel(2);

    await sendQuestHub(
      makeContext(replies),
      servicesWith({
        adventure: completedStarterAdventureService(levelTwoCharacter),
        fight: readyFightService(levelTwoCharacter),
        yeger: readyYegerService(levelTwoCharacter),
        cellarErrand: readyCellarService(levelTwoCharacter)
      }),
      "reply"
    );

    expect(replies[0]?.text).not.toContain("🌯 <i>Підозріла шаурма</i> — новачкова підозра чекає на столі.");
    const buttons = (
      replies[0]?.options as {
        reply_markup: { inline_keyboard: Array<Array<{ text: string }>> };
      }
    ).reply_markup.inline_keyboard.flat();
    expect(buttons.map((button) => button.text)).not.toContain("🌯 До підозрілої шаурми");
  });

  it("points to cellar fallback when daily shawarma and fight are already spent", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];

    await sendQuestHub(
      makeContext(replies),
      servicesWith({
        adventure: {
          getAdventureOfferForTelegramUser: () =>
            Promise.resolve({
              state: "already-completed",
              character
            }),
          completeAdventureApproach: () => Promise.resolve({ state: "no-character" })
        } as unknown as AdventureService,
        fight: {
          getProblemQuestProgressForTelegramUser: () =>
            Promise.resolve({
              state: "ready",
              character,
              progress: questProgress(0),
              archive: []
            }),
          getFightOverviewForTelegramUser: () =>
            Promise.resolve({
              state: "already-completed",
              character,
              questAvailable: false
            }),
          completeMimicShawarma: () => Promise.resolve({ state: "no-character" })
        } as unknown as FightService
      }),
      "reply"
    );

    expect(replies[0]?.text).not.toContain("🌯 <i>Підозріла шаурма</i> — сьогодні вже дала свідчення.");
    expect(replies[0]?.text).not.toContain(
      "⚔️ <i>Сутичка з невідомим монстром</i> — сьогодні вже зараховано."
    );
    const buttons = (
      replies[0]?.options as {
        reply_markup: { inline_keyboard: Array<Array<{ text: string }>> };
      }
    ).reply_markup.inline_keyboard.flat();
    expect(buttons.map((button) => button.text)).toEqual([
      "🧹 У льох ⚠️",
      "📦 Архів",
      "📖 Бестіарій",
      "🍺 До зали ⚠️"
    ]);
  });

  it("keeps persistent fight available when starter quests are spent", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const grownCharacter = characterAtLevel(4);

    await sendQuestHub(
      makeContext(replies),
      servicesWith({
        adventure: readyAdventureService(grownCharacter),
        fight: readyFightService(grownCharacter),
        yeger: {
          getForTelegramUser: () =>
            Promise.resolve({
              state: "completed",
              character: grownCharacter,
              progress: { wins: 5, target: 5 },
              reward: {
                xp: 80,
                gold: 120,
                itemGrants: [{ itemId: "item.yeger.first-notch", name: "Єгерська риска на дощечці", quantity: 1 }]
              }
            }),
        } as unknown as YegerQuestService,
        cellarErrand: readyCellarService(grownCharacter)
      }),
      "reply"
    );

    expect(replies[0]?.text).toContain(
      "🧾 <i>Тринадцять дрібних проблем</i> — 0/13 проблем у журналі."
    );
    expect(replies[0]?.text).not.toContain(
      "🧹 <i>Льохова справа</i> — новачкова справа до 3 рівня."
    );
    expect(replies[0]?.text).toContain(
      "🐭 <i>Справа не до миші</i> — у льосі є інша справа для старших пригодників."
    );
    expect(replies[0]?.text).toContain("Оберіть справу, поки вона не обрала вас.");
    const buttons = (
      replies[0]?.options as {
        reply_markup: { inline_keyboard: Array<Array<{ text: string }>> };
      }
    ).reply_markup.inline_keyboard.flat();
    expect(buttons.map((button) => button.text)).toEqual([
      "🪧 Обрати пригоду ⚠️",
      "🪜 До Низу",
      "🧹 У льох",
      "📦 Архів",
      "📖 Бестіарій",
      "🍺 До зали ⚠️"
    ]);
  });

  it("offers remort from the quest table at level 13", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const capstoneCharacter = characterAtLevel(13);

    await sendQuestHub(
      makeContext(replies),
      servicesWith({
        adventure: readyAdventureService(capstoneCharacter),
        fight: readyFightService(capstoneCharacter),
        yeger: readyYegerService(capstoneCharacter),
        cellarErrand: readyCellarService(capstoneCharacter),
        cellarGrownup: completedCellarGrownupService(capstoneCharacter)
      }),
      "reply"
    );

    expect(replies[0]?.text).toContain("Або оберіть /remort");
    const buttons = (
      replies[0]?.options as {
        reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> };
      }
    ).reply_markup.inline_keyboard.flat();
    expect(buttons.map((button) => button.text)).toContain("🕯️ Реморт");
    expect(buttons.map((button) => button.callback_data)).toContain("v1:rm:open");
  });

  it("hides completed grownup cellar state from the active list", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const grownCharacter = characterAtLevel(4);

    await sendQuestHub(
      makeContext(replies),
      servicesWith({
        adventure: readyAdventureService(grownCharacter),
        fight: readyFightService(grownCharacter),
        yeger: readyYegerService(grownCharacter),
        cellarErrand: readyCellarService(grownCharacter),
        cellarGrownup: completedCellarGrownupService(grownCharacter)
      }),
      "reply"
    );

    expect(replies[0]?.text).not.toContain(
      "🐭 <i>Справа не до миші</i> — дорослу льохову справу вже закрито; пляшка стоїть у журналі й тихо булькає."
    );
    expect(replies[0]?.text).not.toContain(
      "🐭 <i>Справа не до миші</i> — у льосі є інша справа для старших пригодників."
    );
    const buttons = (
      replies[0]?.options as {
        reply_markup: { inline_keyboard: Array<Array<{ text: string }>> };
      }
    ).reply_markup.inline_keyboard.flat();
    expect(buttons.map((button) => button.text)).toEqual([
      "🪧 Обрати пригоду ⚠️",
      "🪜 До Низу",
      "🏹 До Єгеря ⚠️",
      "📦 Архів",
      "📖 Бестіарій",
      "🍺 До зали ⚠️"
    ]);
  });

  it("does not claim the grownup cellar bottle is carried when quantity is zero", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const grownCharacter = characterAtLevel(4);

    await sendQuestHub(
      makeContext(replies),
      servicesWith({
        adventure: readyAdventureService(grownCharacter),
        fight: readyFightService(grownCharacter),
        yeger: readyYegerService(grownCharacter),
        cellarErrand: readyCellarService(grownCharacter),
        cellarGrownup: bottleObtainedCellarGrownupService(grownCharacter, 0)
      }),
      "reply"
    );

    expect(replies[0]?.text).not.toContain("пляшка вже з вами; Корчмар чекає в шинку");
    expect(replies[0]?.text).toContain(
      "🐭 <i>Справа не до миші</i> — у льосі є інша справа для старших пригодників."
    );
  });

  it("shows completed and unavailable cases in the archive", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const grownCharacter = characterAtLevel(4);

    await sendQuestHub(
      makeContext(replies),
      servicesWith({
        adventure: completedAdventureService(grownCharacter),
        fight: {
          getProblemQuestProgressForTelegramUser: () =>
            Promise.resolve({
              state: "ready",
              character: grownCharacter,
              progress: questProgress(14, true),
              archive: [questProgress(14, true)]
            }),
          getFightOverviewForTelegramUser: () =>
            Promise.resolve({
              state: "persistent-terminal",
              character: grownCharacter,
              session: null,
              monster: null,
              questProgress: questProgress(14, true)
            }),
          completeMimicShawarma: () => Promise.resolve({ state: "no-character" })
        } as unknown as FightService,
        yeger: {
          getForTelegramUser: () =>
            Promise.resolve({
              state: "completed",
              character: grownCharacter,
              progress: { wins: 5, target: 5 },
              reward: {
                xp: 80,
                gold: 120,
                itemGrants: [{ itemId: "item.yeger.first-notch", name: "Єгерська риска на дощечці", quantity: 1 }]
              }
            }),
        } as unknown as YegerQuestService,
        cellarErrand: completedRetiredCellarService(grownCharacter),
        cellarGrownup: completedCellarGrownupService(grownCharacter)
      }),
      "reply",
      "archive"
    );

    expect(replies[0]?.text).toContain("📦 Архів справ");
    expect(replies[0]?.text).toContain("🪧 <i>Три справи на найближчий час</i> — виконано; Корчмар поставив галочку і не визнає повторів.");
    expect(replies[0]?.text).toContain(
      "🧾 <i>Тринадцять дрібних проблем</i> — 14/13 проблем у журналі, справу здано; Корчмар має наступний папірець."
    );
    expect(replies[0]?.text).toContain("🏹 <i>Неспокійні справи</i> — виконано; Єгер удає, що не пишається.");
    expect(replies[0]?.text).toContain("🧹 <i>Льохова справа</i> — виконано; миша прийняла аргументи до 3 рівня.");
    expect(replies[0]?.text).toContain(
      "🐭 <i>Справа не до миші</i> — дорослу льохову справу вже закрито; пляшка стоїть у журналі й тихо булькає."
    );
    expect(replies[0]?.options).toMatchObject({
      reply_markup: {
        inline_keyboard: [
          [{ text: "📋 До справ", callback_data: makeQuestCallbackData("list") }],
          [{ text: "📖 Бестіарій", callback_data: makeBestiaryListCallbackData(0) }],
          [{ text: "🍺 До зали ⚠️", callback_data: makePlaceCallbackData("hall") }]
        ]
      }
    });
  });

  it("keeps the completed first Yeger board in the archive while the second board is active", async () => {
    const activeReplies: Array<{ text: string; options: unknown }> = [];
    const archiveReplies: Array<{ text: string; options: unknown }> = [];
    const grownCharacter = characterAtLevel(4);
    const yeger = {
      getForTelegramUser: () =>
        Promise.resolve({
          state: "turn-in-ready",
          character: grownCharacter,
          progress: { wins: 17, target: 17, stageId: "second" }
        })
    } as unknown as YegerQuestService;

    const services = servicesWith({
      adventure: readyAdventureService(grownCharacter),
      fight: readyFightService(grownCharacter),
      yeger,
      cellarErrand: readyCellarService(grownCharacter)
    });

    await sendQuestHub(makeContext(activeReplies), services, "reply");
    await sendQuestHub(makeContext(archiveReplies), services, "reply", "archive");

    expect(activeReplies[0]?.text).toContain(
      "🏹 <i>Неспокійні справи 2.0</i> — 17/17, Єгер чекає дощечку."
    );
    expect(activeReplies[0]?.text).not.toContain("🏹 <i>Неспокійні справи</i> — виконано");
    const activeButtons = (
      activeReplies[0]?.options as {
        reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> };
      }
    ).reply_markup.inline_keyboard.flat();
    expect(activeButtons).toEqual(expect.arrayContaining([
      { text: "🏹 Здати Єгерю ✅", callback_data: makeYegerTurnInCallbackData() }
    ]));
    expect(activeButtons.map((button) => button.callback_data)).not.toContain("v1:tavern:ranger");
    expect(archiveReplies[0]?.text).toContain("🏹 <i>Неспокійні справи</i> — виконано; Єгер удає, що не пишається.");
    expect(archiveReplies[0]?.text).not.toContain("🏹 <i>Неспокійні справи 2.0</i> — виконано");
  });

  it("shows both completed Yeger boards in the archive after the second board is turned in", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const grownCharacter = characterAtLevel(4);

    await sendQuestHub(
      makeContext(replies),
      servicesWith({
        adventure: readyAdventureService(grownCharacter),
        fight: readyFightService(grownCharacter),
        yeger: {
          getForTelegramUser: () =>
            Promise.resolve({
              state: "completed",
              character: grownCharacter,
              progress: { wins: 17, target: 17, stageId: "second" },
              reward: {
                xp: 170,
                gold: 170,
                itemGrants: []
              }
            })
        } as unknown as YegerQuestService,
        cellarErrand: readyCellarService(grownCharacter)
      }),
      "reply",
      "archive"
    );

    expect(replies[0]?.text).toContain("🏹 <i>Неспокійні справи</i> — виконано; Єгер удає, що не пишається.");
    expect(replies[0]?.text).toContain("🏹 <i>Неспокійні справи 2.0</i> — виконано; Єгер удає, що не пишається.");
  });

  it("keeps completed problem-chain stages in the archive history", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const grownCharacter = characterAtLevel(4);
    const currentProblemQuest = {
      stageId: "23" as const,
      title: "Двадцять три підозрілі проблеми",
      wins: 4,
      target: 23,
      completed: false,
      rewardClaimed: false,
      issued: true,
      branchComplete: false
    };

    await sendQuestHub(
      makeContext(replies),
      servicesWith({
        adventure: readyAdventureService(grownCharacter),
        cellarErrand: readyCellarService(grownCharacter),
        fight: {
          getProblemQuestProgressForTelegramUser: () =>
            Promise.resolve({
              state: "ready",
              character: grownCharacter,
              progress: currentProblemQuest,
              archive: [questProgress(13, true)]
            }),
          getFightOverviewForTelegramUser: () =>
            Promise.resolve({
              state: "persistent-ready",
              character: grownCharacter,
              questProgress: currentProblemQuest
            }),
          completeMimicShawarma: () => Promise.resolve({ state: "no-character" })
        } as unknown as FightService
      }),
      "reply",
      "archive"
    );

    expect(replies[0]?.text).toContain(
      "🧾 <i>Тринадцять дрібних проблем</i> — 13/13 проблем у журналі, справу здано; Корчмар має наступний папірець."
    );
    expect(replies[0]?.text).not.toContain("🪧 <i>Три справи на найближчий час</i>");
    expect(replies[0]?.text).toContain(
      "🧹 <i>Льохова справа</i> — новачкова справа до 3 рівня; у журналі немає сліду виконання."
    );
    expect(replies[0]?.text).not.toContain(
      "🧾 <i>Двадцять три підозрілі проблеми</i> — 4/23 проблем у журналі."
    );
  });

  it("reminds exhausted heroes to rest before opening a new fight", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const exhaustedCharacter = {
      ...character,
      hpCurrent: 0,
      hpMax: 20
    };

    await sendQuestHub(
      makeContext(replies),
      servicesWith({
        adventure: readyAdventureService(exhaustedCharacter),
        cellarErrand: readyCellarService(exhaustedCharacter),
        yeger: readyYegerService(exhaustedCharacter),
        fight: {
          getProblemQuestProgressForTelegramUser: () =>
            Promise.resolve({
              state: "ready",
              character: exhaustedCharacter,
              progress: questProgress(0),
              archive: []
            }),
          getFightOverviewForTelegramUser: () =>
            Promise.resolve({
              state: "needs-rest",
              character: {
                ...exhaustedCharacter,
                resourceRecovery: {
                  hpSecondsToFull: 600,
                  manaSecondsToFull: 0
                }
              }
            }),
          completeMimicShawarma: () => Promise.resolve({ state: "no-character" })
        } as unknown as FightService
      }),
      "reply"
    );

    expect(replies[0]?.text).toContain(
      "🪜 <i>Низ</i> — герой ще не тримається на ногах; потрібен хоча б 1 HP."
    );
    expect(replies[0]?.text).toContain("HP 0? Спершу трохи відновіться. Справи почекають, доки буде хоча б 1 HP.");
    expect(replies[0]?.text).not.toContain("/hero");
    expect(replies[0]?.text).not.toContain("/fight");
  });

  it("uses the fight resource snapshot after lazy recovery sync", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const staleAdventureCharacter = {
      ...characterAtLevel(3),
      hpCurrent: 0,
      hpMax: 20
    };
    const recoveredFightCharacter = {
      ...staleAdventureCharacter,
      hpCurrent: 5
    };

    await sendQuestHub(
      makeContext(replies),
      servicesWith({
        adventure: readyAdventureService(staleAdventureCharacter),
        cellarErrand: readyCellarService(recoveredFightCharacter),
        yeger: readyYegerService(recoveredFightCharacter),
        fight: {
          getProblemQuestProgressForTelegramUser: () =>
            Promise.resolve({
              state: "ready",
              character: recoveredFightCharacter,
              progress: questProgress(0),
              archive: []
            }),
          getFightOverviewForTelegramUser: () =>
            Promise.resolve({
              state: "persistent-ready",
              character: recoveredFightCharacter,
              questProgress: questProgress(0)
            }),
          completeMimicShawarma: () => Promise.resolve({ state: "no-character" })
        } as unknown as FightService
      }),
      "reply"
    );

    expect(replies[0]?.text).not.toContain("<b>Мандрівник</b> · <i>Пересічні Пригодники</i>");
    expect(replies[0]?.text).toContain(
      "🧾 <i>Тринадцять дрібних проблем</i> — 0/13 проблем у журналі."
    );
    expect(replies[0]?.text).not.toContain("HP 0? Спершу трохи відновіться. Справи почекають, доки буде хоча б 1 HP.");
    const buttons = (
      replies[0]?.options as {
        reply_markup: { inline_keyboard: Array<Array<{ text: string }>> };
      }
    ).reply_markup.inline_keyboard.flat();
    expect(buttons.map((button) => button.text)).toContain("🪜 До Низу");
  });

  it("keeps terminal persistent fights recoverable from the quest hub", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const grownCharacter = characterAtLevel(4);

    await sendQuestHub(
      makeContext(replies),
      servicesWith({
        adventure: readyAdventureService(grownCharacter),
        fight: {
          getProblemQuestProgressForTelegramUser: () =>
            Promise.resolve({
              state: "ready",
              character: grownCharacter,
              progress: questProgress(14, true),
              archive: [questProgress(14, true)]
            }),
          getFightOverviewForTelegramUser: () =>
            Promise.resolve({
              state: "persistent-terminal",
              character: grownCharacter,
              session: {
                id: "123e4567-e89b-12d3-a456-426614174000",
                characterId: "character-42",
                monsterId: "monster.deleted",
                status: "expired",
                turn: 2,
                state: null,
                createdAt: new Date("2026-06-12T10:30:00.000Z"),
                updatedAt: new Date("2026-06-12T10:31:00.000Z"),
                expiresAt: new Date("2026-06-12T11:00:00.000Z")
              },
              monster: null,
              questProgress: questProgress(14, true)
            }),
          completeMimicShawarma: () => Promise.resolve({ state: "no-character" })
        } as unknown as FightService,
        yeger: readyYegerService(grownCharacter),
        cellarErrand: readyCellarService(grownCharacter)
      }),
      "reply"
    );

    expect(replies[0]?.text).toContain(
      "🧾 <i>Тринадцять дрібних проблем</i> — 14/13 проблем у журналі, справу здано; Корчмар має наступний папірець."
    );
    expect(replies[0]?.text).not.toContain(
      "🧾 <i>Тринадцять дрібних проблем</i> — 14/13 проблем у журналі, перший список закрито; далі практика."
    );
    const buttons = (
      replies[0]?.options as {
        reply_markup: { inline_keyboard: Array<Array<{ text: string }>> };
      }
    ).reply_markup.inline_keyboard.flat();
    expect(buttons.map((button) => button.text)).toContain("🍻 До шинку ⚠️");
    expect(buttons.map((button) => button.text)).toContain("🪜 До Низу");
  });

  it("hides starter shawarma and offers persistent fight at level three", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const grownCharacter = characterAtLevel(3);

    await sendQuestHub(
      makeContext(replies),
      servicesWith({
        adventure: readyAdventureService(grownCharacter),
        fight: readyFightService(grownCharacter),
        yeger: readyYegerService(grownCharacter),
        cellarErrand: readyCellarService(grownCharacter)
      }),
      "reply"
    );

    expect(replies[0]?.text).not.toContain("🌯 <i>Підозріла шаурма</i> — перша підозра для 1-2 рівнів.");
    expect(replies[0]?.text).toContain(
      "🧾 <i>Тринадцять дрібних проблем</i> — 0/13 проблем у журналі."
    );
    expect(replies[0]?.text).toContain("🧹 <i>Льохова справа</i> — миша приймає аргументи.");
    const buttons = (
      replies[0]?.options as {
        reply_markup: { inline_keyboard: Array<Array<{ text: string }>> };
      }
    ).reply_markup.inline_keyboard.flat();
    expect(buttons.map((button) => button.text)).toEqual([
      "🪧 Обрати пригоду ⚠️",
      "🪜 До Низу",
      "🧹 У льох ⚠️",
      "📦 Архів",
      "📖 Бестіарій",
      "🍺 До зали ⚠️"
    ]);
  });

  it("keeps completed starter shawarma and first fight in the archive after grownup unlocks", async () => {
    const activeReplies: Array<{ text: string; options: unknown }> = [];
    const archiveReplies: Array<{ text: string; options: unknown }> = [];
    const grownCharacter = characterAtLevel(4);
    const services = servicesWith({
      adventure: {
        getAdventureOfferForTelegramUser: () =>
          Promise.resolve({
            state: "ready",
            character: grownCharacter,
            offer: adventureOffer
          }),
        getMimicShawarmaForTelegramUser: () =>
          Promise.resolve({
            state: "level-retired",
            character: grownCharacter,
            maxLevel: 2,
            completed: true
          }),
        completeAdventureApproach: () => Promise.resolve({ state: "no-character" })
      } as unknown as AdventureService,
      fight: {
        getProblemQuestProgressForTelegramUser: () =>
          Promise.resolve({
            state: "ready",
            character: grownCharacter,
            progress: questProgress(0),
            archive: []
          }),
        getFightOverviewForTelegramUser: () =>
          Promise.resolve({
            state: "persistent-ready",
            character: grownCharacter,
            questProgress: questProgress(0)
          }),
        getMimicShawarmaForTelegramUser: () =>
          Promise.resolve({
            state: "level-retired",
            character: grownCharacter,
            maxLevel: 2,
            completed: true
          }),
        completeMimicShawarma: () => Promise.resolve({ state: "no-character" })
      } as unknown as FightService,
      yeger: readyYegerService(grownCharacter),
      cellarErrand: readyCellarService(grownCharacter)
    });

    await sendQuestHub(makeContext(activeReplies), services, "reply");
    await sendQuestHub(makeContext(archiveReplies), services, "reply", "archive");

    expect(activeReplies[0]?.text).toContain(
      "🧾 <i>Тринадцять дрібних проблем</i> — 0/13 проблем у журналі."
    );
    expect(activeReplies[0]?.text).not.toContain("🌯 <i>Підозріла шаурма</i>");
    expect(activeReplies[0]?.text).not.toContain("⚔️ <i>Новачкова сутичка</i>");
    const activeButtons = (
      activeReplies[0]?.options as {
        reply_markup: { inline_keyboard: Array<Array<{ text: string }>> };
      }
    ).reply_markup.inline_keyboard.flat();
    expect(activeButtons.map((button) => button.text)).toContain("🪜 До Низу");

    expect(archiveReplies[0]?.text).toContain("📦 Архів справ");
    expect(archiveReplies[0]?.text).toContain("🌯 <i>Підозріла шаурма</i> — виконано; соус досі числиться як свідок.");
    expect(archiveReplies[0]?.text).toContain("⚔️ <i>Новачкова сутичка</i> — виконано; перший висновок вижив у журналі.");
    expect(archiveReplies[0]?.text).not.toContain("🪜 <i>Низ</i> — сьогодні вже зараховано.");
  });

  it("keeps skipped starter shawarma and first fight in the archive after grownup unlocks", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const grownCharacter = characterAtLevel(4);

    await sendQuestHub(
      makeContext(replies),
      servicesWith({
        adventure: {
          getAdventureOfferForTelegramUser: () =>
            Promise.resolve({
              state: "ready",
              character: grownCharacter,
              offer: adventureOffer
            }),
          getMimicShawarmaForTelegramUser: () =>
            Promise.resolve({
              state: "level-retired",
              character: grownCharacter,
              maxLevel: 2,
              completed: false
            }),
          completeAdventureApproach: () => Promise.resolve({ state: "no-character" })
        } as unknown as AdventureService,
        fight: {
          getProblemQuestProgressForTelegramUser: () =>
            Promise.resolve({
              state: "ready",
              character: grownCharacter,
              progress: questProgress(0),
              archive: []
            }),
          getFightOverviewForTelegramUser: () =>
            Promise.resolve({
              state: "persistent-ready",
              character: grownCharacter,
              questProgress: questProgress(0)
            }),
          getMimicShawarmaForTelegramUser: () =>
            Promise.resolve({
              state: "level-retired",
              character: grownCharacter,
              maxLevel: 2,
              completed: false
            }),
          completeMimicShawarma: () => Promise.resolve({ state: "no-character" })
        } as unknown as FightService,
        yeger: readyYegerService(grownCharacter),
        cellarErrand: readyCellarService(grownCharacter)
      }),
      "reply",
      "archive"
    );

    expect(replies[0]?.text).toContain("📦 Архів справ");
    expect(replies[0]?.text).toContain(
      "🌯 <i>Підозріла шаурма</i> — новачкова справа до 2 рівня; у журналі немає сліду виконання."
    );
    expect(replies[0]?.text).toContain(
      "⚔️ <i>Новачкова сутичка</i> — навчальний бій для 1-2 рівнів; у журналі немає сліду виконання."
    );
  });

  it("keeps the quest table problem button on the difficulty route without starting combat", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const grownCharacter = characterAtLevel(3);
    let startCount = 0;

    await sendQuestHub(
      makeContext(replies),
      servicesWith({
        adventure: readyAdventureService(grownCharacter),
        fight: {
          ...readyFightService(grownCharacter),
          getOrStartPersistentFightForTelegramUser: () => {
            startCount += 1;
            return Promise.resolve({ state: "no-character" });
          }
        } as unknown as FightService,
        yeger: readyYegerService(grownCharacter),
        cellarErrand: readyCellarService(grownCharacter)
      }),
      "reply"
    );

    const buttons = (
      replies[0]?.options as {
        reply_markup: { inline_keyboard: Array<Array<{ callback_data: string }>> };
      }
    ).reply_markup.inline_keyboard.flat();

    expect(startCount).toBe(0);
    expect(buttons.map((button) => button.callback_data)).toContain(makePlaceCallbackData("deep"));
    expect(buttons.map((button) => button.callback_data)).not.toContain(
      makeQuestCallbackData("fight-normal")
    );
  });

  it("routes an unissued first problem quest to the Шинок from the quest hub", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const grownCharacter = characterAtLevel(3);

    await sendQuestHub(
      makeContext(replies),
      servicesWith({
        adventure: readyAdventureService(grownCharacter),
        fight: {
          getProblemQuestProgressForTelegramUser: () =>
            Promise.resolve({
              state: "ready",
              character: grownCharacter,
              progress: {
                ...questProgress(3),
                issued: false
              },
              archive: []
            }),
          getFightOverviewForTelegramUser: () =>
            Promise.resolve({
              state: "persistent-not-issued",
              character: grownCharacter,
              questProgress: {
                ...questProgress(3),
                issued: false
              }
            }),
          completeMimicShawarma: () => Promise.resolve({ state: "no-character" })
        } as unknown as FightService,
        yeger: readyYegerService(grownCharacter),
        cellarErrand: readyCellarService(grownCharacter)
      }),
      "reply"
    );

    expect(replies[0]?.text).toContain(
      "🧾 <i>Тринадцять дрібних проблем</i> — 3/13 проблем у старому журналі; Корчмар має папірець у шинку, спершу візьміть справу там."
    );
    expect(replies[0]?.text).not.toContain("0/13 проблем у журналі");
    const buttons = (
      replies[0]?.options as {
        reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> };
      }
    ).reply_markup.inline_keyboard.flat();
    expect(buttons.map((button) => button.text)).toEqual([
      "🍻 До шинку ⚠️",
      "🪧 Обрати пригоду ⚠️",
      "🧹 У льох ⚠️",
      "📦 Архів",
      "📖 Бестіарій",
      "🍺 До зали ⚠️"
    ]);
    expect(buttons.map((button) => button.callback_data)).toContain(makePlaceCallbackData("bar"));
    expect(buttons.map((button) => button.text)).not.toContain("До Низу");
  });

  it("shows active spar from the quest hub without offering a normal fight", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const presence = new CapturingPresenceService({
      locationId: PRESENCE_LOCATION_KORCHMA_HALL,
      insideKorchma: true
    });
    const grownCharacter = characterAtLevel(3);

    await sendQuestHub(
      makeContext(replies),
      servicesWith({
        presence,
        adventure: readyAdventureService(grownCharacter),
        fight: {
          getProblemQuestProgressForTelegramUser: () =>
            Promise.resolve({
              state: "ready",
              character: grownCharacter,
              progress: {
                ...questProgress(0),
                issued: false
              },
              archive: []
            }),
          getFightOverviewForTelegramUser: () =>
            Promise.resolve({
              state: "training-active",
              character: grownCharacter,
              session: trainingSession(),
              questProgress: questProgress(0)
            }),
          completeMimicShawarma: () => Promise.resolve({ state: "no-character" })
        } as unknown as FightService
      }),
      "reply"
    );

    expect(replies[0]?.text).toContain("/spar");
    expect(replies[0]?.text).toContain("Корчмар має папірець у шинку");
    const buttons = (
      replies[0]?.options as {
        reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> };
      }
    ).reply_markup.inline_keyboard.flat();
    expect(buttons.map((button) => button.callback_data)).not.toContain(
      makePlaceCallbackData("fighting-corner")
    );
    expect(buttons.map((button) => button.callback_data)).toContain(makePlaceCallbackData("bar"));
    expect(buttons.map((button) => button.callback_data)).not.toContain(makeQuestCallbackData("fight"));
    expect(presence.marks[0]).toMatchObject({
      locationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
      currentRaidId: null,
      currentAdventureId: null
    });
  });

  it("blocks the quest hub while a barrel raid is pending", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const presence = new CapturingPresenceService({
      locationId: PRESENCE_LOCATION_KORCHMA_HALL,
      insideKorchma: true
    });

    await sendQuestHub(
      makeContext(replies),
      servicesWith({
        presence,
        tavernRaid: {
          getActivePendingFridayBarrelRaidForTelegramUser: () =>
            Promise.resolve({
              state: "pending",
              character,
              availableAt: new Date("2026-06-13T10:33:00.000Z"),
              now: new Date("2026-06-13T10:30:00.000Z")
            })
        } as unknown as TavernRaidService
      }),
      "reply"
    );

    expect(replies[0]?.text).toContain("Ви зараз у рейді");
    expect(replies[0]?.text).toContain("Інші пригоди тимчасово недоступні");
    expect(presence.marks).toEqual([]);
  });
});

function characterAtLevel(level: 1 | 2 | 3 | 4 | 13): CharacterSummary {
  const xpByLevel = {
    1: 0,
    2: 10,
    3: 25,
    4: 45,
    13: 1300
  } satisfies Record<1 | 2 | 3 | 4 | 13, number>;
  const nextByLevel = {
    1: 10,
    2: 25,
    3: 45,
    4: 70,
    13: null
  } satisfies Record<1 | 2 | 3 | 4 | 13, number | null>;
  const nextLevelXp = nextByLevel[level];

  return {
    ...character,
    level,
    xp: xpByLevel[level],
    nextLevelXp,
    xpToNextLevel: nextLevelXp === null ? null : nextLevelXp - xpByLevel[level]
  };
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
  level: 3,
  xp: 25,
  nextLevelXp: 45,
  xpToNextLevel: 20,
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

class CapturingPresenceService {
  readonly marks: MarkPlayerPresenceInput[] = [];

  constructor(
    private readonly place: {
      locationId: string;
      insideKorchma: boolean;
    } = {
      locationId: PRESENCE_LOCATION_KORCHMA_HALL,
      insideKorchma: true
    }
  ) {}

  markAction(input: MarkPlayerPresenceInput): Promise<void> {
    this.marks.push(input);
    return Promise.resolve();
  }

  getCurrentPlaceForTelegramUser(): Promise<{
    state: "ready";
    locationId: string;
    locationName: string;
    insideKorchma: boolean;
  }> {
    return Promise.resolve({
      state: "ready",
      locationId: this.place.locationId,
      locationName: "Тестова місцина",
      insideKorchma: this.place.insideKorchma
    });
  }
}

function servicesWith(overrides: {
  adventure?: AdventureService;
  cellarErrand?: CellarErrandService;
  cellarGrownup?: CellarGrownupQuestService;
  dailyKorchmaRound?: DailyKorchmaRoundService;
  fight?: FightService;
  yeger?: YegerQuestService;
  presence?: CapturingPresenceService;
  tavernRaid?: TavernRaidService;
} = {}) {
  return {
    adventure:
      overrides.adventure ??
      readyAdventureService(character),
    cellarErrand:
      overrides.cellarErrand ??
      readyCellarService(character),
    cellarGrownup: overrides.cellarGrownup,
    dailyKorchmaRound: overrides.dailyKorchmaRound,
    fight:
      overrides.fight ??
      readyFightService(character),
    yeger:
      overrides.yeger ??
      readyYegerService(character),
    presence: overrides.presence ?? new CapturingPresenceService(),
    tavernRaid: overrides.tavernRaid
  };
}

function lockedDailyKorchmaRoundService(summary: CharacterSummary): DailyKorchmaRoundService {
  return {
    getExistingForTelegramUser: () =>
      Promise.resolve({
        state: "level-locked",
        character: summary,
        requiredLevel: 3
      })
  } as unknown as DailyKorchmaRoundService;
}

function completedDailyKorchmaRoundService(summary: CharacterSummary): DailyKorchmaRoundService {
  const completedSceneIds = ["scene.cellar.inventory-bottle", "scene.yeger.map-sneeze"];

  return {
    getExistingForTelegramUser: () =>
      Promise.resolve({
        state: "completed",
        character: summary,
        offer: {
          dayKey: "2026-06-28",
          dayToken: "20260628",
          lifeToken: 0,
          requiredSteps: 2,
          completedSceneIds,
          omittedSceneId: "scene.yard.rope",
          scenes: [
            {
              id: completedSceneIds[0],
              icon: "🍾",
              title: "Пляшка шепоче інвентаризацію",
              locationId: "location.korchma.cellar",
              hook: "У льосі пляшка шепоче номери.",
              actions: []
            },
            {
              id: completedSceneIds[1],
              icon: "🗺️",
              title: "Мапа чхнула не в той бік",
              locationId: "location.korchma.ranger_corner",
              hook: "У єгерському кутку мапа має думку.",
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
        },
        reward: {
          xp: 4,
          gold: 2,
          localDate: "2026-06-28"
        }
      })
  } as unknown as DailyKorchmaRoundService;
}

function completedCellarGrownupService(summary: CharacterSummary): CellarGrownupQuestService {
  return {
    getForTelegramUser: () =>
      Promise.resolve({
        state: "completed",
        character: summary,
        ending: "keep",
        reward: {
          xp: 40,
          gold: 0
        }
      })
  } as unknown as CellarGrownupQuestService;
}

function bottleObtainedCellarGrownupService(
  summary: CharacterSummary,
  bottleQuantity = 1
): CellarGrownupQuestService {
  return {
    getForTelegramUser: () =>
      Promise.resolve({
        state: "bottle-obtained",
        character: summary,
        bottleQuantity
      })
  } as unknown as CellarGrownupQuestService;
}

function readyAdventureService(summary: CharacterSummary): AdventureService {
  return {
    getAdventureOfferForTelegramUser: () =>
      Promise.resolve(
        summary.level < 3
          ? {
              state: "level-locked",
              character: summary,
              requiredLevel: 3
            }
          : {
              state: "ready",
              character: summary,
              offer: adventureOffer
          }
      ),
    getMimicShawarmaForTelegramUser: () =>
      Promise.resolve(
        summary.level >= 3
          ? {
              state: "level-retired",
              character: summary,
              maxLevel: 2
            }
          : {
              state: "ready",
              character: summary
            }
      ),
    completeAdventureApproach: () => Promise.resolve({ state: "no-character" })
  } as unknown as AdventureService;
}

function completedStarterAdventureService(summary: CharacterSummary): AdventureService {
  return {
    getAdventureOfferForTelegramUser: () =>
      Promise.resolve({
        state: "level-locked",
        character: summary,
        requiredLevel: 3
      }),
    getMimicShawarmaForTelegramUser: () =>
      Promise.resolve({
        state: "already-completed",
        character: summary,
        fightAvailable: true
      }),
    completeAdventureApproach: () => Promise.resolve({ state: "no-character" })
  } as unknown as AdventureService;
}

function completedAdventureService(summary: CharacterSummary): AdventureService {
  return {
    getAdventureOfferForTelegramUser: () =>
      Promise.resolve({
        state: "already-completed",
        character: summary
      }),
    completeAdventureApproach: () => Promise.resolve({ state: "no-character" })
  } as unknown as AdventureService;
}

const adventureOffer = {
  localDate: "2026-06-12",
  periodToken: "period93",
  expiresAt: new Date("2026-06-12T11:23:00.000Z"),
  choices: [
    {
      id: "stew" as const,
      title: "Казанок репетирує оперу",
      hook: "Юшка вимагає райдер.",
      client: "Кухар",
      problem: "Юшка співає.",
      goal: "Стишити казанок."
    },
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

function readyFightService(summary: CharacterSummary): FightService {
  return {
    getProblemQuestProgressForTelegramUser: () =>
      Promise.resolve({
        state: "ready",
        character: summary,
        progress: questProgress(0),
        archive: []
      }),
    getFightOverviewForTelegramUser: () =>
      Promise.resolve(
        summary.level >= 3
          ? {
              state: "persistent-ready",
              character: summary,
              questProgress: questProgress(0)
            }
          : {
              state: "ready",
              character: summary
            }
      ),
    getMimicShawarmaForTelegramUser: () =>
      Promise.resolve(
        summary.level >= 3
          ? {
              state: "level-retired",
              character: summary,
              maxLevel: 2
            }
          : {
              state: "ready",
              character: summary
            }
      ),
    completeMimicShawarma: () => Promise.resolve({ state: "no-character" })
  } as unknown as FightService;
}

function questProgress(wins: number, completed = false) {
  return {
    stageId: "13" as const,
    title: "Тринадцять дрібних проблем" as const,
    wins,
    target: 13,
    completed,
    rewardClaimed: completed,
    issued: true,
    branchComplete: false
  };
}

function trainingSession(): SoloCombatSessionRecord {
  return {
    id: "123e4567-e89b-12d3-a456-426614174000",
    characterId: "character-42",
    monsterId: TRAINING_DOPPELGANGER_MONSTER_ID,
    status: "active",
    turn: 1,
    state: {
      id: "123e4567-e89b-12d3-a456-426614174000",
      turn: 1,
      status: "active",
      hero: {
        hp: 24,
        hpMax: 24,
        mana: 12,
        manaMax: 12
      },
      monster: {
        id: TRAINING_DOPPELGANGER_MONSTER_ID,
        hp: 18,
        hpMax: 18
      }
    },
    reward: null,
    createdAt: new Date("2026-06-12T10:30:00.000Z"),
    updatedAt: new Date("2026-06-12T10:30:00.000Z"),
    expiresAt: new Date("2026-06-12T11:00:00.000Z")
  };
}

function readyCellarService(summary: CharacterSummary): CellarErrandService {
  return {
    getForTelegramUser: () =>
      Promise.resolve(
        summary.level < 2
          ? {
              state: "level-locked",
              character: summary,
              requiredLevel: 2
            }
          : summary.level > 3
            ? {
                state: "level-retired",
                character: summary,
                maxLevel: 3,
                completed: false
              }
          : {
              state: "ready",
              character: summary
            }
      ),
    complete: () => Promise.resolve({ state: "no-character" })
  } as unknown as CellarErrandService;
}

function completedRetiredCellarService(summary: CharacterSummary): CellarErrandService {
  return {
    getForTelegramUser: () =>
      Promise.resolve({
        state: "level-retired",
        character: summary,
        maxLevel: 3,
        completed: true
      }),
    complete: () => Promise.resolve({ state: "no-character" })
  } as unknown as CellarErrandService;
}

function readyYegerService(summary: CharacterSummary): YegerQuestService {
  return {
    getForTelegramUser: () =>
      Promise.resolve(
        summary.level < 4
          ? {
              state: "level-locked",
              character: summary,
              requiredLevel: 4
            }
          : {
              state: "offered",
              character: summary,
              progress: { wins: 0, target: 5 }
            }
      )
  } as unknown as YegerQuestService;
}

function makeContext(replies: Array<{ text: string; options: unknown }>): Context {
  return {
    from: {
      id: 42,
      is_bot: false,
      first_name: "Тест"
    },
    reply: (text: string, options: unknown) => {
      replies.push({ text, options });
      return Promise.resolve({});
    }
  } as unknown as Context;
}
