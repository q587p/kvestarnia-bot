import { describe, expect, it, vi } from "vitest";
import { ClosedAlphaReportService } from "../../src/services/closedAlphaReportService";

describe("ClosedAlphaReportService", () => {
  it("reaches the bounded aggregate weekly metrics path without selecting private rows", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const getMetrics = vi.fn().mockResolvedValue({
      scope: "cumulative-current" as const,
      periodsStarted: 2,
      periodsCompleted: 1,
      expeditionReceipts: 13,
      contributorReceipts: 26,
      reconciliationDecisions: 15,
      reconciliations: {
        credited: 13,
        ineligible: 2,
        ineligibleByReason: { "not-won": 2 }
      },
      gloryReceipts: 1,
      achievementEntitlements: 2,
      achievementNotifications: {
        pending: 1,
        claimed: 0,
        projected: 2,
        sent: 1,
        permanentFailure: 0
      }
    });
    const service = new ClosedAlphaReportService(
      { activityEvent: { findMany } } as never,
      { getMetrics }
    );

    const report = await service.build(
      new Date("2026-08-01T00:00:00.000Z"),
      new Date("2026-09-01T00:00:00.000Z")
    );

    expect(getMetrics).toHaveBeenCalledOnce();
    expect(findMany).toHaveBeenCalledTimes(3);
    for (const call of findMany.mock.calls) {
      expect(call[0]).toMatchObject({ select: { occurredAt: true, createdAt: true } });
      expect(JSON.stringify(call[0])).not.toMatch(/telegram|characterName|message|token|claim/i);
    }
    expect(report.operations.guildWeeklyGoal).toMatchObject({
      scope: "cumulative-current",
      periodsStarted: 2,
      reconciliations: { credited: 13, ineligible: 2 },
      achievementNotifications: { pending: 1, sent: 1 }
    });
    expect(Object.keys(report.operations.guildWeeklyGoal.reconciliations.ineligibleByReason)).toHaveLength(1);
  });
});
