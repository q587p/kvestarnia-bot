import type { Bot, Context } from "grammy";
import { describe, expect, it, vi } from "vitest";
import { handlePartySessionCallback } from "../../src/bot/commands/partySessionCommand";
import { createPartyBossRecruitingStartScheduler } from "../../src/bot/partyBossRecruitingStartScheduler";
import type { PartyBossSessionRecord } from "../../src/db/repositories/partyBossRepository";
import type { PartySessionRecord } from "../../src/db/repositories/partySessionRepository";
import { BIG_BARREL_BROTHER_BOSS_KEY, BIG_BARREL_BROTHER_RULES_VERSION } from "../../src/domain/partyBoss/partyBoss";
import { BIG_BARREL_PARTY_ORIGIN_LOCATION_ID } from "../../src/services/partySessionService";
import type { PartyBossService } from "../../src/services/partyBossService";
import type { PartySessionService } from "../../src/services/partySessionService";
import type { PresenceService } from "../../src/services/presenceService";

describe("party boss recruiting start scheduler", () => {
  it("starts due Big Barrel Brother recruiting parties and sends private battle cards", async () => {
    const party = makePartySession();
    const bossSession = makeBossSession();
    const startFromPartyForTelegramUser = vi.fn().mockResolvedValue({
      state: "started",
      session: bossSession
    });
    const sendMessage = vi.fn().mockResolvedValue({ message_id: 1 });
    const scheduler = createPartyBossRecruitingStartScheduler(
      {
        partySessions: {
          isBigBarrelBrotherEnabled: () => true,
          listDueRecruitingBigBarrelBrother: vi.fn().mockResolvedValue([party])
        } as unknown as PartySessionService,
        partyBoss: {
          isEnabled: () => true,
          listDueTimedOutSessions: vi.fn().mockResolvedValue([]),
          startFromPartyForTelegramUser,
          hasCombatItemsForTelegramUser: vi.fn().mockResolvedValue(false)
        } as unknown as PartyBossService
      },
      {
        api: {
          sendMessage
        }
      } as unknown as Bot
    );

    await expect(scheduler.tick()).resolves.toBe(1);

    expect(startFromPartyForTelegramUser).toHaveBeenCalledWith(
      42n,
      "partyABC12",
      { allowExpiredRecruiting: true }
    );
    expect(sendMessage).toHaveBeenCalledTimes(4);
    expect(sendMessage.mock.calls[0]?.[0]).toBe(42);
    expect(sendMessage.mock.calls[0]?.[1]).toContain("🛢️ <b>Старший Брат Бочки втрутився</b>");
    expect(sendMessage.mock.calls[2]?.[1]).toContain("Збір завершився. Старший Брат Бочки підняв кришку й почав бій.");
    expect(sendMessage.mock.calls[2]?.[1]).toContain("🛢️ <b>Бій: 1 хід</b>");
    expect(sendMessage.mock.calls[2]?.[1]).toContain("👹 Старший Брат Бочки: HP 174/174");
    expect(sendMessage.mock.calls[2]?.[1]).toContain("⏳ На хід є 23 секунди.");
    expect(sendMessage.mock.calls[0]?.[2]).toMatchObject({
      parse_mode: "HTML"
    });
    expect(JSON.stringify(sendMessage.mock.calls[2]?.[2])).toContain("v1:party:ba:partyABC12:1:a");
    expect(JSON.stringify(sendMessage.mock.calls[2]?.[2])).not.toContain("📜 Журнал");
  });

  it("terminalizes permanently incompatible due parties once and notifies every participant", async () => {
    const party = makePartySession();
    const terminalParty: PartySessionRecord = {
      ...party,
      status: "ineligible",
      activeLeaderKey: null,
      participants: party.participants.map((participant) => ({
        ...participant
      }))
    };
    const listDueRecruitingBigBarrelBrother = vi.fn()
      .mockResolvedValueOnce([party])
      .mockResolvedValueOnce([]);
    const startFromPartyForTelegramUser = vi.fn().mockResolvedValue({
      state: "terminal-ineligible"
    });
    const getByToken = vi.fn().mockResolvedValue({
      state: "ready",
      session: terminalParty
    });
    const recordParticipantMessageReference = vi.fn();
    const editMessageText = vi.fn().mockResolvedValue(true);
    const sendMessage = vi.fn().mockResolvedValue({ message_id: 1 });
    const scheduler = createPartyBossRecruitingStartScheduler(
      {
        partySessions: {
          isBigBarrelBrotherEnabled: () => true,
          listDueRecruitingBigBarrelBrother,
          getByToken,
          recordParticipantMessageReference
        } as unknown as PartySessionService,
        partyBoss: {
          isEnabled: () => true,
          listDueTimedOutSessions: vi.fn().mockResolvedValue([]),
          startFromPartyForTelegramUser
        } as unknown as PartyBossService
      },
      { api: { editMessageText, sendMessage } } as unknown as Bot
    );

    await expect(scheduler.tick()).resolves.toBe(1);
    await expect(scheduler.tick()).resolves.toBe(0);

    expect(startFromPartyForTelegramUser).toHaveBeenCalledTimes(1);
    expect(getByToken).toHaveBeenCalledWith(party.inviteToken);
    expect(editMessageText).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage.mock.calls.every((call) =>
      String(call[1]).includes("один із записів більше не підходить до цього бочкового періоду")
    )).toBe(true);
    expect(sendMessage.mock.calls.every((call) =>
      !JSON.stringify(call[2] ?? {}).includes("v1:party:bs:")
    )).toBe(true);
    expect(recordParticipantMessageReference).toHaveBeenCalledTimes(2);
    expect(recordParticipantMessageReference).toHaveBeenCalledWith(42n, party.inviteToken, {
      chatId: 42n,
      messageId: 1
    });
    expect(recordParticipantMessageReference).toHaveBeenCalledWith(93n, party.inviteToken, {
      chatId: 93n,
      messageId: 1
    });
  });

  it("resolves due active party boss turns and sends updated battle cards", async () => {
    const dueSession = makeBossSession();
    const resolvedSession = makeBossSession({
      turn: 2,
      roundLog: [{
        turn: 1,
        actions: [{
          characterId: "character-42",
          action: "defend",
          origin: "timeout",
          outcome: "defended",
          damage: 0,
          manaSpent: 0
        }],
        bossDamage: 0,
        bossHpAfter: 174,
        bossRetaliations: [{ characterId: "character-42", damage: 3, hpAfter: 57 }],
        statusAfter: "active"
      }]
    });
    const resolveDueTimedOutByToken = vi.fn().mockResolvedValue({
      state: "resolved",
      session: resolvedSession,
      achievementUnlocksByCharacterId: {
        "character-42": [{
          id: "achievement.warrior.raid-taunt.activated",
          title: "Голосніше за кришку",
          cosmeticTitleGrantId: null,
          unlockedAt: new Date("2026-07-11T10:01:00.000Z")
        }]
      }
    });
    const sendMessage = vi.fn().mockResolvedValue({ message_id: 1 });
    const scheduler = createPartyBossRecruitingStartScheduler(
      {
        partySessions: {
          isBigBarrelBrotherEnabled: () => false,
          listDueRecruitingBigBarrelBrother: vi.fn()
        } as unknown as PartySessionService,
        partyBoss: {
          isEnabled: () => true,
          listDueTimedOutSessions: vi.fn().mockResolvedValue([dueSession]),
          resolveDueTimedOutByToken,
          hasCombatItemsForTelegramUser: vi.fn().mockResolvedValue(false)
        } as unknown as PartyBossService
      },
      {
        api: {
          sendMessage
        }
      } as unknown as Bot
    );

    await expect(scheduler.tick()).resolves.toBe(1);

    expect(resolveDueTimedOutByToken).toHaveBeenCalledWith("partyABC12");
    expect(sendMessage).toHaveBeenCalledTimes(3);
    expect(sendMessage.mock.calls[0]?.[1]).toContain("Таймер ходу спрацював.");
    expect(sendMessage.mock.calls[0]?.[1]).toContain("🛢️ <b>Бій: 2 хід</b>");
    expect(sendMessage.mock.calls[0]?.[1]).toContain("Останні дії:");
    expect(sendMessage.mock.calls[0]?.[1]).not.toContain("Старший Брат Бочки втрутився");
    expect(sendMessage.mock.calls.some((call) => String(call[1]).includes("Голосніше за кришку"))).toBe(true);
  });

  it("serializes a three-participant preparation delivery against actual scheduled start without holding notification I/O", async () => {
    const party = makeThreeParticipantPartySession();
    const bossSession = makeBossSession();
    const start = deferred<{ state: "started"; session: PartyBossSessionRecord }>();
    const notification = deferred<{ message_id: number }>();
    let canonicalBoss: PartyBossSessionRecord | null = null;
    const startFromPartyForTelegramUser = vi.fn().mockImplementation(() => start.promise);
    const setReadinessForTelegramUser = vi.fn().mockResolvedValue({ state: "updated", session: party });
    const partySessions = {
      isBigBarrelBrotherEnabled: () => true,
      listDueRecruitingBigBarrelBrother: vi.fn().mockResolvedValue([party]),
      setReadinessForTelegramUser,
      getByToken: vi.fn().mockResolvedValue({ state: "ready", session: party }),
      areDevHelpersEnabled: () => false
    } as unknown as PartySessionService;
    const partyBoss = {
      isEnabled: () => true,
      areDevHelpersEnabled: () => false,
      listDueTimedOutSessions: vi.fn().mockResolvedValue([]),
      startFromPartyForTelegramUser,
      getByPartyInviteToken: vi.fn().mockImplementation(() => Promise.resolve(canonicalBoss)),
      hasCombatItemsForTelegramUser: vi.fn().mockResolvedValue(false)
    } as unknown as PartyBossService;
    const sendMessage = vi.fn().mockImplementation(() => notification.promise);
    const scheduler = createPartyBossRecruitingStartScheduler(
      { partySessions, partyBoss },
      { api: { sendMessage } } as unknown as Bot
    );
    const preparation = createCallbackContext(93);

    const ticking = scheduler.tick();
    await vi.waitFor(() => expect(startFromPartyForTelegramUser).toHaveBeenCalledTimes(1));
    const preparing = handlePartySessionCallback(
      preparation.ctx,
      { type: "readiness", token: party.inviteToken, readiness: "ready" },
      partySessions,
      {
        presence: {} as PresenceService,
        partyBoss,
        botUsername: "kvestarnia_test_bot"
      }
    );
    await vi.waitFor(() => expect(setReadinessForTelegramUser).toHaveBeenCalledTimes(1));
    canonicalBoss = bossSession;
    start.resolve({ state: "started", session: bossSession });

    await expect(preparing).resolves.toBeUndefined();
    expect(String(preparation.editMessageText.mock.calls[0]?.[0])).toContain("Старший Брат Бочки");
    expect(JSON.stringify(preparation.editMessageText.mock.calls[0]?.[1])).toContain("v1:party:ba");
    expect(preparation.apiEditMessageText.mock.calls.some((call) =>
      call[0] === 587 && JSON.stringify(call[3]).includes("v1:party:rs:")
    )).toBe(false);

    notification.resolve({ message_id: 1 });
    await expect(ticking).resolves.toBe(1);
  });
});

function createCallbackContext(telegramUserId: number): {
  ctx: Context;
  editMessageText: ReturnType<typeof vi.fn>;
  apiEditMessageText: ReturnType<typeof vi.fn>;
} {
  const editMessageText = vi.fn().mockResolvedValue(true);
  const apiEditMessageText = vi.fn().mockResolvedValue(true);
  const ctx = {
    from: { id: telegramUserId, is_bot: false, first_name: "Тест" },
    chat: { id: telegramUserId, type: "private" },
    callbackQuery: {
      id: "callback-1",
      message: { message_id: 13, chat: { id: telegramUserId, type: "private" } }
    },
    answerCallbackQuery: vi.fn().mockResolvedValue(true),
    editMessageText,
    reply: vi.fn().mockResolvedValue({ message_id: 23 }),
    api: {
      editMessageText: apiEditMessageText,
      sendMessage: vi.fn().mockResolvedValue({ message_id: 23 })
    }
  } as unknown as Context;

  return { ctx, editMessageText, apiEditMessageText };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function makePartySession(): PartySessionRecord {
  const now = new Date("2026-06-30T10:00:00.000Z");
  const leader = makeCharacter("character-42", 42n, "Тестова Лідерка");
  const member = makeCharacter("character-93", 93n, "Друга Учасниця");

  return {
    id: "party-1",
    inviteToken: "partyABC12",
    status: "recruiting",
    leaderCharacterId: leader.id,
    periodId: "2026-06-30T11:23",
    originLocationId: BIG_BARREL_PARTY_ORIGIN_LOCATION_ID,
    participantCap: 8,
    minimumParticipants: 1,
    joinUntilAt: new Date("2026-06-30T10:13:00.000Z"),
    expiresAt: new Date("2026-06-30T10:13:00.000Z"),
    version: 1,
    activeLeaderKey: `party-leader:${leader.id}`,
    createdAt: now,
    updatedAt: now,
    leader,
    participants: [leader, member].map((character, index) => ({
      id: `participant-${index}`,
      sessionId: "party-1",
      characterId: character.id,
      remortCount: 0,
      status: "joined",
      joinSource: index === 0 ? "leader" : "nearby",
      joinedAt: now,
      leftAt: null,
      chatId: character.telegramUserId,
      messageId: null,
      character
    }))
  };
}

function makeThreeParticipantPartySession(): PartySessionRecord {
  const session = makePartySession();
  const member = makeCharacter("character-587", 587n, "Третя Учасниця");
  return {
    ...session,
    participants: [
      ...session.participants,
      {
        id: "participant-587",
        sessionId: session.id,
        characterId: member.id,
        remortCount: 0,
        status: "joined",
        joinSource: "nearby",
        joinedAt: session.createdAt,
        leftAt: null,
        chatId: 587n,
        messageId: 587,
        character: member
      }
    ]
  };
}

function makeBossSession(
  stateOverrides: Partial<PartyBossSessionRecord["state"]> = {}
): PartyBossSessionRecord {
  const now = new Date("2026-06-30T10:13:00.000Z");
  const leader = makeCharacter("character-42", 42n, "Тестова Лідерка");
  const member = makeCharacter("character-93", 93n, "Друга Учасниця");
  const state: PartyBossSessionRecord["state"] = {
    rulesVersion: BIG_BARREL_BROTHER_RULES_VERSION,
    partySessionId: "party-1",
    status: "active",
    turn: 1,
    boss: {
      monsterId: BIG_BARREL_BROTHER_BOSS_KEY,
      name: "Старший Брат Бочки",
      level: 8,
      hp: 174,
      hpMax: 174,
      attack: 13,
      armor: 4,
      resist: 2,
      dexterity: 9,
      tags: ["boss", "construct", "barrel", "surveillance"]
    },
    participants: [
      makeBossParticipant("character-42", "Тестова Лідерка"),
      makeBossParticipant("character-93", "Друга Учасниця")
    ],
    roundLog: [],
    startedAt: now.toISOString(),
    ...stateOverrides
  };

  return {
    id: "boss-1",
    partySessionId: "party-1",
    partyInviteToken: "partyABC12",
    leaderCharacterId: "character-42",
    status: "active",
    turn: state.turn,
    version: 1,
    rulesVersion: BIG_BARREL_BROTHER_RULES_VERSION,
    bossKey: BIG_BARREL_BROTHER_BOSS_KEY,
    state,
    result: null,
    turnExpiresAt: new Date("2026-06-30T10:13:23.000Z"),
    completedAt: null,
    participants: [leader, member]
  };
}

function makeBossParticipant(
  characterId: string,
  name: string
): PartyBossSessionRecord["state"]["participants"][number] {
  return {
    characterId,
    name,
    remortCount: 0,
    status: "active",
    combatStats: {
      level: 8,
      hpMax: 60,
      manaMax: 20,
      hpCurrent: 60,
      manaCurrent: 20,
      strength: 10,
      dexterity: 10,
      intelligence: 10,
      charisma: 10,
      luck: 10,
      armor: 3,
      resist: 3,
      weaponDamage: 3,
      spellPower: 3,
      raceId: "race.human-ish",
      classId: "class.warrior"
    },
    resources: {
      hp: 60,
      hpMax: 60,
      mana: 20,
      manaMax: 20
    },
    contribution: {
      submittedActions: 0,
      timeoutActions: 0,
      damageDealt: 0,
      damageTaken: 0
    }
  };
}

function makeCharacter(
  id: string,
  telegramUserId: bigint,
  name: string
): PartySessionRecord["leader"] {
  return {
    id,
    userId: `user-${id}`,
    telegramUserId,
    currentLocationId: BIG_BARREL_PARTY_ORIGIN_LOCATION_ID,
    name,
    pronoun: "they",
    path: "path.boundary",
    raceId: "race.human-ish",
    classId: "class.warrior",
    level: 8,
    xp: 587,
    gold: 42,
    hpCurrent: 60,
    hpMax: 60,
    manaCurrent: 20,
    manaMax: 20,
    hpRegenAt: null,
    manaRegenAt: null,
    activeCosmeticTitleGrantId: null,
    statsJson: {},
    remortCount: 0
  };
}
