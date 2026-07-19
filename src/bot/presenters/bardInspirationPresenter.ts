import {
  getBardInspirationRemainingCombatTurns,
  type BardInspirationCombatStateV1
} from "../../domain/noncombat/bardSupport";
import { presentTimedStatusLine } from "./timedStatusPresenter";

export function presentActiveBardInspirationBuff(
  inspiration: { accuracyBonusPp: number; expiresAt: Date },
  now = new Date(),
  options: { showLabel?: boolean } = {}
): string | null {
  const remainingMs = inspiration.expiresAt.getTime() - now.getTime();
  if (remainingMs <= 0) {
    return null;
  }

  return presentTimedStatusLine({
    emoji: "✨",
    name: "Натхнення",
    remaining: `${Math.max(1, Math.ceil(remainingMs / 60_000))} хв`,
    ...(options.showLabel === false ? { label: null } : {}),
    tailHtml: ` — <b>+${inspiration.accuracyBonusPp}</b> до влучання`
  });
}

export function presentActiveBardInspirationCombatState(
  inspiration: BardInspirationCombatStateV1,
  subjectHtml?: string
): string | null {
  const turns = getBardInspirationRemainingCombatTurns(inspiration);
  if (turns <= 0) {
    return null;
  }

  return presentTimedStatusLine({
    emoji: "✨",
    name: "Натхнення",
    remaining: formatTurns(turns),
    ...(subjectHtml ? { subjectHtml } : {}),
    tailHtml: ` — <b>+${inspiration.accuracyBonusPp}</b> до влучання`
  });
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
    const line = presentActiveBardInspirationCombatState(
      entry.inspiration,
      entry.subjectHtml
    );
    if (!line) {
      return [];
    }
    return [line];
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
