import type { Context } from "grammy";
import { describe, expect, it, vi } from "vitest";
import { handleNearbyDuelCallback } from "../../src/bot/commands/nearbyDuelCommand";
import type { DuelChallengeRecord } from "../../src/db/repositories/duelChallengeRepository";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";
import type { DuelChallengeService } from "../../src/services/duelChallengeService";
import type { PresenceService } from "../../src/services/presenceService";

const NOW = new Date("2026-06-17T18:00:00.000Z");
const EXPIRES_AT = new Date("2026-06-17T18:13:00.000Z");

describe("handleNearbyDuelCallback", () => {
  it("creates a targeted in-game duel invite and notifies the selected player", async () => {
    const challenger = makeCharacterSummary("Автор Виклику");
    const challenge = makeChallenge("turn-based");
    const createTargetedChallengeForTelegramUser = vi.fn().mockResolvedValue({
      state: "pending",
      challenge,
      challenger,
      challengerResourceWarning: null,
      expiresAt: EXPIRES_AT,
      now: NOW
    });
    const { ctx, editMessageText, sendMessage } = createCallbackContext(42);

    await handleNearbyDuelCallback(
      ctx,
      {
        type: "mode",
        targetTelegramUserId: 77n,
        mode: "turn-based",
        ignoreResourceWarning: false,
        page: 0
      },
      {
        presence: createPresence(),
        duel: {
          createTargetedChallengeForTelegramUser
        } as unknown as DuelChallengeService
      }
    );

    expect(createTargetedChallengeForTelegramUser).toHaveBeenCalledWith(42n, 77n, {
      contextChatId: -100n,
      mode: "turn-based",
      ignoreResourceWarning: false
    });
    expect(messageText(editMessageText)).toContain("♟️ <b>Виклик надіслано</b>");
    expect(messageText(editMessageText)).toContain("Кому: <b>Ціль Дуелі</b>");
    expect(keyboardJson(editMessageText)).toContain("v1:duel:cancel:abcDEF12");
    expect(keyboardJson(editMessageText)).toContain("v1:duel:view:abcDEF12");
    expect(keyboardJson(editMessageText)).not.toContain("v1:duel:accept:abcDEF12");
    expect(keyboardJson(editMessageText)).not.toContain("v1:duel:decline:abcDEF12");
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0]?.[0]).toBe(77);
    expect(sendMessage.mock.calls[0]?.[1]).toContain("Вам кинули виклик");
    expect(sendMessage.mock.calls[0]?.[1]).toContain("після остаточної згоди в деталях");
    const notificationKeyboard = JSON.stringify(sendMessage.mock.calls[0]?.[2]);
    expect(notificationKeyboard).toContain("📖 Детальніше");
    expect(notificationKeyboard).toContain("🙅 Відмовитись");
    expect(notificationKeyboard).toContain("🔄 Оновити");
    expect(notificationKeyboard).not.toContain("🤝 Прийняти");
    expect(notificationKeyboard).toContain("v1:duel:accept:abcDEF12");
    expect(notificationKeyboard).not.toContain("v1:duel:cancel:abcDEF12");
  });

  it("shows resource warning before creating the targeted invite", async () => {
    const createTargetedChallengeForTelegramUser = vi.fn().mockResolvedValue({
      state: "resource-warning",
      character: makeCharacterSummary("Втомлений Автор"),
      warning: {
        hpBelowMax: true,
        manaBelowMax: false
      }
    });
    const { ctx, editMessageText, sendMessage } = createCallbackContext(42);

    await handleNearbyDuelCallback(
      ctx,
      {
        type: "mode",
        targetTelegramUserId: 77n,
        mode: "quick",
        ignoreResourceWarning: false,
        page: 0
      },
      {
        presence: createPresence(),
        duel: {
          createTargetedChallengeForTelegramUser
        } as unknown as DuelChallengeService
      }
    );

    expect(messageText(editMessageText)).toContain("⚡ <b>Кинути миттєву дуель?</b>");
    expect(messageText(editMessageText)).toContain("Попередження: здоров’я не повне.");
    expect(keyboardJson(editMessageText)).toContain("v1:nd:m:25:qr:0");
    expect(sendMessage).not.toHaveBeenCalled();
  });
});

function createCallbackContext(userId: number): {
  ctx: Context;
  editMessageText: ReturnType<typeof vi.fn>;
  sendMessage: ReturnType<typeof vi.fn>;
} {
  const editMessageText = vi.fn().mockResolvedValue(true);
  const sendMessage = vi.fn().mockResolvedValue({ message_id: 22 });
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
    answerCallbackQuery: vi.fn().mockResolvedValue(true),
    editMessageText,
    api: {
      sendMessage
    }
  } as unknown as Context;

  return { ctx, editMessageText, sendMessage };
}

function createPresence(): PresenceService {
  return {
    getNearbyDuelCandidatesForTelegramUser: vi.fn().mockResolvedValue({
      state: "ready",
      location: {
        id: "location.korchma.hall",
        name: "Зала корчми"
      },
      page: 0,
      pageSize: 50,
      total: 1,
      totalPages: 1,
      visible: [
        {
          telegramUserId: 77n,
          name: "Ціль Дуелі",
          level: 4,
          status: "active"
        }
      ]
    })
  } as unknown as PresenceService;
}

function makeChallenge(mode: "quick" | "turn-based"): DuelChallengeRecord {
  return {
    id: "duel-1",
    challengerCharacterId: "character-42",
    targetCharacterId: "character-77",
    contextChatId: -100n,
    inviteToken: "abcDEF12",
    mode,
    status: "pending",
    expiresAt: EXPIRES_AT,
    resolvedAt: null,
    result: null,
    createdAt: NOW,
    updatedAt: NOW,
    challenger: {
      ...baseCharacter(42n, "Автор Виклику"),
      equipment: []
    },
    target: {
      ...baseCharacter(77n, "Ціль Дуелі"),
      equipment: []
    }
  };
}

function baseCharacter(telegramUserId: bigint, name: string) {
  return {
    id: `character-${telegramUserId.toString()}`,
    telegramUserId,
    userId: `user-${telegramUserId.toString()}`,
    name,
    pronoun: "they" as const,
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
    }
  };
}

function makeCharacterSummary(name: string): CharacterSummary {
  return {
    name,
    pronoun: "they",
    pronounLabel: "вони",
    path: "boundary",
    raceId: "race.human-ish",
    raceName: "Пересічні Пригодники",
    classId: "class.warrior",
    className: "Воїн",
    title: "Пересічні Пригодники",
    level: 3,
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
      stats: {
        strength: 0,
        dexterity: 0,
        intelligence: 0,
        charisma: 0,
        luck: 0
      }
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
