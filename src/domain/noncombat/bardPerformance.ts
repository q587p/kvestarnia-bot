export const BARD_PERFORMANCE_TECHNIQUE_ID = "technique.class.bard.shynok-performance";
export const BARD_PERFORMANCE_RULES_VERSION = "bard-performance-v1";
export const BARD_PERFORMANCE_MIN_LEVEL = 3;
export const BARD_PERFORMANCE_COOLDOWN_MINUTES = 93;
export const BARD_PERFORMANCE_WINDOW_MINUTES = 13;
export const BARD_PERFORMANCE_DAILY_HOUSE_CAP_GOLD = 23;
export const BARD_PERFORMANCE_TIP_OPTIONS = [1, 3, 5, 13] as const;

export type BardPerformanceGrade = "rough" | "pleasant" | "memorable" | "legendary";
export type BardPerformanceTipAmount = typeof BARD_PERFORMANCE_TIP_OPTIONS[number];

export interface BardPerformanceCheckInput {
  charisma: number;
  luck: number;
  level: number;
  roll: number;
}

export interface BardPerformancePlan {
  techniqueId: typeof BARD_PERFORMANCE_TECHNIQUE_ID;
  rulesVersion: typeof BARD_PERFORMANCE_RULES_VERSION;
  grade: BardPerformanceGrade;
  power: number;
  rawHousePayoutGold: number;
  roleActionXp: 0;
}

export function rollBardPerformanceCheck(
  input: { charisma: number; luck: number; level: number },
  rng: { nextInt(minInclusive: number, maxInclusive: number): number }
): BardPerformancePlan {
  const roll = rng.nextInt(-6, 6);

  return buildBardPerformancePlan({
    charisma: input.charisma,
    luck: input.luck,
    level: input.level,
    roll
  });
}

export function buildBardPerformancePlan(input: BardPerformanceCheckInput): BardPerformancePlan {
  const power =
    2 * Math.max(0, Math.floor(input.charisma)) +
    Math.max(0, Math.floor(input.luck)) +
    Math.max(1, Math.floor(input.level)) +
    Math.max(-6, Math.min(6, Math.floor(input.roll)));
  const grade = getBardPerformanceGrade(power);

  return {
    techniqueId: BARD_PERFORMANCE_TECHNIQUE_ID,
    rulesVersion: BARD_PERFORMANCE_RULES_VERSION,
    grade,
    power,
    rawHousePayoutGold: getBardPerformanceHousePayout(grade),
    roleActionXp: 0
  };
}

export function getBardPerformanceGrade(power: number): BardPerformanceGrade {
  if (power >= 44) {
    return "legendary";
  }
  if (power >= 34) {
    return "memorable";
  }
  if (power >= 24) {
    return "pleasant";
  }

  return "rough";
}

export function getBardPerformanceHousePayout(grade: BardPerformanceGrade): number {
  switch (grade) {
    case "legendary":
      return 13;
    case "memorable":
      return 5;
    case "pleasant":
      return 3;
    case "rough":
      return 1;
  }
}

export function applyBardPerformanceDailyHouseCap(
  requestedGold: number,
  alreadyPaidGold: number
): number {
  const remaining = Math.max(0, BARD_PERFORMANCE_DAILY_HOUSE_CAP_GOLD - Math.max(0, Math.floor(alreadyPaidGold)));

  return Math.min(remaining, Math.max(0, Math.floor(requestedGold)));
}

export function isBardPerformanceTipAmount(value: number): value is BardPerformanceTipAmount {
  return BARD_PERFORMANCE_TIP_OPTIONS.includes(value as BardPerformanceTipAmount);
}
