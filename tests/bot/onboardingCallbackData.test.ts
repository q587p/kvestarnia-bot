import { describe, expect, it } from "vitest";
import {
  makeClassCallbackData,
  makeRaceCallbackData,
  parseOnboardingCallbackData
} from "../../src/bot/callbacks/onboardingCallbackData";

describe("onboarding callback data", () => {
  it("parses a valid race callback", () => {
    const parsed = parseOnboardingCallbackData(makeRaceCallbackData("race.human-ish"));

    expect(parsed).toEqual({
      ok: true,
      value: {
        type: "race",
        raceId: "race.human-ish"
      }
    });
  });

  it("parses a valid class callback", () => {
    const parsed = parseOnboardingCallbackData(
      makeClassCallbackData("race.human-ish", "class.warrior")
    );

    expect(parsed).toEqual({
      ok: true,
      value: {
        type: "class",
        raceId: "race.human-ish",
        classId: "class.warrior"
      }
    });
  });

  it("rejects invalid versions", () => {
    expect(parseOnboardingCallbackData("v2:onb:r:race.human-ish")).toEqual({
      ok: false,
      error: "invalid-version"
    });
  });

  it("rejects invalid actions", () => {
    expect(parseOnboardingCallbackData("v1:onb:x:race.human-ish")).toEqual({
      ok: false,
      error: "invalid-action"
    });
  });

  it("rejects invalid ids", () => {
    expect(parseOnboardingCallbackData("v1:onb:r:race.unknown")).toEqual({
      ok: false,
      error: "invalid-race"
    });
    expect(parseOnboardingCallbackData("v1:onb:c:race.human-ish:class.unknown")).toEqual({
      ok: false,
      error: "invalid-class"
    });
  });
});
