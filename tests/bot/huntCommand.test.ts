import type { Context } from "grammy";
import { describe, expect, it } from "vitest";
import { makePlaceCallbackData } from "../../src/bot/callbacks/placeCallbackData";
import { sendHuntBoard, sendYegerCorner } from "../../src/bot/commands/huntCommand";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";
import type { YegerQuestService } from "../../src/services/yegerQuestService";
import {
  PRESENCE_ADVENTURE_HUNT_BOARD,
  PRESENCE_LOCATION_KORCHMA_FRONT,
  PRESENCE_LOCATION_KORCHMA_HALL,
  PRESENCE_LOCATION_KORCHMA_RANGER_CORNER,
  type MarkPlayerPresenceInput
} from "../../src/services/presenceService";

describe("hunt command", () => {
  it("blocks /hunt outside before marking the quest table", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const presence = new CapturingPresenceService({
      locationId: PRESENCE_LOCATION_KORCHMA_FRONT,
      insideKorchma: false
    });

    await sendHuntBoard(makeContext(replies), readyHuntService(), "reply", {
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

  it("marks the Yeger corner when /hunt opens before a quest is active", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const presence = new CapturingPresenceService({
      locationId: PRESENCE_LOCATION_KORCHMA_HALL,
      insideKorchma: true
    });

    await sendHuntBoard(makeContext(replies), readyHuntService(), "reply", {
      presence,
      requireKorchmaInterior: true
    });

    expect(replies[0]?.text).toContain("🧥 Єгерський куток");
    expect(replies[0]?.text).toContain("У темному кутку сидить людисько-єгер у капюшоні");
    expect(replies[0]?.text).toContain("На краю стола лежить справа");
    expect(presence.marks[0]).toMatchObject({
      locationId: PRESENCE_LOCATION_KORCHMA_RANGER_CORNER,
      currentRaidId: null,
      currentAdventureId: PRESENCE_ADVENTURE_HUNT_BOARD
    });
  });

  it("marks the front yard when /hunt opens an active Yeger trail", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const presence = new CapturingPresenceService({
      locationId: PRESENCE_LOCATION_KORCHMA_HALL,
      insideKorchma: true
    });
    const yegerQuestService = {
      getForTelegramUser: () =>
        Promise.resolve({
          state: "in-progress",
          character,
          progress: { wins: 1, target: 5 },
          tracking: { state: "none" }
        })
    } as unknown as YegerQuestService;

    await sendHuntBoard(makeContext(replies), yegerQuestService, "reply", {
      presence,
      requireKorchmaInterior: true
    });

    expect(replies[0]?.text).toContain("🚪 Надворі біля корчми");
    expect(replies[0]?.text).toContain("Єгер лишився біля Бочки");
    expect(JSON.stringify(replies[0]?.options)).toContain("👣 Взяти слід");
    expect(presence.marks[0]).toMatchObject({
      locationId: PRESENCE_LOCATION_KORCHMA_FRONT,
      currentRaidId: null,
      currentAdventureId: PRESENCE_ADVENTURE_HUNT_BOARD
    });
  });

  it("opens the ranger corner before level four without offering the quest", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const presence = new CapturingPresenceService({
      locationId: PRESENCE_LOCATION_KORCHMA_HALL,
      insideKorchma: true
    });
    const yegerQuestService = {
      getForTelegramUser: () =>
        Promise.resolve({
          state: "level-locked",
          character: {
            ...character,
            level: 3,
            xp: 25,
            nextLevelXp: 45,
            xpToNextLevel: 20
          },
          requiredLevel: 4
        })
    } as unknown as YegerQuestService;

    await sendHuntBoard(makeContext(replies), yegerQuestService, "reply", {
      presence,
      requireKorchmaInterior: true
    });

    expect(replies[0]?.text).toContain("Єгерський куток");
    expect(replies[0]?.text).toContain("4 рівня");
    expect(presence.marks[0]).toMatchObject({
      locationId: PRESENCE_LOCATION_KORCHMA_RANGER_CORNER,
      currentRaidId: null,
      currentAdventureId: PRESENCE_ADVENTURE_HUNT_BOARD
    });
  });

  it("does not show hunt action buttons after the Yeger quest is completed", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const presence = new CapturingPresenceService({
      locationId: PRESENCE_LOCATION_KORCHMA_HALL,
      insideKorchma: true
    });
    const yegerQuestService = {
      getForTelegramUser: () =>
        Promise.resolve({
          state: "completed",
          character,
          progress: { wins: 5, target: 5 },
          reward: {
            xp: 80,
            gold: 120,
            itemGrants: [{ itemId: "item.yeger.first-notch", name: "Єгерська риска на дощечці", quantity: 1 }]
          }
        })
    } as unknown as YegerQuestService;

    await sendHuntBoard(makeContext(replies), yegerQuestService, "reply", {
      presence,
      requireKorchmaInterior: true
    });

    expect(replies[0]?.text).toContain("Неспокійні справи закрито");
    expect(replies[0]?.text).not.toContain("Вийти на слід");
    expect(replies[0]?.options).toMatchObject({
      parse_mode: "HTML"
    });
  });

  it("keeps completed quest rewards and the closed quest button out of the base Yeger corner", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const presence = new CapturingPresenceService({
      locationId: PRESENCE_LOCATION_KORCHMA_HALL,
      insideKorchma: true
    });
    const yegerQuestService = completedYegerService();

    await sendYegerCorner(makeContext(replies), yegerQuestService, "reply", {
      presence,
      requireKorchmaInterior: true
    });

    expect(replies[0]?.text).toContain("🧥 Єгерський куток");
    expect(replies[0]?.text).toContain("Єгер:\n<blockquote>");
    expect(replies[0]?.text).toContain("Неспокійні справи закрито.");
    expect(replies[0]?.text).not.toContain("Нагорода:");
    expect(replies[0]?.text).not.toContain("Здобуто:");
    expect(JSON.stringify(replies[0]?.options)).not.toContain("🏹 Неспокійні справи");
    expect(JSON.stringify(replies[0]?.options)).toContain("🩹 Бинти");
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

function readyHuntService(): YegerQuestService {
  return {
    getForTelegramUser: () =>
      Promise.resolve({
        state: "offered",
        character,
        progress: { wins: 0, target: 5 }
      })
  } as unknown as YegerQuestService;
}

function completedYegerService(): YegerQuestService {
  return {
    getForTelegramUser: () =>
      Promise.resolve({
        state: "completed",
        character,
        progress: { wins: 5, target: 5 },
        reward: {
          xp: 80,
          gold: 120,
          itemGrants: [{ itemId: "item.yeger.first-notch", name: "Єгерська риска на дощечці", quantity: 1 }]
        }
      })
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
  level: 4,
  xp: 70,
  nextLevelXp: 110,
  xpToNextLevel: 40,
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
