import type { Context } from "grammy";
import { describe, expect, it } from "vitest";
import { makePlaceCallbackData } from "../../src/bot/callbacks/placeCallbackData";
import { makeQuestCallbackData } from "../../src/bot/callbacks/questCallbackData";
import { makeBestiaryListCallbackData } from "../../src/bot/callbacks/bestiaryCallbackData";
import { sendQuestHub } from "../../src/bot/commands/questHubCommand";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";
import type { AdventureService } from "../../src/services/adventureService";
import type { CellarErrandService } from "../../src/services/cellarErrandService";
import type { CellarGrownupQuestService } from "../../src/services/cellarGrownupQuestService";
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
    expect(replies[0]?.text).toContain("🌯 <i>Підозріла шаурма</i> — перша підозра для 1-2 рівнів.");
    expect(replies[0]?.text).toContain(
      "📋 <i>Тринадцять дрібних проблем</i> — 0/13 проблем у журналі."
    );
    expect(replies[0]?.text).toContain("🏹 <i>Дошка полювання</i> — контракт на Скелет-вахтер печаток.");
    expect(replies[0]?.text).not.toContain("Мімік-шаурма");
    expect(replies[0]?.text).toContain("🧹 <i>Підвальна справа</i> — миша приймає аргументи.");
    expect(replies[0]?.options).toMatchObject({
      reply_markup: {
        inline_keyboard: [
          [{ text: "🧾 До проблем", callback_data: makeQuestCallbackData("fight") }],
          [{ text: "🏹 До дошки", callback_data: makeQuestCallbackData("hunt") }],
          [{ text: "🧹 У підвал", callback_data: makeQuestCallbackData("cellar") }],
          [{ text: "📖 Бестіарій", callback_data: makeBestiaryListCallbackData(0) }],
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

  it("keeps cellar and hunt unavailable on level one", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const levelOneCharacter = characterAtLevel(1);

    await sendQuestHub(
      makeContext(replies),
      servicesWith({
        adventure: readyAdventureService(levelOneCharacter),
        fight: readyFightService(levelOneCharacter),
        hunt: readyHuntService(levelOneCharacter),
        cellarErrand: readyCellarService(levelOneCharacter)
      }),
      "reply"
    );

    expect(replies[0]?.text).toContain("🏹 <i>Дошка полювання</i> — відкриється з 3 рівня.");
    expect(replies[0]?.text).toContain("🧹 <i>Підвальна справа</i> — відкриється з 2 рівня.");
    const buttons = (
      replies[0]?.options as {
        reply_markup: { inline_keyboard: Array<Array<{ text: string }>> };
      }
    ).reply_markup.inline_keyboard.flat();
    expect(buttons.map((button) => button.text)).toEqual([
      "🌯 До шаурми",
      "⚔️ До сутички",
      "🍺 До зали"
    ]);
  });

  it("opens cellar from level two but keeps hunt unavailable until level three", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const levelTwoCharacter = characterAtLevel(2);

    await sendQuestHub(
      makeContext(replies),
      servicesWith({
        adventure: readyAdventureService(levelTwoCharacter),
        fight: readyFightService(levelTwoCharacter),
        hunt: readyHuntService(levelTwoCharacter),
        cellarErrand: readyCellarService(levelTwoCharacter)
      }),
      "reply"
    );

    expect(replies[0]?.text).toContain("🏹 <i>Дошка полювання</i> — відкриється з 3 рівня.");
    expect(replies[0]?.text).toContain("🧹 <i>Підвальна справа</i> — миша приймає аргументи.");
    const buttons = (
      replies[0]?.options as {
        reply_markup: { inline_keyboard: Array<Array<{ text: string }>> };
      }
    ).reply_markup.inline_keyboard.flat();
    expect(buttons.map((button) => button.text)).toEqual([
      "🌯 До шаурми",
      "⚔️ До сутички",
      "🧹 У підвал",
      "🍺 До зали"
    ]);
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

    expect(replies[0]?.text).toContain("🌯 <i>Підозріла шаурма</i> — сьогодні вже дала свідчення.");
    expect(replies[0]?.text).toContain(
      "⚔️ <i>Сутичка з невідомим монстром</i> — сьогодні вже зараховано."
    );
    const buttons = (
      replies[0]?.options as {
        reply_markup: { inline_keyboard: Array<Array<{ text: string }>> };
      }
    ).reply_markup.inline_keyboard.flat();
    expect(buttons.map((button) => button.text)).toEqual([
      "🏹 До дошки",
      "🧹 У підвал",
      "📖 Бестіарій",
      "🍺 До зали"
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
        hunt: {
          getHuntBoardForTelegramUser: () =>
            Promise.resolve({
              state: "already-completed",
              character: grownCharacter,
              contract: huntContract
            }),
          completeHuntContract: () => Promise.resolve({ state: "no-character" })
        } as unknown as HuntService,
        cellarErrand: readyCellarService(grownCharacter)
      }),
      "reply"
    );

    expect(replies[0]?.text).toContain(
      "📋 <i>Тринадцять дрібних проблем</i> — 0/13 проблем у журналі."
    );
    expect(replies[0]?.text).toContain(
      "🧹 <i>Підвальна справа</i> — новачкова справа до 3 рівня."
    );
    expect(replies[0]?.text).toContain(
      "🐭 <i>Справа не до миші</i> — у підвалі є інша справа для старших пригодників."
    );
    expect(replies[0]?.text).toContain("Оберіть справу, поки вона не обрала вас.");
    const buttons = (
      replies[0]?.options as {
        reply_markup: { inline_keyboard: Array<Array<{ text: string }>> };
      }
    ).reply_markup.inline_keyboard.flat();
    expect(buttons.map((button) => button.text)).toEqual([
      "🧾 До проблем",
      "🧹 У підвал",
      "📖 Бестіарій",
      "🍺 До зали"
    ]);
  });

  it("shows completed grownup cellar state without sending players back to cellar", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const grownCharacter = characterAtLevel(4);

    await sendQuestHub(
      makeContext(replies),
      servicesWith({
        adventure: readyAdventureService(grownCharacter),
        fight: readyFightService(grownCharacter),
        hunt: readyHuntService(grownCharacter),
        cellarErrand: readyCellarService(grownCharacter),
        cellarGrownup: completedCellarGrownupService(grownCharacter)
      }),
      "reply"
    );

    expect(replies[0]?.text).toContain(
      "🐭 <i>Справа не до миші</i> — дорослу підвальну справу вже закрито; пляшка стоїть у журналі й тихо булькає."
    );
    expect(replies[0]?.text).not.toContain(
      "🐭 <i>Справа не до миші</i> — у підвалі є інша справа для старших пригодників."
    );
    const buttons = (
      replies[0]?.options as {
        reply_markup: { inline_keyboard: Array<Array<{ text: string }>> };
      }
    ).reply_markup.inline_keyboard.flat();
    expect(buttons.map((button) => button.text)).toEqual([
      "🧾 До проблем",
      "🏹 До дошки",
      "📖 Бестіарій",
      "🍺 До зали"
    ]);
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
        hunt: readyHuntService(exhaustedCharacter),
        fight: {
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
      "⚔️ <i>Сутичка з невідомим монстром</i> — герой ще не тримається на ногах, спершу /hero."
    );
    expect(replies[0]?.text).toContain("HP 0? Спершу /hero, тоді /fight. Справи почекають.");
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
        hunt: readyHuntService(recoveredFightCharacter),
        fight: {
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

    expect(replies[0]?.text).toContain("<b>Мандрівник</b> · <i>Пересічні Пригодники</i>");
    expect(replies[0]?.text).toContain(
      "📋 <i>Тринадцять дрібних проблем</i> — 0/13 проблем у журналі."
    );
    expect(replies[0]?.text).not.toContain("HP 0? Спершу /hero, тоді /fight. Справи почекають.");
    const buttons = (
      replies[0]?.options as {
        reply_markup: { inline_keyboard: Array<Array<{ text: string }>> };
      }
    ).reply_markup.inline_keyboard.flat();
    expect(buttons.map((button) => button.text)).toContain("🧾 До проблем");
  });

  it("keeps terminal persistent fights recoverable from the quest hub", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const grownCharacter = characterAtLevel(4);

    await sendQuestHub(
      makeContext(replies),
      servicesWith({
        adventure: readyAdventureService(grownCharacter),
        fight: {
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
        hunt: readyHuntService(grownCharacter),
        cellarErrand: readyCellarService(grownCharacter)
      }),
      "reply"
    );

    expect(replies[0]?.text).toContain(
      "📋 <i>Тринадцять дрібних проблем</i> — 14/13 проблем у журналі, перший список закрито; далі практика."
    );
    const buttons = (
      replies[0]?.options as {
        reply_markup: { inline_keyboard: Array<Array<{ text: string }>> };
      }
    ).reply_markup.inline_keyboard.flat();
    expect(buttons.map((button) => button.text)).toContain("🧾 До проблем");
  });

  it("hides starter shawarma and offers persistent fight at level three", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const grownCharacter = characterAtLevel(3);

    await sendQuestHub(
      makeContext(replies),
      servicesWith({
        adventure: readyAdventureService(grownCharacter),
        fight: readyFightService(grownCharacter),
        hunt: readyHuntService(grownCharacter),
        cellarErrand: readyCellarService(grownCharacter)
      }),
      "reply"
    );

    expect(replies[0]?.text).toContain("🌯 <i>Підозріла шаурма</i> — перша підозра для 1-2 рівнів.");
    expect(replies[0]?.text).toContain(
      "📋 <i>Тринадцять дрібних проблем</i> — 0/13 проблем у журналі."
    );
    expect(replies[0]?.text).toContain("🧹 <i>Підвальна справа</i> — миша приймає аргументи.");
    const buttons = (
      replies[0]?.options as {
        reply_markup: { inline_keyboard: Array<Array<{ text: string }>> };
      }
    ).reply_markup.inline_keyboard.flat();
    expect(buttons.map((button) => button.text)).toEqual([
      "🧾 До проблем",
      "🏹 До дошки",
      "🧹 У підвал",
      "📖 Бестіарій",
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

function characterAtLevel(level: 1 | 2 | 3 | 4): CharacterSummary {
  const xpByLevel = {
    1: 0,
    2: 10,
    3: 25,
    4: 45
  } satisfies Record<1 | 2 | 3 | 4, number>;
  const nextByLevel = {
    1: 10,
    2: 25,
    3: 45,
    4: 70
  } satisfies Record<1 | 2 | 3 | 4, number>;

  return {
    ...character,
    level,
    xp: xpByLevel[level],
    nextLevelXp: nextByLevel[level],
    xpToNextLevel: nextByLevel[level] - xpByLevel[level]
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
  cellarGrownup?: CellarGrownupQuestService;
  fight?: FightService;
  hunt?: HuntService;
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
    fight:
      overrides.fight ??
      readyFightService(character),
    hunt:
      overrides.hunt ??
      readyHuntService(character),
    presence: overrides.presence ?? new CapturingPresenceService(),
    tavernRaid: overrides.tavernRaid
  };
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

function readyAdventureService(summary: CharacterSummary): AdventureService {
  return {
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
  } as unknown as AdventureService;
}

function readyFightService(summary: CharacterSummary): FightService {
  return {
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
    title: "Тринадцять дрібних проблем" as const,
    wins,
    target: 13,
    completed,
    rewardClaimed: completed
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
                maxLevel: 3
              }
          : {
              state: "ready",
              character: summary
            }
      ),
    complete: () => Promise.resolve({ state: "no-character" })
  } as unknown as CellarErrandService;
}

function readyHuntService(summary: CharacterSummary): HuntService {
  return {
    getHuntBoardForTelegramUser: () =>
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
              contract: huntContract
            }
      ),
    completeHuntContract: () => Promise.resolve({ state: "no-character" })
  } as unknown as HuntService;
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
