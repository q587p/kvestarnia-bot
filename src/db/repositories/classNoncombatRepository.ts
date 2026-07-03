import type { CharacterRecord } from "./characterRepository";
import type { RoguePickpocketOutcome } from "../../domain/noncombat/classNoncombatTechniques";

export interface NoncombatTargetRecord {
  telegramUserId: bigint;
  characterId: string;
  name: string;
  classId: string;
  level: number;
  hpCurrent: number;
  hpMax: number;
  gold: number;
  remortCount: number;
}

export interface NoncombatActionSnapshot {
  character: CharacterRecord;
  targets: NoncombatTargetRecord[];
  locationId: string;
  locationName: string;
  priestHealCooldownAvailableAt: Date | null;
  priestBlessCooldownAvailableAt: Date | null;
  roguePickpocketCooldownAvailableAt: Date | null;
}

export interface PriestAidRecord {
  id: string;
  actorCharacterId: string;
  targetCharacterId: string;
  actorTelegramUserId: bigint;
  targetTelegramUserId: bigint;
  actorName: string;
  targetName: string;
  actionKind: "heal" | "blessing";
  healAmount: number;
  manaCost: number;
  cooldownAvailableAt: Date;
  completedAt: Date;
}

export interface PriestBlessingRecord {
  id: string;
  actorName: string;
  targetName: string;
  expiresAt: Date;
  bonusStat: string | null;
  bonusAmount: number;
}

export interface RoguePickpocketAttemptRecord {
  id: string;
  actorCharacterId: string;
  targetCharacterId: string;
  actorTelegramUserId: bigint;
  targetTelegramUserId: bigint;
  actorName: string;
  targetName: string;
  outcome: RoguePickpocketOutcome;
  stolenGold: number;
  actorHpAfter: number | null;
  cooldownAvailableAt: Date;
  completedAt: Date;
}

export type NoncombatGateReason =
  | "no-character"
  | "target-not-found"
  | "self-target"
  | "not-priest"
  | "not-rogue"
  | "level-locked"
  | "target-level-locked"
  | "actor-remort-mismatch"
  | "target-remort-mismatch"
  | "wrong-location"
  | "target-inactive"
  | "actor-blocked"
  | "target-blocked"
  | "actor-defeated"
  | "full-hp"
  | "insufficient-mana"
  | "already-blessed"
  | "cooldown"
  | "pair-daily-used"
  | "stale";

export type PriestHealRepositoryResult =
  | { state: "completed"; action: PriestAidRecord; actor: CharacterRecord; target: CharacterRecord; created: true }
  | { state: "blocked"; reason: NoncombatGateReason; actor?: CharacterRecord; target?: CharacterRecord; availableAt?: Date; blessing?: PriestBlessingRecord };

export type PriestBlessRepositoryResult =
  | {
      state: "completed";
      action: PriestAidRecord;
      blessing: PriestBlessingRecord;
      actor: CharacterRecord;
      target: CharacterRecord;
      created: true;
    }
  | { state: "blocked"; reason: NoncombatGateReason; actor?: CharacterRecord; target?: CharacterRecord; availableAt?: Date; blessing?: PriestBlessingRecord };

export type RoguePickpocketRepositoryResult =
  | { state: "completed"; attempt: RoguePickpocketAttemptRecord; actor: CharacterRecord; target: CharacterRecord; created: boolean }
  | { state: "blocked"; reason: NoncombatGateReason; actor?: CharacterRecord; target?: CharacterRecord; availableAt?: Date };

export interface ClassNoncombatRepository {
  getSnapshotForTelegramUser(
    telegramUserId: bigint,
    input: { activeSince: Date; page: number; pageSize: number; now: Date }
  ): Promise<NoncombatActionSnapshot | null>;

  getActivePriestBlessingForTelegramUser(
    telegramUserId: bigint,
    now: Date
  ): Promise<PriestBlessingRecord | null>;

  completePriestHeal(
    actorTelegramUserId: bigint,
    input: {
      targetTelegramUserId: bigint | null;
      expectedActorRemortCount: number;
      expectedTargetRemortCount: number;
      activeSince: Date;
      now: Date;
      cooldownAvailableAt: Date;
      healAmount: number;
      manaCost: number;
      statSnapshot: unknown;
    }
  ): Promise<PriestHealRepositoryResult>;

  completePriestBlessing(
    actorTelegramUserId: bigint,
    input: {
      targetTelegramUserId: bigint | null;
      expectedActorRemortCount: number;
      expectedTargetRemortCount: number;
      activeSince: Date;
      now: Date;
      expiresAt: Date;
      cooldownAvailableAt: Date;
      manaCost: number;
      statSnapshot: unknown;
    }
  ): Promise<PriestBlessRepositoryResult>;

  completeRoguePickpocket(
    actorTelegramUserId: bigint,
    input: {
      targetTelegramUserId: bigint;
      expectedActorRemortCount: number;
      expectedTargetRemortCount: number;
      activeSince: Date;
      now: Date;
      localDate: string;
      cooldownAvailableAt: Date;
      outcome: RoguePickpocketOutcome;
      stolenGold: number;
      statSnapshot: unknown;
    }
  ): Promise<RoguePickpocketRepositoryResult>;
}
