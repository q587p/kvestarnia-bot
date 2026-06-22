import { monsters } from "../src/content/monsters";
import type { MonsterContent } from "../src/content/schema";
import {
  applyRecentOrdinaryMonsterExclusions,
  getPersistentFightDifficultyConfig,
  type PersistentFightDifficultyId
} from "../src/services/fightService";
import { SeededRandomSource } from "../src/shared/random";

const yegerTags = new Set(["undead", "ghost", "cursed", "unquiet"]);
const difficulties: PersistentFightDifficultyId[] = ["easy", "normal", "hard"];
const levels = parseLevels(process.argv.find((arg) => arg.startsWith("--levels="))?.slice("--levels=".length) ?? "3-13");
const runs = Number(process.argv.find((arg) => arg.startsWith("--runs="))?.slice("--runs=".length) ?? 100);
const seed = process.argv.find((arg) => arg.startsWith("--seed="))?.slice("--seed=".length) ?? "passage-encounters";

for (const level of levels) {
  for (const difficulty of difficulties) {
    const oldReport = simulate({ level, difficulty, runs, seed, policy: "old" });
    const newReport = simulate({ level, difficulty, runs, seed, policy: "new" });

    console.log([
      `level=${level}`,
      `difficulty=${difficulty}`,
      `pool=${newReport.poolSize}`,
      `unique20=${newReport.unique20}`,
      `unique50=${newReport.unique50}`,
      `unique100=${newReport.unique100}`,
      `oldImmediate=${percent(oldReport.immediateRepeatRate)}`,
      `newImmediate=${percent(newReport.immediateRepeatRate)}`,
      `oldLast3=${percent(oldReport.lastThreeRepeatRate)}`,
      `newLast3=${percent(newReport.lastThreeRepeatRate)}`,
      `oldYegerShare=${percent(oldReport.yegerShare)}`,
      `newYegerShare=${percent(newReport.yegerShare)}`,
      `fallbacks=${newReport.fallbacks}`
    ].join(" | "));
  }
}

function simulate(input: {
  level: number;
  difficulty: PersistentFightDifficultyId;
  runs: number;
  seed: string;
  policy: "old" | "new";
}): {
  poolSize: number;
  unique20: number;
  unique50: number;
  unique100: number;
  immediateRepeatRate: number;
  lastThreeRepeatRate: number;
  yegerShare: number;
  fallbacks: number;
} {
  const rng = new SeededRandomSource(`${input.seed}:${input.level}:${input.difficulty}:${input.policy}`);
  const picked: MonsterContent[] = [];
  const pool = selectCandidatePool(input.level, input.difficulty);
  let immediateRepeats = 0;
  let lastThreeRepeats = 0;
  let yegerRelevant = 0;
  let fallbacks = 0;

  for (let index = 0; index < input.runs; index += 1) {
    const recent = distinctRecent(picked.map((monster) => monster.id));
    const candidates = input.policy === "new"
      ? applyRecentOrdinaryMonsterExclusions(pool, recent)
      : pool;

    if (input.policy === "new" && candidates.length === pool.length && recent.length > 0) {
      fallbacks += 1;
    }

    const selected = candidates[rng.nextInt(0, candidates.length - 1)] ?? candidates[0];
    if (!selected) {
      throw new Error(`No candidates for level ${input.level} / ${input.difficulty}`);
    }

    if (picked.at(-1)?.id === selected.id) {
      immediateRepeats += 1;
    }
    if (picked.slice(-3).some((monster) => monster.id === selected.id)) {
      lastThreeRepeats += 1;
    }
    if (selected.tags.some((tag) => yegerTags.has(tag))) {
      yegerRelevant += 1;
    }
    picked.push(selected);
  }

  return {
    poolSize: pool.length,
    unique20: new Set(picked.slice(0, 20).map((monster) => monster.id)).size,
    unique50: new Set(picked.slice(0, 50).map((monster) => monster.id)).size,
    unique100: new Set(picked.slice(0, 100).map((monster) => monster.id)).size,
    immediateRepeatRate: immediateRepeats / Math.max(1, input.runs - 1),
    lastThreeRepeatRate: lastThreeRepeats / Math.max(1, input.runs - 1),
    yegerShare: yegerRelevant / Math.max(1, input.runs),
    fallbacks
  };
}

function selectCandidatePool(level: number, difficultyId: PersistentFightDifficultyId): MonsterContent[] {
  const difficulty = getPersistentFightDifficultyConfig(difficultyId);
  const maxMonsterLevel = Math.max(3, level);
  const eligible = monsters.filter((monster) => {
    const tags = new Set(monster.tags);
    return monster.id !== "monster.mimic-shawarma" && !tags.has("starter") && !tags.has("boss") && monster.level <= maxMonsterLevel;
  });

  if (difficulty.monsterLevelRangeOffset) {
    const min = Math.max(1, level + difficulty.monsterLevelRangeOffset.min);
    const max = Math.max(min, level + difficulty.monsterLevelRangeOffset.max);
    const ranged = eligible.filter((monster) => monster.level >= min && monster.level <= max);
    if (ranged.length > 0) {
      return ranged;
    }
  }

  const closeFloor = Math.max(1, level - 2);
  const close = eligible.filter((monster) => monster.level >= closeFloor);
  const candidates = close.length > 0 ? close : selectHighestLevel(eligible);
  if (candidates.length > 0) {
    return candidates;
  }

  const fallback = monsters.find((monster) => monster.id === "monster.deadline-spider");
  if (!fallback) {
    throw new Error("Missing deadline spider fallback.");
  }

  return [fallback];
}

function selectHighestLevel(candidates: MonsterContent[]): MonsterContent[] {
  const highest = candidates.reduce((max, monster) => Math.max(max, monster.level), 0);
  return candidates.filter((monster) => monster.level === highest);
}

function distinctRecent(ids: string[]): string[] {
  const result: string[] = [];
  for (const id of ids.slice().reverse()) {
    if (!result.includes(id)) {
      result.push(id);
    }
    if (result.length >= 3) {
      break;
    }
  }
  return result;
}

function parseLevels(raw: string): number[] {
  const range = raw.match(/^(\d+)-(\d+)$/);
  if (range) {
    const start = Number(range[1]);
    const end = Number(range[2]);
    return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
  }

  return raw.split(",").map((value) => Number(value.trim())).filter((value) => Number.isInteger(value) && value > 0);
}

function percent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}
