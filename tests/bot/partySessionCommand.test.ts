import type { Context } from "grammy";
import { describe, expect, it, vi } from "vitest";
import { handlePartySessionCallback } from "../../src/bot/commands/partySessionCommand";
import type { PartySessionRecord } from "../../src/db/repositories/partySessionRepository";
import type { PartySessionService } from "../../src/services/partySessionService";
import type { PresenceService } from "../../src/services/presenceService";

describe("handlePartySessionCallback", () => {
  it("force-expires a live recruiting party through the dev helper when allowed", async () => {
    const session = makeSession("recruiting");
    const expired = { ...session, status: "expired" as const, activeLeaderKey: null, version: 2 };
    const forceExpireByToken = vi.fn().mockResolvedValue({ state: "ready", session: expired });
    const { ctx, answerCallbackQuery, editMessageText } = createCallbackContext();

    await handlePartySessionCallback(
      ctx,
      { type: "expire", token: session.inviteToken },
      serviceWith({
        areDevHelpersEnabled: () => true,
        forceExpireByToken
      }),
      { presence: {} as PresenceService }
    );

    expect(forceExpireByToken).toHaveBeenCalledWith(session.inviteToken);
    expect(answerCallbackQuery).toHaveBeenCalledWith({ text: "Строк збору завершено." });
    expect(messageText(editMessageText)).toContain("Стан: строк збору минув");
    expect(keyboardJson(editMessageText)).not.toContain("⏱️ Dev: завершити строк");
  });

  it("rejects the dev expiry callback without mutating when helper mode is disabled", async () => {
    const forceExpireByToken = vi.fn();
    const { ctx, answerCallbackQuery, editMessageText } = createCallbackContext();

    await handlePartySessionCallback(
      ctx,
      { type: "expire", token: "partyABC12" },
      serviceWith({
        areDevHelpersEnabled: () => false,
        forceExpireByToken
      }),
      { presence: {} as PresenceService }
    );

    expect(forceExpireByToken).not.toHaveBeenCalled();
    expect(answerCallbackQuery).toHaveBeenCalledWith({
      text: "Ця кнопка вже втратила магію. Спробуйте /start ще раз.",
      show_alert: true
    });
    expect(editMessageText).not.toHaveBeenCalled();
  });
});

function serviceWith(overrides: Partial<PartySessionService>): PartySessionService {
  return {
    isEnabled: () => true,
    areDevHelpersEnabled: () => false,
    forceExpireByToken: vi.fn(),
    ...overrides
  } as unknown as PartySessionService;
}

function createCallbackContext(): {
  ctx: Context;
  answerCallbackQuery: ReturnType<typeof vi.fn>;
  editMessageText: ReturnType<typeof vi.fn>;
} {
  const answerCallbackQuery = vi.fn().mockResolvedValue(true);
  const editMessageText = vi.fn().mockResolvedValue(true);
  const ctx = {
    from: {
      id: 42,
      is_bot: false,
      first_name: "Тест"
    },
    chat: {
      id: 42,
      type: "private"
    },
    callbackQuery: {
      id: "callback-1",
      message: {
        message_id: 13,
        chat: {
          id: 42,
          type: "private"
        }
      }
    },
    answerCallbackQuery,
    editMessageText
  } as unknown as Context;

  return { ctx, answerCallbackQuery, editMessageText };
}

function messageText(editMessageText: ReturnType<typeof vi.fn>): string {
  const call = editMessageText.mock.calls[0] as [string, { reply_markup?: unknown }?] | undefined;

  return call?.[0] ?? "";
}

function keyboardJson(editMessageText: ReturnType<typeof vi.fn>): string {
  const call = editMessageText.mock.calls[0] as [string, { reply_markup?: unknown }?] | undefined;

  return JSON.stringify(call?.[1]?.reply_markup);
}

function makeSession(status: PartySessionRecord["status"]): PartySessionRecord {
  const now = new Date("2026-06-29T15:00:00.000Z");

  return {
    id: "party-1",
    inviteToken: "partyABC12",
    status,
    leaderCharacterId: "character-42",
    periodId: "12026-06-29",
    originLocationId: "korchma.board",
    participantCap: 8,
    minimumParticipants: 1,
    joinUntilAt: new Date("2026-06-29T15:13:00.000Z"),
    expiresAt: new Date("2026-06-29T15:13:00.000Z"),
    version: status === "recruiting" ? 1 : 2,
    activeLeaderKey: status === "recruiting" ? "party-leader:character-42" : null,
    createdAt: now,
    updatedAt: now,
    leader: makeCharacter(),
    participants: [
      {
        id: "participant-42",
        sessionId: "party-1",
        characterId: "character-42",
        remortCount: 0,
        status: "joined",
        joinSource: "leader",
        joinedAt: now,
        leftAt: null,
        chatId: 42n,
        messageId: 13,
        character: makeCharacter()
      }
    ]
  };
}

function makeCharacter(): PartySessionRecord["leader"] {
  return {
    id: "character-42",
    userId: "user-42",
    telegramUserId: 42n,
    currentLocationId: "korchma.board",
    name: "Тестова Лідерка",
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
}
