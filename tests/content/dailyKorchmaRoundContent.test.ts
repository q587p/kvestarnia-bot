import { describe, expect, it } from "vitest";
import {
  dailyKorchmaRoundScenes,
  validateDailyKorchmaRoundContent
} from "../../src/content/dailyKorchmaRoundContent";
import {
  PRESENCE_LOCATION_KORCHMA_YARD,
  isKorchmaInteriorLocation
} from "../../src/services/presenceService";

describe("daily Korchma round content", () => {
  it("ships 13 valid v1 scenes with three unique actions each", () => {
    expect(() => validateDailyKorchmaRoundContent()).not.toThrow();
    expect(dailyKorchmaRoundScenes).toHaveLength(13);

    for (const scene of dailyKorchmaRoundScenes) {
      expect(scene.actions).toHaveLength(3);
      expect(new Set(scene.actions.map((action) => action.id)).size).toBe(3);
    }
  });

  it("contains yard scenes and interior scenes without classifying the yard as interior", () => {
    const yardScenes = dailyKorchmaRoundScenes.filter((scene) => scene.zone === "yard");
    const interiorLocations = new Set(
      dailyKorchmaRoundScenes
        .filter((scene) => scene.zone === "interior")
        .map((scene) => scene.locationId)
    );

    expect(yardScenes.length).toBeGreaterThan(0);
    expect(yardScenes.every((scene) => scene.locationId === PRESENCE_LOCATION_KORCHMA_YARD)).toBe(true);
    expect(interiorLocations.size).toBeGreaterThanOrEqual(2);
    expect(isKorchmaInteriorLocation(PRESENCE_LOCATION_KORCHMA_YARD)).toBe(false);
  });
});
