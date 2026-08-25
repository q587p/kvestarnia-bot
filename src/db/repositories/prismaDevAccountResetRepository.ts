import type { Prisma, PrismaClient } from "@prisma/client";
import type { DevAccountResetRepository } from "./devAccountResetRepository";
import { recomputeGuildWeeklyPeriodArtifacts } from "./prismaGuildWeeklyGoalRepository";

export class PrismaDevAccountResetRepository implements DevAccountResetRepository {
  constructor(private readonly prisma: PrismaClient) {}

  deleteEverythingByTelegramUserId(telegramUserId: bigint): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { telegramUserId },
        select: {
          id: true,
          character: { select: { id: true } }
        }
      });
      if (!user) {
        return false;
      }

      const attributions = await tx.referralAttribution.findMany({
        where: {
          OR: [
            { inviterUserId: user.id },
            { inviteeUserId: user.id }
          ]
        },
        select: { id: true }
      });
      const attributionIds = attributions.map((row) => row.id);
      const rewards = await tx.referralReward.findMany({
        where: {
          OR: [
            { beneficiaryUserId: user.id },
            ...(attributionIds.length > 0 ? [{ attributionId: { in: attributionIds } }] : [])
          ]
        },
        select: { id: true }
      });
      const rewardIds = rewards.map((row) => row.id);
      const guilds = await tx.guild.findMany({
        where: {
          OR: [
            { founderUserId: user.id },
            { leaderUserId: user.id }
          ]
        },
        select: { id: true }
      });
      const guildIds = guilds.map((row) => row.id);
      const ownedWeeklyPeriods = guildIds.length > 0
        ? await tx.guildWeeklyGoalPeriod.findMany({
            where: { guildId: { in: guildIds } },
            select: {
              id: true,
              contributions: { select: { id: true, groupCombatSessionId: true } }
            }
          })
        : [];
      const ownedWeeklyPeriodIds = ownedWeeklyPeriods.map((row) => row.id);
      const ownedWeeklyContributionIds = ownedWeeklyPeriods.flatMap((row) =>
        row.contributions.map((contribution) => contribution.id)
      );
      const ownedWeeklySessionIds = ownedWeeklyPeriods.flatMap((row) =>
        row.contributions.map((contribution) => contribution.groupCombatSessionId)
      );
      const survivingDevOverridePeriods = await tx.guildWeeklyGoalPeriod.findMany({
        where: {
          devOverrideUserId: user.id,
          ...(guildIds.length > 0 ? { guildId: { notIn: guildIds } } : {})
        },
        select: { id: true }
      });
      const characterIds = user.character ? [user.character.id] : [];
      const relatedIds = new Set([
        user.id,
        ...characterIds,
        ...attributionIds,
        ...rewardIds,
        ...guildIds
      ]);

      const activityEvents = await tx.activityEvent.findMany({
        select: {
          id: true,
          actorCharacterId: true,
          relatedCharacterIds: true,
          subjectId: true,
          sourceId: true,
          dedupeKey: true,
          payloadJson: true
        }
      });
      const activityEventIds = activityEvents
        .filter((event) => activityEventReferencesAny(event, relatedIds))
        .map((event) => event.id);

      await tx.referralNotificationOutbox.deleteMany({
        where: {
          OR: [
            { recipientUserId: user.id },
            ...(attributionIds.length > 0
              ? [{ logicalKey: { in: attributionIds.map((id) => `REFERRAL_JOINED:${id}`) } }]
              : []),
            ...(rewardIds.length > 0
              ? [{ logicalKey: { in: rewardIds.map((id) => `REFERRAL_PAYOUT_GRANTED:${id}`) } }]
              : [])
          ]
        }
      });
      await tx.referralReward.deleteMany({
        where: {
          OR: [
            { beneficiaryUserId: user.id },
            ...(attributionIds.length > 0 ? [{ attributionId: { in: attributionIds } }] : [])
          ]
        }
      });
      if (attributionIds.length > 0) {
        await tx.referralAttribution.deleteMany({ where: { id: { in: attributionIds } } });
      }
      await tx.referralInviteCode.deleteMany({ where: { inviterUserId: user.id } });
      await tx.guildAudit.deleteMany({
        where: {
          OR: [
            { actorUserId: user.id },
            { subjectUserId: user.id }
          ]
        }
      });
      await tx.guildWeeklyAchievementEntitlement.deleteMany({ where: { userId: user.id } });
      await tx.guildWeeklyContributorReceipt.deleteMany({ where: { userId: user.id } });
      await tx.guildWeeklyParticipantSnapshot.deleteMany({ where: { userId: user.id } });

      if (survivingDevOverridePeriods.length > 0) {
        const periodIds = survivingDevOverridePeriods.map((row) => row.id);
        await tx.guildWeeklyGoalPeriod.updateMany({
          where: { id: { in: periodIds }, devOverrideUserId: user.id },
          data: { devOverrideCompletedAt: null, devOverrideUserId: null }
        });
        for (const periodId of periodIds) {
          await recomputeGuildWeeklyPeriodArtifacts(tx, periodId);
        }
      }

      if (ownedWeeklyPeriodIds.length > 0) {
        await tx.guildWeeklyAchievementEntitlement.deleteMany({
          where: { sourcePeriodId: { in: ownedWeeklyPeriodIds } }
        });
        await tx.guildGloryReceipt.deleteMany({ where: { periodId: { in: ownedWeeklyPeriodIds } } });
        await tx.activityEvent.deleteMany({
          where: { sourceType: "guild-weekly-goal", sourceId: { in: ownedWeeklyPeriodIds } }
        });
      }
      if (ownedWeeklyContributionIds.length > 0) {
        await tx.guildWeeklyContributorReceipt.deleteMany({
          where: { contributionId: { in: ownedWeeklyContributionIds } }
        });
        await tx.guildWeeklyContribution.deleteMany({
          where: { id: { in: ownedWeeklyContributionIds } }
        });
      }
      if (ownedWeeklyPeriodIds.length > 0) {
        await tx.guildWeeklyGoalPeriod.deleteMany({ where: { id: { in: ownedWeeklyPeriodIds } } });
      }
      if (ownedWeeklySessionIds.length > 0) {
        await tx.guildWeeklyReconciliation.deleteMany({
          where: { sessionId: { in: ownedWeeklySessionIds } }
        });
        await tx.guildWeeklyParticipantSnapshot.deleteMany({
          where: { sessionId: { in: ownedWeeklySessionIds } }
        });
        await tx.groupCombatSession.updateMany({
          where: { id: { in: ownedWeeklySessionIds } },
          data: { guildWeeklyGoalEligible: false }
        });
      }
      if (guildIds.length > 0) {
        await tx.guild.deleteMany({ where: { id: { in: guildIds } } });
      }
      if (activityEventIds.length > 0) {
        await tx.activityEvent.deleteMany({ where: { id: { in: activityEventIds } } });
      }
      await tx.playerHintReceipt.deleteMany({ where: { telegramUserId } });

      const deleted = await tx.user.deleteMany({ where: { id: user.id } });
      return deleted.count === 1;
    });
  }
}

function activityEventReferencesAny(
  event: {
    actorCharacterId: string | null;
    relatedCharacterIds: Prisma.JsonValue | null;
    subjectId: string | null;
    sourceId: string | null;
    dedupeKey: string | null;
    payloadJson: Prisma.JsonValue | null;
  },
  ids: ReadonlySet<string>
): boolean {
  if (
    (event.actorCharacterId && ids.has(event.actorCharacterId))
    || (event.subjectId && ids.has(event.subjectId))
    || (event.sourceId && ids.has(event.sourceId))
    || jsonReferencesAny(event.relatedCharacterIds, ids)
    || jsonReferencesAny(event.payloadJson, ids)
  ) {
    return true;
  }

  return Boolean(event.dedupeKey && [...ids].some((id) => event.dedupeKey!.includes(id)));
}

function jsonReferencesAny(
  value: Prisma.JsonValue | null | undefined,
  ids: ReadonlySet<string>
): boolean {
  if (typeof value === "string") {
    return ids.has(value);
  }
  if (Array.isArray(value)) {
    return value.some((entry) => jsonReferencesAny(entry, ids));
  }
  if (value && typeof value === "object") {
    return Object.values(value).some((entry) => jsonReferencesAny(entry, ids));
  }
  return false;
}
