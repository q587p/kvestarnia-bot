import type { Bot } from "grammy";
import { describe, expect, it, vi } from "vitest";
import { createPartyBossRecruitingStartScheduler } from "../../src/bot/partyBossRecruitingStartScheduler";
import type { PartyBossSessionRecord } from "../../src/db/repositories/partyBossRepository";
import type { PartySessionRecord } from "../../src/db/repositories/partySessionRepository";
import { BIG_BARREL_BROTHER_BOSS_KEY, BIG_BARREL_BROTHER_RULES_VERSION } from "../../src/domain/partyBoss/partyBoss";
import { BIG_BARREL_PARTY_ORIGIN_LOCATION_ID } from "../../src/services/partySessionService";
import type { PartyBossService } from "../../src/services/partyBossService";
import type { PartySessionService } from "../../src/services/partySessionService";

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
      session: resolvedSession
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
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage.mock.calls[0]?.[1]).toContain("Таймер ходу спрацював.");
    expect(sendMessage.mock.calls[0]?.[1]).toContain("🛢️ <b>Бій: 2 хід</b>");
    expect(sendMessage.mock.calls[0]?.[1]).toContain("Останні дії:");
    expect(sendMessage.mock.calls[0]?.[1]).not.toContain("Старший Брат Бочки втрутився");
  });
});

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
