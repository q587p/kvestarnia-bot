import {
  getBardInspirationRemainingCombatTurns,
  type BardInspirationCombatStateV1
} from "../../domain/noncombat/bardSupport";

export function presentActiveBardInspirationCombatState(
  inspiration: BardInspirationCombatStateV1
): string | null {
  const turns = getBardInspirationRemainingCombatTurns(inspiration);
  if (turns <= 0) {
    return null;
  }

  return `✨ <b>Натхнення</b>: +${inspiration.accuracyBonusPp} до влучання · ще ${formatTurns(turns)}.`;
}

export function presentBardInspirationCombatEffectLines(
  entries: Array<{
    inspiration?: BardInspirationCombatStateV1 | null | undefined;
    subjectHtml?: string;
  }>
): string[] {
  return entries.flatMap((entry) => {
    if (!entry.inspiration) {
      return [];
    }
    const line = presentActiveBardInspirationCombatState(entry.inspiration);
    if (!line) {
      return [];
    }
    return entry.subjectHtml
      ? [line.replace("<b>Натхнення</b>", entry.subjectHtml)]
      : [line];
  });
}

function formatTurns(turns: number): string {
  const mod10 = turns % 10;
  const mod100 = turns % 100;
  const noun = mod10 === 1 && mod100 !== 11
    ? "хід"
    : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
      ? "ходи"
      : "ходів";

  return `${turns} ${noun}`;
}
