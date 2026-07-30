export interface ActiveCombatLeaseRecord {
  characterId: string;
  kind: string;
  referenceId: string;
}

export interface CombatLeaseReadRepository {
  findActiveByTelegramUserId(
    telegramUserId: bigint
  ): Promise<ActiveCombatLeaseRecord | null>;
}
