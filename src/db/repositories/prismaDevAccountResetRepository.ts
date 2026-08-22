import type { Prisma, PrismaClient } from "@prisma/client";
import type { DevAccountResetRepository } from "./devAccountResetRepository";

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
