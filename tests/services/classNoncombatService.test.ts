import { describe, expect, it } from "vitest";
import type {
  ClassNoncombatRepository,
  NoncombatActionSnapshot,
  PriestAidRecord,
  PriestBlessingRecord,
  PriestBlessRepositoryResult,
  PriestHealRepositoryResult,
  RoguePickpocketAttemptRecord,
  RoguePickpocketRepositoryResult,
  RogueRetaliationClaimResult,
  VarenykSatedPreviewRepositoryResult,
  VarenykSatedRepositoryResult
} from "../../src/db/repositories/classNoncombatRepository";
import {
  buildVarenykSatedPlan,
  getAffordableVarenykSatedPlan
} from "../../src/domain/noncombat/varenykSatedSupport";
import type { CharacterRecord } from "../../src/db/repositories/characterRepository";
import type {
  CharacterEquipmentRecord,
  CharacterEquipmentSnapshot,
  EquipmentRepository
} from "../../src/db/repositories/equipmentRepository";
import { ClassNoncombatService } from "../../src/services/classNoncombatService";
import { FakeRandomSource } from "../../src/shared/random";
import type { AchievementService } from "../../src/services/achievementService";
import { summarizeCharacter } from "../../src/domain/characters/characterSummary";

const now = new Date("2026-07-03T09:00:00.000Z");
const actorTelegramUserId = 1001n;
const targetTelegramUserId = 1002n;

describe("ClassNoncombatService", () => {
  it("previews the highest affordable Varenyk rank after deterministic stat planning", async () => {
    const repository = new FakeClassNoncombatRepository({
      actor: varenyk({
        manaCurrent: 19,
        statsJson: { intelligence: 20, charisma: 9 }
      })
    });
    const service = new ClassNoncombatService(repository, () => now, new FakeRandomSource([0.4]));

    const result = await service.previewVarenykSatedForTelegramUser(actorTelegramUserId, {
      targetTelegramUserId: null,
      expectedActorRemortCount: 0,
      expectedTargetRemortCount: 0,
      page: 0
    });

    expect(result).toMatchObject({
      state: "preview",
      statRank: 5,
      plan: { rank: 3, manaCost: 16, immediateHp: 5, immediateMana: 1 },
      durationMinutes: 13,
      recipientWaitMinutes: 93
    });
  });

  it("captures one logical now and skips the second equipment read for Varenyk preview", async () => {
    const beforeReady = new Date("2026-07-03T09:12:59.999Z");
    const readyAt = new Date("2026-07-03T09:13:00.000Z");
    let clockCalls = 0;
    const repository = new FakeClassNoncombatRepository({
      actor: varenyk({ manaCurrent: 8 })
    });
    const equipment = new FakeEquipmentRepository([]);
    const service = new ClassNoncombatService(
      repository,
      () => clockCalls++ === 0 ? beforeReady : readyAt,
      new FakeRandomSource([0.4]),
      undefined,
      equipment
    );

    await expect(service.previewVarenykSatedForTelegramUser(actorTelegramUserId, {
      targetTelegramUserId: null,
      expectedActorRemortCount: 0,
      expectedTargetRemortCount: 0,
      page: 0
    })).resolves.toMatchObject({ state: "preview", plan: { rank: 1, manaCost: 8 } });

    expect(clockCalls).toBe(1);
    expect(repository.lastSnapshotInput?.now).toEqual(beforeReady);
    expect(repository.lastSatedPreviewInput?.now).toEqual(beforeReady);
    expect(equipment.lookupTelegramUserIds).toEqual([]);
  });

  it("uses the persisted repository planning snapshot instead of preliminary open summaries", async () => {
    const preliminary = varenyk({ manaCurrent: 8, manaMax: 20, statsJson: { intelligence: 8, charisma: 8 } });
    const canonicalSummary = {
      ...summarizeCharacter(preliminary),
      manaCurrent: 12,
      manaMax: 26,
      stats: { ...summarizeCharacter(preliminary).stats, intelligence: 11 }
    };
    const planning = {
      summary: canonicalSummary,
      activeCosmeticTitleGrantId: null,
      naturalHpMax: canonicalSummary.hpMax,
      naturalManaMax: canonicalSummary.manaMax,
      equipmentItemIds: ["item.mantok.coverage.class.varenyk-mancer.dough-crown"],
      attunedEquipmentRows: [{
        rowId: "replacement-row",
        slot: "head",
        itemId: "item.mantok.coverage.class.varenyk-mancer.dough-crown",
        updatedAt: now.toISOString()
      }],
      activePriestBlessing: null
    };
    const repository = new FakeClassNoncombatRepository({
      actor: preliminary,
      satedPreviewResult: {
        state: "saved",
        statRank: 2,
        plan: { rank: 2, manaCost: 12, immediateHp: 4, immediateMana: 1 },
        actor: planning,
        target: planning,
        actorRemortCount: 0,
        targetRemortCount: 0
      }
    });
    const service = new ClassNoncombatService(repository, () => now, new FakeRandomSource([0.4]));

    await expect(service.previewVarenykSatedForTelegramUser(actorTelegramUserId, {
      targetTelegramUserId: null,
      expectedActorRemortCount: 0,
      expectedTargetRemortCount: 0,
      page: 0
    })).resolves.toMatchObject({
      state: "preview",
      actor: { manaCurrent: 12, manaMax: 26, stats: { intelligence: 11 } },
      target: { manaCurrent: 12, manaMax: 26, stats: { intelligence: 11 } },
      statRank: 2,
      plan: { rank: 2, manaCost: 12 }
    });
  });

  it("awards Varenyk achievements only for a fresh durable completion", async () => {
    const fresh = varenykSatedCompletion({ created: true });
    const repository = new FakeClassNoncombatRepository({ actor: varenyk(), satedResult: fresh });
    const achievements = new FakeAchievementService();
    const service = new ClassNoncombatService(repository, () => now, new FakeRandomSource([0]), achievements.service);

    const result = await service.feedVarenykSatedForTelegramUser(actorTelegramUserId, {
      targetTelegramUserId: null,
      expectedActorRemortCount: 0,
      expectedTargetRemortCount: 0,
      previewToken: "preview"
    });
    expect(result).toMatchObject({ state: "completed", created: true });
    expect(achievements.events.map((event) => event.type)).toEqual(["varenyk.sated.self"]);

    const replayRepository = new FakeClassNoncombatRepository({
      actor: varenyk(),
      satedResult: varenykSatedCompletion({ created: false })
    });
    const replayService = new ClassNoncombatService(
      replayRepository,
      () => now,
      new FakeRandomSource([0]),
      achievements.service
    );
    await replayService.feedVarenykSatedForTelegramUser(actorTelegramUserId, {
      targetTelegramUserId: null,
      expectedActorRemortCount: 0,
      expectedTargetRemortCount: 0,
      previewToken: "preview"
    });
    expect(achievements.events).toHaveLength(1);
  });

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
      manaCost: 4,
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
      manaCost: 4,
      targetEffectiveHpMax: 32
    });
  });

  it("plans Priest healing with equipped manatky and target effective HP max", async () => {
    const repository = new FakeClassNoncombatRepository({
      actor: priest({ manaCurrent: 20, statsJson: { charisma: 9, intelligence: 8 } }),
      target: target({ hpCurrent: 20, hpMax: 20 })
    });
    const equipment = new FakeEquipmentRepository([
      snapshotFor(actorTelegramUserId, [
        equipmentRow({ characterId: "actor", itemId: "item.stamp-of-minor-authority", slot: "weapon" })
      ]),
      snapshotFor(targetTelegramUserId, [
        equipmentRow({
          id: "equipment-target-chest",
          characterId: "target",
          itemId: "item.apron-of-foam-resistance",
          slot: "chest"
        })
      ])
    ]);
    const service = new ClassNoncombatService(
      repository,
      () => now,
      new FakeRandomSource([0]),
      undefined,
      equipment
    );

    await service.healForTelegramUser(actorTelegramUserId, {
      targetTelegramUserId,
      expectedActorRemortCount: 0,
      expectedTargetRemortCount: 0
    });

    expect(repository.lastHealInput).toMatchObject({
      healAmount: 10,
      manaCost: 4,
      targetEffectiveHpMax: 30,
      statSnapshot: {
        level: 3,
        charisma: 11,
        intelligence: 9,
        targetEffectiveHpMax: 30,
        equipmentItemIds: ["item.stamp-of-minor-authority"],
        equipmentEffects: {
          stats: {
            intelligence: 1
          }
        }
      }
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

  it("creates direct Priest blessing with a scaled bonus and achievement hook", async () => {
    const repository = new FakeClassNoncombatRepository({
      actor: priest({ level: 13, statsJson: { intelligence: 20 } }),
      target: target({ level: 3 })
    });
    const achievements = new FakeAchievementService();
    const service = new ClassNoncombatService(repository, () => now, new FakeRandomSource([0]), achievements.service);

    const result = await service.blessForTelegramUser(actorTelegramUserId, {
      targetTelegramUserId,
      expectedActorRemortCount: 0,
      expectedTargetRemortCount: 0
    });

    expect(result.state).toBe("completed");
    expect(repository.lastBlessInput).toMatchObject({
      manaCost: 23,
      bonusAmount: 5,
      expiresAt: new Date("2026-07-03T09:13:00.000Z"),
      cooldownAvailableAt: new Date("2026-07-03T10:33:00.000Z"),
      statSnapshot: {
        level: 13,
        intelligence: 22,
        targetLevel: 3,
        levelDiff: 10,
        blessingBonus: 5
      }
    });
    expect(achievements.events.map((event) => event.type)).toEqual(["priest.blessing.completed"]);
  });

  it("plans Priest blessing bonus from effective equipment stats", async () => {
    const repository = new FakeClassNoncombatRepository({
      actor: priest({ level: 3, statsJson: { intelligence: 10 } }),
      target: target({ level: 3 })
    });
    const equipment = new FakeEquipmentRepository([
      snapshotFor(actorTelegramUserId, [
        equipmentRow({ characterId: "actor", itemId: "item.stamp-of-minor-authority", slot: "weapon" })
      ])
    ]);
    const service = new ClassNoncombatService(
      repository,
      () => now,
      new FakeRandomSource([0]),
      undefined,
      equipment
    );

    await service.blessForTelegramUser(actorTelegramUserId, {
      targetTelegramUserId,
      expectedActorRemortCount: 0,
      expectedTargetRemortCount: 0
    });

    expect(repository.lastBlessInput).toMatchObject({
      bonusAmount: 2,
      manaCost: 12,
      statSnapshot: {
        level: 3,
        intelligence: 11,
        targetLevel: 3,
        levelDiff: 0,
        blessingBonus: 2,
        equipmentItemIds: ["item.stamp-of-minor-authority"]
      }
    });
  });

  it("carries active cosmetic titles into Priest blessing summaries", async () => {
    const repository = new FakeClassNoncombatRepository({
      actor: priest({ activeCosmeticTitleGrantId: "cosmetic-title.first-problem-clerk" }),
      target: target()
    });
    const service = new ClassNoncombatService(repository, () => now, new FakeRandomSource([0]));

    const result = await service.blessForTelegramUser(actorTelegramUserId, {
      targetTelegramUserId,
      expectedActorRemortCount: 0,
      expectedTargetRemortCount: 0
    });

    expect(result.state).toBe("completed");
    if (result.state !== "completed") {
      throw new Error("Expected completed Priest blessing");
    }
    expect(result.actor.activeCosmeticTitle).toBe("Перший писар");
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

  it("adds a short retaliation token only to noticed successful Rogue theft plans", async () => {
    const repository = new FakeClassNoncombatRepository({
      actor: rogue({ level: 3, statsJson: { dexterity: 10, luck: 8 } }),
      target: target({ level: 3, gold: 50 })
    });
    const service = new ClassNoncombatService(repository, () => now, new FakeRandomSource([0.8, 0.5]));

    await service.pickpocketForTelegramUser(actorTelegramUserId, {
      targetTelegramUserId,
      expectedActorRemortCount: 0,
      expectedTargetRemortCount: 0
    });

    expect(repository.lastPickpocketInput).toMatchObject({
      outcome: "noticed-success",
      stolenGold: 6,
      retaliationToken: "iiiiiiiiiiiiiiii",
      retaliationAvailableUntil: new Date("2026-07-03T09:13:00.000Z")
    });
  });

  it("plans Rogue pickpocket with equipped manatky and active Priest blessing stats", async () => {
    const repository = new FakeClassNoncombatRepository({
      actor: rogue({ level: 3, statsJson: { dexterity: 7, luck: 5 } }),
      target: target({ level: 3, gold: 50 }),
      activeBlessings: new Map([
        [actorTelegramUserId, priestBlessing({ bonusStat: "luck", bonusAmount: 3 })]
      ])
    });
    const equipment = new FakeEquipmentRepository([
      snapshotFor(actorTelegramUserId, [
        equipmentRow({ characterId: "actor", itemId: "item.bone-key-of-half-access", slot: "accessory" })
      ])
    ]);
    const service = new ClassNoncombatService(
      repository,
      () => now,
      new FakeRandomSource([0.8, 0.99]),
      undefined,
      equipment
    );

    await service.pickpocketForTelegramUser(actorTelegramUserId, {
      targetTelegramUserId,
      expectedActorRemortCount: 0,
      expectedTargetRemortCount: 0
    });

    expect(repository.lastPickpocketInput).toMatchObject({
      outcome: "clean-success",
      stolenGold: 6,
      statSnapshot: {
        level: 3,
        dexterity: 9,
        luck: 11,
        targetLevel: 3,
        bonusGold: 1,
        power: 33,
        equipmentItemIds: ["item.bone-key-of-half-access"],
        activePriestBlessing: {
          id: "blessing-1",
          bonusStat: "luck",
          bonusAmount: 3,
          expiresAt: "2026-07-03T09:13:00.000Z"
        }
      }
    });
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

  it("requests same-day attempted target markers when opening the Rogue list", async () => {
    const repository = new FakeClassNoncombatRepository({
      actor: rogue()
    });
    const service = new ClassNoncombatService(repository, () => now, new FakeRandomSource([0]));

    const result = await service.openForTelegramUser(actorTelegramUserId, "rogue");

    expect(result).toMatchObject({ state: "ready", mode: "rogue" });
    expect(repository.lastSnapshotInput).toMatchObject({
      rogueAttemptedLocalDate: "2026-07-03"
    });
  });

  it("does not settle or query Sated rows when opening Priest and Rogue support", async () => {
    const priestRepository = new FakeClassNoncombatRepository({ actor: priest() });
    const rogueRepository = new FakeClassNoncombatRepository({ actor: rogue() });

    await new ClassNoncombatService(priestRepository, () => now, new FakeRandomSource([0]))
      .openForTelegramUser(actorTelegramUserId, "priest");
    await new ClassNoncombatService(rogueRepository, () => now, new FakeRandomSource([0]))
      .openForTelegramUser(actorTelegramUserId, "rogue");

    expect(priestRepository.satedSettlementCalls).toBe(0);
    expect(rogueRepository.satedSettlementCalls).toBe(0);
    expect(priestRepository.lastSnapshotInput?.mode).toBe("priest");
    expect(rogueRepository.lastSnapshotInput?.mode).toBe("rogue");
  });

  it("opens Rogue target lists without loading effective equipment or Priest blessings", async () => {
    const repository = new FakeClassNoncombatRepository({
      actor: rogue({ level: 3, statsJson: { dexterity: 7, luck: 5 } }),
      target: target({ level: 3, gold: 50 }),
      activeBlessings: new Map([
        [actorTelegramUserId, priestBlessing({ bonusStat: "luck", bonusAmount: 3 })],
        [targetTelegramUserId, priestBlessing({ bonusStat: "dexterity", bonusAmount: 2 })]
      ])
    });
    const equipment = new FakeEquipmentRepository([
      snapshotFor(actorTelegramUserId, [
        equipmentRow({ characterId: "actor", itemId: "item.bone-key-of-half-access", slot: "accessory" })
      ]),
      snapshotFor(targetTelegramUserId, [
        equipmentRow({
          id: "equipment-target-chest",
          characterId: "target",
          itemId: "item.apron-of-foam-resistance",
          slot: "chest"
        })
      ])
    ]);
    const service = new ClassNoncombatService(
      repository,
      () => now,
      new FakeRandomSource([0]),
      undefined,
      equipment
    );

    const result = await service.openForTelegramUser(actorTelegramUserId, "rogue");

    expect(result).toMatchObject({ state: "ready", mode: "rogue" });
    expect(repository.activeBlessingLookupTelegramUserIds).toEqual([]);
    expect(equipment.lookupTelegramUserIds).toEqual([]);
  });

  it("carries actor busy state into the open result", async () => {
    const repository = new FakeClassNoncombatRepository({
      actorBlocked: true
    });
    const service = new ClassNoncombatService(repository, () => now, new FakeRandomSource([0]));

    const result = await service.openForTelegramUser(actorTelegramUserId, "priest");

    expect(result).toMatchObject({ state: "ready", mode: "priest", actorBlocked: true });
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
  lastSnapshotInput: Parameters<ClassNoncombatRepository["getSnapshotForTelegramUser"]>[1] | null = null;
  lastHealInput: Parameters<ClassNoncombatRepository["completePriestHeal"]>[1] | null = null;
  lastBlessInput: Parameters<ClassNoncombatRepository["completePriestBlessing"]>[1] | null = null;
  lastPickpocketInput: Parameters<ClassNoncombatRepository["completeRoguePickpocket"]>[1] | null = null;
  lastClaimRetaliationInput: Parameters<ClassNoncombatRepository["claimRogueRetaliation"]>[1] | null = null;
  lastRetaliationDuelInput: Parameters<ClassNoncombatRepository["recordRogueRetaliationDuel"]>[1] | null = null;
  lastSatedPreviewInput: Parameters<ClassNoncombatRepository["saveVarenykSatedPreview"]>[1] | null = null;
  readonly activeBlessingLookupTelegramUserIds: bigint[] = [];
  satedSettlementCalls = 0;

  private readonly actor: CharacterRecord;
  private readonly target: CharacterRecord;
  private readonly healResult?: PriestHealRepositoryResult;
  private readonly blessResult?: PriestBlessRepositoryResult;
  private readonly pickpocketResult?: RoguePickpocketRepositoryResult;
  private readonly satedResult?: VarenykSatedRepositoryResult;
  private readonly satedPreviewResult?: VarenykSatedPreviewRepositoryResult;
  private readonly actorBlocked: boolean;
  private readonly activeBlessings: Map<bigint, PriestBlessingRecord>;

  constructor(options: {
    actor?: CharacterRecord;
    target?: CharacterRecord;
    healResult?: PriestHealRepositoryResult;
    blessResult?: PriestBlessRepositoryResult;
    pickpocketResult?: RoguePickpocketRepositoryResult;
    satedResult?: VarenykSatedRepositoryResult;
    satedPreviewResult?: VarenykSatedPreviewRepositoryResult;
    actorBlocked?: boolean;
    activeBlessings?: Map<bigint, PriestBlessingRecord>;
  } = {}) {
    this.actor = options.actor ?? priest();
    this.target = options.target ?? target();
    this.healResult = options.healResult;
    this.blessResult = options.blessResult;
    this.pickpocketResult = options.pickpocketResult;
    this.satedResult = options.satedResult;
    this.satedPreviewResult = options.satedPreviewResult;
    this.actorBlocked = options.actorBlocked ?? false;
    this.activeBlessings = options.activeBlessings ?? new Map<bigint, PriestBlessingRecord>();
  }

  getSnapshotForTelegramUser(
    _telegramUserId: bigint,
    input: Parameters<ClassNoncombatRepository["getSnapshotForTelegramUser"]>[1]
  ): Promise<NoncombatActionSnapshot> {
    this.lastSnapshotInput = input;
    return Promise.resolve({
      character: this.actor,
      actorBlocked: this.actorBlocked,
      targets: [{
        telegramUserId: targetTelegramUserId,
        characterId: this.target.id,
        character: this.target,
        name: this.target.name,
        classId: this.target.classId,
        level: this.target.level,
        hpCurrent: this.target.hpCurrent,
        hpMax: this.target.hpMax,
        gold: this.target.gold,
        remortCount: this.target.remortCount ?? 0,
        priestBlessAvailableAt: null,
        rogueAttemptedToday: false,
        ...(this.actor.classId === "class.varenyk-mancer"
          ? {
              varenykPlanning: {
                summary: summarizeCharacter(this.target),
                activeCosmeticTitleGrantId: this.target.activeCosmeticTitleGrantId ?? null,
                equipmentItemIds: [],
                attunedEquipmentRows: [],
                naturalHpMax: summarizeCharacter(this.target).hpMax,
                naturalManaMax: summarizeCharacter(this.target).manaMax,
                activePriestBlessing: null
              }
            }
          : {})
      }],
      targetPage: 0,
      targetTotalPages: 1,
      locationId: "location.korchma.front",
      locationName: "Перед Корчмою",
      priestBlessCooldownAvailableAt: null,
      priestSelfBlessAvailableAt: null,
      roguePickpocketCooldownAvailableAt: null,
      varenykStatRank: null,
      varenykPlan: null,
      ...(this.actor.classId === "class.varenyk-mancer"
        ? {
            varenykPlanning: {
              summary: summarizeCharacter(this.actor),
              activeCosmeticTitleGrantId: this.actor.activeCosmeticTitleGrantId ?? null,
              equipmentItemIds: [],
              attunedEquipmentRows: [],
              naturalHpMax: summarizeCharacter(this.actor).hpMax,
              naturalManaMax: summarizeCharacter(this.actor).manaMax,
              activePriestBlessing: null
            }
          }
        : {})
    });
  }

  getActivePriestBlessingForTelegramUser(telegramUserId: bigint) {
    this.activeBlessingLookupTelegramUserIds.push(telegramUserId);
    return Promise.resolve(this.activeBlessings.get(telegramUserId) ?? null);
  }

  settleVarenykSatedForTelegramUser() {
    this.satedSettlementCalls += 1;
    return Promise.resolve(null);
  }

  saveVarenykSatedPreview(
    _actorTelegramUserId: bigint,
    input: Parameters<ClassNoncombatRepository["saveVarenykSatedPreview"]>[1]
  ) {
    this.lastSatedPreviewInput = input;
    if (this.satedPreviewResult) {
      return Promise.resolve(this.satedPreviewResult);
    }
    const stats = this.actor.statsJson as { intelligence?: unknown; charisma?: unknown };
    const statPlan = buildVarenykSatedPlan({
      effectiveIntelligence: typeof stats.intelligence === "number" ? stats.intelligence : 0,
      effectiveCharisma: typeof stats.charisma === "number" ? stats.charisma : 0,
      level: this.actor.level
    });
    const statRank = statPlan.rank;
    const plan = getAffordableVarenykSatedPlan(statRank, this.actor.manaCurrent);
    const actorSummary = summarizeCharacter(this.actor);
    const targetSummary = summarizeCharacter(this.target);
    return Promise.resolve(plan
      ? {
          state: "saved" as const,
          statRank,
          plan,
          actor: {
            summary: actorSummary,
            activeCosmeticTitleGrantId: this.actor.activeCosmeticTitleGrantId ?? null,
            naturalHpMax: actorSummary.hpMax,
            naturalManaMax: actorSummary.manaMax,
            equipmentItemIds: [],
            attunedEquipmentRows: [],
            activePriestBlessing: null
          },
          target: {
            summary: targetSummary,
            activeCosmeticTitleGrantId: this.target.activeCosmeticTitleGrantId ?? null,
            naturalHpMax: targetSummary.hpMax,
            naturalManaMax: targetSummary.manaMax,
            equipmentItemIds: [],
            attunedEquipmentRows: [],
            activePriestBlessing: null
          },
          actorRemortCount: this.actor.remortCount ?? 0,
          targetRemortCount: this.target.remortCount ?? 0
        }
      : { state: "blocked" as const, reason: "insufficient-mana" as const });
  }

  completeVarenykSated(): ReturnType<ClassNoncombatRepository["completeVarenykSated"]> {
    return Promise.resolve(this.satedResult ?? { state: "blocked", reason: "stale" });
  }

  isActorBlockedForTelegramUser() {
    return Promise.resolve(this.actorBlocked);
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
        bonusStat: "luck",
        bonusAmount: input.bonusAmount
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

  claimRogueRetaliation(
    _targetTelegramUserId: bigint,
    input: Parameters<ClassNoncombatRepository["claimRogueRetaliation"]>[1]
  ): Promise<RogueRetaliationClaimResult> {
    this.lastClaimRetaliationInput = input;
    return Promise.resolve({
      state: "ready",
      attempt: pickpocketAttempt({
        retaliationToken: input.retaliationToken,
        retaliationUsedAt: input.now
      }),
      actor: this.actor,
      target: this.target
    });
  }

  recordRogueRetaliationDuel(
    _retaliationToken: string,
    input: Parameters<ClassNoncombatRepository["recordRogueRetaliationDuel"]>[1]
  ): Promise<void> {
    this.lastRetaliationDuelInput = input;
    return Promise.resolve();
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

class FakeEquipmentRepository implements Pick<EquipmentRepository, "listByTelegramUserId"> {
  readonly lookupTelegramUserIds: bigint[] = [];
  private readonly snapshotsByTelegramUserId = new Map<bigint, CharacterEquipmentSnapshot>();

  constructor(snapshots: Array<{ telegramUserId: bigint; snapshot: CharacterEquipmentSnapshot }>) {
    for (const entry of snapshots) {
      this.snapshotsByTelegramUserId.set(entry.telegramUserId, entry.snapshot);
    }
  }

  listByTelegramUserId(telegramUserId: bigint): Promise<CharacterEquipmentSnapshot | null> {
    this.lookupTelegramUserIds.push(telegramUserId);
    return Promise.resolve(this.snapshotsByTelegramUserId.get(telegramUserId) ?? null);
  }
}

function priest(overrides: Partial<CharacterRecord> = {}): CharacterRecord {
  return character({ id: "actor", classId: "class.priest", name: "Отець Кут", statsJson: { charisma: 9, intelligence: 9 }, ...overrides });
}

function rogue(overrides: Partial<CharacterRecord> = {}): CharacterRecord {
  return character({ id: "actor", classId: "class.rogue", name: "Тихий Кут", statsJson: { dexterity: 10, luck: 8 }, ...overrides });
}

function varenyk(overrides: Partial<CharacterRecord> = {}): CharacterRecord {
  return character({
    id: "actor",
    classId: "class.varenyk-mancer",
    name: "Пан Вареник",
    statsJson: { intelligence: 11, charisma: 9 },
    ...overrides
  });
}

function varenykSatedCompletion(
  options: { created: boolean }
): Extract<VarenykSatedRepositoryResult, { state: "completed" }> {
  const actor = varenyk({ manaCurrent: 12 });
  const expiresAt = new Date(now.getTime() + 13 * 60_000);
  const availableAt = new Date(now.getTime() + 93 * 60_000);
  const payload = {
    kind: "varenyk-sated-support-v1" as const,
    version: 1 as const,
    activationId: "activation",
    actorCharacterId: actor.id,
    actorRemortCount: 0,
    recipientCharacterId: actor.id,
    recipientRemortCount: 0,
    rank: 2,
    manaCost: 12,
    effectiveStats: { intelligence: 11, charisma: 9, level: 3, equipmentItemIds: [] },
    startedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    availableAt: availableAt.toISOString(),
    cursorAt: now.toISOString(),
    receipt: {
      version: 1 as const,
      previewToken: "preview",
      actorTelegramUserId: actorTelegramUserId.toString(),
      targetTelegramUserId: actorTelegramUserId.toString(),
      actorName: actor.name,
      targetName: actor.name,
      immediateHpRestored: 4,
      immediateManaRestored: 1,
      actorManaAfter: 12,
      targetHpAfter: 14,
      targetManaAfter: 12
    }
  };
  return {
    state: "completed",
    action: {
      activationId: "activation",
      actorCharacterId: actor.id,
      targetCharacterId: actor.id,
      actorTelegramUserId,
      targetTelegramUserId: actorTelegramUserId,
      actorName: actor.name,
      targetName: actor.name,
      actorRemortCount: 0,
      targetRemortCount: 0,
      rank: 2,
      manaCost: 12,
      immediateHpRestored: 4,
      immediateManaRestored: 1,
      startedAt: now,
      expiresAt,
      availableAt,
      created: options.created
    },
    actor,
    target: actor,
    status: payload,
    created: options.created
  };
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
    retaliationToken: null,
    retaliationAvailableUntil: null,
    retaliationUsedAt: null,
    retaliationDuelInviteToken: null,
    cooldownAvailableAt: new Date("2026-07-03T10:33:00.000Z"),
    completedAt: now,
    ...overrides
  };
}

function priestBlessing(overrides: Partial<PriestBlessingRecord> = {}): PriestBlessingRecord {
  return {
    id: "blessing-1",
    actorName: "Отець Кут",
    targetName: "Тихий Кут",
    expiresAt: new Date("2026-07-03T09:13:00.000Z"),
    bonusStat: "luck",
    bonusAmount: 1,
    ...overrides
  };
}

function snapshotFor(
  telegramUserId: bigint,
  equipment: CharacterEquipmentRecord[]
): { telegramUserId: bigint; snapshot: CharacterEquipmentSnapshot } {
  return {
    telegramUserId,
    snapshot: {
      characterId: equipment[0]?.characterId ?? "character",
      equipment
    }
  };
}

function equipmentRow(overrides: Partial<CharacterEquipmentRecord>): CharacterEquipmentRecord {
  return {
    id: "equipment-1",
    characterId: "actor",
    slot: "weapon",
    itemId: "item.stamp-of-minor-authority",
    createdAt: new Date("2026-07-03T09:00:00.000Z"),
    updatedAt: new Date("2026-07-03T09:00:00.000Z"),
    ...overrides
  };
}
