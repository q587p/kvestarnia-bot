import { describe, expect, it } from "vitest";
import { shouldMarkAdventureChoiceCallbackPresence } from "../../src/bot/adventureCallbackPresence";

describe("Adventure callback presence policy", () => {
  it.each([
    "active-fight",
    "combat-blocked",
    "already-completed"
  ] as const)("treats %s as non-authoritative for presence", (state) => {
    expect(shouldMarkAdventureChoiceCallbackPresence({ state })).toBe(false);
  });

  it.each([
    "no-character",
    "level-locked",
    "stale",
    "selected",
    "completed",
    "insufficient-gold"
  ] as const)("allows %s to use its authoritative callback route", (state) => {
    expect(shouldMarkAdventureChoiceCallbackPresence({ state })).toBe(true);
  });
});
