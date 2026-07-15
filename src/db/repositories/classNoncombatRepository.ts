import type { CharacterRecord } from "./characterRepository";
import type { CharacterSummary } from "../../domain/characters/characterSummary";
import type { RoguePickpocketOutcome } from "../../domain/noncombat/classNoncombatTechniques";
import type { VarenykSatedPayloadV1, VarenykSatedPlan } from "../../domain/noncombat/varenykSatedSupport";

export interface NoncombatTargetRecord {
  telegramUserId: bigint;
  characterId: string;
  character: CharacterRecord;
  name: string;
  classId: string;
  level: number;
  hpCurrent: number;
  hpMax: number;
  gold: number;
  remortCount: number;
  priestBlessAvailableAt: Date | null;
  rogueAttemptedToday: boolean;
  varenykSatedAvailableAt: Date | null;
  varenykSated: VarenykSatedPayloadV1 | null;
  varenykPlanning?: VarenykPlanningSnapshot;
}

export interface VarenykPlanningSnapshot {
  summary: CharacterSummary;
  activeCosmeticTitleGrantId: string | null;
  naturalHpMax: number;
  naturalManaMax: number;
  equipmentItemIds: string[];
  attunedEquipmentRows: Array<{
    rowId: string;
    slot: string;
    itemId: string;
    updatedAt: string;
  }>;
  activePriestBlessing: {
    id: string;
    bonusStat: string | null;
    bonusAmount: number;
    expiresAt: string;
  } | null;
}

export interface NoncombatActionSnapshot {
  character: CharacterRecord;
  actorBlocked: boolean;
  targets: NoncombatTargetRecord[];
  targetPage: number;
  targetTotalPages: number;
  locationId: string;
  locationName: string;
  priestBlessCooldownAvailableAt: Date | null;
  priestSelfBlessAvailableAt: Date | null;
  roguePickpocketCooldownAvailableAt: Date | null;
  varenykSatedSelfAvailableAt: Date | null;
  varenykSatedSelf: VarenykSatedPayloadV1 | null;
  varenykStatRank: number | null;
  varenykPlan: VarenykSatedPlan | null;
  varenykPlanning?: VarenykPlanningSnapshot;
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
  retaliationToken: string | null;
  retaliationAvailableUntil: Date | null;
  retaliationUsedAt: Date | null;
  retaliationDuelInviteToken: string | null;
  cooldownAvailableAt: Date;
  completedAt: Date;
}

export interface VarenykSatedActionRecord {
  activationId: string;
  actorCharacterId: string;
  targetCharacterId: string;
  actorTelegramUserId: bigint;
  targetTelegramUserId: bigint;
  actorName: string;
  targetName: string;
  actorRemortCount: number;
  targetRemortCount: number;
  rank: number;
  manaCost: number;
  immediateHpRestored: number;
  immediateManaRestored: number;
  startedAt: Date;
  expiresAt: Date;
  availableAt: Date;
  created: boolean;
}

export interface VarenykSatedStatusRecord {
  payload: VarenykSatedPayloadV1 | null;
  hpRestored: number;
  manaRestored: number;
  character: CharacterRecord;
  passiveRecoveryNotice: {
    type: "hp-full";
    hpCurrent: number;
    hpMax: number;
  } | null;
}

export type VarenykSatedPreviewRepositoryResult =
  | {
      state: "saved";
      statRank: number;
      plan: VarenykSatedPlan;
      actor: VarenykPlanningSnapshot;
      target: VarenykPlanningSnapshot;
      actorRemortCount: number;
      targetRemortCount: number;
    }
  | {
      state: "blocked";
      reason: NoncombatGateReason;
      availableAt?: Date;
    };

export type NoncombatGateReason =
  | "no-character"
  | "target-not-found"
  | "self-target"
  | "not-priest"
  | "not-rogue"
  | "not-varenyk-mancer"
  | "level-locked"
  | "target-level-locked"
  | "actor-remort-mismatch"
  | "target-remort-mismatch"
  | "wrong-location"
  | "target-inactive"
  | "actor-blocked"
  | "target-blocked"
  | "actor-defeated"
  | "target-defeated"
  | "full-hp"
  | "insufficient-mana"
  | "already-blessed"
  | "already-sated"
  | "cooldown"
  | "target-cooldown"
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

export type VarenykSatedRepositoryResult =
  | {
      state: "completed";
      action: VarenykSatedActionRecord;
      actor: CharacterRecord;
      target: CharacterRecord;
      status: VarenykSatedPayloadV1;
      created: boolean;
    }
  | { state: "blocked"; reason: NoncombatGateReason; actor?: CharacterRecord; target?: CharacterRecord; availableAt?: Date };

export type RogueRetaliationClaimReason =
  | "not-found"
  | "not-target"
  | "invalid-attempt"
  | "expired"
  | "used"
  | "actor-not-rogue";

export type RogueRetaliationClaimResult =
  | { state: "ready"; attempt: RoguePickpocketAttemptRecord; actor: CharacterRecord; target: CharacterRecord }
  | { state: "blocked"; reason: RogueRetaliationClaimReason; attempt?: RoguePickpocketAttemptRecord };

export interface ClassNoncombatRepository {
  isRogueRetaliationDuelInviteToken?(inviteToken: string): Promise<boolean>;

  getSnapshotForTelegramUser(
    telegramUserId: bigint,
    input: {
      activeSince: Date;
      page: number;
      pageSize: number;
      now: Date;
      mode: "priest" | "rogue" | "varenyk";
      rogueAttemptedLocalDate?: string;
    }
  ): Promise<NoncombatActionSnapshot | null>;

  getActivePriestBlessingForTelegramUser(
    telegramUserId: bigint,
    now: Date
  ): Promise<PriestBlessingRecord | null>;

  getPriestSelfBlessAvailableAtForTelegramUser(
    telegramUserId: bigint,
    now: Date
  ): Promise<Date | null>;

  settleVarenykSatedForTelegramUser(
    telegramUserId: bigint,
    now: Date,
    knownCharacterId?: string,
    expectedCharacter?: Pick<
      CharacterRecord,
      "hpCurrent" | "manaCurrent" | "hpRegenAt" | "manaRegenAt" | "remortCount"
    >
  ): Promise<VarenykSatedStatusRecord | null>;

  saveVarenykSatedPreview(
    actorTelegramUserId: bigint,
    input: {
      targetTelegramUserId: bigint | null;
      expectedActorRemortCount: number;
      expectedTargetRemortCount: number;
      previewToken: string;
      activeSince: Date;
      now: Date;
      expiresAt: Date;
    }
  ): Promise<VarenykSatedPreviewRepositoryResult>;

  isActorBlockedForTelegramUser(telegramUserId: bigint): Promise<boolean>;

  completePriestHeal(
    actorTelegramUserId: bigint,
    input: {
      targetTelegramUserId: bigint | null;
      expectedActorRemortCount: number;
      expectedTargetRemortCount: number;
      activeSince: Date;
      now: Date;
      healAmount: number;
      targetEffectiveHpMax: number;
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
      bonusAmount: number;
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
      retaliationToken: string | null;
      retaliationAvailableUntil: Date | null;
      statSnapshot: unknown;
    }
  ): Promise<RoguePickpocketRepositoryResult>;

  completeVarenykSated(
    actorTelegramUserId: bigint,
    input: {
      targetTelegramUserId: bigint | null;
      expectedActorRemortCount: number;
      expectedTargetRemortCount: number;
      activeSince: Date;
      now: Date;
      previewToken: string;
    }
  ): Promise<VarenykSatedRepositoryResult>;

  claimRogueRetaliation(
    targetTelegramUserId: bigint,
    input: { retaliationToken: string; now: Date }
  ): Promise<RogueRetaliationClaimResult>;

  recordRogueRetaliationDuel(
    retaliationToken: string,
    input: { duelInviteToken: string; now: Date }
  ): Promise<void>;
}
