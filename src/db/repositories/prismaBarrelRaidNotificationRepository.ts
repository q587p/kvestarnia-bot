import type { PrismaClient } from "@prisma/client";
import type {
  BarrelRaidNotificationRecord,
  BarrelRaidNotificationRepository,
  BarrelRaidNotificationStatus
} from "./barrelRaidNotificationRepository";

type PrismaBarrelRaidNotificationRecord = Awaited<
  ReturnType<PrismaClient["barrelRaidNotification"]["findFirst"]>
>;

export class PrismaBarrelRaidNotificationRepository implements BarrelRaidNotificationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async upsertPendingForTelegramUser(
    telegramUserId: bigint,
    input: {
      chatId: bigint;
      periodId: string;
      availableAt: Date;
      now: Date;
    }
  ): Promise<BarrelRaidNotificationRecord | null> {
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

    const record = await this.prisma.barrelRaidNotification.upsert({
      where: {
        telegramUserId_periodId: {
          telegramUserId,
          periodId: input.periodId
        }
      },
      create: {
        characterId: character.id,
        telegramUserId,
        chatId: input.chatId,
        periodId: input.periodId,
        availableAt: input.availableAt,
        status: "pending",
        createdAt: input.now,
        updatedAt: input.now
      },
      update: {
        chatId: input.chatId,
        availableAt: input.availableAt,
        ...(await this.shouldResetToPending(telegramUserId, input.periodId)
          ? {
              status: "pending",
              sentAt: null,
              skippedAt: null,
              lastError: null
            }
          : {}),
        updatedAt: input.now
      }
    });

    return mapNotification(record);
  }

  async listPending(): Promise<BarrelRaidNotificationRecord[]> {
    const records = await this.prisma.barrelRaidNotification.findMany({
      where: {
        status: "pending"
      },
      orderBy: [
        {
          availableAt: "asc"
        },
        {
          createdAt: "asc"
        }
      ]
    });

    return records.flatMap((record) => {
      const mapped = mapNotification(record);

      return mapped ? [mapped] : [];
    });
  }

  async claimPending(id: string, now: Date): Promise<BarrelRaidNotificationRecord | null> {
    const claimed = await this.prisma.barrelRaidNotification.updateMany({
      where: {
        id,
        status: "pending",
        availableAt: {
          lte: now
        }
      },
      data: {
        status: "processing",
        updatedAt: now
      }
    });

    if (claimed.count !== 1) {
      return null;
    }

    return this.findById(id);
  }

  async markSent(id: string, now: Date): Promise<BarrelRaidNotificationRecord | null> {
    const updated = await this.prisma.barrelRaidNotification.updateMany({
      where: {
        id,
        status: "processing"
      },
      data: {
        status: "sent",
        sentAt: now,
        lastError: null,
        updatedAt: now
      }
    });

    if (updated.count !== 1) {
      return null;
    }

    return this.findById(id);
  }

  async markSkipped(id: string, now: Date, reason?: string): Promise<BarrelRaidNotificationRecord | null> {
    const updated = await this.prisma.barrelRaidNotification.updateMany({
      where: {
        id,
        status: {
          in: ["pending", "processing"]
        }
      },
      data: {
        status: "skipped",
        skippedAt: now,
        lastError: reason ?? null,
        updatedAt: now
      }
    });

    if (updated.count !== 1) {
      return null;
    }

    return this.findById(id);
  }

  async markPendingAfterFailure(
    id: string,
    now: Date,
    error: string
  ): Promise<BarrelRaidNotificationRecord | null> {
    const updated = await this.prisma.barrelRaidNotification.updateMany({
      where: {
        id,
        status: "processing"
      },
      data: {
        status: "pending",
        lastError: error,
        updatedAt: now
      }
    });

    if (updated.count !== 1) {
      return null;
    }

    return this.findById(id);
  }

  private async findById(id: string): Promise<BarrelRaidNotificationRecord | null> {
    return mapNotification(
      await this.prisma.barrelRaidNotification.findFirst({
        where: {
          id
        }
      })
    );
  }

  private async shouldResetToPending(telegramUserId: bigint, periodId: string): Promise<boolean> {
    const existing = await this.prisma.barrelRaidNotification.findUnique({
      where: {
        telegramUserId_periodId: {
          telegramUserId,
          periodId
        }
      },
      select: {
        status: true
      }
    });

    return !existing || existing.status === "pending" || existing.status === "processing";
  }
}

function mapNotification(
  record: PrismaBarrelRaidNotificationRecord
): BarrelRaidNotificationRecord | null {
  if (!record) {
    return null;
  }

  return {
    id: record.id,
    characterId: record.characterId,
    telegramUserId: record.telegramUserId,
    chatId: record.chatId,
    periodId: record.periodId,
    availableAt: record.availableAt,
    status: parseStatus(record.status),
    sentAt: record.sentAt,
    skippedAt: record.skippedAt,
    lastError: record.lastError,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

function parseStatus(status: string): BarrelRaidNotificationStatus {
  return status === "processing" || status === "sent" || status === "skipped"
    ? status
    : "pending";
}
