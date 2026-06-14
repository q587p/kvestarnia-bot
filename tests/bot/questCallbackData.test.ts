import { describe, expect, it } from "vitest";
import {
  makeQuestCallbackData,
  parseQuestCallbackData
} from "../../src/bot/callbacks/questCallbackData";

describe("quest callback data", () => {
  it.each(["adventure", "fight", "hunt", "cellar"] as const)("parses %s quest action", (action) => {
    expect(parseQuestCallbackData(makeQuestCallbackData(action))).toEqual({
      ok: true,
      value: action
    });
  });

  it("rejects invalid quest callback data", () => {
    expect(parseQuestCallbackData("v2:quest:fight")).toEqual({
      ok: false,
      error: "invalid-version"
    });
    expect(parseQuestCallbackData("v1:place:fight")).toEqual({
      ok: false,
      error: "invalid-prefix"
    });
    expect(parseQuestCallbackData("v1:quest:market")).toEqual({
      ok: false,
      error: "invalid-action"
    });
  });
});
