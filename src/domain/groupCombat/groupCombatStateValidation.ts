import { z } from "zod";
import { isDeepStrictEqual } from "node:util";
import {
  GROUP_COMBAT_LEFT_PASSAGE_ENCOUNTER_KEY,
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
  buildGroupCombatProductionV1Evidence,
  buildLeftPassageEncounterRewardBudget,
  deriveGroupCombatLockedAbilityId,
  expandGroupCombatRecapSnapshot,
  deriveLeftPassageEnemyCount,
  isSupportedGroupCombatMonsterAbility,
  resolveGroupCombatLootVersionOneRoll,
  type GroupCombatResult,
  type GroupCombatMonsterAbilityEffect,
  type GroupCombatSettlementPlan,
  type GroupCombatSettlementReceipt,
  type GroupCombatState,
  type GroupCombatStatusKind
} from "./groupCombat";
import {
  deriveGroupCombatProductionV1MonsterStats,
  getGroupCombatProductionV1BackupEffectiveLevel,
  selectGroupCombatProductionV1BackupMonster
} from "./groupCombatProductionV1Resolver";
import { PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT } from "../../services/presenceService";
import { findMonsterBark } from "../../content/monsterBarks";
import {
  compileMonsterAbilityExecutionPlan,
  compileMonsterAbilityRecipe,
  getMonsterAbilityEffectContract,
  type MonsterAbilityRuntimeStateV1
} from "../combat/monsterAbilityRuntime";
import type { CombatState } from "../combat/combatState";
import {
  findMonsterAbility,
  type MonsterAbilityDefinition
} from "../../content/monsterAbilities";

const nonNegativeInteger = z.number().int().min(0);
const positiveInteger = z.number().int().positive();
const zeroRewardsSchema = z.object({
  xp: z.literal(0),
  gold: z.literal(0),
  items: z.tuple([])
}).strict();
const rewardItemSchema = z.object({
  itemId: z.string().min(1),
  quantity: positiveInteger
}).strict();
const rewardsSchema = z.object({
  xp: nonNegativeInteger,
  gold: nonNegativeInteger,
  items: z.array(rewardItemSchema).max(GROUP_COMBAT_PRODUCTION_ENEMY_LIMIT * 2)
}).strict().superRefine((rewards, context) => {
  requireUnique(rewards.items.map((item) => item.itemId), context, "reward item ids");
});
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
  activeCosmeticTitle: z.string().min(1).max(93).optional(),
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
  fleeAttempts: positiveInteger.max(7).optional(),
  fledAtTurn: positiveInteger.optional(),
  cooldowns: cooldownsSchema.optional(),
  playerAbilityFumbles: fumblesSchema.optional(),
  lastActionKey: z.enum(["attack", "guard", "class", "race", "gear", "item", "flee"]).optional()
}).strict().refine((value) => value.hp <= value.hpMax && value.mana <= value.manaMax, {
  message: "Participant resources exceed frozen maxima."
}).refine(
  (value) =>
    (value.fledAtTurn === undefined || value.fleeAttempts !== undefined) &&
    (value.fleeAttempts !== 7 || value.fledAtTurn !== undefined),
  { message: "Participant flee evidence is not canonical." }
);

export function parseGroupCombatActorSnapshotStrict(
  value: unknown
): GroupCombatState["participants"][number] {
  return actorSchema.parse(value) as GroupCombatState["participants"][number];
}

export function parseFrozenGroupCombatActorSnapshotStrict(
  value: unknown
): GroupCombatState["participants"][number] {
  const actor = parseGroupCombatActorSnapshotStrict(value);
  if (
    actor.threat !== 0 ||
    actor.combatItems !== undefined ||
    actor.fleeAttempts !== undefined ||
    actor.fledAtTurn !== undefined ||
    actor.cooldowns !== undefined ||
    actor.playerAbilityFumbles !== undefined
  ) {
    throw new GroupCombatStateValidationError(
      "Frozen relational participant contains runtime combat state."
    );
  }
  return actor;
}

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
  usedOnceAbilityIds: z.array(z.string().min(1)).max(13).optional(),
  abilityOwnActionCount: nonNegativeInteger.optional(),
  lastActionKind: z.enum(["attack", "ability"]).optional(),
  lastAbilityId: z.string().min(1).optional(),
  lastDirectParticipantDamage: nonNegativeInteger.optional(),
  shield: z.object({
    sourceAbilityId: z.string().min(1),
    sourceEnemyId: z.string().min(1),
    points: positiveInteger
  }).strict().optional()
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
  guardedTurns: nonNegativeInteger,
  specialActions: nonNegativeInteger.optional()
}).strict();

const enemyContributionSchema = z.object({
  enemyId: z.string().min(1),
  damage: nonNegativeInteger,
  healing: nonNegativeInteger.optional(),
  guardPrevented: nonNegativeInteger.optional(),
  control: nonNegativeInteger.optional(),
  damageTaken: nonNegativeInteger.optional(),
  actions: nonNegativeInteger,
  specialActions: nonNegativeInteger,
  guardedTurns: nonNegativeInteger.optional()
}).strict();

const combatBarkStateSchema = z.object({
  version: z.literal(1),
  rulesVersion: z.literal("monster-barks-v1"),
  audience: z.literal("party"),
  selectedEarlyBarkByMonsterId: z.record(z.string().min(1), z.string().min(1)),
  emittedBarkIds: z.array(z.string().min(1)).max(13),
  lastBarkOwnActionByMonsterId: z.record(z.string().min(1), nonNegativeInteger),
  encounterBarkCountByMonsterId: z.record(z.string().min(1), nonNegativeInteger),
  ownActionCountByMonsterId: z.record(z.string().min(1), nonNegativeInteger)
}).strict();

const statusSchema = z.object({
  id: z.string().min(1).max(587),
  kind: z.enum([
    "guard",
    "response-mitigation",
    "counter",
    "bleed",
    "monster-accuracy-penalty",
    "monster-burn",
    "monster-incoming-damage",
    "monster-damage-reduction",
    "monster-evasion",
    "monster-outgoing-damage"
  ]),
  sourceCharacterId: z.string().min(1).optional(),
  sourceEnemyId: z.string().min(1).optional(),
  sourceAbilityId: z.string().min(1).optional(),
  targetKind: z.enum(["participant", "enemy"]),
  targetId: z.string().min(1),
  value: positiveInteger,
  remainingTurns: positiveInteger.max(13),
  appliedTurn: positiveInteger.optional()
}).strict();

const monsterAbilityEffectKindSchema = z.enum([
  "accuracy",
  "evasion",
  "outgoing-damage",
  "incoming-damage",
  "mark",
  "burn",
  "bleed",
  "ability-lock",
  "mana-cost-pressure",
  "reflect",
  "status-resistance",
  "flee",
  "crit",
  "slow",
  "confusion",
  "cooldown-pressure",
  "next-attack-bonus",
  "counter",
  "repeat-penalty"
]);

const monsterAbilityEffectSchema = z.object({
  id: z.string().min(1).max(587),
  sourceEnemyId: z.string().min(1),
  sourceAbilityId: z.string().min(1),
  targetKind: z.enum(["participant", "enemy"]),
  targetId: z.string().min(1),
  kind: monsterAbilityEffectKindSchema,
  value: z.number().finite().nonnegative(),
  polarity: z.enum(["beneficial", "harmful", "neutral"]),
  removable: z.boolean(),
  trigger: z.enum([
    "on-cast",
    "on-landed-direct-hit",
    "on-shield-survived",
    "on-hero-damaged-monster",
    "on-monster-own-activation",
    "on-hero-target-activation"
  ]),
  triggerId: z.string().min(1).optional(),
  remainingSourceActivations: positiveInteger.max(13).optional(),
  remainingTargetActivations: positiveInteger.max(13).optional(),
  charges: positiveInteger.max(13).optional(),
  lockSource: z.enum(["class", "race"]).optional(),
  lockedAbilityId: z.string().min(1).optional(),
  reapplication: z.object({
    sourceEnemyId: z.string().min(1),
    sourceAbilityId: z.string().min(1),
    turn: positiveInteger
  }).strict().optional()
}).strict();

const verboseRecapSnapshotSchema = z.object({
    participants: z.array(z.object({
      hp: nonNegativeInteger,
      mana: nonNegativeInteger,
      fleeAttempts: positiveInteger.max(7).optional(),
      fledAtTurn: positiveInteger.optional(),
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
      }).strict()).max(13).optional(),
      shieldPoints: positiveInteger.optional()
    }).strict()).max(GROUP_COMBAT_PRODUCTION_ENEMY_LIMIT),
    effects: z.array(z.object({
      kind: z.enum([
        "guard",
        "response-mitigation",
        "counter",
        "bleed",
        "monster-accuracy-penalty",
        "monster-burn",
        "monster-incoming-damage",
        "monster-damage-reduction",
        "monster-evasion",
        "monster-outgoing-damage"
      ]),
      targetKind: z.enum(["participant", "enemy"]),
      targetId: z.string().min(1),
      remainingTurns: positiveInteger.max(13)
    }).strict()).max(93).optional()
  }).strict();

const compactCooldownSchema = z.array(z.tuple([
  z.string().min(1),
  positiveInteger.max(13)
])).max(13).nullable();

const compactRecapSnapshotSchema = z.object({
  p: z.array(z.tuple([
    nonNegativeInteger,
    nonNegativeInteger,
    compactCooldownSchema,
    compactCooldownSchema,
    positiveInteger.max(7).nullable(),
    positiveInteger.nullable()
  ])).max(GROUP_COMBAT_PARTICIPANT_LIMIT),
  e: z.array(z.tuple([
    nonNegativeInteger,
    compactCooldownSchema,
    positiveInteger.nullable()
  ])).max(GROUP_COMBAT_PRODUCTION_ENEMY_LIMIT),
  x: z.array(z.tuple([
    z.enum([
      "guard",
      "response-mitigation",
      "counter",
      "bleed",
      "monster-accuracy-penalty",
      "monster-burn",
      "monster-incoming-damage",
      "monster-damage-reduction",
      "monster-evasion",
      "monster-outgoing-damage"
    ]),
    z.enum(["participant", "enemy"]),
    z.string().min(1),
    positiveInteger.max(13)
  ])).max(93).optional()
}).strict();

const recapSchema = z.object({
  turn: positiveInteger,
  lines: z.array(z.string().min(1).max(587)).max(13),
  monsterBarkIds: z.array(z.string().min(1)).max(6).optional(),
  snapshot: z.union([
    verboseRecapSnapshotSchema,
    compactRecapSnapshotSchema
  ]).optional()
}).strict();

const threatDecisionSchema = z.object({
  enemyCount: z.union([z.literal(1), z.literal(2)]),
  reason: z.enum(["base", "ordinary-win-streak"]),
  eligibleWins: nonNegativeInteger,
  secondEnemyLevelBonus: nonNegativeInteger
}).strict();

const lootVersionOneSnapshotSchema = z.object({
  version: z.literal(1),
  enemies: z.array(z.object({
    enemyId: z.string().min(1),
    monsterId: z.string().min(1),
    order: nonNegativeInteger,
    participantRolls: z.array(z.object({
      characterId: z.string().min(1),
      items: z.array(rewardItemSchema)
        .max(2)
        .superRefine((entries, context) => {
          requireUnique(entries.map((entry) => entry.itemId), context, "frozen loot item ids");
        })
    }).strict()).min(1).max(GROUP_COMBAT_PARTICIPANT_LIMIT)
  }).strict()).min(1).max(GROUP_COMBAT_PRODUCTION_ENEMY_LIMIT)
}).strict();

const frozenMonsterAbilitySchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  role: z.enum([
    "artillery", "cleanser", "controller", "defender", "setup",
    "skirmisher", "striker", "sustain", "trickster"
  ]),
  targetScopes: z.array(z.enum([
    "all-allies", "all-enemies", "lowest-hp-ally", "lowest-hp-enemy",
    "self", "self-and-single-enemy", "single-enemy", "single-enemy-and-self"
  ])).min(1),
  cooldownOwnActions: nonNegativeInteger,
  powerBand: z.enum(["minor", "standard", "strong", "ultimate"]),
  parameters: z.record(z.string(), z.unknown()),
  telegraphOneEnemyAction: z.boolean(),
  oncePerFight: z.boolean(),
  tags: z.array(z.string())
}).strict();

const productionV1EvidenceSchema = z.object({
  version: z.literal(1),
  enemies: z.array(z.object({
    enemyId: z.string().min(1),
    monsterId: z.string().min(1),
    name: z.string().min(1).max(93),
    order: nonNegativeInteger,
    level: positiveInteger.max(23),
    baseRewardLevel: positiveInteger.max(23),
    hpMax: positiveInteger,
    attack: positiveInteger,
    defense: nonNegativeInteger,
    combatStats: z.object({
      dexterity: nonNegativeInteger,
      spellPower: nonNegativeInteger.optional(),
      tags: z.array(z.string()).max(13)
    }).strict(),
    abilities: z.array(frozenMonsterAbilitySchema).max(13)
  }).strict()).min(1).max(GROUP_COMBAT_PRODUCTION_ENEMY_LIMIT)
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
    lootVersion: z.literal(1),
    lootSnapshot: lootVersionOneSnapshotSchema
  }).strict(),
  canonicalV1: productionV1EvidenceSchema
}).strict();

const stateSchema = z.object({
  rulesVersion: z.enum([GROUP_COMBAT_RULES_VERSION, GROUP_COMBAT_PRODUCTION_RULES_VERSION]),
  sessionId: z.string().min(1),
  partySessionId: z.string().min(1),
  encounterKey: z.enum([GROUP_COMBAT_PROOF_ENCOUNTER_KEY, GROUP_COMBAT_LEFT_PASSAGE_ENCOUNTER_KEY]),
  deterministicSeed: nonNegativeInteger,
  status: z.enum(["active", "won", "lost", "invalid"]),
  turn: positiveInteger,
  participants: z.array(actorSchema).max(GROUP_COMBAT_REPAIR_PARTICIPANT_LIMIT),
  enemies: z.array(enemySchema).min(1).max(GROUP_COMBAT_PRODUCTION_ENEMY_LIMIT),
  contributions: z.array(contributionSchema).max(GROUP_COMBAT_REPAIR_PARTICIPANT_LIMIT),
  enemyContributions: z.array(enemyContributionSchema)
    .max(GROUP_COMBAT_PRODUCTION_ENEMY_LIMIT)
    .optional(),
  enemyBarks: z.record(z.string().min(1), combatBarkStateSchema).optional(),
  statuses: z.array(statusSchema).max(93),
  abilityEffects: z.array(monsterAbilityEffectSchema).max(93).optional(),
  expiredAbilityEffects: z.array(monsterAbilityEffectSchema).max(6).optional(),
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
    state.rulesVersion === GROUP_COMBAT_RULES_VERSION &&
    state.turn > GROUP_COMBAT_TURN_LIMIT
  ) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Rewardless proof turn exceeds its bounded limit." });
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
  requireUnique((state.abilityEffects ?? []).map((row) => row.id), context, "monster ability effect ids");

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
    (
      !state.enemyContributions ||
      state.contributions.some((row) => row.specialActions === undefined) ||
      state.enemyContributions.some((row) =>
        row.healing === undefined ||
        row.guardPrevented === undefined ||
        row.control === undefined ||
        row.damageTaken === undefined ||
        row.guardedTurns === undefined
      )
    )
  ) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Production contribution dimensions are missing." });
  }
  if (
    Object.keys(state.enemyBarks ?? {}).some((enemyId) => !enemyIds.includes(enemyId)) ||
    state.recap.some((recap) =>
      (recap.monsterBarkIds ?? []).some((barkId) => findMonsterBark(barkId) === null)
    )
  ) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Group-combat monster bark evidence is invalid." });
  }
  for (const recap of state.recap) {
    const snapshot = expandGroupCombatRecapSnapshot(
      recap.snapshot as GroupCombatState["recap"][number]["snapshot"]
    );
    if (
      state.rulesVersion === GROUP_COMBAT_PRODUCTION_RULES_VERSION &&
      !snapshot
    ) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Production recap snapshot is missing." });
      continue;
    }
    if (!snapshot) {
      continue;
    }
    if (
      snapshot.participants.length !== state.participants.length ||
      snapshot.enemies.length !== state.enemies.length
    ) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Recap snapshot roster is not canonical." });
    }
    for (const [index, participant] of snapshot.participants.entries()) {
      const current = state.participants[index];
      if (
        !current ||
        participant.hp > current.hpMax ||
        participant.mana > current.manaMax
      ) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "Recap participant resources exceed frozen maxima." });
      }
    }
    for (const [index, enemy] of snapshot.enemies.entries()) {
      const current = state.enemies[index];
      if (
        !current ||
        enemy.hp > current.hpMax ||
        (enemy.cooldowns ?? []).some((cooldown) => !(current.abilityIds ?? []).includes(cooldown.id))
      ) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "Recap enemy resources exceed frozen maxima." });
      }
    }
    if ((snapshot.effects ?? []).some((effect) =>
      effect.targetKind === "participant"
        ? !participantIds.includes(effect.targetId)
        : !enemyIds.includes(effect.targetId)
    )) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Recap effect target is not canonical." });
    }
  }
  for (const status of state.statuses) {
    const participantSourced = status.kind === "guard" ||
      status.kind === "response-mitigation" ||
      status.kind === "counter" ||
      status.kind === "bleed";
    if (
      participantSourced
        ? !status.sourceCharacterId ||
          status.sourceEnemyId !== undefined ||
          status.sourceAbilityId !== undefined ||
          !participantIds.includes(status.sourceCharacterId)
        : !status.sourceEnemyId ||
          !status.sourceAbilityId ||
          status.sourceCharacterId !== undefined ||
          !enemyIds.includes(status.sourceEnemyId) ||
          status.appliedTurn === undefined ||
          status.appliedTurn > state.turn ||
          !isCanonicalMonsterStatus(state, status)
    ) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Status source is not canonical." });
    }
    const legalTarget = status.targetKind === "participant"
      ? participantIds.includes(status.targetId)
      : state.enemies.some((enemy) => enemy.id === status.targetId);
    const enemyTargetKind = status.kind === "bleed" ||
      status.kind === "monster-damage-reduction" ||
      status.kind === "monster-evasion" ||
      status.kind === "monster-outgoing-damage";
    if (!legalTarget || enemyTargetKind !== (status.targetKind === "enemy")) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Status target or kind is invalid." });
    }
  }
  for (const effect of [
    ...(state.abilityEffects ?? []),
    ...(state.expiredAbilityEffects ?? [])
  ]) {
    if (
      !isCanonicalMonsterAbilityEffect(
        state as unknown as GroupCombatState,
        effect as GroupCombatMonsterAbilityEffect
      )
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Monster ability effect is not canonical."
      });
    }
  }
  if (state.participants.some((participant) =>
    participant.fledAtTurn !== undefined && participant.fledAtTurn > state.turn
  )) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Participant fled after the current turn." });
  }
  if (
    state.status === "active" &&
    state.participants.every((participant) =>
      participant.hp <= 0 || participant.fledAtTurn !== undefined
    )
  ) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Active state has no remaining participants." });
  }
  for (const enemy of state.enemies) {
    if (
      enemy.shield &&
      !isCanonicalEnemyShield(state, enemy)
    ) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Enemy shield source is not canonical." });
    }
  }
  if (state.status === "won" && state.enemies.some((row) => row.hp > 0)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Won state has living enemies." });
  }
  if (
    state.status === "lost" &&
    state.participants.some((row) => row.hp > 0 && row.fledAtTurn === undefined) &&
    state.turn < GROUP_COMBAT_TURN_LIMIT
  ) {
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
    const orderedEnemies = [...state.enemies].sort((left, right) => left.order - right.order);
    const frozenLootEnemies = state.production.rewards.lootSnapshot.enemies;
    const lootEnemyRowsMatch =
      frozenLootEnemies.length === orderedEnemies.length &&
      frozenLootEnemies.every((row, index) => {
        const enemy = orderedEnemies[index];
        return enemy &&
          row.enemyId === enemy.id &&
          row.monsterId === enemy.monsterId &&
          row.order === enemy.order &&
          row.participantRolls.length === rosterIds.length &&
          row.participantRolls.every((roll, participantIndex) =>
            roll.characterId === rosterIds[participantIndex]
          );
      });
    if (!lootEnemyRowsMatch) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Frozen loot-v1 evidence does not match the canonical encounter roster."
      });
    }
    for (const frozenEnemy of frozenLootEnemies) {
      const enemy = state.enemies.find(
        (candidate) => candidate.id === frozenEnemy.enemyId
      );
      if (!enemy) {
        continue;
      }
      for (const frozenRoll of frozenEnemy.participantRolls) {
        const participant = state.participants.find(
          (candidate) => candidate.characterId === frozenRoll.characterId
        );
        if (!participant) {
          continue;
        }
        let expectedItems: Array<{ itemId: string; quantity: number }>;
        try {
          expectedItems = resolveGroupCombatLootVersionOneRoll({
            state: state as unknown as GroupCombatState,
            enemy: enemy as unknown as GroupCombatState["enemies"][number],
            participant: participant as unknown as GroupCombatState["participants"][number]
          });
        } catch {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Frozen loot-v1 resolver inputs are not canonical."
          });
          continue;
        }
        if (JSON.stringify(expectedItems) !== JSON.stringify(frozenRoll.items)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
          message: "Frozen loot-v1 output is not derivable from immutable v1 inputs."
          });
        }
      }
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
    const evidence = state.production.canonicalV1;
    let expectedEvidence: unknown = null;
    try {
      expectedEvidence = buildGroupCombatProductionV1Evidence(
        state as unknown as GroupCombatState
      );
    } catch {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Production enemy state is not derivable from immutable v1 inputs."
      });
    }
    if (expectedEvidence && !isDeepStrictEqual(evidence, expectedEvidence)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Production enemy evidence does not match the immutable v1 resolver."
      });
    }
    if (
      evidence.enemies[0]?.monsterId !== state.production.primaryMonsterId ||
      evidence.enemies[0]?.baseRewardLevel !== state.production.primaryBaseMonsterLevel
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Reserved primary monster baseline is not canonical."
      });
    }
    const usedMonsterIds = [state.production.primaryMonsterId];
    const firstParticipantLevel = state.participants[0]?.level ?? 1;
    for (const [index, adjustment] of state.production.remort.backupAdjustments.entries()) {
      const enemy = evidence.enemies[index + 1];
      const backupIndex = index + 1;
      const expectedMonster = selectGroupCombatProductionV1BackupMonster({
        participantLevel: firstParticipantLevel,
        encounterSeed: state.production.encounterSeed,
        partySessionId: state.partySessionId,
        index: backupIndex,
        usedMonsterIds
      });
      const expectedBaseLevel = getGroupCombatProductionV1BackupEffectiveLevel(
        firstParticipantLevel
      );
      const expectedLevel = Math.min(
        23,
        expectedBaseLevel +
          (backupIndex === 1
            ? state.production.threat.appliedSecondEnemyLevelBonus
            : 0)
      );
      const baseline = deriveGroupCombatProductionV1MonsterStats({
        monsterId: expectedMonster.id,
        effectiveLevel: expectedLevel
      });
      const pressured = deriveGroupCombatProductionV1MonsterStats({
        monsterId: expectedMonster.id,
        effectiveLevel: expectedLevel,
        remortCount: state.production.remort.sourceRemortCount,
        remortPressureMode: "multi"
      });
      if (
        !enemy ||
        enemy.monsterId !== expectedMonster.id ||
        enemy.level !== expectedLevel ||
        adjustment.remortCount !== state.production.remort.sourceRemortCount ||
        !baseline ||
        !pressured ||
        adjustment.hpMaxAdded !== pressured.hpMax - baseline.hpMax ||
        adjustment.attackAdded !== pressured.attack - baseline.attack
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Production backup pressure snapshot is not canonical."
        });
      }
      usedMonsterIds.push(expectedMonster.id);
    }
    const expectedRewardBudget = buildLeftPassageEncounterRewardBudget({
      participantLevels: state.participants.map((participant) => participant.level),
      enemies: evidence.enemies.map((enemy) => ({
        baseLevel: enemy.baseRewardLevel,
        effectiveLevel: enemy.level
      })),
      deterministicKey:
        `${state.production.encounterSeed}:${state.partySessionId}:rewards`
    });
    if (
      state.production.rewards.winXpTotal !== expectedRewardBudget.winXpTotal ||
      state.production.rewards.winGoldTotal !== expectedRewardBudget.winGoldTotal ||
      state.production.rewards.lossXpTotal !== expectedRewardBudget.lossXpTotal
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Production reward budget is not derivable from immutable v1 inputs."
      });
    }
    for (const enemy of orderedEnemies) {
      const frozen = evidence.enemies.find((candidate) => candidate.enemyId === enemy.id);
      if (!frozen) {
        continue;
      }
      const expectedAbilityIds = frozen.abilities.map((ability) => ability.id);
      if (Object.entries(enemy.abilityCooldowns ?? {}).some(([abilityId, cooldown]) => {
        const ability = frozen.abilities.find((candidate) => candidate.id === abilityId);
        return cooldown.id !== abilityId ||
          !expectedAbilityIds.includes(abilityId) ||
          cooldown.remainingTurns > Math.max(1, ability?.cooldownOwnActions ?? 0);
      })) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "Production enemy ability cooldown is not canonical." });
      }
      if (new Set(enemy.usedOnceAbilityIds ?? []).size !== (enemy.usedOnceAbilityIds ?? []).length) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "Production once-only enemy ability markers are duplicated." });
      }
      if ((enemy.usedOnceAbilityIds ?? []).some((abilityId) =>
        !expectedAbilityIds.includes(abilityId) ||
        !frozen.abilities.find((ability) => ability.id === abilityId)?.oncePerFight
      )) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "Production once-only enemy ability marker is not canonical." });
      }
    }
    if (state.production.rewards.lootVersion !== 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Production-v1 loot resolver version is not canonical."
      });
    }
  }
});

type MonsterValidationState = {
  turn: number;
  enemies: Array<{
    id: string;
    attack: number;
    hpMax: number;
    abilityIds?: string[] | undefined;
    shield?: {
      sourceAbilityId: string;
      sourceEnemyId: string;
      points: number;
    } | undefined;
  }>;
  production?: {
    canonicalV1: {
      enemies: Array<{
        enemyId: string;
        abilities: MonsterAbilityDefinition[];
      }>;
    };
  } | undefined;
};

function isCanonicalMonsterAbilityEffect(
  state: GroupCombatState,
  effect: GroupCombatMonsterAbilityEffect
): boolean {
  const source = state.enemies.find((enemy) => enemy.id === effect.sourceEnemyId);
  const ability = source
    ? findValidationMonsterAbility(state, source.id, effect.sourceAbilityId)
    : null;
  if (
    !source ||
    !ability ||
    !(source.abilityIds ?? []).includes(ability.id) ||
    !isSupportedGroupCombatMonsterAbility(ability.id) ||
    (
      effect.targetKind === "participant"
        ? !state.participants.some((participant) => participant.characterId === effect.targetId)
        : !state.enemies.some((enemy) => enemy.id === effect.targetId)
    )
  ) {
    return false;
  }
  const target = effect.targetKind === "participant" ? "hero" : "monster";
  const contract = getMonsterAbilityEffectContract({
    sourceAbilityId: ability.id,
    sourceActor: "monster",
    target,
    kind: effect.kind,
    value: effect.value
  });
  if (
    contract.polarity !== effect.polarity ||
    contract.removable !== effect.removable
  ) {
    return false;
  }
  for (let turn = 1; turn <= 6; turn += 1) {
    for (let ownActionCount = 1; ownActionCount <= 6; ownActionCount += 1) {
      const plan = compileMonsterAbilityExecutionPlan({
        ability,
        state: { turn } as CombatState,
        runtime: {
          ownActionCount,
          lastDirectHeroDamage: source.lastDirectParticipantDamage
        } as MonsterAbilityRuntimeStateV1
      });
      const component = plan.components.find((candidate) =>
        candidate.kind === "runtime-effect" &&
        candidate.target === target &&
        candidate.effectKind === effect.kind &&
        (
          candidate.value === effect.value ||
          (
            effect.kind === "next-attack-bonus" &&
            effect.value >= 1 &&
            effect.value <= 1.75
          )
        ) &&
        candidate.trigger === effect.trigger &&
        candidate.triggerId === effect.triggerId
      );
      if (
        component &&
        isCanonicalAbilityLockEvidence(state, effect, component) &&
        isCanonicalReapplicationEvidence(state, effect) &&
        (effect.remainingSourceActivations ?? 0) <=
          (component.durationOwnActivations ?? effect.remainingSourceActivations ?? 0) &&
        (effect.remainingTargetActivations ?? 0) <=
          (component.durationTargetActivations ?? effect.remainingTargetActivations ?? 0) &&
        (effect.charges ?? 0) <= (component.charges ?? effect.charges ?? 0)
      ) {
        return true;
      }
    }
  }
  return false;
}

function isCanonicalAbilityLockEvidence(
  state: GroupCombatState,
  effect: GroupCombatMonsterAbilityEffect,
  component: ReturnType<typeof compileMonsterAbilityExecutionPlan>["components"][number]
): boolean {
  if (effect.kind !== "ability-lock") {
    return effect.lockSource === undefined && effect.lockedAbilityId === undefined;
  }
  if (component.sourceParameter === "lockAbilitySource") {
    return (
      component.lockSource !== undefined &&
      effect.lockSource === component.lockSource &&
      effect.lockedAbilityId === undefined
    );
  }
  if (component.sourceParameter !== "lockAnyOneAbility" || effect.targetKind !== "participant") {
    return false;
  }
  const actor = state.participants.find(
    (participant) => participant.characterId === effect.targetId
  );
  return (
    actor !== undefined &&
    effect.lockSource === undefined &&
    effect.lockedAbilityId === deriveGroupCombatLockedAbilityId(
      state,
      actor,
      effect.sourceEnemyId,
      effect.sourceAbilityId
    )
  );
}

function isCanonicalReapplicationEvidence(
  state: GroupCombatState,
  effect: GroupCombatMonsterAbilityEffect
): boolean {
  if (!effect.reapplication) {
    return true;
  }
  if (effect.reapplication.turn > state.turn) {
    return false;
  }
  const source = state.enemies.find(
    (enemy) => enemy.id === effect.reapplication!.sourceEnemyId
  );
  const ability = source
    ? findValidationMonsterAbility(
        state,
        source.id,
        effect.reapplication.sourceAbilityId
      )
    : null;
  if (
    !source ||
    !ability ||
    !(source.abilityIds ?? []).includes(ability.id)
  ) {
    return false;
  }
  return compileMonsterAbilityExecutionPlan({ ability }).components.some(
    (component) => component.kind === "reapply-expired"
  );
}

type MonsterValidationStatus = {
  kind: GroupCombatStatusKind;
  sourceEnemyId?: string | undefined;
  sourceAbilityId?: string | undefined;
  targetId: string;
  value: number;
  remainingTurns: number;
};

function isCanonicalMonsterStatus(
  state: MonsterValidationState,
  status: MonsterValidationStatus
): boolean {
  if (!status.sourceEnemyId || !status.sourceAbilityId) {
    return false;
  }
  const source = state.enemies.find((enemy) => enemy.id === status.sourceEnemyId);
  if (!source) {
    return false;
  }
  const ability = findValidationMonsterAbility(state, source.id, status.sourceAbilityId);
  if (
    !ability ||
    !isSupportedGroupCombatMonsterAbility(ability.id) ||
    !(source.abilityIds ?? []).includes(ability.id)
  ) {
    return false;
  }
  const parameters = ability.parameters;
  if (status.kind === "monster-accuracy-penalty") {
    const recipe = compileMonsterAbilityRecipe(ability);
    const penalty = Math.max(
      ability.id === "monster.smoke-without-approval"
        ? numberParameter(parameters.accuracyPenaltyPp)
        : 0,
      numberParameter(parameters.targetAccuracyPenaltyPp),
      numberParameter(parameters.accuracyAndEvasionPenaltyPp)
    );
    return (recipe.heroEffects.includes("accuracy") ||
      ability.id === "monster.smoke-without-approval") &&
      status.value === Math.floor(Math.min(35, penalty)) &&
      status.remainingTurns <= Math.floor(Number(parameters.durationTargetActivations ?? 1));
  }
  if (status.kind === "monster-burn") {
    const recipe = compileMonsterAbilityRecipe(ability);
    const fraction = Math.max(
      numberParameter(parameters.burnDamageMultiplier),
      numberParameter(parameters.bleedDamageMultiplier)
    );
    return (recipe.heroEffects.includes("burn") || recipe.heroEffects.includes("bleed")) &&
      status.value === Math.max(
        1,
        Math.floor(source.attack * Math.min(0.35, fraction))
      ) &&
      status.remainingTurns <= Math.max(
        1,
        Math.floor(numberParameter(parameters.durationTargetActivations)),
        Math.floor(numberParameter(parameters.burnTicks)),
        Math.floor(numberParameter(parameters.bleedTicks))
      );
  }
  if (status.kind === "monster-incoming-damage") {
    const recipe = compileMonsterAbilityRecipe(ability);
    return recipe.heroEffects.includes("mark") &&
      status.value === Math.floor(
        Math.min(1.75, numberParameter(parameters.markIncomingDamageMultiplier)) * 10_000
      ) &&
      status.remainingTurns <= Math.floor(
        Number(parameters.durationTargetActivations ?? 1)
      );
  }
  if (status.kind === "monster-outgoing-damage") {
    const recipe = compileMonsterAbilityRecipe(ability);
    const outgoing = numberParameter(parameters.outgoingDamageMultiplier);
    return recipe.monsterEffects.includes("outgoing-damage") &&
      status.value === Math.floor(Math.min(1.35, outgoing) * 10_000) &&
      status.remainingTurns <= Math.floor(Number(parameters.durationOwnActivations ?? 1));
  }
  if (status.kind === "monster-damage-reduction") {
    const reduction = Number(
      parameters.damageReduction ??
      parameters.selfDamageReduction ??
      0
    );
    return compileMonsterAbilityRecipe(ability).monsterEffects.includes("incoming-damage") &&
      reduction > 0 &&
      status.value === Math.floor(reduction * 10_000) &&
      status.remainingTurns <= Math.floor(Number(parameters.durationOwnActivations ?? 1));
  }
  if (status.kind === "monster-evasion") {
    const evasion = Number(
      parameters.evasionBonusPp ??
      parameters.selfEvasionBonusPp ??
      0
    );
    return compileMonsterAbilityRecipe(ability).monsterEffects.includes("evasion") &&
      evasion > 0 &&
      status.value === Math.floor(evasion) &&
      status.remainingTurns <= Math.floor(Number(parameters.durationOwnActivations ?? 1));
  }
  return false;
}

function isCanonicalEnemyShield(
  state: MonsterValidationState,
  target: MonsterValidationState["enemies"][number]
): boolean {
  const shield = target.shield;
  if (!shield) {
    return true;
  }
  const source = state.enemies.find((enemy) => enemy.id === shield.sourceEnemyId);
  const ability = findValidationMonsterAbility(state, source?.id ?? "", shield.sourceAbilityId);
  if (
    !source ||
    !ability ||
    !isSupportedGroupCombatMonsterAbility(ability.id) ||
    !(source.abilityIds ?? []).includes(ability.id)
  ) {
    return false;
  }
  const fraction = Math.max(
    numberParameter(ability.parameters.shieldMaxHpFraction),
    numberParameter(ability.parameters.fallbackShieldMaxHpFraction),
    numberParameter(ability.parameters.soloFallbackShieldMaxHpFraction)
  );
  const mayTargetAllies =
    ability.targetScopes.includes("all-allies") ||
    ability.targetScopes.includes("lowest-hp-ally");
  return fraction > 0 &&
    (target.id === source.id || mayTargetAllies) &&
    shield.points <= Math.max(1, Math.floor(target.hpMax * Math.min(0.4, fraction)));
}

function numberParameter(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function findValidationMonsterAbility(
  state: MonsterValidationState,
  enemyId: string,
  abilityId: string
): MonsterAbilityDefinition | null {
  return state.production?.canonicalV1.enemies
    .find((enemy) => enemy.enemyId === enemyId)
    ?.abilities.find((ability) => ability.id === abilityId) ??
    (state.production ? null : findMonsterAbility(abilityId));
}

const resultSchema = z.object({
  kind: z.enum(["rewardless-proof", "left-passage-party"]),
  outcome: z.enum(["won", "lost", "invalid"]),
  completedTurn: positiveInteger,
  rewards: rewardsSchema
}).strict().superRefine((result, context) => {
  if (result.kind === "rewardless-proof" && !zeroRewardsSchema.safeParse(result.rewards).success) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Rewardless proof result contains rewards." });
  }
  if (result.kind === "rewardless-proof" && result.completedTurn > GROUP_COMBAT_TURN_LIMIT) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Rewardless proof result exceeds its bounded turn limit." });
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
  manualParticipation: z.boolean().optional(),
  effects: settlementEffectsSchema.optional()
}).strict();

const settlementPlanSchema = z.object({
  version: z.literal(1),
  policy: z.enum(["rewardless-proof", "left-passage-party"]),
  sessionId: z.string().min(1),
  outcome: z.enum(["won", "lost", "invalid"]),
  completedTurn: positiveInteger,
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
  if (plan.policy === "rewardless-proof" && plan.completedTurn > GROUP_COMBAT_TURN_LIMIT) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Rewardless proof settlement exceeds its bounded turn limit." });
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
