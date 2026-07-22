export const GROUP_COMBAT_RULES_VERSION = "group-combat.v1";
export const GROUP_COMBAT_PROOF_ENCOUNTER_KEY = "proof-cellar-many";
export const GROUP_COMBAT_RECAP_LIMIT = 5;
export const GROUP_COMBAT_TURN_LIMIT = 25;

export type GroupCombatStatus = "active" | "won" | "lost" | "invalid";
export type GroupCombatActionKey = "attack" | "guard" | "aid";
export type GroupCombatTargetKind = "self" | "ally" | "enemy";

export interface GroupCombatActorSnapshot {
  characterId: string;
  telegramUserId: string;
  name: string;
  remortCount: number;
  rosterOrder: number;
  hp: number;
  hpMax: number;
  mana: number;
  manaMax: number;
  attack: number;
  defense: number;
  support: number;
  equipmentItemIds: string[];
}

export interface GroupCombatEnemyState {
  id: string;
  name: string;
  order: number;
  hp: number;
  hpMax: number;
  attack: number;
  defense: number;
}

export interface GroupCombatContribution {
  characterId: string;
  damage: number;
  healing: number;
  guardedTurns: number;
}

export interface GroupCombatRecapEntry {
  turn: number;
  lines: string[];
}

export interface GroupCombatState {
  rulesVersion: typeof GROUP_COMBAT_RULES_VERSION;
  sessionId: string;
  partySessionId: string;
  encounterKey: typeof GROUP_COMBAT_PROOF_ENCOUNTER_KEY;
  deterministicSeed: number;
  status: GroupCombatStatus;
  turn: number;
  participants: GroupCombatActorSnapshot[];
  enemies: GroupCombatEnemyState[];
  contributions: GroupCombatContribution[];
  recap: GroupCombatRecapEntry[];
}

export interface GroupCombatAction {
  actorCharacterId: string;
  turn: number;
  action: GroupCombatActionKey;
  targetKind: GroupCombatTargetKind;
  targetId: string;
  origin: "manual" | "timeout";
}

export interface GroupCombatResult {
  kind: "rewardless-proof";
  outcome: "won" | "lost" | "invalid";
  completedTurn: number;
  rewards: {
    xp: 0;
    gold: 0;
    items: [];
  };
}

export interface GroupCombatResolution {
  state: GroupCombatState;
  result: GroupCombatResult | null;
}

export function createGroupCombatProofState(input: {
  sessionId: string;
  partySessionId: string;
  deterministicSeed: number;
  participants: GroupCombatActorSnapshot[];
}): GroupCombatState {
  if (input.participants.length < 2 || input.participants.length > 3) {
    throw new Error("Group combat proof requires two or three participants.");
  }

  const participants = [...input.participants]
    .sort((left, right) => left.rosterOrder - right.rosterOrder)
    .map((participant) => ({
      ...participant,
      hp: clampInteger(participant.hp, 0, participant.hpMax),
      hpMax: positiveInteger(participant.hpMax),
      mana: clampInteger(participant.mana, 0, participant.manaMax),
      manaMax: nonNegativeInteger(participant.manaMax),
      attack: positiveInteger(participant.attack),
      defense: nonNegativeInteger(participant.defense),
      support: positiveInteger(participant.support),
      equipmentItemIds: [...participant.equipmentItemIds].sort()
    }));

  const enemies = participants.map((_, index): GroupCombatEnemyState => {
    const hpMax = 10 + participants.length * 2 + index * 2;
    return {
      id: `proof-enemy-${index + 1}`,
      name: PROOF_ENEMY_NAMES[index] ?? `Підвальний гуркіт №${index + 1}`,
      order: index,
      hp: hpMax,
      hpMax,
      attack: 4 + index,
      defense: index
    };
  });

  return {
    rulesVersion: GROUP_COMBAT_RULES_VERSION,
    sessionId: input.sessionId,
    partySessionId: input.partySessionId,
    encounterKey: GROUP_COMBAT_PROOF_ENCOUNTER_KEY,
    deterministicSeed: nonNegativeInteger(input.deterministicSeed),
    status: "active",
    turn: 1,
    participants,
    enemies,
    contributions: participants.map((participant) => ({
      characterId: participant.characterId,
      damage: 0,
      healing: 0,
      guardedTurns: 0
    })),
    recap: []
  };
}

export function validateGroupCombatAction(
  state: GroupCombatState,
  action: GroupCombatAction
): "ok" | "stale" | "actor-unavailable" | "invalid-target" {
  if (state.status !== "active" || action.turn !== state.turn) {
    return "stale";
  }
  const actor = state.participants.find((candidate) => candidate.characterId === action.actorCharacterId);
  if (!actor || actor.hp <= 0) {
    return "actor-unavailable";
  }
  if (action.action === "attack") {
    return action.targetKind === "enemy" && state.enemies.some((target) => target.id === action.targetId && target.hp > 0)
      ? "ok"
      : "invalid-target";
  }
  if (action.action === "guard") {
    return action.targetKind === "self" && action.targetId === actor.characterId ? "ok" : "invalid-target";
  }
  return action.targetKind === "ally" && state.participants.some(
    (target) => target.characterId === action.targetId && target.characterId !== actor.characterId && target.hp > 0
  )
    ? "ok"
    : "invalid-target";
}

export function buildGroupCombatTimeoutAction(state: GroupCombatState, characterId: string): GroupCombatAction {
  return {
    actorCharacterId: characterId,
    turn: state.turn,
    action: "guard",
    targetKind: "self",
    targetId: characterId,
    origin: "timeout"
  };
}

export function resolveGroupCombatTurn(
  current: GroupCombatState,
  submittedActions: readonly GroupCombatAction[]
): GroupCombatResolution {
  if (current.status !== "active") {
    return { state: cloneGroupCombatState(current), result: buildTerminalResult(current) };
  }

  const state = cloneGroupCombatState(current);
  const livingActors = state.participants.filter((participant) => participant.hp > 0);
  const actionsByActor = new Map(submittedActions.map((action) => [action.actorCharacterId, action]));
  const actions = livingActors.map((actor) => actionsByActor.get(actor.characterId) ?? buildGroupCombatTimeoutAction(state, actor.characterId));
  for (const action of actions) {
    if (validateGroupCombatAction(state, action) !== "ok") {
      throw new Error(`Invalid group-combat action for ${action.actorCharacterId}.`);
    }
  }

  const guarded = new Set<string>();
  const lines: string[] = [];
  for (const actor of livingActors) {
    const action = actionsByActor.get(actor.characterId) ?? buildGroupCombatTimeoutAction(state, actor.characterId);
    const contribution = state.contributions.find((row) => row.characterId === actor.characterId)!;
    if (action.action === "attack") {
      const target = state.enemies.find((enemy) => enemy.id === action.targetId)!;
      if (target.hp <= 0) {
        const replacement = state.enemies.find((enemy) => enemy.hp > 0);
        if (!replacement) {
          continue;
        }
        action.targetId = replacement.id;
      }
      const canonicalTarget = state.enemies.find((enemy) => enemy.id === action.targetId)!;
      const damage = Math.min(canonicalTarget.hp, Math.max(1, actor.attack - canonicalTarget.defense));
      canonicalTarget.hp -= damage;
      contribution.damage += damage;
      lines.push(`${actor.name} б’є «${canonicalTarget.name}» на ${damage}.`);
    } else if (action.action === "guard") {
      guarded.add(actor.characterId);
      contribution.guardedTurns += 1;
      lines.push(action.origin === "timeout" ? `${actor.name} мовчить і стає в захист.` : `${actor.name} стає в захист.`);
    } else {
      const target = state.participants.find((candidate) => candidate.characterId === action.targetId)!;
      const healed = Math.min(target.hpMax - target.hp, Math.max(1, Math.floor(actor.support / 2)));
      target.hp += healed;
      contribution.healing += healed;
      lines.push(`${actor.name} підтримує ${target.name}: +${healed} HP.`);
    }
  }

  if (state.enemies.every((enemy) => enemy.hp <= 0)) {
    return terminalize(state, "won", lines);
  }

  for (const enemy of state.enemies.filter((candidate) => candidate.hp > 0)) {
    const targets = state.participants.filter((participant) => participant.hp > 0);
    if (targets.length === 0) {
      break;
    }
    const index = (state.deterministicSeed + state.turn + enemy.order) % targets.length;
    const target = targets[index]!;
    const rawDamage = Math.max(1, enemy.attack - target.defense);
    const damage = Math.min(target.hp, guarded.has(target.characterId) ? Math.max(1, Math.floor(rawDamage / 2)) : rawDamage);
    target.hp -= damage;
    lines.push(`«${enemy.name}» відповідає ${target.name}: ${damage} шкоди.`);
  }

  if (state.participants.every((participant) => participant.hp <= 0) || state.turn >= GROUP_COMBAT_TURN_LIMIT) {
    return terminalize(state, "lost", lines);
  }

  state.recap = appendRecap(state.recap, { turn: state.turn, lines });
  state.turn += 1;
  return { state, result: null };
}

export function invalidateGroupCombatState(current: GroupCombatState): GroupCombatResolution {
  const state = cloneGroupCombatState(current);
  state.status = "invalid";
  return { state, result: buildTerminalResult(state) };
}

export function cloneGroupCombatState(state: GroupCombatState): GroupCombatState {
  return {
    ...state,
    participants: state.participants.map((row) => ({ ...row, equipmentItemIds: [...row.equipmentItemIds] })),
    enemies: state.enemies.map((row) => ({ ...row })),
    contributions: state.contributions.map((row) => ({ ...row })),
    recap: state.recap.map((row) => ({ turn: row.turn, lines: [...row.lines] }))
  };
}

function terminalize(
  state: GroupCombatState,
  outcome: "won" | "lost",
  lines: string[]
): GroupCombatResolution {
  state.recap = appendRecap(state.recap, { turn: state.turn, lines });
  state.status = outcome;
  return { state, result: buildTerminalResult(state) };
}

function buildTerminalResult(state: GroupCombatState): GroupCombatResult | null {
  if (state.status === "active") {
    return null;
  }
  return {
    kind: "rewardless-proof",
    outcome: state.status,
    completedTurn: state.turn,
    rewards: { xp: 0, gold: 0, items: [] }
  };
}

function appendRecap(recap: GroupCombatRecapEntry[], entry: GroupCombatRecapEntry): GroupCombatRecapEntry[] {
  return [...recap, { turn: entry.turn, lines: entry.lines.slice(0, 13) }].slice(-GROUP_COMBAT_RECAP_LIMIT);
}

function nonNegativeInteger(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function positiveInteger(value: number): number {
  return Math.max(1, nonNegativeInteger(value));
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(minimum, nonNegativeInteger(value)), Math.max(minimum, nonNegativeInteger(maximum)));
}

const PROOF_ENEMY_NAMES = ["Комірний Шурхіт", "Сходовий Гуп", "Підвальний Перераховувач"] as const;
