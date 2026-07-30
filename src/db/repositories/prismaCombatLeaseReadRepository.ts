import type { PrismaClient } from "@prisma/client";
import type {
  ActiveCombatLeaseRecord,
  CombatLeaseReadRepository
} from "./combatLeaseReadRepository";

export class PrismaCombatLeaseReadRepository implements CombatLeaseReadRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findActiveByTelegramUserId(
    telegramUserId: bigint
  ): Promise<ActiveCombatLeaseRecord | null> {
    const lease = await this.prisma.activeCombatLease.findFirst({
      where: {
        character: {
          user: {
            telegramUserId
          }
        }
      },
      select: {
        characterId: true,
        kind: true,
        referenceId: true
      }
    });

    if (!lease) {
      return null;
    }

    return {
      characterId: lease.characterId,
      kind: lease.kind,
      referenceId: lease.referenceId
    };
  }
}
