import type { Context } from "grammy";
import { describe, expect, it, vi } from "vitest";
import { handleDuelCallback } from "../../src/bot/commands/duelCommand";
import type { DuelChallengeRecord, DuelCharacterSnapshot } from "../../src/db/repositories/duelChallengeRepository";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";
import type { DuelChallengeService } from "../../src/services/duelChallengeService";
import type { PresenceService } from "../../src/services/presenceService";

const TOKEN = "abcDEF12";
const NOW = new Date("2026-06-17T18:00:00.000Z");
const EXPIRES_AT = new Date("2026-06-17T18:15:00.000Z");

describe("handleDuelCallback", () => {
  it("sends a forwardable invite message when a new open challenge is created with a bot username", async () => {
    const challenger = makeCharacterSummary("Автор Виклику");
    const createOpenChallengeForTelegramUser = vi.fn().mockResolvedValue({
      state: "pending",
      challenge: makeChallenge("pending"),
      challenger,
      expiresAt: EXPIRES_AT,
      now: NOW
    });
    const service = serviceWith({
      createOpenChallengeForTelegramUser
    });
    const { ctx, editMessageText, reply } = createCallbackContext(42);

    await handleDuelCallback(ctx, { type: "new" }, service, {
      presence: createPresence(),
      botUsername: "kvestarnia_dev_bot"
    });

    expect(createOpenChallengeForTelegramUser).toHaveBeenCalledWith(42n, {
      contextChatId: -100n,
      ignoreResourceWarning: false
    });
    expect(messageText(editMessageText)).toContain("Окреме повідомлення з інвайтом можна переслати в приват або чат.");
    expect(messageText(editMessageText)).not.toContain(`https://t.me/kvestarnia_dev_bot?start=duel_${TOKEN}`);
    expect(messageText(editMessageText)).toContain("Запрошує: <b>Автор Виклику</b> · Пересічні Пригодники · рівень 3");
    expect(messageText(editMessageText)).toContain("Виклик уже на столі. Погляд такий, ніби це стратегія.");
    expect(messageText(editMessageText)).not.toContain("Автор Виклику ставить виклик");
    expect(reply).toHaveBeenCalledTimes(1);
    expect(reply.mock.calls[0]?.[0]).toContain("🥊 <b>Дружній корчемний виклик</b>");
    expect(reply.mock.calls[0]?.[0]).toContain(
      "<b>Автор Виклику</b> лишає рукавицю на столі й удає, що це не виглядає підозріло урочисто."
    );
    expect(reply.mock.calls[0]?.[0]).not.toContain("рівень 3 лишає");
    expect(reply.mock.calls[0]?.[0]).toContain(`https://t.me/kvestarnia_dev_bot?start=duel_${TOKEN}`);
    expect(reply.mock.calls[0]?.[1]).toEqual({ parse_mode: "HTML" });
  });

  it("explains missing bot username instead of silently hiding the invite link", async () => {
    const challenger = makeCharacterSummary("Автор Виклику");
    const createOpenChallengeForTelegramUser = vi.fn().mockResolvedValue({
      state: "pending",
      challenge: makeChallenge("pending"),
      challenger,
      expiresAt: EXPIRES_AT,
      now: NOW
    });
    const service = serviceWith({
      createOpenChallengeForTelegramUser
    });
    const { ctx, editMessageText, reply } = createCallbackContext(42);

    await handleDuelCallback(ctx, { type: "new" }, service, {
      presence: createPresence()
    });

    expect(messageText(editMessageText)).toContain(
      "⚠️ Посилання для копіювання ще не зібралося: Корчмар не знає username цього бота."
    );
    expect(reply).not.toHaveBeenCalled();
  });

  it("asks for confirmation before creating an invite with partial challenger resources", async () => {
    const createOpenChallengeForTelegramUser = vi.fn().mockResolvedValue({
      state: "resource-warning",
      character: makeCharacterSummary("Втомлений Автор"),
      warning: {
        hpBelowMax: true,
        manaBelowMax: false
      }
    });
    const markAction = vi.fn().mockResolvedValue(undefined);
    const service = serviceWith({
      createOpenChallengeForTelegramUser
    });
    const { ctx, editMessageText, reply } = createCallbackContext(42);

    await handleDuelCallback(ctx, { type: "new" }, service, {
      presence: createPresence(markAction),
      botUsername: "kvestarnia_dev_bot"
    });

    expect(messageText(editMessageText)).toContain("Кидати виклик зараз?");
    expect(messageText(editMessageText)).toContain("Попередження: здоров’я не повне.");
    expect(keyboardJson(editMessageText)).toContain("v1:duel:new-risk");
    expect(reply).not.toHaveBeenCalled();
    expect(markAction).not.toHaveBeenCalled();
  });

  it("creates the invite after the challenger confirms partial resources", async () => {
    const challenger = makeCharacterSummary("Втомлений Автор");
    const createOpenChallengeForTelegramUser = vi.fn().mockResolvedValue({
      state: "pending",
      challenge: makeChallenge("pending"),
      challenger,
      challengerResourceWarning: {
        hpBelowMax: true,
        manaBelowMax: false
      },
      expiresAt: EXPIRES_AT,
      now: NOW
    });
    const service = serviceWith({
      createOpenChallengeForTelegramUser
    });
    const { ctx, reply } = createCallbackContext(42);

    await handleDuelCallback(ctx, { type: "new-risk" }, service, {
      presence: createPresence(),
      botUsername: "kvestarnia_dev_bot"
    });

    expect(createOpenChallengeForTelegramUser).toHaveBeenCalledWith(42n, {
      contextChatId: -100n,
      ignoreResourceWarning: true
    });
    expect(reply).toHaveBeenCalledTimes(1);
    expect(reply.mock.calls[0]?.[0]).toContain(`https://t.me/kvestarnia_dev_bot?start=duel_${TOKEN}`);
  });

  it("hides the new challenge button after showing the level gate", async () => {
    const createOpenChallengeForTelegramUser = vi.fn().mockResolvedValue({
      state: "level-gated",
      character: makeCharacterSummary("Ігровий Майстер"),
      minLevel: 3
    });
    const service = serviceWith({
      createOpenChallengeForTelegramUser
    });
    const { ctx, editMessageText } = createCallbackContext(42);

    await handleDuelCallback(ctx, { type: "new" }, service, {
      presence: createPresence()
    });

    expect(messageText(editMessageText)).toContain("Бійцівський куток ще не видає рукавиць");
    expect(keyboardJson(editMessageText)).not.toContain("v1:duel:new");
    expect(keyboardJson(editMessageText)).toContain("v1:quest:list");
    expect(keyboardJson(editMessageText)).toContain("v1:place:hall");
  });

  it("keeps a pending open invite card stable when a non-owner presses cancel", async () => {
    const challenger = makeCharacterSummary("Автор Виклику");
    const challenge = makeChallenge("pending");
    const cancelForTelegramUser = vi.fn().mockResolvedValue({
      state: "not-owner",
      challenge,
      challenger
    });
    const service = serviceWith({
      cancelForTelegramUser
    });
    const { ctx, answerCallbackQuery, editMessageText } = createCallbackContext(77);

    await handleDuelCallback(ctx, { type: "cancel", token: TOKEN }, service, {
      presence: createPresence()
    });

    expect(cancelForTelegramUser).toHaveBeenCalledWith(77n, TOKEN);
    expect(answerCallbackQuery).toHaveBeenCalledWith({
      text: "Це чужий виклик. Скасувати може тільки автор."
    });
    expect(editMessageText).not.toHaveBeenCalled();
  });

  it("keeps a pending open invite card stable when a player declines an open invite", async () => {
    const challenger = makeCharacterSummary("Автор Виклику");
    const challenge = makeChallenge("pending");
    const declineForTelegramUser = vi.fn().mockResolvedValue({
      state: "open-invite",
      challenge,
      challenger
    });
    const service = serviceWith({
      declineForTelegramUser
    });
    const { ctx, answerCallbackQuery, editMessageText } = createCallbackContext(88);

    await handleDuelCallback(ctx, { type: "decline", token: TOKEN }, service, {
      presence: createPresence()
    });

    expect(declineForTelegramUser).toHaveBeenCalledWith(88n, TOKEN);
    expect(answerCallbackQuery).toHaveBeenCalledWith({
      text: "Ви не прийняли виклик. Він лишається на столі для інших."
    });
    expect(editMessageText).not.toHaveBeenCalled();
  });

  it("keeps a pending open invite card stable when the challenger accepts their own invite", async () => {
    const challenger = makeCharacterSummary("Автор Виклику");
    const acceptForTelegramUser = vi.fn().mockResolvedValue({
      state: "self-challenge",
      challenge: makeChallenge("pending"),
      challenger
    });
    const markAction = vi.fn().mockResolvedValue(undefined);
    const service = serviceWith({
      acceptForTelegramUser
    });
    const { ctx, answerCallbackQuery, editMessageText } = createCallbackContext(42);

    await handleDuelCallback(ctx, { type: "accept", token: TOKEN }, service, {
      presence: createPresence(markAction)
    });

    expect(acceptForTelegramUser).toHaveBeenCalledWith(42n, TOKEN, {
      ignoreResourceWarning: false
    });
    expect(answerCallbackQuery).toHaveBeenCalledWith({
      text: "Самодуель не записуємо. Виклик лишається відкритим; для внутрішніх конфліктів є Допельґанґер."
    });
    expect(editMessageText).not.toHaveBeenCalled();
    expect(markAction).not.toHaveBeenCalled();
  });

  it("lets the challenger cancel and replaces the card with stable cancelled state", async () => {
    const challenger = makeCharacterSummary("Автор Виклику");
    const service = serviceWith({
      cancelForTelegramUser: vi.fn().mockResolvedValue({
        state: "cancelled",
        challenge: makeChallenge("cancelled"),
        challenger
      })
    });
    const { ctx, answerCallbackQuery, editMessageText } = createCallbackContext(42);

    await handleDuelCallback(ctx, { type: "cancel", token: TOKEN }, service, {
      presence: createPresence()
    });

    expect(answerCallbackQuery).toHaveBeenCalledWith(undefined);
    expect(editMessageText).toHaveBeenCalledTimes(1);
    expect(keyboardJson(editMessageText)).toContain("v1:duel:new");
    expect(keyboardJson(editMessageText)).not.toContain(`v1:duel:cancel:${TOKEN}`);
  });

  it("lets a real accept resolve the card", async () => {
    const challenger = makeCharacterSummary("Автор Виклику", { level: 9, remortCount: 3 });
    const target = makeCharacterSummary("Ціль Виклику", { level: 3 });
    const markAction = vi.fn().mockResolvedValue(undefined);
    const presence = createPresence(markAction);
    const acceptForTelegramUser = vi.fn().mockResolvedValue({
      state: "resolved",
      challenge: makeChallenge("resolved", makeCharacter(99n, "Ціль Виклику")),
      challenger,
      target,
      result: {
        outcome: "target",
        winnerCharacterId: "character-99",
        loserCharacterId: "character-42",
        challengerScore: 7,
        targetScore: 9,
        swing: 0,
        flavorKey: "paperwork-stall"
      }
    });
    const service = serviceWith({
      acceptForTelegramUser
    });
    const { ctx, answerCallbackQuery, editMessageText } = createCallbackContext(99);

    await handleDuelCallback(ctx, { type: "accept", token: TOKEN }, service, {
      presence
    });

    expect(acceptForTelegramUser).toHaveBeenCalledWith(99n, TOKEN, {
      ignoreResourceWarning: false
    });
    expect(markAction).toHaveBeenCalled();
    expect(answerCallbackQuery).toHaveBeenCalledWith(undefined);
    expect(editMessageText).toHaveBeenCalledTimes(1);
    const text = messageText(editMessageText);
    expect(text).toContain(
      "Це збережений результат цього виклику. Повторний перехід за посиланням покаже його знову, а не почне нову дуель."
    );
    expect(text).toContain("<b>Автор Виклику</b> · рівень 9 (реморт: 3) ⚔️ <b>Ціль Виклику</b> · рівень 3");
    expect(text).toContain("Перший і останній хід:");
    expect(text.indexOf("Перший і останній хід:")).toBeLessThan(text.indexOf("Ціль Виклику зупиняє сутичку"));
    expect(text.indexOf("Ціль Виклику зупиняє сутичку")).toBeLessThan(
      text.indexOf("🏁 <b>Ціль Виклику</b> перемагає у корчемному виклику")
    );
    expect(text).toContain("<i>Без XP, золота й манаток. Це корчемний запис для слави, не фарм.</i>");
    expect(text).not.toContain("рейтингу");
    expect(keyboardJson(editMessageText)).toContain("v1:duel:new");
  });

  it("keeps resource-warning accept flow on the warning keyboard", async () => {
    const service = serviceWith({
      acceptForTelegramUser: vi.fn().mockResolvedValue({
        state: "resource-warning",
        challenge: makeChallenge("pending"),
        challenger: makeCharacterSummary("Автор Виклику"),
        target: makeCharacterSummary("Втомлена Ціль", { level: 4 }),
        warning: {
          hpBelowMax: true,
          manaBelowMax: true
        }
      })
    });
    const { ctx, editMessageText } = createCallbackContext(99);

    await handleDuelCallback(ctx, { type: "accept", token: TOKEN }, service, {
      presence: createPresence()
    });

    const keyboard = keyboardJson(editMessageText);

    expect(messageText(editMessageText)).toContain("Запрошує: <b>Автор Виклику</b> · Пересічні Пригодники · рівень 3");
    expect(messageText(editMessageText)).toContain("Ви: <b>Втомлена Ціль</b> · Пересічні Пригодники · рівень 4");
    expect(keyboard).toContain(`v1:duel:accept-risk:${TOKEN}`);
    expect(keyboard).toContain(`v1:duel:decline:${TOKEN}`);
    expect(keyboard).not.toContain("v1:duel:new");
  });

  it("replays expired cards as terminal result cards", async () => {
    const getByToken = vi.fn().mockResolvedValue({
      state: "expired",
      challenge: makeChallenge("expired"),
      challenger: makeCharacterSummary("Автор Виклику")
    });
    const service = serviceWith({
      getByToken
    });
    const { ctx, editMessageText } = createCallbackContext(99);

    await handleDuelCallback(ctx, { type: "view", token: TOKEN }, service, {
      presence: createPresence()
    });

    expect(getByToken).toHaveBeenCalledWith(TOKEN);
    expect(editMessageText).toHaveBeenCalledTimes(1);
    expect(messageText(editMessageText)).toContain(
      "Це старий запис цього виклику. Повторний перехід за посиланням не створить нову дуель."
    );
    expect(keyboardJson(editMessageText)).toContain("v1:duel:new");
    expect(keyboardJson(editMessageText)).not.toContain(`v1:duel:accept:${TOKEN}`);
  });
});

function createCallbackContext(userId: number): {
  ctx: Context;
  answerCallbackQuery: ReturnType<typeof vi.fn>;
  editMessageText: ReturnType<typeof vi.fn>;
  reply: ReturnType<typeof vi.fn>;
} {
  const answerCallbackQuery = vi.fn().mockResolvedValue(true);
  const editMessageText = vi.fn().mockResolvedValue(true);
  const reply = vi.fn().mockResolvedValue(true);
  const ctx = {
    from: {
      id: userId,
      is_bot: false,
      first_name: "Тест"
    },
    chat: {
      id: -100,
      type: "group"
    },
    callbackQuery: {
      id: "callback-1",
      message: {
        message_id: 10,
        chat: {
          id: -100,
          type: "group"
        }
      }
    },
    answerCallbackQuery,
    editMessageText,
    reply
  } as unknown as Context;

  return { ctx, answerCallbackQuery, editMessageText, reply };
}

function createPresence(markAction: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined)): PresenceService {
  return {
    markAction,
    getCurrentPlaceForTelegramUser: vi.fn().mockResolvedValue({
      state: "ready",
      locationId: "location.korchma.fighting_corner",
      locationName: "Бійцівський куток",
      insideKorchma: true
    })
  } as unknown as PresenceService;
}

function serviceWith(methods: Partial<DuelChallengeService>): DuelChallengeService {
  return methods as DuelChallengeService;
}

function keyboardJson(editMessageText: ReturnType<typeof vi.fn>): string {
  const call = editMessageText.mock.calls[0] as [string, { reply_markup?: unknown }?] | undefined;

  return JSON.stringify(call?.[1]?.reply_markup);
}

function messageText(editMessageText: ReturnType<typeof vi.fn>): string {
  const call = editMessageText.mock.calls[0] as [string, { reply_markup?: unknown }?] | undefined;

  return call?.[0] ?? "";
}

function makeChallenge(
  status: DuelChallengeRecord["status"],
  target: DuelCharacterSnapshot | null = null
): DuelChallengeRecord {
  return {
    id: "duel-1",
    challengerCharacterId: "character-42",
    targetCharacterId: target?.id ?? null,
    contextChatId: -100n,
    inviteToken: TOKEN,
    status,
    expiresAt: EXPIRES_AT,
    resolvedAt: status === "resolved" ? NOW : null,
    result:
      status === "resolved"
        ? {
            outcome: "target",
            winnerCharacterId: target?.id ?? null,
            loserCharacterId: "character-42",
            challengerScore: 7,
            targetScore: 9,
            swing: 0,
            flavorKey: "paperwork-stall"
          }
        : null,
    createdAt: NOW,
    updatedAt: NOW,
    challenger: makeCharacter(42n, "Автор Виклику"),
    target
  };
}

function makeCharacter(telegramUserId: bigint, name: string): DuelCharacterSnapshot {
  return {
    id: `character-${telegramUserId.toString()}`,
    telegramUserId,
    userId: `user-${telegramUserId.toString()}`,
    name,
    pronoun: "they",
    path: "path.boundary",
    raceId: "race.human-ish",
    classId: "class.warrior",
    level: 3,
    xp: 25,
    gold: 0,
    hpCurrent: 24,
    hpMax: 24,
    manaCurrent: 12,
    manaMax: 12,
    statsJson: {
      strength: 7,
      dexterity: 7,
      intelligence: 6,
      charisma: 6,
      luck: 6
    },
    equipment: []
  };
}

function makeCharacterSummary(
  name: string,
  overrides: Partial<Pick<CharacterSummary, "level" | "remortCount">> = {}
): CharacterSummary {
  return {
    name,
    pronoun: "they",
    pronounLabel: "Вони",
    path: "boundary",
    raceId: "race.human-ish",
    raceName: "Людисько",
    classId: "class.warrior",
    className: "Воїн",
    title: "Пересічні Пригодники",
    level: overrides.level ?? 3,
    remortCount: overrides.remortCount,
    xp: 25,
    nextLevelXp: 50,
    xpToNextLevel: 25,
    gold: 0,
    hpCurrent: 24,
    hpMax: 24,
    manaCurrent: 12,
    manaMax: 12,
    stats: {
      strength: 7,
      dexterity: 7,
      intelligence: 6,
      charisma: 6,
      luck: 6
    },
    levelBonus: {
      hpMax: 0,
      manaMax: 0,
      primaryStat: {
        stat: "strength",
        bonus: 0
      }
    }
  };
}
