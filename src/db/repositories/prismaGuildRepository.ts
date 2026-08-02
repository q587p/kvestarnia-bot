import { Prisma, type PrismaClient } from "@prisma/client";
import { GUILD_MAX_MEMBERS, type GuildRole } from "../../domain/guild";
import type {
  GuildCreationConfirmRepositoryResult,
  GuildCreationPreviewRepositoryResult,
  GuildFunnelCounters,
  GuildHubRepositoryResult,
  GuildInviteCreateRepositoryResult,
  GuildInviteRecord,
  GuildInviteRespondRepositoryResult,
  GuildMemberMutationRepositoryResult,
  GuildPartyAudienceRepositoryResult,
  GuildRepository,
  GuildViewRecord
} from "./guildRepository";

type TxClient = Prisma.TransactionClient;

const guildViewInclude = {
  members: {
    include: {
      user: {
        select: {
          character: {
            select: {
              name: true
            }
          }
        }
      }
    },
    orderBy: [{ joinedAt: "asc" as const }, { id: "asc" as const }]
  },
  invites: {
    where: { status: "pending" },
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }]
  }
} satisfies Prisma.GuildInclude;

type GuildViewRow = Prisma.GuildGetPayload<{ include: typeof guildViewInclude }>;

const incomingInviteInclude = {
  guild: { select: { id: true, displayName: true, crest: true, status: true, version: true } }
} satisfies Prisma.GuildInviteInclude;

type IncomingInviteRow = Prisma.GuildInviteGetPayload<{ include: typeof incomingInviteInclude }>;

const actorInclude = {
  character: {
    select: {
      id: true,
      name: true,
      gold: true,
      _count: { select: { remorts: true } }
    }
  },
  guildMembership: {
    include: {
      guild: { include: guildViewInclude }
    }
  }
} satisfies Prisma.UserInclude;

type ActorRow = Prisma.UserGetPayload<{ include: typeof actorInclude }>;

const INVITE_COOLDOWN_MS = 23_000;
const INVITE_WINDOW_MS = 60 * 60 * 1000;
const INVITE_WINDOW_CAP = 13;

export class PrismaGuildRepository implements GuildRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createIntentForTelegramUser(
    telegramUserId: bigint,
    input: {
      token: string;
      displayName: string;
      normalizedName: string;
      crest: string;
      description: string;
      goldCost: number;
      now: Date;
      expiresAt: Date;
    }
  ): Promise<GuildCreationPreviewRepositoryResult> {
    return this.serializable(async (tx) => {
      const actor = await findActor(tx, telegramUserId);
      if (!actor?.character) {
        return { state: "no-character" };
      }
      if (actor.guildMembership?.guild.status === "active") {
        return { state: "already-member" };
      }

      const intent = await tx.guildCreationIntent.create({
        data: {
          token: input.token,
          userId: actor.id,
          characterId: actor.character.id,
          remortCount: actor.character._count.remorts,
          normalizedName: input.normalizedName,
          displayName: input.displayName,
          crest: input.crest,
          description: input.description,
          goldCost: input.goldCost,
          status: "pending",
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
          description: intent.description,
          goldCost: intent.goldCost,
          availableGold: actor.character.gold,
          expiresAt: intent.expiresAt
        }
      };
    });
  }

  async confirmCreateForTelegramUser(
    telegramUserId: bigint,
    token: string,
    now: Date
  ): Promise<GuildCreationConfirmRepositoryResult> {
    try {
      return await this.serializable(async (tx): Promise<GuildCreationConfirmRepositoryResult> => {
        const actor = await findActor(tx, telegramUserId);
        if (!actor?.character) {
          return { state: "no-character" };
        }
        const intent = await tx.guildCreationIntent.findUnique({ where: { token } });
        if (!intent || intent.userId !== actor.id) {
          return { state: "not-found" };
        }
        if (intent.status === "completed") {
          const guild = intent.guildId ? await findGuildViewById(tx, intent.guildId) : null;
          return guild && guild.status === "active"
            ? { state: "replayed", guild: mapGuildView(guild, actor.id), characterId: actor.character.id }
            : { state: "not-found" };
        }
        if (intent.status === "expired" || intent.expiresAt <= now) {
          await tx.guildCreationIntent.updateMany({
            where: { id: intent.id, status: "pending" },
            data: { status: "expired", updatedAt: now }
          });
          return { state: "expired" };
        }
        if (
          intent.characterId !== actor.character.id ||
          intent.remortCount !== actor.character._count.remorts
        ) {
          return { state: "stale-life" };
        }
        if (actor.guildMembership?.guild.status === "active") {
          return { state: "already-member" };
        }
        const existingName = await tx.guild.findUnique({ where: { normalizedName: intent.normalizedName } });
        if (existingName) {
          return { state: "name-taken" };
        }
        if (actor.character.gold < intent.goldCost) {
          return { state: "insufficient-gold", required: intent.goldCost, available: actor.character.gold };
        }

        const charged = await tx.character.updateMany({
          where: { id: actor.character.id, gold: { gte: intent.goldCost } },
          data: { gold: { decrement: intent.goldCost } }
        });
        if (charged.count !== 1) {
          const current = await tx.character.findUnique({ where: { id: actor.character.id }, select: { gold: true } });
          return { state: "insufficient-gold", required: intent.goldCost, available: current?.gold ?? 0 };
        }

        const guild = await tx.guild.create({
          data: {
            normalizedName: intent.normalizedName,
            displayName: intent.displayName,
            crest: intent.crest,
            description: intent.description,
            leaderUserId: actor.id,
            status: "active",
            version: 1,
            createdAt: now,
            updatedAt: now,
            members: {
              create: {
                userId: actor.id,
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
          data: { status: "completed", guildId: guild.id, completedAt: now, updatedAt: now }
        });
        await appendAudit(tx, {
          guildId: guild.id,
          eventType: "guild.created",
          actorUserId: actor.id,
          subjectUserId: actor.id,
          dedupeKey: `guild:${guild.id}:created`,
          payload: { normalizedName: intent.normalizedName, goldCost: intent.goldCost },
          occurredAt: now
        });
        const view = await findGuildViewById(tx, guild.id);
        if (!view) {
          throw new Error("Created guild disappeared before replay view.");
        }
        return { state: "created", guild: mapGuildView(view, actor.id), characterId: actor.character.id };
      });
    } catch (error) {
      if (!isUniqueConflict(error)) {
        throw error;
      }
      return this.resolveCreationConflict(telegramUserId, token);
    }
  }

  async getHubForTelegramUser(telegramUserId: bigint, now: Date): Promise<GuildHubRepositoryResult> {
    return this.serializable(async (tx) => {
      const actor = await findActor(tx, telegramUserId);
      if (!actor?.character) {
        return { state: "no-character" };
      }
      await expireInvitesForUser(tx, actor.id, now);
      const incomingInvites = await getIncomingInvites(tx, actor.id);
      const membership = actor.guildMembership;
      if (!membership || membership.guild.status !== "active") {
        return { state: "not-member", incomingInvites: incomingInvites.map(mapInvite) };
      }
      const current = await findGuildViewById(tx, membership.guildId);
      return current
        ? { state: "ready", guild: mapGuildView(current, actor.id), incomingInvites: incomingInvites.map(mapInvite) }
        : { state: "not-member", incomingInvites: incomingInvites.map(mapInvite) };
    });
  }

  async createInviteForTelegramUser(
    telegramUserId: bigint,
    input: { token: string; targetName: string; now: Date; expiresAt: Date }
  ): Promise<GuildInviteCreateRepositoryResult> {
    try {
      return await this.serializable(async (tx): Promise<GuildInviteCreateRepositoryResult> => {
        const actor = await findActor(tx, telegramUserId);
        if (!actor?.character) {
          return { state: "no-character" };
        }
        const membership = actor.guildMembership;
        if (!membership || membership.guild.status !== "active") {
          return { state: "not-member" };
        }
        if (membership.role !== "leader" && membership.role !== "officer") {
          return { state: "forbidden" };
        }
        await expireGuildInvites(tx, membership.guildId, input.now);
        const targets = await tx.character.findMany({
          where: { name: input.targetName },
          select: {
            name: true,
            user: {
              select: {
                id: true,
                telegramUserId: true,
                guildMembership: { select: { guildId: true } }
              }
            }
          },
          take: 2
        });
        if (targets.length === 0) {
          return { state: "target-not-found" };
        }
        if (targets.length > 1) {
          return { state: "target-ambiguous" };
        }
        const target = targets[0]!;
        if (target.user.id === actor.id) {
          return { state: "self" };
        }
        if (target.user.guildMembership) {
          return { state: "target-already-member" };
        }
        if (membership.guild.members.length >= GUILD_MAX_MEMBERS) {
          return { state: "guild-full" };
        }
        const activeKey = inviteActiveKey(membership.guildId, target.user.id);
        const existing = await tx.guildInvite.findUnique({
          where: { activeKey },
          include: incomingInviteInclude
        });
        if (existing?.status === "pending" && existing.expiresAt > input.now) {
          return {
            state: "replayed",
            invite: mapInvite(existing),
            deliveryTelegramUserId: target.user.telegramUserId
          };
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
            targetUserId: target.user.id,
            targetName: target.name,
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
          subjectUserId: target.user.id,
          dedupeKey: `guild:${membership.guildId}:invite:${invite.id}:created`,
          payload: null,
          occurredAt: input.now
        });
        return {
          state: "created",
          invite: mapInvite(invite),
          deliveryTelegramUserId: target.user.telegramUserId
        };
      });
    } catch (error) {
      if (!isUniqueConflict(error)) {
        throw error;
      }
      const actor = await this.prisma.user.findUnique({ where: { telegramUserId }, include: actorInclude });
      const target = await this.prisma.character.findFirst({
        where: { name: input.targetName },
        select: { user: { select: { id: true, telegramUserId: true } } }
      });
      if (!actor?.guildMembership || !target) {
        return { state: "target-not-found" };
      }
      const invite = await this.prisma.guildInvite.findUnique({
        where: { activeKey: inviteActiveKey(actor.guildMembership.guildId, target.user.id) },
        include: incomingInviteInclude
      });
      return invite
        ? { state: "replayed", invite: mapInvite(invite), deliveryTelegramUserId: target.user.telegramUserId }
        : { state: "target-already-member" };
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

  async setMemberRoleForTelegramUser(
    telegramUserId: bigint,
    memberId: string,
    role: Exclude<GuildRole, "leader">,
    expectedVersion: number,
    now: Date
  ): Promise<GuildMemberMutationRepositoryResult> {
    return this.serializable(async (tx) => {
      const context = await getMutationContext(tx, telegramUserId, memberId);
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
      await tx.guildMember.update({ where: { id: context.target.id }, data: { role, updatedAt: now } });
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

  async transferLeadershipForTelegramUser(
    telegramUserId: bigint,
    memberId: string,
    expectedVersion: number,
    now: Date
  ): Promise<GuildMemberMutationRepositoryResult> {
    return this.serializable(async (tx) => {
      const context = await getMutationContext(tx, telegramUserId, memberId);
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
      await tx.guildMember.update({ where: { id: context.actorMembership.id }, data: { role: "officer", updatedAt: now } });
      await tx.guildMember.update({ where: { id: context.target.id }, data: { role: "leader", updatedAt: now } });
      await tx.guild.update({ where: { id: context.guild.id }, data: { leaderUserId: context.target.userId, updatedAt: now } });
      await appendAudit(tx, {
        guildId: context.guild.id,
        eventType: "leadership.transferred",
        actorUserId: context.actor.id,
        subjectUserId: context.target.userId,
        dedupeKey: `guild:${context.guild.id}:leadership:v${expectedVersion + 1}`,
        payload: null,
        occurredAt: now
      });
      return updatedGuildResult(tx, context.guild.id, context.actor.id);
    });
  }

  async kickMemberForTelegramUser(
    telegramUserId: bigint,
    memberId: string,
    expectedVersion: number,
    now: Date
  ): Promise<GuildMemberMutationRepositoryResult> {
    return this.serializable(async (tx) => {
      const context = await getMutationContext(tx, telegramUserId, memberId);
      if (context.state !== "ready") {
        return context;
      }
      const actorRole = context.actorMembership.role;
      if (
        context.target.userId === context.actor.id ||
        context.target.role === "leader" ||
        actorRole === "member" ||
        (actorRole === "officer" && context.target.role !== "member")
      ) {
        return { state: "forbidden" };
      }
      if (!(await claimGuildVersion(tx, context.guild.id, expectedVersion, now))) {
        return { state: "stale" };
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
      await tx.guildMember.delete({ where: { id: context.target.id } });
      await tx.guildInvite.updateMany({
        where: { guildId: context.guild.id, targetUserId: context.target.userId, status: "pending" },
        data: { status: "cancelled", activeKey: null, respondedAt: now, updatedAt: now }
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
      const membership = actor.guildMembership;
      if (!membership || membership.guild.status !== "active") {
        return { state: "not-member" };
      }
      if (!(await claimGuildVersion(tx, membership.guildId, expectedVersion, now))) {
        return { state: "stale" };
      }
      const guildName = membership.guild.displayName;
      const remaining = membership.guild.members
        .filter((member) => member.id !== membership.id)
        .sort(compareSuccessors);
      if (remaining.length === 0) {
        await softDeleteGuild(tx, membership.guildId, actor.id, expectedVersion + 1, now);
        return { state: "deleted", guildName };
      }
      let successorName: string | undefined;
      if (membership.role === "leader") {
        const successor = remaining[0]!;
        successorName = currentMemberName(successor);
        await tx.guildMember.update({ where: { id: successor.id }, data: { role: "leader", updatedAt: now } });
        await tx.guild.update({ where: { id: membership.guildId }, data: { leaderUserId: successor.userId, updatedAt: now } });
        await appendAudit(tx, {
          guildId: membership.guildId,
          eventType: "leadership.succeeded",
          actorUserId: actor.id,
          subjectUserId: successor.userId,
          dedupeKey: `guild:${membership.guildId}:succession:v${expectedVersion + 1}`,
          payload: null,
          occurredAt: now
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
      await tx.guildMember.delete({ where: { id: membership.id } });
      return { state: "left", guildName, ...(successorName ? { successorName } : {}) };
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
      const membership = actor.guildMembership;
      if (!membership || membership.guild.status !== "active") {
        return { state: "not-member" };
      }
      if (membership.role !== "leader") {
        return { state: "forbidden" };
      }
      if (!(await claimGuildVersion(tx, membership.guildId, expectedVersion, now))) {
        return { state: "stale" };
      }
      const guildName = membership.guild.displayName;
      await softDeleteGuild(tx, membership.guildId, actor.id, expectedVersion + 1, now);
      return { state: "deleted", guildName };
    });
  }

  async getPartyAudienceForTelegramUser(telegramUserId: bigint): Promise<GuildPartyAudienceRepositoryResult> {
    const actor = await this.prisma.user.findUnique({
      where: { telegramUserId },
      select: {
        id: true,
        character: { select: { id: true } },
        guildMembership: { select: { guild: { select: { id: true, displayName: true, crest: true, status: true } } } }
      }
    });
    if (!actor?.character) {
      return { state: "no-character" };
    }
    const guild = actor.guildMembership?.guild;
    if (!guild || guild.status !== "active") {
      return { state: "not-member" };
    }
    const members = await this.prisma.guildMember.findMany({
      where: { guildId: guild.id, userId: { not: actor.id } },
      select: {
        user: {
          select: {
            telegramUserId: true,
            character: {
              select: {
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
      }
    });
    return {
      state: "ready",
      audience: {
        guildId: guild.id,
        guildName: guild.displayName,
        guildCrest: guild.crest,
        recipients: members.flatMap((member) => {
          const character = member.user.character;
          return character && !character.activeCombatLease && character.partyParticipants.length === 0
            ? [{ telegramUserId: member.user.telegramUserId, name: character.name }]
            : [];
        })
      }
    };
  }

  async recordPartyCreated(
    guildId: string,
    actorTelegramUserId: bigint,
    partySessionId: string,
    now: Date
  ): Promise<void> {
    await this.serializable(async (tx) => {
      const actor = await tx.user.findUnique({
        where: { telegramUserId: actorTelegramUserId },
        select: { id: true, guildMembership: { select: { guildId: true } } }
      });
      if (actor?.guildMembership?.guildId !== guildId) {
        return;
      }
      await appendAudit(tx, {
        guildId,
        eventType: "party.created",
        actorUserId: actor.id,
        subjectUserId: null,
        dedupeKey: `guild:${guildId}:party:${partySessionId}`,
        payload: { partySessionId },
        occurredAt: now
      });
    });
  }

  async getFunnelCounters(): Promise<GuildFunnelCounters> {
    const grouped = await this.prisma.guildAudit.groupBy({
      by: ["eventType"],
      _count: { _all: true }
    });
    const counts = new Map(grouped.map((row) => [row.eventType, row._count._all]));
    return {
      guildsCreated: counts.get("guild.created") ?? 0,
      invitesCreated: counts.get("invite.created") ?? 0,
      invitesAccepted: counts.get("invite.accepted") ?? 0,
      invitesDeclined: counts.get("invite.declined") ?? 0,
      invitesCancelled: counts.get("invite.cancelled") ?? 0,
      memberLeaves: counts.get("member.left") ?? 0,
      memberKicks: counts.get("member.kicked") ?? 0,
      leadershipTransfers: (counts.get("leadership.transferred") ?? 0) + (counts.get("leadership.succeeded") ?? 0),
      partiesCreated: counts.get("party.created") ?? 0
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
        const actor = await findActor(tx, telegramUserId);
        if (!actor?.character) {
          return { state: "no-character" };
        }
        const invite = await tx.guildInvite.findUnique({
          where: { token },
          include: incomingInviteInclude
        });
        if (!invite) {
          return { state: "not-found" };
        }
        const ownsTarget = invite.targetUserId === actor.id;
        const canCancel = invite.inviterUserId === actor.id || (
          actor.guildMembership?.guildId === invite.guildId &&
          (actor.guildMembership.role === "leader" || actor.guildMembership.role === "officer")
        );
        if ((action === "cancelled" && !canCancel) || (action !== "cancelled" && !ownsTarget)) {
          return { state: "not-found" };
        }
        if (invite.status !== "pending") {
          return canonicalInviteResult(tx, invite, actor);
        }
        if (invite.expiresAt <= now || invite.guild.status !== "active") {
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
          return { state: action };
        }
        if (actor.guildMembership?.guild.status === "active") {
          return { state: "already-in-guild" };
        }
        const memberCount = await tx.guildMember.count({ where: { guildId: invite.guildId } });
        if (memberCount >= GUILD_MAX_MEMBERS) {
          return { state: "guild-full" };
        }
        const guildClaim = await tx.guild.updateMany({
          where: { id: invite.guildId, status: "active", version: invite.guild.version },
          data: { version: { increment: 1 }, updatedAt: now }
        });
        if (guildClaim.count !== 1) {
          return { state: "expired" };
        }
        await tx.guildMember.create({
          data: {
            guildId: invite.guildId,
            userId: actor.id,
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
        await tx.guildInvite.updateMany({
          where: { targetUserId: actor.id, status: "pending", id: { not: invite.id } },
          data: { status: "cancelled", activeKey: null, respondedAt: now, updatedAt: now }
        });
        await appendAudit(tx, {
          guildId: invite.guildId,
          eventType: "invite.accepted",
          actorUserId: actor.id,
          subjectUserId: actor.id,
          dedupeKey: `guild:${invite.guildId}:invite:${invite.id}:accepted`,
          payload: null,
          occurredAt: now
        });
        const guild = await findGuildViewById(tx, invite.guildId);
        if (!guild) {
          throw new Error("Accepted guild disappeared before replay view.");
        }
        return { state: "accepted", guild: mapGuildView(guild, actor.id), characterId: actor.character.id };
      });
    } catch (error) {
      if (!isUniqueConflict(error)) {
        throw error;
      }
      const actor = await this.prisma.user.findUnique({ where: { telegramUserId }, include: actorInclude });
      if (!actor?.character) {
        return { state: "no-character" };
      }
      const invite = await this.prisma.guildInvite.findUnique({ where: { token }, include: incomingInviteInclude });
      if (!invite) {
        return { state: "not-found" };
      }
      return canonicalInviteResult(this.prisma, invite, actor);
    }
  }

  private async resolveCreationConflict(
    telegramUserId: bigint,
    token: string
  ): Promise<GuildCreationConfirmRepositoryResult> {
    const actor = await this.prisma.user.findUnique({ where: { telegramUserId }, include: actorInclude });
    if (!actor?.character) {
      return { state: "no-character" };
    }
    const intent = await this.prisma.guildCreationIntent.findUnique({ where: { token } });
    if (!intent || intent.userId !== actor.id) {
      return { state: "not-found" };
    }
    if (intent.status === "completed" && intent.guildId) {
      const guild = await findGuildViewById(this.prisma, intent.guildId);
      if (guild?.status === "active") {
        return { state: "replayed", guild: mapGuildView(guild, actor.id), characterId: actor.character.id };
      }
    }
    if (actor.guildMembership?.guild.status === "active") {
      return { state: "already-member" };
    }
    const name = await this.prisma.guild.findUnique({ where: { normalizedName: intent.normalizedName } });
    return name ? { state: "name-taken" } : { state: "not-found" };
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

async function findActor(
  tx: TxClient,
  telegramUserId: bigint
): Promise<ActorRow | null> {
  return tx.user.findUnique({ where: { telegramUserId }, include: actorInclude });
}

async function findGuildViewById(
  client: TxClient | PrismaClient,
  guildId: string
): Promise<GuildViewRow | null> {
  return client.guild.findUnique({ where: { id: guildId }, include: guildViewInclude });
}

function mapGuildView(row: GuildViewRow, viewerUserId: string): GuildViewRecord {
  const viewer = row.members.find((member) => member.userId === viewerUserId);
  if (!viewer || !isGuildRole(viewer.role)) {
    throw new Error("Guild view requested for a non-member viewer.");
  }
  return {
    id: row.id,
    displayName: row.displayName,
    normalizedName: row.normalizedName,
    crest: row.crest,
    description: row.description,
    version: row.version,
    viewerRole: viewer.role,
    members: row.members.map((member) => ({
      id: member.id,
      name: currentMemberName(member),
      role: isGuildRole(member.role) ? member.role : "member"
    })),
    outgoingInvites: row.invites.map((invite) => mapInvite({
      ...invite,
      guild: { id: row.id, displayName: row.displayName, crest: row.crest, status: row.status, version: row.version }
    }))
  };
}

function mapInvite(row: IncomingInviteRow): GuildInviteRecord {
  return {
    token: row.token,
    guildId: row.guildId,
    guildName: row.guild.displayName,
    guildCrest: row.guild.crest,
    targetName: row.targetName,
    status: isInviteStatus(row.status) ? row.status : "expired",
    expiresAt: row.expiresAt
  };
}

async function getIncomingInvites(tx: TxClient, userId: string): Promise<IncomingInviteRow[]> {
  return tx.guildInvite.findMany({
    where: { targetUserId: userId, status: "pending", guild: { status: "active" } },
    include: incomingInviteInclude,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  });
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

async function getInviteRateLimit(tx: TxClient, inviterUserId: string, now: Date): Promise<Date | null> {
  const last = await tx.guildInvite.findFirst({
    where: { inviterUserId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true }
  });
  if (last && last.createdAt.getTime() + INVITE_COOLDOWN_MS > now.getTime()) {
    return new Date(last.createdAt.getTime() + INVITE_COOLDOWN_MS);
  }
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
  if (invite.status === "accepted" && actor.guildMembership?.guildId === invite.guildId) {
    const guild = await findGuildViewById(client, invite.guildId);
    return guild && actor.character
      ? { state: "replayed", guild: mapGuildView(guild, actor.id), characterId: actor.character.id }
      : { state: "not-found" };
  }
  if (invite.status === "declined" || invite.status === "cancelled") {
    return { state: invite.status };
  }
  if (invite.status === "expired") {
    return { state: "expired" };
  }
  return actor.guildMembership ? { state: "already-in-guild" } : { state: "not-found" };
}

async function getMutationContext(
  tx: TxClient,
  telegramUserId: bigint,
  memberId: string
): Promise<
  | { state: "no-character" | "not-member" | "not-found" }
  | {
      state: "ready";
      actor: ActorRow;
      actorMembership: NonNullable<ActorRow["guildMembership"]>;
      guild: GuildViewRow;
      target: GuildViewRow["members"][number];
    }
> {
  const actor = await findActor(tx, telegramUserId);
  if (!actor?.character) {
    return { state: "no-character" };
  }
  const membership = actor.guildMembership;
  if (!membership || membership.guild.status !== "active") {
    return { state: "not-member" };
  }
  const guild = await findGuildViewById(tx, membership.guildId);
  const target = guild?.members.find((member) => member.id === memberId);
  return guild && target
    ? { state: "ready", actor, actorMembership: membership, guild, target }
    : { state: "not-found" };
}

async function claimGuildVersion(
  tx: TxClient,
  guildId: string,
  expectedVersion: number,
  now: Date
): Promise<boolean> {
  const claimed = await tx.guild.updateMany({
    where: { id: guildId, status: "active", version: expectedVersion },
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
  return guild ? { state: "updated", guild: mapGuildView(guild, viewerUserId) } : { state: "not-found" };
}

async function softDeleteGuild(
  tx: TxClient,
  guildId: string,
  actorUserId: string,
  version: number,
  now: Date
): Promise<void> {
  await appendAudit(tx, {
    guildId,
    eventType: "guild.deleted",
    actorUserId,
    subjectUserId: null,
    dedupeKey: `guild:${guildId}:deleted:v${version}`,
    payload: null,
    occurredAt: now
  });
  await tx.guildInvite.updateMany({
    where: { guildId, status: "pending" },
    data: { status: "cancelled", activeKey: null, respondedAt: now, updatedAt: now }
  });
  await tx.guildMember.deleteMany({ where: { guildId } });
  await tx.guild.update({ where: { id: guildId }, data: { status: "deleted", updatedAt: now } });
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

function compareSuccessors(
  left: GuildViewRow["members"][number],
  right: GuildViewRow["members"][number]
): number {
  const roleOrder = (role: string) => role === "officer" ? 0 : 1;
  return roleOrder(left.role) - roleOrder(right.role)
    || left.joinedAt.getTime() - right.joinedAt.getTime()
    || left.id.localeCompare(right.id);
}

function currentMemberName(member: GuildViewRow["members"][number]): string {
  return member.user.character?.name ?? "Пригодник без чинного персонажа";
}

function inviteActiveKey(guildId: string, targetUserId: string): string {
  return `guild-invite:${guildId}:${targetUserId}`;
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
