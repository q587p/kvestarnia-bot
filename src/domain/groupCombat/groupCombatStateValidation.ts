import { z } from "zod";
import {
  GROUP_COMBAT_LEFT_PASSAGE_ENCOUNTER_KEY,
  GROUP_COMBAT_LEFT_PASSAGE_COMMON_ITEM_ID,
  GROUP_COMBAT_PRODUCTION_RULES_VERSION,
  GROUP_COMBAT_PROOF_ENCOUNTER_KEY,
  GROUP_COMBAT_PARTICIPANT_LIMIT,
  GROUP_COMBAT_PRODUCTION_ENEMY_LIMIT,
  GROUP_COMBAT_RECAP_LIMIT,
  GROUP_COMBAT_REPAIR_PARTICIPANT_LIMIT,
  GROUP_COMBAT_RULES_VERSION,
  GROUP_COMBAT_STATE_BYTE_LIMIT,
  GROUP_COMBAT_SUPPORTED_ITEM_IDS,
  GROUP_COMBAT_TURN_LIMIT,
  buildLeftPassageEncounterRewardBudget,
  deriveLeftPassageEnemyCount,
  type GroupCombatResult,
  type GroupCombatSettlementPlan,
  type GroupCombatSettlementReceipt,
  type GroupCombatState
} from "./groupCombat";
import { monsters } from "../../content";
import { PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT } from "../../services/presenceService";
import { deriveMonsterCombatStats } from "../combat/monsterCombatStats";
import { createMonsterAbilityRuntime } from "../combat/monsterAbilityRuntime";
import { findMonsterAbility } from "../../content/monsterAbilities";

const nonNegativeInteger = z.number().int().min(0);
const positiveInteger = z.number().int().positive();
const zeroRewardsSchema = z.object({
  xp: z.literal(0),
  gold: z.literal(0),
  items: z.tuple([])
}).strict();
const rewardsSchema = z.object({
  xp: nonNegativeInteger,
  gold: nonNegativeInteger,
  items: z.array(z.object({
    itemId: z.string().min(1),
    quantity: positiveInteger
  }).strict()).max(1)
}).strict();
const statsSchema = z.object({
  strength: nonNegativeInteger,
  dexterity: nonNegativeInteger,
  intelligence: nonNegativeInteger,
  charisma: nonNegativeInteger,
  luck: nonNegativeInteger
}).strict();
const cooldownEntrySchema = z.object({
  id: z.string().min(1),
  remainingTurns: positiveInteger
}).strict();
const cooldownsSchema = z.object({
  abilities: z.record(z.string().min(1), cooldownEntrySchema).optional(),
  skill: cooldownEntrySchema.optional()
}).strict();
const fumbleEntrySchema = z.object({
  version: z.literal(1),
  cycle: nonNegativeInteger,
  usesInCycle: nonNegativeInteger.max(92),
  triggerAt: positiveInteger.max(93)
}).strict();
const fumblesSchema = z.object({
  version: z.literal(1),
  abilities: z.record(z.string().min(1), fumbleEntrySchema)
}).strict();
const combatItemQuantitiesSchema = z.record(z.string().min(1), positiveInteger).superRefine((value, context) => {
  for (const itemId of Object.keys(value)) {
    if (!(GROUP_COMBAT_SUPPORTED_ITEM_IDS as readonly string[]).includes(itemId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: `Unsupported group-combat item ${itemId}.` });
    }
  }
});
const combatItemsSchema = z.object({
  cooldowns: z.record(z.string().min(1), z.object({
    itemId: z.literal("item.dense-bandage"),
    remainingTurns: positiveInteger.max(5)
  }).strict()).optional(),
  uses: z.record(z.string().min(1), z.object({
    itemId: z.literal("item.field-kit"),
    count: z.literal(1)
  }).strict()).optional()
}).strict().superRefine((value, context) => {
  if (value.cooldowns && Object.keys(value.cooldowns).some((itemId) => itemId !== "item.dense-bandage")) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Unsupported group-combat item cooldown." });
  }
  if (value.uses && Object.keys(value.uses).some((itemId) => itemId !== "item.field-kit")) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Unsupported group-combat item use marker." });
  }
});

const actorSchema = z.object({
  characterId: z.string().min(1),
  telegramUserId: z.string().regex(/^\d+$/),
  name: z.string().min(1).max(93),
  remortCount: nonNegativeInteger,
  rosterOrder: nonNegativeInteger,
  classId: z.string().min(1),
  raceId: z.string().min(1),
  level: positiveInteger,
  hp: nonNegativeInteger,
  hpMax: positiveInteger,
  mana: nonNegativeInteger,
  manaMax: nonNegativeInteger,
  attack: positiveInteger,
  defense: nonNegativeInteger,
  support: positiveInteger,
  stats: statsSchema,
  equipmentItemIds: z.array(z.string().min(1)).max(13),
  gearAbilityIds: z.array(z.string().min(1)).max(13),
  combatItemQuantities: combatItemQuantitiesSchema,
  combatItems: combatItemsSchema.optional(),
  threat: nonNegativeInteger,
  cooldowns: cooldownsSchema.optional(),
  playerAbilityFumbles: fumblesSchema.optional()
}).strict().refine((value) => value.hp <= value.hpMax && value.mana <= value.manaMax, {
  message: "Participant resources exceed frozen maxima."
});

const enemySchema = z.object({
  id: z.string().min(1),
  monsterId: z.string().min(1).optional(),
  name: z.string().min(1).max(93),
  order: nonNegativeInteger,
  level: positiveInteger.max(23).optional(),
  hp: nonNegativeInteger,
  hpMax: positiveInteger,
  attack: positiveInteger,
  defense: nonNegativeInteger,
  abilityIds: z.array(z.string().min(1)).max(13).optional(),
  abilityCooldowns: z.record(z.string(), z.object({
    id: z.string().min(1),
    remainingTurns: positiveInteger.max(13)
  }).strict()).optional(),
  usedOnceAbilityIds: z.array(z.string().min(1)).max(13).optional()
}).strict().refine((value) => value.hp <= value.hpMax, {
  message: "Enemy HP exceeds its maximum."
});

const contributionSchema = z.object({
  characterId: z.string().min(1),
  damage: nonNegativeInteger,
  healing: nonNegativeInteger,
  guardPrevented: nonNegativeInteger,
  control: nonNegativeInteger,
  damageTaken: nonNegativeInteger,
  committedActions: nonNegativeInteger,
  guardedTurns: nonNegativeInteger
}).strict();

const enemyContributionSchema = z.object({
  enemyId: z.string().min(1),
  damage: nonNegativeInteger,
  actions: nonNegativeInteger,
  specialActions: nonNegativeInteger
}).strict();

const statusSchema = z.object({
  id: z.string().min(1).max(587),
  kind: z.enum(["guard", "response-mitigation", "counter", "bleed"]),
  sourceCharacterId: z.string().min(1),
  targetKind: z.enum(["participant", "enemy"]),
  targetId: z.string().min(1),
  value: positiveInteger,
  remainingTurns: positiveInteger.max(13)
}).strict();

const recapSchema = z.object({
  turn: positiveInteger.max(GROUP_COMBAT_TURN_LIMIT),
  lines: z.array(z.string().min(1).max(587)).max(13),
  snapshot: z.object({
    participants: z.array(z.object({
      hp: nonNegativeInteger,
      mana: nonNegativeInteger,
      cooldowns: z.array(z.object({
        id: z.string().min(1),
        remainingTurns: positiveInteger.max(13)
      }).strict()).max(13).optional(),
      itemCooldowns: z.array(z.object({
        itemId: z.string().min(1),
        remainingTurns: positiveInteger.max(13)
      }).strict()).max(13).optional()
    }).strict()).max(GROUP_COMBAT_PARTICIPANT_LIMIT),
    enemies: z.array(z.object({
      hp: nonNegativeInteger,
      cooldowns: z.array(z.object({
        id: z.string().min(1),
        remainingTurns: positiveInteger.max(13)
      }).strict()).max(13).optional()
    }).strict()).max(GROUP_COMBAT_PRODUCTION_ENEMY_LIMIT),
    effects: z.array(z.object({
      kind: z.enum(["guard", "response-mitigation", "counter", "bleed"]),
      targetKind: z.enum(["participant", "enemy"]),
      targetId: z.string().min(1),
      remainingTurns: positiveInteger.max(13)
    }).strict()).max(93).optional()
  }).strict().optional()
}).strict();

const threatDecisionSchema = z.object({
  enemyCount: z.union([z.literal(1), z.literal(2)]),
  reason: z.enum(["base", "ordinary-win-streak"]),
  eligibleWins: nonNegativeInteger,
  secondEnemyLevelBonus: nonNegativeInteger
}).strict();

const productionSchema = z.object({
  version: z.literal(1),
  origin: z.literal("nyz-left-passage-party.v1"),
  locationId: z.literal(PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT),
  encounterId: z.string().min(1),
  encounterToken: z.string().min(1),
  encounterSeed: z.string().min(1),
  initiatingCharacterId: z.string().min(1),
  initiatingRemortCount: nonNegativeInteger,
  primaryMonsterId: z.string().min(1),
  primaryBaseMonsterLevel: positiveInteger.max(23),
  primaryEffectiveMonsterLevel: positiveInteger.max(23),
  threat: z.object({
    participants: z.array(z.object({
      characterId: z.string().min(1),
      rosterOrder: nonNegativeInteger,
      remortCount: nonNegativeInteger,
      decision: threatDecisionSchema
    }).strict()).min(1).max(3),
    sourceCharacterId: z.string().min(1),
    sourceRosterOrder: nonNegativeInteger,
    escalated: z.boolean(),
    requestedSecondEnemyLevelBonus: nonNegativeInteger,
    appliedSecondEnemyLevelBonus: nonNegativeInteger,
    boostedEnemyId: z.string().min(1).nullable(),
    levelCap: z.literal(23)
  }).strict(),
  remort: z.object({
    participants: z.array(z.object({
      characterId: z.string().min(1),
      rosterOrder: nonNegativeInteger,
      remortCount: nonNegativeInteger
    }).strict()).min(1).max(3),
    sourceCharacterId: z.string().min(1),
    sourceRosterOrder: nonNegativeInteger,
    sourceRemortCount: nonNegativeInteger,
    backupAdjustments: z.array(z.object({
      enemyId: z.string().min(1),
      remortCount: nonNegativeInteger,
      hpMaxAdded: nonNegativeInteger,
      attackAdded: nonNegativeInteger
    }).strict()).max(GROUP_COMBAT_PRODUCTION_ENEMY_LIMIT - 1)
  }).strict(),
  rewards: z.object({
    winXpTotal: nonNegativeInteger,
    winGoldTotal: nonNegativeInteger,
    lossXpTotal: nonNegativeInteger,
    commonItemId: z.string().min(1).nullable(),
    commonItemQuantity: z.union([z.literal(0), z.literal(1)])
  }).strict()
}).strict();

const stateSchema = z.object({
  rulesVersion: z.enum([GROUP_COMBAT_RULES_VERSION, GROUP_COMBAT_PRODUCTION_RULES_VERSION]),
  sessionId: z.string().min(1),
  partySessionId: z.string().min(1),
  encounterKey: z.enum([GROUP_COMBAT_PROOF_ENCOUNTER_KEY, GROUP_COMBAT_LEFT_PASSAGE_ENCOUNTER_KEY]),
  deterministicSeed: nonNegativeInteger,
  status: z.enum(["active", "won", "lost", "invalid"]),
  turn: positiveInteger.max(GROUP_COMBAT_TURN_LIMIT),
  participants: z.array(actorSchema).max(GROUP_COMBAT_REPAIR_PARTICIPANT_LIMIT),
  enemies: z.array(enemySchema).min(1).max(GROUP_COMBAT_PRODUCTION_ENEMY_LIMIT),
  contributions: z.array(contributionSchema).max(GROUP_COMBAT_REPAIR_PARTICIPANT_LIMIT),
  enemyContributions: z.array(enemyContributionSchema)
    .max(GROUP_COMBAT_PRODUCTION_ENEMY_LIMIT)
    .optional(),
  statuses: z.array(statusSchema).max(93),
  recap: z.array(recapSchema).max(GROUP_COMBAT_RECAP_LIMIT),
  production: productionSchema.optional()
}).strict().superRefine((state, context) => {
  if (
    state.rulesVersion === GROUP_COMBAT_RULES_VERSION &&
    (state.encounterKey !== GROUP_COMBAT_PROOF_ENCOUNTER_KEY || state.production !== undefined)
  ) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Rewardless proof state has production metadata." });
  }
  if (
    state.rulesVersion === GROUP_COMBAT_PRODUCTION_RULES_VERSION &&
    (state.encounterKey !== GROUP_COMBAT_LEFT_PASSAGE_ENCOUNTER_KEY || state.production === undefined)
  ) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Production state is missing left-passage metadata." });
  }
  if (state.status !== "invalid") {
    const minimumParticipants = state.rulesVersion === GROUP_COMBAT_PRODUCTION_RULES_VERSION ? 1 : 2;
    if (
      state.participants.length < minimumParticipants ||
      state.participants.length > GROUP_COMBAT_PARTICIPANT_LIMIT
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: state.rulesVersion === GROUP_COMBAT_PRODUCTION_RULES_VERSION
          ? "Production roster must contain one to three participants."
          : "Live or resolved proof roster must contain two or three participants."
      });
    }
    if (
      state.rulesVersion === GROUP_COMBAT_RULES_VERSION &&
      state.enemies.length !== state.participants.length
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Live or resolved proof enemy roster must match its participant roster."
      });
    }
  }
  requireUnique(state.participants.map((row) => row.characterId), context, "participant character ids");
  requireUnique(state.participants.map((row) => row.telegramUserId), context, "participant Telegram ids");
  requireUnique(state.participants.map((row) => row.rosterOrder), context, "participant roster order");
  requireUnique(state.enemies.map((row) => row.id), context, "enemy ids");
  requireUnique(state.enemies.map((row) => row.order), context, "enemy order");
  requireUnique(state.contributions.map((row) => row.characterId), context, "contribution character ids");
  requireUnique(state.statuses.map((row) => row.id), context, "status ids");

  const participantIds = [...state.participants.map((row) => row.characterId)].sort();
  const contributionIds = [...state.contributions.map((row) => row.characterId)].sort();
  if (participantIds.join("\0") !== contributionIds.join("\0")) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Contribution roster does not match participants." });
  }
  const enemyIds = state.enemies.map((row) => row.id);
  const enemyContributionIds = state.enemyContributions?.map((row) => row.enemyId) ?? [];
  if (
    state.enemyContributions &&
    (
      enemyIds.join("\0") !== enemyContributionIds.join("\0") ||
      state.enemyContributions.some((row) => row.specialActions > row.actions)
    )
  ) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Enemy contribution roster or action totals are invalid." });
  }
  if (
    state.rulesVersion === GROUP_COMBAT_PRODUCTION_RULES_VERSION &&
    !state.enemyContributions
  ) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Production enemy contributions are missing." });
  }
  for (const recap of state.recap) {
    if (
      state.rulesVersion === GROUP_COMBAT_PRODUCTION_RULES_VERSION &&
      !recap.snapshot
    ) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Production recap snapshot is missing." });
      continue;
    }
    if (!recap.snapshot) {
      continue;
    }
    if (
      recap.snapshot.participants.length !== state.participants.length ||
      recap.snapshot.enemies.length !== state.enemies.length
    ) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Recap snapshot roster is not canonical." });
    }
    for (const [index, participant] of recap.snapshot.participants.entries()) {
      const current = state.participants[index];
      if (
        !current ||
        participant.hp > current.hpMax ||
        participant.mana > current.manaMax
      ) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "Recap participant resources exceed frozen maxima." });
      }
    }
    for (const [index, enemy] of recap.snapshot.enemies.entries()) {
      const current = state.enemies[index];
      if (
        !current ||
        enemy.hp > current.hpMax ||
        (enemy.cooldowns ?? []).some((cooldown) => !(current.abilityIds ?? []).includes(cooldown.id))
      ) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "Recap enemy resources exceed frozen maxima." });
      }
    }
    if ((recap.snapshot.effects ?? []).some((effect) =>
      effect.targetKind === "participant"
        ? !participantIds.includes(effect.targetId)
        : !enemyIds.includes(effect.targetId)
    )) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Recap effect target is not canonical." });
    }
  }
  for (const status of state.statuses) {
    if (!participantIds.includes(status.sourceCharacterId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Status source is not a participant." });
    }
    const legalTarget = status.targetKind === "participant"
      ? participantIds.includes(status.targetId)
      : state.enemies.some((enemy) => enemy.id === status.targetId);
    if (!legalTarget || (status.kind === "bleed") !== (status.targetKind === "enemy")) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Status target or kind is invalid." });
    }
  }
  if (state.status === "won" && state.enemies.some((row) => row.hp > 0)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Won state has living enemies." });
  }
  if (state.status === "lost" && state.participants.some((row) => row.hp > 0) && state.turn < GROUP_COMBAT_TURN_LIMIT) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Lost state has living participants before the turn cap." });
  }
  if (state.production) {
    const rosterIds = state.participants.map((row) => row.characterId);
    const threatIds = state.production.threat.participants.map((row) => row.characterId);
    const remortIds = state.production.remort.participants.map((row) => row.characterId);
    if (
      rosterIds.join("\0") !== threatIds.join("\0") ||
      rosterIds.join("\0") !== remortIds.join("\0")
    ) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Frozen difficulty roster does not match participants." });
    }
    if (
      state.enemies[0]?.monsterId !== state.production.primaryMonsterId ||
      state.enemies[0]?.level !== state.production.primaryEffectiveMonsterLevel
    ) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Reserved primary enemy identity changed." });
    }
    const expectedEnemyCount =
      state.participants.length >= 1 &&
      state.participants.length <= GROUP_COMBAT_PARTICIPANT_LIMIT
        ? deriveLeftPassageEnemyCount({
            participants: state.participants,
            threatParticipants: state.production.threat.participants,
            primaryEffectiveMonsterLevel: state.production.primaryEffectiveMonsterLevel
          })
        : -1;
    if (state.enemies.length !== expectedEnemyCount) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Production enemy count does not match the frozen roster power."
      });
    }
    const threatRowsMatch = state.production.threat.participants.every((row, index) => {
      const participant = state.participants[index];
      return participant &&
        row.characterId === participant.characterId &&
        row.rosterOrder === participant.rosterOrder &&
        row.remortCount === participant.remortCount;
    });
    const remortRowsMatch = state.production.remort.participants.every((row, index) => {
      const participant = state.participants[index];
      return participant &&
        row.characterId === participant.characterId &&
        row.rosterOrder === participant.rosterOrder &&
        row.remortCount === participant.remortCount;
    });
    if (!threatRowsMatch || !remortRowsMatch) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Production difficulty rows do not match the frozen roster." });
    }
    const strongestThreat = [...state.production.threat.participants].sort((left, right) =>
      right.decision.enemyCount - left.decision.enemyCount ||
      (right.decision.enemyCount === 2 ? right.decision.secondEnemyLevelBonus : 0) -
        (left.decision.enemyCount === 2 ? left.decision.secondEnemyLevelBonus : 0) ||
      right.decision.eligibleWins - left.decision.eligibleWins ||
      left.rosterOrder - right.rosterOrder
    )[0];
    const strongestRemort = [...state.production.remort.participants].sort((left, right) =>
      right.remortCount - left.remortCount || left.rosterOrder - right.rosterOrder
    )[0];
    if (
      !strongestThreat ||
      strongestThreat.characterId !== state.production.threat.sourceCharacterId ||
      strongestThreat.rosterOrder !== state.production.threat.sourceRosterOrder
    ) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Threat source is not the strongest frozen roster source." });
    }
    if (
      !strongestRemort ||
      strongestRemort.characterId !== state.production.remort.sourceCharacterId ||
      strongestRemort.rosterOrder !== state.production.remort.sourceRosterOrder ||
      strongestRemort.remortCount !== state.production.remort.sourceRemortCount
    ) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Remort source is not the strongest frozen roster source." });
    }
    const threatEscalated = strongestThreat?.decision.enemyCount === 2;
    const requestedBonus = threatEscalated
      ? strongestThreat.decision.secondEnemyLevelBonus
      : 0;
    const firstBackup = state.enemies[1];
    const expectedBoostedEnemyId = threatEscalated ? firstBackup?.id ?? null : null;
    const appliedBonus = state.production.threat.appliedSecondEnemyLevelBonus;
    const preBonusLevel = (firstBackup?.level ?? 0) - appliedBonus;
    const expectedAppliedBonus = threatEscalated
      ? Math.min(requestedBonus, Math.max(0, 23 - preBonusLevel))
      : 0;
    if (
      state.production.threat.escalated !== threatEscalated ||
      state.production.threat.requestedSecondEnemyLevelBonus !== requestedBonus ||
      state.production.threat.boostedEnemyId !== expectedBoostedEnemyId ||
      appliedBonus !== expectedAppliedBonus ||
      (threatEscalated && preBonusLevel < 1) ||
      (firstBackup?.level ?? 0) > 23
    ) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Threat pressure bonus or level cap is not canonical." });
    }
    const backupIds = state.enemies.slice(1).map((enemy) => enemy.id);
    const adjustmentIds = state.production.remort.backupAdjustments.map((adjustment) => adjustment.enemyId);
    if (backupIds.join("\0") !== adjustmentIds.join("\0")) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Remort adjustments do not match the frozen backups." });
    }
    for (const [index, adjustment] of state.production.remort.backupAdjustments.entries()) {
      const enemy = state.enemies[index + 1];
      const authored = monsters.find((monster) => monster.id === enemy?.monsterId);
      if (!enemy || !authored || enemy.level === undefined) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "Production backup is not an authored levelled monster." });
        continue;
      }
      const selected = { ...authored, level: enemy.level };
      const baseline = deriveMonsterCombatStats(selected);
      const pressured = deriveMonsterCombatStats(selected, {
        remortCount: state.production.remort.sourceRemortCount,
        remortPressureMode: "multi"
      });
      if (
        adjustment.remortCount !== state.production.remort.sourceRemortCount ||
        adjustment.hpMaxAdded !== pressured.hpMax - baseline.hpMax ||
        adjustment.attackAdded !== pressured.attack - baseline.attack ||
        enemy.hpMax !== pressured.hpMax ||
        enemy.attack !== pressured.attack ||
        enemy.defense !== Math.max(pressured.armor, pressured.resist)
      ) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "Production backup pressure snapshot is not canonical." });
      }
    }
    const primaryAuthored = monsters.find((monster) => monster.id === state.production?.primaryMonsterId);
    const primaryEnemy = state.enemies[0];
    if (
      !primaryAuthored ||
      primaryAuthored.level !== state.production.primaryBaseMonsterLevel ||
      !primaryEnemy
    ) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Reserved primary monster baseline is not canonical." });
    } else {
      const primaryStats = deriveMonsterCombatStats({
        ...primaryAuthored,
        level: state.production.primaryEffectiveMonsterLevel
      });
      if (
        primaryEnemy.hpMax !== primaryStats.hpMax ||
        primaryEnemy.attack !== primaryStats.attack ||
        primaryEnemy.defense !== Math.max(primaryStats.armor, primaryStats.resist)
      ) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "Reserved primary combat snapshot is not canonical." });
      }
    }
    for (const enemy of state.enemies) {
      const authored = monsters.find((monster) => monster.id === enemy.monsterId);
      if (!authored || enemy.level === undefined) {
        continue;
      }
      const stats = deriveMonsterCombatStats(
        { ...authored, level: enemy.level },
        enemy.order > 0
          ? {
              remortCount: state.production.remort.sourceRemortCount,
              remortPressureMode: "multi"
            }
          : {}
      );
      const expectedAbilityIds = createMonsterAbilityRuntime({
        monster: stats,
        seed: `${state.production.encounterSeed}:${state.partySessionId}:enemy:${enemy.order}`
      })?.loadoutIds ?? [];
      if ((enemy.abilityIds ?? []).join("\0") !== expectedAbilityIds.join("\0")) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "Production enemy ability loadout is not canonical." });
      }
      if (Object.entries(enemy.abilityCooldowns ?? {}).some(([abilityId, cooldown]) =>
        cooldown.id !== abilityId ||
        !expectedAbilityIds.includes(abilityId) ||
        cooldown.remainingTurns > Math.max(1, findMonsterAbility(abilityId)?.cooldownOwnActions ?? 0)
      )) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "Production enemy ability cooldown is not canonical." });
      }
      if (new Set(enemy.usedOnceAbilityIds ?? []).size !== (enemy.usedOnceAbilityIds ?? []).length) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "Production once-only enemy ability markers are duplicated." });
      }
      if ((enemy.usedOnceAbilityIds ?? []).some((abilityId) => {
        const ability = findMonsterAbility(abilityId);
        return !expectedAbilityIds.includes(abilityId) || !ability?.oncePerFight;
      })) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "Production once-only enemy ability marker is not canonical." });
      }
    }
    const rewardBudget = buildLeftPassageEncounterRewardBudget({
      enemyLevels: state.enemies.map((enemy) => enemy.level ?? 0),
      deterministicKey: `${state.production.encounterSeed}:${state.partySessionId}:rewards`
    });
    const expectedCommonItemId = rewardBudget.commonItemQuantity === 1
      ? GROUP_COMBAT_LEFT_PASSAGE_COMMON_ITEM_ID
      : null;
    if (
      state.production.rewards.winXpTotal !== rewardBudget.winXpTotal ||
      state.production.rewards.winGoldTotal !== rewardBudget.winGoldTotal ||
      state.production.rewards.lossXpTotal !== rewardBudget.lossXpTotal ||
      state.production.rewards.commonItemQuantity !== rewardBudget.commonItemQuantity ||
      state.production.rewards.commonItemId !== expectedCommonItemId
    ) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Production reward budget or common loot is not canonical." });
    }
  }
});

const resultSchema = z.object({
  kind: z.enum(["rewardless-proof", "left-passage-party"]),
  outcome: z.enum(["won", "lost", "invalid"]),
  completedTurn: positiveInteger.max(GROUP_COMBAT_TURN_LIMIT),
  rewards: rewardsSchema
}).strict().superRefine((result, context) => {
  if (result.kind === "rewardless-proof" && !zeroRewardsSchema.safeParse(result.rewards).success) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Rewardless proof result contains rewards." });
  }
});

const settlementEffectsSchema = z.object({
  resourcesKey: z.string().min(1),
  xpKey: z.string().min(1),
  goldKey: z.string().min(1),
  itemKey: z.string().min(1).nullable(),
  activityKey: z.string().min(1).nullable()
}).strict();

const settlementParticipantSchema = z.object({
  characterId: z.string().min(1),
  remortCount: nonNegativeInteger,
  rosterOrder: nonNegativeInteger,
  resources: z.object({ hp: nonNegativeInteger, mana: nonNegativeInteger }).strict(),
  contribution: contributionSchema,
  rewards: rewardsSchema,
  effects: settlementEffectsSchema.optional()
}).strict();

const settlementPlanSchema = z.object({
  version: z.literal(1),
  policy: z.enum(["rewardless-proof", "left-passage-party"]),
  sessionId: z.string().min(1),
  outcome: z.enum(["won", "lost", "invalid"]),
  completedTurn: positiveInteger.max(GROUP_COMBAT_TURN_LIMIT),
  participants: z.array(settlementParticipantSchema).max(GROUP_COMBAT_REPAIR_PARTICIPANT_LIMIT)
}).strict().superRefine((plan, context) => {
  if (plan.outcome !== "invalid" && plan.participants.length > GROUP_COMBAT_PARTICIPANT_LIMIT) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Resolved proof plan cannot exceed three participants." });
  }
  requireUnique(plan.participants.map((row) => row.characterId), context, "settlement character ids");
  requireUnique(plan.participants.map((row) => row.rosterOrder), context, "settlement roster orders");
  if (plan.participants.some((row) => row.contribution.characterId !== row.characterId)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Settlement contribution identity mismatch." });
  }
  if (
    plan.policy === "rewardless-proof" &&
    plan.participants.some((row) => row.effects !== undefined || !zeroRewardsSchema.safeParse(row.rewards).success)
  ) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Rewardless proof settlement contains production effects." });
  }
  if (
    plan.policy === "left-passage-party" &&
    plan.participants.some((row) => row.effects === undefined)
  ) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Production settlement is missing effect identities." });
  }
});

const settlementReceiptSchema = z.object({
  version: z.literal(1),
  policy: z.enum(["rewardless-proof", "left-passage-party"]),
  sessionId: z.string().min(1),
  characterId: z.string().min(1),
  remortCount: nonNegativeInteger,
  resources: z.object({ hp: nonNegativeInteger, mana: nonNegativeInteger }).strict().optional(),
  rewards: rewardsSchema,
  effects: settlementEffectsSchema.optional(),
  manualParticipation: z.boolean().optional()
}).strict().superRefine((receipt, context) => {
  if (
    receipt.policy === "rewardless-proof" &&
    (
      receipt.resources !== undefined ||
      receipt.effects !== undefined ||
      receipt.manualParticipation !== undefined ||
      !zeroRewardsSchema.safeParse(receipt.rewards).success
    )
  ) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Rewardless proof receipt contains production effects." });
  }
  if (
    receipt.policy === "left-passage-party" &&
    (
      receipt.resources === undefined ||
      receipt.effects === undefined ||
      receipt.manualParticipation === undefined
    )
  ) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Production receipt is missing effects." });
  }
});

export class GroupCombatStateValidationError extends Error {}

export function parseGroupCombatStateStrict(value: unknown, expected?: {
  sessionId?: string;
  partySessionId?: string;
  turn?: number;
}): GroupCombatState {
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > GROUP_COMBAT_STATE_BYTE_LIMIT) {
    throw new GroupCombatStateValidationError("Group-combat state exceeds the byte budget.");
  }
  const parsed = stateSchema.safeParse(value);
  if (!parsed.success) {
    throw new GroupCombatStateValidationError(parsed.error.issues.map((issue) => issue.message).join("; "));
  }
  if (expected?.sessionId !== undefined && parsed.data.sessionId !== expected.sessionId) {
    throw new GroupCombatStateValidationError("State session identity mismatch.");
  }
  if (expected?.partySessionId !== undefined && parsed.data.partySessionId !== expected.partySessionId) {
    throw new GroupCombatStateValidationError("State party identity mismatch.");
  }
  if (expected?.turn !== undefined && parsed.data.turn !== expected.turn) {
    throw new GroupCombatStateValidationError("State turn mismatch.");
  }
  return parsed.data as unknown as GroupCombatState;
}

export function parseGroupCombatResultStrict(value: unknown): GroupCombatResult {
  return parseStrict(resultSchema, value);
}

export function parseGroupCombatSettlementPlanStrict(value: unknown): GroupCombatSettlementPlan {
  return parseStrict(settlementPlanSchema, value) as unknown as GroupCombatSettlementPlan;
}

export function parseGroupCombatSettlementReceiptStrict(value: unknown): GroupCombatSettlementReceipt {
  return parseStrict(settlementReceiptSchema, value) as unknown as GroupCombatSettlementReceipt;
}

function parseStrict<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new GroupCombatStateValidationError(parsed.error.issues.map((issue) => issue.message).join("; "));
  }
  return parsed.data;
}

function requireUnique(values: readonly (string | number)[], context: z.RefinementCtx, label: string): void {
  if (new Set(values).size !== values.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate ${label}.` });
  }
}
