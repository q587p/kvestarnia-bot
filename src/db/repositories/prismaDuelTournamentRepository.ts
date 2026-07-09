import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  ClaimDuelTournamentRewardInput,
  DuelTournamentCharacterRecord,
  DuelTournamentClaimRecord,
  DuelTournamentClaimResult,
  DuelTournamentRepository
} from "./duelTournamentRepository";
import type { DuelTournamentPeriod } from "../../domain/duels/duelTournament";
import { getIncludedRemortCount } from "./prismaRemortCount";

export class PrismaDuelTournamentRepository implements DuelTournamentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findCharacterByTelegramUser(
    telegramUserId: bigint
  ): Promise<DuelTournamentCharacterRecord | null> {
    const character = await this.prisma.character.findFirst({
      where: {
        user: {
          telegramUserId
        }
      },
      include: {
        user: {
          select: {
            telegramUserId: true
          }
        },
        _count: {
          select: {
            remorts: true
          }
        }
      }
    });

    return character ? mapCharacter(character) : null;
  }

  async findClaim(
    characterId: string,
    period: DuelTournamentPeriod,
    periodKey: string
  ): Promise<DuelTournamentClaimRecord | null> {
    const claim = await this.prisma.duelTournamentClaim.findUnique({
      where: {
        characterId_period_periodKey: {
          characterId,
          period,
          periodKey
        }
      }
    });

    return claim ? mapClaim(claim) : null;
  }

  async listClaimsForCharacter(characterId: string): Promise<DuelTournamentClaimRecord[]> {
    const claims = await this.prisma.duelTournamentClaim.findMany({
      where: {
        characterId
      }
    });

    return claims.map(mapClaim);
  }

  async claimReward(input: ClaimDuelTournamentRewardInput): Promise<DuelTournamentClaimResult> {
    try {
      const claim = await this.prisma.$transaction(async (tx) => {
        const created = await tx.duelTournamentClaim.create({
          data: {
            characterId: input.characterId,
            period: input.period,
            periodKey: input.periodKey,
            points: input.points,
            rank: input.rank,
            rewardGold: input.reward.gold,
            rewardItemsJson: input.reward.items,
            resultJson: input.result as Prisma.InputJsonValue,
            claimedAt: input.claimedAt
          }
        });

        await tx.character.update({
          where: {
            id: input.characterId
          },
          data: {
            gold: {
              increment: input.reward.gold
            }
          }
        });

        for (const item of input.reward.items) {
          await tx.characterItem.upsert({
            where: {
              characterId_itemId: {
                characterId: input.characterId,
                itemId: item.itemId
              }
            },
            create: {
              characterId: input.characterId,
              itemId: item.itemId,
              quantity: item.quantity
            },
            update: {
              quantity: {
                increment: item.quantity
              }
            }
          });
        }

        return created;
      });

      return { claim: mapClaim(claim), created: true };
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }

      const existing = await this.findClaim(input.characterId, input.period, input.periodKey);
      if (!existing) {
        throw error;
      }

      return { claim: existing, created: false };
    }
  }
}

type CharacterWithUser = Prisma.CharacterGetPayload<{
    include: {
      user: {
        select: {
          telegramUserId: true
        }
      },
      _count: {
        select: {
          remorts: true
        }
      }
    }
  }>;

function mapCharacter(character: CharacterWithUser): DuelTournamentCharacterRecord {
  return {
    id: character.id,
    userId: character.userId,
    telegramUserId: character.user.telegramUserId,
    name: character.name,
    pronoun: character.pronoun,
    path: character.path,
    raceId: character.raceId,
    classId: character.classId,
    level: character.level,
    xp: character.xp,
    gold: character.gold,
    hpCurrent: character.hpCurrent,
    hpMax: character.hpMax,
    manaCurrent: character.manaCurrent,
    manaMax: character.manaMax,
    hpRegenAt: character.hpRegenAt,
    manaRegenAt: character.manaRegenAt,
    activeCosmeticTitleGrantId: character.activeCosmeticTitleGrantId,
    statsJson: character.statsJson,
    remortCount: getIncludedRemortCount(character)
  };
}

function mapClaim(claim: {
  id: string;
  characterId: string;
  period: string;
  periodKey: string;
  points: number;
  rank: number;
  rewardGold: number;
  rewardItemsJson: Prisma.JsonValue;
  resultJson: Prisma.JsonValue | null;
  claimedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}): DuelTournamentClaimRecord {
  return {
    id: claim.id,
    characterId: claim.characterId,
    period: claim.period as DuelTournamentPeriod,
    periodKey: claim.periodKey,
    points: claim.points,
    rank: claim.rank,
    rewardGold: claim.rewardGold,
    rewardItems: claim.rewardItemsJson,
    result: claim.resultJson,
    claimedAt: claim.claimedAt,
    createdAt: claim.createdAt,
    updatedAt: claim.updatedAt
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
