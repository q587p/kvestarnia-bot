import type { Context } from "grammy";
import { describe, expect, it, vi } from "vitest";
import { handlePartySessionCallback } from "../../src/bot/commands/partySessionCommand";
import type { PartyBossSessionRecord } from "../../src/db/repositories/partyBossRepository";
import type { PartySessionRecord } from "../../src/db/repositories/partySessionRepository";
import type { PartySessionService } from "../../src/services/partySessionService";
import type { PartyBossService } from "../../src/services/partyBossService";
import type { PresenceService } from "../../src/services/presenceService";

describe("handlePartySessionCallback", () => {
  it("opens a standalone nearby party invite picker", async () => {
    const session = makeSession("recruiting");
    const getLiveRecruitingByTelegramUser = vi.fn().mockResolvedValue(session);
    const getNearbyDuelCandidatesForTelegramUser = vi.fn().mockResolvedValue({
      state: "ready",
      location: {
        id: "location.korchma.bar",
        name: "Шинок"
      },
      page: 0,
      pageSize: 5,
      total: 1,
      totalPages: 1,
      visible: [
        {
          telegramUserId: 93n,
          name: "Сусідня Пригодниця",
          level: 8,
          status: "active"
        }
      ]
    });
    const { ctx, editMessageText } = createCallbackContext();

    await handlePartySessionCallback(
      ctx,
      { type: "nearby-open", page: 0 },
      serviceWith({ getLiveRecruitingByTelegramUser }),
      { presence: { getNearbyDuelCandidatesForTelegramUser } as unknown as PresenceService }
    );

    expect(getLiveRecruitingByTelegramUser).toHaveBeenCalledWith(42n);
    expect(getNearbyDuelCandidatesForTelegramUser).toHaveBeenCalledWith(42n, 0);
    expect(messageText(editMessageText)).toContain("🧭 <b>Покликати у ватагу</b>");
    expect(messageText(editMessageText)).not.toContain("Кинути виклик присутнім");
    expect(keyboardJson(editMessageText)).toContain("v1:party:ni:2l:0");
    expect(keyboardJson(editMessageText)).not.toContain("v1:nd:");
  });

  it("force-expires a live recruiting party through the dev helper when allowed", async () => {
    const session = makeSession("recruiting");
    const expired = { ...session, status: "expired" as const, activeLeaderKey: null, version: 2 };
    const forceExpireByToken = vi.fn().mockResolvedValue({ state: "ready", session: expired });
    const { ctx, answerCallbackQuery, editMessageText } = createCallbackContext();

    await handlePartySessionCallback(
      ctx,
      { type: "expire", token: session.inviteToken },
      serviceWith({
        areDevHelpersEnabled: () => true,
        forceExpireByToken
      }),
      { presence: {} as PresenceService }
    );

    expect(forceExpireByToken).toHaveBeenCalledWith(session.inviteToken);
    expect(answerCallbackQuery).toHaveBeenCalledWith({ text: "Строк збору завершено." });
    expect(messageText(editMessageText)).toContain("Стан: строк збору минув");
    expect(keyboardJson(editMessageText)).not.toContain("⏱️ Dev: завершити строк");
  });

  it("rejects the dev expiry callback without mutating when helper mode is disabled", async () => {
    const forceExpireByToken = vi.fn();
    const { ctx, answerCallbackQuery, editMessageText } = createCallbackContext();

    await handlePartySessionCallback(
      ctx,
      { type: "expire", token: "partyABC12" },
      serviceWith({
        areDevHelpersEnabled: () => false,
        forceExpireByToken
      }),
      { presence: {} as PresenceService }
    );

    expect(forceExpireByToken).not.toHaveBeenCalled();
    expect(answerCallbackQuery).toHaveBeenCalledWith({
      text: "Ця кнопка вже втратила магію. Спробуйте /start ще раз.",
      show_alert: true
    });
    expect(editMessageText).not.toHaveBeenCalled();
  });

  it("pushes the started boss card to other participants", async () => {
    const session = makeBossSession();
    const startFromPartyForTelegramUser = vi.fn().mockResolvedValue({ state: "started", session });
    const { ctx, editMessageText, sendMessage } = createCallbackContext();

    await handlePartySessionCallback(
      ctx,
      { type: "boss-start", token: session.partyInviteToken },
      serviceWith({}),
      {
        presence: {} as PresenceService,
        partyBoss: partyBossWith({ startFromPartyForTelegramUser })
      }
    );

    expect(startFromPartyForTelegramUser).toHaveBeenCalledWith(42n, session.partyInviteToken);
    expect(messageText(editMessageText)).toContain("Бос-пробу запущено");
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0]?.[0]).toBe(93);
    expect(String(sendMessage.mock.calls[0]?.[1])).toContain("Бос-пробу запущено");
    expect(JSON.stringify(sendMessage.mock.calls[0]?.[2])).toContain("v1:party:ba");
  });

  it("pushes the next boss turn to participants who acted earlier", async () => {
    const session = makeBossSession({
      turn: 2,
      roundLog: [{
        turn: 1,
        actions: [
          {
            characterId: "character-42",
            action: "attack",
            origin: "manual",
            outcome: "hit",
            damage: 7,
            manaSpent: 0
          },
          {
            characterId: "character-93",
            action: "defend",
            origin: "manual",
            outcome: "defended",
            damage: 0,
            manaSpent: 0
          }
        ],
        bossDamage: 7,
        bossHpAfter: 58,
        bossRetaliations: [
          { characterId: "character-42", damage: 4, hpAfter: 21 },
          { characterId: "character-93", damage: 3, hpAfter: 22 }
        ],
        statusAfter: "active"
      }]
    });
    const submitActionForTelegramUser = vi.fn().mockResolvedValue({ state: "resolved", session });
    const { ctx, editMessageText, sendMessage } = createCallbackContext(93);

    await handlePartySessionCallback(
      ctx,
      { type: "boss-action", token: session.partyInviteToken, turn: 1, action: "defend" },
      serviceWith({}),
      {
        presence: {} as PresenceService,
        partyBoss: partyBossWith({ submitActionForTelegramUser })
      }
    );

    expect(submitActionForTelegramUser).toHaveBeenCalledWith(93n, session.partyInviteToken, 1, "defend");
    expect(messageText(editMessageText)).toContain("2 хід");
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0]?.[0]).toBe(42);
    expect(String(sendMessage.mock.calls[0]?.[1])).toContain("Хід оновлено");
    expect(String(sendMessage.mock.calls[0]?.[1])).toContain("2 хід");
  });

  it("opens the boss journal from the stored round log", async () => {
    const session = makeBossSession({
      roundLog: [{
        turn: 1,
        actions: [
          {
            characterId: "character-42",
            action: "attack",
            origin: "manual",
            outcome: "hit",
            damage: 7,
            manaSpent: 0
          },
          {
            characterId: "character-93",
            action: "race",
            origin: "manual",
            outcome: "hit",
            damage: 0,
            manaSpent: 0,
            skillId: "ability.race.low-center-of-gravity"
          }
        ],
        bossDamage: 7,
        bossHpAfter: 58,
        bossRetaliations: [{ characterId: "character-42", damage: 4, hpAfter: 21 }],
        statusAfter: "active"
      }]
    });
    const getByPartyInviteToken = vi.fn().mockResolvedValue(session);
    const { ctx, editMessageText } = createCallbackContext();

    await handlePartySessionCallback(
      ctx,
      { type: "boss-journal", token: session.partyInviteToken },
      serviceWith({}),
      {
        presence: {} as PresenceService,
        partyBoss: partyBossWith({ getByPartyInviteToken })
      }
    );

    expect(getByPartyInviteToken).toHaveBeenCalledWith(session.partyInviteToken);
    expect(messageText(editMessageText)).toContain("📜 <b>Журнал бос-проби</b>");
    expect(messageText(editMessageText)).toContain("Хід 1");
    expect(messageText(editMessageText)).toContain("Тестова Лідерка: удар: 7 шкоди");
    expect(messageText(editMessageText)).toContain("Друга Учасниця: расова дія: ефект без прямої шкоди");
  });
});

function serviceWith(overrides: Partial<PartySessionService>): PartySessionService {
  return {
    isEnabled: () => true,
    areDevHelpersEnabled: () => false,
    forceExpireByToken: vi.fn(),
    getLiveRecruitingByTelegramUser: vi.fn(),
    ...overrides
  } as unknown as PartySessionService;
}

function partyBossWith(overrides: Partial<PartyBossService>): PartyBossService {
  return {
    isEnabled: () => true,
    startFromPartyForTelegramUser: vi.fn(),
    submitActionForTelegramUser: vi.fn(),
    resolveTimedOutByToken: vi.fn(),
    getByPartyInviteToken: vi.fn(),
    ...overrides
  } as unknown as PartyBossService;
}

function createCallbackContext(): {
  ctx: Context;
  answerCallbackQuery: ReturnType<typeof vi.fn>;
  editMessageText: ReturnType<typeof vi.fn>;
  sendMessage: ReturnType<typeof vi.fn>;
}
function createCallbackContext(telegramUserId = 42): {
  ctx: Context;
  answerCallbackQuery: ReturnType<typeof vi.fn>;
  editMessageText: ReturnType<typeof vi.fn>;
  sendMessage: ReturnType<typeof vi.fn>;
} {
  const answerCallbackQuery = vi.fn().mockResolvedValue(true);
  const editMessageText = vi.fn().mockResolvedValue(true);
  const sendMessage = vi.fn().mockResolvedValue(true);
  const ctx = {
    from: {
      id: telegramUserId,
      is_bot: false,
      first_name: "Тест"
    },
    chat: {
      id: telegramUserId,
      type: "private"
    },
    callbackQuery: {
      id: "callback-1",
      message: {
        message_id: 13,
        chat: {
          id: telegramUserId,
          type: "private"
        }
      }
    },
    answerCallbackQuery,
    editMessageText,
    api: {
      sendMessage
    }
  } as unknown as Context;

  return { ctx, answerCallbackQuery, editMessageText, sendMessage };
}

function messageText(editMessageText: ReturnType<typeof vi.fn>): string {
  const call = editMessageText.mock.calls[0] as [string, { reply_markup?: unknown }?] | undefined;

  return call?.[0] ?? "";
}

function keyboardJson(editMessageText: ReturnType<typeof vi.fn>): string {
  const call = editMessageText.mock.calls[0] as [string, { reply_markup?: unknown }?] | undefined;

  return JSON.stringify(call?.[1]?.reply_markup);
}

function makeSession(status: PartySessionRecord["status"]): PartySessionRecord {
  const now = new Date("2026-06-29T15:00:00.000Z");

  return {
    id: "party-1",
    inviteToken: "partyABC12",
    status,
    leaderCharacterId: "character-42",
    periodId: "12026-06-29",
    originLocationId: "korchma.board",
    participantCap: 8,
    minimumParticipants: 1,
    joinUntilAt: new Date("2026-06-29T15:13:00.000Z"),
    expiresAt: new Date("2026-06-29T15:13:00.000Z"),
    version: status === "recruiting" ? 1 : 2,
    activeLeaderKey: status === "recruiting" ? "party-leader:character-42" : null,
    createdAt: now,
    updatedAt: now,
    leader: makeCharacter(),
    participants: [
      {
        id: "participant-42",
        sessionId: "party-1",
        characterId: "character-42",
        remortCount: 0,
        status: "joined",
        joinSource: "leader",
        joinedAt: now,
        leftAt: null,
        chatId: 42n,
        messageId: 13,
        character: makeCharacter()
      }
    ]
  };
}

function makeBossSession(overrides: Partial<PartyBossSessionRecord["state"]> = {}): PartyBossSessionRecord {
  const now = new Date("2026-06-30T10:00:00.000Z");
  const leader = makeCharacter();
  const member = {
    ...makeCharacter(),
    id: "character-93",
    userId: "user-93",
    telegramUserId: 93n,
    name: "Друга Учасниця"
  };
  const state: PartyBossSessionRecord["state"] = {
    rulesVersion: "party-boss-proof-v1",
    partySessionId: "party-1",
    status: "active",
    turn: 1,
    boss: {
      monsterId: "party-boss-proof-one",
      name: "Контрольний Бос",
      level: 3,
      hp: 65,
      hpMax: 65,
      attack: 8,
      armor: 2,
      resist: 1,
      dexterity: 5,
      tags: ["party-boss-proof"]
    },
    participants: [
      makeBossParticipant("character-42", "Тестова Лідерка"),
      makeBossParticipant("character-93", "Друга Учасниця")
    ],
    roundLog: [],
    startedAt: now.toISOString(),
    ...overrides
  };

  return {
    id: "boss-1",
    partySessionId: "party-1",
    partyInviteToken: "partyABC12",
    leaderCharacterId: "character-42",
    status: state.status,
    turn: state.turn,
    version: 1,
    rulesVersion: "party-boss-proof-v1",
    bossKey: "party-boss-proof-one",
    state,
    result: null,
    turnExpiresAt: new Date("2026-06-30T10:00:23.000Z"),
    completedAt: null,
    participants: [leader, member]
  };
}

function makeBossParticipant(characterId: string, name: string): PartyBossSessionRecord["state"]["participants"][number] {
  return {
    characterId,
    name,
    remortCount: 0,
    status: "active",
    combatStats: {
      level: 3,
      hpMax: 25,
      manaMax: 10,
      hpCurrent: 25,
      manaCurrent: 10,
      strength: 5,
      dexterity: 5,
      intelligence: 5,
      charisma: 5,
      luck: 5,
      raceId: "race.human-ish",
      classId: "class.warrior"
    },
    resources: {
      hp: 25,
      hpMax: 25,
      mana: 10,
      manaMax: 10
    },
    contribution: {
      submittedActions: 0,
      timeoutActions: 0,
      damageDealt: 0,
      damageTaken: 0
    }
  };
}

function makeCharacter(): PartySessionRecord["leader"] {
  return {
    id: "character-42",
    userId: "user-42",
    telegramUserId: 42n,
    currentLocationId: "korchma.board",
    name: "Тестова Лідерка",
    pronoun: "they",
    path: "path.boundary",
    raceId: "race.human-ish",
    classId: "class.warrior",
    level: 3,
    xp: 42,
    gold: 13,
    hpCurrent: 25,
    hpMax: 25,
    manaCurrent: 10,
    manaMax: 10,
    hpRegenAt: null,
    manaRegenAt: null,
    activeCosmeticTitleGrantId: null,
    statsJson: {},
    remortCount: 0
  };
}
