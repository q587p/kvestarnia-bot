import type { Context } from "grammy";
import { describe, expect, it } from "vitest";
import { makePlaceCallbackData } from "../../src/bot/callbacks/placeCallbackData";
import { makeQuestCallbackData } from "../../src/bot/callbacks/questCallbackData";
import { makeYegerOutsideCallbackData } from "../../src/bot/callbacks/yegerCallbackData";
import {
  sendKorchmaArrivalBoard,
  sendKorchmaBar,
  sendDuelWinnersBoard,
  sendKorchmaDeepClosed,
  sendKorchmaFightingCorner,
  sendKorchmaFront,
  sendKorchmaMemorialBoard,
  sendTavern
} from "../../src/bot/commands/tavernCommand";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";
import type { CellarGrownupQuestService } from "../../src/services/cellarGrownupQuestService";
import type { FightService } from "../../src/services/fightService";
import type { PresenceService } from "../../src/services/presenceService";
import type { LevelMilestoneService } from "../../src/services/levelMilestoneService";
import type { TavernRaidService } from "../../src/services/tavernRaidService";

describe("tavern command screens", () => {
  it("shows front-of-korchma options with an enter button", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];

    await sendKorchmaFront(
      makeContext(replies),
      readyTavernService(),
      capturingPresenceService(),
      "reply"
    );

    expect(replies[0]?.text).toContain("За дверима гуде <b>Корчма Квестарні</b>");
    expect(replies[0]?.text).not.toContain("Усередині вже чекають:");
    expect(replies[0]?.text).not.toContain("Стіл зі справами</i>: квести");
    expect(replies[0]?.text).not.toContain("За дверима біля Бочки сидить");
    expect(replies[0]?.text).toContain("/tavern");
    expect(replies[0]?.options).toMatchObject({
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🚪 Зайти в корчму",
              callback_data: makePlaceCallbackData("hall")
            }
          ],
          [
            {
              text: "📜 Табличка прибулих",
              callback_data: makePlaceCallbackData("arrivals")
            },
            {
              text: "🏅 Пропамʼятна дошка",
              callback_data: makePlaceCallbackData("memorial")
            }
          ],
          [
            {
              text: "🎒 Манчкін-скупник",
              callback_data: "v1:lvlx:open"
            }
          ]
        ]
      }
    });
  });

  it("sends active Yeger quests to outdoor hunting from the front door", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];

    await sendKorchmaFront(
      makeContext(replies),
      readyTavernService(),
      capturingPresenceService(),
      "reply",
      {
        getForTelegramUser: () =>
          Promise.resolve({
            state: "in-progress",
            character,
            progress: { wins: 1, target: 5 },
            tracking: { state: "none" }
          })
      }
    );

    const options = replies[0]?.options as {
      reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> };
    };

    expect(options.reply_markup.inline_keyboard).toContainEqual([
      {
        text: "🏹 До полювання",
        callback_data: makeYegerOutsideCallbackData()
      }
    ]);
    expect(options.reply_markup.inline_keyboard.at(-1)).toEqual([
      {
        text: "🏹 До полювання",
        callback_data: makeYegerOutsideCallbackData()
      }
    ]);
  });

  it("does not offer a Yeger teleport from the front door after the quest is completed", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];

    await sendKorchmaFront(
      makeContext(replies),
      readyTavernService(),
      capturingPresenceService(),
      "reply",
      {
        getForTelegramUser: () =>
          Promise.resolve({
            state: "completed",
            character,
            progress: { wins: 5, target: 5 },
            reward: { xp: 80, gold: 120, itemGrants: [] }
          })
      }
    );

    expect(JSON.stringify(replies[0]?.options)).not.toContain("До Єгеря");
    expect(JSON.stringify(replies[0]?.options)).not.toContain("v1:tavern:ranger");
    expect(JSON.stringify(replies[0]?.options)).not.toContain("До полювання");
  });

  it("shows a front-door arrivals plaque from known korchma visitors", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];

    await sendKorchmaArrivalBoard(
      makeContext(replies),
      readyTavernService(),
      korchmaArrivalService(),
      "reply"
    );

    expect(replies[0]?.text).toContain("📜 Табличка прибулих");
    expect(replies[0]?.text).toContain("Дара · рівень 2 · Зала корчми");
    expect(replies[0]?.text).not.toContain("Видатні жителі");
    expect(replies[0]?.text).not.toContain("Перші зарубки за рівні:");
    expect(replies[0]?.options).toMatchObject({
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🚪 Зайти в корчму",
              callback_data: makePlaceCallbackData("hall")
            }
          ],
          [
            {
              text: "⬅️ До дверей",
              callback_data: makePlaceCallbackData("front")
            }
          ]
        ]
      }
    });
  });

  it("shows interior korchma presence counts on the hall screen", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];

    await sendTavern(makeContext(replies), readyTavernService(), korchmaPresenceService(), "reply");

    expect(replies[0]?.text).toContain(
      "За столами й закутками корчми: 2 активні, 1 притихлий."
    );
    expect(replies[0]?.text).not.toContain("Дара");
    expect(replies[0]?.text).not.toContain("Нестор Межовий");
    expect(replies[0]?.text).not.toContain("рівень 2");
    expect(replies[0]?.text).not.toContain("поки тільки ви");
  });

  it("shows the Шинок screen with beer controls", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];

    await sendKorchmaBar(
      makeContext(replies),
      readyTavernService(),
      capturingPresenceService(),
      "reply"
    );

    expect(replies[0]?.text).toContain("🍻 Шинок");
    expect(replies[0]?.text).toContain("Що наливаємо?");
    expect(replies[0]?.options).toMatchObject({
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🍻 Всім пива",
              callback_data: "v1:tavern:round"
            }
          ],
          [
            {
              text: "⬅️ До зали",
              callback_data: makePlaceCallbackData("hall")
            }
          ]
        ]
      }
    });
  });

  it("shows the fighting corner as a menu with training, duel modes and winners", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];

    await sendKorchmaFightingCorner(
      makeContext(replies),
      readyTavernService(),
      capturingPresenceService(),
      "reply"
    );

    expect(replies[0]?.text).toContain("🥊 Бійцівський куток");
    expect(replies[0]?.text).toContain("Тут не бʼються одразу");
    expect(replies[0]?.text).toContain("⚡ Миттєва дуель");
    expect(replies[0]?.text).toContain("♟️ Покрокова дуель");
    expect(replies[0]?.options).toMatchObject({
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🥊 Потренуватися", callback_data: "v1:spar:open" }],
          [{ text: "⚡ Миттєва дуель", callback_data: "v1:duel:new" }],
          [{ text: "♟️ Покрокова дуель", callback_data: "v1:duel:new-t" }],
          [
            { text: "🏆 Переможці", callback_data: makePlaceCallbackData("duel-winners") }
          ],
          [{ text: "⬅️ До зали", callback_data: makePlaceCallbackData("hall") }]
        ]
      }
    });
  });

  it("shows the Nyz descent surface", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];

    await sendKorchmaDeepClosed(
      makeContext(replies),
      readyTavernService({ ...character, level: 3 }),
      capturingPresenceService(),
      "reply"
    );

    expect(replies[0]?.text).toContain("🪜 Спуск до Низу");
    expect(replies[0]?.text).toContain("За бочками в коморі є сходи.");
    expect(JSON.stringify(replies[0]?.options)).toContain(makePlaceCallbackData("deep-level1"));
    expect(JSON.stringify(replies[0]?.options)).toContain(makePlaceCallbackData("hall"));
  });

  it("keeps lower-level characters out of the Nyz descent surface", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];

    await sendKorchmaDeepClosed(
      makeContext(replies),
      readyTavernService({ ...character, level: 1 }),
      capturingPresenceService(),
      "reply"
    );

    expect(replies[0]?.text).toContain("🪜 Низ відкриється з 3 рівня");
    expect(replies[0]?.text).not.toContain("Перші тринадцять сходинок");
    expect(JSON.stringify(replies[0]?.options)).not.toContain(makePlaceCallbackData("deep-level1"));
    expect(JSON.stringify(replies[0]?.options)).toContain(makePlaceCallbackData("hall"));
  });

  it("shows duel winners from the fighting corner", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];

    await sendDuelWinnersBoard(
      makeContext(replies),
      readyTavernService(),
      capturingPresenceService(),
      {
        getLeaderboard: () =>
          Promise.resolve({
            day: [{ characterId: "character-1", name: "Дара", winCount: 2, drawCount: 1, lossCount: 5 }],
            week: [],
            month: []
          })
      },
      "reply"
    );

    expect(replies[0]?.text).toContain("🏆 Переможці дуелей");
    expect(replies[0]?.text).toContain("1. Дара — 2 перемоги, 1 нічия, 5 поразок");
    expect(JSON.stringify(replies[0]?.options)).toContain(makePlaceCallbackData("duel-winners"));
  });

  it("offers problem quest turn-in from the Шинок when a stage is ready", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];

    await sendKorchmaBar(
      makeContext(replies),
      readyTavernService(),
      capturingPresenceService(),
      "reply",
      undefined,
      problemQuestFightService({ completed: true, rewardClaimed: false })
    );

    expect(replies[0]?.text).toContain("готову справу можна здати просто тут");
    expect(replies[0]?.options).toMatchObject({
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🍻 Всім пива", callback_data: "v1:tavern:round" }],
          [{ text: "📋 Здати справу", callback_data: makeQuestCallbackData("problem") }],
          [{ text: "⬅️ До зали", callback_data: makePlaceCallbackData("hall") }]
        ]
      }
    });
  });

  it("offers taking the first problem quest from the Шинок before progress starts", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];

    await sendKorchmaBar(
      makeContext(replies),
      readyTavernService(),
      capturingPresenceService(),
      "reply",
      undefined,
      unissuedProblemQuestFightService()
    );

    expect(replies[0]?.text).toContain("можна взяти як нову справу");
    expect(replies[0]?.options).toMatchObject({
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🍻 Всім пива", callback_data: "v1:tavern:round" }],
          [{ text: "📋 Взяти справу", callback_data: makeQuestCallbackData("problem-next") }],
          [{ text: "⬅️ До зали", callback_data: makePlaceCallbackData("hall") }]
        ]
      }
    });
  });

  it("offers the next problem quest from the Шинок after turn-in", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];

    await sendKorchmaBar(
      makeContext(replies),
      readyTavernService(),
      capturingPresenceService(),
      "reply",
      undefined,
      problemQuestFightService({ completed: true, rewardClaimed: true })
    );

    expect(replies[0]?.text).toContain("Корчмар відкриє новий лічильник");
    expect(replies[0]?.options).toMatchObject({
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🍻 Всім пива", callback_data: "v1:tavern:round" }],
          [{ text: "📋 Взяти наступну справу", callback_data: makeQuestCallbackData("problem-next") }],
          [{ text: "⬅️ До зали", callback_data: makePlaceCallbackData("hall") }]
        ]
      }
    });
  });

  it("offers taking the first problem quest from the Шинок while training doppelganger is active", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];

    await sendKorchmaBar(
      makeContext(replies),
      readyTavernService(),
      capturingPresenceService(),
      "reply",
      undefined,
      trainingActiveProblemQuestFightService({ issued: false, completed: false, rewardClaimed: false })
    );

    expect(replies[0]?.text).toContain("можна взяти як нову справу");
    expect(replies[0]?.options).toMatchObject({
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🍻 Всім пива", callback_data: "v1:tavern:round" }],
          [{ text: "📋 Взяти справу", callback_data: makeQuestCallbackData("problem-next") }],
          [{ text: "⬅️ До зали", callback_data: makePlaceCallbackData("hall") }]
        ]
      }
    });
  });

  it("offers problem quest turn-in from the Шинок while training doppelganger is active", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];

    await sendKorchmaBar(
      makeContext(replies),
      readyTavernService(),
      capturingPresenceService(),
      "reply",
      undefined,
      trainingActiveProblemQuestFightService({ issued: true, completed: true, rewardClaimed: false })
    );

    expect(replies[0]?.text).toContain("готову справу можна здати просто тут");
    expect(replies[0]?.options).toMatchObject({
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🍻 Всім пива", callback_data: "v1:tavern:round" }],
          [{ text: "📋 Здати справу", callback_data: makeQuestCallbackData("problem") }],
          [{ text: "⬅️ До зали", callback_data: makePlaceCallbackData("hall") }]
        ]
      }
    });
  });

  it("offers the next problem quest from the Шинок after turn-in while training doppelganger is active", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];

    await sendKorchmaBar(
      makeContext(replies),
      readyTavernService(),
      capturingPresenceService(),
      "reply",
      undefined,
      trainingActiveProblemQuestFightService({ issued: true, completed: true, rewardClaimed: true })
    );

    expect(replies[0]?.text).toContain("Корчмар відкриє новий лічильник");
    expect(replies[0]?.options).toMatchObject({
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🍻 Всім пива", callback_data: "v1:tavern:round" }],
          [{ text: "📋 Взяти наступну справу", callback_data: makeQuestCallbackData("problem-next") }],
          [{ text: "⬅️ До зали", callback_data: makePlaceCallbackData("hall") }]
        ]
      }
    });
  });

  it("shows a separate front-door memorial board for level firsts", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];

    await sendKorchmaMemorialBoard(
      makeContext(replies),
      readyTavernService(),
      korchmaArrivalService(),
      "reply",
      levelMilestoneService()
    );

    expect(replies[0]?.text).toContain("🏅 Пропамʼятна дошка");
    expect(replies[0]?.text).toContain("Видатні жителі");
    expect(replies[0]?.text).toContain("Перші зарубки за рівні:");
    expect(replies[0]?.text).toContain(
      "рівень 4: 🥇 Дара · 🥈 Нестор Межовий · 🥉 Архіварка"
    );
    expect(replies[0]?.text).not.toContain("Останні зарубки:");
    expect(replies[0]?.options).toMatchObject({
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🚪 Зайти в корчму",
              callback_data: makePlaceCallbackData("hall")
            }
          ],
          [
            {
              text: "⬅️ До дверей",
              callback_data: makePlaceCallbackData("front")
            }
          ]
        ]
      }
    });
  });

  it("offers bottle turn-in from the Шинок when the cellar bottle is carried", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];

    await sendKorchmaBar(
      makeContext(replies),
      readyTavernService(),
      capturingPresenceService(),
      "reply",
      bottleObtainedGrownupQuest()
    );

    expect(replies[0]?.text).toContain("є місце для пляшки з льоху");
    expect(replies[0]?.options).toMatchObject({
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🍻 Всім пива",
              callback_data: "v1:tavern:round"
            }
          ],
          [
            {
              text: "🍾 Здати пляшку",
              callback_data: "v1:cellar:grownup-turn-in"
            }
          ],
          [
            {
              text: "⬅️ До зали",
              callback_data: makePlaceCallbackData("hall")
            }
          ]
        ]
      }
    });
  });

  it("does not offer bottle turn-in from the Шинок after the bottle is gone", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];

    await sendKorchmaBar(
      makeContext(replies),
      readyTavernService(),
      capturingPresenceService(),
      "reply",
      bottleObtainedGrownupQuest(0)
    );

    expect(replies[0]?.options).toMatchObject({
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🍻 Всім пива",
              callback_data: "v1:tavern:round"
            }
          ],
          [
            {
              text: "⬅️ До зали",
              callback_data: makePlaceCallbackData("hall")
            }
          ]
        ]
      }
    });
  });
});

const character: CharacterSummary = {
  name: "Мандрівник",
  pronoun: "they",
  pronounLabel: "Вони",
  path: "boundary",
  raceId: "race.human-ish",
  raceName: "Людисько",
  classId: "class.warrior",
  className: "Воїн",
  title: "Пригодники місцевого значення",
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

function readyTavernService(tavernCharacter: CharacterSummary = character): TavernRaidService {
  return {
    getTavernForTelegramUser: () =>
      Promise.resolve({
        state: "ready",
        character: tavernCharacter
      })
  } as unknown as TavernRaidService;
}

function capturingPresenceService(): PresenceService {
  return {
    markAction: () => Promise.resolve()
  } as unknown as PresenceService;
}

function korchmaPresenceService(): PresenceService {
  return {
    markAction: () => Promise.resolve(),
    getKorchmaInteriorPresence: () =>
      Promise.resolve({
        active: [
          { telegramUserId: 42n, name: "Мандрівник", status: "active" },
          { telegramUserId: 77n, name: "Дара", status: "active", level: 2 }
        ],
        idle: [{ telegramUserId: 88n, name: "Нестор Межовий", status: "idle" }],
        total: 3
      })
  } as unknown as PresenceService;
}

function korchmaArrivalService(): PresenceService {
  return {
    markAction: () => Promise.resolve(),
    getKorchmaArrivalBoard: () =>
      Promise.resolve({
        entries: [
          {
            telegramUserId: 77n,
            name: "Дара",
            level: 2,
            locationName: "Зала корчми"
          }
        ]
      })
  } as unknown as PresenceService;
}

function bottleObtainedGrownupQuest(bottleQuantity = 1): CellarGrownupQuestService {
  return {
    getForTelegramUser: () =>
      Promise.resolve({
        state: "bottle-obtained",
        character,
        bottleQuantity
      })
  } as unknown as CellarGrownupQuestService;
}

function unissuedProblemQuestFightService(): FightService {
  return {
    getProblemQuestProgressForTelegramUser: () =>
      Promise.resolve({
        state: "ready",
        character,
        progress: problemQuestProgress({ issued: false, completed: false, rewardClaimed: false }),
        archive: []
      }),
    getFightOverviewForTelegramUser: () =>
      Promise.resolve({
        state: "persistent-not-issued",
        character,
        questProgress: problemQuestProgress({ issued: false, completed: false, rewardClaimed: false })
      })
  } as unknown as FightService;
}

function problemQuestFightService(progress: {
  completed: boolean;
  rewardClaimed: boolean;
}): FightService {
  return {
    getProblemQuestProgressForTelegramUser: () =>
      Promise.resolve({
        state: "ready",
        character,
        progress: problemQuestProgress({ issued: true, ...progress }),
        archive: []
      }),
    getFightOverviewForTelegramUser: () =>
      Promise.resolve({
        state: "persistent-ready",
        character,
        questProgress: problemQuestProgress({ issued: true, ...progress })
      })
  } as unknown as FightService;
}

function trainingActiveProblemQuestFightService(progress: {
  issued: boolean;
  completed: boolean;
  rewardClaimed: boolean;
}): FightService {
  return {
    getProblemQuestProgressForTelegramUser: () =>
      Promise.resolve({
        state: "ready",
        character,
        progress: problemQuestProgress(progress),
        archive: []
      }),
    getFightOverviewForTelegramUser: () =>
      Promise.resolve({
        state: "training-active",
        character,
        session: {
          id: "training-session-1",
          characterId: "character-42",
          monsterId: "monster.training-doppelganger",
          status: "active",
          turn: 1,
          reward: null,
          createdAt: new Date("2026-06-17T10:00:00.000Z"),
          updatedAt: new Date("2026-06-17T10:00:00.000Z"),
          expiresAt: new Date("2026-06-17T10:20:00.000Z"),
          state: {
            id: "training-session-1",
            status: "active",
            turn: 1,
            hero: { hp: 20, hpMax: 20, mana: 10, manaMax: 10 },
            monster: { id: "monster.training-doppelganger", hp: 20, hpMax: 20 }
          }
        },
        questProgress: problemQuestProgress(progress)
      })
  } as unknown as FightService;
}

function problemQuestProgress(progress: {
  issued: boolean;
  completed: boolean;
  rewardClaimed: boolean;
}) {
  return {
    stageId: "13" as const,
    title: "Тринадцять дрібних проблем" as const,
    wins: progress.completed ? 13 : progress.issued ? 5 : 0,
    target: 13,
    completed: progress.completed,
    rewardClaimed: progress.rewardClaimed,
    issued: progress.issued,
    branchComplete: false
  };
}

function levelMilestoneService(): LevelMilestoneService {
  return {
    getBoard: () =>
      Promise.resolve({
        levels: [
          {
            level: 4,
            entries: [
              {
                rank: 1,
                telegramUserId: 77n,
                characterId: "character-dara",
                name: "Дара",
                level: 4,
                reachedAt: new Date("2026-06-15T10:00:00.000Z")
              },
              {
                rank: 2,
                telegramUserId: 88n,
                characterId: "character-nestor",
                name: "Нестор Межовий",
                level: 4,
                reachedAt: new Date("2026-06-15T10:05:00.000Z")
              },
              {
                rank: 3,
                telegramUserId: 99n,
                characterId: "character-archivist",
                name: "Архіварка",
                level: 4,
                reachedAt: new Date("2026-06-15T10:09:00.000Z")
              }
            ]
          }
        ]
      })
  } as unknown as LevelMilestoneService;
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
