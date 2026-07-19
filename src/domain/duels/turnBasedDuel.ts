import {
  getActorCombatActionAvailability,
  cloneCombatCooldowns,
  clonePlayerAbilityFumblesState,
  getCombatClassAbilityProfile,
  getCombatGearActionAvailability,
  getCombatRaceAbilityProfile,
  getCombatSkillProfile,
  getDefendStance,
  getNextDefendGuard,
  previewPlayerAbilityFumbleCycle,
  resolveActorCombatAction,
  type CombatGearAbilityInput,
  type CombatActorStats,
  type CombatPlayerAbilityProfile,
  type CombatSkillProfile,
  type CombatState,
  type CombatTurnSummary
} from "../combat";
import type { CharacterStats } from "../characters/starterStats";
import type { EquipmentEffectSummary } from "../progression/effectiveStats";
import type { RandomSource } from "../../shared/random";
import { INSTANT_DUEL_BALANCE_VERSION, prepareBalancedDuelists, type DuelistBalanceAudit } from "./duelBalance";
import type { DuelistSummary, DuelOutcomeSide } from "./duelResolver";
import {
  applyVarenykSatedCombatPulse,
  cloneVarenykSatedCombatState,
  type VarenykSatedCombatStateV1
} from "../noncombat/varenykSatedSupport";
import {
  applyBardInspirationCombatPulse,
  cloneBardInspirationCombatState,
  withBardInspirationAccuracy,
  type BardInspirationCombatStateV1
} from "../noncombat/bardSupport";

export const TURN_BASED_DUEL_RULES_VERSION = "turn-based-duel-v1";
export const TURN_BASED_DUEL_TURN_SECONDS = 23;
export const TURN_BASED_DUEL_MAX_TURNS = 93;
export const TURN_BASED_DUEL_LOSS_XP = 1;
export const TURN_BASED_DUEL_DRAW_XP_RANGE = { min: 2, max: 5 } as const;
export const TURN_BASED_DUEL_WIN_XP_RANGE = { min: 4, max: 8 } as const;

export type DuelMode = "quick" | "turn-based";
export type TurnBasedDuelStatus = "active" | "resolved" | "expired" | "forfeited";
export type TurnBasedDuelAction = "attack" | "defend" | "skill" | "race" | "gear" | "surrender";

export interface TurnBasedDuelParticipantSnapshot {
  characterId: string;
  displayName: string;
  activeCosmeticTitle?: string | null;
  title: string;
  raceId: string;
  raceName: string;
  classId: string;
  className: string;
  level: number;
  remortCount: number;
  stats: CharacterStats;
  equipmentEffects?: EquipmentEffectSummary;
  equipmentAbilityGrantIds?: string[];
  hp: number;
  hpMax: number;
  mana: number;
  manaMax: number;
  combatStats: CombatActorStats;
  cooldowns?: CombatState["cooldowns"];
  guard?: CombatState["guard"];
  playerAbilityFumbles?: CombatState["playerAbilityFumbles"];
  varenykSated?: VarenykSatedCombatStateV1;
  bardInspiration?: BardInspirationCombatStateV1;
  balanceAudit: DuelistBalanceAudit;
}

export interface TurnBasedDuelActionSummary {
  actorCharacterId: string;
  defenderCharacterId: string;
  action: TurnBasedDuelAction | "timeout-attack";
  outcome: CombatTurnSummary["heroOutcome"] | "surrendered" | "draw";
  damage: number;
  healing?: number;
  guard?: number;
  manaSpent: number;
  critical: boolean;
  skillId?: string;
  fumble?: CombatTurnSummary["fumble"];
  satedRecovery?: { hpRestored: number; manaRestored: number };
}

export interface TurnBasedDuelQueuedAction {
  actorCharacterId: string;
  action: Exclude<TurnBasedDuelAction, "surrender">;
  gearAbility?: CombatGearAbilityInput;
}

export interface TurnBasedDuelRoundSummary {
  turn: number;
  actions: TurnBasedDuelActionSummary[];
  varenykSatedAfter?: {
    challenger: VarenykSatedCombatStateV1 | null;
    target: VarenykSatedCombatStateV1 | null;
  };
  bardInspirationAfter?: {
    challenger: BardInspirationCombatStateV1 | null;
    target: BardInspirationCombatStateV1 | null;
  };
}

export interface TurnBasedDuelOutcome {
  outcome: DuelOutcomeSide;
  winnerCharacterId: string | null;
  loserCharacterId: string | null;
  reason: "defeat" | "surrender" | "max-turns" | "expired";
}

export interface TurnBasedDuelState {
  mode: "turn-based";
  status: TurnBasedDuelStatus;
  rulesVersion: string;
  balanceVersion: string;
  turn: number;
  actingCharacterId: string;
  participants: {
    challenger: TurnBasedDuelParticipantSnapshot;
    target: TurnBasedDuelParticipantSnapshot;
  };
  pendingActions?: Partial<Record<"challenger" | "target", TurnBasedDuelQueuedAction>>;
  lastRound?: TurnBasedDuelRoundSummary;
  lastAction?: TurnBasedDuelActionSummary;
  outcome?: TurnBasedDuelOutcome;
}

export interface TurnBasedDuelXpRewards {
  challenger: number;
  target: number;
}

export interface StartTurnBasedDuelInput {
  challenger: DuelistSummary;
  target: DuelistSummary;
  rng: RandomSource;
}

export function startTurnBasedDuel(input: StartTurnBasedDuelInput): TurnBasedDuelState {
  const prepared = prepareBalancedDuelists({
    challenger: input.challenger,
    target: input.target
  });
  const challengerInitiative = rollInitiative(prepared.challenger, input.rng);
  const targetInitiative = rollInitiative(prepared.target, input.rng);
  const actingCharacterId =
    challengerInitiative === targetInitiative
      ? input.rng.nextFloat() < 0.5
        ? input.challenger.id
        : input.target.id
      : challengerInitiative > targetInitiative
        ? input.challenger.id
        : input.target.id;

  return buildTurnBasedDuelState({
    prepared,
    actingCharacterId
  });
}

export function buildTurnBasedDuelState(input: {
  prepared: ReturnType<typeof prepareBalancedDuelists>;
  actingCharacterId: string;
}): TurnBasedDuelState {
  const actingCharacterId =
    input.actingCharacterId === input.prepared.challenger.id ||
    input.actingCharacterId === input.prepared.target.id
      ? input.actingCharacterId
      : input.prepared.challenger.id;
  return {
    mode: "turn-based",
    status: "active",
    rulesVersion: TURN_BASED_DUEL_RULES_VERSION,
    balanceVersion: INSTANT_DUEL_BALANCE_VERSION,
    turn: 1,
    actingCharacterId,
    participants: {
      challenger: buildParticipantSnapshot(input.prepared.challenger),
      target: buildParticipantSnapshot(input.prepared.target)
    }
  };
}

export type ResolveTurnBasedDuelActionResult =
  | { ok: true; resolution: "queued"; state: TurnBasedDuelState; queuedAction: TurnBasedDuelQueuedAction }
  | { ok: true; resolution: "resolved"; state: TurnBasedDuelState; round: TurnBasedDuelRoundSummary }
  | {
      ok: false;
      reason: "inactive" | "already-acted" | "not-participant" | "not-enough-mana" | "skill-on-cooldown";
      state: TurnBasedDuelState;
    };

export function resolveTurnBasedDuelAction(input: {
  state: TurnBasedDuelState;
  actorCharacterId: string;
  action: TurnBasedDuelAction;
  gearAbility?: CombatGearAbilityInput;
  sated?: { sessionId: string; committedTurn: number; now: Date };
  rng: RandomSource;
}): ResolveTurnBasedDuelActionResult {
  const state = cloneTurnBasedDuelState(input.state);

  if (state.status !== "active") {
    return { ok: false, reason: "inactive", state };
  }

  if (!findParticipantSide(state, input.actorCharacterId)) {
    return { ok: false, reason: "not-participant", state };
  }

  const actorSide = findParticipantSide(state, input.actorCharacterId);

  if (!actorSide) {
    return { ok: false, reason: "not-participant", state };
  }

  const actor = state.participants[actorSide];

  if (input.action === "surrender") {
    const defenderSide = actorSide === "challenger" ? "target" : "challenger";
    const defender = state.participants[defenderSide];
    const summary = {
      actorCharacterId: actor.characterId,
      defenderCharacterId: defender.characterId,
      action: "surrender" as const,
      outcome: "surrendered" as const,
      damage: 0,
      manaSpent: 0,
      critical: false
    };
    state.status = "forfeited";
    state.outcome = buildOutcome(state, defender.characterId, "surrender");
    state.lastAction = summary;
    const bardInspirationAfter = snapshotTurnBasedDuelInspiration(state);
    state.lastRound = {
      turn: state.turn,
      actions: [summary],
      varenykSatedAfter: snapshotTurnBasedDuelSated(state),
      ...(bardInspirationAfter ? { bardInspirationAfter } : {})
    };
    return { ok: true, resolution: "resolved", state, round: state.lastRound };
  }

  if (state.pendingActions?.[actorSide]) {
    return { ok: false, reason: "already-acted", state };
  }

  if (input.action === "skill" || input.action === "race" || input.action === "gear") {
    const availability = input.action === "gear"
      ? input.gearAbility
        ? getCombatGearActionAvailability(buildMinimalCombatStateForDuelParticipant(actor), input.gearAbility.profile)
        : { available: false as const, reason: "cooldown" as const }
      : getActorCombatActionAvailability(
      {
        mana: actor.mana,
        cooldowns: actor.cooldowns
      },
      actor.combatStats
      )[input.action];

    if (!availability.available) {
      return {
        ok: false,
        reason: availability.reason === "cooldown" ? "skill-on-cooldown" : "not-enough-mana",
        state
      };
    }
  }

  const queuedAction = {
    actorCharacterId: actor.characterId,
    action: input.action,
    ...(input.action === "gear" && input.gearAbility ? { gearAbility: input.gearAbility } : {})
  };
  state.pendingActions = {
    ...state.pendingActions,
    [actorSide]: queuedAction
  };

  if (!state.pendingActions.challenger || !state.pendingActions.target) {
    return { ok: true, resolution: "queued", state, queuedAction };
  }

  return resolveQueuedRound(state, input.rng, { ...(input.sated ? { sated: input.sated } : {}) });
}

export function resolveTurnBasedDuelTimeout(input: {
  state: TurnBasedDuelState;
  sated?: { sessionId: string; committedTurn: number; now: Date };
  rng: RandomSource;
}): ResolveTurnBasedDuelActionResult {
  const state = cloneTurnBasedDuelState(input.state);

  if (state.status !== "active") {
    return { ok: false, reason: "inactive", state };
  }

  state.pendingActions = {
    ...state.pendingActions,
    ...(state.pendingActions?.challenger
      ? {}
      : {
          challenger: {
            actorCharacterId: state.participants.challenger.characterId,
            action: "attack" as const
          }
        }),
    ...(state.pendingActions?.target
      ? {}
      : {
          target: {
            actorCharacterId: state.participants.target.characterId,
            action: "attack" as const
          }
        })
  };

  return resolveQueuedRound(state, input.rng, {
    timeoutCharacterIds: [
      ...(input.state.pendingActions?.challenger ? [] : [state.participants.challenger.characterId]),
      ...(input.state.pendingActions?.target ? [] : [state.participants.target.characterId])
    ],
    ...(input.sated ? { sated: input.sated } : {})
  });
}

function resolveQueuedRound(
  state: TurnBasedDuelState,
  rng: RandomSource,
  options: {
    timeoutCharacterIds?: string[];
    sated?: { sessionId: string; committedTurn: number; now: Date };
  } = {}
): Extract<ResolveTurnBasedDuelActionResult, { ok: true; resolution: "resolved" }> {
  const pending = state.pendingActions;
  const mitigation = {
    challenger: getQueuedIncomingDamageReduction(state, "challenger"),
    target: getQueuedIncomingDamageReduction(state, "target")
  };
  const mitigationMultiplier = {
    challenger: getQueuedIncomingDamageMultiplier(state, "challenger"),
    target: getQueuedIncomingDamageMultiplier(state, "target")
  };
  delete state.pendingActions;

  const firstSide = findParticipantSide(state, state.actingCharacterId) ?? "challenger";
  const secondSide = firstSide === "challenger" ? "target" : "challenger";
  const actions: TurnBasedDuelActionSummary[] = [];

  for (const side of [firstSide, secondSide] as const) {
    if (state.status !== "active") {
      break;
    }

    const queued = pending?.[side];
    if (!queued) {
      continue;
    }

    const summary = resolveQueuedCombatAction(state, side, queued, rng, {
      timeout: options.timeoutCharacterIds?.includes(queued.actorCharacterId) ?? false,
      incomingDamageReduction: mitigation[defenderSideOf(side)],
      incomingDamageMultiplier: mitigationMultiplier[defenderSideOf(side)]
    });
    actions.push(summary);
  }

  if (options.sated) {
    for (let index = 0; index < actions.length; index += 1) {
      const summary = actions[index]!;
      const side = findParticipantSide(state, summary.actorCharacterId);
      if (side) {
        actions[index] = applySatedPulseAfterDuelExchange(state, side, summary, options.sated);
      }
    }
  }

  const bardInspirationAfter = snapshotTurnBasedDuelInspiration(state);
  const round = {
    turn: state.turn,
    actions,
    varenykSatedAfter: snapshotTurnBasedDuelSated(state),
    ...(bardInspirationAfter ? { bardInspirationAfter } : {})
  };
  state.lastRound = round;
  const lastAction = actions.at(-1);
  if (lastAction) {
    state.lastAction = lastAction;
  } else {
    delete state.lastAction;
  }

  if (state.status === "active" && state.turn >= TURN_BASED_DUEL_MAX_TURNS) {
    state.status = "resolved";
    state.outcome = {
      outcome: "draw",
      winnerCharacterId: null,
      loserCharacterId: null,
      reason: "max-turns"
    };
    const last = state.lastAction;
    if (last) {
      state.lastAction = { ...last, outcome: "draw" };
      state.lastRound = {
        turn: round.turn,
        actions: [...round.actions.slice(0, -1), state.lastAction],
        varenykSatedAfter: round.varenykSatedAfter
      };
    }
    return { ok: true, resolution: "resolved", state, round: state.lastRound };
  }

  if (state.status === "active") {
    state.turn += 1;
    state.actingCharacterId = getOtherCharacterId(state, state.actingCharacterId);
  }

  return { ok: true, resolution: "resolved", state, round: state.lastRound };
}

function resolveQueuedCombatAction(
  state: TurnBasedDuelState,
  actorSide: "challenger" | "target",
  queued: TurnBasedDuelQueuedAction,
  rng: RandomSource,
  options: { timeout: boolean; incomingDamageReduction: number; incomingDamageMultiplier: number }
): TurnBasedDuelActionSummary {
  const defenderSide = actorSide === "challenger" ? "target" : "challenger";
  const actor = state.participants[actorSide];
  const defender = state.participants[defenderSide];
  const action = queued.action;
  const resolved = resolveActorCombatAction({
    actorState: {
      hp: actor.hp,
      hpMax: actor.hpMax,
      mana: actor.mana,
      manaMax: actor.manaMax,
      cooldowns: actor.cooldowns,
      ...(actor.guard ? { guard: actor.guard } : {}),
      ...(actor.playerAbilityFumbles ? { playerAbilityFumbles: actor.playerAbilityFumbles } : {})
    },
    defenderState: {
      hp: defender.hp,
      hpMax: defender.hpMax,
      mana: defender.mana,
      manaMax: defender.manaMax,
      cooldowns: defender.cooldowns,
      ...(defender.guard ? { guard: defender.guard } : {})
    },
    actorStats: withBardInspirationAccuracy(actor.combatStats, actor.bardInspiration),
    defenderStats: buildDefenderStats(defender),
    action,
    ...(queued.gearAbility ? { skillProfile: queued.gearAbility.profile } : {}),
    fumbleSeed: buildTurnBasedDuelFumbleSeed(actor, defender),
    rng
  });

  actor.hp = resolved.actorState.hp;
  actor.mana = resolved.actorState.mana;
  actor.cooldowns = resolved.actorState.cooldowns;
  actor.guard = resolved.actorState.guard;
  actor.playerAbilityFumbles = resolved.actorState.playerAbilityFumbles;
  const support = (action === "skill" || action === "race" || action === "gear") &&
      isCommittedSkillOutcome(resolved.summary.actorOutcome) &&
      !resolved.summary.fumble
    ? applyTurnBasedDuelAbilitySupport(actor, queued)
    : {};
  const reducedDamage = Math.floor(resolved.summary.actorDamage * options.incomingDamageMultiplier);
  const mitigatedDamage = Math.max(0, reducedDamage - options.incomingDamageReduction);
  defender.hp = Math.min(defender.hpMax, resolved.defenderState.hp + (resolved.summary.actorDamage - mitigatedDamage));
  defender.mana = resolved.defenderState.mana;
  defender.cooldowns = resolved.defenderState.cooldowns;
  defender.guard = resolved.defenderState.guard;

  const summary = {
    actorCharacterId: actor.characterId,
    defenderCharacterId: defender.characterId,
    action: options.timeout ? "timeout-attack" as const : action,
    outcome: resolved.summary.actorOutcome === "won" && defender.hp > 0
      ? resolved.summary.critical
        ? "critical-hit" as const
        : mitigatedDamage > 0
          ? "hit" as const
          : "miss" as const
      : resolved.summary.actorOutcome,
    damage: mitigatedDamage,
    ...support,
    manaSpent: resolved.summary.manaSpent,
    critical: resolved.summary.critical,
    ...(resolved.summary.skillId ? { skillId: resolved.summary.skillId } : {}),
    ...(resolved.summary.fumble ? { fumble: resolved.summary.fumble } : {})
  };

  if (actor.hp <= 0) {
    state.status = "resolved";
    state.outcome = buildOutcome(state, defender.characterId, "defeat");
  } else if (defender.hp <= 0) {
    state.status = "resolved";
    state.outcome = buildOutcome(state, actor.characterId, "defeat");
  }

  return summary;
}

function getQueuedIncomingDamageReduction(
  state: TurnBasedDuelState,
  side: "challenger" | "target"
): number {
  const queued = state.pendingActions?.[side];

  if (queued?.action !== "skill" && queued?.action !== "race" && queued?.action !== "gear") {
    return 0;
  }

  const participant = state.participants[side];
  const ability = getQueuedDuelAbilityProfile(participant, queued);
  if (!ability) {
    return 0;
  }
  const defender = state.participants[defenderSideOf(side)];
  const availability = queued.action === "gear"
    ? getCombatGearActionAvailability(buildMinimalCombatStateForDuelParticipant(participant), ability)
    : getActorCombatActionAvailability(
      {
        mana: participant.mana,
        cooldowns: participant.cooldowns
      },
      participant.combatStats
    )[queued.action];

  const fumblePreview = previewPlayerAbilityFumbleCycle({
    state: participant.playerAbilityFumbles,
    abilityId: ability.id,
    seed: buildTurnBasedDuelFumbleSeed(participant, defender)
  });

  return availability.available && !fumblePreview.fumbled
    ? Math.max(ability.monsterDamageReduction, ability.guardReduction ?? 0)
    : 0;
}

function applyTurnBasedDuelAbilitySupport(
  actor: TurnBasedDuelParticipantSnapshot,
  action: TurnBasedDuelQueuedAction
): { healing?: number; guard?: number } {
  const ability = getQueuedDuelAbilityProfile(actor, action);
  const healing = ability?.healAmount && ability.healAmount > 0
    ? applyTurnBasedDuelHealing(actor, ability.healAmount)
    : 0;
  const guard = ability?.guardReduction && ability.guardReduction > 0
    ? Math.floor(ability.guardReduction)
    : 0;

  return {
    ...(healing > 0 ? { healing } : {}),
    ...(guard > 0 ? { guard } : {})
  };
}

function isCommittedSkillOutcome(outcome: CombatTurnSummary["heroOutcome"]): boolean {
  return outcome !== "not-enough-mana" && outcome !== "skill-on-cooldown";
}

function applyTurnBasedDuelHealing(
  actor: TurnBasedDuelParticipantSnapshot,
  amount: number
): number {
  const before = actor.hp;
  actor.hp = Math.min(actor.hpMax, actor.hp + Math.max(0, Math.floor(amount)));

  return actor.hp - before;
}

function getQueuedDuelAbilityProfile(
  participant: TurnBasedDuelParticipantSnapshot,
  action: Pick<TurnBasedDuelQueuedAction, "action" | "gearAbility">
): CombatSkillProfile | CombatPlayerAbilityProfile | null {
  return action.action === "gear"
    ? action.gearAbility?.profile ?? null
    : action.action === "skill"
    ? getCombatClassAbilityProfile(participant.classId)
    : getCombatRaceAbilityProfile(participant.raceId);
}

function buildMinimalCombatStateForDuelParticipant(participant: TurnBasedDuelParticipantSnapshot): CombatState {
  return {
    id: `duel:${participant.characterId}`,
    status: "active",
    turn: 1,
    hero: {
      hp: participant.hp,
      hpMax: participant.hpMax,
      mana: participant.mana,
      manaMax: participant.manaMax
    },
    monster: {
      id: "duel-opponent",
      hp: 1,
      hpMax: 1
    },
    ...(participant.cooldowns ? { cooldowns: participant.cooldowns } : {})
  };
}

function getQueuedIncomingDamageMultiplier(
  state: TurnBasedDuelState,
  side: "challenger" | "target"
): number {
  const queued = state.pendingActions?.[side];

  if (queued?.action !== "defend") {
    return 1;
  }

  const participant = state.participants[side];
  const stance = getDefendStance(getNextDefendGuard(participant.guard));

  return 1 - stance.damageReduction;
}

function defenderSideOf(side: "challenger" | "target"): "challenger" | "target" {
  return side === "challenger" ? "target" : "challenger";
}

function buildTurnBasedDuelFumbleSeed(
  actor: Pick<TurnBasedDuelParticipantSnapshot, "characterId">,
  defender: Pick<TurnBasedDuelParticipantSnapshot, "characterId">
): string {
  return `turn-based-duel:${actor.characterId}:${defender.characterId}`;
}

export function expireTurnBasedDuel(state: TurnBasedDuelState): TurnBasedDuelState {
  if (state.status !== "active") {
    return cloneTurnBasedDuelState(state);
  }

  const next = cloneTurnBasedDuelState(state);

  next.status = "expired";
  next.outcome = {
    outcome: "draw",
    winnerCharacterId: null,
    loserCharacterId: null,
    reason: "expired"
  };

  return next;
}

export function rollTurnBasedDuelXpRewards(
  state: TurnBasedDuelState,
  rng: RandomSource
): TurnBasedDuelXpRewards | null {
  if (state.status === "active" || !state.outcome || state.outcome.reason === "expired") {
    return null;
  }

  if (state.outcome.outcome === "draw") {
    return {
      challenger: rollLuckBiasedXp(TURN_BASED_DUEL_DRAW_XP_RANGE, state.participants.challenger.stats.luck, rng),
      target: rollLuckBiasedXp(TURN_BASED_DUEL_DRAW_XP_RANGE, state.participants.target.stats.luck, rng)
    };
  }

  const winnerSide = findParticipantSide(state, state.outcome.winnerCharacterId ?? "");
  const loserSide = findParticipantSide(state, state.outcome.loserCharacterId ?? "");

  if (!winnerSide || !loserSide) {
    return null;
  }

  return {
    challenger: winnerSide === "challenger"
      ? rollLuckBiasedXp(TURN_BASED_DUEL_WIN_XP_RANGE, state.participants.challenger.stats.luck, rng)
      : TURN_BASED_DUEL_LOSS_XP,
    target: winnerSide === "target"
      ? rollLuckBiasedXp(TURN_BASED_DUEL_WIN_XP_RANGE, state.participants.target.stats.luck, rng)
      : TURN_BASED_DUEL_LOSS_XP
  };
}

export function getTurnBasedDuelSkillLabel(participant: Pick<TurnBasedDuelParticipantSnapshot, "classId">): {
  skillId: string;
  manaCost: number;
} {
  const skill = getCombatSkillProfile(participant.classId);

  return {
    skillId: skill.id,
    manaCost: skill.manaCost
  };
}

export function getTurnBasedDuelRaceAbilityLabel(
  participant: Pick<TurnBasedDuelParticipantSnapshot, "raceId">
): { skillId: string; manaCost: number } | null {
  const ability = getCombatRaceAbilityProfile(participant.raceId);

  return ability
    ? {
        skillId: ability.id,
        manaCost: ability.manaCost
      }
    : null;
}

function buildParticipantSnapshot(
  character: ReturnType<typeof prepareBalancedDuelists>["challenger"]
): TurnBasedDuelParticipantSnapshot {
  const equipment = character.equipmentEffects;

  return {
    characterId: character.id,
    displayName: character.name,
    ...(character.activeCosmeticTitle ? { activeCosmeticTitle: character.activeCosmeticTitle } : {}),
    title: character.title,
    raceId: character.raceId,
    raceName: character.raceName,
    classId: character.classId,
    className: character.className,
    level: character.level,
    remortCount: character.remortCount ?? 0,
    stats: { ...character.stats },
    ...(equipment ? { equipmentEffects: { ...equipment } } : {}),
    ...(character.equipmentAbilityGrantIds && character.equipmentAbilityGrantIds.length > 0
      ? { equipmentAbilityGrantIds: [...character.equipmentAbilityGrantIds] }
      : {}),
    hp: character.hpCurrent,
    hpMax: character.hpMax,
    mana: character.manaCurrent,
    manaMax: character.manaMax,
    combatStats: {
      level: character.balanceAudit.effectiveCombatLevel,
      hpMax: character.hpMax,
      manaMax: character.manaMax,
      classId: character.classId,
      raceId: character.raceId,
      ...character.stats,
      armor: equipment?.armor ?? 0,
      resist: equipment?.resist ?? 0,
      weaponDamage: equipment?.weaponDamage ?? 0,
      spellPower: equipment?.spellPower ?? 0
    },
    balanceAudit: character.balanceAudit
  };
}

function buildDefenderStats(participant: TurnBasedDuelParticipantSnapshot) {
  return {
    monsterId: participant.characterId,
    name: participant.displayName,
    level: participant.combatStats.level,
    hpMax: participant.hpMax,
    attack: Math.max(1, Math.floor(participant.combatStats.strength / 2) + participant.combatStats.level),
    armor: participant.combatStats.armor ?? 0,
    resist: participant.combatStats.resist ?? 0,
    dexterity: participant.combatStats.dexterity,
    classId: participant.classId,
    className: participant.className,
    raceId: participant.raceId,
    raceName: participant.raceName,
    title: participant.title,
    spellPower: participant.combatStats.spellPower ?? 0,
    tags: []
  };
}

function rollInitiative(character: ReturnType<typeof prepareBalancedDuelists>["challenger"], rng: RandomSource): number {
  return character.stats.dexterity * 2 + character.stats.luck + rng.nextInt(1, 13);
}

function rollLuckBiasedXp(
  range: { min: number; max: number },
  luck: number,
  rng: RandomSource
): number {
  const base = rng.nextInt(range.min, range.max);
  const luckChance = Math.min(0.35, Math.max(0, Math.floor(luck)) * 0.02);
  const bonus = rng.nextFloat() < luckChance ? 1 : 0;

  return Math.min(range.max, base + bonus);
}

function findParticipantSide(
  state: TurnBasedDuelState,
  characterId: string
): "challenger" | "target" | null {
  if (state.participants.challenger.characterId === characterId) {
    return "challenger";
  }

  if (state.participants.target.characterId === characterId) {
    return "target";
  }

  return null;
}

function buildOutcome(
  state: TurnBasedDuelState,
  winnerCharacterId: string,
  reason: TurnBasedDuelOutcome["reason"]
): TurnBasedDuelOutcome {
  const winnerSide = findParticipantSide(state, winnerCharacterId);
  const loser =
    winnerSide === "challenger" ? state.participants.target : state.participants.challenger;

  return {
    outcome: winnerSide === "challenger" ? "challenger" : "target",
    winnerCharacterId,
    loserCharacterId: loser.characterId,
    reason
  };
}

function cloneTurnBasedDuelState(state: TurnBasedDuelState): TurnBasedDuelState {
  return {
    ...state,
    participants: {
      challenger: cloneParticipant(state.participants.challenger),
      target: cloneParticipant(state.participants.target)
    },
    ...(state.lastAction ? { lastAction: { ...state.lastAction } } : {}),
    ...(state.lastRound
      ? {
          lastRound: {
            turn: state.lastRound.turn,
            actions: state.lastRound.actions.map((action) => ({ ...action })),
            ...(state.lastRound.varenykSatedAfter
              ? {
                  varenykSatedAfter: {
                    challenger: state.lastRound.varenykSatedAfter.challenger
                      ? cloneVarenykSatedCombatState(state.lastRound.varenykSatedAfter.challenger)
                      : null,
                    target: state.lastRound.varenykSatedAfter.target
                      ? cloneVarenykSatedCombatState(state.lastRound.varenykSatedAfter.target)
                      : null
                  }
                }
              : {}),
            ...(state.lastRound.bardInspirationAfter
              ? {
                  bardInspirationAfter: {
                    challenger: state.lastRound.bardInspirationAfter.challenger
                      ? cloneBardInspirationCombatState(state.lastRound.bardInspirationAfter.challenger)
                      : null,
                    target: state.lastRound.bardInspirationAfter.target
                      ? cloneBardInspirationCombatState(state.lastRound.bardInspirationAfter.target)
                      : null
                  }
                }
              : {})
          }
        }
      : {}),
    ...(state.pendingActions
      ? {
          pendingActions: {
            ...(state.pendingActions.challenger
              ? { challenger: { ...state.pendingActions.challenger } }
              : {}),
            ...(state.pendingActions.target
              ? { target: { ...state.pendingActions.target } }
              : {})
          }
        }
      : {}),
    ...(state.outcome ? { outcome: { ...state.outcome } } : {})
  };
}

function getOtherCharacterId(state: TurnBasedDuelState, characterId: string): string {
  return characterId === state.participants.challenger.characterId
    ? state.participants.target.characterId
    : state.participants.challenger.characterId;
}

function cloneParticipant(
  participant: TurnBasedDuelParticipantSnapshot
): TurnBasedDuelParticipantSnapshot {
  return {
    ...participant,
    stats: { ...participant.stats },
    combatStats: { ...participant.combatStats },
    ...(participant.equipmentEffects
      ? { equipmentEffects: { ...participant.equipmentEffects } }
      : {}),
    ...(participant.equipmentAbilityGrantIds
      ? { equipmentAbilityGrantIds: [...participant.equipmentAbilityGrantIds] }
      : {}),
    ...(participant.cooldowns ? { cooldowns: cloneCombatCooldowns(participant.cooldowns) } : {}),
    ...(participant.guard ? { guard: { ...participant.guard } } : {}),
    ...(participant.playerAbilityFumbles
      ? { playerAbilityFumbles: clonePlayerAbilityFumblesState(participant.playerAbilityFumbles) }
      : {}),
    ...(participant.varenykSated
      ? { varenykSated: { ...participant.varenykSated, pulseIds: [...participant.varenykSated.pulseIds] } }
      : {}),
    ...(participant.bardInspiration
      ? { bardInspiration: cloneBardInspirationCombatState(participant.bardInspiration) }
      : {})
  };
}

function snapshotTurnBasedDuelSated(
  state: Pick<TurnBasedDuelState, "participants">
): NonNullable<TurnBasedDuelRoundSummary["varenykSatedAfter"]> {
  return {
    challenger: state.participants.challenger.varenykSated
      ? cloneVarenykSatedCombatState(state.participants.challenger.varenykSated)
      : null,
    target: state.participants.target.varenykSated
      ? cloneVarenykSatedCombatState(state.participants.target.varenykSated)
      : null
  };
}

function snapshotTurnBasedDuelInspiration(
  state: Pick<TurnBasedDuelState, "participants">
): NonNullable<TurnBasedDuelRoundSummary["bardInspirationAfter"]> | undefined {
  if (
    !state.participants.challenger.bardInspiration &&
    !state.participants.target.bardInspiration
  ) {
    return undefined;
  }
  return {
    challenger: state.participants.challenger.bardInspiration
      ? cloneBardInspirationCombatState(state.participants.challenger.bardInspiration)
      : null,
    target: state.participants.target.bardInspiration
      ? cloneBardInspirationCombatState(state.participants.target.bardInspiration)
      : null
  };
}

function applySatedPulseAfterDuelExchange(
  state: TurnBasedDuelState,
  side: "challenger" | "target",
  summary: TurnBasedDuelActionSummary,
  input: { sessionId: string; committedTurn: number; now: Date }
): TurnBasedDuelActionSummary {
  const participant = state.participants[side];
  const inspirationPulse = applyBardInspirationCombatPulse({
    inspiration: participant.bardInspiration,
    pulseId: [
      participant.bardInspiration?.activationId ?? "none",
      "turn-based-duel",
      input.sessionId,
      input.committedTurn,
      participant.characterId
    ].join(":"),
    now: input.now
  });
  if (inspirationPulse.inspiration) {
    participant.bardInspiration = inspirationPulse.inspiration;
  }
  const pulse = applyVarenykSatedCombatPulse({
    sated: participant.varenykSated,
    resources: {
      hp: participant.hp,
      hpMax: participant.hpMax,
      mana: participant.mana,
      manaMax: participant.manaMax
    },
    pulseId: [
      participant.varenykSated?.activationId ?? "none",
      "turn-based-duel",
      input.sessionId,
      input.committedTurn,
      participant.characterId
    ].join(":"),
    now: input.now
  });
  if (!pulse.sated) {
    return summary;
  }
  participant.varenykSated = pulse.sated;
  if (pulse.applied) {
    participant.hp = pulse.resources.hp;
    participant.mana = pulse.resources.mana;
  }
  return pulse.hpRestored > 0 || pulse.manaRestored > 0
    ? { ...summary, satedRecovery: { hpRestored: pulse.hpRestored, manaRestored: pulse.manaRestored } }
    : summary;
}
