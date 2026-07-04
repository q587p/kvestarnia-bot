export const CLASS_NONCOMBAT_MIN_LEVEL = 3;
export const PRIEST_DIRECT_HEAL_TECHNIQUE_ID = "technique.class.priest.direct-heal";
export const PRIEST_DIRECT_BLESSING_TECHNIQUE_ID = "technique.class.priest.direct-blessing";
export const ROGUE_PICKPOCKET_TECHNIQUE_ID = "technique.class.rogue.pickpocket";
export const CLASS_NONCOMBAT_RULES_VERSION = "class-noncombat-priest-rogue-v1";
export const PRIEST_DIRECT_AID_COOLDOWN_MINUTES = 93;
export const PRIEST_BLESSING_DURATION_MINUTES = 13;
export const ROGUE_PICKPOCKET_COOLDOWN_MINUTES = 93;
export const ROGUE_PICKPOCKET_MAX_STOLEN_GOLD = 13;
const PRIEST_BLESSING_MANA_COST_BY_BONUS = [8, 12, 16, 20, 23] as const;

export type RoguePickpocketOutcome =
  | "clean-success"
  | "noticed-success"
  | "empty"
  | "noticed-failure"
  | "caught-badly";

export interface PriestHealPlan {
  heal: number;
  manaCost: number;
}

export interface PriestBlessingPlan {
  bonusAmount: number;
  manaCost: number;
  levelDiff: number;
}

export interface RoguePickpocketPlan {
  outcome: RoguePickpocketOutcome;
  baseGold: number;
  bonusGold: number;
  stolenGold: number;
  levelDiff: number;
  power: number;
}

export function buildPriestHealPlan(input: {
  missingHp: number;
  charisma: number;
  intelligence: number;
  level: number;
}): PriestHealPlan {
  const missingHp = Math.max(0, Math.floor(input.missingHp));
  const rawHeal =
    3 +
    Math.floor((Math.max(0, Math.floor(input.charisma)) + Math.max(0, Math.floor(input.intelligence))) / 3) +
    Math.floor(Math.max(1, Math.floor(input.level)) / 2);
  const heal = Math.min(missingHp, Math.max(0, rawHeal));

  return {
    heal,
    manaCost: clamp(heal, 0, 13)
  };
}

export function buildPriestBlessingPlan(input: {
  priestLevel: number;
  priestIntelligence: number;
  targetLevel: number;
}): PriestBlessingPlan {
  const priestLevel = Math.max(1, Math.floor(input.priestLevel));
  const targetLevel = Math.max(1, Math.floor(input.targetLevel));
  const intelligence = Math.max(0, Math.floor(input.priestIntelligence));
  const levelDiff = clamp(priestLevel - targetLevel, -13, 13);
  const bonusAmount = clamp(
    1 + Math.floor(Math.max(0, intelligence - 8) / 3) + Math.floor(levelDiff / 4),
    1,
    5
  );

  return {
    bonusAmount,
    manaCost: PRIEST_BLESSING_MANA_COST_BY_BONUS[bonusAmount - 1] ?? PRIEST_BLESSING_MANA_COST_BY_BONUS[4],
    levelDiff
  };
}

export function buildRoguePickpocketPlan(input: {
  rogueDexterity: number;
  rogueLuck: number;
  rogueLevel: number;
  targetLevel: number;
  targetGold: number;
  baseRoll: number;
  outcomeRoll: number;
}): RoguePickpocketPlan {
  const rogueLevel = Math.max(1, Math.floor(input.rogueLevel));
  const targetLevel = Math.max(1, Math.floor(input.targetLevel));
  const targetGold = Math.max(0, Math.floor(input.targetGold));
  const levelDiff = clamp(rogueLevel - targetLevel, -13, 13);
  const baseGold = 1 + clamp(Math.floor(input.baseRoll), 0, 4);
  const bonusGold = Math.max(0, Math.floor((Math.max(0, Math.floor(input.rogueLuck)) + Math.max(0, levelDiff)) / 7));
  const power =
    Math.max(0, Math.floor(input.rogueDexterity)) +
    Math.max(0, Math.floor(input.rogueLuck)) +
    levelDiff +
    clamp(Math.floor(input.outcomeRoll), -13, 13);
  const outcome = targetGold <= 0 ? "empty" : getPickpocketOutcome(power);
  const stolenGold =
    outcome === "clean-success" || outcome === "noticed-success"
      ? Math.min(ROGUE_PICKPOCKET_MAX_STOLEN_GOLD, targetGold, baseGold + bonusGold)
      : 0;

  return {
    outcome: stolenGold <= 0 && (outcome === "clean-success" || outcome === "noticed-success")
      ? "empty"
      : outcome,
    baseGold,
    bonusGold,
    stolenGold,
    levelDiff,
    power
  };
}

function getPickpocketOutcome(power: number): RoguePickpocketOutcome {
  if (power >= 24) {
    return "clean-success";
  }
  if (power >= 16) {
    return "noticed-success";
  }
  if (power >= 8) {
    return "empty";
  }
  if (power >= 0) {
    return "noticed-failure";
  }

  return "caught-badly";
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
