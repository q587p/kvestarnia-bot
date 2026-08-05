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
    }), { botUsername: "kvestarnia_bot" });

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
    }), { botUsername: "kvestarnia_bot" });

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
      expect.objectContaining({ copy_text: { text: "https://t.me/kvestarnia_bot?start=guild_privateInviteCode93" } }),
      expect.objectContaining({ callback_data: "v1:g:o" })
    ]));
    expect(codeMarkup.inline_keyboard.flat().some((button) =>
      typeof button.url === "string" && button.url.startsWith("https://t.me/share/url?")
    )).toBe(true);
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
    expect(String(enabled.reply.mock.calls[0]?.[0])).toContain("крок 2 із 4");
    expect(String(enabled.reply.mock.calls[0]?.[0])).toContain("лише назвою");
    expect(String(enabled.reply.mock.calls[0]?.[0])).not.toContain("|");
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
        goldCost: 587,
        availableGold: 600,
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
      "Тиха Печатка",
      "📜 Заснування ґільдії · крок 2 із 4 · 🛡️",
      21
    ));
    await bot.handleUpdate(replyUpdate(
      "Без зайвого галасу.",
      "📜 Заснування ґільдії · крок 3 із 4 · 🛡️\n\nНазва: Тиха Печатка",
      22
    ));
    await bot.handleUpdate(replyUpdate(
      "privateInviteCode93",
      "📨 Запрошення до ґільдії · крок 1 із 2",
      23
    ));

    expect(previewCreationForTelegramUser).toHaveBeenCalledWith(42n, {
      crest: "🛡️",
      displayName: "Тиха Печатка",
      description: "Без зайвого галасу."
    });
    expect(createInviteForTelegramUser).toHaveBeenCalledWith(42n, "privateInviteCode93");
    expect(String(sent[0]?.text)).toContain("крок 3 із 4");
    expect(String(sent[0]?.text)).not.toContain("|");
    expect(String(sent[1]?.text)).toContain("Заснування ґільдії · крок 4 із 4");
    expect(JSON.stringify(sent[1]?.reply_markup)).toContain("v1:g:c:creationToken93");
    expect(String(sent[2]?.text)).toContain("Цей код не можна використати");
  });

  it("accepts the explicit no-description reply without a combined input format", async () => {
    const bot = new Bot("test-token", {
      botInfo: { id: 123, is_bot: true, first_name: "Квестарня", username: "kvestarnia_bot" }
    });
    const previewCreationForTelegramUser = vi.fn().mockResolvedValue({ state: "ineligible" });
    bot.api.config.use(() =>
      Promise.resolve({ ok: true, result: { message_id: 13 } }));
    registerGuildCommands(bot, guildService({ previewCreationForTelegramUser }));

    await bot.handleUpdate(replyUpdate(
      "Без опису",
      "📜 Заснування ґільдії · крок 3 із 4 · 🛡️\n\nНазва: Тиха Печатка",
      24
    ));

    expect(previewCreationForTelegramUser).toHaveBeenCalledWith(42n, {
      crest: "🛡️",
      displayName: "Тиха Печатка",
      description: ""
    });
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

  it("manages every member through paginated stable buttons, including duplicate names", async () => {
    const members = Array.from({ length: 6 }, (_, index) => ({
      id: `member-0000000${index + 1}`,
      name: index < 2 ? "Двійник" : `Учасник ${index + 1}`,
      role: index === 0 ? "leader" as const : index === 1 ? "officer" as const : "member" as const
    }));
    const getMemberManagementForTelegramUser = vi.fn().mockResolvedValue({
      state: "ready",
      guildId: "guild-id",
      version: 7,
      viewerRole: "leader",
      members
    });
    const first = callbackContext();

    await handleGuildCallback(
      first.ctx,
      { type: "members-open", version: 7, page: 0 },
      guildService({ getMemberManagementForTelegramUser })
    );

    const firstMarkup = first.editMessageText.mock.calls[0]?.[1] as {
      reply_markup?: { inline_keyboard?: Array<Array<{ text: string; callback_data?: string }>> };
    };
    const firstButtons = firstMarkup.reply_markup?.inline_keyboard?.flat() ?? [];
    expect(firstButtons.filter((button) => button.callback_data?.startsWith("v1:g:mm:"))).toHaveLength(5);
    expect(firstButtons).toEqual(expect.arrayContaining([
      expect.objectContaining({ callback_data: "v1:g:mm:member-00000001:7" }),
      expect.objectContaining({ callback_data: "v1:g:mm:member-00000002:7" }),
      expect.objectContaining({ callback_data: "v1:g:ml:7:1" })
    ]));

    const second = callbackContext();
    await handleGuildCallback(
      second.ctx,
      { type: "members-open", version: 7, page: 1 },
      guildService({ getMemberManagementForTelegramUser })
    );
    expect(JSON.stringify(second.editMessageText.mock.calls[0]?.[1])).toContain("v1:g:mm:member-00000006:7");
    expect(JSON.stringify(second.editMessageText.mock.calls[0]?.[1])).toContain("v1:g:ml:7:0");

    const duplicate = callbackContext();
    await handleGuildCallback(
      duplicate.ctx,
      { type: "member-manage", memberId: "member-00000002", version: 7 },
      guildService({ getMemberManagementForTelegramUser })
    );
    const duplicateMarkup = JSON.stringify(duplicate.editMessageText.mock.calls[0]?.[1]);
    expect(String(duplicate.editMessageText.mock.calls[0]?.[0])).toContain("Двійник");
    expect(duplicateMarkup).toContain("v1:g:sm:member-00000002:7");
    expect(duplicateMarkup).not.toContain("member-00000001");
  });

  it("opens profile editing and submits its description through buttons and ForceReply", async () => {
    const hub = {
      state: "ready" as const,
      guild: {
        status: "active" as const,
        viewerRole: "leader" as const,
        version: 7
      }
    };
    const profile = callbackContext();
    await handleGuildCallback(
      profile.ctx,
      { type: "profile-open", version: 7 },
      guildService({ getHubForTelegramUser: vi.fn().mockResolvedValue(hub) })
    );
    expect(String(profile.editMessageText.mock.calls[0]?.[0])).toContain("Профіль ґільдії · крок 1 із 2");
    expect(JSON.stringify(profile.editMessageText.mock.calls[0]?.[1])).toContain("v1:g:er:0:7");

    const crest = callbackContext();
    await handleGuildCallback(
      crest.ctx,
      { type: "profile-crest", crestIndex: 0, version: 7 },
      guildService({ getHubForTelegramUser: vi.fn().mockResolvedValue(hub) })
    );
    expect(String(crest.reply.mock.calls[0]?.[0])).toContain("крок 2 із 2");
    expect((crest.reply.mock.calls[0]?.[1] as { reply_markup?: { force_reply?: boolean } }).reply_markup?.force_reply)
      .toBe(true);

    const updateProfileForTelegramUser = vi.fn().mockResolvedValue({
      state: "updated",
      guild: { crest: "🛡️", displayName: "Тиха Печатка" }
    });
    const bot = new Bot("test-token", {
      botInfo: { id: 123, is_bot: true, first_name: "Квестарня", username: "kvestarnia_bot" }
    });
    const sent: Array<Record<string, unknown>> = [];
    bot.api.config.use((_prev, method, payload) => {
      if (method === "sendMessage") sent.push(payload);
      return Promise.resolve({ ok: true, result: { message_id: 13 } });
    });
    registerGuildCommands(bot, guildService({ updateProfileForTelegramUser }));
    await bot.handleUpdate(replyUpdate(
      "Новий опис",
      "✏️ Профіль ґільдії · крок 2 із 2 · 🛡️\n\nРедакція статуту: 7",
      31
    ));
    expect(updateProfileForTelegramUser).toHaveBeenCalledWith(42n, {
      crest: "🛡️",
      description: "Новий опис",
      expectedVersion: 7
    });
    expect(JSON.stringify(sent[0]?.reply_markup)).toContain("v1:g:o");
  });

  it("notifies the inviter exactly once for acceptance and decline", async () => {
    const notification = {
      inviterTelegramUserId: 93n,
      targetName: "Адресатка",
      guildName: "Тиха Печатка",
      guildCrest: "🛡️"
    };
    const accepted = callbackContext();
    await handleGuildCallback(
      accepted.ctx,
      { type: "invite-accept", token: "inviteABC12" },
      guildService({
        acceptInviteForTelegramUser: vi.fn().mockResolvedValue({
          state: "accepted",
          guild: { crest: "🛡️", displayName: "Тиха Печатка" },
          characterId: "character-42",
          activatedFounderCharacterId: null,
          notification
        })
      })
    );
    expect(accepted.sendMessage).toHaveBeenCalledTimes(1);
    expect(accepted.sendMessage.mock.calls[0]?.[0]).toBe(93);
    expect(String(accepted.sendMessage.mock.calls[0]?.[1])).toContain("прийнято");

    const declined = callbackContext();
    await handleGuildCallback(
      declined.ctx,
      { type: "invite-decline", token: "inviteABC12" },
      guildService({
        declineInviteForTelegramUser: vi.fn().mockResolvedValue({
          state: "declined",
          transitioned: true,
          notification
        })
      })
    );
    expect(declined.sendMessage).toHaveBeenCalledTimes(1);
    expect(String(declined.sendMessage.mock.calls[0]?.[1])).toContain("відхилено");

    const replay = callbackContext();
    await handleGuildCallback(
      replay.ctx,
      { type: "invite-decline", token: "inviteABC12" },
      guildService({
        declineInviteForTelegramUser: vi.fn().mockResolvedValue({ state: "declined", transitioned: false })
      })
    );
    expect(replay.sendMessage).not.toHaveBeenCalled();
  });

  it("renders the location-bound Nest and viewer-aware private recovery actions", async () => {
    const nonmember = callbackContext();
    await handleGuildCallback(
      nonmember.ctx,
      { type: "nest-open" },
      guildService({
        getNestForTelegramUser: vi.fn().mockResolvedValue({
          state: "ready",
          viewerState: "not-member",
          hasIncomingInvites: true
        })
      })
    );
    const nonmemberSettings = nonmember.editMessageText.mock.calls[0]?.[1] as {
      reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data?: string }>> };
    };
    const nonmemberButtons = nonmemberSettings.reply_markup.inline_keyboard.flat();
    expect(nonmemberButtons.map((button) => button.text)).toEqual([
      "📚 Чинні ґільдії",
      "❔ Умови й ролі",
      "✉️ Мої запрошення",
      "🔗 Мій код запрошення",
      "📜 Заснувати свою",
      "↩️ До Спуску"
    ]);

    const member = callbackContext();
    await handleGuildCallback(
      member.ctx,
      { type: "nest-open" },
      guildService({
        getNestForTelegramUser: vi.fn().mockResolvedValue({
          state: "ready",
          viewerState: "forming",
          hasIncomingInvites: false
        })
      })
    );
    const memberMarkup = member.editMessageText.mock.calls[0]?.[1] as {
      reply_markup: { inline_keyboard: Array<Array<{ text: string }>> };
    };
    expect(memberMarkup.reply_markup.inline_keyboard.flat().map((button) => button.text)).toContain("📜 Мій статут");
    expect(JSON.stringify(memberMarkup)).not.toContain("Мій код запрошення");

    const rules = callbackContext();
    await handleGuildCallback(
      rules.ctx,
      { type: "nest-rules" },
      guildService({
        getNestForTelegramUser: vi.fn().mockResolvedValue({
          state: "ready",
          viewerState: "not-member",
          hasIncomingInvites: false
        })
      })
    );
    const rulesText = String(rules.editMessageText.mock.calls[0]?.[0]);
    expect(rulesText).toContain("Один обліковий запис — одна ґільдія");
    expect(rulesText).toContain("ціна — <b>587 золота</b>");
    expect(rulesText).not.toContain("User");
  });

  it("keeps stale public callbacks inert and escapes the minimal public profile", async () => {
    const disabledDirectory = vi.fn().mockResolvedValue({ state: "disabled" });
    const disabled = callbackContext();
    await handleGuildCallback(
      disabled.ctx,
      { type: "directory-open", page: 0 },
      guildService({ getPublicDirectoryForTelegramUser: disabledDirectory })
    );
    expect(disabledDirectory).toHaveBeenCalledWith(42n, 0);
    expect(String(disabled.editMessageText.mock.calls[0]?.[0])).toContain("Поверніться до Спуску");
    expect(JSON.stringify(disabled.editMessageText.mock.calls[0]?.[1])).toContain("v1:place:deep");

    const profile = callbackContext();
    await handleGuildCallback(
      profile.ctx,
      { type: "directory-profile", guildId: "12345678-1234-4234-9234-123456789012", page: 1 },
      guildService({
        getPublicGuildForTelegramUser: vi.fn().mockResolvedValue({
          state: "ready",
          guild: {
            id: "12345678-1234-4234-9234-123456789012",
            crest: "<🦉>",
            displayName: "<b>Чужий HTML</b>",
            description: "Лише <script>опис</script>",
            memberCount: 3
          }
        })
      })
    );
    const text = String(profile.editMessageText.mock.calls[0]?.[0]);
    expect(text).toContain("&lt;b&gt;Чужий HTML&lt;/b&gt;");
    expect(text).toContain("Лише &lt;script&gt;опис&lt;/script&gt;");
    expect(text).not.toContain("leader");
    expect(text).not.toContain("12345678");
    expect(JSON.stringify(profile.editMessageText.mock.calls[0]?.[1])).toContain("v1:g:dl:1");
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
