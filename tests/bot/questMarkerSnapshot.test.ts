import { afterEach, describe, expect, it, vi } from "vitest";
import type { BotServices } from "../../src/bot/botServices";
import {
  buildEnterKorchmaKeyboard,
  buildKorchmaHallKeyboard,
  buildKorchmaYardKeyboard
} from "../../src/bot/keyboards/tavernKeyboard";
import { buildQuestMarkerSnapshotForTelegramUser } from "../../src/bot/questMarkerSnapshot";

describe("quest marker snapshot", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("keeps cellar markers when other quest lookups have no character state", async () => {
    const snapshot = await buildQuestMarkerSnapshotForTelegramUser(42n, {
      adventure: {
        getAdventureOfferForTelegramUser: () => Promise.resolve({ state: "no-character" }),
        getMimicShawarmaForTelegramUser: () => Promise.resolve({ state: "no-character" })
      },
      fight: {
        getFightOverviewForTelegramUser: () => Promise.resolve({ state: "no-character" }),
        getProblemQuestProgressForTelegramUser: () => Promise.resolve({ state: "no-character" })
      },
      yeger: {
        getForTelegramUser: () => Promise.resolve({ state: "no-character" })
      },
      cellarErrand: {
        getForTelegramUser: () => Promise.resolve({ state: "ready", character })
      },
      dailyKorchmaRound: {
        getExistingForTelegramUser: () => Promise.resolve({ state: "no-character" })
      }
    } as unknown as Pick<
      BotServices,
      "adventure" | "cellarErrand" | "cellarGrownup" | "dailyKorchmaRound" | "fight" | "yeger"
    >);

    expect(snapshot?.cellar?.state).toBe("ready");
    expect(flatInlineButtonTexts(buildKorchmaHallKeyboard({ questMarkers: snapshot }))).toContain(
      "🐭 Льох ⚠️"
    );
    expect(flatInlineButtonTexts(buildKorchmaHallKeyboard({ questMarkers: snapshot }))).toContain(
      "📋 Стіл зі справами"
    );
    expect(flatInlineButtonTexts(buildKorchmaHallKeyboard({ questMarkers: snapshot }))).not.toContain(
      "📋 Стіл зі справами ⚠️"
    );
  });

  it("does not mark the hall or enter button when the only cellar errand is on cooldown", async () => {
    const now = new Date("2026-07-07T14:00:00.000Z");
    const snapshot = await buildQuestMarkerSnapshotForTelegramUser(42n, {
      adventure: {
        getAdventureOfferForTelegramUser: () => Promise.resolve({ state: "no-character" }),
        getMimicShawarmaForTelegramUser: () => Promise.resolve({ state: "no-character" })
      },
      fight: {
        getFightOverviewForTelegramUser: () => Promise.resolve({ state: "no-character" }),
        getProblemQuestProgressForTelegramUser: () => Promise.resolve({ state: "no-character" })
      },
      yeger: {
        getForTelegramUser: () => Promise.resolve({ state: "no-character" })
      },
      cellarErrand: {
        getForTelegramUser: () =>
          Promise.resolve({
            state: "on-cooldown",
            character,
            now,
            availableAt: new Date("2026-07-07T14:03:00.000Z")
          })
      },
      dailyKorchmaRound: {
        getExistingForTelegramUser: () => Promise.resolve({ state: "no-character" })
      }
    } as unknown as Pick<
      BotServices,
      "adventure" | "cellarErrand" | "cellarGrownup" | "dailyKorchmaRound" | "fight" | "yeger"
    >);

    expect(flatInlineButtonTexts(buildKorchmaHallKeyboard({ questMarkers: snapshot }))).toContain(
      "🐭 Льох"
    );
    expect(flatInlineButtonTexts(buildKorchmaHallKeyboard({ questMarkers: snapshot }))).not.toContain(
      "🐭 Льох ⚠️"
    );
    expect(flatInlineButtonTexts(buildEnterKorchmaKeyboard({ questMarkers: snapshot }))).toEqual([
      "🚪 Зайти в корчму"
    ]);
  });

  it("marks Charkokovalnia access from the quest marker snapshot", async () => {
    const snapshot = await buildQuestMarkerSnapshotForTelegramUser(42n, {
      adventure: {
        getAdventureOfferForTelegramUser: () => Promise.resolve({ state: "no-character" }),
        getMimicShawarmaForTelegramUser: () => Promise.resolve({ state: "no-character" })
      },
      fight: {
        getFightOverviewForTelegramUser: () => Promise.resolve({ state: "no-character" }),
        getProblemQuestProgressForTelegramUser: () => Promise.resolve({ state: "no-character" })
      },
      yeger: {
        getForTelegramUser: () => Promise.resolve({ state: "no-character" })
      },
      cellarErrand: {
        getForTelegramUser: () => Promise.resolve({ state: "no-character" })
      },
      dailyKorchmaRound: {
        getExistingForTelegramUser: () => Promise.resolve({ state: "no-character" })
      },
      itemUpgrades: {
        getUnlockQuestForTelegramUser: () =>
          Promise.resolve({
            state: "unlock-required",
            character,
            fieldKitQuantity: 1,
            rewardXp: 13
          })
      }
    } as unknown as Pick<
      BotServices,
      "adventure" | "cellarErrand" | "cellarGrownup" | "dailyKorchmaRound" | "fight" | "yeger"
    > & Partial<Pick<BotServices, "itemUpgrades">>);

    expect(flatInlineButtonTexts(buildKorchmaHallKeyboard({ questMarkers: snapshot }))).toContain(
      "📋 Стіл зі справами ✅"
    );
    expect(flatInlineButtonTexts(buildKorchmaHallKeyboard({ questMarkers: snapshot }))).toContain(
      "🚪 Надвір ✅"
    );
    expect(flatInlineButtonTexts(buildEnterKorchmaKeyboard({ questMarkers: snapshot }))).toEqual([
      "🚪 Зайти в корчму ✅"
    ]);
    expect(flatInlineButtonTexts(buildKorchmaYardKeyboard({ questMarkers: snapshot }))).toContain(
      "✨ Чароковальня ✅"
    );
  });

  it("keeps available markers when an optional quest lookup times out", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const snapshot = await buildQuestMarkerSnapshotForTelegramUser(42n, {
      adventure: {
        getAdventureOfferForTelegramUser: () => Promise.resolve({ state: "no-character" }),
        getMimicShawarmaForTelegramUser: () => Promise.resolve({ state: "no-character" })
      },
      fight: {
        getFightOverviewForTelegramUser: () => Promise.resolve({ state: "no-character" }),
        getProblemQuestProgressForTelegramUser: () => Promise.resolve({ state: "no-character" })
      },
      yeger: {
        getForTelegramUser: () => Promise.reject(new Error("P1008"))
      },
      cellarErrand: {
        getForTelegramUser: () => Promise.resolve({ state: "ready", character })
      },
      dailyKorchmaRound: {
        getExistingForTelegramUser: () => Promise.resolve({ state: "no-character" })
      },
      itemUpgrades: {
        getUnlockQuestForTelegramUser: () => Promise.reject(new Error("P1008"))
      }
    } as unknown as Pick<
      BotServices,
      "adventure" | "cellarErrand" | "cellarGrownup" | "dailyKorchmaRound" | "fight" | "yeger"
    > & Partial<Pick<BotServices, "itemUpgrades">>);

    expect(snapshot?.cellar?.state).toBe("ready");
    expect(snapshot?.yeger).toBeUndefined();
    expect(snapshot?.itemUpgrades).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("quest marker yeger"), expect.any(Error));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("quest marker item upgrades"), expect.any(Error));
  });

  it("prefers lightweight marker-only lookups for expensive quest marker sources", async () => {
    const yegerFullLookup = vi.fn(() => Promise.resolve({ state: "no-character" }));
    const itemUpgradeFullLookup = vi.fn(() => Promise.resolve({ state: "no-character" }));

    const snapshot = await buildQuestMarkerSnapshotForTelegramUser(42n, {
      adventure: {
        getAdventureOfferForTelegramUser: () => Promise.resolve({ state: "no-character" }),
        getMimicShawarmaForTelegramUser: () => Promise.resolve({ state: "no-character" })
      },
      fight: {
        getFightOverviewForTelegramUser: () => Promise.resolve({ state: "no-character" }),
        getProblemQuestProgressForTelegramUser: () => Promise.resolve({ state: "no-character" })
      },
      yeger: {
        getForTelegramUser: yegerFullLookup,
        getQuestMarkerForTelegramUser: () =>
          Promise.resolve({
            state: "offered",
            character,
            progress: { wins: 0, target: 5, stageId: "first" }
          })
      },
      cellarErrand: {
        getForTelegramUser: () => Promise.resolve({ state: "no-character" })
      },
      dailyKorchmaRound: {
        getExistingForTelegramUser: () => Promise.resolve({ state: "no-character" })
      },
      itemUpgrades: {
        getUnlockQuestForTelegramUser: itemUpgradeFullLookup,
        getQuestMarkerForTelegramUser: () =>
          Promise.resolve({
            state: "unlock-required",
            character,
            fieldKitQuantity: 1,
            rewardXp: 13
          })
      }
    } as unknown as Pick<
      BotServices,
      "adventure" | "cellarErrand" | "cellarGrownup" | "dailyKorchmaRound" | "fight" | "yeger"
    > & Partial<Pick<BotServices, "itemUpgrades">>);

    expect(flatInlineButtonTexts(buildKorchmaHallKeyboard({ questMarkers: snapshot }))).toContain(
      "📋 Стіл зі справами ✅"
    );
    expect(snapshot?.yeger?.state).toBe("offered");
    expect(yegerFullLookup).not.toHaveBeenCalled();
    expect(itemUpgradeFullLookup).not.toHaveBeenCalled();
  });

  it("collapses the primary fan-out to eight attributed sources while preserving grouped fail-soft results", async () => {
    vi.stubEnv("KVESTARNIA_PERF_SAMPLE_RATE", "1");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const adventureOffer = vi.fn(() => Promise.resolve({ state: "no-character" }));
    const starterAdventure = vi.fn(() => Promise.resolve({ state: "no-character" }));
    const fightOverview = vi.fn(() => Promise.resolve({ state: "no-character" }));
    const problemQuest = vi.fn(() => Promise.resolve({ state: "no-character" }));
    const adventureSnapshot = vi.fn(() => Promise.resolve({
      adventure: { status: "fulfilled" as const, value: { state: "ready" as const, character, offer: {} } },
      starterAdventure: { status: "rejected" as const, reason: new Error("P1008") }
    }));
    const fightSnapshot = vi.fn(() => Promise.resolve({
      fight: { status: "fulfilled" as const, value: { state: "level-retired" as const, character, maxLevel: 2 } },
      problemQuest: {
        status: "fulfilled" as const,
        value: { state: "ready" as const, character, progress: { wins: 0, target: 13 }, archive: [] }
      }
    }));

    const snapshot = await buildQuestMarkerSnapshotForTelegramUser(42n, {
      adventure: {
        getQuestMarkerSnapshotForTelegramUser: adventureSnapshot,
        getAdventureOfferForTelegramUser: adventureOffer,
        getMimicShawarmaForTelegramUser: starterAdventure
      },
      fight: {
        getQuestMarkerSnapshotForTelegramUser: fightSnapshot,
        getFightOverviewForTelegramUser: fightOverview,
        getProblemQuestProgressForTelegramUser: problemQuest
      },
      firstKorchmaQuest: {
        getForTelegramUser: () => Promise.resolve({ state: "no-character" })
      },
      yeger: {
        getQuestMarkerForTelegramUser: () => Promise.resolve({ state: "no-character" }),
        getForTelegramUser: () => Promise.resolve({ state: "no-character" })
      },
      cellarErrand: {
        getForTelegramUser: () => Promise.resolve({ state: "no-character" })
      },
      barrelBeerTutorial: {
        getForTelegramUser: () => Promise.resolve({ state: "no-character" })
      },
      dailyKorchmaRound: {
        getExistingForTelegramUser: () => Promise.resolve({ state: "no-character" })
      },
      itemUpgrades: {
        getQuestMarkerForTelegramUser: () => Promise.resolve({ state: "no-character" }),
        getUnlockQuestForTelegramUser: () => Promise.resolve({ state: "no-character" })
      }
    } as unknown as BotServices);

    expect(snapshot?.adventure?.state).toBe("ready");
    expect(snapshot?.starterAdventure).toBeUndefined();
    expect(adventureSnapshot).toHaveBeenCalledTimes(1);
    expect(fightSnapshot).toHaveBeenCalledTimes(1);
    expect(adventureOffer).not.toHaveBeenCalled();
    expect(starterAdventure).not.toHaveBeenCalled();
    expect(fightOverview).not.toHaveBeenCalled();
    expect(problemQuest).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("quest marker starter adventure"), expect.any(Error));
    expect(info).toHaveBeenCalledWith("Kvestarnia sampled perf timing", expect.objectContaining({
      route: "main-menu.quest-markers",
      questMarkerSourceCount: 8
    }));
    const payload = info.mock.calls[0]?.[1] as Record<string, unknown> | undefined;
    expect(payload?.questMarkerSlowestSource).toMatch(
      /^(adventure|fight|first-korchma|yeger|cellar|barrel-beer|daily-korchma|item-upgrades)$/
    );
    expect(payload?.questMarkerSlowestSourceMs).toEqual(expect.any(Number));
  });
});

function flatInlineButtonTexts(keyboard: { inline_keyboard: { text: string }[][] }): string[] {
  return keyboard.inline_keyboard.flat().map((button) => button.text);
}

const character = {
  name: "Shannar de Kassal",
  pronoun: "she" as const,
  pronounLabel: "вона",
  path: "boundary",
  raceId: "race.bisyny",
  raceName: "Бісини",
  classId: "class.priest",
  className: "Жрець",
  title: "Тлумач Підозрілих Благословень",
  level: 2,
  xp: 13,
  nextLevelXp: 42,
  xpToNextLevel: 29,
  gold: 5,
  hpCurrent: 20,
  hpMax: 20,
  manaCurrent: 16,
  manaMax: 16,
  stats: {
    strength: 7,
    dexterity: 7,
    intelligence: 8,
    charisma: 9,
    luck: 5
  },
  levelBonus: {
    hpMax: 0,
    manaMax: 0,
    primaryStat: {
      stat: "charisma" as const,
      bonus: 0
    }
  }
};
