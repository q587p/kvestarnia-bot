import { describe, expect, it } from "vitest";
import {
  presentActiveBardInspirationBuff,
  presentActiveBardInspirationCombatState,
  presentBardInspirationCombatEffectLines
} from "../../src/bot/presenters/bardInspirationPresenter";

describe("Bard Inspiration presenter", () => {
  it("uses the shared active-status shape outside combat", () => {
    const now = new Date("2026-07-19T10:00:00.000Z");

    expect(presentActiveBardInspirationBuff({
      accuracyBonusPp: 1,
      expiresAt: new Date("2026-07-19T10:13:00.000Z")
    }, now)).toBe(
      "✨ Стан: <b>Натхнення</b> ще <b>13 хв</b> — <b>+1</b> до влучання. Відлік: щохвилини поза боєм або кожен хід у бою (це забирає хвилину дії)."
    );
    expect(presentActiveBardInspirationBuff({ accuracyBonusPp: 1, expiresAt: now }, now))
      .toBeNull();
  });

  it("uses the same shape for frozen combat turns and participant subjects", () => {
    const inspiration = {
      version: 1 as const,
      activationId: "inspiration-1",
      sourcePerformanceId: "performance-1",
      sourceLocationId: "location.korchma.bar",
      recipientCharacterId: "listener-1",
      recipientRemortCount: 0,
      grade: "pleasant" as const,
      accuracyBonusPp: 2,
      expiresAt: "2026-07-19T10:05:00.000Z",
      cursorAt: "2026-07-19T10:00:00.000Z",
      leaseStartedAt: "2026-07-19T10:00:00.000Z",
      outsideRemainderMs: 0,
      pulseIds: []
    };

    expect(presentActiveBardInspirationCombatState(inspiration)).toBe(
      "✨ Стан: <b>Натхнення</b> ще <b>5 ходів</b> — <b>+2</b> до влучання."
    );
    expect(presentBardInspirationCombatEffectLines([{
      inspiration,
      subjectHtml: "Стан: <b>Натхнення</b> у <b>Ліва Рука</b>"
    }])).toEqual([
      "✨ Стан: <b>Натхнення</b> у <b>Ліва Рука</b> ще <b>5 ходів</b> — <b>+2</b> до влучання."
    ]);
  });
});
