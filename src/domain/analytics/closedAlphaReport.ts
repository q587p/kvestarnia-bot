const DAY_MS = 24 * 60 * 60 * 1000;

export interface ClosedAlphaRecordedEventRow {
  occurredAt: Date;
  recordedAt: Date;
}

export interface ClosedAlphaRecordedDuelEventRow extends ClosedAlphaRecordedEventRow {
  status: string;
}

export interface ClosedAlphaAggregateReport {
  privacy: { aggregateOnly: true; messageContentRead: false; individualRowsEmitted: false };
  window: { from: string; to: string };
  acquisition: {
    characterCreationCompleted: null;
    recordedCharacterCreationEvents: number;
  };
  retention: {
    d1EligibleRecordedCharacters: number;
    d1Retained: null;
    d7EligibleRecordedCharacters: number;
    d7Retained: null;
  };
  firstDay: { charactersWithThreeSoloCombatSessionsProxy: null };
  duels: {
    accepted: null;
    completed: null;
    recordedCompletedEvents: number;
    rematches: null;
  };
  parties: {
    created: null;
    joined: null;
    started: null;
    finished: null;
    recordedFinishedEvents: number;
  };
  operations: {
    guildWeeklyGoal: ClosedAlphaGuildWeeklyGoalMetrics;
  };
  missingInstrumentation: string[];
}

export interface ClosedAlphaGuildWeeklyGoalMetrics {
  periodsStarted: number;
  periodsCompleted: number;
  expeditionReceipts: number;
  contributorReceipts: number;
  reconciliationDecisions: number;
  reconciliations: {
    credited: number;
    ineligible: number;
    ineligibleByReason: Record<string, number>;
  };
  gloryReceipts: number;
  achievementEntitlements: number;
  achievementNotifications: {
    pending: number;
    claimed: number;
    projected: number;
    sent: number;
    permanentFailure: number;
  };
}

export function buildClosedAlphaAggregateReport(input: {
  from: Date;
  to: Date;
  characterCreationEvents: readonly ClosedAlphaRecordedEventRow[];
  duelEvents: readonly ClosedAlphaRecordedDuelEventRow[];
  partyFinishEvents: readonly ClosedAlphaRecordedEventRow[];
  guildWeeklyGoalMetrics: ClosedAlphaGuildWeeklyGoalMetrics;
}): ClosedAlphaAggregateReport {
  const characterCreationEvents = input.characterCreationEvents.filter((row) =>
    isStableWindowEvent(row, input.from, input.to)
  );
  const recordedCompletedDuels = input.duelEvents.filter((row) =>
    row.status === "resolved" && isStableWindowEvent(row, input.from, input.to)
  );
  const recordedFinishedParties = input.partyFinishEvents.filter((row) =>
    isStableWindowEvent(row, input.from, input.to)
  );

  return {
    privacy: { aggregateOnly: true, messageContentRead: false, individualRowsEmitted: false },
    window: { from: input.from.toISOString(), to: input.to.toISOString() },
    acquisition: {
      characterCreationCompleted: null,
      recordedCharacterCreationEvents: characterCreationEvents.length
    },
    retention: {
      d1EligibleRecordedCharacters: characterCreationEvents.filter(
        (row) => row.occurredAt.getTime() + DAY_MS <= input.to.getTime()
      ).length,
      d1Retained: null,
      d7EligibleRecordedCharacters: characterCreationEvents.filter(
        (row) => row.occurredAt.getTime() + 7 * DAY_MS <= input.to.getTime()
      ).length,
      d7Retained: null
    },
    firstDay: { charactersWithThreeSoloCombatSessionsProxy: null },
    duels: {
      accepted: null,
      completed: null,
      recordedCompletedEvents: recordedCompletedDuels.length,
      rematches: null
    },
    parties: {
      created: null,
      joined: null,
      started: null,
      finished: null,
      recordedFinishedEvents: recordedFinishedParties.length
    },
    operations: {
      guildWeeklyGoal: structuredClone(input.guildWeeklyGoalMetrics)
    },
    missingInstrumentation: [
      "ActivityEvent is best-effort and historical coverage is not certified, so recorded character-creation events are not promoted to an exact acquisition KPI.",
      "Exact historical D1/D7 return sessions are unavailable; mutable latest-activity timestamps are not used as retention evidence.",
      "Duel acceptance time, complete duel-resolution history, and rematch origin are not stored as certified historical events.",
      "SoloCombatSession rows are mutable lifecycle data, so no precise first-day PvE action or combat-session KPI is emitted.",
      "Party creation, join, start, and complete finish history are not stored as a certified immutable event stream.",
      "Recorded event counts include only rows whose occurrence is inside [from, to) and whose ledger row existed before to; later backfills cannot change this report."
    ]
  };
}

function isStableWindowEvent(row: ClosedAlphaRecordedEventRow, from: Date, to: Date): boolean {
  return row.occurredAt >= from && row.occurredAt < to && row.recordedAt < to;
}
