import type { Character, Prisma, PrismaClient } from "@prisma/client";
import type {
  CharacterRecord,
  CharacterRepository,
  CreateCharacterInput,
  CreateCharacterResult,
  UpdateCharacterResourcesInput
} from "./characterRepository";
import type { TelegramUserProfile } from "./userRepository";
import { getIncludedRemortCount } from "./prismaRemortCount";

export type SpendGoldForTelegramUserResult =
  | { state: "spent"; character: CharacterRecord }
  | { state: "insufficient"; character: CharacterRecord };

export class PrismaCharacterRepository implements CharacterRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByUserId(userId: string): Promise<CharacterRecord | null> {
    const character = await this.prisma.character.findUnique({
      where: {
        userId
      },
      include: {
        ...characterRecordInclude
      }
    });

    return character ? toCharacterRecord(character) : null;
  }

  async findByTelegramUserId(telegramUserId: bigint): Promise<CharacterRecord | null> {
    const character = await this.prisma.character.findFirst({
      where: {
        user: {
          telegramUserId
        }
      },
      include: {
        ...characterRecordInclude
      }
    });

    return character ? toCharacterRecord(character) : null;
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

  async updateResourcesForTelegramUser(
    telegramUserId: bigint,
    input: UpdateCharacterResourcesInput
  ): Promise<CharacterRecord | null> {
    if (input.expected) {
      const updated = await this.prisma.character.updateMany({
        where: {
          user: {
            telegramUserId
          },
          hpCurrent: input.expected.hpCurrent,
          manaCurrent: input.expected.manaCurrent,
          ...(input.expected.hpRegenAt === undefined ? {} : { hpRegenAt: input.expected.hpRegenAt }),
          ...(input.expected.manaRegenAt === undefined
            ? {}
            : { manaRegenAt: input.expected.manaRegenAt })
        },
        data: {
          hpCurrent: input.hpCurrent,
          manaCurrent: input.manaCurrent,
          hpRegenAt: input.hpRegenAt,
          manaRegenAt: input.manaRegenAt
        }
      });

      return updated.count > 0 ? this.findByTelegramUserId(telegramUserId) : null;
    }

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

    const updated = await this.prisma.character.update({
      where: {
        id: character.id
      },
      data: {
        hpCurrent: input.hpCurrent,
        manaCurrent: input.manaCurrent,
        hpRegenAt: input.hpRegenAt,
        manaRegenAt: input.manaRegenAt
      },
      include: {
        ...characterRecordInclude
      }
    });

    return toCharacterRecord(updated);
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
        },
        include: characterRecordInclude
      });

      if (existing) {
        return {
          character: toCharacterRecord(existing),
          created: false
        };
      }

      const character = await tx.character.create({
        data: {
          userId: user.id,
          name: input.name,
          pronoun: input.pronoun,
          path: input.path,
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
        character: { ...character, currentLocationId: user.lastSeenLocationId, remortCount: 0 },
        created: true
      };
    });
  }

  async spendGoldForTelegramUser(
    telegramUserId: bigint,
    amount: number
  ): Promise<SpendGoldForTelegramUserResult | null> {
    return this.prisma.$transaction(async (tx) => {
      const character = await tx.character.findFirst({
        where: {
          user: {
            telegramUserId
          }
        },
        include: {
          ...characterRecordInclude
        }
      });

      if (!character) {
        return null;
      }

      if (character.gold < amount) {
        return {
          state: "insufficient",
          character: toCharacterRecord(character)
        };
      }

      const updated = await tx.character.update({
        where: {
          id: character.id
        },
        data: {
          gold: {
            decrement: amount
          }
        },
        include: {
          ...characterRecordInclude
        }
      });

      return {
        state: "spent",
        character: toCharacterRecord(updated)
      };
    });
  }
}

const characterRecordInclude = {
  user: {
    select: {
      lastSeenLocationId: true
    }
  },
  _count: {
    select: {
      remorts: true
    }
  }
} satisfies Prisma.CharacterInclude;

function toCharacterRecord(
  character: Character & { user: { lastSeenLocationId: string | null }; _count?: { remorts?: number } }
): CharacterRecord {
  const { user, ...record } = character;
  delete (record as { _count?: unknown })._count;

  return {
    ...record,
    currentLocationId: user.lastSeenLocationId,
    remortCount: getIncludedRemortCount(character)
  };
}
