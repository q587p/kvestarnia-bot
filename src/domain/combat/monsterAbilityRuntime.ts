import {
  findMonsterAbility,
  monsterAbilities,
  type MonsterAbilityDefinition,
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
  | "status-resistance";

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
    const charges = effect.charges === undefined ? undefined : Math.max(0, effect.charges - 1);

    if (remainingTargetActivations > 0 && (charges === undefined || charges > 0)) {
      effects.push({
        ...effect,
        remainingTargetActivations,
        ...(charges !== undefined ? { charges } : {})
      });
    } else {
      expired.push(effect.id);
    }
  }

  runtime.effects = effects;
  runtime.expiredEffectIds = expired;
  state.monsterRuntime = runtime;
  state.hero.hp = Math.max(0, state.hero.hp - damage);

  return { state, damage };
}

export function applyMonsterShieldToHeroDamage(input: {
  state: CombatState;
  heroDamage: number;
}): number {
  const runtime = input.state.monsterRuntime;
  const shield = runtime?.shield;
  if (!runtime || !shield || input.heroDamage <= 0) {
    return input.heroDamage;
  }

  const absorbed = Math.min(shield.points, input.heroDamage);
  const remainingShield = shield.points - absorbed;
  input.state.monster.hp = Math.min(input.state.monster.hpMax, input.state.monster.hp + absorbed);

  if (remainingShield > 0) {
    runtime.shield = { ...shield, points: remainingShield };
  } else {
    delete runtime.shield;
  }

  return input.heroDamage - absorbed;
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
        numberParam(params.targetAccuracyPenaltyPp) / 100 +
        (input.monster.contextModifiers?.accuracyDeltaPp ?? 0) / 100
    )
  );
  let damage = 0;

  if (multiplier > 0 && input.rng.nextFloat() < hitChance) {
    const variance = input.rng.nextInt(0, 2);
    const mark = consumeHeroMark(input.runtime);
    const raw =
      (input.monster.attack + variance + getPowerBandDamageBonus(input.ability.powerBand)) *
      multiplier *
      mark;
    damage = Math.max(1, Math.floor(raw) - Math.floor((input.hero.armor ?? 0) * 0.65) - input.damageReduction);

    if (input.wasTelegraphed) {
      damage = Math.max(1, Math.floor(damage * 1.18));
    }
  }

  const effectTexts: string[] = [];
  const manaDrain = Math.min(input.state.hero.mana, Math.max(0, Math.floor(numberParam(params.manaDrain))));
  if (manaDrain > 0) {
    input.state.hero.mana = Math.max(0, input.state.hero.mana - manaDrain);
    effectTexts.push(`мана просіла на ${manaDrain}`);
  }

  const healFraction = numberParam(params.selfHealMaxHpFraction);
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
    input.runtime.effects.push({
      id: `${input.ability.id}:${input.runtime.ownActionCount}:${input.runtime.effects.length}`,
      sourceAbilityId: input.ability.id,
      ...effect
    });
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

  if (params.lockAbilitySource === "class" || params.lockAnyOneAbility === true) {
    addEffect({
      target: "hero",
      kind: "ability-lock",
      value: 1,
      remainingTargetActivations: targetDuration,
      charges: 1
    });
  }

  const outgoing = numberParam(params.outgoingDamageMultiplier);
  if (outgoing > 0 && outgoing !== 1) {
    addEffect({
      target: "hero",
      kind: "outgoing-damage",
      value: Math.min(1.35, Math.max(0.65, outgoing)),
      remainingTargetActivations: targetDuration
    });
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
      runtime.expiredEffectIds = [...(runtime.expiredEffectIds ?? []), effect.id];
      return [];
    }

    return [{ ...effect, remainingOwnActivations: remaining }];
  });
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
  let multiplier = numberParam(params.damageMultiplier);
  multiplier *= numberParam(params.abilityPotencyMultiplier) || 1;

  if (numberParam(params.bonusDamageMultiplierBelowHalfHp) > 0 && input.state.monster.hp * 2 <= input.state.monster.hpMax) {
    multiplier *= numberParam(params.bonusDamageMultiplierBelowHalfHp);
  }

  if (params.bonusAgainstDebuffedTargets === true && input.runtime.effects.some((effect) => effect.target === "hero")) {
    multiplier *= 1.15;
  }

  if (multiplier <= 0 && directDamageRoles.has(input.ability.role)) {
    multiplier = getDefaultRoleMultiplier(input.ability.role, input.ability.powerBand);
  }

  return Math.min(1.85, Math.max(0, multiplier));
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
    .map((ability) => ({
      ability,
      matches: ability.tags.filter((tag) => tags.has(tag)).length
    }))
    .filter((entry) => entry.matches > 0)
    .sort((left, right) => right.matches - left.matches || stableHash(`${input.seed}:${left.ability.id}`) - stableHash(`${input.seed}:${right.ability.id}`))
    .map((entry) => entry.ability.id);

  return candidates.slice(0, input.desiredCount - input.existingIds.length);
}

function numberParam(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
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
    value === "status-resistance"
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
