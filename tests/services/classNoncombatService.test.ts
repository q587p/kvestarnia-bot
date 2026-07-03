import { describe, expect, it } from "vitest";
import type {
  ClassNoncombatRepository,
  NoncombatActionSnapshot,
  PriestAidRecord,
  PriestBlessRepositoryResult,
  PriestHealRepositoryResult,
  RoguePickpocketAttemptRecord,
  RoguePickpocketRepositoryResult
} from "../../src/db/repositories/classNoncombatRepository";
import type { CharacterRecord } from "../../src/db/repositories/characterRepository";
import { ClassNoncombatService } from "../../src/services/classNoncombatService";
import { FakeRandomSource } from "../../src/shared/random";
import type { AchievementService } from "../../src/services/achievementService";

const now = new Date("2026-07-03T09:00:00.000Z");
const actorTelegramUserId = 1001n;
const targetTelegramUserId = 1002n;

describe("ClassNoncombatService", () => {
  it("plans Priest target healing from nearby target HP and spends only mana on completion", async () => {
    const repository = new FakeClassNoncombatRepository({
      actor: priest({ manaCurrent: 20, statsJson: { charisma: 9, intelligence: 9 } }),
      target: target({ hpCurrent: 3, hpMax: 20 })
    });
    const achievements = new FakeAchievementService();
    const service = new ClassNoncombatService(repository, () => now, new FakeRandomSource([0]), achievements.service);

    const result = await service.healForTelegramUser(actorTelegramUserId, {
      targetTelegramUserId,
      expectedActorRemortCount: 0,
      expectedTargetRemortCount: 0
    });

    expect(result.state).toBe("completed");
    expect(repository.lastHealInput).toMatchObject({
      healAmount: 10,
      manaCost: 10,
      statSnapshot: { level: 3, charisma: 11, intelligence: 9 }
    });
    expect(repository.lastHealInput).not.toHaveProperty("cooldownAvailableAt");
    expect(achievements.events).toEqual([
      { type: "priest.heal.completed", characterId: "actor", occurredAt: now, sourceId: "aid-heal" }
    ]);
  });

  it("passes effective self HP max into the Priest heal transaction", async () => {
    const repository = new FakeClassNoncombatRepository({
      actor: priest({
        level: 4,
        hpCurrent: 16,
        hpMax: 20,
        manaCurrent: 20,
        statsJson: { charisma: 9, intelligence: 8 }
      })
    });
    const service = new ClassNoncombatService(repository, () => now, new FakeRandomSource([0]));

    await service.healForTelegramUser(actorTelegramUserId, {
      targetTelegramUserId: null,
      expectedActorRemortCount: 0,
      expectedTargetRemortCount: 0
    });

    expect(repository.lastHealInput).toMatchObject({
      healAmount: 11,
      manaCost: 11,
      targetEffectiveHpMax: 32
    });
  });

  it("keeps full-HP Priest heal as a no-op without achievement tracking", async () => {
    const repository = new FakeClassNoncombatRepository({
      healResult: { state: "blocked", reason: "full-hp", actor: priest(), target: target({ hpCurrent: 20, hpMax: 20 }) }
    });
    const achievements = new FakeAchievementService();
    const service = new ClassNoncombatService(repository, () => now, new FakeRandomSource([0]), achievements.service);

    const result = await service.healForTelegramUser(actorTelegramUserId, {
      targetTelegramUserId,
      expectedActorRemortCount: 0,
      expectedTargetRemortCount: 0
    });

    expect(result).toMatchObject({ state: "blocked", reason: "full-hp" });
    expect(achievements.events).toEqual([]);
  });

  it("creates direct Priest blessing with a visible 13-minute status and achievement hook", async () => {
    const repository = new FakeClassNoncombatRepository();
    const achievements = new FakeAchievementService();
    const service = new ClassNoncombatService(repository, () => now, new FakeRandomSource([0]), achievements.service);

    const result = await service.blessForTelegramUser(actorTelegramUserId, {
      targetTelegramUserId,
      expectedActorRemortCount: 0,
      expectedTargetRemortCount: 0
    });

    expect(result.state).toBe("completed");
    expect(repository.lastBlessInput).toMatchObject({
      manaCost: 7,
      expiresAt: new Date("2026-07-03T09:13:00.000Z"),
      cooldownAvailableAt: new Date("2026-07-03T10:33:00.000Z")
    });
    expect(achievements.events.map((event) => event.type)).toEqual(["priest.blessing.completed"]);
  });

  it("plans Rogue pickpocket deterministically and tracks attempt plus success", async () => {
    const repository = new FakeClassNoncombatRepository({
      actor: rogue({ level: 8, statsJson: { dexterity: 14, luck: 7 } }),
      target: target({ level: 3, gold: 50 })
    });
    const achievements = new FakeAchievementService();
    const service = new ClassNoncombatService(repository, () => now, new FakeRandomSource([0.8, 0.99]), achievements.service);

    const result = await service.pickpocketForTelegramUser(actorTelegramUserId, {
      targetTelegramUserId,
      expectedActorRemortCount: 0,
      expectedTargetRemortCount: 0
    });

    expect(result.state).toBe("completed");
    expect(repository.lastPickpocketInput).toMatchObject({
      localDate: "2026-07-03",
      outcome: "clean-success",
      stolenGold: 7,
      cooldownAvailableAt: new Date("2026-07-03T10:33:00.000Z"),
      statSnapshot: {
        level: 8,
        dexterity: 17,
        luck: 9,
        targetLevel: 3,
        baseGold: 5,
        bonusGold: 2,
        levelDiff: 5
      }
    });
    expect(achievements.events.map((event) => event.type)).toEqual([
      "rogue.pickpocket.attempted",
      "rogue.pickpocket.success"
    ]);
  });

  it("does not track achievements again when Rogue duplicate callback replays stored result", async () => {
    const repository = new FakeClassNoncombatRepository({
      pickpocketResult: {
        state: "completed",
        attempt: pickpocketAttempt({ stolenGold: 5 }),
        actor: rogue(),
        target: target(),
        created: false
      }
    });
    const achievements = new FakeAchievementService();
    const service = new ClassNoncombatService(repository, () => now, new FakeRandomSource([0.8, 0.99]), achievements.service);

    const result = await service.pickpocketForTelegramUser(actorTelegramUserId, {
      targetTelegramUserId,
      expectedActorRemortCount: 0,
      expectedTargetRemortCount: 0
    });

    expect(result).toMatchObject({ state: "completed", created: false });
    expect(achievements.events).toEqual([]);
  });

  it("tracks caught badly without creating a success event", async () => {
    const repository = new FakeClassNoncombatRepository({
      actor: rogue({ level: 3, statsJson: { dexterity: 1, luck: 1 } }),
      target: target({ level: 13, gold: 50 })
    });
    const achievements = new FakeAchievementService();
    const service = new ClassNoncombatService(repository, () => now, new FakeRandomSource([0.4, 0]), achievements.service);

    const result = await service.pickpocketForTelegramUser(actorTelegramUserId, {
      targetTelegramUserId,
      expectedActorRemortCount: 0,
      expectedTargetRemortCount: 0
    });

    expect(result.state).toBe("completed");
    expect(repository.lastPickpocketInput).toMatchObject({
      outcome: "caught-badly",
      stolenGold: 0
    });
    expect(achievements.events.map((event) => event.type)).toEqual([
      "rogue.pickpocket.attempted",
      "rogue.pickpocket.caught"
    ]);
  });
});

class FakeClassNoncombatRepository implements ClassNoncombatRepository {
  lastHealInput: Parameters<ClassNoncombatRepository["completePriestHeal"]>[1] | null = null;
  lastBlessInput: Parameters<ClassNoncombatRepository["completePriestBlessing"]>[1] | null = null;
  lastPickpocketInput: Parameters<ClassNoncombatRepository["completeRoguePickpocket"]>[1] | null = null;

  private readonly actor: CharacterRecord;
  private readonly target: CharacterRecord;
  private readonly healResult?: PriestHealRepositoryResult;
  private readonly blessResult?: PriestBlessRepositoryResult;
  private readonly pickpocketResult?: RoguePickpocketRepositoryResult;

  constructor(options: {
    actor?: CharacterRecord;
    target?: CharacterRecord;
    healResult?: PriestHealRepositoryResult;
    blessResult?: PriestBlessRepositoryResult;
    pickpocketResult?: RoguePickpocketRepositoryResult;
  } = {}) {
    this.actor = options.actor ?? priest();
    this.target = options.target ?? target();
    this.healResult = options.healResult;
    this.blessResult = options.blessResult;
    this.pickpocketResult = options.pickpocketResult;
  }

  getSnapshotForTelegramUser(): Promise<NoncombatActionSnapshot> {
    return Promise.resolve({
      character: this.actor,
      targets: [{
        telegramUserId: targetTelegramUserId,
        characterId: this.target.id,
        name: this.target.name,
        classId: this.target.classId,
        level: this.target.level,
        hpCurrent: this.target.hpCurrent,
        hpMax: this.target.hpMax,
        gold: this.target.gold,
        remortCount: this.target.remortCount ?? 0
      }],
      targetPage: 0,
      targetTotalPages: 1,
      locationId: "location.korchma.front",
      locationName: "Перед Корчмою",
      priestBlessCooldownAvailableAt: null,
      roguePickpocketCooldownAvailableAt: null
    });
  }

  getActivePriestBlessingForTelegramUser() {
    return Promise.resolve(null);
  }

  completePriestHeal(
    _actorTelegramUserId: bigint,
    input: Parameters<ClassNoncombatRepository["completePriestHeal"]>[1]
  ): Promise<PriestHealRepositoryResult> {
    this.lastHealInput = input;
    return Promise.resolve(this.healResult ?? {
      state: "completed",
      action: priestAid("aid-heal", "heal", input.healAmount, input.manaCost, input.now),
      actor: this.actor,
      target: { ...this.target, hpCurrent: Math.min(input.targetEffectiveHpMax, this.target.hpCurrent + input.healAmount) },
      created: true
    });
  }

  completePriestBlessing(
    _actorTelegramUserId: bigint,
    input: Parameters<ClassNoncombatRepository["completePriestBlessing"]>[1]
  ): Promise<PriestBlessRepositoryResult> {
    this.lastBlessInput = input;
    return Promise.resolve(this.blessResult ?? {
      state: "completed",
      action: priestAid("aid-bless", "blessing", 0, input.manaCost, input.cooldownAvailableAt),
      blessing: {
        id: "blessing-1",
        actorName: this.actor.name,
        targetName: this.target.name,
        expiresAt: input.expiresAt,
        bonusStat: null,
        bonusAmount: 0
      },
      actor: this.actor,
      target: this.target,
      created: true
    });
  }

  completeRoguePickpocket(
    _actorTelegramUserId: bigint,
    input: Parameters<ClassNoncombatRepository["completeRoguePickpocket"]>[1]
  ): Promise<RoguePickpocketRepositoryResult> {
    this.lastPickpocketInput = input;
    return Promise.resolve(this.pickpocketResult ?? {
      state: "completed",
      attempt: pickpocketAttempt({
        outcome: input.outcome,
        stolenGold: input.stolenGold,
        cooldownAvailableAt: input.cooldownAvailableAt,
        actorHpAfter: input.outcome === "caught-badly" ? 0 : null
      }),
      actor: input.outcome === "caught-badly" ? { ...this.actor, hpCurrent: 0 } : this.actor,
      target: this.target,
      created: true
    });
  }
}

class FakeAchievementService {
  readonly events: Array<{ type: string; characterId: string; occurredAt: Date; sourceId: string }> = [];

  readonly service = {
    trackEventSafely: (event: { type: string; characterId: string; occurredAt: Date; sourceId: string }) => {
      this.events.push(event);
      return Promise.resolve([]);
    }
  } as unknown as AchievementService;
}

function priest(overrides: Partial<CharacterRecord> = {}): CharacterRecord {
  return character({ id: "actor", classId: "class.priest", name: "Отець Кут", statsJson: { charisma: 9, intelligence: 9 }, ...overrides });
}

function rogue(overrides: Partial<CharacterRecord> = {}): CharacterRecord {
  return character({ id: "actor", classId: "class.rogue", name: "Тихий Кут", statsJson: { dexterity: 10, luck: 8 }, ...overrides });
}

function target(overrides: Partial<CharacterRecord> = {}): CharacterRecord {
  return character({ id: "target", name: "Сусід", classId: "class.warrior", ...overrides });
}

function character(overrides: Partial<CharacterRecord> = {}): CharacterRecord {
  return {
    id: "character",
    userId: "user",
    currentLocationId: "location.korchma.front",
    name: "Герой",
    pronoun: "they",
    path: "boundary",
    raceId: "race.human-ish",
    classId: "class.warrior",
    level: 3,
    xp: 25,
    gold: 13,
    hpCurrent: 10,
    hpMax: 20,
    manaCurrent: 20,
    manaMax: 20,
    statsJson: {},
    remortCount: 0,
    ...overrides
  };
}

function priestAid(
  id: string,
  actionKind: "heal" | "blessing",
  healAmount: number,
  manaCost: number,
  cooldownAvailableAt: Date
): PriestAidRecord {
  return {
    id,
    actorCharacterId: "actor",
    targetCharacterId: "target",
    actorTelegramUserId,
    targetTelegramUserId,
    actorName: "Отець Кут",
    targetName: "Сусід",
    actionKind,
    healAmount,
    manaCost,
    cooldownAvailableAt,
    completedAt: now
  };
}

function pickpocketAttempt(overrides: Partial<RoguePickpocketAttemptRecord> = {}): RoguePickpocketAttemptRecord {
  return {
    id: "pickpocket-1",
    actorCharacterId: "actor",
    targetCharacterId: "target",
    actorTelegramUserId,
    targetTelegramUserId,
    actorName: "Тихий Кут",
    targetName: "Сусід",
    outcome: "clean-success" as const,
    stolenGold: 1,
    actorHpAfter: null,
    cooldownAvailableAt: new Date("2026-07-03T10:33:00.000Z"),
    completedAt: now,
    ...overrides
  };
}
