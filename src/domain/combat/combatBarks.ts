import {
  MONSTER_BARKS_RULES_VERSION,
  monsterBarks,
  type MonsterBarkAudience,
  type MonsterBarkDefinition
} from "../../content/monsterBarks";
import type { CombatState, MonsterCombatStats } from "./combatState";

export interface CombatBarkStateV1 {
  version: 1;
  rulesVersion: typeof MONSTER_BARKS_RULES_VERSION;
  audience: MonsterBarkAudience;
  selectedEarlyBarkByMonsterId: Record<string, string>;
  emittedBarkIds: string[];
  lastBarkOwnActionByMonsterId: Record<string, number>;
  encounterBarkCountByMonsterId: Record<string, number>;
  ownActionCountByMonsterId: Record<string, number>;
}

export interface ResolveMonsterBarkInput {
  state: CombatState;
  monster: MonsterCombatStats;
  monsterCommittedAction: boolean;
  monsterUsedAbility: boolean;
  monsterHpAfterHeroAction: number;
}

export interface ResolveMonsterBarkStateInput {
  barkState?: CombatBarkStateV1;
  combatId: string;
  status: CombatState["status"];
  audience?: MonsterBarkAudience;
  monster: MonsterCombatStats;
  monsterCommittedAction: boolean;
  monsterUsedAbility: boolean;
  monsterHpAfterHeroAction: number;
}

export interface ResolveMonsterBarkResult {
  state: CombatBarkStateV1;
  barkId?: string;
}

export function createCombatBarkState(input: {
  monsterId: string;
  seed: string;
  audience?: MonsterBarkAudience;
}): CombatBarkStateV1 {
  const audience = input.audience ?? "solo";
  const selectedEarlyBark = selectEarlyBark(input.monsterId, audience, input.seed);

  return {
    version: 1,
    rulesVersion: MONSTER_BARKS_RULES_VERSION,
    audience,
    selectedEarlyBarkByMonsterId: selectedEarlyBark
      ? { [input.monsterId]: selectedEarlyBark.id }
      : {},
    emittedBarkIds: [],
    lastBarkOwnActionByMonsterId: {},
    encounterBarkCountByMonsterId: {},
    ownActionCountByMonsterId: {}
  };
}

export function resolveMonsterBark(input: ResolveMonsterBarkInput): ResolveMonsterBarkResult {
  return resolveMonsterBarkState({
    ...(input.state.barks ? { barkState: input.state.barks } : {}),
    combatId: input.state.id ?? input.monster.monsterId,
    status: input.state.status,
    monster: input.monster,
    monsterCommittedAction: input.monsterCommittedAction,
    monsterUsedAbility: input.monsterUsedAbility,
    monsterHpAfterHeroAction: input.monsterHpAfterHeroAction
  });
}

export function resolveMonsterBarkState(
  input: ResolveMonsterBarkStateInput
): ResolveMonsterBarkResult {
  const current = cloneBarkState(input.barkState) ?? createCombatBarkState({
    monsterId: input.monster.monsterId,
    seed: input.combatId,
    ...(input.audience ? { audience: input.audience } : {})
  });

  if (!input.monsterCommittedAction || input.status !== "active") {
    return { state: current };
  }

  const monsterId = input.monster.monsterId;
  const ownAction = (current.ownActionCountByMonsterId[monsterId] ?? 0) + 1;
  current.ownActionCountByMonsterId[monsterId] = ownAction;
  const bark = selectBarkForAction({
    barkState: current,
    monster: input.monster,
    ownAction,
    monsterUsedAbility: input.monsterUsedAbility,
    monsterHpAfterHeroAction: input.monsterHpAfterHeroAction
  });

  if (!bark) {
    return { state: current };
  }

  current.emittedBarkIds = [...current.emittedBarkIds, bark.id];
  current.lastBarkOwnActionByMonsterId[monsterId] = ownAction;
  current.encounterBarkCountByMonsterId[monsterId] =
    (current.encounterBarkCountByMonsterId[monsterId] ?? 0) + 1;

  return {
    state: current,
    barkId: bark.id
  };
}

export function cloneBarkState(
  state: CombatBarkStateV1 | undefined
): CombatBarkStateV1 | undefined {
  if (!state) {
    return undefined;
  }

  return {
    version: 1,
    rulesVersion: MONSTER_BARKS_RULES_VERSION,
    audience: state.audience === "party" ? "party" : "solo",
    selectedEarlyBarkByMonsterId: { ...state.selectedEarlyBarkByMonsterId },
    emittedBarkIds: [...state.emittedBarkIds],
    lastBarkOwnActionByMonsterId: { ...state.lastBarkOwnActionByMonsterId },
    encounterBarkCountByMonsterId: { ...state.encounterBarkCountByMonsterId },
    ownActionCountByMonsterId: { ...state.ownActionCountByMonsterId }
  };
}

function selectBarkForAction(input: {
  barkState: CombatBarkStateV1;
  monster: MonsterCombatStats;
  ownAction: number;
  monsterUsedAbility: boolean;
  monsterHpAfterHeroAction: number;
}): MonsterBarkDefinition | null {
  const monsterId = input.monster.monsterId;
  const emitted = new Set(input.barkState.emittedBarkIds);
  const selectedEarlyId = input.barkState.selectedEarlyBarkByMonsterId[monsterId];
  const selectedEarly = selectedEarlyId
    ? monsterBarks.find((bark) => bark.id === selectedEarlyId)
    : null;
  const mustSpeakEarly = input.ownAction >= 2 && selectedEarly && !emitted.has(selectedEarly.id);
  const canSpeak = canMonsterSpeak(input.barkState, input.monster, input.ownAction);

  if (mustSpeakEarly && canSpeak) {
    return selectedEarly;
  }

  if (input.ownAction === 1 && selectedEarly && !emitted.has(selectedEarly.id)) {
    const seed = `${selectedEarly.id}:${input.barkState.rulesVersion}:first-action`;
    if (hashToUnit(seed) < 0.65 && canSpeak) {
      return selectedEarly;
    }
  }

  const candidates = monsterBarks
    .filter((bark) => bark.monsterId === monsterId)
    .filter((bark) => !emitted.has(bark.id))
    .filter((bark) => audienceMatches(bark, input.barkState.audience))
    .filter((bark) => {
      if (bark.trigger === "first-ability") {
        return input.monsterUsedAbility;
      }

      if (bark.trigger === "hp-below") {
        const hpRatio = input.monster.hpMax > 0 ? input.monsterHpAfterHeroAction / input.monster.hpMax : 1;
        return hpRatio <= (bark.hpRatioAtOrBelow ?? 0);
      }

      return false;
    })
    .sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id));

  return canSpeak ? candidates[0] ?? null : null;
}

function selectEarlyBark(
  monsterId: string,
  audience: MonsterBarkAudience,
  seed: string
): MonsterBarkDefinition | null {
  const candidates = monsterBarks
    .filter((bark) => bark.monsterId === monsterId)
    .filter((bark) => bark.mandatoryEarlyCandidate)
    .filter((bark) => audienceMatches(bark, audience))
    .sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id));

  if (candidates.length === 0) {
    return null;
  }

  const index = Math.floor(hashToUnit(`${seed}:${monsterId}:${audience}:early`) * candidates.length);

  return candidates[Math.min(candidates.length - 1, index)] ?? candidates[0] ?? null;
}

function canMonsterSpeak(
  state: CombatBarkStateV1,
  monster: MonsterCombatStats,
  ownAction: number
): boolean {
  const monsterId = monster.monsterId;
  const budget = getMonsterBarkBudget(monster);
  const used = state.encounterBarkCountByMonsterId[monsterId] ?? 0;
  const lastOwnAction = state.lastBarkOwnActionByMonsterId[monsterId] ?? 0;

  return used < budget && ownAction - lastOwnAction >= 1;
}

function getMonsterBarkBudget(monster: MonsterCombatStats): number {
  if (monster.tags.includes("boss")) {
    return 4;
  }

  if (monster.tags.includes("mini-boss") || monster.tags.includes("tiny-boss") || monster.tags.includes("elite")) {
    return 3;
  }

  return 2;
}

function audienceMatches(bark: MonsterBarkDefinition, audience: MonsterBarkAudience): boolean {
  return bark.audience === "any" || bark.audience === audience;
}

function hashToUnit(seed: string): number {
  let hash = 0x811c9dc5;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0) / 0x1_0000_0000;
}
