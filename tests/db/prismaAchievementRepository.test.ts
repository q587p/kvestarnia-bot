import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENT_RECALCULATION_DAILY_ACTION_KEYS,
  getBigBarrelMedicalPartyBossItemUseDates,
  getEquippedCanonicalSlotCount,
  getPartyBossItemActionAchievementWhere,
  getAdventureChoiceConsequence,
  isAdventureChoiceFightComplication,
  isAdventureChoiceResolvedForAchievement
} from "../../src/db/repositories/prismaAchievementRepository";
import { items } from "../../src/content/items";
import type { ItemContent } from "../../src/content/schema";
import { DAILY_KORCHMA_ROUND_REWARD_KEY } from "../../src/services/dailyActionKeys";

describe("PrismaAchievementRepository recalculation snapshot", () => {
  it("selects daily Korchma round reward rows for durable achievement milestones", () => {
    expect(ACHIEVEMENT_RECALCULATION_DAILY_ACTION_KEYS).toContain(DAILY_KORCHMA_ROUND_REWARD_KEY);
  });

  it("keeps party-boss medical recalculation scoped to Big Barrel item actions", () => {
    expect(getPartyBossItemActionAchievementWhere("character-1")).toEqual({
      actorCharacterId: "character-1",
      actionKey: "item",
      session: {
        rulesVersion: "big-barrel-brother-v1"
      }
    });
  });

  it("counts only medical Big Barrel party-boss item actions for bandage achievements", () => {
    const bandageAt = new Date("2026-07-03T10:00:00.000Z");
    const denseAt = new Date("2026-07-03T10:02:00.000Z");
    const fieldKitAt = new Date("2026-07-03T10:04:00.000Z");
    const nonMedicalAt = new Date("2026-07-03T10:06:00.000Z");

    expect(getBigBarrelMedicalPartyBossItemUseDates([
      {
        submittedAt: nonMedicalAt,
        resultJson: {
          kind: "combat-item",
          item: {
            id: "item.future-smoke-bomb",
            name: "Future Smoke Bomb"
          }
        }
      },
      {
        submittedAt: fieldKitAt,
        resultJson: {
          kind: "combat-item",
          item: {
            id: "item.field-kit",
            name: "Польова аптечка"
          }
        }
      },
      {
        submittedAt: bandageAt,
        resultJson: {
          kind: "combat-item",
          item: {
            id: "item.responsible-panic-bandage",
            name: "Бинт відповідальної паніки"
          }
        }
      },
      {
        submittedAt: new Date("2026-07-03T10:08:00.000Z"),
        resultJson: { kind: "combat-item" }
      },
      {
        submittedAt: denseAt,
        resultJson: {
          kind: "combat-item",
          item: {
            id: "item.dense-bandage",
            name: "Щільний бинт"
          }
        }
      }
    ])).toEqual([bandageAt, denseAt, fieldKitAt]);
  });

  it("counts a twohand weapon as occupying both hand slots for full-slot achievements", () => {
    const cleanup = addTemporaryItem({
      id: "item.test-twohand-for-achievement",
      name: "Тестова дворучна палиця",
      description: "Рахує руки без подвоєння сили.",
      rarity: "rare",
      slot: "weapon",
      equipmentSlot: "weapon",
      tags: ["twohand"],
      goldValue: 93
    });

    try {
      expect(getEquippedCanonicalSlotCount([
        { slot: "weapon", itemId: "item.pan-of-persuasion" },
        { slot: "chest", itemId: "item.apron-of-foam-resistance" }
      ])).toBe(2);

      expect(getEquippedCanonicalSlotCount([
        { slot: "weapon", itemId: "item.test-twohand-for-achievement" },
        { slot: "head", itemId: "item.pot-helmet-of-early-access" },
        { slot: "chest", itemId: "item.apron-of-foam-resistance" },
        { slot: "legs", itemId: "item.loot-v1-a001-plus-1" },
        { slot: "accessory", itemId: "item.cork-ring-of-serious-business" },
        { slot: "tool", itemId: "item.loot-v1-x001-plus-1" }
      ])).toBe(7);
    } finally {
      cleanup();
    }
  });

  it("classifies Adventure Choice achievement rows from stored consequence", () => {
    expect(getAdventureChoiceConsequence({ consequence: "local-failure" })).toBe("local-failure");
    expect(isAdventureChoiceResolvedForAchievement({ consequence: "local-failure" })).toBe(false);
    expect(isAdventureChoiceFightComplication({ consequence: "local-failure", grade: "complication" })).toBe(false);

    expect(isAdventureChoiceResolvedForAchievement({ consequence: "fight-handoff" })).toBe(true);
    expect(isAdventureChoiceFightComplication({ consequence: "fight-handoff", grade: "complication" })).toBe(true);

    expect(isAdventureChoiceResolvedForAchievement({ grade: "complication" })).toBe(true);
    expect(isAdventureChoiceFightComplication({ grade: "complication" })).toBe(false);
    expect(isAdventureChoiceResolvedForAchievement(null)).toBe(true);
  });
});

function addTemporaryItem(item: ItemContent): () => void {
  (items as ItemContent[]).push(item);

  return () => {
    const index = items.findIndex((candidate) => candidate.id === item.id);

    if (index >= 0) {
      (items as ItemContent[]).splice(index, 1);
    }
  };
}
