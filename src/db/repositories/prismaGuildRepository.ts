import { Prisma, type PrismaClient } from "@prisma/client";
import {
  GUILD_CREST_CATALOG,
  GUILD_CUSTOM_CREST_MARKER,
  GUILD_MAX_MEMBERS,
  GUILD_MAX_OFFICERS,
  isEligibleGuildFounder,
  isValidGuildCrestMediaMetadata,
  validateGuildProfile,
  type GuildRole
} from "../../domain/guild";
import { LEFT_PASSAGE_PARTY_ORIGIN_KIND } from "../../services/partySessionService";
import type {
  GuildCreationConfirmRepositoryResult,
  GuildCreationIntentRecord,
  GuildCreationPreviewRepositoryResult,
  GuildCrestMediaInput,
  GuildCrestMediaRepositoryResult,
  GuildCrestPickerRepositoryResult,
  GuildCrestUploadDraftRepositoryResult,
  GuildCrestUploadPurpose,
  GuildFunnelCounters,
  GuildHubRepositoryResult,
  GuildInviteCreateRepositoryResult,
  GuildInviteOptInRepositoryResult,
  GuildInviteRecord,
  GuildInviteRespondRepositoryResult,
  GuildMemberTargetsRepositoryResult,
  GuildMemberMutationRepositoryResult,
  GuildPartyPickerRepositoryResult,
  GuildPartyRecipientRepositoryResult,
  GuildNestRepositoryResult,
  GuildPublicDirectoryRepositoryResult,
  GuildPublicProfileRepositoryResult,
  GuildRepository,
  GuildViewRecord
} from "./guildRepository";

type TxClient = Prisma.TransactionClient;

const PAGE_SIZE = 5;
const INVITE_TTL_LIMIT = 3;
const INVITE_WINDOW_MS = 13 * 60 * 1000;
const INVITE_WINDOW_CAP = 3;
const DECLINE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const FOUNDER_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const CHARTER_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FORMING_NAME_HOLD_MS = 23 * 60 * 60 * 1000;
const DISBANDED_NAME_HOLD_MS = 30 * 24 * 60 * 60 * 1000;
const INTENT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const CLEANUP_BATCH = 23;
const UPLOAD_DRAFT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const BIG_BARREL_PARTY_ORIGIN_LOCATION_ID = "barrel.big-brother";

const guildViewInclude = {
  members: {
    where: { activeUserKey: { not: null } },
    include: {
      user: { select: { character: { select: { name: true } } } }
    },
    orderBy: [{ joinedAt: "asc" as const }, { id: "asc" as const }]
  },
  invites: {
    where: { status: "pending" },
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }]
  },
  leadershipNomineeUser: { select: { character: { select: { name: true } } } }
} satisfies Prisma.GuildInclude;

type GuildViewRow = Prisma.GuildGetPayload<{ include: typeof guildViewInclude }>;

const incomingInviteInclude = {
  inviterUser: { select: { telegramUserId: true } },
  guild: {
    select: {
      id: true,
      displayName: true,
      crest: true,
      status: true,
      version: true,
      charterExpiresAt: true,
      founderUserId: true,
      activatedByInviteId: true
    }
  }
} satisfies Prisma.GuildInviteInclude;

type IncomingInviteRow = Prisma.GuildInviteGetPayload<{ include: typeof incomingInviteInclude }>;

interface GuildLifecycleSnapshot {
  id: string;
  status: string;
  version: number;
  charterExpiresAt: Date;
  founderUserId: string;
}

const actorInclude = {
  character: {
    select: {
      id: true,
      name: true,
      level: true,
      gold: true,
      _count: { select: { remorts: true } }
    }
  },
  guildMemberships: {
    where: { activeUserKey: { not: null } },
    take: 1,
    include: { guild: { include: guildViewInclude } }
  }
} satisfies Prisma.UserInclude;

type ActorRow = Prisma.UserGetPayload<{ include: typeof actorInclude }>;
type ActiveMembership = ActorRow["guildMemberships"][number];

export class PrismaGuildRepository implements GuildRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createIntentForTelegramUser(
    telegramUserId: bigint,
    input: {
      token: string;
      displayName: string;
      normalizedName: string;
      crest: string;
      crestKind?: "catalog" | "custom";
      crestMedia?: GuildCrestMediaInput;
      description: string;
      goldCost: number;
      now: Date;
      expiresAt: Date;
    }
  ): Promise<GuildCreationPreviewRepositoryResult> {
    return this.serializable(async (tx) => {
      await maintainGuildState(tx, input.now);
      await maintainCreationIntents(tx, input.now);
      await maintainCrestUploadDrafts(tx, input.now);
      const actor = await findActor(tx, telegramUserId);
      if (!actor?.character) {
        return { state: "no-character" };
      }
      if (await currentLiveMembership(tx, actor, input.now)) {
        return { state: "already-member" };
      }
      if (!isEligibleGuildFounder(actor.character.level, actor.character._count.remorts)) {
        return { state: "ineligible" };
      }
      const cooldown = await tx.guildFounderCooldown.findUnique({ where: { userId: actor.id } });
      if (cooldown?.availableAt && cooldown.availableAt > input.now) {
        return { state: "founder-cooldown", availableAt: cooldown.availableAt, now: input.now };
      }

      const existing = await tx.guildCreationIntent.findUnique({ where: { activeUserKey: actor.id } });
      const intent = existing
        ? await tx.guildCreationIntent.update({
            where: { id: existing.id },
            data: {
              token: input.token,
              characterId: actor.character.id,
              remortCount: actor.character._count.remorts,
              normalizedName: input.normalizedName,
              displayName: input.displayName,
              crest: input.crestKind === "custom" ? GUILD_CUSTOM_CREST_MARKER : input.crest,
              crestKind: input.crestKind ?? "catalog",
              crestFileId: input.crestMedia?.fileId ?? null,
              crestFileUniqueId: input.crestMedia?.fileUniqueId ?? null,
              crestWidth: input.crestMedia?.width ?? null,
              crestHeight: input.crestMedia?.height ?? null,
              crestFileSize: input.crestMedia?.fileSize ?? null,
              description: input.description,
              goldCost: input.goldCost,
              status: "pending",
              expiresAt: input.expiresAt,
              completedAt: null,
              guildId: null,
              updatedAt: input.now
            }
          })
        : await tx.guildCreationIntent.create({
            data: {
              token: input.token,
              userId: actor.id,
              characterId: actor.character.id,
              remortCount: actor.character._count.remorts,
              normalizedName: input.normalizedName,
              displayName: input.displayName,
              crest: input.crestKind === "custom" ? GUILD_CUSTOM_CREST_MARKER : input.crest,
              crestKind: input.crestKind ?? "catalog",
              crestFileId: input.crestMedia?.fileId ?? null,
              crestFileUniqueId: input.crestMedia?.fileUniqueId ?? null,
              crestWidth: input.crestMedia?.width ?? null,
              crestHeight: input.crestMedia?.height ?? null,
              crestFileSize: input.crestMedia?.fileSize ?? null,
              description: input.description,
              goldCost: input.goldCost,
              status: "pending",
              activeUserKey: actor.id,
              expiresAt: input.expiresAt,
              createdAt: input.now,
              updatedAt: input.now
            }
          });

      return {
        state: "ready",
        intent: {
          token: intent.token,
          displayName: intent.displayName,
          normalizedName: intent.normalizedName,
          crest: intent.crest,
          crestKind: crestKind(intent.crestKind),
          hasCustomCrest: intent.crestKind === "custom",
          description: intent.description,
          goldCost: intent.goldCost,
          availableGold: actor.character.gold,
          expiresAt: intent.expiresAt
        }
      };
    });
  }

  async createCustomIntentForTelegramUser(
    telegramUserId: bigint,
    input: {
      token: string;
      uploadToken: string;
      displayName: string;
      normalizedName: string;
      description: string;
      goldCost: number;
      now: Date;
      expiresAt: Date;
    }
  ): Promise<GuildCreationPreviewRepositoryResult> {
    return this.serializable(async (tx) => {
      await maintainGuildState(tx, input.now);
      await maintainCreationIntents(tx, input.now);
      await maintainCrestUploadDrafts(tx, input.now);
      const actor = await findActor(tx, telegramUserId);
      if (!actor?.character) {
        return { state: "no-character" };
      }
      if (await currentLiveMembership(tx, actor, input.now)) {
        return { state: "already-member" };
      }
      if (!isEligibleGuildFounder(actor.character.level, actor.character._count.remorts)) {
        return { state: "ineligible" };
      }
      const cooldown = await tx.guildFounderCooldown.findUnique({ where: { userId: actor.id } });
      if (cooldown?.availableAt && cooldown.availableAt > input.now) {
        return { state: "founder-cooldown", availableAt: cooldown.availableAt, now: input.now };
      }
      const draft = await tx.guildCrestUploadDraft.findUnique({
        where: { token: input.uploadToken },
        include: { intent: true }
      });
      if (!draft || draft.userId !== actor.id || draft.purpose !== "creation") {
        return { state: "upload-unavailable" };
      }
      if (draft.status === "consumed" && draft.intent) {
        return { state: "ready", intent: mapCreationIntent(draft.intent, actor.character.gold) };
      }
      if (
        draft.status !== "uploaded" ||
        draft.expiresAt <= input.now ||
        !draft.fileId || !draft.fileUniqueId || !draft.width || !draft.height
      ) {
        return { state: "upload-unavailable" };
      }
      const existing = await tx.guildCreationIntent.findUnique({ where: { activeUserKey: actor.id } });
      const data = {
        token: input.token,
        characterId: actor.character.id,
        remortCount: actor.character._count.remorts,
        normalizedName: input.normalizedName,
        displayName: input.displayName,
        crest: GUILD_CUSTOM_CREST_MARKER,
        crestKind: "custom",
        crestFileId: draft.fileId,
        crestFileUniqueId: draft.fileUniqueId,
        crestWidth: draft.width,
        crestHeight: draft.height,
        crestFileSize: draft.fileSize,
        description: input.description,
        goldCost: input.goldCost,
        status: "pending",
        expiresAt: input.expiresAt,
        completedAt: null,
        guildId: null,
        updatedAt: input.now
      } as const;
      const intent = existing
        ? await tx.guildCreationIntent.update({ where: { id: existing.id }, data })
        : await tx.guildCreationIntent.create({
            data: {
              ...data,
              userId: actor.id,
              activeUserKey: actor.id,
              createdAt: input.now
            }
          });
      await tx.guildCrestUploadDraft.update({
        where: { id: draft.id },
        data: {
          status: "consumed",
          activeUserKey: null,
          intentId: intent.id,
          consumedAt: input.now,
          updatedAt: input.now
        }
      });
      return { state: "ready", intent: mapCreationIntent(intent, actor.character.gold) };
    });
  }

  async confirmCreateForTelegramUser(
    telegramUserId: bigint,
    token: string,
    now: Date
  ): Promise<GuildCreationConfirmRepositoryResult> {
    try {
      return await this.serializable(async (tx): Promise<GuildCreationConfirmRepositoryResult> => {
        await maintainGuildState(tx, now);
        await expireCreationIntents(tx, now);
        const actor = await findActor(tx, telegramUserId);
        if (!actor?.character) {
          return { state: "no-character" };
        }
        const intent = await tx.guildCreationIntent.findUnique({ where: { token } });
        if (!intent || intent.userId !== actor.id) {
          return { state: "not-found" };
        }
        const membership = await currentLiveMembership(tx, actor, now);
        if (intent.status === "completed" && intent.guildId) {
          const guild = await findGuildViewById(tx, intent.guildId);
          return guild && isLiveGuildStatus(guild.status) && membership?.guildId === guild.id
            ? { state: "replayed", guild: mapGuildView(guild, actor.id, 0), characterId: actor.character.id }
            : { state: "expired" };
        }
        if (intent.status !== "pending" || intent.expiresAt <= now) {
          return { state: "expired" };
        }
        if (intent.characterId !== actor.character.id || intent.remortCount !== actor.character._count.remorts) {
          return { state: "stale-life" };
        }
        if (!isEligibleGuildFounder(actor.character.level, actor.character._count.remorts)) {
          return { state: "ineligible" };
        }
        if (membership) {
          return { state: "already-member" };
        }
        if (!await releaseSpecificNameReservationIfDue(tx, intent.normalizedName, now)) {
          await tx.guildCreationIntent.updateMany({
            where: { id: intent.id, status: "pending" },
            data: { status: "conflict", activeUserKey: null, updatedAt: now }
          });
          return { state: "name-taken" };
        }
        if (
          intent.crestKind === "catalog" &&
          !await releaseSpecificCrestReservationIfDue(tx, intent.crest, now)
        ) {
          await tx.guildCreationIntent.updateMany({
            where: { id: intent.id, status: "pending" },
            data: { status: "conflict", activeUserKey: null, updatedAt: now }
          });
          return { state: "crest-taken" };
        }
        const currentCooldown = await tx.guildFounderCooldown.findUnique({ where: { userId: actor.id } });
        if (currentCooldown?.availableAt && currentCooldown.availableAt > now) {
          return { state: "founder-cooldown", availableAt: currentCooldown.availableAt, now };
        }
        if (actor.character.gold < intent.goldCost) {
          return { state: "insufficient-gold", required: intent.goldCost, available: actor.character.gold };
        }

        const cooldownAvailableAt = new Date(now.getTime() + FOUNDER_COOLDOWN_MS);
        const cooldownClaim = currentCooldown
          ? await tx.guildFounderCooldown.updateMany({
              where: { userId: actor.id, availableAt: { lte: now } },
              data: { availableAt: cooldownAvailableAt, updatedAt: now }
            })
          : await tx.guildFounderCooldown.create({
              data: { userId: actor.id, availableAt: cooldownAvailableAt, createdAt: now, updatedAt: now }
            }).then(() => ({ count: 1 }));
        if (cooldownClaim.count !== 1) {
          const current = await tx.guildFounderCooldown.findUnique({ where: { userId: actor.id } });
          return {
            state: "founder-cooldown",
            availableAt: current?.availableAt ?? cooldownAvailableAt,
            now
          };
        }

        const charged = await tx.character.updateMany({
          where: { id: actor.character.id, gold: { gte: intent.goldCost } },
          data: { gold: { decrement: intent.goldCost } }
        });
        if (charged.count !== 1) {
          const current = await tx.character.findUnique({ where: { id: actor.character.id }, select: { gold: true } });
          throw new InsufficientGuildGoldError(intent.goldCost, current?.gold ?? 0);
        }

        const charterExpiresAt = new Date(now.getTime() + CHARTER_TTL_MS);
        const guild = await tx.guild.create({
          data: {
            normalizedName: intent.normalizedName,
            reservationKey: intent.normalizedName,
            displayName: intent.displayName,
            crest: intent.crest,
            crestKind: intent.crestKind,
            crestReservationKey: intent.crestKind === "catalog" ? intent.crest : null,
            crestFileId: intent.crestFileId,
            crestFileUniqueId: intent.crestFileUniqueId,
            crestWidth: intent.crestWidth,
            crestHeight: intent.crestHeight,
            crestFileSize: intent.crestFileSize,
            description: intent.description,
            founderUserId: actor.id,
            leaderUserId: actor.id,
            status: "forming",
            version: 1,
            charterExpiresAt,
            nameReleaseAt: new Date(charterExpiresAt.getTime() + FORMING_NAME_HOLD_MS),
            createdAt: now,
            updatedAt: now,
            members: {
              create: {
                userId: actor.id,
                activeUserKey: actor.id,
                role: "leader",
                joinedAt: now,
                createdAt: now,
                updatedAt: now
              }
            }
          }
        });
        await tx.guildCreationIntent.update({
          where: { id: intent.id },
          data: { status: "completed", activeUserKey: null, guildId: guild.id, completedAt: now, updatedAt: now }
        });
        await terminalizeIncomingInvites(tx, actor.id, now);
        await tx.guildInviteOptIn.deleteMany({ where: { userId: actor.id } });
        await appendAudit(tx, {
          guildId: guild.id,
          eventType: "charter.confirmed",
          actorUserId: actor.id,
          subjectUserId: actor.id,
          dedupeKey: `guild:${guild.id}:charter-confirmed`,
          payload: { goldCost: intent.goldCost },
          occurredAt: now
        });
        const view = await findGuildViewById(tx, guild.id);
        if (!view) {
          throw new Error("Created guild disappeared before replay view.");
        }
        return { state: "created", guild: mapGuildView(view, actor.id, 0), characterId: actor.character.id };
      });
    } catch (error) {
      if (error instanceof InsufficientGuildGoldError) {
        return { state: "insufficient-gold", required: error.required, available: error.available };
      }
      if (!isUniqueConflict(error)) {
        throw error;
      }
      return this.resolveCreationConflict(telegramUserId, token, now);
    }
  }

  async getHubForTelegramUser(
    telegramUserId: bigint,
    now: Date,
    page = 0
  ): Promise<GuildHubRepositoryResult> {
    return this.serializable(async (tx) => {
      await maintainGuildState(tx, now);
      const actor = await findActor(tx, telegramUserId);
      if (!actor?.character) {
        return { state: "no-character" };
      }
      const membership = await currentLiveMembership(tx, actor, now);
      await expireInvitesForUser(tx, actor.id, now);
      if (membership) {
        await expireGuildInvites(tx, membership.guildId, now);
      }
      const incoming = await getIncomingInvites(tx, actor.id, now);
      const incomingPage = pageRows(incoming, page);
      if (!membership || !isLiveGuildStatus(membership.guild.status)) {
        return {
          state: "not-member",
          incomingInvites: incomingPage.rows.map((invite) => mapInvite(invite)),
          page: incomingPage.page,
          hasPreviousPage: incomingPage.page > 0,
          hasNextPage: incomingPage.hasNext
        };
      }
      const guild = await findGuildViewById(tx, membership.guildId);
      return guild && isLiveGuildStatus(guild.status)
        ? { state: "ready", guild: mapGuildView(guild, actor.id, page), incomingInvites: incomingPage.rows.map((invite) => mapInvite(invite)) }
        : {
            state: "not-member",
            incomingInvites: incomingPage.rows.map((invite) => mapInvite(invite)),
            page: incomingPage.page,
            hasPreviousPage: incomingPage.page > 0,
            hasNextPage: incomingPage.hasNext
          };
    });
  }

  async getMemberTargetsForTelegramUser(
    telegramUserId: bigint,
    now: Date
  ): Promise<GuildMemberTargetsRepositoryResult> {
    return this.serializable(async (tx) => {
      await maintainGuildState(tx, now);
      const actor = await findActor(tx, telegramUserId);
      if (!actor?.character) {
        return { state: "no-character" };
      }
      const membership = await currentLiveMembership(tx, actor, now);
      if (!membership || !isLiveGuildStatus(membership.guild.status)) {
        return { state: "not-member" };
      }
      return {
        state: "ready",
        guildId: membership.guildId,
        version: membership.guild.version,
        viewerRole: isGuildRole(membership.role) ? membership.role : "member",
        members: mapUniqueGuildMembers(membership.guild.members)
      };
    });
  }

  async getNestForTelegramUser(
    telegramUserId: bigint,
    expectedLocationId: string,
    now: Date
  ): Promise<GuildNestRepositoryResult> {
    return this.serializable(async (tx) => {
      const actor = await findActor(tx, telegramUserId);
      if (!actor?.character) {
        return { state: "no-character" };
      }
      if (actor.lastSeenLocationId !== expectedLocationId) {
        return { state: "wrong-location" };
      }
      const membership = await currentLiveMembership(tx, actor, now);
      await expireInvitesForUser(tx, actor.id, now);
      const incoming = await tx.guildInvite.count({
        where: { targetUserId: actor.id, status: "pending", expiresAt: { gt: now } }
      });
      return {
        state: "ready",
        viewerState: membership
          ? membership.guild.status === "forming" ? "forming" : "active"
          : "not-member",
        hasIncomingInvites: incoming > 0
      };
    });
  }

  async getPublicDirectoryForTelegramUser(
    telegramUserId: bigint,
    expectedLocationId: string,
    _now: Date,
    page = 0
  ): Promise<GuildPublicDirectoryRepositoryResult> {
    const actor = await findPublicViewer(this.prisma, telegramUserId);
    if (!actor?.character) {
      return { state: "no-character" };
    }
    if (actor.lastSeenLocationId !== expectedLocationId) {
      return { state: "wrong-location" };
    }
    const total = await this.prisma.guild.count({ where: { status: "active", disbandedAt: null } });
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const currentPage = Math.min(Math.max(0, page), totalPages - 1);
    const guilds = await this.prisma.guild.findMany({
      where: { status: "active", disbandedAt: null },
      orderBy: [{ normalizedName: "asc" }, { id: "asc" }],
      skip: currentPage * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        displayName: true,
        crest: true,
        crestKind: true,
        _count: { select: { members: { where: { activeUserKey: { not: null } } } } }
      }
    });
    return {
      state: "ready",
      guilds: guilds.map((guild) => ({
        id: guild.id,
        displayName: guild.displayName,
        crest: guild.crest,
        hasCustomCrest: guild.crestKind === "custom",
        memberCount: guild._count.members
      })),
      page: currentPage,
      hasPreviousPage: currentPage > 0,
      hasNextPage: currentPage < totalPages - 1
    };
  }

  async getPublicGuildForTelegramUser(
    telegramUserId: bigint,
    guildId: string,
    expectedLocationId: string,
    now: Date
  ): Promise<GuildPublicProfileRepositoryResult> {
    void now;
    const actor = await findPublicViewer(this.prisma, telegramUserId);
    if (!actor?.character) {
      return { state: "no-character" };
    }
    if (actor.lastSeenLocationId !== expectedLocationId) {
      return { state: "wrong-location" };
    }
    const guild = await this.prisma.guild.findFirst({
      where: { id: guildId, status: "active", disbandedAt: null },
      select: {
        id: true,
        displayName: true,
        crest: true,
        crestKind: true,
        description: true,
        _count: { select: { members: { where: { activeUserKey: { not: null } } } } }
      }
    });
    return guild
      ? {
          state: "ready",
          guild: {
            id: guild.id,
            displayName: guild.displayName,
            crest: guild.crest,
            hasCustomCrest: guild.crestKind === "custom",
            description: guild.description,
            memberCount: guild._count.members
          }
        }
      : { state: "unavailable" };
  }

  async getCrestPickerForTelegramUser(
    telegramUserId: bigint,
    purpose: GuildCrestUploadPurpose,
    now: Date
  ): Promise<GuildCrestPickerRepositoryResult> {
    return this.serializable(async (tx) => {
      await maintainGuildState(tx, now);
      const actor = await findActor(tx, telegramUserId);
      if (!actor?.character) {
        return { state: "no-character" };
      }
      const membership = await currentLiveMembership(tx, actor, now);
      if (purpose === "creation") {
        if (membership) {
          return { state: "already-member" };
        }
        if (!isEligibleGuildFounder(actor.character.level, actor.character._count.remorts)) {
          return { state: "ineligible" };
        }
        const cooldown = await tx.guildFounderCooldown.findUnique({ where: { userId: actor.id } });
        if (cooldown?.availableAt && cooldown.availableAt > now) {
          return { state: "founder-cooldown", availableAt: cooldown.availableAt, now };
        }
      } else {
        if (!membership) {
          return { state: "not-member" };
        }
        if (membership.role !== "leader") {
          return { state: "forbidden" };
        }
      }
      const currentGuildId = purpose === "profile" ? membership?.guildId ?? null : null;
      const availableCrests = await availableCatalogCrests(tx, now, currentGuildId);
      return {
        state: "ready",
        availableCrests,
        currentCrest: purpose === "profile" && membership?.guild.crestKind === "catalog"
          ? membership.guild.crest
          : null,
        currentHasCustomCrest: purpose === "profile" && membership?.guild.crestKind === "custom",
        guildVersion: purpose === "profile" ? membership?.guild.version ?? null : null
      };
    });
  }

  async beginCrestUploadForTelegramUser(
    telegramUserId: bigint,
    input: {
      token: string;
      purpose: GuildCrestUploadPurpose;
      expectedGuildVersion?: number;
      now: Date;
      expiresAt: Date;
    }
  ): Promise<GuildCrestUploadDraftRepositoryResult> {
    return this.serializable(async (tx) => {
      await maintainGuildState(tx, input.now);
      await maintainCrestUploadDrafts(tx, input.now);
      const actor = await findActor(tx, telegramUserId);
      if (!actor?.character) {
        return { state: "no-character" };
      }
      const membership = await currentLiveMembership(tx, actor, input.now);
      let guildId: string | null = null;
      if (input.purpose === "creation") {
        if (membership) {
          return { state: "already-member" };
        }
        if (!isEligibleGuildFounder(actor.character.level, actor.character._count.remorts)) {
          return { state: "ineligible" };
        }
        const cooldown = await tx.guildFounderCooldown.findUnique({ where: { userId: actor.id } });
        if (cooldown?.availableAt && cooldown.availableAt > input.now) {
          return { state: "founder-cooldown", availableAt: cooldown.availableAt, now: input.now };
        }
      } else {
        if (!membership) {
          return { state: "not-member" };
        }
        if (membership.role !== "leader") {
          return { state: "forbidden" };
        }
        if (membership.guild.version !== input.expectedGuildVersion) {
          return { state: "stale" };
        }
        guildId = membership.guildId;
      }
      const existing = await tx.guildCrestUploadDraft.findUnique({ where: { activeUserKey: actor.id } });
      const data = {
        token: input.token,
        purpose: input.purpose,
        guildId,
        expectedGuildVersion: input.purpose === "profile" ? input.expectedGuildVersion ?? null : null,
        status: "pending",
        fileId: null,
        fileUniqueId: null,
        width: null,
        height: null,
        fileSize: null,
        intentId: null,
        expiresAt: input.expiresAt,
        consumedAt: null,
        updatedAt: input.now
      } as const;
      const draft = existing
        ? await tx.guildCrestUploadDraft.update({ where: { id: existing.id }, data })
        : await tx.guildCrestUploadDraft.create({
            data: { ...data, userId: actor.id, activeUserKey: actor.id, createdAt: input.now }
          });
      return {
        state: "ready",
        token: draft.token,
        purpose: input.purpose,
        ...(draft.expectedGuildVersion === null ? {} : { expectedGuildVersion: draft.expectedGuildVersion })
      };
    });
  }

  async storeCrestUploadForTelegramUser(
    telegramUserId: bigint,
    input: { token: string; media: GuildCrestMediaInput; now: Date }
  ): Promise<GuildCrestUploadDraftRepositoryResult> {
    if (!isValidGuildCrestMediaMetadata(input.media)) {
      return { state: "invalid-media" };
    }
    return this.serializable(async (tx) => {
      const actor = await findActor(tx, telegramUserId);
      if (!actor?.character) {
        return { state: "no-character" };
      }
      const draft = await tx.guildCrestUploadDraft.findUnique({
        where: { token: input.token },
        include: { intent: { select: { token: true } } }
      });
      if (!draft || draft.userId !== actor.id) {
        return { state: "not-found" };
      }
      if (draft.status === "consumed") {
        return {
          state: "replayed",
          token: draft.token,
          purpose: draft.purpose === "profile" ? "profile" : "creation",
          ...(draft.intent?.token ? { intentToken: draft.intent.token } : {}),
          ...(draft.expectedGuildVersion === null ? {} : { expectedGuildVersion: draft.expectedGuildVersion })
        };
      }
      if (draft.expiresAt <= input.now) {
        await tx.guildCrestUploadDraft.updateMany({
          where: { id: draft.id, status: { in: ["pending", "uploaded"] } },
          data: { status: "expired", activeUserKey: null, updatedAt: input.now }
        });
        return { state: "expired" };
      }
      const membership = await currentLiveMembership(tx, actor, input.now);
      if (draft.purpose === "creation") {
        if (membership) {
          return { state: "already-member" };
        }
        if (!isEligibleGuildFounder(actor.character.level, actor.character._count.remorts)) {
          return { state: "ineligible" };
        }
      } else {
        if (!membership || membership.guildId !== draft.guildId) {
          return { state: "not-member" };
        }
        if (membership.role !== "leader") {
          return { state: "forbidden" };
        }
        if (membership.guild.version !== draft.expectedGuildVersion) {
          return { state: "stale" };
        }
      }
      if (draft.status === "uploaded" && draft.fileUniqueId === input.media.fileUniqueId) {
        return {
          state: "replayed",
          token: draft.token,
          purpose: draft.purpose === "profile" ? "profile" : "creation",
          ...(draft.expectedGuildVersion === null ? {} : { expectedGuildVersion: draft.expectedGuildVersion })
        };
      }
      await tx.guildCrestUploadDraft.update({
        where: { id: draft.id },
        data: {
          status: "uploaded",
          fileId: input.media.fileId,
          fileUniqueId: input.media.fileUniqueId,
          width: input.media.width,
          height: input.media.height,
          fileSize: input.media.fileSize,
          updatedAt: input.now
        }
      });
      return {
        state: "ready",
        token: draft.token,
        purpose: draft.purpose === "profile" ? "profile" : "creation",
        ...(draft.expectedGuildVersion === null ? {} : { expectedGuildVersion: draft.expectedGuildVersion })
      };
    });
  }

  async getCreationCrestMediaForTelegramUser(
    telegramUserId: bigint,
    token: string,
    now: Date
  ): Promise<GuildCrestMediaRepositoryResult> {
    const actor = await findActor(this.prisma, telegramUserId);
    if (!actor?.character) {
      return { state: "no-character" };
    }
    const intent = await this.prisma.guildCreationIntent.findUnique({ where: { token } });
    if (!intent || intent.userId !== actor.id || intent.expiresAt <= now || intent.crestKind !== "custom") {
      return { state: "not-found" };
    }
    const media = crestMedia(intent);
    return media ? { state: "ready", media } : { state: "not-found" };
  }

  async getGuildCrestMediaForTelegramUser(
    telegramUserId: bigint,
    input: { guildId: string; publicAccess: boolean; expectedLocationId?: string; now: Date }
  ): Promise<GuildCrestMediaRepositoryResult> {
    return this.serializable(async (tx) => {
      const actor = await findActor(tx, telegramUserId);
      if (!actor?.character) {
        return { state: "no-character" };
      }
      if (input.publicAccess) {
        if (!input.expectedLocationId || actor.lastSeenLocationId !== input.expectedLocationId) {
          return { state: "wrong-location" };
        }
      } else {
        const membership = await currentLiveMembership(tx, actor, input.now);
        if (!membership || membership.guildId !== input.guildId) {
          return { state: "forbidden" };
        }
      }
      const guild = await tx.guild.findUnique({ where: { id: input.guildId } });
      if (!guild || guild.crestKind !== "custom" || (input.publicAccess && guild.status !== "active")) {
        return { state: "unavailable" };
      }
      if (await terminalizeGuildIfDue(tx, guild, input.now)) {
        return { state: "unavailable" };
      }
      const media = crestMedia(guild);
      return media ? { state: "ready", media } : { state: "unavailable" };
    });
  }

  async createInviteOptInForTelegramUser(
    telegramUserId: bigint,
    input: { token: string; now: Date; expiresAt: Date }
  ): Promise<GuildInviteOptInRepositoryResult> {
    return this.serializable(async (tx) => {
      await maintainGuildState(tx, input.now);
      const actor = await findActor(tx, telegramUserId);
      if (!actor?.character) {
        return { state: "no-character" };
      }
      if (await currentLiveMembership(tx, actor, input.now)) {
        await tx.guildInviteOptIn.deleteMany({ where: { userId: actor.id } });
        return { state: "already-member" };
      }
      const row = await tx.guildInviteOptIn.upsert({
        where: { userId: actor.id },
        create: {
          userId: actor.id,
          token: input.token,
          expiresAt: input.expiresAt,
          createdAt: input.now,
          updatedAt: input.now
        },
        update: { token: input.token, expiresAt: input.expiresAt, updatedAt: input.now }
      });
      return { state: "ready", token: row.token, expiresAt: row.expiresAt };
    });
  }

  async createInviteForTelegramUser(
    telegramUserId: bigint,
    input: { token: string; targetToken: string; now: Date; expiresAt: Date }
  ): Promise<GuildInviteCreateRepositoryResult> {
    try {
      return await this.serializable(async (tx): Promise<GuildInviteCreateRepositoryResult> => {
        await maintainGuildState(tx, input.now);
        const actor = await findActor(tx, telegramUserId);
        if (!actor?.character) {
          return { state: "no-character" };
        }
        const membership = await currentLiveMembership(tx, actor, input.now);
        if (!membership || !isLiveGuildStatus(membership.guild.status)) {
          return { state: "not-member" };
        }
        if (membership.role !== "leader" && membership.role !== "officer") {
          return { state: "forbidden" };
        }
        await expireGuildInvites(tx, membership.guildId, input.now);
        const optIn = await tx.guildInviteOptIn.findUnique({
          where: { token: input.targetToken },
          include: {
            user: {
              select: {
                id: true,
                telegramUserId: true,
                character: { select: { name: true } }
              }
            }
          }
        });
        if (
          !optIn ||
          optIn.expiresAt <= input.now ||
          !optIn.user.character ||
          optIn.user.id === actor.id
        ) {
          return { state: "target-unavailable" };
        }
        if (await hasCurrentLiveMembership(tx, optIn.user.id, input.now)) {
          return { state: "target-unavailable" };
        }
        if (membership.guild.members.length >= GUILD_MAX_MEMBERS) {
          return { state: "guild-full" };
        }
        const declineBoundary = new Date(input.now.getTime() - DECLINE_COOLDOWN_MS);
        const declined = await tx.guildInvite.findFirst({
          where: {
            guildId: membership.guildId,
            targetUserId: optIn.user.id,
            status: "declined",
            respondedAt: { gt: declineBoundary }
          },
          orderBy: { respondedAt: "desc" },
          select: { respondedAt: true }
        });
        if (declined) {
          return {
            state: "decline-cooldown",
            availableAt: new Date((declined.respondedAt ?? input.now).getTime() + DECLINE_COOLDOWN_MS),
            now: input.now
          };
        }
        const activeKey = inviteActiveKey(membership.guildId, optIn.user.id);
        const existing = await tx.guildInvite.findUnique({ where: { activeKey }, include: incomingInviteInclude });
        if (existing?.status === "pending" && existing.expiresAt > input.now) {
          return {
            state: "replayed",
            invite: mapInvite(existing),
            deliveryTelegramUserId: optIn.user.telegramUserId
          };
        }
        const incoming = await tx.guildInvite.findMany({
          where: { targetUserId: optIn.user.id, status: "pending", expiresAt: { gt: input.now } },
          orderBy: { expiresAt: "asc" },
          select: { expiresAt: true },
          take: INVITE_TTL_LIMIT
        });
        if (incoming.length >= INVITE_TTL_LIMIT) {
          return { state: "too-many-incoming", availableAt: incoming[0]!.expiresAt, now: input.now };
        }
        const rateLimit = await getInviteRateLimit(tx, actor.id, input.now);
        if (rateLimit) {
          return { state: "rate-limited", availableAt: rateLimit, now: input.now };
        }
        const invite = await tx.guildInvite.create({
          data: {
            token: input.token,
            guildId: membership.guildId,
            inviterUserId: actor.id,
            inviterMembershipId: membership.id,
            targetUserId: optIn.user.id,
            targetName: optIn.user.character.name,
            status: "pending",
            activeKey,
            expiresAt: input.expiresAt,
            createdAt: input.now,
            updatedAt: input.now
          },
          include: incomingInviteInclude
        });
        await appendAudit(tx, {
          guildId: membership.guildId,
          eventType: "invite.created",
          actorUserId: actor.id,
          subjectUserId: optIn.user.id,
          dedupeKey: `guild:${membership.guildId}:invite:${invite.id}:created`,
          payload: null,
          occurredAt: input.now
        });
        return {
          state: "created",
          invite: mapInvite(invite),
          deliveryTelegramUserId: optIn.user.telegramUserId
        };
      });
    } catch (error) {
      if (!isUniqueConflict(error)) {
        throw error;
      }
      return this.resolveInviteConflict(telegramUserId, input.targetToken, input.now);
    }
  }

  acceptInviteForTelegramUser(telegramUserId: bigint, token: string, now: Date): Promise<GuildInviteRespondRepositoryResult> {
    return this.respondToInvite(telegramUserId, token, "accepted", now);
  }

  declineInviteForTelegramUser(telegramUserId: bigint, token: string, now: Date): Promise<GuildInviteRespondRepositoryResult> {
    return this.respondToInvite(telegramUserId, token, "declined", now);
  }

  cancelInviteForTelegramUser(telegramUserId: bigint, token: string, now: Date): Promise<GuildInviteRespondRepositoryResult> {
    return this.respondToInvite(telegramUserId, token, "cancelled", now);
  }

  async updateProfileForTelegramUser(
    telegramUserId: bigint,
    input: { crest: string; description: string; expectedVersion: number; now: Date }
  ): Promise<GuildMemberMutationRepositoryResult> {
    try {
      return await this.serializable(async (tx) => {
        const actor = await findActor(tx, telegramUserId);
        if (!actor?.character) {
          return { state: "no-character" };
        }
        const membership = await currentLiveMembership(tx, actor, input.now);
        if (!membership || !isLiveGuildStatus(membership.guild.status)) {
          return { state: "not-member" };
        }
        if (membership.role !== "leader") {
          return { state: "forbidden" };
        }
        const profile = validateGuildProfile(input);
        if (!profile.ok) {
          return { state: "invalid-target" };
        }
        if (!await releaseSpecificCrestReservationIfDue(tx, profile.crest, input.now, membership.guildId)) {
          return { state: "crest-taken" };
        }
        if (!(await claimGuildVersion(tx, membership.guildId, input.expectedVersion, input.now))) {
          return { state: "stale" };
        }
        const reverted = membership.guild.crestKind === "custom";
        await tx.guild.update({
          where: { id: membership.guildId },
          data: {
            crest: profile.crest,
            crestKind: "catalog",
            crestReservationKey: profile.crest,
            crestFileId: null,
            crestFileUniqueId: null,
            crestWidth: null,
            crestHeight: null,
            crestFileSize: null,
            description: profile.description,
            updatedAt: input.now
          }
        });
        await appendAudit(tx, {
          guildId: membership.guildId,
          eventType: "profile.updated",
          actorUserId: actor.id,
          subjectUserId: null,
          dedupeKey: `guild:${membership.guildId}:profile:v${input.expectedVersion + 1}`,
          payload: { crestChange: reverted ? "reverted" : "catalog" },
          occurredAt: input.now
        });
        return updatedGuildResult(tx, membership.guildId, actor.id);
      });
    } catch (error) {
      if (isUniqueConflict(error)) {
        return { state: "crest-taken" };
      }
      throw error;
    }
  }

  async updateCustomProfileForTelegramUser(
    telegramUserId: bigint,
    input: { uploadToken: string; description: string; now: Date }
  ): Promise<GuildMemberMutationRepositoryResult> {
    return this.serializable(async (tx) => {
      const actor = await findActor(tx, telegramUserId);
      if (!actor?.character) {
        return { state: "no-character" };
      }
      const draft = await tx.guildCrestUploadDraft.findUnique({ where: { token: input.uploadToken } });
      if (!draft || draft.userId !== actor.id || draft.purpose !== "profile") {
        return { state: "not-found" };
      }
      const membership = await currentLiveMembership(tx, actor, input.now);
      if (!membership || membership.guildId !== draft.guildId) {
        return { state: "not-member" };
      }
      if (membership.role !== "leader") {
        return { state: "forbidden" };
      }
      if (draft.status === "consumed") {
        return updatedGuildResult(tx, membership.guildId, actor.id);
      }
      if (
        draft.status !== "uploaded" || draft.expiresAt <= input.now ||
        !draft.fileId || !draft.fileUniqueId || !draft.width || !draft.height
      ) {
        return { state: "not-found" };
      }
      if (draft.expectedGuildVersion === null || membership.guild.version !== draft.expectedGuildVersion) {
        return { state: "stale" };
      }
      if (!(await claimGuildVersion(tx, membership.guildId, draft.expectedGuildVersion, input.now))) {
        return { state: "stale" };
      }
      await tx.guild.update({
        where: { id: membership.guildId },
        data: {
          crest: GUILD_CUSTOM_CREST_MARKER,
          crestKind: "custom",
          crestReservationKey: null,
          crestFileId: draft.fileId,
          crestFileUniqueId: draft.fileUniqueId,
          crestWidth: draft.width,
          crestHeight: draft.height,
          crestFileSize: draft.fileSize,
          description: input.description,
          updatedAt: input.now
        }
      });
      await tx.guildCrestUploadDraft.update({
        where: { id: draft.id },
        data: { status: "consumed", activeUserKey: null, consumedAt: input.now, updatedAt: input.now }
      });
      await appendAudit(tx, {
        guildId: membership.guildId,
        eventType: "profile.updated",
        actorUserId: actor.id,
        subjectUserId: null,
        dedupeKey: `guild:${membership.guildId}:profile:v${draft.expectedGuildVersion + 1}`,
        payload: { crestChange: "custom" },
        occurredAt: input.now
      });
      return updatedGuildResult(tx, membership.guildId, actor.id);
    });
  }

  async setMemberRoleForTelegramUser(
    telegramUserId: bigint,
    memberId: string,
    role: Exclude<GuildRole, "leader">,
    expectedVersion: number,
    now: Date
  ): Promise<GuildMemberMutationRepositoryResult> {
    return this.serializable(async (tx) => {
      const context = await getMutationContext(tx, telegramUserId, memberId, now);
      if (context.state !== "ready") {
        return context;
      }
      if (context.actorMembership.role !== "leader") {
        return { state: "forbidden" };
      }
      if (context.target.userId === context.actor.id || context.target.role === "leader") {
        return { state: "invalid-target" };
      }
      if (
        role === "officer" &&
        context.target.role !== "officer" &&
        context.guild.members.filter((member) => member.role === "officer").length >= GUILD_MAX_OFFICERS
      ) {
        return { state: "officer-cap" };
      }
      if (!(await claimGuildVersion(tx, context.guild.id, expectedVersion, now))) {
        return { state: "stale" };
      }
      await tx.guildMember.update({ where: { id: context.target.id }, data: { role, updatedAt: now } });
      if (context.guild.leadershipNomineeUserId === context.target.userId && role === "member") {
        await tx.guild.update({
          where: { id: context.guild.id },
          data: { leadershipNomineeUserId: null, leadershipOfferedAt: null, updatedAt: now }
        });
      }
      await appendAudit(tx, {
        guildId: context.guild.id,
        eventType: role === "officer" ? "member.promoted" : "member.demoted",
        actorUserId: context.actor.id,
        subjectUserId: context.target.userId,
        dedupeKey: `guild:${context.guild.id}:role:${context.target.id}:v${expectedVersion + 1}`,
        payload: { role },
        occurredAt: now
      });
      return updatedGuildResult(tx, context.guild.id, context.actor.id);
    });
  }

  async offerLeadershipForTelegramUser(
    telegramUserId: bigint,
    memberId: string,
    expectedVersion: number,
    now: Date
  ): Promise<GuildMemberMutationRepositoryResult> {
    return this.serializable(async (tx) => {
      const context = await getMutationContext(tx, telegramUserId, memberId, now);
      if (context.state !== "ready") {
        return context;
      }
      if (context.actorMembership.role !== "leader") {
        return { state: "forbidden" };
      }
      if (context.target.userId === context.actor.id || context.target.role === "leader") {
        return { state: "invalid-target" };
      }
      if (!(await claimGuildVersion(tx, context.guild.id, expectedVersion, now))) {
        return { state: "stale" };
      }
      await tx.guild.update({
        where: { id: context.guild.id },
        data: {
          leadershipNomineeUserId: context.target.userId,
          leadershipOfferedAt: now,
          updatedAt: now
        }
      });
      await appendAudit(tx, {
        guildId: context.guild.id,
        eventType: "leadership.offered",
        actorUserId: context.actor.id,
        subjectUserId: context.target.userId,
        dedupeKey: `guild:${context.guild.id}:leadership-offer:v${expectedVersion + 1}`,
        payload: null,
        occurredAt: now
      });
      const result = await updatedGuildResult(tx, context.guild.id, context.actor.id);
      return result.state === "updated" ? { ...result, state: "transfer-offered" } : result;
    });
  }

  async acceptLeadershipForTelegramUser(
    telegramUserId: bigint,
    expectedVersion: number,
    now: Date
  ): Promise<GuildMemberMutationRepositoryResult> {
    return this.serializable(async (tx) => {
      const actor = await findActor(tx, telegramUserId);
      if (!actor?.character) {
        return { state: "no-character" };
      }
      const membership = await currentLiveMembership(tx, actor, now);
      if (!membership || !isLiveGuildStatus(membership.guild.status)) {
        return { state: "not-member" };
      }
      const guild = await findGuildViewById(tx, membership.guildId);
      if (!guild || guild.leadershipNomineeUserId !== actor.id || membership.role === "leader") {
        return { state: "forbidden" };
      }
      if (!(await claimGuildVersion(tx, guild.id, expectedVersion, now))) {
        return { state: "stale" };
      }
      const oldLeader = guild.members.find((member) => member.userId === guild.leaderUserId);
      if (!oldLeader) {
        return { state: "stale" };
      }
      const officerCountWithoutNominee = guild.members.filter(
        (member) => member.role === "officer" && member.id !== membership.id
      ).length;
      await tx.guildMember.update({
        where: { id: oldLeader.id },
        data: { role: officerCountWithoutNominee >= GUILD_MAX_OFFICERS ? "member" : "officer", updatedAt: now }
      });
      await tx.guildMember.update({ where: { id: membership.id }, data: { role: "leader", updatedAt: now } });
      await tx.guild.update({
        where: { id: guild.id },
        data: {
          leaderUserId: actor.id,
          leadershipNomineeUserId: null,
          leadershipOfferedAt: null,
          updatedAt: now
        }
      });
      await appendAudit(tx, {
        guildId: guild.id,
        eventType: "leadership.transferred",
        actorUserId: actor.id,
        subjectUserId: actor.id,
        dedupeKey: `guild:${guild.id}:leadership-accepted:v${expectedVersion + 1}`,
        payload: null,
        occurredAt: now
      });
      return updatedGuildResult(tx, guild.id, actor.id);
    });
  }

  async kickMemberForTelegramUser(
    telegramUserId: bigint,
    memberId: string,
    expectedVersion: number,
    now: Date
  ): Promise<GuildMemberMutationRepositoryResult> {
    return this.serializable(async (tx) => {
      const context = await getMutationContext(tx, telegramUserId, memberId, now);
      if (context.state !== "ready") {
        return context;
      }
      if (
        context.actorMembership.role !== "leader" ||
        context.target.userId === context.actor.id ||
        context.target.role === "leader"
      ) {
        return { state: "forbidden" };
      }
      if (!(await claimGuildVersion(tx, context.guild.id, expectedVersion, now))) {
        return { state: "stale" };
      }
      await closeMembership(tx, context.target.id, now);
      if (context.guild.leadershipNomineeUserId === context.target.userId) {
        await tx.guild.update({
          where: { id: context.guild.id },
          data: { leadershipNomineeUserId: null, leadershipOfferedAt: null, updatedAt: now }
        });
      }
      await appendAudit(tx, {
        guildId: context.guild.id,
        eventType: "member.kicked",
        actorUserId: context.actor.id,
        subjectUserId: context.target.userId,
        dedupeKey: `guild:${context.guild.id}:kick:${context.target.id}:v${expectedVersion + 1}`,
        payload: null,
        occurredAt: now
      });
      return updatedGuildResult(tx, context.guild.id, context.actor.id);
    });
  }

  async leaveForTelegramUser(
    telegramUserId: bigint,
    expectedVersion: number,
    now: Date
  ): Promise<GuildMemberMutationRepositoryResult> {
    return this.serializable(async (tx) => {
      const actor = await findActor(tx, telegramUserId);
      if (!actor?.character) {
        return { state: "no-character" };
      }
      const membership = await currentLiveMembership(tx, actor, now);
      if (!membership || !isLiveGuildStatus(membership.guild.status)) {
        return { state: "not-member" };
      }
      if (membership.role === "leader") {
        return { state: "leader-needs-successor" };
      }
      if (!(await claimGuildVersion(tx, membership.guildId, expectedVersion, now))) {
        return { state: "stale" };
      }
      await closeMembership(tx, membership.id, now);
      if (membership.guild.leadershipNomineeUserId === actor.id) {
        await tx.guild.update({
          where: { id: membership.guildId },
          data: { leadershipNomineeUserId: null, leadershipOfferedAt: null, updatedAt: now }
        });
      }
      await appendAudit(tx, {
        guildId: membership.guildId,
        eventType: "member.left",
        actorUserId: actor.id,
        subjectUserId: actor.id,
        dedupeKey: `guild:${membership.guildId}:leave:${membership.id}:v${expectedVersion + 1}`,
        payload: null,
        occurredAt: now
      });
      return { state: "left", guildName: membership.guild.displayName };
    });
  }

  async deleteForTelegramUser(
    telegramUserId: bigint,
    expectedVersion: number,
    now: Date
  ): Promise<GuildMemberMutationRepositoryResult> {
    return this.serializable(async (tx) => {
      const actor = await findActor(tx, telegramUserId);
      if (!actor?.character) {
        return { state: "no-character" };
      }
      const membership = await currentLiveMembership(tx, actor, now);
      if (!membership || !isLiveGuildStatus(membership.guild.status)) {
        return { state: "not-member" };
      }
      if (membership.role !== "leader") {
        return { state: "forbidden" };
      }
      if (membership.guild.members.length !== 1) {
        return { state: "guild-not-sole" };
      }
      if (!(await claimGuildVersion(tx, membership.guildId, expectedVersion, now))) {
        return { state: "stale" };
      }
      const guildName = membership.guild.displayName;
      await softDisbandGuild(tx, membership.guildId, actor.id, expectedVersion + 1, now);
      return { state: "deleted", guildName };
    });
  }

  async getPartyPickerForTelegramUser(
    telegramUserId: bigint,
    partySessionId: string,
    page: number,
    now: Date
  ): Promise<GuildPartyPickerRepositoryResult> {
    return this.serializable(async (tx) => {
      const context = await getPartyContext(tx, telegramUserId, partySessionId, now);
      if (context.state !== "ready") {
        return context;
      }
      const joinedCharacterIds = new Set(
        context.party.participants.filter((row) => row.status === "joined").map((row) => row.characterId)
      );
      const candidates = context.guild.members.flatMap((member) => {
        const character = member.user.character;
        return member.userId !== context.actor.id && character && !joinedCharacterIds.has(character.id) &&
          !character.activeCombatLease && character.partyParticipants.length === 0
          ? [{ memberId: member.id, name: character.name }]
          : [];
      });
      const candidatePage = pageRows(candidates, page);
      return {
        state: "ready",
        guildId: context.guild.id,
        guildVersion: context.guild.version,
        partySessionId: context.party.id,
        inviteToken: context.party.inviteToken,
        candidates: candidatePage.rows,
        page: candidatePage.page,
        hasPreviousPage: candidatePage.page > 0,
        hasNextPage: candidatePage.hasNext
      };
    });
  }

  async resolvePartyRecipientForTelegramUser(
    telegramUserId: bigint,
    input: { partySessionId: string; memberId: string; guildVersion: number; now: Date }
  ): Promise<GuildPartyRecipientRepositoryResult> {
    return this.serializable(async (tx) => {
      const context = await getPartyContext(tx, telegramUserId, input.partySessionId, input.now);
      if (context.state !== "ready") {
        return { state: "stale" };
      }
      if (context.guild.version !== input.guildVersion) {
        return { state: "stale" };
      }
      const member = context.guild.members.find((row) => row.id === input.memberId);
      const character = member?.user.character;
      if (
        !member ||
        member.userId === context.actor.id ||
        !character ||
        character.activeCombatLease ||
        character.partyParticipants.length > 0 ||
        context.party.participants.some((row) => row.status === "joined" && row.characterId === character.id)
      ) {
        return { state: "not-found" };
      }
      return {
        state: "ready",
        guildId: context.guild.id,
        guildVersion: context.guild.version,
        partySessionId: context.party.id,
        inviteToken: context.party.inviteToken,
        targetUserId: member.userId,
        recipient: { telegramUserId: member.user.telegramUserId, name: character.name }
      };
    });
  }

  async recordPartyInvite(
    guildId: string,
    actorTelegramUserId: bigint,
    partySessionId: string,
    targetUserId: string,
    now: Date
  ): Promise<void> {
    await this.serializable(async (tx) => {
      const actor = await findActor(tx, actorTelegramUserId);
      if ((await currentLiveMembership(tx, actor, now))?.guildId !== guildId) {
        return;
      }
      await appendAudit(tx, {
        guildId,
        eventType: "party.invite",
        actorUserId: actor!.id,
        subjectUserId: targetUserId,
        dedupeKey: `guild:${guildId}:party:${partySessionId}:target:${targetUserId}`,
        payload: { partySessionId },
        occurredAt: now
      });
    });
  }

  async getFunnelCounters(): Promise<GuildFunnelCounters> {
    const grouped = await this.prisma.guildAudit.groupBy({ by: ["eventType"], _count: { _all: true } });
    const counts = new Map(grouped.map((row) => [row.eventType, row._count._all]));
    return {
      guildsCreated: counts.get("guild.created") ?? 0,
      invitesCreated: counts.get("invite.created") ?? 0,
      invitesAccepted: counts.get("invite.accepted") ?? 0,
      invitesDeclined: counts.get("invite.declined") ?? 0,
      invitesCancelled: counts.get("invite.cancelled") ?? 0,
      memberLeaves: counts.get("member.left") ?? 0,
      memberKicks: counts.get("member.kicked") ?? 0,
      leadershipTransfers: counts.get("leadership.transferred") ?? 0,
      partyInvites: counts.get("party.invite") ?? 0
    };
  }

  async ensureCreationGoldForTelegramUser(
    telegramUserId: bigint,
    minimumGold: number
  ): Promise<"updated" | "no-character"> {
    const character = await this.prisma.character.findFirst({
      where: { user: { telegramUserId } },
      select: { id: true, gold: true }
    });
    if (!character) {
      return "no-character";
    }
    if (character.gold < minimumGold) {
      await this.prisma.character.update({ where: { id: character.id }, data: { gold: minimumGold } });
    }
    return "updated";
  }

  private async respondToInvite(
    telegramUserId: bigint,
    token: string,
    action: "accepted" | "declined" | "cancelled",
    now: Date
  ): Promise<GuildInviteRespondRepositoryResult> {
    try {
      return await this.serializable(async (tx): Promise<GuildInviteRespondRepositoryResult> => {
        await maintainGuildState(tx, now);
        const actor = await findActor(tx, telegramUserId);
        if (!actor?.character) {
          return { state: "no-character" };
        }
        const invite = await tx.guildInvite.findUnique({ where: { token }, include: incomingInviteInclude });
        if (!invite) {
          return { state: "not-found" };
        }
        const actorMembership = activeMembership(actor);
        const ownsTarget = invite.targetUserId === actor.id;
        const canCancel = Boolean(
          actorMembership &&
          actorMembership.guildId === invite.guildId &&
          (
            actorMembership.role === "leader" ||
            (actorMembership.role === "officer" && actorMembership.id === invite.inviterMembershipId && invite.inviterUserId === actor.id)
          )
        );
        if ((action === "cancelled" && !canCancel) || (action !== "cancelled" && !ownsTarget)) {
          return { state: "not-found" };
        }
        if (await terminalizeGuildIfDue(tx, invite.guild, now)) {
          return { state: "expired" };
        }
        const membership = await currentLiveMembership(tx, actor, now);
        if (invite.status !== "pending") {
          return canonicalInviteResult(tx, invite, actor);
        }
        if (invite.expiresAt <= now || !isLiveGuildStatus(invite.guild.status)) {
          await tx.guildInvite.updateMany({
            where: { id: invite.id, status: "pending" },
            data: { status: "expired", activeKey: null, respondedAt: now, updatedAt: now }
          });
          return { state: "expired" };
        }
        if (action === "declined" || action === "cancelled") {
          await tx.guildInvite.update({
            where: { id: invite.id },
            data: { status: action, activeKey: null, respondedAt: now, updatedAt: now }
          });
          await appendAudit(tx, {
            guildId: invite.guildId,
            eventType: `invite.${action}`,
            actorUserId: actor.id,
            subjectUserId: invite.targetUserId,
            dedupeKey: `guild:${invite.guildId}:invite:${invite.id}:${action}`,
            payload: null,
            occurredAt: now
          });
          return action === "declined"
            ? {
                state: "declined",
                transitioned: true,
                notification: inviteResponseNotification(invite)
              }
            : { state: "cancelled" };
        }
        if (membership) {
          return { state: "already-in-guild" };
        }
        const activeMembers = await tx.guildMember.count({
          where: { guildId: invite.guildId, activeUserKey: { not: null } }
        });
        if (activeMembers >= GUILD_MAX_MEMBERS) {
          return { state: "guild-full" };
        }
        const activating = invite.guild.status === "forming" && activeMembers === 1;
        const guildClaim = await tx.guild.updateMany({
          where: { id: invite.guildId, status: invite.guild.status, version: invite.guild.version },
          data: {
            version: { increment: 1 },
            ...(activating
              ? {
                  status: "active",
                  activatedAt: now,
                  activatedByInviteId: invite.id,
                  nameReleaseAt: null
                }
              : {}),
            updatedAt: now
          }
        });
        if (guildClaim.count !== 1) {
          return { state: "expired" };
        }
        await tx.guildMember.create({
          data: {
            guildId: invite.guildId,
            userId: actor.id,
            activeUserKey: actor.id,
            role: "member",
            joinedAt: now,
            createdAt: now,
            updatedAt: now
          }
        });
        await tx.guildInvite.update({
          where: { id: invite.id },
          data: { status: "accepted", activeKey: null, respondedAt: now, updatedAt: now }
        });
        await terminalizeIncomingInvites(tx, actor.id, now, invite.id);
        await tx.guildInviteOptIn.deleteMany({ where: { userId: actor.id } });
        await appendAudit(tx, {
          guildId: invite.guildId,
          eventType: "invite.accepted",
          actorUserId: actor.id,
          subjectUserId: actor.id,
          dedupeKey: `guild:${invite.guildId}:invite:${invite.id}:accepted`,
          payload: null,
          occurredAt: now
        });
        if (activating) {
          await appendAudit(tx, {
            guildId: invite.guildId,
            eventType: "guild.created",
            actorUserId: invite.guild.founderUserId,
            subjectUserId: invite.guild.founderUserId,
            dedupeKey: `guild:${invite.guildId}:created`,
            payload: null,
            occurredAt: now
          });
        }
        const guild = await findGuildViewById(tx, invite.guildId);
        if (!guild) {
          throw new Error("Accepted guild disappeared before replay view.");
        }
        const founderCharacter = activating
          ? await tx.character.findUnique({ where: { userId: invite.guild.founderUserId }, select: { id: true } })
          : null;
        return {
          state: "accepted",
          guild: mapGuildView(guild, actor.id, 0),
          characterId: actor.character.id,
          activatedFounderCharacterId: founderCharacter?.id ?? null,
          notification: inviteResponseNotification(invite)
        };
      });
    } catch (error) {
      if (!isUniqueConflict(error)) {
        throw error;
      }
      return this.resolveInviteResponseConflict(telegramUserId, token, now);
    }
  }

  private async resolveCreationConflict(
    telegramUserId: bigint,
    token: string,
    now: Date
  ): Promise<GuildCreationConfirmRepositoryResult> {
    return this.serializable(async (tx) => {
      await maintainGuildState(tx, now);
      const actor = await findActor(tx, telegramUserId);
      if (!actor?.character) {
        return { state: "no-character" };
      }
      const membership = await currentLiveMembership(tx, actor, now);
      const intent = await tx.guildCreationIntent.findUnique({ where: { token } });
      if (!intent || intent.userId !== actor.id) {
        return { state: "not-found" };
      }
      if (intent.status === "completed" && intent.guildId) {
        const guild = await findGuildViewById(tx, intent.guildId);
        if (guild && isLiveGuildStatus(guild.status) && membership?.guildId === guild.id) {
          return { state: "replayed", guild: mapGuildView(guild, actor.id, 0), characterId: actor.character.id };
        }
      }
      if (membership) {
        return { state: "already-member" };
      }
      const reservation = await tx.guild.findUnique({ where: { reservationKey: intent.normalizedName } });
      if (reservation) {
        await tx.guildCreationIntent.updateMany({
          where: { id: intent.id, status: "pending" },
          data: { status: "conflict", activeUserKey: null, updatedAt: now }
        });
        return { state: "name-taken" };
      }
      if (intent.crestKind === "catalog") {
        const crestOwner = await tx.guild.findUnique({ where: { crestReservationKey: intent.crest } });
        if (crestOwner) {
          await tx.guildCreationIntent.updateMany({
            where: { id: intent.id, status: "pending" },
            data: { status: "conflict", activeUserKey: null, updatedAt: now }
          });
          return { state: "crest-taken" };
        }
      }
      const cooldown = await tx.guildFounderCooldown.findUnique({ where: { userId: actor.id } });
      if (cooldown?.availableAt && cooldown.availableAt > now) {
        return { state: "founder-cooldown", availableAt: cooldown.availableAt, now };
      }
      return { state: "not-found" };
    });
  }

  private async resolveInviteConflict(
    telegramUserId: bigint,
    targetToken: string,
    now: Date
  ): Promise<GuildInviteCreateRepositoryResult> {
    return this.serializable(async (tx) => {
      const actor = await findActor(tx, telegramUserId);
      if (!actor?.character) {
        return { state: "no-character" };
      }
      const membership = await currentLiveMembership(tx, actor, now);
      if (!membership) {
        return { state: "not-member" };
      }
      const optIn = await tx.guildInviteOptIn.findUnique({
        where: { token: targetToken },
        include: { user: { select: { id: true, telegramUserId: true } } }
      });
      if (!optIn || optIn.expiresAt <= now) {
        return { state: "target-unavailable" };
      }
      if (await hasCurrentLiveMembership(tx, optIn.user.id, now)) {
        return { state: "target-unavailable" };
      }
      const invite = await tx.guildInvite.findUnique({
        where: { activeKey: inviteActiveKey(membership.guildId, optIn.user.id) },
        include: incomingInviteInclude
      });
      return invite
        ? { state: "replayed", invite: mapInvite(invite), deliveryTelegramUserId: optIn.user.telegramUserId }
        : { state: "target-unavailable" };
    });
  }

  private async resolveInviteResponseConflict(
    telegramUserId: bigint,
    token: string,
    now: Date
  ): Promise<GuildInviteRespondRepositoryResult> {
    return this.serializable(async (tx) => {
      const actor = await findActor(tx, telegramUserId);
      if (!actor?.character) {
        return { state: "no-character" };
      }
      const invite = await tx.guildInvite.findUnique({ where: { token }, include: incomingInviteInclude });
      if (!invite) {
        return { state: "not-found" };
      }
      if (await terminalizeGuildIfDue(tx, invite.guild, now)) {
        return { state: "expired" };
      }
      await currentLiveMembership(tx, actor, now);
      const currentActor = await findActor(tx, telegramUserId);
      return currentActor?.character ? canonicalInviteResult(tx, invite, currentActor) : { state: "no-character" };
    });
  }

  private async serializable<T>(operation: (tx: TxClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5_000,
          timeout: 10_000
        });
      } catch (error) {
        if (!isWriteConflict(error) || attempt === 2) {
          throw error;
        }
      }
    }
    throw new Error("Guild transaction retry loop exhausted unexpectedly.");
  }
}

async function findActor(client: TxClient | PrismaClient, telegramUserId: bigint): Promise<ActorRow | null> {
  return client.user.findUnique({ where: { telegramUserId }, include: actorInclude });
}

async function findPublicViewer(client: PrismaClient, telegramUserId: bigint) {
  return client.user.findUnique({
    where: { telegramUserId },
    select: {
      lastSeenLocationId: true,
      character: { select: { id: true } }
    }
  });
}

function activeMembership(actor: ActorRow | null | undefined): ActiveMembership | null {
  return actor?.guildMemberships[0] ?? null;
}

async function currentLiveMembership(
  tx: TxClient,
  actor: ActorRow | null | undefined,
  now: Date
): Promise<ActiveMembership | null> {
  const membership = activeMembership(actor);
  if (!membership || !isLiveGuildStatus(membership.guild.status)) {
    return null;
  }
  return await terminalizeGuildIfDue(tx, membership.guild, now) ? null : membership;
}

async function hasCurrentLiveMembership(tx: TxClient, userId: string, now: Date): Promise<boolean> {
  const membership = await tx.guildMember.findUnique({
    where: { activeUserKey: userId },
    select: {
      guild: {
        select: {
          id: true,
          status: true,
          version: true,
          charterExpiresAt: true,
          founderUserId: true
        }
      }
    }
  });
  if (!membership || !isLiveGuildStatus(membership.guild.status)) {
    return false;
  }
  return !(await terminalizeGuildIfDue(tx, membership.guild, now));
}

async function findGuildViewById(
  client: TxClient | PrismaClient,
  guildId: string
): Promise<GuildViewRow | null> {
  return client.guild.findUnique({ where: { id: guildId }, include: guildViewInclude });
}

function mapGuildView(row: GuildViewRow, viewerUserId: string, requestedPage: number): GuildViewRecord {
  const viewer = row.members.find((member) => member.userId === viewerUserId);
  if (!viewer || !isGuildRole(viewer.role) || !isLiveGuildStatus(row.status)) {
    throw new Error("Guild view requested for a non-member viewer.");
  }
  const rowPage = pageRows([
    ...mapUniqueGuildMembers(row.members).map((member) => ({ kind: "member" as const, member })),
    ...row.invites.map((invite) => ({ kind: "invite" as const, invite }))
  ], requestedPage);
  return {
    id: row.id,
    displayName: row.displayName,
    normalizedName: row.normalizedName,
    crest: row.crest,
    crestKind: crestKind(row.crestKind),
    hasCustomCrest: row.crestKind === "custom",
    description: row.description,
    status: row.status,
    charterExpiresAt: row.charterExpiresAt,
    version: row.version,
    viewerRole: viewer.role,
    memberCount: row.members.length,
    members: rowPage.rows.flatMap((entry) => entry.kind === "member" ? [entry.member] : []),
    outgoingInvites: rowPage.rows.flatMap((entry) =>
      entry.kind === "invite" ? [mapInviteForGuildView(row, entry.invite, viewer)] : []
    ),
    page: rowPage.page,
    hasPreviousPage: rowPage.page > 0,
    hasNextPage: rowPage.hasNext,
    leadershipNomineeName: row.leadershipNomineeUser?.character?.name ?? null,
    viewerIsLeadershipNominee: row.leadershipNomineeUserId === viewerUserId
  };
}

function mapUniqueGuildMembers(rows: GuildViewRow["members"]): GuildViewRecord["members"] {
  const members = new Map<string, GuildViewRecord["members"][number]>();
  for (const member of rows) {
    if (!members.has(member.id)) {
      members.set(member.id, {
        id: member.id,
        name: currentMemberName(member),
        role: isGuildRole(member.role) ? member.role : "member"
      });
    }
  }
  return [...members.values()];
}

function mapInviteForGuildView(
  row: GuildViewRow,
  invite: GuildViewRow["invites"][number],
  viewer: GuildViewRow["members"][number]
): GuildInviteRecord {
  return mapInvite({
    ...invite,
    guild: {
      displayName: row.displayName,
      crest: row.crest
    }
  }, viewer.role === "leader" || (
    viewer.role === "officer" &&
    invite.inviterUserId === viewer.userId &&
    invite.inviterMembershipId === viewer.id
  ));
}

function mapInvite(row: {
  token: string;
  guildId: string;
  targetName: string;
  status: string;
  expiresAt: Date;
  guild: { displayName: string; crest: string };
}, canCancel = false): GuildInviteRecord {
  return {
    token: row.token,
    guildId: row.guildId,
    guildName: row.guild.displayName,
    guildCrest: row.guild.crest,
    targetName: row.targetName,
    canCancel,
    status: isInviteStatus(row.status) ? row.status : "expired",
    expiresAt: row.expiresAt
  };
}

async function maintainGuildState(tx: TxClient, now: Date): Promise<void> {
  const expired = await tx.guild.findMany({
    where: { status: "forming", charterExpiresAt: { lte: now } },
    orderBy: [{ charterExpiresAt: "asc" }, { id: "asc" }],
    take: CLEANUP_BATCH,
    select: { id: true, status: true, version: true, charterExpiresAt: true, founderUserId: true }
  });
  for (const guild of expired) {
    await terminalizeGuildIfDue(tx, guild, now);
  }
  await tx.guild.updateMany({
    where: {
      status: { in: ["expired", "disbanded"] },
      reservationKey: { not: null },
      nameReleaseAt: { lte: now }
    },
    data: { reservationKey: null, updatedAt: now }
  });
  await tx.guild.updateMany({
    where: { status: { in: ["expired", "disbanded"] }, crestReservationKey: { not: null } },
    data: { crestReservationKey: null, updatedAt: now }
  });
}

function mapCreationIntent(
  intent: {
    token: string;
    displayName: string;
    normalizedName: string;
    crest: string;
    crestKind: string;
    description: string;
    goldCost: number;
    expiresAt: Date;
  },
  availableGold: number
): GuildCreationIntentRecord {
  return {
    token: intent.token,
    displayName: intent.displayName,
    normalizedName: intent.normalizedName,
    crest: intent.crest,
    crestKind: crestKind(intent.crestKind),
    hasCustomCrest: intent.crestKind === "custom",
    description: intent.description,
    goldCost: intent.goldCost,
    availableGold,
    expiresAt: intent.expiresAt
  };
}

function crestMedia(row: {
  crestFileId: string | null;
  crestFileUniqueId: string | null;
  crestWidth: number | null;
  crestHeight: number | null;
  crestFileSize: number | null;
}): GuildCrestMediaInput | null {
  return row.crestFileId && row.crestFileUniqueId && row.crestWidth && row.crestHeight
    ? {
        fileId: row.crestFileId,
        fileUniqueId: row.crestFileUniqueId,
        width: row.crestWidth,
        height: row.crestHeight,
        fileSize: row.crestFileSize
      }
    : null;
}

function crestKind(value: string): "catalog" | "custom" {
  return value === "custom" ? "custom" : "catalog";
}

async function availableCatalogCrests(
  tx: TxClient,
  now: Date,
  ownGuildId: string | null
): Promise<string[]> {
  const owners = await tx.guild.findMany({
    where: { crestReservationKey: { in: [...GUILD_CREST_CATALOG] } },
    select: {
      id: true,
      crestReservationKey: true,
      status: true,
      version: true,
      charterExpiresAt: true,
      founderUserId: true
    }
  });
  for (const owner of owners) {
    await terminalizeGuildIfDue(tx, owner, now);
  }
  const current = await tx.guild.findMany({
    where: {
      crestReservationKey: { in: [...GUILD_CREST_CATALOG] },
      status: { in: ["forming", "active"] }
    },
    select: { id: true, crestReservationKey: true }
  });
  const reserved = new Set(current.filter((row) => row.id !== ownGuildId).map((row) => row.crestReservationKey));
  return GUILD_CREST_CATALOG.filter((crest) => !reserved.has(crest));
}

async function releaseSpecificCrestReservationIfDue(
  tx: TxClient,
  crest: string,
  now: Date,
  ownGuildId: string | null = null
): Promise<boolean> {
  const owner = await tx.guild.findUnique({
    where: { crestReservationKey: crest },
    select: {
      id: true,
      status: true,
      version: true,
      charterExpiresAt: true,
      founderUserId: true
    }
  });
  if (!owner || owner.id === ownGuildId) {
    return true;
  }
  await terminalizeGuildIfDue(tx, owner, now);
  const current = await tx.guild.findUnique({ where: { id: owner.id }, select: { crestReservationKey: true } });
  return current?.crestReservationKey !== crest;
}

async function releaseSpecificNameReservationIfDue(
  tx: TxClient,
  normalizedName: string,
  now: Date
): Promise<boolean> {
  const owner = await tx.guild.findUnique({
    where: { reservationKey: normalizedName },
    select: {
      id: true,
      status: true,
      version: true,
      charterExpiresAt: true,
      founderUserId: true,
      nameReleaseAt: true
    }
  });
  if (!owner) {
    return true;
  }
  await terminalizeGuildIfDue(tx, owner, now);
  const released = await tx.guild.updateMany({
    where: {
      id: owner.id,
      reservationKey: normalizedName,
      status: { in: ["expired", "disbanded"] },
      nameReleaseAt: { lte: now }
    },
    data: { reservationKey: null, updatedAt: now }
  });
  if (released.count === 1) {
    return true;
  }
  const current = await tx.guild.findUnique({
    where: { id: owner.id },
    select: { reservationKey: true }
  });
  return current?.reservationKey !== normalizedName;
}

async function terminalizeGuildIfDue(
  tx: TxClient,
  guild: GuildLifecycleSnapshot,
  now: Date
): Promise<boolean> {
  if (guild.status !== "forming" || guild.charterExpiresAt > now) {
    return false;
  }
  const claimed = await tx.guild.updateMany({
    where: { id: guild.id, status: "forming", version: guild.version, charterExpiresAt: { lte: now } },
    data: {
      status: "expired",
      version: { increment: 1 },
      leadershipNomineeUserId: null,
      leadershipOfferedAt: null,
      crestReservationKey: null,
      updatedAt: now
    }
  });
  if (claimed.count !== 1) {
    const current = await tx.guild.findUnique({
      where: { id: guild.id },
      select: { status: true, charterExpiresAt: true }
    });
    return !current || !isLiveGuildStatus(current.status) ||
      (current.status === "forming" && current.charterExpiresAt <= now);
  }
  await tx.guildMember.updateMany({
    where: { guildId: guild.id, activeUserKey: { not: null } },
    data: { activeUserKey: null, leftAt: now, updatedAt: now }
  });
  await tx.guildInvite.updateMany({
    where: { guildId: guild.id, status: "pending" },
    data: { status: "expired", activeKey: null, respondedAt: now, updatedAt: now }
  });
  await appendAudit(tx, {
    guildId: guild.id,
    eventType: "charter.expired",
    actorUserId: null,
    subjectUserId: guild.founderUserId,
    dedupeKey: `guild:${guild.id}:charter-expired`,
    payload: null,
    occurredAt: now
  });
  return true;
}

async function maintainCreationIntents(tx: TxClient, now: Date): Promise<void> {
  await expireCreationIntents(tx, now);
  const cutoff = new Date(now.getTime() - INTENT_RETENTION_MS);
  const oldRows = await tx.guildCreationIntent.findMany({
    where: { activeUserKey: null, status: { in: ["completed", "expired", "conflict", "cancelled"] }, updatedAt: { lt: cutoff } },
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    take: CLEANUP_BATCH,
    select: { id: true }
  });
  if (oldRows.length > 0) {
    await tx.guildCreationIntent.deleteMany({ where: { id: { in: oldRows.map((row) => row.id) } } });
  }
}

async function maintainCrestUploadDrafts(tx: TxClient, now: Date): Promise<void> {
  await tx.guildCrestUploadDraft.updateMany({
    where: { status: { in: ["pending", "uploaded"] }, expiresAt: { lte: now } },
    data: { status: "expired", activeUserKey: null, updatedAt: now }
  });
  const cutoff = new Date(now.getTime() - UPLOAD_DRAFT_RETENTION_MS);
  const oldRows = await tx.guildCrestUploadDraft.findMany({
    where: { activeUserKey: null, status: { in: ["expired", "consumed"] }, updatedAt: { lt: cutoff } },
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    take: CLEANUP_BATCH,
    select: { id: true }
  });
  if (oldRows.length > 0) {
    await tx.guildCrestUploadDraft.deleteMany({ where: { id: { in: oldRows.map((row) => row.id) } } });
  }
}

async function expireCreationIntents(tx: TxClient, now: Date): Promise<void> {
  await tx.guildCreationIntent.updateMany({
    where: { status: "pending", expiresAt: { lte: now } },
    data: { status: "expired", activeUserKey: null, updatedAt: now }
  });
}

async function getIncomingInvites(tx: TxClient, userId: string, now: Date): Promise<IncomingInviteRow[]> {
  const invites = await tx.guildInvite.findMany({
    where: { targetUserId: userId, status: "pending", guild: { status: { in: ["forming", "active"] } } },
    include: incomingInviteInclude,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  });
  const live: IncomingInviteRow[] = [];
  for (const invite of invites) {
    if (!await terminalizeGuildIfDue(tx, invite.guild, now)) {
      live.push(invite);
    }
  }
  return live;
}

async function expireInvitesForUser(tx: TxClient, userId: string, now: Date): Promise<void> {
  await tx.guildInvite.updateMany({
    where: {
      status: "pending",
      expiresAt: { lte: now },
      OR: [{ targetUserId: userId }, { inviterUserId: userId }]
    },
    data: { status: "expired", activeKey: null, respondedAt: now, updatedAt: now }
  });
}

async function expireGuildInvites(tx: TxClient, guildId: string, now: Date): Promise<void> {
  await tx.guildInvite.updateMany({
    where: { guildId, status: "pending", expiresAt: { lte: now } },
    data: { status: "expired", activeKey: null, respondedAt: now, updatedAt: now }
  });
}

async function terminalizeIncomingInvites(
  tx: TxClient,
  userId: string,
  now: Date,
  exceptInviteId?: string
): Promise<void> {
  await tx.guildInvite.updateMany({
    where: {
      targetUserId: userId,
      status: "pending",
      ...(exceptInviteId ? { id: { not: exceptInviteId } } : {})
    },
    data: { status: "cancelled", activeKey: null, respondedAt: now, updatedAt: now }
  });
}

async function getInviteRateLimit(tx: TxClient, inviterUserId: string, now: Date): Promise<Date | null> {
  const windowStart = new Date(now.getTime() - INVITE_WINDOW_MS);
  const recent = await tx.guildInvite.findMany({
    where: { inviterUserId, createdAt: { gt: windowStart } },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
    take: INVITE_WINDOW_CAP
  });
  return recent.length >= INVITE_WINDOW_CAP
    ? new Date(recent[0]!.createdAt.getTime() + INVITE_WINDOW_MS)
    : null;
}

async function canonicalInviteResult(
  client: TxClient | PrismaClient,
  invite: IncomingInviteRow,
  actor: ActorRow
): Promise<GuildInviteRespondRepositoryResult> {
  const membership = activeMembership(actor);
  if (invite.status === "accepted" && membership?.guildId === invite.guildId) {
    const guild = await findGuildViewById(client, invite.guildId);
    if (!guild || !actor.character || !isLiveGuildStatus(guild.status)) {
      return { state: "not-found" };
    }
    const founderCharacter = guild.activatedByInviteId === invite.id
      ? await client.character.findUnique({ where: { userId: guild.founderUserId }, select: { id: true } })
      : null;
    return {
      state: "replayed",
      guild: mapGuildView(guild, actor.id, 0),
      characterId: actor.character.id,
      activatedFounderCharacterId: founderCharacter?.id ?? null
    };
  }
  if (invite.status === "declined" || invite.status === "cancelled") {
    return invite.status === "declined"
      ? { state: "declined", transitioned: false }
      : { state: "cancelled" };
  }
  if (invite.status === "expired") {
    return { state: "expired" };
  }
  return membership ? { state: "already-in-guild" } : { state: "not-found" };
}

function inviteResponseNotification(invite: IncomingInviteRow) {
  return {
    inviterTelegramUserId: invite.inviterUser.telegramUserId,
    targetName: invite.targetName,
    guildName: invite.guild.displayName,
    guildCrest: invite.guild.crest
  };
}

async function getMutationContext(
  tx: TxClient,
  telegramUserId: bigint,
  memberId: string,
  now: Date
): Promise<
  | { state: "no-character" | "not-member" | "not-found" }
  | { state: "ready"; actor: ActorRow; actorMembership: ActiveMembership; guild: GuildViewRow; target: GuildViewRow["members"][number] }
> {
  const actor = await findActor(tx, telegramUserId);
  if (!actor?.character) {
    return { state: "no-character" };
  }
  const membership = await currentLiveMembership(tx, actor, now);
  if (!membership || !isLiveGuildStatus(membership.guild.status)) {
    return { state: "not-member" };
  }
  const guild = await findGuildViewById(tx, membership.guildId);
  const target = guild?.members.find((member) => member.id === memberId);
  return guild && target
    ? { state: "ready", actor, actorMembership: membership, guild, target }
    : { state: "not-found" };
}

async function getPartyContext(
  tx: TxClient,
  telegramUserId: bigint,
  partySessionId: string,
  now: Date
): Promise<
  | { state: "no-character" | "not-member" | "not-party-leader" | "party-ineligible" }
  | {
      state: "ready";
      actor: ActorRow;
      guild: Prisma.GuildGetPayload<{
        include: {
          members: {
            where: { activeUserKey: { not: null } };
            include: {
              user: {
                select: {
                  telegramUserId: true;
                  character: {
                    select: {
                      id: true;
                      name: true;
                      activeCombatLease: { select: { id: true } };
                      partyParticipants: { where: { activeMembershipKey: { not: null }; status: "joined" }; select: { id: true }; take: 1 };
                    }
                  };
                }
              };
            };
            orderBy: [{ joinedAt: "asc" }, { id: "asc" }];
          };
        };
      }>;
      party: Prisma.PartySessionGetPayload<{ include: { participants: { select: { characterId: true; status: true } } } }>;
    }
> {
  const actor = await findActor(tx, telegramUserId);
  if (!actor?.character) {
    return { state: "no-character" };
  }
  const membership = await currentLiveMembership(tx, actor, now);
  if (!membership || membership.guild.status !== "active") {
    return { state: "not-member" };
  }
  const party = await tx.partySession.findUnique({
    where: { id: partySessionId },
    include: { participants: { select: { characterId: true, status: true } } }
  });
  if (!party || party.leaderCharacterId !== actor.character.id) {
    return { state: "not-party-leader" };
  }
  if (
    party.status !== "recruiting" ||
    party.joinUntilAt <= now ||
    party.expiresAt <= now ||
    !isRealGameplayParty(party)
  ) {
    return { state: "party-ineligible" };
  }
  const guild = await tx.guild.findUnique({
    where: { id: membership.guildId },
    include: {
      members: {
        where: { activeUserKey: { not: null } },
        include: {
          user: {
            select: {
              telegramUserId: true,
              character: {
                select: {
                  id: true,
                  name: true,
                  activeCombatLease: { select: { id: true } },
                  partyParticipants: {
                    where: { activeMembershipKey: { not: null }, status: "joined" },
                    select: { id: true },
                    take: 1
                  }
                }
              }
            }
          }
        },
        orderBy: [{ joinedAt: "asc" }, { id: "asc" }]
      }
    }
  });
  return guild?.status === "active"
    ? { state: "ready", actor, guild, party }
    : { state: "not-member" };
}

function isRealGameplayParty(party: { originKind: string | null; originLocationId: string | null }): boolean {
  return party.originKind === LEFT_PASSAGE_PARTY_ORIGIN_KIND || party.originLocationId === BIG_BARREL_PARTY_ORIGIN_LOCATION_ID;
}

async function claimGuildVersion(
  tx: TxClient,
  guildId: string,
  expectedVersion: number,
  now: Date
): Promise<boolean> {
  const claimed = await tx.guild.updateMany({
    where: {
      id: guildId,
      version: expectedVersion,
      OR: [
        { status: "active" },
        { status: "forming", charterExpiresAt: { gt: now } }
      ]
    },
    data: { version: { increment: 1 }, updatedAt: now }
  });
  return claimed.count === 1;
}

async function updatedGuildResult(
  tx: TxClient,
  guildId: string,
  viewerUserId: string
): Promise<GuildMemberMutationRepositoryResult> {
  const guild = await findGuildViewById(tx, guildId);
  return guild && isLiveGuildStatus(guild.status)
    ? { state: "updated", guild: mapGuildView(guild, viewerUserId, 0) }
    : { state: "not-found" };
}

async function closeMembership(tx: TxClient, membershipId: string, now: Date): Promise<void> {
  await tx.guildMember.update({
    where: { id: membershipId },
    data: { activeUserKey: null, leftAt: now, updatedAt: now }
  });
}

async function softDisbandGuild(
  tx: TxClient,
  guildId: string,
  actorUserId: string,
  version: number,
  now: Date
): Promise<void> {
  await appendAudit(tx, {
    guildId,
    eventType: "guild.disbanded",
    actorUserId,
    subjectUserId: null,
    dedupeKey: `guild:${guildId}:disbanded:v${version}`,
    payload: null,
    occurredAt: now
  });
  await tx.guildInvite.updateMany({
    where: { guildId, status: "pending" },
    data: { status: "cancelled", activeKey: null, respondedAt: now, updatedAt: now }
  });
  await tx.guildMember.updateMany({
    where: { guildId, activeUserKey: { not: null } },
    data: { activeUserKey: null, leftAt: now, updatedAt: now }
  });
  await tx.guild.update({
    where: { id: guildId },
    data: {
      status: "disbanded",
      disbandedAt: now,
      crestReservationKey: null,
      nameReleaseAt: new Date(now.getTime() + DISBANDED_NAME_HOLD_MS),
      leadershipNomineeUserId: null,
      leadershipOfferedAt: null,
      updatedAt: now
    }
  });
}

async function appendAudit(
  tx: TxClient,
  input: {
    guildId: string;
    eventType: string;
    actorUserId: string | null;
    subjectUserId: string | null;
    dedupeKey: string;
    payload: Prisma.InputJsonObject | null;
    occurredAt: Date;
  }
): Promise<void> {
  await tx.guildAudit.upsert({
    where: { dedupeKey: input.dedupeKey },
    create: {
      guildId: input.guildId,
      eventType: input.eventType,
      actorUserId: input.actorUserId,
      subjectUserId: input.subjectUserId,
      dedupeKey: input.dedupeKey,
      ...(input.payload ? { payloadJson: input.payload } : {}),
      occurredAt: input.occurredAt
    },
    update: {}
  });
}

function currentMemberName(member: GuildViewRow["members"][number]): string {
  return member.user.character?.name ?? "Пригодник без чинного персонажа";
}

function inviteActiveKey(guildId: string, targetUserId: string): string {
  return `guild-invite:${guildId}:${targetUserId}`;
}

function pageRows<T>(rows: readonly T[], requestedPage: number): { rows: T[]; page: number; hasNext: boolean } {
  const maxPage = Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1);
  const page = Math.min(maxPage, Math.max(0, Math.floor(requestedPage)));
  const start = page * PAGE_SIZE;
  return { rows: rows.slice(start, start + PAGE_SIZE), page, hasNext: start + PAGE_SIZE < rows.length };
}

function isLiveGuildStatus(value: string): value is "forming" | "active" {
  return value === "forming" || value === "active";
}

function isGuildRole(value: string): value is GuildRole {
  return value === "leader" || value === "officer" || value === "member";
}

function isInviteStatus(value: string): value is GuildInviteRecord["status"] {
  return value === "pending" || value === "accepted" || value === "declined" || value === "cancelled" || value === "expired";
}

function isUniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function isWriteConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

class InsufficientGuildGoldError extends Error {
  constructor(readonly required: number, readonly available: number) {
    super("Guild creation gold changed before the conditional debit.");
  }
}
