import type { CharacterSummary } from "../characters/characterSummary";
import type { RandomSource } from "../../shared/random";

export type DuelOutcomeSide = "challenger" | "target" | "draw";

export interface DuelResolveInput {
  challenger: DuelistSummary;
  target: DuelistSummary;
  rng: RandomSource;
}

export interface DuelistSummary extends CharacterSummary {
  id: string;
}

export interface DuelResolveResult {
  outcome: DuelOutcomeSide;
  winnerCharacterId: string | null;
  loserCharacterId: string | null;
  challengerScore: number;
  targetScore: number;
  swing: number;
  flavorKey: DuelFlavorKey;
}

export type DuelFlavorKey =
  | "direct-hit"
  | "clever-trick"
  | "lucky-upset"
  | "paperwork-stall"
  | "dramatic-draw";

const DRAW_MARGIN = 3;

export function resolveQuickDuel(input: DuelResolveInput): DuelResolveResult {
  const challengerBase = scoreDuelist(input.challenger);
  const targetBase = scoreDuelist(input.target);
  const swing = input.rng.nextInt(-12, 12);
  const challengerScore = challengerBase + swing;
  const targetScore = targetBase - swing;
  const delta = challengerScore - targetScore;

  if (Math.abs(delta) <= DRAW_MARGIN) {
    return {
      outcome: "draw",
      winnerCharacterId: null,
      loserCharacterId: null,
      challengerScore,
      targetScore,
      swing,
      flavorKey: "dramatic-draw"
    };
  }

  const challengerWins = delta > 0;
  const winner = challengerWins ? input.challenger : input.target;
  const loser = challengerWins ? input.target : input.challenger;

  return {
    outcome: challengerWins ? "challenger" : "target",
    winnerCharacterId: winner.id,
    loserCharacterId: loser.id,
    challengerScore,
    targetScore,
    swing,
    flavorKey: pickFlavorKey(winner, loser, Math.abs(swing))
  };
}

function scoreDuelist(character: DuelistSummary): number {
  const stats = character.stats;
  const effects = character.equipmentEffects;

  return Math.round(
    character.level * 10 +
      character.hpMax * 0.18 +
      character.manaMax * 0.08 +
      stats.strength * 1.2 +
      stats.dexterity * 1.15 +
      stats.intelligence * 0.85 +
      stats.charisma * 0.8 +
      stats.luck * 0.9 +
      (effects?.weaponDamage ?? 0) * 2.2 +
      (effects?.armor ?? 0) * 1.7 +
      (effects?.spellPower ?? 0) * 1.9 +
      (effects?.resist ?? 0) * 1.2
  );
}

function pickFlavorKey(
  winner: DuelistSummary,
  loser: DuelistSummary,
  swing: number
): DuelFlavorKey {
  if (swing >= 9 && winner.level <= loser.level) {
    return "lucky-upset";
  }

  if (winner.classId === "class.bureaucramancer" || winner.stats.intelligence >= winner.stats.strength + 3) {
    return "paperwork-stall";
  }

  if (winner.stats.charisma >= winner.stats.strength + 3 || winner.classId === "class.bard") {
    return "clever-trick";
  }

  return "direct-hit";
}
