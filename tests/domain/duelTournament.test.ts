import { describe, expect, it } from "vitest";
import type { ResolvedDuelChallengeRecord } from "../../src/db/repositories/duelChallengeRepository";
import {
  buildDuelTournamentStandings,
  DUEL_TOURNAMENT_DAILY_REWARD_ITEM_ID,
  DUEL_TOURNAMENT_MONTHLY_REWARD_ITEM_ID,
  DUEL_TOURNAMENT_WEEKLY_REWARD_ITEM_ID,
  type DuelTournamentPeriod,
  getDuelTournamentReward,
  getDuelTournamentWindow,
  getPreviousDuelTournamentWindow
} from "../../src/domain/duels/duelTournament";

type ExpectedReward = { gold: number; itemId: string; quantity: number };

describe("duel tournament domain", () => {
  it("uses fixed Kyiv periods and previous period rollover", () => {
    const current = getDuelTournamentWindow("day", new Date("2026-07-08T12:00:00.000Z"));
    const previousWeek = getPreviousDuelTournamentWindow("week", new Date("2026-07-08T12:00:00.000Z"));
    const currentMonth = getDuelTournamentWindow("month", new Date("2026-07-08T12:00:00.000Z"));

    expect(current.key).toBe("2026-07-08");
    expect(current.startsAt.toISOString()).toBe("2026-07-07T21:00:00.000Z");
    expect(current.endsAt.toISOString()).toBe("2026-07-08T21:00:00.000Z");
    expect(previousWeek.key).toBe("2026-W27");
    expect(currentMonth.key).toBe("2026-07");
  });

  it("scores completed turn-based duels once and limits repeated wins against the same opponent", () => {
    const window = getDuelTournamentWindow("day", new Date("2026-07-08T12:00:00.000Z"));
    const records = [
      duel("duel-1", "2026-07-08T08:00:00.000Z", "challenger", "turn-based"),
      duel("duel-2", "2026-07-08T09:00:00.000Z", "challenger", "turn-based"),
      duel("duel-3", "2026-07-08T10:00:00.000Z", "challenger", "turn-based"),
      duel("duel-4", "2026-07-08T11:00:00.000Z", "draw", "turn-based"),
      duel("duel-4", "2026-07-08T11:00:00.000Z", "draw", "turn-based"),
      duel("quick-1", "2026-07-08T12:00:00.000Z", "target", "quick"),
      duel("expired-1", "2026-07-08T13:00:00.000Z", "target", "turn-based", "expired"),
      duel("old-1", "2026-07-07T20:59:59.000Z", "target", "turn-based")
    ];

    const standings = buildDuelTournamentStandings(records, window);

    expect(standings).toEqual([
      expect.objectContaining({ characterId: "challenger", points: 5, wins: 2, draws: 1, rank: 1 }),
      expect.objectContaining({ characterId: "target", points: 1, wins: 0, draws: 1, rank: 2 })
    ]);
  });

  it("keeps reward calculations bounded by period and placement", () => {
    const expectedRewards: Record<DuelTournamentPeriod, ExpectedReward[]> = {
      day: [
        { gold: 42, itemId: DUEL_TOURNAMENT_DAILY_REWARD_ITEM_ID, quantity: 5 },
        { gold: 23, itemId: DUEL_TOURNAMENT_DAILY_REWARD_ITEM_ID, quantity: 3 },
        { gold: 13, itemId: DUEL_TOURNAMENT_DAILY_REWARD_ITEM_ID, quantity: 1 }
      ],
      week: [
        { gold: 93, itemId: DUEL_TOURNAMENT_WEEKLY_REWARD_ITEM_ID, quantity: 5 },
        { gold: 42, itemId: DUEL_TOURNAMENT_WEEKLY_REWARD_ITEM_ID, quantity: 3 },
        { gold: 23, itemId: DUEL_TOURNAMENT_WEEKLY_REWARD_ITEM_ID, quantity: 1 }
      ],
      month: [
        { gold: 587, itemId: DUEL_TOURNAMENT_MONTHLY_REWARD_ITEM_ID, quantity: 3 },
        { gold: 93, itemId: DUEL_TOURNAMENT_MONTHLY_REWARD_ITEM_ID, quantity: 2 },
        { gold: 42, itemId: DUEL_TOURNAMENT_MONTHLY_REWARD_ITEM_ID, quantity: 1 }
      ]
    };

    for (const [period, rewards] of Object.entries(expectedRewards) as [DuelTournamentPeriod, ExpectedReward[]][]) {
      for (const [index, reward] of rewards.entries()) {
        expect(getDuelTournamentReward(period, index + 1, 5)).toEqual({
          gold: reward.gold,
          items: [{ itemId: reward.itemId, quantity: reward.quantity }]
        });
      }
    }

    expect(getDuelTournamentReward("month", 4, 99)).toBeNull();
    expect(getDuelTournamentReward("day", 1, 0)).toBeNull();
  });
});

function duel(
  id: string,
  resolvedAt: string,
  outcome: "challenger" | "target" | "draw",
  mode: "quick" | "turn-based",
  terminalReason: "defeat" | "expired" = "defeat"
): ResolvedDuelChallengeRecord {
  return {
    id,
    challengerCharacterId: "challenger",
    targetCharacterId: "target",
    contextChatId: null,
    inviteToken: id,
    mode,
    status: "resolved",
    expiresAt: new Date("2026-07-08T00:00:00.000Z"),
    resolvedAt: new Date(resolvedAt),
    result: {
      mode,
      terminalReason,
      outcome,
      winnerCharacterId: outcome === "draw" ? null : outcome,
      loserCharacterId: outcome === "draw" ? null : outcome === "challenger" ? "target" : "challenger",
      challengerScore: 1,
      targetScore: 1,
      swing: 0,
      flavorKey: "test",
      participants: {
        challenger: {
          characterId: "challenger",
          displayName: "Ада",
          title: "Воїн",
          raceId: "race.human-ish",
          raceName: "Людинуватий",
          classId: "class.warrior",
          className: "Воїн",
          level: 3,
          remortCount: 0
        },
        target: {
          characterId: "target",
          displayName: "Бор",
          title: "Воїн",
          raceId: "race.human-ish",
          raceName: "Людинуватий",
          classId: "class.warrior",
          className: "Воїн",
          level: 3,
          remortCount: 0
        }
      }
    },
    createdAt: new Date("2026-07-08T00:00:00.000Z"),
    updatedAt: new Date("2026-07-08T00:00:00.000Z"),
    challenger: character("challenger", "Ада"),
    target: character("target", "Бор")
  };
}

function character(id: string, name: string) {
  return {
    id,
    userId: `user-${id}`,
    telegramUserId: id === "challenger" ? 1n : 2n,
    name,
    pronoun: "they",
    path: "boundary",
    raceId: "race.human-ish",
    classId: "class.warrior",
    level: 3,
    xp: 0,
    gold: 0,
    hpCurrent: 25,
    hpMax: 25,
    manaCurrent: 10,
    manaMax: 10,
    statsJson: {},
    equipment: []
  };
}
