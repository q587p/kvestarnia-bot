import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  MarkPresenceInput,
  PresenceRecord,
  PresenceRepository
} from "./presenceRepository";

const presenceSelect = {
  telegramUserId: true,
  displayName: true,
  lastActionAt: true,
  lastSeenLocationId: true,
  currentRaidId: true,
  currentAdventureId: true,
  character: {
    select: {
      name: true,
      classId: true,
      level: true,
      activeCosmeticTitleGrantId: true
    }
  },
  guildMemberships: {
    where: {
      activeUserKey: { not: null },
      guild: { status: "active" }
    },
    select: {
      guild: { select: { crest: true } }
    },
    take: 1
  }
} satisfies Prisma.UserSelect;

type SelectedPresenceUser = Prisma.UserGetPayload<{ select: typeof presenceSelect }>;

export class PrismaPresenceRepository implements PresenceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async markAction(input: MarkPresenceInput): Promise<void> {
    const presenceUpdate = buildPresenceUpdate(input);

    await this.prisma.user.upsert({
      where: {
        telegramUserId: input.user.telegramUserId
      },
      create: {
        telegramUserId: input.user.telegramUserId,
        username: input.user.username ?? null,
        displayName: input.user.displayName ?? null,
        languageCode: input.user.languageCode ?? null,
        lastActionAt: input.at,
        lastSeenLocationId: input.locationId ?? null,
        currentRaidId: input.currentRaidId ?? null,
        currentAdventureId: input.currentAdventureId ?? null
      },
      update: {
        username: input.user.username ?? null,
        displayName: input.user.displayName ?? null,
        languageCode: input.user.languageCode ?? null,
        ...presenceUpdate
      }
    });
  }

  async findByTelegramUserId(telegramUserId: bigint): Promise<PresenceRecord | null> {
    const user = await this.prisma.user.findUnique({
      where: {
        telegramUserId
      },
      select: presenceSelect
    });

    return user ? toPresenceRecord(user) : null;
  }

  async listSeenSince(since: Date): Promise<PresenceRecord[]> {
    return this.list({
      lastActionAt: {
        gte: since
      }
    });
  }

  async listKorchmaVisitors(limit: number): Promise<PresenceRecord[]> {
    return this.list(
      {
        lastActionAt: {
          not: null
        },
        OR: [
          {
            lastSeenLocationId: {
              startsWith: "location.korchma."
            }
          },
          {
            lastSeenLocationId: {
              in: ["location.tavern", "location.shawarma-table", "location.tavern-cellar"]
            }
          }
        ]
      },
      limit
    );
  }

  async listByLocationSeenSince(locationId: string, since: Date): Promise<PresenceRecord[]> {
    return this.list({
      lastActionAt: {
        gte: since
      },
      lastSeenLocationId: locationId
    });
  }

  async listByRaidSeenSince(currentRaidId: string, since: Date): Promise<PresenceRecord[]> {
    return this.list({
      lastActionAt: {
        gte: since
      },
      currentRaidId
    });
  }

  async listByAdventureSeenSince(
    currentAdventureId: string,
    since: Date
  ): Promise<PresenceRecord[]> {
    return this.list({
      lastActionAt: {
        gte: since
      },
      currentAdventureId
    });
  }

  private async list(where: Prisma.UserWhereInput, take?: number): Promise<PresenceRecord[]> {
    const users = await this.prisma.user.findMany({
      where: {
        ...where,
        character: {
          isNot: null
        }
      },
      select: presenceSelect,
      orderBy: [
        {
          lastActionAt: "desc"
        },
        {
          displayName: "asc"
        }
      ],
      ...(take === undefined ? {} : { take })
    });

    return users.map(toPresenceRecord);
  }
}

function buildPresenceUpdate(input: MarkPresenceInput): Prisma.UserUpdateInput {
  return {
    lastActionAt: input.at,
    ...(input.locationId === undefined ? {} : { lastSeenLocationId: input.locationId }),
    ...(input.currentRaidId === undefined ? {} : { currentRaidId: input.currentRaidId }),
    ...(input.currentAdventureId === undefined
      ? {}
      : { currentAdventureId: input.currentAdventureId })
  };
}

function toPresenceRecord(user: SelectedPresenceUser): PresenceRecord {
  return {
    telegramUserId: user.telegramUserId,
    displayName: user.displayName,
    characterName: user.character?.name ?? null,
    characterClassId: user.character?.classId ?? null,
    characterLevel: user.character?.level ?? null,
    characterActiveCosmeticTitleGrantId: user.character?.activeCosmeticTitleGrantId ?? null,
    guildCrest: user.guildMemberships[0]?.guild.crest ?? null,
    lastActionAt: user.lastActionAt,
    lastSeenLocationId: user.lastSeenLocationId,
    currentRaidId: user.currentRaidId,
    currentAdventureId: user.currentAdventureId
  };
}
