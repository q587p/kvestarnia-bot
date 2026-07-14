import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClassNoncombatRepository } from "../../src/db/repositories/prismaClassNoncombatRepository";
import {
  buildEquipmentAttunementPayload,
  EQUIPMENT_ATTUNEMENT_ACTION_KEY
} from "../../src/domain/equipment/equipmentAttunement";
import {
  advanceVarenykSatedCursorThroughCombat,
  freezeVarenykSatedFromCooldown
} from "../../src/db/repositories/prismaVarenykSated";
import type { VarenykSatedPayloadV1 } from "../../src/domain/noncombat/varenykSatedSupport";

const now = new Date("2026-07-03T09:00:00.000Z");
const cooldownAvailableAt = new Date("2026-07-03T10:33:00.000Z");

describe("PrismaClassNoncombatRepository integration", () => {
  let dir: string;
  let prisma: PrismaClient;
  let repository: PrismaClassNoncombatRepository;
  let queryEvents: Array<{ query: string; params: string }> = [];

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "kvestarnia-class-noncombat-"));
    prisma = new PrismaClient({
      log: [{ emit: "event", level: "query" }],
      datasources: {
        db: {
          url: `file:${join(dir, "test.db").replace(/\\/g, "/")}`
        }
      }
    });
    prisma.$on("query", (event: Prisma.QueryEvent) => queryEvents.push({ query: event.query, params: event.params }));
    await createMinimalSchema(prisma);
    repository = new PrismaClassNoncombatRepository(prisma);
  }, 60_000);

  beforeEach(async () => {
    await prisma.noncombatRoguePickpocketAttempt.deleteMany();
    await prisma.noncombatPriestAidAction.deleteMany();
    await prisma.noncombatPriestBlessing.deleteMany();
    await prisma.characterCooldown.deleteMany();
    await prisma.activeCombatLease.deleteMany();
    await prisma.dailyAction.deleteMany();
    await prisma.characterDrinkState.deleteMany();
    await prisma.characterEquipment.deleteMany();
    await prisma.characterRemort.deleteMany();
    await prisma.character.deleteMany();
    await prisma.user.deleteMany();
    queryEvents = [];
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  it("moves Rogue pickpocket gold atomically and replays duplicate callbacks without rerolling", async () => {
    await seedCharacter({ telegramUserId: 101n, userId: "user-rogue", characterId: "rogue", classId: "class.rogue", level: 5, gold: 1 });
    await seedCharacter({ telegramUserId: 102n, userId: "user-target", characterId: "target", level: 5, gold: 8 });

    const first = await repository.completeRoguePickpocket(101n, rogueInput({
      outcome: "clean-success",
      stolenGold: 5
    }));
    const replay = await repository.completeRoguePickpocket(101n, rogueInput({
      outcome: "caught-badly",
      stolenGold: 13
    }));

    expect(first).toMatchObject({ state: "completed", created: true });
    expect(replay).toMatchObject({
      state: "completed",
      created: false,
      attempt: { outcome: "clean-success", stolenGold: 5 }
    });
    await expect(prisma.character.findUnique({ where: { id: "rogue" } })).resolves.toMatchObject({
      gold: 6,
      hpCurrent: 20
    });
    await expect(prisma.character.findUnique({ where: { id: "target" } })).resolves.toMatchObject({
      gold: 3
    });
    await expect(prisma.noncombatRoguePickpocketAttempt.count()).resolves.toBe(1);
  });

  it("spends self-feed mana before immediate recovery and replays the durable receipt", async () => {
    await seedCharacter({
      telegramUserId: 1001n,
      userId: "user-varenyk",
      characterId: "varenyk",
      classId: "class.varenyk-mancer",
      hpCurrent: 15,
      manaCurrent: 8
    });
    const input = {
      targetTelegramUserId: null,
      expectedActorRemortCount: 0,
      expectedTargetRemortCount: 0,
      activeSince: new Date("2026-07-03T08:55:00.000Z"),
      now,
      previewToken: "sated-preview"
    };
    await expect(repository.saveVarenykSatedPreview(1001n, {
      ...input,
      expiresAt: new Date(now.getTime() + 13 * 60_000)
    })).resolves.toMatchObject({
      state: "saved",
      statRank: 1,
      plan: { rank: 1, manaCost: 8 }
    });

    const first = await repository.completeVarenykSated(1001n, input);
    const replay = await repository.completeVarenykSated(1001n, input);

    expect(first).toMatchObject({
      state: "completed",
      created: true,
      action: {
        rank: 1,
        manaCost: 8,
        immediateHpRestored: 3,
        immediateManaRestored: 1,
        expiresAt: new Date(now.getTime() + 13 * 60_000),
        availableAt: new Date(now.getTime() + 93 * 60_000)
      },
      status: {
        expiresAt: new Date(now.getTime() + 13 * 60_000).toISOString(),
        availableAt: new Date(now.getTime() + 93 * 60_000).toISOString(),
        cursorAt: now.toISOString()
      }
    });
    expect(replay).toMatchObject({
      state: "completed",
      created: false,
      action: { activationId: first.state === "completed" ? first.action.activationId : "missing" }
    });
    await expect(prisma.character.findUnique({ where: { id: "varenyk" } })).resolves.toMatchObject({
      hpCurrent: 18,
      manaCurrent: 1
    });
    await expect(repository.completeVarenykSated(1001n, { ...input, previewToken: "fresh-forged" }))
      .resolves.toMatchObject({ state: "blocked", reason: "stale" });
  });

  it("settles passive mana before choosing the affordable self-feed rank", async () => {
    await seedCharacter({
      telegramUserId: 1051n,
      userId: "user-passive-varenyk",
      characterId: "passive-varenyk",
      classId: "class.varenyk-mancer",
      manaCurrent: 7,
      manaRegenAt: new Date("2026-07-03T08:59:30.000Z")
    });
    const input = {
      targetTelegramUserId: null,
      expectedActorRemortCount: 0,
      expectedTargetRemortCount: 0,
      activeSince: new Date("2026-07-03T08:55:00.000Z"),
      now,
      previewToken: "passive-preview"
    };
    await expect(repository.saveVarenykSatedPreview(1051n, {
      ...input,
      expiresAt: new Date(now.getTime() + 13 * 60_000)
    })).resolves.toMatchObject({ state: "saved", plan: { rank: 1, manaCost: 8 } });

    await expect(repository.completeVarenykSated(1051n, input)).resolves.toMatchObject({
      state: "completed",
      created: true,
      action: { rank: 1, manaCost: 8, immediateManaRestored: 1 }
    });
    await expect(prisma.character.findUnique({ where: { id: "passive-varenyk" } })).resolves.toMatchObject({
      manaCurrent: 1
    });
  });

  it("commits the exact downgraded preview after later mana regeneration", async () => {
    await seedCharacter({
      telegramUserId: 1052n,
      userId: "user-exact-preview",
      characterId: "exact-preview",
      classId: "class.varenyk-mancer",
      manaCurrent: 16,
      manaMax: 30,
      statsJson: { dexterity: 10, luck: 8, charisma: 9, intelligence: 20 }
    });
    const input = {
      targetTelegramUserId: null,
      expectedActorRemortCount: 0,
      expectedTargetRemortCount: 0,
      activeSince: new Date("2026-07-03T08:55:00.000Z"),
      now,
      previewToken: "exact-preview-token"
    };
    await expect(repository.saveVarenykSatedPreview(1052n, {
      ...input,
      expiresAt: new Date(now.getTime() + 13 * 60_000)
    })).resolves.toMatchObject({ state: "saved", statRank: 5, plan: { rank: 3, manaCost: 16 } });
    await prisma.character.update({
      where: { id: "exact-preview" },
      data: { manaCurrent: 23, manaRegenAt: now }
    });

    await expect(repository.completeVarenykSated(1052n, input)).resolves.toMatchObject({
      state: "completed",
      created: true,
      action: { rank: 3, manaCost: 16 }
    });
    await expect(prisma.character.findUnique({ where: { id: "exact-preview" } }))
      .resolves.toMatchObject({ manaCurrent: 8 });
  });

  it("rejects an exact preview charge that is no longer affordable", async () => {
    await seedCharacter({
      telegramUserId: 1053n,
      userId: "user-preview-charge",
      characterId: "preview-charge",
      classId: "class.varenyk-mancer",
      manaCurrent: 16,
      manaMax: 30,
      statsJson: { dexterity: 10, luck: 8, charisma: 9, intelligence: 20 }
    });
    const input = {
      targetTelegramUserId: null,
      expectedActorRemortCount: 0,
      expectedTargetRemortCount: 0,
      activeSince: new Date("2026-07-03T08:55:00.000Z"),
      now,
      previewToken: "preview-charge-token"
    };
    await repository.saveVarenykSatedPreview(1053n, {
      ...input,
      expiresAt: new Date(now.getTime() + 13 * 60_000)
    });
    await prisma.character.update({
      where: { id: "preview-charge" },
      data: { manaCurrent: 15, manaRegenAt: now }
    });

    await expect(repository.completeVarenykSated(1053n, input)).resolves.toMatchObject({
      state: "blocked",
      reason: "insufficient-mana"
    });
    await expect(prisma.character.findUnique({ where: { id: "preview-charge" } }))
      .resolves.toMatchObject({ manaCurrent: 15 });
  });

  it("stales a preview when equipment attunement or Shynok recovery windows change", async () => {
    await seedCharacter({
      telegramUserId: 1054n,
      userId: "user-preview-canonical",
      characterId: "preview-canonical",
      classId: "class.varenyk-mancer",
      manaCurrent: 20
    });
    const equipment = await prisma.characterEquipment.create({
      data: {
        characterId: "preview-canonical",
        slot: "weapon",
        itemId: "item.stamp-of-minor-authority"
      }
    });
    const baseInput = {
      targetTelegramUserId: null,
      expectedActorRemortCount: 0,
      expectedTargetRemortCount: 0,
      activeSince: new Date("2026-07-03T08:55:00.000Z"),
      now
    };
    await repository.saveVarenykSatedPreview(1054n, {
      ...baseInput,
      previewToken: "attunement-preview",
      expiresAt: new Date(now.getTime() + 13 * 60_000)
    });
    await prisma.dailyAction.create({
      data: {
        characterId: "preview-canonical",
        key: EQUIPMENT_ATTUNEMENT_ACTION_KEY,
        localDate: `${equipment.slot}:${equipment.id}:${equipment.updatedAt.getTime()}`,
        rewardXp: 0,
        rewardGold: 0,
        spentGold: 0,
        resultJson: buildEquipmentAttunementPayload({
          slot: equipment.slot,
          itemId: equipment.itemId,
          itemName: "Печатка дрібної влади",
          equipmentUpdatedAt: equipment.updatedAt,
          strength: "weak",
          startedAt: now,
          readyAt: new Date(now.getTime() + 13 * 60_000)
        })
      }
    });
    await expect(repository.completeVarenykSated(1054n, {
      ...baseInput,
      previewToken: "attunement-preview"
    })).resolves.toMatchObject({ state: "blocked", reason: "stale" });

    await prisma.dailyAction.deleteMany();
    await repository.saveVarenykSatedPreview(1054n, {
      ...baseInput,
      previewToken: "shynok-preview",
      expiresAt: new Date(now.getTime() + 13 * 60_000)
    });
    await prisma.characterDrinkState.create({
      data: {
        activationId: "drink-window",
        characterId: "preview-canonical",
        remortCount: 0,
        drinkKey: "drink.thyme-tea",
        phase: "timed",
        startedAt: now,
        expiresAt: new Date(now.getTime() + 42 * 60_000),
        sourceType: "shynok"
      }
    });
    await expect(repository.completeVarenykSated(1054n, {
      ...baseInput,
      previewToken: "shynok-preview"
    })).resolves.toMatchObject({ state: "blocked", reason: "stale" });
  });

  it("never replaces an active Sated activation when the recipient wait is cleared", async () => {
    await seedCharacter({
      telegramUserId: 1061n,
      userId: "user-refresh-varenyk",
      characterId: "refresh-varenyk",
      classId: "class.varenyk-mancer",
      manaCurrent: 20
    });
    const firstInput = {
      targetTelegramUserId: null,
      expectedActorRemortCount: 0,
      expectedTargetRemortCount: 0,
      activeSince: new Date("2026-07-03T08:55:00.000Z"),
      now,
      previewToken: "refresh-first"
    };
    await repository.saveVarenykSatedPreview(1061n, {
      ...firstInput,
      expiresAt: new Date(now.getTime() + 13 * 60_000)
    });
    const first = await repository.completeVarenykSated(1061n, firstInput);
    expect(first).toMatchObject({ state: "completed", created: true });

    const secondNow = new Date(now.getTime() + 60_000);
    await prisma.characterCooldown.update({
      where: {
        characterId_key: {
          characterId: "refresh-varenyk",
          key: "class.varenyk-mancer.sated-support.recipient"
        }
      },
      data: { availableAt: secondNow }
    });
    const secondInput = {
      ...firstInput,
      activeSince: new Date(secondNow.getTime() - 5 * 60_000),
      now: secondNow,
      previewToken: "refresh-second"
    };
    await expect(repository.saveVarenykSatedPreview(1061n, {
      ...secondInput,
      expiresAt: new Date(secondNow.getTime() + 13 * 60_000)
    })).resolves.toMatchObject({ state: "blocked", reason: "already-sated" });
    await expect(repository.completeVarenykSated(1061n, secondInput)).resolves.toMatchObject({
      state: "blocked",
      reason: "stale"
    });
    await expect(prisma.characterCooldown.count({
      where: {
        characterId: "refresh-varenyk",
        key: "class.varenyk-mancer.sated-support.recipient"
      }
    })).resolves.toBe(1);
  });

  it("settles every eligible pre-expiry minute before feeding again at the 93-minute boundary", async () => {
    await seedCharacter({
      telegramUserId: 1062n,
      userId: "user-refeed-settlement",
      characterId: "refeed-settlement",
      classId: "class.varenyk-mancer",
      hpCurrent: 1,
      hpMax: 30,
      manaCurrent: 8,
      manaMax: 30,
      hpRegenAt: now,
      manaRegenAt: now
    });
    const firstInput = {
      targetTelegramUserId: null,
      expectedActorRemortCount: 0,
      expectedTargetRemortCount: 0,
      activeSince: new Date(now.getTime() - 5 * 60_000),
      now,
      previewToken: "refeed-first"
    };
    await repository.saveVarenykSatedPreview(1062n, {
      ...firstInput,
      expiresAt: new Date(now.getTime() + 13 * 60_000)
    });
    await repository.completeVarenykSated(1062n, firstInput);
    const secondNow = new Date(now.getTime() + 93 * 60_000);
    await prisma.character.update({
      where: { id: "refeed-settlement" },
      data: { hpRegenAt: secondNow, manaRegenAt: secondNow }
    });
    const secondInput = {
      ...firstInput,
      activeSince: new Date(secondNow.getTime() - 5 * 60_000),
      now: secondNow,
      previewToken: "refeed-second"
    };

    await expect(repository.saveVarenykSatedPreview(1062n, {
      ...secondInput,
      expiresAt: new Date(secondNow.getTime() + 13 * 60_000)
    })).resolves.toMatchObject({ state: "saved", plan: { rank: 1, manaCost: 8 } });
    await expect(prisma.character.findUnique({ where: { id: "refeed-settlement" } }))
      .resolves.toMatchObject({ hpCurrent: 17, manaCurrent: 14 });
    await expect(repository.completeVarenykSated(1062n, secondInput)).resolves.toMatchObject({
      state: "completed",
      created: true,
      action: { immediateHpRestored: 3, immediateManaRestored: 1 }
    });
    await expect(prisma.character.findUnique({ where: { id: "refeed-settlement" } }))
      .resolves.toMatchObject({ hpCurrent: 20, manaCurrent: 7 });
  });

  it("allows exactly one winner when two Varenyk-mancers race for one recipient", async () => {
    await seedCharacter({ telegramUserId: 1101n, userId: "user-v1", characterId: "v1", classId: "class.varenyk-mancer" });
    await seedCharacter({ telegramUserId: 1102n, userId: "user-v2", characterId: "v2", classId: "class.varenyk-mancer" });
    await seedCharacter({ telegramUserId: 1103n, userId: "user-recipient", characterId: "recipient", hpCurrent: 10, manaCurrent: 10 });
    const feed = (actor: bigint, previewToken: string) => repository.completeVarenykSated(actor, {
      targetTelegramUserId: 1103n,
      expectedActorRemortCount: 0,
      expectedTargetRemortCount: 0,
      activeSince: new Date("2026-07-03T08:55:00.000Z"),
      now,
      previewToken
    });

    await Promise.all([
      repository.saveVarenykSatedPreview(1101n, {
        targetTelegramUserId: 1103n,
        expectedActorRemortCount: 0,
        expectedTargetRemortCount: 0,
        activeSince: new Date("2026-07-03T08:55:00.000Z"),
        now,
        expiresAt: new Date(now.getTime() + 13 * 60_000),
        previewToken: "race-one"
      }),
      repository.saveVarenykSatedPreview(1102n, {
        targetTelegramUserId: 1103n,
        expectedActorRemortCount: 0,
        expectedTargetRemortCount: 0,
        activeSince: new Date("2026-07-03T08:55:00.000Z"),
        now,
        expiresAt: new Date(now.getTime() + 13 * 60_000),
        previewToken: "race-two"
      })
    ]);

    const results = await Promise.all([feed(1101n, "race-one"), feed(1102n, "race-two")]);
    expect(results.filter((result) => result.state === "completed" && result.created)).toHaveLength(1);
    expect(results.filter((result) => result.state === "blocked")).toHaveLength(1);
    await expect(prisma.characterCooldown.count({
      where: { characterId: "recipient", key: "class.varenyk-mancer.sated-support.recipient" }
    })).resolves.toBe(1);
  });

  it("claims noticed-success Rogue retaliation once and records the quick-duel invite", async () => {
    await seedCharacter({ telegramUserId: 101n, userId: "user-rogue", characterId: "rogue", classId: "class.rogue", level: 5, gold: 1 });
    await seedCharacter({ telegramUserId: 102n, userId: "user-target", characterId: "target", level: 5, gold: 8 });

    const first = await repository.completeRoguePickpocket(101n, rogueInput({
      outcome: "noticed-success",
      stolenGold: 5,
      retaliationToken: "claimtoken1"
    }));
    const replay = await repository.completeRoguePickpocket(101n, rogueInput({
      outcome: "caught-badly",
      stolenGold: 13,
      retaliationToken: "ignoredtoken"
    }));

    expect(first).toMatchObject({
      state: "completed",
      created: true,
      attempt: {
        outcome: "noticed-success",
        stolenGold: 5,
        retaliationToken: "claimtoken1",
        retaliationUsedAt: null
      }
    });
    expect(replay).toMatchObject({
      state: "completed",
      created: false,
      attempt: { retaliationToken: "claimtoken1" }
    });

    const claimed = await repository.claimRogueRetaliation(102n, {
      retaliationToken: "claimtoken1",
      now
    });
    expect(claimed).toMatchObject({
      state: "ready",
      attempt: { actorTelegramUserId: 101n, targetTelegramUserId: 102n, retaliationUsedAt: now }
    });

    await repository.recordRogueRetaliationDuel("claimtoken1", {
      duelInviteToken: "duel-token",
      now
    });
    await expect(prisma.noncombatRoguePickpocketAttempt.findUnique({
      where: { retaliationToken: "claimtoken1" },
      select: { retaliationDuelInviteToken: true }
    })).resolves.toEqual({ retaliationDuelInviteToken: "duel-token" });

    await expect(repository.claimRogueRetaliation(102n, {
      retaliationToken: "claimtoken1",
      now
    })).resolves.toMatchObject({ state: "blocked", reason: "used" });
  });

  it("blocks Rogue retaliation for the wrong target and expired windows", async () => {
    await seedCharacter({ telegramUserId: 111n, userId: "user-rogue", characterId: "rogue", classId: "class.rogue", level: 5, gold: 1 });
    await seedCharacter({ telegramUserId: 112n, userId: "user-target", characterId: "target", level: 5, gold: 8 });

    await repository.completeRoguePickpocket(111n, rogueInput({
      targetTelegramUserId: 112n,
      outcome: "noticed-success",
      stolenGold: 5,
      retaliationToken: "wrongtarget1"
    }));
    await expect(repository.claimRogueRetaliation(999n, {
      retaliationToken: "wrongtarget1",
      now
    })).resolves.toMatchObject({ state: "blocked", reason: "not-target" });

    await seedCharacter({ telegramUserId: 113n, userId: "user-expired-rogue", characterId: "expired-rogue", classId: "class.rogue", level: 5, gold: 1 });
    await seedCharacter({ telegramUserId: 114n, userId: "user-expired-target", characterId: "expired-target", level: 5, gold: 8 });
    await seedRawRogueAttempt({
      actorCharacterId: "expired-rogue",
      targetCharacterId: "expired-target",
      actorTelegramUserId: 113n,
      targetTelegramUserId: 114n,
      token: "expiredtok",
      outcome: "noticed-success",
      stolenGold: 5,
      retaliationAvailableUntil: new Date("2026-07-03T08:59:59.000Z")
    });
    await expect(repository.claimRogueRetaliation(114n, {
      retaliationToken: "expiredtok",
      now
    })).resolves.toMatchObject({ state: "blocked", reason: "expired" });
  });

  it("requires noticed-success, stolen gold and a Rogue actor for retaliation claims", async () => {
    const cases = [
      { id: "clean", actorTelegramUserId: 121n, targetTelegramUserId: 122n, outcome: "clean-success", stolenGold: 5 },
      { id: "empty", actorTelegramUserId: 123n, targetTelegramUserId: 124n, outcome: "empty", stolenGold: 0 },
      { id: "failure", actorTelegramUserId: 125n, targetTelegramUserId: 126n, outcome: "noticed-failure", stolenGold: 0 },
      { id: "caught", actorTelegramUserId: 127n, targetTelegramUserId: 128n, outcome: "caught-badly", stolenGold: 0 },
      { id: "zero", actorTelegramUserId: 129n, targetTelegramUserId: 130n, outcome: "noticed-success", stolenGold: 0 }
    ] as const;

    for (const entry of cases) {
      await seedCharacter({
        telegramUserId: entry.actorTelegramUserId,
        userId: `user-${entry.id}-rogue`,
        characterId: `${entry.id}-rogue`,
        classId: "class.rogue",
        level: 5,
        gold: 1
      });
      await seedCharacter({
        telegramUserId: entry.targetTelegramUserId,
        userId: `user-${entry.id}-target`,
        characterId: `${entry.id}-target`,
        level: 5,
        gold: 8
      });
      await seedRawRogueAttempt({
        actorCharacterId: `${entry.id}-rogue`,
        targetCharacterId: `${entry.id}-target`,
        actorTelegramUserId: entry.actorTelegramUserId,
        targetTelegramUserId: entry.targetTelegramUserId,
        token: `${entry.id}token`,
        outcome: entry.outcome,
        stolenGold: entry.stolenGold
      });

      await expect(repository.claimRogueRetaliation(entry.targetTelegramUserId, {
        retaliationToken: `${entry.id}token`,
        now
      })).resolves.toMatchObject({ state: "blocked", reason: "invalid-attempt" });
    }

    await seedCharacter({ telegramUserId: 131n, userId: "user-warrior", characterId: "warrior", classId: "class.warrior", level: 5, gold: 1 });
    await seedCharacter({ telegramUserId: 132n, userId: "user-warrior-target", characterId: "warrior-target", level: 5, gold: 8 });
    await seedRawRogueAttempt({
      actorCharacterId: "warrior",
      targetCharacterId: "warrior-target",
      actorTelegramUserId: 131n,
      targetTelegramUserId: 132n,
      token: "warriortoken",
      outcome: "noticed-success",
      stolenGold: 5
    });

    await expect(repository.claimRogueRetaliation(132n, {
      retaliationToken: "warriortoken",
      now
    })).resolves.toMatchObject({ state: "blocked", reason: "actor-not-rogue" });
  });

  it("lists only exact normalized same-location noncombat targets", async () => {
    await seedCharacter({ telegramUserId: 401n, userId: "user-priest", characterId: "priest", classId: "class.priest", level: 3, locationId: "location.korchma.front" });
    await seedCharacter({ telegramUserId: 402n, userId: "user-hall", characterId: "hall-target", level: 3, locationId: "location.korchma.hall" });
    await seedCharacter({ telegramUserId: 403n, userId: "user-tavern", characterId: "tavern-target", level: 3, locationId: "location.tavern" });

    const front = await repository.getSnapshotForTelegramUser(401n, snapshotInput());

    expect(front?.targets.map((target) => target.telegramUserId)).toEqual([]);

    await prisma.user.update({
      where: { telegramUserId: 401n },
      data: { lastSeenLocationId: "location.korchma.hall" }
    });

    const hall = await repository.getSnapshotForTelegramUser(401n, snapshotInput());

    expect(hall?.targets.map((target) => target.telegramUserId).sort()).toEqual([402n, 403n]);
  });

  it("uses the cheap absent-status guard and skips Sated fan-out on Priest/Rogue reads", async () => {
    await seedCharacter({
      telegramUserId: 405n,
      userId: "user-read-guard",
      characterId: "read-guard",
      classId: "class.priest",
      level: 3
    });
    await expect(repository.settleVarenykSatedForTelegramUser(405n, now, "read-guard"))
      .resolves.toBeNull();
    expect(queryEvents.filter((event) => event.query.includes("character_cooldowns"))).toHaveLength(1);
    expect(queryEvents.some((event) => event.query === "BEGIN IMMEDIATE")).toBe(false);
    queryEvents = [];
    await repository.getSnapshotForTelegramUser(405n, snapshotInput());
    await repository.getSnapshotForTelegramUser(405n, { ...snapshotInput(), mode: "rogue" });

    expect(queryEvents.some((event) => event.params.includes("class.varenyk-mancer.sated-support.recipient")))
      .toBe(false);
  });

  it("settles before combat freeze and excludes the exact lease interval without losing outside remainder", async () => {
    await seedCharacter({
      telegramUserId: 406n,
      userId: "user-freeze-cursor",
      characterId: "freeze-cursor",
      classId: "class.varenyk-mancer",
      hpCurrent: 1,
      hpMax: 30,
      manaCurrent: 1,
      manaMax: 30
    });
    const payload = satedPayload({
      activationId: "freeze-activation",
      recipientCharacterId: "freeze-cursor",
      startedAt: now,
      expiresAt: new Date(now.getTime() + 13 * 60_000),
      availableAt: new Date(now.getTime() + 93 * 60_000)
    });
    await prisma.characterCooldown.create({
      data: {
        characterId: "freeze-cursor",
        key: "class.varenyk-mancer.sated-support.recipient",
        availableAt: new Date(payload.availableAt),
        resultJson: payload
      }
    });
    const combatStartedAt = new Date(now.getTime() + 2 * 60_000 + 30_000);
    const frozen = await prisma.$transaction((tx) => freezeVarenykSatedFromCooldown({
      tx,
      characterId: "freeze-cursor",
      remortCount: 0,
      resources: { hp: 1, hpMax: 30, mana: 1, manaMax: 30 },
      now: combatStartedAt
    }));

    expect(frozen.resources).toMatchObject({ hp: 3, mana: 3 });
    expect(frozen.sated).toMatchObject({
      leaseStartedAt: combatStartedAt.toISOString(),
      outsideRemainderMs: 30_000
    });
    const leaseEndedAt = new Date(now.getTime() + 5 * 60_000);
    await prisma.$transaction((tx) => advanceVarenykSatedCursorThroughCombat({
      tx,
      characterId: "freeze-cursor",
      activationId: "freeze-activation",
      now: leaseEndedAt,
      outsideRemainderMs: frozen.sated?.outsideRemainderMs
    }));
    const row = await prisma.characterCooldown.findUnique({
      where: {
        characterId_key: {
          characterId: "freeze-cursor",
          key: "class.varenyk-mancer.sated-support.recipient"
        }
      }
    });
    expect((row?.resultJson as { cursorAt?: string } | null)?.cursorAt)
      .toBe(new Date(leaseEndedAt.getTime() - 30_000).toISOString());
  });

  it("returns bounded target-page metadata for class noncombat target lists", async () => {
    await seedCharacter({ telegramUserId: 801n, userId: "user-priest", characterId: "priest", classId: "class.priest", level: 3 });
    for (let index = 0; index < 6; index += 1) {
      await seedCharacter({
        telegramUserId: BigInt(802 + index),
        userId: `user-target-${index}`,
        characterId: `target-${index}`,
        level: 3
      });
    }

    const snapshot = await repository.getSnapshotForTelegramUser(801n, {
      ...snapshotInput(),
      page: 9,
      pageSize: 5
    });

    expect(snapshot).toMatchObject({
      targetPage: 1,
      targetTotalPages: 2
    });
    expect(snapshot?.targets).toHaveLength(1);
  });

  it("blocks only Varenyk feeding for current adventure and preserves Priest/Rogue gates", async () => {
    await seedCharacter({
      telegramUserId: 811n,
      userId: "user-priest",
      characterId: "priest",
      classId: "class.varenyk-mancer",
      level: 3,
      currentAdventureId: "adventure.mimic-shawarma"
    });

    const varenykSnapshot = await repository.getSnapshotForTelegramUser(811n, {
      ...snapshotInput(),
      mode: "varenyk"
    });
    const priestSnapshot = await repository.getSnapshotForTelegramUser(811n, snapshotInput());
    const rogueSnapshot = await repository.getSnapshotForTelegramUser(811n, {
      ...snapshotInput(),
      mode: "rogue"
    });

    expect(varenykSnapshot).toMatchObject({ actorBlocked: true });
    expect(priestSnapshot).toMatchObject({ actorBlocked: false });
    expect(rogueSnapshot).toMatchObject({ actorBlocked: false });
  });

  it("marks same-day Rogue attempted targets in target snapshots", async () => {
    await seedCharacter({ telegramUserId: 901n, userId: "user-rogue", characterId: "rogue", classId: "class.rogue", level: 5, gold: 1 });
    await seedCharacter({ telegramUserId: 902n, userId: "user-target", characterId: "target", level: 5, gold: 8 });
    await seedCharacter({ telegramUserId: 903n, userId: "user-bystander", characterId: "bystander", level: 5, gold: 8 });

    await repository.completeRoguePickpocket(901n, rogueInput({
      targetTelegramUserId: 902n,
      outcome: "clean-success",
      stolenGold: 1
    }));

    const filtered = await repository.getSnapshotForTelegramUser(901n, {
      ...snapshotInput(),
      mode: "rogue",
      rogueAttemptedLocalDate: "2026-07-03"
    });
    const unfiltered = await repository.getSnapshotForTelegramUser(901n, {
      ...snapshotInput(),
      mode: "rogue"
    });

    expect(filtered?.targets.map((target) => ({
      telegramUserId: target.telegramUserId,
      rogueAttemptedToday: target.rogueAttemptedToday
    })).sort((a, b) => Number(a.telegramUserId - b.telegramUserId))).toEqual([
      { telegramUserId: 902n, rogueAttemptedToday: true },
      { telegramUserId: 903n, rogueAttemptedToday: false }
    ]);
    expect(unfiltered?.targets.map((target) => target.telegramUserId).sort()).toEqual([902n, 903n]);
  });

  it("stores active Priest blessing for hero display and spends mana", async () => {
    await seedCharacter({
      telegramUserId: 701n,
      userId: "user-priest",
      characterId: "priest",
      classId: "class.priest",
      level: 3,
      manaCurrent: 20,
      manaRegenAt: new Date("2026-07-03T08:00:00.000Z")
    });

    const result = await repository.completePriestBlessing(701n, priestBlessInput({
      targetTelegramUserId: null,
      expiresAt: new Date("2026-07-03T09:13:00.000Z")
    }));
    const active = await repository.getActivePriestBlessingForTelegramUser(701n, now);

    expect(result).toMatchObject({
      state: "completed",
      actor: { manaCurrent: 12 },
      target: { manaCurrent: 12 },
      blessing: {
        actorName: "priest",
        targetName: "priest",
        expiresAt: new Date("2026-07-03T09:13:00.000Z"),
        bonusStat: "luck",
        bonusAmount: 1
      }
    });
    expect(active).toMatchObject({
      actorName: "priest",
      targetName: "priest",
      expiresAt: new Date("2026-07-03T09:13:00.000Z"),
      bonusStat: "luck",
      bonusAmount: 1
    });
    await expect(prisma.character.findUnique({ where: { id: "priest" } })).resolves.toMatchObject({
      manaCurrent: 12,
      manaRegenAt: now
    });
    await expect(prisma.characterCooldown.findMany({
      where: { characterId: "priest" },
      select: { key: true }
    })).resolves.toEqual([]);
  });

  it("blocks only the same Priest blessing target until the pair wait ends", async () => {
    await seedCharacter({
      telegramUserId: 721n,
      userId: "user-priest",
      characterId: "priest",
      classId: "class.priest",
      level: 3,
      manaCurrent: 20
    });
    await seedCharacter({ telegramUserId: 722n, userId: "user-target", characterId: "target", level: 3 });
    await seedCharacter({ telegramUserId: 723n, userId: "user-other", characterId: "other", level: 3 });

    const first = await repository.completePriestBlessing(721n, priestBlessInput({
      targetTelegramUserId: 722n,
      expiresAt: new Date("2026-07-03T09:13:00.000Z")
    }));
    await prisma.noncombatPriestBlessing.updateMany({
      where: { targetCharacterId: "target" },
      data: { status: "expired", activeGuard: null, endedAt: new Date("2026-07-03T09:14:00.000Z") }
    });
    const sameTarget = await repository.completePriestBlessing(721n, priestBlessInput({
      targetTelegramUserId: 722n,
      expiresAt: new Date("2026-07-03T09:13:00.000Z")
    }));
    const otherTarget = await repository.completePriestBlessing(721n, priestBlessInput({
      targetTelegramUserId: 723n,
      expiresAt: new Date("2026-07-03T09:13:00.000Z")
    }));

    expect(first).toMatchObject({ state: "completed" });
    expect(sameTarget).toMatchObject({
      state: "blocked",
      reason: "target-cooldown",
      availableAt: cooldownAvailableAt
    });
    expect(otherTarget).toMatchObject({ state: "completed" });
    await expect(prisma.characterCooldown.findMany({
      where: { characterId: "priest" },
      select: { key: true }
    })).resolves.toEqual([]);
  });

  it("heals Priest targets up to the effective HP max instead of the stored base max", async () => {
    await seedCharacter({
      telegramUserId: 711n,
      userId: "user-priest",
      characterId: "priest",
      classId: "class.priest",
      level: 4,
      hpCurrent: 16,
      manaCurrent: 20,
      manaRegenAt: new Date("2026-07-03T08:00:00.000Z")
    });

    const result = await repository.completePriestHeal(711n, priestHealInput({
      targetTelegramUserId: null,
      healAmount: 10,
      targetEffectiveHpMax: 32,
      manaCost: 10
    }));

    expect(result).toMatchObject({
      state: "completed",
      action: {
        healAmount: 10,
        manaCost: 10
      },
      actor: {
        hpCurrent: 26,
        manaCurrent: 10
      },
      target: {
        hpCurrent: 26
      }
    });
    await expect(prisma.character.findUnique({ where: { id: "priest" } })).resolves.toMatchObject({
      hpCurrent: 26,
      hpMax: 20,
      manaCurrent: 10,
      manaRegenAt: now
    });
    await expect(prisma.characterCooldown.findMany({
      where: { characterId: "priest" },
      select: { key: true }
    })).resolves.toEqual([]);
  });

  it("replays Rogue same-day duplicate even after live location gates drift", async () => {
    await seedCharacter({ telegramUserId: 501n, userId: "user-rogue", characterId: "rogue", classId: "class.rogue", level: 5, gold: 1 });
    await seedCharacter({ telegramUserId: 502n, userId: "user-target", characterId: "target", level: 5, gold: 8 });

    const first = await repository.completeRoguePickpocket(501n, rogueInput({
      targetTelegramUserId: 502n,
      outcome: "clean-success",
      stolenGold: 5
    }));
    await prisma.user.update({
      where: { telegramUserId: 502n },
      data: { lastSeenLocationId: "location.korchma.hall" }
    });
    const replay = await repository.completeRoguePickpocket(501n, rogueInput({
      targetTelegramUserId: 502n,
      outcome: "caught-badly",
      stolenGold: 13
    }));

    expect(first).toMatchObject({ state: "completed", created: true });
    expect(replay).toMatchObject({
      state: "completed",
      created: false,
      attempt: { outcome: "clean-success", stolenGold: 5 }
    });
    await expect(prisma.character.findUnique({ where: { id: "rogue" } })).resolves.toMatchObject({
      gold: 6,
      hpCurrent: 20
    });
    await expect(prisma.character.findUnique({ where: { id: "target" } })).resolves.toMatchObject({
      gold: 3
    });
    await expect(prisma.noncombatRoguePickpocketAttempt.count()).resolves.toBe(1);
  });

  it("caps theft by target balance without creating gold", async () => {
    await seedCharacter({ telegramUserId: 601n, userId: "user-rogue", characterId: "rogue", classId: "class.rogue", level: 5, gold: 1 });
    await seedCharacter({ telegramUserId: 602n, userId: "user-target", characterId: "target", level: 5, gold: 3 });

    const result = await repository.completeRoguePickpocket(601n, rogueInput({
      targetTelegramUserId: 602n,
      outcome: "clean-success",
      stolenGold: 13
    }));

    expect(result).toMatchObject({
      state: "completed",
      attempt: { outcome: "clean-success", stolenGold: 3 }
    });
    await expect(prisma.character.findUnique({ where: { id: "rogue" } })).resolves.toMatchObject({ gold: 4 });
    await expect(prisma.character.findUnique({ where: { id: "target" } })).resolves.toMatchObject({ gold: 0 });
  });

  it("caps theft by target balance and stores empty outcome when no gold is available", async () => {
    await seedCharacter({ telegramUserId: 201n, userId: "user-rogue", characterId: "rogue", classId: "class.rogue", level: 5, gold: 1 });
    await seedCharacter({ telegramUserId: 202n, userId: "user-target", characterId: "target", level: 5, gold: 0 });

    const result = await repository.completeRoguePickpocket(201n, rogueInput({
      targetTelegramUserId: 202n,
      outcome: "clean-success",
      stolenGold: 13
    }));

    expect(result).toMatchObject({
      state: "completed",
      attempt: { outcome: "empty", stolenGold: 0 }
    });
    await expect(prisma.character.findUnique({ where: { id: "rogue" } })).resolves.toMatchObject({ gold: 1 });
    await expect(prisma.character.findUnique({ where: { id: "target" } })).resolves.toMatchObject({ gold: 0 });
  });

  it("caught badly sets Rogue HP to 0 and only records the normal pickpocket cooldown", async () => {
    await seedCharacter({ telegramUserId: 301n, userId: "user-rogue", characterId: "rogue", classId: "class.rogue", level: 5, gold: 1 });
    await seedCharacter({ telegramUserId: 302n, userId: "user-target", characterId: "target", level: 5, gold: 8 });

    const result = await repository.completeRoguePickpocket(301n, rogueInput({
      targetTelegramUserId: 302n,
      outcome: "caught-badly",
      stolenGold: 0
    }));

    expect(result).toMatchObject({
      state: "completed",
      attempt: { outcome: "caught-badly", actorHpAfter: 0 }
    });
    await expect(prisma.character.findUnique({ where: { id: "rogue" } })).resolves.toMatchObject({
      hpCurrent: 0
    });
    await expect(prisma.characterCooldown.findMany({
      where: { characterId: "rogue" },
      select: { key: true, availableAt: true }
    })).resolves.toEqual([
      { key: "noncombat.rogue.pickpocket", availableAt: cooldownAvailableAt }
    ]);
  });
});

function priestBlessInput(overrides: {
  targetTelegramUserId?: bigint | null;
  expiresAt: Date;
}) {
  return {
    targetTelegramUserId: overrides.targetTelegramUserId ?? null,
    expectedActorRemortCount: 0,
    expectedTargetRemortCount: 0,
    activeSince: new Date("2026-07-03T08:55:00.000Z"),
    now,
    expiresAt: overrides.expiresAt,
    cooldownAvailableAt,
    manaCost: 8,
    bonusAmount: 1,
    statSnapshot: { test: true }
  };
}

function priestHealInput(overrides: {
  targetTelegramUserId?: bigint | null;
  healAmount: number;
  targetEffectiveHpMax: number;
  manaCost: number;
}) {
  return {
    targetTelegramUserId: overrides.targetTelegramUserId ?? null,
    expectedActorRemortCount: 0,
    expectedTargetRemortCount: 0,
    activeSince: new Date("2026-07-03T08:55:00.000Z"),
    now,
    healAmount: overrides.healAmount,
    targetEffectiveHpMax: overrides.targetEffectiveHpMax,
    manaCost: overrides.manaCost,
    statSnapshot: { test: true }
  };
}

function rogueInput(overrides: {
  targetTelegramUserId?: bigint;
  localDate?: string;
  outcome: "clean-success" | "noticed-success" | "empty" | "noticed-failure" | "caught-badly";
  stolenGold: number;
  retaliationToken?: string | null;
  retaliationAvailableUntil?: Date | null;
}) {
  const retaliationEligible = overrides.outcome === "noticed-success" && overrides.stolenGold > 0;
  return {
    targetTelegramUserId: overrides.targetTelegramUserId ?? 102n,
    expectedActorRemortCount: 0,
    expectedTargetRemortCount: 0,
    activeSince: new Date("2026-07-03T08:55:00.000Z"),
    now,
    localDate: overrides.localDate ?? "2026-07-03",
    cooldownAvailableAt,
    outcome: overrides.outcome,
    stolenGold: overrides.stolenGold,
    retaliationToken: overrides.retaliationToken ?? (retaliationEligible ? "retaliation-token" : null),
    retaliationAvailableUntil: overrides.retaliationAvailableUntil ?? (retaliationEligible
      ? new Date("2026-07-03T09:13:00.000Z")
      : null),
    statSnapshot: { test: true }
  };
}

async function seedRawRogueAttempt(input: {
  actorCharacterId: string;
  targetCharacterId: string;
  actorTelegramUserId: bigint;
  targetTelegramUserId: bigint;
  token: string;
  outcome: "clean-success" | "noticed-success" | "empty" | "noticed-failure" | "caught-badly";
  stolenGold: number;
  retaliationAvailableUntil?: Date;
}): Promise<void> {
  await prismaGlobal().noncombatRoguePickpocketAttempt.create({
    data: {
      actorCharacterId: input.actorCharacterId,
      targetCharacterId: input.targetCharacterId,
      actorTelegramUserId: input.actorTelegramUserId,
      targetTelegramUserId: input.targetTelegramUserId,
      actorName: input.actorCharacterId,
      targetName: input.targetCharacterId,
      actorRemortCount: 0,
      targetRemortCount: 0,
      techniqueId: "technique.class.rogue.pickpocket",
      rulesVersion: "class-noncombat-priest-rogue-v1",
      locationId: "location.korchma.front",
      localDate: `2026-07-${input.token}`,
      status: "completed",
      outcome: input.outcome,
      stolenGold: input.stolenGold,
      actorHpAfter: null,
      retaliationToken: input.token,
      retaliationAvailableUntil: input.retaliationAvailableUntil ?? new Date("2026-07-03T09:13:00.000Z"),
      statSnapshotJson: { test: true },
      resultJson: { test: true },
      cooldownAvailableAt,
      completedAt: now
    }
  });
}

function snapshotInput() {
  return {
    mode: "priest" as const,
    activeSince: new Date("2026-07-03T08:55:00.000Z"),
    page: 0,
    pageSize: 10,
    now
  };
}

function satedPayload(input: {
  activationId: string;
  recipientCharacterId: string;
  startedAt: Date;
  expiresAt: Date;
  availableAt: Date;
}): VarenykSatedPayloadV1 {
  return {
    kind: "varenyk-sated-support-v1",
    version: 1,
    activationId: input.activationId,
    actorCharacterId: input.recipientCharacterId,
    actorRemortCount: 0,
    recipientCharacterId: input.recipientCharacterId,
    recipientRemortCount: 0,
    rank: 1,
    manaCost: 8,
    effectiveStats: { intelligence: 8, charisma: 8, level: 3, equipmentItemIds: [] },
    startedAt: input.startedAt.toISOString(),
    expiresAt: input.expiresAt.toISOString(),
    availableAt: input.availableAt.toISOString(),
    cursorAt: input.startedAt.toISOString(),
    receipt: {
      version: 1,
      previewToken: "freeze-preview",
      actorTelegramUserId: "406",
      targetTelegramUserId: "406",
      actorName: "freeze-cursor",
      targetName: "freeze-cursor",
      immediateHpRestored: 3,
      immediateManaRestored: 1,
      actorManaAfter: 1,
      targetHpAfter: 1,
      targetManaAfter: 1
    }
  };
}

async function seedCharacter(input: {
  telegramUserId: bigint;
  userId: string;
  characterId: string;
  classId?: string;
  level?: number;
  gold?: number;
  locationId?: string;
  currentAdventureId?: string | null;
  hpCurrent?: number;
  hpMax?: number;
  hpRegenAt?: Date | null;
  manaCurrent?: number;
  manaMax?: number;
  manaRegenAt?: Date | null;
  statsJson?: { dexterity: number; luck: number; charisma: number; intelligence: number };
}): Promise<void> {
  await prismaGlobal().user.create({
    data: {
      id: input.userId,
      telegramUserId: input.telegramUserId,
      displayName: input.characterId,
      lastActionAt: now,
      lastSeenLocationId: input.locationId ?? "location.korchma.front",
      currentRaidId: null,
      currentAdventureId: input.currentAdventureId ?? null
    }
  });
  await prismaGlobal().character.create({
    data: {
      id: input.characterId,
      userId: input.userId,
      name: input.characterId,
      pronoun: "they",
      path: "boundary",
      raceId: "race.human-ish",
      classId: input.classId ?? "class.warrior",
      level: input.level ?? 3,
      xp: 25,
      gold: input.gold ?? 0,
      hpCurrent: input.hpCurrent ?? 20,
      hpMax: input.hpMax ?? 20,
      hpRegenAt: input.hpRegenAt,
      manaCurrent: input.manaCurrent ?? 20,
      manaMax: input.manaMax ?? 20,
      manaRegenAt: input.manaRegenAt,
      statsJson: input.statsJson ?? { dexterity: 10, luck: 8, charisma: 8, intelligence: 8 }
    }
  });
}

let prismaForSeeds: PrismaClient | null = null;

function prismaGlobal(): PrismaClient {
  if (!prismaForSeeds) {
    throw new Error("Prisma test client is not ready.");
  }
  return prismaForSeeds;
}

async function createMinimalSchema(prisma: PrismaClient): Promise<void> {
  prismaForSeeds = prisma;
  const statements = [
    `CREATE TABLE users (
      id TEXT PRIMARY KEY NOT NULL,
      telegram_user_id BIGINT NOT NULL UNIQUE,
      username TEXT,
      display_name TEXT,
      language_code TEXT,
      last_action_at DATETIME,
      last_seen_location_id TEXT,
      current_raid_id TEXT,
      current_adventure_id TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE characters (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      pronoun TEXT NOT NULL DEFAULT 'they',
      path TEXT NOT NULL DEFAULT 'boundary',
      race_id TEXT NOT NULL,
      class_id TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 1,
      xp INTEGER NOT NULL DEFAULT 0,
      gold INTEGER NOT NULL DEFAULT 0,
      hp_current INTEGER NOT NULL DEFAULT 25,
      hp_max INTEGER NOT NULL DEFAULT 25,
      mana_current INTEGER NOT NULL DEFAULT 10,
      mana_max INTEGER NOT NULL DEFAULT 10,
      hp_regen_at DATETIME,
      mana_regen_at DATETIME,
      active_cosmetic_title_grant_id TEXT,
      stats_json JSONB NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE active_combat_leases (
      id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
      character_id TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL,
      reference_id TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE character_equipment (
      id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
      character_id TEXT NOT NULL,
      slot TEXT NOT NULL,
      item_id TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX character_equipment_character_id_slot_key ON character_equipment(character_id, slot)`,
    `CREATE TABLE daily_actions (
      id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
      character_id TEXT NOT NULL,
      key TEXT NOT NULL,
      local_date TEXT NOT NULL,
      reward_xp INTEGER NOT NULL,
      reward_gold INTEGER NOT NULL,
      spent_gold INTEGER NOT NULL DEFAULT 0,
      result_json JSONB,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX daily_actions_character_id_key_local_date_key ON daily_actions(character_id, key, local_date)`,
    `CREATE TABLE character_drink_states (
      id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
      activation_id TEXT NOT NULL,
      character_id TEXT NOT NULL UNIQUE,
      remort_count INTEGER NOT NULL DEFAULT 0,
      drink_key TEXT NOT NULL,
      phase TEXT NOT NULL,
      started_at DATETIME NOT NULL,
      expires_at DATETIME NOT NULL,
      source_type TEXT NOT NULL,
      source_id TEXT,
      metadata_json JSONB,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE character_remorts (
      id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
      character_id TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      remort_number INTEGER NOT NULL,
      previous_level INTEGER NOT NULL,
      previous_xp INTEGER NOT NULL,
      previous_gold INTEGER NOT NULL,
      display_name_snapshot TEXT NOT NULL,
      preserved_payload_json JSONB NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE character_cooldowns (
      id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
      character_id TEXT NOT NULL,
      key TEXT NOT NULL,
      available_at DATETIME NOT NULL,
      result_json JSONB,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE noncombat_priest_aid_actions (
      id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
      actor_character_id TEXT NOT NULL,
      target_character_id TEXT NOT NULL,
      actor_telegram_user_id BIGINT NOT NULL,
      target_telegram_user_id BIGINT NOT NULL,
      actor_name TEXT NOT NULL,
      target_name TEXT NOT NULL,
      actor_remort_count INTEGER NOT NULL DEFAULT 0,
      target_remort_count INTEGER NOT NULL DEFAULT 0,
      action_kind TEXT NOT NULL,
      technique_id TEXT NOT NULL,
      rules_version TEXT NOT NULL,
      location_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'completed',
      heal_amount INTEGER NOT NULL DEFAULT 0,
      mana_cost INTEGER NOT NULL DEFAULT 0,
      blessing_id TEXT,
      result_json JSONB,
      cooldown_available_at DATETIME NOT NULL,
      completed_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE noncombat_priest_blessings (
      id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
      actor_character_id TEXT NOT NULL,
      target_character_id TEXT NOT NULL,
      actor_telegram_user_id BIGINT NOT NULL,
      target_telegram_user_id BIGINT NOT NULL,
      actor_name TEXT NOT NULL,
      target_name TEXT NOT NULL,
      actor_remort_count INTEGER NOT NULL DEFAULT 0,
      target_remort_count INTEGER NOT NULL DEFAULT 0,
      technique_id TEXT NOT NULL,
      rules_version TEXT NOT NULL,
      location_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      active_guard TEXT,
      bonus_stat TEXT,
      bonus_amount INTEGER NOT NULL DEFAULT 0,
      result_json JSONB,
      started_at DATETIME NOT NULL,
      expires_at DATETIME NOT NULL,
      ended_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE noncombat_rogue_pickpocket_attempts (
      id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
      actor_character_id TEXT NOT NULL,
      target_character_id TEXT NOT NULL,
      actor_telegram_user_id BIGINT NOT NULL,
      target_telegram_user_id BIGINT NOT NULL,
      actor_name TEXT NOT NULL,
      target_name TEXT NOT NULL,
      actor_remort_count INTEGER NOT NULL DEFAULT 0,
      target_remort_count INTEGER NOT NULL DEFAULT 0,
      technique_id TEXT NOT NULL,
      rules_version TEXT NOT NULL,
      location_id TEXT NOT NULL,
      local_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'completed',
      outcome TEXT NOT NULL,
      stolen_gold INTEGER NOT NULL DEFAULT 0,
      actor_hp_after INTEGER,
      retaliation_token TEXT,
      retaliation_available_until DATETIME,
      retaliation_used_at DATETIME,
      retaliation_duel_invite_token TEXT,
      stat_snapshot_json JSONB NOT NULL,
      result_json JSONB,
      cooldown_available_at DATETIME NOT NULL,
      completed_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX character_cooldowns_character_id_key_key ON character_cooldowns(character_id, key)`,
    `CREATE UNIQUE INDEX noncombat_priest_blessings_active_guard_key ON noncombat_priest_blessings(active_guard)`,
    `CREATE UNIQUE INDEX noncombat_rogue_pickpocket_attempts_actor_character_id_target_character_id_local_date_key
      ON noncombat_rogue_pickpocket_attempts(actor_character_id, target_character_id, local_date)`,
    `CREATE UNIQUE INDEX noncombat_rogue_pickpocket_attempts_retaliation_token_key
      ON noncombat_rogue_pickpocket_attempts(retaliation_token)`
  ];

  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }
}
