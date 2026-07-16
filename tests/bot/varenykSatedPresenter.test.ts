import { describe, expect, it } from "vitest";
import {
  presentActiveVarenykSatedBuff,
  presentActiveVarenykSatedCombatState,
  presentVarenykSatedCombatEffectLines,
  presentVarenykSatedJournalRecovery,
  presentVarenykSatedRecoveryNotice
} from "../../src/bot/presenters/varenykSatedPresenter";

describe("Varenyk Sated presenter", () => {
  it("describes the state consistently outside and inside combat", () => {
    const now = new Date("2026-07-15T18:00:00.000Z");
    const expiresAt = new Date("2026-07-15T18:12:00.000Z");
    const combatState = {
      expiresAt: expiresAt.toISOString(),
      cursorAt: now.toISOString(),
      rank: 5
    };

    expect(presentActiveVarenykSatedBuff(expiresAt, 5, now)).toBe(
      "😋 Стан: <b>Ситий</b> ще <b>12 хв</b> — <b>+3 HP</b> і <b>+3 мани</b> щохвилини поза боєм або кожен хід в бою (це забирає хвилину дії)."
    );
    expect(presentActiveVarenykSatedBuff(expiresAt, 5, now)).not.toContain("\n");
    expect(presentActiveVarenykSatedCombatState(combatState)).toBe(
      "😋 Стан: <b>Ситий</b> ще <b>12 ходів</b> (<b>+3 HP / +3 мани</b>)"
    );
    expect(presentActiveVarenykSatedCombatState(combatState)).not.toMatch(/ранг/iu);
    expect(presentActiveVarenykSatedBuff(now, 5, now)).toBeNull();
  });

  it("shows frozen combat turns without subtracting wall-clock time between actions", () => {
    const cursorAt = new Date("2026-07-16T13:09:59.518Z");
    const turnFour = {
      expiresAt: new Date(cursorAt.getTime() + 6 * 60_000 + 8_606).toISOString(),
      cursorAt: cursorAt.toISOString(),
      rank: 5
    };
    expect(presentActiveVarenykSatedCombatState(turnFour)).toContain("ще <b>6 ходів</b>");

    const turnFiveCursor = new Date(cursorAt.getTime() + 27_948);
    const turnFive = {
      expiresAt: new Date(turnFiveCursor.getTime() + 5 * 60_000 + 8_606).toISOString(),
      cursorAt: turnFiveCursor.toISOString(),
      rank: 5
    };
    expect(presentActiveVarenykSatedCombatState(turnFive)).toContain("ще <b>5 ходів</b>");
  });

  it("formats participant combat effects through one shared journal helper", () => {
    const cursorAt = new Date("2026-07-16T13:00:00.000Z");
    expect(presentVarenykSatedCombatEffectLines([
      {
        subjectHtml: "Стан: <b>Ситий</b> у <b>Голова</b>",
        sated: {
          expiresAt: new Date(cursorAt.getTime() + 12 * 60_000).toISOString(),
          cursorAt: cursorAt.toISOString(),
          rank: 5
        }
      },
      { sated: null }
    ])).toEqual([
      "😋 Стан: <b>Ситий</b> у <b>Голова</b> ще <b>12 ходів</b> (<b>+3 HP / +3 мани</b>)"
    ]);
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
