import type { Context } from "grammy";
import { describe, expect, it } from "vitest";
import { makePlaceCallbackData } from "../../src/bot/callbacks/placeCallbackData";
import { sendCellarErrandRouted } from "../../src/bot/commands/cellarCommand";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";
import type { CellarErrandService } from "../../src/services/cellarErrandService";
import type { CellarGrownupQuestService } from "../../src/services/cellarGrownupQuestService";
import {
  PRESENCE_ADVENTURE_CELLAR_MOUSE_ERRAND,
  PRESENCE_LOCATION_KORCHMA_CELLAR,
  PRESENCE_LOCATION_KORCHMA_FRONT,
  PRESENCE_LOCATION_KORCHMA_HALL,
  type MarkPlayerPresenceInput
} from "../../src/services/presenceService";

describe("cellar command", () => {
  it("blocks /cellar outside before marking the cellar", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const presence = new CapturingPresenceService({
      locationId: PRESENCE_LOCATION_KORCHMA_FRONT,
      insideKorchma: false
    });

    await sendCellarErrandRouted(makeContext(replies), cellarErrandService, presence, "reply");

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

  it("opens the cellar from inside the korchma", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const presence = new CapturingPresenceService({
      locationId: PRESENCE_LOCATION_KORCHMA_HALL,
      insideKorchma: true
    });

    await sendCellarErrandRouted(makeContext(replies), cellarErrandService, presence, "reply");

    expect(replies[0]?.text).toContain("🐭 Льохова справа");
    expect(presence.marks[0]).toMatchObject({
      locationId: PRESENCE_LOCATION_KORCHMA_CELLAR,
      currentRaidId: null,
      currentAdventureId: PRESENCE_ADVENTURE_CELLAR_MOUSE_ERRAND
    });
  });

  it("opens the grownup cellar quest for level four heroes", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const presence = new CapturingPresenceService({
      locationId: PRESENCE_LOCATION_KORCHMA_HALL,
      insideKorchma: true
    });
    const retiredMouse = {
      getForTelegramUser: () =>
        Promise.resolve({
          state: "level-retired",
          character: {
            ...character,
            level: 4,
            xp: 95,
            nextLevelXp: 135,
            xpToNextLevel: 40
          },
          maxLevel: 3,
          completed: false
        }),
      complete: () => Promise.resolve({ state: "no-character" })
    } as unknown as CellarErrandService;
    const grownupQuest = {
      getForTelegramUser: () =>
        Promise.resolve({
          state: "offered",
          character: {
            ...character,
            level: 4,
            xp: 95,
            nextLevelXp: 135,
            xpToNextLevel: 40
          },
          price: 240
        })
    } as unknown as CellarGrownupQuestService;

    await sendCellarErrandRouted(makeContext(replies), retiredMouse, presence, "reply", {
      grownupQuest
    });

    expect(replies[0]?.text).toContain("🐭 Справа не до миші");
    expect(replies[0]?.text).toContain("Пломба коштує 240 золота");
    const options = replies[0]?.options as {
      parse_mode?: string;
      reply_markup?: {
        inline_keyboard?: Array<Array<{ text: string; callback_data: string }>>;
      };
    };
    const buttons = options.reply_markup?.inline_keyboard?.flat() ?? [];

    expect(options.parse_mode).toBe("HTML");
    expect(buttons).toContainEqual({
      text: "🧀 Купити пломбу",
      callback_data: "v1:cellar:grownup-buy-seal"
    });
    expect(presence.marks[0]).toMatchObject({
      locationId: PRESENCE_LOCATION_KORCHMA_CELLAR,
      currentRaidId: null,
      currentAdventureId: PRESENCE_ADVENTURE_CELLAR_MOUSE_ERRAND
    });
  });

  it("blocks /cellar before level two without marking the cellar", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const presence = new CapturingPresenceService({
      locationId: PRESENCE_LOCATION_KORCHMA_HALL,
      insideKorchma: true
    });
    const levelOne = {
      getForTelegramUser: () =>
        Promise.resolve({
          state: "level-locked",
          character: {
            ...character,
            level: 1,
            xp: 0,
            nextLevelXp: 10,
            xpToNextLevel: 10
          },
          requiredLevel: 2
        }),
      complete: () => Promise.resolve({ state: "no-character" })
    } as unknown as CellarErrandService;

    await sendCellarErrandRouted(makeContext(replies), levelOne, presence, "reply");

    expect(replies[0]?.text).toContain("Льох поки зачинено");
    expect(replies[0]?.text).toContain("2 рівня");
    expect(presence.marks).toEqual([]);
  });
});

const cellarErrandService = {
  getForTelegramUser: () =>
    Promise.resolve({
      state: "ready",
      character
    }),
  complete: () => Promise.resolve({ state: "no-character" })
} as unknown as CellarErrandService;

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
  level: 2,
  xp: 10,
  nextLevelXp: 25,
  xpToNextLevel: 15,
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
