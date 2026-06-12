import { describe, expect, it } from "vitest";
import {
  presentPlannedCommand,
  type PlannedCommand
} from "../../src/bot/presenters/plannedCommandPresenter";

describe("planned command presenter", () => {
  it.each(["quest", "hunt", "inventory", "guild"] as const satisfies readonly PlannedCommand[])(
    "answers /%s with a short Ukrainian placeholder",
    (command) => {
      const text = presentPlannedCommand(command);

      expect(text).toContain("Доступно зараз");
      expect(text).toContain("/help");
      expect(text.length).toBeLessThan(240);
    }
  );

  it("points quest and hunt toward the playable tavern slice", () => {
    expect(presentPlannedCommand("quest")).toContain("/tavern");
    expect(presentPlannedCommand("hunt")).toContain("/tavern");
  });

  it("does not pretend inventory or guilds are implemented", () => {
    expect(presentPlannedCommand("inventory")).toContain("ще");
    expect(presentPlannedCommand("guild")).toContain("ще");
  });
});
