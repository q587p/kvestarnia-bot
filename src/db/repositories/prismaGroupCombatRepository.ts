import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { GROUP_COMBAT_LEASE_KIND } from "../../domain/combat/combatLeaseRegistry";
import {
  buildGroupCombatTimeoutAction,
  createGroupCombatProofState,
  GROUP_COMBAT_PROOF_ENCOUNTER_KEY,
  GROUP_COMBAT_RULES_VERSION,
  resolveGroupCombatTurn,
  validateGroupCombatAction,
  type GroupCombatAction,
  type GroupCombatActorSnapshot,
  type GroupCombatContribution,
  type GroupCombatResult,
  type GroupCombatState,
  type GroupCombatStatus
} from "../../domain/groupCombat/groupCombat";
import {
  GroupCombatStateValidationError,
  parseGroupCombatResultStrict,
  parseGroupCombatStateStrict
} from "../../domain/groupCombat/groupCombatStateValidation";
import { parseBardInspirationCombatState } from "../../domain/noncombat/bardSupport";
import { parseVarenykSatedCombatState } from "../../domain/noncombat/varenykSatedSupport";
import type {
  GroupCombatActionResult,
  GroupCombatParticipantRecord,
  GroupCombatQueuedActionRecord,
  GroupCombatRepository,
  GroupCombatSessionRecord,
  GroupCombatStartResult
} from "./groupCombatRepository";
import { buildPartyBossCombatStats } from "./partyBossRepository";
import { freezeBardInspirationFromCooldown } from "./prismaBardSupport";
import { freezeVarenykSatedFromCooldown, releaseCombatLeaseWithTimedStatuses } from "./prismaVarenykSated";

type TxClient = Prisma.TransactionClient;

const partyCharacterInclude = {
  user: { select: { telegramUserId: true } },
  equipment: { orderBy: { slot: "asc" as const } },
  _count: { select: { remorts: true } }
} satisfies Prisma.CharacterInclude;

const partyInclude = {
  participants: {
    include: { character: { include: partyCharacterInclude } },
    orderBy: [{ joinedAt: "asc" as const }, { id: "asc" as const }]
  }
} satisfies Prisma.PartySessionInclude;

const sessionInclude = {
  partySession: { select: { inviteToken: true } },
  participants: {
    include: {
      character: {
        include: {
          user: { select: { telegramUserId: true } },
          _count: { select: { remorts: true } }
        }
      }
    },
    orderBy: [{ rosterOrder: "asc" as const }, { id: "asc" as const }]
  }
} satisfies Prisma.GroupCombatSessionInclude;

type SessionRow = Prisma.GroupCombatSessionGetPayload<{ include: typeof sessionInclude }>;
type PersistedActionRow = {
  actorCharacterId: string;
  turn: number;
  actionKey: string;
  targetKind: string;
  targetId: string;
  origin: string;
};

interface FrozenParticipantPayload {
  actor: GroupCombatActorSnapshot;
  sated?: unknown;
  inspiration?: unknown;
}

export class PrismaGroupCombatRepository implements GroupCombatRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async startProofForTelegramUser(input: {
    telegramUserId: bigint;
    partyInviteToken: string;
    now: Date;
    turnExpiresAt: Date;
  }): Promise<GroupCombatStartResult> {
    try {
      return await this.prisma.$transaction(async (tx): Promise<GroupCombatStartResult> => {
        const leader = await tx.character.findFirst({
          where: { user: { telegramUserId: input.telegramUserId } },
          select: { id: true }
        });
        if (!leader) {
          return { state: "no-character" };
        }

        let party = await tx.partySession.findUnique({
          where: { inviteToken: input.partyInviteToken },
          include: partyInclude
        });
        if (!party) {
          return { state: "not-found" };
        }
        const existing = await tx.groupCombatSession.findUnique({
          where: { partySessionId: party.id },
          select: { id: true, status: true }
        });
        if (existing) {
          const session = await loadSession(tx, existing.id);
          if (!session) {
            return { state: "blocked" };
          }
          return { state: existing.status === "active" ? "already-active" : "terminal", session };
        }
        if (party.leaderCharacterId !== leader.id) {
          return { state: "not-leader" };
        }
        if (party.status !== "recruiting") {
          return { state: "not-recruiting" };
        }

        const joined = party.participants.filter((participant) => participant.status === "joined");
        if (joined.length < 2 || joined.length > 3) {
          return { state: "invalid-size" };
        }
        if (new Set(joined.map((participant) => participant.characterId)).size !== joined.length) {
          return { state: "invalid-roster" };
        }
        if (joined.some((participant) => participant.remortCount !== participant.character._count.remorts)) {
          return { state: "invalid-life" };
        }
        if (joined.some((participant) => participant.character.hpCurrent <= 0)) {
          return { state: "invalid-roster" };
        }
        const blocker = await tx.activeCombatLease.findFirst({
          where: { characterId: { in: joined.map((participant) => participant.characterId) } },
          select: { id: true }
        });
        if (blocker) {
          return { state: "blocked" };
        }

        const claimed = await tx.partySession.updateMany({
          where: { id: party.id, status: "recruiting", version: party.version },
          data: { status: "active", version: { increment: 1 } }
        });
        if (claimed.count !== 1) {
          return { state: "blocked" };
        }
        const canonical = await tx.partySession.findUnique({ where: { id: party.id }, include: partyInclude });
        if (!canonical) {
          throw new Error("Claimed party disappeared before group-combat freeze.");
        }
        party = canonical;

        const sessionId = randomUUID();
        const frozen: FrozenParticipantPayload[] = [];
        for (const [rosterOrder, participant] of party.participants
          .filter((candidate) => candidate.status === "joined")
          .entries()) {
          const character = participant.character;
          const combatStats = buildPartyBossCombatStats({
            id: character.id,
            userId: character.userId,
            name: character.name,
            pronoun: character.pronoun,
            path: character.path,
            raceId: character.raceId,
            classId: character.classId,
            level: character.level,
            xp: character.xp,
            gold: character.gold,
            hpCurrent: character.hpCurrent,
            hpMax: character.hpMax,
            manaCurrent: character.manaCurrent,
            manaMax: character.manaMax,
            hpRegenAt: character.hpRegenAt,
            manaRegenAt: character.manaRegenAt,
            activeCosmeticTitleGrantId: character.activeCosmeticTitleGrantId,
            statsJson: character.statsJson,
            remortCount: participant.remortCount,
            equipment: character.equipment
          });
          const sated = await freezeVarenykSatedFromCooldown({
            tx,
            characterId: character.id,
            remortCount: participant.remortCount,
            resources: {
              hp: combatStats.hpCurrent,
              hpMax: combatStats.hpMax,
              mana: combatStats.manaCurrent,
              manaMax: combatStats.manaMax
            },
            now: input.now
          });
          const inspiration = await freezeBardInspirationFromCooldown({
            tx,
            characterId: character.id,
            remortCount: participant.remortCount,
            now: input.now
          });
          const actor: GroupCombatActorSnapshot = {
            characterId: character.id,
            telegramUserId: character.user.telegramUserId.toString(),
            name: character.name,
            remortCount: participant.remortCount,
            rosterOrder,
            hp: sated.resources.hp,
            hpMax: sated.resources.hpMax,
            mana: sated.resources.mana,
            manaMax: sated.resources.manaMax,
            attack: Math.max(2, combatStats.weaponDamage ?? 1, Math.floor(combatStats.strength / 2)),
            defense: Math.max(0, combatStats.armor ?? 0),
            support: Math.max(2, Math.floor((combatStats.intelligence + combatStats.charisma) / 3)),
            equipmentItemIds: character.equipment.map((row) => row.itemId)
          };
          frozen.push({ actor, ...(sated.sated ? { sated: sated.sated } : {}), ...(inspiration ? { inspiration } : {}) });
        }

        const state = createGroupCombatProofState({
          sessionId,
          partySessionId: party.id,
          deterministicSeed: stableSeed(`${party.id}:${sessionId}`),
          participants: frozen.map((row) => row.actor)
        });
        await tx.activeCombatLease.createMany({
          data: frozen.map((row) => ({
            characterId: row.actor.characterId,
            kind: GROUP_COMBAT_LEASE_KIND,
            referenceId: sessionId,
            createdAt: input.now,
            updatedAt: input.now
          }))
        });
        await tx.groupCombatSession.create({
          data: {
            id: sessionId,
            partySessionId: party.id,
            encounterKey: GROUP_COMBAT_PROOF_ENCOUNTER_KEY,
            rulesVersion: GROUP_COMBAT_RULES_VERSION,
            status: "active",
            turn: state.turn,
            version: 1,
            stateJson: state as unknown as Prisma.InputJsonValue,
            turnExpiresAt: input.turnExpiresAt,
            participants: {
              create: frozen.map((row) => {
                const partyParticipant = party.participants.find(
                  (participant) => participant.characterId === row.actor.characterId
                );
                const telegramUserId = BigInt(row.actor.telegramUserId);
                const hasPrivateReference = partyParticipant?.chatId === telegramUserId && partyParticipant.messageId !== null;
                return {
                  characterId: row.actor.characterId,
                  remortCount: row.actor.remortCount,
                  rosterOrder: row.actor.rosterOrder,
                  chatId: hasPrivateReference ? partyParticipant.chatId : null,
                  messageId: hasPrivateReference ? partyParticipant.messageId : null,
                  snapshotJson: row as unknown as Prisma.InputJsonValue,
                  contributionJson: state.contributions[row.actor.rosterOrder] as unknown as Prisma.InputJsonValue
                };
              })
            }
          }
        });
        const session = await loadSession(tx, sessionId);
        if (!session) {
          throw new Error("Created group-combat session disappeared.");
        }
        return { state: "started", session };
      });
    } catch (error) {
      if (!isUniqueConflict(error)) {
        throw error;
      }
      const existing = await this.findByPartyInviteToken(input.partyInviteToken);
      return existing
        ? { state: existing.status === "active" ? "already-active" : "terminal", session: existing }
        : { state: "blocked" };
    }
  }

  async submitActionForTelegramUser(input: {
    telegramUserId: bigint;
    partyInviteToken: string;
    turn: number;
    action: GroupCombatAction["action"];
    targetKind: GroupCombatAction["targetKind"];
    targetId: string;
    now: Date;
    nextTurnExpiresAt: Date;
  }): Promise<GroupCombatActionResult> {
    return this.prisma.$transaction(async (tx) => {
      const actor = await tx.character.findFirst({
        where: { user: { telegramUserId: input.telegramUserId } },
        select: { id: true }
      });
      if (!actor) {
        return { state: "no-character" } as const;
      }
      const row = await tx.groupCombatSession.findFirst({
        where: { partySession: { inviteToken: input.partyInviteToken } },
        include: sessionInclude
      });
      if (!row) {
        return { state: "not-found" } as const;
      }
      if (!row.participants.some((participant) => participant.characterId === actor.id)) {
        return { state: "not-participant" } as const;
      }
      let state: GroupCombatState;
      try {
        state = parseRowState(row);
        if (state.status === "active") {
          await validateActiveOwnership(tx, row);
        }
      } catch (error) {
        if (!(error instanceof GroupCombatStateValidationError)) {
          throw error;
        }
        return actionResultAfterRepair(await repairMalformedSession(tx, row, input.now));
      }
      if (state.status !== "active") {
        const session = await loadSession(tx, row.id);
        return session ? { state: "terminal", session } : { state: "not-found" };
      }
      const action: GroupCombatAction = {
        actorCharacterId: actor.id,
        turn: input.turn,
        action: input.action,
        targetKind: input.targetKind,
        targetId: input.targetId,
        origin: "manual"
      };
      const validation = validateGroupCombatAction(state, action);
      if (validation !== "ok") {
        return { state: validation };
      }

      let duplicate = false;
      try {
        await tx.groupCombatAction.create({
          data: {
            sessionId: row.id,
            actorCharacterId: actor.id,
            turn: input.turn,
            actionKey: input.action,
            targetKind: input.targetKind,
            targetId: input.targetId,
            origin: "manual",
            submittedAt: input.now
          }
        });
      } catch (error) {
        if (!isUniqueConflict(error)) {
          throw error;
        }
        duplicate = true;
      }
      const result = await resolveIfReady(tx, row, state, input.now, input.nextTurnExpiresAt);
      if (result) {
        return result;
      }
      const session = await loadSession(tx, row.id);
      return session ? { state: duplicate ? "duplicate" : "queued", session } : { state: "not-found" };
    });
  }

  async resolveTimedOutSession(input: {
    sessionId: string;
    now: Date;
    nextTurnExpiresAt: Date;
  }): Promise<GroupCombatActionResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const row = await tx.groupCombatSession.findUnique({ where: { id: input.sessionId }, include: sessionInclude });
        if (!row) {
          return { state: "not-found" } as const;
        }
        if (row.status !== "active" || row.turnExpiresAt > input.now) {
          try {
            const session = await loadSession(tx, row.id);
            return session ? { state: row.status === "active" ? "stale" : "terminal", session } : { state: "not-found" };
          } catch (error) {
            if (!(error instanceof GroupCombatStateValidationError)) {
              throw error;
            }
            return actionResultAfterRepair(await repairMalformedSession(tx, row, input.now));
          }
        }
        let state: GroupCombatState;
        try {
          state = parseRowState(row);
          await validateActiveOwnership(tx, row);
        } catch (error) {
          if (!(error instanceof GroupCombatStateValidationError)) {
            throw error;
          }
          return actionResultAfterRepair(await repairMalformedSession(tx, row, input.now));
        }
        const existing = await tx.groupCombatAction.findMany({
          where: { sessionId: row.id, turn: row.turn },
          orderBy: [{ submittedAt: "asc" }, { id: "asc" }]
        });
        let submitted: Set<string>;
        try {
          submitted = new Set(validatePersistedActions(state, existing).map((action) => action.actorCharacterId));
        } catch (error) {
          if (!(error instanceof GroupCombatStateValidationError)) {
            throw error;
          }
          return actionResultAfterRepair(await repairMalformedSession(tx, row, input.now));
        }
        const missing = state.participants.filter((participant) => participant.hp > 0 && !submitted.has(participant.characterId));
        if (missing.length > 0) {
          await tx.groupCombatAction.createMany({
            data: missing.map((participant) => {
              const action = buildGroupCombatTimeoutAction(state, participant.characterId);
              return {
                sessionId: row.id,
                actorCharacterId: participant.characterId,
                turn: row.turn,
                actionKey: action.action,
                targetKind: action.targetKind,
                targetId: action.targetId,
                origin: action.origin,
                submittedAt: input.now
              };
            })
          });
        }
        return (await resolveIfReady(tx, row, state, input.now, input.nextTurnExpiresAt)) ?? { state: "stale" };
      });
    } catch (error) {
      if (!isUniqueConflict(error)) {
        throw error;
      }
      const current = await loadSession(this.prisma, input.sessionId);
      return current
        ? { state: current.status === "active" ? "stale" : "terminal", session: current }
        : { state: "not-found" };
    }
  }

  async findByPartyInviteToken(partyInviteToken: string): Promise<GroupCombatSessionRecord | null> {
    const row = await this.prisma.groupCombatSession.findFirst({
      where: { partySession: { inviteToken: partyInviteToken } },
      select: { id: true }
    });
    return row ? loadSession(this.prisma, row.id) : null;
  }

  findById(sessionId: string): Promise<GroupCombatSessionRecord | null> {
    return loadSession(this.prisma, sessionId);
  }

  async findActiveByTelegramUserId(telegramUserId: bigint): Promise<GroupCombatSessionRecord | null> {
    const row = await this.prisma.groupCombatSession.findFirst({
      where: {
        status: "active",
        participants: { some: { character: { user: { telegramUserId } } } }
      },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      select: { id: true }
    });
    return row ? loadSession(this.prisma, row.id) : null;
  }

  async listDueSessionIds(now: Date, limit: number): Promise<string[]> {
    const rows = await this.prisma.groupCombatSession.findMany({
      where: { status: "active", turnExpiresAt: { lte: now } },
      orderBy: [{ turnExpiresAt: "asc" }, { id: "asc" }],
      take: Math.min(93, Math.max(1, Math.floor(limit))),
      select: { id: true }
    });
    return rows.map((row) => row.id);
  }

  async repairInvalidOrOrphaned(now: Date, limit: number): Promise<number> {
    const boundedLimit = Math.min(93, Math.max(1, Math.floor(limit)));
    let repaired = 0;
    const sessionBatches = await Promise.all([
      this.prisma.groupCombatSession.findMany({
        where: { status: "active" },
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
        take: boundedLimit,
        select: { id: true }
      }),
      this.prisma.groupCombatSession.findMany({
        where: {
          status: { not: "active" },
          OR: [
            { completedAt: null },
            { resultJson: { equals: Prisma.DbNull } }
          ]
        },
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
        take: boundedLimit,
        select: { id: true }
      }),
      this.prisma.groupCombatSession.findMany({
        where: { status: { not: "active" } },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        take: boundedLimit,
        select: { id: true }
      })
    ]);
    const sessions = [...new Map(sessionBatches.flat().map((row) => [row.id, row])).values()];
    for (const candidate of sessions) {
      const outcome = await this.prisma.$transaction(async (tx) => {
        const session = await tx.groupCombatSession.findUnique({ where: { id: candidate.id }, include: sessionInclude });
        if (!session) {
          return "unchanged" as const;
        }
        try {
          const state = parseRowState(session);
          if (state.status === "active") {
            await validateActiveOwnership(tx, session);
            const actions = await tx.groupCombatAction.findMany({
              where: { sessionId: session.id, turn: session.turn },
              orderBy: [{ submittedAt: "asc" }, { id: "asc" }]
            });
            validatePersistedActions(state, actions);
          }
          return "unchanged" as const;
        } catch (error) {
          if (!(error instanceof GroupCombatStateValidationError)) {
            throw error;
          }
          return repairMalformedSession(tx, session, now);
        }
      });
      repaired += outcome === "unchanged" ? 0 : 1;
    }

    const leases = await this.prisma.activeCombatLease.findMany({
      where: { kind: GROUP_COMBAT_LEASE_KIND },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: boundedLimit
    });
    for (const candidate of leases) {
      const didRepair = await this.prisma.$transaction(async (tx) => {
        const lease = await tx.activeCombatLease.findUnique({ where: { id: candidate.id } });
        if (!lease || lease.kind !== GROUP_COMBAT_LEASE_KIND) {
          return false;
        }
        const owner = await tx.groupCombatSession.findUnique({ where: { id: lease.referenceId }, include: sessionInclude });
        if (owner?.status === "active") {
          if (owner.participants.some((participant) => participant.characterId === lease.characterId)) {
            return false;
          }
          return (await invalidateSessionRewardlessly(tx, owner, now)) === "invalidated";
        }
        await releaseGroupCombatLease(tx, lease, now);
        return true;
      });
      repaired += didRepair ? 1 : 0;
    }
    return repaired;
  }

  async compareAndSetParticipantCard(input: {
    sessionId: string;
    telegramUserId: bigint;
    expectedReferenceVersion: number;
    chatId: bigint;
    messageId: number;
  }): Promise<boolean> {
    if (input.chatId !== input.telegramUserId) {
      return false;
    }
    const updated = await this.prisma.groupCombatParticipant.updateMany({
      where: {
        sessionId: input.sessionId,
        referenceVersion: input.expectedReferenceVersion,
        character: { user: { telegramUserId: input.telegramUserId } }
      },
      data: {
        chatId: input.chatId,
        messageId: input.messageId,
        referenceVersion: { increment: 1 }
      }
    });
    return updated.count === 1;
  }

  async releaseParticipantCard(input: {
    sessionId: string;
    telegramUserId: bigint;
    expectedReferenceVersion: number;
    chatId: bigint;
    messageId: number;
  }): Promise<boolean> {
    if (input.chatId !== input.telegramUserId) {
      return false;
    }
    const updated = await this.prisma.groupCombatParticipant.updateMany({
      where: {
        sessionId: input.sessionId,
        referenceVersion: input.expectedReferenceVersion,
        chatId: input.chatId,
        messageId: input.messageId,
        character: { user: { telegramUserId: input.telegramUserId } }
      },
      data: {
        chatId: null,
        messageId: null,
        referenceVersion: { increment: 1 }
      }
    });
    return updated.count === 1;
  }
}

async function resolveIfReady(
  tx: TxClient,
  row: SessionRow,
  state: GroupCombatState,
  now: Date,
  nextTurnExpiresAt: Date
): Promise<GroupCombatActionResult | null> {
  const livingCount = state.participants.filter((participant) => participant.hp > 0).length;
  const actionRows = await tx.groupCombatAction.findMany({
    where: { sessionId: row.id, turn: row.turn },
    orderBy: [{ submittedAt: "asc" }, { id: "asc" }]
  });
  let actions: GroupCombatQueuedActionRecord[];
  try {
    actions = validatePersistedActions(state, actionRows);
  } catch (error) {
    if (!(error instanceof GroupCombatStateValidationError)) {
      throw error;
    }
    return actionResultAfterRepair(await repairMalformedSession(tx, row, now));
  }
  if (actions.length < livingCount) {
    return null;
  }
  const livingIds = new Set(
    state.participants.filter((participant) => participant.hp > 0).map((participant) => participant.characterId)
  );
  const actionIds = new Set(actions.map((action) => action.actorCharacterId));
  if (actions.length !== livingCount || actionIds.size !== livingCount || [...livingIds].some((id) => !actionIds.has(id))) {
    return actionResultAfterRepair(await repairMalformedSession(tx, row, now));
  }
  const resolution = resolveGroupCombatTurn(state, actions);
  const terminal = resolution.result !== null;
  const updated = await tx.groupCombatSession.updateMany({
    where: { id: row.id, status: "active", turn: row.turn, version: row.version },
    data: {
      status: resolution.state.status,
      turn: resolution.state.turn,
      version: { increment: 1 },
      stateJson: resolution.state as unknown as Prisma.InputJsonValue,
      ...(resolution.result ? { resultJson: resolution.result as unknown as Prisma.InputJsonValue } : {}),
      turnExpiresAt: terminal ? now : nextTurnExpiresAt,
      completedAt: terminal ? now : null
    }
  });
  if (updated.count !== 1) {
    const current = await loadSession(tx, row.id);
    return current ? { state: current.status === "active" ? "stale" : "terminal", session: current } : { state: "not-found" };
  }
  await updateContributions(tx, row.id, resolution.state.contributions);
  if (terminal) {
    await releaseAllGroupCombatLeases(tx, row.id, now);
    await completeParty(tx, row.partySessionId);
  }
  const session = await loadSession(tx, row.id);
  return session ? { state: terminal ? "terminal" : "resolved", session } : { state: "not-found" };
}

type SessionRepairOutcome = "unchanged" | "invalidated" | "terminal-repaired";

async function repairMalformedSession(tx: TxClient, row: SessionRow, now: Date): Promise<SessionRepairOutcome> {
  try {
    const state = parseRowStateCore(row);
    if (state.status !== "active") {
      const result = buildRewardlessResult(state.status, state.turn);
      const updated = await tx.groupCombatSession.updateMany({
        where: { id: row.id, status: row.status, version: row.version },
        data: {
          resultJson: result as unknown as Prisma.InputJsonValue,
          completedAt: row.completedAt ?? now,
          version: { increment: 1 }
        }
      });
      if (updated.count !== 1) {
        return "unchanged";
      }
      await releaseAllGroupCombatLeases(tx, row.id, now);
      await completeParty(tx, row.partySessionId);
      return "terminal-repaired";
    }
  } catch (error) {
    if (!(error instanceof GroupCombatStateValidationError)) {
      throw error;
    }
  }
  return invalidateSessionRewardlessly(tx, row, now);
}

async function invalidateSessionRewardlessly(
  tx: TxClient,
  row: SessionRow,
  now: Date
): Promise<SessionRepairOutcome> {
  const state = buildInvalidFallbackState(row);
  const result = buildRewardlessResult("invalid", state.turn);
  const updated = await tx.groupCombatSession.updateMany({
    where: { id: row.id, status: row.status, version: row.version },
    data: {
      rulesVersion: GROUP_COMBAT_RULES_VERSION,
      encounterKey: GROUP_COMBAT_PROOF_ENCOUNTER_KEY,
      status: "invalid",
      turn: state.turn,
      version: { increment: 1 },
      stateJson: state as unknown as Prisma.InputJsonValue,
      resultJson: result as unknown as Prisma.InputJsonValue,
      turnExpiresAt: now,
      completedAt: now
    }
  });
  if (updated.count !== 1) {
    return "unchanged";
  }
  await releaseAllGroupCombatLeases(tx, row.id, now);
  await completeParty(tx, row.partySessionId);
  return "invalidated";
}

function buildInvalidFallbackState(row: SessionRow): GroupCombatState {
  const participants = row.participants.map((participant): GroupCombatActorSnapshot => ({
    characterId: participant.characterId,
    telegramUserId: participant.character.user.telegramUserId.toString(),
    name: participant.character.name.slice(0, 93) || "Невідомий пригодник",
    remortCount: participant.remortCount,
    rosterOrder: participant.rosterOrder,
    hp: Math.min(Math.max(0, participant.character.hpCurrent), Math.max(1, participant.character.hpMax)),
    hpMax: Math.max(1, participant.character.hpMax),
    mana: Math.min(Math.max(0, participant.character.manaCurrent), Math.max(0, participant.character.manaMax)),
    manaMax: Math.max(0, participant.character.manaMax),
    attack: 1,
    defense: 0,
    support: 1,
    equipmentItemIds: []
  }));
  return {
    rulesVersion: GROUP_COMBAT_RULES_VERSION,
    sessionId: row.id,
    partySessionId: row.partySessionId,
    encounterKey: GROUP_COMBAT_PROOF_ENCOUNTER_KEY,
    deterministicSeed: 0,
    status: "invalid",
    turn: Math.max(1, row.turn),
    participants,
    enemies: [
      { id: "invalid-enemy-1", name: "Загублений запис", order: 0, hp: 0, hpMax: 1, attack: 1, defense: 0 },
      { id: "invalid-enemy-2", name: "Зайвий запис", order: 1, hp: 0, hpMax: 1, attack: 1, defense: 0 }
    ],
    contributions: participants.map((participant) => ({
      characterId: participant.characterId,
      damage: 0,
      healing: 0,
      guardedTurns: 0
    })),
    recap: []
  };
}

function buildRewardlessResult(
  outcome: Exclude<GroupCombatStatus, "active">,
  completedTurn: number
): GroupCombatResult {
  return {
    kind: "rewardless-proof",
    outcome,
    completedTurn,
    rewards: { xp: 0, gold: 0, items: [] }
  };
}

function actionResultAfterRepair(outcome: SessionRepairOutcome): GroupCombatActionResult {
  return { state: outcome === "invalidated" ? "invalidated" : "stale" };
}

async function validateActiveOwnership(tx: TxClient, row: SessionRow): Promise<void> {
  if (row.status !== "active") {
    throw new GroupCombatStateValidationError("Group-combat ownership exists for a non-active session.");
  }
  if (row.participants.some((participant) => participant.character._count.remorts !== participant.remortCount)) {
    throw new GroupCombatStateValidationError("Current character life does not match the group-combat roster.");
  }
  const participantIds = row.participants.map((participant) => participant.characterId);
  const participantIdSet = new Set(participantIds);
  const leases = await tx.activeCombatLease.findMany({
    where: {
      OR: [
        { characterId: { in: participantIds } },
        { kind: GROUP_COMBAT_LEASE_KIND, referenceId: row.id }
      ]
    }
  });
  for (const participantId of participantIds) {
    const lease = leases.find((candidate) => candidate.characterId === participantId);
    if (!lease || lease.kind !== GROUP_COMBAT_LEASE_KIND || lease.referenceId !== row.id) {
      throw new GroupCombatStateValidationError("Participant group-combat lease is missing or mismatched.");
    }
  }
  if (leases.some((lease) => (
    lease.kind === GROUP_COMBAT_LEASE_KIND &&
    lease.referenceId === row.id &&
    !participantIdSet.has(lease.characterId)
  ))) {
    throw new GroupCombatStateValidationError("Group-combat lease belongs to a non-participant.");
  }
}

function validatePersistedActions(
  state: GroupCombatState,
  rows: readonly PersistedActionRow[]
): GroupCombatQueuedActionRecord[] {
  return rows.map((row) => {
    const action = mapAction(row);
    if (validateGroupCombatAction(state, action) !== "ok") {
      throw new GroupCombatStateValidationError("Persisted group-combat action is not canonical for the current roster and turn.");
    }
    return action;
  });
}

async function releaseAllGroupCombatLeases(tx: TxClient, sessionId: string, now: Date): Promise<void> {
  const leases = await tx.activeCombatLease.findMany({
    where: { kind: GROUP_COMBAT_LEASE_KIND, referenceId: sessionId }
  });
  for (const lease of leases) {
    await releaseGroupCombatLease(tx, lease, now);
  }
}

async function releaseGroupCombatLease(
  tx: TxClient,
  lease: Prisma.ActiveCombatLeaseGetPayload<Record<string, never>>,
  now: Date
): Promise<void> {
  const participant = await tx.groupCombatParticipant.findFirst({
    where: { sessionId: lease.referenceId, characterId: lease.characterId },
    select: { snapshotJson: true }
  });
  const payload = readFrozenPayload(participant?.snapshotJson);
  const sated = parseVarenykSatedCombatState(payload?.sated);
  const inspiration = parseBardInspirationCombatState(payload?.inspiration);
  await releaseCombatLeaseWithTimedStatuses({
    tx,
    lease,
    releasedAt: now,
    ...(sated ? { sated } : {}),
    ...(inspiration ? { inspiration } : {})
  });
}

async function completeParty(tx: TxClient, partySessionId: string): Promise<void> {
  await tx.partySession.updateMany({
    where: { id: partySessionId, status: "active" },
    data: { status: "completed", activeLeaderKey: null, version: { increment: 1 } }
  });
  await tx.partyParticipant.updateMany({
    where: { sessionId: partySessionId, status: "joined" },
    data: { activeMembershipKey: null }
  });
}

async function updateContributions(tx: TxClient, sessionId: string, contributions: GroupCombatContribution[]): Promise<void> {
  for (const contribution of contributions) {
    await tx.groupCombatParticipant.updateMany({
      where: { sessionId, characterId: contribution.characterId },
      data: { contributionJson: contribution as unknown as Prisma.InputJsonValue }
    });
  }
}

async function loadSession(
  client: TxClient | PrismaClient,
  sessionId: string
): Promise<GroupCombatSessionRecord | null> {
  const row = await client.groupCombatSession.findUnique({ where: { id: sessionId }, include: sessionInclude });
  if (!row) {
    return null;
  }
  const state = parseRowState(row);
  const actions = state.status === "active"
    ? await client.groupCombatAction.findMany({
        where: { sessionId: row.id, turn: row.turn },
        orderBy: [{ submittedAt: "asc" }, { id: "asc" }]
      })
    : [];
  return mapSession(row, state, validatePersistedActions(state, actions));
}

function mapSession(
  row: SessionRow,
  state: GroupCombatState,
  actions: GroupCombatQueuedActionRecord[]
): GroupCombatSessionRecord {
  return {
    id: row.id,
    partySessionId: row.partySessionId,
    partyInviteToken: row.partySession.inviteToken,
    status: state.status,
    turn: row.turn,
    version: row.version,
    state,
    result: row.resultJson === null ? null : parseGroupCombatResultStrict(row.resultJson),
    turnExpiresAt: row.turnExpiresAt,
    completedAt: row.completedAt,
    participants: row.participants.map((participant): GroupCombatParticipantRecord => ({
      characterId: participant.characterId,
      telegramUserId: participant.character.user.telegramUserId,
      name: participant.character.name,
      remortCount: participant.remortCount,
      rosterOrder: participant.rosterOrder,
      chatId: participant.chatId,
      messageId: participant.messageId,
      referenceVersion: participant.referenceVersion
    })),
    queuedActions: actions
  };
}

function parseRowState(row: SessionRow): GroupCombatState {
  const state = parseRowStateCore(row);
  const terminal = state.status !== "active";
  if (!terminal) {
    if (row.resultJson !== null || row.completedAt !== null) {
      throw new GroupCombatStateValidationError("Active group combat has terminal result metadata.");
    }
    return state;
  }
  if (row.resultJson === null || row.completedAt === null) {
    throw new GroupCombatStateValidationError("Terminal group combat is missing result metadata.");
  }
  const result = parseGroupCombatResultStrict(row.resultJson);
  if (result.outcome !== state.status || result.completedTurn !== state.turn) {
    throw new GroupCombatStateValidationError("Terminal group-combat result does not match state.");
  }
  return state;
}

function parseRowStateCore(row: SessionRow): GroupCombatState {
  if (row.rulesVersion !== GROUP_COMBAT_RULES_VERSION || row.encounterKey !== GROUP_COMBAT_PROOF_ENCOUNTER_KEY) {
    throw new GroupCombatStateValidationError("Unknown group-combat rules or encounter version.");
  }
  const state = parseGroupCombatStateStrict(row.stateJson, {
    sessionId: row.id,
    partySessionId: row.partySessionId,
    turn: row.turn
  });
  if (!isGroupCombatStatus(row.status) || state.status !== row.status) {
    throw new GroupCombatStateValidationError("Stored group-combat status does not match state.");
  }
  validateRelationalRoster(row, state);
  return state;
}

function validateRelationalRoster(row: SessionRow, state: GroupCombatState): void {
  if (row.participants.length !== state.participants.length) {
    throw new GroupCombatStateValidationError("Relational participant cardinality does not match state.");
  }
  const stateByCharacterId = new Map(state.participants.map((participant) => [participant.characterId, participant]));
  for (const participant of row.participants) {
    const actor = stateByCharacterId.get(participant.characterId);
    if (
      !actor ||
      actor.telegramUserId !== participant.character.user.telegramUserId.toString() ||
      actor.remortCount !== participant.remortCount ||
      actor.rosterOrder !== participant.rosterOrder
    ) {
      throw new GroupCombatStateValidationError("Relational participant identity does not match state.");
    }
  }
}

function isGroupCombatStatus(value: string): value is GroupCombatStatus {
  return value === "active" || value === "won" || value === "lost" || value === "invalid";
}

function mapAction(row: PersistedActionRow): GroupCombatQueuedActionRecord {
  if (
    (row.actionKey !== "attack" && row.actionKey !== "guard" && row.actionKey !== "aid") ||
    (row.targetKind !== "self" && row.targetKind !== "ally" && row.targetKind !== "enemy") ||
    (row.origin !== "manual" && row.origin !== "timeout")
  ) {
    throw new GroupCombatStateValidationError("Malformed persisted group-combat action.");
  }
  return {
    actorCharacterId: row.actorCharacterId,
    turn: row.turn,
    action: row.actionKey,
    targetKind: row.targetKind,
    targetId: row.targetId,
    origin: row.origin
  };
}

function readFrozenPayload(value: unknown): FrozenParticipantPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const actor = (value as Record<string, unknown>).actor;
  if (!actor || typeof actor !== "object" || Array.isArray(actor)) {
    return null;
  }
  return value as unknown as FrozenParticipantPayload;
}

function stableSeed(value: string): number {
  let hash = 0;
  for (const code of value) {
    hash = (Math.imul(hash, 31) + code.charCodeAt(0)) >>> 0;
  }
  return hash;
}

function isUniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
