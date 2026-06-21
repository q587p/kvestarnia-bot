import {
  findMonsterAbility,
  monsterAbilities,
  type MonsterAbilityDefinition,
  type MonsterAbilityParameterKey,
  type MonsterAbilityPowerBand,
  type MonsterAbilityRole
} from "../../content/monsterAbilities";
import {
  findMonsterCombatProfile,
  monsterCombatProfiles,
  type MonsterAiProfile,
  type MonsterCombatProfile
} from "../../content/monsterCombatProfiles";
import { monsters } from "../../content/monsters";
import type { RandomSource } from "../../shared/random";
import type { CombatSkillProfile } from "./combatActions";
import type {
  CombatActorStats,
  CombatDamageKind,
  CombatState,
  CombatTurnSummary,
  MonsterCombatStats
} from "./combatState";

export const MONSTER_ABILITY_RUNTIME_RULES_VERSION = "monster-abilities-v1" as const;

export type MonsterAbilityRuntimeActionKind = "attack" | "defend" | "ability" | "telegraph";
export type MonsterAbilityEffectTarget = "hero" | "monster";
export type MonsterAbilityEffectKind =
  | "accuracy"
  | "evasion"
  | "outgoing-damage"
  | "incoming-damage"
  | "mark"
  | "burn"
  | "bleed"
  | "ability-lock"
  | "mana-cost-pressure"
  | "reflect"
  | "status-resistance"
  | "flee"
  | "crit"
  | "slow"
  | "confusion"
  | "cooldown-pressure"
  | "next-attack-bonus"
  | "repeat-penalty";

export interface MonsterAbilityRuntimeCooldown {
  id: string;
  remainingOwnActions: number;
}

export interface MonsterAbilityRuntimeEffect {
  id: string;
  sourceAbilityId: string;
  target: MonsterAbilityEffectTarget;
  kind: MonsterAbilityEffectKind;
  value: number;
  remainingOwnActivations?: number;
  remainingTargetActivations?: number;
  charges?: number;
}

export interface MonsterAbilityRuntimeShield {
  sourceAbilityId: string;
  points: number;
}

export interface MonsterAbilityPendingTelegraph {
  abilityId: string;
  announcedAtTurn: number;
}

export interface MonsterAbilityRuntimeStateV1 {
  version: 1;
  rulesVersion: typeof MONSTER_ABILITY_RUNTIME_RULES_VERSION;
  aiProfile: MonsterAiProfile;
  loadoutIds: string[];
  cooldowns: Record<string, MonsterAbilityRuntimeCooldown>;
  onceUsedAbilityIds: string[];
  lastActionKind?: MonsterAbilityRuntimeActionKind;
  lastAbilityId?: string;
  consecutiveAbilityUses: number;
  pendingTelegraph?: MonsterAbilityPendingTelegraph;
  shield?: MonsterAbilityRuntimeShield;
  effects: MonsterAbilityRuntimeEffect[];
  expiredEffectIds?: string[];
  ownActionCount: number;
}

export interface MonsterContentValidationIssue {
  code: string;
  message: string;
  monsterId?: string;
  abilityId?: string;
}

export interface MonsterRuntimeStartInput {
  monster: MonsterCombatStats;
  seed?: string;
}

export interface ResolveMonsterRuntimeActionInput {
  state: CombatState;
  hero: CombatActorStats;
  monster: MonsterCombatStats;
  rng: RandomSource;
  damageReduction?: number;
  defendStance?: MonsterRuntimeDefendStance | undefined;
}

export interface MonsterRuntimeDefendStance {
  evasionChance: number;
  damageReduction: number;
  counterChance: number;
}

export interface ResolvedMonsterRuntimeAction {
  state: CombatState;
  damage: number;
  outcome?: CombatTurnSummary["monsterOutcome"];
  actionKind?: MonsterAbilityRuntimeActionKind;
  ability?: MonsterAbilityDefinition;
  damageKind?: CombatDamageKind;
  effectText?: string;
  telegraphAbility?: MonsterAbilityDefinition;
}

const aiWeights: Record<MonsterAiProfile, { basic: number; ability: number; defend: number }> = {
  boss: { basic: 45, ability: 45, defend: 10 },
  brute: { basic: 65, ability: 30, defend: 5 },
  controller: { basic: 45, ability: 40, defend: 15 },
  defender: { basic: 45, ability: 25, defend: 30 },
  skirmisher: { basic: 50, ability: 35, defend: 15 },
  trickster: { basic: 45, ability: 40, defend: 15 }
};

const directDamageRoles = new Set<MonsterAbilityRole>([
  "artillery",
  "controller",
  "skirmisher",
  "striker",
  "trickster"
]);

const supportedParameterKeys = new Set<MonsterAbilityParameterKey>([
  "abilityPotencyMultiplier",
  "accuracyAndEvasionPenaltyPp",
  "accuracyPenaltyPp",
  "bleedDamageMultiplier",
  "bleedTicks",
  "bonusAgainstDebuffedTargets",
  "bonusDamageMultiplierBelowHalfHp",
  "bossFallbackAbilityPotencyMultiplier",
  "burnDamageMultiplier",
  "burnTicks",
  "charges",
  "cleanseNegativeEffects",
  "copyLastDirectActionPotency",
  "counterChance",
  "critPenaltyPp",
  "damageMultiplier",
  "damageMultiplierWhenShieldBreaks",
  "damageReduction",
  "durationOwnActivations",
  "durationTargetActivations",
  "evasionBonusPp",
  "evasionPenaltyPp",
  "extendLongestCooldownBy",
  "fallbackShieldMaxHpFraction",
  "fleeChancePenaltyPp",
  "groupTargetConfusion",
  "healTargetMaxHpFraction",
  "lockAbilitySource",
  "lockAnyOneAbility",
  "manaCostIncrease",
  "manaDrain",
  "markIncomingDamageMultiplier",
  "nextAttackBonusIfShieldSurvives",
  "outgoingDamageMultiplier",
  "predictRepeatedLastAction",
  "reapplyLastExpiredNegativeEffect",
  "reflectFlatDamage",
  "removePositiveEffects",
  "repeatLastActionPenalty",
  "riderByTurnCycle",
  "riderByTurnParity",
  "selfDamageReduction",
  "selfEvasionBonusPp",
  "selfHealMaxHpFraction",
  "shieldMaxHpFraction",
  "slowAttackerPp",
  "soloFallbackShieldMaxHpFraction",
  "statusResistancePp",
  "targetAccuracyPenaltyPp"
]);

interface CompiledMonsterAbilityRecipe {
  directDamage: boolean;
  heroEffects: readonly MonsterAbilityEffectKind[];
  monsterEffects: readonly MonsterAbilityEffectKind[];
  immediate: {
    heal: boolean;
    shield: boolean;
    manaDrain: boolean;
    cleanse: boolean;
    removePositive: boolean;
    reapplyExpired: boolean;
    cooldownPressure: boolean;
  };
}

export function compileMonsterAbilityRecipe(
  ability: MonsterAbilityDefinition
): CompiledMonsterAbilityRecipe {
  const params = ability.parameters;
  const heroEffects: MonsterAbilityEffectKind[] = [];
  const monsterEffects: MonsterAbilityEffectKind[] = [];
  const addHeroEffect = (kind: MonsterAbilityEffectKind): void => {
    if (!heroEffects.includes(kind)) {
      heroEffects.push(kind);
    }
  };
  const addMonsterEffect = (kind: MonsterAbilityEffectKind): void => {
    if (!monsterEffects.includes(kind)) {
      monsterEffects.push(kind);
    }
  };

  if (numberParam(params.markIncomingDamageMultiplier) > 0) addHeroEffect("mark");
  if (numberParam(params.burnDamageMultiplier) > 0) addHeroEffect("burn");
  if (numberParam(params.bleedDamageMultiplier) > 0) addHeroEffect("bleed");
  if (typeof params.lockAbilitySource === "string" || params.lockAnyOneAbility === true) addHeroEffect("ability-lock");
  if (numberParam(params.outgoingDamageMultiplier) > 0 && numberParam(params.outgoingDamageMultiplier) !== 1) addHeroEffect("outgoing-damage");
  if (numberParam(params.targetAccuracyPenaltyPp) > 0 || numberParam(params.accuracyAndEvasionPenaltyPp) > 0) addHeroEffect("accuracy");
  if (numberParam(params.evasionPenaltyPp) > 0 || numberParam(params.accuracyAndEvasionPenaltyPp) > 0) addHeroEffect("evasion");
  if (numberParam(params.manaCostIncrease) > 0) addHeroEffect("mana-cost-pressure");
  if (numberParam(params.fleeChancePenaltyPp) > 0) addHeroEffect("flee");
  if (numberParam(params.critPenaltyPp) > 0) addHeroEffect("crit");
  if (numberParam(params.slowAttackerPp) > 0) addHeroEffect("slow");
  if (params.groupTargetConfusion === true) addHeroEffect("confusion");
  if (numberParam(params.extendLongestCooldownBy) > 0) addHeroEffect("cooldown-pressure");
  if (params.predictRepeatedLastAction === true || numberParam(params.repeatLastActionPenalty) > 0) addHeroEffect("repeat-penalty");

  if (numberParam(params.damageReduction) > 0 || numberParam(params.selfDamageReduction) > 0) addMonsterEffect("incoming-damage");
  if (numberParam(params.evasionBonusPp) > 0 || numberParam(params.selfEvasionBonusPp) > 0) addMonsterEffect("evasion");
  if (numberParam(params.reflectFlatDamage) > 0) addMonsterEffect("reflect");
  if (numberParam(params.counterChance) > 0) addMonsterEffect("reflect");
  if (numberParam(params.statusResistancePp) > 0) addMonsterEffect("status-resistance");
  if (numberParam(params.nextAttackBonusIfShieldSurvives) > 0 || numberParam(params.copyLastDirectActionPotency) > 0) addMonsterEffect("next-attack-bonus");

  return {
    directDamage: getRawDamageMultiplier(ability) > 0 || directDamageRoles.has(ability.role),
    heroEffects,
    monsterEffects,
    immediate: {
      heal: numberParam(params.selfHealMaxHpFraction) > 0 || numberParam(params.healTargetMaxHpFraction) > 0,
      shield:
        numberParam(params.shieldMaxHpFraction) > 0 ||
        numberParam(params.fallbackShieldMaxHpFraction) > 0 ||
        numberParam(params.soloFallbackShieldMaxHpFraction) > 0,
      manaDrain: numberParam(params.manaDrain) > 0,
      cleanse: isTruthyParameter(params.cleanseNegativeEffects),
      removePositive: isTruthyParameter(params.removePositiveEffects),
      reapplyExpired: params.reapplyLastExpiredNegativeEffect === true,
      cooldownPressure: numberParam(params.extendLongestCooldownBy) > 0
    }
  };
}

function validateMonsterAbilityRecipe(
  ability: MonsterAbilityDefinition
): MonsterContentValidationIssue[] {
  const issues: MonsterContentValidationIssue[] = [];
  const parameterKeys = Object.keys(ability.parameters) as MonsterAbilityParameterKey[];

  for (const key of parameterKeys) {
    if (!supportedParameterKeys.has(key)) {
      issues.push({
        code: "unsupported-ability-parameter",
        message: `Monster ability ${ability.id} uses unsupported parameter ${key}.`,
        abilityId: ability.id
      });
    }
  }

  for (const [key, value] of Object.entries(ability.parameters)) {
    if (!isLegalParameterValue(key as MonsterAbilityParameterKey, value)) {
      issues.push({
        code: "invalid-ability-parameter",
        message: `Monster ability ${ability.id} has invalid value for ${key}.`,
        abilityId: ability.id
      });
    }
  }

  const recipe = compileMonsterAbilityRecipe(ability);
  const hasObservableEffect =
    recipe.directDamage ||
    recipe.heroEffects.length > 0 ||
    recipe.monsterEffects.length > 0 ||
    Object.values(recipe.immediate).some(Boolean);

  if (!hasObservableEffect) {
    issues.push({
      code: "effectless-ability",
      message: `Monster ability ${ability.id} compiles to no runtime effect.`,
      abilityId: ability.id
    });
  }

  if (hasAllyOnlyTarget(ability) && !hasSoloFallback(ability)) {
    issues.push({
      code: "unsupported-ally-target",
      message: `Monster ability ${ability.id} has only ally targets without a solo fallback.`,
      abilityId: ability.id
    });
  }

  return issues;
}

function isLegalParameterValue(key: MonsterAbilityParameterKey, value: unknown): boolean {
  switch (key) {
    case "bonusAgainstDebuffedTargets":
    case "cleanseNegativeEffects":
    case "groupTargetConfusion":
    case "lockAnyOneAbility":
    case "predictRepeatedLastAction":
    case "reapplyLastExpiredNegativeEffect":
    case "removePositiveEffects":
      return typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value) && value > 0);
    case "lockAbilitySource":
      return typeof value === "string" && value.length > 0;
    case "riderByTurnCycle":
    case "riderByTurnParity":
      return Array.isArray(value);
    default:
      return typeof value === "number" && Number.isFinite(value);
  }
}

function hasAllyOnlyTarget(ability: MonsterAbilityDefinition): boolean {
  return ability.targetScopes.every(
    (scope) => scope === "all-allies" || scope === "lowest-hp-ally"
  );
}

function hasSoloFallback(ability: MonsterAbilityDefinition): boolean {
  const params = ability.parameters;
  return (
    numberParam(params.fallbackShieldMaxHpFraction) > 0 ||
    numberParam(params.soloFallbackShieldMaxHpFraction) > 0 ||
    numberParam(params.shieldMaxHpFraction) > 0 ||
    numberParam(params.selfHealMaxHpFraction) > 0 ||
    numberParam(params.damageReduction) > 0 ||
    numberParam(params.selfDamageReduction) > 0
  );
}

export function validateMonsterAbilityContent(): MonsterContentValidationIssue[] {
  const issues: MonsterContentValidationIssue[] = [];
  const monsterIds = new Set(monsters.map((monster) => monster.id));
  const abilityIds = new Set<string>();
  const profileIds = new Set<string>();
  const abilityCount = (monsterAbilities as readonly unknown[]).length;
  const profileCount = (monsterCombatProfiles as readonly unknown[]).length;

  if (abilityCount !== 132) {
    issues.push({
      code: "ability-count",
      message: `Expected 132 monster abilities, found ${abilityCount}.`
    });
  }

  for (const ability of monsterAbilities) {
    if (abilityIds.has(ability.id)) {
      issues.push({
        code: "duplicate-ability-id",
        message: `Duplicate monster ability id: ${ability.id}.`,
        abilityId: ability.id
      });
    }
    abilityIds.add(ability.id);

    if (!ability.label.trim()) {
      issues.push({
        code: "empty-ability-label",
        message: `Monster ability ${ability.id} has an empty label.`,
        abilityId: ability.id
      });
    }

    if (!Number.isInteger(ability.cooldownOwnActions) || ability.cooldownOwnActions < 0) {
      issues.push({
        code: "invalid-cooldown",
        message: `Monster ability ${ability.id} has an invalid cooldown.`,
        abilityId: ability.id
      });
    }

    issues.push(...validateMonsterAbilityRecipe(ability));
  }

  if (profileCount !== 93) {
    issues.push({
      code: "profile-count",
      message: `Expected 93 monster profiles, found ${profileCount}.`
    });
  }

  for (const profile of monsterCombatProfiles as readonly MonsterCombatProfile[]) {
    if (profileIds.has(profile.monsterId)) {
      issues.push({
        code: "duplicate-profile-id",
        message: `Duplicate monster profile id: ${profile.monsterId}.`,
        monsterId: profile.monsterId
      });
    }
    profileIds.add(profile.monsterId);

    const monster = monsters.find((candidate) => candidate.id === profile.monsterId);
    if (!monsterIds.has(profile.monsterId) || !monster) {
      issues.push({
        code: "unknown-profile-monster",
        message: `Monster profile references unknown monster id: ${profile.monsterId}.`,
        monsterId: profile.monsterId
      });
      continue;
    }

    if (monster.level !== profile.authoredLevel) {
      issues.push({
        code: "authored-level-mismatch",
        message: `Monster profile ${profile.monsterId} authored level ${profile.authoredLevel} does not match current monster level ${monster.level}.`,
        monsterId: profile.monsterId
      });
    }

    const ids = [
      ...profile.abilityIds,
      ...(profile.upgradeAbilityIds ?? []).map((upgrade: { abilityId: string }) => upgrade.abilityId)
    ];
    const uniqueIds = new Set<string>();

    for (const abilityId of ids) {
      if (!abilityIds.has(abilityId)) {
        issues.push({
          code: "unknown-profile-ability",
          message: `Monster profile ${profile.monsterId} references unknown ability ${abilityId}.`,
          monsterId: profile.monsterId,
          abilityId
        });
      }
      if (uniqueIds.has(abilityId)) {
        issues.push({
          code: "duplicate-profile-ability",
          message: `Monster profile ${profile.monsterId} repeats ability ${abilityId}.`,
          monsterId: profile.monsterId,
          abilityId
        });
      }
      uniqueIds.add(abilityId);
    }

    const maxLowLevelCount = monster.level < 7 ? 2 : 3;
    if (profile.abilityIds.length > maxLowLevelCount) {
      issues.push({
        code: "illegal-low-level-count",
        message: `Monster profile ${profile.monsterId} carries ${profile.abilityIds.length} base abilities below the legal level gate.`,
        monsterId: profile.monsterId
      });
    }
  }

  for (const monster of monsters) {
    if (!profileIds.has(monster.id)) {
      issues.push({
        code: "missing-profile",
        message: `No monster combat profile exists for ${monster.id}.`,
        monsterId: monster.id
      });
    }
  }

  return issues;
}

export function createMonsterAbilityRuntime(
  input: MonsterRuntimeStartInput
): MonsterAbilityRuntimeStateV1 | undefined {
  if (input.monster.tags.includes("doppelganger")) {
    return undefined;
  }

  const profile = findMonsterCombatProfile(input.monster.monsterId);
  if (!profile) {
    return undefined;
  }

  const loadoutIds = resolveMonsterLoadoutIds({
    monster: input.monster,
    profile,
    seed: input.seed ?? input.monster.monsterId
  });

  if (loadoutIds.length === 0) {
    return undefined;
  }

  return {
    version: 1,
    rulesVersion: MONSTER_ABILITY_RUNTIME_RULES_VERSION,
    aiProfile: profile.aiProfile,
    loadoutIds,
    cooldowns: {},
    onceUsedAbilityIds: [],
    consecutiveAbilityUses: 0,
    effects: [],
    ownActionCount: 0
  };
}

export function resolveMonsterLoadoutIds(input: {
  monster: MonsterCombatStats;
  profile: MonsterCombatProfile;
  seed: string;
}): string[] {
  const desiredCount = getMonsterAbilitySlotCount(input.monster.level, input.monster.tags, input.profile);
  const explicit = [
    ...input.profile.abilityIds,
    ...(input.profile.upgradeAbilityIds ?? [])
      .filter((upgrade) => input.monster.level >= upgrade.minEffectiveLevel)
      .map((upgrade) => upgrade.abilityId)
  ];
  const selected: string[] = [];

  for (const abilityId of explicit) {
    if (!selected.includes(abilityId) && findMonsterAbility(abilityId)) {
      selected.push(abilityId);
    }
    if (selected.length >= desiredCount) {
      return selected;
    }
  }

  const fallback = selectFallbackAbilities({
    existingIds: selected,
    effectiveLevel: input.monster.level,
    monsterTags: input.monster.tags,
    seed: input.seed,
    desiredCount
  });

  return [...selected, ...fallback].slice(0, desiredCount);
}

export function getMonsterAbilitySlotCount(
  effectiveLevel: number,
  monsterTags: readonly string[],
  profile?: MonsterCombatProfile
): 1 | 2 | 3 {
  const level = Math.max(1, Math.floor(effectiveLevel));
  const tags = new Set(monsterTags);
  const canCarryTwoEarly = tags.has("boss") || tags.has("mini-boss") || tags.has("tiny-boss");
  const canCarryThreeAtSeven = tags.has("boss") || tags.has("mini-boss") || tags.has("elite");

  if (level <= 3) {
    return canCarryTwoEarly && (profile?.abilityIds.length ?? 0) >= 2 ? 2 : 1;
  }

  if (level <= 6) {
    return 2;
  }

  if (level <= 9) {
    return canCarryThreeAtSeven ? 3 : 2;
  }

  return 3;
}

export function cloneMonsterAbilityRuntimeState(
  state: MonsterAbilityRuntimeStateV1 | undefined
): MonsterAbilityRuntimeStateV1 | undefined {
  if (!state) {
    return undefined;
  }

  return {
    version: 1,
    rulesVersion: MONSTER_ABILITY_RUNTIME_RULES_VERSION,
    aiProfile: state.aiProfile,
    loadoutIds: [...state.loadoutIds],
    cooldowns: Object.fromEntries(
      Object.entries(state.cooldowns).map(([abilityId, cooldown]) => [
        abilityId,
        { ...cooldown }
      ])
    ),
    onceUsedAbilityIds: [...state.onceUsedAbilityIds],
    ...(state.lastActionKind ? { lastActionKind: state.lastActionKind } : {}),
    ...(state.lastAbilityId ? { lastAbilityId: state.lastAbilityId } : {}),
    consecutiveAbilityUses: state.consecutiveAbilityUses,
    ...(state.pendingTelegraph ? { pendingTelegraph: { ...state.pendingTelegraph } } : {}),
    ...(state.shield ? { shield: { ...state.shield } } : {}),
    effects: state.effects.map((effect) => ({ ...effect })),
    ...(state.expiredEffectIds ? { expiredEffectIds: [...state.expiredEffectIds] } : {}),
    ownActionCount: state.ownActionCount
  };
}

export function parseMonsterAbilityRuntimeState(
  value: unknown
): MonsterAbilityRuntimeStateV1 | null {
  if (!isRecord(value) || value.version !== 1 || value.rulesVersion !== MONSTER_ABILITY_RUNTIME_RULES_VERSION) {
    return null;
  }

  if (!isMonsterAiProfile(value.aiProfile) || !Array.isArray(value.loadoutIds)) {
    return null;
  }

  const consecutiveAbilityUses = intOrNull(value.consecutiveAbilityUses);
  const ownActionCount = intOrNull(value.ownActionCount);
  if (consecutiveAbilityUses === null || ownActionCount === null) {
    return null;
  }

  const pendingTelegraph = parsePendingTelegraph(value.pendingTelegraph);
  const shield = parseShield(value.shield);
  const runtime: MonsterAbilityRuntimeStateV1 = {
    version: 1,
    rulesVersion: MONSTER_ABILITY_RUNTIME_RULES_VERSION,
    aiProfile: value.aiProfile,
    loadoutIds: value.loadoutIds.filter((entry): entry is string => typeof entry === "string"),
    cooldowns: parseRuntimeCooldowns(value.cooldowns),
    onceUsedAbilityIds: Array.isArray(value.onceUsedAbilityIds)
      ? value.onceUsedAbilityIds.filter((entry): entry is string => typeof entry === "string")
      : [],
    ...(isRuntimeActionKind(value.lastActionKind) ? { lastActionKind: value.lastActionKind } : {}),
    ...(typeof value.lastAbilityId === "string" ? { lastAbilityId: value.lastAbilityId } : {}),
    consecutiveAbilityUses,
    ...(pendingTelegraph ? { pendingTelegraph } : {}),
    ...(shield ? { shield } : {}),
    effects: Array.isArray(value.effects) ? value.effects.flatMap(parseRuntimeEffect) : [],
    ...(Array.isArray(value.expiredEffectIds)
      ? { expiredEffectIds: value.expiredEffectIds.filter((entry): entry is string => typeof entry === "string") }
      : {}),
    ownActionCount
  };

  return runtime.loadoutIds.length > 0 ? runtime : null;
}

export function isHeroClassSkillLockedByMonster(state: CombatState): boolean {
  return Boolean(
    state.monsterRuntime?.effects.some(
      (effect) =>
        effect.target === "hero" &&
        effect.kind === "ability-lock" &&
        (effect.charges ?? 1) > 0 &&
        (effect.remainingTargetActivations ?? 1) > 0
    )
  );
}

export function applyHeroActivationMonsterEffects(state: CombatState): {
  state: CombatState;
  damage: number;
} {
  const runtime = cloneMonsterAbilityRuntimeState(state.monsterRuntime);
  if (!runtime) {
    return { state, damage: 0 };
  }

  let damage = 0;
  const effects: MonsterAbilityRuntimeEffect[] = [];
  const expired = [...(runtime.expiredEffectIds ?? [])];

  for (const effect of runtime.effects) {
    if (effect.target !== "hero") {
      effects.push(effect);
      continue;
    }

    if (effect.kind === "burn" || effect.kind === "bleed") {
      const tickDamage = Math.max(1, Math.floor((state.monster.attack ?? 1) * effect.value));
      damage += tickDamage;
    }

    const remainingTargetActivations = Math.max(0, (effect.remainingTargetActivations ?? 1) - 1);

    if (remainingTargetActivations > 0 && (effect.charges === undefined || effect.charges > 0)) {
      effects.push({
        ...effect,
        remainingTargetActivations
      });
    } else {
      expired.push(effect.id);
    }
  }

  runtime.effects = effects;
  runtime.expiredEffectIds = boundExpiredEffectIds(expired);
  state.monsterRuntime = runtime;
  state.hero.hp = Math.max(0, state.hero.hp - damage);

  return { state, damage };
}

export interface MonsterShieldDamageResult {
  hpAfter: number;
  shieldAfter: number;
  absorbed: number;
  appliedDamage: number;
}

export function resolveMonsterShieldDamage(input: {
  hpBefore: number;
  hpMax: number;
  shieldPoints: number;
  incomingDamage: number;
}): MonsterShieldDamageResult {
  const hpBefore = Math.max(0, Math.min(input.hpMax, Math.floor(input.hpBefore)));
  const shieldBefore = Math.max(0, Math.floor(input.shieldPoints));
  const incomingDamage = Math.max(0, Math.floor(input.incomingDamage));
  const absorbed = Math.min(shieldBefore, incomingDamage);
  const hpDamage = Math.min(hpBefore, Math.max(0, incomingDamage - absorbed));

  return {
    hpAfter: Math.max(0, hpBefore - hpDamage),
    shieldAfter: Math.max(0, shieldBefore - absorbed),
    absorbed,
    appliedDamage: hpDamage
  };
}

export function applyMonsterRuntimeHeroDamage(input: {
  state: CombatState;
  heroDamage: number;
  monsterHpBeforeDamage: number;
}): { heroDamage: number; reflectedDamage: number } {
  const runtime = input.state.monsterRuntime;
  if (!runtime || input.heroDamage <= 0) {
    return { heroDamage: input.heroDamage, reflectedDamage: 0 };
  }

  let incomingDamage = input.heroDamage;
  incomingDamage = applyHeroOutgoingDamageEffects(runtime, incomingDamage);
  incomingDamage = applyMonsterIncomingDamageEffects(runtime, incomingDamage);

  const shield = runtime.shield;
  const shieldResult = shield
    ? resolveMonsterShieldDamage({
        hpBefore: input.monsterHpBeforeDamage,
        hpMax: input.state.monster.hpMax,
        shieldPoints: shield.points,
        incomingDamage
      })
    : {
        hpAfter: Math.max(0, input.monsterHpBeforeDamage - incomingDamage),
        shieldAfter: 0,
        absorbed: 0,
        appliedDamage: Math.min(input.monsterHpBeforeDamage, incomingDamage)
      };

  input.state.monster.hp = shieldResult.hpAfter;

  if (shield && shieldResult.shieldAfter > 0) {
    runtime.shield = { ...shield, points: shieldResult.shieldAfter };
  } else if (shield) {
    delete runtime.shield;
  }

  const reflectedDamage = consumeReflectDamage(runtime, shieldResult.appliedDamage);
  const shieldBreakDamage = consumeShieldBreakDamage({
    state: input.state,
    sourceAbilityId: shield?.sourceAbilityId,
    shieldBroke: Boolean(shield && shield.points > 0 && shieldResult.shieldAfter <= 0)
  });
  const totalReflectedDamage = reflectedDamage + shieldBreakDamage;
  if (totalReflectedDamage > 0) {
    input.state.hero.hp = Math.max(0, input.state.hero.hp - totalReflectedDamage);
  }

  return { heroDamage: shieldResult.appliedDamage, reflectedDamage: totalReflectedDamage };
}

export function applyMonsterShieldToHeroDamage(input: {
  state: CombatState;
  heroDamage: number;
  monsterHpBeforeDamage?: number;
}): number {
  return applyMonsterRuntimeHeroDamage({
    state: input.state,
    heroDamage: input.heroDamage,
    monsterHpBeforeDamage: input.monsterHpBeforeDamage ?? input.state.monster.hp
  }).heroDamage;
}

export function applyMonsterRuntimeHeroAttackModifiers(
  state: CombatState,
  monster: MonsterCombatStats
): MonsterCombatStats {
  const runtime = state.monsterRuntime;
  if (!runtime) {
    return monster;
  }

  const heroAccuracyPenalty = sumEffects(runtime, "hero", "accuracy");
  const monsterEvasionBonus = sumEffects(runtime, "monster", "evasion");
  const evasionDeltaPp = heroAccuracyPenalty + monsterEvasionBonus;

  if (evasionDeltaPp === 0) {
    return monster;
  }

  return addMonsterContextDelta(monster, { evasionDeltaPp });
}

export function applyMonsterRuntimeMonsterActionModifiers(
  state: CombatState,
  monster: MonsterCombatStats
): MonsterCombatStats {
  const runtime = state.monsterRuntime;
  if (!runtime) {
    return monster;
  }

  const heroEvasionPenalty = sumEffects(runtime, "hero", "evasion");
  const outgoingMultiplier = multiplyEffects(runtime, "monster", "outgoing-damage");
  const nextAttackBonus = getMonsterEffect(runtime, "monster", "next-attack-bonus");
  const damageMultiplier = outgoingMultiplier * (nextAttackBonus ? Math.max(1, nextAttackBonus.value) : 1);

  let modified = heroEvasionPenalty === 0
    ? monster
    : addMonsterContextDelta(monster, { accuracyDeltaPp: heroEvasionPenalty });

  if (damageMultiplier !== 1) {
    modified = {
      ...modified,
      contextModifiers: {
        ...defaultCombatContextModifiers(modified),
        outgoingDamageMultiplier:
          defaultCombatContextModifiers(modified).outgoingDamageMultiplier * damageMultiplier
      }
    };
  }

  return modified;
}

export function applyMonsterRuntimeFleePenalty(
  state: CombatState,
  hero: CombatActorStats
): CombatActorStats {
  const runtime = state.monsterRuntime;
  if (!runtime) {
    return hero;
  }

  const penaltyPp = sumEffects(runtime, "hero", "flee");
  if (penaltyPp <= 0) {
    return hero;
  }

  const statPenalty = Math.max(1, Math.floor(penaltyPp / 4));

  return {
    ...hero,
    dexterity: Math.max(0, hero.dexterity - statPenalty),
    luck: Math.max(0, hero.luck - statPenalty)
  };
}

export function getMonsterRuntimeSkillManaCostIncrease(state: CombatState): number {
  const runtime = state.monsterRuntime;
  if (!runtime) {
    return 0;
  }

  return Math.max(0, Math.floor(sumEffects(runtime, "hero", "mana-cost-pressure")));
}

export function resolveMonsterRuntimeAction(
  input: ResolveMonsterRuntimeActionInput
): ResolvedMonsterRuntimeAction {
  const state = input.state;
  const runtime = cloneMonsterAbilityRuntimeState(state.monsterRuntime);

  if (!runtime || state.status !== "active") {
    return { state, damage: 0 };
  }

  state.monsterRuntime = runtime;

  const pending = runtime.pendingTelegraph
    ? findMonsterAbility(runtime.pendingTelegraph.abilityId)
    : null;
  if (pending) {
    delete runtime.pendingTelegraph;
    return commitMonsterAbility({
      state,
      runtime,
      ability: pending,
      hero: input.hero,
      monster: input.monster,
      rng: input.rng,
      damageReduction: input.damageReduction ?? 0,
      defendStance: input.defendStance,
      wasTelegraphed: true
    });
  }

  const selected = selectMonsterRuntimeAction({ state, runtime, hero: input.hero, monster: input.monster, rng: input.rng });

  if (selected.kind === "defend") {
    tickMonsterRuntimeOwnAction(runtime);
    runtime.lastActionKind = "defend";
    delete runtime.lastAbilityId;
    runtime.consecutiveAbilityUses = 0;
    runtime.shield = {
      sourceAbilityId: "monster.basic-defend",
      points: Math.max(1, Math.floor(input.monster.hpMax * 0.12))
    };
    return {
      state,
      damage: 0,
      actionKind: "defend",
      effectText: "Монстр прикрився й підготувався ковтнути частину наступного удару."
    };
  }

  if (selected.kind === "ability") {
    if (selected.ability.telegraphOneEnemyAction) {
      runtime.pendingTelegraph = {
        abilityId: selected.ability.id,
        announcedAtTurn: state.turn
      };
      tickMonsterRuntimeOwnAction(runtime);
      setRuntimeAbilityCooldown(runtime, selected.ability);
      runtime.lastActionKind = "telegraph";
      runtime.lastAbilityId = selected.ability.id;
      runtime.consecutiveAbilityUses += 1;
      return {
        state,
        damage: 0,
        actionKind: "telegraph",
        ability: selected.ability,
        telegraphAbility: selected.ability,
        effectText: `${selected.ability.label} готується. Наступний удар буде помітно серйозніший.`
      };
    }

    return commitMonsterAbility({
      state,
      runtime,
      ability: selected.ability,
      hero: input.hero,
      monster: input.monster,
      rng: input.rng,
      damageReduction: input.damageReduction ?? 0,
      defendStance: input.defendStance,
      wasTelegraphed: false
    });
  }

  tickMonsterRuntimeOwnAction(runtime);
  runtime.lastActionKind = "attack";
  delete runtime.lastAbilityId;
  runtime.consecutiveAbilityUses = 0;
  return { state, damage: 0, actionKind: "attack" };
}

export function getMonsterAbilityLabel(abilityId: string | undefined): string | null {
  return abilityId ? findMonsterAbility(abilityId)?.label ?? null : null;
}

function selectMonsterRuntimeAction(input: {
  state: CombatState;
  runtime: MonsterAbilityRuntimeStateV1;
  hero: CombatActorStats;
  monster: MonsterCombatStats;
  rng: RandomSource;
}): { kind: "attack" } | { kind: "defend" } | { kind: "ability"; ability: MonsterAbilityDefinition } {
  const legalAbilities = getLegalMonsterAbilities(input);
  const weights = aiWeights[input.runtime.aiProfile];
  const abilityDelta = Math.max(-20, Math.min(20, input.monster.contextModifiers?.abilityWeightDelta ?? 0));
  const abilityWeight = legalAbilities.length > 0 ? Math.max(0, weights.ability + abilityDelta) : 0;
  const defendWeight = shouldDeprioritizeDefend(input.runtime) ? 0 : weights.defend;
  const basicWeight = Math.max(1, weights.basic - Math.max(0, abilityDelta));
  const total = basicWeight + abilityWeight + defendWeight;
  const roll = input.rng.nextFloat() * total;

  if (roll < abilityWeight && legalAbilities.length > 0) {
    return {
      kind: "ability",
      ability: chooseAbility(legalAbilities, input.rng)
    };
  }

  if (roll < abilityWeight + defendWeight) {
    return { kind: "defend" };
  }

  return { kind: "attack" };
}

function getLegalMonsterAbilities(input: {
  state: CombatState;
  runtime: MonsterAbilityRuntimeStateV1;
  hero: CombatActorStats;
  monster: MonsterCombatStats;
}): MonsterAbilityDefinition[] {
  if (input.runtime.aiProfile !== "boss" && input.runtime.lastActionKind === "ability") {
    return [];
  }

  if (
    input.runtime.aiProfile === "boss" &&
    input.runtime.consecutiveAbilityUses >= 2
  ) {
    return [];
  }

  return input.runtime.loadoutIds
    .flatMap((abilityId) => {
      const ability = findMonsterAbility(abilityId);
      return ability ? [ability] : [];
    })
    .filter((ability) => !isRuntimeAbilityOnCooldown(input.runtime, ability.id))
    .filter((ability) => !ability.oncePerFight || !input.runtime.onceUsedAbilityIds.includes(ability.id))
    .filter((ability) => input.runtime.lastAbilityId !== ability.id || input.runtime.aiProfile !== "boss")
    .filter((ability) => isAbilityConditionLegal({ ...input, ability }));
}

function isAbilityConditionLegal(input: {
  state: CombatState;
  runtime: MonsterAbilityRuntimeStateV1;
  hero: CombatActorStats;
  monster: MonsterCombatStats;
  ability: MonsterAbilityDefinition;
}): boolean {
  const params = input.ability.parameters;

  if (numberParam(params.selfHealMaxHpFraction) > 0 && input.state.monster.hp / input.state.monster.hpMax > 0.75) {
    return false;
  }

  const shieldFraction = Math.max(
    numberParam(params.shieldMaxHpFraction),
    numberParam(params.fallbackShieldMaxHpFraction),
    numberParam(params.soloFallbackShieldMaxHpFraction)
  );
  if (shieldFraction > 0) {
    const proposedShield = Math.floor(input.state.monster.hpMax * shieldFraction);
    if ((input.runtime.shield?.points ?? 0) >= proposedShield) {
      return false;
    }
  }

  if (numberParam(params.markIncomingDamageMultiplier) > 0 && hasHeroEffect(input.runtime, "mark")) {
    return false;
  }

  return true;
}

function commitMonsterAbility(input: {
  state: CombatState;
  runtime: MonsterAbilityRuntimeStateV1;
  ability: MonsterAbilityDefinition;
  hero: CombatActorStats;
  monster: MonsterCombatStats;
  rng: RandomSource;
  damageReduction: number;
  defendStance?: MonsterRuntimeDefendStance | undefined;
  wasTelegraphed: boolean;
}): ResolvedMonsterRuntimeAction {
  tickMonsterRuntimeOwnAction(input.runtime);
  const effect = resolveMonsterAbilityEffects(input);
  input.state.hero.hp = Math.max(0, input.state.hero.hp - effect.damage);
  setRuntimeAbilityCooldown(input.runtime, input.ability);

  if (input.ability.oncePerFight && !input.runtime.onceUsedAbilityIds.includes(input.ability.id)) {
    input.runtime.onceUsedAbilityIds.push(input.ability.id);
  }

  input.runtime.lastActionKind = "ability";
  input.runtime.lastAbilityId = input.ability.id;
  input.runtime.consecutiveAbilityUses += 1;

  return {
    state: input.state,
    damage: effect.damage,
    outcome: effect.damage > 0 ? "hit" : "miss",
    actionKind: "ability",
    ability: input.ability,
    damageKind: getAbilityDamageKind(input.ability),
    ...(effect.text ? { effectText: effect.text } : {})
  };
}

function resolveMonsterAbilityEffects(input: {
  state: CombatState;
  runtime: MonsterAbilityRuntimeStateV1;
  ability: MonsterAbilityDefinition;
  hero: CombatActorStats;
  monster: MonsterCombatStats;
  rng: RandomSource;
  damageReduction: number;
  defendStance?: MonsterRuntimeDefendStance | undefined;
  wasTelegraphed: boolean;
}): { damage: number; text?: string } {
  const params = input.ability.parameters;
  const multiplier = getDamageMultiplier(input);
  const hitChance = Math.max(
    0.55,
    Math.min(
      0.97,
      0.8 +
        (input.monster.dexterity - input.hero.dexterity) * 0.01 -
        numberParam(params.accuracyPenaltyPp) / 100 -
        (input.monster.contextModifiers?.accuracyDeltaPp ?? 0) / 100
    )
  );
  let damage = 0;

  if (multiplier > 0 && input.rng.nextFloat() < hitChance) {
    if (!input.defendStance || input.rng.nextFloat() >= input.defendStance.evasionChance) {
      const variance = input.rng.nextInt(0, 2);
      const mark = consumeHeroMark(input.runtime);
      const raw =
        (input.monster.attack + variance + getPowerBandDamageBonus(input.ability.powerBand)) *
        multiplier *
        mark *
        (input.monster.contextModifiers?.outgoingDamageMultiplier ?? 1);
      const defense = getHeroDefenseForAbility(input.ability, input.hero);
      damage = Math.max(1, Math.floor(raw) - defense - input.damageReduction);

      if (input.defendStance) {
        damage = Math.max(1, Math.floor(damage * (1 - input.defendStance.damageReduction)));
      }

      if (input.wasTelegraphed) {
        damage = Math.max(1, Math.floor(damage * 1.18));
      }
    }
  }

  const effectTexts: string[] = [];
  const manaDrain = Math.min(input.state.hero.mana, Math.max(0, Math.floor(numberParam(params.manaDrain))));
  if (manaDrain > 0) {
    input.state.hero.mana = Math.max(0, input.state.hero.mana - manaDrain);
    effectTexts.push(`мана просіла на ${manaDrain}`);
  }

  const healFraction = Math.max(
    numberParam(params.selfHealMaxHpFraction),
    numberParam(params.healTargetMaxHpFraction)
  );
  if (healFraction > 0) {
    const healed = healMonster(input.state, healFraction);
    if (healed > 0) {
      effectTexts.push(`монстр відновив ${healed} HP`);
    }
  }

  const shieldFraction = Math.max(
    numberParam(params.shieldMaxHpFraction),
    numberParam(params.fallbackShieldMaxHpFraction),
    numberParam(params.soloFallbackShieldMaxHpFraction)
  );
  if (shieldFraction > 0) {
    const points = Math.max(1, Math.floor(input.state.monster.hpMax * Math.min(0.4, shieldFraction)));
    input.runtime.shield = {
      sourceAbilityId: input.ability.id,
      points
    };
    effectTexts.push(`щит тримає ${points} шкоди`);
  }

  if (isTruthyParameter(params.cleanseNegativeEffects)) {
    const before = input.runtime.effects.length;
    input.runtime.effects = input.runtime.effects.filter(
      (effect) => effect.target !== "monster" || effect.kind === "reflect" || effect.kind === "status-resistance"
    );
    if (input.runtime.effects.length !== before) {
      effectTexts.push("монстр струсив із себе слабкість");
    }
  }

  if (isTruthyParameter(params.removePositiveEffects)) {
    const before = input.runtime.effects.length;
    input.runtime.effects = input.runtime.effects.filter(
      (effect) => !(effect.target === "hero" && effect.kind === "outgoing-damage" && effect.value > 1)
    );
    if (input.runtime.effects.length !== before || damage > 0) {
      effectTexts.push("ваші підсилення збилися");
    }
  }

  const cooldownExtension = Math.max(0, Math.floor(numberParam(params.extendLongestCooldownBy)));
  if (cooldownExtension > 0) {
    extendHeroLongestCooldown(input.state, cooldownExtension);
    effectTexts.push(`відсап здібності затягнувся на ${cooldownExtension}`);
  }

  addRuntimeEffects(input);

  return {
    damage,
    ...(effectTexts.length > 0 ? { text: effectTexts[0] } : {})
  };
}

function addRuntimeEffects(input: {
  state: CombatState;
  runtime: MonsterAbilityRuntimeStateV1;
  ability: MonsterAbilityDefinition;
}): void {
  const params = input.ability.parameters;
  const targetDuration = Math.max(1, Math.floor(numberParam(params.durationTargetActivations)));
  const ownDuration = Math.max(1, Math.floor(numberParam(params.durationOwnActivations)));
  const addEffect = (effect: Omit<MonsterAbilityRuntimeEffect, "id" | "sourceAbilityId">): void => {
    const replacement: MonsterAbilityRuntimeEffect = {
      id: `${input.ability.id}:${input.runtime.ownActionCount}:${input.runtime.effects.length}`,
      sourceAbilityId: input.ability.id,
      ...effect
    };
    const duplicateIndex = input.runtime.effects.findIndex(
      (existing) => existing.target === replacement.target && existing.kind === replacement.kind
    );

    if (duplicateIndex >= 0) {
      input.runtime.effects[duplicateIndex] = mergeRuntimeEffects(
        input.runtime.effects[duplicateIndex]!,
        replacement
      );
      return;
    }

    input.runtime.effects.push(replacement);
  };

  const markMultiplier = numberParam(params.markIncomingDamageMultiplier);
  if (markMultiplier > 0) {
    addEffect({
      target: "hero",
      kind: "mark",
      value: Math.min(1.75, Math.max(1, markMultiplier)),
      remainingTargetActivations: targetDuration,
      charges: Math.max(1, Math.floor(numberParam(params.charges) || 1))
    });
  }

  const burn = numberParam(params.burnDamageMultiplier);
  if (burn > 0) {
    addEffect({
      target: "hero",
      kind: "burn",
      value: Math.min(0.35, burn),
      remainingTargetActivations: Math.max(1, Math.floor(numberParam(params.burnTicks) || targetDuration))
    });
  }

  const bleed = numberParam(params.bleedDamageMultiplier);
  if (bleed > 0) {
    addEffect({
      target: "hero",
      kind: "bleed",
      value: Math.min(0.35, bleed),
      remainingTargetActivations: Math.max(1, Math.floor(numberParam(params.bleedTicks) || targetDuration))
    });
  }

  if (typeof params.lockAbilitySource === "string" || params.lockAnyOneAbility === true) {
    addEffect({
      target: "hero",
      kind: "ability-lock",
      value: 1,
      remainingTargetActivations: targetDuration,
      charges: 1
    });
  }

  const targetAccuracyPenalty = Math.max(
    numberParam(params.targetAccuracyPenaltyPp),
    numberParam(params.accuracyAndEvasionPenaltyPp)
  );
  if (targetAccuracyPenalty > 0) {
    addEffect({
      target: "hero",
      kind: "accuracy",
      value: Math.min(35, targetAccuracyPenalty),
      remainingTargetActivations: targetDuration
    });
  }

  const evasionPenalty = Math.max(
    numberParam(params.evasionPenaltyPp),
    numberParam(params.accuracyAndEvasionPenaltyPp)
  );
  if (evasionPenalty > 0) {
    addEffect({
      target: "hero",
      kind: "evasion",
      value: Math.min(35, evasionPenalty),
      remainingTargetActivations: targetDuration
    });
  }

  const outgoing = numberParam(params.outgoingDamageMultiplier);
  if (outgoing > 0 && outgoing !== 1) {
    if (targetsOnlySelf(input.ability)) {
      addEffect({
        target: "monster",
        kind: "outgoing-damage",
        value: Math.min(1.35, Math.max(0.65, outgoing)),
        remainingOwnActivations: ownDuration
      });
    } else {
      addEffect({
        target: "hero",
        kind: "outgoing-damage",
        value: Math.min(1.35, Math.max(0.65, outgoing)),
        remainingTargetActivations: targetDuration
      });
    }
  }

  const reduction = Math.max(numberParam(params.damageReduction), numberParam(params.selfDamageReduction));
  if (reduction > 0) {
    addEffect({
      target: "monster",
      kind: "incoming-damage",
      value: Math.min(0.5, reduction),
      remainingOwnActivations: ownDuration
    });
  }

  const reflect = numberParam(params.reflectFlatDamage);
  if (reflect > 0) {
    addEffect({
      target: "monster",
      kind: "reflect",
      value: Math.min(13, reflect),
      remainingOwnActivations: ownDuration,
      charges: 1
    });
  }

  const counterChance = numberParam(params.counterChance);
  if (counterChance > 0) {
    addEffect({
      target: "monster",
      kind: "reflect",
      value: Math.max(1, Math.floor(counterChance * (input.state.monster.attack ?? 1))),
      remainingOwnActivations: ownDuration,
      charges: 1
    });
  }

  const evasionBonus = Math.max(numberParam(params.evasionBonusPp), numberParam(params.selfEvasionBonusPp));
  if (evasionBonus > 0) {
    addEffect({
      target: "monster",
      kind: "evasion",
      value: Math.min(35, evasionBonus),
      remainingOwnActivations: ownDuration
    });
  }

  const manaCostIncrease = numberParam(params.manaCostIncrease);
  if (manaCostIncrease > 0) {
    addEffect({
      target: "hero",
      kind: "mana-cost-pressure",
      value: Math.min(13, manaCostIncrease),
      remainingTargetActivations: targetDuration
    });
  }

  const cooldownPressure = numberParam(params.extendLongestCooldownBy);
  if (cooldownPressure > 0) {
    addEffect({
      target: "hero",
      kind: "cooldown-pressure",
      value: Math.min(13, cooldownPressure),
      remainingTargetActivations: targetDuration
    });
  }

  const fleePenalty = numberParam(params.fleeChancePenaltyPp);
  if (fleePenalty > 0) {
    addEffect({
      target: "hero",
      kind: "flee",
      value: Math.min(35, fleePenalty),
      remainingTargetActivations: targetDuration
    });
  }

  const critPenalty = numberParam(params.critPenaltyPp);
  if (critPenalty > 0) {
    addEffect({
      target: "hero",
      kind: "crit",
      value: Math.min(35, critPenalty),
      remainingTargetActivations: targetDuration
    });
  }

  const slow = numberParam(params.slowAttackerPp);
  if (slow > 0) {
    addEffect({
      target: "hero",
      kind: "slow",
      value: Math.min(35, slow),
      remainingTargetActivations: targetDuration
    });
  }

  if (params.groupTargetConfusion === true) {
    addEffect({
      target: "hero",
      kind: "confusion",
      value: 1,
      remainingTargetActivations: targetDuration
    });
  }

  if (params.predictRepeatedLastAction === true || numberParam(params.repeatLastActionPenalty) > 0) {
    addEffect({
      target: "hero",
      kind: "repeat-penalty",
      value: Math.max(1, numberParam(params.repeatLastActionPenalty)),
      remainingTargetActivations: targetDuration
    });
  }

  if (params.reapplyLastExpiredNegativeEffect === true) {
    addEffect({
      target: "hero",
      kind: "repeat-penalty",
      value: Math.max(1, numberParam(params.repeatLastActionPenalty)),
      remainingTargetActivations: targetDuration
    });
  }

  const statusResistance = numberParam(params.statusResistancePp);
  if (statusResistance > 0) {
    addEffect({
      target: "monster",
      kind: "status-resistance",
      value: Math.min(50, statusResistance),
      remainingOwnActivations: ownDuration
    });
  }

  const nextAttackBonus = Math.max(
    numberParam(params.nextAttackBonusIfShieldSurvives),
    numberParam(params.copyLastDirectActionPotency)
  );
  if (nextAttackBonus > 0) {
    addEffect({
      target: "monster",
      kind: "next-attack-bonus",
      value: Math.min(1.6, Math.max(1, nextAttackBonus)),
      remainingOwnActivations: ownDuration,
      charges: 1
    });
  }
}

function tickMonsterRuntimeOwnAction(runtime: MonsterAbilityRuntimeStateV1): void {
  runtime.ownActionCount += 1;
  runtime.cooldowns = Object.fromEntries(
    Object.entries(runtime.cooldowns)
      .map(([abilityId, cooldown]) => [
        abilityId,
        {
          ...cooldown,
          remainingOwnActions: Math.max(0, cooldown.remainingOwnActions - 1)
        }
      ] as const)
      .filter(([, cooldown]) => cooldown.remainingOwnActions > 0)
  );

  runtime.effects = runtime.effects.flatMap((effect) => {
    if (effect.target !== "monster" || effect.remainingOwnActivations === undefined) {
      return [effect];
    }

    const remaining = Math.max(0, effect.remainingOwnActivations - 1);
    if (remaining <= 0) {
      runtime.expiredEffectIds = boundExpiredEffectIds([...(runtime.expiredEffectIds ?? []), effect.id]);
      return [];
    }

    return [{ ...effect, remainingOwnActivations: remaining }];
  });
}

function mergeRuntimeEffects(
  current: MonsterAbilityRuntimeEffect,
  next: MonsterAbilityRuntimeEffect
): MonsterAbilityRuntimeEffect {
  return {
    ...current,
    sourceAbilityId: next.sourceAbilityId,
    value:
      next.kind === "outgoing-damage" && next.value < 1
        ? Math.min(current.value, next.value)
        : Math.max(current.value, next.value),
    ...(current.remainingOwnActivations !== undefined || next.remainingOwnActivations !== undefined
      ? {
          remainingOwnActivations: Math.max(
            current.remainingOwnActivations ?? 0,
            next.remainingOwnActivations ?? 0
          )
        }
      : {}),
    ...(current.remainingTargetActivations !== undefined || next.remainingTargetActivations !== undefined
      ? {
          remainingTargetActivations: Math.max(
            current.remainingTargetActivations ?? 0,
            next.remainingTargetActivations ?? 0
          )
        }
      : {}),
    ...(current.charges !== undefined || next.charges !== undefined
      ? { charges: Math.max(current.charges ?? 0, next.charges ?? 0) }
      : {})
  };
}

function applyHeroOutgoingDamageEffects(
  runtime: MonsterAbilityRuntimeStateV1,
  damage: number
): number {
  const multiplier = multiplyEffects(runtime, "hero", "outgoing-damage");
  const reduction = sumEffects(runtime, "monster", "incoming-damage");
  const slowReduction = Math.min(0.35, sumEffects(runtime, "hero", "slow") / 100);
  const critPenaltyReduction = Math.min(0.2, sumEffects(runtime, "hero", "crit") / 200);
  const confusionReduction = getMonsterEffect(runtime, "hero", "confusion") ? 0.1 : 0;
  const repeatPenaltyReduction = Math.min(0.25, sumEffects(runtime, "hero", "repeat-penalty") / 100);
  const adjusted = Math.floor(
    damage *
      multiplier *
      (1 - Math.min(0.75, reduction)) *
      (1 - slowReduction - critPenaltyReduction - confusionReduction - repeatPenaltyReduction)
  );

  return damage > 0 ? Math.max(1, adjusted) : 0;
}

function consumeShieldBreakDamage(input: {
  state: CombatState;
  sourceAbilityId: string | undefined;
  shieldBroke: boolean;
}): number {
  if (!input.sourceAbilityId || !input.shieldBroke) {
    return 0;
  }

  const sourceAbility = findMonsterAbility(input.sourceAbilityId);
  const multiplier = numberParam(sourceAbility?.parameters.damageMultiplierWhenShieldBreaks);
  if (multiplier <= 0) {
    return 0;
  }

  return Math.max(1, Math.floor((input.state.monster.attack ?? 1) * multiplier));
}

function applyMonsterIncomingDamageEffects(
  runtime: MonsterAbilityRuntimeStateV1,
  damage: number
): number {
  const evasionReduction = Math.min(0.5, sumEffects(runtime, "monster", "evasion") / 100);
  const adjusted = Math.floor(damage * (1 - evasionReduction));

  return damage > 0 ? Math.max(1, adjusted) : 0;
}

function consumeReflectDamage(
  runtime: MonsterAbilityRuntimeStateV1,
  appliedDamage: number
): number {
  if (appliedDamage <= 0) {
    return 0;
  }

  const reflect = getMonsterEffect(runtime, "monster", "reflect");
  if (!reflect) {
    return 0;
  }

  const reflectedDamage = Math.max(1, Math.floor(reflect.value));
  reflect.charges = Math.max(0, (reflect.charges ?? 1) - 1);
  if (reflect.charges <= 0) {
    runtime.effects = runtime.effects.filter((effect) => effect !== reflect);
    runtime.expiredEffectIds = boundExpiredEffectIds([...(runtime.expiredEffectIds ?? []), reflect.id]);
  }

  return reflectedDamage;
}

function getMonsterEffect(
  runtime: MonsterAbilityRuntimeStateV1,
  target: MonsterAbilityEffectTarget,
  kind: MonsterAbilityEffectKind
): MonsterAbilityRuntimeEffect | undefined {
  return runtime.effects.find(
    (effect) => effect.target === target && effect.kind === kind
  );
}

function sumEffects(
  runtime: MonsterAbilityRuntimeStateV1,
  target: MonsterAbilityEffectTarget,
  kind: MonsterAbilityEffectKind
): number {
  return runtime.effects
    .filter((effect) => effect.target === target && effect.kind === kind)
    .reduce((sum, effect) => sum + effect.value, 0);
}

function multiplyEffects(
  runtime: MonsterAbilityRuntimeStateV1,
  target: MonsterAbilityEffectTarget,
  kind: MonsterAbilityEffectKind
): number {
  return runtime.effects
    .filter((effect) => effect.target === target && effect.kind === kind)
    .reduce((multiplier, effect) => multiplier * effect.value, 1);
}

function addMonsterContextDelta(
  monster: MonsterCombatStats,
  delta: Partial<Pick<NonNullable<MonsterCombatStats["contextModifiers"]>, "accuracyDeltaPp" | "evasionDeltaPp">>
): MonsterCombatStats {
  const context = defaultCombatContextModifiers(monster);

  return {
    ...monster,
    contextModifiers: {
      ...context,
      accuracyDeltaPp: context.accuracyDeltaPp + (delta.accuracyDeltaPp ?? 0),
      evasionDeltaPp: context.evasionDeltaPp + (delta.evasionDeltaPp ?? 0)
    }
  };
}

function defaultCombatContextModifiers(
  monster: MonsterCombatStats
): NonNullable<MonsterCombatStats["contextModifiers"]> {
  return monster.contextModifiers
    ? { ...monster.contextModifiers }
    : {
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
}

function extendHeroLongestCooldown(state: CombatState, extension: number): void {
  const entries = Object.entries(state.cooldowns?.abilities ?? {});
  const longest = entries.sort(
    ([, left], [, right]) => right.remainingTurns - left.remainingTurns
  )[0];

  if (!longest) {
    return;
  }

  const [abilityId, cooldown] = longest;
  const nextCooldown = {
    ...cooldown,
    remainingTurns: cooldown.remainingTurns + extension
  };
  state.cooldowns = {
    ...state.cooldowns,
    abilities: {
      ...state.cooldowns?.abilities,
      [abilityId]: nextCooldown
    },
    ...(state.cooldowns?.skill?.id === abilityId ? { skill: nextCooldown } : state.cooldowns?.skill ? { skill: state.cooldowns.skill } : {})
  };
}

function boundExpiredEffectIds(effectIds: readonly string[]): string[] {
  return effectIds.slice(-23);
}

function targetsOnlySelf(ability: MonsterAbilityDefinition): boolean {
  return ability.targetScopes.every((scope) => scope === "self" || scope === "lowest-hp-ally" || scope === "all-allies");
}

function getHeroDefenseForAbility(
  ability: MonsterAbilityDefinition,
  hero: CombatActorStats
): number {
  const damageKind = getAbilityDamageKind(ability);
  const defense =
    damageKind === "spell"
      ? hero.resist ?? 0
      : damageKind === "physical"
        ? hero.armor ?? 0
        : Math.floor(((hero.armor ?? 0) + (hero.resist ?? 0)) / 2);

  return Math.floor(defense * 0.8);
}

function setRuntimeAbilityCooldown(
  runtime: MonsterAbilityRuntimeStateV1,
  ability: MonsterAbilityDefinition
): void {
  const cooldown = Math.max(0, ability.cooldownOwnActions);
  if (cooldown <= 0) {
    return;
  }

  runtime.cooldowns[ability.id] = {
    id: ability.id,
    remainingOwnActions: cooldown
  };
}

function isRuntimeAbilityOnCooldown(
  runtime: MonsterAbilityRuntimeStateV1,
  abilityId: string
): boolean {
  return (runtime.cooldowns[abilityId]?.remainingOwnActions ?? 0) > 0;
}

function chooseAbility(
  abilities: readonly MonsterAbilityDefinition[],
  rng: RandomSource
): MonsterAbilityDefinition {
  const weighted = abilities.map((ability) => ({
    ability,
    weight: getAbilitySelectionWeight(ability)
  }));
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = rng.nextFloat() * total;

  for (const entry of weighted) {
    roll -= entry.weight;
    if (roll <= 0) {
      return entry.ability;
    }
  }

  return weighted[weighted.length - 1]?.ability ?? abilities[0]!;
}

function getAbilitySelectionWeight(ability: MonsterAbilityDefinition): number {
  const roleWeight: Record<MonsterAbilityRole, number> = {
    artillery: 12,
    cleanser: 6,
    controller: 10,
    defender: 7,
    setup: 7,
    skirmisher: 10,
    striker: 11,
    sustain: 7,
    trickster: 9
  };
  return roleWeight[ability.role] ?? 8;
}

function getDamageMultiplier(input: {
  state: CombatState;
  runtime: MonsterAbilityRuntimeStateV1;
  ability: MonsterAbilityDefinition;
}): number {
  const params = input.ability.parameters;
  let multiplier = getRawDamageMultiplier(input.ability);

  if (numberParam(params.bonusDamageMultiplierBelowHalfHp) > 0 && input.state.monster.hp * 2 <= input.state.monster.hpMax) {
    multiplier *= numberParam(params.bonusDamageMultiplierBelowHalfHp);
  }

  if (isTruthyParameter(params.bonusAgainstDebuffedTargets) && input.runtime.effects.some((effect) => effect.target === "hero")) {
    multiplier *= 1 + Math.max(0.15, numberParam(params.bonusAgainstDebuffedTargets));
  }

  if (multiplier <= 0 && directDamageRoles.has(input.ability.role)) {
    multiplier = getDefaultRoleMultiplier(input.ability.role, input.ability.powerBand);
  }

  return Math.min(1.85, Math.max(0, multiplier));
}

function getRawDamageMultiplier(ability: MonsterAbilityDefinition): number {
  const params = ability.parameters;
  let multiplier = numberParam(params.damageMultiplier);
  multiplier *= numberParam(params.abilityPotencyMultiplier) || 1;
  multiplier *= numberParam(params.bossFallbackAbilityPotencyMultiplier) || 1;

  return multiplier;
}

function getDefaultRoleMultiplier(role: MonsterAbilityRole, powerBand: MonsterAbilityPowerBand): number {
  const base = role === "artillery" ? 0.9 : role === "striker" ? 0.85 : 0.55;
  return base + getPowerBandDamageBonus(powerBand) * 0.03;
}

function getPowerBandDamageBonus(powerBand: MonsterAbilityPowerBand): number {
  switch (powerBand) {
    case "minor":
      return 0;
    case "standard":
      return 1;
    case "strong":
      return 3;
    case "ultimate":
      return 5;
  }
}

function getAbilityDamageKind(ability: MonsterAbilityDefinition): CombatDamageKind {
  switch (ability.role) {
    case "artillery":
    case "cleanser":
    case "sustain":
      return "spell";
    case "controller":
    case "setup":
    case "trickster":
      return "trick";
    case "defender":
    case "skirmisher":
    case "striker":
      return "physical";
  }
}

function healMonster(state: CombatState, fraction: number): number {
  const amount = Math.max(1, Math.floor(state.monster.hpMax * Math.min(0.35, fraction)));
  const before = state.monster.hp;
  state.monster.hp = Math.min(state.monster.hpMax, state.monster.hp + amount);
  return state.monster.hp - before;
}

function consumeHeroMark(runtime: MonsterAbilityRuntimeStateV1): number {
  const mark = runtime.effects.find((effect) => effect.target === "hero" && effect.kind === "mark");
  if (!mark) {
    return 1;
  }

  mark.charges = Math.max(0, (mark.charges ?? 1) - 1);
  if (mark.charges <= 0) {
    runtime.effects = runtime.effects.filter((effect) => effect !== mark);
    runtime.expiredEffectIds = [...(runtime.expiredEffectIds ?? []), mark.id];
  }

  return Math.max(1, mark.value);
}

function hasHeroEffect(
  runtime: MonsterAbilityRuntimeStateV1,
  kind: MonsterAbilityEffectKind
): boolean {
  return runtime.effects.some((effect) => effect.target === "hero" && effect.kind === kind);
}

function shouldDeprioritizeDefend(runtime: MonsterAbilityRuntimeStateV1): boolean {
  return Boolean(runtime.shield?.points && runtime.shield.points > 0);
}

function selectFallbackAbilities(input: {
  existingIds: readonly string[];
  effectiveLevel: number;
  monsterTags: readonly string[];
  seed: string;
  desiredCount: number;
}): string[] {
  if (input.existingIds.length >= input.desiredCount) {
    return [];
  }

  const existing = new Set(input.existingIds);
  const tags = new Set(input.monsterTags);
  const candidates = monsterAbilities
    .filter((ability) => !existing.has(ability.id))
    .filter((ability) => isSafeFallbackAbility(ability, input.effectiveLevel))
    .map((ability) => ({
      ability,
      matches: ability.tags.filter((tag) => tags.has(tag)).length
    }))
    .filter((entry) => entry.matches > 0)
    .sort((left, right) => right.matches - left.matches || stableHash(`${input.seed}:${left.ability.id}`) - stableHash(`${input.seed}:${right.ability.id}`))
    .map((entry) => entry.ability.id);

  return candidates.slice(0, input.desiredCount - input.existingIds.length);
}

function isSafeFallbackAbility(
  ability: MonsterAbilityDefinition,
  effectiveLevel: number
): boolean {
  if (validateMonsterAbilityRecipe(ability).length > 0) {
    return false;
  }

  if (effectiveLevel < 7 && (ability.powerBand === "strong" || ability.powerBand === "ultimate")) {
    return false;
  }

  if (effectiveLevel < 4 && ability.telegraphOneEnemyAction) {
    return false;
  }

  return true;
}

function numberParam(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isTruthyParameter(value: unknown): boolean {
  return value === true || (typeof value === "number" && Number.isFinite(value) && value > 0);
}

function stableHash(seed: string): number {
  let hash = 0x811c9dc5;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

function parseRuntimeCooldowns(value: unknown): Record<string, MonsterAbilityRuntimeCooldown> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([abilityId, entry]) => {
      if (!isRecord(entry) || typeof entry.id !== "string") {
        return [];
      }

      const remainingOwnActions = intOrNull(entry.remainingOwnActions);
      return remainingOwnActions === null || remainingOwnActions <= 0
        ? []
        : [[abilityId, { id: entry.id, remainingOwnActions }] as const];
    })
  );
}

function parseRuntimeEffect(value: unknown): MonsterAbilityRuntimeEffect[] {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.sourceAbilityId !== "string" ||
    !isEffectTarget(value.target) ||
    !isEffectKind(value.kind) ||
    typeof value.value !== "number"
  ) {
    return [];
  }

  const remainingOwnActivations = intOrNull(value.remainingOwnActivations);
  const remainingTargetActivations = intOrNull(value.remainingTargetActivations);
  const charges = intOrNull(value.charges);

  return [{
    id: value.id,
    sourceAbilityId: value.sourceAbilityId,
    target: value.target,
    kind: value.kind,
    value: value.value,
    ...(remainingOwnActivations !== null ? { remainingOwnActivations } : {}),
    ...(remainingTargetActivations !== null ? { remainingTargetActivations } : {}),
    ...(charges !== null ? { charges } : {})
  }];
}

function parsePendingTelegraph(value: unknown): MonsterAbilityPendingTelegraph | null {
  if (!isRecord(value) || typeof value.abilityId !== "string") {
    return null;
  }

  const announcedAtTurn = intOrNull(value.announcedAtTurn);
  return announcedAtTurn === null ? null : { abilityId: value.abilityId, announcedAtTurn };
}

function parseShield(value: unknown): MonsterAbilityRuntimeShield | null {
  if (!isRecord(value) || typeof value.sourceAbilityId !== "string") {
    return null;
  }

  const points = intOrNull(value.points);
  return points === null || points <= 0 ? null : { sourceAbilityId: value.sourceAbilityId, points };
}

function isMonsterAiProfile(value: unknown): value is MonsterAiProfile {
  return (
    value === "boss" ||
    value === "brute" ||
    value === "controller" ||
    value === "defender" ||
    value === "skirmisher" ||
    value === "trickster"
  );
}

function isRuntimeActionKind(value: unknown): value is MonsterAbilityRuntimeActionKind {
  return value === "attack" || value === "defend" || value === "ability" || value === "telegraph";
}

function isEffectTarget(value: unknown): value is MonsterAbilityEffectTarget {
  return value === "hero" || value === "monster";
}

function isEffectKind(value: unknown): value is MonsterAbilityEffectKind {
  return (
    value === "accuracy" ||
    value === "evasion" ||
    value === "outgoing-damage" ||
    value === "incoming-damage" ||
    value === "mark" ||
    value === "burn" ||
    value === "bleed" ||
    value === "ability-lock" ||
    value === "mana-cost-pressure" ||
    value === "reflect" ||
    value === "status-resistance" ||
    value === "flee" ||
    value === "crit" ||
    value === "slow" ||
    value === "confusion" ||
    value === "cooldown-pressure" ||
    value === "next-attack-bonus" ||
    value === "repeat-penalty"
  );
}

function intOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function monsterAbilityAsCombatSkill(ability: MonsterAbilityDefinition): CombatSkillProfile {
  return {
    id: ability.id,
    damageKind: getAbilityDamageKind(ability),
    stat: "strength",
    manaCost: 0,
    cooldownOwnActions: ability.cooldownOwnActions,
    baseDamage: getPowerBandDamageBonus(ability.powerBand),
    multiplier: Math.max(0.5, numberParam(ability.parameters.damageMultiplier) || 0.7),
    accuracyBonus: -numberParam(ability.parameters.accuracyPenaltyPp) / 100,
    critBonus: -numberParam(ability.parameters.critPenaltyPp) / 100,
    monsterDamageReduction: Math.floor(numberParam(ability.parameters.damageReduction) * 10)
  };
}
