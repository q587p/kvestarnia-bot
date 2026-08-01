import type {
  ActiveCombatLeaseRecord,
  CombatLeaseReadRepository
} from "../db/repositories/combatLeaseReadRepository";

export class CombatLeaseReadService {
  constructor(private readonly repository: CombatLeaseReadRepository) {}

  findActiveForTelegramUser(
    telegramUserId: bigint
  ): Promise<ActiveCombatLeaseRecord | null> {
    return this.repository.findActiveByTelegramUserId(telegramUserId);
  }
}
