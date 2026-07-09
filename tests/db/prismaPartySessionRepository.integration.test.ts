import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPartySessionRepository } from "../../src/db/repositories/prismaPartySessionRepository";
import { BIG_BARREL_BROTHER_LOSS_RETRY_COOLDOWN_KEY } from "../../src/domain/partyBoss/partyBoss";

describe("PrismaPartySessionRepository integration", () => {
  let dir: string;
  let prisma: PrismaClient;
  let repository: PrismaPartySessionRepository;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "kvestarnia-party-repo-"));
    const databaseUrl = `file:${join(dir, "test.db").replace(/\\/g, "/")}`;
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl
        }
      }
    });
    await createMinimalSchema(prisma);
    repository = new PrismaPartySessionRepository(prisma);
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await rm(dir, { recursive: true, force: true });
  });

  it("creates one live leader session and replays duplicate create", async () => {
    await seedCharacter(prisma, "leader-user", 1001n, "Лідерка");

    const created = await repository.createForTelegramUser(1001n, partyInput("party-token-a"));
    const duplicate = await repository.createForTelegramUser(1001n, partyInput("party-token-b"));

    expect(created.state).toBe("created");
    expect(duplicate.state).toBe("live");
    expect("session" in duplicate ? duplicate.session.inviteToken : null).toBe("party-token-a");
    expect(await prisma.partySession.count()).toBe(1);
    expect(await prisma.partyParticipant.count()).toBe(1);
  });

  it("joins, blocks a second live membership, and reuses left rows on rejoin", async () => {
    await seedCharacter(prisma, "leader-two-user", 2001n, "Провідник");
    await seedCharacter(prisma, "joiner-user", 2002n, "Долученець");
    await seedCharacter(prisma, "other-leader-user", 2003n, "Інша");

    const first = await repository.createForTelegramUser(2001n, partyInput("party-token-c"));
    const other = await repository.createForTelegramUser(2003n, partyInput("party-token-d"));
    expect(first.state).toBe("created");
    expect(other.state).toBe("created");

    const joined = await repository.joinByTokenForTelegramUser(2002n, "party-token-c", joinInput());
    expect(joined.state).toBe("joined");
    const blocked = await repository.joinByTokenForTelegramUser(2002n, "party-token-d", joinInput());
    expect(blocked.state).toBe("live-membership");

    const left = await repository.leaveByTokenForTelegramUser(2002n, "party-token-c", now());
    expect(left.state).toBe("left");
    const rejoined = await repository.joinByTokenForTelegramUser(2002n, "party-token-c", joinInput("dev"));

    expect(rejoined.state).toBe("joined");
    expect(await prisma.partyParticipant.count({
      where: {
        session: {
          inviteToken: "party-token-c"
        },
        character: {
          user: {
            telegramUserId: 2002n
          }
        }
      }
    })).toBe(1);
  });

  it("switches from own solo Big Barrel recruiting into a selected Big Barrel raid", async () => {
    await seedCharacter(prisma, "switcher-user", 2101n, "Перемикач", { level: 8 });
    await seedCharacter(prisma, "target-leader-user", 2102n, "Ватажок", { level: 8 });

    const own = await repository.createForTelegramUser(2101n, bigBarrelInput("party-token-switch-own"));
    const target = await repository.createForTelegramUser(2102n, bigBarrelInput("party-token-switch-target"));
    expect(own.state).toBe("created");
    expect(target.state).toBe("created");

    const joined = await repository.joinByTokenForTelegramUser(
      2101n,
      "party-token-switch-target",
      joinInput("nearby")
    );

    expect(joined.state).toBe("joined");
    expect("session" in joined ? joined.session.inviteToken : null).toBe("party-token-switch-target");
    expect(joined.state === "joined" ? joined.cancelledSoloSession?.inviteToken : null).toBe("party-token-switch-own");
    expect(joined.state === "joined" ? joined.cancelledSoloSession?.status : null).toBe("cancelled");
    expect("session" in joined ? joined.session.participants.filter((row) => row.status === "joined").map((row) => row.character.telegramUserId).sort() : []).toEqual([2101n, 2102n]);
    expect(await prisma.partySession.findUnique({
      where: { inviteToken: "party-token-switch-own" },
      select: { status: true, activeLeaderKey: true }
    })).toEqual({ status: "cancelled", activeLeaderKey: null });
    expect(await prisma.partyParticipant.count({
      where: {
        session: {
          inviteToken: "party-token-switch-own"
        },
        activeMembershipKey: {
          not: null
        }
      }
    })).toBe(0);
  });

  it("stores participant raid readiness in the recruiting snapshot", async () => {
    await seedCharacter(prisma, "readiness-leader-user", 2111n, "Готова", { level: 8 });
    await seedCharacter(prisma, "readiness-member-user", 2112n, "Дохиляється", { level: 8 });

    const created = await repository.createForTelegramUser(2111n, bigBarrelInput("party-token-ready"));
    const joined = await repository.joinByTokenForTelegramUser(2112n, "party-token-ready", joinInput());
    const ready = await repository.setParticipantReadiness(2112n, "party-token-ready", "ready", now());
    const duplicate = await repository.setParticipantReadiness(2112n, "party-token-ready", "ready", now());
    const waiting = await repository.setParticipantReadiness(2112n, "party-token-ready", "waiting", now());

    expect(created.state).toBe("created");
    expect(joined.state).toBe("joined");
    expect(readinessByTelegramUser(joined)).toEqual({
      "2111": "waiting",
      "2112": "waiting"
    });
    expect(ready.state).toBe("updated");
    expect(readinessByTelegramUser(ready)).toEqual({
      "2111": "waiting",
      "2112": "ready"
    });
    expect(duplicate.state).toBe("already-set");
    expect(waiting.state).toBe("updated");
    expect(readinessByTelegramUser(waiting)).toEqual({
      "2111": "waiting",
      "2112": "waiting"
    });
  });

  it("stores Kharakternyk ward sign placement and support without double spending mana", async () => {
    await seedCharacter(prisma, "ward-leader-user", 2131n, "Р—РЅР°РєР°СЂ", {
      level: 8,
      classId: "class.kharakternyk",
      manaCurrent: 10,
      statsJson: { intelligence: 13 }
    });
    await seedCharacter(prisma, "ward-support-user", 2132n, "РџС–РґРїРѕСЂР°", {
      level: 8,
      manaCurrent: 10,
      statsJson: { intelligence: 13 }
    });
    await repository.createForTelegramUser(2131n, bigBarrelInput("party-token-ward"));
    await repository.joinByTokenForTelegramUser(2132n, "party-token-ward", joinInput());

    const placed = await repository.placeKharakternykWardSign(2131n, "party-token-ward", now());
    const duplicatePlace = await repository.placeKharakternykWardSign(2131n, "party-token-ward", now());
    const supported = await repository.supportKharakternykWardSign(2132n, "party-token-ward", now());
    const duplicateSupport = await repository.supportKharakternykWardSign(2132n, "party-token-ward", now());

    expect(placed.state).toBe("updated");
    expect(duplicatePlace.state).toBe("already-placed");
    expect(supported.state).toBe("updated");
    expect(duplicateSupport.state).toBe("already-supported");
    expect("session" in supported ? supported.session.wardSign : null).toMatchObject({
      kind: "kharakternyk",
      placerCharacterId: "ward-leader-user-character",
      supportCount: 1,
      supportCap: 7
    });
    expect("session" in supported
      ? supported.session.participants.find((participant) => participant.character.telegramUserId === 2132n)?.wardSignSupport
      : null).toMatchObject({
      kind: "kharakternyk",
      placerCharacterId: "ward-leader-user-character",
      supporterCharacterId: "ward-support-user-character",
      manaCost: 1
    });
    await expect(prisma.character.findMany({
      where: {
        id: {
          in: ["ward-leader-user-character", "ward-support-user-character"]
        }
      },
      orderBy: { id: "asc" },
      select: { id: true, manaCurrent: true }
    })).resolves.toEqual([
      { id: "ward-leader-user-character", manaCurrent: 5 },
      { id: "ward-support-user-character", manaCurrent: 9 }
    ]);
  });

  it("commits only one Kharakternyk ward sign when two eligible placers race", async () => {
    await seedCharacter(prisma, "ward-race-one-user", 2133n, "Перший Знакар", {
      level: 8,
      classId: "class.kharakternyk",
      manaCurrent: 10,
      statsJson: { intelligence: 13 }
    });
    await seedCharacter(prisma, "ward-race-two-user", 2134n, "Другий Знакар", {
      level: 8,
      classId: "class.kharakternyk",
      manaCurrent: 10,
      statsJson: { intelligence: 13 }
    });
    await seedCharacter(prisma, "ward-race-support-user", 2135n, "Підпора", {
      level: 8,
      manaCurrent: 10,
      statsJson: { intelligence: 13 }
    });
    await repository.createForTelegramUser(2133n, bigBarrelInput("party-token-ward-race"));
    await repository.joinByTokenForTelegramUser(2134n, "party-token-ward-race", joinInput());
    await repository.joinByTokenForTelegramUser(2135n, "party-token-ward-race", joinInput());

    const placementResults = await Promise.all([
      repository.placeKharakternykWardSign(2133n, "party-token-ward-race", now()),
      repository.placeKharakternykWardSign(2134n, "party-token-ward-race", now())
    ]);

    expect(placementResults.map((result) => result.state).sort()).toEqual(["already-exists", "updated"]);
    const winner = placementResults.find((result) => result.state === "updated");
    const winningPlacerCharacterId = winner && "session" in winner
      ? winner.session.wardSign?.placerCharacterId
      : null;
    expect(winningPlacerCharacterId).toMatch(/^ward-race-(one|two)-user-character$/);
    const losingPlacerCharacterId = winningPlacerCharacterId === "ward-race-one-user-character"
      ? "ward-race-two-user-character"
      : "ward-race-one-user-character";
    const winnerTelegramUserId = winningPlacerCharacterId === "ward-race-one-user-character" ? 2133n : 2134n;

    const duplicateWinner = await repository.placeKharakternykWardSign(winnerTelegramUserId, "party-token-ward-race", now());
    const supported = await repository.supportKharakternykWardSign(2135n, "party-token-ward-race", now());
    const duplicateSupport = await repository.supportKharakternykWardSign(2135n, "party-token-ward-race", now());

    expect(duplicateWinner.state).toBe("already-placed");
    expect(supported.state).toBe("updated");
    expect(duplicateSupport.state).toBe("already-supported");
    expect("session" in supported ? supported.session.wardSign : null).toMatchObject({
      kind: "kharakternyk",
      placerCharacterId: winningPlacerCharacterId,
      supportCount: 1,
      supportCap: 7
    });
    expect("session" in supported
      ? supported.session.participants.find((participant) => participant.character.telegramUserId === 2135n)?.wardSignSupport
      : null).toMatchObject({
      kind: "kharakternyk",
      placerCharacterId: winningPlacerCharacterId,
      supporterCharacterId: "ward-race-support-user-character",
      manaCost: 1
    });

    const manaRows = await prisma.character.findMany({
      where: {
        id: {
          in: [
            "ward-race-one-user-character",
            "ward-race-two-user-character",
            "ward-race-support-user-character"
          ]
        }
      },
      orderBy: { id: "asc" },
      select: { id: true, manaCurrent: true }
    });
    const manaByCharacterId = Object.fromEntries(manaRows.map((row) => [row.id, row.manaCurrent]));
    expect(manaByCharacterId[winningPlacerCharacterId!]).toBe(5);
    expect(manaByCharacterId[losingPlacerCharacterId]).toBe(10);
    expect(manaByCharacterId["ward-race-support-user-character"]).toBe(9);

    const snapshots = await prisma.partyParticipant.findMany({
      where: {
        session: {
          inviteToken: "party-token-ward-race"
        }
      },
      select: {
        snapshotJson: true
      }
    });
    expect(snapshots.filter((row) => hasKharakternykWardSignSnapshot(row.snapshotJson))).toHaveLength(1);
  });

  it("records the actual sent recruiting card message reference for a joined participant", async () => {
    await seedCharacter(prisma, "message-ref-user", 2151n, "Карткова", { level: 8 });
    await repository.createForTelegramUser(2151n, {
      ...bigBarrelInput("party-token-message-ref"),
      chatId: null,
      messageId: null
    });

    const updated = await repository.recordParticipantMessageReference(2151n, "party-token-message-ref", {
      chatId: 2151n,
      messageId: 42,
      now: now()
    });

    expect(updated?.participants.find((row) => row.character.telegramUserId === 2151n)).toMatchObject({
      chatId: 2151n,
      messageId: 42
    });
    await expect(prisma.partyParticipant.findFirstOrThrow({
      where: {
        session: {
          inviteToken: "party-token-message-ref"
        }
      },
      select: {
        chatId: true,
        messageId: true
      }
    })).resolves.toEqual({
      chatId: 2151n,
      messageId: 42
    });
  });

  it("rejects non-remorted level 7 Big Barrel recruiting joins without mutation", async () => {
    await seedCharacter(prisma, "big-leader-l7-user", 2201n, "Ватажок", { level: 8 });
    await seedCharacter(prisma, "big-joiner-l7-user", 2202n, "Сьомий", { level: 7 });
    await repository.createForTelegramUser(2201n, bigBarrelInput("party-token-big-l7"));

    const joined = await repository.joinByTokenForTelegramUser(2202n, "party-token-big-l7", joinInput());

    expect(joined.state).toBe("ineligible");
    expect(joined.state === "ineligible" ? joined.reason : null).toBe("level-gate");
    await expectNoMembership(prisma, "party-token-big-l7", 2202n);
  });

  it("rejects remorted level 2 Big Barrel recruiting joins without mutation", async () => {
    await seedCharacter(prisma, "big-leader-r2-user", 2301n, "Ватажок", { level: 8 });
    await seedCharacter(prisma, "big-joiner-r2-user", 2302n, "Другожиттєвий", {
      level: 2,
      remortCount: 1
    });
    await repository.createForTelegramUser(2301n, bigBarrelInput("party-token-big-r2"));

    const joined = await repository.joinByTokenForTelegramUser(2302n, "party-token-big-r2", joinInput());

    expect(joined.state).toBe("ineligible");
    expect(joined.state === "ineligible" ? joined.reason : null).toBe("level-gate");
    await expectNoMembership(prisma, "party-token-big-r2", 2302n);
  });

  it("allows remorted level 3 Big Barrel recruiting joins", async () => {
    await seedCharacter(prisma, "big-leader-r3-user", 2401n, "Ватажок", { level: 8 });
    await seedCharacter(prisma, "big-joiner-r3-user", 2402n, "Третєжиттєвий", {
      level: 3,
      remortCount: 1
    });
    await repository.createForTelegramUser(2401n, bigBarrelInput("party-token-big-r3"));

    const joined = await repository.joinByTokenForTelegramUser(2402n, "party-token-big-r3", joinInput());

    expect(joined.state).toBe("joined");
    expect("session" in joined ? joined.session.participants.some((row) => row.character.telegramUserId === 2402n && row.remortCount === 1) : false).toBe(true);
  });

  it("allows non-remorted level 8 Big Barrel recruiting joins", async () => {
    await seedCharacter(prisma, "big-leader-l8-user", 2501n, "Ватажок", { level: 8 });
    await seedCharacter(prisma, "big-joiner-l8-user", 2502n, "Восьмий", { level: 8 });
    await repository.createForTelegramUser(2501n, bigBarrelInput("party-token-big-l8"));

    const joined = await repository.joinByTokenForTelegramUser(2502n, "party-token-big-l8", joinInput());

    expect(joined.state).toBe("joined");
  });

  it("blocks creating another Big Barrel recruiting party during active loss retry cooldown", async () => {
    await seedCharacter(prisma, "big-create-cooldown-user", 2551n, "Недавно Програла", { level: 8 });
    await prisma.characterCooldown.create({
      data: {
        id: "big-create-cooldown",
        characterId: "big-create-cooldown-user-character",
        key: BIG_BARREL_BROTHER_LOSS_RETRY_COOLDOWN_KEY,
        availableAt: new Date(now().getTime() + 60_000)
      }
    });

    const blocked = await repository.createForTelegramUser(
      2551n,
      bigBarrelInput("party-token-big-create-cooldown")
    );

    expect(blocked.state).toBe("ineligible");
    expect(blocked.state === "ineligible" ? blocked.reason : null).toBe("loss-cooldown");
    if (blocked.state !== "ineligible" || blocked.reason !== "loss-cooldown") {
      throw new Error("Expected loss cooldown blocker.");
    }
    expect(blocked.availableAt).toEqual(new Date(now().getTime() + 60_000));
    expect(await prisma.partySession.count({
      where: {
        inviteToken: "party-token-big-create-cooldown"
      }
    })).toBe(0);
  });

  it("allows Big Barrel recruiting again after loss retry cooldown expires", async () => {
    await seedCharacter(prisma, "big-create-cooldown-expired-user", 2552n, "Вже Перепочила", { level: 8 });
    await prisma.characterCooldown.create({
      data: {
        id: "big-create-cooldown-expired",
        characterId: "big-create-cooldown-expired-user-character",
        key: BIG_BARREL_BROTHER_LOSS_RETRY_COOLDOWN_KEY,
        availableAt: new Date(now().getTime() - 1)
      }
    });

    const created = await repository.createForTelegramUser(
      2552n,
      bigBarrelInput("party-token-big-create-cooldown-expired")
    );

    expect(created.state).toBe("created");
  });

  it("rejects Big Barrel recruiting joins during active loss retry cooldown without mutation", async () => {
    await seedCharacter(prisma, "big-leader-loss-cooldown-user", 2553n, "Ватажок", { level: 8 });
    await seedCharacter(prisma, "big-joiner-loss-cooldown-user", 2554n, "Щойно Впала", { level: 8 });
    await repository.createForTelegramUser(2553n, bigBarrelInput("party-token-big-join-loss-cooldown"));
    await prisma.characterCooldown.create({
      data: {
        id: "big-join-loss-cooldown",
        characterId: "big-joiner-loss-cooldown-user-character",
        key: BIG_BARREL_BROTHER_LOSS_RETRY_COOLDOWN_KEY,
        availableAt: new Date(now().getTime() + 60_000)
      }
    });

    const joined = await repository.joinByTokenForTelegramUser(
      2554n,
      "party-token-big-join-loss-cooldown",
      joinInput()
    );

    expect(joined.state).toBe("ineligible");
    expect(joined.state === "ineligible" ? joined.reason : null).toBe("loss-cooldown");
    if (joined.state !== "ineligible" || joined.reason !== "loss-cooldown") {
      throw new Error("Expected loss cooldown blocker.");
    }
    expect(joined.availableAt).toEqual(new Date(now().getTime() + 60_000));
    await expectNoMembership(prisma, "party-token-big-join-loss-cooldown", 2554n);
  });

  it("rejects already-completed frozen-period Big Barrel recruiting joins without mutation", async () => {
    await seedCharacter(prisma, "big-leader-done-user", 2601n, "Ватажок", { level: 8 });
    await seedCharacter(prisma, "big-joiner-done-user", 2602n, "Архівний", { level: 8 });
    await repository.createForTelegramUser(2601n, bigBarrelInput("party-token-big-done"));
    await prisma.dailyAction.create({
      data: {
        id: "big-joiner-done-action",
        characterId: "big-joiner-done-user-character",
        key: "tavern.friday-barrel-raid",
        localDate: "12026-06-29",
        rewardXp: 23,
        rewardGold: 13
      }
    });

    const joined = await repository.joinByTokenForTelegramUser(2602n, "party-token-big-done", joinInput());

    expect(joined.state).toBe("ineligible");
    expect(joined.state === "ineligible" ? joined.reason : null).toBe("already-completed");
    await expectNoMembership(prisma, "party-token-big-done", 2602n);
  });

  it("rejects active-combat Big Barrel recruiting joins without mutation", async () => {
    await seedCharacter(prisma, "big-leader-combat-user", 2701n, "Ватажок", { level: 8 });
    await seedCharacter(prisma, "big-joiner-combat-user", 2702n, "Зайнятий", { level: 8 });
    await repository.createForTelegramUser(2701n, bigBarrelInput("party-token-big-combat"));
    await prisma.activeCombatLease.create({
      data: {
        id: "big-joiner-combat-lease",
        characterId: "big-joiner-combat-user-character",
        kind: "persistent-fight",
        referenceId: "fight-1"
      }
    });

    const joined = await repository.joinByTokenForTelegramUser(2702n, "party-token-big-combat", joinInput());

    expect(joined.state).toBe("ineligible");
    expect(joined.state === "ineligible" ? joined.reason : null).toBe("active-combat");
    await expectNoMembership(prisma, "party-token-big-combat", 2702n);
  });

  it("keeps non-Big under-level party joins unchanged", async () => {
    await seedCharacter(prisma, "plain-leader-user", 2801n, "Звичайний");
    await seedCharacter(prisma, "plain-joiner-user", 2802n, "Першорівневий");
    await repository.createForTelegramUser(2801n, partyInput("party-token-plain-underlevel"));

    const joined = await repository.joinByTokenForTelegramUser(
      2802n,
      "party-token-plain-underlevel",
      joinInput()
    );

    expect(joined.state).toBe("joined");
  });

  it("transfers leadership on leader leave and cancels when the last member leaves", async () => {
    await seedCharacter(prisma, "leader-three-user", 3001n, "Перша");
    await seedCharacter(prisma, "joiner-three-user", 3002n, "Друга");

    await repository.createForTelegramUser(3001n, partyInput("party-token-e"));
    await repository.joinByTokenForTelegramUser(3002n, "party-token-e", joinInput());

    const transferred = await repository.leaveByTokenForTelegramUser(3001n, "party-token-e", now());
    expect(transferred.state).toBe("leader-transferred");
    expect("session" in transferred ? transferred.session.leader.telegramUserId : null).toBe(3002n);

    const cancelled = await repository.leaveByTokenForTelegramUser(3002n, "party-token-e", now());
    expect(cancelled.state).toBe("cancelled");
    expect("session" in cancelled ? cancelled.session.status : null).toBe("cancelled");
    expect(await prisma.partySession.findUnique({
      where: { inviteToken: "party-token-e" },
      select: { activeLeaderKey: true }
    })).toEqual({ activeLeaderKey: null });
  });

  it("replays cancelled state for duplicate leader cancel buttons", async () => {
    await seedCharacter(prisma, "leader-six-user", 6001n, "Скасовувачка");
    await repository.createForTelegramUser(6001n, partyInput("party-token-h"));

    const cancelled = await repository.cancelByTokenForTelegramUser(6001n, "party-token-h", now());
    const duplicate = await repository.cancelByTokenForTelegramUser(6001n, "party-token-h", now());

    expect(cancelled.state).toBe("cancelled");
    expect(duplicate.state).toBe("cancelled");
    expect("session" in duplicate ? duplicate.session.status : null).toBe("cancelled");
    expect("session" in duplicate ? duplicate.session.activeLeaderKey : "missing").toBeNull();
  });

  it("replays cancelled state for stale leave buttons after leader cancellation", async () => {
    await seedCharacter(prisma, "leader-seven-user", 7001n, "Очільниця");
    await seedCharacter(prisma, "joiner-seven-user", 7002n, "Стара Кнопка");
    await repository.createForTelegramUser(7001n, partyInput("party-token-i"));
    await repository.joinByTokenForTelegramUser(7002n, "party-token-i", joinInput());

    const cancelled = await repository.cancelByTokenForTelegramUser(7001n, "party-token-i", now());
    const staleLeave = await repository.leaveByTokenForTelegramUser(7002n, "party-token-i", now());

    expect(cancelled.state).toBe("cancelled");
    expect(staleLeave.state).toBe("cancelled");
    expect("session" in staleLeave ? staleLeave.session.status : null).toBe("cancelled");
  });

  it("replays cancelled state after last participant leave cancels the session", async () => {
    await seedCharacter(prisma, "leader-eight-user", 8001n, "Остання");
    await repository.createForTelegramUser(8001n, partyInput("party-token-j"));

    const cancelled = await repository.leaveByTokenForTelegramUser(8001n, "party-token-j", now());
    const duplicateLeave = await repository.leaveByTokenForTelegramUser(8001n, "party-token-j", now());
    const duplicateCancel = await repository.cancelByTokenForTelegramUser(8001n, "party-token-j", now());

    expect(cancelled.state).toBe("cancelled");
    expect(duplicateLeave.state).toBe("cancelled");
    expect(duplicateCancel.state).toBe("cancelled");
    expect("session" in duplicateLeave ? duplicateLeave.session.status : null).toBe("cancelled");
    expect("session" in duplicateCancel ? duplicateCancel.session.status : null).toBe("cancelled");
  });

  it("expires recruiting sessions and clears live membership keys", async () => {
    await seedCharacter(prisma, "leader-four-user", 4001n, "Годинникар");
    await repository.createForTelegramUser(4001n, {
      ...partyInput("party-token-f"),
      expiresAt: new Date("2026-06-29T14:59:00.000Z"),
      joinUntilAt: new Date("2026-06-29T14:59:00.000Z")
    });

    const expired = await repository.findByToken("party-token-f", now());

    expect(expired?.status).toBe("expired");
    expect(await prisma.partyParticipant.findFirst({
      where: {
        session: {
          inviteToken: "party-token-f"
        }
      },
      select: {
        activeMembershipKey: true
      }
    })).toEqual({ activeMembershipKey: null });
  });

  it("replays expired state for stale leave and cancel buttons", async () => {
    await seedCharacter(prisma, "leader-nine-user", 9001n, "Протермінована");
    await repository.createForTelegramUser(9001n, {
      ...partyInput("party-token-k"),
      expiresAt: new Date("2026-06-29T14:59:00.000Z"),
      joinUntilAt: new Date("2026-06-29T14:59:00.000Z")
    });

    const staleLeave = await repository.leaveByTokenForTelegramUser(9001n, "party-token-k", now());
    const staleCancel = await repository.cancelByTokenForTelegramUser(9001n, "party-token-k", now());

    expect(staleLeave.state).toBe("expired");
    expect(staleCancel.state).toBe("expired");
    expect("session" in staleLeave ? staleLeave.session.status : null).toBe("expired");
    expect("session" in staleCancel ? staleCancel.session.status : null).toBe("expired");
  });

  it("force-expires live recruiting sessions before natural expiry and replays terminal state", async () => {
    await seedCharacter(prisma, "leader-five-user", 5001n, "Девконтролер");
    await seedCharacter(prisma, "joiner-five-user", 5002n, "Тестувальник");
    const created = await repository.createForTelegramUser(5001n, partyInput("party-token-g"));
    await repository.joinByTokenForTelegramUser(5002n, "party-token-g", joinInput());

    const expired = await repository.forceExpireByToken("party-token-g", now());
    const duplicate = await repository.forceExpireByToken("party-token-g", now());
    const row = await prisma.partySession.findUnique({
      where: { inviteToken: "party-token-g" },
      select: { status: true, activeLeaderKey: true, version: true }
    });
    const activeKeys = await prisma.partyParticipant.count({
      where: {
        session: {
          inviteToken: "party-token-g"
        },
        activeMembershipKey: {
          not: null
        }
      }
    });

    expect(created.state).toBe("created");
    expect(expired?.status).toBe("expired");
    expect(duplicate?.status).toBe("expired");
    expect(row).toEqual({ status: "expired", activeLeaderKey: null, version: 2 });
    expect(activeKeys).toBe(0);
  });
});

function now(): Date {
  return new Date("2026-06-29T15:00:00.000Z");
}

function partyInput(inviteToken: string) {
  return {
    inviteToken,
    participantCap: 8,
    minimumParticipants: 1,
    joinUntilAt: new Date("2026-06-29T15:13:00.000Z"),
    expiresAt: new Date("2026-06-29T15:13:00.000Z"),
    now: now(),
    periodId: "12026-06-29",
    originLocationId: "korchma.board",
    chatId: 587n,
    messageId: 13
  };
}

function bigBarrelInput(inviteToken: string) {
  return {
    ...partyInput(inviteToken),
    originLocationId: "barrel.big-brother"
  };
}

function joinInput(joinSource: "nearby" | "deep-link" | "dev" = "deep-link") {
  return {
    joinSource,
    now: now(),
    chatId: 587n,
    messageId: 23
  };
}

function readinessByTelegramUser(
  result: { session?: { participants: Array<{ readiness?: string; character: { telegramUserId: bigint } }> } }
): Record<string, string | undefined> {
  return Object.fromEntries((result.session?.participants ?? []).map((participant) => [
    participant.character.telegramUserId.toString(),
    participant.readiness
  ]));
}

async function seedCharacter(
  prisma: PrismaClient,
  userId: string,
  telegramUserId: bigint,
  name: string,
  options: {
    level?: number;
    remortCount?: number;
    classId?: string;
    manaCurrent?: number;
    statsJson?: Record<string, number>;
  } = {}
): Promise<void> {
  await prisma.user.create({
    data: {
      id: userId,
      telegramUserId,
      lastSeenLocationId: "korchma.board",
      character: {
        create: {
          id: `${userId}-character`,
          name,
          raceId: "human",
          classId: options.classId ?? "warrior",
          level: options.level ?? 1,
          manaCurrent: options.manaCurrent ?? 10,
          manaMax: Math.max(10, options.manaCurrent ?? 10),
          statsJson: options.statsJson ?? {}
        }
      }
    }
  });
  for (let index = 1; index <= (options.remortCount ?? 0); index += 1) {
    await prisma.characterRemort.create({
      data: {
        id: `${userId}-remort-${index}`,
        characterId: `${userId}-character`,
        token: `${userId}-remort-token-${index}`,
        remortNumber: index,
        previousLevel: 13,
        previousXp: 587,
        previousGold: 42,
        displayNameSnapshot: name,
        preservedPayloadJson: {}
      }
    });
  }
}

async function expectNoMembership(
  prisma: PrismaClient,
  inviteToken: string,
  telegramUserId: bigint
): Promise<void> {
  expect(await prisma.partyParticipant.count({
    where: {
      session: {
        inviteToken
      },
      character: {
        user: {
          telegramUserId
        }
      }
    }
  })).toBe(0);
  expect(await prisma.partyParticipant.count({
    where: {
      activeMembershipKey: `party-member:${await characterIdForTelegramUser(prisma, telegramUserId)}`
    }
  })).toBe(0);
}

async function characterIdForTelegramUser(prisma: PrismaClient, telegramUserId: bigint): Promise<string> {
  const character = await prisma.character.findFirstOrThrow({
    where: {
      user: {
        telegramUserId
      }
    },
    select: {
      id: true
    }
  });

  return character.id;
}

function hasKharakternykWardSignSnapshot(snapshotJson: unknown): boolean {
  if (!snapshotJson || typeof snapshotJson !== "object" || Array.isArray(snapshotJson)) {
    return false;
  }

  const wardSign = (snapshotJson as Record<string, unknown>).kharakternykWardSign;
  return Boolean(
    wardSign &&
    typeof wardSign === "object" &&
    !Array.isArray(wardSign) &&
    (wardSign as Record<string, unknown>).kind === "kharakternyk"
  );
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
    `CREATE TABLE character_equipment (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      slot TEXT NOT NULL,
      item_id TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE active_combat_leases (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL,
      reference_id TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE daily_actions (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      key TEXT NOT NULL,
      local_date TEXT NOT NULL,
      reward_xp INTEGER NOT NULL,
      reward_gold INTEGER NOT NULL,
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
    `CREATE UNIQUE INDEX party_sessions_invite_token_key ON party_sessions(invite_token)`,
    `CREATE UNIQUE INDEX character_equipment_character_id_slot_key ON character_equipment(character_id, slot)`,
    `CREATE INDEX character_equipment_item_id_idx ON character_equipment(item_id)`,
    `CREATE UNIQUE INDEX party_sessions_active_leader_key_key ON party_sessions(active_leader_key)`,
    `CREATE INDEX party_sessions_status_expires_at_idx ON party_sessions(status, expires_at)`,
    `CREATE INDEX active_combat_leases_kind_reference_id_idx ON active_combat_leases(kind, reference_id)`,
    `CREATE UNIQUE INDEX daily_actions_character_id_key_local_date_key ON daily_actions(character_id, key, local_date)`,
    `CREATE INDEX daily_actions_key_idx ON daily_actions(key)`,
    `CREATE UNIQUE INDEX character_cooldowns_character_id_key_key ON character_cooldowns(character_id, key)`,
    `CREATE UNIQUE INDEX party_participants_active_membership_key_key ON party_participants(active_membership_key)`,
    `CREATE UNIQUE INDEX party_participants_session_id_character_id_key ON party_participants(session_id, character_id)`,
    `CREATE INDEX party_participants_character_id_status_idx ON party_participants(character_id, status)`,
    `CREATE INDEX party_participants_session_id_status_idx ON party_participants(session_id, status)`
  ]) {
    await prisma.$executeRawUnsafe(statement);
  }
}
