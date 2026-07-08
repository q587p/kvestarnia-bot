import { describe, expect, it } from "vitest";
import {
  buildItemUpgradeListKeyboard,
  buildItemUpgradePreviewKeyboard
} from "../../src/bot/keyboards/itemUpgradeKeyboard";
import type {
  ItemUpgradeListResult,
  ItemUpgradePreviewResult
} from "../../src/services/itemUpgradeService";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";

describe("item upgrade keyboard", () => {
  it("marks equipped upgrade candidates with the equip icon", () => {
    const keyboard = buildItemUpgradeListKeyboard(readyList({
      items: [
        upgradeItem({
          itemId: "item.apron-of-foam-resistance",
          name: "Фартух піностійкого пригодника",
          equipped: true
        }),
        upgradeItem({
          itemId: "item.pan-of-persuasion",
          name: "Пательня переконання",
          equipped: false
        })
      ]
    }));

    expect(buttonTexts(keyboard)).toContain("🧥 Фартух піностійкого пригодника");
    expect(buttonTexts(keyboard)).toContain("✨ Пательня переконання");
    expect(buttonTexts(keyboard).join("\n")).not.toContain("✅ Фартух піностійкого пригодника");
  });

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

    expect(buttonTexts(keyboard)).toContain("🛠️ За допомогою ельфа-мага");
  });
});

function readyList(overrides: Partial<Extract<ItemUpgradeListResult, { state: "ready" }>> = {}): Extract<ItemUpgradeListResult, { state: "ready" }> {
  return {
    state: "ready",
    character: character(),
    iskrokamin: 13,
    canUseSelfTemper: false,
    items: [],
    ...overrides
  };
}

function upgradeItem(
  overrides: Partial<Extract<ItemUpgradeListResult, { state: "ready" }>["items"][number]> = {}
): Extract<ItemUpgradeListResult, { state: "ready" }>["items"][number] {
  return {
    itemId: "item.pan-of-persuasion",
    name: "Пательня переконання",
    baseName: "Пательня переконання",
    quantity: 1,
    enhancementLevel: 0,
    equipped: false,
    targetLevel: 1,
    primaryStat: "weaponDamage",
    rarity: "common",
    setId: null,
    setName: null,
    isSetPiece: false,
    ...overrides
  };
}

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
      primaryStat: "weaponDamage",
      rarity: "common",
      setId: null,
      setName: null,
      isSetPiece: false
    },
    method: "npc",
    costs: { gold: 50, iskrokamin: 2, mana: 0 },
    available: { gold: 120, iskrokamin: 5 },
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
