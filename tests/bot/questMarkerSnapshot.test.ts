import { describe, expect, it } from "vitest";
import type { BotServices } from "../../src/bot/botServices";
import {
  buildEnterKorchmaKeyboard,
  buildKorchmaHallKeyboard,
  buildKorchmaYardKeyboard
} from "../../src/bot/keyboards/tavernKeyboard";
import { buildQuestMarkerSnapshotForTelegramUser } from "../../src/bot/questMarkerSnapshot";

describe("quest marker snapshot", () => {
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
      "📋 Стіл зі справами ⚠️"
    );
    expect(flatInlineButtonTexts(buildEnterKorchmaKeyboard({ questMarkers: snapshot }))).toEqual([
      "🚪 Зайти в корчму ⚠️"
    ]);
    expect(flatInlineButtonTexts(buildKorchmaYardKeyboard({ questMarkers: snapshot }))).toContain(
      "✨ Чароковальня ⚠️"
    );
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
