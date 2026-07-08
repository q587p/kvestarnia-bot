import { describe, expect, it } from "vitest";
import type { ActivityEventRecord } from "../../src/db/repositories/activityEventRepository";
import type { ResolvedDuelChallengeRecord } from "../../src/db/repositories/duelChallengeRepository";
import type {
  ClaimDuelTournamentRewardInput,
  DuelTournamentCharacterRecord,
  DuelTournamentClaimRecord,
  DuelTournamentRepository
} from "../../src/db/repositories/duelTournamentRepository";
import { DuelTournamentService } from "../../src/services/duelTournamentService";

describe("DuelTournamentService", () => {
  it("claims a completed period once, replays safely, and emits one Latest Events row", async () => {
    const repo = new FakeTournamentRepository([character("hero", 100n, "Ада")]);
    const duels = new FakeDuelSource([
      duel("duel-1", "2026-07-07T09:00:00.000Z", "hero", "rival", "challenger")
    ]);
    const events = new FakeActivityEvents();
    const service = new DuelTournamentService(
      repo,
      duels,
      events,
      () => new Date("2026-07-08T12:00:00.000Z")
    );

    const first = await service.claimRewardForTelegramUser(100n, "day", "2026-07-07");
    const replay = await service.claimRewardForTelegramUser(100n, "day", "2026-07-07");

    expect(first.state).toBe("claimed");
    expect(replay.state).toBe("claimed");
    expect(first.state === "claimed" && first.created).toBe(true);
    expect(replay.state === "claimed" && replay.created).toBe(false);
    expect(repo.goldByCharacter.get("hero")).toBe(3);
    expect(repo.itemQuantity("hero", "item.responsible-panic-bandage")).toBe(1);
    expect(events.records).toHaveLength(1);
    const [event] = events.records;
    expect(event?.eventType).toBe("duel.tournament_claimed");
    expect(event?.actorCharacterId).toBe("hero");
    expect(event?.payload).toEqual({ period: "day", periodKey: "2026-07-07", rank: 1, points: 3 });
  });

  it("does not claim current periods or non-placement periods", async () => {
    const repo = new FakeTournamentRepository([character("hero", 100n, "Ада")]);
    const duels = new FakeDuelSource([
      duel("duel-current", "2026-07-08T09:00:00.000Z", "hero", "rival", "challenger")
    ]);
    const service = new DuelTournamentService(
      repo,
      duels,
      new FakeActivityEvents(),
      () => new Date("2026-07-08T12:00:00.000Z")
    );

    await expect(service.claimRewardForTelegramUser(100n, "day", "2026-07-08"))
      .resolves.toEqual(expect.objectContaining({ state: "not-ended" }));
    await expect(service.claimRewardForTelegramUser(100n, "week", "2026-W27"))
      .resolves.toEqual(expect.objectContaining({ state: "not-eligible" }));
    expect(repo.goldByCharacter.get("hero") ?? 0).toBe(0);
  });

  it("shows current standings and previous winners without exposing losses", async () => {
    const repo = new FakeTournamentRepository([character("hero", 100n, "Ада")]);
    const service = new DuelTournamentService(
      repo,
      new FakeDuelSource([
        duel("previous", "2026-07-07T09:00:00.000Z", "rival", "hero", "challenger"),
        duel("current", "2026-07-08T09:00:00.000Z", "hero", "rival", "challenger")
      ]),
      new FakeActivityEvents(),
      () => new Date("2026-07-08T12:00:00.000Z")
    );

    const result = await service.getBoardForTelegramUser(100n, "day");

    expect(result.state).toBe("ready");
    if (result.state !== "ready") {
      return;
    }
    expect(result.board.yourPoints).toBe(3);
    expect(result.board.previousWinners[0]).toEqual(expect.objectContaining({ characterId: "rival" }));
    expect(result.board.claim.state).toBe("unavailable");
  });
});

class FakeTournamentRepository implements DuelTournamentRepository {
  readonly goldByCharacter = new Map<string, number>();
  private readonly claims = new Map<string, DuelTournamentClaimRecord>();
  private readonly items = new Map<string, number>();

  constructor(private readonly characters: DuelTournamentCharacterRecord[]) {}

  findCharacterByTelegramUser(telegramUserId: bigint): Promise<DuelTournamentCharacterRecord | null> {
    return Promise.resolve(this.characters.find((character) => character.telegramUserId === telegramUserId) ?? null);
  }

  findClaim(characterId: string, period: "day" | "week" | "month", periodKey: string): Promise<DuelTournamentClaimRecord | null> {
    return Promise.resolve(this.claims.get(claimKey(characterId, period, periodKey)) ?? null);
  }

  claimReward(input: ClaimDuelTournamentRewardInput): Promise<{ claim: DuelTournamentClaimRecord; created: boolean }> {
    const key = claimKey(input.characterId, input.period, input.periodKey);
    const existing = this.claims.get(key);
    if (existing) {
      return Promise.resolve({ claim: existing, created: false });
    }

    const claim: DuelTournamentClaimRecord = {
      id: `claim-${this.claims.size + 1}`,
      characterId: input.characterId,
      period: input.period,
      periodKey: input.periodKey,
      points: input.points,
      rank: input.rank,
      rewardGold: input.reward.gold,
      rewardItems: input.reward.items,
      result: input.result,
      claimedAt: input.claimedAt,
      createdAt: input.claimedAt,
      updatedAt: input.claimedAt
    };
    this.claims.set(key, claim);
    this.goldByCharacter.set(input.characterId, (this.goldByCharacter.get(input.characterId) ?? 0) + input.reward.gold);
    for (const item of input.reward.items) {
      const itemKey = `${input.characterId}:${item.itemId}`;
      this.items.set(itemKey, (this.items.get(itemKey) ?? 0) + item.quantity);
    }
    return Promise.resolve({ claim, created: true });
  }

  itemQuantity(characterId: string, itemId: string): number {
    return this.items.get(`${characterId}:${itemId}`) ?? 0;
  }
}

class FakeDuelSource {
  constructor(private readonly records: ResolvedDuelChallengeRecord[]) {}

  listResolvedSince(since: Date): Promise<ResolvedDuelChallengeRecord[]> {
    return Promise.resolve(this.records.filter((record) => record.resolvedAt >= since));
  }
}

class FakeActivityEvents {
  readonly records: Partial<ActivityEventRecord>[] = [];

  recordDuelTournamentClaimedSafely(input: {
    characterId: string;
    actorDisplayName: string;
    claimId: string;
    period: "day" | "week" | "month";
    periodKey: string;
    rank: number;
    points: number;
    occurredAt: Date;
  }): Promise<ActivityEventRecord | null> {
    this.records.push({
      eventType: "duel.tournament_claimed",
      actorCharacterId: input.characterId,
      actorDisplayName: input.actorDisplayName,
      sourceId: input.claimId,
      payload: {
        period: input.period,
        periodKey: input.periodKey,
        rank: input.rank,
        points: input.points
      }
    });
    return Promise.resolve(null);
  }
}

function character(id: string, telegramUserId: bigint, name: string): DuelTournamentCharacterRecord {
  return {
    id,
    userId: `user-${id}`,
    telegramUserId,
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
    remortCount: 0
  };
}

function duel(
  id: string,
  resolvedAt: string,
  challengerId: string,
  targetId: string,
  outcome: "challenger" | "target" | "draw"
): ResolvedDuelChallengeRecord {
  return {
    id,
    challengerCharacterId: challengerId,
    targetCharacterId: targetId,
    contextChatId: null,
    inviteToken: id,
    mode: "turn-based",
    status: "resolved",
    expiresAt: new Date("2026-07-08T00:00:00.000Z"),
    resolvedAt: new Date(resolvedAt),
    result: {
      mode: "turn-based",
      terminalReason: "defeat",
      outcome,
      winnerCharacterId: outcome === "draw" ? null : outcome === "challenger" ? challengerId : targetId,
      loserCharacterId: outcome === "draw" ? null : outcome === "challenger" ? targetId : challengerId,
      challengerScore: 1,
      targetScore: 1,
      swing: 0,
      flavorKey: "test",
      participants: {
        challenger: participant(challengerId),
        target: participant(targetId)
      }
    },
    createdAt: new Date("2026-07-08T00:00:00.000Z"),
    updatedAt: new Date("2026-07-08T00:00:00.000Z"),
    challenger: duelCharacter(challengerId),
    target: duelCharacter(targetId)
  };
}

function participant(characterId: string) {
  return {
    characterId,
    displayName: characterId === "hero" ? "Ада" : "Бор",
    title: "Воїн",
    raceId: "race.human-ish",
    raceName: "Людинуватий",
    classId: "class.warrior",
    className: "Воїн",
    level: 3,
    remortCount: 0
  };
}

function duelCharacter(id: string) {
  return {
    ...character(id, id === "hero" ? 100n : 200n, id === "hero" ? "Ада" : "Бор"),
    equipment: []
  };
}

function claimKey(characterId: string, period: string, periodKey: string): string {
  return `${characterId}:${period}:${periodKey}`;
}
