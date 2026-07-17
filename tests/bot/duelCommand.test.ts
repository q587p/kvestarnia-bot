import type { Context } from "grammy";
import { describe, expect, it, vi } from "vitest";
import { handleDuelCallback } from "../../src/bot/commands/duelCommand";
import type {
  DuelChallengeRecord,
  DuelCharacterSnapshot,
  DuelCombatSessionRecord
} from "../../src/db/repositories/duelChallengeRepository";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";
import type { DuelChallengeService } from "../../src/services/duelChallengeService";
import type { PresenceService } from "../../src/services/presenceService";

const TOKEN = "abcDEF12";
const NOW = new Date("2026-06-17T18:00:00.000Z");
const EXPIRES_AT = new Date("2026-06-17T18:13:00.000Z");

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
    expect(reply.mock.calls[0]?.[0]).toContain("<b>Автор Виклику</b>");
    expect(reply.mock.calls[0]?.[0]).toContain("⚡ Формат: миттєва дуель — результат одразу після згоди.");
    expect(reply.mock.calls[0]?.[0]).toContain("⚖️ Корчмар тимчасово зрівняє досвід.");
    expect(reply.mock.calls[0]?.[0]).not.toContain("рівень 3 лишає");
    expect(reply.mock.calls[0]?.[0]).toContain(`https://t.me/kvestarnia_dev_bot?start=duel_${TOKEN}`);
    expect(reply.mock.calls[0]?.[1]).toMatchObject({ parse_mode: "HTML" });
    expect(JSON.stringify(reply.mock.calls[0]?.[1])).toContain("🎲 Інший текст");
    expect(JSON.stringify(reply.mock.calls[0]?.[1])).toContain(`v1:duel:inv:${TOKEN}:`);
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

  it("uses a duel-specific gate when a new challenge starts outside the korchma", async () => {
    const createOpenChallengeForTelegramUser = vi.fn();
    const markAction = vi.fn().mockResolvedValue(undefined);
    const service = serviceWith({
      createOpenChallengeForTelegramUser
    });
    const { ctx, editMessageText, reply } = createCallbackContext(42);

    await handleDuelCallback(ctx, { type: "new" }, service, {
      presence: createPresence(markAction, {
        locationId: "location.korchma.front",
        locationName: "Надвір",
        insideKorchma: false
      }),
      botUsername: "kvestarnia_dev_bot"
    });

    expect(createOpenChallengeForTelegramUser).not.toHaveBeenCalled();
    expect(markAction).not.toHaveBeenCalled();
    expect(messageText(editMessageText)).toContain("Дружні виклики кидають у Бійцівському кутку Корчми.");
    expect(messageText(editMessageText)).not.toContain("Квести видають усередині.");
    expect(keyboardJson(editMessageText)).toContain("v1:place:hall");
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

    expect(messageText(editMessageText)).toContain("Кидати миттєву дуель зараз?");
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

  it("lets the invite owner rotate only the forwardable invite copy", async () => {
    const getInviteRotationForTelegramUser = vi.fn().mockResolvedValue({
      state: "ready",
      challenge: makeChallenge("pending"),
      challenger: makeCharacterSummary("Автор & <Виклику>")
    });
    const service = serviceWith({
      getInviteRotationForTelegramUser
    });
    const { ctx, answerCallbackQuery, editMessageText } = createCallbackContext(42);

    await handleDuelCallback(ctx, { type: "invite", token: TOKEN, templateIndex: 0 }, service, {
      presence: createPresence(),
      botUsername: "kvestarnia_dev_bot"
    });

    expect(getInviteRotationForTelegramUser).toHaveBeenCalledWith(42n, TOKEN);
    expect(answerCallbackQuery).toHaveBeenCalledWith(undefined);
    expect(editMessageText).toHaveBeenCalledTimes(1);
    expect(messageText(editMessageText)).toContain("Автор &amp; &lt;Виклику&gt;");
    expect(messageText(editMessageText)).toContain(`https://t.me/kvestarnia_dev_bot?start=duel_${TOKEN}`);
    expect(messageText(editMessageText)).toContain("⚡ Формат: миттєва дуель");
    expect(keyboardJson(editMessageText)).toContain(`v1:duel:inv:${TOKEN}:`);
    expect(keyboardJson(editMessageText)).not.toContain(`v1:duel:accept:${TOKEN}`);
  });

  it("does not edit invite copy when a bystander presses the rotate button", async () => {
    const getInviteRotationForTelegramUser = vi.fn().mockResolvedValue({
      state: "not-owner",
      challenge: makeChallenge("pending"),
      challenger: makeCharacterSummary("Автор Виклику")
    });
    const service = serviceWith({
      getInviteRotationForTelegramUser
    });
    const { ctx, answerCallbackQuery, editMessageText } = createCallbackContext(77);

    await handleDuelCallback(ctx, { type: "invite", token: TOKEN, templateIndex: 0 }, service, {
      presence: createPresence(),
      botUsername: "kvestarnia_dev_bot"
    });

    expect(getInviteRotationForTelegramUser).toHaveBeenCalledWith(77n, TOKEN);
    expect(answerCallbackQuery).toHaveBeenCalledWith({
      text: "Інший текст може вибрати тільки автор виклику."
    });
    expect(editMessageText).not.toHaveBeenCalled();
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

  it("preserves the configured invite link when decline re-renders a pending challenge", async () => {
    const challenger = makeCharacterSummary("Автор Виклику");
    const challenge = makeChallenge("pending");
    const declineForTelegramUser = vi.fn().mockResolvedValue({
      state: "pending",
      challenge,
      challenger,
      challengerResourceWarning: null,
      expiresAt: EXPIRES_AT,
      now: NOW
    });
    const service = serviceWith({
      declineForTelegramUser
    });
    const { ctx, editMessageText, reply } = createCallbackContext(88);

    await handleDuelCallback(ctx, { type: "decline", token: TOKEN }, service, {
      presence: createPresence(),
      botUsername: "kvestarnia_dev_bot"
    });

    expect(declineForTelegramUser).toHaveBeenCalledWith(88n, TOKEN);
    expect(messageText(editMessageText)).toContain("Окреме повідомлення з інвайтом можна переслати в приват або чат.");
    expect(messageText(editMessageText)).not.toContain("Посилання для копіювання ще не зібралося");
    expect(reply).not.toHaveBeenCalled();
  });

  it("notifies the challenger when a targeted invite is declined", async () => {
    const target = makeCharacter(99n, "Ціль & Виклику");
    const service = serviceWith({
      declineForTelegramUser: vi.fn().mockResolvedValue({
        state: "declined",
        transitioned: true,
        challenge: makeChallenge("declined", target),
        challenger: makeCharacterSummary("Автор Виклику")
      })
    });
    const { ctx, answerCallbackQuery, editMessageText, sendMessage } = createCallbackContext(99);

    await handleDuelCallback(ctx, { type: "decline", token: TOKEN }, service, {
      presence: createPresence()
    });

    expect(answerCallbackQuery).toHaveBeenCalledWith(undefined);
    expect(editMessageText).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0]?.[0]).toBe(42);
    expect(sendMessage.mock.calls[0]?.[1]).toContain("Виклик відхилено");
    expect(sendMessage.mock.calls[0]?.[1]).toContain("<b>Ціль &amp; Виклику</b> не приймає ваш виклик");
    expect(JSON.stringify(sendMessage.mock.calls[0]?.[2])).toContain("v1:quest:list");
    expect(JSON.stringify(sendMessage.mock.calls[0]?.[2])).not.toContain(`v1:duel:accept:${TOKEN}`);
  });

  it("does not notify the challenger again on replayed decline", async () => {
    const target = makeCharacter(99n, "Ціль Виклику");
    const service = serviceWith({
      declineForTelegramUser: vi.fn().mockResolvedValue({
        state: "declined",
        transitioned: false,
        challenge: makeChallenge("declined", target),
        challenger: makeCharacterSummary("Автор Виклику")
      })
    });
    const { ctx, sendMessage } = createCallbackContext(99);

    await handleDuelCallback(ctx, { type: "decline", token: TOKEN }, service, {
      presence: createPresence()
    });

    expect(sendMessage).not.toHaveBeenCalled();
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
      confirmed: false,
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

  it("notifies the targeted recipient when the challenger cancels", async () => {
    const target = makeCharacter(99n, "Ціль Виклику");
    const challenger = makeCharacterSummary("Автор Виклику");
    const service = serviceWith({
      cancelForTelegramUser: vi.fn().mockResolvedValue({
        state: "cancelled",
        transitioned: true,
        challenge: makeChallenge("cancelled", target),
        challenger,
        target: makeCharacterSummary("Ціль Виклику")
      })
    });
    const { ctx, answerCallbackQuery, editMessageText, sendMessage } = createCallbackContext(42);

    await handleDuelCallback(ctx, { type: "cancel", token: TOKEN }, service, {
      presence: createPresence()
    });

    expect(answerCallbackQuery).toHaveBeenCalledWith(undefined);
    expect(editMessageText).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0]?.[0]).toBe(99);
    expect(sendMessage.mock.calls[0]?.[1]).toContain("Виклик скасовано");
    expect(JSON.stringify(sendMessage.mock.calls[0]?.[2])).toContain("v1:quest:list");
    expect(JSON.stringify(sendMessage.mock.calls[0]?.[2])).not.toContain(`v1:duel:accept:${TOKEN}`);
  });

  it("does not broadcast open invite cancellation", async () => {
    const challenger = makeCharacterSummary("Автор Виклику");
    const service = serviceWith({
      cancelForTelegramUser: vi.fn().mockResolvedValue({
        state: "cancelled",
        transitioned: true,
        challenge: makeChallenge("cancelled"),
        challenger
      })
    });
    const { ctx, sendMessage } = createCallbackContext(42);

    await handleDuelCallback(ctx, { type: "cancel", token: TOKEN }, service, {
      presence: createPresence()
    });

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("does not notify targeted cancellation again on replayed cancel", async () => {
    const target = makeCharacter(99n, "Ціль Виклику");
    const service = serviceWith({
      cancelForTelegramUser: vi.fn().mockResolvedValue({
        state: "cancelled",
        transitioned: false,
        challenge: makeChallenge("cancelled", target),
        challenger: makeCharacterSummary("Автор Виклику")
      })
    });
    const { ctx, sendMessage } = createCallbackContext(42);

    await handleDuelCallback(ctx, { type: "cancel", token: TOKEN }, service, {
      presence: createPresence()
    });

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("asks for confirmation before accepting with full resources", async () => {
    const acceptForTelegramUser = vi.fn().mockResolvedValue({
      state: "confirmation",
      challenge: makeChallenge("pending", makeCharacter(99n, "Ціль Виклику")),
      challenger: makeCharacterSummary("Автор Виклику", { level: 9 }),
      target: makeCharacterSummary("Ціль Виклику", { level: 3 })
    });
    const service = serviceWith({
      acceptForTelegramUser
    });
    const { ctx, editMessageText } = createCallbackContext(99);

    await handleDuelCallback(ctx, { type: "accept", token: TOKEN }, service, {
      presence: createPresence()
    });

    expect(acceptForTelegramUser).toHaveBeenCalledWith(99n, TOKEN, {
      confirmed: false,
      ignoreResourceWarning: false
    });
    expect(messageText(editMessageText)).toContain("⚡ <b>Прийняти миттєву дуель?</b>\n\nЗапрошує:");
    expect(messageText(editMessageText)).toContain(
      "Запрошує: <b>Автор Виклику</b> · <i>Пересічні Пригодники</i> · рівень 9"
    );
    expect(messageText(editMessageText)).toContain(
      "Ви: <b>Ціль Виклику</b> · <i>Пересічні Пригодники</i> · рівень 3"
    );
    expect(messageText(editMessageText)).toContain(
      "у безпечному корчемному порядку.\nРезультат з’явиться одразу після згоди."
    );
    expect(keyboardJson(editMessageText)).toContain(`v1:duel:accept-risk:${TOKEN}`);
    expect(keyboardJson(editMessageText)).toContain(`v1:duel:decline:${TOKEN}`);
    expect(keyboardJson(editMessageText)).not.toContain(`v1:duel:rematch:${TOKEN}`);
    expect(keyboardJson(editMessageText)).toContain("🤝 Так, прийняти");
    expect(keyboardJson(editMessageText)).not.toContain("📖 Детальніше");
  });

  it("lets a confirmed accept resolve the card", async () => {
    const challenger = makeCharacterSummary("Автор Виклику", { level: 9, remortCount: 3 });
    const target = makeCharacterSummary("Ціль Виклику", { level: 3 });
    const markAction = vi.fn().mockResolvedValue(undefined);
    const presence = createPresence(markAction);
    const acceptForTelegramUser = vi.fn().mockResolvedValue({
      state: "resolved",
      transitioned: true,
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
    const { ctx, answerCallbackQuery, editMessageText, sendMessage } = createCallbackContext(99, "private");

    await handleDuelCallback(ctx, { type: "accept-risk", token: TOKEN }, service, {
      presence
    });

    expect(acceptForTelegramUser).toHaveBeenCalledWith(99n, TOKEN, {
      confirmed: true,
      ignoreResourceWarning: true
    });
    expect(markAction).toHaveBeenCalled();
    expect(answerCallbackQuery).toHaveBeenCalledWith(undefined);
    expect(editMessageText).toHaveBeenCalledTimes(1);
    const text = messageText(editMessageText);
    expect(text).not.toContain("Прийняти миттєву дуель?");
    expect(text).not.toContain("Повторний перехід");
    expect(text).not.toContain("це той самий результат");
    expect(text).toContain("<b>Автор Виклику</b> · рівень 9 (реморт: 3) ⚔️ <b>Ціль Виклику</b> · рівень 3");
    expect(text).toContain("Перший і останній хід:");
    const lines = text.split("\n");
    const moveHeaderIndex = lines.indexOf("Перший і останній хід:");
    const flavorLine = lines[moveHeaderIndex + 2] ?? "";

    expect(flavorLine).toContain("<b>Ціль Виклику</b>");
    expect(flavorLine).toContain("<b>Автор Виклику</b>");
    expect(moveHeaderIndex).toBeGreaterThan(-1);
    expect(text.indexOf(flavorLine)).toBeLessThan(
      text.indexOf("🏁 <b>Ціль Виклику</b> перемагає у миттєвій дуелі")
    );
    expect(text).toContain("<i>Без XP, золота й манаток. Це корчемний запис для слави, а не спосіб заробітку.</i>");
    expect(text).not.toContain("рейтингу");
    expect(keyboardJson(editMessageText)).toContain(`v1:duel:rematch:${TOKEN}`);
    expect(keyboardJson(editMessageText)).toContain(`v1:duel:share:${TOKEN}`);
    expect(keyboardJson(editMessageText)).toContain("v1:duel:new");
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0]?.[0]).toBe(42);
    expect(sendMessage.mock.calls[0]?.[1]).toContain("Результат миттєвої дуелі");
    expect(sendMessage.mock.calls[0]?.[1]).toContain(
      "Запис збережено: це той самий результат, без повторного кидка."
    );
    expect(JSON.stringify(sendMessage.mock.calls[0]?.[2])).toContain(`v1:duel:rematch:${TOKEN}`);
    expect(JSON.stringify(sendMessage.mock.calls[0]?.[2])).toContain(`v1:duel:share:${TOKEN}`);
  });

  it("sends a separate turn-based duel intro when accepting starts active combat", async () => {
    const target = makeCharacter(99n, "Ціль Виклику");
    const activeSession = makeTurnBasedSession("active", target);
    const acceptForTelegramUser = vi.fn().mockResolvedValue({
      state: "active",
      transitioned: true,
      challenge: {
        ...makeChallenge("active", target),
        mode: "turn-based"
      },
      challenger: makeCharacterSummary("Автор Виклику"),
      target: makeCharacterSummary("Ціль Виклику"),
      session: activeSession,
      turnExpiresAt: activeSession.turnExpiresAt,
      now: NOW
    });
    const recordTurnBasedMessageReference = vi.fn().mockResolvedValue(undefined);
    const service = serviceWith({
      acceptForTelegramUser,
      recordTurnBasedMessageReference
    });
    const { ctx, answerCallbackQuery, editMessageText, reply, sendMessage } = createCallbackContext(99, "private");

    await handleDuelCallback(ctx, { type: "accept", token: TOKEN }, service, {
      presence: createPresence()
    });

    expect(answerCallbackQuery).toHaveBeenCalledWith(undefined);
    expect(reply).toHaveBeenCalledTimes(1);
    expect(String(reply.mock.calls[0]?.[0])).toContain("♟️ <b>Покрокова дуель</b>");
    expect(String(reply.mock.calls[0]?.[0])).toContain("Перший кухоль: <b>Автор Виклику</b>");
    expect(String(reply.mock.calls[0]?.[0])).toContain("Другий кухоль: <b>Ціль Виклику</b>");
    expect(String(reply.mock.calls[0]?.[0])).toContain("<i>Порада дня:");
    expect(messageText(editMessageText)).toContain("♟️ <b>Покрокова дуель: хід 2</b>");
    expect(messageText(editMessageText)).not.toContain("Порада дня:");
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage.mock.calls[0]?.[0]).toBe(42);
    expect(String(sendMessage.mock.calls[0]?.[1])).toContain("♟️ <b>Покрокова дуель</b>");
    expect(sendMessage.mock.calls[1]?.[0]).toBe(42);
    expect(String(sendMessage.mock.calls[1]?.[1])).toContain("♟️ <b>Покрокова дуель: хід 2</b>");
  });

  it("does not notify the other quick-duel participant on replayed accept", async () => {
    const target = makeCharacter(99n, "Ціль Виклику");
    const acceptForTelegramUser = vi.fn().mockResolvedValue({
      state: "resolved",
      transitioned: false,
      challenge: makeChallenge("resolved", target),
      challenger: makeCharacterSummary("Автор Виклику"),
      target: makeCharacterSummary("Ціль Виклику"),
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
    const service = serviceWith({ acceptForTelegramUser });
    const { ctx, sendMessage } = createCallbackContext(99);

    await handleDuelCallback(ctx, { type: "accept-risk", token: TOKEN }, service, {
      presence: createPresence()
    });

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("renders the canonical result card immediately after a terminal turn action", async () => {
    const target = makeCharacter(99n, "Ціль Виклику");
    const terminalSession = makeTurnBasedSession("forfeited", target);
    const resolveTurnBasedActionForTelegramUser = vi.fn().mockResolvedValue({
      state: "updated",
      session: terminalSession
    });
    const getByToken = vi.fn().mockResolvedValue({
      state: "resolved",
      challenge: {
        ...makeChallenge("resolved", target),
        mode: "turn-based"
      },
      challenger: makeCharacterSummary("Автор Виклику"),
      target: makeCharacterSummary("Ціль Виклику"),
      result: {
        mode: "turn-based",
        terminalReason: "surrender",
        outcome: "challenger",
        winnerCharacterId: "character-42",
        loserCharacterId: "character-99",
        challengerScore: 12,
        targetScore: 3,
        swing: 2,
        flavorKey: "direct-hit"
      }
    });
    const recordTurnBasedMessageReference = vi.fn().mockResolvedValue(undefined);
    const service = serviceWith({
      resolveTurnBasedActionForTelegramUser,
      getByToken,
      recordTurnBasedMessageReference
    });
    const { ctx, answerCallbackQuery, editMessageText, sendMessage } = createCallbackContext(99, "private");

    await handleDuelCallback(ctx, { type: "turn", token: TOKEN, action: "surrender", turn: 2, version: 3 }, service, {
      presence: createPresence()
    });

    expect(resolveTurnBasedActionForTelegramUser).toHaveBeenCalledWith(99n, {
      inviteToken: TOKEN,
      expectedTurn: 2,
      expectedVersion: 3,
      action: "surrender"
    });
    expect(answerCallbackQuery).toHaveBeenCalledWith(undefined);
    expect(messageText(editMessageText)).toContain("Результат покрокової дуелі");
    expect(messageText(editMessageText)).toContain("здається");
    expect(keyboardJson(editMessageText)).toContain(`v1:duel:rematch:${TOKEN}`);
    expect(keyboardJson(editMessageText)).toContain(`v1:duel:share:${TOKEN}`);
    expect(keyboardJson(editMessageText)).toContain(`v1:duel:j:${TOKEN}:0`);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0]?.[0]).toBe(42);
    expect(sendMessage.mock.calls[0]?.[1]).toContain("Результат покрокової дуелі");
    expect(recordTurnBasedMessageReference).toHaveBeenCalledWith("session-1", "challenger", {
      chatId: 42n,
      messageId: 123
    });
  });

  it("opens stored turn-based duel journal pages without replaying combat", async () => {
    const target = makeCharacter(99n, "Ціль Виклику");
    const session = makeTurnBasedSession("resolved", target);
    const getTurnBasedJournalByToken = vi.fn().mockResolvedValue({
      state: "ready",
      session,
      rounds: [
        {
          turn: 2,
          actions: [
            {
              actorCharacterId: "character-42",
              defenderCharacterId: "character-99",
              action: "attack",
              outcome: "hit",
              damage: 7,
              manaSpent: 0,
              critical: false
            }
          ]
        }
      ]
    });
    const service = serviceWith({ getTurnBasedJournalByToken });
    const { ctx, answerCallbackQuery, editMessageText } = createCallbackContext(42, "private");

    await handleDuelCallback(ctx, { type: "journal", token: TOKEN, page: 0 }, service, {
      presence: createPresence()
    });

    expect(getTurnBasedJournalByToken).toHaveBeenCalledWith(TOKEN);
    expect(answerCallbackQuery).toHaveBeenCalledWith(undefined);
    expect(messageText(editMessageText)).toContain("📜 <b>Журнал дуелі</b>");
    expect(messageText(editMessageText)).toContain("Автор Виклику атакує влучає на <b>7</b> шкоди.");
    expect(keyboardJson(editMessageText)).toContain(`v1:duel:view:${TOKEN}`);
  });

  it("keeps turn-based duel journals closed while combat is active", async () => {
    const getTurnBasedJournalByToken = vi.fn().mockResolvedValue({ state: "not-ready" });
    const service = serviceWith({ getTurnBasedJournalByToken });
    const { ctx, answerCallbackQuery, editMessageText } = createCallbackContext(42, "private");

    await handleDuelCallback(ctx, { type: "journal", token: TOKEN, page: 0 }, service, {
      presence: createPresence()
    });

    expect(getTurnBasedJournalByToken).toHaveBeenCalledWith(TOKEN);
    expect(answerCallbackQuery).toHaveBeenCalledWith({
      text: "Журнал бою буде після завершення дуелі."
    });
    expect(editMessageText).not.toHaveBeenCalled();
  });

  it("sends a first gear-action achievement notice to the turn-based duel actor", async () => {
    const target = makeCharacter(99n, "Ціль Виклику");
    const activeSession = makeTurnBasedSession("active", target);
    const resolveTurnBasedActionForTelegramUser = vi.fn().mockResolvedValue({
      state: "updated",
      session: activeSession,
      achievementUnlocksByCharacterId: {
        "character-99": [
          {
            id: "achievement.mantok.gear-action.first",
            title: "Манатка натиснула кнопку",
            cosmeticTitleGrantId: null,
            unlockedAt: new Date("2026-07-07T10:00:00.000Z")
          }
        ]
      }
    });
    const getByToken = vi.fn().mockResolvedValue({
      state: "active",
      challenge: {
        ...makeChallenge("active", target),
        mode: "turn-based"
      },
      challenger: makeCharacterSummary("Автор Виклику"),
      target: makeCharacterSummary("Ціль Виклику"),
      session: activeSession,
      turnExpiresAt: activeSession.turnExpiresAt,
      now: NOW
    });
    const recordTurnBasedMessageReference = vi.fn().mockResolvedValue(undefined);
    const service = serviceWith({
      resolveTurnBasedActionForTelegramUser,
      getByToken,
      recordTurnBasedMessageReference
    });
    const { ctx, answerCallbackQuery, editMessageText, reply, sendMessage } = createCallbackContext(99, "private");

    await handleDuelCallback(ctx, {
      type: "gear",
      token: TOKEN,
      grantKey: "rldagr",
      turn: 2,
      version: 4
    }, service, {
      presence: createPresence()
    });

    expect(answerCallbackQuery).toHaveBeenCalledWith(undefined);
    expect(messageText(editMessageText)).toContain("Покрокова дуель");
    expect(reply).toHaveBeenCalledTimes(1);
    expect(String(reply.mock.calls[0]?.[0])).toContain("Нова ачівка");
    expect(String(reply.mock.calls[0]?.[0])).toContain("Манатка натиснула кнопку");
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0]?.[0]).toBe(42);
    expect(String(sendMessage.mock.calls[0]?.[1])).toContain("Покрокова дуель");
  });

  it("does not accept turn actions from a group chat or expose private queued choices", async () => {
    const target = makeCharacter(99n, "Ціль Виклику");
    const activeSession = makeTurnBasedSession("active", target);
    activeSession.state.pendingActions = {
      target: {
        actorCharacterId: "character-99",
        action: "skill"
      }
    };
    const resolveTurnBasedActionForTelegramUser = vi.fn();
    const getByToken = vi.fn().mockResolvedValue({
      state: "active",
      challenge: {
        ...makeChallenge("active", target),
        mode: "turn-based"
      },
      challenger: makeCharacterSummary("Автор Виклику"),
      target: makeCharacterSummary("Ціль Виклику"),
      session: activeSession,
      turnExpiresAt: activeSession.turnExpiresAt,
      now: NOW
    });
    const service = serviceWith({
      resolveTurnBasedActionForTelegramUser,
      getByToken,
      recordTurnBasedMessageReference: vi.fn()
    });
    const { ctx, answerCallbackQuery, editMessageText } = createCallbackContext(99, "group");

    await handleDuelCallback(ctx, { type: "turn", token: TOKEN, action: "attack", turn: 2, version: 4 }, service, {
      presence: createPresence()
    });

    expect(resolveTurnBasedActionForTelegramUser).not.toHaveBeenCalled();
    expect(answerCallbackQuery).toHaveBeenCalledWith({
      text: "Ходи дуелі приймаються тільки в приваті з ботом."
    });
    expect(messageText(editMessageText)).toContain("Покрокова дуель");
    expect(messageText(editMessageText)).toContain("записи закритими");
    expect(messageText(editMessageText)).not.toContain("Ваш вибір");
    expect(keyboardJson(editMessageText)).not.toContain("Атакувати");
    expect(keyboardJson(editMessageText)).not.toContain("Здатися");
  });

  it.each([
    ["not-enough-mana", "Не вистачає мани для цієї дії спорядження."],
    ["skill-on-cooldown", "Дія спорядження ще відсапується."]
  ] as const)("answers turn-based gear %s callbacks with a specific gate notice", async (state, notice) => {
    const target = makeCharacter(99n, "Ціль Виклику");
    const activeSession = makeTurnBasedSession("active", target);
    const resolveTurnBasedActionForTelegramUser = vi.fn().mockResolvedValue({
      state,
      session: activeSession
    });
    const getByToken = vi.fn().mockResolvedValue({
      state: "active",
      challenge: {
        ...makeChallenge("active", target),
        mode: "turn-based"
      },
      challenger: makeCharacterSummary("Автор Виклику"),
      target: makeCharacterSummary("Ціль Виклику"),
      session: activeSession,
      turnExpiresAt: activeSession.turnExpiresAt,
      now: NOW
    });
    const service = serviceWith({
      resolveTurnBasedActionForTelegramUser,
      getByToken,
      recordTurnBasedMessageReference: vi.fn()
    });
    const { ctx, answerCallbackQuery, editMessageText } = createCallbackContext(99, "private");

    await handleDuelCallback(ctx, {
      type: "gear",
      token: TOKEN,
      grantKey: "rldagr",
      turn: 2,
      version: 4
    }, service, {
      presence: createPresence()
    });

    expect(resolveTurnBasedActionForTelegramUser).toHaveBeenCalledWith(99n, {
      inviteToken: TOKEN,
      expectedTurn: 2,
      expectedVersion: 4,
      action: "gear",
      grantKey: "rldagr"
    });
    expect(answerCallbackQuery).toHaveBeenCalledWith({ text: notice });
    expect(messageText(editMessageText)).toContain("Покрокова дуель");
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

  it("shows a game-style pair limit instead of resolving a fourth same-pair duel", async () => {
    const acceptForTelegramUser = vi.fn().mockResolvedValue({
      state: "pair-limited",
      challenge: makeChallenge("pending", makeCharacter(99n, "Ціль Виклику")),
      challenger: makeCharacterSummary("Автор Виклику"),
      target: makeCharacterSummary("Ціль Виклику"),
      count: 3,
      limit: 3,
      resetAt: new Date("2026-06-17T18:23:00.000Z")
    });
    const service = serviceWith({
      acceptForTelegramUser
    });
    const { ctx, editMessageText } = createCallbackContext(99);

    await handleDuelCallback(ctx, { type: "accept", token: TOKEN }, service, {
      presence: createPresence()
    });

    const text = messageText(editMessageText);

    expect(acceptForTelegramUser).toHaveBeenCalledWith(99n, TOKEN, {
      confirmed: false,
      ignoreResourceWarning: false
    });
    expect(text).toContain("🥊 <b>Ця пара вже нагримілася</b>\n\nПерший кухоль:");
    expect(text).toContain(
      "Перший кухоль: <b>Автор Виклику</b> · <i>Пересічні Пригодники</i> · рівень 3"
    );
    expect(text).toContain(
      "Другий кухоль: <b>Ціль Виклику</b> · <i>Пересічні Пригодники</i> · рівень 3"
    );
    expect(text).toContain("у цієї пари вже <b>3</b> дуелі");
    expect(text).toContain("поточний корчемний відтинок.\n\nНовий рядок");
    expect(text).toContain("о <b>18:23</b>");
    expect(text).toContain("запросіть когось іншого");
    expect(keyboardJson(editMessageText)).toContain("v1:duel:new");
    expect(keyboardJson(editMessageText)).not.toContain(`v1:duel:accept:${TOKEN}`);
  });

  it("does not let bystanders accept a targeted rematch card", async () => {
    const challenger = makeCharacterSummary("Автор Реваншу");
    const target = makeCharacterSummary("Ціль Реваншу");
    const markAction = vi.fn().mockResolvedValue(undefined);
    const acceptForTelegramUser = vi.fn().mockResolvedValue({
      state: "not-target",
      challenge: makeChallenge("pending", makeCharacter(99n, "Ціль Реваншу")),
      challenger,
      target
    });
    const service = serviceWith({
      acceptForTelegramUser
    });
    const { ctx, answerCallbackQuery, editMessageText } = createCallbackContext(77);

    await handleDuelCallback(ctx, { type: "accept", token: TOKEN }, service, {
      presence: createPresence(markAction)
    });

    expect(acceptForTelegramUser).toHaveBeenCalledWith(77n, TOKEN, {
      confirmed: false,
      ignoreResourceWarning: false
    });
    expect(answerCallbackQuery).toHaveBeenCalledWith({
      text: "Це адресний реванш. Корчмар чекає саме того пригодника, чиє імʼя в записі."
    });
    expect(editMessageText).not.toHaveBeenCalled();
    expect(markAction).not.toHaveBeenCalled();
  });

  it("creates a rematch invite from a resolved result card", async () => {
    const challenger = makeCharacterSummary("Автор Реваншу");
    const target = makeCharacter(99n, "Ціль Реваншу");
    const createRematchForTelegramUser = vi.fn().mockResolvedValue({
      state: "pending",
      challenge: {
        ...makeChallenge("pending", target),
        mode: "turn-based"
      },
      challenger,
      target: makeCharacterSummary("Ціль Реваншу"),
      challengerResourceWarning: null,
      expiresAt: EXPIRES_AT,
      now: NOW
    });
    const markAction = vi.fn().mockResolvedValue(undefined);
    const service = serviceWith({
      createRematchForTelegramUser
    });
    const { ctx, editMessageText, reply, sendMessage } = createCallbackContext(42);

    await handleDuelCallback(ctx, { type: "rematch", token: TOKEN }, service, {
      presence: createPresence(markAction),
      botUsername: "kvestarnia_dev_bot"
    });

    expect(createRematchForTelegramUser).toHaveBeenCalledWith(42n, TOKEN, {
      contextChatId: -100n,
      ignoreResourceWarning: false
    });
    expect(markAction).toHaveBeenCalled();
    expect(messageText(editMessageText)).toContain("Виклик уже на столі");
    expect(messageText(editMessageText)).toContain("Окреме повідомлення з інвайтом можна переслати в приват або чат.");
    expect(messageText(editMessageText)).not.toContain("Посилання для копіювання ще не зібралося");
    expect(keyboardJson(editMessageText)).toContain(`v1:duel:accept:${TOKEN}`);
    expect(reply).toHaveBeenCalledTimes(1);
    expect(reply.mock.calls[0]?.[0]).toContain(`https://t.me/kvestarnia_dev_bot?start=duel_turnbased_${TOKEN}`);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0]?.[0]).toBe(99);
    expect(String(sendMessage.mock.calls[0]?.[1])).toContain("♟️ <b>Покрокова дуель</b>");
    expect(JSON.stringify(sendMessage.mock.calls[0]?.[2])).toContain(`v1:duel:accept:${TOKEN}`);
  });

  it("keeps a resolved result card stable when a bystander presses rematch", async () => {
    const createRematchForTelegramUser = vi.fn().mockResolvedValue({
      state: "not-participant",
      challenge: makeChallenge("resolved", makeCharacter(99n, "Ціль Виклику")),
      challenger: makeCharacterSummary("Автор Виклику")
    });
    const markAction = vi.fn().mockResolvedValue(undefined);
    const service = serviceWith({
      createRematchForTelegramUser
    });
    const { ctx, answerCallbackQuery, editMessageText } = createCallbackContext(77);

    await handleDuelCallback(ctx, { type: "rematch", token: TOKEN }, service, {
      presence: createPresence(markAction)
    });

    expect(createRematchForTelegramUser).toHaveBeenCalledWith(77n, TOKEN, {
      contextChatId: -100n,
      ignoreResourceWarning: false
    });
    expect(answerCallbackQuery).toHaveBeenCalledWith({
      text: "Реванш можуть кинути тільки учасники цієї дуелі."
    });
    expect(editMessageText).not.toHaveBeenCalled();
    expect(markAction).not.toHaveBeenCalled();
  });

  it("sends a shareable saved result card without rerolling the duel", async () => {
    const target = makeCharacter(99n, "Ціль Виклику");
    const getByToken = vi.fn().mockResolvedValue({
      state: "resolved",
      challenge: makeChallenge("resolved", target),
      challenger: makeCharacterSummary("Автор Виклику", { level: 9 }),
      target: makeCharacterSummary("Ціль Виклику", { level: 3 }),
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
      getByToken
    });
    const { ctx, answerCallbackQuery, editMessageText, reply } = createCallbackContext(42);

    await handleDuelCallback(ctx, { type: "share", token: TOKEN }, service, {
      presence: createPresence()
    });

    expect(getByToken).toHaveBeenCalledWith(TOKEN);
    expect(answerCallbackQuery).toHaveBeenCalledWith(undefined);
    expect(editMessageText).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledTimes(1);
    expect(reply.mock.calls[0]?.[0]).toContain("📣 <b>Картка корчемної дуелі: ⚡ Миттєва дуель</b>");
    expect(reply.mock.calls[0]?.[0]).toContain("переміг у миттєвій корчемній дуелі");
    expect(reply.mock.calls[0]?.[0]).toContain("<i>Без XP, золота й манаток.");
    expect(reply.mock.calls[0]?.[1]).toEqual({ parse_mode: "HTML" });
  });

  it("keeps a recovered duel result usable when quest notification delivery fails", async () => {
    const getByToken = vi.fn().mockResolvedValue(makeResolvedQuickView([
      questProgressUpdate(42n)
    ]));
    const service = serviceWith({ getByToken });
    const { ctx, sendMessage } = createCallbackContext(42);
    sendMessage.mockRejectedValue(new Error("Telegram unavailable"));

    await expect(handleDuelCallback(ctx, { type: "view", token: TOKEN }, service, {
      presence: createPresence()
    })).resolves.toBeUndefined();

    expect(getByToken).toHaveBeenCalledWith(TOKEN);
    expect(sendMessage).toHaveBeenCalledWith(
      42,
      expect.stringContaining("Зараховано миттєву дуель"),
      { parse_mode: "HTML" }
    );
  });

  it("notifies both duel participants once and does not resend on idempotent result replay", async () => {
    const getByToken = vi.fn()
      .mockResolvedValueOnce(makeResolvedQuickView([
        questProgressUpdate(42n),
        questProgressUpdate(99n)
      ]))
      .mockResolvedValueOnce(makeResolvedQuickView());
    const service = serviceWith({ getByToken });
    const { ctx, sendMessage } = createCallbackContext(42);

    await handleDuelCallback(ctx, { type: "view", token: TOKEN }, service, {
      presence: createPresence()
    });
    await handleDuelCallback(ctx, { type: "view", token: TOKEN }, service, {
      presence: createPresence()
    });

    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage.mock.calls[0]?.[0]).toBe(42);
    expect(sendMessage.mock.calls[1]?.[0]).toBe(99);
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

function createCallbackContext(userId: number, chatType: "private" | "group" | "supergroup" = "group"): {
  ctx: Context;
  answerCallbackQuery: ReturnType<typeof vi.fn>;
  editMessageText: ReturnType<typeof vi.fn>;
  apiEditMessageText: ReturnType<typeof vi.fn>;
  reply: ReturnType<typeof vi.fn>;
  sendMessage: ReturnType<typeof vi.fn>;
} {
  const answerCallbackQuery = vi.fn().mockResolvedValue(true);
  const editMessageText = vi.fn().mockResolvedValue(true);
  const apiEditMessageText = vi.fn().mockResolvedValue(true);
  const reply = vi.fn().mockResolvedValue(true);
  const sendMessage = vi.fn().mockResolvedValue({ message_id: 123 });
  const chatId = chatType === "private" ? userId : -100;
  const ctx = {
    from: {
      id: userId,
      is_bot: false,
      first_name: "Тест"
    },
    chat: {
      id: chatId,
      type: chatType
    },
    callbackQuery: {
      id: "callback-1",
      message: {
        message_id: 10,
        chat: {
          id: chatId,
          type: chatType
        }
      }
    },
    api: {
      editMessageText: apiEditMessageText,
      sendMessage
    },
    answerCallbackQuery,
    editMessageText,
    reply
  } as unknown as Context;

  return { ctx, answerCallbackQuery, editMessageText, apiEditMessageText, reply, sendMessage };
}

function createPresence(
  markAction: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined),
  place: {
    locationId: string;
    locationName: string;
    insideKorchma: boolean;
  } = {
    locationId: "location.korchma.fighting_corner",
    locationName: "Бійцівський куток",
    insideKorchma: true
  }
): PresenceService {
  return {
    markAction,
    getCurrentPlaceForTelegramUser: vi.fn().mockResolvedValue({
      state: "ready",
      ...place
    })
  } as unknown as PresenceService;
}

function serviceWith(methods: Partial<DuelChallengeService>): DuelChallengeService {
  return methods as DuelChallengeService;
}

function makeResolvedQuickView(questProgressUpdates: unknown[] = []): unknown {
  const target = makeCharacter(99n, "Ціль Виклику");
  return {
    state: "resolved",
    challenge: makeChallenge("resolved", target),
    challenger: makeCharacterSummary("Автор Виклику"),
    target: makeCharacterSummary("Ціль Виклику"),
    result: {
      outcome: "target",
      winnerCharacterId: "character-99",
      loserCharacterId: "character-42",
      challengerScore: 7,
      targetScore: 9,
      swing: 0,
      flavorKey: "paperwork-stall"
    },
    ...(questProgressUpdates.length > 0 ? { questProgressUpdates } : {})
  };
}

function questProgressUpdate(telegramUserId: bigint): unknown {
  return {
    telegramUserId,
    objective: "quick-duel",
    progress: {
      accepted: true,
      trainingCompleted: false,
      quickDuelCompleted: true,
      turnBasedDuelCompleted: false,
      completedObjectives: 1,
      requiredObjectives: 3,
      readyToClaim: false,
      currentLocationId: "location.korchma.fighting_corner"
    }
  };
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
    mode: "quick",
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

function makeTurnBasedSession(
  status: "active" | "resolved" | "expired" | "forfeited",
  target: DuelCharacterSnapshot
): DuelCombatSessionRecord {
  return {
    id: "session-1",
    duelChallengeId: "duel-1",
    challengerCharacterId: "character-42",
    targetCharacterId: target.id,
    status,
    actingCharacterId: "character-99",
    turn: 2,
    version: 4,
    turnExpiresAt: new Date("2026-06-17T18:00:23.000Z"),
    completedAt: status === "active" ? null : NOW,
    challengerChatId: null,
    challengerMessageId: null,
    targetChatId: null,
    targetMessageId: null,
    createdAt: NOW,
    updatedAt: NOW,
    challenge: {
      ...makeChallenge(status === "active" ? "active" : "resolved", target),
      mode: "turn-based"
    },
    state: {
      mode: "turn-based",
      status,
      rulesVersion: "turn-based-duel-v1",
      balanceVersion: "instant-duel-v2",
      turn: 2,
      actingCharacterId: "character-99",
      participants: {
        challenger: makeTurnBasedParticipant("character-42", "Автор Виклику"),
        target: makeTurnBasedParticipant("character-99", "Ціль Виклику")
      },
      outcome: status === "active"
        ? undefined
        : {
            outcome: "challenger",
            winnerCharacterId: "character-42",
            loserCharacterId: "character-99",
            reason: "surrender"
          }
    }
  };
}

function makeTurnBasedParticipant(characterId: string, displayName: string) {
  return {
    characterId,
    displayName,
    title: "Пересічні Пригодники",
    raceId: "race.human-ish",
    raceName: "Людисько",
    classId: "class.warrior",
    className: "Воїн",
    level: 3,
    remortCount: 0,
    stats: {
      strength: 7,
      dexterity: 7,
      intelligence: 6,
      charisma: 6,
      luck: 6
    },
    hp: 12,
    hpMax: 24,
    mana: 6,
    manaMax: 12,
    combatStats: {
      level: 3,
      hpMax: 24,
      manaMax: 12,
      strength: 7,
      dexterity: 7,
      intelligence: 6,
      charisma: 6,
      luck: 6,
      classId: "class.warrior"
    },
    balanceAudit: {
      balanceVersion: "instant-duel-v2",
      originalLevel: 3,
      originalRemortCount: 0,
      effectiveCombatLevel: 3,
      progressionBudget: {
        level: 3,
        remortCount: 0,
        hpMax: 0,
        manaMax: 0,
        stats: {
          strength: 0,
          dexterity: 0,
          intelligence: 0,
          charisma: 0,
          luck: 0
        },
        score: 0
      },
      targetProgressionBudget: {
        level: 3,
        remortCount: 0,
        hpMax: 0,
        manaMax: 0,
        stats: {
          strength: 0,
          dexterity: 0,
          intelligence: 0,
          charisma: 0,
          luck: 0
        },
        score: 0
      },
      temporaryHpMax: 0,
      temporaryManaMax: 0,
      temporaryStats: {
        strength: 0,
        dexterity: 0,
        intelligence: 0,
        charisma: 0,
        luck: 0
      },
      readinessPenalty: 0,
      preparedScore: 0
    }
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
