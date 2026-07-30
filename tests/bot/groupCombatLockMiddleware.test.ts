import { Bot } from "grammy";
import { describe, expect, it, vi } from "vitest";
import type { BotServices } from "../../src/bot/botServices";
import { registerCombatLockMiddleware } from "../../src/bot/middleware/registerCombatLockMiddleware";
import type { GroupCombatSessionRecord } from "../../src/db/repositories/groupCombatRepository";
import type { GroupCombatService } from "../../src/services/groupCombatService";

describe("group-combat lock middleware", () => {
  it.each([
    ["turn-based-duel", "duel"],
    ["party-boss", "partyBoss"],
    ["group-combat", "groupCombat"],
    ["solo-combat", "fight"]
  ] as const)("loads only the authoritative %s owner", async (kind, expectedOwner) => {
    const calls = apiCalls();
    const bot = testBot(calls.middleware);
    const downstream = vi.fn();
    const lease = {
      characterId: "character-1",
      kind,
      referenceId: `${kind}-13`
    };
    const findLease = vi.fn().mockResolvedValue(lease);
    const duelExact = vi.fn().mockResolvedValue(null);
    const partyBossExact = vi.fn().mockResolvedValue(null);
    const groupCombatExact = vi.fn().mockResolvedValue(null);
    const fightOverview = vi.fn().mockResolvedValue({ state: "no-character" });
    const duelBroad = vi.fn();
    const partyBossBroad = vi.fn();
    const groupCombatBroad = vi.fn();
    const serviceSet = {
      combatLeases: {
        findActiveForTelegramUser: findLease
      },
      duel: {
        getActiveTurnBasedByIdForCharacterId: duelExact,
        getActiveTurnBasedForTelegramUser: duelBroad
      },
      partyBoss: {
        getActiveByPartySessionIdForCharacterId: partyBossExact,
        getActiveForTelegramUser: partyBossBroad
      },
      groupCombat: {
        findById: groupCombatExact,
        findActiveForTelegramUser: groupCombatBroad
      },
      fight: {
        getFightOverviewForTelegramUser: fightOverview
      }
    } as unknown as BotServices;
    registerCombatLockMiddleware(bot, serviceSet);
    bot.on("message", downstream);

    await bot.handleUpdate(commandUpdate("private"));

    expect(findLease).toHaveBeenCalledTimes(1);
    expect(duelExact).toHaveBeenCalledTimes(expectedOwner === "duel" ? 1 : 0);
    expect(partyBossExact).toHaveBeenCalledTimes(expectedOwner === "partyBoss" ? 1 : 0);
    expect(groupCombatExact).toHaveBeenCalledTimes(expectedOwner === "groupCombat" ? 1 : 0);
    expect(fightOverview).toHaveBeenCalledTimes(expectedOwner === "fight" ? 1 : 0);
    if (expectedOwner === "fight") {
      expect(fightOverview).toHaveBeenCalledWith(1001n, {
        authoritativeLease: lease
      });
    }
    expect(downstream).not.toHaveBeenCalled();
    expect(calls.sends).toHaveLength(1);
    expect(calls.sends[0]?.chatId).toBe(1001);
    expect(calls.sends[0]?.text).toContain("не збігається");
    expect(duelBroad).not.toHaveBeenCalled();
    expect(partyBossBroad).not.toHaveBeenCalled();
    expect(groupCombatBroad).not.toHaveBeenCalled();
  });

  it("handles an unknown authoritative owner without probing or falling through", async () => {
    const calls = apiCalls();
    const bot = testBot(calls.middleware);
    const downstream = vi.fn();
    const unrelated = vi.fn(() => {
      throw new Error("unrelated combat repository was probed");
    });
    registerCombatLockMiddleware(bot, {
      combatLeases: {
        findActiveForTelegramUser: vi.fn().mockResolvedValue({
          characterId: "character-1",
          kind: "future-combat",
          referenceId: "future-13"
        })
      },
      duel: {
        getActiveTurnBasedByIdForCharacterId: unrelated,
        getActiveTurnBasedForTelegramUser: unrelated
      },
      partyBoss: {
        getActiveByPartySessionIdForCharacterId: unrelated,
        getActiveForTelegramUser: unrelated
      },
      groupCombat: {
        findById: unrelated,
        findActiveForTelegramUser: unrelated
      },
      fight: {
        getFightOverviewForTelegramUser: unrelated
      }
    } as unknown as BotServices);
    bot.on("message", downstream);

    await bot.handleUpdate(commandUpdate("private"));
    await bot.handleUpdate({ ...commandUpdate("private"), update_id: 13 });

    expect(unrelated).not.toHaveBeenCalled();
    expect(downstream).not.toHaveBeenCalled();
    expect(calls.sends).toHaveLength(2);
    expect(calls.sends.every((call) => call.text.includes("не збігається"))).toBe(true);
  });

  it("resends a private command redirect as the sole latest canonical card", async () => {
    const session = activeSession();
    session.participants[0]!.replyKeyboardFingerprint = JSON.stringify(
      buildExpectedReplyKeyboard()
    );
    session.participants[0]!.replyKeyboardGeneration = 1;
    const calls = apiCalls();
    const bot = testBot(calls.middleware);
    const markParticipantCardDelivered = vi.fn().mockResolvedValue(true);
    const serviceSet = services(session, markParticipantCardDelivered);
    registerCombatLockMiddleware(bot, serviceSet);

    await bot.handleUpdate(commandUpdate("private"));

    expect(calls.sends).toHaveLength(1);
    expect(calls.sends[0]?.chatId).toBe(1001);
    expect(calls.sends[0]?.text).toContain("<b>Бій</b>");
    expect(readReplyKeyboard(calls.sends[0]?.replyMarkup)).toBeDefined();
    expect(calls.edits).toEqual([
      expect.objectContaining({ chatId: 1001, messageId: 21, replyMarkup: undefined }),
      expect.objectContaining({ chatId: 1001, messageId: 93, replyMarkup: undefined })
    ]);
    expect(calls.deletes).toEqual([{ chatId: 1001, messageId: 21 }]);
    expect(markParticipantCardDelivered).toHaveBeenCalledWith(expect.objectContaining({
      chatId: 1001n,
      messageId: 93,
      expectedDeliveryRevision: session.deliveryRevision
    }));
    expect(serviceSet.testSpies.findLease).toHaveBeenCalledTimes(1);
    expect(serviceSet.testSpies.findGroupById).toHaveBeenCalledWith(session.id);
    expect(serviceSet.testSpies.findGroupByUser).not.toHaveBeenCalled();
    expect(serviceSet.testSpies.findDuelByUser).not.toHaveBeenCalled();
    expect(serviceSet.testSpies.findPartyBossByUser).not.toHaveBeenCalled();
    expect(serviceSet.testSpies.findFightOverview).not.toHaveBeenCalled();
  });

  it("keeps participant text and mutating buttons out of a supergroup redirect", async () => {
    const session = activeSession();
    const calls = apiCalls();
    const bot = testBot(calls.middleware);
    registerCombatLockMiddleware(bot, services(session, vi.fn().mockResolvedValue(true)));

    await bot.handleUpdate(commandUpdate("supergroup"));

    expect(calls.edits).toEqual([expect.objectContaining({ chatId: 1001, messageId: 21 })]);
    expect(calls.sends).toHaveLength(1);
    expect(calls.sends[0]).toMatchObject({ chatId: -100587 });
    expect(calls.sends[0]?.text).toContain("особистій розмові");
    expect(calls.sends[0]?.text).not.toContain("Лідерка");
    expect(calls.sends[0]?.replyMarkup).toBeUndefined();

    await bot.handleUpdate(commandUpdate("private"));

    const privateCards = calls.sends.filter((call) => call.chatId === 1001);
    expect(privateCards).toHaveLength(1);
    expect(readReplyKeyboard(privateCards[0]?.replyMarkup)).toBeDefined();
  });
});

function services(
  session: GroupCombatSessionRecord,
  markParticipantCardDelivered: ReturnType<typeof vi.fn>
): BotServices & {
  testSpies: {
    findLease: ReturnType<typeof vi.fn>;
    findGroupById: ReturnType<typeof vi.fn>;
    findGroupByUser: ReturnType<typeof vi.fn>;
    findDuelByUser: ReturnType<typeof vi.fn>;
    findPartyBossByUser: ReturnType<typeof vi.fn>;
    findFightOverview: ReturnType<typeof vi.fn>;
  };
} {
  let uiClaimToken: string | null = null;
  const findLease = vi.fn().mockResolvedValue({
    characterId: "character-1",
    kind: "group-combat",
    referenceId: session.id
  });
  const findGroupById = vi.fn().mockResolvedValue(session);
  const findGroupByUser = vi.fn().mockResolvedValue(session);
  const findDuelByUser = vi.fn();
  const findPartyBossByUser = vi.fn();
  const findFightOverview = vi.fn();
  return {
    testSpies: {
      findLease,
      findGroupById,
      findGroupByUser,
      findDuelByUser,
      findPartyBossByUser,
      findFightOverview
    },
    combatLeases: {
      findActiveForTelegramUser: findLease
    },
    duel: {
      getActiveTurnBasedForTelegramUser: findDuelByUser
    },
    partyBoss: {
      getActiveForTelegramUser: findPartyBossByUser
    },
    fight: {
      getFightOverviewForTelegramUser: findFightOverview
    },
    groupCombat: {
      findActiveForTelegramUser: findGroupByUser,
      findById: findGroupById,
      currentTime: () => new Date("2026-07-22T10:00:00.000Z"),
      compareAndSetParticipantCard: vi.fn().mockImplementation((input: {
        telegramUserId: bigint;
        chatId: bigint;
        messageId: number;
      }) => {
        const participant = session.participants.find((row) => row.telegramUserId === input.telegramUserId)!;
        participant.chatId = input.chatId;
        participant.messageId = input.messageId;
        participant.referenceVersion += 1;
        participant.deliveredRevision = 0;
        return Promise.resolve(true);
      }),
      releaseParticipantCard: vi.fn().mockResolvedValue(true),
      markParticipantCardDelivered,
      claimParticipantUiPublication: vi.fn().mockImplementation((input: {
        keyboardFingerprint: string;
        claimToken: string;
      }) => {
        if (uiClaimToken && uiClaimToken !== input.claimToken) {
          return Promise.resolve({ state: "busy" });
        }
        uiClaimToken = input.claimToken;
        const participant = session.participants[0]!;
        return Promise.resolve({
          state: "claimed",
          publishReplyKeyboard:
            participant.replyKeyboardFingerprint !== input.keyboardFingerprint,
          keyboardGeneration: participant.replyKeyboardGeneration ?? 0
        });
      }),
      renewParticipantUiPublicationClaim: vi.fn().mockImplementation((input: {
        claimToken: string;
      }) => Promise.resolve(uiClaimToken === input.claimToken)),
      acknowledgeParticipantUiPublication: vi.fn().mockImplementation((input: {
        claimToken: string;
        publishedKeyboardFingerprint: string | null;
      }) => {
        if (uiClaimToken !== input.claimToken) {
          return Promise.resolve("not-owner");
        }
        const participant = session.participants[0]!;
        if (
          input.publishedKeyboardFingerprint !== null &&
          participant.replyKeyboardFingerprint !==
            input.publishedKeyboardFingerprint
        ) {
          participant.replyKeyboardFingerprint =
            input.publishedKeyboardFingerprint;
          participant.replyKeyboardGeneration =
            (participant.replyKeyboardGeneration ?? 0) + 1;
        }
        uiClaimToken = null;
        return Promise.resolve("acknowledged");
      }),
      releaseParticipantUiPublicationClaim: vi.fn().mockImplementation((input: {
        claimToken: string;
      }) => {
        if (uiClaimToken !== input.claimToken) {
          return Promise.resolve(false);
        }
        uiClaimToken = null;
        return Promise.resolve(true);
      })
    } as unknown as GroupCombatService
  } as unknown as BotServices & {
    testSpies: {
      findLease: ReturnType<typeof vi.fn>;
      findGroupById: ReturnType<typeof vi.fn>;
      findGroupByUser: ReturnType<typeof vi.fn>;
      findDuelByUser: ReturnType<typeof vi.fn>;
      findPartyBossByUser: ReturnType<typeof vi.fn>;
      findFightOverview: ReturnType<typeof vi.fn>;
    };
  };
}

function testBot(middleware: Parameters<Bot["api"]["config"]["use"]>[0]): Bot {
  const bot = new Bot("test-token", {
    botInfo: { id: 123, is_bot: true, first_name: "Квестарня", username: "kvestarnia_bot" }
  });
  bot.api.config.use(middleware);
  return bot;
}

function apiCalls() {
  const edits: Array<{ chatId: number; messageId: number; text: string; replyMarkup: unknown }> = [];
  const sends: Array<{ chatId: number; text: string; replyMarkup: unknown }> = [];
  const deletes: Array<{ chatId: number; messageId: number }> = [];
  return {
    edits,
    sends,
    deletes,
    middleware: ((_prev, method, payload) => {
      if (method === "editMessageText") {
        edits.push({
          chatId: Number(payload.chat_id),
          messageId: Number(payload.message_id),
          text: String(payload.text),
          replyMarkup: payload.reply_markup
        });
        return Promise.resolve({ ok: true, result: true });
      }
      if (method === "sendMessage") {
        sends.push({
          chatId: Number(payload.chat_id),
          text: String(payload.text),
          replyMarkup: payload.reply_markup
        });
        return Promise.resolve({
          ok: true,
          result: { message_id: 93, date: 0, chat: { id: Number(payload.chat_id), type: "private" } }
        });
      }
      if (method === "deleteMessage") {
        deletes.push({ chatId: Number(payload.chat_id), messageId: Number(payload.message_id) });
        return Promise.resolve({ ok: true, result: true });
      }
      return Promise.resolve({ ok: true, result: true });
    }) as Parameters<Bot["api"]["config"]["use"]>[0]
  };
}

function commandUpdate(type: "private" | "supergroup") {
  const chat = type === "private"
    ? { id: 1001, type: "private" as const }
    : { id: -100587, type: "supergroup" as const, title: "Тестова ватага" };
  return {
    update_id: type === "private" ? 1 : 2,
    message: {
      message_id: 1,
      date: 1,
      chat,
      from: { id: 1001, is_bot: false, first_name: "Лідерка" },
      text: "/adventure",
      entities: [{ type: "bot_command" as const, offset: 0, length: 10 }]
    }
  };
}

function activeSession(): GroupCombatSessionRecord {
  const participants = [
    { characterId: "character-1", telegramUserId: 1001n, name: "Лідерка", rosterOrder: 0 },
    { characterId: "character-2", telegramUserId: 1002n, name: "Друг", rosterOrder: 1 }
  ];
  return {
    id: "group-session",
    partySessionId: "party-session",
    partyInviteToken: "proof-token-13",
    status: "active",
    turn: 1,
    version: 1,
    deliveryRevision: 2,
    deliveryPending: true,
    deliveryAttemptedAt: null,
    turnExpiresAt: new Date("2026-07-22T10:00:23.000Z"),
    completedAt: null,
    result: null,
    participants: participants.map((participant, index) => ({
      ...participant,
      remortCount: 0,
      chatId: participant.telegramUserId,
      messageId: 21 + index,
      referenceVersion: 1,
      deliveredRevision: 1,
      replyKeyboardFingerprint: null,
      replyKeyboardGeneration: 0,
      exitDeliveryState: "none" as const,
      exitDeliveryClaimToken: null,
      exitDeliveryClaimedAt: null,
      exitDeliveryMessageId: null
    })),
    queuedActions: [],
    state: {
      rulesVersion: "group-combat.v1",
      sessionId: "group-session",
      partySessionId: "party-session",
      encounterKey: "proof-cellar-many",
      deterministicSeed: 42,
      status: "active",
      turn: 1,
      participants: participants.map((participant) => ({
        ...participant,
        telegramUserId: participant.telegramUserId.toString(),
        remortCount: 0,
        hp: 30,
        hpMax: 30,
        mana: 13,
        manaMax: 13,
        attack: 8,
        defense: 2,
        support: 5,
        equipmentItemIds: []
      })),
      enemies: [
        { id: "enemy-1", name: "Шурхіт", order: 0, hp: 12, hpMax: 12, attack: 4, defense: 0 },
        { id: "enemy-2", name: "Гуп", order: 1, hp: 14, hpMax: 14, attack: 5, defense: 1 }
      ],
      contributions: participants.map((participant) => ({
        characterId: participant.characterId,
        damage: 0,
        healing: 0,
        guardedTurns: 0
      })),
      recap: []
    }
  };
}

function readReplyKeyboard(value: unknown): unknown {
  return value && typeof value === "object" && "keyboard" in value
    ? value.keyboard
    : undefined;
}

function buildExpectedReplyKeyboard(): Array<Array<{ text: string }>> {
  return [
    [{ text: "⚔️ Атакувати" }],
    [{ text: "🛡️ Захиститися" }],
    [{ text: "🏃 Відступити" }, { text: "🔎 Оновити" }]
  ];
}
