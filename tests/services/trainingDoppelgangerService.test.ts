import { describe, expect, it } from "vitest";
import type {
  CharacterRecord,
  CharacterRepository,
  CreateCharacterInput,
  CreateCharacterResult
} from "../../src/db/repositories/characterRepository";
import type {
  CharacterCooldownRecord,
  ClaimCooldownRewardInput,
  ClaimCooldownRewardResult,
  CooldownRepository
} from "../../src/db/repositories/cooldownRepository";
import type {
  ClaimDailyActionInput,
  ClaimDailyActionResult,
  DailyActionRecord,
  DailyActionRepository
} from "../../src/db/repositories/dailyActionRepository";
import type {
  DuelCharacterSnapshot,
  ResolvedDuelChallengeRecord
} from "../../src/db/repositories/duelChallengeRepository";
import type {
  CreateSoloCombatSessionInput,
  RecordSoloCombatRewardInput,
  SoloCombatSessionRecord,
  SoloCombatSessionRepository,
  UpdateSoloCombatSessionInput
} from "../../src/db/repositories/soloCombatSessionRepository";
import type { TelegramUserProfile } from "../../src/db/repositories/userRepository";
import {
  TRAINING_DOPPELGANGER_MIN_LEVEL,
  TRAINING_DOPPELGANGER_MONSTER_ID
} from "../../src/domain/trainingDoppelganger";
import { FakeRandomSource } from "../../src/shared/random";
import {
  TrainingDoppelgangerService,
  type TrainingDoppelgangerChampionSource,
  TRAINING_DOPPELGANGER_COOLDOWN_KEY,
  TRAINING_DOPPELGANGER_REWARD_KEY
} from "../../src/services/trainingDoppelgangerService";

const telegramUserId = 42n;
const fixedNow = () => new Date("2026-06-17T09:30:00.000Z");

describe("TrainingDoppelgangerService", () => {
  it("returns no-character without mutating anything", async () => {
    const world = new FakeWorld();
    const service = buildService(world);

    await expect(service.getOrStartForTelegramUser(telegramUserId)).resolves.toEqual({
      state: "no-character"
    });
    expect(world.sessions.size).toBe(0);
    expect(world.actions.size).toBe(0);
  });

  it("starts a turn-based training session instead of an instant result card", async () => {
    const world = new FakeWorld();
    world.addCharacter(telegramUserId);
    const service = buildService(world);

    const result = await service.getOrStartForTelegramUser(telegramUserId);

    expect(result).toMatchObject({
      state: "active",
      session: {
        monsterId: TRAINING_DOPPELGANGER_MONSTER_ID,
        status: "active"
      }
    });
    expect(world.actions.size).toBe(0);
    expect(world.cooldowns.size).toBe(0);
  });

  it("shows start choices without creating a training session", async () => {
    const world = new FakeWorld();
    world.addCharacter(telegramUserId);
    const service = buildService(world);

    const result = await service.getStartOptionsForTelegramUser(telegramUserId);

    expect(result).toMatchObject({
      state: "ready",
      choices: [
        { mode: "copy-target" },
        { mode: "random-build" }
      ]
    });
    expect(world.sessions.size).toBe(0);
  });

  it("offers distinct duel champions and starts the selected champion copy", async () => {
    const world = new FakeWorld();
    world.addCharacter(telegramUserId);
    const championSource = new FakeChampionSource([
      resolvedDuel("day-a", duelSnapshot("character-a", "Ада", "class.rogue"), new Date("2026-06-17T03:30:00.000Z")),
      resolvedDuel("week-b-1", duelSnapshot("character-b", "Боривітер", "class.bard"), new Date("2026-06-15T09:30:00.000Z")),
      resolvedDuel("week-b-2", duelSnapshot("character-b", "Боривітер", "class.bard"), new Date("2026-06-15T10:30:00.000Z")),
      resolvedDuel("month-c-1", duelSnapshot("character-c", "Варта", "class.mage"), new Date("2026-06-07T09:30:00.000Z")),
      resolvedDuel("month-c-2", duelSnapshot("character-c", "Варта", "class.mage"), new Date("2026-06-07T10:30:00.000Z")),
      resolvedDuel("month-c-3", duelSnapshot("character-c", "Варта", "class.mage"), new Date("2026-06-07T11:30:00.000Z"))
    ]);
    const service = buildService(world, new FakeRandomSource([0.5]), championSource);

    const preview = await service.getStartOptionsForTelegramUser(telegramUserId);

    expect(preview.state).toBe("ready");
    if (preview.state === "ready") {
      expect(preview.choices.map((choice) => choice.mode)).toEqual([
        "copy-target",
        "random-build",
        "champion-day",
        "champion-week",
        "champion-month"
      ]);
    }

    const started = await service.getOrStartForTelegramUser(telegramUserId, {
      mode: "champion-week"
    });

    expect(started.state).toBe("active");
    if (started.state === "active") {
      expect(started.doppelganger.className).toBe("Бард");
      expect(started.doppelganger.championPeriod).toBe("week");
      expect(started.doppelganger.championName).toBe("Боривітер");
      expect(started.session.state?.monster.debugTrace).toMatchObject({
        spawnMode: "COPY_CHAMPION_WEEK",
        source: "champion-fallback",
        championPeriod: "week",
        championName: "Боривітер"
      });
    }
    expect(world.sessions.size).toBe(1);
  });

  it("gates level 1-2 heroes before sessions, cooldowns, rewards or resource mutations", async () => {
    const world = new FakeWorld();
    world.addCharacter(telegramUserId, { level: 2, xp: 13, hpCurrent: 0 });
    const service = buildService(world);

    const result = await service.getOrStartForTelegramUser(telegramUserId);

    expect(result).toMatchObject({
      state: "level-gated",
      minLevel: TRAINING_DOPPELGANGER_MIN_LEVEL
    });
    expect(world.sessions.size).toBe(0);
    expect(world.cooldowns.size).toBe(0);
    expect(world.actions.size).toBe(0);
    expect(world.resourceMutations).toBe(0);
  });

  it("blocks repeat training while the doppelganger recovers", async () => {
    const world = new FakeWorld();
    world.addCharacter(telegramUserId);
    world.cooldowns.set(TRAINING_DOPPELGANGER_COOLDOWN_KEY, {
      id: "cooldown-1",
      characterId: "character-42",
      key: TRAINING_DOPPELGANGER_COOLDOWN_KEY,
      availableAt: new Date("2026-06-17T09:35:00.000Z"),
      updatedAt: fixedNow()
    });
    const service = buildService(world);

    const result = await service.getOrStartForTelegramUser(telegramUserId);

    expect(result).toMatchObject({
      state: "on-cooldown",
      availableAt: new Date("2026-06-17T09:35:00.000Z")
    });
    expect(world.sessions.size).toBe(0);
  });

  it("resolves terminal training with XP only and a recovery cooldown", async () => {
    const world = new FakeWorld();
    world.addCharacter(telegramUserId, { hpCurrent: 6 });
    const service = buildService(world, new FakeRandomSource([0, 0, 0, 0, 0, 0]));
    const started = await service.getOrStartForTelegramUser(telegramUserId);

    if (started.state !== "active") {
      throw new Error(`Expected active training, got ${started.state}`);
    }

    let result = await service.resolveTurn(telegramUserId, {
      sessionId: started.session.id,
      turn: started.session.state?.turn ?? 1,
      action: "attack"
    });

    for (let index = 0; index < 5 && result.state === "updated" && result.session.status === "active"; index += 1) {
      result = await service.resolveTurn(telegramUserId, {
        sessionId: result.session.id,
        turn: result.session.state?.turn ?? 1,
        action: "attack"
      });
    }

    expect(result).toMatchObject({
      state: "updated",
      reward: {
        reward: {
          gold: 0
        }
      }
    });
    expect(result.state === "updated" && ["won", "lost"].includes(result.session.status)).toBe(true);
    expect(world.actions.get(`${TRAINING_DOPPELGANGER_REWARD_KEY}:${started.session.id}`)).toMatchObject({
      rewardGold: 0
    });
    expect(world.cooldowns.get(TRAINING_DOPPELGANGER_COOLDOWN_KEY)?.availableAt.getTime()).toBeGreaterThan(
      fixedNow().getTime()
    );
    expect(world.resourceMutations).toBe(1);
  });
});

function buildService(
  world: FakeWorld,
  rng = new FakeRandomSource([0.5]),
  championSource?: TrainingDoppelgangerChampionSource
): TrainingDoppelgangerService {
  return new TrainingDoppelgangerService(
    world,
    world,
    world,
    world,
    undefined,
    fixedNow,
    rng,
    {},
    championSource
  );
}

class FakeChampionSource implements TrainingDoppelgangerChampionSource {
  constructor(private readonly records: ResolvedDuelChallengeRecord[]) {}

  listResolvedSince(since: Date): Promise<ResolvedDuelChallengeRecord[]> {
    return Promise.resolve(this.records.filter((record) => record.resolvedAt >= since));
  }
}

function resolvedDuel(
  id: string,
  winner: DuelCharacterSnapshot,
  resolvedAt: Date
): ResolvedDuelChallengeRecord {
  const loser = duelSnapshot(`${id}-loser`, `${winner.name} тінь`, "class.warrior");

  return {
    id,
    challengerCharacterId: loser.id,
    targetCharacterId: winner.id,
    contextChatId: null,
    inviteToken: `token-${id}`,
    status: "resolved",
    expiresAt: resolvedAt,
    resolvedAt,
    result: {
      outcome: "target",
      winnerCharacterId: winner.id,
      loserCharacterId: loser.id,
      challengerScore: 3,
      targetScore: 13,
      swing: 2,
      flavorKey: "direct-hit"
    },
    createdAt: resolvedAt,
    updatedAt: resolvedAt,
    challenger: loser,
    target: winner
  };
}

function duelSnapshot(
  id: string,
  name: string,
  classId: string
): DuelCharacterSnapshot {
  return {
    id,
    userId: `user-${id}`,
    telegramUserId: BigInt(1000 + id.length),
    name,
    pronoun: "they",
    path: "path.sun",
    raceId: "race.human-ish",
    classId,
    level: 5,
    xp: 90,
    gold: 0,
    hpCurrent: 24,
    hpMax: 24,
    manaCurrent: 12,
    manaMax: 12,
    statsJson: {
      strength: 8,
      dexterity: 8,
      intelligence: 8,
      charisma: 8,
      luck: 8
    },
    equipment: []
  };
}

class FakeWorld implements CharacterRepository, CooldownRepository, DailyActionRepository, SoloCombatSessionRepository {
  private readonly charactersByTelegramUserId = new Map<bigint, CharacterRecord>();
  readonly cooldowns = new Map<string, CharacterCooldownRecord>();
  readonly actions = new Map<string, DailyActionRecord>();
  readonly sessions = new Map<string, SoloCombatSessionRecord>();
  resourceMutations = 0;

  addCharacter(userTelegramId: bigint, overrides: Partial<CharacterRecord> = {}): void {
    this.charactersByTelegramUserId.set(userTelegramId, {
      id: `character-${userTelegramId.toString()}`,
      userId: `user-${userTelegramId.toString()}`,
      name: "Мандрівник",
      pronoun: "they",
      path: "path.sun",
      raceId: "race.human-ish",
      classId: "class.warrior",
      level: 3,
      xp: 25,
      gold: 7,
      hpCurrent: 22,
      hpMax: 22,
      manaCurrent: 10,
      manaMax: 10,
      statsJson: {
        strength: 8,
        dexterity: 6,
        intelligence: 6,
        charisma: 6,
        luck: 6
      },
      ...overrides
    });
  }

  findByUserId(userId: string): Promise<CharacterRecord | null> {
    return Promise.resolve(
      [...this.charactersByTelegramUserId.values()].find((character) => character.userId === userId) ??
        null
    );
  }

  findByTelegramUserId(userTelegramId: bigint): Promise<CharacterRecord | null> {
    return Promise.resolve(this.charactersByTelegramUserId.get(userTelegramId) ?? null);
  }

  updateResourcesForTelegramUser(
    userTelegramId: bigint,
    resources: {
      hpCurrent: number;
      manaCurrent: number;
      hpRegenAt?: Date | null;
      manaRegenAt?: Date | null;
    }
  ): Promise<CharacterRecord | null> {
    this.resourceMutations += 1;
    const character = this.charactersByTelegramUserId.get(userTelegramId);

    if (!character) {
      return Promise.resolve(null);
    }

    const updated = {
      ...character,
      hpCurrent: resources.hpCurrent,
      manaCurrent: resources.manaCurrent
    };
    this.charactersByTelegramUserId.set(userTelegramId, updated);

    return Promise.resolve(updated);
  }

  deleteByTelegramUserId(userTelegramId: bigint): Promise<boolean> {
    return Promise.resolve(this.charactersByTelegramUserId.delete(userTelegramId));
  }

  createForTelegramUserIfMissing(
    user: TelegramUserProfile,
    input: CreateCharacterInput
  ): Promise<CreateCharacterResult> {
    const existing = this.charactersByTelegramUserId.get(user.telegramUserId);

    if (existing) {
      return Promise.resolve({ character: existing, created: false });
    }

    const character: CharacterRecord = {
      id: `character-${user.telegramUserId.toString()}`,
      userId: `user-${user.telegramUserId.toString()}`,
      ...input
    };
    this.charactersByTelegramUserId.set(user.telegramUserId, character);

    return Promise.resolve({ character, created: true });
  }

  claimRewardForTelegramUser(
    userTelegramId: bigint,
    input: ClaimCooldownRewardInput
  ): Promise<ClaimCooldownRewardResult | null> {
    const character = this.charactersByTelegramUserId.get(userTelegramId);

    if (!character) {
      return Promise.resolve(null);
    }

    const existing = this.cooldowns.get(input.key);

    if (existing && existing.availableAt > input.now) {
      return Promise.resolve({
        state: "on-cooldown",
        cooldown: existing,
        character
      });
    }

    const cooldown = {
      id: existing?.id ?? `cooldown-${this.cooldowns.size + 1}`,
      characterId: character.id,
      key: input.key,
      availableAt: input.availableAt,
      updatedAt: input.now
    };
    this.cooldowns.set(input.key, cooldown);

    return Promise.resolve({
      state: "completed",
      cooldown,
      character,
      levelChange: {
        oldLevel: character.level,
        newLevel: character.level,
        leveledUp: false
      },
      itemGrants: []
    });
  }

  findForTelegramUserAction(
    userTelegramId: bigint,
    input: { key: string; localDate: string }
  ): Promise<DailyActionRecord | null> {
    void userTelegramId;
    return Promise.resolve(this.actions.get(`${input.key}:${input.localDate}`) ?? null);
  }

  claimForTelegramUser(
    userTelegramId: bigint,
    input: ClaimDailyActionInput
  ): Promise<ClaimDailyActionResult | null> {
    const character = this.charactersByTelegramUserId.get(userTelegramId);

    if (!character) {
      return Promise.resolve(null);
    }

    const key = `${input.key}:${input.localDate}`;
    const existing = this.actions.get(key);

    if (existing) {
      return Promise.resolve({
        state: "existing",
        action: existing,
        character,
        levelChange: null,
        itemGrants: []
      });
    }

    const action = {
      id: `action-${this.actions.size + 1}`,
      characterId: character.id,
      key: input.key,
      localDate: input.localDate,
      rewardXp: input.rewardXp,
      rewardGold: input.rewardGold,
      createdAt: fixedNow()
    };
    this.actions.set(key, action);
    const updated = {
      ...character,
      xp: character.xp + input.rewardXp,
      gold: character.gold + input.rewardGold
    };
    this.charactersByTelegramUserId.set(userTelegramId, updated);

    return Promise.resolve({
      state: "created",
      action,
      character: updated,
      levelChange: {
        oldLevel: character.level,
        newLevel: updated.level,
        leveledUp: false
      },
      itemGrants: []
    });
  }

  findForTelegramUser(
    userTelegramId: bigint,
    input: { key: string; localDate: string }
  ): Promise<DailyActionRecord | null>;
  findForTelegramUser(
    userTelegramId: bigint,
    key: string
  ): Promise<{ cooldown: CharacterCooldownRecord | null; character: CharacterRecord } | null>;
  findForTelegramUser(
    userTelegramId: bigint,
    input: string | { key: string; localDate: string }
  ): Promise<DailyActionRecord | { cooldown: CharacterCooldownRecord | null; character: CharacterRecord } | null> {
    if (typeof input === "string") {
      const character = this.charactersByTelegramUserId.get(userTelegramId);

      if (!character) {
        return Promise.resolve(null);
      }

      return Promise.resolve({
        character,
        cooldown: this.cooldowns.get(input) ?? null
      });
    }

    return Promise.resolve(this.actions.get(`${input.key}:${input.localDate}`) ?? null);
  }

  findActiveByTelegramUserId(): Promise<SoloCombatSessionRecord | null> {
    return Promise.resolve(
      [...this.sessions.values()].find((session) => session.status === "active") ?? null
    );
  }

  countWonByTelegramUserId(
    _telegramUserId: bigint,
    options: { excludeMonsterIds?: readonly string[] } = {}
  ): Promise<number> {
    const excludedMonsterIds = new Set(options.excludeMonsterIds ?? []);

    return Promise.resolve(
      [...this.sessions.values()].filter(
        (session) => session.status === "won" && !excludedMonsterIds.has(session.monsterId)
      ).length
    );
  }

  listByTelegramUserIdSince(): Promise<Array<Pick<SoloCombatSessionRecord, "monsterId" | "status" | "createdAt">>> {
    return Promise.resolve([]);
  }

  findByIdForTelegramUserId(
    _userTelegramId: bigint,
    sessionId: string
  ): Promise<SoloCombatSessionRecord | null> {
    return Promise.resolve(this.sessions.get(sessionId) ?? null);
  }

  createForTelegramUser(
    userTelegramId: bigint,
    input: CreateSoloCombatSessionInput
  ): Promise<SoloCombatSessionRecord | null> {
    const character = this.charactersByTelegramUserId.get(userTelegramId);

    if (!character) {
      return Promise.resolve(null);
    }

    const session = {
      id: input.id ?? `session-${this.sessions.size + 1}`,
      characterId: character.id,
      monsterId: input.monsterId,
      status: input.state.status,
      turn: input.state.turn,
      state: input.state,
      reward: null,
      createdAt: fixedNow(),
      updatedAt: fixedNow(),
      expiresAt: input.expiresAt
    };
    this.sessions.set(session.id, session);

    return Promise.resolve(session);
  }

  updateById(
    sessionId: string,
    input: UpdateSoloCombatSessionInput
  ): Promise<SoloCombatSessionRecord | null> {
    const existing = this.sessions.get(sessionId);

    if (!existing) {
      return Promise.resolve(null);
    }

    const updated = {
      ...existing,
      status: input.status,
      turn: input.state.turn,
      state: input.state,
      expiresAt: input.expiresAt ?? existing.expiresAt,
      updatedAt: fixedNow()
    };
    this.sessions.set(sessionId, updated);

    return Promise.resolve(updated);
  }

  updateByIdIfActiveTurn(
    sessionId: string,
    expectedTurn: number,
    input: UpdateSoloCombatSessionInput
  ): Promise<SoloCombatSessionRecord | null> {
    const existing = this.sessions.get(sessionId);

    if (!existing || existing.status !== "active" || existing.state?.turn !== expectedTurn) {
      return Promise.resolve(null);
    }

    return this.updateById(sessionId, input);
  }

  recordRewardById(
    sessionId: string,
    input: RecordSoloCombatRewardInput
  ): Promise<SoloCombatSessionRecord | null> {
    const existing = this.sessions.get(sessionId);

    if (!existing) {
      return Promise.resolve(null);
    }

    const updated = {
      ...existing,
      reward: {
        xp: input.rewardXp,
        gold: input.rewardGold,
        itemGrants: input.itemGrants,
        claimedAt: input.claimedAt
      }
    };
    this.sessions.set(sessionId, updated);

    return Promise.resolve(updated);
  }

  markStatusById(
    sessionId: string,
    status: SoloCombatSessionRecord["status"]
  ): Promise<SoloCombatSessionRecord | null> {
    const existing = this.sessions.get(sessionId);

    if (!existing) {
      return Promise.resolve(null);
    }

    const updated = {
      ...existing,
      status,
      state: existing.state ? { ...existing.state, status } : existing.state
    };
    this.sessions.set(sessionId, updated);

    return Promise.resolve(updated);
  }
}
