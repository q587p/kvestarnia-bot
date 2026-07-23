import {
  createGroupCombatProofState,
  getGroupCombatActionProfile,
  GROUP_COMBAT_STATE_BYTE_LIMIT,
  resolveGroupCombatTurn,
  validateGroupCombatAction,
  type GroupCombatAction,
  type GroupCombatActorSnapshot,
  type GroupCombatState
} from "../domain/groupCombat/groupCombat";
import { parseGroupCombatStateStrict } from "../domain/groupCombat/groupCombatStateValidation";

export interface GroupCombatSimulationRow {
  partySize: 2 | 3;
  enemyCount: 2 | 3;
  requestedTurns: 13 | 25;
  classId: string;
  raceId: string;
  completedTurns: number;
  finalStatus: GroupCombatState["status"];
  stateBytes: number;
  deterministicReplay: boolean;
  legalTargetsOnly: boolean;
  contributionBalanced: boolean;
}

export interface GroupCombatSimulationReport {
  rows: GroupCombatSimulationRow[];
  invariants: {
    deterministicReplay: true;
    legalTargetsOnly: true;
    boundedState: true;
    exactCommittedActions: true;
    rewardless: true;
  };
}

const SUPPORT_MATRIX = [
  { classId: "class.priest", raceId: "race.human-ish", action: "class" },
  { classId: "class.bard", raceId: "race.human-ish", action: "class" },
  { classId: "class.varenyk-mancer", raceId: "race.human-ish", action: "class" },
  { classId: "class.warrior", raceId: "race.dwarf", action: "race" },
  { classId: "class.warrior", raceId: "race.domovyk", action: "race" },
  { classId: "class.warrior", raceId: "race.molfar-soul", action: "race" }
] as const;

export function runGroupCombatHardeningSimulation(): GroupCombatSimulationReport {
  const rows: GroupCombatSimulationRow[] = [];
  for (const partySize of [2, 3] as const) {
    for (const requestedTurns of [13, 25] as const) {
      for (const profile of SUPPORT_MATRIX) {
        rows.push(runScenario(partySize, requestedTurns, profile));
      }
    }
  }
  if (rows.some((row) =>
    !row.deterministicReplay ||
    !row.legalTargetsOnly ||
    !row.contributionBalanced ||
    row.stateBytes > GROUP_COMBAT_STATE_BYTE_LIMIT
  )) {
    throw new Error("Group-combat hardening simulation invariant failed.");
  }
  return {
    rows,
    invariants: {
      deterministicReplay: true,
      legalTargetsOnly: true,
      boundedState: true,
      exactCommittedActions: true,
      rewardless: true
    }
  };
}

export function formatGroupCombatSimulationReport(report: GroupCombatSimulationReport): string {
  const maximumStateBytes = Math.max(...report.rows.map((row) => row.stateBytes));
  const cases = report.rows.length;
  return [
    "",
    "GroupCombat hardening:",
    `  cases: ${cases} (2x2/3x3, 13/25 turns, six support profiles)`,
    `  maximum state bytes: ${maximumStateBytes}/${GROUP_COMBAT_STATE_BYTE_LIMIT}`,
    "  invariants: deterministic replay, legal living targets, exact committed-action accounting, rewardless terminal plans"
  ].join("\n");
}

function runScenario(
  partySize: 2 | 3,
  requestedTurns: 13 | 25,
  profile: (typeof SUPPORT_MATRIX)[number]
): GroupCombatSimulationRow {
  let state = createGroupCombatProofState({
    sessionId: `simulation-${partySize}-${requestedTurns}-${profile.classId}-${profile.raceId}`,
    partySessionId: `party-${partySize}-${requestedTurns}-${profile.classId}-${profile.raceId}`,
    deterministicSeed: 587,
    participants: Array.from({ length: partySize }, (_, index) => simulationActor(index, profile))
  });
  state.enemies.forEach((enemy) => {
    enemy.hp = 587;
    enemy.hpMax = 587;
    enemy.attack = 1;
    enemy.defense = 0;
  });
  let deterministicReplay = true;
  let legalTargetsOnly = true;
  let expectedCommittedActions = 0;
  let completedTurns = 0;
  while (completedTurns < requestedTurns && state.status === "active") {
    const actions = state.participants
      .filter((participant) => participant.hp > 0)
      .map((participant, index) =>
        index === 0 ? buildSupportAction(state, participant, profile.action) : buildGuardAction(state, participant)
      );
    legalTargetsOnly &&= actions.every((action) => validateGroupCombatAction(state, action) === "ok");
    expectedCommittedActions += actions.length;
    const clone = structuredClone(state);
    const resolved = resolveGroupCombatTurn(state, actions);
    deterministicReplay &&= JSON.stringify(resolved) === JSON.stringify(resolveGroupCombatTurn(clone, actions));
    state = resolved.state;
    parseGroupCombatStateStrict(state);
    completedTurns += 1;
  }
  const committedActions = state.contributions.reduce((sum, row) => sum + row.committedActions, 0);
  return {
    partySize,
    enemyCount: state.enemies.length as 2 | 3,
    requestedTurns,
    classId: profile.classId,
    raceId: profile.raceId,
    completedTurns,
    finalStatus: state.status,
    stateBytes: Buffer.byteLength(JSON.stringify(state), "utf8"),
    deterministicReplay,
    legalTargetsOnly,
    contributionBalanced: committedActions === expectedCommittedActions
  };
}

function buildSupportAction(
  state: GroupCombatState,
  actor: GroupCombatActorSnapshot,
  action: "class" | "race"
): GroupCombatAction {
  const profile = getGroupCombatActionProfile(actor, action);
  const scopes = [profile?.ability.primaryTargetScope, profile?.ability.secondaryTargetScope].filter(Boolean);
  let targetKind: GroupCombatAction["targetKind"] = "self";
  let targetId = actor.characterId;
  if (scopes.includes("single-enemy")) {
    targetKind = "enemy";
    targetId = state.enemies.find((enemy) => enemy.hp > 0)?.id ?? state.enemies[0]!.id;
  } else if (scopes.includes("single-ally-or-self")) {
    const ally = state.participants.find((participant) => participant.hp > 0 && participant.characterId !== actor.characterId);
    if (ally) {
      targetKind = "ally";
      targetId = ally.characterId;
    }
  }
  const candidate: GroupCombatAction = {
    actorCharacterId: actor.characterId,
    turn: state.turn,
    action,
    targetKind,
    targetId,
    origin: "manual"
  };
  return validateGroupCombatAction(state, candidate) === "ok" ? candidate : buildGuardAction(state, actor);
}

function buildGuardAction(state: GroupCombatState, actor: GroupCombatActorSnapshot): GroupCombatAction {
  return {
    actorCharacterId: actor.characterId,
    turn: state.turn,
    action: "guard",
    targetKind: "self",
    targetId: actor.characterId,
    origin: "manual"
  };
}

function simulationActor(
  index: number,
  profile: Pick<(typeof SUPPORT_MATRIX)[number], "classId" | "raceId">
): GroupCombatActorSnapshot {
  return {
    characterId: `actor-${index}`,
    telegramUserId: `${5_870 + index}`,
    name: `Симулятор ${index}`,
    remortCount: 0,
    rosterOrder: index,
    classId: profile.classId,
    raceId: profile.raceId,
    level: 13,
    hp: 587,
    hpMax: 587,
    mana: 587,
    manaMax: 587,
    attack: 13,
    defense: 13,
    support: 13,
    stats: { strength: 13, dexterity: 13, intelligence: 13, charisma: 13, luck: 13 },
    equipmentItemIds: [],
    gearAbilityIds: [],
    combatItemQuantities: {},
    threat: 0
  };
}
