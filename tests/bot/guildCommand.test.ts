import { Bot, type Context } from "grammy";
import { describe, expect, it, vi } from "vitest";
import { handleGuildCallback, registerGuildCommands } from "../../src/bot/commands/guildCommand";
import type { PartySessionRecord } from "../../src/db/repositories/partySessionRepository";
import type { GuildService } from "../../src/services/guildService";
import type { PartySessionService } from "../../src/services/partySessionService";
import { registerSocialBotModule } from "../../src/bot/modules/social";
import type { BotModuleDependencies } from "../../src/bot/modules/types";
import { parseGuildCallbackData } from "../../src/bot/callbacks/guildCallbackData";

describe("guild command routes", () => {
  it.each([false, true])("registers the real /guild callback recovery route with rollout enabled=%s", async (enabled) => {
    const bot = new Bot("test-token", {
      botInfo: { id: 123, is_bot: true, first_name: "Квестарня", username: "kvestarnia_bot" }
    });
    const getHubForTelegramUser = vi.fn().mockResolvedValue({ state: "no-character" });
    const edited: string[] = [];
    bot.api.config.use((_prev, method, payload) => {
      if (method === "editMessageText") {
        edited.push(String(payload.text));
      }
      return Promise.resolve(method === "answerCallbackQuery"
        ? { ok: true, result: true }
        : { ok: true, result: { message_id: 13 } });
    });
    registerSocialBotModule(bot, {
      services: { guilds: guildService({ isEnabled: () => enabled, getHubForTelegramUser }) },
      options: {}
    } as unknown as BotModuleDependencies);

    await bot.handleUpdate(callbackUpdate("v1:g:o"));

    expect(getHubForTelegramUser).toHaveBeenCalledWith(42n, 0);
    expect(edited).toHaveLength(1);
    expect(edited[0]).toContain("/start");
  });

  it("keeps /guild readable while writes are off and never registers the production dev helper", async () => {
    const bot = new Bot("test-token", {
      botInfo: { id: 123, is_bot: true, first_name: "Квестарня", username: "kvestarnia_bot" }
    });
    const replies: string[] = [];
    const getHubForTelegramUser = vi.fn().mockResolvedValue({
      state: "not-member",
      incomingInvites: [],
      page: 0,
      hasPreviousPage: false,
      hasNextPage: false
    });
    bot.api.config.use((_prev, method, payload) => {
      if (method === "sendMessage") {
        replies.push(String(payload.text));
      }
      return Promise.resolve({ ok: true, result: { message_id: replies.length } });
    });
    registerGuildCommands(bot, guildService({
      isEnabled: () => false,
      areDevHelpersEnabled: () => false,
      getHubForTelegramUser
    }));

    await bot.handleUpdate(commandUpdate("/guild"));
    await bot.handleUpdate(commandUpdate("/dev_guild_gold", 2));

    expect(getHubForTelegramUser).toHaveBeenCalledWith(42n, 0);
    expect(replies).toHaveLength(1);
    expect(replies[0]).toContain("Нові статути й запрошення тимчасово зачинені");
    expect(replies[0]).not.toContain("telegram");
  });

  it("renders button-first guild entry, crest templates and a private code copy control", async () => {
    const bot = new Bot("test-token", {
      botInfo: { id: 123, is_bot: true, first_name: "Квестарня", username: "kvestarnia_bot" }
    });
    const sent: Array<Record<string, unknown>> = [];
    bot.api.config.use((_prev, method, payload) => {
      if (method === "sendMessage") {
        sent.push(payload);
      }
      return Promise.resolve({ ok: true, result: { message_id: sent.length } });
    });
    registerGuildCommands(bot, guildService({
      getHubForTelegramUser: vi.fn().mockResolvedValue({
        state: "not-member",
        incomingInvites: [],
        page: 0,
        hasPreviousPage: false,
        hasNextPage: false
      }),
      createInviteOptInForTelegramUser: vi.fn().mockResolvedValue({
        state: "ready",
        token: "privateInviteCode93",
        expiresAt: new Date("2026-08-07T20:00:00.000Z")
      }),
      previewCreationForTelegramUser: vi.fn().mockResolvedValue({ state: "invalid", reason: "crest" })
    }));

    await bot.handleUpdate(commandUpdate("/guild", 11));
    await bot.handleUpdate(commandUpdate("/guild_create", 12));
    await bot.handleUpdate(commandUpdate("/guild_invite_code", 13));
    await bot.handleUpdate(commandUpdate("/guild_create 🛡 Назва | короткий опис", 14));

    expect(sent).toHaveLength(4);
    const hubMarkup = sent[0]?.reply_markup as { inline_keyboard: Array<Array<Record<string, unknown>>> };
    expect(hubMarkup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
      expect.objectContaining({ callback_data: "v1:g:n" }),
      expect.objectContaining({ callback_data: "v1:g:i" })
    ]));
    const creationMarkup = sent[1]?.reply_markup as { inline_keyboard: Array<Array<Record<string, unknown>>> };
    expect(creationMarkup.inline_keyboard.flat().filter((button) =>
      "callback_data" in button && String(button.callback_data).startsWith("v1:g:r:")
    )).toHaveLength(13);
    const codeMarkup = sent[2]?.reply_markup as { inline_keyboard: Array<Array<Record<string, unknown>>> };
    expect(codeMarkup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
      expect.objectContaining({ copy_text: { text: "privateInviteCode93" } }),
      expect.objectContaining({ copy_text: { text: "/guild_invite privateInviteCode93" } }),
      expect.objectContaining({ callback_data: "v1:g:o" })
    ]));
    expect(String(sent[2]?.text)).not.toContain("telegram");
    const invalidCrestMarkup = sent[3]?.reply_markup as { inline_keyboard: Array<Array<Record<string, unknown>>> };
    expect(invalidCrestMarkup.inline_keyboard.flat().filter((button) =>
      "callback_data" in button && String(button.callback_data).startsWith("v1:g:r:")
    )).toHaveLength(13);
  });

  it("turns crest and invitation callbacks into real private reply prompts", async () => {
    const enabled = callbackContext();
    await handleGuildCallback(
      enabled.ctx,
      { type: "create-crest", crestIndex: 0 },
      guildService({ isEnabled: () => true })
    );
    expect(String(enabled.reply.mock.calls[0]?.[0])).toContain("крок 2 із 3");
    expect((enabled.reply.mock.calls[0]?.[1] as { reply_markup?: { force_reply?: boolean } } | undefined)
      ?.reply_markup?.force_reply).toBe(true);

    const invite = callbackContext();
    await handleGuildCallback(
      invite.ctx,
      { type: "invite-start" },
      guildService({ isEnabled: () => true })
    );
    expect(String(invite.reply.mock.calls[0]?.[0])).toContain("крок 1 із 2");
    expect((invite.reply.mock.calls[0]?.[1] as { reply_markup?: { force_reply?: boolean } } | undefined)
      ?.reply_markup?.force_reply).toBe(true);

    const disabled = callbackContext();
    await handleGuildCallback(
      disabled.ctx,
      { type: "create-crest", crestIndex: 0 },
      guildService({ isEnabled: () => false })
    );
    expect(disabled.reply).not.toHaveBeenCalled();
  });

  it("previews creation and creates invitations from the guided reply sequence", async () => {
    const bot = new Bot("test-token", {
      botInfo: { id: 123, is_bot: true, first_name: "Квестарня", username: "kvestarnia_bot" }
    });
    const previewCreationForTelegramUser = vi.fn().mockResolvedValue({
      state: "ready",
      intent: {
        token: "creationToken93",
        displayName: "Тиха Печатка",
        normalizedName: "тиха печатка",
        crest: "🛡️",
        description: "Без зайвого галасу.",
        goldCost: 93,
        availableGold: 100,
        expiresAt: new Date("2026-08-04T01:00:00.000Z")
      }
    });
    const createInviteForTelegramUser = vi.fn().mockResolvedValue({ state: "target-unavailable" });
    const sent: Array<Record<string, unknown>> = [];
    bot.api.config.use((_prev, method, payload) => {
      if (method === "sendMessage") {
        sent.push(payload);
      }
      return Promise.resolve({ ok: true, result: { message_id: sent.length } });
    });
    registerGuildCommands(bot, guildService({ previewCreationForTelegramUser, createInviteForTelegramUser }));

    await bot.handleUpdate(replyUpdate(
      "Тиха Печатка | Без зайвого галасу.",
      "📜 Заснування ґільдії · крок 2 із 3 · 🛡️",
      21
    ));
    await bot.handleUpdate(replyUpdate(
      "privateInviteCode93",
      "📨 Запрошення до ґільдії · крок 1 із 2",
      22
    ));

    expect(previewCreationForTelegramUser).toHaveBeenCalledWith(42n, {
      crest: "🛡️",
      displayName: "Тиха Печатка",
      description: "Без зайвого галасу."
    });
    expect(createInviteForTelegramUser).toHaveBeenCalledWith(42n, "privateInviteCode93");
    expect(String(sent[0]?.text)).toContain("Чернетка статуту");
    expect(JSON.stringify(sent[0]?.reply_markup)).toContain("v1:g:c:creationToken93");
    expect(String(sent[1]?.text)).toContain("Цей код не можна використати");
  });

  it("keeps a durable membership invite recoverable through /guild when Telegram blocks delivery", async () => {
    const bot = new Bot("test-token", {
      botInfo: { id: 123, is_bot: true, first_name: "Квестарня", username: "kvestarnia_bot" }
    });
    const replies: string[] = [];
    const createInviteForTelegramUser = vi.fn().mockResolvedValue({
      state: "created",
      invite: {
        token: "inviteABC12",
        guildId: "guild-id",
        guildName: "Тиха Печатка",
        guildCrest: "🛡️",
        targetName: "Адресатка",
        status: "pending",
        expiresAt: new Date("2026-08-06T17:00:00.000Z")
      },
      deliveryTelegramUserId: 93n
    });
    bot.api.config.use((_prev, method, payload) => {
      if (method === "sendMessage" && Number(payload.chat_id) === 93) {
        return Promise.reject(new Error("blocked"));
      }
      if (method === "sendMessage") {
        replies.push(String(payload.text));
      }
      return Promise.resolve({ ok: true, result: { message_id: 23 } });
    });
    registerGuildCommands(bot, guildService({ createInviteForTelegramUser }));

    await bot.handleUpdate(commandUpdate("/guild_invite invite-code"));

    expect(createInviteForTelegramUser).toHaveBeenCalledWith(42n, "invite-code");
    expect(replies).toHaveLength(1);
    expect(replies[0]).toContain("Telegram не підтвердив доставку");
    expect(replies[0]).toContain("/guild");
  });

  it("delivers an ordinary guild-attributed party invite, then publishes and persists a new canonical card", async () => {
    const session = makePartySession();
    const resolvePartyRecipientForTelegramUser = vi.fn()
      .mockResolvedValueOnce(recipientResult())
      .mockResolvedValueOnce(recipientResult());
    const recordPartyInvite = vi.fn().mockResolvedValue(undefined);
    const getByToken = vi.fn().mockResolvedValue({ state: "ready", session });
    const recordParticipantMessageReference = vi.fn().mockResolvedValue({ state: "ready", session });
    const { ctx, answerCallbackQuery, reply, sendMessage } = callbackContext();

    await handleGuildCallback(
      ctx,
      { type: "party-invite", memberId: "member-00000001", version: 7 },
      guildService({ resolvePartyRecipientForTelegramUser, recordPartyInvite }),
      {
        botUsername: "kvestarnia_bot",
        partySessions: partyService({
          getLiveRecruitingByTelegramUser: vi.fn().mockResolvedValue(session),
          getByToken,
          recordParticipantMessageReference
        })
      }
    );

    expect(resolvePartyRecipientForTelegramUser).toHaveBeenCalledTimes(2);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0]?.[0]).toBe(93);
    expect(JSON.stringify(sendMessage.mock.calls[0]?.[2])).toContain("v1:party:jg:partyABC12");
    expect(recordPartyInvite).toHaveBeenCalledWith("guild-id", 42n, "party-1", "target-user");
    expect(answerCallbackQuery).toHaveBeenCalledWith({ text: "Звичайне запрошення передано." });
    expect(reply).toHaveBeenCalledTimes(1);
    expect(recordParticipantMessageReference).toHaveBeenCalledWith(42n, "partyABC12", {
      chatId: 42n,
      messageId: 23
    });
  });

  it("warns on Telegram delivery failure but keeps the existing PartySession recoverable", async () => {
    const session = makePartySession();
    const { ctx, answerCallbackQuery, reply, sendMessage } = callbackContext();
    sendMessage.mockRejectedValueOnce(new Error("blocked"));

    await handleGuildCallback(
      ctx,
      { type: "party-invite", memberId: "member-00000001", version: 7 },
      guildService({
        resolvePartyRecipientForTelegramUser: vi.fn().mockResolvedValue(recipientResult()),
        recordPartyInvite: vi.fn()
      }),
      {
        partySessions: partyService({
          getLiveRecruitingByTelegramUser: vi.fn().mockResolvedValue(session),
          getByToken: vi.fn().mockResolvedValue({ state: "ready", session }),
          recordParticipantMessageReference: vi.fn().mockResolvedValue({ state: "ready", session })
        })
      }
    );

    expect(answerCallbackQuery).toHaveBeenCalledWith({
      text: "Telegram не підтвердив доставку; ватага лишилася чинною."
    });
    expect(reply).toHaveBeenCalledTimes(1);
  });

  it("keeps an old guild-party invite callback fully inert after rollout disable", async () => {
    const resolvePartyRecipientForTelegramUser = vi.fn();
    const recordPartyInvite = vi.fn();
    const getLiveRecruitingByTelegramUser = vi.fn();
    const getByToken = vi.fn();
    const recordParticipantMessageReference = vi.fn();
    const { ctx, answerCallbackQuery, reply, sendMessage } = callbackContext();

    await handleGuildCallback(
      ctx,
      { type: "party-invite", memberId: "member-00000001", version: 7 },
      guildService({ isEnabled: () => false, resolvePartyRecipientForTelegramUser, recordPartyInvite }),
      {
        partySessions: partyService({
          getLiveRecruitingByTelegramUser,
          getByToken,
          recordParticipantMessageReference
        })
      }
    );

    expect(answerCallbackQuery).toHaveBeenCalledWith({
      text: "Ґільдійні запрошення до ватаги зараз вимкнені.",
      show_alert: true
    });
    expect(getLiveRecruitingByTelegramUser).not.toHaveBeenCalled();
    expect(getByToken).not.toHaveBeenCalled();
    expect(resolvePartyRecipientForTelegramUser).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
    expect(reply).not.toHaveBeenCalled();
    expect(recordParticipantMessageReference).not.toHaveBeenCalled();
    expect(recordPartyInvite).not.toHaveBeenCalled();
  });

  it("provides distinct stable selectors for duplicate member names before confirmation", async () => {
    const bot = new Bot("test-token", {
      botInfo: { id: 123, is_bot: true, first_name: "Квестарня", username: "kvestarnia_bot" }
    });
    const sent: Array<Record<string, unknown>> = [];
    bot.api.config.use((_prev, method, payload) => {
      if (method === "sendMessage") {
        sent.push(payload);
      }
      return Promise.resolve({ ok: true, result: { message_id: 13 } });
    });
    registerGuildCommands(bot, guildService({
      findMemberForAction: vi.fn().mockResolvedValue({
        state: "ambiguous",
        expectedVersion: 7,
        candidates: [
          { id: "member-00000001", name: "Двійник", role: "member" },
          { id: "member-00000002", name: "Двійник", role: "officer" }
        ]
      })
    }));

    await bot.handleUpdate(commandUpdate("/guild_promote Двійник"));

    const markup = sent[0]?.reply_markup as { inline_keyboard?: Array<Array<{ text: string; callback_data?: string }>> };
    const selectors = (markup.inline_keyboard ?? []).flat().filter((button) => button.callback_data?.includes(":s"));
    expect(selectors.map((button) => button.text)).toEqual([
      "1. Двійник · учасник",
      "2. Двійник · старшина"
    ]);
    expect(selectors.map((button) => parseGuildCallbackData(button.callback_data))).toEqual([
      { ok: true, value: { type: "member-select", action: "promote", memberId: "member-00000001", version: 7 } },
      { ok: true, value: { type: "member-select", action: "promote", memberId: "member-00000002", version: 7 } }
    ]);

    const { ctx, editMessageText } = callbackContext();
    await handleGuildCallback(
      ctx,
      { type: "member-select", action: "promote", memberId: "member-00000002", version: 7 },
      guildService({
        findMemberByIdForAction: vi.fn().mockResolvedValue({
          state: "ready",
          memberId: "member-00000002",
          memberName: "Двійник",
          memberRole: "officer",
          expectedVersion: 7
        })
      })
    );
    expect(editMessageText).toHaveBeenCalledTimes(1);
    expect(editMessageText.mock.calls[0]?.[0]).toContain("Двійник");
    expect(JSON.stringify(editMessageText.mock.calls[0]?.[1])).toContain("v1:g:p:member-00000002:7");
  });
});

function guildService(overrides: Partial<GuildService>): GuildService {
  return {
    isEnabled: () => true,
    areDevHelpersEnabled: () => false,
    ...overrides
  } as GuildService;
}

function partyService(overrides: Partial<PartySessionService>): PartySessionService {
  return {
    areDevHelpersEnabled: () => false,
    ...overrides
  } as PartySessionService;
}

function recipientResult() {
  return {
    state: "ready" as const,
    guildId: "guild-id",
    guildVersion: 7,
    partySessionId: "party-1",
    inviteToken: "partyABC12",
    recipient: { telegramUserId: 93n, name: "Учасниця" },
    targetUserId: "target-user"
  };
}

function callbackContext() {
  const answerCallbackQuery = vi.fn().mockResolvedValue(true);
  const reply = vi.fn().mockResolvedValue({ message_id: 23 });
  const sendMessage = vi.fn().mockResolvedValue({ message_id: 93 });
  const editMessageText = vi.fn().mockResolvedValue(true);
  const ctx = {
    from: { id: 42, is_bot: false, first_name: "Тест" },
    chat: { id: 42, type: "private" },
    callbackQuery: {
      id: "callback-1",
      message: { message_id: 13, chat: { id: 42, type: "private" } }
    },
    answerCallbackQuery,
    editMessageText,
    reply,
    api: { sendMessage, editMessageText: vi.fn().mockResolvedValue(true) }
  } as unknown as Context;
  return { ctx, answerCallbackQuery, reply, sendMessage, editMessageText };
}

function commandUpdate(text: string, updateId = 1) {
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: 1,
      chat: { id: 42, type: "private" },
      from: { id: 42, is_bot: false, first_name: "Тест" },
      text,
      entities: [{ offset: 0, length: text.indexOf(" ") === -1 ? text.length : text.indexOf(" "), type: "bot_command" }]
    }
  };
}

function replyUpdate(text: string, promptText: string, updateId: number) {
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: 1,
      chat: { id: 42, type: "private" },
      from: { id: 42, is_bot: false, first_name: "Тест" },
      text,
      reply_to_message: {
        message_id: updateId - 1,
        date: 1,
        chat: { id: 42, type: "private" },
        from: { id: 123, is_bot: true, first_name: "Квестарня", username: "kvestarnia_bot" },
        text: promptText
      }
    }
  };
}

function callbackUpdate(data: string) {
  return {
    update_id: 93,
    callback_query: {
      id: "callback-93",
      from: { id: 42, is_bot: false, first_name: "Тест" },
      chat_instance: "test",
      data,
      message: {
        message_id: 13,
        date: 1,
        chat: { id: 42, type: "private" },
        text: "Стара картка"
      }
    }
  };
}

function makePartySession(): PartySessionRecord {
  const now = new Date("2026-08-02T20:00:00.000Z");
  const leader = {
    id: "character-42",
    userId: "user-42",
    telegramUserId: 42n,
    currentLocationId: "korchma.deep.level1.left",
    name: "Голова Ватаги",
    pronoun: "they",
    path: "path.boundary",
    raceId: "race.human-ish",
    classId: "class.warrior",
    level: 8,
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
  return {
    id: "party-1",
    inviteToken: "partyABC12",
    status: "recruiting",
    leaderCharacterId: leader.id,
    periodId: "12026-08-02",
    originLocationId: leader.currentLocationId,
    originKind: "nyz-left-passage-party.v1",
    participantCap: 8,
    minimumParticipants: 1,
    joinUntilAt: new Date(now.getTime() + 13 * 60_000),
    expiresAt: new Date(now.getTime() + 13 * 60_000),
    version: 1,
    activeLeaderKey: `party-leader:${leader.id}`,
    createdAt: now,
    updatedAt: now,
    leader,
    participants: [{
      id: "participant-42",
      sessionId: "party-1",
      characterId: leader.id,
      remortCount: 0,
      status: "joined",
      joinSource: "leader",
      joinedAt: now,
      leftAt: null,
      chatId: 42n,
      messageId: 13,
      character: leader
    }]
  };
}
