import { items } from "../../content";
import { summarizeCharacter } from "../../domain/characters/characterSummary";
import type { CombatActorStats } from "../../domain/combat/combatState";
import type { CombatGearAbilityInput } from "../../domain/combat/combatEngine";
import type {
  PartyBossActionKey,
  PartyBossCombatItemInput,
  PartyBossResult,
  PartyBossState
} from "../../domain/partyBoss/partyBoss";
import type { CharacterRecord } from "./characterRepository";

export type PartyBossSessionStatus = "active" | "won" | "lost" | "cancelled";

export interface PartyBossParticipantSnapshot extends CharacterRecord {
  telegramUserId: bigint;
  remortCount: number;
}

export interface PartyBossSessionRecord {
  id: string;
  partySessionId: string;
  partyInviteToken: string;
  leaderCharacterId: string;
  status: PartyBossSessionStatus;
  turn: number;
  version: number;
  rulesVersion: string;
  bossKey: string;
  state: PartyBossState;
  result: PartyBossResult | null;
  turnExpiresAt: Date;
  completedAt: Date | null;
  participants: PartyBossParticipantSnapshot[];
}

export type PartyBossAchievementEventRecord =
  | {
      type: "barrel.raid.claimed" | "barrel.raid.lost" | "barrel.raid.bandage-used";
      characterId: string;
      sourceId: string;
      occurredAt: Date;
    }
  | {
      type: "mantok.gear-action.used";
      characterId: string;
      sourceId: string;
      occurredAt: Date;
    }
  | {
      type: "item.used";
      characterId: string;
      itemId: string;
      sourceId: string;
      occurredAt: Date;
    };

export type PartyBossStartResult =
  | { state: "disabled" }
  | { state: "no-character" }
  | { state: "not-found" }
  | { state: "not-leader"; session?: PartyBossSessionRecord }
  | {
      state: "not-recruiting" | "expired" | "too-small" | "blocked" | "ineligible";
      blockerName?: string;
      session?: PartyBossSessionRecord;
    }
  | { state: "started" | "already-active" | "terminal"; session: PartyBossSessionRecord };

export type PartyBossActionResult =
  | { state: "disabled" }
  | { state: "no-character" }
  | { state: "not-found" }
  | {
      state: "item-unavailable";
      reason: "not-usable" | "not-owned" | "reserved" | "full-hp" | "item-on-cooldown" | "item-limit-reached";
      session?: PartyBossSessionRecord;
    }
  | {
      state: "not-participant" | "stale" | "queued" | "updated" | "duplicate" | "resolved" | "terminal";
      session: PartyBossSessionRecord;
      achievementEvents?: PartyBossAchievementEventRecord[];
    };

export type PartyBossDevWinResult =
  | { state: "no-active" }
  | { state: "not-big"; session: PartyBossSessionRecord }
  | { state: "stale"; session: PartyBossSessionRecord }
  | { state: "primed"; session: PartyBossSessionRecord };

export interface PartyBossStartInput {
  partyInviteToken: string;
  now: Date;
  turnExpiresAt: Date;
  allowExpiredRecruiting?: boolean;
}

export interface PartyBossResolveInput {
  now: Date;
  nextTurnExpiresAt: Date;
}

export type PartyBossTimeoutMode = "due" | "force-dev";

export interface PartyBossRepository {
  startFromRecruitingPartyForTelegramUser(
    telegramUserId: bigint,
    input: PartyBossStartInput
  ): Promise<PartyBossStartResult>;

  submitActionForTelegramUser(
    telegramUserId: bigint,
    partyInviteToken: string,
    turn: number,
    action: PartyBossActionKey,
    input: PartyBossResolveInput,
    options?: { gearAbility?: CombatGearAbilityInput }
  ): Promise<PartyBossActionResult>;

  submitItemForTelegramUser(
    telegramUserId: bigint,
    partyInviteToken: string,
    turn: number,
    item: PartyBossCombatItemInput,
    input: PartyBossResolveInput
  ): Promise<PartyBossActionResult>;

  resolveTimedOutByToken(
    partyInviteToken: string,
    input: PartyBossResolveInput,
    mode: PartyBossTimeoutMode
  ): Promise<PartyBossActionResult>;

  findActiveByTelegramUserId(telegramUserId: bigint): Promise<PartyBossSessionRecord | null>;
  findByPartyInviteToken(partyInviteToken: string): Promise<PartyBossSessionRecord | null>;
  listDueTimedOutSessions(now: Date, options?: { limit?: number }): Promise<PartyBossSessionRecord[]>;
  forceBigBarrelWinForTelegramUser(telegramUserId: bigint, now: Date): Promise<PartyBossDevWinResult>;
}

export function buildPartyBossCombatStats(
  character: CharacterRecord & {
    remortCount?: number;
    equipment?: readonly { itemId: string }[];
  }
): CombatActorStats & { hpCurrent: number; manaCurrent: number } {
  const equippedItems = (character.equipment ?? []).flatMap((row) => {
    const item = items.find((candidate) => candidate.id === row.itemId);
    return item ? [item] : [];
  });
  const summary = summarizeCharacter(character, {
    equippedItems,
    ...(typeof character.remortCount === "number" ? { remortCount: character.remortCount } : {})
  });
  const stats = summary.stats;

  return {
    level: summary.level,
    hpMax: summary.hpMax,
    manaMax: summary.manaMax,
    hpCurrent: summary.hpCurrent,
    manaCurrent: summary.manaCurrent,
    raceId: summary.raceId,
    classId: summary.classId,
    ...stats,
    armor: Math.max(0, Math.floor(stats.strength / 3)),
    resist: Math.max(0, Math.floor(stats.intelligence / 3)),
    weaponDamage: 1 + Math.max(0, Math.floor(stats.strength / 4)),
    spellPower: 1 + Math.max(0, Math.floor(stats.intelligence / 4))
  };
}

