export interface VarenykSatedRecoveryView {
  hpRestored: number;
  manaRestored: number;
}

export function presentActiveVarenykSatedBuff(
  expiresAt: Date,
  now = new Date(),
  subjectHtml = "Баф: <b>Ситий</b>"
): string | null {
  const remainingMs = expiresAt.getTime() - now.getTime();
  if (remainingMs <= 0) {
    return null;
  }

  const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60_000));
  return `😋 ${subjectHtml} ще ${remainingMinutes} хв — +1 HP і +1 мани щохвилини поза боєм або після власного ходу в бою; кожна бойова порція забирає 1 хв дії.`;
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
