import { describe, expect, it } from "vitest";
import {
  makeBackToClassCallbackData,
  makeBackToGenderCallbackData,
  makeBackToRaceCallbackData,
  makeClassCallbackData,
  makeConfirmCallbackData,
  makeGenderCallbackData,
  makeRaceCallbackData,
  makeUnavailableClassCallbackData,
  makeUnavailableRaceCallbackData,
  parseOnboardingCallbackData
} from "../../src/bot/callbacks/onboardingCallbackData";

describe("onboarding callback data", () => {
  it("parses a valid gender callback", () => {
    expect(parseOnboardingCallbackData(makeGenderCallbackData("they"))).toEqual({
      ok: true,
      value: {
        type: "gender",
        pronoun: "they"
      }
    });
  });

  it("parses a valid race callback", () => {
    const parsed = parseOnboardingCallbackData(makeRaceCallbackData("they", "race.human-ish"));

    expect(parsed).toEqual({
      ok: true,
      value: {
        type: "race",
        pronoun: "they",
        raceId: "race.human-ish"
      }
    });
  });

  it("parses a valid class callback", () => {
    const parsed = parseOnboardingCallbackData(
      makeClassCallbackData("he", "race.human-ish", "class.warrior")
    );

    expect(parsed).toEqual({
      ok: true,
      value: {
        type: "class",
        pronoun: "he",
        raceId: "race.human-ish",
        classId: "class.warrior"
      }
    });
  });

  it("parses unavailable, confirm, and back callbacks", () => {
    expect(
      parseOnboardingCallbackData(makeUnavailableRaceCallbackData("she", "race.kharakternyk"))
    ).toMatchObject({
      ok: true,
      value: {
        type: "unavailable-race",
        pronoun: "she",
        raceId: "race.kharakternyk"
      }
    });
    expect(
      parseOnboardingCallbackData(
        makeUnavailableClassCallbackData("they", "race.molfar-soul", "class.varenyk-mancer")
      )
    ).toMatchObject({
      ok: true,
      value: {
        type: "unavailable-class",
        pronoun: "they",
        raceId: "race.molfar-soul",
        classId: "class.varenyk-mancer"
      }
    });
    expect(
      parseOnboardingCallbackData(
        makeConfirmCallbackData("they", "race.molfar-soul", "class.bureaucramancer")
      )
    ).toMatchObject({
      ok: true,
      value: {
        type: "confirm",
        pronoun: "they",
        raceId: "race.molfar-soul",
        classId: "class.bureaucramancer"
      }
    });
    expect(parseOnboardingCallbackData(makeBackToGenderCallbackData())).toEqual({
      ok: true,
      value: { type: "back-to-gender" }
    });
    expect(parseOnboardingCallbackData(makeBackToRaceCallbackData("he"))).toEqual({
      ok: true,
      value: { type: "back-to-race", pronoun: "he" }
    });
    expect(parseOnboardingCallbackData(makeBackToClassCallbackData("he", "race.dwarf"))).toEqual({
      ok: true,
      value: { type: "back-to-class", pronoun: "he", raceId: "race.dwarf" }
    });
  });

  it("rejects invalid versions", () => {
    expect(parseOnboardingCallbackData("v2:onb:r:they:human-ish")).toEqual({
      ok: false,
      error: "invalid-version"
    });
  });

  it("rejects invalid actions", () => {
    expect(parseOnboardingCallbackData("v1:onb:x:they:human-ish")).toEqual({
      ok: false,
      error: "invalid-action"
    });
  });

  it("rejects invalid ids", () => {
    expect(parseOnboardingCallbackData("v1:onb:g:dragon")).toEqual({
      ok: false,
      error: "invalid-pronoun"
    });
    expect(parseOnboardingCallbackData("v1:onb:r:they:unknown")).toEqual({
      ok: false,
      error: "invalid-race"
    });
    expect(parseOnboardingCallbackData("v1:onb:c:they:human-ish:unknown")).toEqual({
      ok: false,
      error: "invalid-class"
    });
  });
});
