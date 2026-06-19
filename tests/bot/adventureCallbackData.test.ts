import { describe, expect, it } from "vitest";
import {
  makeAdventureCallbackData,
  makeAdventureApproachCallbackData,
  makeAdventureParticipantsCallbackData,
  makeAdventureProblemCallbackData,
  parseAdventureCallbackData
} from "../../src/bot/callbacks/adventureCallbackData";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "../../src/bot/callbacks/onboardingCallbackData";
import { ADVENTURE_PROBLEM_IDS } from "../../src/services/adventureService";

describe("adventure callback data", () => {
  it("parses problem callbacks within Telegram limits", () => {
    const data = makeAdventureProblemCallbackData({
      periodToken: "20260612",
      problemId: "calendar"
    });

    expect(parseAdventureCallbackData(data)).toEqual({
      ok: true,
      value: {
        type: "problem",
        periodToken: "20260612",
        problemId: "calendar"
      }
    });
    expect(Buffer.byteLength(data, "utf8")).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
  });

  it("parses expanded problem ids within Telegram limits", () => {
    const data = makeAdventureProblemCallbackData({
      periodToken: "20260612",
      problemId: "portrait"
    });

    expect(parseAdventureCallbackData(data)).toEqual({
      ok: true,
      value: {
        type: "problem",
        periodToken: "20260612",
        problemId: "portrait"
      }
    });
    expect(Buffer.byteLength(data, "utf8")).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
  });

  it("parses rerolled period tokens within Telegram limits", () => {
    const data = makeAdventureProblemCallbackData({
      periodToken: "20260612r1",
      problemId: "calendar"
    });

    expect(parseAdventureCallbackData(data)).toEqual({
      ok: true,
      value: {
        type: "problem",
        periodToken: "20260612r1",
        problemId: "calendar"
      }
    });
    expect(Buffer.byteLength(data, "utf8")).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
  });

  it("parses personalized problem ids within Telegram limits", () => {
    const problemId = ADVENTURE_PROBLEM_IDS.find((id) => id.startsWith("class-bureaucramancer-"));

    expect(problemId).toBeDefined();
    const data = makeAdventureProblemCallbackData({
      periodToken: "20260612",
      problemId: problemId ?? "class-bureaucramancer-manual"
    });

    expect(parseAdventureCallbackData(data)).toEqual({
      ok: true,
      value: {
        type: "problem",
        periodToken: "20260612",
        problemId
      }
    });
    expect(Buffer.byteLength(data, "utf8")).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
  });

  it.each(["safe", "flair", "risky"] as const)(
    "parses legacy %s approach callbacks within Telegram limits",
    (approach) => {
      const data = makeAdventureApproachCallbackData({
        periodToken: "20260612",
        problemId: "receipt",
        approach
      });

      expect(parseAdventureCallbackData(data)).toEqual({
        ok: true,
        value: {
          type: "legacy-approach",
          periodToken: "20260612",
          problemId: "receipt",
          approach
        }
      });
      expect(Buffer.byteLength(data, "utf8")).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
    }
  );

  it("parses authored method callbacks within Telegram limits", () => {
    const data = makeAdventureApproachCallbackData({
      periodToken: "20260612",
      problemId: "receipt",
      methodId: "c3"
    });

    expect(parseAdventureCallbackData(data)).toEqual({
      ok: true,
      value: {
        type: "approach",
        periodToken: "20260612",
        problemId: "receipt",
        methodId: "c3"
      }
    });
    expect(Buffer.byteLength(data, "utf8")).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
  });

  it("parses participants callback", () => {
    const data = makeAdventureParticipantsCallbackData();

    expect(parseAdventureCallbackData(data)).toEqual({
      ok: true,
      value: { type: "participants" }
    });
    expect(Buffer.byteLength(data, "utf8")).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
  });

  it("parses starter shawarma callbacks with the selected action", () => {
    const data = makeAdventureCallbackData("poke");

    expect(parseAdventureCallbackData(data)).toEqual({
      ok: true,
      value: {
        type: "legacy",
        action: "poke"
      }
    });
    expect(Buffer.byteLength(data, "utf8")).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
  });

  it("rejects invalid versions, periods, and actions", () => {
    expect(parseAdventureCallbackData("v3:adv:p:20260612:stew")).toEqual({
      ok: false,
      error: "invalid-version"
    });
    expect(parseAdventureCallbackData("v2:adv:p:20260612:stew")).toEqual({
      ok: false,
      error: "invalid-prefix"
    });
    expect(parseAdventureCallbackData("v1:adv:p:2026-06-12:stew")).toEqual({
      ok: false,
      error: "invalid-action"
    });
    expect(parseAdventureCallbackData("v1:adv:a:20260612:stew:dance")).toEqual({
      ok: false,
      error: "invalid-action"
    });
  });

  it("rejects invalid prefixes", () => {
    expect(parseAdventureCallbackData("v1:tavern:p:20260612:stew")).toEqual({
      ok: false,
      error: "invalid-prefix"
    });
  });
});
