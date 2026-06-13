import type { Context } from "grammy";
import { describe, expect, it } from "vitest";
import { sendAdventure } from "../../src/bot/commands/adventureCommand";
import { makePlaceCallbackData } from "../../src/bot/callbacks/placeCallbackData";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";
import type { AdventureService } from "../../src/services/adventureService";
import {
  PRESENCE_ADVENTURE_CELLAR_MOUSE_ERRAND,
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
      getMimicShawarmaForTelegramUser: () =>
        Promise.resolve({
          state: "ready",
          character
        }),
      completeMimicShawarma: () => Promise.resolve({ state: "no-character" })
    } as unknown as AdventureService;

    await sendAdventure(ctx, adventureService, "reply", {
      cellarErrand: {
        getForTelegramUser: () => Promise.resolve({ state: "no-character" }),
        complete: () => Promise.resolve({ state: "no-character" })
      },
      presence,
      fallbackToCellar: true,
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
      getMimicShawarmaForTelegramUser: () =>
        Promise.resolve({
          state: "ready",
          character
        }),
      completeMimicShawarma: () => Promise.resolve({ state: "no-character" })
    } as unknown as AdventureService;

    await sendAdventure(ctx, adventureService, "reply", {
      cellarErrand: {
        getForTelegramUser: () => Promise.resolve({ state: "no-character" }),
        complete: () => Promise.resolve({ state: "no-character" })
      },
      presence,
      fallbackToCellar: true,
      requireKorchmaInterior: true
    });

    expect(replies[0]?.text).toContain("🌯 Підозріла шаурма");
    expect(replies[0]?.options).toHaveProperty("reply_markup");
    expect(presence.marks[0]).toMatchObject({
      locationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE
    });
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
      getMimicShawarmaForTelegramUser: () =>
        Promise.resolve({
          state: "already-completed",
          character,
          fightAvailable: true
        })
    } as unknown as AdventureService;

    await sendAdventure(ctx, adventureService, "reply");

    expect(replies).toHaveLength(1);
    expect(replies[0]?.text).toContain("Шаурма вже дала свідчення");
    expect(replies[0]?.text).toContain("/fight");
    expect(replies[0]?.text).not.toContain("що робимо");
    expect(replies[0]?.options).toMatchObject({
      parse_mode: "HTML"
    });
    expect(replies[0]?.options).toHaveProperty("reply_markup");
  });

  it("marks the quest table before showing already-completed shawarma with fight available", async () => {
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
      getMimicShawarmaForTelegramUser: () =>
        Promise.resolve({
          state: "already-completed",
          character,
          fightAvailable: true
        })
    } as unknown as AdventureService;

    await sendAdventure(ctx, adventureService, "reply", {
      cellarErrand: {
        getForTelegramUser: () => Promise.resolve({ state: "no-character" }),
        complete: () => Promise.resolve({ state: "no-character" })
      },
      presence,
      fallbackToCellar: true,
      requireKorchmaInterior: true
    });

    expect(replies[0]?.text).toContain("Шаурма вже дала свідчення");
    expect(presence.marks).toHaveLength(1);
    expect(presence.marks[0]).toMatchObject({
      locationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
      currentRaidId: null,
      currentAdventureId: PRESENCE_ADVENTURE_MIMIC_SHAWARMA
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
      getMimicShawarmaForTelegramUser: () =>
        Promise.resolve({
          state: "already-completed",
          character,
          fightAvailable: false
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
    expect(replies[0]?.text).toContain("🐭 Підвальна справа");
    expect(replies[0]?.options).toHaveProperty("reply_markup");
    expect(presence.marks[0]).toMatchObject({
      locationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
      currentRaidId: null,
      currentAdventureId: PRESENCE_ADVENTURE_MIMIC_SHAWARMA
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
