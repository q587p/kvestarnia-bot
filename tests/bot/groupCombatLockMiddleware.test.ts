import { Bot } from "grammy";
import { describe, expect, it, vi } from "vitest";
import type { BotServices } from "../../src/bot/botServices";
import { registerCombatLockMiddleware } from "../../src/bot/middleware/registerCombatLockMiddleware";
import type { GroupCombatSessionRecord } from "../../src/db/repositories/groupCombatRepository";
import type { GroupCombatService } from "../../src/services/groupCombatService";

describe("group-combat lock middleware", () => {
  it("resends a private command redirect as the sole latest canonical card", async () => {
    const session = activeSession();
    const calls = apiCalls();
    const bot = testBot(calls.middleware);
    const markParticipantCardDelivered = vi.fn().mockResolvedValue(true);
    registerCombatLockMiddleware(bot, services(session, markParticipantCardDelivered));

    await bot.handleUpdate(commandUpdate("private"));

    expect(calls.sends).toHaveLength(1);
    expect(calls.sends[0]?.chatId).toBe(1001);
    expect(calls.sends[0]?.text).toContain("<b>Бій</b>");
    expect(readReplyKeyboard(calls.sends[0]?.replyMarkup)).toBeDefined();
    expect(calls.edits).toEqual([
      expect.objectContaining({ chatId: 1001, messageId: 21, replyMarkup: { inline_keyboard: [] } }),
      expect.objectContaining({ chatId: 1001, messageId: 93 })
    ]);
    expect(calls.deletes).toEqual([{ chatId: 1001, messageId: 21 }]);
    expect(markParticipantCardDelivered).toHaveBeenCalledWith(expect.objectContaining({
      chatId: 1001n,
      messageId: 93,
      expectedDeliveryRevision: session.deliveryRevision
    }));
  });

  it("keeps participant text and mutating buttons out of a supergroup redirect", async () => {
    const session = activeSession();
    const calls = apiCalls();
    const bot = testBot(calls.middleware);
    registerCombatLockMiddleware(bot, services(session, vi.fn().mockResolvedValue(true)));

    await bot.handleUpdate(commandUpdate("supergroup"));

    expect(calls.edits).toEqual([expect.objectContaining({ chatId: 1001, messageId: 21 })]);
    expect(calls.sends).toHaveLength(1);
    expect(calls.sends[0]).toMatchObject({ chatId: -100587 });
    expect(calls.sends[0]?.text).toContain("особистій розмові");
    expect(calls.sends[0]?.text).not.toContain("Лідерка");
    expect(calls.sends[0]?.replyMarkup).toBeUndefined();
  });
});

function services(
  session: GroupCombatSessionRecord,
  markParticipantCardDelivered: ReturnType<typeof vi.fn>
): BotServices {
  return {
    groupCombat: {
      findActiveForTelegramUser: vi.fn().mockResolvedValue(session),
      findById: vi.fn().mockResolvedValue(session),
      currentTime: () => new Date("2026-07-22T10:00:00.000Z"),
      compareAndSetParticipantCard: vi.fn().mockImplementation((input: {
        telegramUserId: bigint;
        chatId: bigint;
        messageId: number;
      }) => {
        const participant = session.participants.find((row) => row.telegramUserId === input.telegramUserId)!;
        participant.chatId = input.chatId;
        participant.messageId = input.messageId;
        participant.referenceVersion += 1;
        participant.deliveredRevision = 0;
        return Promise.resolve(true);
      }),
      releaseParticipantCard: vi.fn().mockResolvedValue(true),
      markParticipantCardDelivered
    } as unknown as GroupCombatService
  } as unknown as BotServices;
}

function testBot(middleware: Parameters<Bot["api"]["config"]["use"]>[0]): Bot {
  const bot = new Bot("test-token", {
    botInfo: { id: 123, is_bot: true, first_name: "Квестарня", username: "kvestarnia_bot" }
  });
  bot.api.config.use(middleware);
  return bot;
}

function apiCalls() {
  const edits: Array<{ chatId: number; messageId: number; text: string; replyMarkup: unknown }> = [];
  const sends: Array<{ chatId: number; text: string; replyMarkup: unknown }> = [];
  const deletes: Array<{ chatId: number; messageId: number }> = [];
  return {
    edits,
    sends,
    deletes,
    middleware: ((_prev, method, payload) => {
      if (method === "editMessageText") {
        edits.push({
          chatId: Number(payload.chat_id),
          messageId: Number(payload.message_id),
          text: String(payload.text),
          replyMarkup: payload.reply_markup
        });
        return Promise.resolve({ ok: true, result: true });
      }
      if (method === "sendMessage") {
        sends.push({
          chatId: Number(payload.chat_id),
          text: String(payload.text),
          replyMarkup: payload.reply_markup
        });
        return Promise.resolve({
          ok: true,
          result: { message_id: 93, date: 0, chat: { id: Number(payload.chat_id), type: "private" } }
        });
      }
      if (method === "deleteMessage") {
        deletes.push({ chatId: Number(payload.chat_id), messageId: Number(payload.message_id) });
        return Promise.resolve({ ok: true, result: true });
      }
      return Promise.resolve({ ok: true, result: true });
    }) as Parameters<Bot["api"]["config"]["use"]>[0]
  };
}

function commandUpdate(type: "private" | "supergroup") {
  const chat = type === "private"
    ? { id: 1001, type: "private" as const }
    : { id: -100587, type: "supergroup" as const, title: "Тестова ватага" };
  return {
    update_id: type === "private" ? 1 : 2,
    message: {
      message_id: 1,
      date: 1,
      chat,
      from: { id: 1001, is_bot: false, first_name: "Лідерка" },
      text: "/adventure",
      entities: [{ type: "bot_command" as const, offset: 0, length: 10 }]
    }
  };
}

function activeSession(): GroupCombatSessionRecord {
  const participants = [
    { characterId: "character-1", telegramUserId: 1001n, name: "Лідерка", rosterOrder: 0 },
    { characterId: "character-2", telegramUserId: 1002n, name: "Друг", rosterOrder: 1 }
  ];
  return {
    id: "group-session",
    partySessionId: "party-session",
    partyInviteToken: "proof-token-13",
    status: "active",
    turn: 1,
    version: 1,
    deliveryRevision: 2,
    deliveryPending: true,
    deliveryAttemptedAt: null,
    turnExpiresAt: new Date("2026-07-22T10:00:23.000Z"),
    completedAt: null,
    result: null,
    participants: participants.map((participant, index) => ({
      ...participant,
      remortCount: 0,
      chatId: participant.telegramUserId,
      messageId: 21 + index,
      referenceVersion: 1,
      deliveredRevision: 1
    })),
    queuedActions: [],
    state: {
      rulesVersion: "group-combat.v1",
      sessionId: "group-session",
      partySessionId: "party-session",
      encounterKey: "proof-cellar-many",
      deterministicSeed: 42,
      status: "active",
      turn: 1,
      participants: participants.map((participant) => ({
        ...participant,
        telegramUserId: participant.telegramUserId.toString(),
        remortCount: 0,
        hp: 30,
        hpMax: 30,
        mana: 13,
        manaMax: 13,
        attack: 8,
        defense: 2,
        support: 5,
        equipmentItemIds: []
      })),
      enemies: [
        { id: "enemy-1", name: "Шурхіт", order: 0, hp: 12, hpMax: 12, attack: 4, defense: 0 },
        { id: "enemy-2", name: "Гуп", order: 1, hp: 14, hpMax: 14, attack: 5, defense: 1 }
      ],
      contributions: participants.map((participant) => ({
        characterId: participant.characterId,
        damage: 0,
        healing: 0,
        guardedTurns: 0
      })),
      recap: []
    }
  };
}

function readReplyKeyboard(value: unknown): unknown {
  return value && typeof value === "object" && "keyboard" in value
    ? value.keyboard
    : undefined;
}
