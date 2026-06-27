import { classes } from "../content/classes";
import { items } from "../content/items";
import { activeRaces } from "../content/races";
import type { ItemContent, Pronoun } from "../content/schema";
import { isClassAvailableForChoice } from "../content/characterOptions";
import type { CharacterSummary } from "./characters/characterSummary";
import { summarizeCharacter } from "./characters/characterSummary";
import { buildStarterStats } from "./characters/starterStats";
import {
  getCombatRaceAbilityProfile,
  getCombatSkillProfile,
  type CombatCopiedEquipment,
  type CombatState,
  type MonsterCombatStats
} from "./combat";
import { getHpFullRegenSeconds } from "./resources/resourceRegeneration";
import type { RandomSource } from "../shared/random";

export const TRAINING_DOPPELGANGER_MONSTER_ID = "monster.training-doppelganger";
export const TRAINING_DOPPELGANGER_MIN_LEVEL = 3;

export interface TrainingDoppelgangerXpReward {
  xp: number;
  gold: 0;
}

export type TrainingDoppelgangerSpawnMode =
  | "COPY_TARGET"
  | "RANDOM_BUILD"
  | "COPY_CHAMPION_DAY"
  | "COPY_CHAMPION_WEEK"
  | "COPY_CHAMPION_MONTH"
  | "WEIGHTED_RANDOM";

export interface TrainingDoppelgangerSpawnWeights {
  COPY_TARGET?: number;
  RANDOM_BUILD?: number;
}

export interface TrainingDoppelgangerSpawnConfig {
  mode?: TrainingDoppelgangerSpawnMode;
  weights?: TrainingDoppelgangerSpawnWeights;
  championFallbackMode?: "COPY_TARGET" | "RANDOM_BUILD";
}

export interface TrainingDoppelgangerBuildOptions {
  equippedItems?: readonly ItemContent[];
  rng?: RandomSource;
  spawnConfig?: TrainingDoppelgangerSpawnConfig;
}

export interface TrainingDoppelgangerSpawn {
  mode: "COPY_TARGET" | "RANDOM_BUILD";
  source: "target" | "random-build" | "champion-fallback";
  character: CharacterSummary;
  monster: MonsterCombatStats;
}

export function buildTrainingDoppelgangerCombatStats(
  character: CharacterSummary,
  options: TrainingDoppelgangerBuildOptions = {}
): MonsterCombatStats {
  return buildTrainingDoppelgangerSpawn(character, options).monster;
}

export function buildTrainingDoppelgangerSpawn(
  source: CharacterSummary,
  options: TrainingDoppelgangerBuildOptions = {}
): TrainingDoppelgangerSpawn {
  const mode = resolveTrainingDoppelgangerSpawnMode(options.spawnConfig, options.rng);
  const sourceKind = mode.startsWith("COPY_CHAMPION") ? "champion-fallback" : undefined;
  const championPeriod = getChampionPeriodFromSpawnMode(mode);
  const effectiveMode =
    mode === "RANDOM_BUILD" || (mode.startsWith("COPY_CHAMPION") && options.spawnConfig?.championFallbackMode === "RANDOM_BUILD")
      ? "RANDOM_BUILD"
      : "COPY_TARGET";
  const equippedItems =
    effectiveMode === "RANDOM_BUILD"
      ? buildRandomDoppelgangerEquipment(options.rng)
      : options.equippedItems ?? [];
  const character =
    effectiveMode === "RANDOM_BUILD"
      ? buildRandomDoppelgangerCharacter(source, equippedItems, options.rng)
      : source;
  const monster = buildTrainingDoppelgangerMonsterStats(character, {
    equippedItems,
    spawnMode: mode,
    source: sourceKind ?? (effectiveMode === "RANDOM_BUILD" ? "random-build" : "target"),
    ...(championPeriod ? { championPeriod, championName: source.name } : {})
  });

  return {
    mode: effectiveMode,
    source: sourceKind ?? (effectiveMode === "RANDOM_BUILD" ? "random-build" : "target"),
    character,
    monster
  };
}

export function buildTrainingDoppelgangerCombatStatsFromState(
  state: CombatState,
  fallback: CharacterSummary
): MonsterCombatStats {
  return {
    monsterId: state.monster.id,
    name: state.monster.name ?? "Сумлінний Допельґанґер",
    level: state.monster.level ?? fallback.level,
    hpMax: state.monster.hpMax,
    attack:
      state.monster.attack ??
      buildTrainingDoppelgangerCombatStats(fallback).attack,
    armor: state.monster.armor ?? 0,
    resist: state.monster.resist ?? 0,
    dexterity: state.monster.dexterity ?? fallback.stats.dexterity + Math.floor(fallback.level / 2),
    ...(state.monster.classId ? { classId: state.monster.classId } : {}),
    ...(state.monster.className ? { className: state.monster.className } : {}),
    ...(state.monster.raceId ? { raceId: state.monster.raceId } : {}),
    ...(state.monster.raceName ? { raceName: state.monster.raceName } : {}),
    ...(state.monster.title ? { title: state.monster.title } : {}),
    ...(state.monster.spellPower ? { spellPower: state.monster.spellPower } : {}),
    ...(state.monster.copiedEquipment ? { copiedEquipment: state.monster.copiedEquipment } : {}),
    ...(state.monster.debugTrace ? { debugTrace: state.monster.debugTrace } : {}),
    tags: ["training", "doppelganger"]
  };
}

function buildTrainingDoppelgangerMonsterStats(
  character: CharacterSummary,
  options: {
    equippedItems: readonly ItemContent[];
    spawnMode: TrainingDoppelgangerSpawnMode;
    source: "target" | "random-build" | "champion-fallback";
    championPeriod?: "day" | "week" | "month";
    championName?: string;
  }
): MonsterCombatStats {
  const effects = character.equipmentEffects;
  const copiedEquipment = buildCopiedEquipmentSummary(options.equippedItems);
  const appliedEffectKeys = [...new Set(copiedEquipment.flatMap((item) => item.effectKeys))].sort();
  const raceAbility = getCombatRaceAbilityProfile(character.raceId);

  return {
    monsterId: TRAINING_DOPPELGANGER_MONSTER_ID,
    name: "Сумлінний Допельґанґер",
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
    classId: character.classId,
    className: character.className,
    raceId: character.raceId,
    raceName: character.raceName,
    title: character.title,
    spellPower: effects?.spellPower ?? 0,
    copiedEquipment,
    debugTrace: {
      spawnMode: options.spawnMode,
      source: options.source,
      ...(options.championPeriod ? { championPeriod: options.championPeriod } : {}),
      ...(options.championName ? { championName: options.championName } : {}),
      copiedEquipmentCount: copiedEquipment.length,
      appliedEffectKeys,
      legalAbilityIds: [
        getCombatSkillProfile(character.classId).id,
        ...(raceAbility ? [raceAbility.id] : [])
      ]
    },
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

function resolveTrainingDoppelgangerSpawnMode(
  config: TrainingDoppelgangerSpawnConfig | undefined,
  rng: RandomSource | undefined
): TrainingDoppelgangerSpawnMode {
  const mode = config?.mode ?? "COPY_TARGET";

  if (mode !== "WEIGHTED_RANDOM") {
    return mode;
  }

  const copyWeight = Math.max(0, Math.floor(config?.weights?.COPY_TARGET ?? 70));
  const randomWeight = Math.max(0, Math.floor(config?.weights?.RANDOM_BUILD ?? 30));
  const totalWeight = copyWeight + randomWeight;

  if (totalWeight <= 0) {
    return "COPY_TARGET";
  }

  const roll = rng ? rng.nextInt(1, totalWeight) : 1;

  return roll <= copyWeight ? "COPY_TARGET" : "RANDOM_BUILD";
}

function getChampionPeriodFromSpawnMode(
  mode: TrainingDoppelgangerSpawnMode
): "day" | "week" | "month" | null {
  if (mode === "COPY_CHAMPION_DAY") {
    return "day";
  }

  if (mode === "COPY_CHAMPION_WEEK") {
    return "week";
  }

  if (mode === "COPY_CHAMPION_MONTH") {
    return "month";
  }

  return null;
}

function buildRandomDoppelgangerCharacter(
  source: CharacterSummary,
  equippedItems: readonly ItemContent[],
  rng: RandomSource | undefined
): CharacterSummary {
  const combo = pickRandomValidCombo(rng);
  const starter = buildStarterStats(combo.raceId, combo.classId);

  return summarizeCharacter(
    {
      name: "Сумлінний Допельґанґер",
      pronoun: combo.pronoun,
      path: source.path,
      raceId: combo.raceId,
      classId: combo.classId,
      level: source.level,
      xp: source.xp,
      gold: 0,
      hpCurrent: starter.hpCurrent,
      hpMax: starter.hpMax,
      manaCurrent: starter.manaCurrent,
      manaMax: starter.manaMax,
      statsJson: starter.stats
    },
    { equippedItems: [...equippedItems] }
  );
}

function pickRandomValidCombo(rng: RandomSource | undefined): {
  pronoun: Pronoun;
  raceId: string;
  classId: string;
} {
  const combos = (["he", "she", "they"] as const).flatMap((pronoun) =>
    activeRaces.flatMap((race) =>
      classes
        .filter((characterClass) => isClassAvailableForChoice(pronoun, race.id, characterClass.id))
        .map((characterClass) => ({
          pronoun,
          raceId: race.id,
          classId: characterClass.id
        }))
    )
  );

  return combos[(rng ? rng.nextInt(0, combos.length - 1) : 0)] ?? {
    pronoun: "they",
    raceId: "race.human-ish",
    classId: "class.warrior"
  };
}

function buildRandomDoppelgangerEquipment(rng: RandomSource | undefined): ItemContent[] {
  return (["weapon", "armor", "accessory"] as const)
    .map((slot) => {
      const candidates = items.filter((item) => item.slot === slot && item.effect);

      if (candidates.length === 0) {
        return null;
      }

      return candidates[(rng ? rng.nextInt(0, candidates.length - 1) : 0)] ?? null;
    })
    .filter((item): item is ItemContent => item !== null);
}

function buildCopiedEquipmentSummary(items: readonly ItemContent[]): CombatCopiedEquipment[] {
  return items
    .filter((item) => item.effect && ["weapon", "armor", "accessory"].includes(item.slot))
    .map((item) => ({
      sourceItemId: item.id,
      name: item.name,
      slot: item.slot,
      effectKeys: Object.keys(item.effect ?? {}).sort()
    }));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
