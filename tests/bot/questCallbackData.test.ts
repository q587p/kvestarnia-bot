import { describe, expect, it } from "vitest";
import {
  makeQuestCallbackData,
  parseQuestCallbackData,
  questCallbackToPersistentFightDifficulty
} from "../../src/bot/callbacks/questCallbackData";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "../../src/bot/callbacks/onboardingCallbackData";

describe("quest callback data", () => {
  it.each([
    "adventure",
    "fight",
    "fight-descend",
    "fight-easy",
    "fight-normal",
    "fight-hard",
    "hunt",
    "cellar",
    "barrel-tutorial",
    "barrel-tutorial-turn-in",
    "problem",
    "problem-next",
    "archive",
    "list"
  ] as const)("parses %s quest action", (action) => {
    expect(parseQuestCallbackData(makeQuestCallbackData(action))).toEqual({
      ok: true,
      value: action
    });
    expect(Buffer.byteLength(makeQuestCallbackData(action), "utf8")).toBeLessThanOrEqual(
      TELEGRAM_CALLBACK_DATA_LIMIT
    );
  });

  it("maps problem fight difficulty callbacks", () => {
    expect(questCallbackToPersistentFightDifficulty("fight-easy")).toBe("easy");
    expect(questCallbackToPersistentFightDifficulty("fight-normal")).toBe("normal");
    expect(questCallbackToPersistentFightDifficulty("fight-hard")).toBe("hard");
    expect(questCallbackToPersistentFightDifficulty("fight")).toBeNull();
    expect(questCallbackToPersistentFightDifficulty("fight-descend")).toBeNull();
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
