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
  const frozen = payload
    ? freezeVarenykSatedForCombat(payload, input.characterId, input.remortCount, input.now)
    : null;
  if (!row || !payload || !frozen) {
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
    return { resources: { ...input.resources }, hpRestored: 0, manaRestored: 0 };
  }
  return {
    resources: safeResources,
    sated: frozen,
    hpRestored: input.resources.hp <= 0 ? 0 : settled.hpRestored,
    manaRestored: settled.manaRestored
  };
}

export async function advanceVarenykSatedCursorThroughCombat(input: {
  tx: TxClient;
  characterId: string;
  activationId?: string;
  now: Date;
}): Promise<void> {
  const row = await input.tx.characterCooldown.findUnique({
    where: {
      characterId_key: { characterId: input.characterId, key: VARENYK_SATED_STATUS_KEY }
    }
  });
  const payload = parseVarenykSatedPayload(row?.resultJson);
  if (!row || !payload || (input.activationId && payload.activationId !== input.activationId)) {
    return;
  }
  const through = new Date(Math.min(input.now.getTime(), Date.parse(payload.expiresAt)));
  if (through.getTime() <= Date.parse(payload.cursorAt)) {
    return;
  }
  await input.tx.characterCooldown.updateMany({
    where: {
      id: row.id,
      availableAt: row.availableAt,
      resultJson: { equals: row.resultJson ?? Prisma.JsonNull }
    },
    data: {
      resultJson: {
        ...payload,
        cursorAt: through.toISOString()
      } as unknown as Prisma.InputJsonValue
    }
  });
}
