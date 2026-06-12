import type { CharacterStats } from "../characters/starterStats";

export type CombatProbeAction = "attack" | "receipt" | "flee";
export type CombatProbeOutcome = "win" | "messy-win" | "flee";

export interface CombatProbeInput {
  heroLevel: number;
  heroStats: CharacterStats;
  heroHpCurrent: number;
  heroHpMax: number;
  action: CombatProbeAction;
}

export interface CombatProbeResult {
  action: CombatProbeAction;
  playerHpPreview: number;
  playerHpMaxPreview: number;
  enemyHpPreview: number;
  enemyHpMaxPreview: number;
  playerDamage: number;
  enemyDamage: number;
  outcome: CombatProbeOutcome;
}

export const MIMIC_SHAWARMA_HP = 14;

export function runCombatProbe(input: CombatProbeInput): CombatProbeResult {
  if (input.action === "flee") {
    return {
      action: input.action,
      playerHpPreview: clampHp(input.heroHpCurrent, input.heroHpMax),
      playerHpMaxPreview: safeMaxHp(input.heroHpMax),
      enemyHpPreview: MIMIC_SHAWARMA_HP,
      enemyHpMaxPreview: MIMIC_SHAWARMA_HP,
      playerDamage: 0,
      enemyDamage: 0,
      outcome: "flee"
    };
  }

  const playerDamage =
    input.action === "attack"
      ? 6 + Math.floor(input.heroStats.strength / 3) + Math.floor(input.heroLevel / 2)
      : 4 + Math.floor(input.heroStats.intelligence / 3) + Math.floor(input.heroStats.charisma / 4);
  const enemyDamage = input.action === "attack" ? 3 : 2;
  const maxHp = safeMaxHp(input.heroHpMax);

  return {
    action: input.action,
    playerHpPreview: Math.max(1, clampHp(input.heroHpCurrent, maxHp) - enemyDamage),
    playerHpMaxPreview: maxHp,
    enemyHpPreview: Math.max(0, MIMIC_SHAWARMA_HP - playerDamage),
    enemyHpMaxPreview: MIMIC_SHAWARMA_HP,
    playerDamage,
    enemyDamage,
    outcome: input.action === "attack" ? "win" : "messy-win"
  };
}

function safeMaxHp(value: number): number {
  return Math.max(1, Math.floor(value));
}

function clampHp(current: number, max: number): number {
  const safeMax = safeMaxHp(max);
  return Math.min(safeMax, Math.max(1, Math.floor(current)));
}
