import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { GROUP_COMBAT_LEASE_KIND } from "../../domain/combat/combatLeaseRegistry";
import {
  buildGroupCombatTimeoutAction,
  createGroupCombatProofState,
  GROUP_COMBAT_PROOF_ENCOUNTER_KEY,
  GROUP_COMBAT_RULES_VERSION,
  invalidateGroupCombatState,
  resolveGroupCombatTurn,
  validateGroupCombatAction,
  type GroupCombatAction,
  type GroupCombatActorSnapshot,
  type GroupCombatContribution,
  type GroupCombatResult,
  type GroupCombatState
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
    include: { character: { include: { user: { select: { telegramUserId: true } } } } },
    orderBy: [{ rosterOrder: "asc" as const }, { id: "asc" as const }]
  }
} satisfies Prisma.GroupCombatSessionInclude;

type SessionRow = Prisma.GroupCombatSessionGetPayload<{ include: typeof sessionInclude }>;

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
              create: frozen.map((row) => ({
                characterId: row.actor.characterId,
                remortCount: row.actor.remortCount,
                rosterOrder: row.actor.rosterOrder,
                chatId: party.participants.find((participant) => participant.characterId === row.actor.characterId)?.chatId ?? null,
                snapshotJson: row as unknown as Prisma.InputJsonValue,
                contributionJson: state.contributions[row.actor.rosterOrder] as unknown as Prisma.InputJsonValue
              }))
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
      } catch (error) {
        if (!(error instanceof GroupCombatStateValidationError)) {
          throw error;
        }
        await invalidateMalformedSession(tx, row, input.now);
        return { state: "invalidated" } as const;
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
        const session = await loadSession(tx, row.id);
        return session ? { state: row.status === "active" ? "stale" : "terminal", session } : { state: "not-found" };
      }
      let state: GroupCombatState;
      try {
        state = parseRowState(row);
      } catch (error) {
        if (!(error instanceof GroupCombatStateValidationError)) {
          throw error;
        }
        await invalidateMalformedSession(tx, row, input.now);
        return { state: "invalidated" };
      }
      const existing = await tx.groupCombatAction.findMany({
        where: { sessionId: row.id, turn: row.turn },
        select: { actorCharacterId: true }
      });
      const submitted = new Set(existing.map((action) => action.actorCharacterId));
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
    const sessions = await this.prisma.groupCombatSession.findMany({
      where: { status: "active" },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: boundedLimit,
      include: sessionInclude
    });
    for (const session of sessions) {
      try {
        parseRowState(session);
      } catch (error) {
        if (!(error instanceof GroupCombatStateValidationError)) {
          throw error;
        }
        repaired += await this.prisma.$transaction((tx) => invalidateMalformedSession(tx, session, now)) ? 1 : 0;
      }
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
        const owner = await tx.groupCombatSession.findUnique({ where: { id: lease.referenceId }, select: { status: true } });
        if (owner?.status === "active") {
          return false;
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
  if (actionRows.length < livingCount) {
    return null;
  }
  let actions: GroupCombatQueuedActionRecord[];
  try {
    actions = actionRows.map(mapAction);
  } catch (error) {
    if (!(error instanceof GroupCombatStateValidationError)) {
      throw error;
    }
    await invalidateMalformedSession(tx, row, now);
    return { state: "invalidated" };
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

async function invalidateMalformedSession(tx: TxClient, row: SessionRow, now: Date): Promise<boolean> {
  const fallbackActors = row.participants.map((participant, index) => {
    return {
      characterId: participant.characterId,
      telegramUserId: participant.character.user.telegramUserId.toString(),
      name: participant.character.name,
      remortCount: participant.remortCount,
      rosterOrder: index,
      hp: Math.min(Math.max(1, participant.character.hpCurrent), Math.max(1, participant.character.hpMax)),
      hpMax: Math.max(1, participant.character.hpMax),
      mana: Math.min(Math.max(0, participant.character.manaCurrent), Math.max(0, participant.character.manaMax)),
      manaMax: Math.max(0, participant.character.manaMax),
      attack: 1,
      defense: 0,
      support: 1,
      equipmentItemIds: []
    };
  });
  if (fallbackActors.length < 2 || fallbackActors.length > 3) {
    return false;
  }
  const fallback = invalidateGroupCombatState(createGroupCombatProofState({
    sessionId: row.id,
    partySessionId: row.partySessionId,
    deterministicSeed: 0,
    participants: fallbackActors
  }));
  fallback.state.turn = Math.max(1, row.turn);
  const result: GroupCombatResult = { ...fallback.result!, completedTurn: fallback.state.turn };
  const updated = await tx.groupCombatSession.updateMany({
    where: { id: row.id, status: "active", version: row.version },
    data: {
      status: "invalid",
      turn: fallback.state.turn,
      version: { increment: 1 },
      stateJson: fallback.state as unknown as Prisma.InputJsonValue,
      resultJson: result as unknown as Prisma.InputJsonValue,
      turnExpiresAt: now,
      completedAt: now
    }
  });
  if (updated.count !== 1) {
    return false;
  }
  await releaseAllGroupCombatLeases(tx, row.id, now);
  await completeParty(tx, row.partySessionId);
  return true;
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
  return mapSession(row, state, actions.map(mapAction));
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
  if (row.rulesVersion !== GROUP_COMBAT_RULES_VERSION || row.encounterKey !== GROUP_COMBAT_PROOF_ENCOUNTER_KEY) {
    throw new GroupCombatStateValidationError("Unknown group-combat rules or encounter version.");
  }
  return parseGroupCombatStateStrict(row.stateJson, {
    sessionId: row.id,
    partySessionId: row.partySessionId,
    turn: row.turn
  });
}

function mapAction(row: {
  actorCharacterId: string;
  turn: number;
  actionKey: string;
  targetKind: string;
  targetId: string;
  origin: string;
}): GroupCombatQueuedActionRecord {
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
