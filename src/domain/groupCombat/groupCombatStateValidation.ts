import { z } from "zod";
import {
  GROUP_COMBAT_PROOF_ENCOUNTER_KEY,
  GROUP_COMBAT_RECAP_LIMIT,
  GROUP_COMBAT_RULES_VERSION,
  type GroupCombatResult,
  type GroupCombatState
} from "./groupCombat";

const nonNegativeInteger = z.number().int().min(0);
const positiveInteger = z.number().int().positive();
const integer = z.number().int();

const actorSchema = z.object({
  characterId: z.string().min(1),
  telegramUserId: z.string().regex(/^\d+$/),
  name: z.string().min(1).max(93),
  remortCount: integer,
  rosterOrder: integer,
  hp: nonNegativeInteger,
  hpMax: positiveInteger,
  mana: nonNegativeInteger,
  manaMax: nonNegativeInteger,
  attack: positiveInteger,
  defense: nonNegativeInteger,
  support: positiveInteger,
  equipmentItemIds: z.array(z.string().min(1)).max(13)
}).strict().refine((value) => value.hp <= value.hpMax && value.mana <= value.manaMax);

const enemySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(93),
  order: nonNegativeInteger,
  hp: nonNegativeInteger,
  hpMax: positiveInteger,
  attack: positiveInteger,
  defense: nonNegativeInteger
}).strict().refine((value) => value.hp <= value.hpMax);

const contributionSchema = z.object({
  characterId: z.string().min(1),
  damage: nonNegativeInteger,
  healing: nonNegativeInteger,
  guardedTurns: nonNegativeInteger
}).strict();

const recapSchema = z.object({
  turn: positiveInteger,
  lines: z.array(z.string().min(1).max(587)).max(13)
}).strict();

const stateSchema = z.object({
  rulesVersion: z.literal(GROUP_COMBAT_RULES_VERSION),
  sessionId: z.string().min(1),
  partySessionId: z.string().min(1),
  encounterKey: z.literal(GROUP_COMBAT_PROOF_ENCOUNTER_KEY),
  deterministicSeed: nonNegativeInteger,
  status: z.enum(["active", "won", "lost", "invalid"]),
  turn: positiveInteger,
  participants: z.array(actorSchema),
  enemies: z.array(enemySchema).min(2).max(3),
  contributions: z.array(contributionSchema),
  recap: z.array(recapSchema).max(GROUP_COMBAT_RECAP_LIMIT)
}).strict().superRefine((state, context) => {
  if (state.status !== "invalid" && (state.participants.length < 2 || state.participants.length > 3)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Live or resolved proof roster must contain two or three participants." });
  }
  if (state.status !== "invalid" && state.participants.some((row) => row.remortCount < 0 || row.rosterOrder < 0)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Live or resolved proof roster identity is invalid." });
  }
  requireUnique(state.participants.map((row) => row.characterId), context, "participant character ids");
  requireUnique(state.participants.map((row) => row.telegramUserId), context, "participant Telegram ids");
  requireUnique(state.participants.map((row) => row.rosterOrder), context, "participant roster order");
  requireUnique(state.enemies.map((row) => row.id), context, "enemy ids");
  requireUnique(state.enemies.map((row) => row.order), context, "enemy order");
  requireUnique(state.contributions.map((row) => row.characterId), context, "contribution character ids");

  const participantIds = [...state.participants.map((row) => row.characterId)].sort();
  const contributionIds = [...state.contributions.map((row) => row.characterId)].sort();
  if (participantIds.join("\0") !== contributionIds.join("\0")) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Contribution roster does not match participants." });
  }
  if (state.status === "won" && state.enemies.some((row) => row.hp > 0)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Won state has living enemies." });
  }
  if (state.status === "lost" && state.participants.some((row) => row.hp > 0) && state.turn < 25) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Lost state has living participants before the turn cap." });
  }
});

const resultSchema = z.object({
  kind: z.literal("rewardless-proof"),
  outcome: z.enum(["won", "lost", "invalid"]),
  completedTurn: positiveInteger,
  rewards: z.object({
    xp: z.literal(0),
    gold: z.literal(0),
    items: z.tuple([])
  }).strict()
}).strict();

export class GroupCombatStateValidationError extends Error {}

export function parseGroupCombatStateStrict(value: unknown, expected?: {
  sessionId?: string;
  partySessionId?: string;
  turn?: number;
}): GroupCombatState {
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
  return parsed.data;
}

export function parseGroupCombatResultStrict(value: unknown): GroupCombatResult {
  const parsed = resultSchema.safeParse(value);
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
