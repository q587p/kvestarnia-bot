import { describe, expect, it } from "vitest";
import type {
  DuelChallengeRecord,
  DuelChallengeRepository,
  DuelCharacterSnapshot,
  DuelResultPayload,
  ResolvedDuelChallengeRecord
} from "../../src/db/repositories/duelChallengeRepository";
import type { CharacterRecord } from "../../src/db/repositories/characterRepository";
import { DuelChallengeService } from "../../src/services/duelChallengeService";
import { FakeRandomSource } from "../../src/shared/random";

const fixedNow = () => new Date("2026-06-17T18:00:00.000Z");

describe("DuelChallengeService", () => {
  it("does not create an invite for missing or low-level characters", async () => {
    const world = new FakeDuelWorld();
    const service = buildService(world);

    await expect(service.createOpenChallengeForTelegramUser(1n)).resolves.toEqual({
      state: "no-character"
    });

    world.addCharacter(1n, { level: 2, xp: 10 });
    const gated = await service.createOpenChallengeForTelegramUser(1n);

    expect(gated).toMatchObject({ state: "level-gated", minLevel: 3 });
    expect(world.challenges.size).toBe(0);
  });

  it("creates an open invite and warns when the challenger is not fully rested", async () => {
    const world = new FakeDuelWorld();
    world.addCharacter(1n, { hpCurrent: 12, hpMax: 24 });
    const service = buildService(world);

    const result = await service.createOpenChallengeForTelegramUser(1n, { contextChatId: -100n });

    expect(result).toMatchObject({
      state: "pending",
      challengerResourceWarning: {
        hpBelowMax: true,
        manaBelowMax: true
      }
    });
    expect(result.state === "pending" && result.challenge.contextChatId).toBe(-100n);
  });

  it("shows a resource warning before accepting with partial resources", async () => {
    const world = new FakeDuelWorld();
    world.addCharacter(1n);
    world.addCharacter(2n, { hpCurrent: 10, hpMax: 24, manaCurrent: 4, manaMax: 12 });
    const service = buildService(world);
    const created = await service.createOpenChallengeForTelegramUser(1n);

    if (created.state !== "pending") {
      throw new Error(`Expected pending invite, got ${created.state}`);
    }

    const warning = await service.acceptForTelegramUser(2n, created.challenge.inviteToken);

    expect(warning).toMatchObject({
      state: "resource-warning",
      warning: {
        hpBelowMax: true,
        manaBelowMax: true
      }
    });
    expect(world.challenges.get(created.challenge.inviteToken)?.status).toBe("pending");

    const accepted = await service.acceptForTelegramUser(2n, created.challenge.inviteToken, {
      ignoreResourceWarning: true
    });

    expect(accepted).toMatchObject({
      state: "resolved",
      result: {
        outcome: "draw"
      }
    });
    expect(world.challenges.get(created.challenge.inviteToken)?.status).toBe("resolved");
  });

  it("prevents self-accept and replays resolved challenges", async () => {
    const world = new FakeDuelWorld();
    world.addCharacter(1n);
    world.addCharacter(2n);
    const service = buildService(world);
    const created = await service.createOpenChallengeForTelegramUser(1n);

    if (created.state !== "pending") {
      throw new Error(`Expected pending invite, got ${created.state}`);
    }

    await expect(service.acceptForTelegramUser(1n, created.challenge.inviteToken)).resolves.toMatchObject({
      state: "self-challenge"
    });

    const accepted = await service.acceptForTelegramUser(2n, created.challenge.inviteToken, {
      ignoreResourceWarning: true
    });
    const replay = await service.acceptForTelegramUser(2n, created.challenge.inviteToken);

    expect(accepted).toMatchObject({ state: "resolved" });
    expect(replay).toMatchObject({ state: "resolved" });
  });

  it("keeps open invites pending when bystanders cancel or decline", async () => {
    const world = new FakeDuelWorld();
    world.addCharacter(1n);
    world.addCharacter(2n);
    const service = buildService(world);
    const created = await service.createOpenChallengeForTelegramUser(1n);

    if (created.state !== "pending") {
      throw new Error(`Expected pending invite, got ${created.state}`);
    }

    await expect(service.cancelForTelegramUser(2n, created.challenge.inviteToken)).resolves.toMatchObject({
      state: "not-owner"
    });
    expect(world.challenges.get(created.challenge.inviteToken)?.status).toBe("pending");

    await expect(service.declineForTelegramUser(2n, created.challenge.inviteToken)).resolves.toMatchObject({
      state: "open-invite"
    });
    expect(world.challenges.get(created.challenge.inviteToken)?.status).toBe("pending");
  });

  it("replays terminal open invite state before owner or open-invite guards", async () => {
    const world = new FakeDuelWorld();
    world.addCharacter(1n);
    world.addCharacter(2n);
    const service = buildService(world);
    const created = await service.createOpenChallengeForTelegramUser(1n);

    if (created.state !== "pending") {
      throw new Error(`Expected pending invite, got ${created.state}`);
    }

    await service.cancelForTelegramUser(1n, created.challenge.inviteToken);

    await expect(service.cancelForTelegramUser(2n, created.challenge.inviteToken)).resolves.toMatchObject({
      state: "cancelled"
    });
    await expect(service.declineForTelegramUser(2n, created.challenge.inviteToken)).resolves.toMatchObject({
      state: "cancelled"
    });
  });

  it("replays expired open invites before open-invite decline handling", async () => {
    const world = new FakeDuelWorld();
    world.addCharacter(1n);
    world.addCharacter(2n);
    const service = buildService(world);
    const created = await service.createOpenChallengeForTelegramUser(1n);

    if (created.state !== "pending") {
      throw new Error(`Expected pending invite, got ${created.state}`);
    }

    world.challenges.set(created.challenge.inviteToken, {
      ...created.challenge,
      expiresAt: new Date("2026-06-17T17:59:00.000Z")
    });

    await expect(service.declineForTelegramUser(2n, created.challenge.inviteToken)).resolves.toMatchObject({
      state: "expired"
    });
    expect(world.challenges.get(created.challenge.inviteToken)?.status).toBe("expired");
  });

  it("builds winner boards from resolved non-draw duels", async () => {
    const world = new FakeDuelWorld();
    world.addCharacter(1n, { name: "Пані Сила" });
    world.addCharacter(2n, { name: "Пан Обережний" });
    const service = buildService(world);
    const created = await service.createOpenChallengeForTelegramUser(1n);

    if (created.state !== "pending") {
      throw new Error(`Expected pending invite, got ${created.state}`);
    }

    await service.acceptForTelegramUser(2n, created.challenge.inviteToken, {
      ignoreResourceWarning: true
    });

    const accepted = world.challenges.get(created.challenge.inviteToken);

    if (!accepted?.result) {
      throw new Error("Expected resolved duel");
    }

    world.challenges.set(created.challenge.inviteToken, {
      ...accepted,
      result: {
        ...accepted.result,
        outcome: "challenger",
        winnerCharacterId: accepted.challengerCharacterId,
        loserCharacterId: accepted.targetCharacterId
      }
    });

    await expect(service.getLeaderboard()).resolves.toEqual({
      day: [{ characterId: "character-1", name: "Пані Сила", winCount: 1 }],
      week: [{ characterId: "character-1", name: "Пані Сила", winCount: 1 }],
      month: [{ characterId: "character-1", name: "Пані Сила", winCount: 1 }]
    });
  });
});

function buildService(world: FakeDuelWorld): DuelChallengeService {
  return new DuelChallengeService(world, fixedNow, new FakeRandomSource([0.5]));
}

class FakeDuelWorld implements DuelChallengeRepository {
  readonly characters = new Map<bigint, DuelCharacterSnapshot>();
  readonly challenges = new Map<string, DuelChallengeRecord>();

  addCharacter(telegramUserId: bigint, overrides: Partial<CharacterRecord> = {}): void {
    const characterId = `character-${telegramUserId.toString()}`;
    const base: DuelCharacterSnapshot = {
      id: characterId,
      telegramUserId,
      userId: `user-${telegramUserId.toString()}`,
      name: `Пригодник ${telegramUserId.toString()}`,
      pronoun: "they",
      path: "path.boundary",
      raceId: "race.human-ish",
      classId: "class.warrior",
      level: 3,
      xp: 25,
      gold: 0,
      hpCurrent: 24,
      hpMax: 24,
      manaCurrent: 12,
      manaMax: 12,
      statsJson: {
        strength: 7,
        dexterity: 7,
        intelligence: 6,
        charisma: 6,
        luck: 6
      },
      equipment: [],
      ...overrides
    };
    this.characters.set(telegramUserId, base);
  }

  createOpenForTelegramUser(
    telegramUserId: bigint,
    input: { inviteToken: string; contextChatId?: bigint | null; expiresAt: Date }
  ): Promise<DuelChallengeRecord | null> {
    const challenger = this.characters.get(telegramUserId);

    if (!challenger) {
      return Promise.resolve(null);
    }

    const challenge: DuelChallengeRecord = {
      id: `duel-${this.challenges.size + 1}`,
      challengerCharacterId: challenger.id,
      targetCharacterId: null,
      contextChatId: input.contextChatId ?? null,
      inviteToken: input.inviteToken,
      status: "pending",
      expiresAt: input.expiresAt,
      resolvedAt: null,
      result: null,
      createdAt: fixedNow(),
      updatedAt: fixedNow(),
      challenger,
      target: null
    };
    this.challenges.set(input.inviteToken, challenge);

    return Promise.resolve(challenge);
  }

  findCharacterByTelegramUser(telegramUserId: bigint): Promise<DuelCharacterSnapshot | null> {
    return Promise.resolve(this.characters.get(telegramUserId) ?? null);
  }

  findByToken(inviteToken: string): Promise<DuelChallengeRecord | null> {
    return Promise.resolve(this.challenges.get(inviteToken) ?? null);
  }

  markExpiredByToken(inviteToken: string, now: Date): Promise<DuelChallengeRecord | null> {
    const challenge = this.challenges.get(inviteToken);

    if (challenge?.status === "pending" && challenge.expiresAt <= now) {
      const updated = { ...challenge, status: "expired" as const, updatedAt: now };
      this.challenges.set(inviteToken, updated);

      return Promise.resolve(updated);
    }

    return Promise.resolve(challenge ?? null);
  }

  cancelByTokenForTelegramUser(
    inviteToken: string,
    telegramUserId: bigint,
    now: Date
  ): Promise<DuelChallengeRecord | null> {
    const challenge = this.challenges.get(inviteToken);

    if (challenge?.status === "pending" && challenge.challenger.telegramUserId === telegramUserId) {
      const updated = { ...challenge, status: "cancelled" as const, updatedAt: now };
      this.challenges.set(inviteToken, updated);

      return Promise.resolve(updated);
    }

    return Promise.resolve(challenge ?? null);
  }

  declineByTokenForTelegramUser(): Promise<DuelChallengeRecord | null> {
    return Promise.resolve(null);
  }

  acceptByTokenForTelegramUser(
    inviteToken: string,
    telegramUserId: bigint,
    now: Date,
    result: DuelResultPayload
  ): Promise<DuelChallengeRecord | null> {
    const challenge = this.challenges.get(inviteToken);
    const target = this.characters.get(telegramUserId);

    if (
      !challenge ||
      !target ||
      challenge.status !== "pending" ||
      challenge.expiresAt <= now ||
      challenge.challengerCharacterId === target.id
    ) {
      return Promise.resolve(challenge ?? null);
    }

    const updated = {
      ...challenge,
      targetCharacterId: target.id,
      target,
      status: "resolved" as const,
      resolvedAt: now,
      result,
      updatedAt: now
    };
    this.challenges.set(inviteToken, updated);

    return Promise.resolve(updated);
  }

  listResolvedSince(since: Date): Promise<ResolvedDuelChallengeRecord[]> {
    return Promise.resolve(
      [...this.challenges.values()].filter(
        (challenge) =>
          challenge.status === "resolved" &&
          challenge.resolvedAt !== null &&
          challenge.resolvedAt >= since &&
          challenge.result !== null &&
          challenge.target !== null
      ) as ResolvedDuelChallengeRecord[]
    );
  }
}
