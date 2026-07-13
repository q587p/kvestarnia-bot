import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findMantokAbilityGrantByKey } from "../../src/content";
import { PrismaPartyBossRepository } from "../../src/db/repositories/prismaPartyBossRepository";
import { PrismaPartySessionRepository } from "../../src/db/repositories/prismaPartySessionRepository";
import type {
  PartyBossActionResult,
  PartyBossSessionRecord
} from "../../src/db/repositories/partyBossRepository";
import { BIG_BARREL_BROTHER_LOSS_RETRY_COOLDOWN_KEY } from "../../src/domain/partyBoss/partyBoss";
import { HpRecoveryNotificationProducer } from "../../src/db/repositories/hpRecoveryNotificationProducer";
import { getLevelStartXp } from "../../src/domain/progression/level";

function expectPartyBossSession(result: PartyBossActionResult): PartyBossSessionRecord {
  if (!("session" in result)) {
    throw new Error(`Expected party boss session result, got ${result.state}`);
  }

  return result.session;
}

describe("PrismaPartyBossRepository integration", () => {
  let dir: string;
  let prisma: PrismaClient;
  let partyRepository: PrismaPartySessionRepository;
  let bossRepository: PrismaPartyBossRepository;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "kvestarnia-party-boss-repo-"));
    const databaseUrl = `file:${join(dir, "test.db").replace(/\\/g, "/")}`;
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl
        }
      }
    });
    await createMinimalSchema(prisma);
    partyRepository = new PrismaPartySessionRepository(prisma);
    bossRepository = new PrismaPartyBossRepository(prisma, new HpRecoveryNotificationProducer(true));
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await rm(dir, { recursive: true, force: true });
  });

  it("starts from recruiting party, replaces queued actions, and timeout-resolves past the old cap without terminalizing by turn count", async () => {
    await seedCharacter(prisma, "leader-user", 1001n, "Лідерка", { hp: 300 });
    await seedCharacter(prisma, "joiner-user", 1002n, "Помічник", { hp: 300 });
    await partyRepository.createForTelegramUser(1001n, partyInput("party-token-a"));
    await partyRepository.joinByTokenForTelegramUser(1002n, "party-token-a", joinInput());

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(1001n, {
      partyInviteToken: "party-token-a",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });

    expect(started.state).toBe("started");
    expect(await prisma.activeCombatLease.count({ where: { kind: "party-boss" } })).toBe(2);

    const first = await bossRepository.submitActionForTelegramUser(1001n, "party-token-a", 1, "attack", resolveInput());
    const updated = await bossRepository.submitActionForTelegramUser(1001n, "party-token-a", 1, "defend", resolveInput());

    expect(first.state).toBe("queued");
    expect(updated.state).toBe("updated");
    expect(expectPartyBossSession(updated).queuedActions).toContainEqual({
      characterId: "leader-user-character",
      turn: 1,
      action: "defend"
    });
    expect(await prisma.partyBossAction.count()).toBe(1);
    await expect(prisma.partyBossAction.findFirstOrThrow({
      where: {
        sessionId: expectPartyBossSession(updated).id,
        actorCharacterId: "leader-user-character",
        turn: 1
      },
      select: { actionKey: true }
    })).resolves.toEqual({ actionKey: "defend" });

    let latest = expectPartyBossSession(updated);
    for (let turn = latest.turn; turn <= 6; turn += 1) {
      const resolved = await bossRepository.resolveTimedOutByToken("party-token-a", {
        now: new Date(`2026-06-30T10:0${turn}:00.000Z`),
        nextTurnExpiresAt: new Date(`2026-06-30T10:0${turn}:23.000Z`)
      }, "due");
      expect(resolved.state).toBe("resolved");
      latest = expectPartyBossSession(resolved);
    }

    expect(latest.status).toBe("active");
    expect(latest.turn).toBe(7);
    expect(latest.state.boss.hp).toBeGreaterThan(0);
    expect(latest.state.participants.some((participant) => participant.resources.hp > 0)).toBe(true);
    expect(await prisma.activeCombatLease.count({ where: { kind: "party-boss" } })).toBe(2);
    expect(await prisma.partyParticipant.count({
      where: {
        activeMembershipKey: {
          not: null
        }
      }
    })).toBe(2);
  });

  it("commits only the latest eligible Big Barrel Warrior Taunt and rejects stale or ineligible replays", async () => {
    await seedCharacter(prisma, "taunt-warrior-user", 1051n, "Воїн Виклику", {
      hp: 500,
      level: 8,
      classId: "class.warrior",
      strength: 30
    });
    await seedCharacter(prisma, "taunt-mage-user", 1052n, "Маг Свідок", {
      hp: 500,
      level: 8,
      classId: "class.mage"
    });
    await partyRepository.createForTelegramUser(1051n, {
      ...partyInput("party-token-warrior-taunt"),
      originLocationId: "barrel.big-brother"
    });
    await partyRepository.joinByTokenForTelegramUser(1052n, "party-token-warrior-taunt", joinInput());

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(1051n, {
      partyInviteToken: "party-token-warrior-taunt",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    expect(started.state).toBe("started");

    const queued = await bossRepository.submitActionForTelegramUser(
      1051n,
      "party-token-warrior-taunt",
      1,
      "taunt",
      resolveInput()
    );
    const duplicate = await bossRepository.submitActionForTelegramUser(
      1051n,
      "party-token-warrior-taunt",
      1,
      "taunt",
      resolveInput()
    );
    const overwritten = await bossRepository.submitActionForTelegramUser(
      1051n,
      "party-token-warrior-taunt",
      1,
      "attack",
      resolveInput()
    );
    const firstResolved = await bossRepository.submitActionForTelegramUser(
      1052n,
      "party-token-warrior-taunt",
      1,
      "defend",
      resolveInput()
    );

    expect(queued.state).toBe("queued");
    expect(duplicate.state).toBe("duplicate");
    expect(overwritten.state).toBe("updated");
    expect(firstResolved.state).toBe("resolved");
    expect(expectPartyBossSession(firstResolved).state.roundLog[0]?.warriorTaunt).toBeUndefined();
    expect(expectPartyBossSession(firstResolved).state.warriorTaunt).toBeUndefined();
    expect(firstResolved.achievementEvents).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "warrior.raid-taunt.activated" })
    ]));

    await bossRepository.submitActionForTelegramUser(
      1051n,
      "party-token-warrior-taunt",
      2,
      "taunt",
      resolveInput()
    );
    const activated = await bossRepository.submitActionForTelegramUser(
      1052n,
      "party-token-warrior-taunt",
      2,
      "defend",
      resolveInput()
    );
    const activeSession = expectPartyBossSession(activated);

    expect(activated.state).toBe("resolved");
    expect(activeSession.state.roundLog[1]?.warriorTaunt).toMatchObject({
      activatedCharacterId: "taunt-warrior-user-character",
      redirectedCharacterId: "taunt-warrior-user-character",
      bossAttacksRemaining: 2
    });
    expect(activeSession.state.warriorTaunt?.cooldowns).toEqual({
      "taunt-warrior-user-character": { availableTurn: 7 }
    });
    expect(activated.achievementEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "warrior.raid-taunt.activated",
        characterId: "taunt-warrior-user-character"
      })
    ]));

    const stale = await bossRepository.submitActionForTelegramUser(
      1051n,
      "party-token-warrior-taunt",
      2,
      "taunt",
      resolveInput()
    );
    const mage = await bossRepository.submitActionForTelegramUser(
      1052n,
      "party-token-warrior-taunt",
      activeSession.turn,
      "taunt",
      resolveInput()
    );
    expect(stale.state).toBe("stale");
    expect(stale.achievementEvents).toBeUndefined();
    expect(mage).toMatchObject({ state: "taunt-unavailable", reason: "not-warrior" });

    await seedCharacter(prisma, "proof-taunt-warrior-user", 1053n, "Воїн Проби", {
      hp: 200,
      classId: "class.warrior"
    });
    await partyRepository.createForTelegramUser(1053n, partyInput("party-token-proof-warrior-taunt"));
    const proofStarted = await bossRepository.startFromRecruitingPartyForTelegramUser(1053n, {
      partyInviteToken: "party-token-proof-warrior-taunt",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    expect(proofStarted.state).toBe("started");
    await expect(bossRepository.submitActionForTelegramUser(
      1053n,
      "party-token-proof-warrior-taunt",
      1,
      "taunt",
      resolveInput()
    )).resolves.toMatchObject({ state: "taunt-unavailable", reason: "not-big-barrel" });
  });

  it("freezes participant resources from effective level and equipment max at boss start", async () => {
    await seedCharacter(prisma, "effective-resources-user", 1101n, "Екіпірована", {
      hpCurrent: 13,
      hpMax: 20,
      manaCurrent: 25,
      manaMax: 10,
      level: 8,
      strength: 16,
      dexterity: 11,
      equipment: [
        { slot: "chest", itemId: "item.apron-of-foam-resistance" },
        { slot: "accessory", itemId: "item.hourglass-with-deadline-teeth" }
      ]
    });
    await partyRepository.createForTelegramUser(1101n, partyInput("party-token-effective-resources"));

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(1101n, {
      partyInviteToken: "party-token-effective-resources",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });

    expect(started.state).toBe("started");
    if (!("session" in started)) {
      throw new Error(`Expected started session, got ${started.state}`);
    }

    const participant = started.session.state.participants.find(
      (entry) => entry.characterId === "effective-resources-user-character"
    );

    expect(participant?.resources).toMatchObject({
      hp: 13,
      hpMax: 50,
      mana: 25,
      manaMax: 26
    });
  });

  it("consumes a bandage party-boss item action, heals frozen raid HP, and stores victory rewards", async () => {
    await seedCharacter(prisma, "big-bandage-user", 1151n, "Бинтова Лідерка", {
      hpCurrent: 10,
      hpMax: 40,
      level: 8,
      strength: 20,
      dexterity: 20
    });
    await prisma.characterItem.create({
      data: {
        characterId: "big-bandage-user-character",
        itemId: "item.responsible-panic-bandage",
        quantity: 1
      }
    });
    await partyRepository.createForTelegramUser(1151n, {
      ...partyInput("party-token-big-bandage"),
      periodId: "2026-06-30T10:42",
      originLocationId: "barrel.big-brother"
    });

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(1151n, {
      partyInviteToken: "party-token-big-bandage",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    expect(started.state).toBe("started");
    if (!("session" in started)) {
      throw new Error(`Expected started session, got ${started.state}`);
    }
    await forceBossToOneHp(prisma, started.session.id, started.session.state);
    const result = await bossRepository.submitItemForTelegramUser(
      1151n,
      "party-token-big-bandage",
      1,
      {
        id: "item.responsible-panic-bandage",
        name: "Бинт відповідальної паніки",
        effect: {
          kind: "heal-hp",
          amount: 7
        }
      },
      resolveInput()
    );
    const latest = expectPartyBossSession(result);
    const participant = latest.state.participants.find(
      (entry) => entry.characterId === "big-bandage-user-character"
    );

    expect(result.state).toBe("resolved");
    expect(latest.status).toBe("won");
    expect(latest.state.roundLog.at(-1)?.actions[0]).toMatchObject({
      action: "item",
      outcome: "item-used",
      itemName: "Бинт відповідальної паніки",
      healing: 7
    });
    expect(participant?.resources.hp).toBe(17);
    expect(await prisma.characterItem.count({
      where: {
        characterId: "big-bandage-user-character",
        itemId: "item.responsible-panic-bandage"
      }
    })).toBe(0);
    await expect(prisma.character.findUniqueOrThrow({
      where: { id: "big-bandage-user-character" },
      select: { hpCurrent: true }
    })).resolves.toEqual({ hpCurrent: 17 });
    const reward = latest.result?.participants[0]?.reward;
    expect(reward?.xp).toBeGreaterThan(0);
    expect(reward?.gold).toBeGreaterThan(0);
    expect(reward?.itemGrants[0]?.name).toBeTruthy();
    expect(reward?.itemGrants[0]?.quantity).toBeGreaterThan(0);
  });

  it("consumes a Big Barrel field kit action and emits item and raid achievement events", async () => {
    await seedCharacter(prisma, "big-field-kit-user", 1152n, "Аптечна Лідерка", {
      hpCurrent: 10,
      hpMax: 100,
      level: 8,
      strength: 20,
      dexterity: 20
    });
    await prisma.characterItem.create({
      data: {
        characterId: "big-field-kit-user-character",
        itemId: "item.field-kit",
        quantity: 1
      }
    });
    await partyRepository.createForTelegramUser(1152n, {
      ...partyInput("party-token-big-field-kit"),
      periodId: "2026-06-30T10:43",
      originLocationId: "barrel.big-brother"
    });

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(1152n, {
      partyInviteToken: "party-token-big-field-kit",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    expect(started.state).toBe("started");
    if (!("session" in started)) {
      throw new Error(`Expected started session, got ${started.state}`);
    }
    const startedParticipant = started.session.state.participants.find(
      (entry) => entry.characterId === "big-field-kit-user-character"
    );
    const expectedHpAfter = Math.ceil((startedParticipant?.resources.hpMax ?? 1) * 0.93);
    const expectedHealing = expectedHpAfter - (startedParticipant?.resources.hp ?? 0);

    await forceBossToOneHp(prisma, started.session.id, started.session.state);
    const result = await bossRepository.submitItemForTelegramUser(
      1152n,
      "party-token-big-field-kit",
      1,
      {
        id: "item.field-kit",
        name: "Польова аптечка",
        effect: {
          kind: "heal-hp-to-min-percent",
          percent: 93
        }
      },
      resolveInput()
    );
    const latest = expectPartyBossSession(result);
    const participant = latest.state.participants.find(
      (entry) => entry.characterId === "big-field-kit-user-character"
    );

    expect(result.state).toBe("resolved");
    expect(latest.state.roundLog.at(-1)?.actions[0]).toMatchObject({
      action: "item",
      outcome: "item-used",
      itemName: "Польова аптечка",
      healing: expectedHealing
    });
    expect(participant?.resources.hp).toBe(expectedHpAfter);
    expect(participant?.combatItems?.uses?.["item.field-kit"]).toEqual({
      itemId: "item.field-kit",
      count: 1
    });
    expect(await prisma.characterItem.count({
      where: {
        characterId: "big-field-kit-user-character",
        itemId: "item.field-kit"
      }
    })).toBe(0);
    expect(result.achievementEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "item.used",
        characterId: "big-field-kit-user-character",
        itemId: "item.field-kit",
        occurredAt: resolveInput().now
      }),
      expect.objectContaining({
        type: "barrel.raid.bandage-used",
        characterId: "big-field-kit-user-character",
        occurredAt: resolveInput().now
      })
    ]));
  });

  it("emits item events only when the queued party-boss item action resolves", async () => {
    await seedCharacter(prisma, "proof-bandage-user", 1161n, "Бинтова Проба", {
      hpCurrent: 10,
      hpMax: 40,
      strength: 20,
      dexterity: 20
    });
    await seedCharacter(prisma, "proof-bandage-joiner", 1162n, "Свідок Бинта", {
      hpCurrent: 40,
      hpMax: 40,
      strength: 20,
      dexterity: 20
    });
    await prisma.characterItem.create({
      data: {
        characterId: "proof-bandage-user-character",
        itemId: "item.responsible-panic-bandage",
        quantity: 2
      }
    });
    await partyRepository.createForTelegramUser(1161n, partyInput("party-token-proof-bandage"));
    await partyRepository.joinByTokenForTelegramUser(1162n, "party-token-proof-bandage", joinInput());

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(1161n, {
      partyInviteToken: "party-token-proof-bandage",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    expect(started.state).toBe("started");

    const item = {
      id: "item.responsible-panic-bandage",
      name: "Бинт відповідальної паніки",
      effect: {
        kind: "heal-hp" as const,
        amount: 7
      }
    };
    const queued = await bossRepository.submitItemForTelegramUser(
      1161n,
      "party-token-proof-bandage",
      1,
      item,
      resolveInput()
    );

    expect(queued.state).toBe("queued");
    expect(expectPartyBossSession(queued).rulesVersion).toBe("party-boss-proof-v1");
    expect(queued.achievementEvents).toBeUndefined();
    await expect(prisma.characterItem.findUniqueOrThrow({
      where: {
        characterId_itemId: {
          characterId: "proof-bandage-user-character",
          itemId: "item.responsible-panic-bandage"
        }
      },
      select: { quantity: true }
    })).resolves.toEqual({ quantity: 2 });

    const duplicate = await bossRepository.submitItemForTelegramUser(
      1161n,
      "party-token-proof-bandage",
      1,
      item,
      resolveInput()
    );
    const stale = await bossRepository.submitItemForTelegramUser(
      1161n,
      "party-token-proof-bandage",
      0,
      item,
      resolveInput()
    );

    expect(duplicate.state).toBe("duplicate");
    expect(duplicate.achievementEvents).toBeUndefined();
    expect(stale.state).toBe("stale");
    expect(stale.achievementEvents).toBeUndefined();

    const resolved = await bossRepository.submitActionForTelegramUser(
      1162n,
      "party-token-proof-bandage",
      1,
      "defend",
      resolveInput()
    );

    expect(resolved.state).toBe("resolved");
    expect(resolved.achievementEvents).toEqual([
      expect.objectContaining({
        type: "item.used",
        characterId: "proof-bandage-user-character",
        itemId: "item.responsible-panic-bandage",
        occurredAt: resolveInput().now
      })
    ]);
    expect(resolved.achievementEvents).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "barrel.raid.bandage-used" })
    ]));
    await expect(prisma.characterItem.findUniqueOrThrow({
      where: {
        characterId_itemId: {
          characterId: "proof-bandage-user-character",
          itemId: "item.responsible-panic-bandage"
        }
      },
      select: { quantity: true }
    })).resolves.toEqual({ quantity: 1 });
  });

  it("uses the latest queued party-boss choice and does not spend an overwritten item", async () => {
    await seedCharacter(prisma, "replace-item-user", 1171n, "Переобрана", {
      hpCurrent: 10,
      hpMax: 40,
      strength: 20,
      dexterity: 20
    });
    await seedCharacter(prisma, "replace-item-joiner", 1172n, "Свідок Вибору", {
      hpCurrent: 40,
      hpMax: 40,
      strength: 20,
      dexterity: 20
    });
    await prisma.characterItem.create({
      data: {
        characterId: "replace-item-user-character",
        itemId: "item.responsible-panic-bandage",
        quantity: 1
      }
    });
    await partyRepository.createForTelegramUser(1171n, partyInput("party-token-replace-item"));
    await partyRepository.joinByTokenForTelegramUser(1172n, "party-token-replace-item", joinInput());

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(1171n, {
      partyInviteToken: "party-token-replace-item",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    expect(started.state).toBe("started");

    const item = {
      id: "item.responsible-panic-bandage",
      name: "Бинт відповідальної паніки",
      effect: {
        kind: "heal-hp" as const,
        amount: 7
      }
    };

    const itemQueued = await bossRepository.submitItemForTelegramUser(
      1171n,
      "party-token-replace-item",
      1,
      item,
      resolveInput()
    );
    const overwritten = await bossRepository.submitActionForTelegramUser(
      1171n,
      "party-token-replace-item",
      1,
      "defend",
      resolveInput()
    );
    const resolved = await bossRepository.submitActionForTelegramUser(
      1172n,
      "party-token-replace-item",
      1,
      "attack",
      resolveInput()
    );
    const latest = expectPartyBossSession(resolved);

    expect(itemQueued.state).toBe("queued");
    expect(overwritten.state).toBe("updated");
    expect(resolved.state).toBe("resolved");
    expect(latest.state.roundLog.at(-1)?.actions.find(
      (action) => action.characterId === "replace-item-user-character"
    )).toMatchObject({
      action: "defend"
    });
    expect(resolved.achievementEvents).toBeUndefined();
    await expect(prisma.characterItem.findUniqueOrThrow({
      where: {
        characterId_itemId: {
          characterId: "replace-item-user-character",
          itemId: "item.responsible-panic-bandage"
        }
      },
      select: { quantity: true }
    })).resolves.toEqual({ quantity: 1 });
  });

  it("uses a party-boss item when it overwrites the earlier queued action", async () => {
    await seedCharacter(prisma, "replace-action-user", 1181n, "Переобрана Манатка", {
      hpCurrent: 10,
      hpMax: 40,
      strength: 20,
      dexterity: 20
    });
    await seedCharacter(prisma, "replace-action-joiner", 1182n, "Свідок Манатки", {
      hpCurrent: 40,
      hpMax: 40,
      strength: 20,
      dexterity: 20
    });
    await prisma.characterItem.create({
      data: {
        characterId: "replace-action-user-character",
        itemId: "item.responsible-panic-bandage",
        quantity: 1
      }
    });
    await partyRepository.createForTelegramUser(1181n, partyInput("party-token-replace-action"));
    await partyRepository.joinByTokenForTelegramUser(1182n, "party-token-replace-action", joinInput());

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(1181n, {
      partyInviteToken: "party-token-replace-action",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    expect(started.state).toBe("started");

    const actionQueued = await bossRepository.submitActionForTelegramUser(
      1181n,
      "party-token-replace-action",
      1,
      "defend",
      resolveInput()
    );
    const itemUpdated = await bossRepository.submitItemForTelegramUser(
      1181n,
      "party-token-replace-action",
      1,
      {
        id: "item.responsible-panic-bandage",
        name: "Бинт відповідальної паніки",
        effect: {
          kind: "heal-hp",
          amount: 7
        }
      },
      resolveInput()
    );
    await expect(prisma.characterItem.findUniqueOrThrow({
      where: {
        characterId_itemId: {
          characterId: "replace-action-user-character",
          itemId: "item.responsible-panic-bandage"
        }
      },
      select: { quantity: true }
    })).resolves.toEqual({ quantity: 1 });

    const resolved = await bossRepository.submitActionForTelegramUser(
      1182n,
      "party-token-replace-action",
      1,
      "attack",
      resolveInput()
    );
    const latest = expectPartyBossSession(resolved);

    expect(actionQueued.state).toBe("queued");
    expect(itemUpdated.state).toBe("updated");
    expect(resolved.state).toBe("resolved");
    expect(latest.state.roundLog.at(-1)?.actions.find(
      (action) => action.characterId === "replace-action-user-character"
    )).toMatchObject({
      action: "item",
      outcome: "item-used",
      itemName: "Бинт відповідальної паніки",
      healing: 7
    });
    expect(resolved.achievementEvents).toEqual([
      expect.objectContaining({
        type: "item.used",
        characterId: "replace-action-user-character",
        itemId: "item.responsible-panic-bandage"
      })
    ]);
    expect(await prisma.characterItem.count({
      where: {
        characterId: "replace-action-user-character",
        itemId: "item.responsible-panic-bandage"
      }
    })).toBe(0);
  });

  it("treats duplicate Big Barrel gear actions as a single queued support effect", async () => {
    const grant = findMantokAbilityGrantByKey("bcshield");
    if (!grant?.combat) {
      throw new Error("Expected barrel shield combat grant.");
    }

    await seedCharacter(prisma, "duplicate-gear-leader-user", 1191n, "Щитова Лідерка", {
      level: 10,
      hpCurrent: 60,
      hpMax: 60,
      strength: 20,
      equipment: [{ slot: "offhand", itemId: "item.set.barrel-brother.shield" }]
    });
    await seedCharacter(prisma, "duplicate-gear-joiner-user", 1192n, "Свідок Щита", {
      level: 10,
      hpCurrent: 60,
      hpMax: 60,
      strength: 20
    });
    await partyRepository.createForTelegramUser(1191n, partyInput("party-token-duplicate-gear"));
    await partyRepository.joinByTokenForTelegramUser(1192n, "party-token-duplicate-gear", joinInput());

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(1191n, {
      partyInviteToken: "party-token-duplicate-gear",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    expect(started.state).toBe("started");
    const startedSession = expectPartyBossSession(started);
    await prisma.partyBossSession.update({
      where: { id: startedSession.id },
      data: {
        stateJson: {
          ...startedSession.state,
          participants: startedSession.state.participants.map((participant) =>
            participant.characterId === "duplicate-gear-leader-user-character"
              ? {
                  ...participant,
                  resources: {
                    ...participant.resources,
                    playerAbilityFumbles: {
                      version: 1,
                      abilities: {
                        "gear.barrel-counter-shield": {
                          version: 1,
                          cycle: 0,
                          usesInCycle: 0,
                          triggerAt: 13
                        }
                      }
                    }
                  }
                }
              : participant
          )
        }
      }
    });

    const gearAbility = { profile: grant.combat.profile };
    const queued = await bossRepository.submitActionForTelegramUser(
      1191n,
      "party-token-duplicate-gear",
      1,
      "gear",
      resolveInput(),
      { gearAbility }
    );
    const duplicate = await bossRepository.submitActionForTelegramUser(
      1191n,
      "party-token-duplicate-gear",
      1,
      "gear",
      resolveInput(),
      { gearAbility }
    );

    expect(queued.state).toBe("queued");
    expect(duplicate.state).toBe("duplicate");
    expect(duplicate.achievementEvents).toBeUndefined();
    expect(await prisma.partyBossAction.count({
      where: {
        sessionId: expectPartyBossSession(queued).id,
        actorCharacterId: "duplicate-gear-leader-user-character"
      }
    })).toBe(1);

    const resolved = await bossRepository.submitActionForTelegramUser(
      1192n,
      "party-token-duplicate-gear",
      1,
      "defend",
      resolveInput()
    );
    const latest = expectPartyBossSession(resolved);
    const round = latest.state.roundLog.at(-1);
    const leaderGearActions = round?.actions.filter(
      (action) => action.characterId === "duplicate-gear-leader-user-character" && action.action === "gear"
    ) ?? [];
    const leaderAfter = latest.state.participants.find(
      (participant) => participant.characterId === "duplicate-gear-leader-user-character"
    );

    expect(resolved.state).toBe("resolved");
    expect(leaderGearActions).toHaveLength(1);
    expect(leaderGearActions[0]).toMatchObject({
      skillId: "gear.barrel-counter-shield",
      guard: 2,
      manaSpent: 0
    });
    expect(Object.keys(leaderAfter?.resources.cooldowns?.abilities ?? {})).toEqual(["gear.barrel-counter-shield"]);
    expect(resolved.achievementEvents).toEqual([
      expect.objectContaining({
        type: "mantok.gear-action.used",
        characterId: "duplicate-gear-leader-user-character"
      })
    ]);
  });

  it("rejects Big Barrel gear actions without mana before writing the action ledger", async () => {
    const grant = findMantokAbilityGrantByKey("harpcp");
    if (!grant?.combat) {
      throw new Error("Expected harp combat grant.");
    }

    await seedCharacter(prisma, "gear-no-mana-user", 1193n, "Без Мани", {
      level: 10,
      hpCurrent: 60,
      hpMax: 60,
      manaCurrent: 0,
      manaMax: 10,
      equipment: [{ slot: "tool", itemId: "item.set.couplet.harp" }]
    });
    await partyRepository.createForTelegramUser(1193n, partyInput("party-token-gear-no-mana"));

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(1193n, {
      partyInviteToken: "party-token-gear-no-mana",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    if (!("session" in started)) {
      throw new Error(`Expected started session, got ${started.state}`);
    }
    const beforeState = started.session.state;

    const blocked = await bossRepository.submitActionForTelegramUser(
      1193n,
      "party-token-gear-no-mana",
      1,
      "gear",
      resolveInput(),
      { gearAbility: { profile: grant.combat.profile } }
    );
    const latest = expectPartyBossSession(blocked);

    expect(blocked.state).toBe("gear-unavailable");
    if (blocked.state === "gear-unavailable") {
      expect(blocked.reason).toBe("not-enough-mana");
    }
    expect(latest.state).toEqual(beforeState);
    expect(latest.turn).toBe(1);
    expect(latest.state.roundLog).toHaveLength(0);
    expect(latest.state.roundLog.at(-1)?.bossRetaliations ?? []).toEqual([]);
    expect(latest.state.participants.find(
      (participant) => participant.characterId === "gear-no-mana-user-character"
    )?.resources).toEqual(beforeState.participants.find(
      (participant) => participant.characterId === "gear-no-mana-user-character"
    )?.resources);
    expect(await prisma.partyBossAction.count({
      where: {
        sessionId: latest.id,
        actorCharacterId: "gear-no-mana-user-character"
      }
    })).toBe(0);
    expect(blocked.achievementEvents).toBeUndefined();
  });

  it("rejects Big Barrel gear actions missing from the frozen participant grant snapshot before writing the action ledger", async () => {
    const grant = findMantokAbilityGrantByKey("rldagr");
    if (!grant?.combat) {
      throw new Error("Expected red-line dagger combat grant.");
    }

    await seedCharacter(prisma, "gear-missing-grant-user", 1195n, "Без Кинджала", {
      level: 10,
      hpCurrent: 60,
      hpMax: 60,
      manaCurrent: 10,
      manaMax: 10
    });
    await partyRepository.createForTelegramUser(1195n, partyInput("party-token-gear-missing-grant"));

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(1195n, {
      partyInviteToken: "party-token-gear-missing-grant",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    if (!("session" in started)) {
      throw new Error(`Expected started session, got ${started.state}`);
    }
    const beforeState = started.session.state;

    const blocked = await bossRepository.submitActionForTelegramUser(
      1195n,
      "party-token-gear-missing-grant",
      1,
      "gear",
      resolveInput(),
      { gearAbility: { profile: grant.combat.profile } }
    );
    const latest = expectPartyBossSession(blocked);

    expect(blocked.state).toBe("stale");
    expect(latest.state).toEqual(beforeState);
    expect(latest.turn).toBe(1);
    expect(latest.state.roundLog).toHaveLength(0);
    expect(latest.state.roundLog.at(-1)?.bossRetaliations ?? []).toEqual([]);
    expect(await prisma.partyBossAction.count({
      where: {
        sessionId: latest.id,
        actorCharacterId: "gear-missing-grant-user-character"
      }
    })).toBe(0);
    expect(blocked.achievementEvents).toBeUndefined();
  });

  it("rejects Big Barrel gear actions on equipment cooldown before writing the action ledger", async () => {
    const grant = findMantokAbilityGrantByKey("bcshield");
    if (!grant?.combat) {
      throw new Error("Expected barrel shield combat grant.");
    }

    await seedCharacter(prisma, "gear-cooldown-user", 1194n, "Відсапана Щитниця", {
      level: 10,
      hpCurrent: 60,
      hpMax: 60,
      manaCurrent: 10,
      manaMax: 10,
      equipment: [{ slot: "offhand", itemId: "item.set.barrel-brother.shield" }]
    });
    await partyRepository.createForTelegramUser(1194n, partyInput("party-token-gear-cooldown"));

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(1194n, {
      partyInviteToken: "party-token-gear-cooldown",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    if (!("session" in started)) {
      throw new Error(`Expected started session, got ${started.state}`);
    }

    const cooldownState = {
      ...started.session.state,
      participants: started.session.state.participants.map((participant) =>
        participant.characterId === "gear-cooldown-user-character"
          ? {
              ...participant,
              resources: {
                ...participant.resources,
                cooldowns: {
                  ...participant.resources.cooldowns,
                  abilities: {
                    ...(participant.resources.cooldowns?.abilities ?? {}),
                    "gear.barrel-counter-shield": {
                      id: "gear.barrel-counter-shield",
                      remainingTurns: 2
                    }
                  }
                }
              }
            }
          : participant
      )
    };
    await prisma.partyBossSession.update({
      where: { id: started.session.id },
      data: { stateJson: cooldownState }
    });
    const beforeResources = cooldownState.participants.find(
      (participant) => participant.characterId === "gear-cooldown-user-character"
    )?.resources;

    const blocked = await bossRepository.submitActionForTelegramUser(
      1194n,
      "party-token-gear-cooldown",
      1,
      "gear",
      resolveInput(),
      { gearAbility: { profile: grant.combat.profile } }
    );
    const latest = expectPartyBossSession(blocked);

    expect(blocked.state).toBe("gear-unavailable");
    if (blocked.state === "gear-unavailable") {
      expect(blocked.reason).toBe("skill-on-cooldown");
    }
    expect(latest.state).toEqual(cooldownState);
    expect(latest.turn).toBe(1);
    expect(latest.state.roundLog).toHaveLength(0);
    expect(latest.state.roundLog.at(-1)?.bossRetaliations ?? []).toEqual([]);
    expect(latest.state.participants.find(
      (participant) => participant.characterId === "gear-cooldown-user-character"
    )?.resources).toEqual(beforeResources);
    expect(await prisma.partyBossAction.count({
      where: {
        sessionId: latest.id,
        actorCharacterId: "gear-cooldown-user-character"
      }
    })).toBe(0);
    expect(blocked.achievementEvents).toBeUndefined();
  });

  it("does not consume a party-boss field kit when raid HP is already above its threshold", async () => {
    await seedCharacter(prisma, "big-field-kit-healthy-user", 1153n, "Майже Здорова", {
      hpCurrent: 130,
      hpMax: 100,
      level: 8,
      strength: 20,
      dexterity: 20
    });
    await prisma.characterItem.create({
      data: {
        characterId: "big-field-kit-healthy-user-character",
        itemId: "item.field-kit",
        quantity: 1
      }
    });
    await partyRepository.createForTelegramUser(1153n, {
      ...partyInput("party-token-big-field-kit-healthy"),
      periodId: "2026-06-30T10:44",
      originLocationId: "barrel.big-brother"
    });

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(1153n, {
      partyInviteToken: "party-token-big-field-kit-healthy",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    expect(started.state).toBe("started");

    const result = await bossRepository.submitItemForTelegramUser(
      1153n,
      "party-token-big-field-kit-healthy",
      1,
      {
        id: "item.field-kit",
        name: "Польова аптечка",
        effect: {
          kind: "heal-hp-to-min-percent",
          percent: 93
        }
      },
      resolveInput()
    );

    expect(result.state).toBe("item-unavailable");
    if (result.state === "item-unavailable") {
      expect(result.reason).toBe("full-hp");
    }
    await expect(prisma.characterItem.findUniqueOrThrow({
      where: {
        characterId_itemId: {
          characterId: "big-field-kit-healthy-user-character",
          itemId: "item.field-kit"
        }
      },
      select: { quantity: true }
    })).resolves.toEqual({ quantity: 1 });
  });

  it("releases leases and live party keys when timeout resolution knocks out all participants", async () => {
    await seedCharacter(prisma, "knockout-leader-user", 2001n, "Крихка Лідерка", { hp: 1 });
    await seedCharacter(prisma, "knockout-joiner-user", 2002n, "Крихкий Помічник", { hp: 1 });
    await partyRepository.createForTelegramUser(2001n, partyInput("party-token-knockout"));
    await partyRepository.joinByTokenForTelegramUser(2002n, "party-token-knockout", joinInput());

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(2001n, {
      partyInviteToken: "party-token-knockout",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });

    expect(started.state).toBe("started");
    const resolved = await bossRepository.resolveTimedOutByToken("party-token-knockout", {
      now: new Date("2026-06-30T10:01:00.000Z"),
      nextTurnExpiresAt: new Date("2026-06-30T10:01:23.000Z")
    }, "due");
    const latest = expectPartyBossSession(resolved);

    expect(resolved.state).toBe("resolved");
    expect(latest.status).toBe("lost");
    expect(await prisma.activeCombatLease.count({ where: { kind: "party-boss", referenceId: latest.partySessionId } })).toBe(0);
    expect(await prisma.partyParticipant.count({
      where: {
        sessionId: latest.partySessionId,
        activeMembershipKey: {
          not: null
        }
      }
    })).toBe(0);
  });

  it("manual dev timeout force-resolves missing actions before the turn deadline", async () => {
    await seedCharacter(prisma, "force-timeout-leader-user", 4001n, "Лідерка Швидка", { hp: 300 });
    await seedCharacter(prisma, "force-timeout-joiner-user", 4002n, "Помічник Мовчазний", { hp: 300 });
    await partyRepository.createForTelegramUser(4001n, partyInput("party-token-force-timeout"));
    await partyRepository.joinByTokenForTelegramUser(4002n, "party-token-force-timeout", joinInput());

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(4001n, {
      partyInviteToken: "party-token-force-timeout",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });

    expect(started.state).toBe("started");
    await bossRepository.submitActionForTelegramUser(
      4001n,
      "party-token-force-timeout",
      1,
      "attack",
      resolveInput()
    );

    const resolved = await bossRepository.resolveTimedOutByToken("party-token-force-timeout", {
      now: new Date("2026-06-30T10:00:05.000Z"),
      nextTurnExpiresAt: new Date("2026-06-30T10:00:28.000Z")
    }, "force-dev");
    const latest = expectPartyBossSession(resolved);

    expect(resolved.state).toBe("resolved");
    expect(latest.status).toBe("active");
    expect(latest.turn).toBe(2);
    const silentParticipant = latest.state.participants.find(
      (participant) => participant.characterId !== latest.leaderCharacterId
    );
    expect(latest.state.roundLog.at(-1)?.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ characterId: latest.leaderCharacterId, origin: "manual" }),
        expect.objectContaining({ characterId: silentParticipant?.characterId, action: "defend", origin: "timeout" })
      ])
    );
  });

  it("keeps a production due-timeout callback queued before the turn deadline when actions are missing", async () => {
    await seedCharacter(prisma, "early-due-leader-user", 4101n, "Лідерка Рання", { hp: 300 });
    await seedCharacter(prisma, "early-due-joiner-user", 4102n, "Помічник Ранній", { hp: 300 });
    await partyRepository.createForTelegramUser(4101n, partyInput("party-token-early-due"));
    await partyRepository.joinByTokenForTelegramUser(4102n, "party-token-early-due", joinInput());

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(4101n, {
      partyInviteToken: "party-token-early-due",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    expect(started.state).toBe("started");

    const queued = await bossRepository.resolveTimedOutByToken("party-token-early-due", {
      now: new Date("2026-06-30T10:00:05.000Z"),
      nextTurnExpiresAt: new Date("2026-06-30T10:00:28.000Z")
    }, "due");
    const latest = expectPartyBossSession(queued);

    expect(queued.state).toBe("queued");
    expect(latest.turn).toBe(1);
    expect(latest.state.roundLog).toHaveLength(0);
    expect(await prisma.partyBossAction.count({
      where: {
        sessionId: latest.id
      }
    })).toBe(0);
  });

  it("resolves production due-timeout after the turn deadline", async () => {
    await seedCharacter(prisma, "due-timeout-leader-user", 4201n, "Лідерка Пізня", { hp: 300 });
    await seedCharacter(prisma, "due-timeout-joiner-user", 4202n, "Помічник Пізній", { hp: 300 });
    await partyRepository.createForTelegramUser(4201n, partyInput("party-token-due-timeout"));
    await partyRepository.joinByTokenForTelegramUser(4202n, "party-token-due-timeout", joinInput());

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(4201n, {
      partyInviteToken: "party-token-due-timeout",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    expect(started.state).toBe("started");

    expect((await bossRepository.listDueTimedOutSessions(new Date("2026-06-30T10:00:24.000Z")))
      .map((session) => session.partyInviteToken)).toContain("party-token-due-timeout");

    const resolved = await bossRepository.resolveTimedOutByToken("party-token-due-timeout", {
      now: new Date("2026-06-30T10:00:24.000Z"),
      nextTurnExpiresAt: new Date("2026-06-30T10:00:47.000Z")
    }, "due");
    const latest = expectPartyBossSession(resolved);

    expect(resolved.state).toBe("resolved");
    expect(latest.turn).toBe(2);
    expect(latest.state.roundLog.at(-1)?.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ origin: "timeout", action: "defend" })
      ])
    );
  });

  it("treats knocked-out participant action callbacks as stale without creating an action row", async () => {
    await seedCharacter(prisma, "stale-knockout-leader-user", 3001n, "Вибита Лідерка", { hp: 25 });
    await partyRepository.createForTelegramUser(3001n, partyInput("party-token-stale-knockout"));

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(3001n, {
      partyInviteToken: "party-token-stale-knockout",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    if (!("session" in started)) {
      throw new Error(`Expected started session, got ${started.state}`);
    }

    const knockedOutState = {
      ...started.session.state,
      participants: started.session.state.participants.map((participant) => ({
        ...participant,
        status: "knocked-out" as const,
        resources: {
          ...participant.resources,
          hp: 0
        }
      }))
    };
    await prisma.partyBossSession.update({
      where: { id: started.session.id },
      data: {
        stateJson: knockedOutState
      }
    });

    const stale = await bossRepository.submitActionForTelegramUser(
      3001n,
      "party-token-stale-knockout",
      1,
      "attack",
      resolveInput()
    );

    expect(stale.state).toBe("stale");
    expect(await prisma.partyBossAction.count({ where: { sessionId: started.session.id } })).toBe(0);
  });

  it("settles Big Barrel Brother victory through the canonical Barrel success key exactly once", async () => {
    await seedCharacter(prisma, "big-leader-user", 5001n, "Старша Лідерка", {
      hp: 80,
      level: 8,
      xp: getLevelStartXp(9) - 1,
      strength: 24,
      dexterity: 24
    });
    await partyRepository.createForTelegramUser(5001n, {
      ...partyInput("party-token-big"),
      periodId: "2026-06-30T10:23",
      originLocationId: "barrel.big-brother"
    });
    expect(await prisma.partySession.findUnique({
      where: { inviteToken: "party-token-big" },
      select: { originLocationId: true }
    })).toEqual({ originLocationId: "barrel.big-brother" });

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(5001n, {
      partyInviteToken: "party-token-big",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    expect(started.state).toBe("started");
    if (!("session" in started)) {
      throw new Error(`Expected started session, got ${started.state}`);
    }

    await prisma.partyBossSession.update({
      where: { id: started.session.id },
      data: {
        stateJson: {
          ...started.session.state,
          boss: {
            ...started.session.state.boss,
            hp: 0,
            hpMax: 1,
            armor: 0,
            resist: 0,
            dexterity: 0
          }
        }
      }
    });

    const resolved = await bossRepository.submitActionForTelegramUser(
      5001n,
      "party-token-big",
      1,
      "attack",
      resolveInput()
    );
    const latest = expectPartyBossSession(resolved);

    expect(resolved.state).toBe("resolved");
    expect(latest.status).toBe("won");
    expect(latest.rulesVersion).toBe("big-barrel-brother-v1");
    expect(resolved.achievementEvents).toMatchObject([
      {
        type: "barrel.raid.claimed",
        characterId: "big-leader-user-character",
        occurredAt: resolveInput().now
      }
    ]);
    expect(await prisma.dailyAction.count({
      where: {
        key: "tavern.friday-barrel-raid",
        localDate: "2026-06-30T10:23"
      }
    })).toBe(1);

    const replay = await bossRepository.resolveTimedOutByToken("party-token-big", resolveInput(), "due");

    expect(replay.state).toBe("terminal");
    expect(replay.achievementEvents).toBeUndefined();
    expect(await prisma.dailyAction.count({
      where: {
        key: "tavern.friday-barrel-raid",
        localDate: "2026-06-30T10:23"
      }
    })).toBe(1);
    expect(await prisma.activeCombatLease.count({ where: { kind: "party-boss", referenceId: latest.partySessionId } })).toBe(0);
    expect(await prisma.hpRecoveryNotification.findUnique({
      where: { characterId: "big-leader-user-character" }
    })).toMatchObject({ status: "waiting" });
    expect(await prisma.character.findUnique({
      where: { id: "big-leader-user-character" },
      select: { level: true }
    })).toEqual({ level: 9 });
  });

  it("freezes Kharakternyk ward sign support from the final Big Barrel roster at start", async () => {
    await seedCharacter(prisma, "big-ward-leader-user", 5081n, "Р—РЅР°РєР°СЂРєР°", {
      hp: 80,
      level: 8,
      classId: "class.kharakternyk",
      manaCurrent: 13,
      intelligence: 15
    });
    await seedCharacter(prisma, "big-ward-support-user", 5082n, "РџС–РґРїРѕСЂР°", {
      hp: 80,
      level: 8,
      manaCurrent: 10,
      intelligence: 13
    });
    await seedCharacter(prisma, "big-ward-left-user", 5083n, "РџС–РґРїРѕСЂР° Р—Р° Р”РІРµСЂРёРјР°", {
      hp: 80,
      level: 8,
      manaCurrent: 10,
      intelligence: 13
    });
    await partyRepository.createForTelegramUser(5081n, {
      ...partyInput("party-token-big-ward"),
      periodId: "2026-06-30T10:58",
      originLocationId: "barrel.big-brother"
    });
    await partyRepository.joinByTokenForTelegramUser(5082n, "party-token-big-ward", joinInput());
    await partyRepository.joinByTokenForTelegramUser(5083n, "party-token-big-ward", joinInput());
    await partyRepository.placeKharakternykWardSign(5081n, "party-token-big-ward", now());
    await partyRepository.supportKharakternykWardSign(5082n, "party-token-big-ward", now());
    await partyRepository.supportKharakternykWardSign(5083n, "party-token-big-ward", now());
    await partyRepository.leaveByTokenForTelegramUser(5083n, "party-token-big-ward", now());

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(5081n, {
      partyInviteToken: "party-token-big-ward",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });

    expect(started.state).toBe("started");
    if (!("session" in started)) {
      throw new Error(`Expected started session, got ${started.state}`);
    }
    expect(started.session.state.wardSign).toMatchObject({
      kind: "kharakternyk",
      placerCharacterId: "big-ward-leader-user-character",
      supportCount: 1,
      supportCap: 7,
      usesRemaining: 1,
      usesMax: 1,
      mitigationPercent: 35,
      status: "carried"
    });
    expect(started.session.state.participants.map((participant) => participant.characterId).sort()).toEqual([
      "big-ward-leader-user-character",
      "big-ward-support-user-character"
    ].sort());
  });

  it("preserves same-life protocol snapshots across rejoin and restart before boss freeze", async () => {
    await seedCharacter(prisma, "big-protocol-leader-user", 5084n, "Паперова Голова", {
      hp: 80,
      level: 8
    });
    await seedCharacter(prisma, "big-protocol-filer-user", 5085n, "Реєстратор", {
      hp: 80,
      level: 8,
      classId: "class.bureaucramancer",
      manaCurrent: 10
    });
    await seedCharacter(prisma, "big-protocol-signer-user", 5086n, "Підписант", {
      hp: 80,
      level: 8
    });
    await seedCharacter(prisma, "big-protocol-competitor-user", 5087n, "Запасний Реєстратор", {
      hp: 80,
      level: 8,
      classId: "class.bureaucramancer",
      manaCurrent: 10
    });
    await partyRepository.createForTelegramUser(5084n, {
      ...partyInput("party-token-big-protocol"),
      periodId: "2026-06-30T10:59",
      originLocationId: "barrel.big-brother"
    });
    await partyRepository.joinByTokenForTelegramUser(5085n, "party-token-big-protocol", joinInput());
    await partyRepository.joinByTokenForTelegramUser(5086n, "party-token-big-protocol", joinInput());
    await partyRepository.joinByTokenForTelegramUser(5087n, "party-token-big-protocol", joinInput());
    expect((await partyRepository.fileBureaucramancerPersonalProtocol(
      5085n,
      "party-token-big-protocol",
      now()
    )).state).toBe("updated");
    expect((await partyRepository.signBureaucramancerPersonalProtocol(
      5086n,
      "party-token-big-protocol",
      now()
    )).state).toBe("updated");

    expect((await partyRepository.leaveByTokenForTelegramUser(
      5085n,
      "party-token-big-protocol",
      now()
    )).state).toBe("left");
    expect((await partyRepository.joinByTokenForTelegramUser(
      5085n,
      "party-token-big-protocol",
      joinInput()
    )).state).toBe("joined");
    expect((await partyRepository.fileBureaucramancerPersonalProtocol(
      5087n,
      "party-token-big-protocol",
      now()
    )).state).toBe("already-exists");

    expect((await partyRepository.leaveByTokenForTelegramUser(
      5086n,
      "party-token-big-protocol",
      now()
    )).state).toBe("left");
    expect((await partyRepository.joinByTokenForTelegramUser(
      5086n,
      "party-token-big-protocol",
      joinInput()
    )).state).toBe("joined");
    expect((await partyRepository.signBureaucramancerPersonalProtocol(
      5086n,
      "party-token-big-protocol",
      now()
    )).state).toBe("already-signed");

    const restartedRepository = new PrismaPartySessionRepository(prisma);
    const restartedState = await restartedRepository.findByToken("party-token-big-protocol", now());
    expect(restartedState?.personalProtocol).toMatchObject({
      filerCharacterId: "big-protocol-filer-user-character",
      signatureCount: 2
    });

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(5084n, {
      partyInviteToken: "party-token-big-protocol",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });

    expect(started.state).toBe("started");
    if (!("session" in started)) {
      throw new Error(`Expected started session, got ${started.state}`);
    }
    expect(started.session.state.personalProtocol).toMatchObject({
      kind: "bureaucramancer-personal-protocol-13b",
      filerCharacterId: "big-protocol-filer-user-character"
    });
    expect(started.session.state.personalProtocol?.signatures).toEqual(expect.arrayContaining([
      expect.objectContaining({
        characterId: "big-protocol-filer-user-character",
        status: "unspent"
      }),
      expect.objectContaining({
        characterId: "big-protocol-signer-user-character",
        status: "unspent"
      })
    ]));
    expect(started.session.state.personalProtocol?.signatures).toHaveLength(2);
    expect(started.session.state.participants.map((participant) => participant.characterId).sort()).toEqual([
      "big-protocol-leader-user-character",
      "big-protocol-filer-user-character",
      "big-protocol-signer-user-character",
      "big-protocol-competitor-user-character"
    ].sort());
  });

  it("persists one Protocol 13-Z trigger and replays stale callbacks without retriggering", async () => {
    const token = "party-token-big-protocol-trigger-replay";
    const characterId = "big-protocol-trigger-replay-user-character";
    await seedCharacter(prisma, "big-protocol-trigger-replay-user", 5099n, "Підписаний Реєстратор", {
      hp: 160,
      level: 8,
      classId: "class.bureaucramancer",
      manaCurrent: 10,
      strength: 8,
      dexterity: 8
    });
    await partyRepository.createForTelegramUser(5099n, {
      ...partyInput(token),
      periodId: "2026-06-30T10:59:13",
      originLocationId: "barrel.big-brother"
    });
    expect((await partyRepository.fileBureaucramancerPersonalProtocol(5099n, token, now())).state).toBe("updated");

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(5099n, {
      partyInviteToken: token,
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    expect(started.state).toBe("started");

    const resolved = await bossRepository.submitActionForTelegramUser(
      5099n,
      token,
      1,
      "defend",
      resolveInput()
    );
    expect(resolved.state).toBe("resolved");
    const resolvedSession = expectPartyBossSession(resolved);
    const expectedBossActionId = `big-barrel:1:personal:${characterId}`;
    const storedRoundProtocol = resolvedSession.state.roundLog.at(-1)?.personalProtocol;
    expect(storedRoundProtocol).toMatchObject({
      characterId,
      bossActionId: expectedBossActionId,
      triggeredTurn: 1,
      spentCount: 1,
      signatureCount: 1
    });
    expect(storedRoundProtocol?.preventedDamage).toBeGreaterThan(0);
    expect(resolvedSession.state.personalProtocol?.signatures).toEqual([
      expect.objectContaining({
        characterId,
        status: "spent",
        bossActionId: expectedBossActionId,
        triggeredTurn: 1
      })
    ]);
    expect(resolved.achievementEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "bureaucramancer.protocol.triggered",
        characterId,
        sourceId: expectedBossActionId
      })
    ]));

    const restartedRepository = new PrismaPartyBossRepository(prisma);
    const reloaded = await restartedRepository.findByPartyInviteToken(token);
    expect(reloaded?.state.roundLog.at(-1)?.personalProtocol).toEqual(storedRoundProtocol);
    expect(reloaded?.state.personalProtocol).toEqual(resolvedSession.state.personalProtocol);

    const staleReplay = await restartedRepository.submitActionForTelegramUser(
      5099n,
      token,
      1,
      "defend",
      resolveInput()
    );
    expect(staleReplay.state).toBe("stale");
    expect(expectPartyBossSession(staleReplay).state.roundLog.at(-1)?.personalProtocol).toEqual(storedRoundProtocol);
    expect(expectPartyBossSession(staleReplay).state.personalProtocol).toEqual(resolvedSession.state.personalProtocol);
    expect(staleReplay.achievementEvents).toBeUndefined();
  });

  it("replaces a remort-invalidated filing with a new identity and lets old signers sign again", async () => {
    await seedCharacter(prisma, "big-protocol-remort-leader-user", 5088n, "Ватажок Заміни", {
      hp: 80,
      level: 8
    });
    await seedCharacter(prisma, "big-protocol-remort-old-filer-user", 5089n, "Старий Реєстратор", {
      hp: 80,
      level: 8,
      classId: "class.bureaucramancer",
      manaCurrent: 10
    });
    await seedCharacter(prisma, "big-protocol-remort-new-filer-user", 5090n, "Новий Реєстратор", {
      hp: 80,
      level: 8,
      classId: "class.bureaucramancer",
      manaCurrent: 10
    });
    await seedCharacter(prisma, "big-protocol-remort-signer-user", 5091n, "Повторний Підписант", {
      hp: 80,
      level: 8
    });
    await partyRepository.createForTelegramUser(5088n, {
      ...partyInput("party-token-big-protocol-remort"),
      originLocationId: "barrel.big-brother"
    });
    await partyRepository.joinByTokenForTelegramUser(5089n, "party-token-big-protocol-remort", joinInput());
    await partyRepository.joinByTokenForTelegramUser(5090n, "party-token-big-protocol-remort", joinInput());
    await partyRepository.joinByTokenForTelegramUser(5091n, "party-token-big-protocol-remort", joinInput());

    const oldFiled = await partyRepository.fileBureaucramancerPersonalProtocol(
      5089n,
      "party-token-big-protocol-remort",
      now()
    );
    expect(oldFiled.state).toBe("updated");
    const oldProtocolId = "session" in oldFiled ? oldFiled.session.personalProtocol?.protocolId : undefined;
    await partyRepository.signBureaucramancerPersonalProtocol(5091n, "party-token-big-protocol-remort", now());
    await partyRepository.leaveByTokenForTelegramUser(5089n, "party-token-big-protocol-remort", now());
    await seedRemort(prisma, "big-protocol-remort-old-filer-user-character", 1);

    const replacement = await partyRepository.fileBureaucramancerPersonalProtocol(
      5090n,
      "party-token-big-protocol-remort",
      now()
    );
    expect(replacement.state).toBe("updated");
    const replacementProtocolId = "session" in replacement
      ? replacement.session.personalProtocol?.protocolId
      : undefined;
    expect(replacementProtocolId).toBeTruthy();
    expect(replacementProtocolId).not.toBe(oldProtocolId);
    expect((await partyRepository.signBureaucramancerPersonalProtocol(
      5091n,
      "party-token-big-protocol-remort",
      now()
    )).state).toBe("updated");

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(5088n, {
      partyInviteToken: "party-token-big-protocol-remort",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    expect(started.state).toBe("started");
    if (!("session" in started)) {
      throw new Error(`Expected started session, got ${started.state}`);
    }
    expect(started.session.state.personalProtocol).toMatchObject({
      protocolId: replacementProtocolId,
      filerCharacterId: "big-protocol-remort-new-filer-user-character"
    });
    expect(started.session.state.personalProtocol?.signatures.map((row) => row.characterId).sort()).toEqual([
      "big-protocol-remort-new-filer-user-character",
      "big-protocol-remort-signer-user-character"
    ].sort());
  });

  it("replaces an unsupported filing snapshot and freezes only re-signed current identities", async () => {
    await seedCharacter(prisma, "big-protocol-version-leader-user", 5092n, "Ватажок Версій", {
      hp: 80,
      level: 8
    });
    await seedCharacter(prisma, "big-protocol-version-old-filer-user", 5093n, "Старий Бланк", {
      hp: 80,
      level: 8,
      classId: "class.bureaucramancer",
      manaCurrent: 10
    });
    await seedCharacter(prisma, "big-protocol-version-new-filer-user", 5094n, "Новий Бланк", {
      hp: 80,
      level: 8,
      classId: "class.bureaucramancer",
      manaCurrent: 10
    });
    await seedCharacter(prisma, "big-protocol-version-signer-user", 5095n, "Версійний Підпис", {
      hp: 80,
      level: 8
    });
    await partyRepository.createForTelegramUser(5092n, {
      ...partyInput("party-token-big-protocol-version-replace"),
      originLocationId: "barrel.big-brother"
    });
    await partyRepository.joinByTokenForTelegramUser(5093n, "party-token-big-protocol-version-replace", joinInput());
    await partyRepository.joinByTokenForTelegramUser(5094n, "party-token-big-protocol-version-replace", joinInput());
    await partyRepository.joinByTokenForTelegramUser(5095n, "party-token-big-protocol-version-replace", joinInput());
    await partyRepository.fileBureaucramancerPersonalProtocol(
      5093n,
      "party-token-big-protocol-version-replace",
      now()
    );
    await partyRepository.signBureaucramancerPersonalProtocol(
      5095n,
      "party-token-big-protocol-version-replace",
      now()
    );

    const oldFiler = await prisma.partyParticipant.findFirstOrThrow({
      where: {
        session: { inviteToken: "party-token-big-protocol-version-replace" },
        characterId: "big-protocol-version-old-filer-user-character"
      },
      select: { id: true, snapshotJson: true }
    });
    const invalidatedSnapshot = JSON.parse(JSON.stringify(oldFiler.snapshotJson)) as Record<string, unknown>;
    const invalidatedProtocol = invalidatedSnapshot.bureaucramancerPersonalProtocol13B;
    if (!invalidatedProtocol || typeof invalidatedProtocol !== "object" || Array.isArray(invalidatedProtocol)) {
      throw new Error("Expected protocol snapshot object.");
    }
    (invalidatedProtocol as Record<string, unknown>).version = 2;
    await prisma.partyParticipant.update({
      where: { id: oldFiler.id },
      data: { snapshotJson: invalidatedSnapshot }
    });

    const replacement = await partyRepository.fileBureaucramancerPersonalProtocol(
      5094n,
      "party-token-big-protocol-version-replace",
      now()
    );
    expect(replacement.state).toBe("updated");
    expect((await partyRepository.signBureaucramancerPersonalProtocol(
      5095n,
      "party-token-big-protocol-version-replace",
      now()
    )).state).toBe("updated");

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(5092n, {
      partyInviteToken: "party-token-big-protocol-version-replace",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    expect(started.state).toBe("started");
    if (!("session" in started)) {
      throw new Error(`Expected started session, got ${started.state}`);
    }
    expect(started.session.state.personalProtocol).toMatchObject({
      filerCharacterId: "big-protocol-version-new-filer-user-character"
    });
    expect(started.session.state.personalProtocol?.signatures.map((row) => row.characterId).sort()).toEqual([
      "big-protocol-version-new-filer-user-character",
      "big-protocol-version-signer-user-character"
    ].sort());
  });

  it("CAS-orders raid start against protocol filing without spending on a lost filing", async () => {
    await seedCharacter(prisma, "big-protocol-start-file-user", 5096n, "Стартовий Реєстратор", {
      hp: 80,
      level: 8,
      classId: "class.bureaucramancer",
      manaCurrent: 10
    });
    await partyRepository.createForTelegramUser(5096n, {
      ...partyInput("party-token-big-protocol-start-file"),
      originLocationId: "barrel.big-brother"
    });

    const [started, filed] = await Promise.all([
      bossRepository.startFromRecruitingPartyForTelegramUser(5096n, {
        partyInviteToken: "party-token-big-protocol-start-file",
        now: now(),
        turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
      }),
      partyRepository.fileBureaucramancerPersonalProtocol(
        5096n,
        "party-token-big-protocol-start-file",
        now()
      )
    ]);

    expect(started.state).toBe("started");
    expect(["updated", "not-recruiting"]).toContain(filed.state);
    if (!("session" in started)) {
      throw new Error(`Expected started session, got ${started.state}`);
    }
    const mana = await prisma.character.findUniqueOrThrow({
      where: { id: "big-protocol-start-file-user-character" },
      select: { manaCurrent: true }
    });
    if (filed.state === "updated") {
      if (!filed.session.personalProtocol) {
        throw new Error("Expected the committed protocol receipt after a successful filing");
      }
      expect(mana.manaCurrent).toBe(10 - filed.session.personalProtocol.manaCost);
      expect(started.session.state.personalProtocol?.signatures.map((row) => row.characterId)).toEqual([
        "big-protocol-start-file-user-character"
      ]);
    } else {
      expect(mana.manaCurrent).toBe(10);
      expect(started.session.state.personalProtocol).toBeUndefined();
    }
  });

  it("CAS-orders raid start against signing and freezes only a committed signature", async () => {
    await seedCharacter(prisma, "big-protocol-start-sign-leader-user", 5097n, "Стартова Голова", {
      hp: 80,
      level: 8,
      classId: "class.bureaucramancer",
      manaCurrent: 10
    });
    await seedCharacter(prisma, "big-protocol-start-sign-signer-user", 5098n, "Стартовий Підпис", {
      hp: 80,
      level: 8
    });
    await partyRepository.createForTelegramUser(5097n, {
      ...partyInput("party-token-big-protocol-start-sign"),
      originLocationId: "barrel.big-brother"
    });
    await partyRepository.joinByTokenForTelegramUser(5098n, "party-token-big-protocol-start-sign", joinInput());
    await partyRepository.fileBureaucramancerPersonalProtocol(
      5097n,
      "party-token-big-protocol-start-sign",
      now()
    );

    const [started, signed] = await Promise.all([
      bossRepository.startFromRecruitingPartyForTelegramUser(5097n, {
        partyInviteToken: "party-token-big-protocol-start-sign",
        now: now(),
        turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
      }),
      partyRepository.signBureaucramancerPersonalProtocol(
        5098n,
        "party-token-big-protocol-start-sign",
        now()
      )
    ]);

    expect(started.state).toBe("started");
    expect(["updated", "not-recruiting"]).toContain(signed.state);
    if (!("session" in started)) {
      throw new Error(`Expected started session, got ${started.state}`);
    }
    const frozenSignerIds = started.session.state.personalProtocol?.signatures.map((row) => row.characterId) ?? [];
    expect(frozenSignerIds).toContain("big-protocol-start-sign-leader-user-character");
    if (signed.state === "updated") {
      expect(frozenSignerIds).toContain("big-protocol-start-sign-signer-user-character");
    } else {
      expect(frozenSignerIds).not.toContain("big-protocol-start-sign-signer-user-character");
    }
  });

  it("stores participant-specific Big Barrel Brother manatky instead of replaying the solo Barrel bundle", async () => {
    await seedCharacter(prisma, "big-varied-warrior-user", 5011n, "Бочкова Воячка", {
      hp: 80,
      level: 8,
      classId: "class.warrior",
      raceId: "race.human-ish",
      strength: 24,
      dexterity: 24
    });
    await seedCharacter(prisma, "big-varied-rogue-user", 5012n, "Бочковий Тінько", {
      hp: 80,
      level: 10,
      classId: "class.rogue",
      raceId: "race.bisyny",
      strength: 18,
      dexterity: 28
    });
    await partyRepository.createForTelegramUser(5011n, {
      ...partyInput("party-token-big-varied"),
      periodId: "2026-06-30T10:42",
      originLocationId: "barrel.big-brother"
    });
    await partyRepository.joinByTokenForTelegramUser(5012n, "party-token-big-varied", joinInput());

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(5011n, {
      partyInviteToken: "party-token-big-varied",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    expect(started.state).toBe("started");
    if (!("session" in started)) {
      throw new Error(`Expected started session, got ${started.state}`);
    }

    await forceBossToOneHp(prisma, started.session.id, started.session.state);
    await bossRepository.submitActionForTelegramUser(5011n, "party-token-big-varied", 1, "attack", resolveInput());
    const resolved = await bossRepository.submitActionForTelegramUser(
      5012n,
      "party-token-big-varied",
      1,
      "attack",
      resolveInput()
    );
    const latest = expectPartyBossSession(resolved);
    const rewards = latest.result?.participants.flatMap((participant) => participant.reward?.itemGrants ?? []) ?? [];
    const rewardIds = rewards.map((grant) => grant.itemId);
    const soloBundleIds = new Set([
      "item.apron-of-foam-resistance",
      "item.wet-hero-ticket",
      "item.barrel-splinter-of-optimism",
      "item.foam-cork-of-accounting",
      "item.mirage-foam-sample"
    ]);

    expect(resolved.state).toBe("resolved");
    expect(latest.status).toBe("won");
    expect(rewards).toHaveLength(2);
    expect(rewardIds.every((itemId) => itemId.startsWith("item.loot-v1-"))).toBe(true);
    expect(rewardIds.some((itemId) => soloBundleIds.has(itemId))).toBe(false);
    expect(new Set(rewardIds).size).toBeGreaterThan(1);
    await expect(prisma.characterItem.count({
      where: {
        characterId: {
          in: ["big-varied-warrior-user-character", "big-varied-rogue-user-character"]
        },
        itemId: {
          in: [...soloBundleIds]
        }
      }
    })).resolves.toBe(0);
  });

  it("dev-primes Big Barrel Brother victory and resolves boss-zero plus party-zero as a win", async () => {
    await seedCharacter(prisma, "big-dev-win-user", 5051n, "Dev Лідерка", {
      hp: 80,
      level: 8,
      strength: 24,
      dexterity: 24
    });
    await partyRepository.createForTelegramUser(5051n, {
      ...partyInput("party-token-big-dev-win"),
      periodId: "2026-06-30T10:23",
      originLocationId: "barrel.big-brother"
    });

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(5051n, {
      partyInviteToken: "party-token-big-dev-win",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    expect(started.state).toBe("started");
    if (!("session" in started)) {
      throw new Error(`Expected started session, got ${started.state}`);
    }

    await prisma.partyBossSession.update({
      where: { id: started.session.id },
      data: {
        stateJson: {
          ...started.session.state,
          participants: started.session.state.participants.map((participant) => ({
            ...participant,
            status: "knocked-out" as const,
            resources: {
              ...participant.resources,
              hp: 0
            }
          }))
        }
      }
    });

    const primed = await bossRepository.forceBigBarrelWinForTelegramUser(5051n, now());
    expect(primed.state).toBe("primed");
    if (!("session" in primed)) {
      throw new Error(`Expected primed session, got ${primed.state}`);
    }
    expect(primed.session.state.boss.hp).toBe(0);
    expect(primed.session.state.participants.every((participant) => participant.resources.hp === 0)).toBe(true);

    const resolved = await bossRepository.resolveTimedOutByToken(
      "party-token-big-dev-win",
      resolveInput(),
      "due"
    );
    const latest = expectPartyBossSession(resolved);

    expect(resolved.state).toBe("resolved");
    expect(latest.status).toBe("won");
    expect(latest.result?.status).toBe("won");
    expect(await prisma.activeCombatLease.count({ where: { kind: "party-boss", referenceId: latest.partySessionId } })).toBe(0);
  });

  it("grants Big Barrel Brother attempt XP on loss without writing Barrel success", async () => {
    await seedCharacter(prisma, "big-loss-xp-user", 5061n, "Смілива Програвальниця", {
      hp: 1,
      level: 8,
      xp: getLevelStartXp(9) - 1,
      strength: 8,
      dexterity: 8
    });
    await partyRepository.createForTelegramUser(5061n, {
      ...partyInput("party-token-big-loss-xp"),
      periodId: "2026-06-30T10:23",
      originLocationId: "barrel.big-brother"
    });

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(5061n, {
      partyInviteToken: "party-token-big-loss-xp",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    expect(started.state).toBe("started");
    if (!("session" in started)) {
      throw new Error(`Expected started session, got ${started.state}`);
    }

    await prisma.partyBossSession.update({
      where: { id: started.session.id },
      data: {
        stateJson: {
          ...started.session.state,
          participants: started.session.state.participants.map((participant) => ({
            ...participant,
            status: "knocked-out" as const,
            resources: {
              ...participant.resources,
              hp: 0
            },
            contribution: {
              ...participant.contribution,
              damageTaken: 1
            }
          }))
        }
      }
    });

    const resolved = await bossRepository.resolveTimedOutByToken(
      "party-token-big-loss-xp",
      resolveInput(),
      "due"
    );
    const latest = expectPartyBossSession(resolved);
    const character = await prisma.character.findUnique({
      where: { id: "big-loss-xp-user-character" },
      select: { xp: true, gold: true }
    });

    expect(latest.status).toBe("lost");
    expect(await prisma.hpRecoveryNotification.findUnique({
      where: { characterId: "big-loss-xp-user-character" }
    })).toMatchObject({ status: "waiting" });
    expect(resolved.achievementEvents).toEqual([
      {
        type: "barrel.raid.lost",
        characterId: "big-loss-xp-user-character",
        sourceId: started.session.id,
        occurredAt: resolveInput().now
      }
    ]);
    expect(character?.xp).toBeGreaterThan(0);
    expect(await prisma.character.findUnique({
      where: { id: "big-loss-xp-user-character" },
      select: { level: true }
    })).toEqual({ level: 9 });
    expect(character?.gold).toBe(0);
    await expect(prisma.characterCooldown.findUnique({
      where: {
        characterId_key: {
          characterId: "big-loss-xp-user-character",
          key: BIG_BARREL_BROTHER_LOSS_RETRY_COOLDOWN_KEY
        }
      },
      select: {
        availableAt: true
      }
    })).resolves.toEqual({
      availableAt: new Date(resolveInput().now.getTime() + 3 * 60_000)
    });
    expect(await prisma.dailyAction.count({
      where: {
        characterId: "big-loss-xp-user-character",
        key: "tavern.friday-barrel-raid",
        localDate: "2026-06-30T10:23"
      }
    })).toBe(0);
  });

  it("does not grant Big Barrel Brother attempt XP or loss event for timeout-only AFK", async () => {
    await seedCharacter(prisma, "big-loss-afk-user", 5062n, "Автозахисна", {
      hp: 1,
      level: 8,
      strength: 8,
      dexterity: 8
    });
    await partyRepository.createForTelegramUser(5062n, {
      ...partyInput("party-token-big-loss-afk"),
      periodId: "2026-06-30T10:23",
      originLocationId: "barrel.big-brother"
    });

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(5062n, {
      partyInviteToken: "party-token-big-loss-afk",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    expect(started.state).toBe("started");
    if (!("session" in started)) {
      throw new Error(`Expected started session, got ${started.state}`);
    }

    await prisma.partyBossSession.update({
      where: { id: started.session.id },
      data: {
        stateJson: {
          ...started.session.state,
          participants: started.session.state.participants.map((participant) => ({
            ...participant,
            status: "knocked-out" as const,
            resources: {
              ...participant.resources,
              hp: 0
            },
            contribution: {
              ...participant.contribution,
              timeoutActions: 1
            }
          }))
        }
      }
    });

    const resolved = await bossRepository.resolveTimedOutByToken(
      "party-token-big-loss-afk",
      resolveInput(),
      "due"
    );
    const latest = expectPartyBossSession(resolved);
    const character = await prisma.character.findUnique({
      where: { id: "big-loss-afk-user-character" },
      select: { xp: true }
    });

    expect(latest.status).toBe("lost");
    expect(resolved.achievementEvents).toBeUndefined();
    expect(character?.xp).toBe(0);
    expect(await prisma.characterCooldown.count({
      where: {
        characterId: "big-loss-afk-user-character",
        key: BIG_BARREL_BROTHER_LOSS_RETRY_COOLDOWN_KEY
      }
    })).toBe(0);
  });

  it("does not grant another Big loss attempt XP or event while loss retry cooldown is active", async () => {
    await seedCharacter(prisma, "big-loss-active-cooldown-user", 5063n, "Охолола Не До Кінця", {
      hp: 1,
      level: 8,
      strength: 8,
      dexterity: 8
    });
    await partyRepository.createForTelegramUser(5063n, {
      ...partyInput("party-token-big-loss-active-cooldown"),
      periodId: "2026-06-30T10:23",
      originLocationId: "barrel.big-brother"
    });
    await prisma.characterCooldown.create({
      data: {
        id: "big-loss-active-cooldown",
        characterId: "big-loss-active-cooldown-user-character",
        key: BIG_BARREL_BROTHER_LOSS_RETRY_COOLDOWN_KEY,
        availableAt: new Date(resolveInput().now.getTime() + 60_000)
      }
    });
    const party = await prisma.partySession.findUniqueOrThrow({
      where: { inviteToken: "party-token-big-loss-active-cooldown" },
      select: { id: true }
    });
    const state = {
      rulesVersion: "big-barrel-brother-v1",
      partySessionId: party.id,
      status: "active",
      turn: 1,
      boss: {
        monsterId: "big-barrel-brother",
        name: "Старший Брат Бочки",
        level: 8,
        hp: 23,
        hpMax: 23,
        attack: 13,
        armor: 4,
        resist: 2,
        dexterity: 9,
        tags: ["boss", "barrel"]
      },
      participants: [{
        characterId: "big-loss-active-cooldown-user-character",
        name: "Охолола Не До Кінця",
        remortCount: 0,
        status: "knocked-out",
        combatStats: {
          level: 8,
          hpMax: 1,
          manaMax: 10,
          raceId: "human",
          classId: "warrior",
          strength: 8,
          dexterity: 8,
          intelligence: 5,
          charisma: 5,
          luck: 5,
          armor: 2,
          resist: 1,
          weaponDamage: 3,
          spellPower: 2
        },
        resources: { hp: 0, hpMax: 1, mana: 10, manaMax: 10 },
        contribution: {
          submittedActions: 1,
          timeoutActions: 0,
          damageDealt: 0,
          damageTaken: 1
        }
      }],
      roundLog: [],
      startedAt: now().toISOString()
    };
    await prisma.partySession.update({
      where: { id: party.id },
      data: { status: "active" }
    });
    await prisma.partyBossSession.create({
      data: {
        id: "big-loss-active-cooldown-boss",
        partySessionId: party.id,
        leaderCharacterId: "big-loss-active-cooldown-user-character",
        status: "active",
        turn: 1,
        rulesVersion: "big-barrel-brother-v1",
        bossKey: "big-barrel-brother",
        stateJson: state,
        turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
      }
    });

    const resolved = await bossRepository.resolveTimedOutByToken(
      "party-token-big-loss-active-cooldown",
      resolveInput(),
      "due"
    );
    const character = await prisma.character.findUnique({
      where: { id: "big-loss-active-cooldown-user-character" },
      select: { xp: true }
    });

    expect(expectPartyBossSession(resolved).status).toBe("lost");
    expect(resolved.achievementEvents).toBeUndefined();
    expect(character?.xp).toBe(0);
  });

  it("blocks Big Barrel Brother start when a joined participant is under-level", async () => {
    await seedCharacter(prisma, "big-underlevel-leader-user", 5101n, "Досвідчена Лідерка", {
      hp: 80,
      level: 8,
      strength: 24,
      dexterity: 24
    });
    await seedCharacter(prisma, "big-underlevel-joiner-user", 5102n, "Ранній Запис", {
      hp: 40,
      level: 7,
      strength: 8,
      dexterity: 8
    });
    await partyRepository.createForTelegramUser(5101n, {
      ...partyInput("party-token-big-underlevel"),
      periodId: "2026-06-30T11:23",
      originLocationId: "barrel.big-brother"
    });
    const party = await prisma.partySession.findUniqueOrThrow({
      where: {
        inviteToken: "party-token-big-underlevel"
      },
      select: {
        id: true
      }
    });
    await prisma.partyParticipant.create({
      data: {
        id: "big-underlevel-legacy-participant",
        sessionId: party.id,
        characterId: "big-underlevel-joiner-user-character",
        remortCount: 0,
        status: "joined",
        joinSource: "deep-link",
        joinedAt: now(),
        snapshotJson: {},
        activeMembershipKey: "party-member:big-underlevel-joiner-user-character"
      }
    });

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(5101n, {
      partyInviteToken: "party-token-big-underlevel",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });

    expect(started).toEqual({ state: "ineligible" });
    expect(await prisma.partyBossSession.count({
      where: {
        partySession: {
          inviteToken: "party-token-big-underlevel"
        }
      }
    })).toBe(0);
    expect(await prisma.activeCombatLease.count({
      where: {
        characterId: {
          in: ["big-underlevel-leader-user-character", "big-underlevel-joiner-user-character"]
        }
      }
    })).toBe(0);
  });

  it("blocks Big Barrel Brother start when a joined participant is on loss retry cooldown", async () => {
    await seedCharacter(prisma, "big-loss-cooldown-leader-user", 5121n, "Ватажок", {
      hp: 80,
      level: 8,
      strength: 24,
      dexterity: 24
    });
    await seedCharacter(prisma, "big-loss-cooldown-joiner-user", 5122n, "Щойно Впала", {
      hp: 80,
      level: 8,
      strength: 24,
      dexterity: 24
    });
    await partyRepository.createForTelegramUser(5121n, {
      ...partyInput("party-token-big-start-loss-cooldown"),
      periodId: "2026-06-30T11:23",
      originLocationId: "barrel.big-brother"
    });
    await partyRepository.joinByTokenForTelegramUser(
      5122n,
      "party-token-big-start-loss-cooldown",
      joinInput()
    );
    await prisma.characterCooldown.create({
      data: {
        id: "big-start-loss-cooldown",
        characterId: "big-loss-cooldown-joiner-user-character",
        key: BIG_BARREL_BROTHER_LOSS_RETRY_COOLDOWN_KEY,
        availableAt: new Date(now().getTime() + 60_000)
      }
    });

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(5121n, {
      partyInviteToken: "party-token-big-start-loss-cooldown",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });

    expect(started).toEqual({ state: "ineligible" });
    expect(await prisma.partyBossSession.count({
      where: {
        partySession: {
          inviteToken: "party-token-big-start-loss-cooldown"
        }
      }
    })).toBe(0);
    expect(await prisma.activeCombatLease.count({
      where: {
        characterId: {
          in: ["big-loss-cooldown-leader-user-character", "big-loss-cooldown-joiner-user-character"]
        }
      }
    })).toBe(0);
  });

  it("allows a remorted level 3 participant to start and settle Big Barrel Brother", async () => {
    await seedCharacter(prisma, "big-remort-eligible-user", 5151n, "Памʼятлива Лідерка", {
      hp: 80,
      level: 3,
      strength: 24,
      dexterity: 24
    });
    await seedRemort(prisma, "big-remort-eligible-user-character", 1);
    await partyRepository.createForTelegramUser(5151n, {
      ...partyInput("party-token-big-remort-eligible"),
      periodId: "2026-06-30T11:23",
      originLocationId: "barrel.big-brother"
    });

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(5151n, {
      partyInviteToken: "party-token-big-remort-eligible",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    expect(started.state).toBe("started");
    if (!("session" in started)) {
      throw new Error(`Expected started session, got ${started.state}`);
    }
    expect(started.session.state.participants[0]?.remortCount).toBe(1);

    await forceBossToOneHp(prisma, started.session.id, started.session.state);
    const resolved = await bossRepository.submitActionForTelegramUser(
      5151n,
      "party-token-big-remort-eligible",
      1,
      "attack",
      resolveInput()
    );
    const latest = expectPartyBossSession(resolved);

    expect(latest.status).toBe("won");
    expect(resolved.achievementEvents).toMatchObject([
      {
        type: "barrel.raid.claimed",
        characterId: "big-remort-eligible-user-character",
        occurredAt: resolveInput().now
      }
    ]);
    expect(await prisma.dailyAction.count({
      where: {
        characterId: "big-remort-eligible-user-character",
        key: "tavern.friday-barrel-raid",
        localDate: "2026-06-30T11:23"
      }
    })).toBe(1);
  });

  it("blocks Big Barrel Brother start when a remorted participant is below level 3", async () => {
    await seedCharacter(prisma, "big-remort-underlevel-user", 5152n, "Занадто Свіжа", {
      hp: 80,
      level: 2,
      strength: 24,
      dexterity: 24
    });
    await seedRemort(prisma, "big-remort-underlevel-user-character", 1);
    await partyRepository.createForTelegramUser(5152n, {
      ...partyInput("party-token-big-remort-underlevel"),
      periodId: "2026-06-30T11:23",
      originLocationId: "barrel.big-brother"
    });

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(5152n, {
      partyInviteToken: "party-token-big-remort-underlevel",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });

    expect(started).toEqual({ state: "ineligible" });
    expect(await prisma.partyBossSession.count({
      where: {
        partySession: {
          inviteToken: "party-token-big-remort-underlevel"
        }
      }
    })).toBe(0);
  });

  it("skips duplicate Big Barrel Brother success and rewards if the participant completed the frozen period before settlement", async () => {
    await seedCharacter(prisma, "big-duplicate-user", 5201n, "Облікована Лідерка", {
      hp: 80,
      level: 8,
      strength: 24,
      dexterity: 24
    });
    await partyRepository.createForTelegramUser(5201n, {
      ...partyInput("party-token-big-duplicate"),
      periodId: "2026-06-30T12:23",
      originLocationId: "barrel.big-brother"
    });

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(5201n, {
      partyInviteToken: "party-token-big-duplicate",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    expect(started.state).toBe("started");
    if (!("session" in started)) {
      throw new Error(`Expected started session, got ${started.state}`);
    }

    await prisma.dailyAction.create({
      data: {
        characterId: "big-duplicate-user-character",
        key: "tavern.friday-barrel-raid",
        localDate: "2026-06-30T12:23",
        rewardXp: 1,
        rewardGold: 1,
        spentGold: 0,
        resultJson: { kind: "legacy-test-success" }
      }
    });
    const before = await prisma.character.findUniqueOrThrow({
      where: { id: "big-duplicate-user-character" },
      select: { xp: true, gold: true }
    });

    await forceBossToOneHp(prisma, started.session.id, started.session.state);
    const resolved = await bossRepository.submitActionForTelegramUser(
      5201n,
      "party-token-big-duplicate",
      1,
      "attack",
      resolveInput()
    );
    const latest = expectPartyBossSession(resolved);

    expect(latest.status).toBe("won");
    expect(resolved.achievementEvents).toBeUndefined();
    expect(await prisma.dailyAction.count({
      where: {
        characterId: "big-duplicate-user-character",
        key: "tavern.friday-barrel-raid",
        localDate: "2026-06-30T12:23"
      }
    })).toBe(1);
    await expect(prisma.character.findUniqueOrThrow({
      where: { id: "big-duplicate-user-character" },
      select: { xp: true, gold: true }
    })).resolves.toEqual(before);
    expect(await prisma.characterItem.count({
      where: { characterId: "big-duplicate-user-character" }
    })).toBe(0);
  });

  it("skips Big Barrel Brother rewards when current level drops below the frozen eligibility gate before settlement", async () => {
    await seedCharacter(prisma, "big-level-drop-user", 5301n, "Занижена Лідерка", {
      hp: 80,
      level: 8,
      strength: 24,
      dexterity: 24
    });
    await partyRepository.createForTelegramUser(5301n, {
      ...partyInput("party-token-big-level-drop"),
      periodId: "2026-06-30T13:23",
      originLocationId: "barrel.big-brother"
    });

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(5301n, {
      partyInviteToken: "party-token-big-level-drop",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    expect(started.state).toBe("started");
    if (!("session" in started)) {
      throw new Error(`Expected started session, got ${started.state}`);
    }

    await prisma.character.update({
      where: { id: "big-level-drop-user-character" },
      data: { level: 7 }
    });
    const before = await prisma.character.findUniqueOrThrow({
      where: { id: "big-level-drop-user-character" },
      select: { xp: true, gold: true }
    });

    await forceBossToOneHp(prisma, started.session.id, started.session.state);
    const resolved = await bossRepository.submitActionForTelegramUser(
      5301n,
      "party-token-big-level-drop",
      1,
      "attack",
      resolveInput()
    );
    const latest = expectPartyBossSession(resolved);

    expect(latest.status).toBe("won");
    expect(await prisma.dailyAction.count({
      where: {
        characterId: "big-level-drop-user-character",
        key: "tavern.friday-barrel-raid",
        localDate: "2026-06-30T13:23"
      }
    })).toBe(0);
    await expect(prisma.character.findUniqueOrThrow({
      where: { id: "big-level-drop-user-character" },
      select: { xp: true, gold: true }
    })).resolves.toEqual(before);
    expect(await prisma.characterItem.count({
      where: { characterId: "big-level-drop-user-character" }
    })).toBe(0);
  });

  it("skips Big Barrel Brother rewards when current remort count no longer matches the frozen participant", async () => {
    await seedCharacter(prisma, "big-remort-user", 5401n, "Нова Лідерка", {
      hp: 80,
      level: 8,
      strength: 24,
      dexterity: 24
    });
    await partyRepository.createForTelegramUser(5401n, {
      ...partyInput("party-token-big-remort"),
      periodId: "2026-06-30T14:23",
      originLocationId: "barrel.big-brother"
    });

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(5401n, {
      partyInviteToken: "party-token-big-remort",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    expect(started.state).toBe("started");
    if (!("session" in started)) {
      throw new Error(`Expected started session, got ${started.state}`);
    }

    await prisma.characterRemort.create({
      data: {
        id: "big-remort-user-remort-1",
        characterId: "big-remort-user-character",
        token: "big-remort-token-1",
        remortNumber: 1,
        previousLevel: 8,
        previousXp: 0,
        previousGold: 0,
        displayNameSnapshot: "Нова Лідерка",
        preservedPayloadJson: {}
      }
    });
    const before = await prisma.character.findUniqueOrThrow({
      where: { id: "big-remort-user-character" },
      select: { xp: true, gold: true, hpCurrent: true, manaCurrent: true }
    });

    await forceBossToOneHp(prisma, started.session.id, started.session.state);
    const resolved = await bossRepository.submitActionForTelegramUser(
      5401n,
      "party-token-big-remort",
      1,
      "attack",
      resolveInput()
    );
    const latest = expectPartyBossSession(resolved);

    expect(latest.status).toBe("won");
    expect(await prisma.dailyAction.count({
      where: {
        characterId: "big-remort-user-character",
        key: "tavern.friday-barrel-raid",
        localDate: "2026-06-30T14:23"
      }
    })).toBe(0);
    await expect(prisma.character.findUniqueOrThrow({
      where: { id: "big-remort-user-character" },
      select: { xp: true, gold: true, hpCurrent: true, manaCurrent: true }
    })).resolves.toEqual(before);
    expect(await prisma.characterItem.count({
      where: { characterId: "big-remort-user-character" }
    })).toBe(0);
  });
});

function now(): Date {
  return new Date("2026-06-30T10:00:00.000Z");
}

function resolveInput() {
  return {
    now: now(),
    nextTurnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
  };
}

async function forceBossToOneHp(
  prisma: PrismaClient,
  sessionId: string,
  state: PartyBossSessionRecord["state"]
): Promise<void> {
  await prisma.partyBossSession.update({
    where: { id: sessionId },
    data: {
      stateJson: {
        ...state,
        boss: {
          ...state.boss,
          hp: 0,
          hpMax: 1,
          dexterity: 0
        }
      }
    }
  });
}

function partyInput(inviteToken: string) {
  return {
    inviteToken,
    participantCap: 8,
    minimumParticipants: 1,
    joinUntilAt: new Date("2026-06-30T10:13:00.000Z"),
    expiresAt: new Date("2026-06-30T10:13:00.000Z"),
    now: now(),
    periodId: "12026-06-30",
    originLocationId: "korchma.board",
    chatId: 587n,
    messageId: 13
  };
}

function joinInput() {
  return {
    joinSource: "deep-link" as const,
    now: now(),
    chatId: 587n,
    messageId: 23
  };
}

async function seedCharacter(
  prisma: PrismaClient,
  userId: string,
  telegramUserId: bigint,
  name: string,
  options: {
    hp?: number;
    hpCurrent?: number;
    hpMax?: number;
    manaCurrent?: number;
    manaMax?: number;
    level?: number;
    xp?: number;
    raceId?: string;
    classId?: string;
    strength?: number;
    dexterity?: number;
    intelligence?: number;
    equipment?: Array<{ slot: string; itemId: string }>;
  } = {}
): Promise<void> {
  const hp = options.hp ?? 25;
  const strength = options.strength ?? 8;
  const dexterity = options.dexterity ?? 6;
  await prisma.user.create({
    data: {
      id: userId,
      telegramUserId,
      lastSeenLocationId: "korchma.board",
      character: {
        create: {
          id: `${userId}-character`,
          name,
          raceId: options.raceId ?? "race.human-ish",
          classId: options.classId ?? "class.warrior",
          level: options.level ?? 3,
          xp: options.xp ?? 0,
          hpCurrent: options.hpCurrent ?? hp,
          hpMax: options.hpMax ?? hp,
          manaCurrent: options.manaCurrent ?? 10,
          manaMax: options.manaMax ?? 10,
          statsJson: {
            strength,
            dexterity,
            intelligence: options.intelligence ?? 5,
            charisma: 5,
            luck: 5
          },
          ...(options.equipment
            ? {
                equipment: {
                  create: options.equipment
                }
              }
            : {})
        }
      }
    }
  });
}

async function seedRemort(prisma: PrismaClient, characterId: string, remortNumber: number): Promise<void> {
  await prisma.characterRemort.create({
    data: {
      id: `${characterId}-remort-${remortNumber}`,
      characterId,
      token: `${characterId}-remort-token-${remortNumber}`,
      remortNumber,
      previousLevel: 13,
      previousXp: 587,
      previousGold: 42,
      displayNameSnapshot: "Памʼять Бочки",
      preservedPayloadJson: {}
    }
  });
}

async function createMinimalSchema(prisma: PrismaClient): Promise<void> {
  for (const statement of [
    `CREATE TABLE users (
      id TEXT PRIMARY KEY,
      telegram_user_id INTEGER NOT NULL UNIQUE,
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
      id TEXT PRIMARY KEY,
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
    `CREATE TABLE hp_recovery_notifications (
      id TEXT NOT NULL PRIMARY KEY,
      character_id TEXT NOT NULL UNIQUE,
      generation INTEGER NOT NULL DEFAULT 1,
      remort_count INTEGER NOT NULL DEFAULT 0,
      source_hp_current INTEGER NOT NULL,
      source_hp_max INTEGER NOT NULL,
      source_hp_regen_at DATETIME,
      source_fingerprint TEXT,
      status TEXT NOT NULL DEFAULT 'waiting',
      next_attempt_at DATETIME NOT NULL,
      processing_started_at DATETIME,
      ready_at DATETIME,
      sent_at DATETIME,
      suppressed_at DATETIME,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      last_error_code TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE character_drink_states (
      id TEXT PRIMARY KEY,
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
      id TEXT PRIMARY KEY,
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
    `CREATE TABLE active_combat_leases (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL,
      reference_id TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE party_sessions (
      id TEXT PRIMARY KEY,
      invite_token TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'recruiting',
      leader_character_id TEXT NOT NULL,
      period_id TEXT,
      origin_location_id TEXT,
      participant_cap INTEGER NOT NULL DEFAULT 8,
      minimum_participants INTEGER NOT NULL DEFAULT 1,
      join_until_at DATETIME NOT NULL,
      expires_at DATETIME NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      active_leader_key TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE party_participants (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      character_id TEXT NOT NULL,
      remort_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'joined',
      join_source TEXT NOT NULL,
      joined_at DATETIME NOT NULL,
      left_at DATETIME,
      snapshot_json JSONB,
      chat_id INTEGER,
      message_id INTEGER,
      active_membership_key TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE party_boss_sessions (
      id TEXT PRIMARY KEY,
      party_session_id TEXT NOT NULL,
      leader_character_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      turn INTEGER NOT NULL DEFAULT 1,
      version INTEGER NOT NULL DEFAULT 1,
      rules_version TEXT NOT NULL,
      boss_key TEXT NOT NULL,
      state_json JSONB NOT NULL,
      result_json JSONB,
      turn_expires_at DATETIME NOT NULL,
      completed_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE party_boss_actions (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      actor_character_id TEXT NOT NULL,
      turn INTEGER NOT NULL,
      action_key TEXT NOT NULL,
      result_json JSONB,
      submitted_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE daily_actions (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      key TEXT NOT NULL,
      local_date TEXT NOT NULL,
      reward_xp INTEGER NOT NULL DEFAULT 0,
      reward_gold INTEGER NOT NULL DEFAULT 0,
      spent_gold INTEGER NOT NULL DEFAULT 0,
      result_json JSONB,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE character_cooldowns (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      key TEXT NOT NULL,
      available_at DATETIME NOT NULL,
      result_json JSONB,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE character_items (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE character_equipment (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      slot TEXT NOT NULL,
      item_id TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE mantok_chest_runs (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      token TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      input_items_json JSONB NOT NULL,
      output_items_json JSONB,
      average_input_score INTEGER NOT NULL DEFAULT 0,
      minimum_output_score INTEGER NOT NULL DEFAULT 0,
      output_score INTEGER,
      completed_at DATETIME,
      expired_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE korchma_mantok_sales (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL,
      character_id TEXT NOT NULL,
      remort_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      selection_json JSONB NOT NULL,
      selection_fingerprint TEXT NOT NULL,
      nominal_value INTEGER NOT NULL DEFAULT 0,
      payout_gold INTEGER NOT NULL DEFAULT 0,
      result_json JSONB,
      expires_at DATETIME NOT NULL,
      completed_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE item_transfers (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL,
      transfer_kind TEXT NOT NULL DEFAULT 'gift',
      sender_character_id TEXT NOT NULL,
      receiver_character_id TEXT NOT NULL,
      sender_telegram_user_id INTEGER NOT NULL,
      receiver_telegram_user_id INTEGER NOT NULL,
      sender_name TEXT NOT NULL,
      receiver_name TEXT NOT NULL,
      sender_remort_count INTEGER NOT NULL DEFAULT 0,
      receiver_remort_count INTEGER NOT NULL DEFAULT 0,
      location_id TEXT,
      item_id TEXT NOT NULL,
      item_name TEXT NOT NULL,
      item_fingerprint TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      package_json JSONB,
      delivery_fee_gold INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      reservation_key TEXT,
      result_json JSONB,
      expires_at DATETIME NOT NULL,
      completed_at DATETIME,
      responded_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE item_use_orders (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL,
      character_id TEXT NOT NULL,
      telegram_user_id INTEGER NOT NULL,
      remort_count INTEGER NOT NULL DEFAULT 0,
      item_id TEXT NOT NULL,
      item_name TEXT NOT NULL,
      item_fingerprint TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      effect_kind TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      reservation_key TEXT,
      preview_json JSONB NOT NULL,
      result_json JSONB,
      expires_at DATETIME NOT NULL,
      completed_at DATETIME,
      cancelled_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE level_barter_exchanges (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      token TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'completed',
      input_items_json JSONB NOT NULL,
      spent_gold INTEGER NOT NULL DEFAULT 0,
      level_before INTEGER NOT NULL DEFAULT 1,
      level_after INTEGER NOT NULL DEFAULT 1,
      xp_before INTEGER NOT NULL DEFAULT 0,
      xp_after INTEGER NOT NULL DEFAULT 0,
      xp_carry INTEGER NOT NULL DEFAULT 0,
      item_total_value INTEGER NOT NULL DEFAULT 0,
      selected_total_value INTEGER NOT NULL DEFAULT 0,
      overpay INTEGER NOT NULL DEFAULT 0,
      completed_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX party_sessions_invite_token_key ON party_sessions(invite_token)`,
    `CREATE UNIQUE INDEX party_sessions_active_leader_key_key ON party_sessions(active_leader_key)`,
    `CREATE UNIQUE INDEX party_participants_active_membership_key_key ON party_participants(active_membership_key)`,
    `CREATE UNIQUE INDEX party_participants_session_id_character_id_key ON party_participants(session_id, character_id)`,
    `CREATE UNIQUE INDEX party_boss_sessions_party_session_id_key ON party_boss_sessions(party_session_id)`,
    `CREATE UNIQUE INDEX party_boss_actions_session_id_turn_actor_character_id_key ON party_boss_actions(session_id, turn, actor_character_id)`,
    `CREATE UNIQUE INDEX daily_actions_character_id_key_local_date_key ON daily_actions(character_id, key, local_date)`,
    `CREATE UNIQUE INDEX character_cooldowns_character_id_key_key ON character_cooldowns(character_id, key)`,
    `CREATE UNIQUE INDEX character_items_character_id_item_id_key ON character_items(character_id, item_id)`,
    `CREATE UNIQUE INDEX character_equipment_character_id_slot_key ON character_equipment(character_id, slot)`,
    `CREATE UNIQUE INDEX item_transfers_reservation_key_key ON item_transfers(reservation_key)`,
    `CREATE UNIQUE INDEX item_use_orders_reservation_key_key ON item_use_orders(reservation_key)`
  ]) {
    await prisma.$executeRawUnsafe(statement);
  }
}
