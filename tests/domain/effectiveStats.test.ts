import { describe, expect, it } from "vitest";
import { findLootExpansionVariantByItemId } from "../../src/content/lootExpansionV1";
import { buildEffectiveCharacterStats } from "../../src/domain/progression/effectiveStats";
import type { CharacterStats } from "../../src/domain/characters/starterStats";

const storedStats: CharacterStats = {
  strength: 8,
  dexterity: 6,
  intelligence: 6,
  charisma: 6,
  luck: 6
};

describe("buildEffectiveCharacterStats", () => {
  it("returns stored HP, mana, and stats unchanged at level 1", () => {
    expect(buildEffectiveCharacterStats(input({ level: 1 }))).toMatchObject({
      hpCurrent: 11,
      hpMax: 20,
      manaCurrent: 3,
      manaMax: 10,
      stats: storedStats,
      levelBonus: {
        hpMax: 0,
        manaMax: 0,
        stats: {
          strength: 0,
          dexterity: 0,
          intelligence: 0,
          charisma: 0,
          luck: 0
        }
      }
    });
  });

  it("adds HP, mana, and one distributed stat point at level 2", () => {
    expect(buildEffectiveCharacterStats(input({ level: 2 }))).toMatchObject({
      hpCurrent: 11,
      hpMax: 24,
      manaCurrent: 3,
      manaMax: 12,
      stats: {
        strength: 9,
        dexterity: 6,
        intelligence: 6,
        charisma: 6,
        luck: 6
      },
      levelBonus: {
        hpMax: 4,
        manaMax: 2,
        stats: {
          strength: 1,
          dexterity: 0,
          intelligence: 0,
          charisma: 0,
          luck: 0
        }
      }
    });
  });

  it("distributes cumulative level growth at level 3", () => {
    expect(buildEffectiveCharacterStats(input({ level: 3 }))).toMatchObject({
      hpCurrent: 11,
      hpMax: 28,
      manaCurrent: 3,
      manaMax: 14,
      stats: {
        strength: 9,
        dexterity: 7
      },
      levelBonus: {
        hpMax: 8,
        manaMax: 4,
        stats: {
          strength: 1,
          dexterity: 1,
          intelligence: 0,
          charisma: 0,
          luck: 0
        }
      }
    });
  });

  it("uses deterministic fallback stat growth for unknown classes", () => {
    expect(buildEffectiveCharacterStats(input({ classId: "class.mystery", level: 2 }))).toMatchObject({
      hpCurrent: 11,
      hpMax: 24,
      manaCurrent: 3,
      manaMax: 12,
      stats: {
        strength: 9,
        dexterity: 6,
        intelligence: 6,
        charisma: 6,
        luck: 6
      },
      levelBonus: {
        hpMax: 4,
        manaMax: 2,
        stats: {
          strength: 1,
          dexterity: 0,
          intelligence: 0,
          charisma: 0,
          luck: 0
        }
      }
    });
  });

  it("applies fixed path bonuses as a derived layer", () => {
    expect(buildEffectiveCharacterStats(input({ level: 1, path: "moon" }))).toMatchObject({
      stats: {
        strength: 8,
        dexterity: 7,
        intelligence: 7,
        charisma: 6,
        luck: 6
      }
    });
  });

  it("uses race and path as level-growth bias without adding extra level points", () => {
    expect(
      buildEffectiveCharacterStats(
        input({
          level: 12,
          raceId: "race.human-ish",
          path: "boundary"
        })
      )
    ).toMatchObject({
      levelBonus: {
        hpMax: 44,
        manaMax: 22,
        stats: {
          strength: 4,
          dexterity: 2,
          intelligence: 1,
          charisma: 2,
          luck: 2
        }
      }
    });
  });

  it("does not mutate the input stats object", () => {
    const stats = { ...storedStats };

    buildEffectiveCharacterStats(input({ level: 3, stats }));

    expect(stats).toEqual(storedStats);
  });

  it("treats levels below 1 as level 1", () => {
    expect(buildEffectiveCharacterStats(input({ level: 0 }))).toMatchObject({
      hpCurrent: 11,
      hpMax: 20,
      manaCurrent: 3,
      manaMax: 10,
      stats: storedStats
    });
  });

  it("does not refill current resources when level or equipment raises maximums", () => {
    expect(
      buildEffectiveCharacterStats(
        input({
          level: 2,
          equipment: [
            {
              itemId: "item.test-apron",
              itemName: "Тестовий фартух",
              effect: {
                hpMax: 2,
                manaMax: 1
              }
            }
          ]
        })
      )
    ).toMatchObject({
      hpCurrent: 11,
      hpMax: 26,
      manaCurrent: 3,
      manaMax: 13
    });
  });

  it("applies tuned generated equipment bonuses to effective combat stats", () => {
    const weapon = findLootExpansionVariantByItemId("item.loot-v1-w001-plus-1")?.item;
    const armor = findLootExpansionVariantByItemId("item.loot-v1-a001-plus-1")?.item;

    expect(weapon?.effect).toMatchObject({ weaponDamage: 3 });
    expect(armor?.effect).toMatchObject({ armor: 2, hpMax: 3 });

    const result = buildEffectiveCharacterStats(
      input({
        level: 1,
        equipment: [
          {
            itemId: weapon?.id ?? "missing-weapon",
            itemName: weapon?.name ?? "Missing weapon",
            effect: weapon?.effect
          },
          {
            itemId: armor?.id ?? "missing-armor",
            itemName: armor?.name ?? "Missing armor",
            effect: armor?.effect
          }
        ]
      })
    );

    expect(result).toMatchObject({
      hpCurrent: 11,
      hpMax: 23,
      manaMax: 10,
      equipmentEffects: {
        hpMax: 3,
        armor: 2,
        weaponDamage: 3
      }
    });
  });

  it("applies active Mantok set stat bonuses once through equipment effects", () => {
    const result = buildEffectiveCharacterStats(
      input({
        level: 1,
        equipment: [
          {
            itemId: "item.set.red-line.left-dagger",
            itemName: "Кинджал червоного рядка",
            effect: {
              weaponDamage: 4,
              dexterity: 1
            }
          },
          {
            itemId: "item.set.red-line.margin-dagger",
            itemName: "Кинджал червоного поля",
            effect: {
              weaponDamage: 3,
              luck: 1
            }
          }
        ]
      })
    );

    const setContribution = result.equipmentEffects.contributions.find(
      (entry) => entry.itemId === "mantok-set.red-line-duel:2"
    );

    expect(result.equipmentEffects.weaponDamage).toBe(7);
    expect(result.equipmentEffects.stats.dexterity).toBe(2);
    expect(result.equipmentEffects.stats.luck).toBe(1);
    expect(setContribution?.itemName).toBe("Парні кинджали червоного рядка: Подвійна редактура");
    expect(setContribution?.effect.dexterity).toBe(1);
    expect(result.stats.dexterity).toBe(storedStats.dexterity + 2);
  });

  it("does not apply Mantok set bonuses below active thresholds", () => {
    const result = buildEffectiveCharacterStats(
      input({
        level: 1,
        equipment: [
          {
            itemId: "item.set.red-line.left-dagger",
            itemName: "Кинджал червоного рядка",
            effect: {
              weaponDamage: 4,
              dexterity: 1
            }
          }
        ]
      })
    );

    expect(result.equipmentEffects).toMatchObject({
      weaponDamage: 4,
      stats: {
        dexterity: 1
      }
    });
    expect(result.equipmentEffects.contributions.map((entry) => entry.itemId)).not.toContain(
      "mantok-set.red-line-duel:2"
    );
  });

  it("applies Mantok set threshold contributions once for duplicate visual twohand occupancy", () => {
    const result = buildEffectiveCharacterStats(
      input({
        level: 1,
        equipment: [
          {
            itemId: "item.set.yeger-shadow.longbow",
            itemName: "Лук останньої зарубки",
            effect: {
              weaponDamage: 4,
              dexterity: 1
            }
          },
          {
            itemId: "item.set.yeger-shadow.longbow",
            itemName: "Лук останньої зарубки",
            effect: {
              weaponDamage: 4,
              dexterity: 1
            }
          },
          {
            itemId: "item.set.yeger-shadow.hood",
            itemName: "Каптур тихого сліду",
            effect: {
              resist: 1
            }
          }
        ]
      })
    );

    const setContributionIds = result.equipmentEffects.contributions
      .map((entry) => entry.itemId)
      .filter((itemId) => itemId.startsWith("mantok-set.yeger-shadow-path"));

    expect(setContributionIds).toEqual(["mantok-set.yeger-shadow-path:2"]);
    expect(result.equipmentEffects.stats.luck).toBe(1);
  });
});

function input(
  overrides: Partial<Parameters<typeof buildEffectiveCharacterStats>[0]> = {}
): Parameters<typeof buildEffectiveCharacterStats>[0] {
  return {
    level: 1,
    classId: "class.warrior",
    hpCurrent: 11,
    hpMax: 20,
    manaCurrent: 3,
    manaMax: 10,
    stats: storedStats,
    ...overrides
  };
}
