import type { CharacterSummary } from "./characters/characterSummary";
import type { MonsterCombatStats } from "./combat";
import { getHpFullRegenSeconds } from "./resources/resourceRegeneration";
import type { RandomSource } from "../shared/random";

export const TRAINING_DOPPELGANGER_MONSTER_ID = "monster.training-doppelganger";

export interface TrainingDoppelgangerXpReward {
  xp: number;
  gold: 0;
}

export function buildTrainingDoppelgangerCombatStats(
  character: CharacterSummary
): MonsterCombatStats {
  const effects = character.equipmentEffects;

  return {
    monsterId: TRAINING_DOPPELGANGER_MONSTER_ID,
    level: character.level,
    hpMax: character.hpMax,
    attack:
      1 +
      Math.floor(character.level / 2) +
      Math.floor(character.stats.strength / 3) +
      (effects?.weaponDamage ?? 0),
    armor: Math.floor((character.stats.strength + character.stats.dexterity) / 10) + (effects?.armor ?? 0),
    resist: Math.floor((character.stats.intelligence + character.stats.charisma) / 10) + (effects?.resist ?? 0),
    dexterity: character.stats.dexterity + Math.floor(character.level / 2),
    tags: ["training", "doppelganger"]
  };
}

export function rollTrainingDoppelgangerXpReward(
  character: CharacterSummary,
  outcome: "won" | "lost",
  rng: RandomSource
): TrainingDoppelgangerXpReward {
  if (outcome === "lost") {
    return { xp: 1, gold: 0 };
  }

  const similarMonsterXp = Math.max(5, 3 + character.level * 2);
  const baseXp = Math.max(2, Math.floor(similarMonsterXp / 2));
  let bonusXp = 0;
  const chance = getLuckBonusChance(character.stats.luck);
  const maxXp = Math.max(baseXp, Math.ceil(similarMonsterXp * 0.65));

  for (let roll = 0; roll < 3; roll += 1) {
    if (rng.nextFloat() < chance) {
      bonusXp += 1;
    }
  }

  return {
    xp: Math.min(maxXp, baseXp + bonusXp),
    gold: 0
  };
}

export function getTrainingDoppelgangerRecoveryMs(input: {
  character: CharacterSummary;
  doppelgangerHp: number;
  doppelgangerHpMax: number;
}): number {
  const hpMax = Math.max(1, Math.floor(input.doppelgangerHpMax));
  const missingHp = Math.max(0, hpMax - Math.max(0, Math.floor(input.doppelgangerHp)));
  const fullRecoverySeconds = getHpFullRegenSeconds({
    raceId: input.character.raceId,
    classId: input.character.classId,
    title: input.character.title,
    stats: input.character.stats
  });
  const recoverySeconds = Math.ceil((missingHp * fullRecoverySeconds) / hpMax);

  return Math.max(60_000, recoverySeconds * 1000);
}

export function isTrainingDoppelgangerMonsterId(monsterId: string): boolean {
  return monsterId === TRAINING_DOPPELGANGER_MONSTER_ID;
}

function getLuckBonusChance(luck: number): number {
  return clamp(0.12 + Math.max(0, Math.floor(luck)) * 0.035, 0.12, 0.55);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
