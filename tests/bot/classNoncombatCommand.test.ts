import type { Context } from "grammy";
import { describe, expect, it, vi } from "vitest";
import {
  makePriestBlessCallbackData,
  makePriestHealCallbackData,
  makeRoguePickpocketCallbackData,
  makeRogueRetaliationDuelCallbackData,
  parseClassNoncombatCallbackData
} from "../../src/bot/callbacks/classNoncombatCallbackData";
import { handleClassNoncombatCallback } from "../../src/bot/commands/classNoncombatCommand";
import type {
  ClassNoncombatService,
  ClassNoncombatOpenResult,
  PriestBlessResult,
  PriestHealResult,
  RoguePickpocketResult,
  RogueRetaliationResult
} from "../../src/services/classNoncombatService";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";

const now = new Date("2026-07-03T09:00:00.000Z");
const actorTelegramUserId = 1001n;
const targetTelegramUserId = 1002n;

describe("class noncombat command", () => {
  it("notifies the actor about fresh Priest heal achievement unlocks", async () => {
    const { ctx, reply, sendMessage } = callbackContext();
    const service = {
      healForTelegramUser: vi.fn().mockResolvedValue(priestHealResult())
    };
    const callback = parseClassNoncombatCallbackData(makePriestHealCallbackData({
      targetTelegramUserId,
      actorRemortCount: 0,
      targetRemortCount: 0,
      page: 0
    }));

    expect(callback.ok).toBe(true);
    await handleClassNoncombatCallback(ctx, callback.ok ? callback.value : neverCallback(), service as never);

    expect(sendMessage).toHaveBeenCalledOnce();
    expect(reply).toHaveBeenCalledWith(expect.stringContaining("Нова ачівка"), { parse_mode: "HTML" });
    expect(reply).toHaveBeenCalledWith(expect.stringContaining("Добра мана"), { parse_mode: "HTML" });
  });

  it("does not notify achievements for blocked Priest no-op results", async () => {
    const { ctx, editMessageText, reply, sendMessage } = callbackContext();
    const service = {
      openForTelegramUser: vi.fn().mockResolvedValue(priestOpenResult()),
      healForTelegramUser: vi.fn().mockResolvedValue({
        state: "blocked",
        reason: "full-hp",
        actor: character("Жрець", "class.priest"),
        target: character("Ціль", "class.warrior")
      } satisfies PriestHealResult)
    };
    const callback = parseClassNoncombatCallbackData(makePriestHealCallbackData({
      targetTelegramUserId,
      actorRemortCount: 0,
      targetRemortCount: 0,
      page: 0
    }));

    expect(callback.ok).toBe(true);
    await handleClassNoncombatCallback(ctx, callback.ok ? callback.value : neverCallback(), service as never);

    expect(sendMessage).not.toHaveBeenCalled();
    expect(reply).not.toHaveBeenCalled();
    const [text, options] = firstEditCall(editMessageText);
    expect(text).toContain("HP уже повне");
    expect(options.parse_mode).toBe("HTML");
    expect(keyboardTexts(options)).toEqual(expect.arrayContaining([
      "⚕️ Полікувати себе",
      "✨ Благословити себе"
    ]));
  });

  it("offers another Priest heal for self when HP and mana still allow it", async () => {
    const { ctx, editMessageText, sendMessage } = callbackContext();
    const service = {
      healForTelegramUser: vi.fn().mockResolvedValue(priestHealResult({
        self: true,
        actor: { hpCurrent: 15, hpMax: 30, manaCurrent: 20 },
        target: { hpCurrent: 15, hpMax: 30, manaCurrent: 20 }
      }))
    };
    const callback = parseClassNoncombatCallbackData(makePriestHealCallbackData({
      targetTelegramUserId: null,
      actorRemortCount: 0,
      targetRemortCount: 0,
      page: 0
    }));

    expect(callback.ok).toBe(true);
    await handleClassNoncombatCallback(ctx, callback.ok ? callback.value : neverCallback(), service as never);

    expect(sendMessage).not.toHaveBeenCalled();
    const [, options] = firstEditCall(editMessageText);
    expect(keyboardTexts(options)).toEqual(["⚕️ Полікувати ще"]);
  });

  it("offers another Priest heal for another target when HP and mana still allow it", async () => {
    const { ctx, editMessageText } = callbackContext();
    const service = {
      healForTelegramUser: vi.fn().mockResolvedValue(priestHealResult({
        actor: { manaCurrent: 20 },
        target: { hpCurrent: 15, hpMax: 30 }
      }))
    };
    const callback = parseClassNoncombatCallbackData(makePriestHealCallbackData({
      targetTelegramUserId,
      actorRemortCount: 0,
      targetRemortCount: 0,
      page: 0
    }));

    expect(callback.ok).toBe(true);
    await handleClassNoncombatCallback(ctx, callback.ok ? callback.value : neverCallback(), service as never);

    const [, options] = firstEditCall(editMessageText);
    expect(keyboardTexts(options)).toEqual(["⚕️ Полікувати ще"]);
  });

  it("does not offer another Priest heal when the target is full or mana is gone", async () => {
    const fullHp = callbackContext();
    const fullHpService = {
      healForTelegramUser: vi.fn().mockResolvedValue(priestHealResult({
        actor: { manaCurrent: 20 },
        target: { hpCurrent: 30, hpMax: 30 }
      }))
    };
    const callback = parseClassNoncombatCallbackData(makePriestHealCallbackData({
      targetTelegramUserId,
      actorRemortCount: 0,
      targetRemortCount: 0,
      page: 0
    }));

    expect(callback.ok).toBe(true);
    await handleClassNoncombatCallback(fullHp.ctx, callback.ok ? callback.value : neverCallback(), fullHpService as never);

    expect(keyboardTexts(firstEditCall(fullHp.editMessageText)[1])).toEqual([]);

    const noMana = callbackContext();
    const noManaService = {
      healForTelegramUser: vi.fn().mockResolvedValue(priestHealResult({
        actor: { manaCurrent: 0 },
        target: { hpCurrent: 15, hpMax: 30 }
      }))
    };

    await handleClassNoncombatCallback(noMana.ctx, callback.ok ? callback.value : neverCallback(), noManaService as never);

    expect(keyboardTexts(firstEditCall(noMana.editMessageText)[1])).toEqual([]);
  });

  it("keeps Priest action buttons under already-blessed results", async () => {
    const { ctx, editMessageText, reply, sendMessage } = callbackContext();
    const service = {
      openForTelegramUser: vi.fn().mockResolvedValue(priestOpenResult()),
      blessForTelegramUser: vi.fn().mockResolvedValue({
        state: "blocked",
        reason: "already-blessed",
        actor: character("Жрець", "class.priest"),
        target: character("Жрець", "class.priest"),
        blessing: {
          id: "blessing-1",
          actorName: "Жрець",
          targetName: "Жрець",
          expiresAt: new Date("2026-07-03T09:13:00.000Z"),
          bonusStat: "luck",
          bonusAmount: 1
        }
      } satisfies PriestBlessResult)
    };
    const callback = parseClassNoncombatCallbackData(makePriestBlessCallbackData({
      targetTelegramUserId: null,
      actorRemortCount: 0,
      targetRemortCount: 0,
      page: 0
    }));

    expect(callback.ok).toBe(true);
    await handleClassNoncombatCallback(ctx, callback.ok ? callback.value : neverCallback(), service as never);

    expect(sendMessage).not.toHaveBeenCalled();
    expect(reply).not.toHaveBeenCalled();
    const [text, options] = firstEditCall(editMessageText);
    expect(text).toContain("На цілі вже тримається благословення");
    expect(options.parse_mode).toBe("HTML");
    expect(keyboardTexts(options)).toEqual(expect.arrayContaining([
      "⚕️ Полікувати себе",
      "✨ Благословити себе"
    ]));
  });

  it("keeps Priest action buttons under blessing cooldown results", async () => {
    const { ctx, editMessageText, reply, sendMessage } = callbackContext();
    const service = {
      openForTelegramUser: vi.fn().mockResolvedValue(priestOpenResult()),
      blessForTelegramUser: vi.fn().mockResolvedValue({
        state: "blocked",
        reason: "cooldown",
        availableAt: new Date("2026-07-03T10:19:00.000Z"),
        actor: character("Жрець", "class.priest"),
        target: character("Жрець", "class.priest")
      } satisfies PriestBlessResult)
    };
    const callback = parseClassNoncombatCallbackData(makePriestBlessCallbackData({
      targetTelegramUserId: null,
      actorRemortCount: 0,
      targetRemortCount: 0,
      page: 0
    }));

    expect(callback.ok).toBe(true);
    await handleClassNoncombatCallback(ctx, callback.ok ? callback.value : neverCallback(), service as never);

    expect(sendMessage).not.toHaveBeenCalled();
    expect(reply).not.toHaveBeenCalled();
    const [text, options] = firstEditCall(editMessageText);
    expect(text).toContain("Благословення відсапується");
    expect(text).toContain("Техніка відсапується");
    expect(options.parse_mode).toBe("HTML");
    expect(keyboardTexts(options)).toEqual(expect.arrayContaining([
      "⚕️ Полікувати себе",
      "✨ Благословити себе",
      "🔄 Оновити"
    ]));
  });

  it("does not notify achievements or target again for Rogue duplicate replay", async () => {
    const { ctx, editMessageText, reply, sendMessage } = callbackContext();
    const service = {
      pickpocketForTelegramUser: vi.fn().mockResolvedValue(roguePickpocketResult({ created: false }))
    };
    const callback = parseClassNoncombatCallbackData(makeRoguePickpocketCallbackData({
      targetTelegramUserId,
      actorRemortCount: 0,
      targetRemortCount: 0,
      page: 0
    }));

    expect(callback.ok).toBe(true);
    await handleClassNoncombatCallback(ctx, callback.ok ? callback.value : neverCallback(), service as never);

    expect(sendMessage).not.toHaveBeenCalled();
    expect(reply).not.toHaveBeenCalled();
    const [text, options] = firstEditCall(editMessageText);
    expect(text).toContain("Ціль: <b>Ціль</b>");
    expect(text).toContain("Цей запис уже зафіксовано");
    expect(keyboardTexts(options)).toEqual(["🔄 Оновити"]);
  });

  it("notifies the actor once for fresh Rogue attempt achievements", async () => {
    const { ctx, reply, sendMessage } = callbackContext();
    const service = {
      pickpocketForTelegramUser: vi.fn().mockResolvedValue(roguePickpocketResult({ created: true }))
    };
    const callback = parseClassNoncombatCallbackData(makeRoguePickpocketCallbackData({
      targetTelegramUserId,
      actorRemortCount: 0,
      targetRemortCount: 0,
      page: 0
    }));

    expect(callback.ok).toBe(true);
    await handleClassNoncombatCallback(ctx, callback.ok ? callback.value : neverCallback(), service as never);

    expect(sendMessage).toHaveBeenCalledOnce();
    expect(reply).toHaveBeenCalledTimes(1);
    expect(reply).toHaveBeenCalledWith(expect.stringContaining("Нова ачівка"), { parse_mode: "HTML" });
    expect(reply).toHaveBeenCalledWith(expect.stringContaining("Пальці без протоколу"), { parse_mode: "HTML" });
  });

  it("adds instant and turn-based retaliation duel buttons to noticed successful Rogue target notifications", async () => {
    const { ctx, sendMessage } = callbackContext();
    const service = {
      pickpocketForTelegramUser: vi.fn().mockResolvedValue(roguePickpocketResult({ created: true }))
    };
    const callback = parseClassNoncombatCallbackData(makeRoguePickpocketCallbackData({
      targetTelegramUserId,
      actorRemortCount: 0,
      targetRemortCount: 0,
      page: 0
    }));

    expect(callback.ok).toBe(true);
    await handleClassNoncombatCallback(ctx, callback.ok ? callback.value : neverCallback(), service as never);

    expect(sendMessage).toHaveBeenCalledOnce();
    const [chatId, text, options] = sendMessage.mock.calls[0];
    expect(chatId).toBe(Number(targetTelegramUserId));
    expect(text).toContain("Ви помітили успішну крадіжку");
    expect(keyboardTexts(options as EditOptions)).toEqual([
      "⚡ Відплатити миттєвою дуеллю",
      "♟️ Відплатити покроковою дуеллю"
    ]);
  });

  it("starts and auto-accepts a quick duel when the pickpocket target retaliates", async () => {
    const { ctx, editMessageText } = callbackContext({ telegramUserId: targetTelegramUserId });
    const claimRogueRetaliationForTelegramUser = vi.fn<(target: bigint, token: string) => Promise<RogueRetaliationResult>>()
      .mockResolvedValue({
        state: "ready",
        attempt: roguePickpocketAttempt(),
        actor: character("Злодій", "class.rogue"),
        target: character("Ціль", "class.warrior")
      });
    const recordRogueRetaliationDuel = vi.fn<(token: string, inviteToken: string) => Promise<void>>()
      .mockResolvedValue(undefined);
    const service = {
      claimRogueRetaliationForTelegramUser,
      recordRogueRetaliationDuel
    } satisfies Pick<ClassNoncombatService, "claimRogueRetaliationForTelegramUser" | "recordRogueRetaliationDuel">;
    const createTargetedChallengeForTelegramUser = vi.fn().mockResolvedValue({
      state: "pending",
      challenge: {
        inviteToken: "retaliate-token"
      }
    });
    const acceptForTelegramUser = vi.fn().mockResolvedValue({
      state: "not-found"
    });
    const callback = parseClassNoncombatCallbackData(makeRogueRetaliationDuelCallbackData({
      retaliationToken: "abc123xy"
    }));

    expect(callback.ok).toBe(true);
    await handleClassNoncombatCallback(
      ctx,
      callback.ok ? callback.value : neverCallback(),
      service as never,
      { createTargetedChallengeForTelegramUser, acceptForTelegramUser } as never
    );

    expect(claimRogueRetaliationForTelegramUser).toHaveBeenCalledWith(targetTelegramUserId, "abc123xy");
    expect(createTargetedChallengeForTelegramUser).toHaveBeenCalledWith(targetTelegramUserId, actorTelegramUserId, {
      ignoreResourceWarning: true,
      mode: "quick"
    });
    expect(recordRogueRetaliationDuel).toHaveBeenCalledWith("abc123xy", "retaliate-token");
    expect(acceptForTelegramUser).toHaveBeenCalledWith(actorTelegramUserId, "retaliate-token", {
      confirmed: true,
      ignoreResourceWarning: true,
      expectedMode: "quick"
    });
    const [text, options] = firstEditCall(editMessageText);
    expect(text).toContain("⚡ <b>Кишенькова відплата</b>");
    expect(text).toContain("Цей виклик уже загубився");
    expect(options.parse_mode).toBe("HTML");
  });

  it("starts and auto-accepts a turn-based duel when the pickpocket target chooses slow retaliation", async () => {
    const { ctx, editMessageText, sendMessage } = callbackContext({ telegramUserId: targetTelegramUserId });
    const claimRogueRetaliationForTelegramUser = vi.fn<(target: bigint, token: string) => Promise<RogueRetaliationResult>>()
      .mockResolvedValue({
        state: "ready",
        attempt: roguePickpocketAttempt(),
        actor: character("Злодій", "class.rogue"),
        target: character("Ціль", "class.warrior")
      });
    const recordRogueRetaliationDuel = vi.fn<(token: string, inviteToken: string) => Promise<void>>()
      .mockResolvedValue(undefined);
    const service = {
      claimRogueRetaliationForTelegramUser,
      recordRogueRetaliationDuel
    } satisfies Pick<ClassNoncombatService, "claimRogueRetaliationForTelegramUser" | "recordRogueRetaliationDuel">;
    const active = turnBasedRetaliationResult();
    const createTargetedChallengeForTelegramUser = vi.fn().mockResolvedValue({
      state: "pending",
      challenge: {
        inviteToken: "retaliate-token"
      }
    });
    const acceptForTelegramUser = vi.fn().mockResolvedValue(active);
    const recordTurnBasedMessageReference = vi.fn().mockResolvedValue(undefined);
    const callback = parseClassNoncombatCallbackData(makeRogueRetaliationDuelCallbackData({
      mode: "turn-based",
      retaliationToken: "abc123xy"
    }));

    expect(callback.ok).toBe(true);
    await handleClassNoncombatCallback(
      ctx,
      callback.ok ? callback.value : neverCallback(),
      service as never,
      { createTargetedChallengeForTelegramUser, acceptForTelegramUser, recordTurnBasedMessageReference } as never
    );

    expect(claimRogueRetaliationForTelegramUser).toHaveBeenCalledWith(targetTelegramUserId, "abc123xy");
    expect(createTargetedChallengeForTelegramUser).toHaveBeenCalledWith(targetTelegramUserId, actorTelegramUserId, {
      ignoreResourceWarning: true,
      mode: "turn-based"
    });
    expect(recordRogueRetaliationDuel).toHaveBeenCalledWith("abc123xy", "retaliate-token");
    expect(acceptForTelegramUser).toHaveBeenCalledWith(actorTelegramUserId, "retaliate-token", {
      confirmed: true,
      ignoreResourceWarning: true,
      expectedMode: "turn-based"
    });

    const [text, options] = firstEditCall(editMessageText);
    expect(text).toContain("♟️ <b>Кишенькова відплата</b>");
    expect(text).toContain("♟️ <b>Покрокова дуель: хід 1</b>");
    expect(keyboardTexts(options)).toEqual(expect.arrayContaining([
      "⚔️ Атакувати",
      "🛡 Захищатися",
      "🏳️ Здатися",
      "🔎 Оновити"
    ]));

    expect(sendMessage).toHaveBeenCalledWith(
      Number(actorTelegramUserId),
      expect.stringContaining("♟️ <b>Кишенькова відплата</b>"),
      expect.objectContaining({ parse_mode: "HTML" })
    );
    expect(recordTurnBasedMessageReference).toHaveBeenCalledWith("duel-session-1", "target", {
      chatId: actorTelegramUserId,
      messageId: 77
    });
  });

  it("does not let another Telegram user trigger pickpocket retaliation", async () => {
    const { ctx, answerCallbackQuery } = callbackContext({ telegramUserId: 9999n });
    const claimRogueRetaliationForTelegramUser = vi.fn<(target: bigint, token: string) => Promise<RogueRetaliationResult>>()
      .mockResolvedValue({
        state: "blocked",
        reason: "not-target",
        attempt: roguePickpocketAttempt()
      });
    const service = {
      claimRogueRetaliationForTelegramUser
    } satisfies Pick<ClassNoncombatService, "claimRogueRetaliationForTelegramUser">;
    const createTargetedChallengeForTelegramUser = vi.fn();
    const acceptForTelegramUser = vi.fn();
    const callback = parseClassNoncombatCallbackData(makeRogueRetaliationDuelCallbackData({
      retaliationToken: "abc123xy"
    }));

    expect(callback.ok).toBe(true);
    await handleClassNoncombatCallback(
      ctx,
      callback.ok ? callback.value : neverCallback(),
      service as never,
      { createTargetedChallengeForTelegramUser, acceptForTelegramUser } as never
    );

    expect(answerCallbackQuery).toHaveBeenCalledWith({
      text: "Це не ваша кишеня подала скаргу.",
      show_alert: true
    });
    expect(createTargetedChallengeForTelegramUser).not.toHaveBeenCalled();
    expect(acceptForTelegramUser).not.toHaveBeenCalled();
  });

  it("does not create another retaliation duel from a replayed used callback", async () => {
    const { ctx, editMessageText } = callbackContext({ telegramUserId: targetTelegramUserId });
    const claimRogueRetaliationForTelegramUser = vi.fn<(target: bigint, token: string) => Promise<RogueRetaliationResult>>()
      .mockResolvedValue({
        state: "blocked",
        reason: "used",
        attempt: roguePickpocketAttempt()
      });
    const service = {
      claimRogueRetaliationForTelegramUser
    } satisfies Pick<ClassNoncombatService, "claimRogueRetaliationForTelegramUser">;
    const createTargetedChallengeForTelegramUser = vi.fn();
    const acceptForTelegramUser = vi.fn();
    const callback = parseClassNoncombatCallbackData(makeRogueRetaliationDuelCallbackData({
      retaliationToken: "abc123xy"
    }));

    expect(callback.ok).toBe(true);
    await handleClassNoncombatCallback(
      ctx,
      callback.ok ? callback.value : neverCallback(),
      service as never,
      { createTargetedChallengeForTelegramUser, acceptForTelegramUser } as never
    );

    expect(createTargetedChallengeForTelegramUser).not.toHaveBeenCalled();
    expect(acceptForTelegramUser).not.toHaveBeenCalled();
    const [text, options] = firstEditCall(editMessageText);
    expect(text).toContain("Відплату вже вписано");
    expect(options.parse_mode).toBe("HTML");
  });

  it("does not create a retaliation duel from an expired callback", async () => {
    const { ctx, editMessageText } = callbackContext({ telegramUserId: targetTelegramUserId });
    const claimRogueRetaliationForTelegramUser = vi.fn<(target: bigint, token: string) => Promise<RogueRetaliationResult>>()
      .mockResolvedValue({
        state: "blocked",
        reason: "expired",
        attempt: roguePickpocketAttempt()
      });
    const service = {
      claimRogueRetaliationForTelegramUser
    } satisfies Pick<ClassNoncombatService, "claimRogueRetaliationForTelegramUser">;
    const createTargetedChallengeForTelegramUser = vi.fn();
    const acceptForTelegramUser = vi.fn();
    const callback = parseClassNoncombatCallbackData(makeRogueRetaliationDuelCallbackData({
      retaliationToken: "abc123xy"
    }));

    expect(callback.ok).toBe(true);
    await handleClassNoncombatCallback(
      ctx,
      callback.ok ? callback.value : neverCallback(),
      service as never,
      { createTargetedChallengeForTelegramUser, acceptForTelegramUser } as never
    );

    expect(createTargetedChallengeForTelegramUser).not.toHaveBeenCalled();
    expect(acceptForTelegramUser).not.toHaveBeenCalled();
    const [text, options] = firstEditCall(editMessageText);
    expect(text).toContain("Відплата видихлась");
    expect(options.parse_mode).toBe("HTML");
  });
});

function callbackContext(options: { telegramUserId?: bigint } = {}) {
  const answerCallbackQuery = vi.fn().mockResolvedValue(true);
  const editMessageText = vi.fn<(text: string, options: EditOptions) => Promise<boolean>>().mockResolvedValue(true);
  const reply = vi.fn().mockResolvedValue(true);
  const sendMessage = vi.fn().mockResolvedValue({ message_id: 77 });
  const ctx = {
    from: {
      id: Number(options.telegramUserId ?? actorTelegramUserId),
      is_bot: false,
      first_name: "Тест"
    },
    answerCallbackQuery,
    editMessageText,
    reply,
    api: {
      sendMessage
    }
  } as unknown as Context;

  return { ctx, answerCallbackQuery, editMessageText, reply, sendMessage };
}

interface EditOptions {
  parse_mode?: "HTML";
  reply_markup?: {
    inline_keyboard?: Array<Array<{ text: string }>>;
  };
}

function firstEditCall(
  editMessageText: ReturnType<typeof callbackContext>["editMessageText"]
): [string, EditOptions] {
  const call = editMessageText.mock.calls[0];
  if (!call) {
    throw new Error("Expected edited message.");
  }

  return call;
}

function keyboardTexts(options: EditOptions): string[] {
  return options.reply_markup?.inline_keyboard?.flat().map((button) => button.text) ?? [];
}

function priestHealResult(options: {
  self?: boolean;
  actor?: Partial<CharacterSummary>;
  target?: Partial<CharacterSummary>;
} = {}): PriestHealResult {
  const self = options.self ?? false;
  return {
    state: "completed",
    action: {
      id: "aid-1",
      actorCharacterId: "actor",
      targetCharacterId: self ? "actor" : "target",
      actorTelegramUserId,
      targetTelegramUserId: self ? actorTelegramUserId : targetTelegramUserId,
      actorName: "Жрець",
      targetName: self ? "Жрець" : "Ціль",
      actionKind: "heal",
      healAmount: 5,
      manaCost: 5,
      cooldownAvailableAt: new Date("2026-07-03T10:33:00.000Z"),
      completedAt: now
    },
    actor: character("Жрець", "class.priest", options.actor),
    target: character(self ? "Жрець" : "Ціль", self ? "class.priest" : "class.warrior", {
      hpCurrent: 15,
      hpMax: 20,
      ...options.target
    }),
    unlocks: [{
      id: "achievement.class.priest.first-heal",
      title: "Добра мана",
      cosmeticTitleGrantId: null,
      unlockedAt: now
    }]
  };
}

type CompletedRoguePickpocketResult = Extract<RoguePickpocketResult, { state: "completed" }>;

function roguePickpocketAttempt(): CompletedRoguePickpocketResult["attempt"] {
  return {
    id: "pickpocket-1",
    actorCharacterId: "actor",
    targetCharacterId: "target",
    actorTelegramUserId,
    targetTelegramUserId,
    actorName: "Злодій",
    targetName: "Ціль",
    outcome: "noticed-success",
    stolenGold: 3,
    actorHpAfter: null,
    retaliationToken: "abc123xy",
    retaliationAvailableUntil: new Date("2026-07-03T09:13:00.000Z"),
    retaliationUsedAt: null,
    retaliationDuelInviteToken: null,
    cooldownAvailableAt: new Date("2026-07-03T10:33:00.000Z"),
    completedAt: now
  };
}

function roguePickpocketResult(options: { created: boolean }): RoguePickpocketResult {
  return {
    state: "completed",
    attempt: roguePickpocketAttempt(),
    actor: character("Злодій", "class.rogue"),
    target: character("Ціль", "class.warrior", { gold: 10 }),
    created: options.created,
    unlocks: options.created
      ? [{
          id: "achievement.class.rogue.first-pickpocket",
          title: "Пальці без протоколу",
          cosmeticTitleGrantId: null,
          unlockedAt: now
        }]
      : []
  };
}

function priestOpenResult(): ClassNoncombatOpenResult {
  return {
    state: "ready",
    mode: "priest",
    character: character("Жрець", "class.priest"),
    actorBlocked: false,
    locationName: "Стіл зі справами",
    targets: [{
      telegramUserId: targetTelegramUserId,
      characterId: "target",
      name: "Ціль",
      classId: "class.warrior",
      level: 3,
      hpCurrent: 10,
      hpMax: 20,
      gold: 13,
      remortCount: 0,
      priestBlessAvailableAt: null,
      rogueAttemptedToday: false,
      canPriestAid: true,
      canRoguePickpocket: false
    }],
    targetPage: 0,
    targetTotalPages: 1,
    priestBlessCooldownAvailableAt: null,
    priestSelfBlessAvailableAt: null,
    roguePickpocketCooldownAvailableAt: null
  };
}

function turnBasedRetaliationResult(): Extract<RogueRetaliationDuelAcceptResult, { state: "active" }> {
  return {
    state: "active",
    challenge: {
      inviteToken: "retaliate-token",
      mode: "turn-based",
      challenger: {
        telegramUserId: targetTelegramUserId,
        name: "Ціль"
      },
      target: {
        telegramUserId: actorTelegramUserId,
        name: "Злодій"
      }
    },
    session: {
      id: "duel-session-1",
      status: "active",
      turn: 1,
      version: 1,
      challengerCharacterId: "target",
      targetCharacterId: "actor",
      state: {
        status: "active",
        turn: 1,
        participants: {
          challenger: turnBasedParticipant("target", "Ціль", "class.warrior"),
          target: turnBasedParticipant("actor", "Злодій", "class.rogue")
        }
      }
    },
    challenger: character("Ціль", "class.warrior"),
    target: character("Злодій", "class.rogue"),
    turnExpiresAt: new Date("2026-07-03T09:00:23.000Z"),
    now
  } as unknown as Extract<RogueRetaliationDuelAcceptResult, { state: "active" }>;
}

type RogueRetaliationDuelAcceptResult = Awaited<ReturnType<import("../../src/services/duelChallengeService").DuelChallengeService["acceptForTelegramUser"]>>;

function turnBasedParticipant(characterId: string, displayName: string, classId: string) {
  return {
    characterId,
    displayName,
    title: "Пересічні Пригодники",
    raceId: "race.human-ish",
    raceName: "Людисько",
    classId,
    className: classId === "class.rogue" ? "Злодій" : "Воїн",
    level: 3,
    remortCount: 0,
    hp: 20,
    hpMax: 20,
    mana: 20,
    manaMax: 20,
    stats: {
      strength: 8,
      dexterity: 8,
      intelligence: 8,
      charisma: 8,
      luck: 8
    },
    combatStats: {
      classId,
      raceId: "race.human-ish",
      level: 3,
      attack: 8,
      defense: 8,
      maxHp: 20,
      maxMana: 20,
      skillPower: 8,
      critChance: 0.05
    },
    cooldowns: {}
  };
}

function character(
  name: string,
  classId: string,
  overrides: Partial<CharacterSummary> = {}
): CharacterSummary {
  return {
    name,
    pronoun: "they",
    pronounLabel: "Вони",
    path: "boundary",
    raceId: "race.human-ish",
    raceName: "Людисько",
    classId,
    className: classId === "class.priest" ? "Жрець" : classId === "class.rogue" ? "Злодій" : "Воїн",
    title: "Пересічні Пригодники",
    level: 3,
    xp: 25,
    nextLevelXp: 45,
    xpToNextLevel: 20,
    gold: 13,
    hpCurrent: 10,
    hpMax: 20,
    manaCurrent: 20,
    manaMax: 20,
    stats: {
      strength: 8,
      dexterity: 8,
      intelligence: 8,
      charisma: 8,
      luck: 8
    },
    levelBonus: {
      hpMax: 0,
      manaMax: 0,
      primaryStat: {
        stat: "strength",
        bonus: 0
      }
    },
    ...overrides
  };
}

function neverCallback(): never {
  throw new Error("Expected valid callback.");
}
