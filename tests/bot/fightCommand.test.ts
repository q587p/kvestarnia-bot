import type { Context } from "grammy";
import { describe, expect, it } from "vitest";
import { sendFight } from "../../src/bot/commands/fightCommand";
import { makePlaceCallbackData } from "../../src/bot/callbacks/placeCallbackData";
import { makeQuestCallbackData } from "../../src/bot/callbacks/questCallbackData";
import type { SoloCombatSessionRecord } from "../../src/db/repositories/soloCombatSessionRepository";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";
import { TRAINING_DOPPELGANGER_MONSTER_ID } from "../../src/domain/trainingDoppelganger";
import type { FightService } from "../../src/services/fightService";
import {
  PRESENCE_ADVENTURE_MIMIC_FIGHT,
  PRESENCE_LOCATION_KORCHMA_FRONT,
  PRESENCE_LOCATION_KORCHMA_HALL,
  PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
  type MarkPlayerPresenceInput
} from "../../src/services/presenceService";

describe("fight command", () => {
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

    expect(replies[0]?.text).toContain("⚔️ Бій");
    expect(replies[0]?.text).toContain("Павук дедлайнів");
    expect(replies[0]?.text).toContain("поки не видає нагород");
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

  it("offers recovery buttons when a persistent fight cannot start", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const fightService = {
      getFightForTelegramUser: () =>
        Promise.resolve({
          state: "persistent-ready",
          character: {
            ...character,
            level: 3
          },
          questProgress: questProgress(0)
        })
    } as unknown as FightService;

    await sendFight(makeContext(replies), fightService, "reply");

    expect(replies[0]?.text).toContain("Бій не стартував");
    expect(replies[0]?.options).toMatchObject({
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "⚔️ Новий бій",
              callback_data: makeQuestCallbackData("fight")
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
    expect(replies[0]?.text).toContain("Шинку");
    expect(replies[0]?.text).not.toContain("0/13 проблем у журналі");
    expect(replies[0]?.options).toMatchObject({
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🍻 До Шинку",
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
