import { describe, expect, it } from "vitest";
import {
  buildItemUpgradeListKeyboard,
  buildItemUpgradePreviewKeyboard
} from "../../src/bot/keyboards/itemUpgradeKeyboard";
import {
  makeItemUpgradeListCallbackData,
  makeItemUpgradePagePromptCallbackData
} from "../../src/bot/callbacks/itemUpgradeCallbackData";
import { parseItemCallbackData } from "../../src/bot/callbacks/itemCallbackData";
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

  it("paginates upgrade candidates instead of silently hiding the tail", () => {
    const items = Array.from({ length: 12 }, (_, index) =>
      upgradeItem({
        itemId: `item.test-upgrade-${index + 1}`,
        name: `Манатка ${index + 1}`
      })
    );
    const firstPage = buildItemUpgradeListKeyboard(readyList({ items }));
    const secondPage = buildItemUpgradeListKeyboard(readyList({ items }), 1);

    expect(buttonTexts(firstPage)).toContain("✨ Манатка 10");
    expect(buttonTexts(firstPage)).not.toContain("✨ Манатка 11");
    expect(buttonTexts(firstPage)).toContain("1/2");
    expect(buttonTexts(firstPage)).toContain("Далі ▶️");
    expect(buttonCallbacks(firstPage)).toContain(makeItemUpgradeListCallbackData(1));
    expect(buttonCallbacks(firstPage)).toContain(makeItemUpgradePagePromptCallbackData(2));

    expect(buttonTexts(secondPage)).toContain("✨ Манатка 11");
    expect(buttonTexts(secondPage)).toContain("✨ Манатка 12");
    expect(buttonTexts(secondPage)).toContain("◀️ Назад");
    expect(buttonTexts(secondPage)).toContain("2/2");
    expect(buttonCallbacks(secondPage)).toContain(makeItemUpgradeListCallbackData(0));
  });

  it("sorts upgrade candidates by newest date and name", () => {
    const items = [
      upgradeItem({
        itemId: "item.test-beta",
        name: "Бета",
        createdAt: new Date("2026-07-01T10:00:00.000Z")
      }),
      upgradeItem({
        itemId: "item.test-alpha",
        name: "Альфа",
        createdAt: new Date("2026-07-03T10:00:00.000Z")
      }),
      upgradeItem({
        itemId: "item.test-gamma",
        name: "Гама",
        createdAt: new Date("2026-07-02T10:00:00.000Z")
      })
    ];

    const newest = buttonTexts(buildItemUpgradeListKeyboard(readyList({ items }), 0, "date-desc"));
    const byName = buttonTexts(buildItemUpgradeListKeyboard(readyList({ items }), 0, "name-asc"));

    expect(newest.slice(2, 5)).toEqual(["✨ Альфа", "✨ Гама", "✨ Бета"]);
    expect(byName.slice(2, 5)).toEqual(["✨ Альфа", "✨ Бета", "✨ Гама"]);
  });

  it("shows sort controls and preserves sort through pagination", () => {
    const items = Array.from({ length: 12 }, (_, index) =>
      upgradeItem({
        itemId: `item.test-upgrade-${index + 1}`,
        name: `Манатка ${index + 1}`
      })
    );
    const keyboard = buildItemUpgradeListKeyboard(readyList({ items }), 1, "name-asc");

    expect(buttonTexts(keyboard)).toContain("🕒 Нові спершу");
    expect(buttonTexts(keyboard)).toContain("🔤 Я-А");
    expect(buttonCallbacks(keyboard)).toContain(makeItemUpgradeListCallbackData(0, "date-desc"));
    expect(buttonCallbacks(keyboard)).toContain(makeItemUpgradeListCallbackData(0, "name-desc"));
    expect(buttonCallbacks(keyboard)).toContain(makeItemUpgradeListCallbackData(0, "name-asc"));
    expect(buttonCallbacks(keyboard)).toContain(makeItemUpgradePagePromptCallbackData(2, "name-asc"));
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

  it("opens item details with Charkokovalnia return navigation", () => {
    const keyboard = buildItemUpgradePreviewKeyboard(readyPreview());
    const detailCallback = buttonCallbacks(keyboard).find((callback) =>
      parseItemCallbackData(callback).ok
    );

    expect(parseItemCallbackData(detailCallback)).toEqual({
      ok: true,
      value: {
        type: "detail",
        itemId: "item.pan-of-persuasion",
        page: 0,
        filter: null,
        sort: "default",
        source: "item-upgrade"
      }
    });
  });

  it("uses lowercase mage in the field-kit turn-in button", () => {
    const keyboard = buildItemUpgradeListKeyboard({
      state: "unlock-required",
      character: character(),
      fieldKitQuantity: 1,
      rewardXp: 42
    });

    expect(buttonTexts(keyboard)).toContain("🧰 Віддати аптечку магу");
    expect(buttonTexts(keyboard).join("\n")).not.toContain("Магу");
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
    createdAt: new Date("2026-07-01T10:00:00.000Z"),
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
      isSetPiece: false,
      createdAt: new Date("2026-07-01T10:00:00.000Z")
    },
    method: "npc",
    costs: { gold: 50, iskrokamin: 5, mana: 0 },
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
    attemptGuard: "a1b2c3d4",
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

function buttonCallbacks(
  keyboard: { inline_keyboard: Array<Array<{ callback_data?: string }>> } | undefined
): string[] {
  return keyboard?.inline_keyboard.flat().flatMap((button) =>
    button.callback_data ? [button.callback_data] : []
  ) ?? [];
}
