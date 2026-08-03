import type { GuildRole } from "../../domain/guild";

export type GuildStatus = "forming" | "active";

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
  canCancel: boolean;
  status: "pending" | "accepted" | "declined" | "cancelled" | "expired";
  expiresAt: Date;
}

export interface GuildViewRecord {
  id: string;
  displayName: string;
  normalizedName: string;
  crest: string;
  description: string;
  status: GuildStatus;
  charterExpiresAt: Date;
  version: number;
  viewerRole: GuildRole;
  memberCount: number;
  members: GuildMemberRecord[];
  outgoingInvites: GuildInviteRecord[];
  page: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  leadershipNomineeName: string | null;
  viewerIsLeadershipNominee: boolean;
}

export type GuildHubRepositoryResult =
  | { state: "no-character" }
  | { state: "not-member"; incomingInvites: GuildInviteRecord[]; page: number; hasPreviousPage: boolean; hasNextPage: boolean }
  | { state: "ready"; guild: GuildViewRecord; incomingInvites: GuildInviteRecord[] };

export type GuildMemberTargetsRepositoryResult =
  | { state: "no-character" | "not-member" }
  | { state: "ready"; guildId: string; version: number; members: GuildMemberRecord[] };

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
  | { state: "no-character" | "already-member" | "ineligible" }
  | { state: "founder-cooldown"; availableAt: Date; now: Date }
  | { state: "ready"; intent: GuildCreationIntentRecord };

export type GuildCreationConfirmRepositoryResult =
  | { state: "no-character" | "not-found" | "expired" | "stale-life" | "name-taken" | "already-member" | "ineligible" }
  | { state: "founder-cooldown"; availableAt: Date; now: Date }
  | { state: "insufficient-gold"; required: number; available: number }
  | { state: "created" | "replayed"; guild: GuildViewRecord; characterId: string };

export type GuildInviteOptInRepositoryResult =
  | { state: "no-character" }
  | { state: "ready"; token: string; expiresAt: Date };

export type GuildInviteCreateRepositoryResult =
  | { state: "no-character" | "not-member" | "forbidden" | "target-unavailable" | "guild-full" }
  | { state: "too-many-incoming" | "decline-cooldown"; availableAt: Date; now: Date }
  | { state: "rate-limited"; availableAt: Date; now: Date }
  | {
      state: "created" | "replayed";
      invite: GuildInviteRecord;
      deliveryTelegramUserId: bigint;
    };

export type GuildInviteRespondRepositoryResult =
  | { state: "no-character" | "not-found" | "expired" | "already-in-guild" | "guild-full" }
  | { state: "declined" | "cancelled" }
  | {
      state: "accepted" | "replayed";
      guild: GuildViewRecord;
      characterId: string;
      activatedFounderCharacterId: string | null;
    };

export type GuildMemberMutationRepositoryResult =
  | {
      state:
        | "no-character"
        | "not-member"
        | "not-found"
        | "forbidden"
        | "stale"
        | "invalid-target"
        | "officer-cap"
        | "leader-needs-successor"
        | "guild-not-sole";
    }
  | { state: "updated" | "transfer-offered"; guild: GuildViewRecord }
  | { state: "left" | "deleted"; guildName: string };

export interface GuildPartyCandidateRecord {
  memberId: string;
  name: string;
}

export type GuildPartyPickerRepositoryResult =
  | { state: "no-character" | "not-member" | "not-party-leader" | "party-ineligible" | "stale" }
  | {
      state: "ready";
      guildId: string;
      guildVersion: number;
      partySessionId: string;
      inviteToken: string;
      candidates: GuildPartyCandidateRecord[];
      page: number;
      hasPreviousPage: boolean;
      hasNextPage: boolean;
    };

export type GuildPartyRecipientRepositoryResult =
  | { state: "stale" | "not-found" }
  | {
      state: "ready";
      guildId: string;
      guildVersion: number;
      partySessionId: string;
      inviteToken: string;
      recipient: { telegramUserId: bigint; name: string };
      targetUserId: string;
    };

export interface GuildFunnelCounters {
  guildsCreated: number;
  invitesCreated: number;
  invitesAccepted: number;
  invitesDeclined: number;
  invitesCancelled: number;
  memberLeaves: number;
  memberKicks: number;
  leadershipTransfers: number;
  partyInvites: number;
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
  getHubForTelegramUser(telegramUserId: bigint, now: Date, page?: number): Promise<GuildHubRepositoryResult>;
  getMemberTargetsForTelegramUser(telegramUserId: bigint, now: Date): Promise<GuildMemberTargetsRepositoryResult>;
  createInviteOptInForTelegramUser(telegramUserId: bigint, input: { token: string; now: Date; expiresAt: Date }): Promise<GuildInviteOptInRepositoryResult>;
  createInviteForTelegramUser(telegramUserId: bigint, input: {
    token: string;
    targetToken: string;
    now: Date;
    expiresAt: Date;
  }): Promise<GuildInviteCreateRepositoryResult>;
  acceptInviteForTelegramUser(telegramUserId: bigint, token: string, now: Date): Promise<GuildInviteRespondRepositoryResult>;
  declineInviteForTelegramUser(telegramUserId: bigint, token: string, now: Date): Promise<GuildInviteRespondRepositoryResult>;
  cancelInviteForTelegramUser(telegramUserId: bigint, token: string, now: Date): Promise<GuildInviteRespondRepositoryResult>;
  updateProfileForTelegramUser(telegramUserId: bigint, input: { crest: string; description: string; expectedVersion: number; now: Date }): Promise<GuildMemberMutationRepositoryResult>;
  setMemberRoleForTelegramUser(telegramUserId: bigint, memberId: string, role: Exclude<GuildRole, "leader">, expectedVersion: number, now: Date): Promise<GuildMemberMutationRepositoryResult>;
  offerLeadershipForTelegramUser(telegramUserId: bigint, memberId: string, expectedVersion: number, now: Date): Promise<GuildMemberMutationRepositoryResult>;
  acceptLeadershipForTelegramUser(telegramUserId: bigint, expectedVersion: number, now: Date): Promise<GuildMemberMutationRepositoryResult>;
  kickMemberForTelegramUser(telegramUserId: bigint, memberId: string, expectedVersion: number, now: Date): Promise<GuildMemberMutationRepositoryResult>;
  leaveForTelegramUser(telegramUserId: bigint, expectedVersion: number, now: Date): Promise<GuildMemberMutationRepositoryResult>;
  deleteForTelegramUser(telegramUserId: bigint, expectedVersion: number, now: Date): Promise<GuildMemberMutationRepositoryResult>;
  getPartyPickerForTelegramUser(telegramUserId: bigint, partySessionId: string, page: number, now: Date): Promise<GuildPartyPickerRepositoryResult>;
  resolvePartyRecipientForTelegramUser(telegramUserId: bigint, input: { partySessionId: string; memberId: string; guildVersion: number; now: Date }): Promise<GuildPartyRecipientRepositoryResult>;
  recordPartyInvite(guildId: string, actorTelegramUserId: bigint, partySessionId: string, targetUserId: string, now: Date): Promise<void>;
  getFunnelCounters(): Promise<GuildFunnelCounters>;
  ensureCreationGoldForTelegramUser(telegramUserId: bigint, minimumGold: number): Promise<"updated" | "no-character">;
}
