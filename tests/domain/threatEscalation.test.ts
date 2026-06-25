import { describe, expect, it } from "vitest";
import {
  decideThreatEscalation,
  findThreatEscalationLine,
  selectThreatEscalationLineId,
  THREAT_ESCALATION_LINES,
  THREAT_ESCALATION_REPEAT_SECOND_ENEMY_LEVEL_BONUS
} from "../../src/domain/combat/threatEscalation";

describe("threat escalation policy", () => {
  it.each([0, 1, 2])("keeps base threat after %i eligible wins", (wins) => {
    const history = Array.from({ length: wins }, () => ({
      result: "won" as const,
      enemyCount: 1 as const,
      eligible: true,
      escalated: false
    }));

    expect(decideThreatEscalation(history)).toEqual({
      enemyCount: 1,
      reason: "base",
      eligibleWins: wins
    });
  });

  it("escalates after three consecutive eligible one-enemy wins", () => {
    expect(decideThreatEscalation([
      { result: "won", enemyCount: 1, eligible: true, escalated: false },
      { result: "won", enemyCount: 1, eligible: true, escalated: false },
      { result: "won", enemyCount: 1, eligible: true, escalated: false }
    ])).toEqual({
      enemyCount: 2,
      reason: "ordinary-win-streak",
      eligibleWins: 3,
      secondEnemyLevelBonus: 0
    });
  });

  it("boosts the second enemy on the next escalation after a won two-enemy checkpoint", () => {
    expect(decideThreatEscalation([
      { result: "won", enemyCount: 1, eligible: true, escalated: false },
      { result: "won", enemyCount: 1, eligible: true, escalated: false },
      { result: "won", enemyCount: 1, eligible: true, escalated: false },
      { result: "won", enemyCount: 2, eligible: true, escalated: true }
    ])).toEqual({
      enemyCount: 2,
      reason: "ordinary-win-streak",
      eligibleWins: 3,
      secondEnemyLevelBonus: THREAT_ESCALATION_REPEAT_SECOND_ENEMY_LEVEL_BONUS
    });
  });

  it("does not boost the next escalation after a lost two-enemy checkpoint", () => {
    expect(decideThreatEscalation([
      { result: "won", enemyCount: 1, eligible: true, escalated: false },
      { result: "won", enemyCount: 1, eligible: true, escalated: false },
      { result: "won", enemyCount: 1, eligible: true, escalated: false },
      { result: "lost", enemyCount: 2, eligible: true, escalated: true }
    ])).toEqual({
      enemyCount: 2,
      reason: "ordinary-win-streak",
      eligibleWins: 3,
      secondEnemyLevelBonus: 0
    });
  });

  it.each(["lost", "fled", "expired"] as const)("resets after %s", (result) => {
    expect(decideThreatEscalation([
      { result, enemyCount: 1, eligible: true, escalated: false },
      { result: "won", enemyCount: 1, eligible: true, escalated: false },
      { result: "won", enemyCount: 1, eligible: true, escalated: false },
      { result: "won", enemyCount: 1, eligible: true, escalated: false }
    ])).toEqual({
      enemyCount: 1,
      reason: "base",
      eligibleWins: 0
    });
  });

  it("uses an escalated two-enemy terminal as the cycle checkpoint", () => {
    expect(decideThreatEscalation([
      { result: "won", enemyCount: 2, eligible: true, escalated: true },
      { result: "won", enemyCount: 1, eligible: true, escalated: false },
      { result: "won", enemyCount: 1, eligible: true, escalated: false },
      { result: "won", enemyCount: 1, eligible: true, escalated: false }
    ])).toEqual({
      enemyCount: 1,
      reason: "base",
      eligibleWins: 0
    });
  });

  it("ignores excluded rows without consuming the streak", () => {
    expect(decideThreatEscalation([
      { result: "won", enemyCount: 2, eligible: false, escalated: false },
      { result: "lost", enemyCount: 1, eligible: false, escalated: false },
      { result: "won", enemyCount: 1, eligible: true, escalated: false },
      { result: "won", enemyCount: 1, eligible: true, escalated: false },
      { result: "won", enemyCount: 1, eligible: true, escalated: false }
    ])).toMatchObject({
      enemyCount: 2,
      reason: "ordinary-win-streak",
      secondEnemyLevelBonus: 0
    });
  });

  it("keeps thirteen stable authored line ids", () => {
    expect(THREAT_ESCALATION_LINES).toHaveLength(13);
    const selected = selectThreatEscalationLineId("session-42");

    expect(findThreatEscalationLine(selected)?.id).toBe(selected);
    expect(selectThreatEscalationLineId("session-42")).toBe(selected);
  });
});
