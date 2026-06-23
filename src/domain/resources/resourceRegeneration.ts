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

export interface ResourceRegenerationMultiplierWindow {
  startsAt: Date;
  expiresAt: Date;
  multiplierBp: number;
}

export function applyPassiveResourceRegeneration(input: {
  resources: CharacterResourceState;
  profile: CharacterResourceProfile;
  now: Date;
  multiplierWindow?: ResourceRegenerationMultiplierWindow | null;
  multiplierWindows?: ResourceRegenerationMultiplierWindow[];
}): ResourceRegenerationResult {
  const hpMax = safePositiveInt(input.resources.hpMax);
  const manaMax = safeNonNegativeInt(input.resources.manaMax);
  const hpFullRegenSeconds = getHpFullRegenSeconds(input.profile);
  const manaFullRegenSeconds = getManaFullRegenSeconds(input.profile);
  const multiplierWindows = getMultiplierWindows(input);
  const hp = regenerateResource({
    current: input.resources.hpCurrent,
    max: hpMax,
    ...(input.resources.hpRegenAt === undefined ? {} : { marker: input.resources.hpRegenAt }),
    now: input.now,
    fullRegenSeconds: hpFullRegenSeconds,
    ...(multiplierWindows ? { multiplierWindows } : {})
  });
  const mana = regenerateResource({
    current: input.resources.manaCurrent,
    max: manaMax,
    ...(input.resources.manaRegenAt === undefined ? {} : { marker: input.resources.manaRegenAt }),
    now: input.now,
    fullRegenSeconds: manaFullRegenSeconds,
    ...(multiplierWindows ? { multiplierWindows } : {})
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
  multiplierWindows?: ResourceRegenerationMultiplierWindow[];
}): { current: number; marker: Date; changed: boolean } {
  const current = clampResource(input.current, input.max);
  const markerWasMissing = input.marker == null;
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
      marker,
      changed: input.current !== input.max
    };
  }

  const restored = calculateRestoredPoints({
    from: marker,
    to: input.now,
    max: input.max,
    fullRegenSeconds: input.fullRegenSeconds,
    ...(input.multiplierWindows ? { multiplierWindows: input.multiplierWindows } : {})
  });

  if (restored <= 0) {
    return {
      current,
      marker,
      changed: current !== input.current || markerWasMissing
    };
  }

  const pointsPerSecond = input.max / input.fullRegenSeconds;
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
    marker: advanceMarkerByRestoredPoints({
      from: marker,
      to: input.now,
      max: input.max,
      fullRegenSeconds: input.fullRegenSeconds,
      restored,
      ...(input.multiplierWindows ? { multiplierWindows: input.multiplierWindows } : {})
    }) ?? addSeconds(marker, restored / pointsPerSecond),
    changed: true
  };
}

function calculateRestoredPoints(input: {
  from: Date;
  to: Date;
  max: number;
  fullRegenSeconds: number;
  multiplierWindows?: ResourceRegenerationMultiplierWindow[];
}): number {
  const weightedUnits = getRegenerationSegments({
    from: input.from,
    to: input.to,
    ...(input.multiplierWindows ? { multiplierWindows: input.multiplierWindows } : {})
  }).reduce((sum, segment) => {
    const elapsedMs = Math.max(0, segment.to.getTime() - segment.from.getTime());
    const multiplierBp = Math.max(0, Math.floor(segment.multiplierBp));

    return sum + BigInt(elapsedMs) * BigInt(input.max) * BigInt(multiplierBp);
  }, 0n);
  const denominator = BigInt(input.fullRegenSeconds) * 1000n * 10000n;

  return denominator <= 0n ? 0 : Number(weightedUnits / denominator);
}

function advanceMarkerByRestoredPoints(input: {
  from: Date;
  to: Date;
  max: number;
  fullRegenSeconds: number;
  restored: number;
  multiplierWindows?: ResourceRegenerationMultiplierWindow[];
}): Date | null {
  let remainingUnits = BigInt(input.restored) * BigInt(input.fullRegenSeconds) * 1000n * 10000n;

  if (remainingUnits <= 0n) {
    return input.from;
  }

  for (const segment of getRegenerationSegments({
    from: input.from,
    to: input.to,
    ...(input.multiplierWindows ? { multiplierWindows: input.multiplierWindows } : {})
  })) {
    const elapsedMs = Math.max(0, segment.to.getTime() - segment.from.getTime());
    const multiplierBp = Math.max(0, Math.floor(segment.multiplierBp));
    const segmentUnits = BigInt(elapsedMs) * BigInt(input.max) * BigInt(multiplierBp);

    if (remainingUnits > segmentUnits) {
      remainingUnits -= segmentUnits;
      continue;
    }

    if (multiplierBp <= 0 || input.max <= 0) {
      return segment.from;
    }

    const unitsPerMs = BigInt(input.max) * BigInt(multiplierBp);
    const milliseconds = ceilDiv(remainingUnits, unitsPerMs);

    return new Date(Math.min(segment.to.getTime(), segment.from.getTime() + Number(milliseconds)));
  }

  return input.to;
}

function getRegenerationSegments(input: {
  from: Date;
  to: Date;
  multiplierWindows?: ResourceRegenerationMultiplierWindow[];
}): Array<{ from: Date; to: Date; multiplierBp: number }> {
  if (input.to <= input.from) {
    return [];
  }

  const windows = normalizeMultiplierWindows(input.multiplierWindows);
  if (windows.length === 0) {
    return [{ from: input.from, to: input.to, multiplierBp: 10000 }];
  }

  const boundaries = new Set<number>([input.from.getTime(), input.to.getTime()]);
  for (const window of windows) {
    if (window.expiresAt > input.from && window.startsAt < input.to) {
      boundaries.add(Math.max(input.from.getTime(), window.startsAt.getTime()));
      boundaries.add(Math.min(input.to.getTime(), window.expiresAt.getTime()));
    }
  }
  const sortedBoundaries = [...boundaries].sort((left, right) => left - right);
  const segments: Array<{ from: Date; to: Date; multiplierBp: number }> = [];

  for (let index = 0; index < sortedBoundaries.length - 1; index += 1) {
    const from = new Date(sortedBoundaries[index]!);
    const to = new Date(sortedBoundaries[index + 1]!);
    const active = [...windows].reverse().find((window) => window.startsAt < to && window.expiresAt > from);
    const multiplierBp = active?.multiplierBp ?? 10000;
    const previous = segments.at(-1);

    if (previous && previous.multiplierBp === multiplierBp && previous.to.getTime() === from.getTime()) {
      previous.to = to;
    } else {
      segments.push({ from, to, multiplierBp });
    }
  }

  return segments;
}

function getMultiplierWindows(input: {
  multiplierWindow?: ResourceRegenerationMultiplierWindow | null;
  multiplierWindows?: ResourceRegenerationMultiplierWindow[];
}): ResourceRegenerationMultiplierWindow[] | undefined {
  const windows = [
    ...(input.multiplierWindows ?? []),
    ...(input.multiplierWindow ? [input.multiplierWindow] : [])
  ];

  return windows.length > 0 ? windows : undefined;
}

function normalizeMultiplierWindows(
  windows: ResourceRegenerationMultiplierWindow[] | undefined
): ResourceRegenerationMultiplierWindow[] {
  return (windows ?? [])
    .filter((window) => window.expiresAt > window.startsAt)
    .map((window) => ({
      startsAt: window.startsAt,
      expiresAt: window.expiresAt,
      multiplierBp: Math.max(0, Math.floor(window.multiplierBp))
    }))
    .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime());
}

function ceilDiv(value: bigint, divisor: bigint): bigint {
  if (divisor <= 0n) {
    return 0n;
  }

  return (value + divisor - 1n) / divisor;
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
