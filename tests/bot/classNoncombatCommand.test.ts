import type { Context } from "grammy";
import { describe, expect, it, vi } from "vitest";
import { makePriestHealCallbackData, makeRoguePickpocketCallbackData, parseClassNoncombatCallbackData } from "../../src/bot/callbacks/classNoncombatCallbackData";
import { handleClassNoncombatCallback } from "../../src/bot/commands/classNoncombatCommand";
import type { PriestHealResult, RoguePickpocketResult } from "../../src/services/classNoncombatService";
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
    const { ctx, reply, sendMessage } = callbackContext();
    const service = {
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
  const editMessageText = vi.fn().mockResolvedValue(true);
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
