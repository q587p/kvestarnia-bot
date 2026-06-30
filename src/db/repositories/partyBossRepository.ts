import type { CombatActorStats } from "../../domain/combat/combatState";
import type { CharacterStats } from "../../domain/characters/starterStats";
import type {
  PartyBossActionKey,
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
  | { state: "not-participant" | "stale" | "queued" | "duplicate" | "resolved" | "terminal"; session: PartyBossSessionRecord };

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
    input: PartyBossResolveInput
  ): Promise<PartyBossActionResult>;

  resolveTimedOutByToken(
    partyInviteToken: string,
    input: PartyBossResolveInput,
    mode: PartyBossTimeoutMode
  ): Promise<PartyBossActionResult>;

  findActiveByTelegramUserId(telegramUserId: bigint): Promise<PartyBossSessionRecord | null>;
  findByPartyInviteToken(partyInviteToken: string): Promise<PartyBossSessionRecord | null>;
}

export function buildPartyBossCombatStats(
  character: CharacterRecord & { remortCount?: number }
): CombatActorStats & { hpCurrent: number; manaCurrent: number } {
  const stats = parseStats(character.statsJson);

  return {
    level: character.level,
    hpMax: character.hpMax,
    manaMax: character.manaMax,
    hpCurrent: character.hpCurrent,
    manaCurrent: character.manaCurrent,
    raceId: character.raceId,
    classId: character.classId,
    ...stats,
    armor: Math.max(0, Math.floor(stats.strength / 3)),
    resist: Math.max(0, Math.floor(stats.intelligence / 3)),
    weaponDamage: 1 + Math.max(0, Math.floor(stats.strength / 4)),
    spellPower: 1 + Math.max(0, Math.floor(stats.intelligence / 4))
  };
}

function parseStats(value: unknown): CharacterStats {
  const maybe = value && typeof value === "object"
    ? value as Partial<Record<keyof CombatActorStats, unknown>>
    : {};

  return {
    strength: numberOrZero(maybe.strength),
    dexterity: numberOrZero(maybe.dexterity),
    intelligence: numberOrZero(maybe.intelligence),
    charisma: numberOrZero(maybe.charisma),
    luck: numberOrZero(maybe.luck)
  };
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
