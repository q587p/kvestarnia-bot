import type { Api } from "grammy";
import { describe, expect, it, vi } from "vitest";
import {
  deliverCanonicalGroupCombatParticipantCard,
  deliverGroupCombatSettlementNotifications,
  deliverGroupCombatStartIntro,
  type GroupCombatDeliveryTransport
} from "../../src/bot/groupCombatCardDelivery";
import type { GroupCombatSessionRecord } from "../../src/db/repositories/groupCombatRepository";
import type { GroupCombatService } from "../../src/services/groupCombatService";

describe("group-combat canonical participant delivery", () => {
  it("delivers standard level and achievement notices as separate messages after settlement", async () => {
    const sendMessage = vi.fn().mockResolvedValue({ message_id: 93 });
    const api = { sendMessage } as unknown as Api;

    await expect(deliverGroupCombatSettlementNotifications(api, [{
      telegramUserId: 1001n,
      characterId: "character-1",
      characterName: "Лідерка",
      classId: "class.priest",
      raceId: "race.human-ish",
      levelChange: { oldLevel: 3, newLevel: 4, leveledUp: true },
      achievementUnlocks: [{
        id: "achievement.level.3",
        title: "Перший поверх амбіцій",
        cosmeticTitleGrantId: null,
        unlockedAt: new Date("2026-07-27T08:00:00.000Z")
      }]
    }])).resolves.toBe(1);

    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(String(sendMessage.mock.calls[0]?.[1])).toContain("Рівень підріс");
    expect(String(sendMessage.mock.calls[1]?.[1])).toContain("Нова ачівка");
    expect(sendMessage).toHaveBeenNthCalledWith(
      1,
      1001,
      expect.any(String),
      expect.objectContaining({ parse_mode: "HTML" })
    );
    expect(sendMessage).toHaveBeenNthCalledWith(
      2,
      1001,
      expect.any(String),
      expect.objectContaining({ parse_mode: "HTML" })
    );
  });

  it("does not send settlement notices when no level or achievement was earned", async () => {
    const sendMessage = vi.fn();

    await expect(deliverGroupCombatSettlementNotifications(
      { sendMessage } as unknown as Api,
      [{
        telegramUserId: 1001n,
        characterId: "character-1",
        characterName: "Лідерка",
        classId: "class.priest",
        raceId: "race.human-ish",
        levelChange: null,
        achievementUnlocks: []
      }]
    )).resolves.toBe(0);

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("sends a production start intro separately to every participant", async () => {
    const session = makeSession();
    session.state.rulesVersion = "group-combat.v3";
    session.state.encounterKey = "nyz-left-passage-party.v1";
    const editMessageText = vi.fn().mockResolvedValue(true);
    const sendMessage = vi.fn();
    const releaseParticipantCard = vi.fn((input: {
      telegramUserId: bigint;
      expectedReferenceVersion: number;
    }) => {
      const participant = session.participants.find(
        (candidate) => candidate.telegramUserId === input.telegramUserId
      );
      if (!participant || participant.referenceVersion !== input.expectedReferenceVersion) {
        return Promise.resolve(false);
      }
      participant.chatId = null;
      participant.messageId = null;
      participant.referenceVersion += 1;
      return Promise.resolve(true);
    });

    await expect(deliverGroupCombatStartIntro({
      editMessageText,
      sendMessage
    } as unknown as Api, {
      releaseParticipantCard
    } as unknown as GroupCombatService, session)).resolves.toBe(2);

    expect(editMessageText).toHaveBeenCalledTimes(2);
    expect(editMessageText).toHaveBeenNthCalledWith(
      1,
      1001,
      21,
      expect.stringContaining("<b>Хто проти кого:</b>"),
      {
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [] }
      }
    );
    expect(String(editMessageText.mock.calls[0]?.[2])).toContain("<i>Порада дня:");
    expect(String(editMessageText.mock.calls[1]?.[2])).toContain("<i>Порада дня:");
    expect(sendMessage).not.toHaveBeenCalled();
    expect(releaseParticipantCard).toHaveBeenCalledTimes(2);
    expect(session.participants.map((participant) => participant.messageId)).toEqual([null, null]);
  });

  it("does not resend an intro for proof, replay or later-turn delivery", async () => {
    const proof = makeSession();
    const productionReplay = makeSession({ turn: 2 });
    productionReplay.state.rulesVersion = "group-combat.v3";
    productionReplay.state.encounterKey = "nyz-left-passage-party.v1";
    const sendMessage = vi.fn();
    const api = { sendMessage } as unknown as Api;

    const service = {} as GroupCombatService;
    await expect(deliverGroupCombatStartIntro(api, service, proof)).resolves.toBe(0);
    await expect(deliverGroupCombatStartIntro(api, service, productionReplay)).resolves.toBe(0);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("converges an old-turn delivery to the newer authoritative turn before releasing its participant lock", async () => {
    const turnOne = makeSession({ turn: 1, version: 1 });
    const turnTwo = makeSession({ turn: 2, version: 2 });
    let authoritative = turnOne;
    const firstEditStarted = deferred<void>();
    const releaseFirstEdit = deferred<void>();
    const edits: string[] = [];
    let editCount = 0;
    const editMessage = vi.fn(async (
      _reference: Parameters<GroupCombatDeliveryTransport["editMessage"]>[0],
      text: string
    ) => {
      editCount += 1;
      if (editCount === 1) {
        firstEditStarted.resolve();
        await releaseFirstEdit.promise;
      }
      edits.push(text);
    });
    const sendInertMessage = vi.fn((
      _chatId: bigint,
      _text: string,
      _options: Parameters<GroupCombatDeliveryTransport["sendInertMessage"]>[2]
    ): Promise<number | null> => {
      void _chatId;
      void _text;
      void _options;
      return Promise.resolve(null);
    });
    const transport: GroupCombatDeliveryTransport = {
      editMessage,
      sendInertMessage,
      deleteMessage: () => Promise.resolve()
    };
    const service = {
      findById: vi.fn(() => Promise.resolve(authoritative)),
      markParticipantCardDelivered: vi.fn().mockResolvedValue(true)
    } as unknown as GroupCombatService;

    const oldDelivery = deliverCanonicalGroupCombatParticipantCard({
      service,
      sessionId: turnOne.id,
      participantCharacterId: "character-1",
      transport
    });
    await firstEditStarted.promise;
    authoritative = turnTwo;
    const newDelivery = deliverCanonicalGroupCombatParticipantCard({
      service,
      sessionId: turnOne.id,
      participantCharacterId: "character-1",
      transport
    });
    releaseFirstEdit.resolve();

    await expect(Promise.all([oldDelivery, newDelivery])).resolves.toHaveLength(2);
    expect(edits[0]).toContain("Бій: 1 хід");
    expect(edits.at(-1)).toContain("Бій: 2 хід");
    expect(edits.slice(edits.findIndex((text) => text.includes("Бій: 2 хід")))).not.toEqual(
      expect.arrayContaining([expect.stringContaining("Бій: 1 хід")])
    );
    expect(sendInertMessage).not.toHaveBeenCalled();
  });

  it("keeps a losing repair candidate inert when candidate deletion fails", async () => {
    const withoutReference = makeSession({ chatId: null, messageId: null, referenceVersion: 0 });
    const winner = makeSession({ chatId: 1001n, messageId: 77, referenceVersion: 1 });
    const findById = vi.fn()
      .mockResolvedValueOnce(withoutReference)
      .mockResolvedValue(winner);
    const edits: number[] = [];
    const sentOptions: unknown[] = [];
    const deleteMessage = vi.fn((
      _reference: Parameters<GroupCombatDeliveryTransport["deleteMessage"]>[0]
    ): Promise<void> => {
      void _reference;
      return Promise.reject(new Error("Telegram delete failed"));
    });
    const transport: GroupCombatDeliveryTransport = {
      editMessage: (reference) => {
        edits.push(reference.messageId);
        return Promise.resolve();
      },
      sendInertMessage: (_chatId, _text, options) => {
        sentOptions.push(options);
        return Promise.resolve(31);
      },
      deleteMessage
    };
    const service = {
      findById,
      compareAndSetParticipantCard: vi.fn().mockResolvedValue(false),
      markParticipantCardDelivered: vi.fn().mockResolvedValue(true)
    } as unknown as GroupCombatService;

    const result = await deliverCanonicalGroupCombatParticipantCard({
      service,
      sessionId: withoutReference.id,
      participantCharacterId: "character-1",
      transport
    });

    expect(result.state).toBe("edited");
    expect(sentOptions).toEqual([expect.objectContaining({ reply_markup: { inline_keyboard: [] } })]);
    expect(deleteMessage).toHaveBeenCalledWith({ chatId: 1001n, messageId: 31 });
    expect(edits).toEqual([77]);
    expect(edits).not.toContain(31);
  });

  it("promotes a replacement card to the latest message and retires the previous canonical reference", async () => {
    const session = makeSession();
    const oldReference = { chatId: 1001n, messageId: 21 };
    const edits: Array<{ messageId: number; buttons: string[] }> = [];
    const deleteMessage = vi.fn().mockResolvedValue(undefined);
    const sendInertMessage = vi.fn().mockResolvedValue(93);
    const transport: GroupCombatDeliveryTransport = {
      editMessage: (reference, _text, options) => {
        edits.push({
          messageId: reference.messageId,
          buttons: options.reply_markup.inline_keyboard.flat().map((button) => button.text)
        });
        return Promise.resolve();
      },
      sendInertMessage,
      deleteMessage
    };
    const service = mutableCardService(session);

    const result = await deliverCanonicalGroupCombatParticipantCard({
      service,
      sessionId: session.id,
      participantCharacterId: "character-1",
      transport,
      forceReplacement: true
    });

    expect(result).toMatchObject({ state: "activated", reference: { chatId: 1001n, messageId: 93 } });
    expect(sendInertMessage).toHaveBeenCalledWith(
      1001n,
      expect.any(String),
      expect.objectContaining({ reply_markup: { inline_keyboard: [] } })
    );
    expect(edits).toHaveLength(2);
    expect(edits[0]).toEqual({ messageId: 21, buttons: [] });
    expect(edits[1]?.messageId).toBe(93);
    expect(edits[1]?.buttons.some((button) => button.includes("Шурхіт"))).toBe(true);
    expect(deleteMessage).toHaveBeenCalledWith(oldReference);
  });

  it("leaves the previous card inert when deletion fails after successful activation", async () => {
    const session = makeSession();
    const actionable = new Set([21]);
    const deleteMessage = vi.fn(() => Promise.reject(new Error("Telegram delete failed")));
    const transport: GroupCombatDeliveryTransport = {
      editMessage: (reference, _text, options) => {
        const hasButtons = options.reply_markup.inline_keyboard.flat().length > 0;
        if (hasButtons) {
          actionable.add(reference.messageId);
        } else {
          actionable.delete(reference.messageId);
        }
        return Promise.resolve();
      },
      sendInertMessage: () => Promise.resolve(93),
      deleteMessage
    };

    const result = await deliverCanonicalGroupCombatParticipantCard({
      service: mutableCardService(session),
      sessionId: session.id,
      participantCharacterId: "character-1",
      transport,
      forceReplacement: true
    });

    expect(result).toMatchObject({ state: "activated", reference: { messageId: 93 } });
    expect(actionable).toEqual(new Set([93]));
    expect(deleteMessage).toHaveBeenCalledWith({ chatId: 1001n, messageId: 21 });
  });

  it("keeps an ambiguously activated candidate canonical and converges without rearming the previous card", async () => {
    const session = makeSession();
    const actionable = new Set([21]);
    let candidateAttempts = 0;
    const deleteMessage = vi.fn(() => Promise.reject(new Error("Telegram delete failed")));
    const transport: GroupCombatDeliveryTransport = {
      editMessage: (reference, _text, options) => {
        const hasButtons = options.reply_markup.inline_keyboard.flat().length > 0;
        if (reference.messageId === 93 && hasButtons) {
          candidateAttempts += 1;
          actionable.add(93);
          if (candidateAttempts === 1) {
            return Promise.reject(new Error("response lost after Telegram applied edit"));
          }
          return Promise.resolve();
        }
        if (hasButtons) {
          actionable.add(reference.messageId);
        } else {
          actionable.delete(reference.messageId);
        }
        return Promise.resolve();
      },
      sendInertMessage: () => Promise.resolve(93),
      deleteMessage
    };
    const service = mutableCardService(session);

    const failed = await deliverCanonicalGroupCombatParticipantCard({
      service,
      sessionId: session.id,
      participantCharacterId: "character-1",
      transport,
      forceReplacement: true
    });

    expect(failed).toMatchObject({ state: "retryable-edit-failure", reference: { messageId: 93 } });
    expect(actionable).toEqual(new Set([93]));
    expect(session.participants[0]).toMatchObject({ chatId: 1001n, messageId: 93, deliveredRevision: 0 });
    expect(deleteMessage).not.toHaveBeenCalled();

    const retried = await deliverCanonicalGroupCombatParticipantCard({
      service,
      sessionId: session.id,
      participantCharacterId: "character-1",
      transport
    });

    expect(actionable).toEqual(new Set([93]));
    expect(session.participants[0]).toMatchObject({ chatId: 1001n, messageId: 93, deliveredRevision: 1 });
    expect(retried).toMatchObject({ state: "edited", reference: { messageId: 93 } });
    expect(candidateAttempts).toBe(2);
    expect(deleteMessage).not.toHaveBeenCalled();
  });

  it("keeps both cards inert when candidate activation fails before applying and activates the candidate on retry", async () => {
    const session = makeSession();
    const actionable = new Set([21]);
    let candidateAttempts = 0;
    const transport: GroupCombatDeliveryTransport = {
      editMessage: (reference, _text, options) => {
        const hasButtons = options.reply_markup.inline_keyboard.flat().length > 0;
        if (reference.messageId === 93 && hasButtons) {
          candidateAttempts += 1;
          if (candidateAttempts === 1) {
            return Promise.reject(new Error("Telegram failed before applying edit"));
          }
        }
        if (hasButtons) {
          actionable.add(reference.messageId);
        } else {
          actionable.delete(reference.messageId);
        }
        return Promise.resolve();
      },
      sendInertMessage: () => Promise.resolve(93),
      deleteMessage: () => Promise.reject(new Error("candidate deletion would fail"))
    };
    const service = mutableCardService(session);

    const failed = await deliverCanonicalGroupCombatParticipantCard({
      service,
      sessionId: session.id,
      participantCharacterId: "character-1",
      transport,
      forceReplacement: true
    });

    expect(failed).toMatchObject({ state: "retryable-edit-failure", reference: { messageId: 93 } });
    expect(actionable).toEqual(new Set());
    expect(session.participants[0]).toMatchObject({ chatId: 1001n, messageId: 93, deliveredRevision: 0 });

    const retried = await deliverCanonicalGroupCombatParticipantCard({
      service,
      sessionId: session.id,
      participantCharacterId: "character-1",
      transport
    });

    expect(retried).toMatchObject({ state: "edited", reference: { messageId: 93 } });
    expect(actionable).toEqual(new Set([93]));
    expect(candidateAttempts).toBe(2);
  });

  it("restores the previous canonical card when the promoted candidate is unavailable", async () => {
    const session = makeSession();
    const actionable = new Set([21]);
    const edits: Array<{ messageId: number; hasButtons: boolean }> = [];
    const transport: GroupCombatDeliveryTransport = {
      editMessage: (reference, _text, options) => {
        const hasButtons = options.reply_markup.inline_keyboard.flat().length > 0;
        edits.push({ messageId: reference.messageId, hasButtons });
        if (reference.messageId === 93 && hasButtons) {
          actionable.delete(93);
          return Promise.reject(new Error("Bad Request: message to edit not found"));
        }
        if (hasButtons) {
          actionable.add(reference.messageId);
        } else {
          actionable.delete(reference.messageId);
        }
        return Promise.resolve();
      },
      sendInertMessage: () => Promise.resolve(93),
      deleteMessage: (reference) => {
        actionable.delete(reference.messageId);
        return Promise.resolve();
      }
    };
    const service = mutableCardService(session);

    const result = await deliverCanonicalGroupCombatParticipantCard({
      service,
      sessionId: session.id,
      participantCharacterId: "character-1",
      transport,
      forceReplacement: true
    });

    expect(result).toMatchObject({ state: "edited", reference: { messageId: 21 } });
    expect(edits).toEqual([
      { messageId: 21, hasButtons: false },
      { messageId: 93, hasButtons: true },
      { messageId: 21, hasButtons: true }
    ]);
    expect(actionable).toEqual(new Set([21]));
    expect(session.participants[0]).toMatchObject({ chatId: 1001n, messageId: 21 });
  });

  it("does not activate a replacement when the previous actionable card cannot be made inert", async () => {
    const session = makeSession();
    const actionable = new Set([21]);
    const candidateActivation = vi.fn();
    const deleteMessage = vi.fn((reference: { messageId: number }) => {
      actionable.delete(reference.messageId);
      return Promise.resolve();
    });
    const transport: GroupCombatDeliveryTransport = {
      editMessage: (reference, _text, options) => {
        const hasButtons = options.reply_markup.inline_keyboard.flat().length > 0;
        if (reference.messageId === 21) {
          return Promise.reject(new Error("Telegram edit failed"));
        }
        if (hasButtons) {
          candidateActivation();
          actionable.add(reference.messageId);
        } else {
          actionable.delete(reference.messageId);
        }
        return Promise.resolve();
      },
      sendInertMessage: () => Promise.resolve(93),
      deleteMessage
    };
    const service = mutableCardService(session);

    const result = await deliverCanonicalGroupCombatParticipantCard({
      service,
      sessionId: session.id,
      participantCharacterId: "character-1",
      transport,
      forceReplacement: true
    });

    expect(result).toMatchObject({ state: "retryable-edit-failure", reference: { messageId: 21 } });
    expect(candidateActivation).not.toHaveBeenCalled();
    expect(deleteMessage).toHaveBeenCalledWith({ chatId: 1001n, messageId: 93 });
    expect(actionable).toEqual(new Set([21]));
    expect(session.participants[0]).toMatchObject({ chatId: 1001n, messageId: 21 });
  });

  it("cannot let an older edit hide the latest replaceable queued-action plan", async () => {
    const beforeQueue = makeSession({ deliveryRevision: 1 });
    const afterQueue = makeSession({
      deliveryRevision: 2,
      queuedActions: [{
        actorCharacterId: "character-1",
        turn: 1,
        action: "guard",
        targetKind: "self",
        targetId: "character-1",
        origin: "manual"
      }]
    });
    let authoritative = beforeQueue;
    const firstEditStarted = deferred<void>();
    const releaseFirstEdit = deferred<void>();
    const keyboards: string[][] = [];
    const texts: string[] = [];
    let editCount = 0;
    const transport: GroupCombatDeliveryTransport = {
      editMessage: async (_reference, text, options) => {
        editCount += 1;
        if (editCount === 1) {
          firstEditStarted.resolve();
          await releaseFirstEdit.promise;
        }
        texts.push(text);
        keyboards.push(options.reply_markup.inline_keyboard.flat().map((button) => button.text));
      },
      sendInertMessage: () => Promise.resolve(null),
      deleteMessage: () => Promise.resolve()
    };
    const service = {
      findById: vi.fn(() => Promise.resolve(authoritative)),
      markParticipantCardDelivered: vi.fn().mockResolvedValue(true)
    } as unknown as GroupCombatService;

    const delivery = deliverCanonicalGroupCombatParticipantCard({
      service,
      sessionId: beforeQueue.id,
      participantCharacterId: "character-1",
      transport
    });
    await firstEditStarted.promise;
    authoritative = afterQueue;
    releaseFirstEdit.resolve();

    await expect(delivery).resolves.toMatchObject({ state: "edited" });
    expect(keyboards[0]).toEqual(expect.arrayContaining([expect.stringContaining("Шурхіт")]));
    expect(keyboards.at(-1)).toEqual(expect.arrayContaining([expect.stringContaining("Шурхіт")]));
    expect(texts.at(-1)).toContain("вибір записано: захиститися");
    expect(afterQueue.version).toBe(beforeQueue.version);
    expect(afterQueue.status).toBe(beforeQueue.status);
    expect(afterQueue.turn).toBe(beforeQueue.turn);
  });

  it("keeps the authoritative deadline when another participant queues and replaces an action", async () => {
    const session = makeSession({
      deliveryRevision: 3,
      queuedActions: [{
        actorCharacterId: "character-2",
        turn: 1,
        action: "attack",
        targetKind: "enemy",
        targetId: "enemy-2",
        origin: "manual"
      }]
    });
    const texts: string[] = [];
    const transport: GroupCombatDeliveryTransport = {
      editMessage: (_reference, text) => {
        texts.push(text);
        return Promise.resolve();
      },
      sendInertMessage: () => Promise.resolve(null),
      deleteMessage: () => Promise.resolve()
    };
    const service = {
      findById: vi.fn().mockResolvedValue(session),
      markParticipantCardDelivered: vi.fn().mockResolvedValue(true)
    } as unknown as GroupCombatService;

    await deliverCanonicalGroupCombatParticipantCard({
      service,
      sessionId: session.id,
      participantCharacterId: "character-1",
      transport,
      forceRefresh: true,
      now: () => new Date("2026-07-22T10:00:17.000Z")
    });

    expect(texts.at(-1)).toContain("⏳ До захисту мовчунів — 6 с.");
    expect(texts.at(-1)).not.toContain("23 с.");
  });
});

function makeSession(overrides: {
  turn?: number;
  version?: number;
  chatId?: bigint | null;
  messageId?: number | null;
  referenceVersion?: number;
  deliveryRevision?: number;
  deliveredRevision?: number;
  queuedActions?: GroupCombatSessionRecord["queuedActions"];
} = {}): GroupCombatSessionRecord {
  const turn = overrides.turn ?? 1;
  return {
    id: "group-session",
    partySessionId: "party-session",
    partyInviteToken: "proof-token-13",
    status: "active",
    turn,
    version: overrides.version ?? 1,
    deliveryRevision: overrides.deliveryRevision ?? 1,
    deliveryPending: true,
    deliveryAttemptedAt: null,
    turnExpiresAt: new Date("2026-07-22T10:00:23.000Z"),
    completedAt: null,
    result: null,
    participants: [
      participantRecord("character-1", 1001n, "Лідерка", 0, overrides),
      participantRecord("character-2", 1002n, "Друг", 1)
    ],
    queuedActions: overrides.queuedActions ?? [],
    state: {
      rulesVersion: "group-combat.v1",
      sessionId: "group-session",
      partySessionId: "party-session",
      encounterKey: "proof-cellar-many",
      deterministicSeed: 42,
      status: "active",
      turn,
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

function participantRecord(
  characterId: string,
  telegramUserId: bigint,
  name: string,
  rosterOrder: number,
  overrides: {
    chatId?: bigint | null;
    messageId?: number | null;
    referenceVersion?: number;
    deliveredRevision?: number;
  } = {}
) {
  return {
    characterId,
    telegramUserId,
    name,
    remortCount: 0,
    rosterOrder,
    chatId: overrides.chatId === undefined ? telegramUserId : overrides.chatId,
    messageId: overrides.messageId === undefined ? 21 + rosterOrder : overrides.messageId,
    referenceVersion: overrides.referenceVersion ?? 1,
    deliveredRevision: overrides.deliveredRevision ?? 0
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

function mutableCardService(session: GroupCombatSessionRecord): GroupCombatService {
  return {
    findById: vi.fn(() => Promise.resolve(session)),
    compareAndSetParticipantCard: vi.fn((input: {
      expectedReferenceVersion: number;
      chatId: bigint;
      messageId: number;
    }) => {
      const participant = session.participants[0]!;
      if (participant.referenceVersion !== input.expectedReferenceVersion) {
        return Promise.resolve(false);
      }
      participant.chatId = input.chatId;
      participant.messageId = input.messageId;
      participant.referenceVersion += 1;
      participant.deliveredRevision = 0;
      return Promise.resolve(true);
    }),
    markParticipantCardDelivered: vi.fn().mockImplementation(() => {
      session.participants[0]!.deliveredRevision = session.deliveryRevision;
      return Promise.resolve(true);
    })
  } as unknown as GroupCombatService;
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}
