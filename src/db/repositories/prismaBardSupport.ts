import { Prisma } from "@prisma/client";
import {
  BARD_INSPIRATION_STATUS_KEY,
  BARD_MUSIC_AVAILABILITY_MINUTES,
  BARD_SUPPORT_RULES_VERSION,
  buildBardInspirationPayload,
  freezeBardInspirationForCombat,
  getBardMusicAvailabilityKey,
  isBardInspirationActive,
  parseBardInspirationPayload,
  settleBardInspirationOutsideCombat,
  type BardInspirationCombatStateV1,
  type BardInspirationMutation,
  type BardInspirationPayloadV1
} from "../../domain/noncombat/bardSupport";
import type { BardPerformanceGrade } from "../../domain/noncombat/bardPerformance";

type TxClient = Prisma.TransactionClient;

export async function findBardMusicAvailableAt(input: {
  tx: TxClient;
  characterId: string;
  locationId: string;
  remortCount: number;
}): Promise<Date | null> {
  const [shared, historical] = await Promise.all([
    input.tx.characterCooldown.findUnique({
      where: {
        characterId_key: {
          characterId: input.characterId,
          key: getBardMusicAvailabilityKey(input.locationId)
        }
      },
      select: { availableAt: true }
    }),
    input.tx.bardPerformance.findFirst({
      where: {
        characterId: input.characterId,
        locationId: input.locationId,
        remortCount: input.remortCount
      },
      orderBy: { cooldownAvailableAt: "desc" },
      select: { cooldownAvailableAt: true }
    })
  ]);
  const candidates = [shared?.availableAt, historical?.cooldownAvailableAt]
    .filter((value): value is Date => value instanceof Date);

  return candidates.sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
}

export async function writeBardMusicAvailability(input: {
  tx: TxClient;
  characterId: string;
  locationId: string;
  now: Date;
  source: "performance" | "lament";
  sourceId: string;
}): Promise<Date> {
  const availableAt = new Date(
    input.now.getTime() + BARD_MUSIC_AVAILABILITY_MINUTES * 60_000
  );
  const resultJson = {
    kind: "bard-music-availability-v1",
    rulesVersion: BARD_SUPPORT_RULES_VERSION,
    locationId: input.locationId,
    source: input.source,
    sourceId: input.sourceId,
    claimedAt: input.now.toISOString(),
    availableAt: availableAt.toISOString()
  } satisfies Prisma.InputJsonObject;

  await input.tx.characterCooldown.upsert({
    where: {
      characterId_key: {
        characterId: input.characterId,
        key: getBardMusicAvailabilityKey(input.locationId)
      }
    },
    create: {
      characterId: input.characterId,
      key: getBardMusicAvailabilityKey(input.locationId),
      availableAt,
      resultJson
    },
    update: { availableAt, resultJson }
  });

  return availableAt;
}

export async function grantBardInspiration(input: {
  tx: TxClient;
  activationId: string;
  sourcePerformanceId: string;
  sourceCharacterId: string;
  sourceLocationId: string;
  recipientCharacterId: string;
  recipientRemortCount: number;
  grade: BardPerformanceGrade;
  now: Date;
}): Promise<{
  mutation: BardInspirationMutation;
  inspiration: BardInspirationPayloadV1;
} | null> {
  const locked = await input.tx.character.updateMany({
    where: { id: input.recipientCharacterId },
    data: { updatedAt: input.now }
  });
  if (locked.count !== 1) {
    return null;
  }
  const currentRemortCount = await input.tx.characterRemort.count({
    where: { characterId: input.recipientCharacterId }
  });
  if (currentRemortCount !== input.recipientRemortCount) {
    return null;
  }
  const row = await input.tx.characterCooldown.findUnique({
    where: {
      characterId_key: {
        characterId: input.recipientCharacterId,
        key: BARD_INSPIRATION_STATUS_KEY
      }
    }
  });
  const current = parseBardInspirationPayload(row?.resultJson);
  const next = buildBardInspirationPayload(input);
  if (
    current &&
    isBardInspirationActive(
      current,
      input.recipientCharacterId,
      input.recipientRemortCount,
      input.now
    ) &&
    current.accuracyBonusPp >= next.accuracyBonusPp
  ) {
    return { mutation: "unchanged", inspiration: current };
  }

  const mutation: BardInspirationMutation = current && isBardInspirationActive(
    current,
    input.recipientCharacterId,
    input.recipientRemortCount,
    input.now
  ) ? "replaced" : "granted";
  await input.tx.characterCooldown.upsert({
    where: {
      characterId_key: {
        characterId: input.recipientCharacterId,
        key: BARD_INSPIRATION_STATUS_KEY
      }
    },
    create: {
      characterId: input.recipientCharacterId,
      key: BARD_INSPIRATION_STATUS_KEY,
      availableAt: new Date(next.expiresAt),
      resultJson: next as unknown as Prisma.InputJsonValue
    },
    update: {
      availableAt: new Date(next.expiresAt),
      resultJson: next as unknown as Prisma.InputJsonValue
    }
  });

  return { mutation, inspiration: next };
}

export async function freezeBardInspirationFromCooldown(input: {
  tx: TxClient;
  characterId: string;
  remortCount: number;
  now: Date;
}): Promise<BardInspirationCombatStateV1 | undefined> {
  const row = await input.tx.characterCooldown.findUnique({
    where: {
      characterId_key: {
        characterId: input.characterId,
        key: BARD_INSPIRATION_STATUS_KEY
      }
    }
  });
  if (!row) {
    return undefined;
  }
  const payload = parseBardInspirationPayload(row.resultJson);
  if (!payload) {
    await input.tx.characterCooldown.deleteMany({
      where: {
        id: row.id,
        resultJson: { equals: row.resultJson ?? Prisma.JsonNull }
      }
    });
    return undefined;
  }
  if (
    !isBardInspirationActive(payload, input.characterId, input.remortCount, input.now)
  ) {
    return undefined;
  }
  const settled = settleBardInspirationOutsideCombat(payload, input.now);
  const updated = await input.tx.characterCooldown.updateMany({
    where: {
      id: row.id,
      availableAt: row.availableAt,
      resultJson: { equals: row.resultJson ?? Prisma.JsonNull }
    },
    data: { resultJson: settled as unknown as Prisma.InputJsonValue }
  });
  if (updated.count !== 1) {
    throw new BardSupportCasError("freeze");
  }

  return freezeBardInspirationForCombat(
    settled,
    input.characterId,
    input.remortCount,
    input.now
  ) ?? undefined;
}

export async function advanceBardInspirationCursorThroughCombat(input: {
  tx: TxClient;
  characterId: string;
  activationId?: string;
  now: Date;
  outsideRemainderMs?: number;
  leaseStartedAt?: Date;
  combatExpiresAt?: Date;
  combatCursorAt?: Date;
}): Promise<void> {
  const row = await input.tx.characterCooldown.findUnique({
    where: {
      characterId_key: {
        characterId: input.characterId,
        key: BARD_INSPIRATION_STATUS_KEY
      }
    }
  });
  const payload = parseBardInspirationPayload(row?.resultJson);
  if (!row || !payload) {
    return;
  }
  if (input.activationId && payload.activationId !== input.activationId) {
    if (input.leaseStartedAt && Date.parse(payload.startedAt) > input.leaseStartedAt.getTime()) {
      return;
    }
    throw new BardSupportCasError("activation");
  }
  if (
    !input.activationId &&
    input.leaseStartedAt &&
    Date.parse(payload.startedAt) > input.leaseStartedAt.getTime()
  ) {
    return;
  }

  const payloadExpiresAt = Date.parse(payload.expiresAt);
  const payloadCursorAt = Date.parse(payload.cursorAt);
  const payloadStartedAt = Date.parse(payload.startedAt);
  const leaseStartedAt = input.leaseStartedAt?.getTime();
  const activationWasActiveAtLeaseStart =
    typeof leaseStartedAt === "number" &&
    Number.isFinite(leaseStartedAt) &&
    payload.recipientCharacterId === input.characterId &&
    payloadStartedAt <= leaseStartedAt &&
    payloadCursorAt <= leaseStartedAt &&
    payloadExpiresAt > leaseStartedAt;
  if (input.leaseStartedAt && !activationWasActiveAtLeaseStart) {
    return;
  }
  const combatExpiresAt = input.combatExpiresAt?.getTime();
  const combatCursorAt = input.combatCursorAt?.getTime();
  const hasFrozenCombatDuration =
    typeof combatExpiresAt === "number" &&
    Number.isFinite(combatExpiresAt) &&
    typeof combatCursorAt === "number" &&
    Number.isFinite(combatCursorAt);
  const inferredRemainder = input.leaseStartedAt
    ? input.leaseStartedAt.getTime() - payloadCursorAt
    : 0;
  const remainder = Math.max(0, Math.min(
    59_999,
    Math.floor(input.outsideRemainderMs ?? inferredRemainder)
  ));
  const frozenDurationMs = hasFrozenCombatDuration
    ? Math.max(0, combatExpiresAt - combatCursorAt)
    : activationWasActiveAtLeaseStart
      ? Math.max(0, payloadExpiresAt - payloadCursorAt)
      : null;
  const fallbackExpiresAt = new Date(Math.max(
    payloadStartedAt,
    Math.min(
      payloadExpiresAt,
      typeof combatExpiresAt === "number" && Number.isFinite(combatExpiresAt)
        ? combatExpiresAt
        : payloadExpiresAt
    )
  ));
  const through = new Date(Math.min(input.now.getTime(), fallbackExpiresAt.getTime()));
  const nextCursor = frozenDurationMs === null
    ? through.getTime() === fallbackExpiresAt.getTime()
      ? through
      : new Date(Math.max(payloadCursorAt, through.getTime() - remainder))
    : frozenDurationMs === 0
      ? new Date(input.now)
      : new Date(Math.max(payloadCursorAt, input.now.getTime() - remainder));
  const effectiveExpiresAt = frozenDurationMs === null
    ? fallbackExpiresAt
    : frozenDurationMs === 0
      ? new Date(nextCursor)
      : new Date(nextCursor.getTime() + frozenDurationMs);
  const expiryChanged = effectiveExpiresAt.getTime() !== payloadExpiresAt;
  if (nextCursor.getTime() <= payloadCursorAt && !expiryChanged) {
    return;
  }
  const updated = await input.tx.characterCooldown.updateMany({
    where: {
      id: row.id,
      availableAt: row.availableAt,
      resultJson: { equals: row.resultJson ?? Prisma.JsonNull }
    },
    data: {
      availableAt: effectiveExpiresAt,
      resultJson: {
        ...payload,
        expiresAt: effectiveExpiresAt.toISOString(),
        cursorAt: new Date(Math.min(
          effectiveExpiresAt.getTime(),
          Math.max(nextCursor.getTime(), payloadCursorAt)
        )).toISOString()
      }
    }
  });
  if (updated.count !== 1) {
    throw new BardSupportCasError("cursor");
  }
}

export class BardSupportCasError extends Error {
  constructor(stage: string) {
    super(`Bard support ${stage} compare-and-swap lost.`);
  }
}
