import { describe, expect, it } from "vitest";
import { presentTavernGameActionResult } from "../../src/bot/presenters/tavernGamePresenter";

describe("tavern game presenter", () => {
  it("explains create cooldown without implying an open table exists", () => {
    const text = presentTavernGameActionResult({
      state: "cooldown",
      availableAt: new Date("2026-07-02T10:03:01.000Z"),
      now: new Date("2026-07-02T10:00:00.000Z")
    });

    expect(text).toContain("Новий стіл ще на паузі.");
    expect(text).toContain("обмеження на створення нових столів");
    expect(text).toContain("не ознака, що десь уже відкрита партія");
    expect(text).toContain("Спробуйте ще раз за 4 хвилини.");
  });
});
