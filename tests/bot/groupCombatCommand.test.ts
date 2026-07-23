import { Bot, type Api, type Context } from "grammy";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  handleGroupCombatCallback,
  registerGroupCombatDevCommand
} from "../../src/bot/commands/groupCombatCommand";
import { deliverGroupCombatCards } from "../../src/bot/groupCombatCardDelivery";
import {
  clearMessageFreshnessTracking,
  rememberLatestMessageForChat
} from "../../src/bot/messageFreshness";
import type { GroupCombatSessionRecord } from "../../src/db/repositories/groupCombatRepository";
import type { GroupCombatService } from "../../src/services/groupCombatService";
import { registerSocialBotModule } from "../../src/bot/modules/social";
import type { BotServices } from "../../src/bot/botServices";

describe("group combat bot flow", () => {
  afterEach(() => {
    clearMessageFreshnessTracking();
  });

  it("cannot mutate through a dev command when the production gate is closed", async () => {
    const bot = testBot();
    const startProof = vi.fn();
    registerGroupCombatDevCommand(bot, {
      areDevHelpersEnabled: () => false,
      startProof
    } as unknown as GroupCombatService);

    await bot.handleUpdate(commandUpdate("/dev_group_combat proof-token-13"));
    expect(startProof).not.toHaveBeenCalled();
  });

  it("explains where the party code comes from and excludes the party_ prefix", async () => {
    const bot = testBot();
    const replies: string[] = [];
    const startProof = vi.fn().mockResolvedValue({ state: "not-found" });
    bot.api.config.use((_prev, method, payload) => {
      if (method === "sendMessage") {
        replies.push(String(payload.text));
      }
      return Promise.resolve({ ok: true, result: { message_id: replies.length } });
    });
    registerGroupCombatDevCommand(bot, {
      areDevHelpersEnabled: () => true,
      startProof
    } as unknown as GroupCombatService);

    await bot.handleUpdate(commandUpdate("/dev_group_combat"));
    await bot.handleUpdate(commandUpdate("/dev_group_combat party_l3vyrZuhFdk"));

    expect(startProof).toHaveBeenCalledWith(1001n, "party_l3vyrZuhFdk");
    expect(replies).toEqual([
      [
        "🧭 Код ватаги створює команда /dev_party.",
        "У картці збору скопіюйте з посилання лише частину після «party_».",
        "Запуск надсилає ватажок: /dev_group_combat КОД"
      ].join("\n"),
      [
        "Живої ватаги з таким кодом не знайдено.",
        "",
        "🧭 Код ватаги створює команда /dev_party.",
        "У картці збору скопіюйте з посилання лише частину після «party_».",
        "Запуск надсилає ватажок: /dev_group_combat КОД"
      ].join("\n")
    ]);
  });

  it("does not register the command or callback route when production disables the service", async () => {
    const bot = testBot();
    const startProof = vi.fn();
    const submitAction = vi.fn();
    registerSocialBotModule(bot, {
      services: {
        groupCombat: {
          isEnabled: () => false,
          areDevHelpersEnabled: () => false,
          startProof,
          submitAction
        }
      } as unknown as BotServices,
      options: {}
    });

    await bot.handleUpdate(commandUpdate("/dev_group_combat proof-token-13"));
    await bot.handleUpdate(callbackUpdate("v1:gc:v:proof-token-13"));
    expect(startProof).not.toHaveBeenCalled();
    expect(submitAction).not.toHaveBeenCalled();
  });

  it("starts the proof from the leader party card and delivers canonical private cards", async () => {
    const session = makeSession();
    const startProof = vi.fn().mockResolvedValue({ state: "started", session });
    const editMessageText = vi.fn().mockResolvedValue(true);
    const answerCallbackQuery = vi.fn().mockResolvedValue(true);
    const ctx = {
      from: { id: 1001, is_bot: false, first_name: "Лідерка" },
      chat: { id: 1001, type: "private" },
      callbackQuery: {
        id: "callback-party-group-start",
        data: "unused",
        message: { message_id: 21, date: 1, chat: { id: 1001, type: "private" } }
      },
      api: { editMessageText } as unknown as Api,
      answerCallbackQuery
    } as unknown as Context;

    await handleGroupCombatCallback(
      ctx,
      { type: "start", token: session.partyInviteToken },
      {
        startProof,
        findById: vi.fn().mockResolvedValue(session),
        markParticipantCardDelivered: vi.fn().mockResolvedValue(true),
        finalizeDeliveryAttempt: vi.fn().mockResolvedValue(true)
      } as unknown as GroupCombatService
    );

    expect(startProof).toHaveBeenCalledWith(1001n, session.partyInviteToken);
    expect(answerCallbackQuery).toHaveBeenCalledWith({ text: "Доказову сутичку запущено." });
    expect(editMessageText).toHaveBeenCalledWith(1001, 21, expect.any(String), expect.any(Object));
    expect(editMessageText).toHaveBeenCalledWith(1002, 22, expect.any(String), expect.any(Object));
  });

  it("reports a disabled party-card start callback without delivering combat cards", async () => {
    const startProof = vi.fn().mockResolvedValue({ state: "disabled" });
    const answerCallbackQuery = vi.fn().mockResolvedValue(true);
    const editMessageText = vi.fn();
    const ctx = {
      from: { id: 1001, is_bot: false, first_name: "Лідерка" },
      chat: { id: 1001, type: "private" },
      callbackQuery: { id: "callback-disabled-group-start", data: "unused" },
      api: { editMessageText } as unknown as Api,
      answerCallbackQuery
    } as unknown as Context;

    await handleGroupCombatCallback(
      ctx,
      { type: "start", token: "proof-token-13" },
      {
        startProof
      } as unknown as GroupCombatService
    );

    expect(startProof).toHaveBeenCalledWith(1001n, "proof-token-13");
    expect(answerCallbackQuery).toHaveBeenCalledWith(expect.objectContaining({ show_alert: true }));
    expect(editMessageText).not.toHaveBeenCalled();
  });

  it("maps a callback target against canonical state and refreshes stale cards", async () => {
    const session = makeSession();
    const submitAction = vi.fn().mockResolvedValue({ state: "stale" });
    const findByToken = vi.fn().mockResolvedValue(session);
    const editMessageText = vi.fn().mockResolvedValue(true);
    const answerCallbackQuery = vi.fn().mockResolvedValue(true);
    const ctx = {
      from: { id: 1001, is_bot: false, first_name: "Лідерка" },
      chat: { id: 1001, type: "private" },
      callbackQuery: { id: "callback-1", data: "unused" },
      api: { editMessageText } as unknown as Api,
      answerCallbackQuery
    } as unknown as Context;

    await handleGroupCombatCallback(ctx, {
      type: "action",
      token: session.partyInviteToken,
      turn: 1,
      action: "attack",
      targetIndex: 1
    }, {
      findByToken,
      findById: vi.fn().mockResolvedValue(session),
      submitAction,
      markParticipantCardDelivered: vi.fn().mockResolvedValue(true),
      finalizeDeliveryAttempt: vi.fn().mockResolvedValue(true)
    } as unknown as GroupCombatService);

    expect(submitAction).toHaveBeenCalledWith({
      telegramUserId: 1001n,
      partyInviteToken: session.partyInviteToken,
      turn: 1,
      action: "attack",
      targetKind: "enemy",
      targetId: "enemy-2"
    });
    expect(answerCallbackQuery).toHaveBeenCalled();
    expect(editMessageText).toHaveBeenCalledTimes(2);
  });

  it("rejects mutating buttons from a superseded card and refreshes the canonical reference", async () => {
    const session = makeSession();
    const submitAction = vi.fn();
    const answerCallbackQuery = vi.fn((options?: { text?: string; show_alert?: boolean }) => {
      void options;
      return Promise.resolve(true);
    });
    const editMessageText = vi.fn().mockResolvedValue(true);
    const ctx = {
      from: { id: 1001, is_bot: false, first_name: "Лідерка" },
      chat: { id: 1001, type: "private" },
      callbackQuery: {
        id: "callback-old-card",
        data: "unused",
        message: { message_id: 9, date: 1, chat: { id: 1001, type: "private" } }
      },
      api: { editMessageText } as unknown as Api,
      answerCallbackQuery
    } as unknown as Context;

    await handleGroupCombatCallback(ctx, {
      type: "action",
      token: session.partyInviteToken,
      turn: 1,
      action: "guard",
      targetIndex: 0
    }, {
      findByToken: vi.fn().mockResolvedValue(session),
      findById: vi.fn().mockResolvedValue(session),
      submitAction,
      markParticipantCardDelivered: vi.fn().mockResolvedValue(true),
      finalizeDeliveryAttempt: vi.fn().mockResolvedValue(true)
    } as unknown as GroupCombatService);

    expect(submitAction).not.toHaveBeenCalled();
    expect(answerCallbackQuery.mock.calls[0]?.[0]?.text).toContain("стара картка");
    expect(editMessageText).toHaveBeenCalledWith(1001, 21, expect.any(String), expect.any(Object));
  });

  it("resends refresh as the sole latest canonical card when newer chat messages exist", async () => {
    const session = makeSession();
    const actionable = new Set([21]);
    const sent: Array<{ messageId: number; buttons: unknown }> = [];
    const editMessageText = vi.fn((
      _chatId: number,
      messageId: number,
      _text: string,
      options?: { reply_markup?: { inline_keyboard?: unknown[] } }
    ) => {
      const buttons = options?.reply_markup?.inline_keyboard ?? [];
      if (buttons.length > 0) {
        actionable.add(messageId);
      } else {
        actionable.delete(messageId);
      }
      return Promise.resolve(true);
    });
    const sendMessage = vi.fn((
      _chatId: number,
      _text: string,
      options?: { reply_markup?: { inline_keyboard?: unknown[] } }
    ) => {
      sent.push({ messageId: 31, buttons: options?.reply_markup?.inline_keyboard });
      return Promise.resolve({ message_id: 31 });
    });
    const deleteMessage = vi.fn((_chatId: number, messageId: number) => {
      actionable.delete(messageId);
      return Promise.resolve(true);
    });
    const compareAndSetParticipantCard = vi.fn((input: {
      telegramUserId: bigint;
      chatId: bigint;
      messageId: number;
    }) => {
      const participant = session.participants.find((row) => row.telegramUserId === input.telegramUserId)!;
      participant.chatId = input.chatId;
      participant.messageId = input.messageId;
      participant.referenceVersion += 1;
      return Promise.resolve(true);
    });
    const markParticipantCardDelivered = vi.fn(() => {
      session.participants[0]!.deliveredRevision = session.deliveryRevision;
      return Promise.resolve(true);
    });
    const answerCallbackQuery = vi.fn().mockResolvedValue(true);
    const ctx = {
      from: { id: 1001, is_bot: false, first_name: "Лідерка" },
      chat: { id: 1001, type: "private" },
      callbackQuery: {
        id: "callback-buried-refresh",
        data: "unused",
        message: { message_id: 21, date: 1, chat: { id: 1001, type: "private" } }
      },
      api: { editMessageText, sendMessage, deleteMessage } as unknown as Api,
      answerCallbackQuery
    } as unknown as Context;
    rememberLatestMessageForChat(1001, 30);

    await handleGroupCombatCallback(ctx, {
      type: "view",
      token: session.partyInviteToken
    }, {
      findByToken: vi.fn().mockResolvedValue(session),
      findById: vi.fn().mockImplementation(() => Promise.resolve(session)),
      compareAndSetParticipantCard,
      markParticipantCardDelivered,
      releaseParticipantCard: vi.fn().mockResolvedValue(false)
    } as unknown as GroupCombatService);

    expect(sent).toEqual([{ messageId: 31, buttons: [] }]);
    expect(compareAndSetParticipantCard).toHaveBeenCalledWith(expect.objectContaining({
      expectedReferenceVersion: 1,
      chatId: 1001n,
      messageId: 31
    }));
    expect(editMessageText).toHaveBeenNthCalledWith(
      1,
      1001,
      21,
      expect.any(String),
      expect.objectContaining({ reply_markup: { inline_keyboard: [] } })
    );
    expect(editMessageText).toHaveBeenNthCalledWith(2, 1001, 31, expect.any(String), expect.any(Object));
    const activatedOptions = editMessageText.mock.calls[1]?.[3] as {
      reply_markup?: { inline_keyboard?: unknown[] };
    } | undefined;
    expect(activatedOptions?.reply_markup?.inline_keyboard?.length).toBeGreaterThan(0);
    expect(deleteMessage).toHaveBeenCalledWith(1001, 21);
    expect(session.participants[0]).toMatchObject({
      chatId: 1001n,
      messageId: 31,
      deliveredRevision: session.deliveryRevision
    });
    expect(actionable).toEqual(new Set([31]));
  });

  it("opens, pages, and restores terminal results on the same canonical message", async () => {
    const session = makeSession();
    session.status = "won";
    session.state.status = "won";
    session.state.recap = [
      { turn: 1, lines: ["Лідерка стає в захист."] },
      { turn: 2, lines: ["Друг б’є Шурхіт на 3."] }
    ];
    session.participants[0]!.deliveredRevision = session.deliveryRevision;
    const edits: Array<{ text: string; options: string }> = [];
    const editContextMessage = vi.fn((text: string, options?: unknown) => {
      edits.push({ text, options: JSON.stringify(options) });
      return Promise.resolve(true);
    });
    const editApiMessage = vi.fn((_chatId: number, _messageId: number, text: string, options?: unknown) => {
      edits.push({ text, options: JSON.stringify(options) });
      return Promise.resolve(true);
    });
    const answerCallbackQuery = vi.fn().mockResolvedValue(true);
    const ctx = {
      from: { id: 1001, is_bot: false, first_name: "Лідерка" },
      chat: { id: 1001, type: "private" },
      callbackQuery: {
        id: "callback-journal",
        data: "unused",
        message: { message_id: 21, date: 1, chat: { id: 1001, type: "private" } }
      },
      api: { editMessageText: editApiMessage } as unknown as Api,
      editMessageText: editContextMessage,
      answerCallbackQuery
    } as unknown as Context;
    const service = {
      findByToken: vi.fn().mockResolvedValue(session),
      findById: vi.fn().mockResolvedValue(session),
      markParticipantCardDelivered: vi.fn().mockResolvedValue(true)
    } as unknown as GroupCombatService;
    rememberLatestMessageForChat(1001, 21);

    await handleGroupCombatCallback(ctx, {
      type: "journal",
      token: session.partyInviteToken,
      page: 0
    }, service);
    await handleGroupCombatCallback(ctx, {
      type: "journal",
      token: session.partyInviteToken,
      page: 1
    }, service);
    await handleGroupCombatCallback(ctx, {
      type: "view",
      token: session.partyInviteToken
    }, service);

    expect(edits[0]?.text).toContain("Хід <b>1</b> · запис 1/2");
    expect(edits[1]?.text).toContain("Хід <b>2</b> · запис 2/2");
    expect(edits[1]?.options).toContain("↩️ До результатів");
    expect(edits[2]?.text).toContain("✅ Доказову сутичку виграно");
    expect(edits[2]?.text).not.toContain("Журнал доказової сутички");
    expect(edits[2]?.options).toContain("📜 Журнал");
    expect(editApiMessage).toHaveBeenCalledWith(1001, 21, expect.any(String), expect.any(Object));
    expect(answerCallbackQuery).toHaveBeenCalledTimes(3);
  });

  it("repairs an unavailable canonical message after combat already committed", async () => {
    const session = makeSession();
    const sendMessage = vi.fn()
      .mockResolvedValueOnce({ message_id: 31 })
      .mockResolvedValueOnce({ message_id: 32 });
    const editMessageText = vi.fn().mockRejectedValue(new Error("Bad Request: message to edit not found"));
    const compareAndSetParticipantCard = vi.fn().mockResolvedValue(true);
    const api = { editMessageText, sendMessage } as unknown as Api;

    const delivered = await deliverGroupCombatCards(api, {
      findById: vi.fn().mockResolvedValue(session),
      compareAndSetParticipantCard,
      markParticipantCardDelivered: vi.fn().mockResolvedValue(true),
      finalizeDeliveryAttempt: vi.fn().mockResolvedValue(true)
    } as unknown as GroupCombatService, session);

    expect(delivered).toBe(2);
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(compareAndSetParticipantCard).toHaveBeenCalledTimes(2);
    expect(compareAndSetParticipantCard).toHaveBeenCalledWith(expect.objectContaining({
      expectedReferenceVersion: 1,
      messageId: 31
    }));
  });

  it("starts from a supergroup but publishes participant cards only to private DMs", async () => {
    const bot = testBot();
    const session = makeSession();
    session.participants = session.participants.map((participant, index) => ({
      ...participant,
      chatId: -100587n,
      messageId: 70 + index
    }));
    const apiCalls: Array<{ method: string; chatId: number; replyMarkup: unknown }> = [];
    let nextMessageId = 90;
    const findById = vi.fn(() => Promise.resolve(session));
    const compareAndSetParticipantCard = vi.fn((input: {
      telegramUserId: bigint;
      chatId: bigint;
      messageId: number;
    }) => {
      const participant = session.participants.find((row) => row.telegramUserId === input.telegramUserId)!;
      participant.chatId = input.chatId;
      participant.messageId = input.messageId;
      participant.referenceVersion += 1;
      return Promise.resolve(true);
    });
    bot.api.config.use((_prev, method, payload) => {
      if (method === "sendMessage" || method === "editMessageText") {
        apiCalls.push({
          method,
          chatId: Number(payload.chat_id),
          replyMarkup: payload.reply_markup
        });
      }
      return Promise.resolve({
        ok: true,
        result: method === "sendMessage"
          ? { message_id: nextMessageId++, date: 0, chat: { id: Number(payload.chat_id), type: "private" } }
          : true
      });
    });
    registerGroupCombatDevCommand(bot, {
      areDevHelpersEnabled: () => true,
      startProof: vi.fn().mockResolvedValue({ state: "started", session }),
      findById,
      compareAndSetParticipantCard,
      releaseParticipantCard: vi.fn(),
      markParticipantCardDelivered: vi.fn().mockResolvedValue(true),
      finalizeDeliveryAttempt: vi.fn().mockResolvedValue(true)
    } as unknown as GroupCombatService);

    await bot.handleUpdate(groupCommandUpdate("/dev_group_combat proof-token-13"));

    expect(apiCalls).not.toContainEqual(expect.objectContaining({ chatId: -100587 }));
    expect(apiCalls.filter((call) => call.method === "sendMessage").map((call) => call.chatId)).toEqual([1001, 1002]);
    expect(apiCalls.filter((call) => call.method === "sendMessage")).toEqual([
      expect.objectContaining({ replyMarkup: { inline_keyboard: [] } }),
      expect.objectContaining({ replyMarkup: { inline_keyboard: [] } })
    ]);
    expect(apiCalls.filter((call) => call.method === "editMessageText").map((call) => call.chatId)).toEqual([1001, 1002]);
  });

  it("rejects mutating group-combat callbacks from a supergroup", async () => {
    const submitAction = vi.fn();
    const findByToken = vi.fn();
    const answerCallbackQuery = vi.fn().mockResolvedValue(true);
    const ctx = {
      from: { id: 1001, is_bot: false, first_name: "Лідерка" },
      chat: { id: -100587, type: "supergroup" },
      callbackQuery: { id: "callback-public", data: "unused" },
      answerCallbackQuery
    } as unknown as Context;

    await handleGroupCombatCallback(ctx, {
      type: "action",
      token: "proof-token-13",
      turn: 1,
      action: "guard",
      targetIndex: 0
    }, { findByToken, submitAction } as unknown as GroupCombatService);

    expect(findByToken).not.toHaveBeenCalled();
    expect(submitAction).not.toHaveBeenCalled();
    expect(answerCallbackQuery).toHaveBeenCalledWith(expect.objectContaining({ show_alert: true }));
  });

  it.each([
    ["invalidated", "безпечно зупинено"],
    ["not-participant", "більше немає"],
    ["not-found", "загубила слід"],
    ["no-character", "не знайшла"],
    ["actor-unavailable", "не може діяти"]
  ] as const)("reports the truthful %s callback outcome", async (state, expectedText) => {
    const session = makeSession();
    let answer: { text?: string; show_alert?: boolean } | undefined;
    const answerCallbackQuery = vi.fn((options: { text?: string; show_alert?: boolean }) => {
      answer = options;
      return Promise.resolve(true);
    });
    const ctx = {
      from: { id: 1001, is_bot: false, first_name: "Лідерка" },
      chat: { id: 1001, type: "private" },
      callbackQuery: { id: `callback-${state}`, data: "unused" },
      api: { editMessageText: vi.fn().mockResolvedValue(true) } as unknown as Api,
      answerCallbackQuery
    } as unknown as Context;
    const service = {
      findByToken: vi.fn().mockResolvedValue(session),
      findById: vi.fn().mockResolvedValue(session),
      submitAction: vi.fn().mockResolvedValue({ state }),
      markParticipantCardDelivered: vi.fn().mockResolvedValue(true),
      finalizeDeliveryAttempt: vi.fn().mockResolvedValue(true)
    } as unknown as GroupCombatService;

    await handleGroupCombatCallback(ctx, {
      type: "action",
      token: session.partyInviteToken,
      turn: 1,
      action: "guard",
      targetIndex: 0
    }, service);

    expect(answer?.text).toContain(expectedText);
    expect(answer?.text).not.toBe("Вибір записано.");
    expect(answer?.show_alert).toBe(true);
  });
});

function makeSession(): GroupCombatSessionRecord {
  return {
    id: "group-session",
    partySessionId: "party-session",
    partyInviteToken: "proof-token-13",
    status: "active",
    turn: 1,
    version: 1,
    deliveryRevision: 1,
    deliveryPending: true,
    deliveryAttemptedAt: null,
    turnExpiresAt: new Date("2026-07-22T10:00:23.000Z"),
    completedAt: null,
    result: null,
    participants: [
      participantRecord("character-1", 1001n, "Лідерка", 0, 21),
      participantRecord("character-2", 1002n, "Друг", 1, 22)
    ],
    queuedActions: [],
    state: {
      rulesVersion: "group-combat.v1",
      sessionId: "group-session",
      partySessionId: "party-session",
      encounterKey: "proof-cellar-many",
      deterministicSeed: 42,
      status: "active",
      turn: 1,
      participants: [
        actor("character-1", "1001", "Лідерка", 0),
        actor("character-2", "1002", "Друг", 1)
      ],
      enemies: [
        { id: "enemy-1", name: "Шурхіт", order: 0, hp: 12, hpMax: 12, attack: 4, defense: 0 },
        { id: "enemy-2", name: "Гуп", order: 1, hp: 14, hpMax: 14, attack: 5, defense: 1 }
      ],
      contributions: [
        { characterId: "character-1", damage: 0, healing: 0, guardedTurns: 0 },
        { characterId: "character-2", damage: 0, healing: 0, guardedTurns: 0 }
      ],
      recap: []
    }
  };
}

function participantRecord(characterId: string, telegramUserId: bigint, name: string, rosterOrder: number, messageId: number) {
  return {
    characterId,
    telegramUserId,
    name,
    remortCount: 0,
    rosterOrder,
    chatId: telegramUserId,
    messageId,
    referenceVersion: 1,
    deliveredRevision: 0
  };
}

function actor(characterId: string, telegramUserId: string, name: string, rosterOrder: number) {
  return {
    characterId,
    telegramUserId,
    name,
    remortCount: 0,
    rosterOrder,
    hp: 30,
    hpMax: 30,
    mana: 13,
    manaMax: 13,
    attack: 8,
    defense: 2,
    support: 5,
    equipmentItemIds: []
  };
}

function testBot(): Bot {
  return new Bot("test-token", {
    botInfo: { id: 123, is_bot: true, first_name: "Квестарня", username: "kvestarnia_bot" }
  });
}

function commandUpdate(text: string) {
  return {
    update_id: 1,
    message: {
      message_id: 1,
      date: 1,
      chat: { id: 1001, type: "private" as const },
      from: { id: 1001, is_bot: false, first_name: "Лідерка" },
      text,
      entities: [{ type: "bot_command" as const, offset: 0, length: text.split(" ")[0]!.length }]
    }
  };
}

function groupCommandUpdate(text: string) {
  return {
    ...commandUpdate(text),
    message: {
      ...commandUpdate(text).message,
      chat: { id: -100587, type: "supergroup" as const, title: "Тестова ватага" }
    }
  };
}

function callbackUpdate(data: string) {
  return {
    update_id: 2,
    callback_query: {
      id: "callback-2",
      from: { id: 1001, is_bot: false, first_name: "Лідерка" },
      chat_instance: "proof",
      data,
      message: {
        message_id: 2,
        date: 1,
        chat: { id: 1001, type: "private" as const }
      }
    }
  };
}
