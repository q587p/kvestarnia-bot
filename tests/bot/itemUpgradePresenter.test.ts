import { describe, expect, it } from "vitest";
import {
  presentItemUpgradeList,
  presentItemUpgradePreview,
  presentItemUpgradeUnlock
} from "../../src/bot/presenters/itemUpgradePresenter";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";

describe("item upgrade presenter", () => {
  it("mentions the elf-mage once and then shortens to mage on the field-kit gate", () => {
    const text = presentItemUpgradeList({
      state: "unlock-required",
      character,
      fieldKitQuantity: 1,
      rewardXp: 42
    });

    expect(text).toContain("Ельф-маг просить <b>Польову аптечку</b>");
    expect(text).toContain("Можна віддати її магу");
    expect(text).not.toContain("ельфу-магу");
    expect(text.match(/ельф-маг/giu)).toHaveLength(1);
  });

  it("renders unlock XP with the shared quest reward block", () => {
    const text = presentItemUpgradeUnlock({
      state: "unlocked",
      character,
      rewardXp: 38,
      action: null,
      levelChange: {
        oldLevel: 5,
        newLevel: 5,
        leveledUp: false
      }
    } as Parameters<typeof presentItemUpgradeUnlock>[0]);

    expect(text).toContain("<i>Отримано:</i>\n+38 XP");
    expect(text).not.toContain("Отримано: <b>+38 XP</b>");
    expect(text).not.toContain("Рівень лишився на місці");
  });

  it("separates the Iskrokamin balance from the mage self-temper hint", () => {
    const text = presentItemUpgradeList({
      state: "ready",
      character: { ...character, classId: "class.mage", className: "Маг" },
      iskrokamin: 995,
      canUseSelfTemper: true,
      items: [
        {
          itemId: "item.herring-cap",
          name: "Картуз правильного оселедця",
          baseName: "Картуз правильного оселедця",
          quantity: 1,
          enhancementLevel: 0,
          equipped: false,
          targetLevel: 1,
          primaryStat: "armor",
          rarity: "common",
          setId: null,
          setName: null,
          isSetPiece: false
        }
      ]
    });

    expect(text).toContain(
      "Іскрокамінь: <b>995</b>\n\nЯк маг, ви можете зробити іскровий підкрут самі"
    );
  });

  it("marks set pieces in upgrade previews without exposing formulas", () => {
    const text = presentItemUpgradePreview({
      state: "ready",
      character,
      item: {
        itemId: "item.set.barrel-brother.helm",
        name: "Шолом бочкового дзвону",
        baseName: "Шолом бочкового дзвону",
        quantity: 1,
        enhancementLevel: 0,
        equipped: false,
        targetLevel: 1,
        primaryStat: "armor",
        rarity: "epic",
        setId: "mantok-set.barrel-brother-bulwark",
        setName: "Бочковий панцир старшого Брата",
        isSetPiece: true
      },
      method: "npc",
      costs: { gold: 50, iskrokamin: 3, mana: 0 },
      available: { gold: 587, iskrokamin: 13 },
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
      pityFailures: 0
    });

    expect(text).toContain("Сетова манатка");
    expect(text).toContain("більше думок");
    expect(text).toContain("Ціна: 50 золота · 3 Іскрокамінь");
    expect(text).toContain("У вас: <b>587</b> золота · <b>13</b> Іскрокаменю");
    expect(text).not.toContain("x1.25");
    expect(text).not.toContain("13%");
  });
});

const character: CharacterSummary = {
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
  }
};
