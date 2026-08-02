import { randomBytes } from "node:crypto";
import type {
  GuildCreationConfirmRepositoryResult,
  GuildCreationPreviewRepositoryResult,
  GuildFunnelCounters,
  GuildHubRepositoryResult,
  GuildInviteCreateRepositoryResult,
  GuildInviteRespondRepositoryResult,
  GuildMemberMutationRepositoryResult,
  GuildPartyAudienceRecord,
  GuildRepository
} from "../db/repositories/guildRepository";
import {
  GUILD_CREATION_GOLD,
  normalizeGuildMemberLookup,
  validateGuildIdentity,
  type GuildIdentityValidation,
  type GuildRole
} from "../domain/guild";
import { systemClock, type Clock } from "../shared/time";
import type { AchievementService, AchievementUnlock } from "./achievementService";
import type { PartyCreateResult, PartySessionService } from "./partySessionService";

export const GUILD_CREATION_PREVIEW_TTL_MS = 13 * 60 * 1000;
export const GUILD_INVITE_TTL_MS = 23 * 60 * 60 * 1000;

export interface GuildServiceOptions {
  enabled: boolean;
  devHelpersEnabled?: boolean;
}

export type GuildCreationPreviewResult =
  | { state: "disabled" }
  | { state: "invalid"; reason: Extract<GuildIdentityValidation, { ok: false }>["reason"] }
  | GuildCreationPreviewRepositoryResult;

export type GuildCreationConfirmResult =
  GuildCreationConfirmRepositoryResult & { achievementUnlocks?: AchievementUnlock[] };

export type GuildInviteRespondResult =
  GuildInviteRespondRepositoryResult & { achievementUnlocks?: AchievementUnlock[] };

export type GuildMemberTargetResult =
  | { state: "disabled" | "no-character" | "not-member" | "not-found" | "ambiguous" }
  | {
      state: "ready";
      memberId: string;
      memberName: string;
      memberRole: GuildRole;
      expectedVersion: number;
    };

export type GuildPartyCreateResult =
  | { state: "disabled" | "no-character" | "not-member" }
  | { state: "party"; party: PartyCreateResult; audience: GuildPartyAudienceRecord };

export class GuildService {
  constructor(
    private readonly guilds: GuildRepository,
    private readonly parties: PartySessionService,
    private readonly options: GuildServiceOptions,
    private readonly clock: Clock = systemClock,
    private readonly achievements?: AchievementService
  ) {}

  isEnabled(): boolean {
    return this.options.enabled;
  }

  areDevHelpersEnabled(): boolean {
    return this.isEnabled() && this.options.devHelpersEnabled === true;
  }

  async getHubForTelegramUser(telegramUserId: bigint): Promise<GuildHubRepositoryResult | { state: "disabled" }> {
    if (!this.isEnabled()) {
      return { state: "disabled" };
    }
    return this.guilds.getHubForTelegramUser(telegramUserId, this.clock());
  }

  async previewCreationForTelegramUser(
    telegramUserId: bigint,
    input: { displayName: string; crest: string; description: string }
  ): Promise<GuildCreationPreviewResult> {
    if (!this.isEnabled()) {
      return { state: "disabled" };
    }
    const identity = validateGuildIdentity(input);
    if (!identity.ok) {
      return { state: "invalid", reason: identity.reason };
    }
    const now = this.clock();
    return this.guilds.createIntentForTelegramUser(telegramUserId, {
      token: createToken(),
      ...identity,
      goldCost: GUILD_CREATION_GOLD,
      now,
      expiresAt: new Date(now.getTime() + GUILD_CREATION_PREVIEW_TTL_MS)
    });
  }

  async confirmCreationForTelegramUser(
    telegramUserId: bigint,
    token: string
  ): Promise<GuildCreationConfirmResult> {
    if (!this.isEnabled()) {
      return { state: "not-found" };
    }
    const now = this.clock();
    const result = await this.guilds.confirmCreateForTelegramUser(telegramUserId, token, now);
    if (result.state !== "created") {
      return result;
    }
    const achievementUnlocks = await this.achievements?.trackEventSafely({
      type: "guild.created",
      characterId: result.characterId,
      occurredAt: now,
      sourceId: result.guild.id
    }) ?? [];
    return { ...result, achievementUnlocks };
  }

  async createInviteForTelegramUser(
    telegramUserId: bigint,
    targetName: string
  ): Promise<GuildInviteCreateRepositoryResult | { state: "disabled" }> {
    if (!this.isEnabled()) {
      return { state: "disabled" };
    }
    const now = this.clock();
    return this.guilds.createInviteForTelegramUser(telegramUserId, {
      token: createToken(),
      targetName: targetName.trim().normalize("NFKC"),
      now,
      expiresAt: new Date(now.getTime() + GUILD_INVITE_TTL_MS)
    });
  }

  async acceptInviteForTelegramUser(telegramUserId: bigint, token: string): Promise<GuildInviteRespondResult> {
    if (!this.isEnabled()) {
      return { state: "not-found" };
    }
    const now = this.clock();
    const result = await this.guilds.acceptInviteForTelegramUser(telegramUserId, token, now);
    if (result.state !== "accepted") {
      return result;
    }
    const achievementUnlocks = await this.achievements?.trackEventSafely({
      type: "guild.joined",
      characterId: result.characterId,
      occurredAt: now,
      sourceId: result.guild.id
    }) ?? [];
    return { ...result, achievementUnlocks };
  }

  declineInviteForTelegramUser(telegramUserId: bigint, token: string): Promise<GuildInviteRespondRepositoryResult> {
    return this.isEnabled()
      ? this.guilds.declineInviteForTelegramUser(telegramUserId, token, this.clock())
      : Promise.resolve({ state: "not-found" });
  }

  cancelInviteForTelegramUser(telegramUserId: bigint, token: string): Promise<GuildInviteRespondRepositoryResult> {
    return this.isEnabled()
      ? this.guilds.cancelInviteForTelegramUser(telegramUserId, token, this.clock())
      : Promise.resolve({ state: "not-found" });
  }

  async findMemberForAction(
    telegramUserId: bigint,
    memberName: string
  ): Promise<GuildMemberTargetResult> {
    if (!this.isEnabled()) {
      return { state: "disabled" };
    }
    const hub = await this.guilds.getHubForTelegramUser(telegramUserId, this.clock());
    if (hub.state !== "ready") {
      return { state: hub.state };
    }
    const normalized = normalizeGuildMemberLookup(memberName);
    const matches = hub.guild.members.filter((member) => normalizeGuildMemberLookup(member.name) === normalized);
    if (matches.length === 0) {
      return { state: "not-found" };
    }
    if (matches.length > 1) {
      return { state: "ambiguous" };
    }
    const member = matches[0]!;
    return {
      state: "ready",
      memberId: member.id,
      memberName: member.name,
      memberRole: member.role,
      expectedVersion: hub.guild.version
    };
  }

  setMemberRoleForTelegramUser(
    telegramUserId: bigint,
    memberId: string,
    role: Exclude<GuildRole, "leader">,
    expectedVersion: number
  ): Promise<GuildMemberMutationRepositoryResult> {
    return this.isEnabled()
      ? this.guilds.setMemberRoleForTelegramUser(telegramUserId, memberId, role, expectedVersion, this.clock())
      : Promise.resolve({ state: "not-found" });
  }

  transferLeadershipForTelegramUser(
    telegramUserId: bigint,
    memberId: string,
    expectedVersion: number
  ): Promise<GuildMemberMutationRepositoryResult> {
    return this.isEnabled()
      ? this.guilds.transferLeadershipForTelegramUser(telegramUserId, memberId, expectedVersion, this.clock())
      : Promise.resolve({ state: "not-found" });
  }

  kickMemberForTelegramUser(
    telegramUserId: bigint,
    memberId: string,
    expectedVersion: number
  ): Promise<GuildMemberMutationRepositoryResult> {
    return this.isEnabled()
      ? this.guilds.kickMemberForTelegramUser(telegramUserId, memberId, expectedVersion, this.clock())
      : Promise.resolve({ state: "not-found" });
  }

  leaveForTelegramUser(telegramUserId: bigint, expectedVersion: number): Promise<GuildMemberMutationRepositoryResult> {
    return this.isEnabled()
      ? this.guilds.leaveForTelegramUser(telegramUserId, expectedVersion, this.clock())
      : Promise.resolve({ state: "not-found" });
  }

  deleteForTelegramUser(telegramUserId: bigint, expectedVersion: number): Promise<GuildMemberMutationRepositoryResult> {
    return this.isEnabled()
      ? this.guilds.deleteForTelegramUser(telegramUserId, expectedVersion, this.clock())
      : Promise.resolve({ state: "not-found" });
  }

  async createPartyForTelegramUser(
    telegramUserId: bigint,
    input: { chatId?: bigint | null; messageId?: number | null } = {}
  ): Promise<GuildPartyCreateResult> {
    if (!this.isEnabled()) {
      return { state: "disabled" };
    }
    const audience = await this.guilds.getPartyAudienceForTelegramUser(telegramUserId);
    if (audience.state !== "ready") {
      return audience;
    }
    const party = await this.parties.createForTelegramUser(telegramUserId, input);
    if (party.state === "created") {
      await this.guilds.recordPartyCreated(
        audience.audience.guildId,
        telegramUserId,
        party.session.id,
        this.clock()
      );
    }
    return { state: "party", party, audience: audience.audience };
  }

  getFunnelCounters(): Promise<GuildFunnelCounters> {
    return this.guilds.getFunnelCounters();
  }

  async ensureCreationGoldForDev(telegramUserId: bigint): Promise<"disabled" | "updated" | "no-character"> {
    if (!this.areDevHelpersEnabled()) {
      return "disabled";
    }
    return this.guilds.ensureCreationGoldForTelegramUser(telegramUserId, GUILD_CREATION_GOLD);
  }
}

function createToken(): string {
  return randomBytes(12).toString("base64url");
}
