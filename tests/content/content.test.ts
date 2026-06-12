import { describe, expect, it } from "vitest";
import {
  makeClassCallbackData,
  makeRaceCallbackData,
  parseOnboardingCallbackData,
  TELEGRAM_CALLBACK_DATA_LIMIT
} from "../../src/bot/callbacks/onboardingCallbackData";
import { classes, items, monsters, races } from "../../src/content";
import { classSchema, itemSchema, monsterSchema, raceSchema } from "../../src/content/schema";

const contentTables = [
  { name: "races", rows: races, schema: raceSchema },
  { name: "classes", rows: classes, schema: classSchema },
  { name: "monsters", rows: monsters, schema: monsterSchema },
  { name: "items", rows: items, schema: itemSchema }
] as const;

describe("content tables", () => {
  it.each(contentTables)("validates $name with Zod schemas", ({ rows, schema }) => {
    for (const row of rows) {
      expect(() => schema.parse(row)).not.toThrow();
    }
  });

  it.each(contentTables)("keeps ids unique in $name", ({ rows }) => {
    const ids = rows.map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps onboarding race callbacks valid and within Telegram limits", () => {
    for (const race of races) {
      const callbackData = makeRaceCallbackData(race.id);

      expect(Buffer.byteLength(callbackData, "utf8")).toBeLessThanOrEqual(
        TELEGRAM_CALLBACK_DATA_LIMIT
      );
      expect(parseOnboardingCallbackData(callbackData).ok).toBe(true);
    }
  });

  it("keeps onboarding class callbacks valid and within Telegram limits", () => {
    for (const race of races) {
      for (const characterClass of classes) {
        const callbackData = makeClassCallbackData(race.id, characterClass.id);

        expect(Buffer.byteLength(callbackData, "utf8")).toBeLessThanOrEqual(
          TELEGRAM_CALLBACK_DATA_LIMIT
        );
        expect(parseOnboardingCallbackData(callbackData).ok).toBe(true);
      }
    }
  });
});
