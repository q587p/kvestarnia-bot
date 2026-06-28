import { describe, expect, it } from "vitest";
import { presentDailyKorchmaRound } from "../../src/bot/presenters/dailyKorchmaRoundPresenter";
import { summarizeCharacter } from "../../src/domain/characters/characterSummary";
import type { DailyKorchmaRoundLookupResult } from "../../src/services/dailyKorchmaRoundService";

describe("daily Korchma round presenter", () => {
  it("renders the turn-in location as an italic lower-case place name", () => {
    const text = presentDailyKorchmaRound(turnInReadyRound());

    expect(text).toContain("Поверніться до <i>столу зі справами</i> й здайте обхід Корчмарю.");
    expect(text).not.toContain("Поверніться до Столу зі справами");
  });
});

function turnInReadyRound(): DailyKorchmaRoundLookupResult {
  const completedSceneIds = ["scene.cellar.inventory-bottle", "scene.yeger.map-sneeze"];

  return {
    state: "turn-in-ready",
    character: summarizeCharacter({
      name: "Shannar de Kassal",
      pronoun: "they",
      raceId: "race.human",
      classId: "class.ranger",
      level: 3,
      xp: 0,
      gold: 0,
      hpCurrent: 24,
      hpMax: 24,
      manaCurrent: 12,
      manaMax: 12,
      statsJson: {
        strength: 6,
        dexterity: 7,
        intelligence: 6,
        charisma: 6,
        luck: 6
      }
    }),
    offer: {
      dayKey: "2026-06-28",
      dayToken: "20260628",
      lifeToken: 0,
      requiredSteps: 2,
      completedSceneIds,
      omittedSceneId: "scene.yard.rope",
      scenes: [
        {
          id: completedSceneIds[0],
          icon: "🍾",
          title: "Пляшка шепоче інвентаризацію",
          locationId: "location.korchma.cellar",
          zone: "interior",
          hook: "У льосі пляшка шепоче номери.",
          actions: []
        },
        {
          id: completedSceneIds[1],
          icon: "🗺️",
          title: "Мапа чхнула не в той бік",
          locationId: "location.korchma.ranger_corner",
          zone: "interior",
          hook: "У єгерському кутку мапа має думку.",
          actions: []
        },
        {
          id: "scene.yard.rope",
          icon: "🪢",
          title: "Мотузка завʼязала питання",
          locationId: "location.korchma.yard",
          zone: "yard",
          hook: "У задвірку мотузка має думку.",
          actions: []
        }
      ]
    }
  };
}
