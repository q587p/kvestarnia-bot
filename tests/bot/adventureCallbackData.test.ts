import { describe, expect, it } from "vitest";
import {
  makeAdventureCallbackData,
  makeAdventureApproachCallbackData,
  makeAdventureParticipantsCallbackData,
  makeAdventureProblemCallbackData,
  parseAdventureCallbackData
} from "../../src/bot/callbacks/adventureCallbackData";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "../../src/bot/callbacks/onboardingCallbackData";
import {
  ADVENTURE_PROBLEM_IDS,
  buildAdventureMethodOptions
} from "../../src/services/adventureService";

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

  it("keeps every rendered authored adventure callback within Telegram limits", () => {
    for (const problemId of ADVENTURE_PROBLEM_IDS) {
      const problemData = makeAdventureProblemCallbackData({
        periodToken: "12345678rz",
        problemId
      });

      expect(Buffer.byteLength(problemData, "utf8"), problemId).toBeLessThanOrEqual(
        TELEGRAM_CALLBACK_DATA_LIMIT
      );
      expect(parseAdventureCallbackData(problemData)).toEqual({
        ok: true,
        value: {
          type: "problem",
          periodToken: "12345678rz",
          problemId
        }
      });

      const methods = buildAdventureMethodOptions(
        {
          id: problemId,
          title: problemId,
          hook: "",
          client: ""
        },
        character
      );

      for (const method of methods) {
        const data = makeAdventureApproachCallbackData({
          periodToken: "12345678rz",
          problemId,
          methodId: method.callbackKey ?? method.id
        });

        expect(Buffer.byteLength(data, "utf8"), `${problemId}:${method.id}`).toBeLessThanOrEqual(
          TELEGRAM_CALLBACK_DATA_LIMIT
        );
        expect(parseAdventureCallbackData(data)).toEqual({
          ok: true,
          value: {
            type: "approach",
            periodToken: "12345678rz",
            problemId,
            methodId: method.callbackKey ?? method.id
          }
        });
      }
    }
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
      error: "invalid-action"
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

const character = {
  name: "Мандрівник",
  pronoun: "they",
  pronounLabel: "Вони",
  path: "boundary",
  raceId: "race.dryland-rusalka",
  raceName: "Русалка сухопутна",
  classId: "class.bard",
  className: "Бард",
  title: "Співачка Без Моря",
  level: 3,
  xp: 25,
  nextLevelXp: 50,
  xpToNextLevel: 25,
  gold: 9,
  hpCurrent: 28,
  hpMax: 28,
  manaCurrent: 14,
  manaMax: 14,
  stats: {
    strength: 6,
    dexterity: 6,
    intelligence: 8,
    charisma: 9,
    luck: 7
  },
  levelBonus: {
    hpMax: 8,
    manaMax: 4,
    primaryStat: {
      stat: "charisma" as const,
      bonus: 2
    }
  }
} as const;
