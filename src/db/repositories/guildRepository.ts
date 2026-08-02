import type { GuildRole } from "../../domain/guild";

export interface GuildMemberRecord {
  id: string;
  name: string;
  role: GuildRole;
}

export interface GuildInviteRecord {
  token: string;
  guildId: string;
  guildName: string;
  guildCrest: string;
  targetName: string;
  status: "pending" | "accepted" | "declined" | "cancelled" | "expired";
  expiresAt: Date;
}

export interface GuildViewRecord {
  id: string;
  displayName: string;
  normalizedName: string;
  crest: string;
  description: string;
  version: number;
  viewerRole: GuildRole;
  members: GuildMemberRecord[];
  outgoingInvites: GuildInviteRecord[];
}

export type GuildHubRepositoryResult =
  | { state: "no-character" }
  | { state: "not-member"; incomingInvites: GuildInviteRecord[] }
  | { state: "ready"; guild: GuildViewRecord; incomingInvites: GuildInviteRecord[] };

export interface GuildCreationIntentRecord {
  token: string;
  displayName: string;
  normalizedName: string;
  crest: string;
  description: string;
  goldCost: number;
  availableGold: number;
  expiresAt: Date;
}

export type GuildCreationPreviewRepositoryResult =
  | { state: "no-character" }
  | { state: "already-member" }
  | { state: "ready"; intent: GuildCreationIntentRecord };

export type GuildCreationConfirmRepositoryResult =
  | { state: "no-character" | "not-found" | "expired" | "stale-life" | "name-taken" | "already-member" }
  | { state: "insufficient-gold"; required: number; available: number }
  | { state: "created" | "replayed"; guild: GuildViewRecord; characterId: string };

export type GuildInviteCreateRepositoryResult =
  | { state: "no-character" | "not-member" | "forbidden" | "target-not-found" | "target-ambiguous" | "self" | "target-already-member" | "guild-full" }
  | { state: "rate-limited"; availableAt: Date; now: Date }
  | {
      state: "created" | "replayed";
      invite: GuildInviteRecord;
      deliveryTelegramUserId: bigint;
    };

export type GuildInviteRespondRepositoryResult =
  | { state: "no-character" | "not-found" | "expired" | "already-in-guild" | "guild-full" }
  | { state: "declined" | "cancelled" }
  | { state: "accepted" | "replayed"; guild: GuildViewRecord; characterId: string };

export type GuildMemberMutationRepositoryResult =
  | { state: "no-character" | "not-member" | "not-found" | "forbidden" | "stale" | "invalid-target" }
  | { state: "updated"; guild: GuildViewRecord }
  | { state: "left" | "deleted"; guildName: string; successorName?: string };

export interface GuildPartyAudienceRecord {
  guildId: string;
  guildName: string;
  guildCrest: string;
  recipients: Array<{ telegramUserId: bigint; name: string }>;
}

export type GuildPartyAudienceRepositoryResult =
  | { state: "no-character" | "not-member" }
  | { state: "ready"; audience: GuildPartyAudienceRecord };

export interface GuildFunnelCounters {
  guildsCreated: number;
  invitesCreated: number;
  invitesAccepted: number;
  invitesDeclined: number;
  invitesCancelled: number;
  memberLeaves: number;
  memberKicks: number;
  leadershipTransfers: number;
  partiesCreated: number;
}

export interface GuildRepository {
  createIntentForTelegramUser(telegramUserId: bigint, input: {
    token: string;
    displayName: string;
    normalizedName: string;
    crest: string;
    description: string;
    goldCost: number;
    now: Date;
    expiresAt: Date;
  }): Promise<GuildCreationPreviewRepositoryResult>;
  confirmCreateForTelegramUser(telegramUserId: bigint, token: string, now: Date): Promise<GuildCreationConfirmRepositoryResult>;
  getHubForTelegramUser(telegramUserId: bigint, now: Date): Promise<GuildHubRepositoryResult>;
  createInviteForTelegramUser(telegramUserId: bigint, input: {
    token: string;
    targetName: string;
    now: Date;
    expiresAt: Date;
  }): Promise<GuildInviteCreateRepositoryResult>;
  acceptInviteForTelegramUser(telegramUserId: bigint, token: string, now: Date): Promise<GuildInviteRespondRepositoryResult>;
  declineInviteForTelegramUser(telegramUserId: bigint, token: string, now: Date): Promise<GuildInviteRespondRepositoryResult>;
  cancelInviteForTelegramUser(telegramUserId: bigint, token: string, now: Date): Promise<GuildInviteRespondRepositoryResult>;
  setMemberRoleForTelegramUser(telegramUserId: bigint, memberId: string, role: Exclude<GuildRole, "leader">, expectedVersion: number, now: Date): Promise<GuildMemberMutationRepositoryResult>;
  transferLeadershipForTelegramUser(telegramUserId: bigint, memberId: string, expectedVersion: number, now: Date): Promise<GuildMemberMutationRepositoryResult>;
  kickMemberForTelegramUser(telegramUserId: bigint, memberId: string, expectedVersion: number, now: Date): Promise<GuildMemberMutationRepositoryResult>;
  leaveForTelegramUser(telegramUserId: bigint, expectedVersion: number, now: Date): Promise<GuildMemberMutationRepositoryResult>;
  deleteForTelegramUser(telegramUserId: bigint, expectedVersion: number, now: Date): Promise<GuildMemberMutationRepositoryResult>;
  getPartyAudienceForTelegramUser(telegramUserId: bigint): Promise<GuildPartyAudienceRepositoryResult>;
  recordPartyCreated(guildId: string, actorTelegramUserId: bigint, partySessionId: string, now: Date): Promise<void>;
  getFunnelCounters(): Promise<GuildFunnelCounters>;
  ensureCreationGoldForTelegramUser(telegramUserId: bigint, minimumGold: number): Promise<"updated" | "no-character">;
}
