import { describe, expect, it } from "vitest";
import { dailyKorchmaRoundScenes } from "../../src/content/dailyKorchmaRoundContent";
import { selectDailyKorchmaRoundSceneIds } from "../../src/domain/quests/dailyKorchmaRound";

describe("daily Korchma round planning", () => {
  it("selects a stable offer with exactly one yard scene and two distinct interiors", () => {
    const input = {
      characterId: "character-1",
      dayKey: "2026-06-28",
      scenes: dailyKorchmaRoundScenes
    };
    const first = selectDailyKorchmaRoundSceneIds(input);
    const second = selectDailyKorchmaRoundSceneIds(input);
    const selected = first.map((id) => dailyKorchmaRoundScenes.find((scene) => scene.id === id)!);

    expect(second).toEqual(first);
    expect(first).toHaveLength(3);
    expect(selected.filter((scene) => scene.zone === "yard")).toHaveLength(1);
    expect(new Set(selected.filter((scene) => scene.zone === "interior").map((scene) => scene.locationId)).size).toBe(2);
  });

  it("does not change a persisted id plan when content order changes", () => {
    const normal = selectDailyKorchmaRoundSceneIds({
      characterId: "character-1",
      dayKey: "2026-06-28",
      scenes: dailyKorchmaRoundScenes
    });
    const reordered = [...dailyKorchmaRoundScenes].reverse();
    const selectedFromPersisted = normal.map((id) => reordered.find((scene) => scene.id === id)?.id);

    expect(selectedFromPersisted).toEqual(normal);
  });
});
