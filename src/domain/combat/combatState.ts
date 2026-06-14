import type { CharacterStats } from "../characters/starterStats";

export type CombatStatus = "active" | "won" | "lost" | "fled" | "expired";
export type CombatActionType = "attack" | "skill" | "flee";
export type CombatDamageKind = "physical" | "spell" | "social" | "trick";
export type CombatTurnOutcome =
  | "hit"
  | "critical-hit"
  | "miss"
  | "not-enough-mana"
  | "inactive"
  | "fled"
  | "flee-failed"
  | "won"
  | "lost";

export interface CombatActorStats extends CharacterStats {
  level: number;
  hpMax: number;
  manaMax: number;
  classId?: string;
  armor?: number;
  resist?: number;
  weaponDamage?: number;
  spellPower?: number;
}

export interface MonsterCombatStats {
  monsterId: string;
  level: number;
  hpMax: number;
  attack: number;
  armor: number;
  resist: number;
  dexterity: number;
  tags: string[];
}

export interface CombatState {
  id?: string;
  turn: number;
  status: CombatStatus;
  hero: {
    hp: number;
    hpMax: number;
    mana: number;
    manaMax: number;
  };
  monster: {
    id: string;
    hp: number;
    hpMax: number;
  };
  lastTurn?: CombatTurnSummary;
}

export interface CombatTurnSummary {
  action: CombatActionType;
  heroOutcome: CombatTurnOutcome;
  monsterOutcome?: CombatTurnOutcome;
  heroDamage: number;
  monsterDamage: number;
  manaSpent: number;
  critical: boolean;
  skillId?: string;
  damageKind?: CombatDamageKind;
}

export interface StartCombatInput {
  id?: string;
  hero: CombatActorStats & {
    hpCurrent?: number;
    manaCurrent?: number;
  };
  monster: MonsterCombatStats;
}

export function startCombat(input: StartCombatInput): CombatState {
  const heroHpMax = safePositiveInt(input.hero.hpMax);
  const heroManaMax = safeNonNegativeInt(input.hero.manaMax);
  const monsterHpMax = safePositiveInt(input.monster.hpMax);

  return {
    ...(input.id ? { id: input.id } : {}),
    turn: 1,
    status: "active",
    hero: {
      hp: clampResource(input.hero.hpCurrent ?? heroHpMax, heroHpMax),
      hpMax: heroHpMax,
      mana: clampResource(input.hero.manaCurrent ?? heroManaMax, heroManaMax),
      manaMax: heroManaMax
    },
    monster: {
      id: input.monster.monsterId,
      hp: monsterHpMax,
      hpMax: monsterHpMax
    }
  };
}

export function cloneCombatState(state: CombatState): CombatState {
  return {
    ...(state.id ? { id: state.id } : {}),
    turn: state.turn,
    status: state.status,
    hero: { ...state.hero },
    monster: { ...state.monster },
    ...(state.lastTurn ? { lastTurn: { ...state.lastTurn } } : {})
  };
}

export function expireCombat(state: CombatState): CombatState {
  if (state.status !== "active") {
    return cloneCombatState(state);
  }

  return {
    ...cloneCombatState(state),
    status: "expired",
    lastTurn: {
      action: "flee",
      heroOutcome: "inactive",
      heroDamage: 0,
      monsterDamage: 0,
      manaSpent: 0,
      critical: false
    }
  };
}

export function safePositiveInt(value: number): number {
  return Math.max(1, Math.floor(value));
}

export function safeNonNegativeInt(value: number): number {
  return Math.max(0, Math.floor(value));
}

export function clampResource(current: number, max: number): number {
  const safeMax = safeNonNegativeInt(max);

  if (safeMax === 0) {
    return 0;
  }

  return Math.min(safeMax, Math.max(0, Math.floor(current)));
}
