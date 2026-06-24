import type { Context } from "grammy";
import { describe, expect, it, vi } from "vitest";
import { sendFight } from "../../src/bot/commands/fightCommand";
import { makePlaceCallbackData } from "../../src/bot/callbacks/placeCallbackData";
import type { SoloCombatSessionRecord } from "../../src/db/repositories/soloCombatSessionRepository";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";
import { TRAINING_DOPPELGANGER_MONSTER_ID } from "../../src/domain/trainingDoppelganger";
import type { FightService } from "../../src/services/fightService";
import {
  PRESENCE_ADVENTURE_MIMIC_FIGHT,
  PRESENCE_LOCATION_KORCHMA_FRONT,
  PRESENCE_LOCATION_KORCHMA_HALL,
  PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT,
  PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_RIGHT,
  PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_STRAIGHT,
  PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
  type MarkPlayerPresenceInput
} from "../../src/services/presenceService";

describe("fight command", () => {
  const dayInKyiv = new Date("2026-06-19T09:00:00.000Z");

  it("blocks /fight outside before marking the quest table", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const presence = new CapturingPresenceService({
      locationId: PRESENCE_LOCATION_KORCHMA_FRONT,
      insideKorchma: false
    });
    const fightService = {
      getFightForTelegramUser: () =>
        Promise.resolve({
          state: "ready",
          character
        })
    } as unknown as FightService;

    await sendFight(makeContext(replies), fightService, "reply", {
      presence,
      requireKorchmaInterior: true
    });

    expect(replies[0]?.text).toBe("Квести видають усередині.");
    expect(replies[0]?.options).toMatchObject({
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🚪 Зайти в корчму",
              callback_data: makePlaceCallbackData("hall")
            }
          ]
        ]
      }
    });
    expect(presence.marks).toEqual([]);
  });

  it("marks the quest table when /fight starts inside the korchma", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const presence = new CapturingPresenceService({
      locationId: PRESENCE_LOCATION_KORCHMA_HALL,
      insideKorchma: true
    });
    const fightService = {
      getFightForTelegramUser: () =>
        Promise.resolve({
          state: "ready",
          character
        })
    } as unknown as FightService;

    await sendFight(makeContext(replies), fightService, "reply", {
      presence,
      requireKorchmaInterior: true
    });

    expect(replies[0]?.text).toContain("⚔️ Сутичка з підозрілим монстром");
    expect(replies[0]?.text).toContain("🌯 Монстр: 14/14");
    expect(replies[0]?.text).not.toContain("Це Мімік-шаурма");
    const options = replies[0]?.options as {
      reply_markup: { inline_keyboard: Array<Array<{ text: string }>> };
    };

    expect(options.reply_markup.inline_keyboard.flat().map((button) => button.text)).toEqual([
      "🗡️ Вдарити",
      "📋 Збити з пантелику чеком",
      "🏃 Відступити красиво"
    ]);
    expect(presence.marks[0]).toMatchObject({
      locationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
      currentRaidId: null,
      currentAdventureId: PRESENCE_ADVENTURE_MIMIC_FIGHT
    });
  });

  it("does not show fight action buttons after today's fight is already completed", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const fightService = {
      getFightForTelegramUser: () =>
        Promise.resolve({
          state: "already-completed",
          character,
          questAvailable: true
      })
    } as unknown as FightService;

    await sendFight(makeContext(replies), fightService, "reply");

    expect(replies).toHaveLength(1);
    expect(replies[0]?.text).toContain("Сьогоднішню сутичку вже зараховано");
    expect(replies[0]?.text).toContain("/quest");
    expect(replies[0]?.text).not.toContain("Що робимо?");
    expect(replies[0]?.options).toMatchObject({
      parse_mode: "HTML"
    });
    expect(replies[0]?.options).not.toHaveProperty("reply_markup");
  });

  it("shows a persistent fight screen for higher-level combat sessions", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const presence = new CapturingPresenceService({
      locationId: PRESENCE_LOCATION_KORCHMA_HALL,
      insideKorchma: true
    });
    const fightService = {
      getFightForTelegramUser: () =>
        Promise.resolve({
          state: "persistent-active",
          character: {
            ...character,
            level: 3
          },
          session: persistentSession(),
          monster: {
            id: "monster.deadline-spider",
            name: "Павук дедлайнів",
            description: "Плете павутину з «сьогодні швиденько».",
            level: 2,
            tags: ["beast", "time", "web"]
          },
          questProgress: questProgress(2)
        })
    } as unknown as FightService;

    await sendFight(makeContext(replies), fightService, "reply", {
      presence,
      requireKorchmaInterior: true
    });

    expect(replies).toHaveLength(1);
    expect(replies[0]?.text).toContain("❤️ Ви: 24/24 · мана 12/12");
    expect(replies[0]?.text).toContain("👹 Монстр: 18/18");
    expect(replies[0]?.text).toContain("⏳ На хід є 23 секунди");
    expect(replies[0]?.text).toContain("<b>Мандрівник</b>, що робимо?");
    expect(replies[0]?.text).toContain("⚔️ <b>Бій</b>");
    expect(replies[0]?.text).toContain("Проти вас: <b>Павук дедлайнів</b> · рівень 2");
    expect(replies[0]?.text).not.toContain("Тринадцять дрібних проблем");
    expect(replies[0]?.text).not.toContain("Не зволікайте надто довго");
    const options = replies[0]?.options as {
      parse_mode: string;
      reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> };
    };

    expect(options.parse_mode).toBe("HTML");
    expect(options.reply_markup.inline_keyboard[0]?.[0]).toEqual({
      text: "🗡️ Вдарити",
      callback_data: "v1:fight:turn:123e4567-e89b-12d3-a456-426614174000:1:attack"
    });
  });

  it("restores a terminal persistent fight through the canonical reward screen", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const recordPersistentFightMessageReference = vi.fn(() => Promise.resolve());
    const terminalSession = {
      ...persistentSession(),
      status: "won" as const,
      turn: 4,
      state: {
        ...persistentSession().state!,
        status: "won" as const,
        turn: 4,
        monster: {
          id: "monster.deadline-spider",
          name: "Павук дедлайнів",
          level: 2,
          hp: 0,
          hpMax: 18
        },
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
    const fightService = {
      getFightOverviewForTelegramUser: () =>
        Promise.resolve({
          state: "persistent-terminal" as const,
          character: {
            ...character,
            level: 3
          },
          session: terminalSession,
          monster: {
            id: "monster.deadline-spider",
            name: "Павук дедлайнів",
            description: "Плете павутину з «сьогодні швиденько».",
            level: 2,
            tags: ["beast", "time", "web"]
          },
          questProgress: questProgress(3),
          fightReward: {
            state: "already-claimed" as const,
            reward: {
              xp: 20,
              gold: 3,
              localDate: terminalSession.id,
              itemGrants: []
            },
            levelChange: null
          }
        }),
      recordPersistentFightMessageReference
    } as unknown as FightService;

    await sendFight(makeContextWithMessage(replies, 777), fightService, "reply");

    expect(replies[0]?.text).toContain("🎉 Ви перемогли");
    expect(replies[0]?.text).toContain("Винагорода за бій");
    expect(replies[0]?.text).not.toContain("Цей бій уже завершився");
    expect(replies[0]?.text).toContain("Проти вас: <b>Павук дедлайнів</b> · рівень 2");
    expect(replies[0]?.text).not.toContain("За бочками в коморі є сходи");
    const options = replies[0]?.options as {
      parse_mode: string;
      reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> };
    };

    expect(options.parse_mode).toBe("HTML");
    expect(options.reply_markup.inline_keyboard.flat()).toEqual([
      { text: "📜 Журнал бою", callback_data: "v1:fight:log:123e4567-e89b-12d3-a456-426614174000:0" },
      { text: "⚔️ Новий бій", callback_data: makePlaceCallbackData("deep-straight") },
      { text: "↩️ Повернутися до Низу", callback_data: makePlaceCallbackData("deep") }
    ]);
    expect(recordPersistentFightMessageReference).toHaveBeenCalledWith(42n, terminalSession.id, {
      chatId: "42",
      messageId: 777
    });
  });

  it("does not show active fight buttons for a zero-HP terminalized persistent overview", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const terminalSession = {
      ...persistentSession(),
      status: "lost" as const,
      state: {
        ...persistentSession().state!,
        status: "lost" as const,
        hero: {
          hp: 0,
          hpMax: 24,
          mana: 12,
          manaMax: 12
        },
        lastTurn: {
          action: "skip" as const,
          heroOutcome: "lost" as const,
          heroDamage: 0,
          monsterDamage: 0,
          manaSpent: 0,
          critical: false
        }
      }
    };
    const fightService = {
      getFightOverviewForTelegramUser: () =>
        Promise.resolve({
          state: "persistent-terminal" as const,
          character: {
            ...character,
            level: 3,
            hpCurrent: 0
          },
          session: terminalSession,
          monster: {
            id: "monster.deadline-spider",
            name: "Павук дедлайнів",
            description: "Плете павутину з «сьогодні швиденько».",
            level: 2,
            tags: ["beast", "time", "web"]
          },
          questProgress: questProgress(2),
          fightReward: null
        })
    } as unknown as FightService;

    await sendFight(makeContext(replies), fightService, "reply");

    expect(replies[0]?.text).toContain("Ви програли");
    const options = replies[0]?.options as {
      parse_mode: string;
      reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> };
    };
    const keyboard = JSON.stringify(options.reply_markup);

    expect(options.parse_mode).toBe("HTML");
    expect(keyboard).not.toContain("v1:fight:turn");
    expect(keyboard).not.toContain(":attack");
    expect(keyboard).not.toContain(":defend");
    expect(keyboard).not.toContain(":skill");
    expect(keyboard).not.toContain(":flee");
  });

  it.each([
    [PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT, "deep-left"],
    [PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_STRAIGHT, "deep-straight"],
    [PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_RIGHT, "deep-right"]
  ])("keeps terminal persistent fight navigation scoped to %s", async (originLocationId, newFightPlace) => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const terminalSession = terminalPersistentSession(originLocationId);
    const fightService = {
      getFightOverviewForTelegramUser: () =>
        Promise.resolve({
          state: "persistent-terminal" as const,
          character: {
            ...character,
            level: 3
          },
          session: terminalSession,
          monster: {
            id: "monster.deadline-spider",
            name: "Павук дедлайнів",
            description: "Плете павутину з «сьогодні швиденько».",
            level: 2,
            tags: ["beast", "time", "web"]
          },
          questProgress: questProgress(3),
          fightReward: null
        })
    } as unknown as FightService;

    await sendFight(makeContext(replies), fightService, "reply");

    const options = replies[0]?.options as {
      reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> };
    };
    const buttons = options.reply_markup.inline_keyboard.flat();

    expect(replies[0]?.text).toContain("🎉 Ви перемогли");
    expect(buttons).toContainEqual({
      text: "⚔️ Новий бій",
      callback_data: makePlaceCallbackData(newFightPlace)
    });
    expect(buttons).toContainEqual({
      text: "↩️ Повернутися до Сутеренів",
      callback_data: makePlaceCallbackData("deep-level1")
    });
  });

  it("pins legacy terminal persistent fights without originLocationId to the neutral straight fallback", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const terminalSession = terminalPersistentSession();
    const fightService = {
      getFightOverviewForTelegramUser: () =>
        Promise.resolve({
          state: "persistent-terminal" as const,
          character: {
            ...character,
            level: 3
          },
          session: terminalSession,
          monster: {
            id: "monster.deadline-spider",
            name: "Павук дедлайнів",
            description: "Плете павутину з «сьогодні швиденько».",
            level: 2,
            tags: ["beast", "time", "web"]
          },
          questProgress: questProgress(3),
          fightReward: null
        })
    } as unknown as FightService;

    await sendFight(makeContext(replies), fightService, "reply");

    const options = replies[0]?.options as {
      reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> };
    };
    const buttons = options.reply_markup.inline_keyboard.flat();

    expect(buttons).toContainEqual({
      text: "⚔️ Новий бій",
      callback_data: makePlaceCallbackData("deep-straight")
    });
    expect(buttons).toContainEqual({
      text: "↩️ Повернутися до Низу",
      callback_data: makePlaceCallbackData("deep")
    });
  });

  it("keeps /fight cosmetic-safe while a training doppelganger session is active", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const presence = new CapturingPresenceService({
      locationId: PRESENCE_LOCATION_KORCHMA_HALL,
      insideKorchma: true
    });
    const fightService = {
      getFightForTelegramUser: () =>
        Promise.resolve({
          state: "training-active",
          character: {
            ...character,
            level: 3
          },
          session: persistentSession(TRAINING_DOPPELGANGER_MONSTER_ID),
          questProgress: questProgress(0)
        })
    } as unknown as FightService;

    await sendFight(makeContext(replies), fightService, "reply", {
      presence,
      requireKorchmaInterior: true
    });

    expect(replies[0]?.text).toContain("Тренування вже триває");
    expect(replies[0]?.text).toContain("Завершіть /spar");
    expect(replies[0]?.text).not.toContain("Павук дедлайнів");
    expect(presence.marks).toEqual([]);
    const options = replies[0]?.options as {
      parse_mode: string;
      reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> };
    };

    expect(options.parse_mode).toBe("HTML");
    expect(options.reply_markup.inline_keyboard[0]?.[0]).toEqual({
      text: "🗡️ Вдарити",
      callback_data: "v1:spar:turn:123e4567-e89b-12d3-a456-426614174000:1:attack"
    });
  });

  it("opens the Nyz descent before problem fight difficulty choices", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    let startCount = 0;
    const fightService = {
      getFightOverviewForTelegramUser: () =>
        Promise.resolve({
          state: "persistent-ready",
          character: {
            ...character,
            level: 3
          },
          questProgress: questProgress(0)
        }),
      getOrStartPersistentFightForTelegramUser: () => {
        startCount += 1;
        return Promise.resolve({ state: "no-character" });
      }
    } as unknown as FightService;

    await sendFight(makeContext(replies), fightService, "reply", { now: dayInKyiv });

    expect(startCount).toBe(0);
    expect(replies[0]?.text).toContain("🪜 Спуск до Низу");
    expect(replies[0]?.text).toContain("За бочками в коморі є сходи.");
    expect(replies[0]?.text).not.toContain("Ярус I: Сутерени Корчми");
    expect(replies[0]?.options).toMatchObject({
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "⬆️ Повернутися до зали",
              callback_data: makePlaceCallbackData("hall")
            }
          ],
          [
            {
              text: "⬇️ Спуститися",
              callback_data: makePlaceCallbackData("deep-level1")
            }
          ]
        ]
      }
    });
  });

  it("offers three Nyz passages after descending", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    let startCount = 0;
    const fightService = {
      getFightOverviewForTelegramUser: () =>
        Promise.resolve({
          state: "persistent-ready",
          character: {
            ...character,
            level: 3
          },
          questProgress: questProgress(0)
        }),
      getOrStartPersistentFightForTelegramUser: () => {
        startCount += 1;
        return Promise.resolve({ state: "no-character" });
      }
    } as unknown as FightService;

    await sendFight(makeContext(replies), fightService, "reply", { openDifficulty: true });

    expect(startCount).toBe(0);
    expect(replies[0]?.text).toContain("Ярус I: Сутерени Корчми");
    expect(replies[0]?.text).toContain("Підсходник");
    expect(replies[0]?.text).toContain("⬅️ Лівий прохід");
    expect(replies[0]?.text).toContain("🚪 Прямий прохід");
    expect(replies[0]?.text).toContain("➡️ Правий прохід");
    expect(replies[0]?.text).not.toContain("Припічник");
    expect(replies[0]?.options).toMatchObject({
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "⬅️ Лівий прохід",
              callback_data: makePlaceCallbackData("deep-left")
            }
          ],
          [
            {
              text: "🚪 Прямий прохід",
              callback_data: makePlaceCallbackData("deep-straight")
            }
          ],
          [
            {
              text: "➡️ Правий прохід",
              callback_data: makePlaceCallbackData("deep-right")
            }
          ],
          [
            {
              text: "⬆️ Піднятися назад",
              callback_data: makePlaceCallbackData("deep")
            }
          ]
        ]
      }
    });
  });

  it("sends a recovery notice before fight options when HP just refilled", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const fightService = {
      getFightOverviewForTelegramUser: () =>
        Promise.resolve({
          state: "persistent-ready",
          character: {
            ...character,
            level: 3,
            hpCurrent: 24,
            hpMax: 24
          },
          questProgress: questProgress(0),
          recoveryNotice: {
            type: "hp-full",
            hpCurrent: 24,
            hpMax: 24
          }
        })
    } as unknown as FightService;

    await sendFight(makeContext(replies), fightService, "reply", { now: dayInKyiv });

    expect(replies).toHaveLength(2);
    expect(replies[0]?.text).toContain("Здоров’я знову повне: 24/24");
    expect(replies[0]?.text).toContain("бій, дуель або інше сумнівне рішення");
    expect(replies[0]?.options).toEqual({
      parse_mode: "HTML"
    });
    expect(replies[1]?.text).toContain("🪜 Спуск до Низу");
    const options = replies[1]?.options as {
      parse_mode: string;
      reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> };
    };

    expect(options.parse_mode).toBe("HTML");
    expect(options.reply_markup.inline_keyboard).toEqual([
      [{ text: "⬆️ Повернутися до зали", callback_data: makePlaceCallbackData("hall") }],
      [{ text: "⬇️ Спуститися", callback_data: makePlaceCallbackData("deep-level1") }]
    ]);
  });

  it("starts the selected persistent fight difficulty through the existing session path", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const startOptions: Array<{ difficulty?: string; originLocationId?: string }> = [];
    const fightService = {
      getOrStartPersistentFightForTelegramUser: (
        _telegramUserId: bigint,
        options: { difficulty?: string; originLocationId?: string }
      ) => {
        startOptions.push(options);
        return Promise.resolve({
          state: "persistent-active",
          character: {
            ...character,
            level: 3
          },
          session: persistentSession(),
          started: true,
          monster: {
            id: "monster.deadline-spider",
            name: "Павук дедлайнів",
            description: "Плете павутину з «сьогодні швиденько».",
            level: 1,
            tags: ["beast", "time", "web"]
          },
          questProgress: questProgress(0)
        });
      }
    } as unknown as FightService;

    await sendFight(makeContext(replies), fightService, "reply", {
      presence: new CapturingPresenceService({
        locationId: PRESENCE_LOCATION_KORCHMA_HALL,
        insideKorchma: true
      }),
      difficulty: "easy"
    });

    expect(startOptions).toEqual([
      {
        difficulty: "easy",
        originLocationId: "location.korchma.deep.level1.right"
      }
    ]);
    expect(replies[0]?.text).toContain("Павук дедлайнів");
    expect(replies[0]?.text).toContain("поки не видає нагород");
    expect(replies[1]?.text).toContain("❤️ Ви: 24/24 · мана 12/12");
    expect(replies[1]?.text).toContain("⏳ На хід є 23 секунди");
  });

  it("routes unissued problem quests to the Шинок instead of starting a fight", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const presence = new CapturingPresenceService({
      locationId: PRESENCE_LOCATION_KORCHMA_HALL,
      insideKorchma: true
    });
    const fightService = {
      getFightForTelegramUser: () =>
        Promise.resolve({
          state: "persistent-not-issued",
          character: {
            ...character,
            level: 3
          },
          questProgress: {
            ...questProgress(0),
            issued: false
          }
        })
    } as unknown as FightService;

    await sendFight(makeContext(replies), fightService, "reply", {
      presence,
      requireKorchmaInterior: true
    });

    expect(replies[0]?.text).toContain("Бій ще не відкрито");
    expect(replies[0]?.text).toContain("Спершу візьміть справу");
    expect(replies[0]?.text).toContain("шинку");
    expect(replies[0]?.text).not.toContain("0/13 проблем у журналі");
    expect(replies[0]?.options).toMatchObject({
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🍻 До шинку",
              callback_data: makePlaceCallbackData("bar")
            }
          ],
          [
            {
              text: "📋 До справ",
              callback_data: makePlaceCallbackData("quest-table")
            }
          ]
        ]
      }
    });
    expect(presence.marks).toEqual([]);
  });
});

class CapturingPresenceService {
  readonly marks: MarkPlayerPresenceInput[] = [];

  constructor(
    private readonly place: {
      locationId: string;
      insideKorchma: boolean;
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

function makeContextWithMessage(
  replies: Array<{ text: string; options: unknown }>,
  messageId: number
): Context {
  return {
    chat: {
      id: 42,
      type: "private"
    },
    from: {
      id: 42,
      is_bot: false,
      first_name: "Тест"
    },
    reply: (text: string, options: unknown) => {
      replies.push({ text, options });
      return Promise.resolve({ message_id: messageId });
    }
  } as unknown as Context;
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

function persistentSession(monsterId = "monster.deadline-spider"): SoloCombatSessionRecord {
  return {
    id: "123e4567-e89b-12d3-a456-426614174000",
    characterId: "character-42",
    monsterId,
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
        id: monsterId,
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

function terminalPersistentSession(originLocationId?: string): SoloCombatSessionRecord {
  const session = persistentSession();

  return {
    ...session,
    status: "won",
    turn: 4,
    state: {
      ...session.state!,
      ...(originLocationId ? { originLocationId } : {}),
      status: "won",
      turn: 4,
      monster: {
        id: "monster.deadline-spider",
        hp: 0,
        hpMax: 18
      },
      lastTurn: {
        action: "attack",
        heroOutcome: "won",
        heroDamage: 18,
        monsterDamage: 0,
        manaSpent: 0,
        critical: false
      }
    }
  };
}
