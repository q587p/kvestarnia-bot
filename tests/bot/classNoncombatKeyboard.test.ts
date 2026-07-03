import { describe, expect, it } from "vitest";
import { buildClassNoncombatKeyboard } from "../../src/bot/keyboards/classNoncombatKeyboard";
import type { ClassNoncombatOpenResult } from "../../src/services/classNoncombatService";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";

describe("class noncombat keyboard", () => {
  it("hides Priest self-heal when the character is already at full HP", () => {
    const keyboard = buildClassNoncombatKeyboard(priestOpenResult({
      hpCurrent: 20,
      hpMax: 20
    }));

    expect(buttonTexts(keyboard)).not.toContain("🩹 Полікувати себе");
    expect(buttonTexts(keyboard)).toContain("✨ Благословити себе");
    expect(buttonTexts(keyboard)).toContain("🔄 Оновити");
  });

  it("shows Priest self-heal when the character is wounded", () => {
    const keyboard = buildClassNoncombatKeyboard(priestOpenResult({
      hpCurrent: 13,
      hpMax: 20
    }));

    expect(buttonTexts(keyboard)).toContain("🩹 Полікувати себе");
    expect(buttonTexts(keyboard)).toContain("✨ Благословити себе");
  });
});

function priestOpenResult(overrides: Partial<CharacterSummary>): ClassNoncombatOpenResult {
  return {
    state: "ready",
    mode: "priest",
    character: character(overrides),
    locationName: "Стіл зі справами",
    targets: [],
    priestHealCooldownAvailableAt: null,
    priestBlessCooldownAvailableAt: null,
    roguePickpocketCooldownAvailableAt: null
  };
}

function character(overrides: Partial<CharacterSummary> = {}): CharacterSummary {
  return {
    name: "Жрець",
    pronoun: "they",
    pronounLabel: "Вони",
    path: "boundary",
    raceId: "race.human-ish",
    raceName: "Людисько",
    classId: "class.priest",
    className: "Жрець",
    title: "Пересічні Пригодники",
    level: 3,
    xp: 25,
    nextLevelXp: 45,
    xpToNextLevel: 20,
    gold: 13,
    hpCurrent: 10,
    hpMax: 20,
    manaCurrent: 20,
    manaMax: 20,
    stats: {
      strength: 8,
      dexterity: 8,
      intelligence: 8,
      charisma: 8,
      luck: 8
    },
    levelBonus: {
      hpMax: 0,
      manaMax: 0,
      primaryStat: {
        stat: "strength",
        bonus: 0
      }
    },
    ...overrides
  };
}

function buttonTexts(keyboard: { inline_keyboard: Array<Array<{ text: string }>> } | undefined): string[] {
  return keyboard?.inline_keyboard.flat().map((button) => button.text) ?? [];
}
