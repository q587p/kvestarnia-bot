import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  ClaimPlayerHintReceiptResult,
  PlayerHintReceiptRecord,
  PlayerHintReceiptRepository
} from "./playerHintReceiptRepository";

export class PrismaPlayerHintReceiptRepository implements PlayerHintReceiptRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async claimForTelegramUser(
    telegramUserId: bigint,
    input: { key: string; shownAt: Date }
  ): Promise<ClaimPlayerHintReceiptResult> {
    try {
      const receipt = await this.prisma.playerHintReceipt.create({
        data: {
          telegramUserId,
          key: input.key,
          shownAt: input.shownAt,
          createdAt: input.shownAt,
          updatedAt: input.shownAt
        }
      });

      return { state: "claimed", receipt: mapReceipt(receipt) };
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }

      const receipt = await this.prisma.playerHintReceipt.findUniqueOrThrow({
        where: {
          telegramUserId_key: {
            telegramUserId,
            key: input.key
          }
        }
      });

      return { state: "already-claimed", receipt: mapReceipt(receipt) };
    }
  }
}

function mapReceipt(record: PlayerHintReceiptRecord): PlayerHintReceiptRecord {
  return {
    id: record.id,
    telegramUserId: record.telegramUserId,
    key: record.key,
    shownAt: record.shownAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
