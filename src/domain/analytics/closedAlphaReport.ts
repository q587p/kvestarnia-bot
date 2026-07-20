const DAY_MS = 24 * 60 * 60 * 1000;

export interface ClosedAlphaUserRow {
  createdAt: Date;
  lastActionAt: Date | null;
  characterId: string | null;
}

export interface ClosedAlphaFightRow {
  characterId: string;
  createdAt: Date;
}

export interface ClosedAlphaDuelRow {
  status: string;
  createdAt: Date;
  resolvedAt: Date | null;
}

export interface ClosedAlphaPartyRow {
  createdAt: Date;
  joinCount: number;
  startCount: number;
  finishCount: number;
}

export interface ClosedAlphaAggregateReport {
  privacy: {
    aggregateOnly: true;
    messageContentRead: false;
    individualRowsEmitted: false;
  };
  window: { from: string; to: string };
  acquisition: {
    created: number;
  };
  retention: {
    d1Eligible: number;
    d1Retained: number;
    d7Eligible: number;
    d7Retained: number;
  };
  firstDay: {
    charactersWithThreePveActions: number;
  };
  duels: {
    acceptedOrResolved: number;
    completed: number;
    rematches: null;
  };
  parties: {
    created: number;
    joined: number;
    started: number;
    finished: number;
  };
  missingInstrumentation: string[];
}

export function buildClosedAlphaAggregateReport(input: {
  from: Date;
  to: Date;
  users: readonly ClosedAlphaUserRow[];
  fights: readonly ClosedAlphaFightRow[];
  duels: readonly ClosedAlphaDuelRow[];
  parties: readonly ClosedAlphaPartyRow[];
}): ClosedAlphaAggregateReport {
  const users = input.users.filter((row) => inWindow(row.createdAt, input.from, input.to));
  const characterCreatedAt = new Map(
    users.flatMap((row) => row.characterId ? [[row.characterId, row.createdAt] as const] : [])
  );
  const firstDayPveCounts = new Map<string, number>();
  for (const row of input.fights) {
    const createdAt = characterCreatedAt.get(row.characterId);
    if (
      createdAt &&
      inWindow(row.createdAt, input.from, input.to) &&
      row.createdAt >= createdAt &&
      row.createdAt < new Date(createdAt.getTime() + DAY_MS)
    ) {
      firstDayPveCounts.set(row.characterId, (firstDayPveCounts.get(row.characterId) ?? 0) + 1);
    }
  }
  const d1Eligible = users.filter((row) => row.createdAt.getTime() + DAY_MS <= input.to.getTime());
  const d7Eligible = users.filter((row) => row.createdAt.getTime() + 7 * DAY_MS <= input.to.getTime());
  const duels = input.duels.filter((row) => inWindow(row.createdAt, input.from, input.to));
  const parties = input.parties.filter((row) => inWindow(row.createdAt, input.from, input.to));

  return {
    privacy: {
      aggregateOnly: true,
      messageContentRead: false,
      individualRowsEmitted: false
    },
    window: {
      from: input.from.toISOString(),
      to: input.to.toISOString()
    },
    acquisition: {
      created: users.length
    },
    retention: {
      d1Eligible: d1Eligible.length,
      d1Retained: retainedAfter(d1Eligible, DAY_MS),
      d7Eligible: d7Eligible.length,
      d7Retained: retainedAfter(d7Eligible, 7 * DAY_MS)
    },
    firstDay: {
      charactersWithThreePveActions: [...firstDayPveCounts.values()].filter((count) => count >= 3).length
    },
    duels: {
      acceptedOrResolved: duels.filter((row) => row.status !== "pending").length,
      completed: duels.filter((row) => row.resolvedAt !== null).length,
      rematches: null
    },
    parties: {
      created: parties.length,
      joined: parties.reduce((sum, row) => sum + row.joinCount, 0),
      started: parties.reduce((sum, row) => sum + row.startCount, 0),
      finished: parties.reduce((sum, row) => sum + row.finishCount, 0)
    },
    missingInstrumentation: [
      "Exact D1/D7 return sessions are unavailable; retention uses the latest canonical user activity timestamp.",
      "Duel rematch origin is not stored as a stable aggregate dimension.",
      "Quest-specific first-day completion is not available as a complete historical event stream."
    ]
  };
}

function retainedAfter(rows: readonly ClosedAlphaUserRow[], offsetMs: number): number {
  return rows.filter((row) =>
    row.lastActionAt !== null &&
    row.lastActionAt.getTime() >= row.createdAt.getTime() + offsetMs
  ).length;
}

function inWindow(value: Date, from: Date, to: Date): boolean {
  return value >= from && value < to;
}
