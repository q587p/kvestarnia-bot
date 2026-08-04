import { Bot, type Api, type Context } from "grammy";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  handleGroupCombatCallback,
  presentGroupCombatStartFailure,
  presentLeftPassageInviteFailure,
  registerGroupCombatDevCommand,
  registerGroupCombatReplyKeyboard
} from "../../src/bot/commands/groupCombatCommand";
import { deliverGroupCombatCards } from "../../src/bot/groupCombatCardDelivery";
import {
  clearMessageFreshnessTracking,
  rememberLatestMessageForChat
} from "../../src/bot/messageFreshness";
import type { GroupCombatSessionRecord } from "../../src/db/repositories/groupCombatRepository";
import type { PartySessionRecord } from "../../src/db/repositories/partySessionRepository";
import type { GroupCombatService } from "../../src/services/groupCombatService";
import { registerSocialBotModule } from "../../src/bot/modules/social";
import type { BotServices } from "../../src/bot/botServices";
import { registerCombatLockMiddleware } from "../../src/bot/middleware/registerCombatLockMiddleware";
import {
  buildGroupCombatActionMenuKeyboard,
  buildGroupCombatKeyboard
} from "../../src/bot/keyboards/groupCombatKeyboard";

async function waitForCondition(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 93; attempt += 1) {
    if (condition()) {
      return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Timed out waiting for deferred GroupCombat delivery.");
}

describe("group combat bot flow", () => {
  afterEach(() => {
    clearMessageFreshnessTracking();
  });

  it("shows canonical remaining search time on left-passage create and start blockers", () => {
    const availableAt = new Date("2026-07-24T10:03:00.000Z");
    const now = new Date("2026-07-24T10:00:00.000Z");

    expect(presentLeftPassageInviteFailure({
      state: "active-search",
      availableAt,
      now
    })).toContain("3 хвилини");
    expect(presentGroupCombatStartFailure({
      state: "active-search",
      availableAt,
      now
    })).toContain("3 хвилини");
    expect(presentGroupCombatStartFailure({ state: "invalid-size" })).toContain(
      "Поточний склад ватаги не підходить"
    );
  });

  it("explains every left-passage reservation blocker instead of using an opaque fallback", () => {
    expect(presentLeftPassageInviteFailure({ state: "invalid-preview" })).toContain(
      "Відкрийте лівий прохід ще раз"
    );
    expect(presentLeftPassageInviteFailure({ state: "active-adventure" })).toContain(
      "завершіть поточну пригоду"
    );
    expect(presentLeftPassageInviteFailure({ state: "active-raid" })).toContain(
      "завершіть поточний рейд"
    );
    expect(presentLeftPassageInviteFailure({ state: "active-combat" })).toContain(
      "завершіть поточний бій"
    );
    expect(presentLeftPassageInviteFailure({ state: "reservation-conflict" })).toContain(
      "Стан цього сліду вже змінився"
    );
    const invalidResources = presentLeftPassageInviteFailure({
      state: "invalid-resources",
      resources: { hpCurrent: 13, hpMax: 0, manaCurrent: 5, manaMax: 5 }
    });
    expect(invalidResources).toContain("Відкрийте персонажа");
    expect(invalidResources).not.toMatch(/\/dev_heal|\/dev_restore_mana/u);
  });

  it("keeps production left-passage start failures free of proof and dev-only help", async () => {
    const startLeftPassage = vi.fn().mockResolvedValue({ state: "not-found" });
    const answerCallbackQuery = vi.fn().mockResolvedValue(true);
    const ctx = {
      from: { id: 1001, is_bot: false, first_name: "Лідерка" },
      chat: { id: 1001, type: "private" },
      callbackQuery: { id: "callback-missing-left-start", data: "unused" },
      answerCallbackQuery
    } as unknown as Context;

    await handleGroupCombatCallback(
      ctx,
      { type: "start-left", token: "missing-left-13" },
      { startLeftPassage } as unknown as GroupCombatService
    );

    const answer = callbackAnswerText(answerCallbackQuery);
    expect(answer).toContain("Цей збір у лівому проході вже не знайдено");
    expect(answer).not.toMatch(/\/dev_party|\/dev_heal|\/dev_restore_mana|доказов/u);
    expect(startLeftPassage).toHaveBeenCalledWith(1001n, "missing-left-13");
  });

  it("refreshes a stale left-passage invite card without a false changed-occasion alert", async () => {
    const answerCallbackQuery = vi.fn().mockResolvedValue(true);
    const refreshLeftPassagePreview = vi.fn().mockResolvedValue(undefined);
    const ctx = {
      from: { id: 1001, is_bot: false, first_name: "Лідерка" },
      chat: { id: 1001, type: "private" },
      callbackQuery: {
        id: "callback-stale-preview",
        message: { message_id: 21, date: 1, chat: { id: 1001, type: "private" } }
      },
      answerCallbackQuery
    } as unknown as Context;

    await handleGroupCombatCallback(
      ctx,
      { type: "invite-left", token: "stale-preview" },
      {
        createLeftPassageParty: vi.fn().mockResolvedValue({ state: "invalid-preview" })
      } as unknown as GroupCombatService,
      { refreshLeftPassagePreview }
    );

    expect(answerCallbackQuery).toHaveBeenCalledWith({
      text: "Ця кнопка вже не веде до збору ватаги. Оновив доступні дії."
    });
    expect(refreshLeftPassagePreview).toHaveBeenCalledWith(ctx);
  });

  it("keeps a production left-passage invite failure free of dev-only recovery commands", async () => {
    const answerCallbackQuery = vi.fn().mockResolvedValue(true);
    const ctx = {
      from: { id: 1001, is_bot: false, first_name: "Лідерка" },
      chat: { id: 1001, type: "private" },
      callbackQuery: {
        id: "callback-invalid-left-resources",
        message: { message_id: 21, date: 1, chat: { id: 1001, type: "private" } }
      },
      answerCallbackQuery
    } as unknown as Context;

    await handleGroupCombatCallback(
      ctx,
      { type: "invite-left", token: "invalid-resources-13" },
      {
        createLeftPassageParty: vi.fn().mockResolvedValue({
          state: "invalid-resources",
          resources: { hpCurrent: 13, hpMax: 0, manaCurrent: 5, manaMax: 5 }
        })
      } as unknown as GroupCombatService
    );

    const answer = callbackAnswerText(answerCallbackQuery);
    expect(answer).toContain("Відкрийте персонажа");
    expect(answer).not.toMatch(/\/dev_party|\/dev_heal|\/dev_restore_mana/u);
  });

  it("cannot mutate through a dev command when the production gate is closed", async () => {
    const bot = testBot();
    const startProof = vi.fn();
    const resolveDevTimeout = vi.fn();
    registerGroupCombatDevCommand(bot, {
      areDevHelpersEnabled: () => false,
      startProof,
      resolveDevTimeout
    } as unknown as GroupCombatService);

    await bot.handleUpdate(commandUpdate("/dev_group_combat proof-token-13"));
    await bot.handleUpdate(commandUpdate("/dev_group_combat_timeout proof-token-13"));
    expect(startProof).not.toHaveBeenCalled();
    expect(resolveDevTimeout).not.toHaveBeenCalled();
  });

  it("runs the narrow timeout helper only through the non-production group-combat gate", async () => {
    const bot = testBot();
    const resolveDevTimeout = vi.fn().mockResolvedValue({ state: "not-found" });
    registerGroupCombatDevCommand(bot, {
      areDevHelpersEnabled: () => true,
      resolveDevTimeout
    } as unknown as GroupCombatService);
    const replies: string[] = [];
    bot.api.config.use((_prev, method, payload) => {
      if (method === "sendMessage") {
        replies.push(String(payload.text));
      }
      return Promise.resolve({ ok: true, result: { message_id: replies.length } });
    });

    await bot.handleUpdate(commandUpdate("/dev_group_combat_timeout proof-token-13"));
    expect(resolveDevTimeout).toHaveBeenCalledWith("proof-token-13");
    expect(replies).toEqual(["Живої гуртової сутички з таким кодом не знайдено."]);
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
        "За три хвилини сутичка почнеться сама. Ватажок може запустити її раніше: /dev_group_combat КОД"
      ].join("\n"),
      [
        "Живої ватаги з таким кодом не знайдено.",
        "",
        "🧭 Код ватаги створює команда /dev_party.",
        "У картці збору скопіюйте з посилання лише частину після «party_».",
        "За три хвилини сутичка почнеться сама. Ватажок може запустити її раніше: /dev_group_combat КОД"
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

  it("routes a reply-menu action through combat-lock middleware and the social module exactly once", async () => {
    const bot = testBot();
    const session = makeSession();
    const submitAction = vi.fn().mockResolvedValue({ state: "queued", session });
    const service = {
      isEnabled: () => true,
      areDevHelpersEnabled: () => false,
      findByToken: vi.fn().mockResolvedValue(session),
      findById: vi.fn().mockResolvedValue(session),
      submitAction,
      markParticipantCardDelivered: vi.fn().mockResolvedValue(true),
      finalizeDeliveryAttempt: vi.fn().mockResolvedValue(true)
    } as unknown as GroupCombatService;
    const services = { groupCombat: service } as unknown as BotServices;
    const callbackData = buildGroupCombatActionMenuKeyboard(
      session,
      "character-1",
      "attack"
    ).inline_keyboard
      .flat()
      .find((button) => "callback_data" in button && button.callback_data.startsWith("v3:gc:a:"));

    expect(callbackData).toBeDefined();
    bot.api.config.use((_prev, method) => Promise.resolve({
      ok: true,
      result: method === "sendMessage"
        ? { message_id: 31, date: 1, chat: { id: 1001, type: "private" } }
        : true
    }));
    registerCombatLockMiddleware(bot, services);
    registerSocialBotModule(bot, { services, options: {} });

    const update = callbackUpdate(callbackData && "callback_data" in callbackData
      ? callbackData.callback_data
      : "");
    update.callback_query.message.message_id = 21;
    await bot.handleUpdate(update);

    expect(submitAction).toHaveBeenCalledTimes(1);
    expect(submitAction).toHaveBeenCalledWith({
      telegramUserId: 1001n,
      partyInviteToken: session.partyInviteToken,
      turn: 1,
      action: "attack",
      targetKind: "enemy",
      targetId: "enemy-1"
    });
  });

  it("routes inline v5 target-menu and Back through combat lock and social exactly once without mutation", async () => {
    const bot = testBot();
    const session = makeSession();
    const original = structuredClone(session);
    const submitAction = vi.fn();
    const service = {
      isEnabled: () => true,
      areDevHelpersEnabled: () => false,
      findByToken: vi.fn().mockResolvedValue(session),
      findById: vi.fn().mockResolvedValue(session),
      submitAction
    } as unknown as GroupCombatService;
    const services = { groupCombat: service } as unknown as BotServices;
    const edits: Record<string, unknown>[] = [];
    const callbackAnswers: Record<string, unknown>[] = [];
    bot.api.config.use((_prev, method, payload) => {
      if (method === "editMessageText") {
        edits.push(payload);
      }
      if (method === "answerCallbackQuery") {
        callbackAnswers.push(payload);
      }
      return Promise.resolve({ ok: true, result: true });
    });
    registerCombatLockMiddleware(bot, services);
    registerSocialBotModule(bot, { services, options: {} });

    const targetMenu = inlineKeyboardCallbacks(buildGroupCombatKeyboard(session, "character-1"))
      .find((data) => data.startsWith("v5:gc:q:"));
    expect(targetMenu).toBeDefined();
    const targetUpdate = callbackUpdate(targetMenu ?? "");
    targetUpdate.callback_query.message.message_id = 21;
    await bot.handleUpdate(targetUpdate);

    expect(edits).toHaveLength(1);
    expect(edits[0]?.["text"]).toContain("Оберіть ціль для атаки");
    const back = inlineKeyboardCallbacks(edits[0]?.["reply_markup"])
      .find((data) => data.startsWith("v5:gc:b:"));
    expect(back).toBeDefined();

    const backUpdate = callbackUpdate(back ?? "");
    backUpdate.update_id = 3;
    backUpdate.callback_query.id = "callback-3";
    backUpdate.callback_query.message.message_id = 21;
    await bot.handleUpdate(backUpdate);

    expect(edits).toHaveLength(2);
    expect(edits[1]?.["reply_markup"]).toEqual(buildGroupCombatKeyboard(session, "character-1"));
    expect(submitAction).not.toHaveBeenCalled();
    expect(session).toEqual(original);
  });

  it("renders a newly created left-passage party with its origin-aware deep link", async () => {
    const bot = testBot();
    const session = makeLeftPassagePartySession();
    const createLeftPassageParty = vi.fn().mockResolvedValue({ state: "created", session });
    const service = {
      isEnabled: () => true,
      areDevHelpersEnabled: () => false,
      createLeftPassageParty
    } as unknown as GroupCombatService;
    const services = { groupCombat: service } as unknown as BotServices;
    const edits: Record<string, unknown>[] = [];
    const callbackAnswers: Record<string, unknown>[] = [];
    bot.api.config.use((_prev, method, payload) => {
      if (method === "editMessageText") {
        edits.push(payload);
      }
      if (method === "answerCallbackQuery") {
        callbackAnswers.push(payload);
      }
      return Promise.resolve({ ok: true, result: true });
    });
    registerCombatLockMiddleware(bot, services);
    registerSocialBotModule(bot, { services, options: {} });

    const update = callbackUpdate("v3:gc:i:left-preview-13");
    update.callback_query.message.message_id = 21;
    await bot.handleUpdate(update);

    expect(createLeftPassageParty).toHaveBeenCalledOnce();
    expect(callbackAnswers).toHaveLength(1);
    expect(callbackAnswers[0]?.["text"]).toBe("Ватагу відкрито.");
    expect(JSON.stringify(edits)).toContain("nyz_left_attack_leftToken13");
    expect(JSON.stringify(edits)).not.toContain("start=party_leftToken13");
  });

  it("submits an attack directly when one enemy remains", async () => {
    const bot = testBot();
    const session = makeSession();
    session.state.enemies[1]!.hp = 0;
    const delivery = cardDeliveryHarness(session);
    const sentTexts: string[] = [];
    const submitAction = vi.fn().mockResolvedValue({ state: "action-unavailable" });
    const service = {
      findActiveForTelegramUser: vi.fn().mockResolvedValue(session),
      findByToken: vi.fn().mockResolvedValue(session),
      findById: vi.fn().mockResolvedValue(session),
      submitAction,
      compareAndSetParticipantCard: delivery.compareAndSetParticipantCard,
      markParticipantCardDelivered: delivery.markParticipantCardDelivered,
      finalizeDeliveryAttempt: vi.fn().mockResolvedValue(true)
    } as unknown as GroupCombatService;
    bot.api.config.use((_prev, method, payload) => {
      if (method === "sendMessage") {
        sentTexts.push(String(payload.text));
      }
      return Promise.resolve({
        ok: true,
        result: method === "sendMessage"
          ? { message_id: 31, date: 1, chat: { id: 1001, type: "private" } }
          : true
      });
    });
    registerGroupCombatReplyKeyboard(bot, service);

    await bot.handleUpdate(textUpdate("⚔️ Атакувати"));

    expect(submitAction).toHaveBeenCalledWith({
      telegramUserId: 1001n,
      partyInviteToken: session.partyInviteToken,
      turn: 1,
      action: "attack",
      targetKind: "enemy",
      targetId: "enemy-1"
    });
    expect(sentTexts).toHaveLength(1);
    expect(sentTexts[0]).not.toContain("Оберіть ціль для атаки");
  });

  it("durably requests refresh before publishing one fresh card with the reply keyboard", async () => {
    const bot = testBot();
    const session = makeSession();
    const delivery = cardDeliveryHarness(session);
    const order: string[] = [];
    const requestParticipantUiRefresh = vi.fn(() => {
      order.push("request");
      session.deliveryPending = true;
      session.participants[0]!.replyKeyboardFingerprint = null;
      return Promise.resolve(true);
    });
    const service = {
      findActiveForTelegramUser: vi.fn().mockResolvedValue(session),
      findById: vi.fn().mockResolvedValue(session),
      requestParticipantUiRefresh,
      compareAndSetParticipantCard: delivery.compareAndSetParticipantCard,
      markParticipantCardDelivered: delivery.markParticipantCardDelivered
    } as unknown as GroupCombatService;
    const sentInlineKeyboards: string[][] = [];
    bot.api.config.use((_prev, method, payload) => {
      if (method === "sendMessage") {
        order.push("send");
        sentInlineKeyboards.push(inlineKeyboardLabels(payload.reply_markup));
      }
      return Promise.resolve({
        ok: true,
        result: method === "sendMessage"
          ? { message_id: 31, date: 1, chat: { id: 1001, type: "private" } }
          : true
      });
    });
    registerGroupCombatReplyKeyboard(bot, service);

    await bot.handleUpdate(textUpdate("🔎 Оновити"));

    expect(requestParticipantUiRefresh).toHaveBeenCalledWith({
      sessionId: session.id,
      telegramUserId: 1001n
    });
    expect(order[0]).toBe("request");
    expect(order.filter((entry) => entry === "send")).toHaveLength(1);
    expect(sentInlineKeyboards).toHaveLength(1);
    expect(sentInlineKeyboards[0]).toContain("🔎 Оновити");
    expect(sentInlineKeyboards[0]).toContain("🗡️ Вдарити");
    expect(session.participants[0]).toMatchObject({
      chatId: 1001n,
      messageId: 31,
      deliveredRevision: session.deliveryRevision
    });
  });

  it("submits a concrete single-target ability directly when one target remains", async () => {
    const bot = testBot();
    const session = makeSession();
    session.state.participants[0]!.classId = "class.warrior";
    session.state.participants[0]!.raceId = "race.dwarf";
    session.state.enemies[1]!.hp = 0;
    const delivery = cardDeliveryHarness(session);
    const submitAction = vi.fn().mockResolvedValue({ state: "stale" });
    const service = {
      findActiveForTelegramUser: vi.fn().mockResolvedValue(session),
      findByToken: vi.fn().mockResolvedValue(session),
      findById: vi.fn().mockResolvedValue(session),
      submitAction,
      compareAndSetParticipantCard: delivery.compareAndSetParticipantCard,
      markParticipantCardDelivered: delivery.markParticipantCardDelivered,
      finalizeDeliveryAttempt: vi.fn().mockResolvedValue(true)
    } as unknown as GroupCombatService;
    bot.api.config.use((_prev, method) => Promise.resolve({
      ok: true,
      result: method === "sendMessage"
        ? { message_id: 31, date: 1, chat: { id: 1001, type: "private" } }
        : true
    }));
    registerGroupCombatReplyKeyboard(bot, service);

    await bot.handleUpdate(textUpdate("🪓 Силовий замах"));

    expect(submitAction).toHaveBeenCalledWith({
      telegramUserId: 1001n,
      partyInviteToken: session.partyInviteToken,
      turn: 1,
      action: "class",
      targetKind: "enemy",
      targetId: "enemy-1"
    });
  });

  it("keeps repeated target-picker openings read-only", async () => {
    const bot = testBot();
    const session = makeSession();
    const actor = session.state.participants[0]!;
    actor.classId = "class.warrior";
    actor.raceId = "race.dwarf";
    const delivery = cardDeliveryHarness(session);
    const sentTexts: string[] = [];
    const inlineKeyboards: string[][] = [];
    const submitAction = vi.fn()
      .mockImplementationOnce(() => {
        actor.cooldowns = {
          abilities: {
            "skill.forceful-strike": {
              id: "skill.forceful-strike",
              remainingTurns: 2
            }
          }
        };
        return Promise.resolve({ state: "queued", session });
      })
      .mockResolvedValueOnce({ state: "action-unavailable" });
    const service = {
      findActiveForTelegramUser: vi.fn().mockResolvedValue(session),
      findByToken: vi.fn().mockResolvedValue(session),
      findById: vi.fn().mockResolvedValue(session),
      submitAction,
      compareAndSetParticipantCard: delivery.compareAndSetParticipantCard,
      markParticipantCardDelivered: delivery.markParticipantCardDelivered,
      finalizeDeliveryAttempt: vi.fn().mockResolvedValue(true)
    } as unknown as GroupCombatService;
    bot.api.config.use((_prev, method, payload) => {
      if (method === "sendMessage") {
        sentTexts.push(String(payload.text));
        const labels = inlineKeyboardLabels(payload.reply_markup);
        if (labels.length > 0) {
          inlineKeyboards.push(labels);
        }
      }
      return Promise.resolve({
        ok: true,
        result: method === "sendMessage"
          ? {
              message_id: sentTexts.length + 30,
              date: 1,
              chat: { id: 1001, type: "private" }
            }
          : true
      });
    });
    registerGroupCombatReplyKeyboard(bot, service);

    await bot.handleUpdate(textUpdate("🪓 Силовий замах"));
    const sendsAfterFirstPress = sentTexts.length;
    await bot.handleUpdate({ ...textUpdate("🪓 Силовий замах"), update_id: 2 });

    expect(submitAction).not.toHaveBeenCalled();
    expect(sentTexts.slice(sendsAfterFirstPress)).toHaveLength(1);
    expect(sentTexts.at(-1)).toContain("Оберіть ціль для «🪓 Силовий замах»");
    expect(inlineKeyboards.at(-1)).toContain("Шурхіт");
    expect(inlineKeyboards.at(-1)).toContain("↩️ До дій");
  });

  it("delegates a stale GroupCombat reply label when no matching group fight remains", async () => {
    const bot = testBot();
    const sentTexts: string[] = [];
    const service = {
      findActiveForTelegramUser: vi.fn().mockResolvedValue(null)
    } as unknown as GroupCombatService;
    bot.api.config.use((_prev, method, payload) => {
      if (method === "sendMessage") {
        sentTexts.push(String(payload.text));
      }
      return Promise.resolve({
        ok: true,
        result: method === "sendMessage"
          ? { message_id: 31, date: 1, chat: { id: 1001, type: "private" } }
          : true
      });
    });
    registerGroupCombatReplyKeyboard(bot, service);
    bot.on("message:text", async (ctx) => {
      await ctx.reply("⚔️ Новіший бій лишається канонічним.", {
        reply_markup: {
          keyboard: [[{ text: "⚔️ Дія нового бою" }]],
          resize_keyboard: true
        }
      });
    });

    await bot.handleUpdate(textUpdate("🗡️ Вдарити"));

    expect(sentTexts).toEqual(["⚔️ Новіший бій лишається канонічним."]);
  });

  it("submits an individual flee attempt from the compact battle reply keyboard", async () => {
    const bot = testBot();
    const session = makeSession();
    const delivery = cardDeliveryHarness(session);
    const sentTexts: string[] = [];
    const submitAction = vi.fn().mockResolvedValue({ state: "queued", session });
    const service = {
      findActiveForTelegramUser: vi.fn().mockResolvedValue(session),
      findById: vi.fn().mockResolvedValue(session),
      submitAction,
      compareAndSetParticipantCard: delivery.compareAndSetParticipantCard,
      markParticipantCardDelivered: delivery.markParticipantCardDelivered,
      finalizeDeliveryAttempt: vi.fn().mockResolvedValue(true)
    } as unknown as GroupCombatService;
    bot.api.config.use((_prev, method, payload) => {
      if (method === "sendMessage") {
        sentTexts.push(String(payload.text));
      }
      return Promise.resolve({
        ok: true,
        result: method === "sendMessage"
          ? { message_id: 31, date: 1, chat: { id: 1001, type: "private" } }
          : true
      });
    });
    registerGroupCombatReplyKeyboard(bot, service);

    await bot.handleUpdate(textUpdate("🏃 Відступити"));

    expect(submitAction).toHaveBeenCalledWith({
      telegramUserId: 1001n,
      partyInviteToken: session.partyInviteToken,
      turn: 1,
      action: "flee",
      targetKind: "self",
      targetId: "character-1"
    });
    expect(sentTexts).toHaveLength(1);
    expect(sentTexts.at(-1)).toContain("<b>Бій</b>:");
    expect(session.participants[0]).toMatchObject({
      messageId: 31,
      deliveredRevision: session.deliveryRevision
    });
  });

  it("starts the proof from the leader party card and delivers canonical private cards", async () => {
    const session = makeSession({ deliveredRevision: 0 });
    const startProof = vi.fn().mockResolvedValue({ state: "started", session });
    const delivery = cardDeliveryHarness(session);
    const answerCallbackQuery = vi.fn().mockResolvedValue(true);
    const ctx = {
      from: { id: 1001, is_bot: false, first_name: "Лідерка" },
      chat: { id: 1001, type: "private" },
      callbackQuery: {
        id: "callback-party-group-start",
        data: "unused",
        message: { message_id: 21, date: 1, chat: { id: 1001, type: "private" } }
      },
      api: delivery.api,
      answerCallbackQuery
    } as unknown as Context;

    await handleGroupCombatCallback(
      ctx,
      { type: "start", token: session.partyInviteToken },
      {
        startProof,
        findById: vi.fn().mockResolvedValue(session),
        compareAndSetParticipantCard: delivery.compareAndSetParticipantCard,
        markParticipantCardDelivered: delivery.markParticipantCardDelivered,
        finalizeDeliveryAttempt: vi.fn().mockResolvedValue(true)
      } as unknown as GroupCombatService
    );

    expect(startProof).toHaveBeenCalledWith(1001n, session.partyInviteToken);
    expect(answerCallbackQuery).toHaveBeenCalledWith({ text: "Доказову сутичку запущено." });
    expect(delivery.editMessageText).toHaveBeenCalledWith(
      1001,
      21,
      expect.any(String),
      expect.any(Object)
    );
    await waitForCondition(() => delivery.editMessageText.mock.calls.some(
      (call) => Number(call[0]) === 1002
    ));
    expect(delivery.editMessageText).toHaveBeenCalledWith(
      1002,
      22,
      expect.any(String),
      expect.any(Object)
    );
  });

  it("sends a separate intro before each production left-passage combat card", async () => {
    const session = makeSession({ deliveredRevision: 0 });
    session.state.rulesVersion = "group-combat.v3";
    session.state.encounterKey = "nyz-left-passage-party.v1";
    const startLeftPassage = vi.fn().mockResolvedValue({ state: "started", session });
    const editMessageText = vi.fn().mockResolvedValue(true);
    let nextMessageId = 93;
    const sendMessage = vi.fn().mockImplementation(() =>
      Promise.resolve({ message_id: nextMessageId++ })
    );
    const answerCallbackQuery = vi.fn().mockResolvedValue(true);
    let releaseAlly!: () => void;
    const allyGate = new Promise<void>((resolve) => {
      releaseAlly = resolve;
    });
    const releaseParticipantCard = vi.fn(async (input: {
      telegramUserId: bigint;
      expectedReferenceVersion: number;
    }) => {
      if (input.telegramUserId === 1002n) {
        await allyGate;
      }
      const participant = session.participants.find(
        (candidate) => candidate.telegramUserId === input.telegramUserId
      );
      if (!participant || participant.referenceVersion !== input.expectedReferenceVersion) {
        return false;
      }
      participant.chatId = null;
      participant.messageId = null;
      participant.referenceVersion += 1;
      return true;
    });
    const compareAndSetParticipantCard = vi.fn((input: {
      telegramUserId: bigint;
      expectedReferenceVersion: number;
      chatId: bigint;
      messageId: number;
    }) => {
      const participant = session.participants.find(
        (candidate) => candidate.telegramUserId === input.telegramUserId
      );
      if (!participant || participant.referenceVersion !== input.expectedReferenceVersion) {
        return Promise.resolve(false);
      }
      participant.chatId = input.chatId;
      participant.messageId = input.messageId;
      participant.referenceVersion += 1;
      return Promise.resolve(true);
    });
    const ctx = {
      from: { id: 1001, is_bot: false, first_name: "Лідерка" },
      chat: { id: 1001, type: "private" },
      callbackQuery: {
        id: "callback-party-left-start",
        data: "unused",
        message: { message_id: 21, date: 1, chat: { id: 1001, type: "private" } }
      },
      api: { editMessageText, sendMessage, deleteMessage: vi.fn() } as unknown as Api,
      answerCallbackQuery
    } as unknown as Context;

    await handleGroupCombatCallback(
      ctx,
      { type: "start-left", token: session.partyInviteToken },
      {
        startLeftPassage,
        findById: vi.fn().mockResolvedValue(session),
        releaseParticipantCard,
        compareAndSetParticipantCard,
        markParticipantCardDelivered: vi.fn().mockResolvedValue(true),
        finalizeDeliveryAttempt: vi.fn().mockResolvedValue(true)
      } as unknown as GroupCombatService
    );

    expect(answerCallbackQuery).toHaveBeenCalledWith({ text: "Ватага рушила в атаку." });
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage.mock.calls.map((call) => Number(call[0]))).toEqual([1001, 1001]);
    releaseAlly();
    await waitForCondition(() => sendMessage.mock.calls.length === 4);
    expect(sendMessage.mock.calls.map((call) => Number(call[0]))).toEqual([
      1001,
      1001,
      1002,
      1002
    ]);
    for (const chatId of [1001, 1002]) {
      const participantCalls = sendMessage.mock.calls.filter((call) => call[0] === chatId);
      expect(participantCalls).toHaveLength(2);
      expect(String(participantCalls[0]?.[1])).toContain(
        "Бій починається. Корчма відкриває журнал ходів"
      );
      expect(Boolean(
        (participantCalls[0]?.[2] as { reply_markup?: { keyboard?: unknown } })
          ?.reply_markup?.keyboard
      )).toBe(true);
      expect(String(participantCalls[1]?.[1])).toContain("<b>Бій</b>:");
      expect(inlineKeyboardLabels(
        (participantCalls[1]?.[2] as { reply_markup?: unknown })?.reply_markup
      ).length).toBeGreaterThan(0);
    }
    expect(editMessageText).toHaveBeenCalledTimes(4);
    const editedTexts = editMessageText.mock.calls.map((call) => String(call[2]));
    expect(editedTexts.filter((text) => text.includes("Бій починається. Корчма відкриває журнал ходів"))).toHaveLength(0);
    expect(editedTexts.filter((text) =>
      text === "♻️ Цю бойову картку замінено актуальною нижче."
    )).toHaveLength(2);
    expect(editedTexts.filter((text) => text.includes("⚔️ <b>Бій</b>:"))).toHaveLength(2);
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
    const delivery = cardDeliveryHarness(session);
    const answerCallbackQuery = vi.fn().mockResolvedValue(true);
    const ctx = {
      from: { id: 1001, is_bot: false, first_name: "Лідерка" },
      chat: { id: 1001, type: "private" },
      callbackQuery: { id: "callback-1", data: "unused" },
      api: delivery.api,
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
      compareAndSetParticipantCard: delivery.compareAndSetParticipantCard,
      markParticipantCardDelivered: delivery.markParticipantCardDelivered,
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
    expect(delivery.editMessageText).toHaveBeenCalledTimes(2);
  });

  it("rejects mutating buttons from a superseded card and refreshes the canonical reference", async () => {
    const session = makeSession();
    const submitAction = vi.fn();
    const answerCallbackQuery = vi.fn((options?: { text?: string; show_alert?: boolean }) => {
      void options;
      return Promise.resolve(true);
    });
    const delivery = cardDeliveryHarness(session);
    const ctx = {
      from: { id: 1001, is_bot: false, first_name: "Лідерка" },
      chat: { id: 1001, type: "private" },
      callbackQuery: {
        id: "callback-old-card",
        data: "unused",
        message: { message_id: 9, date: 1, chat: { id: 1001, type: "private" } }
      },
      api: delivery.api,
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
      compareAndSetParticipantCard: delivery.compareAndSetParticipantCard,
      markParticipantCardDelivered: delivery.markParticipantCardDelivered,
      finalizeDeliveryAttempt: vi.fn().mockResolvedValue(true)
    } as unknown as GroupCombatService);

    expect(submitAction).not.toHaveBeenCalled();
    expect(answerCallbackQuery.mock.calls[0]?.[0]?.text).toContain("стара картка");
    expect(delivery.editMessageText).toHaveBeenCalledWith(
      1001,
      21,
      expect.any(String),
      expect.any(Object)
    );
  });

  it("opens one-use items as a second-level menu without submitting an item", async () => {
    const session = makeSession();
    const viewer = session.state.participants[0]!;
    viewer.hp = 10;
    viewer.combatItemQuantities = {
      "item.responsible-panic-bandage": 2,
      "item.dense-bandage": 1,
      "item.field-kit": 1
    };
    const editMessageText = vi.fn().mockResolvedValue(true);
    const answerCallbackQuery = vi.fn().mockResolvedValue(true);
    const submitAction = vi.fn();
    const ctx = {
      from: { id: 1001, is_bot: false, first_name: "Лідерка" },
      chat: { id: 1001, type: "private" },
      callbackQuery: {
        id: "callback-items",
        data: "unused",
        message: { message_id: 21, date: 1, chat: { id: 1001, type: "private" } }
      },
      editMessageText,
      answerCallbackQuery
    } as unknown as Context;

    await handleGroupCombatCallback(ctx, {
      type: "items",
      token: session.partyInviteToken,
      turn: 1
    }, {
      findByToken: vi.fn().mockResolvedValue(session),
      getHiddenCombatItemIdsForTelegramUser: vi.fn().mockResolvedValue(new Set()),
      submitAction
    } as unknown as GroupCombatService);

    expect(submitAction).not.toHaveBeenCalled();
    expect(editMessageText).toHaveBeenCalledTimes(1);
    expect(String(editMessageText.mock.calls[0]?.[0])).toContain(
      "🎒 Одноразові манатки: оберіть"
    );
    expect(JSON.stringify(editMessageText.mock.calls[0]?.[1])).toContain(
      "🩹 Бинт відповідальної паніки ×2"
    );
    expect(JSON.stringify(editMessageText.mock.calls[0]?.[1])).toContain(
      "⚕️ Польова аптечка"
    );
    expect(JSON.stringify(editMessageText.mock.calls[0]?.[1])).toContain("↩️ До бою");

    viewer.combatItemQuantities = {};
    answerCallbackQuery.mockClear();
    editMessageText.mockClear();
    await handleGroupCombatCallback(ctx, {
      type: "items",
      token: session.partyInviteToken,
      turn: 1
    }, {
      findByToken: vi.fn().mockResolvedValue(session),
      getHiddenCombatItemIdsForTelegramUser: vi.fn().mockResolvedValue(new Set()),
      submitAction
    } as unknown as GroupCombatService);

    expect(answerCallbackQuery).toHaveBeenCalledWith({
      text: "Зараз немає корисних одноразових манаток."
    });
    expect(String(editMessageText.mock.calls[0]?.[0]))
      .toContain("зараз немає корисних предметів.");
    expect(String(editMessageText.mock.calls[0]?.[0]))
      .not.toContain("для цього ходу");
  });

  it("opens terminal contribution statistics without mutating combat", async () => {
    const session = makeSession();
    session.status = "won";
    session.state.status = "won";
    session.state.enemyContributions = session.state.enemies.map((enemy) => ({
      enemyId: enemy.id,
      damage: 3,
      healing: 0,
      guardPrevented: 0,
      control: 0,
      damageTaken: 4,
      actions: 1,
      specialActions: 0,
      guardedTurns: 0
    }));
    const editMessageText = vi.fn().mockResolvedValue(true);
    const answerCallbackQuery = vi.fn().mockResolvedValue(true);
    const submitAction = vi.fn();
    const ctx = {
      from: { id: 1001, is_bot: false, first_name: "Лідерка" },
      chat: { id: 1001, type: "private" },
      callbackQuery: {
        id: "callback-statistics",
        data: "unused",
        message: { message_id: 21, date: 1, chat: { id: 1001, type: "private" } }
      },
      editMessageText,
      answerCallbackQuery
    } as unknown as Context;

    await handleGroupCombatCallback(ctx, {
      type: "statistics",
      token: session.partyInviteToken
    }, {
      findByToken: vi.fn().mockResolvedValue(session),
      submitAction
    } as unknown as GroupCombatService);

    expect(submitAction).not.toHaveBeenCalled();
    expect(editMessageText).toHaveBeenCalledTimes(1);
    expect(String(editMessageText.mock.calls[0]?.[0])).toContain(
      "📊 <b>Статистика бою</b>"
    );
    expect(String(editMessageText.mock.calls[0]?.[0])).toContain("<b>Пригодники:</b>");
    expect(String(editMessageText.mock.calls[0]?.[0])).toContain("<b>Монстри:</b>");
    expect(JSON.stringify(editMessageText.mock.calls[0]?.[1])).toContain(
      "↩️ До результатів"
    );
  });

  it("keeps stale journal callbacks closed until combat is terminal", async () => {
    const session = makeSession();
    session.state.recap = [{ turn: 1, lines: ["Лідерка стає в захист."] }];
    const editMessageText = vi.fn().mockResolvedValue(true);
    const answerCallbackQuery = vi.fn().mockResolvedValue(true);
    const ctx = {
      from: { id: 1001, is_bot: false, first_name: "Лідерка" },
      chat: { id: 1001, type: "private" },
      callbackQuery: {
        id: "callback-journal",
        data: "unused",
        message: { message_id: 21, date: 1, chat: { id: 1001, type: "private" } }
      },
      api: {
        editMessageText,
        deleteMessage: vi.fn().mockResolvedValue(true)
      } as unknown as Api,
      answerCallbackQuery
    } as unknown as Context;
    const markParticipantCardDelivered = vi.fn().mockResolvedValue(true);

    await handleGroupCombatCallback(ctx, {
      type: "journal",
      token: session.partyInviteToken,
      page: 0
    }, {
      findByToken: vi.fn().mockResolvedValue(session),
      findById: vi.fn().mockResolvedValue(session),
      markParticipantCardDelivered
    } as unknown as GroupCombatService);

    expect(answerCallbackQuery).toHaveBeenCalledWith({
      text: "Журнал відкриється після завершення бою.",
      show_alert: true
    });
    expect(editMessageText).toHaveBeenCalledWith(
      1001,
      21,
      expect.any(String),
      expect.any(Object)
    );
    expect(JSON.stringify(editMessageText.mock.calls[0]?.[3])).not.toContain("📜 Журнал");
  });

  it.each([
    ["a newer chat message is known", 30],
    ["freshness tracking is empty after restart", null]
  ] as const)("resends refresh as the sole latest canonical card when %s", async (_case, latestMessageId) => {
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
    if (latestMessageId !== null) {
      rememberLatestMessageForChat(1001, latestMessageId);
    }

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

    expect(sent).toHaveLength(1);
    expect(sent[0]?.messageId).toBe(31);
    expect(Array.isArray(sent[0]?.buttons)).toBe(true);
    expect((sent[0]?.buttons as unknown[]).length).toBeGreaterThan(0);
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
      { parse_mode: "HTML" }
    );
    expect(editMessageText).toHaveBeenNthCalledWith(2, 1001, 31, expect.any(String), expect.any(Object));
    const activatedOptions = editMessageText.mock.calls[1]?.[3] as {
      reply_markup?: { inline_keyboard?: unknown[] };
    } | undefined;
    expect(inlineKeyboardLabels(activatedOptions?.reply_markup)).toContain("🔎 Оновити");
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
    Object.assign(session.participants[0]!, {
      deliveredRevision: session.deliveryRevision,
      settlementStatus: "completed",
      settledAt: new Date("2026-07-22T10:01:00.000Z"),
      exitDeliveryState: "completed",
      exitDeliveryMessageId: 93
    });
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
    expect(editContextMessage).toHaveBeenCalledTimes(3);
    expect(editApiMessage).not.toHaveBeenCalled();
    expect(answerCallbackQuery).toHaveBeenCalledTimes(3);
  });

  it("repairs an unavailable canonical message after combat already committed", async () => {
    const session = makeSession({ deliveredRevision: 0 });
    const delivery = cardDeliveryHarness(session);
    delivery.editMessageText.mockRejectedValue(
      new Error("Bad Request: message to edit not found")
    );
    const compareAndSetParticipantCard = vi.fn<(
      input: Parameters<GroupCombatService["compareAndSetParticipantCard"]>[0]
    ) => Promise<boolean>>().mockResolvedValue(true);

    const delivered = await deliverGroupCombatCards(delivery.api, {
      findById: vi.fn().mockResolvedValue(session),
      compareAndSetParticipantCard,
      markParticipantCardDelivered: delivery.markParticipantCardDelivered,
      finalizeDeliveryAttempt: vi.fn().mockResolvedValue(true)
    } as unknown as GroupCombatService, session);

    expect(delivered).toBe(2);
    expect(delivery.sendMessage).toHaveBeenCalledTimes(2);
    expect(compareAndSetParticipantCard).toHaveBeenCalledTimes(2);
    expect(compareAndSetParticipantCard.mock.calls.map((call) => call[0]))
      .toEqual([
        expect.objectContaining({
          telegramUserId: 1001n,
          expectedReferenceVersion: 1,
          messageId: 31
        }),
        expect.objectContaining({
          telegramUserId: 1002n,
          expectedReferenceVersion: 1,
          messageId: 32
        })
      ]);
  });

  it("starts from a supergroup but publishes participant cards only to private DMs", async () => {
    const bot = testBot();
    const session = makeSession({ deliveredRevision: 0 });
    session.participants = session.participants.map((participant, index) => ({
      ...participant,
      chatId: -100587n,
      messageId: 70 + index
    }));
    const apiCalls: Array<{ method: string; chatId: number; replyMarkup: unknown }> = [];
    let nextMessageId = 90;
    const findById = vi.fn(() => Promise.resolve(session));
    const startProof = vi.fn().mockResolvedValue({ state: "started", session });
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
      startProof,
      findById,
      compareAndSetParticipantCard,
      releaseParticipantCard: vi.fn(),
      markParticipantCardDelivered: vi.fn().mockResolvedValue(true),
      finalizeDeliveryAttempt: vi.fn().mockResolvedValue(true)
    } as unknown as GroupCombatService);

    await bot.handleUpdate(groupCommandUpdate("/dev_group_combat proof-token-13"));

    expect(startProof).toHaveBeenCalledWith(1001n, "proof-token-13");
    await waitForCondition(() => apiCalls.filter((call) => call.method === "sendMessage").length === 2);
    expect(apiCalls).not.toContainEqual(expect.objectContaining({ chatId: -100587 }));
    expect(apiCalls.filter((call) => call.method === "sendMessage").map((call) => call.chatId))
      .toEqual([1001, 1002]);
    const sendCalls = apiCalls.filter((call) => call.method === "sendMessage");
    expect(inlineKeyboardLabels(sendCalls[0]?.replyMarkup))
      .toEqual(buildGroupCombatKeyboard(session, session.participants[0]!.characterId)
        .inline_keyboard.flat().map((button) => button.text));
    expect(inlineKeyboardLabels(sendCalls[1]?.replyMarkup))
      .toEqual(buildGroupCombatKeyboard(session, session.participants[1]!.characterId)
        .inline_keyboard.flat().map((button) => button.text));
    expect(apiCalls.filter((call) => call.method === "editMessageText").map((call) => call.chatId)).toEqual([1001, 1002]);
  });

  it("rejects a public group-combat start callback before calling startProof", async () => {
    const startProof = vi.fn();
    const answerCallbackQuery = vi.fn().mockResolvedValue(true);
    const ctx = {
      from: { id: 1001, is_bot: false, first_name: "Лідерка" },
      chat: { id: -100587, type: "supergroup" },
      callbackQuery: { id: "callback-public-start", data: "unused" },
      answerCallbackQuery
    } as unknown as Context;

    await handleGroupCombatCallback(
      ctx,
      { type: "start", token: "proof-token-13" },
      { startProof } as unknown as GroupCombatService
    );

    expect(startProof).not.toHaveBeenCalled();
    expect(answerCallbackQuery).toHaveBeenCalledWith(expect.objectContaining({ show_alert: true }));
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

function makeSession(
  overrides: { deliveredRevision?: number } = {}
): GroupCombatSessionRecord {
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
    settlementPlan: null,
    participants: [
      participantRecord("character-1", 1001n, "Лідерка", 0, 21, overrides.deliveredRevision),
      participantRecord("character-2", 1002n, "Друг", 1, 22, overrides.deliveredRevision)
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

function makeLeftPassagePartySession(): PartySessionRecord {
  const now = new Date("2026-07-24T10:00:00.000Z");
  const leader: PartySessionRecord["leader"] = {
    id: "character-1",
    userId: "user-1",
    telegramUserId: 1001n,
    currentLocationId: "location.korchma.deep.level1.left",
    name: "Лідерка",
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
  return {
    id: "left-party-1",
    inviteToken: "leftToken13",
    status: "recruiting",
    leaderCharacterId: leader.id,
    periodId: null,
    originLocationId: "location.korchma.deep.level1.left",
    originKind: "nyz-left-passage-party.v1",
    participantCap: 3,
    minimumParticipants: 1,
    joinUntilAt: new Date(now.getTime() + 180_000),
    expiresAt: new Date(now.getTime() + 180_000),
    version: 1,
    activeLeaderKey: "party-leader:character-1",
    createdAt: now,
    updatedAt: now,
    leader,
    participants: [{
      id: "left-participant-1",
      sessionId: "left-party-1",
      characterId: leader.id,
      remortCount: 0,
      status: "joined",
      joinSource: "leader",
      joinedAt: now,
      leftAt: null,
      chatId: 1001n,
      messageId: 21,
      character: leader
    }]
  };
}

function participantRecord(
  characterId: string,
  telegramUserId: bigint,
  name: string,
  rosterOrder: number,
  messageId: number,
  deliveredRevision = 1
) {
  return {
    characterId,
    telegramUserId,
    name,
    remortCount: 0,
    rosterOrder,
    chatId: telegramUserId,
    messageId,
    referenceVersion: 1,
    deliveredRevision,
    replyKeyboardFingerprint: null,
    replyKeyboardGeneration: 0,
    exitDeliveryState: "none" as const,
    exitDeliveryClaimToken: null,
    exitDeliveryClaimedAt: null,
    exitDeliveryMessageId: null,
    settlementStatus: "pending" as const,
    settlementAttempts: 0,
    settlementReceipt: null,
    settledAt: null
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

function cardDeliveryHarness(session: GroupCombatSessionRecord) {
  let nextMessageId = 31;
  const editMessageText = vi.fn().mockResolvedValue(true);
  const sendMessage = vi.fn().mockImplementation(() =>
    Promise.resolve({ message_id: nextMessageId++ })
  );
  const compareAndSetParticipantCard = vi.fn((input: {
    telegramUserId: bigint;
    chatId: bigint;
    messageId: number;
  }) => {
    const participant = session.participants.find(
      (candidate) => candidate.telegramUserId === input.telegramUserId
    )!;
    participant.chatId = input.chatId;
    participant.messageId = input.messageId;
    participant.referenceVersion += 1;
    participant.deliveredRevision = 0;
    return Promise.resolve(true);
  });
  const markParticipantCardDelivered = vi.fn((input: {
    telegramUserId: bigint;
  }) => {
    const participant = session.participants.find(
      (candidate) => candidate.telegramUserId === input.telegramUserId
    )!;
    participant.deliveredRevision = session.deliveryRevision;
    return Promise.resolve(true);
  });
  return {
    api: {
      editMessageText,
      sendMessage,
      deleteMessage: vi.fn().mockResolvedValue(true)
    } as unknown as Api,
    editMessageText,
    sendMessage,
    compareAndSetParticipantCard,
    markParticipantCardDelivered
  };
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

function textUpdate(text: string) {
  const update = commandUpdate(text);
  return {
    ...update,
    message: {
      ...update.message,
      entities: undefined
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

function callbackAnswerText(answerCallbackQuery: ReturnType<typeof vi.fn>): string {
  const call = answerCallbackQuery.mock.calls[0] as [{ text?: string }] | undefined;
  return call?.[0].text ?? "";
}

function inlineKeyboardLabels(value: unknown): string[] {
  if (!value || typeof value !== "object") {
    return [];
  }
  const keyboard = (value as Record<string, unknown>)["inline_keyboard"];
  if (!Array.isArray(keyboard)) {
    return [];
  }
  return keyboard.flatMap((row) => Array.isArray(row)
    ? row.flatMap((button) => {
      if (!button || typeof button !== "object") {
        return [];
      }
      const label = (button as Record<string, unknown>)["text"];
      return typeof label === "string" ? [label] : [];
    })
    : []);
}

function inlineKeyboardCallbacks(value: unknown): string[] {
  if (!value || typeof value !== "object") {
    return [];
  }
  const keyboard = (value as Record<string, unknown>)["inline_keyboard"];
  if (!Array.isArray(keyboard)) {
    return [];
  }
  return keyboard.flatMap((row) => Array.isArray(row)
    ? row.flatMap((button) => {
      if (!button || typeof button !== "object") {
        return [];
      }
      const data = (button as Record<string, unknown>)["callback_data"];
      return typeof data === "string" ? [data] : [];
    })
    : []);
}
