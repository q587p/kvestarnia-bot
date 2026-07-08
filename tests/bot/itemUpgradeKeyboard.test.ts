import { describe, expect, it } from "vitest";
import { buildItemUpgradePreviewKeyboard } from "../../src/bot/keyboards/itemUpgradeKeyboard";
import type { ItemUpgradePreviewResult } from "../../src/services/itemUpgradeService";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";

describe("item upgrade keyboard", () => {
  it("hides self temper preview for non-magical classes", () => {
    const keyboard = buildItemUpgradePreviewKeyboard(readyPreview({
      character: character({ classId: "class.warrior" }),
      method: "npc"
    }));

    expect(buttonTexts(keyboard)).toContain("✅ Спробувати");
    expect(buttonTexts(keyboard)).not.toContain("🔮 Іскровий підкрут");
  });

  it("shows self temper preview for magical specialist classes", () => {
    const keyboard = buildItemUpgradePreviewKeyboard(readyPreview({
      character: character({ classId: "class.mage" }),
      method: "npc"
    }));

    expect(buttonTexts(keyboard)).toContain("🔮 Іскровий підкрут");
  });

  it("keeps the mage route visible from self temper previews", () => {
    const keyboard = buildItemUpgradePreviewKeyboard(readyPreview({
      character: character({ classId: "class.mage" }),
      method: "self"
    }));

    expect(buttonTexts(keyboard)).toContain("🛠️ До Мага");
  });
});

function readyPreview(overrides: Partial<Extract<ItemUpgradePreviewResult, { state: "ready" }>> = {}): Extract<ItemUpgradePreviewResult, { state: "ready" }> {
  return {
    state: "ready",
    character: character(),
    item: {
      itemId: "item.pan-of-persuasion",
      name: "Пательня переконання",
      baseName: "Пательня переконання",
      quantity: 1,
      enhancementLevel: 0,
      equipped: false,
      targetLevel: 1,
      primaryStat: "weaponDamage"
    },
    method: "npc",
    costs: { gold: 50, iskrokamin: 1, mana: 0 },
    chance: {
      baseChance: 95,
      luckBonus: 0,
      pityBonus: 0,
      donorBonus: 0,
      finalChance: 95,
      guaranteed: false
    },
    donor: null,
    donorOptions: [],
    pityFailures: 0,
    ...overrides
  };
}

function character(overrides: Partial<CharacterSummary> = {}): CharacterSummary {
  return {
    name: "Мандрівник",
    pronoun: "they",
    pronounLabel: "Вони",
    path: "boundary",
    raceId: "race.human-ish",
    raceName: "Людисько",
    classId: "class.warrior",
    className: "Воїн",
    title: "Пересічний Пригодник",
    level: 5,
    xp: 120,
    nextLevelXp: 180,
    xpToNextLevel: 60,
    gold: 0,
    hpCurrent: 24,
    hpMax: 24,
    manaCurrent: 12,
    manaMax: 12,
    stats: {
      strength: 8,
      dexterity: 6,
      intelligence: 6,
      charisma: 6,
      luck: 6
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
