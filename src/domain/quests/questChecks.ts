import type { CharacterStats, StatKey } from "../characters/starterStats";
import { SeededRandomSource } from "../../shared/random";
import type {
  QuestMethodDefinition,
  QuestResolutionGrade,
  QuestRiskBand,
  QuestTechniqueId
} from "../../content/questResolution";
import { classTechniqueProfiles, raceTechniqueProfiles } from "../../content/questResolution";

export const QUEST_RISK_BAND_CHANCE_CAPS = {
  safe: 80,
  steady: 65,
  risky: 64,
  wild: 54
} as const satisfies Record<QuestRiskBand, number>;

export interface QuestCheckResult {
  version: "quest-check-v1";
  chance: number;
  roll: number;
  grade: QuestResolutionGrade;
  primaryStat: StatKey;
  secondaryStat?: StatKey;
  effectiveStatsSnapshot: CharacterStats;
}

export function resolveQuestCheck(input: {
  characterId: string;
  periodKey: string;
  sceneId: string;
  method: QuestMethodDefinition;
  stats: CharacterStats;
  raceId: string;
  classId: string;
}): QuestCheckResult {
  const chance = calculateQuestChance(input);
  const rng = new SeededRandomSource(
    `quest-resolution-v1:${input.characterId}:${input.periodKey}:${input.sceneId}:${input.method.id}`
  );
  const roll = rng.nextInt(1, 100);
  const strongSuccessThreshold = Math.max(5, Math.floor(chance * 0.2));
  const mixedSuccessThreshold = Math.min(96, chance + 15);
  const grade: QuestResolutionGrade =
    roll <= strongSuccessThreshold
      ? "strong-success"
      : roll <= chance
        ? "success"
        : roll <= mixedSuccessThreshold
          ? "mixed-success"
          : "complication";

  return {
    version: "quest-check-v1",
    chance,
    roll,
    grade,
    primaryStat: input.method.primaryStat,
    ...(input.method.secondaryStat ? { secondaryStat: input.method.secondaryStat } : {}),
    effectiveStatsSnapshot: { ...input.stats }
  };
}

export function calculateQuestChance(input: {
  method: QuestMethodDefinition;
  stats: CharacterStats;
  raceId: string;
  classId: string;
}): number {
  const { method, stats } = input;
  const primary = stats[method.primaryStat] ?? 0;
  const secondary = method.secondaryStat ? stats[method.secondaryStat] ?? 0 : 0;
  const primaryBonus = clamp((primary - 5) * 3, -9, 18);
  const secondaryBonus = method.secondaryStat ? clamp(secondary - 5, -3, 6) : 0;
  const classAffinity = supportsTechnique(
    classTechniqueProfiles[input.classId]?.techniques,
    method.techniques
  )
    ? 6
    : 0;
  const raceAffinity = supportsTechnique(
    raceTechniqueProfiles[input.raceId]?.techniques,
    method.techniques
  )
    ? 4
    : 0;
  const signatureAffinity = method.source === "signature" ? 3 : 0;
  const luckAdjustment =
    method.primaryStat === "luck"
      ? 0
      : clamp(Math.floor(((stats.luck ?? 0) - 5) / 2), -2, 4);
  const riskBand = deriveQuestRiskBand(method);
  const riskCap = QUEST_RISK_BAND_CHANCE_CAPS[riskBand];

  return clamp(
    Math.round(
      method.baseChance +
        primaryBonus +
        secondaryBonus +
        classAffinity +
        raceAffinity +
        signatureAffinity +
        luckAdjustment
    ),
    45,
    riskCap
  );
}

export function deriveQuestRiskBand(method: QuestMethodDefinition): QuestRiskBand {
  const complication = method.consequenceByGrade.complication;
  const hasRiskTechnique = method.techniques.some((technique) =>
    ["deception", "force", "improvisation", "traps"].includes(technique)
  );

  if (
    complication === "fight-handoff" ||
    complication === "serious-injury" ||
    complication === "local-failure" ||
    method.intent === "fight"
  ) {
    return "wild";
  }

  if (
    complication === "minor-injury" ||
    method.rewardProfile === "generous" ||
    method.intent === "deceive" ||
    hasRiskTechnique
  ) {
    return "risky";
  }

  if (method.goldCost || method.rewardProfile === "modest") {
    return "safe";
  }

  return "steady";
}

export function qualitativeQuestChance(chance: number): string {
  if (chance >= 80) return "майже надійно";
  if (chance >= 66) return "добрі шанси";
  if (chance >= 55) return "непевно";
  return "дуже непевно";
}

function supportsTechnique(
  supported: readonly QuestTechniqueId[] | undefined,
  methodTechniques: readonly QuestTechniqueId[]
): boolean {
  return Boolean(supported?.some((technique) => methodTechniques.includes(technique)));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
