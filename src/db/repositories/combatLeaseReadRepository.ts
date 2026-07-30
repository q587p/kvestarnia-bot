import type { CombatLeaseKind } from "../../domain/combat/combatLeaseRegistry";

export interface ActiveCombatLeaseRecord {
  characterId: string;
  kind: CombatLeaseKind;
  referenceId: string;
}

export interface CombatLeaseReadRepository {
  findActiveByTelegramUserId(
    telegramUserId: bigint
  ): Promise<ActiveCombatLeaseRecord | null>;
}
