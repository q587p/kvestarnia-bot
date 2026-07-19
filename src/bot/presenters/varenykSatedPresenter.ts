import {
  getVarenykSatedPeriodicRecovery,
  getVarenykSatedRemainingCombatTurns,
  type VarenykSatedCombatStateV1
} from "../../domain/noncombat/varenykSatedSupport";
import { presentTimedStatusLine } from "./timedStatusPresenter";

export interface VarenykSatedRecoveryView {
  hpRestored: number;
  manaRestored: number;
}

export function presentActiveVarenykSatedBuff(
  expiresAt: Date,
  rank: number,
  now = new Date(),
  subjectHtml = "Стан: <b>Ситий</b>",
  unit: "minutes" | "turns" = "minutes"
): string | null {
  const remainingMs = expiresAt.getTime() - now.getTime();
  if (remainingMs <= 0) {
    return null;
  }

  const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60_000));
  const remaining = unit === "turns"
    ? `${remainingMinutes} ${pluralize(remainingMinutes, "хід", "ходи", "ходів")}`
    : `${remainingMinutes} хв`;
  const recovery = getVarenykSatedPeriodicRecovery(rank);
  return presentTimedStatusLine({
    emoji: "😋",
    name: "Ситий",
    remaining,
    subjectHtml,
    tailHtml: ` — <b>+${recovery.hp} HP</b> і <b>+${recovery.mana} мани</b> щохвилини поза боєм або кожен хід в бою (це забирає хвилину дії)`
  });
}

export function presentActiveVarenykSatedCombatState(
  sated: Pick<VarenykSatedCombatStateV1, "expiresAt" | "cursorAt" | "rank">,
  subjectHtml = "Стан: <b>Ситий</b>"
): string | null {
  const remainingTurns = getVarenykSatedRemainingCombatTurns(sated);
  if (remainingTurns <= 0) {
    return null;
  }

  const remaining = `${remainingTurns} ${pluralize(remainingTurns, "хід", "ходи", "ходів")}`;
  const recovery = getVarenykSatedPeriodicRecovery(sated.rank);
  return presentTimedStatusLine({
    emoji: "😋",
    name: "Ситий",
    remaining,
    subjectHtml,
    tailHtml: ` (<b>+${recovery.hp} HP / +${recovery.mana} мани</b>)`,
    terminalPunctuation: false
  });
}

export function presentVarenykSatedCombatEffectLines(
  entries: ReadonlyArray<{
    sated: Pick<VarenykSatedCombatStateV1, "expiresAt" | "cursorAt" | "rank"> | null | undefined;
    subjectHtml?: string;
  }>
): string[] {
  return entries.flatMap((entry) => {
    if (!entry.sated) {
      return [];
    }

    const line = presentActiveVarenykSatedCombatState(entry.sated, entry.subjectHtml);
    return line ? [line] : [];
  });
}

export function presentVarenykSatedRecoveryNotice(
  recovery: VarenykSatedRecoveryView
): string | null {
  const parts = [
    ...(recovery.hpRestored > 0 ? [`<b>+${recovery.hpRestored} HP</b>`] : []),
    ...(recovery.manaRestored > 0 ? [`<b>+${recovery.manaRestored} мани</b>`] : [])
  ];

  return parts.length > 0
    ? `😋 Ситість відновила: ${parts.join(" · ")}.`
    : null;
}

export function presentVarenykSatedJournalRecovery(
  recovery: VarenykSatedRecoveryView,
  recipientHtml: string
): string | null {
  const parts = [
    ...(recovery.hpRestored > 0 ? [`+${recovery.hpRestored} HP`] : []),
    ...(recovery.manaRestored > 0 ? [`+${recovery.manaRestored} мани`] : [])
  ];
  return parts.length > 0
    ? `😋 ${recipientHtml}: <i>ситість</i> відновлює ${parts.join(" і ")}.`
    : null;
}

function pluralize(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
