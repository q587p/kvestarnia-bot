import type { PrismaClient } from "@prisma/client";
import type { QuestMarkerReadSnapshot } from "./questMarkerReadContext";
import { getIncludedRemortCount } from "./prismaRemortCount";

export class PrismaQuestMarkerReadRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async load(
    telegramUserId: bigint,
    input: {
      dailyActionKeys: readonly string[];
      cooldownKeys: readonly string[];
      itemIds: readonly string[];
    }
  ): Promise<QuestMarkerReadSnapshot> {
    const dailyActionKeys = [...new Set(input.dailyActionKeys)].slice(0, 93);
    const cooldownKeys = [...new Set(input.cooldownKeys)].slice(0, 93);
    const itemIds = [...new Set(input.itemIds)].slice(0, 93);
    const row = await this.prisma.character.findFirst({
      where: { user: { telegramUserId } },
      include: {
        user: { select: { lastSeenLocationId: true } },
        _count: { select: { remorts: true } },
        dailyActions: {
          where: { key: { in: dailyActionKeys } },
          orderBy: { createdAt: "desc" },
          take: 93
        },
        cooldowns: {
          where: { key: { in: cooldownKeys } },
          take: cooldownKeys.length
        },
        equipment: { orderBy: { slot: "asc" } },
        items: { where: { itemId: { in: itemIds } }, take: itemIds.length },
        drinkState: true,
        activeCombatLease: true
      }
    });

    if (!row) {
      return emptySnapshot(telegramUserId);
    }

    const {
      user,
      _count,
      dailyActions,
      cooldowns,
      equipment,
      items,
      drinkState,
      activeCombatLease,
      ...character
    } = row;
    const activeCombatSession = activeCombatLease
      ? await this.prisma.soloCombatSession.findUnique({ where: { id: activeCombatLease.referenceId } })
      : await this.prisma.soloCombatSession.findFirst({
          where: { characterId: character.id, status: "active" },
          orderBy: { updatedAt: "desc" }
        });

    return {
      telegramUserId,
      character: {
        ...character,
        currentLocationId: user.lastSeenLocationId,
        remortCount: getIncludedRemortCount({ _count })
      },
      dailyActions,
      cooldowns,
      equipment,
      items,
      drinkState,
      activeCombatLease,
      activeCombatSession
    };
  }
}

function emptySnapshot(telegramUserId: bigint): QuestMarkerReadSnapshot {
  return {
    telegramUserId,
    character: null,
    dailyActions: [],
    cooldowns: [],
    equipment: [],
    items: [],
    drinkState: null,
    activeCombatLease: null,
    activeCombatSession: null
  };
}
