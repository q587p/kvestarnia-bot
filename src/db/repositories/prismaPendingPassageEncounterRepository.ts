import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  ConsumedPendingPassageEncounterRecord,
  ConsumePendingPassageEncounterInput,
  ConsumePendingPassageEncounterResult,
  CreatePendingPassageEncounterInput,
  ExpirePendingPassageEncounterResult,
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

  async findLatestConsumedForTelegramUser(
    telegramUserId: bigint,
    originLocationId: string,
    now: Date
  ): Promise<ConsumedPendingPassageEncounterRecord | null> {
    const encounter = await this.prisma.pendingPassageEncounter.findFirst({
      where: {
        status: "consumed",
        originLocationId,
        expiresAt: { gt: now },
        character: { user: { telegramUserId } }
      },
      orderBy: { updatedAt: "desc" }
    });
    const mappedEncounter = mapPending(encounter);

    if (!mappedEncounter) {
      return null;
    }

    const session = mappedEncounter.combatSessionId
      ? await this.prisma.soloCombatSession.findFirst({ where: { id: mappedEncounter.combatSessionId } })
      : null;

    return {
      encounter: mappedEncounter,
      session: mapSoloCombatSessionRecord(session)
    };
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
          expiresAt: { lte: input.now }
        },
        data: {
          status: "expired",
          activeKey: null,
          cancelledAt: input.now,
          version: { increment: 1 }
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
            expiresAt: { gt: input.now },
            character: { user: { telegramUserId } }
          },
          orderBy: { updatedAt: "desc" }
        });
      }

      throw error;
    });

    return mapPending(record);
  }

  async expireById(input: {
    id: string;
    expectedStatus: "pending";
    expectedVersion: number;
    now: Date;
  }): Promise<ExpirePendingPassageEncounterResult> {
    const updated = await this.prisma.$transaction(async (tx): Promise<ExpirePendingPassageEncounterResult> => {
      const transition = await tx.pendingPassageEncounter.updateMany({
        where: {
          id: input.id,
          status: input.expectedStatus,
          version: input.expectedVersion
        },
        data: {
          status: "expired",
          activeKey: null,
          cancelledAt: input.now,
          version: { increment: 1 }
        }
      });

      const current = await tx.pendingPassageEncounter.findUnique({ where: { id: input.id } });
      const mapped = mapPending(current);

      if (transition.count === 1) {
        return mapped ? { state: "expired", encounter: mapped } : { state: "missing" };
      }

      if (!mapped) {
        return { state: "missing" };
      }

      if (mapped.status === "consumed") {
        return { state: "already-consumed", encounter: mapped };
      }

      if (mapped.status === "expired" || mapped.status === "cancelled") {
        return { state: "already-terminal", encounter: mapped };
      }

      return { state: "version-changed", encounter: mapped };
    });

    return updated;
  }

  async consumeForTelegramUser(
    telegramUserId: bigint,
    token: string,
    input: ConsumePendingPassageEncounterInput
  ): Promise<ConsumePendingPassageEncounterResult> {
    return this.createSessionForEncounter(telegramUserId, token, input, "pending");
  }

  async createSessionForConsumedEncounter(
    telegramUserId: bigint,
    token: string,
    input: ConsumePendingPassageEncounterInput
  ): Promise<ConsumePendingPassageEncounterResult> {
    return this.createSessionForEncounter(telegramUserId, token, input, "consumed");
  }

  private async createSessionForEncounter(
    telegramUserId: bigint,
    token: string,
    input: ConsumePendingPassageEncounterInput,
    expectedStatus: "pending" | "consumed"
  ): Promise<ConsumePendingPassageEncounterResult> {
    const result = await this.prisma.$transaction(async (tx): Promise<ConsumePendingPassageEncounterResult> => {
      const encounter = await tx.pendingPassageEncounter.findFirst({
        where: { token, character: { user: { telegramUserId } } }
      });

      const mappedEncounter = mapPending(encounter);
      if (!encounter || !mappedEncounter) {
        return { state: "invalid" };
      }

      if (expectedStatus === "pending" && mappedEncounter.status === "consumed") {
        const session = mappedEncounter.combatSessionId
          ? await tx.soloCombatSession.findFirst({ where: { id: mappedEncounter.combatSessionId } })
          : null;
        return { state: "already-consumed", encounter: mappedEncounter, session: mapSoloCombatSessionRecord(session) };
      }

      if (mappedEncounter.status !== expectedStatus) {
        return { state: "not-pending", encounter: mappedEncounter };
      }

      if (mappedEncounter.version !== input.expectedEncounterVersion) {
        return { state: "version-changed", encounter: mappedEncounter };
      }

      if (mappedEncounter.expiresAt.getTime() <= input.now.getTime()) {
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
        return { state: "active-lease-conflict" };
      }

      if (!isFrozenEncounterSessionInputValid(mappedEncounter, input)) {
        return { state: "invalid" };
      }

      if (expectedStatus === "consumed") {
        if (!input.expectedLinkedSessionId || mappedEncounter.combatSessionId !== input.expectedLinkedSessionId) {
          return { state: "version-changed", encounter: mappedEncounter };
        }

        const priorSession = await tx.soloCombatSession.findFirst({
          where: {
            id: input.expectedLinkedSessionId,
            characterId: encounter.characterId
          }
        });
        const mappedPriorSession = mapSoloCombatSessionRecord(priorSession);

        if (!mappedPriorSession || !isRecoverablePriorSession(mappedEncounter, mappedPriorSession)) {
          return { state: "not-pending", encounter: mappedEncounter };
        }
      }

      const update = await tx.pendingPassageEncounter.updateMany({
        where: {
          id: encounter.id,
          status: expectedStatus,
          version: input.expectedEncounterVersion,
          expiresAt: { gt: input.now },
          ...(expectedStatus === "consumed"
            ? { combatSessionId: input.expectedLinkedSessionId ?? "__missing__" }
            : {})
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
        if (currentMapped && currentMapped.version !== input.expectedEncounterVersion) {
          return { state: "version-changed", encounter: currentMapped };
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
        return { state: "active-lease-conflict" };
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

function isFrozenEncounterSessionInputValid(
  encounter: PendingPassageEncounterRecord,
  input: ConsumePendingPassageEncounterInput
): boolean {
  const state = input.state;
  const debugTrace = state.monster.debugTrace;

  return (
    input.monsterId === encounter.monsterId &&
    state.monster.id === encounter.monsterId &&
    state.monster.level === encounter.effectiveMonsterLevel &&
    debugTrace?.baseMonsterLevel === encounter.baseMonsterLevel &&
    debugTrace?.effectiveMonsterLevel === encounter.effectiveMonsterLevel &&
    state.source === "normal" &&
    normalizeOrigin(state.originLocationId) === normalizeOrigin(encounter.originLocationId) &&
    passageFromOrigin(encounter.originLocationId) === encounter.passage &&
    difficultyFromOrigin(encounter.originLocationId) === encounter.difficulty
  );
}

function isRecoverablePriorSession(
  encounter: PendingPassageEncounterRecord,
  session: NonNullable<ReturnType<typeof mapSoloCombatSessionRecord>>
): boolean {
  const state = session.state;

  if (!state || state.status === "active" || state.status === "won") {
    return false;
  }

  if (session.characterId !== encounter.characterId || session.monsterId !== encounter.monsterId) {
    return false;
  }

  if (state.monster.id !== encounter.monsterId) {
    return false;
  }

  const hp = Math.floor(state.monster.hp);

  return hp > 0;
}

function normalizeOrigin(value: string | undefined): string {
  if (value === "location.korchma.deep.level1.left") {
    return "location.korchma.deep.level1.left";
  }

  if (value === "location.korchma.deep.level1.right") {
    return "location.korchma.deep.level1.right";
  }

  if (value === "location.korchma.deep.level1.straight") {
    return "location.korchma.deep.level1.straight";
  }

  return value ?? "";
}

function passageFromOrigin(value: string): PendingPassageEncounterRecord["passage"] {
  const normalized = normalizeOrigin(value);

  if (normalized === "location.korchma.deep.level1.left") {
    return "deep-left";
  }

  if (normalized === "location.korchma.deep.level1.right") {
    return "deep-right";
  }

  return "deep-straight";
}

function difficultyFromOrigin(value: string): PendingPassageEncounterRecord["difficulty"] {
  const passage = passageFromOrigin(value);

  if (passage === "deep-left") {
    return "hard";
  }

  if (passage === "deep-right") {
    return "easy";
  }

  return "normal";
}
