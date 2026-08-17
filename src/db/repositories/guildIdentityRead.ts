import type { Prisma, PrismaClient } from "@prisma/client";

export interface GuildIdentityMembershipRead {
  leftAt: Date | null;
  activeUserKey: string | null;
  guild?: {
    crest: string;
    status: string;
    charterExpiresAt: Date;
    disbandedAt: Date | null;
  };
}

export function readLiveGuildCrest(
  memberships: readonly GuildIdentityMembershipRead[] | null | undefined,
  now: Date
): string | undefined {
  const membership = (memberships ?? []).find((candidate) =>
    candidate.leftAt === null &&
    candidate.activeUserKey !== null &&
    candidate.guild !== undefined &&
    candidate.guild.disbandedAt === null &&
    (
      candidate.guild.status === "active" ||
      (
        candidate.guild.status === "forming" &&
        candidate.guild.charterExpiresAt > now
      )
    )
  );

  return membership?.guild?.crest;
}

export async function readLiveGuildCrestsByCharacterIds(
  client: PrismaClient | Prisma.TransactionClient,
  characterIds: readonly string[],
  now: Date
): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(characterIds)];
  if (uniqueIds.length === 0) {
    return new Map();
  }

  const memberships = await client.guildMember.findMany({
    where: {
      leftAt: null,
      activeUserKey: { not: null },
      user: { character: { id: { in: uniqueIds } } },
      guild: {
        disbandedAt: null,
        OR: [
          { status: "active" },
          { status: "forming", charterExpiresAt: { gt: now } }
        ]
      }
    },
    select: {
      user: { select: { character: { select: { id: true } } } },
      guild: { select: { crest: true } }
    }
  });

  return new Map(memberships.flatMap((membership) => {
    const characterId = membership.user.character?.id;
    return characterId ? [[characterId, membership.guild.crest] as const] : [];
  }));
}
