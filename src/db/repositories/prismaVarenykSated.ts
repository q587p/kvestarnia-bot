import { Prisma } from "@prisma/client";
import type { CombatState } from "../../domain/combat";
import type { BardInspirationCombatStateV1 } from "../../domain/noncombat/bardSupport";
import {
  freezeVarenykSatedForCombat,
  parseVarenykSatedPayload,
  settleVarenykSatedOutsideCombat,
  VARENYK_SATED_STATUS_KEY,
  type SatedResourceState,
  type VarenykSatedCombatStateV1
} from "../../domain/noncombat/varenykSatedSupport";
import {
  advanceBardInspirationCursorThroughCombat,
  invalidateBardInspirationOwnedByCombatLease
} from "./prismaBardSupport";

type TxClient = Prisma.TransactionClient;

interface SoloCombatCharacterSnapshot {
  id: string;
  hpCurrent: number;
  manaCurrent: number;
  hpRegenAt: Date | null;
  manaRegenAt: Date | null;
  updatedAt: Date;
}

export async function freezeVarenykSatedForSoloCombatStart(input: {
  tx: TxClient;
  character: SoloCombatCharacterSnapshot;
  state: CombatState;
  now: Date;
}): Promise<CombatState> {
  const sated = await freezeVarenykSatedFromCooldown({
    tx: input.tx,
    characterId: input.character.id,
    remortCount: input.state.life?.remortCount ?? 0,
    resources: {
      hp: Math.max(0, Math.min(input.character.hpCurrent, input.state.hero.hpMax)),
      hpMax: input.state.hero.hpMax,
      mana: Math.max(0, Math.min(input.character.manaCurrent, input.state.hero.manaMax)),
      manaMax: input.state.hero.manaMax
    },
    now: input.now
  });
  if (sated.hpRestored > 0 || sated.manaRestored > 0) {
    const persisted = await input.tx.character.updateMany({
      where: {
        id: input.character.id,
        hpCurrent: input.character.hpCurrent,
        manaCurrent: input.character.manaCurrent,
        hpRegenAt: input.character.hpRegenAt,
        manaRegenAt: input.character.manaRegenAt,
        updatedAt: input.character.updatedAt
      },
      data: {
        hpCurrent: sated.resources.hp,
        manaCurrent: sated.resources.mana,
        hpRegenAt: sated.resources.hp >= sated.resources.hpMax
          ? input.now
          : input.character.hpRegenAt,
        manaRegenAt: sated.resources.mana >= sated.resources.manaMax
          ? input.now
          : input.character.manaRegenAt
      }
    });
    if (persisted.count !== 1) {
      throw new VarenykSatedCasError("solo-character-resources");
    }
  }
  return {
    ...input.state,
    hero: { ...input.state.hero, hp: sated.resources.hp, mana: sated.resources.mana },
    ...(sated.sated ? { varenykSated: sated.sated } : {})
  };
}

export async function freezeVarenykSatedFromCooldown(input: {
  tx: TxClient;
  characterId: string;
  remortCount: number;
  resources: SatedResourceState;
  now: Date;
}): Promise<{
  resources: SatedResourceState;
  sated?: VarenykSatedCombatStateV1;
  hpRestored: number;
  manaRestored: number;
}> {
  const row = await input.tx.characterCooldown.findUnique({
    where: {
      characterId_key: { characterId: input.characterId, key: VARENYK_SATED_STATUS_KEY }
    }
  });
  const payload = parseVarenykSatedPayload(row?.resultJson);
  if (!row || !payload || payload.recipientCharacterId !== input.characterId ||
      payload.recipientRemortCount !== input.remortCount) {
    return { resources: { ...input.resources }, hpRestored: 0, manaRestored: 0 };
  }
  const settled = settleVarenykSatedOutsideCombat({
    payload,
    resources: input.resources,
    now: input.now,
    combatBlocked: false
  });
  const safeResources = input.resources.hp <= 0
    ? { ...settled.resources, hp: 0 }
    : settled.resources;
  const updated = await input.tx.characterCooldown.updateMany({
    where: {
      id: row.id,
      availableAt: row.availableAt,
      resultJson: { equals: row.resultJson ?? Prisma.JsonNull }
    },
    data: { resultJson: settled.payload as unknown as Prisma.InputJsonValue }
  });
  if (updated.count !== 1) {
    throw new VarenykSatedCasError("freeze");
  }
  const frozen = freezeVarenykSatedForCombat(
    settled.payload,
    input.characterId,
    input.remortCount,
    input.now
  );
  return {
    resources: safeResources,
    ...(frozen ? { sated: frozen } : {}),
    hpRestored: input.resources.hp <= 0 ? 0 : settled.hpRestored,
    manaRestored: settled.manaRestored
  };
}

export async function advanceVarenykSatedCursorThroughCombat(input: {
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
      characterId_key: { characterId: input.characterId, key: VARENYK_SATED_STATUS_KEY }
    }
  });
  const payload = parseVarenykSatedPayload(row?.resultJson);
  if (!row || !payload) {
    return;
  }
  if (input.activationId && payload.activationId !== input.activationId) {
    if (
      input.leaseStartedAt &&
      Date.parse(payload.startedAt) > input.leaseStartedAt.getTime()
    ) {
      return;
    }
    throw new VarenykSatedCasError("activation");
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
      resultJson: {
        ...payload,
        expiresAt: effectiveExpiresAt.toISOString(),
        cursorAt: new Date(Math.min(
          effectiveExpiresAt.getTime(),
          Math.max(nextCursor.getTime(), payloadCursorAt)
        )).toISOString()
      } as unknown as Prisma.InputJsonValue
    }
  });
  if (updated.count !== 1) {
    throw new VarenykSatedCasError("cursor");
  }
}

export async function releaseCombatLeaseWithTimedStatuses(input: {
  tx: TxClient;
  lease: {
    id: string;
    characterId: string;
    kind: string;
    referenceId: string;
    createdAt: Date;
    updatedAt: Date;
  };
  releasedAt: Date;
  sated?: Pick<VarenykSatedCombatStateV1, "activationId" | "outsideRemainderMs" | "expiresAt" | "cursorAt">;
  inspiration?: Pick<
    BardInspirationCombatStateV1,
    "activationId" | "outsideRemainderMs" | "expiresAt" | "cursorAt"
  >;
}): Promise<boolean> {
  const claimedAt = new Date(Math.max(
    input.releasedAt.getTime(),
    input.lease.updatedAt.getTime() + 1
  ));
  const claimed = await input.tx.activeCombatLease.updateMany({
    where: {
      id: input.lease.id,
      characterId: input.lease.characterId,
      kind: input.lease.kind,
      referenceId: input.lease.referenceId,
      updatedAt: input.lease.updatedAt
    },
    data: { updatedAt: claimedAt }
  });
  if (claimed.count !== 1) {
    const current = await input.tx.activeCombatLease.findUnique({
      where: { id: input.lease.id },
      select: { characterId: true, kind: true, referenceId: true }
    });
    if (!current) {
      return false;
    }
    if (
      current.characterId === input.lease.characterId &&
      current.kind === input.lease.kind &&
      current.referenceId === input.lease.referenceId
    ) {
      return false;
    }
    throw new VarenykSatedCasError("lease-identity");
  }

  await advanceVarenykSatedCursorThroughCombat({
    tx: input.tx,
    characterId: input.lease.characterId,
    ...(input.sated ? { activationId: input.sated.activationId } : {}),
    now: input.releasedAt,
    leaseStartedAt: input.lease.createdAt,
    ...(input.sated
      ? {
          outsideRemainderMs: input.sated.outsideRemainderMs,
          combatExpiresAt: new Date(input.sated.expiresAt),
          combatCursorAt: new Date(input.sated.cursorAt)
        }
      : {})
  });
  if (input.inspiration) {
    await advanceBardInspirationCursorThroughCombat({
      tx: input.tx,
      characterId: input.lease.characterId,
      activationId: input.inspiration.activationId,
      now: input.releasedAt,
      leaseStartedAt: input.lease.createdAt,
      outsideRemainderMs: input.inspiration.outsideRemainderMs,
      combatExpiresAt: new Date(input.inspiration.expiresAt),
      combatCursorAt: new Date(input.inspiration.cursorAt)
    });
  } else {
    await invalidateBardInspirationOwnedByCombatLease({
      tx: input.tx,
      characterId: input.lease.characterId,
      leaseStartedAt: input.lease.createdAt
    });
  }

  const deleted = await input.tx.activeCombatLease.deleteMany({
    where: {
      id: input.lease.id,
      characterId: input.lease.characterId,
      kind: input.lease.kind,
      referenceId: input.lease.referenceId,
      updatedAt: claimedAt
    }
  });
  if (deleted.count !== 1) {
    throw new VarenykSatedCasError("lease-release");
  }
  return true;
}

export class VarenykSatedCasError extends Error {
  constructor(stage: string) {
    super(`Varenyk Sated ${stage} compare-and-swap lost.`);
  }
}
