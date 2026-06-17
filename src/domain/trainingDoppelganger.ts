import type { CharacterSummary } from "./characters/characterSummary";
import type { RandomSource } from "../shared/random";

export type TrainingDoppelgangerOutcome = "hero-wins" | "doppelganger-wins" | "draw";

export type TrainingDoppelgangerReason =
  | "matched-footwork"
  | "copy-read-notes"
  | "hero-found-gap"
  | "mutual-paperwork";

export interface TrainingDoppelgangerResolution {
  outcome: TrainingDoppelgangerOutcome;
  reason: TrainingDoppelgangerReason;
  heroScore: number;
  doppelgangerScore: number;
}

export function resolveTrainingDoppelgangerSparring(
  character: CharacterSummary,
  rng: RandomSource
): TrainingDoppelgangerResolution {
  const baseScore = getTrainingScore(character);
  const heroScore = baseScore + rng.nextInt(-8, 8);
  const doppelgangerScore = baseScore + rng.nextInt(-8, 8);
  const difference = heroScore - doppelgangerScore;
  const outcome =
    difference >= 3
      ? "hero-wins"
      : difference <= -3
        ? "doppelganger-wins"
        : "draw";

  return {
    outcome,
    reason: pickReason(outcome, rng),
    heroScore,
    doppelgangerScore
  };
}

function getTrainingScore(character: CharacterSummary): number {
  const effects = character.equipmentEffects;

  return (
    character.level * 10 +
    character.stats.strength * 2 +
    character.stats.dexterity * 2 +
    character.stats.intelligence +
    character.stats.charisma +
    character.stats.luck +
    Math.floor(character.hpMax / 4) +
    Math.floor(character.manaMax / 5) +
    (effects?.weaponDamage ?? 0) * 3 +
    (effects?.armor ?? 0) * 3 +
    (effects?.resist ?? 0) * 2 +
    (effects?.spellPower ?? 0) * 2
  );
}

function pickReason(
  outcome: TrainingDoppelgangerOutcome,
  rng: RandomSource
): TrainingDoppelgangerReason {
  if (outcome === "hero-wins") {
    return rng.nextInt(0, 1) === 0 ? "hero-found-gap" : "matched-footwork";
  }

  if (outcome === "doppelganger-wins") {
    return rng.nextInt(0, 1) === 0 ? "copy-read-notes" : "matched-footwork";
  }

  return rng.nextInt(0, 1) === 0 ? "mutual-paperwork" : "matched-footwork";
}
