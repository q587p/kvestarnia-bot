import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  ConsumePendingPassageEncounterInput,
  ConsumePendingPassageEncounterResult,
  CreatePendingPassageEncounterInput,
  PendingPassageEncounterRecord,
  PendingPassageEncounterRepository,
  PendingPassageEncounterStatus
} from "./pendingPassageEncounterRepository";
import { mapSoloCombatSessionRecord } from "./prismaSoloCombatSessionRepository";

type PrismaPendingPassageEncounterRecord = Awaited<
  ReturnType<PrismaClient["pendingPassageEncounter"]["findFirst"]>
>;

export class PrismaPendingPassageEncounterRepository implements PendingPassageEncounterRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findReusableForTelegramUser(
    telegramUserId: bigint,
    originLocationId: string,
    now: Date
  ): Promise<PendingPassageEncounterRecord | null> {
    const record = await this.prisma.pendingPassageEncounter.findFirst({
      where: {
        status: "pending",
        originLocationId,
        expiresAt: { gt: now },
        character: { user: { telegramUserId } }
      },
      orderBy: { updatedAt: "desc" }
    });

    return mapPending(record);
  }

  async findByTokenForTelegramUser(
    telegramUserId: bigint,
    token: string
  ): Promise<PendingPassageEncounterRecord | null> {
    const record = await this.prisma.pendingPassageEncounter.findFirst({
      where: {
        token,
        character: { user: { telegramUserId } }
      }
    });

    return mapPending(record);
  }

  async createForTelegramUser(
    telegramUserId: bigint,
    input: CreatePendingPassageEncounterInput
  ): Promise<PendingPassageEncounterRecord | null> {
    const record = await this.prisma.$transaction(async (tx) => {
      const character = await tx.character.findFirst({
        where: { user: { telegramUserId } },
        select: { id: true }
      });

      if (!character) {
        return null;
      }

      await tx.pendingPassageEncounter.updateMany({
        where: {
          characterId: character.id,
          originLocationId: input.originLocationId,
          status: "pending",
          expiresAt: { lte: new Date() }
        },
        data: {
          status: "expired",
          activeKey: null,
          cancelledAt: new Date()
        }
      });

      return tx.pendingPassageEncounter.create({
        data: {
          token: input.token,
          characterId: character.id,
          originLocationId: input.originLocationId,
          passage: input.passage,
          difficulty: input.difficulty,
          monsterId: input.monsterId,
          baseMonsterLevel: input.baseMonsterLevel,
          effectiveMonsterLevel: input.effectiveMonsterLevel,
          rulesVersion: input.rulesVersion,
          seedHash: input.seedHash,
          activeKey: `${character.id}:${input.originLocationId}`,
          expiresAt: input.expiresAt
        }
      });
    }).catch(async (error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return this.prisma.pendingPassageEncounter.findFirst({
          where: {
            status: "pending",
            originLocationId: input.originLocationId,
            expiresAt: { gt: new Date() },
            character: { user: { telegramUserId } }
          },
          orderBy: { updatedAt: "desc" }
        });
      }

      throw error;
    });

    return mapPending(record);
  }

  async expireById(id: string, now: Date): Promise<PendingPassageEncounterRecord | null> {
    const record = await this.prisma.pendingPassageEncounter.update({
      where: { id },
      data: {
        status: "expired",
        activeKey: null,
        cancelledAt: now
      }
    }).catch((error: unknown) => {
      if (isPrismaNotFound(error)) {
        return null;
      }

      throw error;
    });

    return mapPending(record);
  }

  async consumeForTelegramUser(
    telegramUserId: bigint,
    token: string,
    input: ConsumePendingPassageEncounterInput
  ): Promise<ConsumePendingPassageEncounterResult> {
    const result = await this.prisma.$transaction(async (tx): Promise<ConsumePendingPassageEncounterResult> => {
      const encounter = await tx.pendingPassageEncounter.findFirst({
        where: { token, character: { user: { telegramUserId } } }
      });

      const mappedEncounter = mapPending(encounter);
      if (!encounter || !mappedEncounter) {
        return { state: "invalid" };
      }

      if (mappedEncounter.status === "consumed") {
        const session = mappedEncounter.combatSessionId
          ? await tx.soloCombatSession.findFirst({ where: { id: mappedEncounter.combatSessionId } })
          : null;
        return { state: "already-consumed", encounter: mappedEncounter, session: mapSoloCombatSessionRecord(session) };
      }

      if (mappedEncounter.status !== "pending") {
        return { state: "not-pending", encounter: mappedEncounter };
      }

      const activeLease = await tx.activeCombatLease.findUnique({
        where: { characterId: encounter.characterId }
      });

      if (activeLease) {
        const session = await tx.soloCombatSession.findFirst({ where: { id: activeLease.referenceId } });
        const mappedSession = mapSoloCombatSessionRecord(session);
        if (mappedSession) {
          return { state: "active-fight", session: mappedSession };
        }
      }

      const update = await tx.pendingPassageEncounter.updateMany({
        where: {
          id: encounter.id,
          status: "pending",
          version: encounter.version
        },
        data: {
          status: "consumed",
          activeKey: null,
          combatSessionId: input.sessionId,
          consumedAt: input.now,
          version: { increment: 1 }
        }
      });

      if (update.count !== 1) {
        const current = await tx.pendingPassageEncounter.findUnique({ where: { id: encounter.id } });
        const currentMapped = mapPending(current);
        if (currentMapped?.combatSessionId) {
          const linked = await tx.soloCombatSession.findFirst({ where: { id: currentMapped.combatSessionId } });
          return { state: "already-consumed", encounter: currentMapped, session: mapSoloCombatSessionRecord(linked) };
        }
        return currentMapped ? { state: "not-pending", encounter: currentMapped } : { state: "invalid" };
      }

      const session = await tx.soloCombatSession.create({
        data: {
          id: input.sessionId,
          characterId: encounter.characterId,
          monsterId: input.monsterId,
          stateJson: input.state as unknown as Prisma.InputJsonValue,
          status: input.state.status,
          turn: input.state.turn,
          expiresAt: input.sessionExpiresAt
        }
      });

      await tx.activeCombatLease.create({
        data: {
          characterId: encounter.characterId,
          kind: "solo-combat",
          referenceId: session.id
        }
      });

      return {
        state: "consumed",
        encounter: {
          ...mappedEncounter,
          status: "consumed",
          combatSessionId: session.id,
          consumedAt: input.now,
          version: mappedEncounter.version + 1
        },
        session: mapSoloCombatSessionRecord(session)!
      };
    }).catch(async (error: unknown): Promise<ConsumePendingPassageEncounterResult> => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const active = await this.prisma.soloCombatSession.findFirst({
          where: {
            status: "active",
            character: { user: { telegramUserId } }
          },
          orderBy: { updatedAt: "desc" }
        });
        const mappedActive = mapSoloCombatSessionRecord(active);
        if (mappedActive) {
          return { state: "active-fight", session: mappedActive };
        }
      }

      throw error;
    });

    return result;
  }
}

function mapPending(record: PrismaPendingPassageEncounterRecord): PendingPassageEncounterRecord | null {
  if (!record) {
    return null;
  }

  return {
    id: record.id,
    token: record.token,
    characterId: record.characterId,
    originLocationId: record.originLocationId,
    passage: normalizePassage(record.passage),
    difficulty: normalizeDifficulty(record.difficulty),
    monsterId: record.monsterId,
    baseMonsterLevel: record.baseMonsterLevel,
    effectiveMonsterLevel: record.effectiveMonsterLevel,
    rulesVersion: record.rulesVersion,
    seedHash: record.seedHash,
    status: normalizeStatus(record.status),
    version: record.version,
    combatSessionId: record.combatSessionId,
    expiresAt: record.expiresAt,
    consumedAt: record.consumedAt,
    cancelledAt: record.cancelledAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

function normalizePassage(value: string): PendingPassageEncounterRecord["passage"] {
  return value === "deep-left" || value === "deep-right" || value === "deep-straight" ? value : "deep-straight";
}

function normalizeDifficulty(value: string): PendingPassageEncounterRecord["difficulty"] {
  return value === "easy" || value === "hard" || value === "normal" ? value : "normal";
}

function normalizeStatus(value: string): PendingPassageEncounterStatus {
  return value === "consumed" || value === "expired" || value === "cancelled" || value === "pending"
    ? value
    : "cancelled";
}

function isPrismaNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}
