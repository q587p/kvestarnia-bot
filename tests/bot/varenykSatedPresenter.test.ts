import { describe, expect, it } from "vitest";
import {
  presentActiveVarenykSatedBuff,
  presentActiveVarenykSatedCombatState,
  presentVarenykSatedJournalRecovery,
  presentVarenykSatedRecoveryNotice
} from "../../src/bot/presenters/varenykSatedPresenter";

describe("Varenyk Sated presenter", () => {
  it("describes the state consistently outside and inside combat", () => {
    const now = new Date("2026-07-15T18:00:00.000Z");
    const expiresAt = new Date("2026-07-15T18:12:00.000Z");

    expect(presentActiveVarenykSatedBuff(expiresAt, 5, now)).toBe(
      "😋 Стан: <b>Ситий</b> ще <b>12 хв</b>\n<b>+3 HP</b> і <b>+3 мани</b> щохвилини поза боєм або кожен хід в бою (це забирає хвилину дії)."
    );
    expect(presentActiveVarenykSatedCombatState(expiresAt, 5, now)).toBe(
      "😋 Стан: <b>Ситий</b> ще <b>12 ходів</b> (<b>+3 HP / +3 мани</b>)"
    );
    expect(presentActiveVarenykSatedCombatState(expiresAt, 5, now)).not.toMatch(/ранг/iu);
    expect(presentActiveVarenykSatedBuff(now, 5, now)).toBeNull();
  });

  it("omits zero recovery components and an empty recovery notice", () => {
    expect(presentVarenykSatedRecoveryNotice({ hpRestored: 1, manaRestored: 0 }))
      .toBe("😋 Ситість відновила: <b>+1 HP</b>.");
    expect(presentVarenykSatedRecoveryNotice({ hpRestored: 0, manaRestored: 1 }))
      .toBe("😋 Ситість відновила: <b>+1 мани</b>.");
    expect(presentVarenykSatedRecoveryNotice({ hpRestored: 0, manaRestored: 0 })).toBeNull();
  });

  it("names the journal recovery recipient and omits zero components", () => {
    expect(presentVarenykSatedJournalRecovery(
      { hpRestored: 1, manaRestored: 1 },
      "Мандрівник"
    )).toBe("😋 Мандрівник: <i>ситість</i> відновлює +1 HP і +1 мани.");
    expect(presentVarenykSatedJournalRecovery(
      { hpRestored: 0, manaRestored: 1 },
      "<b>Мандрівник</b>"
    )).not.toContain("+0");
  });
});
