import { describe, expect, it } from "vitest";
import {
  selectCharacterFlavorLine,
  type CharacterFlavorQuery
} from "../../src/content/characterFlavor";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";

const baseCharacter: CharacterSummary = {
  name: "Мандрівник",
  pronoun: "they",
  pronounLabel: "Вони",
  path: "boundary",
  raceId: "race.human-ish",
  raceName: "Людисько",
  classId: "class.warrior",
  className: "Воїн",
  title: "Пересічний Герой",
  level: 1,
  xp: 0,
  nextLevelXp: 10,
  xpToNextLevel: 10,
  gold: 0,
  hpCurrent: 20,
  hpMax: 20,
  manaCurrent: 10,
  manaMax: 10,
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
    primaryStat: null
  }
};

describe("character flavor content", () => {
  it("falls back to general korchma greeting when no specific scene line matches", () => {
    const line = selectCharacterFlavorLine(
      {
        ...baseCharacter,
        raceId: "race.unknown",
        classId: "class.unknown"
      },
      fixed("korchma.greeting")
    );

    expect(line?.id).toMatch(/^korchma\.greeting\.fallback\./);
  });

  it("prefers exact race and class combo flavor over class or race lines", () => {
    const line = selectCharacterFlavorLine(
      {
        ...baseCharacter,
        raceId: "race.bisyny",
        raceName: "Бісини",
        classId: "class.bard",
        className: "Бард"
      },
      fixed("korchma.greeting")
    );

    expect(line?.id).toBe("korchma.greeting.combo.bisyny-bard");
    expect(line?.text).toContain("культурний скандал");
  });

  it("selects the same line for the same character and seed", () => {
    const query = fixed("raid.prep-hint", "barrel");
    const first = selectCharacterFlavorLine(baseCharacter, query);
    const second = selectCharacterFlavorLine(baseCharacter, query);

    expect(first?.id).toBe(second?.id);
  });

  it("filters outcome flavor by action", () => {
    const receipt = selectCharacterFlavorLine(
      {
        ...baseCharacter,
        classId: "class.bureaucramancer",
        className: "Бюрокромант"
      },
      fixed("quest.outcome", "shawarma", "receipt")
    );
    const poke = selectCharacterFlavorLine(
      {
        ...baseCharacter,
        classId: "class.bureaucramancer",
        className: "Бюрокромант"
      },
      fixed("quest.outcome", "shawarma", "poke")
    );

    expect(receipt?.id).toBe("shawarma.outcome.bureaucramancer.receipt");
    expect(poke?.id).not.toBe("shawarma.outcome.bureaucramancer.receipt");
  });

  it("does not expose hidden path names in selected player-facing text", () => {
    const line = selectCharacterFlavorLine(
      {
        ...baseCharacter,
        path: "sun"
      },
      fixed("korchma.greeting")
    );

    expect(line?.text).not.toMatch(/\b(?:sun|moon|boundary)\b/i);
    expect(line?.text).not.toContain("Сонячний шлях");
    expect(line?.text).not.toContain("Місячний шлях");
    expect(line?.text).not.toContain("Межовий шлях");
  });
});

function fixed(
  placement: CharacterFlavorQuery["placement"],
  scene?: CharacterFlavorQuery["scene"],
  action?: string
): CharacterFlavorQuery {
  return {
    placement,
    scene,
    action,
    seed: "12026-06-13"
  };
}
