import type { Context } from "grammy";
import { describe, expect, it } from "vitest";
import { sendFight } from "../../src/bot/commands/fightCommand";
import { makePlaceCallbackData } from "../../src/bot/callbacks/placeCallbackData";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";
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
      getMimicShawarmaForTelegramUser: () =>
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
      getMimicShawarmaForTelegramUser: () =>
        Promise.resolve({
          state: "ready",
          character
        })
    } as unknown as FightService;

    await sendFight(makeContext(replies), fightService, "reply", {
      presence,
      requireKorchmaInterior: true
    });

    expect(replies[0]?.text).toContain("⚔️ Сутичка з Міміком-шаурмою");
    expect(presence.marks[0]).toMatchObject({
      locationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
      currentRaidId: null,
      currentAdventureId: PRESENCE_ADVENTURE_MIMIC_FIGHT
    });
  });

  it("does not show fight action buttons after today's fight is already completed", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const fightService = {
      getMimicShawarmaForTelegramUser: () =>
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
  title: "Пересічні Герої",
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
