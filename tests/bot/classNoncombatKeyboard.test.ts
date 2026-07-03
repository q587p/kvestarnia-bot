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

    expect(buttonTexts(keyboard)).not.toContain("⚕️ Полікувати себе");
    expect(buttonTexts(keyboard)).toContain("✨ Благословити себе");
    expect(buttonTexts(keyboard)).toContain("🔄 Оновити");
  });

  it("shows Priest self-heal when the character is wounded", () => {
    const keyboard = buildClassNoncombatKeyboard(priestOpenResult({
      hpCurrent: 13,
      hpMax: 20
    }));

    expect(buttonTexts(keyboard)).toContain("⚕️ Полікувати себе");
    expect(buttonTexts(keyboard)).toContain("✨ Благословити себе");
  });

  it("hides Priest target healing when the target is already at full HP", () => {
    const keyboard = buildClassNoncombatKeyboard(priestOpenResult({}, {
      targets: [target({ name: "Повний Сусід", hpCurrent: 20, hpMax: 20 })]
    }));

    expect(buttonTexts(keyboard)).not.toContain("⚕️ Повний Сусід");
    expect(buttonTexts(keyboard)).toContain("✨ Повний Сусід");
  });

  it("uses Priest heal icon for wounded targets and paginates target lists", () => {
    const keyboard = buildClassNoncombatKeyboard(priestOpenResult({}, {
      targetPage: 1,
      targetTotalPages: 3,
      targets: [target({ name: "Поранений Сусід", hpCurrent: 7, hpMax: 20 })]
    }));

    expect(buttonTexts(keyboard)).toEqual(expect.arrayContaining([
      "⚕️ Поранений Сусід",
      "✨",
      "⬅️",
      "2/3",
      "➡️"
    ]));
    expect(buttonTexts(keyboard)).not.toContain("🩹 Поранений Сусід");
  });
});

function priestOpenResult(
  overrides: Partial<CharacterSummary>,
  options: {
    targets?: Extract<ClassNoncombatOpenResult, { state: "ready" }>["targets"];
    targetPage?: number;
    targetTotalPages?: number;
  } = {}
): ClassNoncombatOpenResult {
  return {
    state: "ready",
    mode: "priest",
    character: character(overrides),
    locationName: "Стіл зі справами",
    targets: options.targets ?? [],
    targetPage: options.targetPage ?? 0,
    targetTotalPages: options.targetTotalPages ?? 1,
    priestBlessCooldownAvailableAt: null,
    roguePickpocketCooldownAvailableAt: null
  };
}

function target(
  overrides: Partial<Extract<ClassNoncombatOpenResult, { state: "ready" }>["targets"][number]> = {}
): Extract<ClassNoncombatOpenResult, { state: "ready" }>["targets"][number] {
  return {
    telegramUserId: 1002n,
    characterId: "target",
    name: "Сусід",
    classId: "class.warrior",
    level: 3,
    hpCurrent: 10,
    hpMax: 20,
    gold: 13,
    remortCount: 0,
    canPriestAid: true,
    canRoguePickpocket: false,
    ...overrides
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
