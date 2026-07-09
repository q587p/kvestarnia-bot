import { describe, expect, it } from "vitest";
import { buildAdventureResolutionScene } from "../../src/content/adventureResolutionContent";
import {
  QUEST_RISK_BAND_CHANCE_CAPS,
  calculateQuestChance,
  deriveQuestRiskBand,
  qualitativeQuestChance,
  resolveQuestCheck
} from "../../src/domain/quests/questChecks";
import { findQuestMethod } from "../../src/domain/quests/questMethodResolver";

describe("quest resolution checks", () => {
  it("is deterministic for the same character, period, scene and method", () => {
    const scene = buildAdventureResolutionScene({
      problemId: "stew",
      title: "Казанок репетирує оперу",
      character
    });
    const method = findQuestMethod(scene, "conduct-duet");

    expect(method).not.toBeNull();
    if (!method) {
      throw new Error("Missing test method.");
    }

    const first = resolveQuestCheck({
      characterId: "character-42",
      periodKey: "2026-06-19T23",
      sceneId: scene.sceneId,
      method,
      stats: character.stats,
      raceId: character.raceId,
      classId: character.classId
    });
    const second = resolveQuestCheck({
      characterId: "character-42",
      periodKey: "2026-06-19T23",
      sceneId: scene.sceneId,
      method,
      stats: character.stats,
      raceId: character.raceId,
      classId: character.classId
    });

    expect(second).toEqual(first);
  });

  it("keeps chance within the documented conservative caps", () => {
    const scene = buildAdventureResolutionScene({
      problemId: "stew",
      title: "Казанок репетирує оперу",
      character
    });
    const method = findQuestMethod(scene, "conduct-duet");

    expect(method).not.toBeNull();
    if (!method) {
      throw new Error("Missing test method.");
    }

    const lowStats = resolveQuestCheck({
      characterId: "character-low",
      periodKey: "2026-06-19T23",
      sceneId: scene.sceneId,
      method: { ...method, baseChance: 1 },
      stats: { strength: 1, dexterity: 1, intelligence: 1, charisma: 1, luck: 1 },
      raceId: character.raceId,
      classId: character.classId
    });
    const highStats = resolveQuestCheck({
      characterId: "character-high",
      periodKey: "2026-06-19T23",
      sceneId: scene.sceneId,
      method: { ...method, baseChance: 99 },
      stats: { strength: 99, dexterity: 99, intelligence: 99, charisma: 99, luck: 99 },
      raceId: character.raceId,
      classId: character.classId
    });

    expect(lowStats.chance).toBeGreaterThanOrEqual(45);
    expect(highStats.chance).toBeLessThanOrEqual(88);
  });

  it("caps reliable, risky and fight-like methods by risk band", () => {
    const scene = buildAdventureResolutionScene({
      problemId: "stew",
      title: "РљР°Р·Р°РЅРѕРє СЂРµРїРµС‚РёСЂСѓС” РѕРїРµСЂСѓ",
      character
    });
    const method = findQuestMethod(scene, "conduct-duet");

    expect(method).not.toBeNull();
    if (!method) {
      throw new Error("Missing test method.");
    }

    const highStats = { strength: 99, dexterity: 99, intelligence: 99, charisma: 99, luck: 99 };
    const safeMethod = {
      ...method,
      baseChance: 99,
      rewardProfile: "modest" as const,
      intent: "investigate" as const,
      techniques: ["investigation"] as const,
      consequenceByGrade: {
        ...method.consequenceByGrade,
        complication: "cosmetic-mess" as const
      }
    };
    const riskyMethod = {
      ...method,
      baseChance: 99,
      rewardProfile: "generous" as const,
      intent: "deceive" as const,
      techniques: ["deception"] as const,
      consequenceByGrade: {
        ...method.consequenceByGrade,
        complication: "minor-injury" as const
      }
    };
    const wildMethod = {
      ...method,
      baseChance: 99,
      rewardProfile: "generous" as const,
      intent: "fight" as const,
      techniques: ["force"] as const,
      consequenceByGrade: {
        ...method.consequenceByGrade,
        complication: "fight-handoff" as const
      }
    };

    expect(deriveQuestRiskBand(safeMethod)).toBe("safe");
    expect(deriveQuestRiskBand(riskyMethod)).toBe("risky");
    expect(deriveQuestRiskBand(wildMethod)).toBe("wild");
    expect(calculateQuestChance({ method: safeMethod, stats: highStats, raceId: character.raceId, classId: character.classId }))
      .toBe(QUEST_RISK_BAND_CHANCE_CAPS.safe);
    expect(calculateQuestChance({ method: riskyMethod, stats: highStats, raceId: character.raceId, classId: character.classId }))
      .toBe(QUEST_RISK_BAND_CHANCE_CAPS.risky);
    expect(calculateQuestChance({ method: wildMethod, stats: highStats, raceId: character.raceId, classId: character.classId }))
      .toBe(QUEST_RISK_BAND_CHANCE_CAPS.wild);
    expect(qualitativeQuestChance(QUEST_RISK_BAND_CHANCE_CAPS.risky)).toBe("непевно");
    expect(qualitativeQuestChance(QUEST_RISK_BAND_CHANCE_CAPS.wild)).toBe("дуже непевно");
  });
});

const character = {
  name: "Мандрівник",
  pronoun: "they",
  pronounLabel: "Вони",
  path: "boundary",
  raceId: "race.human-ish",
  raceName: "Людисько",
  classId: "class.warrior",
  className: "Воїн",
  title: "Пересічний Пригодник",
  level: 3,
  xp: 25,
  nextLevelXp: 50,
  xpToNextLevel: 25,
  gold: 9,
  hpCurrent: 28,
  hpMax: 28,
  manaCurrent: 14,
  manaMax: 14,
  stats: {
    strength: 9,
    dexterity: 6,
    intelligence: 6,
    charisma: 6,
    luck: 6
  },
  levelBonus: {
    hpMax: 8,
    manaMax: 4,
    primaryStat: {
      stat: "strength",
      bonus: 2
    }
  }
} as const;
