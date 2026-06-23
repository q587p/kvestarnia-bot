export const SHYNOK_DRINK_RULES_VERSION = "shynok-drinks-v1";

export type ShynokDrinkKey =
  | "drink.thyme-tea"
  | "drink.simple-beer"
  | "drink.fine-beer"
  | "drink.pepper-vodka";

export type ShynokDrinkPhase = "timed" | "queued";

export interface ShynokDrinkDefinition {
  key: ShynokDrinkKey;
  name: string;
  emoji: string;
  priceGold: number;
  durationMinutes: number;
  phase: ShynokDrinkPhase;
  recoveryMultiplierBp?: number;
  accuracyPenaltyPp?: number;
  outgoingDamageMultiplierBp?: number;
  incomingDamageMultiplierBp?: number;
}

export interface ActiveShynokDrinkEffect {
  key: ShynokDrinkKey;
  phase: ShynokDrinkPhase;
  startedAt: Date;
  expiresAt: Date;
  recoveryMultiplierBp?: number;
  accuracyPenaltyPp?: number;
  outgoingDamageMultiplierBp?: number;
  incomingDamageMultiplierBp?: number;
}

export const SHYNOK_DRINKS: readonly ShynokDrinkDefinition[] = [
  {
    key: "drink.thyme-tea",
    name: "Чай із чебрецем",
    emoji: "🍵",
    priceGold: 17,
    durationMinutes: 42,
    phase: "timed",
    recoveryMultiplierBp: 11300
  },
  {
    key: "drink.simple-beer",
    name: "Просте пиво",
    emoji: "🍺",
    priceGold: 13,
    durationMinutes: 23,
    phase: "timed",
    recoveryMultiplierBp: 12500,
    accuracyPenaltyPp: 5
  },
  {
    key: "drink.fine-beer",
    name: "Якісне пиво",
    emoji: "🍻",
    priceGold: 42,
    durationMinutes: 42,
    phase: "timed",
    recoveryMultiplierBp: 15000,
    accuracyPenaltyPp: 10
  },
  {
    key: "drink.pepper-vodka",
    name: "Горілка з перцем",
    emoji: "🥃",
    priceGold: 42,
    durationMinutes: 23,
    phase: "queued",
    outgoingDamageMultiplierBp: 11300,
    incomingDamageMultiplierBp: 11300
  }
] as const;

const drinkByKey = new Map<ShynokDrinkKey, ShynokDrinkDefinition>(
  SHYNOK_DRINKS.map((drink) => [drink.key, drink])
);

export function getShynokDrinkDefinition(key: ShynokDrinkKey): ShynokDrinkDefinition {
  const drink = drinkByKey.get(key);

  if (!drink) {
    throw new Error(`Unknown Shynok drink: ${key}`);
  }

  return drink;
}

export function isShynokDrinkKey(value: string): value is ShynokDrinkKey {
  return drinkByKey.has(value as ShynokDrinkKey);
}

export function buildDrinkEffect(input: {
  drinkKey: ShynokDrinkKey;
  startedAt: Date;
}): ActiveShynokDrinkEffect {
  const drink = getShynokDrinkDefinition(input.drinkKey);
  const expiresAt = new Date(input.startedAt.getTime() + drink.durationMinutes * 60_000);

  return {
    key: drink.key,
    phase: drink.phase,
    startedAt: input.startedAt,
    expiresAt,
    ...(drink.recoveryMultiplierBp ? { recoveryMultiplierBp: drink.recoveryMultiplierBp } : {}),
    ...(drink.accuracyPenaltyPp ? { accuracyPenaltyPp: drink.accuracyPenaltyPp } : {}),
    ...(drink.outgoingDamageMultiplierBp
      ? { outgoingDamageMultiplierBp: drink.outgoingDamageMultiplierBp }
      : {}),
    ...(drink.incomingDamageMultiplierBp
      ? { incomingDamageMultiplierBp: drink.incomingDamageMultiplierBp }
      : {})
  };
}

export function getActiveTimedDrinkRecoveryMultiplier(
  effect: ActiveShynokDrinkEffect | null | undefined,
  now: Date
): number | null {
  if (!effect || effect.phase !== "timed" || !effect.recoveryMultiplierBp) {
    return null;
  }

  return effect.startedAt <= now && effect.expiresAt > now ? effect.recoveryMultiplierBp : null;
}

export function applyDrinkDamageMultiplier(baseDamage: number, multiplierBp: number | undefined): number {
  const damage = Math.max(0, Math.floor(baseDamage));

  if (damage <= 0 || !multiplierBp || multiplierBp === 10000) {
    return damage;
  }

  return Math.max(1, Math.floor((damage * multiplierBp) / 10000));
}
