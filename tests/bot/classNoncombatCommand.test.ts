import type { Context } from "grammy";
import { describe, expect, it, vi } from "vitest";
import {
  makePriestBlessCallbackData,
  makePriestHealCallbackData,
  makeRoguePickpocketCallbackData,
  parseClassNoncombatCallbackData
} from "../../src/bot/callbacks/classNoncombatCallbackData";
import { handleClassNoncombatCallback } from "../../src/bot/commands/classNoncombatCommand";
import type {
  ClassNoncombatOpenResult,
  PriestBlessResult,
  PriestHealResult,
  RoguePickpocketResult
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
    const { ctx, reply, sendMessage } = callbackContext();
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
});

function callbackContext() {
  const answerCallbackQuery = vi.fn().mockResolvedValue(true);
  const editMessageText = vi.fn<(text: string, options: EditOptions) => Promise<boolean>>().mockResolvedValue(true);
  const reply = vi.fn().mockResolvedValue(true);
  const sendMessage = vi.fn().mockResolvedValue(true);
  const ctx = {
    from: {
      id: Number(actorTelegramUserId),
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

function priestHealResult(): PriestHealResult {
  return {
    state: "completed",
    action: {
      id: "aid-1",
      actorCharacterId: "actor",
      targetCharacterId: "target",
      actorTelegramUserId,
      targetTelegramUserId,
      actorName: "Жрець",
      targetName: "Ціль",
      actionKind: "heal",
      healAmount: 5,
      manaCost: 7,
      cooldownAvailableAt: new Date("2026-07-03T10:33:00.000Z"),
      completedAt: now
    },
    actor: character("Жрець", "class.priest"),
    target: character("Ціль", "class.warrior", { hpCurrent: 15, hpMax: 20 }),
    unlocks: [{
      id: "achievement.class.priest.first-heal",
      title: "Добра мана",
      cosmeticTitleGrantId: null,
      unlockedAt: now
    }]
  };
}

function roguePickpocketResult(options: { created: boolean }): RoguePickpocketResult {
  return {
    state: "completed",
    attempt: {
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
      cooldownAvailableAt: new Date("2026-07-03T10:33:00.000Z"),
      completedAt: now
    },
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
      canPriestAid: true,
      canRoguePickpocket: false
    }],
    targetPage: 0,
    targetTotalPages: 1,
    priestBlessCooldownAvailableAt: null,
    roguePickpocketCooldownAvailableAt: null
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
