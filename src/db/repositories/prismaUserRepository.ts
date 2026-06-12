import type { PrismaClient } from "@prisma/client";
import type { TelegramUserProfile, UserRecord, UserRepository } from "./userRepository";

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async upsertTelegramUser(input: TelegramUserProfile): Promise<UserRecord> {
    return this.prisma.user.upsert({
      where: {
        telegramUserId: input.telegramUserId
      },
      create: {
        telegramUserId: input.telegramUserId,
        username: input.username ?? null,
        displayName: input.displayName ?? null,
        languageCode: input.languageCode ?? null
      },
      update: {
        username: input.username ?? null,
        displayName: input.displayName ?? null,
        languageCode: input.languageCode ?? null
      }
    });
  }
}
