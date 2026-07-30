import type { PrismaClient } from "@prisma/client";
import { isCombatLeaseKind } from "../../domain/combat/combatLeaseRegistry";
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

    if (!isCombatLeaseKind(lease.kind)) {
      throw new Error(`Unsupported active combat lease kind: ${lease.kind}`);
    }

    return {
      characterId: lease.characterId,
      kind: lease.kind,
      referenceId: lease.referenceId
    };
  }
}
