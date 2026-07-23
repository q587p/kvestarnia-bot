import { z } from "zod";
import {
  GROUP_COMBAT_PROOF_ENCOUNTER_KEY,
  GROUP_COMBAT_PARTICIPANT_LIMIT,
  GROUP_COMBAT_RECAP_LIMIT,
  GROUP_COMBAT_REPAIR_PARTICIPANT_LIMIT,
  GROUP_COMBAT_RULES_VERSION,
  GROUP_COMBAT_STATE_BYTE_LIMIT,
  GROUP_COMBAT_SUPPORTED_ITEM_IDS,
  GROUP_COMBAT_TURN_LIMIT,
  type GroupCombatResult,
  type GroupCombatSettlementPlan,
  type GroupCombatSettlementReceipt,
  type GroupCombatState
} from "./groupCombat";

const nonNegativeInteger = z.number().int().min(0);
const positiveInteger = z.number().int().positive();
const zeroRewardsSchema = z.object({
  xp: z.literal(0),
  gold: z.literal(0),
  items: z.tuple([])
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
  name: z.string().min(1).max(93),
  order: nonNegativeInteger,
  hp: nonNegativeInteger,
  hpMax: positiveInteger,
  attack: positiveInteger,
  defense: nonNegativeInteger
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
  lines: z.array(z.string().min(1).max(587)).max(13)
}).strict();

const stateSchema = z.object({
  rulesVersion: z.literal(GROUP_COMBAT_RULES_VERSION),
  sessionId: z.string().min(1),
  partySessionId: z.string().min(1),
  encounterKey: z.literal(GROUP_COMBAT_PROOF_ENCOUNTER_KEY),
  deterministicSeed: nonNegativeInteger,
  status: z.enum(["active", "won", "lost", "invalid"]),
  turn: positiveInteger.max(GROUP_COMBAT_TURN_LIMIT),
  participants: z.array(actorSchema).max(GROUP_COMBAT_REPAIR_PARTICIPANT_LIMIT),
  enemies: z.array(enemySchema).min(2).max(3),
  contributions: z.array(contributionSchema).max(GROUP_COMBAT_REPAIR_PARTICIPANT_LIMIT),
  statuses: z.array(statusSchema).max(93),
  recap: z.array(recapSchema).max(GROUP_COMBAT_RECAP_LIMIT)
}).strict().superRefine((state, context) => {
  if (
    state.status !== "invalid"
    && (state.participants.length < 2 || state.participants.length > GROUP_COMBAT_PARTICIPANT_LIMIT)
  ) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Live or resolved proof roster must contain two or three participants." });
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
});

const resultSchema = z.object({
  kind: z.literal("rewardless-proof"),
  outcome: z.enum(["won", "lost", "invalid"]),
  completedTurn: positiveInteger.max(GROUP_COMBAT_TURN_LIMIT),
  rewards: zeroRewardsSchema
}).strict();

const settlementParticipantSchema = z.object({
  characterId: z.string().min(1),
  remortCount: nonNegativeInteger,
  rosterOrder: nonNegativeInteger,
  resources: z.object({ hp: nonNegativeInteger, mana: nonNegativeInteger }).strict(),
  contribution: contributionSchema,
  rewards: zeroRewardsSchema
}).strict();

const settlementPlanSchema = z.object({
  version: z.literal(1),
  policy: z.literal("rewardless-proof"),
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
});

const settlementReceiptSchema = z.object({
  version: z.literal(1),
  policy: z.literal("rewardless-proof"),
  sessionId: z.string().min(1),
  characterId: z.string().min(1),
  remortCount: nonNegativeInteger,
  rewards: zeroRewardsSchema
}).strict();

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
  return parseStrict(settlementPlanSchema, value);
}

export function parseGroupCombatSettlementReceiptStrict(value: unknown): GroupCombatSettlementReceipt {
  return parseStrict(settlementReceiptSchema, value);
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
