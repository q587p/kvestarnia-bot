export interface CombatParticipationCounters {
  manualActions?: number | undefined;
  timeoutActions?: number | undefined;
  damageDealt?: number | undefined;
  damageTaken?: number | undefined;
  healingDone?: number | undefined;
  itemUses?: number | undefined;
}

export function isMeaningfulCombatParticipation(input: CombatParticipationCounters): boolean {
  return positive(input.manualActions) ||
    positive(input.damageDealt) ||
    positive(input.damageTaken) ||
    positive(input.healingDone) ||
    positive(input.itemUses);
}

function positive(value: number | undefined): boolean {
  return typeof value === "number" && value > 0;
}
