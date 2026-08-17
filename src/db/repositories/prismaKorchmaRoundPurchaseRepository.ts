import type { Character, PrismaClient } from "@prisma/client";
import type { CharacterRecord } from "./characterRepository";
import type {
  KorchmaRoundLeaderboard,
  KorchmaRoundLeaderboardEntry,
  KorchmaRoundPurchaseInput,
  KorchmaRoundPurchaseRepository
} from "./korchmaRoundPurchaseRepository";
import { readLiveGuildCrestsByCharacterIds } from "./guildIdentityRead";

const LEADERBOARD_LIMIT = 5;

export class PrismaKorchmaRoundPurchaseRepository implements KorchmaRoundPurchaseRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly guildIdentityEnabled = false,
    private readonly now: () => Date = () => new Date()
  ) {}

  async spendGoldAndCreate(input: KorchmaRoundPurchaseInput) {
    return this.prisma.$transaction(async (tx) => {
      const character = await tx.character.findFirst({
        where: {
          user: {
            telegramUserId: input.telegramUserId
          }
        },
        include: {
          user: {
            select: {
              lastSeenLocationId: true
            }
          }
        }
      });

      if (!character) {
        return null;
      }

      const spent = await tx.character.updateMany({
        where: {
          id: character.id,
          gold: {
            gte: input.spentGold
          }
        },
        data: {
          gold: {
            decrement: input.spentGold
          }
        }
      });

      if (spent.count === 0) {
        const current = await tx.character.findUnique({
          where: {
            id: character.id
          },
          include: {
            user: {
              select: {
                lastSeenLocationId: true
              }
            }
          }
        });

        return {
          state: "insufficient" as const,
          character: toCharacterRecord(current ?? character)
        };
      }

      const updated = await tx.character.findUniqueOrThrow({
        where: {
          id: character.id
        },
        include: {
          user: {
            select: {
              lastSeenLocationId: true
            }
          }
        }
      });

      await tx.korchmaRoundPurchase.create({
        data: {
          characterId: updated.id,
          tier: input.tier,
          spentGold: input.spentGold,
          localDate: input.localDate
        }
      });

      return {
        state: "spent" as const,
        character: toCharacterRecord(updated)
      };
    });
  }

  async getLeaderboard(localDate: string): Promise<KorchmaRoundLeaderboard> {
    const week = getWeekRange(localDate);
    const month = getMonthRange(localDate);

    const [day, weekEntries, monthEntries] = await Promise.all([
      this.getEntries({ from: localDate, to: localDate }),
      this.getEntries(week),
      this.getEntries(month)
    ]);

    return {
      day,
      week: weekEntries,
      month: monthEntries
    };
  }

  private async getEntries(input: { from: string; to: string }): Promise<KorchmaRoundLeaderboardEntry[]> {
    const groups = await this.prisma.korchmaRoundPurchase.groupBy({
      by: ["characterId"],
      where: {
        localDate: {
          gte: input.from,
          lte: input.to
        }
      },
      _count: {
        id: true
      },
      _sum: {
        spentGold: true
      },
      orderBy: [
        {
          _sum: {
            spentGold: "desc"
          }
        },
        {
          _count: {
            id: "desc"
          }
        }
      ],
      take: LEADERBOARD_LIMIT
    });

    const characters = await this.prisma.character.findMany({
      where: {
        id: {
          in: groups.map((group) => group.characterId)
        }
      },
      select: {
        id: true,
        name: true
      }
    });
    const names = new Map(characters.map((character) => [character.id, character.name]));
    const crests = this.guildIdentityEnabled
      ? await readLiveGuildCrestsByCharacterIds(
          this.prisma,
          groups.map((group) => group.characterId),
          this.now()
        )
      : new Map<string, string>();

    return groups.map((group) => ({
      characterId: group.characterId,
      name: names.get(group.characterId) ?? "Хтось дуже щедрий",
      ...(crests.get(group.characterId) ? { guildCrest: crests.get(group.characterId)! } : {}),
      roundCount: group._count.id,
      spentGold: group._sum.spentGold ?? 0
    }));
  }
}

function getWeekRange(localDate: string): { from: string; to: string } {
  const date = parseLocalDate(localDate);
  const day = date.getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  const monday = addDays(date, -daysSinceMonday);
  const sunday = addDays(monday, 6);

  return {
    from: formatLocalDate(monday),
    to: formatLocalDate(sunday)
  };
}

function getMonthRange(localDate: string): { from: string; to: string } {
  const date = parseLocalDate(localDate);
  const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));

  return {
    from: formatLocalDate(first),
    to: formatLocalDate(last)
  };
}

function parseLocalDate(localDate: string): Date {
  const parts = localDate.split("-").map(Number);
  const [year, month, day] = parts;

  if (parts.length !== 3 || !year || !month || !day) {
    throw new Error(`Invalid local date: ${localDate}`);
  }

  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatLocalDate(date: Date): string {
  const year = date.getUTCFullYear().toString().padStart(4, "0");
  const month = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = date.getUTCDate().toString().padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function toCharacterRecord(
  character: Character & { user: { lastSeenLocationId: string | null } }
): CharacterRecord {
  const { user, ...record } = character;

  return {
    ...record,
    currentLocationId: user.lastSeenLocationId
  };
}
