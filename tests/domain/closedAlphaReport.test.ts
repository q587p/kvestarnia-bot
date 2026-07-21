import { describe, expect, it } from "vitest";
import { buildClosedAlphaAggregateReport } from "../../src/domain/analytics/closedAlphaReport";

const from = new Date("2026-07-01T00:00:00.000Z");
const to = new Date("2026-07-20T00:00:00.000Z");
const recordedAt = new Date("2026-07-19T23:00:00.000Z");

describe("closed alpha aggregate report", () => {
  it("emits only immutable recorded-event aggregates and explicit instrumentation gaps", () => {
    const report = buildClosedAlphaAggregateReport({
      from,
      to,
      characterCreationEvents: [
        eventAt("2026-07-01T10:00:00.000Z"),
        eventAt("2026-07-19T10:00:00.000Z"),
        eventAt(to)
      ],
      duelEvents: [
        { ...eventAt("2026-07-02T00:01:00.000Z"), status: "resolved" },
        { ...eventAt(to), status: "resolved" }
      ],
      partyFinishEvents: [eventAt("2026-07-06T00:00:00.000Z"), eventAt(to)]
    });

    expect(report).toMatchObject({
      acquisition: { characterCreationCompleted: null, recordedCharacterCreationEvents: 2 },
      retention: {
        d1EligibleRecordedCharacters: 1,
        d1Retained: null,
        d7EligibleRecordedCharacters: 1,
        d7Retained: null
      },
      firstDay: { charactersWithThreeSoloCombatSessionsProxy: null },
      duels: { accepted: null, completed: null, recordedCompletedEvents: 1, rematches: null },
      parties: { created: null, joined: null, started: null, finished: null, recordedFinishedEvents: 1 }
    });
    expect(report.missingInstrumentation).toContain(
      "Duel acceptance time, complete duel-resolution history, and rematch origin are not stored as certified historical events."
    );
  });

  it("excludes a post-to ledger insert even when its occurrence claims to be inside the window", () => {
    const lateBackfill = {
      occurredAt: new Date("2026-07-02T00:00:00.000Z"),
      recordedAt: new Date("2026-07-20T00:00:01.000Z")
    };
    const report = buildClosedAlphaAggregateReport({
      from,
      to,
      characterCreationEvents: [lateBackfill],
      duelEvents: [{ ...lateBackfill, status: "resolved" }],
      partyFinishEvents: [lateBackfill]
    });

    expect(report.acquisition.recordedCharacterCreationEvents).toBe(0);
    expect(report.duels.recordedCompletedEvents).toBe(0);
    expect(report.parties.recordedFinishedEvents).toBe(0);
  });

  it.each([
    ["pending", 0],
    ["accepted", 0],
    ["declined", 0],
    ["expired", 0],
    ["cancelled", 0],
    ["resolved", 1]
  ])("never promotes duel status %s to acceptance and records only resolved completion", (status, expected) => {
    const report = buildClosedAlphaAggregateReport({
      from,
      to,
      characterCreationEvents: [],
      duelEvents: [{ ...eventAt("2026-07-02T00:00:00.000Z"), status }],
      partyFinishEvents: []
    });
    expect(report.duels).toEqual({
      accepted: null,
      completed: null,
      recordedCompletedEvents: expected,
      rematches: null
    });
  });
});

function eventAt(value: string | Date): { occurredAt: Date; recordedAt: Date } {
  return { occurredAt: new Date(value), recordedAt };
}
