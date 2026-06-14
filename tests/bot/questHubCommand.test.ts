import type { Context } from "grammy";
import { describe, expect, it } from "vitest";
import { makePlaceCallbackData } from "../../src/bot/callbacks/placeCallbackData";
import { makeQuestCallbackData } from "../../src/bot/callbacks/questCallbackData";
import { sendQuestHub } from "../../src/bot/commands/questHubCommand";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";
import type { AdventureService } from "../../src/services/adventureService";
import type { CellarErrandService } from "../../src/services/cellarErrandService";
import type { FightService } from "../../src/services/fightService";
import type { HuntService } from "../../src/services/huntService";
import type { TavernRaidService } from "../../src/services/tavernRaidService";
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

  it("shows the quest hub inside the korchma and marks the quest table", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const presence = new CapturingPresenceService({
      locationId: PRESENCE_LOCATION_KORCHMA_HALL,
      insideKorchma: true
    });

    await sendQuestHub(makeContext(replies), servicesWith({ presence }), "reply");

    expect(replies[0]?.text).toContain("📋 Стіл зі справами");
    expect(replies[0]?.text).toContain("<b>Мандрівник</b> · <i>Пересічні Пригодники</i>");
    expect(replies[0]?.text).toContain("🌯 Підозріла шаурма — готова до допиту.");
    expect(replies[0]?.text).toContain("⚔️ Сутичка з підозрілим монстром — можна починати.");
    expect(replies[0]?.text).toContain("🏹 Дошка полювання — контракт на Скелет-вахтер печаток.");
    expect(replies[0]?.text).not.toContain("Мімік-шаурма");
    expect(replies[0]?.text).toContain("🧹 Підвальна справа — миша знову приймає аргументи.");
    expect(replies[0]?.options).toMatchObject({
      reply_markup: {
        inline_keyboard: [
          [{ text: "🌯 До шаурми", callback_data: makeQuestCallbackData("adventure") }],
          [{ text: "⚔️ До сутички", callback_data: makeQuestCallbackData("fight") }],
          [{ text: "🏹 До дошки", callback_data: makeQuestCallbackData("hunt") }],
          [{ text: "🧹 У підвал", callback_data: makeQuestCallbackData("cellar") }],
          [{ text: "🍺 До зали", callback_data: makePlaceCallbackData("hall") }]
        ]
      }
    });
    expect(presence.marks[0]).toMatchObject({
      locationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
      currentRaidId: null,
      currentAdventureId: null
    });
  });

  it("points to cellar fallback when daily shawarma and fight are already spent", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];

    await sendQuestHub(
      makeContext(replies),
      servicesWith({
        adventure: {
          getMimicShawarmaForTelegramUser: () =>
            Promise.resolve({
              state: "already-completed",
              character,
              fightAvailable: false
            }),
          completeMimicShawarma: () => Promise.resolve({ state: "no-character" })
        } as unknown as AdventureService,
        fight: {
          getMimicShawarmaForTelegramUser: () =>
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

    expect(replies[0]?.text).toContain("🌯 Підозріла шаурма — сьогодні вже дала свідчення.");
    expect(replies[0]?.text).toContain(
      "⚔️ Сутичка з підозрілим монстром — сьогодні вже зараховано."
    );
    const buttons = (
      replies[0]?.options as {
        reply_markup: { inline_keyboard: Array<Array<{ text: string }>> };
      }
    ).reply_markup.inline_keyboard.flat();
    expect(buttons.map((button) => button.text)).toEqual([
      "🏹 До дошки",
      "🧹 У підвал",
      "🍺 До зали"
    ]);
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

const huntContract = {
  localPeriodId: "2026-06-14T08",
  contractToken: "abc1234",
  monster: {
    id: "monster.stamp-doorkeeper-skeleton",
    name: "Скелет-вахтер печаток",
    description: "Не пускає навіть смерть без пропуску.",
    level: 2,
    tags: ["undead"]
  },
  startFlavor: null
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
  fight?: FightService;
  hunt?: HuntService;
  presence?: CapturingPresenceService;
  tavernRaid?: TavernRaidService;
} = {}) {
  return {
    adventure:
      overrides.adventure ??
      ({
        getMimicShawarmaForTelegramUser: () =>
          Promise.resolve({
            state: "ready",
            character
          }),
        completeMimicShawarma: () => Promise.resolve({ state: "no-character" })
      } as unknown as AdventureService),
    cellarErrand:
      overrides.cellarErrand ??
      ({
        getForTelegramUser: () =>
          Promise.resolve({
            state: "ready",
            character
          }),
        complete: () => Promise.resolve({ state: "no-character" })
      } as unknown as CellarErrandService),
    fight:
      overrides.fight ??
      ({
        getMimicShawarmaForTelegramUser: () =>
          Promise.resolve({
            state: "ready",
            character
          }),
        completeMimicShawarma: () => Promise.resolve({ state: "no-character" })
      } as unknown as FightService),
    hunt:
      overrides.hunt ??
      ({
        getHuntBoardForTelegramUser: () =>
          Promise.resolve({
            state: "ready",
            character,
            contract: huntContract
          }),
        completeHuntContract: () => Promise.resolve({ state: "no-character" })
      } as unknown as HuntService),
    presence: overrides.presence ?? new CapturingPresenceService(),
    tavernRaid: overrides.tavernRaid
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
