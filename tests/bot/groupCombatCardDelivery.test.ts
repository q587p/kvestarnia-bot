import { describe, expect, it, vi } from "vitest";
import {
  deliverCanonicalGroupCombatParticipantCard,
  type GroupCombatDeliveryTransport
} from "../../src/bot/groupCombatCardDelivery";
import type { GroupCombatSessionRecord } from "../../src/db/repositories/groupCombatRepository";
import type { GroupCombatService } from "../../src/services/groupCombatService";

describe("group-combat canonical participant delivery", () => {
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

  it("cannot let an older edit restore action buttons after a queued-action revision commits", async () => {
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
    let editCount = 0;
    const transport: GroupCombatDeliveryTransport = {
      editMessage: async (_reference, _text, options) => {
        editCount += 1;
        if (editCount === 1) {
          firstEditStarted.resolve();
          await releaseFirstEdit.promise;
        }
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
    expect(keyboards.at(-1)).toEqual(["🔎 Оновити"]);
    expect(afterQueue.version).toBe(beforeQueue.version);
    expect(afterQueue.status).toBe(beforeQueue.status);
    expect(afterQueue.turn).toBe(beforeQueue.turn);
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

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}
