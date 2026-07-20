export const PARTY_RAID_CHAT_ENTRY_LIMIT = 13;
export const PARTY_RAID_CHAT_STORAGE_CAP = 130;
export const PARTY_RAID_CHAT_COMPOSER_TTL_MS = 13 * 60 * 1_000;
export const PARTY_RAID_CHAT_AUTHOR_COOLDOWN_MS = 3_000;
export const PARTY_RAID_CHAT_DUPLICATE_BODY_MS = 13_000;
export const PARTY_RAID_CHAT_LINEAGE_WINDOW_MS = 93_000;
export const PARTY_RAID_CHAT_LINEAGE_WINDOW_CAP = 42;
export const PARTY_RAID_CHAT_RETENTION_MS = 13 * 24 * 60 * 60 * 1_000;

export type PartyRaidChatEntryKind = "player" | "system";
export type PartyRaidChatLifecycle = "recruiting" | "active" | "terminal";
export type PartyRaidChatSurfaceMode =
  | "recruiting_embed"
  | "active_card"
  | "terminal_read_only"
  | "redacted";

export type PartyRaidChatSystemEventType =
  | "party.created"
  | "participant.joined"
  | "participant.left"
  | "participant.removed"
  | "leader.transferred"
  | "ward.placed"
  | "ward.supported"
  | "protocol.filed"
  | "protocol.signed"
  | "raid.started"
  | "raid.music.started"
  | "ability.taunt"
  | "ability.lament"
  | "ability.form-thirteen-b"
  | "ability.dangerous-couplet"
  | "raid.won"
  | "raid.lost"
  | "raid.cancelled"
  | "raid.expired";

export interface PartyRaidChatEntryRecord {
  id: number;
  revision: number;
  kind: PartyRaidChatEntryKind;
  eventType: PartyRaidChatSystemEventType | null;
  actorCharacterId: string | null;
  actorDisplayName: string | null;
  actorRemortCount: number | null;
  body: string | null;
  payload: Record<string, unknown> | null;
  occurredAt: Date;
}

export interface PartyRaidChatAuthorizedView {
  partySessionId: string;
  inviteToken: string;
  chatRevision: number;
  lifecycle: PartyRaidChatLifecycle;
  writable: boolean;
  retentionUntil: Date | null;
  viewerCharacterId: string;
  entries: PartyRaidChatEntryRecord[];
}

export type PartyRaidChatBeginComposeResult =
  | { state: "not-found" | "not-authorized" | "not-writable" }
  | {
      state: "created";
      intentId: string;
      version: number;
      inviteToken: string;
      expiresAt: Date;
    };

export type PartyRaidChatBindComposeResult =
  | { state: "bound"; intentId: string; version: number; expiresAt: Date }
  | { state: "stale" };

export interface PartyRaidChatBoundIntentRecord {
  intentId: string;
  partySessionId: string;
  inviteToken: string;
  characterId: string;
  remortCount: number;
  version: number;
  expiresAt: Date;
}

export type PartyRaidChatAcceptResult =
  | {
      state: "accepted";
      inviteToken: string;
      revision: number;
      notification: {
        authorDisplayName: string;
        body: string;
        recipientTelegramUserIds: bigint[];
      };
    }
  | { state: "duplicate-body"; inviteToken: string }
  | { state: "already-consumed" }
  | { state: "not-found" | "not-authorized" | "not-writable" | "expired" }
  | { state: "rate-limited"; inviteToken: string; availableAt: Date; now: Date };

export interface PartyRaidChatDeliveryRecord {
  id: string;
  version: number;
  participantId: string;
  partySessionId: string;
  inviteToken: string;
  participantCharacterId: string;
  telegramUserId: bigint;
  surfaceMode: PartyRaidChatSurfaceMode;
  chatId: bigint | null;
  messageId: number | null;
  desiredRevision: number;
  renderedRevision: number;
  redactionRequired: boolean;
  attemptCount: number;
}

export interface PartyRaidChatRepository {
  beginCompose(
    telegramUserId: bigint,
    inviteToken: string,
    privateChatId: bigint,
    now: Date
  ): Promise<PartyRaidChatBeginComposeResult>;

  bindComposePrompt(
    intentId: string,
    expectedVersion: number,
    promptMessageId: number,
    now: Date
  ): Promise<PartyRaidChatBindComposeResult>;

  findBoundIntent(
    telegramUserId: bigint,
    privateChatId: bigint,
    promptMessageId: number,
    now: Date
  ): Promise<PartyRaidChatBoundIntentRecord | null>;

  cancelCompose(telegramUserId: bigint, now: Date): Promise<boolean>;
  cancelDisabledComposeIntents(now: Date): Promise<number>;

  acceptReply(input: {
    telegramUserId: bigint;
    privateChatId: bigint;
    promptMessageId: number;
    sourceMessageId: number;
    normalizedBody: string;
    now: Date;
  }): Promise<PartyRaidChatAcceptResult>;

  getAuthorizedView(
    telegramUserId: bigint,
    inviteToken: string,
    now: Date
  ): Promise<PartyRaidChatAuthorizedView | null>;

  requestRecruitingRefresh(telegramUserId: bigint, inviteToken: string, now: Date): Promise<boolean>;
  listDueDeliveries(now: Date, limit?: number): Promise<PartyRaidChatDeliveryRecord[]>;
  isDeliveryClaimCurrent(deliveryId: string, version: number): Promise<boolean>;
  recordDeliveryReference(
    deliveryId: string,
    chatId: bigint,
    messageId: number,
    expected: { version: number; chatId: bigint | null; messageId: number | null },
    now: Date
  ): Promise<boolean>;
  markDeliveryRendered(deliveryId: string, revision: number, expectedVersion: number, now: Date): Promise<boolean>;
  markDeliveryFailure(
    deliveryId: string,
    nextAttemptAt: Date,
    deliveryClass: string,
    expectedVersion: number,
    now: Date
  ): Promise<void>;
  markDeliveryRedacted(
    deliveryId: string,
    deliveryClass: string,
    expected: { version: number; desiredRevision: number; chatId: bigint | null; messageId: number | null },
    now: Date
  ): Promise<void>;
  markDisabledReferencesForRedaction(now: Date, limit?: number): Promise<number>;
  cleanupExpired(now: Date, limit?: number): Promise<number>;

  devFillForTelegramUser(telegramUserId: bigint, count: number, now: Date): Promise<number>;
  devClearForTelegramUser(telegramUserId: bigint, now: Date): Promise<boolean>;
  devExpireForTelegramUser(
    telegramUserId: bigint,
    target: "composer" | "retention",
    now: Date
  ): Promise<boolean>;
}
