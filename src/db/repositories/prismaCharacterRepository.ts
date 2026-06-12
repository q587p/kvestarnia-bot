import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  CharacterRecord,
  CharacterRepository,
  CreateCharacterInput,
  CreateCharacterResult
} from "./characterRepository";
import type { TelegramUserProfile } from "./userRepository";

export class PrismaCharacterRepository implements CharacterRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByUserId(userId: string): Promise<CharacterRecord | null> {
    return this.prisma.character.findUnique({
      where: {
        userId
      }
    });
  }

  async findByTelegramUserId(telegramUserId: bigint): Promise<CharacterRecord | null> {
    return this.prisma.character.findFirst({
      where: {
        user: {
          telegramUserId
        }
      }
    });
  }

  async deleteByTelegramUserId(telegramUserId: bigint): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const character = await tx.character.findFirst({
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
        return false;
      }

      await tx.character.delete({
        where: {
          id: character.id
        }
      });

      return true;
    });
  }

  async createForTelegramUserIfMissing(
    userInput: TelegramUserProfile,
    input: CreateCharacterInput
  ): Promise<CreateCharacterResult> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.upsert({
        where: {
          telegramUserId: userInput.telegramUserId
        },
        create: {
          telegramUserId: userInput.telegramUserId,
          username: userInput.username ?? null,
          displayName: userInput.displayName ?? null,
          languageCode: userInput.languageCode ?? null
        },
        update: {
          username: userInput.username ?? null,
          displayName: userInput.displayName ?? null,
          languageCode: userInput.languageCode ?? null
        }
      });

      const existing = await tx.character.findUnique({
        where: {
          userId: user.id
        }
      });

      if (existing) {
        return {
          character: existing,
          created: false
        };
      }

      const character = await tx.character.create({
        data: {
          userId: user.id,
          name: input.name,
          raceId: input.raceId,
          classId: input.classId,
          level: input.level,
          xp: input.xp,
          gold: input.gold,
          hpCurrent: input.hpCurrent,
          hpMax: input.hpMax,
          manaCurrent: input.manaCurrent,
          manaMax: input.manaMax,
          statsJson: input.statsJson as Prisma.InputJsonValue
        }
      });

      return {
        character,
        created: true
      };
    });
  }
}
