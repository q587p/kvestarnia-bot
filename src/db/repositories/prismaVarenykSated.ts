import { Prisma } from "@prisma/client";
import {
  freezeVarenykSatedForCombat,
  parseVarenykSatedPayload,
  settleVarenykSatedOutsideCombat,
  VARENYK_SATED_STATUS_KEY,
  type SatedResourceState,
  type VarenykSatedCombatStateV1
} from "../../domain/noncombat/varenykSatedSupport";

type TxClient = Prisma.TransactionClient;

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
    throw new VarenykSatedCasError("activation");
  }
  if (
    !input.activationId &&
    input.leaseStartedAt &&
    Date.parse(payload.startedAt) > input.leaseStartedAt.getTime()
  ) {
    return;
  }
  const through = new Date(Math.min(input.now.getTime(), Date.parse(payload.expiresAt)));
  const inferredRemainder = input.leaseStartedAt
    ? input.leaseStartedAt.getTime() - Date.parse(payload.cursorAt)
    : 0;
  const remainder = Math.max(0, Math.min(
    59_999,
    Math.floor(input.outsideRemainderMs ?? inferredRemainder)
  ));
  const nextCursor = new Date(Math.max(
    Date.parse(payload.cursorAt),
    through.getTime() - remainder
  ));
  if (nextCursor.getTime() <= Date.parse(payload.cursorAt)) {
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
        cursorAt: nextCursor.toISOString()
      } as unknown as Prisma.InputJsonValue
    }
  });
  if (updated.count !== 1) {
    throw new VarenykSatedCasError("cursor");
  }
}

export class VarenykSatedCasError extends Error {
  constructor(stage: string) {
    super(`Varenyk Sated ${stage} compare-and-swap lost.`);
  }
}
