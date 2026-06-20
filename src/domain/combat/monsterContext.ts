import {
  MONSTER_CONTEXT_RULES_VERSION,
  monsterContextProfiles,
  monsterContextTraits,
  type MonsterContextBranch,
  type MonsterContextBranchTone,
  type MonsterContextEffects,
  type MonsterContextProfile,
  type MonsterContextWhen
} from "../../content/monsterContext";
import type { MonsterContent } from "../../content/schema";
import type { CombatWorldContextV1 } from "./combatWorldContext";
import type { MonsterCombatStats } from "./combatState";

export interface MonsterContextMatchedBranch {
  traitId: string;
  branchId: string;
  tone: MonsterContextBranchTone;
}

export interface MonsterContextSnapshotV1 {
  version: 1;
  rulesVersion: typeof MONSTER_CONTEXT_RULES_VERSION;
  monsterId: string;
  traitIds: string[];
  world: CombatWorldContextV1;
  matchedBranches: MonsterContextMatchedBranch[];
  effects: Required<MonsterContextEffects>;
  cue?: {
    id: string;
    text: string;
    tone: MonsterContextBranchTone;
  };
}

const DEFAULT_EFFECTS: Required<MonsterContextEffects> = {
  outgoingDamageMultiplier: 1,
  incomingDamageMultiplier: 1,
  accuracyDeltaPp: 0,
  evasionDeltaPp: 0,
  abilityWeightDelta: 0,
  signatureCooldownDelta: 0,
  flatArmorDelta: 0,
  flatResistDelta: 0,
  flatDexterityDelta: 0
};

export function resolveMonsterContext(input: {
  monster: MonsterContent;
  world: CombatWorldContextV1;
}): MonsterContextSnapshotV1 | null {
  const profile = monsterContextProfiles.find((candidate) => candidate.monsterId === input.monster.id);

  if (!profile) {
    return null;
  }

  const matched = profile.contextTraitIds
    .slice(0, 2)
    .flatMap((traitId) => {
      const trait = monsterContextTraits.find((candidate) => candidate.id === traitId);
      const branch = trait?.branches.find((candidate) =>
        branchMatches(candidate, profile, input.world)
      );

      return trait && branch ? [{ traitId: trait.id, branch }] : [];
    });
  const effects = applyCaps(scaleEffects(composeEffects(matched.map((entry) => entry.branch.effects)), profile.mechanicalScale));
  const cueBranch = selectCueBranch(matched);

  return {
    version: 1,
    rulesVersion: MONSTER_CONTEXT_RULES_VERSION,
    monsterId: input.monster.id,
    traitIds: [...profile.contextTraitIds],
    world: input.world,
    matchedBranches: matched.map((entry) => ({
      traitId: entry.traitId,
      branchId: entry.branch.id,
      tone: entry.branch.tone
    })),
    effects,
    ...(cueBranch
      ? {
          cue: {
            id: `context-cue.${input.monster.id}.${cueBranch.traitId}.${cueBranch.branch.id}`,
            text: cueBranch.branch.cue,
            tone: cueBranch.branch.tone
          }
        }
      : {})
  };
}

export function applyMonsterContextToStats(
  stats: MonsterCombatStats,
  context: MonsterContextSnapshotV1 | null | undefined
): MonsterCombatStats {
  if (!context) {
    return stats;
  }

  return {
    ...stats,
    armor: Math.max(0, stats.armor + context.effects.flatArmorDelta),
    resist: Math.max(0, stats.resist + context.effects.flatResistDelta),
    dexterity: Math.max(1, stats.dexterity + context.effects.flatDexterityDelta),
    contextModifiers: { ...context.effects },
    debugTrace: {
      ...stats.debugTrace,
      contextRulesVersion: context.rulesVersion,
      contextTraitIds: context.traitIds,
      contextBranchIds: context.matchedBranches.map((branch) => `${branch.traitId}:${branch.branchId}`),
      ...(context.cue ? { contextCueId: context.cue.id } : {})
    }
  };
}

function branchMatches(
  branch: MonsterContextBranch,
  profile: MonsterContextProfile,
  world: CombatWorldContextV1
): boolean {
  if (branch.whenAny) {
    return branch.whenAny.some((when) => whenMatches(when, profile, world));
  }

  if (branch.when && !whenMatches(branch.when, profile, world)) {
    return false;
  }

  if (branch.whenProfileSeasonMatches && profile.contextConfig?.favoredSeason !== world.season) {
    return false;
  }

  if (
    branch.whenProfileOppositeSeasonMatches &&
    profile.contextConfig?.oppositeSeason !== world.season
  ) {
    return false;
  }

  return Boolean(branch.when || branch.whenAny || branch.whenProfileSeasonMatches || branch.whenProfileOppositeSeasonMatches);
}

function whenMatches(
  when: MonsterContextWhen,
  profile: MonsterContextProfile,
  world: CombatWorldContextV1
): boolean {
  return (
    matchesValue(when.dayPhase, world.dayPhase) &&
    matchesValue(when.weekKind, world.weekKind) &&
    matchesValue(when.mealWindow, world.mealWindow) &&
    matchesValue(when.monthEdge, world.monthEdge) &&
    matchesValue(when.season, world.season) &&
    matchesValue(when.partySizeBand, world.partySizeBand) &&
    matchesValue(
      when.calendarDay ?? profile.contextConfig?.strangeCalendarDays,
      world.calendarDay
    )
  );
}

function matchesValue<T extends string | number>(
  expected: readonly T[] | undefined,
  actual: T
): boolean {
  return !expected || expected.includes(actual);
}

function composeEffects(effects: readonly MonsterContextEffects[]): Required<MonsterContextEffects> {
  return effects.reduce(
    (current: Required<MonsterContextEffects>, effect): Required<MonsterContextEffects> => ({
      outgoingDamageMultiplier:
        current.outgoingDamageMultiplier * (effect.outgoingDamageMultiplier ?? 1),
      incomingDamageMultiplier:
        current.incomingDamageMultiplier * (effect.incomingDamageMultiplier ?? 1),
      accuracyDeltaPp: current.accuracyDeltaPp + (effect.accuracyDeltaPp ?? 0),
      evasionDeltaPp: current.evasionDeltaPp + (effect.evasionDeltaPp ?? 0),
      abilityWeightDelta: current.abilityWeightDelta + (effect.abilityWeightDelta ?? 0),
      signatureCooldownDelta:
        current.signatureCooldownDelta + (effect.signatureCooldownDelta ?? 0),
      flatArmorDelta: current.flatArmorDelta + (effect.flatArmorDelta ?? 0),
      flatResistDelta: current.flatResistDelta + (effect.flatResistDelta ?? 0),
      flatDexterityDelta: current.flatDexterityDelta + (effect.flatDexterityDelta ?? 0)
    }),
    { ...DEFAULT_EFFECTS } satisfies Required<MonsterContextEffects>
  );
}

function scaleEffects(
  effects: Required<MonsterContextEffects>,
  scale: MonsterContextProfile["mechanicalScale"]
): Required<MonsterContextEffects> {
  if (scale === 0) {
    return { ...DEFAULT_EFFECTS };
  }

  return {
    outgoingDamageMultiplier: 1 + (effects.outgoingDamageMultiplier - 1) * scale,
    incomingDamageMultiplier: 1 + (effects.incomingDamageMultiplier - 1) * scale,
    accuracyDeltaPp: effects.accuracyDeltaPp * scale,
    evasionDeltaPp: effects.evasionDeltaPp * scale,
    abilityWeightDelta: effects.abilityWeightDelta * scale,
    signatureCooldownDelta: effects.signatureCooldownDelta * scale,
    flatArmorDelta: Math.round(effects.flatArmorDelta * scale),
    flatResistDelta: Math.round(effects.flatResistDelta * scale),
    flatDexterityDelta: Math.round(effects.flatDexterityDelta * scale)
  };
}

function applyCaps(effects: Required<MonsterContextEffects>): Required<MonsterContextEffects> {
  return {
    outgoingDamageMultiplier: clamp(effects.outgoingDamageMultiplier, 0.9, 1.12),
    incomingDamageMultiplier: clamp(effects.incomingDamageMultiplier, 0.9, 1.1),
    accuracyDeltaPp: clamp(effects.accuracyDeltaPp, -5, 5),
    evasionDeltaPp: clamp(effects.evasionDeltaPp, -5, 5),
    abilityWeightDelta: clamp(effects.abilityWeightDelta, -25, 25),
    signatureCooldownDelta: clamp(Math.round(effects.signatureCooldownDelta), -1, 1),
    flatArmorDelta: clamp(Math.round(effects.flatArmorDelta), -1, 1),
    flatResistDelta: clamp(Math.round(effects.flatResistDelta), -1, 1),
    flatDexterityDelta: clamp(Math.round(effects.flatDexterityDelta), -1, 1)
  };
}

function selectCueBranch(
  matched: Array<{ traitId: string; branch: MonsterContextBranch }>
): { traitId: string; branch: MonsterContextBranch } | null {
  const disadvantage = matched.find((entry) => entry.branch.tone === "disadvantage");

  return disadvantage ?? matched[0] ?? null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
