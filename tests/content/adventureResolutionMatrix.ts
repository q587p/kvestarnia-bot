import { activeRaces } from "../../src/content/races";
import { classes } from "../../src/content/classes";
import { buildAdventureResolutionScene } from "../../src/content/adventureResolutionContent";
import { ADVENTURE_PROBLEM_IDS } from "../../src/services/adventureService";
import {
  getQuestMethodAffordanceKey,
  getQuestMethodTacticKey,
  resolveQuestMethodsForCharacter
} from "../../src/domain/quests/questMethodResolver";

export const ADVENTURE_MATRIX_SHARD_COUNT = 3;

export function runAdventureResolutionMatrixShard(shardIndex: number): {
  failures: string[];
  combinationCount: number;
  problemCount: number;
} {
  const failures: string[] = [];
  let combinationCount = 0;
  let problemCount = 0;

  for (const [problemIndex, problemId] of ADVENTURE_PROBLEM_IDS.entries()) {
    if (problemIndex % ADVENTURE_MATRIX_SHARD_COUNT !== shardIndex) {
      continue;
    }

    problemCount += 1;
    for (const race of activeRaces) {
      for (const heroClass of classes) {
        combinationCount += 1;
        const profile = {
          ...matrixCharacter,
          raceId: race.id,
          raceName: race.name,
          classId: heroClass.id,
          className: heroClass.name
        };
        const scene = buildAdventureResolutionScene({
          problemId,
          title: problemId,
          character: profile
        });
        const methods = resolveQuestMethodsForCharacter(scene, profile);
        const repeated = resolveQuestMethodsForCharacter(scene, profile);
        const sources = new Set(methods.map((method) => method.source));
        const context = `${problemId}:${race.id}:${heroClass.id}`;

        if (methods.map((method) => method.id).join("\0") !== repeated.map((method) => method.id).join("\0")) {
          failures.push(`${context}: non-deterministic method ids`);
        }
        if (methods.length < 5 || methods.length > 7) {
          failures.push(`${context}: method count ${methods.length} is outside 5..7`);
        }
        if (!sources.has("scene")) {
          failures.push(`${context}: missing scene method`);
        }
        if (new Set(methods.map((method) => normalize(method.label))).size !== methods.length) {
          failures.push(`${context}: duplicate normalized label`);
        }
        if (new Set(methods.map(getQuestMethodTacticKey)).size !== methods.length) {
          failures.push(`${context}: duplicate tactic`);
        }
        if (new Set(methods.map(getQuestMethodAffordanceKey)).size !== methods.length) {
          failures.push(`${context}: duplicate affordance`);
        }

        for (const primaryStat of ["strength", "dexterity", "intelligence", "charisma", "luck"] as const) {
          const statCount = methods.filter((method) => method.primaryStat === primaryStat).length;
          if (statCount > 2) {
            failures.push(`${context}: ${primaryStat} appears ${statCount} times`);
          }
        }
      }
    }
  }

  return { failures, combinationCount, problemCount };
}

export function getAdventureResolutionMatrixDimensions(): {
  problems: number;
  races: number;
  classes: number;
  combinations: number;
} {
  return {
    problems: ADVENTURE_PROBLEM_IDS.length,
    races: activeRaces.length,
    classes: classes.length,
    combinations: ADVENTURE_PROBLEM_IDS.length * activeRaces.length * classes.length
  };
}

const matrixCharacter = {
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

function normalize(label: string): string {
  return label.replace(/^[^\p{L}\p{N}]+/u, "").trim().toLocaleLowerCase("uk-UA");
}
