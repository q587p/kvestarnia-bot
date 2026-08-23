import { Bot, type Context } from "grammy";
import { describe, expect, it, vi } from "vitest";
import {
  buildExistingCharacterReplyOptions,
  registerStartCommand,
  sendTavernGameJoinFromStartPayload
} from "../../src/bot/commands/startCommand";
import { startDicePokerTable, startQuickDicePoker } from "../../src/domain/dicePoker";
import { PRESENCE_LOCATION_KORCHMA_BAR } from "../../src/services/presenceService";
import type { OnboardingService } from "../../src/services/onboardingService";
import type { TavernGameService } from "../../src/services/tavernGameService";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";
import { buildTerminalBattleArtifactStartPayload } from "../../src/bot/terminalBattleArtifactLink";

describe("start command", () => {
  it.each(["private", "group", "supergroup"] as const)(
    "opens solo, Training, and Mimic capability URLs for a non-participant without a Character in %s chat",
    async (chatType) => {
      const bot = new Bot("test-token", {
        botInfo: { id: 123, is_bot: true, first_name: "Квестарня", username: "kvestarnia_bot" }
      });
      const onboardingStart = vi.fn();
      const sent: Array<Record<string, unknown>> = [];
      const tokens = {
        solo: "123e4567-e89b-42d3-a456-426614174010",
        training: "123e4567-e89b-42d3-a456-426614174011",
        mimic: "123e4567-e89b-42d3-a456-426614174012"
      } as const;
      const identity = {
        version: 1 as const,
        name: "Заморожене Ім'я",
        title: "Заморожений Титул",
        guildCrest: "🛡️",
        level: 8,
        raceId: "race.human-ish",
        raceName: "Людисько",
        classId: "class.warrior",
        className: "Воїн"
      };
      const soloSession = terminalArtifactSession(tokens.solo, "normal", "monster.deadline-spider", identity);
      const trainingSession = terminalArtifactSession(
        tokens.training,
        "training",
        "monster.training-doppelganger",
        identity
      );
      const getPublicTerminalFightArtifact = vi.fn().mockResolvedValue({
        state: "found",
        character: identity,
        session: soloSession,
        monster: null,
        questProgress: null,
        fightReward: null
      });
      const getPublicTerminalArtifact = vi.fn().mockResolvedValue({
        state: "ready",
        character: identity,
        doppelganger: {
          name: "Сумлінний Допельґанґер",
          raceName: "Людисько",
          className: "Воїн",
          title: "Копія",
          level: 8,
          spawnMode: "COPY_TARGET",
          source: "target",
          copiedEquipmentCount: 0
        },
        session: trainingSession,
        reward: null
      });
      const getPublicMimicShawarmaArtifact = vi.fn().mockResolvedValue({
        state: "ready",
        artifactToken: tokens.mimic,
        character: identity,
        action: "attack",
        combat: {
          action: "attack",
          outcome: "win",
          playerHpPreview: 20,
          playerHpMaxPreview: 22,
          enemyHpPreview: 0,
          enemyHpMaxPreview: 8,
          playerDamage: 8,
          enemyDamage: 2
        },
        statistics: zeroMimicStatistics()
      });
      bot.api.config.use((_prev, method, payload) => {
        if (method === "sendMessage") sent.push(payload);
        return Promise.resolve({ ok: true, result: { message_id: sent.length } });
      });
      registerStartCommand(bot, { start: onboardingStart } as unknown as OnboardingService, {
        fight: { getPublicTerminalFightArtifact, getPublicMimicShawarmaArtifact } as never,
        trainingDoppelganger: { getPublicTerminalArtifact } as never,
        botUsername: "kvestarnia_bot"
      });

      for (const [index, kind] of (["solo", "training", "mimic"] as const).entries()) {
        const payload = buildTerminalBattleArtifactStartPayload(kind, tokens[kind]);
        if (!payload) throw new Error("Expected artifact payload.");
        await bot.handleUpdate({
          update_id: 600 + index,
          message: {
            message_id: 600 + index,
            date: 1,
            chat: { id: -9999, type: chatType },
            from: { id: 9999, is_bot: false, first_name: "Спостерігач" },
            text: `/start ${payload}`,
            entities: [{ offset: 0, length: 6, type: "bot_command" }]
          }
        });
      }

      expect(getPublicTerminalFightArtifact).toHaveBeenCalledWith(tokens.solo);
      expect(getPublicTerminalArtifact).toHaveBeenCalledWith(tokens.training);
      expect(getPublicMimicShawarmaArtifact).toHaveBeenCalledWith(tokens.mimic);
      expect(onboardingStart).not.toHaveBeenCalled();
      expect(sent).toHaveLength(3);
      expect(sent.every((message) => JSON.stringify(message.reply_markup).includes("t.me/share/url"))).toBe(true);
      expect(sent.map((message) => String(message.text)).join("\n")).toContain("Заморожене Ім'я");
    }
  );

  it("fails closed with one generic response for active, malformed, wrong-kind, and unavailable artifact tokens", async () => {
    const bot = new Bot("test-token", {
      botInfo: { id: 123, is_bot: true, first_name: "Квестарня", username: "kvestarnia_bot" }
    });
    const onboardingStart = vi.fn();
    const sent: Array<Record<string, unknown>> = [];
    const token = "123e4567-e89b-42d3-a456-426614174020";
    bot.api.config.use((_prev, method, payload) => {
      if (method === "sendMessage") sent.push(payload);
      return Promise.resolve({ ok: true, result: { message_id: sent.length } });
    });
    registerStartCommand(bot, { start: onboardingStart } as unknown as OnboardingService, {
      fight: {
        getPublicTerminalFightArtifact: vi.fn().mockResolvedValue({ state: "active" }),
        getPublicMimicShawarmaArtifact: vi.fn().mockResolvedValue({ state: "not-found" })
      } as never,
      trainingDoppelganger: {
        getPublicTerminalArtifact: vi.fn().mockResolvedValue({ state: "not-found" })
      } as never
    });

    const payloads = [
      `ba1_s_${token}`,
      `ba1_t_${token}`,
      `ba1_m_${token}`,
      "ba1_s_not-a-uuid",
      `ba1_x_${token}`,
      "ba1"
    ];
    for (const [index, payload] of payloads.entries()) {
      await bot.handleUpdate({
        update_id: 650 + index,
        message: {
          message_id: 650 + index,
          date: 1,
          chat: { id: 9999, type: "private" },
          from: { id: 9999, is_bot: false, first_name: "Спостерігач" },
          text: `/start ${payload}`,
          entities: [{ offset: 0, length: 6, type: "bot_command" }]
        }
      });
    }

    expect(onboardingStart).not.toHaveBeenCalled();
    expect(sent.map((message) => message.text)).toEqual(
      payloads.map(() => "Бойовий запис не знайшовся або ще не готовий до перегляду.")
    );
  });

  it("opens a completed duel deep link for a non-participant without starting onboarding or acceptance", async () => {
    const bot = new Bot("test-token", {
      botInfo: { id: 123, is_bot: true, first_name: "Квестарня", username: "kvestarnia_bot" }
    });
    const terminal = {
      state: "resolved" as const,
      challenge: {
        id: "duel-public",
        challengerCharacterId: "challenger-id",
        targetCharacterId: "target-id",
        contextChatId: null,
        inviteToken: "publicDuel13",
        mode: "quick" as const,
        status: "resolved" as const,
        expiresAt: new Date("2026-08-23T10:00:00.000Z"),
        resolvedAt: new Date("2026-08-23T09:00:00.000Z"),
        result: null,
        createdAt: new Date("2026-08-23T08:00:00.000Z"),
        updatedAt: new Date("2026-08-23T09:00:00.000Z"),
        challenger: null,
        target: null
      },
      challenger: { ...existingCharacterSummary, name: "Автор Виклику" },
      target: { ...existingCharacterSummary, name: "Ціль Виклику" },
      result: {
        outcome: "target" as const,
        winnerCharacterId: "target-id",
        loserCharacterId: "challenger-id",
        challengerScore: 7,
        targetScore: 9,
        swing: 0,
        flavorKey: "paperwork-stall" as const
      }
    };
    const getTerminalResultByToken = vi.fn().mockResolvedValue(terminal);
    const acceptForTelegramUser = vi.fn();
    const onboardingStart = vi.fn();
    const sent: Array<Record<string, unknown>> = [];
    bot.api.config.use((_prev, method, payload) => {
      if (method === "sendMessage") sent.push(payload);
      return Promise.resolve({ ok: true, result: { message_id: sent.length } });
    });
    registerStartCommand(bot, { start: onboardingStart } as unknown as OnboardingService, {
      duel: { getTerminalResultByToken, acceptForTelegramUser } as never
    });

    await bot.handleUpdate({
      update_id: 587,
      message: {
        message_id: 587,
        date: 1,
        chat: { id: 9999, type: "private" },
        from: { id: 9999, is_bot: false, first_name: "Спостерігач" },
        text: "/start duel_publicDuel13",
        entities: [{ offset: 0, length: 6, type: "bot_command" }]
      }
    });

    expect(getTerminalResultByToken).toHaveBeenCalledWith("publicDuel13");
    expect(acceptForTelegramUser).not.toHaveBeenCalled();
    expect(onboardingStart).not.toHaveBeenCalled();
    expect(String(sent[0]?.text)).toContain("Результат миттєвої дуелі");
    expect(JSON.stringify(sent[0]?.reply_markup)).toContain("📊 Статистика");
  });

  it("returns a generic response for an unknown duel token without onboarding or acceptance", async () => {
    const bot = new Bot("test-token", {
      botInfo: { id: 123, is_bot: true, first_name: "Квестарня", username: "kvestarnia_bot" }
    });
    const acceptForTelegramUser = vi.fn();
    const onboardingStart = vi.fn();
    const sent: Array<Record<string, unknown>> = [];
    bot.api.config.use((_prev, method, payload) => {
      if (method === "sendMessage") sent.push(payload);
      return Promise.resolve({ ok: true, result: { message_id: sent.length } });
    });
    registerStartCommand(bot, { start: onboardingStart } as unknown as OnboardingService, {
      duel: {
        getTerminalResultByToken: vi.fn().mockResolvedValue({ state: "not-found" }),
        acceptForTelegramUser
      } as never
    });

    await bot.handleUpdate({
      update_id: 588,
      message: {
        message_id: 588,
        date: 1,
        chat: { id: 9999, type: "private" },
        from: { id: 9999, is_bot: false, first_name: "Спостерігач" },
        text: "/start duel_unknown13",
        entities: [{ offset: 0, length: 6, type: "bot_command" }]
      }
    });

    expect(acceptForTelegramUser).not.toHaveBeenCalled();
    expect(onboardingStart).not.toHaveBeenCalled();
    expect(sent).toHaveLength(1);
    expect(sent[0]?.text).toBe("Виклик не знайшовся.");
  });

  it("turns a shared guild deep link into the canonical invite flow", async () => {
    const bot = new Bot("test-token", {
      botInfo: { id: 123, is_bot: true, first_name: "Квестарня", username: "kvestarnia_bot" }
    });
    const createInviteForTelegramUser = vi.fn().mockResolvedValue({
      state: "created",
      invite: {
        token: "inviteABC12",
        guildId: "guild-id",
        guildName: "Тиха Печатка",
        guildCrest: "🛡️",
        targetName: "Адресатка",
        status: "pending",
        expiresAt: new Date("2026-08-07T20:00:00.000Z")
      },
      deliveryTelegramUserId: 93n
    });
    const delivered: Array<Record<string, unknown>> = [];
    bot.api.config.use((_prev, method, payload) => {
      if (method === "sendMessage") delivered.push(payload);
      return Promise.resolve({ ok: true, result: { message_id: delivered.length } });
    });
    registerStartCommand(bot, { start: vi.fn() } as unknown as OnboardingService, {
      guilds: { createInviteForTelegramUser } as never
    });

    await bot.handleUpdate({
      update_id: 1,
      message: {
        message_id: 1,
        date: 1,
        chat: { id: 42, type: "private" },
        from: { id: 42, is_bot: false, first_name: "Запрошувач" },
        text: "/start guild_privateInviteCode93",
        entities: [{ offset: 0, length: 6, type: "bot_command" }]
      }
    });

    expect(createInviteForTelegramUser).toHaveBeenCalledWith(42n, "privateInviteCode93");
    expect(delivered).toHaveLength(2);
    expect(delivered[0]?.chat_id).toBe(93);
    expect(JSON.stringify(delivered[0]?.reply_markup)).toContain("v1:g:a:inviteABC12");
    expect(String(delivered[1]?.text)).toContain("Запрошення збережено й передано приватно");
  });

  it("explains the inviter role and keeps guild recovery when a nonmember follows a shared guild link", async () => {
    const bot = new Bot("test-token", {
      botInfo: { id: 123, is_bot: true, first_name: "Квестарня", username: "kvestarnia_bot" }
    });
    const createInviteForTelegramUser = vi.fn().mockResolvedValue({ state: "not-member" });
    const delivered: Array<Record<string, unknown>> = [];
    bot.api.config.use((_prev, method, payload) => {
      if (method === "sendMessage") delivered.push(payload);
      return Promise.resolve({ ok: true, result: { message_id: delivered.length } });
    });
    registerStartCommand(bot, { start: vi.fn() } as unknown as OnboardingService, {
      guilds: { createInviteForTelegramUser } as never
    });

    await bot.handleUpdate({
      update_id: 2,
      message: {
        message_id: 2,
        date: 1,
        chat: { id: 42, type: "private" },
        from: { id: 42, is_bot: false, first_name: "Запрошувач" },
        text: "/start guild_privateInviteCode93",
        entities: [{ offset: 0, length: 6, type: "bot_command" }]
      }
    });

    expect(createInviteForTelegramUser).toHaveBeenCalledWith(42n, "privateInviteCode93");
    expect(delivered).toHaveLength(1);
    expect(String(delivered[0]?.text)).toContain("не приєднує вас до ґільдії власника картки");
    expect(String(delivered[0]?.text)).toContain("голові або старшині");
    expect(delivered[0]?.parse_mode).toBe("HTML");
    expect(JSON.stringify(delivered[0]?.reply_markup)).toContain("🏰 До ґільдії");
    expect(JSON.stringify(delivered[0]?.reply_markup)).toContain("v1:g:o");
  });

  it("uses Telegram HTML parse mode for existing hero summary", () => {
    const options = buildExistingCharacterReplyOptions();

    expect(options.parse_mode).toBe("HTML");
    expect(options.reply_markup).toBeDefined();
  });

  it("shows active guild identity on the existing-character /start card", async () => {
    const bot = new Bot("test-token", {
      botInfo: { id: 123, is_bot: true, first_name: "Квестарня", username: "kvestarnia_bot" }
    });
    const sent: Array<Record<string, unknown>> = [];
    bot.api.config.use((_prev, method, payload) => {
      if (method === "sendMessage") sent.push(payload);
      return Promise.resolve({ ok: true, result: { message_id: sent.length } });
    });
    registerStartCommand(bot, {
      start: vi.fn().mockResolvedValue({ state: "existing-character", character: existingCharacterSummary })
    } as unknown as OnboardingService, {
      guilds: {
        getHubForTelegramUser: vi.fn().mockResolvedValue({
          state: "ready",
          guild: { status: "active", crest: "🧿", displayName: "Тиха Печатка" }
        })
      } as never
    });

    await bot.handleUpdate({
      update_id: 13,
      message: {
        message_id: 13,
        date: 1,
        chat: { id: 42, type: "private" },
        from: { id: 42, is_bot: false, first_name: "Тест" },
        text: "/start",
        entities: [{ offset: 0, length: 6, type: "bot_command" }]
      }
    });

    expect(String(sent[0]?.text)).toContain("Ґільдія: 🧿 <b>Тиха Печатка</b>");
  });

  it("notifies existing tavern-game participants after a game deep-link join", async () => {
    const session = tavernGameSession({
      status: "ready",
      participants: [
        tavernGameParticipant(93n, "character-creator", "Kyjivan BooksDragon", "joined", null),
        tavernGameParticipant(42n, "character-joiner", "Shannar de Kassal", "joined", null)
      ]
    });
    const joinByTokenForTelegramUser = vi.fn().mockResolvedValue({ state: "joined", session });
    const reply = vi.fn().mockResolvedValue(undefined);
    const sendMessage = vi.fn().mockResolvedValue(undefined);

    await sendTavernGameJoinFromStartPayload(
      { reply, api: { sendMessage } } as unknown as Context,
      { start: vi.fn() } as unknown as OnboardingService,
      { joinByTokenForTelegramUser } as unknown as TavernGameService,
      { telegramUserId: 42n, displayName: "Shannar de Kassal" },
      session.token,
      { botUsername: "kvestarnia_test_bot" }
    );

    expect(joinByTokenForTelegramUser).toHaveBeenCalledWith(42n, session.token);
    expect(reply).toHaveBeenCalledWith(
      expect.stringContaining("♟ Тавлеї · ставка <b>1 зол.</b>"),
      expect.objectContaining({ parse_mode: "HTML" })
    );
    expect(sendMessage).toHaveBeenCalledWith(
      93,
      expect.stringContaining("До столу підсів ще один пригодник."),
      expect.objectContaining({ parse_mode: "HTML" })
    );
    expect(JSON.stringify(sendMessage.mock.calls[0]?.[2])).toContain(`v1:sh:gt:${session.token}:`);
  });

  it("sends existing participants viewer-specific controls when a game deep-link join starts quick dice", async () => {
    const creatorDice = startQuickDicePoker("start-command-creator");
    const joinerDice = startQuickDicePoker("start-command-joiner");
    const session = tavernGameSession({
      gameKey: "kosti",
      rulesVersion: "dice-poker-v1",
      status: "ready",
      result: {
        ...startDicePokerTable("quick"),
        phase: "playing" as const
      },
      participants: [
        tavernGameParticipant(93n, "character-creator", "Kyjivan BooksDragon", "joined", creatorDice),
        tavernGameParticipant(42n, "character-joiner", "Shannar de Kassal", "joined", joinerDice)
      ]
    });
    const joinByTokenForTelegramUser = vi.fn().mockResolvedValue({
      state: "started",
      session,
      resolution: null
    });
    const reply = vi.fn().mockResolvedValue(undefined);
    const sendMessage = vi.fn().mockResolvedValue(undefined);

    await sendTavernGameJoinFromStartPayload(
      { reply, api: { sendMessage } } as unknown as Context,
      { start: vi.fn() } as unknown as OnboardingService,
      { joinByTokenForTelegramUser } as unknown as TavernGameService,
      { telegramUserId: 42n, displayName: "Shannar de Kassal" },
      session.token,
      { botUsername: "kvestarnia_test_bot" }
    );

    expect(joinByTokenForTelegramUser).toHaveBeenCalledWith(42n, session.token);
    expect(reply).toHaveBeenCalledWith(
      expect.stringContaining("Твої кості:"),
      expect.objectContaining({ parse_mode: "HTML" })
    );
    expect(sendMessage).toHaveBeenCalledWith(
      93,
      expect.stringContaining("Партія почалась."),
      expect.objectContaining({ parse_mode: "HTML" })
    );
    const existingPlayerText = String(sendMessage.mock.calls[0]?.[1]);
    const existingPlayerKeyboard = JSON.stringify(sendMessage.mock.calls[0]?.[2]);
    expect(existingPlayerText).toContain("Твої кості:");
    expect(existingPlayerText).not.toContain("Чекаємо другого гравця");
    expect(existingPlayerKeyboard).toContain(`v1:sh:gpr:${session.token}`);
    expect(existingPlayerKeyboard).toContain(`v1:sh:gdt:${session.token}:`);
  });

  it("moves game deep-link users to Shynok before retrying a wrong-place join", async () => {
    const session = tavernGameSession({
      status: "ready",
      participants: [
        tavernGameParticipant(93n, "character-creator", "Kyjivan BooksDragon", "joined", null),
        tavernGameParticipant(42n, "character-joiner", "Shannar de Kassal", "joined", null)
      ]
    });
    const joinByTokenForTelegramUser = vi.fn()
      .mockResolvedValueOnce({ state: "blocked", reason: "wrong-place" })
      .mockResolvedValueOnce({ state: "joined", session });
    const markAction = vi.fn().mockResolvedValue(undefined);
    const reply = vi.fn().mockResolvedValue(undefined);
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const player = { telegramUserId: 42n, displayName: "Shannar de Kassal" };

    await sendTavernGameJoinFromStartPayload(
      { reply, api: { sendMessage } } as unknown as Context,
      { start: vi.fn() } as unknown as OnboardingService,
      { joinByTokenForTelegramUser } as unknown as TavernGameService,
      player,
      session.token,
      {
        botUsername: "kvestarnia_test_bot",
        presence: { markAction } as never
      }
    );

    expect(markAction).toHaveBeenCalledWith({
      user: player,
      locationId: PRESENCE_LOCATION_KORCHMA_BAR
    });
    expect(markAction.mock.calls[0]?.[0]).not.toHaveProperty("currentRaidId");
    expect(markAction.mock.calls[0]?.[0]).not.toHaveProperty("currentAdventureId");
    expect(joinByTokenForTelegramUser).toHaveBeenNthCalledWith(1, 42n, session.token);
    expect(joinByTokenForTelegramUser).toHaveBeenNthCalledWith(2, 42n, session.token);
    expect(reply).toHaveBeenCalledWith(
      expect.stringContaining("♟ Тавлеї · ставка <b>1 зол.</b>"),
      expect.objectContaining({ parse_mode: "HTML" })
    );
    expect(String(reply.mock.calls[0]?.[0])).not.toContain("Зараз не до шинкових ігор");
  });

  it("keeps the retry blocked when wrong-place movement reveals a pending raid", async () => {
    const session = tavernGameSession({
      status: "open",
      participants: [
        tavernGameParticipant(93n, "character-creator", "Kyjivan BooksDragon", "joined", null)
      ]
    });
    const joinByTokenForTelegramUser = vi.fn()
      .mockResolvedValueOnce({ state: "blocked", reason: "wrong-place" })
      .mockResolvedValueOnce({ state: "blocked", reason: "pending-raid" });
    const markAction = vi.fn().mockResolvedValue(undefined);
    const reply = vi.fn().mockResolvedValue(undefined);
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const player = { telegramUserId: 42n, displayName: "Shannar de Kassal" };

    await sendTavernGameJoinFromStartPayload(
      { reply, api: { sendMessage } } as unknown as Context,
      { start: vi.fn() } as unknown as OnboardingService,
      { joinByTokenForTelegramUser } as unknown as TavernGameService,
      player,
      session.token,
      {
        botUsername: "kvestarnia_test_bot",
        presence: { markAction } as never
      }
    );

    expect(markAction).toHaveBeenCalledWith({
      user: player,
      locationId: PRESENCE_LOCATION_KORCHMA_BAR
    });
    expect(markAction.mock.calls[0]?.[0]).not.toHaveProperty("currentRaidId");
    expect(markAction.mock.calls[0]?.[0]).not.toHaveProperty("currentAdventureId");
    expect(joinByTokenForTelegramUser).toHaveBeenNthCalledWith(1, 42n, session.token);
    expect(joinByTokenForTelegramUser).toHaveBeenNthCalledWith(2, 42n, session.token);
    expect(reply).toHaveBeenCalledWith(expect.any(String), { parse_mode: "HTML" });
    expect(JSON.stringify(reply.mock.calls[0]?.[1])).not.toContain("reply_markup");
    expect(sendMessage).not.toHaveBeenCalled();
  });
});

const existingCharacterSummary: CharacterSummary = {
  name: "Тестовий Герой",
  pronoun: "they",
  pronounLabel: "Вони",
  path: "boundary",
  currentLocationId: "location.korchma.deep",
  raceId: "race.human-ish",
  raceName: "Людисько",
  classId: "class.warrior",
  className: "Воїн",
  title: "Пересічний Пригодник",
  level: 5,
  xp: 27,
  nextLevelXp: 110,
  xpToNextLevel: 83,
  gold: 0,
  hpCurrent: 36,
  hpMax: 36,
  manaCurrent: 18,
  manaMax: 18,
  stats: { strength: 8, dexterity: 10, intelligence: 6, charisma: 5, luck: 7 },
  levelBonus: { hpMax: 4, manaMax: 2, primaryStat: { stat: "intelligence", bonus: 1 } }
};

function terminalArtifactSession(
  id: string,
  source: "normal" | "training",
  monsterId: string,
  publicIdentity: Record<string, unknown>
) {
  const now = new Date("2026-08-23T10:00:00.000Z");
  return {
    id,
    characterId: "character-owner",
    monsterId,
    status: "won" as const,
    turn: 1,
    state: {
      id,
      source,
      publicIdentity,
      turn: 1,
      status: "won" as const,
      hero: { hp: 20, hpMax: 22, mana: 10, manaMax: 10, guildCrest: "🛡️" },
      monster: {
        hp: 0,
        hpMax: 8,
        level: 3,
        name: source === "training" ? "Сумлінний Допельґанґер" : "Дедлайновий Павук",
        raceId: "race.human-ish",
        raceName: "Людисько",
        classId: "class.warrior",
        className: "Воїн",
        title: "Копія"
      },
      statistics: {
        version: 1,
        hero: zeroContribution(),
        enemies: { "enemy:1": zeroContribution() }
      }
    },
    reward: null,
    createdAt: now,
    updatedAt: now,
    expiresAt: new Date("2026-08-23T11:00:00.000Z")
  };
}

function zeroContribution() {
  return {
    damage: 0,
    healing: 0,
    guardPrevented: 0,
    control: 0,
    damageTaken: 0,
    actions: 0,
    specialActions: 0,
    guardedTurns: 0
  };
}

function zeroMimicStatistics() {
  return {
    version: 1 as const,
    hero: zeroContribution(),
    enemy: zeroContribution()
  };
}

function tavernGameSession(overrides: Record<string, unknown> = {}) {
  const now = new Date("2026-07-02T10:00:00.000Z");
  const participants = (overrides.participants as ReturnType<typeof tavernGameParticipant>[] | undefined) ?? [
    tavernGameParticipant(93n, "character-creator", "Kyjivan BooksDragon", "joined", null)
  ];

  return {
    id: "tavern-game-session-1",
    token: "12345678-1234-4234-9234-123456789abc",
    gameKey: "tavlei",
    status: "open",
    creatorCharacterId: "character-creator",
    stakeGold: 1,
    potGold: participants.length,
    seed: "seed",
    rulesVersion: "test",
    result: null,
    openedAt: now,
    joinExpiresAt: new Date("2026-07-02T10:13:00.000Z"),
    decisionExpiresAt: new Date("2026-07-02T10:18:00.000Z"),
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    creator: tavernGameCharacter(93n, "character-creator", "Kyjivan BooksDragon"),
    participants,
    ...overrides
  };
}

function tavernGameParticipant(
  telegramUserId: bigint,
  characterId: string,
  displayName: string,
  status: string,
  decision: unknown
) {
  const now = new Date("2026-07-02T10:00:00.000Z");

  return {
    id: `participant-${characterId}`,
    sessionId: "tavern-game-session-1",
    characterId,
    telegramUserId,
    displayName,
    remortCount: 0,
    status,
    stakeGold: 1,
    payoutGold: 0,
    refundedGold: 0,
    decision,
    result: null,
    joinedAt: now,
    decidedAt: null,
    completedAt: null,
    character: tavernGameCharacter(telegramUserId, characterId, displayName)
  };
}

function tavernGameCharacter(telegramUserId: bigint, id: string, name: string) {
  return {
    id,
    userId: `user-${id}`,
    telegramUserId,
    currentLocationId: "location.korchma.bar",
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
