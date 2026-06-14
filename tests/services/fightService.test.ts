import { describe, expect, it } from "vitest";
import type {
  CharacterRecord,
  CharacterRepository,
  CreateCharacterInput,
  CreateCharacterResult
} from "../../src/db/repositories/characterRepository";
import type {
  ClaimDailyActionInput,
  ClaimDailyActionResult,
  DailyActionRecord,
  DailyActionRepository
} from "../../src/db/repositories/dailyActionRepository";
import type {
  CreateSoloCombatSessionInput,
  SoloCombatSessionRecord,
  SoloCombatSessionRepository,
  SoloCombatSessionStatus,
  UpdateSoloCombatSessionInput
} from "../../src/db/repositories/soloCombatSessionRepository";
import type { TelegramUserProfile } from "../../src/db/repositories/userRepository";
import type { CombatState } from "../../src/domain/combat";
import { getLevelForXp } from "../../src/domain/progression/level";
import { FakeRandomSource } from "../../src/shared/random";
import { MIMIC_SHAWARMA_ADVENTURE_KEY } from "../../src/services/adventureService";
import {
  FightService,
  MIMIC_SHAWARMA_COMBAT_PROBE_KEY
} from "../../src/services/fightService";

const telegramUserId = 42n;

describe("FightService", () => {
  it("returns no-character when user has no character", async () => {
    const characters = new FakeCharacterRepository();
    const dailyActions = new FakeDailyActionRepository(characters);
    const service = new FightService(characters, dailyActions, fixedClock);

    await expect(service.getMimicShawarmaForTelegramUser(telegramUserId)).resolves.toEqual({
      state: "no-character"
    });
    await expect(service.completeMimicShawarma(telegramUserId, "attack")).resolves.toEqual({
      state: "no-character"
    });
  });

  it("grants the first combat probe reward once", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 7 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const service = new FightService(characters, dailyActions, fixedClock);

    const result = await service.completeMimicShawarma(telegramUserId, "attack");

    expect(result.state).toBe("completed");
    expect(dailyActions.createCount).toBe(1);
    expect(dailyActions.records[0]).toMatchObject({
      key: MIMIC_SHAWARMA_COMBAT_PROBE_KEY,
      localDate: "2026-06-12",
      rewardXp: 9,
      rewardGold: 3
    });
    await expect(characters.findByTelegramUserId(telegramUserId)).resolves.toMatchObject({
      xp: 16,
      gold: 3,
      level: 2
    });
    if (result.state === "completed") {
      expect(result.combat).toMatchObject({
        action: "attack",
        playerDamage: 8,
        enemyDamage: 3
      });
      expect(result.levelChange).toMatchObject({
        oldLevel: 1,
        newLevel: 2,
        leveledUp: true
      });
      expect(result.reward.itemGrants).toEqual([
        {
          itemId: "item.pan-of-persuasion",
          name: "Пательня переконання",
          quantity: 1
        },
        {
          itemId: "item.suspicious-shawarma-wrapper",
          name: "Підозрілий лавашний доказ",
          quantity: 1
        }
      ]);
    }
  });

  it("uses effective level stats for combat preview", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 15 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const service = new FightService(characters, dailyActions, fixedClock);

    const result = await service.completeMimicShawarma(telegramUserId, "attack");

    expect(result.state).toBe("completed");
    if (result.state === "completed") {
      expect(result.combat).toMatchObject({
        playerHpMaxPreview: 26,
        playerHpPreview: 23,
        playerDamage: 10
      });
      expect(result.character).toMatchObject({
        hpMax: 26,
        stats: {
          strength: 9
        }
      });
    }
  });

  it("keeps higher-level attack damage at least as high as level 1", async () => {
    const levelOne = new FakeCharacterRepository();
    levelOne.add(telegramUserId);
    const levelOneService = new FightService(
      levelOne,
      new FakeDailyActionRepository(levelOne),
      fixedClock
    );
    const levelTwo = new FakeCharacterRepository();
    levelTwo.add(telegramUserId, { xp: 15 });
    const levelTwoService = new FightService(
      levelTwo,
      new FakeDailyActionRepository(levelTwo),
      fixedClock
    );

    const first = await levelOneService.completeMimicShawarma(telegramUserId, "attack");
    const second = await levelTwoService.completeMimicShawarma(telegramUserId, "attack");

    expect(first.state).toBe("completed");
    expect(second.state).toBe("completed");
    if (first.state === "completed" && second.state === "completed") {
      expect(second.combat.playerDamage).toBeGreaterThanOrEqual(first.combat.playerDamage);
    }
  });

  it("does not duplicate the same action on the same date", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId);
    const dailyActions = new FakeDailyActionRepository(characters);
    const service = new FightService(characters, dailyActions, fixedClock);

    const first = await service.completeMimicShawarma(telegramUserId, "receipt");
    const repeated = await service.completeMimicShawarma(telegramUserId, "receipt");

    expect(first.state).toBe("completed");
    if (first.state === "completed") {
      expect(first.reward.itemGrants).toEqual([
        {
          itemId: "item.stamp-of-minor-authority",
          name: "Печатка дрібної переваги",
          quantity: 1
        },
        {
          itemId: "item.receipt-of-formal-suspicion",
          name: "Чек формальної підозри",
          quantity: 1
        }
      ]);
    }
    expect(repeated.state).toBe("already-completed");
    expect(dailyActions.createCount).toBe(1);
    expect(dailyActions.grantedItems).toEqual([
      {
        itemId: "item.stamp-of-minor-authority",
        quantity: 1
      },
      {
        itemId: "item.receipt-of-formal-suspicion",
        quantity: 1
      }
    ]);
    await expect(characters.findByTelegramUserId(telegramUserId)).resolves.toMatchObject({
      xp: 7,
      gold: 5
    });
  });

  it("retires the starter fight at level three without claiming rewards", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const service = new FightService(characters, dailyActions, fixedClock);

    await expect(service.getMimicShawarmaForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "level-retired",
      maxLevel: 2
    });
    await expect(service.completeMimicShawarma(telegramUserId, "attack")).resolves.toMatchObject({
      state: "level-retired",
      maxLevel: 2
    });
    expect(dailyActions.createCount).toBe(0);
    expect(dailyActions.grantedItems).toEqual([]);
    await expect(characters.findByTelegramUserId(telegramUserId)).resolves.toMatchObject({
      xp: 25,
      gold: 0,
      level: 3
    });
  });

  it("returns an already-completed lookup and only suggests quest when it is still available", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId);
    const dailyActions = new FakeDailyActionRepository(characters);
    const service = new FightService(characters, dailyActions, fixedClock);

    await service.completeMimicShawarma(telegramUserId, "attack");
    await expect(service.getMimicShawarmaForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "already-completed",
      questAvailable: true
    });

    dailyActions.addAction(telegramUserId, MIMIC_SHAWARMA_ADVENTURE_KEY);

    await expect(service.getMimicShawarmaForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "already-completed",
      questAvailable: false
    });
  });

  it("does not duplicate another action after one option was claimed that date", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId);
    const dailyActions = new FakeDailyActionRepository(characters);
    const service = new FightService(characters, dailyActions, fixedClock);

    await service.completeMimicShawarma(telegramUserId, "attack");
    const secondOption = await service.completeMimicShawarma(telegramUserId, "flee");

    expect(secondOption.state).toBe("already-completed");
    expect(dailyActions.createCount).toBe(1);
    expect(dailyActions.grantedItems).toEqual([
      {
        itemId: "item.pan-of-persuasion",
        quantity: 1
      },
      {
        itemId: "item.suspicious-shawarma-wrapper",
        quantity: 1
      }
    ]);
    await expect(characters.findByTelegramUserId(telegramUserId)).resolves.toMatchObject({
      xp: 9,
      gold: 3
    });
  });

  it("shows persistent fight availability without starting a session", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1])
    );

    const overview = await service.getFightOverviewForTelegramUser(telegramUserId);

    expect(overview).toMatchObject({
      state: "persistent-ready",
      character: {
        level: 3
      }
    });
    expect(sessions.createCount).toBe(0);
  });

  it("starts and resumes one persistent fight session for level three characters", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1])
    );

    const first = await service.getFightForTelegramUser(telegramUserId);
    const second = await service.getFightForTelegramUser(telegramUserId);

    expect(first).toMatchObject({
      state: "persistent-active",
      character: {
        level: 3
      }
    });
    expect(second).toMatchObject({
      state: "persistent-active"
    });
    if (first.state === "persistent-active" && second.state === "persistent-active") {
      expect(second.session.id).toBe(first.session.id);
      expect(first.session.state).toMatchObject({
        turn: 1,
        status: "active"
      });
      expect(first.monster.id).not.toBe("monster.mimic-shawarma");
    }
    expect(sessions.createCount).toBe(1);
    expect(dailyActions.createCount).toBe(0);
  });

  it("expires an active persistent fight with a missing monster instead of returning a dead-end", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1])
    );
    const started = await service.getFightForTelegramUser(telegramUserId);
    expect(started.state).toBe("persistent-active");
    if (started.state !== "persistent-active") {
      return;
    }
    sessions.addSession({
      ...started.session,
      monsterId: "monster.deleted-by-the-archive"
    });

    const overview = await service.getFightOverviewForTelegramUser(telegramUserId);

    expect(overview.state).toBe("persistent-terminal");
    if (overview.state === "persistent-terminal") {
      expect(overview.monster).toBeNull();
      expect(overview.session.state?.status).toBe("expired");
    }
    expect(sessions.updateCount).toBe(1);
    expect(dailyActions.createCount).toBe(0);
  });

  it("resolves a persistent fight turn without granting rewards", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1, 0.1, 0.6])
    );
    const started = await service.getFightForTelegramUser(telegramUserId);
    expect(started.state).toBe("persistent-active");
    if (started.state !== "persistent-active") {
      return;
    }

    const result = await service.resolvePersistentFightTurn(telegramUserId, {
      sessionId: started.session.id,
      turn: 1,
      action: "attack"
    });

    expect(result.state).toBe("updated");
    if (result.state === "updated") {
      expect(result.session.state?.turn).toBe(2);
      expect(result.session.state?.lastTurn?.action).toBe("attack");
    }
    expect(sessions.updateCount).toBe(1);
    expect(dailyActions.createCount).toBe(0);
    await expect(characters.findByTelegramUserId(telegramUserId)).resolves.toMatchObject({
      xp: 25,
      gold: 0
    });
  });

  it("does not mutate a stale persistent fight turn", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1])
    );
    const started = await service.getFightForTelegramUser(telegramUserId);
    expect(started.state).toBe("persistent-active");
    if (started.state !== "persistent-active") {
      return;
    }
    sessions.setHeroMana(started.session.id, 0);

    const result = await service.resolvePersistentFightTurn(telegramUserId, {
      sessionId: started.session.id,
      turn: 99,
      action: "attack"
    });

    expect(result.state).toBe("stale-turn");
    expect(sessions.updateCount).toBe(0);
  });

  it("does not apply the same persistent fight turn twice", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1, 0.1, 0.6, 0.1, 0.1, 0.6])
    );
    const started = await service.getFightForTelegramUser(telegramUserId);
    expect(started.state).toBe("persistent-active");
    if (started.state !== "persistent-active") {
      return;
    }

    const first = await service.resolvePersistentFightTurn(telegramUserId, {
      sessionId: started.session.id,
      turn: 1,
      action: "attack"
    });
    const repeated = await service.resolvePersistentFightTurn(telegramUserId, {
      sessionId: started.session.id,
      turn: 1,
      action: "attack"
    });

    expect(first.state).toBe("updated");
    expect(repeated.state).toBe("stale-turn");
    expect(sessions.updateCount).toBe(1);
    if (first.state === "updated" && repeated.state === "stale-turn") {
      expect(repeated.session.state).toEqual(first.session.state);
      expect(repeated.session.state?.turn).toBe(2);
    }
    expect(dailyActions.createCount).toBe(0);
  });

  it("does not let an older duplicate active session keep fighting", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1, 0.1, 0.6])
    );
    const started = await service.getFightForTelegramUser(telegramUserId);
    expect(started.state).toBe("persistent-active");
    if (started.state !== "persistent-active") {
      return;
    }
    const newerSession = sessions.addSession({
      ...started.session,
      id: "123e4567-e89b-42d3-a456-426614174111",
      updatedAt: new Date("2026-06-12T10:31:00.000Z")
    });

    const result = await service.resolvePersistentFightTurn(telegramUserId, {
      sessionId: started.session.id,
      turn: 1,
      action: "attack"
    });

    expect(result.state).toBe("stale-turn");
    if (result.state === "stale-turn") {
      expect(result.session.id).toBe(newerSession.id);
    }
    expect(sessions.updateCount).toBe(0);
    expect(dailyActions.createCount).toBe(0);
  });

  it("does not mutate when a persistent skill lacks mana", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25, classId: "class.mage", manaCurrent: 0, manaMax: 0 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1])
    );
    const started = await service.getFightForTelegramUser(telegramUserId);
    expect(started.state).toBe("persistent-active");
    if (started.state !== "persistent-active") {
      return;
    }
    sessions.setHeroMana(started.session.id, 0);

    const result = await service.resolvePersistentFightTurn(telegramUserId, {
      sessionId: started.session.id,
      turn: 1,
      action: "skill"
    });

    expect(result.state).toBe("not-enough-mana");
    expect(sessions.updateCount).toBe(0);
  });

  it("expires a stale persistent fight lazily without rewards", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const sessions = new FakeSoloCombatSessionRepository(characters);
    const service = new FightService(
      characters,
      dailyActions,
      fixedClock,
      sessions,
      new FakeRandomSource([0.1])
    );
    const started = await service.getFightForTelegramUser(telegramUserId);
    expect(started.state).toBe("persistent-active");
    if (started.state !== "persistent-active") {
      return;
    }
    sessions.setExpiresAt(started.session.id, new Date("2026-06-12T10:00:00.000Z"));

    const result = await service.resolvePersistentFightTurn(telegramUserId, {
      sessionId: started.session.id,
      turn: 1,
      action: "attack"
    });

    expect(result.state).toBe("terminal");
    if (result.state === "terminal") {
      expect(result.session.state?.status).toBe("expired");
    }
    expect(dailyActions.createCount).toBe(0);
  });
});

function fixedClock(): Date {
  return new Date("2026-06-12T10:30:00.000Z");
}

class FakeCharacterRepository implements CharacterRepository {
  private readonly charactersByTelegramUserId = new Map<bigint, CharacterRecord>();

  add(userTelegramId: bigint, overrides: Partial<CharacterRecord> = {}): void {
    const xp = overrides.xp ?? 0;
    this.charactersByTelegramUserId.set(userTelegramId, {
      id: `character-${userTelegramId.toString()}`,
      userId: `user-${userTelegramId.toString()}`,
      name: "Мандрівник",
      pronoun: "they",
      raceId: "race.human-ish",
      classId: "class.warrior",
      level: getLevelForXp(xp),
      xp,
      gold: 0,
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

  updateReward(userTelegramId: bigint, xp: number, gold: number): CharacterRecord {
    const character = this.charactersByTelegramUserId.get(userTelegramId);

    if (!character) {
      throw new Error("Character not found.");
    }

    const nextXp = character.xp + xp;
    const updated = {
      ...character,
      xp: nextXp,
      gold: character.gold + gold,
      level: getLevelForXp(nextXp)
    };
    this.charactersByTelegramUserId.set(userTelegramId, updated);
    return updated;
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
}

class FakeDailyActionRepository implements DailyActionRepository {
  private readonly actions = new Map<string, DailyActionRecord>();
  readonly grantedItems: Array<{ itemId: string; quantity: number }> = [];
  createCount = 0;

  constructor(private readonly characters: FakeCharacterRepository) {}

  get records(): DailyActionRecord[] {
    return [...this.actions.values()];
  }

  async findForTelegramUser(
    userTelegramId: bigint,
    input: { key: string; localDate: string }
  ): Promise<DailyActionRecord | null> {
    const character = await this.characters.findByTelegramUserId(userTelegramId);

    if (!character) {
      return null;
    }

    return this.actions.get(`${character.id}:${input.key}:${input.localDate}`) ?? null;
  }

  addAction(userTelegramId: bigint, key: string, localDate = "2026-06-12"): void {
    const characterId = `character-${userTelegramId.toString()}`;
    const action = {
      id: `daily-action-${this.actions.size + 1}`,
      characterId,
      key,
      localDate,
      rewardXp: 0,
      rewardGold: 0,
      createdAt: fixedClock()
    };

    this.actions.set(`${characterId}:${key}:${localDate}`, action);
  }

  async claimForTelegramUser(
    userTelegramId: bigint,
    input: ClaimDailyActionInput
  ): Promise<ClaimDailyActionResult | null> {
    const character = await this.characters.findByTelegramUserId(userTelegramId);

    if (!character) {
      return null;
    }

    const claimKey = `${character.id}:${input.key}:${input.localDate}`;
    const existing = this.actions.get(claimKey);

    if (existing) {
      return {
            state: "existing",
            action: existing,
            character,
            levelChange: null,
            itemGrants: []
          };
    }

    this.createCount += 1;
    const action = {
      id: `daily-action-${this.createCount}`,
      characterId: character.id,
      key: input.key,
      localDate: input.localDate,
      rewardXp: input.rewardXp,
      rewardGold: input.rewardGold,
      createdAt: fixedClock()
    };
    this.actions.set(claimKey, action);

    const updatedCharacter = this.characters.updateReward(
      userTelegramId,
      input.rewardXp,
      input.rewardGold
    );
    const itemGrants = (input.itemGrants ?? []).map(({ itemId, quantity }) => ({
      itemId,
      quantity
    }));
    this.grantedItems.push(...itemGrants);

    return {
      state: "created",
      action,
      character: updatedCharacter,
      itemGrants,
      levelChange: {
        oldLevel: getLevelForXp(character.xp),
        newLevel: updatedCharacter.level,
        leveledUp: updatedCharacter.level > getLevelForXp(character.xp)
      }
    };
  }
}

class FakeSoloCombatSessionRepository implements SoloCombatSessionRepository {
  private readonly sessions = new Map<string, SoloCombatSessionRecord>();
  createCount = 0;
  updateCount = 0;

  constructor(private readonly characters: FakeCharacterRepository) {}

  async findActiveByTelegramUserId(
    telegramUserId: bigint
  ): Promise<SoloCombatSessionRecord | null> {
    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character) {
      return null;
    }

    const session =
      [...this.sessions.values()]
        .filter((candidate) => candidate.characterId === character.id && candidate.status === "active")
        .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())[0] ?? null;

    return session ? cloneSession(session) : null;
  }

  async findByIdForTelegramUserId(
    telegramUserId: bigint,
    sessionId: string
  ): Promise<SoloCombatSessionRecord | null> {
    const character = await this.characters.findByTelegramUserId(telegramUserId);
    const session = this.sessions.get(sessionId);

    if (!character || !session || session.characterId !== character.id) {
      return null;
    }

    return cloneSession(session);
  }

  async createForTelegramUser(
    telegramUserId: bigint,
    input: CreateSoloCombatSessionInput
  ): Promise<SoloCombatSessionRecord | null> {
    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character) {
      return null;
    }

    this.createCount += 1;
    const now = fixedClock();
    const session: SoloCombatSessionRecord = {
      id: input.id ?? `session-${this.createCount}`,
      characterId: character.id,
      monsterId: input.monsterId,
      status: input.state.status,
      turn: input.state.turn,
      state: cloneState(input.state),
      createdAt: now,
      updatedAt: now,
      expiresAt: input.expiresAt
    };
    this.sessions.set(session.id, session);
    return cloneSession(session);
  }

  updateById(
    sessionId: string,
    input: UpdateSoloCombatSessionInput
  ): Promise<SoloCombatSessionRecord | null> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return Promise.resolve(null);
    }

    this.updateCount += 1;
    const updated: SoloCombatSessionRecord = {
      ...session,
      status: input.status,
      turn: input.state.turn,
      state: cloneState(input.state),
      updatedAt: fixedClock(),
      expiresAt: input.expiresAt ?? session.expiresAt
    };
    this.sessions.set(sessionId, updated);
    return Promise.resolve(cloneSession(updated));
  }

  updateByIdIfActiveTurn(
    sessionId: string,
    expectedTurn: number,
    input: UpdateSoloCombatSessionInput
  ): Promise<SoloCombatSessionRecord | null> {
    const session = this.sessions.get(sessionId);

    if (!session || session.status !== "active" || session.turn !== expectedTurn) {
      return Promise.resolve(null);
    }

    return this.updateById(sessionId, input);
  }

  markStatusById(
    sessionId: string,
    status: SoloCombatSessionStatus
  ): Promise<SoloCombatSessionRecord | null> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return Promise.resolve(null);
    }

    const updated = {
      ...session,
      status,
      updatedAt: fixedClock()
    };
    this.sessions.set(sessionId, updated);
    return Promise.resolve(cloneSession(updated));
  }

  setExpiresAt(sessionId: string, expiresAt: Date): void {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return;
    }

    this.sessions.set(sessionId, {
      ...session,
      expiresAt
    });
  }

  setHeroMana(sessionId: string, mana: number): void {
    const session = this.sessions.get(sessionId);

    if (!session?.state) {
      return;
    }

    this.sessions.set(sessionId, {
      ...session,
      state: {
        ...session.state,
        hero: {
          ...session.state.hero,
          mana
        }
      }
    });
  }

  addSession(session: SoloCombatSessionRecord): SoloCombatSessionRecord {
    const cloned = cloneSession(session);
    this.sessions.set(cloned.id, cloned);
    return cloneSession(cloned);
  }
}

function cloneSession(session: SoloCombatSessionRecord): SoloCombatSessionRecord {
  return {
    ...session,
    state: session.state ? cloneState(session.state) : null
  };
}

function cloneState(state: CombatState): CombatState {
  return JSON.parse(JSON.stringify(state)) as CombatState;
}
