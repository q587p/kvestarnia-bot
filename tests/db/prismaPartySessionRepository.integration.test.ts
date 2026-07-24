import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  PrismaPartySessionRepository,
  resolvePersonalProtocolSignReservationState
} from "../../src/db/repositories/prismaPartySessionRepository";
import { BIG_BARREL_BROTHER_LOSS_RETRY_COOLDOWN_KEY } from "../../src/domain/partyBoss/partyBoss";
import {
  buildEquipmentAttunementPayload,
  EQUIPMENT_ATTUNEMENT_ACTION_KEY
} from "../../src/domain/equipment/equipmentAttunement";
import { BUREAUCRAMANCER_PROTOCOL_COOLDOWN_KEY } from "../../src/services/bureaucramancerProtocol";
import { buildFridayBarrelRaidPendingKey } from "../../src/services/tavernRaidService";
import { PrismaPartyRaidChatTransactionWriter } from "../../src/db/repositories/prismaPartyRaidChatEvents";
import { PrismaPartyRaidChatRepository } from "../../src/db/repositories/prismaPartyRaidChatRepository";

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
    await applyRaidChatMigration(prisma);
    repository = new PrismaPartySessionRepository(prisma, new PrismaPartyRaidChatTransactionWriter(true));
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  it("reports stale instead of already-signed without a matching signature snapshot", () => {
    const protocol = { protocolId: "protocol-1", filerCharacterId: "filer-1" };
    expect(resolvePersonalProtocolSignReservationState(null, protocol)).toBe("stale");
    expect(resolvePersonalProtocolSignReservationState(protocol, protocol)).toBe("already-signed");
    expect(resolvePersonalProtocolSignReservationState(
      { protocolId: "protocol-1", filerCharacterId: "filer-old" },
      protocol
    )).toBe("stale");
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

  it("records every same-life rejoin once and re-arms its existing chat delivery", async () => {
    const token = "party-token-chat-rejoin";
    await seedCharacter(prisma, "chat-rejoin-leader-user", 2011n, "Ватажок Чату", { level: 8 });
    await seedCharacter(prisma, "chat-rejoin-member-user", 2012n, "Поворотниця", { level: 8 });
    await repository.createForTelegramUser(2011n, bigBarrelInput(token));

    await expect(repository.joinByTokenForTelegramUser(2012n, token, joinInput())).resolves.toMatchObject({
      state: "joined"
    });
    await expect(repository.leaveByTokenForTelegramUser(2012n, token, now())).resolves.toMatchObject({
      state: "left"
    });
    await expect(repository.joinByTokenForTelegramUser(2012n, token, joinInput("dev"))).resolves.toMatchObject({
      state: "joined"
    });
    await expect(repository.joinByTokenForTelegramUser(2012n, token, joinInput("dev"))).resolves.toMatchObject({
      state: "already-joined"
    });

    const session = await prisma.partySession.findUniqueOrThrow({
      where: { inviteToken: token },
      select: { id: true, chatRevision: true }
    });
    const participant = await prisma.partyParticipant.findFirstOrThrow({
      where: { sessionId: session.id, character: { user: { telegramUserId: 2012n } } },
      select: { id: true }
    });
    const joinedEntries = await prisma.partyRaidChatEntry.findMany({
      where: {
        partySessionId: session.id,
        eventType: "participant.joined",
        actorCharacterId: "chat-rejoin-member-user-character"
      },
      orderBy: { revision: "asc" },
      select: { sourceKey: true }
    });
    expect(joinedEntries).toHaveLength(2);
    expect(new Set(joinedEntries.map((entry) => entry.sourceKey)).size).toBe(2);
    expect(joinedEntries.every((entry) => entry.sourceKey.includes(":life:0"))).toBe(true);
    await expect(prisma.partyRaidChatDeliveryState.findUniqueOrThrow({
      where: { participantId: participant.id },
      select: { redactionRequired: true, desiredRevision: true, nextAttemptAt: true }
    })).resolves.toEqual({
      redactionRequired: false,
      desiredRevision: session.chatRevision,
      nextAttemptAt: now()
    });
  });

  it("revokes leave and remort composers outside a bounded disabled rollout scan", async () => {
    const chat = new PrismaPartyRaidChatRepository(prisma);
    const disabledRepository = new PrismaPartySessionRepository(
      prisma,
      new PrismaPartyRaidChatTransactionWriter(false)
    );
    const cases = [
      {
        token: "party-token-disabled-leave",
        leaderUser: "disabled-leave-leader-user",
        leaderTelegramId: 2021n,
        memberUser: "disabled-leave-member-user",
        memberTelegramId: 2022n
      },
      {
        token: "party-token-disabled-remort",
        leaderUser: "disabled-remort-leader-user",
        leaderTelegramId: 2023n,
        memberUser: "disabled-remort-member-user",
        memberTelegramId: 2024n
      }
    ];
    for (const entry of cases) {
      await seedCharacter(prisma, entry.leaderUser, entry.leaderTelegramId, "Ватажок Вимкненого Чату", { level: 8 });
      await seedCharacter(prisma, entry.memberUser, entry.memberTelegramId, "Учасниця Вимкненого Чату", { level: 8 });
      await repository.createForTelegramUser(entry.leaderTelegramId, bigBarrelInput(entry.token));
      await repository.joinByTokenForTelegramUser(entry.memberTelegramId, entry.token, joinInput());
      for (let reopen = 0; reopen < 2; reopen += 1) {
        await prisma.partyRaidChatDeliveryState.updateMany({
          where: {
            participant: {
              character: { user: { telegramUserId: entry.memberTelegramId } },
              session: { inviteToken: entry.token }
            }
          },
          data: {
            version: { increment: 1 },
            nextAttemptAt: now(),
            lastDeliveryClass: "refresh-requested"
          }
        });
      }
      const session = await prisma.partySession.findUniqueOrThrow({
        where: { inviteToken: entry.token },
        select: { id: true }
      });
      await prisma.partyRaidChatComposeIntent.create({
        data: {
          partySessionId: session.id,
          characterId: `${entry.memberUser}-character`,
          remortCount: 0,
          telegramUserId: entry.memberTelegramId,
          privateChatId: entry.memberTelegramId,
          promptMessageId: 93,
          activeKey: `compose:${entry.memberUser}`,
          status: "awaiting_reply",
          expiresAt: new Date(now().getTime() + 93_000)
        }
      });
      await prisma.partyParticipant.updateMany({
        where: { characterId: `${entry.memberUser}-character`, session: { inviteToken: entry.token } },
        data: { updatedAt: new Date("9998-01-01T00:00:00.000Z") }
      });
    }

    await expect(chat.markDisabledReferencesForRedaction(now(), 1)).resolves.toBe(0);
    for (const entry of cases) {
      await expect(prisma.partyRaidChatDeliveryState.findFirstOrThrow({
        where: { participant: { characterId: `${entry.memberUser}-character`, session: { inviteToken: entry.token } } },
        select: { redactionRequired: true }
      })).resolves.toEqual({ redactionRequired: false });
    }

    await expect(disabledRepository.leaveByTokenForTelegramUser(
      cases[0]!.memberTelegramId,
      cases[0]!.token,
      now()
    )).resolves.toMatchObject({ state: "left" });
    await disabledRepository.cleanupLiveMembershipsForRemort(`${cases[1]!.memberUser}-character`, now());

    for (const entry of cases) {
      await expect(prisma.partyRaidChatComposeIntent.findFirstOrThrow({
        where: { characterId: `${entry.memberUser}-character`, partySession: { inviteToken: entry.token } },
        select: { status: true, activeKey: true }
      })).resolves.toEqual({ status: "cancelled", activeKey: null });
      await expect(prisma.partyRaidChatDeliveryState.findFirstOrThrow({
        where: { participant: { characterId: `${entry.memberUser}-character`, session: { inviteToken: entry.token } } },
        select: { redactionRequired: true }
      })).resolves.toEqual({ redactionRequired: true });
      await expect(prisma.partyRaidChatDeliveryState.count({
        where: { participant: { characterId: `${entry.memberUser}-character`, session: { inviteToken: entry.token } } }
      })).resolves.toBe(1);
    }
  });

  it("uses a unique source key when remort transfers leadership to the same member twice", async () => {
    const token = "party-token-remort-leader-repeat";
    await seedCharacter(prisma, "remort-leader-repeat-a", 2025n, "Пан А", { level: 8 });
    await seedCharacter(prisma, "remort-leader-repeat-b", 2026n, "Пані Б", { level: 8 });
    await repository.createForTelegramUser(2025n, bigBarrelInput(token));
    await repository.joinByTokenForTelegramUser(2026n, token, joinInput());

    await repository.cleanupLiveMembershipsForRemort("remort-leader-repeat-a-character", now());
    await repository.joinByTokenForTelegramUser(2025n, token, joinInput());
    await repository.leaveByTokenForTelegramUser(2026n, token, now());
    await repository.joinByTokenForTelegramUser(2026n, token, joinInput());
    await repository.cleanupLiveMembershipsForRemort("remort-leader-repeat-a-character", now());

    const session = await prisma.partySession.findUniqueOrThrow({
      where: { inviteToken: token },
      select: { id: true }
    });
    const transfers = await prisma.partyRaidChatEntry.findMany({
      where: {
        partySessionId: session.id,
        eventType: "leader.transferred",
        actorCharacterId: "remort-leader-repeat-b-character"
      },
      orderBy: { revision: "asc" },
      select: { sourceKey: true }
    });
    expect(transfers).toHaveLength(2);
    expect(new Set(transfers.map((entry) => entry.sourceKey)).size).toBe(2);
    expect(transfers.every((entry) => entry.sourceKey?.includes(":remort:"))).toBe(true);
  });

  it("returns honest stale state when join loses the recruiting version CAS", async () => {
    const token = "party-token-join-cas-loss";
    await seedCharacter(prisma, "join-cas-leader-user", 2051n, "Ватажок CAS");
    await seedCharacter(prisma, "join-cas-member-user", 2052n, "Учасник CAS");
    await repository.createForTelegramUser(2051n, partyInput(token));

    const result = await withForcedSessionVersionCasLoss(prisma, "force_join_cas_loss", token, () =>
      repository.joinByTokenForTelegramUser(2052n, token, joinInput())
    );

    expect(result.state).toBe("stale");
    await expectNoMembership(prisma, token, 2052n);
  });

  it("never exceeds capacity when two players race for the final slot", async () => {
    const token = "party-token-final-slot-race";
    await seedCharacter(prisma, "final-slot-leader-user", 2053n, "Ватажок останнього місця");
    await seedCharacter(prisma, "final-slot-a-user", 2054n, "Перший претендент");
    await seedCharacter(prisma, "final-slot-b-user", 2055n, "Друга претендентка");
    await repository.createForTelegramUser(2053n, {
      ...partyInput(token),
      participantCap: 2
    });

    const results = await Promise.all([
      repository.joinByTokenForTelegramUser(2054n, token, joinInput()),
      repository.joinByTokenForTelegramUser(2055n, token, joinInput())
    ]);

    expect(results.filter((result) => result.state === "joined")).toHaveLength(1);
    expect(results.every((result) => result.state === "joined" || result.state === "full" || result.state === "stale")).toBe(true);
    const session = await prisma.partySession.findUniqueOrThrow({
      where: { inviteToken: token },
      include: { participants: true }
    });
    expect(session.participants.filter((participant) => participant.status === "joined")).toHaveLength(2);
  });

  it("returns honest stale state when leave loses the recruiting version CAS", async () => {
    const token = "party-token-leave-cas-loss";
    await seedCharacter(prisma, "leave-cas-leader-user", 2061n, "Ватажок Виходу");
    await seedCharacter(prisma, "leave-cas-member-user", 2062n, "Учасник Виходу");
    await repository.createForTelegramUser(2061n, partyInput(token));
    await repository.joinByTokenForTelegramUser(2062n, token, joinInput());

    const result = await withForcedSessionVersionCasLoss(prisma, "force_leave_cas_loss", token, () =>
      repository.leaveByTokenForTelegramUser(2062n, token, now())
    );

    expect(result.state).toBe("stale");
    expect("session" in result
      ? result.session.participants.find((row) => row.character.telegramUserId === 2062n)?.status
      : null).toBe("joined");
  });

  it("returns honest stale state when readiness loses the recruiting version CAS", async () => {
    const token = "party-token-readiness-cas-loss";
    await seedCharacter(prisma, "readiness-cas-leader-user", 2071n, "Готовність CAS");
    await repository.createForTelegramUser(2071n, partyInput(token));

    const result = await withForcedSessionVersionCasLoss(prisma, "force_readiness_cas_loss", token, () =>
      repository.setParticipantReadiness(2071n, token, "ready", now())
    );

    expect(result.state).toBe("stale");
    expect(readinessByTelegramUser(result)["2071"]).toBe("waiting");
  });

  it("returns honest stale state when ward support loses the recruiting version CAS", async () => {
    const token = "party-token-ward-support-cas-loss";
    await seedCharacter(prisma, "ward-support-cas-leader-user", 2081n, "Знакар CAS", {
      level: 8,
      classId: "class.kharakternyk",
      manaCurrent: 13,
      statsJson: { intelligence: 13, luck: 13 }
    });
    await seedCharacter(prisma, "ward-support-cas-member-user", 2082n, "Підпора CAS", {
      level: 8,
      manaCurrent: 13,
      statsJson: { intelligence: 13, luck: 13 }
    });
    await repository.createForTelegramUser(2081n, bigBarrelInput(token));
    await repository.joinByTokenForTelegramUser(2082n, token, joinInput());
    await repository.placeKharakternykWardSign(2081n, token, now());

    const result = await withForcedSessionVersionCasLoss(prisma, "force_ward_support_cas_loss", token, () =>
      repository.supportKharakternykWardSign(2082n, token, now())
    );

    expect(result.state).toBe("stale");
    await expectWardSupportSnapshotCount(prisma, token, 0);
    await expect(prisma.character.findUniqueOrThrow({
      where: { id: "ward-support-cas-member-user-character" },
      select: { manaCurrent: true }
    })).resolves.toEqual({ manaCurrent: 13 });
  });

  it("returns stale when Protocol 13-Z filing exhausts CAS retries without a canonical protocol", async () => {
    const token = "party-token-protocol-file-cas-loss";
    await seedCharacter(prisma, "protocol-file-cas-user", 2091n, "Реєстратор CAS", {
      level: 8,
      classId: "class.bureaucramancer",
      manaCurrent: 13
    });
    await repository.createForTelegramUser(2091n, bigBarrelInput(token));

    const result = await withForcedSessionVersionCasLoss(prisma, "force_protocol_file_cas_loss", token, () =>
      repository.fileBureaucramancerPersonalProtocol(2091n, token, now())
    );

    expect(result.state).toBe("stale");
    expect("session" in result ? result.session.personalProtocol : null).toBeUndefined();
    await expectPersonalProtocolSnapshotCount(prisma, token, 0);
    await expect(prisma.character.findUniqueOrThrow({
      where: { id: "protocol-file-cas-user-character" },
      select: { manaCurrent: true }
    })).resolves.toEqual({ manaCurrent: 13 });
    await expect(prisma.characterCooldown.count({
      where: {
        characterId: "protocol-file-cas-user-character",
        key: BUREAUCRAMANCER_PROTOCOL_COOLDOWN_KEY
      }
    })).resolves.toBe(0);
  });

  it("returns stale when Kharakternyk ward placement exhausts CAS retries without a canonical ward", async () => {
    const token = "party-token-ward-place-cas-loss";
    await seedCharacter(prisma, "ward-place-cas-user", 2092n, "Знакар Розбіжности", {
      level: 8,
      classId: "class.kharakternyk",
      manaCurrent: 13,
      statsJson: { intelligence: 13, luck: 13 }
    });
    await repository.createForTelegramUser(2092n, bigBarrelInput(token));

    const result = await withForcedSessionVersionCasLoss(prisma, "force_ward_place_cas_loss", token, () =>
      repository.placeKharakternykWardSign(2092n, token, now())
    );

    expect(result.state).toBe("stale");
    expect("session" in result ? result.session.wardSign : null).toBeUndefined();
    await expectWardSignSnapshotCount(prisma, token, 0);
    await expect(prisma.character.findUniqueOrThrow({
      where: { id: "ward-place-cas-user-character" },
      select: { manaCurrent: true }
    })).resolves.toEqual({ manaCurrent: 13 });
  });

  it.each([
    ["active", 2093n],
    ["completed", 2094n]
  ] as const)("returns stale for canonical recruiting callbacks after the party becomes %s", async (status, telegramUserId) => {
    const token = `party-token-post-start-${status}`;
    const userId = `post-start-${status}-user`;
    await seedCharacter(prisma, userId, telegramUserId, `Канонічний ${status}`);
    await repository.createForTelegramUser(telegramUserId, partyInput(token));
    await prisma.partySession.update({
      where: { inviteToken: token },
      data: {
        status,
        ...(status === "completed" ? { activeLeaderKey: null } : {})
      }
    });
    if (status === "completed") {
      await prisma.partyParticipant.updateMany({
        where: { session: { inviteToken: token } },
        data: { activeMembershipKey: null }
      });
    }

    const join = await repository.joinByTokenForTelegramUser(telegramUserId, token, joinInput());
    const leave = await repository.leaveByTokenForTelegramUser(telegramUserId, token, now());
    const cancel = await repository.cancelByTokenForTelegramUser(telegramUserId, token, now());

    expect(join.state).toBe("stale");
    expect(leave.state).toBe("stale");
    expect(cancel.state).toBe("stale");
    expect("session" in join ? join.session.status : null).toBe(status);
    expect("session" in leave ? leave.session.status : null).toBe(status);
    expect("session" in cancel ? cancel.session.status : null).toBe(status);
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
      statsJson: { intelligence: 13, luck: 13 }
    });
    await seedCharacter(prisma, "ward-support-user", 2132n, "РџС–РґРїРѕСЂР°", {
      level: 8,
      manaCurrent: 10,
      statsJson: { intelligence: 13, luck: 13 }
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
      supportCap: 7,
      manaCost: 10
    });
    expect("session" in supported
      ? supported.session.participants.find((participant) => participant.character.telegramUserId === 2132n)?.wardSignSupport
      : null).toMatchObject({
      kind: "kharakternyk",
      placerCharacterId: "ward-leader-user-character",
      supporterCharacterId: "ward-support-user-character",
      manaCost: 5
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
      { id: "ward-leader-user-character", manaCurrent: 0 },
      { id: "ward-support-user-character", manaCurrent: 5 }
    ]);
  });

  it("files and signs Bureaucramancer protocol once without duplicate mana spend", async () => {
    await seedCharacter(prisma, "protocol-filer-user", 2141n, "Паперяр", {
      level: 3,
      classId: "class.bureaucramancer",
      manaCurrent: 10,
      statsJson: { intelligence: 0 }
    });
    await seedCharacter(prisma, "protocol-signer-user", 2142n, "Підписант", {
      level: 8,
      manaCurrent: 10
    });
    await seedCharacter(prisma, "protocol-outsider-user", 2143n, "Поза Бланком", {
      level: 8,
      manaCurrent: 10
    });
    await repository.createForTelegramUser(2141n, bigBarrelInput("party-token-protocol"));
    await repository.joinByTokenForTelegramUser(2142n, "party-token-protocol", joinInput());

    const filed = await repository.fileBureaucramancerPersonalProtocol(2141n, "party-token-protocol", now());
    const duplicateFile = await repository.fileBureaucramancerPersonalProtocol(2141n, "party-token-protocol", now());
    const signed = await repository.signBureaucramancerPersonalProtocol(2142n, "party-token-protocol", now());
    const duplicateSign = await repository.signBureaucramancerPersonalProtocol(2142n, "party-token-protocol", now());
    const outsiderSign = await repository.signBureaucramancerPersonalProtocol(2143n, "party-token-protocol", now());

    expect(filed.state).toBe("updated");
    expect(duplicateFile.state).toBe("already-filed");
    expect(signed.state).toBe("updated");
    expect(duplicateSign.state).toBe("already-signed");
    expect(outsiderSign.state).toBe("not-member");
    expect("session" in signed ? signed.session.personalProtocol : null).toMatchObject({
      kind: "bureaucramancer-personal-protocol-13b",
      filerCharacterId: "protocol-filer-user-character",
      signatureCount: 2,
      manaCost: 8
    });
    expect("session" in signed
      ? signed.session.participants.find((participant) => participant.character.telegramUserId === 2142n)?.personalProtocolSignature
      : null).toMatchObject({
      kind: "bureaucramancer-personal-protocol-13b",
      filerCharacterId: "protocol-filer-user-character",
      signerCharacterId: "protocol-signer-user-character"
    });
    await expect(prisma.character.findMany({
      where: {
        id: {
          in: [
            "protocol-filer-user-character",
            "protocol-signer-user-character",
            "protocol-outsider-user-character"
          ]
        }
      },
      orderBy: { id: "asc" },
      select: { id: true, manaCurrent: true }
    })).resolves.toEqual([
      { id: "protocol-filer-user-character", manaCurrent: 2 },
      { id: "protocol-outsider-user-character", manaCurrent: 10 },
      { id: "protocol-signer-user-character", manaCurrent: 10 }
    ]);
    await expect(prisma.characterCooldown.findUnique({
      where: {
        characterId_key: {
          characterId: "protocol-filer-user-character",
          key: BUREAUCRAMANCER_PROTOCOL_COOLDOWN_KEY
        }
      },
      select: { availableAt: true }
    })).resolves.toEqual({
      availableAt: new Date(now().getTime() + 93 * 60_000)
    });
    await expectPersonalProtocolSnapshotCount(prisma, "party-token-protocol", 1);
    await expectPersonalProtocolSignatureSnapshotCount(prisma, "party-token-protocol", 2);
    await expect(prisma.partyRaidChatEntry.groupBy({
      by: ["eventType"],
      where: {
        partySession: { inviteToken: "party-token-protocol" },
        eventType: { in: ["protocol.filed", "protocol.signed"] }
      },
      _count: { _all: true },
      orderBy: { eventType: "asc" }
    })).resolves.toEqual([
      { eventType: "protocol.filed", _count: { _all: 1 } },
      { eventType: "protocol.signed", _count: { _all: 1 } }
    ]);
  });

  it("uses exact current attunement lookup after more than 13 historical rows for protocol cost", async () => {
    const tuningItemId = "item.mantok.coverage.universal.hat-of-found-shelf";
    const cases = [
      {
        suffix: "base",
        telegramUserId: 2144n,
        expectedCost: 8,
        expectedMana: 6,
        readyAt: null,
        manaCurrent: 0
      },
      {
        suffix: "tuning",
        telegramUserId: 2145n,
        expectedCost: 8,
        expectedMana: 2,
        readyAt: new Date(now().getTime() + 60_000),
        manaCurrent: 10
      },
      {
        suffix: "attuned",
        telegramUserId: 2146n,
        expectedCost: 7,
        expectedMana: 3,
        readyAt: new Date(now().getTime() - 1_000),
        manaCurrent: 10
      }
    ] as const;

    for (const entry of cases) {
      const userId = `protocol-cost-${entry.suffix}-user`;
      const token = `party-token-protocol-cost-${entry.suffix}`;
      await seedCharacter(prisma, userId, entry.telegramUserId, `Вартість ${entry.suffix}`, {
        level: 3,
        classId: "class.bureaucramancer",
        manaCurrent: entry.manaCurrent,
        manaRegenAt: entry.manaCurrent === 0 ? new Date(now().getTime() - 13 * 60_000) : null,
        statsJson: { intelligence: 3 }
      });
      if (entry.readyAt) {
        await seedAttuningEquipment(prisma, `${userId}-character`, tuningItemId, entry.readyAt, 20);
      }
      await repository.createForTelegramUser(entry.telegramUserId, bigBarrelInput(token));

      const result = await repository.fileBureaucramancerPersonalProtocol(entry.telegramUserId, token, now());
      const character = await prisma.character.findUniqueOrThrow({
        where: { id: `${userId}-character` },
        select: { manaCurrent: true }
      });

      expect(result.state).toBe("updated");
      expect("session" in result ? result.session.personalProtocol?.manaCost : null).toBe(entry.expectedCost);
      expect(character.manaCurrent).toBe(entry.expectedMana);
    }
  });

  it("keeps one session protocol when the filer leaves and freezes only joined signatures", async () => {
    await seedCharacter(prisma, "protocol-leader-leaves-user", 9151n, "Ватажок Паперів", {
      level: 8
    });
    await seedCharacter(prisma, "protocol-filer-leaves-user", 9152n, "Паперовий Втікач", {
      level: 8,
      classId: "class.bureaucramancer",
      manaCurrent: 10
    });
    await seedCharacter(prisma, "protocol-replacement-user", 9153n, "Запасний Підпис", {
      level: 8,
      classId: "class.bureaucramancer",
      manaCurrent: 10
    });

    await repository.createForTelegramUser(9151n, bigBarrelInput("party-token-protocol-filer-leaves"));
    await repository.joinByTokenForTelegramUser(9152n, "party-token-protocol-filer-leaves", joinInput());
    await repository.joinByTokenForTelegramUser(9153n, "party-token-protocol-filer-leaves", joinInput());
    const filed = await repository.fileBureaucramancerPersonalProtocol(
      9152n,
      "party-token-protocol-filer-leaves",
      now()
    );
    const left = await repository.leaveByTokenForTelegramUser(9152n, "party-token-protocol-filer-leaves", now());
    const afterLeave = await repository.findByToken("party-token-protocol-filer-leaves", now());
    const replacementFile = await repository.fileBureaucramancerPersonalProtocol(
      9153n,
      "party-token-protocol-filer-leaves",
      now()
    );
    const replacementSign = await repository.signBureaucramancerPersonalProtocol(
      9153n,
      "party-token-protocol-filer-leaves",
      now()
    );

    expect(filed.state).toBe("updated");
    expect(left.state).toBe("left");
    expect(afterLeave?.personalProtocol).toMatchObject({
      filerCharacterId: "protocol-filer-leaves-user-character",
      signatureCount: 0
    });
    expect(replacementFile.state).toBe("already-exists");
    expect(replacementSign.state).toBe("updated");
    expect("session" in replacementSign ? replacementSign.session.personalProtocol : null).toMatchObject({
      signatureCount: 1
    });
    await expect(prisma.character.findUnique({
      where: { id: "protocol-replacement-user-character" },
      select: { manaCurrent: true }
    })).resolves.toEqual({ manaCurrent: 10 });
  });

  it("blocks active-combat protocol signing without mutating the signature", async () => {
    await seedCharacter(prisma, "protocol-blocked-leader-user", 9154n, "Паперовий Ватажок", {
      level: 8,
      classId: "class.bureaucramancer",
      manaCurrent: 10
    });
    await seedCharacter(prisma, "protocol-blocked-signer-user", 9155n, "Підписант У Бою", {
      level: 8
    });

    await repository.createForTelegramUser(9154n, bigBarrelInput("party-token-protocol-blocked"));
    await repository.joinByTokenForTelegramUser(9155n, "party-token-protocol-blocked", joinInput());
    await repository.fileBureaucramancerPersonalProtocol(9154n, "party-token-protocol-blocked", now());
    await prisma.activeCombatLease.create({
      data: {
        id: "protocol-blocked-signer-lease",
        characterId: "protocol-blocked-signer-user-character",
        kind: "persistent-fight",
        referenceId: "fight-protocol-blocked"
      }
    });

    const blocked = await repository.signBureaucramancerPersonalProtocol(9155n, "party-token-protocol-blocked", now());
    await prisma.activeCombatLease.delete({ where: { id: "protocol-blocked-signer-lease" } });
    const signed = await repository.signBureaucramancerPersonalProtocol(9155n, "party-token-protocol-blocked", now());

    expect(blocked.state).toBe("blocked");
    expect(signed.state).toBe("updated");
    await expectPersonalProtocolSignatureSnapshotCount(prisma, "party-token-protocol-blocked", 2);
  });

  it("replays concurrent duplicate protocol signing without losing the signature", async () => {
    await seedCharacter(prisma, "protocol-concurrent-leader-user", 9156n, "Паралельний Папір", {
      level: 8,
      classId: "class.bureaucramancer",
      manaCurrent: 10
    });
    await seedCharacter(prisma, "protocol-concurrent-signer-user", 9157n, "Паралельний Підпис", {
      level: 8
    });

    await repository.createForTelegramUser(9156n, bigBarrelInput("party-token-protocol-concurrent"));
    await repository.joinByTokenForTelegramUser(9157n, "party-token-protocol-concurrent", joinInput());
    await repository.fileBureaucramancerPersonalProtocol(9156n, "party-token-protocol-concurrent", now());

    const results = await Promise.all([
      repository.signBureaucramancerPersonalProtocol(9157n, "party-token-protocol-concurrent", now()),
      repository.signBureaucramancerPersonalProtocol(9157n, "party-token-protocol-concurrent", now())
    ]);

    expect(results.map((result) => result.state).sort()).toEqual(["already-signed", "updated"]);
    await expectPersonalProtocolSignatureSnapshotCount(prisma, "party-token-protocol-concurrent", 2);
  });

  it("claims the parent session version before writing a protocol signature", async () => {
    const token = "party-token-protocol-parent-first";
    await seedCharacter(prisma, "protocol-parent-first-leader-user", 9163n, "Голова Порядку", {
      level: 8,
      classId: "class.bureaucramancer",
      manaCurrent: 10
    });
    await seedCharacter(prisma, "protocol-parent-first-signer-user", 9164n, "Підпис Порядку", { level: 8 });
    await repository.createForTelegramUser(9163n, bigBarrelInput(token));
    await repository.joinByTokenForTelegramUser(9164n, token, joinInput());
    await repository.fileBureaucramancerPersonalProtocol(9163n, token, now());
    const sessionBefore = await prisma.partySession.findUniqueOrThrow({
      where: { inviteToken: token },
      select: { version: true }
    });

    await prisma.$executeRawUnsafe(`CREATE TEMP TRIGGER protocol_signature_requires_parent_claim
      BEFORE UPDATE OF snapshot_json ON party_participants
      WHEN OLD.character_id = 'protocol-parent-first-signer-user-character'
        AND (SELECT version FROM party_sessions WHERE id = OLD.session_id) <= ${sessionBefore.version}
      BEGIN
        SELECT RAISE(ABORT, 'parent session version must be claimed first');
      END`);
    try {
      const result = await repository.signBureaucramancerPersonalProtocol(9164n, token, now());
      const sessionAfter = await prisma.partySession.findUniqueOrThrow({
        where: { inviteToken: token },
        select: { version: true }
      });

      expect(result.state).toBe("updated");
      expect(sessionAfter.version).toBe(sessionBefore.version + 1);
      await expectPersonalProtocolSignatureSnapshotCount(prisma, token, 2);
    } finally {
      await prisma.$executeRawUnsafe("DROP TRIGGER IF EXISTS protocol_signature_requires_parent_claim");
    }
  });

  it("commits only one concurrent Bureaucramancer protocol filing", async () => {
    await seedCharacter(prisma, "protocol-file-race-leader-user", 9160n, "Голова Заяви", {
      level: 8
    });
    await seedCharacter(prisma, "protocol-file-race-one-user", 9161n, "Перший Бюрокромант", {
      level: 8,
      classId: "class.bureaucramancer",
      manaCurrent: 10
    });
    await seedCharacter(prisma, "protocol-file-race-two-user", 9162n, "Другий Бюрокромант", {
      level: 8,
      classId: "class.bureaucramancer",
      manaCurrent: 10
    });

    await repository.createForTelegramUser(9160n, bigBarrelInput("party-token-protocol-file-race"));
    await repository.joinByTokenForTelegramUser(9161n, "party-token-protocol-file-race", joinInput());
    await repository.joinByTokenForTelegramUser(9162n, "party-token-protocol-file-race", joinInput());

    const results = await Promise.all([
      repository.fileBureaucramancerPersonalProtocol(9161n, "party-token-protocol-file-race", now()),
      repository.fileBureaucramancerPersonalProtocol(9162n, "party-token-protocol-file-race", now())
    ]);
    const states = results.map((result) => result.state).sort();
    const filed = results.find((result) => result.state === "updated");
    const filedCharacterId = filed && "session" in filed
      ? filed.session.personalProtocol?.filerCharacterId
      : undefined;

    expect(states).toEqual(["already-exists", "updated"]);
    expect(filedCharacterId).toMatch(/^protocol-file-race-(one|two)-user-character$/);
    await expect(prisma.character.findMany({
      where: {
        id: {
          in: ["protocol-file-race-one-user-character", "protocol-file-race-two-user-character"]
        }
      },
      orderBy: { id: "asc" },
      select: { id: true, manaCurrent: true }
    })).resolves.toEqual([
      {
        id: "protocol-file-race-one-user-character",
        manaCurrent: filedCharacterId === "protocol-file-race-one-user-character" ? 3 : 10
      },
      {
        id: "protocol-file-race-two-user-character",
        manaCurrent: filedCharacterId === "protocol-file-race-two-user-character" ? 3 : 10
      }
    ]);
    await expectPersonalProtocolSnapshotCount(prisma, "party-token-protocol-file-race", 1);
  });

  it("ignores unsupported protocol snapshot versions instead of treating them as active", async () => {
    await seedCharacter(prisma, "protocol-version-leader-user", 9158n, "Версійний Папір", {
      level: 8,
      classId: "class.bureaucramancer",
      manaCurrent: 10
    });
    await seedCharacter(prisma, "protocol-version-signer-user", 9159n, "Версійний Підпис", {
      level: 8
    });

    await repository.createForTelegramUser(9158n, bigBarrelInput("party-token-protocol-version"));
    await repository.joinByTokenForTelegramUser(9159n, "party-token-protocol-version", joinInput());
    await repository.fileBureaucramancerPersonalProtocol(9158n, "party-token-protocol-version", now());
    const filer = await prisma.partyParticipant.findFirstOrThrow({
      where: {
        session: { inviteToken: "party-token-protocol-version" },
        characterId: "protocol-version-leader-user-character"
      },
      select: { id: true, snapshotJson: true }
    });
    const snapshot = JSON.parse(JSON.stringify(filer.snapshotJson)) as Record<string, unknown>;
    const protocolSnapshot = snapshot.bureaucramancerPersonalProtocol13B;
    if (!protocolSnapshot || typeof protocolSnapshot !== "object" || Array.isArray(protocolSnapshot)) {
      throw new Error("Expected protocol snapshot object.");
    }
    (protocolSnapshot as Record<string, unknown>).version = 2;

    await prisma.partyParticipant.update({
      where: { id: filer.id },
      data: { snapshotJson: snapshot }
    });

    const session = await repository.findByToken("party-token-protocol-version", now());
    const sign = await repository.signBureaucramancerPersonalProtocol(9159n, "party-token-protocol-version", now());

    expect(session?.personalProtocol).toBeUndefined();
    expect(sign.state).toBe("no-protocol");
  });

  it("commits only one Kharakternyk ward sign when two eligible placers race", async () => {
    await seedCharacter(prisma, "ward-race-one-user", 2133n, "Перший Знакар", {
      level: 8,
      classId: "class.kharakternyk",
      manaCurrent: 10,
      statsJson: { intelligence: 13, luck: 13 }
    });
    await seedCharacter(prisma, "ward-race-two-user", 2134n, "Другий Знакар", {
      level: 8,
      classId: "class.kharakternyk",
      manaCurrent: 10,
      statsJson: { intelligence: 13, luck: 13 }
    });
    await seedCharacter(prisma, "ward-race-support-user", 2135n, "Підпора", {
      level: 8,
      manaCurrent: 10,
      statsJson: { intelligence: 13, luck: 13 }
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
      manaCost: 5
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
    expect(manaByCharacterId[winningPlacerCharacterId!]).toBe(0);
    expect(manaByCharacterId[losingPlacerCharacterId]).toBe(10);
    expect(manaByCharacterId["ward-race-support-user-character"]).toBe(5);

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

  it("charges concurrent duplicate Kharakternyk ward support only once", async () => {
    await seedCharacter(prisma, "ward-support-race-leader-user", 2136n, "Знакар Підпор", {
      level: 8,
      classId: "class.kharakternyk",
      manaCurrent: 10,
      statsJson: { intelligence: 13, luck: 13 }
    });
    await seedCharacter(prisma, "ward-support-race-one-user", 2137n, "Перша Підпора", {
      level: 8,
      manaCurrent: 10,
      statsJson: { intelligence: 13, luck: 13 }
    });
    await seedCharacter(prisma, "ward-support-race-two-user", 2138n, "Друга Підпора", {
      level: 8,
      manaCurrent: 10,
      statsJson: { intelligence: 13, luck: 13 }
    });
    await repository.createForTelegramUser(2136n, bigBarrelInput("party-token-ward-support-race"));
    await repository.joinByTokenForTelegramUser(2137n, "party-token-ward-support-race", joinInput());
    await repository.joinByTokenForTelegramUser(2138n, "party-token-ward-support-race", joinInput());
    await repository.placeKharakternykWardSign(2136n, "party-token-ward-support-race", now());

    const duplicateResults = await Promise.all([
      repository.supportKharakternykWardSign(2137n, "party-token-ward-support-race", now()),
      repository.supportKharakternykWardSign(2137n, "party-token-ward-support-race", now())
    ]);

    expect(duplicateResults.map((result) => result.state).sort()).toEqual(["already-supported", "updated"]);
    const afterDuplicate = await repository.findByToken("party-token-ward-support-race", now());
    expect(afterDuplicate?.wardSign).toMatchObject({
      kind: "kharakternyk",
      placerCharacterId: "ward-support-race-leader-user-character",
      supportCount: 1,
      supportCap: 7
    });
    expect(afterDuplicate?.participants.find((participant) =>
      participant.character.telegramUserId === 2137n
    )?.wardSignSupport).toMatchObject({
      kind: "kharakternyk",
      placerCharacterId: "ward-support-race-leader-user-character",
      supporterCharacterId: "ward-support-race-one-user-character",
      manaCost: 5
    });
    await expectWardSupportSnapshotCount(prisma, "party-token-ward-support-race", 1);

    const secondSupport = await repository.supportKharakternykWardSign(2138n, "party-token-ward-support-race", now());

    expect(secondSupport.state).toBe("updated");
    expect("session" in secondSupport ? secondSupport.session.wardSign : null).toMatchObject({
      kind: "kharakternyk",
      placerCharacterId: "ward-support-race-leader-user-character",
      supportCount: 2,
      supportCap: 7
    });
    await expectWardSupportSnapshotCount(prisma, "party-token-ward-support-race", 2);
    await expect(prisma.character.findMany({
      where: {
        id: {
          in: [
            "ward-support-race-leader-user-character",
            "ward-support-race-one-user-character",
            "ward-support-race-two-user-character"
          ]
        }
      },
      orderBy: { id: "asc" },
      select: { id: true, manaCurrent: true }
    })).resolves.toEqual([
      { id: "ward-support-race-leader-user-character", manaCurrent: 0 },
      { id: "ward-support-race-one-user-character", manaCurrent: 5 },
      { id: "ward-support-race-two-user-character", manaCurrent: 5 }
    ]);
  });

  it("fails closed for non-member and terminal Kharakternyk ward support callbacks", async () => {
    await seedCharacter(prisma, "ward-support-closed-leader-user", 2139n, "Закривач Знака", {
      level: 8,
      classId: "class.kharakternyk",
      manaCurrent: 10,
      statsJson: { intelligence: 13, luck: 13 }
    });
    await seedCharacter(prisma, "ward-support-closed-outsider-user", 2140n, "Зайва Підпора", {
      level: 8,
      manaCurrent: 10,
      statsJson: { intelligence: 13, luck: 13 }
    });
    await repository.createForTelegramUser(2139n, bigBarrelInput("party-token-ward-support-closed"));
    await repository.placeKharakternykWardSign(2139n, "party-token-ward-support-closed", now());

    const nonMember = await repository.supportKharakternykWardSign(2140n, "party-token-ward-support-closed", now());
    const cancelled = await repository.cancelByTokenForTelegramUser(2139n, "party-token-ward-support-closed", now());
    const staleTerminal = await repository.supportKharakternykWardSign(2140n, "party-token-ward-support-closed", now());

    expect(nonMember.state).toBe("not-member");
    expect(cancelled.state).toBe("cancelled");
    expect(staleTerminal.state).toBe("cancelled");
    await expectWardSupportSnapshotCount(prisma, "party-token-ward-support-closed", 0);
    await expect(prisma.character.findUnique({
      where: { id: "ward-support-closed-outsider-user-character" },
      select: { manaCurrent: true }
    })).resolves.toEqual({ manaCurrent: 10 });
  });

  it("keeps a generic party-card reference separate from the durable raid-chat reference", async () => {
    await seedCharacter(prisma, "message-ref-user", 2151n, "Карткова", { level: 8 });
    await repository.createForTelegramUser(2151n, {
      ...bigBarrelInput("party-token-message-ref"),
      chatId: null,
      messageId: null
    });
    const delivery = await prisma.partyRaidChatDeliveryState.findFirstOrThrow({
      where: { participant: { session: { inviteToken: "party-token-message-ref" } } },
      select: { id: true }
    });
    const idleAt = new Date("9999-12-31T23:59:59.999Z");
    await prisma.partyRaidChatDeliveryState.update({
      where: { id: delivery.id },
      data: { desiredRevision: 1, renderedRevision: 1, nextAttemptAt: idleAt }
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
    await expect(prisma.partyRaidChatDeliveryState.findUniqueOrThrow({
      where: { id: delivery.id },
      select: { activeChatId: true, activeMessageId: true, nextAttemptAt: true }
    })).resolves.toEqual({
      activeChatId: null,
      activeMessageId: null,
      nextAttemptAt: idleAt
    });
    await prisma.partyRaidChatDeliveryState.update({
      where: { id: delivery.id },
      data: {
        version: { increment: 1 },
        nextAttemptAt: now(),
        lastDeliveryClass: "refresh-requested"
      }
    });
    const due = (await new PrismaPartyRaidChatRepository(prisma).listDueDeliveries(now(), 130))
      .find((candidate) => candidate.id === delivery.id);
    expect(due).toMatchObject({ chatId: null, messageId: null });
  });

  it("records a replacement card reference after the party becomes terminal-ineligible", async () => {
    await seedCharacter(prisma, "terminal-message-ref-user", 2152n, "Карткова Архіварка", { level: 8 });
    await repository.createForTelegramUser(2152n, {
      ...bigBarrelInput("party-token-terminal-message-ref"),
      chatId: null,
      messageId: null
    });
    await prisma.partySession.update({
      where: { inviteToken: "party-token-terminal-message-ref" },
      data: { status: "ineligible", activeLeaderKey: null }
    });

    const updated = await repository.recordParticipantMessageReference(
      2152n,
      "party-token-terminal-message-ref",
      { chatId: 2152n, messageId: 93, now: now() }
    );

    expect(updated?.status).toBe("ineligible");
    expect(updated?.participants.find((row) => row.character.telegramUserId === 2152n)).toMatchObject({
      chatId: 2152n,
      messageId: 93
    });
  });

  it("preserves terminal-ineligible across every stale preparation mutation", async () => {
    await seedCharacter(prisma, "terminal-replay-leader-user", 2153n, "Закрита Лідерка", {
      level: 8,
      classId: "class.kharakternyk",
      manaCurrent: 20
    });
    await seedCharacter(prisma, "terminal-replay-outsider-user", 2154n, "Пізній Запис", { level: 8 });
    await repository.createForTelegramUser(
      2153n,
      bigBarrelInput("party-token-terminal-replays")
    );
    await prisma.partySession.update({
      where: { inviteToken: "party-token-terminal-replays" },
      data: { status: "ineligible", activeLeaderKey: null }
    });
    await prisma.partyParticipant.updateMany({
      where: { session: { inviteToken: "party-token-terminal-replays" } },
      data: { activeMembershipKey: null }
    });

    const results = [
      await repository.joinByTokenForTelegramUser(2154n, "party-token-terminal-replays", joinInput()),
      await repository.leaveByTokenForTelegramUser(2153n, "party-token-terminal-replays", now()),
      await repository.cancelByTokenForTelegramUser(2153n, "party-token-terminal-replays", now()),
      await repository.setParticipantReadiness(2153n, "party-token-terminal-replays", "ready", now()),
      await repository.placeKharakternykWardSign(2153n, "party-token-terminal-replays", now()),
      await repository.supportKharakternykWardSign(2153n, "party-token-terminal-replays", now()),
      await repository.fileBureaucramancerPersonalProtocol(2153n, "party-token-terminal-replays", now()),
      await repository.signBureaucramancerPersonalProtocol(2153n, "party-token-terminal-replays", now())
    ];

    expect(results.map((result) => result.state)).toEqual(Array(8).fill("terminal-ineligible"));
    await expect(prisma.partySession.findUniqueOrThrow({
      where: { inviteToken: "party-token-terminal-replays" },
      select: { status: true }
    })).resolves.toEqual({ status: "ineligible" });
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

  it("blocks Big Barrel creation while the same-period legacy solo raid is pending", async () => {
    await seedCharacter(prisma, "big-create-pending-solo-user", 2503n, "Ще В Соло", { level: 8 });
    const availableAt = new Date(now().getTime() + 60_000);
    await prisma.characterCooldown.create({
      data: {
        id: "big-create-pending-solo",
        characterId: "big-create-pending-solo-user-character",
        key: buildFridayBarrelRaidPendingKey("12026-06-29"),
        availableAt
      }
    });

    const blocked = await repository.createForTelegramUser(
      2503n,
      bigBarrelInput("party-token-big-create-pending-solo")
    );

    expect(blocked).toMatchObject({
      state: "ineligible",
      reason: "pending-solo-raid",
      availableAt
    });
    await expect(prisma.partySession.count({
      where: { inviteToken: "party-token-big-create-pending-solo" }
    })).resolves.toBe(0);
  });

  it("blocks a Big Barrel join until a due same-period legacy solo raid is claimed", async () => {
    await seedCharacter(prisma, "big-pending-solo-leader-user", 2504n, "Ватажок", { level: 8 });
    await seedCharacter(prisma, "big-pending-solo-joiner-user", 2505n, "Ще Десь В Соло", { level: 8 });
    await repository.createForTelegramUser(
      2504n,
      bigBarrelInput("party-token-big-join-pending-solo")
    );
    const availableAt = new Date(now().getTime() - 1);
    await prisma.characterCooldown.create({
      data: {
        id: "big-join-pending-solo",
        characterId: "big-pending-solo-joiner-user-character",
        key: buildFridayBarrelRaidPendingKey("12026-06-29"),
        availableAt
      }
    });

    const blocked = await repository.joinByTokenForTelegramUser(
      2505n,
      "party-token-big-join-pending-solo",
      joinInput()
    );

    expect(blocked).toMatchObject({
      state: "ineligible",
      reason: "pending-solo-raid",
      availableAt
    });
    await expectNoMembership(prisma, "party-token-big-join-pending-solo", 2505n);
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

  it("preserves only allowlisted due auto-start parties for their schedulers", async () => {
    await seedCharacter(prisma, "ordinary-due-user", 4011n, "Звичайна");
    await seedCharacter(prisma, "barrel-due-user", 4012n, "Бочкова");
    await seedCharacter(prisma, "group-due-user", 4013n, "Гуртова");
    const dueAt = new Date("2026-06-29T14:59:00.000Z");

    await repository.createForTelegramUser(4011n, partyInput("party-due-ordinary"));
    await repository.createForTelegramUser(4012n, bigBarrelInput("party-due-barrel"));
    await repository.createForTelegramUser(4013n, groupCombatInput("party-due-group"));
    await prisma.partySession.updateMany({
      where: {
        inviteToken: {
          in: ["party-due-ordinary", "party-due-barrel", "party-due-group"]
        }
      },
      data: {
        joinUntilAt: dueAt,
        expiresAt: dueAt
      }
    });

    await expect(repository.expireRecruiting(now())).resolves.toBe(1);

    expect((await repository.findByToken("party-due-ordinary", now()))?.status).toBe("expired");
    expect((await repository.findByToken("party-due-barrel", now()))?.status).toBe("recruiting");
    expect((await repository.findByToken("party-due-group", now()))?.status).toBe("recruiting");
    await expect(repository.listDueRecruitingByOrigin(
      "group-combat.proof",
      now()
    )).resolves.toEqual([
      expect.objectContaining({ inviteToken: "party-due-group", status: "recruiting" })
    ]);
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

    const beforeExpiry = await prisma.partySession.findUniqueOrThrow({
      where: { inviteToken: "party-token-g" },
      select: { version: true }
    });
    const stale = await repository.forceExpireByToken("party-token-g", now(), beforeExpiry.version - 1);
    const expired = await repository.forceExpireByToken("party-token-g", now(), beforeExpiry.version);
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
    expect(stale?.status).toBe("recruiting");
    expect(expired?.status).toBe("expired");
    expect(duplicate?.status).toBe("expired");
    expect(row).toEqual({ status: "expired", activeLeaderKey: null, version: 3 });
    expect(activeKeys).toBe(0);
  });

  it.each([
    ["cancel", "simulate_start_wins_cancel", 9101n],
    ["expire", "simulate_start_wins_expire", 9102n]
  ] as const)("keeps memberships when raid start wins against stale %s cleanup", async (operation, triggerName, telegramUserId) => {
    const token = `party-token-start-wins-${operation}`;
    const userId = `start-wins-${operation}-user`;
    await seedCharacter(prisma, userId, telegramUserId, `Старт Перемагає ${operation}`);
    await repository.createForTelegramUser(telegramUserId, partyInput(token));

    await withSimulatedStartWinningTerminalTransition(prisma, triggerName, token, async () => {
      if (operation === "cancel") {
        const result = await repository.cancelByTokenForTelegramUser(telegramUserId, token, now());
        expect(result.state).toBe("stale");
        expect("session" in result ? result.session.status : null).toBe("active");
      } else {
        const result = await repository.forceExpireByToken(token);
        expect(result?.status).toBe("active");
      }
    });

    await expect(prisma.partyParticipant.count({
      where: {
        session: { inviteToken: token },
        activeMembershipKey: { not: null }
      }
    })).resolves.toBe(1);
  });
});

async function withForcedSessionVersionCasLoss<T>(
  prisma: PrismaClient,
  triggerName: string,
  inviteToken: string,
  action: () => Promise<T>
): Promise<T> {
  const safeTriggerName = triggerName.replace(/[^a-z0-9_]/gi, "_");
  const safeInviteToken = inviteToken.replace(/'/g, "''");
  await prisma.$executeRawUnsafe(`CREATE TEMP TRIGGER ${safeTriggerName}
    BEFORE UPDATE OF version ON party_sessions
    WHEN OLD.invite_token = '${safeInviteToken}'
    BEGIN
      SELECT RAISE(IGNORE);
    END`);
  try {
    return await action();
  } finally {
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${safeTriggerName}`);
  }
}

async function applyRaidChatMigration(prisma: PrismaClient): Promise<void> {
  for (const migration of [
    "20260720013000_add_party_raid_chat",
    "20260720171500_add_party_raid_chat_delivery_version"
  ]) {
    const sql = await readFile(resolve(`prisma/migrations/${migration}/migration.sql`), "utf8");
    for (const statement of sql.split(";").map((value) => value.trim()).filter(Boolean)) {
      await prisma.$executeRawUnsafe(statement);
    }
  }
  await prisma.$executeRawUnsafe("ALTER TABLE party_sessions ADD COLUMN origin_kind TEXT");
}

async function withSimulatedStartWinningTerminalTransition<T>(
  prisma: PrismaClient,
  triggerName: string,
  inviteToken: string,
  action: () => Promise<T>
): Promise<T> {
  const safeTriggerName = triggerName.replace(/[^a-z0-9_]/gi, "_");
  const safeInviteToken = inviteToken.replace(/'/g, "''");
  await prisma.$executeRawUnsafe(`CREATE TEMP TRIGGER ${safeTriggerName}
    BEFORE UPDATE OF status ON party_sessions
    WHEN OLD.invite_token = '${safeInviteToken}' AND NEW.status IN ('cancelled', 'expired')
    BEGIN
      UPDATE party_sessions SET status = 'active', version = OLD.version + 1 WHERE id = OLD.id;
      SELECT RAISE(IGNORE);
    END`);
  try {
    return await action();
  } finally {
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${safeTriggerName}`);
  }
}

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

function groupCombatInput(inviteToken: string) {
  return {
    ...partyInput(inviteToken),
    participantCap: 3,
    minimumParticipants: 2,
    originLocationId: "group-combat.proof"
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
    manaRegenAt?: Date | null;
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
          manaRegenAt: options.manaRegenAt,
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

async function seedAttuningEquipment(
  prisma: PrismaClient,
  characterId: string,
  itemId: string,
  readyAt: Date,
  historicalCount = 0
): Promise<void> {
  const equipmentUpdatedAt = new Date(now().getTime() - 2 * 60_000);
  const equipmentId = `${characterId}-head`;
  await prisma.characterEquipment.create({
    data: {
      id: equipmentId,
      characterId,
      slot: "head",
      itemId,
      updatedAt: equipmentUpdatedAt
    }
  });
  await prisma.dailyAction.create({
    data: {
      id: `${characterId}-attunement`,
      characterId,
      key: EQUIPMENT_ATTUNEMENT_ACTION_KEY,
      localDate: `head:${equipmentId}:${equipmentUpdatedAt.getTime()}`,
      rewardXp: 0,
      rewardGold: 0,
      resultJson: buildEquipmentAttunementPayload({
        slot: "head",
        itemId,
        itemName: "Капелюх знайденої полиці",
        equipmentUpdatedAt,
        strength: "weak",
        startedAt: equipmentUpdatedAt,
        readyAt
      })
    }
  });
  for (let index = 0; index < historicalCount; index += 1) {
    await prisma.dailyAction.create({
      data: {
        id: `${characterId}-historical-attunement-${index}`,
        characterId,
        key: EQUIPMENT_ATTUNEMENT_ACTION_KEY,
        localDate: `historical:${index}`,
        rewardXp: 0,
        rewardGold: 0,
        resultJson: { version: 1, status: "cancelled" }
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

async function expectWardSignSnapshotCount(
  prisma: PrismaClient,
  inviteToken: string,
  expectedCount: number
): Promise<void> {
  const snapshots = await prisma.partyParticipant.findMany({
    where: {
      session: {
        inviteToken
      }
    },
    select: {
      snapshotJson: true
    }
  });

  expect(snapshots.filter((row) => hasKharakternykWardSignSnapshot(row.snapshotJson))).toHaveLength(expectedCount);
}

async function expectWardSupportSnapshotCount(
  prisma: PrismaClient,
  inviteToken: string,
  expectedCount: number
): Promise<void> {
  const snapshots = await prisma.partyParticipant.findMany({
    where: {
      session: {
        inviteToken
      }
    },
    select: {
      snapshotJson: true
    }
  });

  expect(snapshots.filter((row) => hasKharakternykWardSupportSnapshot(row.snapshotJson))).toHaveLength(expectedCount);
}

function hasKharakternykWardSupportSnapshot(snapshotJson: unknown): boolean {
  if (!snapshotJson || typeof snapshotJson !== "object" || Array.isArray(snapshotJson)) {
    return false;
  }

  const wardSupport = (snapshotJson as Record<string, unknown>).kharakternykWardSupport;
  return Boolean(
    wardSupport &&
    typeof wardSupport === "object" &&
    !Array.isArray(wardSupport) &&
    (wardSupport as Record<string, unknown>).kind === "kharakternyk"
  );
}

async function expectPersonalProtocolSnapshotCount(
  prisma: PrismaClient,
  inviteToken: string,
  expectedCount: number
): Promise<void> {
  const snapshots = await prisma.partyParticipant.findMany({
    where: {
      session: {
        inviteToken
      }
    },
    select: {
      snapshotJson: true
    }
  });

  expect(snapshots.filter((row) => hasPersonalProtocolSnapshot(row.snapshotJson))).toHaveLength(expectedCount);
}

async function expectPersonalProtocolSignatureSnapshotCount(
  prisma: PrismaClient,
  inviteToken: string,
  expectedCount: number
): Promise<void> {
  const snapshots = await prisma.partyParticipant.findMany({
    where: {
      session: {
        inviteToken
      }
    },
    select: {
      snapshotJson: true
    }
  });

  expect(snapshots.filter((row) => hasPersonalProtocolSignatureSnapshot(row.snapshotJson))).toHaveLength(expectedCount);
}

function hasPersonalProtocolSnapshot(snapshotJson: unknown): boolean {
  return hasSnapshotKind(snapshotJson, "bureaucramancerPersonalProtocol13B", "bureaucramancer-personal-protocol-13b");
}

function hasPersonalProtocolSignatureSnapshot(snapshotJson: unknown): boolean {
  return hasSnapshotKind(snapshotJson, "bureaucramancerPersonalProtocol13BSignature", "bureaucramancer-personal-protocol-13b");
}

function hasSnapshotKind(snapshotJson: unknown, key: string, kind: string): boolean {
  if (!snapshotJson || typeof snapshotJson !== "object" || Array.isArray(snapshotJson)) {
    return false;
  }

  const value = (snapshotJson as Record<string, unknown>)[key];
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).kind === kind
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
