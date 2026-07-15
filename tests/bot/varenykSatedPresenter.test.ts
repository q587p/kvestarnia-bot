import { describe, expect, it } from "vitest";
import {
  presentActiveVarenykSatedBuff,
  presentVarenykSatedRecoveryNotice
} from "../../src/bot/presenters/varenykSatedPresenter";

describe("Varenyk Sated presenter", () => {
  it("describes the buff with an unbolded canonical remaining duration", () => {
    const now = new Date("2026-07-15T18:00:00.000Z");
    const expiresAt = new Date("2026-07-15T18:12:00.000Z");

    expect(presentActiveVarenykSatedBuff(expiresAt, now)).toBe(
      "😋 Баф: <b>Ситий</b> ще 12 хв — +1 HP і +1 мани щохвилини поза боєм або після власного ходу в бою; кожна бойова порція забирає 1 хв дії."
    );
    expect(presentActiveVarenykSatedBuff(now, now)).toBeNull();
  });

  it("omits zero recovery components and an empty recovery notice", () => {
    expect(presentVarenykSatedRecoveryNotice({ hpRestored: 1, manaRestored: 0 }))
      .toBe("😋 Ситість відновила: <b>+1 HP</b>.");
    expect(presentVarenykSatedRecoveryNotice({ hpRestored: 0, manaRestored: 1 }))
      .toBe("😋 Ситість відновила: <b>+1 мани</b>.");
    expect(presentVarenykSatedRecoveryNotice({ hpRestored: 0, manaRestored: 0 })).toBeNull();
  });
});
