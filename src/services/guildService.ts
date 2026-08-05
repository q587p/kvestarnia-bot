import { randomBytes } from "node:crypto";
import type {
  GuildCreationConfirmRepositoryResult,
  GuildCreationPreviewRepositoryResult,
  GuildFunnelCounters,
  GuildHubRepositoryResult,
  GuildInviteCreateRepositoryResult,
  GuildInviteOptInRepositoryResult,
  GuildInviteRespondRepositoryResult,
  GuildMemberRecord,
  GuildMemberMutationRepositoryResult,
  GuildMemberTargetsRepositoryResult,
  GuildPartyPickerRepositoryResult,
  GuildPartyRecipientRepositoryResult,
  GuildNestRepositoryResult,
  GuildPublicDirectoryRepositoryResult,
  GuildPublicProfileRepositoryResult,
  GuildRepository
} from "../db/repositories/guildRepository";
import {
  GUILD_CREATION_GOLD,
  normalizeGuildMemberLookup,
  validateGuildProfile,
  validateGuildIdentity,
  type GuildIdentityValidation,
  type GuildRole
} from "../domain/guild";
import { systemClock, type Clock } from "../shared/time";
import type { AchievementService, AchievementUnlock } from "./achievementService";
import type { PartySessionService } from "./partySessionService";
import { PRESENCE_LOCATION_KORCHMA_DEEP } from "./presenceService";

export const GUILD_CREATION_PREVIEW_TTL_MS = 13 * 60 * 1000;
export const GUILD_INVITE_TTL_MS = 93 * 60 * 60 * 1000;
export const GUILD_INVITE_OPT_IN_TTL_MS = 93 * 60 * 60 * 1000;

export interface GuildServiceOptions {
  enabled: boolean;
  devHelpersEnabled?: boolean;
}

export type GuildCreationPreviewResult =
  | { state: "disabled" }
  | { state: "invalid"; reason: Extract<GuildIdentityValidation, { ok: false }>["reason"] }
  | GuildCreationPreviewRepositoryResult;

export type GuildCreationConfirmResult = GuildCreationConfirmRepositoryResult;

export type GuildInviteRespondResult =
  GuildInviteRespondRepositoryResult & { achievementUnlocks?: AchievementUnlock[] };

export type GuildMemberTargetResult =
  | { state: "disabled" | "no-character" | "not-member" | "not-found" | "stale" }
  | {
      state: "ambiguous";
      candidates: GuildMemberRecord[];
      expectedVersion: number;
    }
  | {
      state: "ready";
      memberId: string;
      memberName: string;
      memberRole: GuildRole;
      expectedVersion: number;
    };

export type GuildProfileUpdateResult =
  | { state: "disabled" }
  | { state: "invalid"; reason: "crest" | "description-length" | "description-unsafe" }
  | GuildMemberMutationRepositoryResult;

export type GuildMemberManagementResult =
  | { state: "disabled" | "no-character" | "not-member" }
  | Extract<GuildMemberTargetsRepositoryResult, { state: "ready" }>;

export type GuildPartyPickerResult =
  | { state: "disabled" | "no-party" }
  | GuildPartyPickerRepositoryResult;

export type GuildPartyRecipientResult =
  | { state: "disabled" }
  | GuildPartyRecipientRepositoryResult;

export type GuildPublicReadResult<T> = { state: "disabled" } | T;

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

  getHubForTelegramUser(telegramUserId: bigint, page = 0): Promise<GuildHubRepositoryResult> {
    return this.guilds.getHubForTelegramUser(telegramUserId, this.clock(), page);
  }

  getNestForTelegramUser(telegramUserId: bigint): Promise<GuildPublicReadResult<GuildNestRepositoryResult>> {
    return this.isEnabled()
      ? this.guilds.getNestForTelegramUser(telegramUserId, PRESENCE_LOCATION_KORCHMA_DEEP, this.clock())
      : Promise.resolve({ state: "disabled" });
  }

  getPublicDirectoryForTelegramUser(
    telegramUserId: bigint,
    page = 0
  ): Promise<GuildPublicReadResult<GuildPublicDirectoryRepositoryResult>> {
    return this.isEnabled()
      ? this.guilds.getPublicDirectoryForTelegramUser(
          telegramUserId,
          PRESENCE_LOCATION_KORCHMA_DEEP,
          this.clock(),
          page
        )
      : Promise.resolve({ state: "disabled" });
  }

  getPublicGuildForTelegramUser(
    telegramUserId: bigint,
    guildId: string
  ): Promise<GuildPublicReadResult<GuildPublicProfileRepositoryResult>> {
    return this.isEnabled()
      ? this.guilds.getPublicGuildForTelegramUser(
          telegramUserId,
          guildId,
          PRESENCE_LOCATION_KORCHMA_DEEP,
          this.clock()
        )
      : Promise.resolve({ state: "disabled" });
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

  confirmCreationForTelegramUser(
    telegramUserId: bigint,
    token: string
  ): Promise<GuildCreationConfirmResult> {
    return this.isEnabled()
      ? this.guilds.confirmCreateForTelegramUser(telegramUserId, token, this.clock())
      : Promise.resolve({ state: "not-found" });
  }

  createInviteOptInForTelegramUser(
    telegramUserId: bigint
  ): Promise<GuildInviteOptInRepositoryResult | { state: "disabled" }> {
    if (!this.isEnabled()) {
      return Promise.resolve({ state: "disabled" });
    }
    const now = this.clock();
    return this.guilds.createInviteOptInForTelegramUser(telegramUserId, {
      token: createToken(),
      now,
      expiresAt: new Date(now.getTime() + GUILD_INVITE_OPT_IN_TTL_MS)
    });
  }

  createInviteForTelegramUser(
    telegramUserId: bigint,
    targetToken: string
  ): Promise<GuildInviteCreateRepositoryResult | { state: "disabled" }> {
    if (!this.isEnabled()) {
      return Promise.resolve({ state: "disabled" });
    }
    const now = this.clock();
    return this.guilds.createInviteForTelegramUser(telegramUserId, {
      token: createToken(),
      targetToken: targetToken.trim(),
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
    if (result.state !== "accepted" && result.state !== "replayed") {
      return result;
    }
    if (result.activatedFounderCharacterId) {
      await this.achievements?.trackEventSafely({
        type: "guild.created",
        characterId: result.activatedFounderCharacterId,
        occurredAt: now,
        sourceId: result.guild.id
      });
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
    return this.guilds.declineInviteForTelegramUser(telegramUserId, token, this.clock());
  }

  cancelInviteForTelegramUser(telegramUserId: bigint, token: string): Promise<GuildInviteRespondRepositoryResult> {
    return this.guilds.cancelInviteForTelegramUser(telegramUserId, token, this.clock());
  }

  updateProfileForTelegramUser(
    telegramUserId: bigint,
    input: { crest: string; description: string; expectedVersion: number }
  ): Promise<GuildProfileUpdateResult> {
    if (!this.isEnabled()) {
      return Promise.resolve({ state: "disabled" });
    }
    const profile = validateGuildProfile(input);
    return profile.ok
      ? this.guilds.updateProfileForTelegramUser(telegramUserId, {
          ...profile,
          expectedVersion: input.expectedVersion,
          now: this.clock()
        })
      : Promise.resolve({ state: "invalid", reason: profile.reason });
  }

  async findMemberForAction(telegramUserId: bigint, memberName: string): Promise<GuildMemberTargetResult> {
    if (!this.isEnabled()) {
      return { state: "disabled" };
    }
    const targets = await this.guilds.getMemberTargetsForTelegramUser(telegramUserId, this.clock());
    if (targets.state !== "ready") {
      return { state: targets.state };
    }
    const normalized = normalizeGuildMemberLookup(memberName);
    const members = uniqueMemberTargets(targets);
    const matches = members.filter((member) => normalizeGuildMemberLookup(member.name) === normalized);
    if (matches.length === 0) {
      return { state: "not-found" };
    }
    if (matches.length > 1) {
      return { state: "ambiguous", candidates: matches, expectedVersion: targets.version };
    }
    const member = matches[0]!;
    return {
      state: "ready",
      memberId: member.id,
      memberName: member.name,
      memberRole: member.role,
      expectedVersion: targets.version
    };
  }

  async getMemberManagementForTelegramUser(telegramUserId: bigint): Promise<GuildMemberManagementResult> {
    if (!this.isEnabled()) {
      return { state: "disabled" };
    }
    const targets = await this.guilds.getMemberTargetsForTelegramUser(telegramUserId, this.clock());
    return targets.state === "ready"
      ? { ...targets, members: uniqueMemberTargets(targets) }
      : targets;
  }

  async findMemberByIdForAction(
    telegramUserId: bigint,
    memberId: string,
    expectedVersion: number
  ): Promise<GuildMemberTargetResult> {
    if (!this.isEnabled()) {
      return { state: "disabled" };
    }
    const targets = await this.guilds.getMemberTargetsForTelegramUser(telegramUserId, this.clock());
    if (targets.state !== "ready") {
      return { state: targets.state };
    }
    if (targets.version !== expectedVersion) {
      return { state: "stale" };
    }
    const member = uniqueMemberTargets(targets).find((candidate) => candidate.id === memberId);
    return member
      ? {
          state: "ready",
          memberId: member.id,
          memberName: member.name,
          memberRole: member.role,
          expectedVersion: targets.version
        }
      : { state: "not-found" };
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

  offerLeadershipForTelegramUser(
    telegramUserId: bigint,
    memberId: string,
    expectedVersion: number
  ): Promise<GuildMemberMutationRepositoryResult> {
    return this.isEnabled()
      ? this.guilds.offerLeadershipForTelegramUser(telegramUserId, memberId, expectedVersion, this.clock())
      : Promise.resolve({ state: "not-found" });
  }

  acceptLeadershipForTelegramUser(
    telegramUserId: bigint,
    expectedVersion: number
  ): Promise<GuildMemberMutationRepositoryResult> {
    return this.guilds.acceptLeadershipForTelegramUser(telegramUserId, expectedVersion, this.clock());
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
    return this.guilds.leaveForTelegramUser(telegramUserId, expectedVersion, this.clock());
  }

  deleteForTelegramUser(telegramUserId: bigint, expectedVersion: number): Promise<GuildMemberMutationRepositoryResult> {
    return this.guilds.deleteForTelegramUser(telegramUserId, expectedVersion, this.clock());
  }

  async getPartyPickerForTelegramUser(telegramUserId: bigint, page = 0): Promise<GuildPartyPickerResult> {
    if (!this.isEnabled()) {
      return { state: "disabled" };
    }
    const party = await this.parties.getLiveRecruitingByTelegramUser(telegramUserId);
    if (!party) {
      return { state: "no-party" };
    }
    return this.guilds.getPartyPickerForTelegramUser(telegramUserId, party.id, page, this.clock());
  }

  resolvePartyRecipientForTelegramUser(
    telegramUserId: bigint,
    input: { partySessionId: string; memberId: string; guildVersion: number }
  ): Promise<GuildPartyRecipientResult> {
    return this.isEnabled()
      ? this.guilds.resolvePartyRecipientForTelegramUser(telegramUserId, { ...input, now: this.clock() })
      : Promise.resolve({ state: "disabled" });
  }

  recordPartyInvite(
    guildId: string,
    actorTelegramUserId: bigint,
    partySessionId: string,
    targetUserId: string
  ): Promise<void> {
    return this.isEnabled()
      ? this.guilds.recordPartyInvite(guildId, actorTelegramUserId, partySessionId, targetUserId, this.clock())
      : Promise.resolve();
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

function uniqueMemberTargets(result: Extract<GuildMemberTargetsRepositoryResult, { state: "ready" }>): GuildMemberRecord[] {
  return [...new Map(result.members.map((member) => [member.id, member])).values()];
}

function createToken(): string {
  return randomBytes(12).toString("base64url");
}
