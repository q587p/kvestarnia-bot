import { describe, expect, it } from "vitest";
import { buildClosedAlphaAggregateReport } from "../../src/domain/analytics/closedAlphaReport";

describe("closed alpha aggregate report", () => {
  it("emits aggregate funnel counts without individual or message content", () => {
    const report = buildClosedAlphaAggregateReport({
      from: new Date("2026-07-01T00:00:00.000Z"),
      to: new Date("2026-07-20T00:00:00.000Z"),
      users: [
        { createdAt: new Date("2026-07-01T10:00:00.000Z"), lastActionAt: new Date("2026-07-09T10:00:00.000Z"), characterId: "one" },
        { createdAt: new Date("2026-07-19T10:00:00.000Z"), lastActionAt: null, characterId: "two" }
      ],
      fights: [
        { characterId: "one", createdAt: new Date("2026-07-01T11:00:00.000Z") },
        { characterId: "one", createdAt: new Date("2026-07-01T12:00:00.000Z") },
        { characterId: "one", createdAt: new Date("2026-07-01T13:00:00.000Z") },
        { characterId: "two", createdAt: new Date("2026-07-20T11:00:00.000Z") }
      ],
      duels: [
        { status: "resolved", createdAt: new Date("2026-07-02T00:00:00.000Z"), resolvedAt: new Date("2026-07-02T00:01:00.000Z") }
      ],
      parties: [
        { createdAt: new Date("2026-07-03T00:00:00.000Z"), joinCount: 2, startCount: 1, finishCount: 1 }
      ]
    });

    expect(report).toMatchObject({
      acquisition: { created: 2 },
      retention: { d1Eligible: 1, d1Retained: 1, d7Eligible: 1, d7Retained: 1 },
      firstDay: { charactersWithThreePveActions: 1 },
      duels: { acceptedOrResolved: 1, completed: 1, rematches: null },
      parties: { created: 1, joined: 2, started: 1, finished: 1 }
    });
    const output = JSON.stringify(report);
    expect(output).not.toContain("one");
    expect(output).not.toContain("two");
    expect(output).not.toContain("actorCharacterId");
    expect(output).not.toContain("telegramUserId");
    expect(output).not.toContain("body");
    expect(report.missingInstrumentation).toContain("Duel rematch origin is not stored as a stable aggregate dimension.");
  });
});
