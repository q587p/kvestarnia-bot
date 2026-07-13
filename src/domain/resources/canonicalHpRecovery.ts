import { items } from "../../content";
import type { ItemContent } from "../../content/schema";
import { summarizeCharacter } from "../characters/characterSummary";
import {
  isEquipmentAttunementPendingForRow,
  matchesEquipmentAttunementRow,
  parseEquipmentAttunementPayload
} from "../equipment/equipmentAttunement";
import { buildShynokRecoveryWindows, isShynokDrinkKey } from "../shynokDrinks";
import { applyPassiveResourceRegeneration } from "./resourceRegeneration";

export interface CanonicalHpRecoverySnapshot {
  characterId: string;
  telegramUserId: bigint;
  lastActionAt: Date | null;
  pronoun: string;
  path: string;
  raceId: string;
  classId: string;
  level: number;
  xp: number;
  hpCurrent: number;
  hpMax: number;
  hpRegenAt: Date | null;
  statsJson: unknown;
  remortCount: number;
  activeCombatLease: { kind: string; referenceId: string } | null;
  equipment: Array<{ slot: string; itemId: string; updatedAt: Date }>;
  attunementActions: Array<{ resultJson: unknown; createdAt: Date }>;
  recoveryDrink: {
    drinkKey: string;
    phase: string;
    startedAt: Date;
    expiresAt: Date;
    metadata: unknown;
  } | null;
}

export function evaluateCanonicalHpRecovery(snapshot: CanonicalHpRecoverySnapshot, now: Date) {
  const equippedItems = getActiveEquippedItems(snapshot, now);
  const summary = summarizeCharacter({
    name: "",
    pronoun: snapshot.pronoun,
    path: snapshot.path,
    raceId: snapshot.raceId,
    classId: snapshot.classId,
    level: snapshot.level,
    xp: snapshot.xp,
    gold: 0,
    hpCurrent: snapshot.hpCurrent,
    hpMax: snapshot.hpMax,
    manaCurrent: 0,
    manaMax: 1,
    statsJson: snapshot.statsJson
  }, {
    equippedItems,
    remortCount: snapshot.remortCount
  });
  const recoveryDrink = snapshot.recoveryDrink && isShynokDrinkKey(snapshot.recoveryDrink.drinkKey)
    ? {
        drinkKey: snapshot.recoveryDrink.drinkKey,
        phase: snapshot.recoveryDrink.phase === "queued" ? "queued" as const : "timed" as const,
        startedAt: snapshot.recoveryDrink.startedAt,
        expiresAt: snapshot.recoveryDrink.expiresAt,
        metadata: snapshot.recoveryDrink.metadata
      }
    : null;
  const regeneration = applyPassiveResourceRegeneration({
    resources: {
      hpCurrent: summary.hpCurrent,
      hpMax: summary.hpMax,
      manaCurrent: 0,
      manaMax: 0,
      hpRegenAt: snapshot.hpRegenAt,
      manaRegenAt: now
    },
    profile: {
      raceId: summary.raceId,
      classId: summary.classId,
      title: summary.title,
      stats: summary.stats
    },
    now,
    multiplierWindows: buildShynokRecoveryWindows(recoveryDrink)
  });

  return {
    summary,
    regeneration,
    fingerprint: buildHpRecoveryStateFingerprint(snapshot, now),
    pendingAttunementReadyAt: getPendingAttunementReadyAt(snapshot, now)
  };
}

export function buildHpRecoveryStateFingerprint(snapshot: CanonicalHpRecoverySnapshot, now: Date): string {
  const pendingAttunements = snapshot.attunementActions.flatMap((action) => {
    const payload = parseEquipmentAttunementPayload(action.resultJson);
    if (!payload || Date.parse(payload.readyAt) <= now.getTime()) {
      return [];
    }
    const row = snapshot.equipment.find((candidate) => matchesEquipmentAttunementRow(payload, candidate));
    return row ? [[payload.slot, payload.itemId, payload.equipmentUpdatedAt, payload.readyAt]] : [];
  });

  return stableStringify({
    profile: [snapshot.pronoun, snapshot.path, snapshot.raceId, snapshot.classId],
    progression: [snapshot.level, snapshot.xp, snapshot.remortCount, snapshot.hpMax],
    statsJson: snapshot.statsJson,
    lastActionAt: snapshot.lastActionAt?.toISOString() ?? null,
    equipment: snapshot.equipment
      .map((row) => [row.slot, row.itemId, row.updatedAt.toISOString()])
      .sort((left, right) => String(left[0]).localeCompare(String(right[0]))),
    pendingAttunements: pendingAttunements.sort((left, right) => String(left[0]).localeCompare(String(right[0]))),
    recoveryDrink: snapshot.recoveryDrink
      ? {
          drinkKey: snapshot.recoveryDrink.drinkKey,
          phase: snapshot.recoveryDrink.phase,
          startedAt: snapshot.recoveryDrink.startedAt.toISOString(),
          expiresAt: snapshot.recoveryDrink.expiresAt.toISOString(),
          metadata: snapshot.recoveryDrink.metadata
        }
      : null
  });
}

function getActiveEquippedItems(snapshot: CanonicalHpRecoverySnapshot, now: Date): ItemContent[] {
  return snapshot.equipment.flatMap((row) => {
    if (isEquipmentAttunementPendingForRow({
      row,
      actionPayloads: snapshot.attunementActions.map((action) => action.resultJson),
      now
    })) {
      return [];
    }
    const item = items.find((candidate) => candidate.id === row.itemId);
    return item ? [item] : [];
  });
}

function getPendingAttunementReadyAt(snapshot: CanonicalHpRecoverySnapshot, now: Date): Date | null {
  const readyTimes = snapshot.attunementActions.flatMap((action) => {
    const payload = parseEquipmentAttunementPayload(action.resultJson);
    if (!payload || !snapshot.equipment.some((row) => matchesEquipmentAttunementRow(payload, row))) {
      return [];
    }
    const readyAt = Date.parse(payload.readyAt);
    return readyAt > now.getTime() ? [readyAt] : [];
  });
  return readyTimes.length > 0 ? new Date(Math.min(...readyTimes)) : null;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
