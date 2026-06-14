import type { Prisma, PrismaClient } from "@prisma/client";
import type { ItemGrant } from "./dailyActionRepository";
import type {
  CompleteHuntContractInput,
  HuntContractRecord,
  HuntContractRepository,
  PostedHuntContractInput
} from "./huntContractRepository";

type PrismaHuntContractRecord = Awaited<
  ReturnType<PrismaClient["huntContract"]["findFirst"]>
>;

export class PrismaHuntContractRepository implements HuntContractRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByTelegramUserIdAndPeriod(
    telegramUserId: bigint,
    localPeriodId: string
  ): Promise<HuntContractRecord | null> {
    const record = await this.prisma.huntContract.findFirst({
      where: {
        localPeriodId,
        character: {
          user: {
            telegramUserId
          }
        }
      }
    });

    return mapRecord(record);
  }

  async upsertPostedContractForTelegramUser(
    telegramUserId: bigint,
    input: PostedHuntContractInput
  ): Promise<HuntContractRecord | null> {
    const character = await this.prisma.character.findFirst({
      where: {
        user: {
          telegramUserId
        }
      },
      select: {
        id: true
      }
    });

    if (!character) {
      return null;
    }

    const record = await this.prisma.huntContract.upsert({
      where: {
        characterId_localPeriodId: {
          characterId: character.id,
          localPeriodId: input.localPeriodId
        }
      },
      create: {
        characterId: character.id,
        localPeriodId: input.localPeriodId,
        monsterId: input.monsterId,
        contractToken: input.contractToken
      },
      update: {}
    });

    return mapRecord(record);
  }

  async markCompletedForTelegramUser(
    telegramUserId: bigint,
    input: CompleteHuntContractInput
  ): Promise<HuntContractRecord | null> {
    const character = await this.prisma.character.findFirst({
      where: {
        user: {
          telegramUserId
        }
      },
      select: {
        id: true
      }
    });

    if (!character) {
      return null;
    }

    const record = await this.prisma.huntContract.update({
      where: {
        characterId_localPeriodId: {
          characterId: character.id,
          localPeriodId: input.localPeriodId
        }
      },
      data: {
        status: "completed",
        completedAction: input.action,
        rewardXp: input.rewardXp,
        rewardGold: input.rewardGold,
        rewardItemsJson: input.itemGrants as unknown as Prisma.InputJsonValue,
        completedAt: new Date()
      }
    });

    return mapRecord(record);
  }
}

function mapRecord(record: PrismaHuntContractRecord): HuntContractRecord | null {
  if (!record) {
    return null;
  }

  return {
    id: record.id,
    characterId: record.characterId,
    localPeriodId: record.localPeriodId,
    monsterId: record.monsterId,
    contractToken: record.contractToken,
    status: record.status === "completed" ? "completed" : "posted",
    completedAction: record.completedAction,
    rewardXp: record.rewardXp,
    rewardGold: record.rewardGold,
    rewardItems: parseRewardItems(record.rewardItemsJson),
    createdAt: record.createdAt,
    completedAt: record.completedAt,
    updatedAt: record.updatedAt
  };
}

function parseRewardItems(value: unknown): ItemGrant[] | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isItemGrantLike)
    .map((grant) => ({
      itemId: grant.itemId,
      quantity: grant.quantity
    }));
}

function isItemGrantLike(value: unknown): value is ItemGrant {
  return (
    typeof value === "object" &&
    value !== null &&
    "itemId" in value &&
    "quantity" in value &&
    typeof value.itemId === "string" &&
    typeof value.quantity === "number" &&
    Number.isInteger(value.quantity)
  );
}
