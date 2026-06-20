import type { Context } from "grammy";
import { describe, expect, it } from "vitest";
import { sendAdventure } from "../../src/bot/commands/adventureCommand";
import { makePlaceCallbackData } from "../../src/bot/callbacks/placeCallbackData";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";
import type { AdventureService } from "../../src/services/adventureService";
import {
  PRESENCE_ADVENTURE_CELLAR_MOUSE_ERRAND,
  PRESENCE_ADVENTURE_CHOICE,
  PRESENCE_ADVENTURE_MIMIC_SHAWARMA,
  PRESENCE_LOCATION_KORCHMA_CELLAR,
  PRESENCE_LOCATION_KORCHMA_FRONT,
  PRESENCE_LOCATION_KORCHMA_HALL,
  PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
  type MarkPlayerPresenceInput
} from "../../src/services/presenceService";

describe("adventure command", () => {
  it("blocks /quest outside before marking the shawarma table", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const presence = new CapturingPresenceService({
      locationId: PRESENCE_LOCATION_KORCHMA_FRONT,
      insideKorchma: false
    });
    const ctx = {
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
    const adventureService = {
      getAdventureOfferForTelegramUser: () =>
        Promise.resolve({
          state: "ready",
          character,
          offer
        }),
      completeAdventureApproach: () => Promise.resolve({ state: "no-character" })
    } as unknown as AdventureService;

    await sendAdventure(ctx, adventureService, "reply", {
      cellarErrand: {
        getForTelegramUser: () => Promise.resolve({ state: "no-character" }),
        complete: () => Promise.resolve({ state: "no-character" })
      },
      presence,
      fallbackToCellar: false,
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

  it("routes /quest from the hall to the quest table", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const presence = new CapturingPresenceService({
      locationId: PRESENCE_LOCATION_KORCHMA_HALL,
      insideKorchma: true
    });
    const ctx = {
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
    const adventureService = {
      getAdventureOfferForTelegramUser: () =>
        Promise.resolve({
          state: "ready",
          character,
          offer
        }),
      completeAdventureApproach: () => Promise.resolve({ state: "no-character" })
    } as unknown as AdventureService;

    await sendAdventure(ctx, adventureService, "reply", {
      cellarErrand: {
        getForTelegramUser: () => Promise.resolve({ state: "no-character" }),
        complete: () => Promise.resolve({ state: "no-character" })
      },
      presence,
      fallbackToCellar: false,
      requireKorchmaInterior: true
    });

    expect(replies[0]?.text).toContain("🪧 Три справи на найближчий час");
    expect(replies[0]?.text).toContain("Казанок репетирує оперу");
    expect(replies[0]?.options).toHaveProperty("reply_markup");
    expect(presence.marks[0]).toMatchObject({
      locationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE
    });
  });

  it("shows the starter shawarma adventure while the choice loop is level-locked", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const presence = new CapturingPresenceService({
      locationId: PRESENCE_LOCATION_KORCHMA_HALL,
      insideKorchma: true
    });
    const ctx = {
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
    const adventureService = {
      getAdventureOfferForTelegramUser: () =>
        Promise.resolve({
          state: "level-locked",
          character,
          requiredLevel: 3
        }),
      getMimicShawarmaForTelegramUser: () =>
        Promise.resolve({
          state: "ready",
          character
        }),
      completeAdventureApproach: () => Promise.resolve({ state: "no-character" })
    } as unknown as AdventureService;

    await sendAdventure(ctx, adventureService, "reply", {
      cellarErrand: {
        getForTelegramUser: () => Promise.resolve({ state: "no-character" }),
        complete: () => Promise.resolve({ state: "no-character" })
      },
      presence,
      fallbackToCellar: false,
      requireKorchmaInterior: true
    });

    expect(replies[0]?.text).toContain("Підозріла шаурма");
    expect(replies[0]?.text).toContain("Вона дихає");
    expect(replies[0]?.text).not.toContain("відкриється з 3 рівня");
    expect(replies[0]?.options).toMatchObject({ parse_mode: "HTML" });
    const callbacks = getReplyCallbacks(replies[0]?.options);
    const methodCallbacks = callbacks.filter((callback) => /^v2:adv:m:q[0-9a-z]+$/u.test(callback));
    expect(methodCallbacks.length).toBeGreaterThanOrEqual(5);
    expect(methodCallbacks.length).toBeLessThanOrEqual(7);
    expect(callbacks.at(-1)).toBe("v1:place:quest-table");
    expect(presence.marks[0]).toMatchObject({
      locationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
      currentRaidId: null,
      currentAdventureId: PRESENCE_ADVENTURE_MIMIC_SHAWARMA
    });
  });

  it("does not mark completed starter shawarma as actionable starter presence", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const presence = new CapturingPresenceService({
      locationId: PRESENCE_LOCATION_KORCHMA_HALL,
      insideKorchma: true
    });
    const ctx = {
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
    const adventureService = {
      getAdventureOfferForTelegramUser: () =>
        Promise.resolve({
          state: "level-locked",
          character,
          requiredLevel: 3
        }),
      getMimicShawarmaForTelegramUser: () =>
        Promise.resolve({
          state: "already-completed",
          character,
          fightAvailable: true
        }),
      completeAdventureApproach: () => Promise.resolve({ state: "no-character" })
    } as unknown as AdventureService;

    await sendAdventure(ctx, adventureService, "reply", {
      cellarErrand: {
        getForTelegramUser: () => Promise.resolve({ state: "no-character" }),
        complete: () => Promise.resolve({ state: "no-character" })
      },
      presence,
      fallbackToCellar: false,
      requireKorchmaInterior: true
    });

    expect(replies).toHaveLength(1);
    expect(replies[0]?.text).toContain("Шаурма вже дала свідчення");
    expect(presence.marks).toEqual([]);
  });

  it("does not show quest action buttons after today's quest is already completed", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const ctx = {
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
    const adventureService = {
      getAdventureOfferForTelegramUser: () =>
        Promise.resolve({
          state: "already-completed",
          character
        })
    } as unknown as AdventureService;

    await sendAdventure(ctx, adventureService, "reply");

    expect(replies).toHaveLength(1);
    expect(replies[0]?.text).toContain("Справу на найближчий час уже закрито");
    expect(replies[0]?.text).toContain("/hero");
    expect(replies[0]?.text).not.toContain("що робимо");
    expect(replies[0]?.options).toMatchObject({
      parse_mode: "HTML"
    });
    expect(replies[0]?.options).toHaveProperty("reply_markup");
  });

  it("marks the quest table before showing already-completed adventure choice", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const presence = new CapturingPresenceService({
      locationId: PRESENCE_LOCATION_KORCHMA_HALL,
      insideKorchma: true
    });
    const ctx = {
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
    const adventureService = {
      getAdventureOfferForTelegramUser: () =>
        Promise.resolve({
          state: "already-completed",
          character
        })
    } as unknown as AdventureService;

    await sendAdventure(ctx, adventureService, "reply", {
      cellarErrand: {
        getForTelegramUser: () => Promise.resolve({ state: "no-character" }),
        complete: () => Promise.resolve({ state: "no-character" })
      },
      presence,
      fallbackToCellar: false,
      requireKorchmaInterior: true
    });

    expect(replies[0]?.text).toContain("Справу на найближчий час уже закрито");
    expect(presence.marks).toHaveLength(1);
    expect(presence.marks[0]).toMatchObject({
      locationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
      currentRaidId: null,
      currentAdventureId: PRESENCE_ADVENTURE_CHOICE
    });
  });

  it("falls through to cellar errands from /quest after daily quest and fight are spent", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const presence = new CapturingPresenceService();
    const ctx = {
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
    const adventureService = {
      getAdventureOfferForTelegramUser: () =>
        Promise.resolve({
          state: "already-completed",
          character
        })
    } as unknown as AdventureService;
    const cellarErrand = {
      getForTelegramUser: () =>
        Promise.resolve({
          state: "ready",
          character
        }),
      complete: () => Promise.resolve({ state: "no-character" })
    };

    await sendAdventure(ctx, adventureService, "reply", {
      cellarErrand,
      presence,
      fallbackToCellar: true
    });

    expect(replies).toHaveLength(1);
    expect(replies[0]?.text).toContain("🐭 Льохова справа");
    expect(replies[0]?.options).toHaveProperty("reply_markup");
    expect(presence.marks[0]).toMatchObject({
      locationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
      currentRaidId: null,
      currentAdventureId: PRESENCE_ADVENTURE_CHOICE
    });
    expect(presence.marks[presence.marks.length - 1]).toMatchObject({
      locationId: PRESENCE_LOCATION_KORCHMA_CELLAR,
      currentRaidId: null,
      currentAdventureId: PRESENCE_ADVENTURE_CELLAR_MOUSE_ERRAND
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

const offer = {
  localDate: "2026-06-12",
  periodToken: "period93",
  expiresAt: new Date("2026-06-12T11:23:00.000Z"),
  choices: [
    {
      id: "stew" as const,
      title: "Казанок репетирує оперу",
      hook: "Юшка вимагає райдер.",
      client: "Кухар"
    },
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

function getReplyCallbacks(options: unknown): string[] {
  return ((options as { reply_markup?: { inline_keyboard?: Array<Array<{ callback_data: string }>> } })
    .reply_markup?.inline_keyboard ?? [])
    .flat()
    .map((button) => button.callback_data);
}
