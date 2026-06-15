import type { CharacterStats } from "../characters/starterStats";

export const HP_BASE_FULL_REGEN_SECONDS = 10 * 60;
export const HP_MIN_FULL_REGEN_SECONDS = 5 * 60;
export const HP_MAX_FULL_REGEN_SECONDS = 13 * 60;
export const MANA_BASE_FULL_REGEN_SECONDS = 9 * 60;
export const MANA_MIN_FULL_REGEN_SECONDS = 4 * 60;
export const MANA_MAX_FULL_REGEN_SECONDS = 13 * 60;

export interface CharacterResourceProfile {
  raceId: string;
  classId: string;
  title?: string;
  stats: CharacterStats;
}

export interface CharacterResourceState {
  hpCurrent: number;
  hpMax: number;
  manaCurrent: number;
  manaMax: number;
  hpRegenAt?: Date | null;
  manaRegenAt?: Date | null;
}

export interface ResourceRecoveryEstimate {
  hpSecondsToFull: number;
  manaSecondsToFull: number;
  hpFullAt: Date | null;
  manaFullAt: Date | null;
}

export interface ResourceRegenerationResult {
  resources: Required<CharacterResourceState>;
  recovery: ResourceRecoveryEstimate;
  changed: boolean;
  hpFullRegenSeconds: number;
  manaFullRegenSeconds: number;
}

export function applyPassiveResourceRegeneration(input: {
  resources: CharacterResourceState;
  profile: CharacterResourceProfile;
  now: Date;
}): ResourceRegenerationResult {
  const hpMax = safePositiveInt(input.resources.hpMax);
  const manaMax = safeNonNegativeInt(input.resources.manaMax);
  const hpFullRegenSeconds = getHpFullRegenSeconds(input.profile);
  const manaFullRegenSeconds = getManaFullRegenSeconds(input.profile);
  const hp = regenerateResource({
    current: input.resources.hpCurrent,
    max: hpMax,
    ...(input.resources.hpRegenAt === undefined ? {} : { marker: input.resources.hpRegenAt }),
    now: input.now,
    fullRegenSeconds: hpFullRegenSeconds
  });
  const mana = regenerateResource({
    current: input.resources.manaCurrent,
    max: manaMax,
    ...(input.resources.manaRegenAt === undefined ? {} : { marker: input.resources.manaRegenAt }),
    now: input.now,
    fullRegenSeconds: manaFullRegenSeconds
  });

  return {
    resources: {
      hpCurrent: hp.current,
      hpMax,
      manaCurrent: mana.current,
      manaMax,
      hpRegenAt: hp.marker,
      manaRegenAt: mana.marker
    },
    recovery: {
      hpSecondsToFull: getSecondsToFull(hp.current, hpMax, hpFullRegenSeconds),
      manaSecondsToFull: getSecondsToFull(mana.current, manaMax, manaFullRegenSeconds),
      hpFullAt: hp.current >= hpMax ? null : addSeconds(input.now, getSecondsToFull(hp.current, hpMax, hpFullRegenSeconds)),
      manaFullAt:
        mana.current >= manaMax
          ? null
          : addSeconds(input.now, getSecondsToFull(mana.current, manaMax, manaFullRegenSeconds))
    },
    changed: hp.changed || mana.changed,
    hpFullRegenSeconds,
    manaFullRegenSeconds
  };
}

export function getHpFullRegenSeconds(profile: CharacterResourceProfile): number {
  return clampSeconds(
    HP_BASE_FULL_REGEN_SECONDS +
      getClassHpModifier(profile.classId) +
      getRaceHpModifier(profile.raceId) +
      getTitleHpModifier(profile.title) -
      getStatAcceleration(profile.stats.strength),
    HP_MIN_FULL_REGEN_SECONDS,
    HP_MAX_FULL_REGEN_SECONDS
  );
}

export function getManaFullRegenSeconds(profile: CharacterResourceProfile): number {
  return clampSeconds(
    MANA_BASE_FULL_REGEN_SECONDS +
      getClassManaModifier(profile.classId) +
      getRaceManaModifier(profile.raceId) +
      getTitleManaModifier(profile.title) -
      getStatAcceleration(profile.stats.intelligence),
    MANA_MIN_FULL_REGEN_SECONDS,
    MANA_MAX_FULL_REGEN_SECONDS
  );
}

function regenerateResource(input: {
  current: number;
  max: number;
  marker?: Date | null;
  now: Date;
  fullRegenSeconds: number;
}): { current: number; marker: Date; changed: boolean } {
  const current = clampResource(input.current, input.max);
  const marker = input.marker ?? input.now;

  if (input.max <= 0) {
    return {
      current: 0,
      marker: input.now,
      changed: current !== 0 || marker.getTime() !== input.now.getTime()
    };
  }

  if (current >= input.max) {
    return {
      current: input.max,
      marker: input.now,
      changed: current !== input.max || marker.getTime() !== input.now.getTime()
    };
  }

  const elapsedSeconds = Math.max(0, (input.now.getTime() - marker.getTime()) / 1000);
  const pointsPerSecond = input.max / input.fullRegenSeconds;
  const restored = Math.floor(elapsedSeconds * pointsPerSecond);

  if (restored <= 0) {
    return {
      current,
      marker,
      changed: current !== input.current
    };
  }

  const nextCurrent = Math.min(input.max, current + restored);

  if (nextCurrent >= input.max) {
    return {
      current: input.max,
      marker: input.now,
      changed: true
    };
  }

  return {
    current: nextCurrent,
    marker: addSeconds(marker, restored / pointsPerSecond),
    changed: true
  };
}

function getSecondsToFull(current: number, max: number, fullRegenSeconds: number): number {
  const safeCurrent = clampResource(current, max);

  if (max <= 0 || safeCurrent >= max) {
    return 0;
  }

  return Math.ceil(((max - safeCurrent) * fullRegenSeconds) / max);
}

function getClassHpModifier(classId: string): number {
  switch (classId) {
    case "class.warrior":
      return -60;
    case "class.priest":
    case "class.ranger":
    case "class.kharakternyk":
      return -30;
    case "class.mage":
    case "class.varenyk-mancer":
      return 30;
    default:
      return 0;
  }
}

function getClassManaModifier(classId: string): number {
  switch (classId) {
    case "class.mage":
      return -75;
    case "class.bureaucramancer":
    case "class.varenyk-mancer":
      return -45;
    case "class.priest":
    case "class.bard":
    case "class.kharakternyk":
      return -30;
    case "class.warrior":
      return 30;
    default:
      return 0;
  }
}

function getRaceHpModifier(raceId: string): number {
  switch (raceId) {
    case "race.dwarf":
    case "race.intellectual-orc":
      return -45;
    case "race.drantohor":
    case "race.domovyk":
      return -20;
    case "race.dryland-rusalka":
      return 20;
    default:
      return 0;
  }
}

function getRaceManaModifier(raceId: string): number {
  switch (raceId) {
    case "race.dryland-rusalka":
    case "race.molfar-soul":
      return -45;
    case "race.elf":
    case "race.bisyny":
      return -20;
    case "race.dwarf":
      return 30;
    default:
      return 0;
  }
}

function getTitleHpModifier(title: string | undefined): number {
  if (!title) {
    return 0;
  }
  const normalized = title.toLocaleLowerCase("uk-UA");

  if (normalized.includes("удар") || normalized.includes("щит") || normalized.includes("стійк")) {
    return -15;
  }

  return 0;
}

function getTitleManaModifier(title: string | undefined): number {
  if (!title) {
    return 0;
  }
  const normalized = title.toLocaleLowerCase("uk-UA");

  if (
    normalized.includes("канцеляр") ||
    normalized.includes("оберіг") ||
    normalized.includes("мольфар")
  ) {
    return -15;
  }

  return 0;
}

function getStatAcceleration(stat: number): number {
  return Math.max(-30, Math.min(90, (Math.floor(stat) - 6) * 10));
}

function clampSeconds(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function clampResource(current: number, max: number): number {
  const safeMax = safeNonNegativeInt(max);

  if (safeMax === 0) {
    return 0;
  }

  return Math.min(safeMax, Math.max(0, Math.floor(current)));
}

function safePositiveInt(value: number): number {
  return Math.max(1, Math.floor(value));
}

function safeNonNegativeInt(value: number): number {
  return Math.max(0, Math.floor(value));
}

function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + Math.ceil(seconds * 1000));
}
