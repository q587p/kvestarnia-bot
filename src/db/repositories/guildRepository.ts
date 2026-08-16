import type { GuildCrestKind, GuildRole } from "../../domain/guild";

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
  crestKind?: GuildCrestKind;
  hasCustomCrest?: boolean;
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
  | { state: "ready"; guildId: string; version: number; viewerRole: GuildRole; members: GuildMemberRecord[] };

export interface GuildCreationIntentRecord {
  token: string;
  displayName: string;
  normalizedName: string;
  crest: string;
  crestKind?: GuildCrestKind;
  hasCustomCrest?: boolean;
  description: string;
  goldCost: number;
  availableGold: number;
  expiresAt: Date;
}

export type GuildCreationPreviewRepositoryResult =
  | { state: "no-character" | "already-member" | "ineligible" | "upload-unavailable" }
  | { state: "founder-cooldown"; availableAt: Date; now: Date }
  | { state: "ready"; intent: GuildCreationIntentRecord };

export type GuildCreationConfirmRepositoryResult =
  | { state: "no-character" | "not-found" | "expired" | "stale-life" | "name-taken" | "crest-taken" | "already-member" | "ineligible" }
  | { state: "founder-cooldown"; availableAt: Date; now: Date }
  | { state: "insufficient-gold"; required: number; available: number }
  | { state: "created" | "replayed"; guild: GuildViewRecord; characterId: string };

export type GuildInviteOptInRepositoryResult =
  | { state: "no-character" }
  | { state: "not-found" }
  | { state: "already-member" }
  | { state: "ready"; token: string; expiresAt: Date };

export type GuildNestViewerState = "not-member" | "forming" | "active";

export type GuildNestRepositoryResult =
  | { state: "no-character" }
  | { state: "wrong-location" }
  | { state: "ready"; viewerState: GuildNestViewerState; hasIncomingInvites: boolean };

export interface GuildPublicDirectoryEntry {
  id: string;
  displayName: string;
  crest: string;
  hasCustomCrest?: boolean;
  memberCount: number;
}

export type GuildPublicDirectoryRepositoryResult =
  | { state: "no-character" }
  | { state: "wrong-location" }
  | {
      state: "ready";
      guilds: GuildPublicDirectoryEntry[];
      page: number;
      hasPreviousPage: boolean;
      hasNextPage: boolean;
    };

export type GuildPublicProfileRepositoryResult =
  | { state: "no-character" }
  | { state: "wrong-location" }
  | { state: "unavailable" }
  | {
      state: "ready";
      guild: GuildPublicDirectoryEntry & { description: string };
    };

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
  | { state: "cancelled" }
  | {
      state: "declined";
      transitioned: boolean;
      notification?: GuildInviteResponseNotification;
    }
  | {
      state: "accepted" | "replayed";
      guild: GuildViewRecord;
      characterId: string;
      activatedFounderCharacterId: string | null;
      notification?: GuildInviteResponseNotification;
    };

export interface GuildInviteResponseNotification {
  inviterTelegramUserId: bigint;
  targetName: string;
  guildName: string;
  guildCrest: string;
}

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
        | "guild-not-sole"
        | "crest-taken";
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

export interface GuildCrestMediaInput {
  fileId: string;
  fileUniqueId: string;
  width: number;
  height: number;
  fileSize: number | null;
}

export type GuildCrestMediaRecord = GuildCrestMediaInput;

export type GuildCrestPickerRepositoryResult =
  | { state: "no-character" | "already-member" | "ineligible" | "not-member" | "forbidden" | "stale" }
  | { state: "founder-cooldown"; availableAt: Date; now: Date }
  | {
      state: "ready";
      availableCrests: string[];
      currentCrest: string | null;
      currentHasCustomCrest: boolean;
      requestedCrestAvailable?: boolean;
      guildVersion: number | null;
    };

export type GuildCrestUploadPurpose = "creation" | "profile";

export type GuildCrestUploadDraftRepositoryResult =
  | { state: "no-character" | "already-member" | "ineligible" | "not-member" | "forbidden" | "stale" | "not-found" | "expired" | "invalid-media" }
  | { state: "founder-cooldown"; availableAt: Date; now: Date }
  | {
      state: "ready" | "replayed";
      token: string;
      purpose: GuildCrestUploadPurpose;
      intentToken?: string;
      expectedGuildVersion?: number;
    };

export type GuildCrestMediaRepositoryResult =
  | { state: "no-character" | "not-found" | "wrong-location" | "unavailable" | "forbidden" }
  | { state: "ready"; media: GuildCrestMediaRecord };

export interface GuildRepository {
  createIntentForTelegramUser(telegramUserId: bigint, input: {
    token: string;
    displayName: string;
    normalizedName: string;
    crest: string;
    crestKind?: GuildCrestKind;
    crestMedia?: GuildCrestMediaInput;
    description: string;
    goldCost: number;
    now: Date;
    expiresAt: Date;
  }): Promise<GuildCreationPreviewRepositoryResult>;
  createCustomIntentForTelegramUser(telegramUserId: bigint, input: {
    token: string;
    uploadToken: string;
    displayName: string;
    normalizedName: string;
    description: string;
    goldCost: number;
    now: Date;
    expiresAt: Date;
  }): Promise<GuildCreationPreviewRepositoryResult>;
  confirmCreateForTelegramUser(telegramUserId: bigint, token: string, now: Date): Promise<GuildCreationConfirmRepositoryResult>;
  getHubForTelegramUser(telegramUserId: bigint, now: Date, page?: number): Promise<GuildHubRepositoryResult>;
  getMemberTargetsForTelegramUser(telegramUserId: bigint, now: Date): Promise<GuildMemberTargetsRepositoryResult>;
  getNestForTelegramUser(telegramUserId: bigint, expectedLocationId: string, now: Date): Promise<GuildNestRepositoryResult>;
  getPublicDirectoryForTelegramUser(telegramUserId: bigint, expectedLocationId: string, now: Date, page?: number): Promise<GuildPublicDirectoryRepositoryResult>;
  getPublicGuildForTelegramUser(telegramUserId: bigint, guildId: string, expectedLocationId: string, now: Date): Promise<GuildPublicProfileRepositoryResult>;
  createInviteOptInForTelegramUser(telegramUserId: bigint, input: { token: string; now: Date; expiresAt: Date }): Promise<GuildInviteOptInRepositoryResult>;
  getInviteOptInForTelegramUser(telegramUserId: bigint, now: Date): Promise<GuildInviteOptInRepositoryResult>;
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
  updateProfilePreservingCustomCrestForTelegramUser(telegramUserId: bigint, input: { description: string; expectedVersion: number; now: Date }): Promise<GuildMemberMutationRepositoryResult>;
  updateCustomProfileForTelegramUser(telegramUserId: bigint, input: { uploadToken: string; description: string; now: Date }): Promise<GuildMemberMutationRepositoryResult>;
  getCrestPickerForTelegramUser(
    telegramUserId: bigint,
    purpose: GuildCrestUploadPurpose,
    now: Date,
    requestedCrest?: string
  ): Promise<GuildCrestPickerRepositoryResult>;
  beginCrestUploadForTelegramUser(telegramUserId: bigint, input: {
    token: string;
    purpose: GuildCrestUploadPurpose;
    expectedGuildVersion?: number;
    now: Date;
    expiresAt: Date;
  }): Promise<GuildCrestUploadDraftRepositoryResult>;
  validateCrestUploadDraftForTelegramUser(telegramUserId: bigint, input: {
    token: string;
    purpose: GuildCrestUploadPurpose;
    now: Date;
  }): Promise<GuildCrestUploadDraftRepositoryResult>;
  storeCrestUploadForTelegramUser(telegramUserId: bigint, input: {
    token: string;
    media: GuildCrestMediaInput;
    now: Date;
  }): Promise<GuildCrestUploadDraftRepositoryResult>;
  getCreationCrestMediaForTelegramUser(telegramUserId: bigint, token: string, now: Date): Promise<GuildCrestMediaRepositoryResult>;
  getGuildCrestMediaForTelegramUser(telegramUserId: bigint, input: {
    guildId: string;
    publicAccess: boolean;
    expectedLocationId?: string;
    now: Date;
  }): Promise<GuildCrestMediaRepositoryResult>;
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
