import { Bot, type Context } from "grammy";
import { describe, expect, it, vi } from "vitest";
import { handleGuildCallback, registerGuildCommands } from "../../src/bot/commands/guildCommand";
import type { PartySessionRecord } from "../../src/db/repositories/partySessionRepository";
import type { GuildService } from "../../src/services/guildService";
import type { PartySessionService } from "../../src/services/partySessionService";
import { PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT } from "../../src/services/presenceService";
import { registerSocialBotModule } from "../../src/bot/modules/social";
import type { BotModuleDependencies } from "../../src/bot/modules/types";
import {
  makeGuildDeleteOpenCallbackData,
  makeGuildLeaveOpenCallbackData,
  parseGuildCallbackData
} from "../../src/bot/callbacks/guildCallbackData";
import { GUILD_CREST_CATALOG } from "../../src/domain/guild";
import {
  GUILD_CREATION_DESCRIPTION_PROMPT_HEADING,
  GUILD_CREATION_NAME_PROMPT_HEADING,
  GUILD_CREST_UPLOAD_PROMPT_HEADING,
  GUILD_CUSTOM_EMOJI_PROMPT_HEADING
} from "../../src/bot/presenters/guildPresenter";

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
      areWeeklyDevHelpersEnabled: () => false,
      getHubForTelegramUser
    }), { botUsername: "kvestarnia_bot" });

    await bot.handleUpdate(commandUpdate("/guild"));
    await bot.handleUpdate(commandUpdate("/dev_guild_gold", 2));
    await bot.handleUpdate(commandUpdate("/dev_guild_weekly finish", 3));

    expect(getHubForTelegramUser).toHaveBeenCalledWith(42n, 0);
    expect(replies).toHaveLength(1);
    expect(replies[0]).toContain("Нові статути й запрошення тимчасово зачинені");
    expect(replies[0]).not.toContain("telegram");
  });

  it("projects and acknowledges a pending User-level weekly notice through /guild once", async () => {
    const bot = new Bot("test-token", {
      botInfo: { id: 123, is_bot: true, first_name: "Квестарня", username: "kvestarnia_bot" }
    });
    const sent: string[] = [];
    const claim = {
      entitlementId: "weekly-entitlement-1",
      claimToken: "claim-1",
      telegramUserId: 42n,
      characterId: "character-42",
      characterName: "Відновлена",
      classId: "class.priest",
      raceId: "race.human-ish",
      unlock: {
        id: "achievement.guild.weekly-goal-completed",
        title: "Тринадцять печаток, жодної зайвої",
        cosmeticTitleGrantId: null,
        unlockedAt: new Date("2026-08-24T18:00:00.000Z")
      }
    };
    const claimWeeklyAchievementNotices = vi.fn()
      .mockResolvedValueOnce([claim])
      .mockResolvedValueOnce([]);
    const markWeeklyAchievementNoticeSent = vi.fn().mockResolvedValue(true);
    bot.api.config.use((_prev, method, payload) => {
      if (method === "sendMessage") sent.push(String(payload.text));
      return Promise.resolve({ ok: true, result: { message_id: sent.length } });
    });
    registerGuildCommands(bot, guildService({
      getHubForTelegramUser: vi.fn().mockResolvedValue(readyGuildHub()),
      claimWeeklyAchievementNotices,
      markWeeklyAchievementNoticeSent
    }), { botUsername: "kvestarnia_bot" });

    await bot.handleUpdate(commandUpdate("/guild"));
    await bot.handleUpdate(commandUpdate("/guild", 2));

    expect(sent.filter((text) => text.includes("Нова ачівка"))).toHaveLength(1);
    expect(claimWeeklyAchievementNotices).toHaveBeenCalledTimes(2);
    expect(markWeeklyAchievementNoticeSent).toHaveBeenCalledOnce();
    expect(markWeeklyAchievementNoticeSent).toHaveBeenCalledWith(claim);
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
    expect(creationMarkup.inline_keyboard.flat()).toContainEqual(expect.objectContaining({
      text: "✍️ Запропонувати свій емоджі",
      callback_data: "v1:g:nu"
    }));
    const codeMarkup = sent[2]?.reply_markup as { inline_keyboard: Array<Array<Record<string, unknown>>> };
    expect(codeMarkup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
      expect.objectContaining({ copy_text: { text: "privateInviteCode93" } }),
      expect.objectContaining({ copy_text: { text: "https://t.me/kvestarnia_bot?start=guild_privateInviteCode93" } }),
      expect.objectContaining({ callback_data: "v1:g:ig:1" }),
      expect.objectContaining({ callback_data: "v1:g:o" })
    ]));
    expect(codeMarkup.inline_keyboard.flat().some((button) =>
      typeof button.url === "string" && button.url.startsWith("https://t.me/share/url?")
    )).toBe(true);
    expect(String(sent[2]?.text)).not.toContain("telegram");
    expect(String(sent[2]?.text)).toContain("<blockquote>");
    expect(String(sent[2]?.text)).toContain(
      '<a href="https://t.me/kvestarnia_bot?start=guild_privateInviteCode93">https://t.me/kvestarnia_bot?start=guild_privateInviteCode93</a>'
    );
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

  it("keeps a guild return control when no eligible party exists", async () => {
    const context = callbackContext();

    await handleGuildCallback(
      context.ctx,
      { type: "party-open", page: 0 },
      guildService({ getPartyPickerForTelegramUser: vi.fn().mockResolvedValue({ state: "no-party" }) })
    );

    expect(context.editMessageText).toHaveBeenCalledTimes(1);
    expect(String(context.editMessageText.mock.calls[0]?.[0])).toContain("Ґільдія не створює окрему ватагу");
    const settings = context.editMessageText.mock.calls[0]?.[1] as {
      reply_markup?: { inline_keyboard?: Array<Array<{ text: string; callback_data?: string }>> };
    };
    expect(settings.reply_markup?.inline_keyboard).toEqual([
      [{ text: "🏰 До ґільдії", callback_data: "v1:g:o" }]
    ]);
  });

  it("pages opted-in same-location targets and revalidates presence before invitation", async () => {
    const candidates = Array.from({ length: 6 }, (_, index) => ({
      candidateId: `12345678-1234-4234-9234-12345678901${index}`,
      telegramUserId: BigInt(93 + index),
      name: `Адресат ${index + 1}`,
      targetToken: `nearbyInviteCode${index + 1}`
    }));
    const getNearbyInviteCandidatesForTelegramUser = vi.fn().mockResolvedValue({
      state: "ready",
      candidates
    });
    const getOnlineForTelegramUser = vi.fn().mockResolvedValue({
      state: "ready",
      globalTotal: 7,
      location: {
        id: "location.korchma.deep",
        name: "Спуск до Низу",
        people: {
          active: [
            { telegramUserId: 42n, name: "Голова", status: "active" },
            ...candidates.map((candidate) => ({
              telegramUserId: candidate.telegramUserId,
              name: candidate.name,
              status: "active"
            }))
          ],
          idle: [],
          total: 7
        }
      },
      activity: null
    });
    const opened = callbackContext();

    await handleGuildCallback(
      opened.ctx,
      { type: "nearby-invite-open", page: 9 },
      guildService({ getNearbyInviteCandidatesForTelegramUser }),
      { presence: { getOnlineForTelegramUser } }
    );

    expect(getNearbyInviteCandidatesForTelegramUser).toHaveBeenCalledWith(
      42n,
      candidates.map((candidate) => candidate.telegramUserId)
    );
    expect(String(opened.editMessageText.mock.calls[0]?.[0])).toContain("Сторінка <b>2/2</b>");
    const markup = opened.editMessageText.mock.calls[0]?.[1] as {
      reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data?: string }>> };
    };
    expect(markup.reply_markup.inline_keyboard.map((row) => row.map((button) => button.text))).toEqual([
      ["✉️ Адресат 6"],
      ["⬅️", "2/2"],
      ["🏰 До ґільдії"]
    ]);
    expect(markup.reply_markup.inline_keyboard[0]?.[0]?.callback_data).toBe(
      "v1:g:li:12345678-1234-4234-9234-123456789015:1"
    );
    expect(JSON.stringify(markup)).not.toContain("nearbyInviteCode6");

    const createInviteForTelegramUser = vi.fn().mockResolvedValue({
      state: "created",
      invite: {
        token: "createdInviteToken93",
        guildId: "guild-id",
        guildName: "Тиха Печатка",
        guildCrest: "🧿",
        targetName: "Адресат 6",
        status: "pending",
        expiresAt: new Date("2026-08-21T00:00:00.000Z")
      },
      deliveryTelegramUserId: 98n
    });
    const selected = callbackContext();
    await handleGuildCallback(
      selected.ctx,
      { type: "nearby-invite", candidateId: "12345678-1234-4234-9234-123456789015", page: 1 },
      guildService({ getNearbyInviteCandidatesForTelegramUser, createInviteForTelegramUser }),
      { presence: { getOnlineForTelegramUser } }
    );
    expect(createInviteForTelegramUser).toHaveBeenCalledWith(42n, "nearbyInviteCode6");
    expect(selected.sendMessage).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(selected.reply.mock.calls[0]?.[1])).toContain("v1:g:o");

    createInviteForTelegramUser.mockClear();
    getOnlineForTelegramUser.mockResolvedValueOnce({
      state: "ready",
      globalTotal: 1,
      location: {
        id: "location.korchma.deep",
        name: "Спуск до Низу",
        people: {
          active: [{ telegramUserId: 42n, name: "Голова", status: "active" }],
          idle: [],
          total: 1
        }
      },
      activity: null
    });
    getNearbyInviteCandidatesForTelegramUser.mockResolvedValueOnce({ state: "ready", candidates: [] });
    const stale = callbackContext();
    await handleGuildCallback(
      stale.ctx,
      { type: "nearby-invite", candidateId: "12345678-1234-4234-9234-123456789015", page: 1 },
      guildService({ getNearbyInviteCandidatesForTelegramUser, createInviteForTelegramUser }),
      { presence: { getOnlineForTelegramUser } }
    );
    expect(stale.answerCallbackQuery).toHaveBeenCalledWith(expect.objectContaining({ show_alert: true }));
    expect(createInviteForTelegramUser).not.toHaveBeenCalled();
  });

  it("keeps stale nearby-invite callbacks inert while guild rollout is disabled", async () => {
    const getOnlineForTelegramUser = vi.fn();
    const getNearbyInviteCandidatesForTelegramUser = vi.fn();
    const createInviteForTelegramUser = vi.fn();
    const context = callbackContext();

    await handleGuildCallback(
      context.ctx,
      { type: "nearby-invite", candidateId: "12345678-1234-4234-9234-123456789012", page: 0 },
      guildService({
        isEnabled: () => false,
        getNearbyInviteCandidatesForTelegramUser,
        createInviteForTelegramUser
      }),
      { presence: { getOnlineForTelegramUser } }
    );

    expect(context.answerCallbackQuery).toHaveBeenCalledWith(expect.objectContaining({ show_alert: true }));
    expect(getOnlineForTelegramUser).not.toHaveBeenCalled();
    expect(getNearbyInviteCandidatesForTelegramUser).not.toHaveBeenCalled();
    expect(createInviteForTelegramUser).not.toHaveBeenCalled();
    expect(context.reply).not.toHaveBeenCalled();
    expect(context.sendMessage).not.toHaveBeenCalled();
  });

  it("regenerates invitation-card copy without rotating or exposing the private token", async () => {
    const createInviteOptInForTelegramUser = vi.fn();
    const getInviteOptInForTelegramUser = vi.fn().mockResolvedValue({
      state: "ready",
      token: "samePrivateInvite93",
      expiresAt: new Date("2026-08-07T20:00:00.000Z")
    });
    const context = callbackContext();
    await handleGuildCallback(
      context.ctx,
      { type: "invite-copy", variant: 1 },
      guildService({ createInviteOptInForTelegramUser, getInviteOptInForTelegramUser }),
      { botUsername: "kvestarnia_bot" }
    );

    expect(getInviteOptInForTelegramUser).toHaveBeenCalledWith(42n);
    expect(createInviteOptInForTelegramUser).not.toHaveBeenCalled();
    expect(context.editMessageText).toHaveBeenCalledTimes(1);
    const editedCall = JSON.stringify(context.editMessageText.mock.calls[0]);
    expect(editedCall).toContain("v1:g:ig:2");
    expect(editedCall).toContain("guild_samePrivateInvite93");
    expect(editedCall).not.toContain("v1:g:ig:samePrivateInvite93");
    expect(String(context.editMessageText.mock.calls[0]?.[0])).toContain("<blockquote>");
  });

  it("runs a custom emoji through availability, name, description and preview without media work", async () => {
    const bot = new Bot("test-token", {
      botInfo: { id: 123, is_bot: true, first_name: "Квестарня", username: "kvestarnia_bot" }
    });
    const getCrestPickerForTelegramUser = vi.fn().mockImplementation(
      (_actor: bigint, _purpose: string, requestedCrest?: string) => Promise.resolve({
        state: "ready",
        availableCrests: [...GUILD_CREST_CATALOG],
        currentCrest: null,
        currentHasCustomCrest: false,
        requestedCrestAvailable: requestedCrest === undefined ? undefined : true,
        guildVersion: null
      })
    );
    const previewCreationForTelegramUser = vi.fn().mockResolvedValue({
      state: "ready",
      intent: {
        token: "emojiIntentToken13",
        displayName: "Оката Рада",
        normalizedName: "оката рада",
        crest: "❤️",
        crestKind: "custom",
        hasCustomCrest: true,
        description: "Дивимося в обидва боки.",
        goldCost: 587,
        availableGold: 600,
        expiresAt: new Date("2026-08-06T20:23:00.000Z")
      }
    });
    const sent: Array<Record<string, unknown>> = [];
    bot.api.config.use((_prev, method, payload) => {
      if (method === "sendMessage") {
        sent.push(payload);
      }
      return Promise.resolve(method === "answerCallbackQuery"
        ? { ok: true, result: true }
        : { ok: true, result: { message_id: sent.length + 1 } });
    });
    registerSocialBotModule(bot, {
      services: {
        guilds: guildService({
          getCrestPickerForTelegramUser,
          previewCreationForTelegramUser
        })
      },
      options: {}
    } as unknown as BotModuleDependencies);

    await bot.handleUpdate(callbackUpdate("v1:g:nu"));
    await bot.handleUpdate(replyUpdate(
      "❤️",
      `${GUILD_CUSTOM_EMOJI_PROMPT_HEADING} · c`,
      94
    ));
    await bot.handleUpdate(replyUpdate(
      "Оката Рада",
      `${GUILD_CREATION_NAME_PROMPT_HEADING} · ❤️`,
      95
    ));
    await bot.handleUpdate(replyUpdate(
      "Дивимося в обидва боки.",
      `${GUILD_CREATION_DESCRIPTION_PROMPT_HEADING} · ❤️\n\nНазва: Оката Рада`,
      96
    ));

    expect(getCrestPickerForTelegramUser).toHaveBeenCalledWith(42n, "creation", "❤");
    expect(previewCreationForTelegramUser).toHaveBeenCalledWith(42n, {
      crest: "❤️",
      displayName: "Оката Рада",
      description: "Дивимося в обидва боки."
    });
    expect(String(sent.at(-1)?.text)).toContain("❤️");
    expect(JSON.stringify(sent.at(-1)?.reply_markup)).toContain("v1:g:c:emojiIntentToken13");
    expect(JSON.stringify(sent)).not.toContain("file_id");
  });

  it("retries invalid or occupied custom emoji and never treats it as media", async () => {
    const bot = new Bot("test-token", {
      botInfo: { id: 123, is_bot: true, first_name: "Квестарня", username: "kvestarnia_bot" }
    });
    const getCrestPickerForTelegramUser = vi.fn().mockResolvedValue({
      state: "ready",
      availableCrests: [...GUILD_CREST_CATALOG],
      currentCrest: null,
      currentHasCustomCrest: false,
      requestedCrestAvailable: false,
      guildVersion: null
    });
    const sent: Array<Record<string, unknown>> = [];
    bot.api.config.use((_prev, method, payload) => {
      if (method === "sendMessage") {
        sent.push(payload);
      }
      return Promise.resolve({ ok: true, result: { message_id: sent.length + 1 } });
    });
    registerGuildCommands(bot, guildService({
      getCrestPickerForTelegramUser
    }));

    await bot.handleUpdate(replyUpdate(
      "не емоджі",
      `${GUILD_CUSTOM_EMOJI_PROMPT_HEADING} · c`,
      101
    ));
    await bot.handleUpdate(replyUpdate(
      "🧿",
      `${GUILD_CUSTOM_EMOJI_PROMPT_HEADING} · c`,
      102
    ));

    expect(getCrestPickerForTelegramUser).toHaveBeenNthCalledWith(1, 42n, "creation", undefined);
    expect(getCrestPickerForTelegramUser).toHaveBeenNthCalledWith(2, 42n, "creation", "🧿");
    expect(sent).toHaveLength(2);
    expect(String(sent[0]?.text)).toContain("рівно один емоджі");
    expect(String(sent[1]?.text)).toContain("уже зайнятий");
    expect((sent[0]?.reply_markup as { force_reply?: boolean }).force_reply).toBe(true);
    expect((sent[1]?.reply_markup as { force_reply?: boolean }).force_reply).toBe(true);
  });

  it.each([
    ["photo", { photo: [{ file_id: "photo-secret", file_unique_id: "photo-unique", width: 512, height: 512 }] }],
    ["document", { document: { file_id: "document-secret", file_unique_id: "document-unique", file_name: "crest.png" } }],
    ["sticker", { sticker: { file_id: "sticker-secret", file_unique_id: "sticker-unique", width: 512, height: 512, is_animated: false, is_video: false, type: "regular" } }],
    ["animation", { animation: { file_id: "animation-secret", file_unique_id: "animation-unique", width: 512, height: 512, duration: 1 } }],
    ["video", { video: { file_id: "video-secret", file_unique_id: "video-unique", width: 512, height: 512, duration: 1 } }]
  ] as const)("rejects a %s reply to the exact custom-emoji prompt after revalidating authority", async (_kind, media) => {
    const bot = new Bot("test-token", {
      botInfo: { id: 123, is_bot: true, first_name: "Квестарня", username: "kvestarnia_bot" }
    });
    const getCrestPickerForTelegramUser = vi.fn().mockResolvedValue({
      state: "ready",
      availableCrests: [...GUILD_CREST_CATALOG],
      currentCrest: null,
      currentHasCustomCrest: false,
      requestedCrestAvailable: null,
      guildVersion: null
    });
    const mutations = {
      previewCreationForTelegramUser: vi.fn(),
      updateProfileForTelegramUser: vi.fn(),
      confirmCreationForTelegramUser: vi.fn(),
      beginCrestUploadForTelegramUser: vi.fn(),
      storeCrestUploadForTelegramUser: vi.fn()
    };
    const sent: Array<Record<string, unknown>> = [];
    bot.api.config.use((_prev, method, payload) => {
      if (method === "sendMessage") {
        sent.push(payload);
      }
      return Promise.resolve({ ok: true, result: { message_id: sent.length + 1 } });
    });
    registerGuildCommands(bot, guildService({ getCrestPickerForTelegramUser, ...mutations }));

    await bot.handleUpdate(mediaReplyUpdate(
      `${GUILD_CUSTOM_EMOJI_PROMPT_HEADING} · c`,
      media,
      103
    ));

    expect(getCrestPickerForTelegramUser).toHaveBeenCalledWith(42n, "creation");
    expect(Object.values(mutations).every((mutation) => mutation.mock.calls.length === 0)).toBe(true);
    expect(sent).toHaveLength(1);
    expect(String(sent[0]?.text)).toContain("Фото, файли й інші повідомлення не підходять");
    expect((sent[0]?.reply_markup as { force_reply?: boolean }).force_reply).toBe(true);
    expect(JSON.stringify(sent)).not.toMatch(/(?:photo|document|sticker|animation|video)-secret/u);
  });

  it("does not reissue a stale profile emoji prompt for unsupported media", async () => {
    const bot = new Bot("test-token", {
      botInfo: { id: 123, is_bot: true, first_name: "Квестарня", username: "kvestarnia_bot" }
    });
    const updateProfileForTelegramUser = vi.fn();
    const sent: Array<Record<string, unknown>> = [];
    bot.api.config.use((_prev, method, payload) => {
      if (method === "sendMessage") {
        sent.push(payload);
      }
      return Promise.resolve({ ok: true, result: { message_id: sent.length + 1 } });
    });
    registerGuildCommands(bot, guildService({
      getCrestPickerForTelegramUser: vi.fn().mockResolvedValue({
        state: "ready",
        availableCrests: [...GUILD_CREST_CATALOG],
        currentCrest: "🧿",
        currentHasCustomCrest: true,
        requestedCrestAvailable: null,
        guildVersion: 8
      }),
      updateProfileForTelegramUser
    }));

    await bot.handleUpdate(mediaReplyUpdate(
      `${GUILD_CUSTOM_EMOJI_PROMPT_HEADING} · p · 7`,
      { photo: [{ file_id: "stale-secret", file_unique_id: "stale-unique", width: 512, height: 512 }] },
      104
    ));

    expect(updateProfileForTelegramUser).not.toHaveBeenCalled();
    expect(sent).toHaveLength(1);
    expect((sent[0]?.reply_markup as { force_reply?: boolean }).force_reply).not.toBe(true);
    expect(JSON.stringify(sent[0]?.reply_markup)).toContain("v1:g:o");
    expect(JSON.stringify(sent)).not.toContain("stale-secret");
  });

  it("does not reissue unsupported-media prompts without current authority or while disabled", async () => {
    const bot = new Bot("test-token", {
      botInfo: { id: 123, is_bot: true, first_name: "Квестарня", username: "kvestarnia_bot" }
    });
    let enabled = true;
    const getCrestPickerForTelegramUser = vi.fn().mockResolvedValue({ state: "forbidden" });
    const updateProfileForTelegramUser = vi.fn();
    const sent: Array<Record<string, unknown>> = [];
    bot.api.config.use((_prev, method, payload) => {
      if (method === "sendMessage") {
        sent.push(payload);
      }
      return Promise.resolve({ ok: true, result: { message_id: sent.length + 1 } });
    });
    registerGuildCommands(bot, guildService({
      isEnabled: () => enabled,
      getCrestPickerForTelegramUser,
      updateProfileForTelegramUser
    }));

    await bot.handleUpdate(mediaReplyUpdate(
      `${GUILD_CUSTOM_EMOJI_PROMPT_HEADING} · p · 7`,
      { photo: [{ file_id: "forbidden-secret", file_unique_id: "forbidden-unique", width: 512, height: 512 }] },
      105
    ));
    enabled = false;
    await bot.handleUpdate(mediaReplyUpdate(
      `${GUILD_CUSTOM_EMOJI_PROMPT_HEADING} · c`,
      { document: { file_id: "disabled-secret", file_unique_id: "disabled-unique" } },
      106
    ));

    expect(getCrestPickerForTelegramUser).toHaveBeenCalledTimes(1);
    expect(updateProfileForTelegramUser).not.toHaveBeenCalled();
    expect(sent).toHaveLength(2);
    expect(sent.every((message) =>
      (message.reply_markup as { force_reply?: boolean }).force_reply !== true
    )).toBe(true);
    expect(JSON.stringify(sent[0]?.reply_markup)).toContain("v1:g:o");
    expect(JSON.stringify(sent[1]?.reply_markup)).toContain("v1:g:o");
    expect(JSON.stringify(sent)).not.toMatch(/(?:forbidden|disabled)-secret/u);
  });

  it("rejects a link entity in an otherwise valid custom-emoji reply", async () => {
    const bot = new Bot("test-token", {
      botInfo: { id: 123, is_bot: true, first_name: "Квестарня", username: "kvestarnia_bot" }
    });
    const getCrestPickerForTelegramUser = vi.fn().mockResolvedValue({
      state: "ready",
      availableCrests: [...GUILD_CREST_CATALOG],
      currentCrest: null,
      currentHasCustomCrest: false,
      requestedCrestAvailable: null,
      guildVersion: null
    });
    const sent: Array<Record<string, unknown>> = [];
    bot.api.config.use((_prev, method, payload) => {
      if (method === "sendMessage") {
        sent.push(payload);
      }
      return Promise.resolve({ ok: true, result: { message_id: sent.length + 1 } });
    });
    registerGuildCommands(bot, guildService({ getCrestPickerForTelegramUser }));

    await bot.handleUpdate(replyUpdate(
      "🧿",
      `${GUILD_CUSTOM_EMOJI_PROMPT_HEADING} · c`,
      105,
      [{ offset: 0, length: 2, type: "text_link", url: "https://example.invalid" }]
    ));

    expect(getCrestPickerForTelegramUser).toHaveBeenCalledWith(42n, "creation", undefined);
    expect(String(sent[0]?.text)).toContain("посилання");
    expect((sent[0]?.reply_markup as { force_reply?: boolean }).force_reply).toBe(true);
  });

  it("retires exact old photo prompts inertly while arbitrary photos remain outside guild routing", async () => {
    const bot = new Bot("test-token", {
      botInfo: { id: 123, is_bot: true, first_name: "Квестарня", username: "kvestarnia_bot" }
    });
    const storeCrestUploadForTelegramUser = vi.fn();
    const validateCrestUploadDraftForTelegramUser = vi.fn();
    const sent: Array<Record<string, unknown>> = [];
    bot.api.config.use((_prev, method, payload) => {
      if (method === "sendMessage") {
        sent.push(payload);
      }
      return Promise.resolve({ ok: true, result: { message_id: sent.length + 1 } });
    });
    registerGuildCommands(bot, guildService({
      validateCrestUploadDraftForTelegramUser,
      storeCrestUploadForTelegramUser
    }));

    await bot.handleUpdate(photoReplyUpdate(
      `${GUILD_CREST_UPLOAD_PROMPT_HEADING} · c · retiredUploadToken13`,
      [{ file_id: "retired-secret", file_unique_id: "retired-unique", width: 512, height: 512 }],
      111
    ));
    await bot.handleUpdate(arbitraryPhotoUpdate(112));

    expect(validateCrestUploadDraftForTelegramUser).not.toHaveBeenCalled();
    expect(storeCrestUploadForTelegramUser).not.toHaveBeenCalled();
    expect(sent).toHaveLength(1);
    expect(String(sent[0]?.text)).toContain("Фото гербів більше не приймаються");
    expect(JSON.stringify(sent[0]?.reply_markup)).toContain("v1:g:o");
    expect(JSON.stringify(sent)).not.toContain("retired-secret");
  });

  it("keeps retired crest-view callbacks inert without repository or photo delivery", async () => {
    const context = callbackContext();
    const getGuildCrestMediaForTelegramUser = vi.fn();
    const sendPhoto = vi.fn();
    Object.assign(context.ctx.api, { sendPhoto });
    await handleGuildCallback(
      context.ctx,
      { type: "crest-view-guild", guildId: "12345678-1234-4234-9234-123456789012", publicAccess: false, page: 0 },
      guildService({ getGuildCrestMediaForTelegramUser })
    );
    expect(getGuildCrestMediaForTelegramUser).not.toHaveBeenCalled();
    expect(sendPhoto).not.toHaveBeenCalled();
    expect(context.answerCallbackQuery).toHaveBeenCalledWith(expect.objectContaining({ show_alert: true }));
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
    expect(String(sendMessage.mock.calls[0]?.[1])).toContain("start=party_partyABC12");
    expect(JSON.stringify(sendMessage.mock.calls[0]?.[2])).toContain("v1:party:jg:partyABC12");
    expect(recordPartyInvite).toHaveBeenCalledWith("guild-id", 42n, "party-1", "target-user");
    expect(answerCallbackQuery).toHaveBeenCalledWith({ text: "Звичайне запрошення передано." });
    expect(reply).toHaveBeenCalledTimes(1);
    expect(recordParticipantMessageReference).toHaveBeenCalledWith(42n, "partyABC12", {
      chatId: 42n,
      messageId: 23
    });
  });

  it("delivers a guild-attributed left-passage invitation with its canonical deep link", async () => {
    const session = {
      ...makePartySession(),
      originLocationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT
    };
    const { ctx, sendMessage } = callbackContext();

    await handleGuildCallback(
      ctx,
      { type: "party-invite", memberId: "member-00000001", version: 7 },
      guildService({
        resolvePartyRecipientForTelegramUser: vi.fn().mockResolvedValue(recipientResult()),
        recordPartyInvite: vi.fn().mockResolvedValue(undefined)
      }),
      {
        botUsername: "kvestarnia_bot",
        partySessions: partyService({
          getLiveRecruitingByTelegramUser: vi.fn().mockResolvedValue(session),
          getByToken: vi.fn().mockResolvedValue({ state: "ready", session }),
          recordParticipantMessageReference: vi.fn().mockResolvedValue({ state: "ready", session })
        })
      }
    );

    expect(String(sendMessage.mock.calls[0]?.[1]))
      .toContain("start=nyz_left_attack_partyABC12");
    expect(String(sendMessage.mock.calls[0]?.[1]))
      .not.toContain("start=party_partyABC12");
    expect(JSON.stringify(sendMessage.mock.calls[0]?.[2])).toContain("v1:party:jg:partyABC12");
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
    expect(String(first.editMessageText.mock.calls[0]?.[0])).toContain("Сторінка <b>1/2</b>.");
    const firstButtons = firstMarkup.reply_markup?.inline_keyboard?.flat() ?? [];
    expect(firstMarkup.reply_markup?.inline_keyboard?.map((row) => row.map((button) => button.text))).toEqual([
      ["Двійник · голова"],
      ["Двійник · старшина"],
      ["Учасник 3 · учасник"],
      ["Учасник 4 · учасник"],
      ["Учасник 5 · учасник"],
      ["1/2", "➡️"],
      ["🏰 До ґільдії"]
    ]);
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

  it("omits redundant page text and controls for a one-page member list", async () => {
    const getMemberManagementForTelegramUser = vi.fn().mockResolvedValue({
      state: "ready",
      guildId: "guild-id",
      version: 7,
      viewerRole: "leader",
      members: [{ id: "member-00000001", name: "Шаннар де Кассал", role: "leader" as const }]
    });
    const singlePage = callbackContext();

    await handleGuildCallback(
      singlePage.ctx,
      { type: "members-open", version: 7, page: 0 },
      guildService({ getMemberManagementForTelegramUser })
    );

    const text = String(singlePage.editMessageText.mock.calls[0]?.[0]);
    const markup = singlePage.editMessageText.mock.calls[0]?.[1] as {
      reply_markup?: { inline_keyboard?: Array<Array<{ text: string; callback_data?: string }>> };
    };
    expect(text).toBe("👥 <b>Учасники ґільдії</b>\n\nОберіть запис, щоб побачити доступні дії.");
    expect(markup.reply_markup?.inline_keyboard?.map((row) => row.map((button) => button.text))).toEqual([
      ["Шаннар де Кассал · голова"],
      ["🏰 До ґільдії"]
    ]);
    expect(JSON.stringify(markup)).not.toContain("1/1");
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
      guildService({
        getHubForTelegramUser: vi.fn().mockResolvedValue(hub),
        getCrestPickerForTelegramUser: vi.fn().mockResolvedValue({
          state: "ready",
          availableCrests: [...GUILD_CREST_CATALOG],
          currentCrest: "🧿",
          currentHasCustomCrest: true,
          guildVersion: 7
        })
      })
    );
    expect(String(profile.editMessageText.mock.calls[0]?.[0])).toContain("Профіль ґільдії · крок 1 із 2");
    expect(JSON.stringify(profile.editMessageText.mock.calls[0]?.[1])).toContain("v1:g:er:0:7");
    expect(JSON.stringify(profile.editMessageText.mock.calls[0]?.[1])).toContain("v1:g:eu:7");
    expect(JSON.stringify(profile.editMessageText.mock.calls[0]?.[1])).toContain("v1:g:ek:7");

    const keepCustom = callbackContext();
    await handleGuildCallback(
      keepCustom.ctx,
      { type: "profile-keep-custom", version: 7 },
      guildService({
        getCrestPickerForTelegramUser: vi.fn().mockResolvedValue({
          state: "ready",
          availableCrests: [...GUILD_CREST_CATALOG],
          currentCrest: "🧿",
          currentHasCustomCrest: true,
          guildVersion: 7
        })
      })
    );
    expect(String(keepCustom.reply.mock.calls[0]?.[0])).toContain("крок 2 із 2 · 🧿");
    expect(JSON.stringify(keepCustom.reply.mock.calls[0]?.[0])).not.toContain("file_id");

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
    registerGuildCommands(bot, guildService({
      updateProfileForTelegramUser
    }));
    await bot.handleUpdate(replyUpdate(
      "Опис при чинному гербі",
      "✏️ Профіль ґільдії · крок 2 із 2 · 🧿\n\nРедакція статуту: 7",
      30
    ));
    await bot.handleUpdate(replyUpdate(
      "Новий опис",
      "✏️ Профіль ґільдії · крок 2 із 2 · 🛡️\n\nРедакція статуту: 7",
      31
    ));
    expect(updateProfileForTelegramUser).toHaveBeenNthCalledWith(1, 42n, {
      crest: "🧿",
      description: "Опис при чинному гербі",
      expectedVersion: 7
    });
    expect(updateProfileForTelegramUser).toHaveBeenNthCalledWith(2, 42n, {
      crest: "🛡️",
      description: "Новий опис",
      expectedVersion: 7
    });
    expect(JSON.stringify(sent[0]?.reply_markup)).toContain("v1:g:o");
  });

  it("notifies both sides with recovery controls and delivers both activation achievements", async () => {
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
          guildActivatedAt: new Date("2026-08-17T20:00:00.000Z"),
          activatedFounderCharacterId: "founder-character",
          founderAchievementUnlocks: [{
            id: "achievement.guild.created",
            title: "Печатка на двох",
            cosmeticTitleGrantId: null,
            unlockedAt: new Date("2026-08-17T20:00:00.000Z")
          }],
          achievementUnlocks: [{
            id: "achievement.guild.joined",
            title: "У списку вже не самотньо",
            cosmeticTitleGrantId: null,
            unlockedAt: new Date("2026-08-17T20:00:00.000Z")
          }],
          notification
        })
      })
    );
    expect(accepted.sendMessage).toHaveBeenCalledTimes(2);
    expect(accepted.sendMessage.mock.calls[0]?.[0]).toBe(93);
    expect(String(accepted.sendMessage.mock.calls[0]?.[1])).toContain("прийнято");
    expect(JSON.stringify(accepted.sendMessage.mock.calls[0]?.[2])).toContain("v1:g:o");
    expect(String(accepted.sendMessage.mock.calls[1]?.[1])).toContain("Печатка на двох");
    expect(JSON.stringify(accepted.sendMessage.mock.calls[1]?.[2])).toContain("v1:g:o");
    expect(String(accepted.reply.mock.calls[0]?.[0])).toContain("У списку вже не самотньо");
    expect(JSON.stringify(accepted.reply.mock.calls[0]?.[1])).toContain("v1:g:o");

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
    expect(text).toContain("&lt;🦉&gt;");
    expect(text).toContain("&lt;b&gt;Чужий HTML&lt;/b&gt;");
    expect(text).toContain("Лише &lt;script&gt;опис&lt;/script&gt;");
    expect(text).not.toContain("leader");
    expect(text).not.toContain("12345678");
    expect(JSON.stringify(profile.editMessageText.mock.calls[0]?.[1])).toContain("v1:g:dl:1");
  });

  it("routes guild-only Glory boards and keeps location, membership and flag denials recoverable", async () => {
    const getGloryBoardForTelegramUser = vi.fn().mockResolvedValue({
      state: "ready",
      view: "primacy",
      periodKey: "12026-W35",
      rows: [{
        guildId: "guild-1",
        guildName: "<Тиха Печатка>",
        guildCrest: "🛡️",
        place: 1,
        glory: 13,
        progressCount: 13,
        targetCount: 13,
        completed: true,
        viewerGuild: true
      }],
      viewerGuild: {
        guildId: "guild-1",
        guildName: "<Тиха Печатка>",
        guildCrest: "🛡️",
        place: 1,
        glory: 13,
        progressCount: 13,
        targetCount: 13,
        completed: true,
        viewerGuild: true
      },
      page: 1,
      hasPreviousPage: true,
      hasNextPage: false
    });
    const ready = callbackContext();
    await handleGuildCallback(
      ready.ctx,
      { type: "glory-board", view: "primacy", page: 1 },
      guildService({ getGloryBoardForTelegramUser })
    );
    expect(getGloryBoardForTelegramUser).toHaveBeenCalledWith(42n, "primacy", 1);
    expect(String(ready.editMessageText.mock.calls[0]?.[0])).toContain("&lt;Тиха Печатка&gt;");
    expect(String(ready.editMessageText.mock.calls[0]?.[0])).not.toMatch(/гравець|telegram|роль/iu);
    expect(JSON.stringify(ready.editMessageText.mock.calls[0]?.[1])).toContain("v1:g:bg:p1");

    for (const deniedResult of [
      { state: "wrong-location" as const, hasGuild: true },
      { state: "not-member" as const, hasGuild: false },
      { state: "disabled" as const }
    ]) {
      const denied = callbackContext();
      await handleGuildCallback(
        denied.ctx,
        { type: "glory-board", view: "glory", page: 0 },
        guildService({
          getGloryBoardForTelegramUser: vi.fn().mockResolvedValue(deniedResult)
        })
      );
      expect(String(denied.editMessageText.mock.calls[0]?.[0])).toMatch(
        deniedResult.state === "wrong-location"
          ? /лише в Гнізді ґільдій/u
          : deniedResult.state === "not-member"
            ? /Долучіться до ґільдії/u
            : /зачинена/u
      );
      expect(JSON.stringify(denied.editMessageText.mock.calls[0]?.[1])).toContain("v1:place:deep");
    }
  });

  it("requires an explicit yes before leaving a guild and keeps no strictly read-only", async () => {
    const bot = new Bot("test-token", {
      botInfo: { id: 123, is_bot: true, first_name: "Квестарня", username: "kvestarnia_bot" }
    });
    const leaveForTelegramUser = vi.fn().mockResolvedValue({ state: "left", guildName: "Нічна" });
    const getHubForTelegramUser = vi.fn().mockResolvedValue(readyGuildHub());
    const edits: Array<Record<string, unknown>> = [];
    bot.api.config.use((_prev, method, payload) => {
      if (method === "editMessageText") edits.push(payload);
      return Promise.resolve(method === "answerCallbackQuery"
        ? { ok: true, result: true }
        : { ok: true, result: { message_id: 13 } });
    });
    registerSocialBotModule(bot, {
      services: { guilds: guildService({ getHubForTelegramUser, leaveForTelegramUser }) },
      options: {}
    } as unknown as BotModuleDependencies);

    await bot.handleUpdate(callbackUpdate(makeGuildLeaveOpenCallbackData(7), 201));

    expect(leaveForTelegramUser).not.toHaveBeenCalled();
    expect(String(edits[0]?.text)).toContain("Підтвердити вихід із ґільдії?");
    const confirmationButtons = confirmationCallbacks(edits[0]);
    expect(confirmationButtons.map((button) => button.text)).toEqual([
      "✅ Так, вийти",
      "❌ Ні, лишитися"
    ]);
    const noCallback = confirmationButtons.find((button) => button.text.startsWith("❌"))?.callback_data;
    expect(parseGuildCallbackData(noCallback)).toEqual({ ok: true, value: { type: "leave-cancel" } });

    await bot.handleUpdate(callbackUpdate(noCallback ?? "", 202));

    expect(leaveForTelegramUser).not.toHaveBeenCalled();
    expect(getHubForTelegramUser).toHaveBeenCalledTimes(1);
    expect(String(edits[1]?.text)).toContain("Ви лишилися в ґільдії");

    await bot.handleUpdate(callbackUpdate(makeGuildLeaveOpenCallbackData(7), 203));
    const yesCallback = confirmationCallbacks(edits[2])
      .find((button) => button.text.startsWith("✅"))?.callback_data;
    expect(parseGuildCallbackData(yesCallback)).toEqual({ ok: true, value: { type: "leave-confirm", version: 7 } });

    await bot.handleUpdate(callbackUpdate(yesCallback ?? "", 204));

    expect(leaveForTelegramUser).toHaveBeenCalledTimes(1);
    expect(leaveForTelegramUser).toHaveBeenCalledWith(42n, 7);
    expect(String(edits[3]?.text)).toContain("Ви вийшли з <b>Нічна</b>");
  });

  it("requires an explicit yes before disbanding a one-member guild", async () => {
    const bot = new Bot("test-token", {
      botInfo: { id: 123, is_bot: true, first_name: "Квестарня", username: "kvestarnia_bot" }
    });
    const deleteForTelegramUser = vi.fn().mockResolvedValue({ state: "deleted", guildName: "Нічна" });
    const getHubForTelegramUser = vi.fn().mockResolvedValue(readySoloLeaderGuildHub());
    const edits: Array<Record<string, unknown>> = [];
    bot.api.config.use((_prev, method, payload) => {
      if (method === "editMessageText") edits.push(payload);
      return Promise.resolve(method === "answerCallbackQuery"
        ? { ok: true, result: true }
        : { ok: true, result: { message_id: 13 } });
    });
    registerSocialBotModule(bot, {
      services: { guilds: guildService({ getHubForTelegramUser, deleteForTelegramUser }) },
      options: {}
    } as unknown as BotModuleDependencies);

    await bot.handleUpdate(callbackUpdate(makeGuildDeleteOpenCallbackData(7), 205));

    expect(deleteForTelegramUser).not.toHaveBeenCalled();
    expect(confirmationCallbacks(edits[0]).map((button) => button.text)).toEqual([
      "✅ Так, розпустити",
      "❌ Ні, не розпускати"
    ]);
    const noCallback = confirmationCallbacks(edits[0])
      .find((button) => button.text.startsWith("❌"))?.callback_data;
    expect(parseGuildCallbackData(noCallback)).toEqual({ ok: true, value: { type: "delete-cancel" } });

    await bot.handleUpdate(callbackUpdate(noCallback ?? "", 206));

    expect(deleteForTelegramUser).not.toHaveBeenCalled();
    expect(getHubForTelegramUser).toHaveBeenCalledTimes(1);
    expect(String(edits[1]?.text)).toContain("Ґільдію не розпущено");

    await bot.handleUpdate(callbackUpdate(makeGuildDeleteOpenCallbackData(7), 207));
    const yesCallback = confirmationCallbacks(edits[2])
      .find((button) => button.text.startsWith("✅"))?.callback_data;
    expect(parseGuildCallbackData(yesCallback)).toEqual({ ok: true, value: { type: "delete-confirm", version: 7 } });

    await bot.handleUpdate(callbackUpdate(yesCallback ?? "", 208));

    expect(deleteForTelegramUser).toHaveBeenCalledTimes(1);
    expect(deleteForTelegramUser).toHaveBeenCalledWith(42n, 7);
    expect(String(edits[3]?.text)).toContain("<b>Нічна</b> розпущено");
  });

  it.each([
    ["v1:g:l:7", "leave" as const],
    ["v1:g:z:7", "delete" as const]
  ])("treats literal deployed legacy callback %s as read-only intent", async (literal, action) => {
    const bot = new Bot("test-token", {
      botInfo: { id: 123, is_bot: true, first_name: "Квестарня", username: "kvestarnia_bot" }
    });
    const leaveForTelegramUser = vi.fn();
    const deleteForTelegramUser = vi.fn();
    const edits: Array<Record<string, unknown>> = [];
    bot.api.config.use((_prev, method, payload) => {
      if (method === "editMessageText") edits.push(payload);
      return Promise.resolve(method === "answerCallbackQuery"
        ? { ok: true, result: true }
        : { ok: true, result: { message_id: 13 } });
    });
    registerSocialBotModule(bot, {
      services: {
        guilds: guildService({
          getHubForTelegramUser: vi.fn().mockResolvedValue(
            action === "leave" ? readyGuildHub() : readySoloLeaderGuildHub()
          ),
          leaveForTelegramUser,
          deleteForTelegramUser
        })
      },
      options: {}
    } as unknown as BotModuleDependencies);

    await bot.handleUpdate(callbackUpdate(literal, action === "leave" ? 209 : 210));

    expect(leaveForTelegramUser).not.toHaveBeenCalled();
    expect(deleteForTelegramUser).not.toHaveBeenCalled();
    expect(String(edits[0]?.text)).toContain(action === "leave"
      ? "Підтвердити вихід із ґільдії?"
      : "Підтвердити розпуск ґільдії?");
    const affirmative = confirmationCallbacks(edits[0]).find((button) => button.text.startsWith("✅"))?.callback_data;
    expect(affirmative).toBe(action === "leave" ? "v1:g:ly:7" : "v1:g:zy:7");
  });
});

function guildService(overrides: Partial<GuildService>): GuildService {
  return {
    isEnabled: () => true,
    areDevHelpersEnabled: () => false,
    getCrestPickerForTelegramUser: vi.fn().mockImplementation((_actor, purpose) => Promise.resolve({
      state: "ready",
      availableCrests: [...GUILD_CREST_CATALOG],
      currentCrest: purpose === "profile" ? "🛡️" : null,
      currentHasCustomCrest: false,
      guildVersion: purpose === "profile" ? 7 : null
    })),
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

function replyUpdate(
  text: string,
  promptText: string,
  updateId: number,
  entities?: Array<{ offset: number; length: number; type: "url" | "text_link"; url?: string }>
) {
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: 1,
      chat: { id: 42, type: "private" },
      from: { id: 42, is_bot: false, first_name: "Тест" },
      text,
      ...(entities ? { entities } : {}),
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

function mediaReplyUpdate(promptText: string, media: Record<string, unknown>, updateId: number) {
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: 1,
      chat: { id: 42, type: "private" as const },
      from: { id: 42, is_bot: false, first_name: "Тест" },
      ...media,
      reply_to_message: {
        message_id: updateId - 1,
        date: 1,
        chat: { id: 42, type: "private" as const },
        from: { id: 123, is_bot: true, first_name: "Квестарня", username: "kvestarnia_bot" },
        text: promptText
      }
    }
  };
}

function photoReplyUpdate(
  promptText: string,
  photo: Array<{ file_id: string; file_unique_id: string; width: number; height: number; file_size?: number }>,
  updateId: number
) {
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: 1,
      chat: { id: 42, type: "private" as const },
      from: { id: 42, is_bot: false, first_name: "Тест" },
      photo,
      reply_to_message: {
        message_id: updateId - 1,
        date: 1,
        chat: { id: 42, type: "private" as const },
        from: { id: 123, is_bot: true, first_name: "Квестарня", username: "kvestarnia_bot" },
        text: promptText
      }
    }
  };
}

function arbitraryPhotoUpdate(updateId: number) {
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: 1,
      chat: { id: 42, type: "private" as const },
      from: { id: 42, is_bot: false, first_name: "Тест" },
      photo: [{ file_id: "ordinary-photo", file_unique_id: "ordinary-unique", width: 512, height: 512 }]
    }
  };
}

function callbackUpdate(data: string, updateId = 93) {
  return {
    update_id: updateId,
    callback_query: {
      id: `callback-${updateId}`,
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

function readyGuildHub() {
  return {
    state: "ready" as const,
    guild: {
      id: "guild-night",
      displayName: "Нічна",
      normalizedName: "нічна",
      crest: "🦉",
      description: "Тихо, поки ніхто не дивиться.",
      status: "active" as const,
      charterExpiresAt: null,
      version: 7,
      viewerRole: "member" as const,
      memberCount: 2,
      members: [
        { id: "member-leader", name: "Голова", role: "leader" as const },
        { id: "member-viewer", name: "Тест", role: "member" as const }
      ],
      outgoingInvites: [],
      page: 0,
      hasPreviousPage: false,
      hasNextPage: false,
      leadershipNomineeName: null,
      viewerIsLeadershipNominee: false
    },
    incomingInvites: []
  };
}

function readySoloLeaderGuildHub() {
  const hub = readyGuildHub();
  return {
    ...hub,
    guild: {
      ...hub.guild,
      viewerRole: "leader" as const,
      memberCount: 1,
      members: [{ id: "member-leader", name: "Тест", role: "leader" as const }]
    }
  };
}

function confirmationCallbacks(payload: Record<string, unknown> | undefined): Array<{
  text: string;
  callback_data?: string;
}> {
  const markup = payload?.reply_markup as {
    inline_keyboard?: Array<Array<{ text: string; callback_data?: string }>>;
  } | undefined;
  return markup?.inline_keyboard?.flat() ?? [];
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
