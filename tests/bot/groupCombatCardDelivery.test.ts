import type { Api } from "grammy";
import { describe, expect, it, vi } from "vitest";
import {
  deliverCanonicalGroupCombatParticipantCard,
  deliverGroupCombatCards,
  deliverGroupCombatSettlementNotifications,
  deliverGroupCombatStartIntro,
  type GroupCombatDeliveryTransport
} from "../../src/bot/groupCombatCardDelivery";
import type { GroupCombatSessionRecord } from "../../src/db/repositories/groupCombatRepository";
import type { GroupCombatService } from "../../src/services/groupCombatService";
import { buildGroupCombatReplyKeyboard } from "../../src/bot/keyboards/groupCombatKeyboard";

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
      expect.stringContaining("Бій починається. Корчма відкриває журнал ходів"),
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

  it("restores the main reply keyboard before publishing a fresh terminal Journal/Statistics card", async () => {
    const session = makeSession();
    session.status = "won";
    session.state.status = "won";
    session.participants.forEach((participant) => {
      participant.exitDeliveryState = "pending";
    });
    session.state.enemies.forEach((enemy) => {
      enemy.hp = 0;
    });
    session.state.recap = [{ turn: 1, lines: ["Лідерка атакує Шурхіт: 12 шкоди."] }];
    let nextMessageId = 90;
    const sends: Array<{
      chatId: number;
      messageId: number;
      text: string;
      replyMarkup: unknown;
    }> = [];
    const edits: Array<{ chatId: number; messageId: number; labels: string[] }> = [];
    const sendMessage = vi.fn((
      chatId: number,
      text: string,
      options?: { reply_markup?: { inline_keyboard?: Array<Array<{ text: string }>> } | { keyboard?: unknown } }
    ) => {
      const messageId = nextMessageId++;
      sends.push({ chatId, messageId, text, replyMarkup: options?.reply_markup });
      return Promise.resolve({ message_id: messageId });
    });
    const editMessageText = vi.fn((
      chatId: number,
      messageId: number,
      _text: string,
      options?: { reply_markup?: { inline_keyboard?: Array<Array<{ text: string }>> } }
    ) => {
      edits.push({
        chatId,
        messageId,
        labels: options?.reply_markup?.inline_keyboard?.flat().map((button) => button.text) ?? []
      });
      return Promise.resolve(true);
    });
    const service = mutableCardService(session);

    await expect(deliverGroupCombatCards({
      sendMessage,
      editMessageText,
      deleteMessage: vi.fn().mockResolvedValue(true)
    } as unknown as Api, {
      ...service,
      finalizeDeliveryAttempt: vi.fn().mockResolvedValue(true)
    } as unknown as GroupCombatService, session)).resolves.toBe(2);

    for (const participant of session.participants) {
      const participantSends = sends.filter(
        (entry) => entry.chatId === Number(participant.telegramUserId)
      );
      expect(participantSends).toHaveLength(2);
      expect(participantSends[0]?.text).toContain("Головне меню");
      expect(hasReplyKeyboard(participantSends[0]?.replyMarkup)).toBe(true);
      expect(participantSends[1]?.text).toContain("Доказову сутичку виграно");
      expect(hasReplyKeyboard(participantSends[1]?.replyMarkup)).toBe(false);
      expect(inlineButtonLabels(participantSends[1]?.replyMarkup)).toEqual([
        "📜 Журнал",
        "📊 Статистика"
      ]);
      expect(participant.exitDeliveryState).toBe("completed");
      expect(participant.chatId).toBe(participant.telegramUserId);
      expect(participant.messageId).toBe(participantSends[1]?.messageId);
      expect(participant.deliveredRevision).toBe(session.deliveryRevision);
    }
  });

  it("retains an ambiguously committed terminal card when the authoritative reload is unavailable", async () => {
    const session = makeSession();
    session.status = "won";
    session.state.status = "won";
    session.state.enemies.forEach((enemy) => {
      enemy.hp = 0;
    });
    session.participants = session.participants.slice(0, 1);
    session.participants[0]!.exitDeliveryState = "pending";
    let reads = 0;
    const service = mutableCardService(session);
    const deleteMessage = vi.fn().mockResolvedValue(true);
    const sendMessage = vi.fn()
      .mockResolvedValueOnce({ message_id: 90 })
      .mockResolvedValueOnce({ message_id: 91 });

    await expect(deliverGroupCombatCards({
      sendMessage,
      editMessageText: vi.fn().mockResolvedValue(true),
      deleteMessage
    } as unknown as Api, {
      ...service,
      findById: vi.fn(() => {
        reads += 1;
        return Promise.resolve(reads <= 3 ? session : null);
      }),
      completeParticipantFleeExitDelivery: vi.fn().mockRejectedValue(
        new Error("database acknowledgement outcome unknown")
      ),
      finalizeDeliveryAttempt: vi.fn().mockResolvedValue(false)
    } as unknown as GroupCombatService, session)).resolves.toBe(0);

    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(String(sendMessage.mock.calls[1]?.[1])).toContain("Доказову сутичку виграно");
    expect(deleteMessage).not.toHaveBeenCalled();
    expect(session.participants[0]!.exitDeliveryState).toBe("menu-delivered");
  });

  it("restores only a successful escapee's main keyboard while the party fight continues", async () => {
    const session = makeSession({
      turn: 2,
      deliveryRevision: 2,
      deliveredRevision: 1
    });
    session.participants[1]!.deliveredRevision = 2;
    session.participants[0]!.exitDeliveryState = "pending";
    session.state.participants[0]!.fleeAttempts = 1;
    session.state.participants[0]!.fledAtTurn = 1;
    const sendMessage = vi.fn()
      .mockResolvedValueOnce({ message_id: 90 })
      .mockResolvedValueOnce({ message_id: 91 });
    const editMessageText = vi.fn().mockResolvedValue(true);

    await expect(deliverGroupCombatCards({
      sendMessage,
      editMessageText,
      deleteMessage: vi.fn().mockResolvedValue(true)
    } as unknown as Api, {
      ...mutableCardService(session),
      finalizeDeliveryAttempt: vi.fn().mockResolvedValue(true)
    } as unknown as GroupCombatService, session)).resolves.toBe(2);

    expect(sendMessage.mock.calls.filter((call) =>
      String(call[1]).includes("Ви відступили з бою")
    )).toHaveLength(1);
    const exitCall = sendMessage.mock.calls.find((call) =>
      String(call[1]).includes("Ви відступили з бою")
    );
    expect(exitCall?.[0]).toBe(1001);
    expect(hasReplyKeyboard(readReplyMarkup(exitCall?.[2] as unknown))).toBe(true);
    expect(sendMessage.mock.calls.some((call) =>
      call[0] === 1002 &&
      String(call[1]).includes("<b>Бій</b>:") &&
      Boolean((call[2] as { reply_markup?: { keyboard?: unknown } })?.reply_markup?.keyboard)
    )).toBe(true);
    expect(session.participants[0]!.exitDeliveryState).toBe("completed");
    expect(session.participants[0]!.messageId).toBeNull();
  });

  it("keeps legacy proof flee delivery on its existing non-production path", async () => {
    const session = makeSession({
      turn: 2,
      deliveryRevision: 2,
      deliveredRevision: 1
    });
    session.participants[1]!.deliveredRevision = 2;
    session.state.participants[0]!.fleeAttempts = 1;
    session.state.participants[0]!.fledAtTurn = 1;
    let nextMessageId = 90;
    const sendMessage = vi.fn(() =>
      Promise.resolve({ message_id: nextMessageId++ })
    );
    const service = mutableCardService(session);

    await expect(deliverGroupCombatCards({
      sendMessage,
      editMessageText: vi.fn().mockResolvedValue(true),
      deleteMessage: vi.fn().mockResolvedValue(true)
    } as unknown as Api, {
      ...service,
      finalizeDeliveryAttempt: vi.fn().mockResolvedValue(true)
    } as unknown as GroupCombatService, session)).resolves.toBe(2);

    expect(String(sendMessage.mock.calls[0]?.[1])).toContain("Ви відступили з бою");
    expect(session.participants[0]!.exitDeliveryState).toBe("none");
    expect(session.participants[0]!.messageId).toBe(92);
  });

  it("retries a failed flee menu after several later party turns", async () => {
    const session = makeSession({
      turn: 2,
      deliveryRevision: 2,
      deliveredRevision: 2
    });
    session.participants[0]!.exitDeliveryState = "pending";
    session.participants[1]!.deliveredRevision = 2;
    session.state.participants[0]!.fleeAttempts = 1;
    session.state.participants[0]!.fledAtTurn = 1;
    let exitAttempts = 0;
    const sendMessage = vi.fn((
      _chatId: number,
      text: string
    ) => {
      if (
        String(text).includes("Ви відступили з бою") &&
        exitAttempts++ === 0
      ) {
        return Promise.reject(new Error("Telegram unavailable"));
      }
      return Promise.resolve({ message_id: 93 });
    });
    const editMessageText = vi.fn().mockResolvedValue(true);
    const service = mutableCardService(session);

    await deliverGroupCombatCards({
      sendMessage,
      editMessageText,
      deleteMessage: vi.fn()
    } as unknown as Api, {
      ...service,
      finalizeDeliveryAttempt: vi.fn().mockResolvedValue(true)
    } as unknown as GroupCombatService, session);

    expect(session.participants[0]!.exitDeliveryState).toBe("pending");
    session.state.turn = 5;
    session.turn = 5;
    session.deliveryRevision = 5;
    session.participants[1]!.deliveredRevision = 5;

    await deliverGroupCombatCards({
      sendMessage,
      editMessageText,
      deleteMessage: vi.fn()
    } as unknown as Api, {
      ...service,
      finalizeDeliveryAttempt: vi.fn().mockResolvedValue(true)
    } as unknown as GroupCombatService, session);

    expect(sendMessage.mock.calls.filter((call) =>
      String(call[1]).includes("Ви відступили з бою")
    )).toHaveLength(2);
    expect(session.participants[0]!.exitDeliveryState).toBe("completed");
  });

  it.each([
    { label: "successful flee", terminal: false },
    { label: "terminal settlement", terminal: true }
  ])(
    "aborts a delayed $label main-menu send before its exit claim can expire",
    async ({ terminal }) => {
      vi.useFakeTimers();
      try {
        const session = makeSession({
          turn: 3,
          deliveryRevision: 3,
          deliveredRevision: 3
        });
        session.participants = session.participants.slice(0, 1);
        session.participants[0]!.exitDeliveryState = "pending";
        if (terminal) {
          session.status = "won";
          session.state.status = "won";
          session.state.enemies.forEach((enemy) => {
            enemy.hp = 0;
          });
        } else {
          session.state.participants[0]!.fleeAttempts = 1;
          session.state.participants[0]!.fledAtTurn = 2;
        }
        const service = mutableCardService(session);
        const releaseClaim = vi.fn((
          input: Parameters<
            GroupCombatService["releaseParticipantFleeExitDeliveryClaim"]
          >[0]
        ) => service.releaseParticipantFleeExitDeliveryClaim(input));
        const sendStarted = deferred<void>();
        let observedSignal: AbortSignal | undefined;
        const sendMessage = vi.fn((
          _chatId: number,
          text: string,
          _options: unknown,
          signal?: AbortSignal
        ) => {
          if (
            text.includes("Ви відступили з бою") ||
            text.includes("Бій завершено")
          ) {
            observedSignal = signal;
            sendStarted.resolve();
            return new Promise((_resolve, reject) => {
              signal?.addEventListener(
                "abort",
                () => reject(new Error("exit publication aborted")),
                { once: true }
              );
            });
          }
          return Promise.resolve({ message_id: 700 });
        });

        const delivery = deliverGroupCombatCards({
          sendMessage,
          editMessageText: vi.fn(),
          deleteMessage: vi.fn()
        } as unknown as Api, {
          ...service,
          releaseParticipantFleeExitDeliveryClaim: releaseClaim,
          finalizeDeliveryAttempt: vi.fn().mockResolvedValue(false)
        } as unknown as GroupCombatService, session);

        await sendStarted.promise;
        await vi.advanceTimersByTimeAsync(13_000);
        await expect(delivery).resolves.toBe(0);

        expect(observedSignal?.aborted).toBe(true);
        expect(sendMessage).toHaveBeenCalledTimes(1);
        expect(releaseClaim).toHaveBeenCalledTimes(1);
        expect(session.participants[0]!.exitDeliveryState).toBe("pending");
      } finally {
        vi.useRealTimers();
      }
    }
  );

  it("publishes no exit menu when ownership is lost while navigation markers resolve", async () => {
    const session = makeSession({
      turn: 3,
      deliveryRevision: 3,
      deliveredRevision: 3
    });
    session.participants = session.participants.slice(0, 1);
    session.participants[0]!.exitDeliveryState = "pending";
    session.state.participants[0]!.fleeAttempts = 1;
    session.state.participants[0]!.fledAtTurn = 2;
    const service = mutableCardService(session);
    const sendMessage = vi.fn();
    const releaseClaim = vi.fn((
      input: Parameters<
        GroupCombatService["releaseParticipantFleeExitDeliveryClaim"]
      >[0]
    ) => service.releaseParticipantFleeExitDeliveryClaim(input));

    await expect(deliverGroupCombatCards({
      sendMessage,
      editMessageText: vi.fn(),
      deleteMessage: vi.fn()
    } as unknown as Api, {
      ...service,
      releaseParticipantFleeExitDeliveryClaim: releaseClaim,
      renewParticipantFleeExitDeliveryClaim: vi.fn().mockResolvedValue(false),
      finalizeDeliveryAttempt: vi.fn().mockResolvedValue(false)
    } as unknown as GroupCombatService, session)).resolves.toBe(0);

    expect(sendMessage).not.toHaveBeenCalled();
    expect(releaseClaim).not.toHaveBeenCalled();
    expect(session.participants[0]!.exitDeliveryState).toBe("claimed");
  });

  it.each([
    { label: "successful flee", terminal: false },
    { label: "terminal settlement", terminal: true }
  ])(
    "keeps a reclaimed $label menu and newer combat keyboard after an older process finally rejects",
    async ({ terminal }) => {
      vi.useFakeTimers();
      try {
        const session = makeSession({
          turn: 3,
          deliveryRevision: 3,
          deliveredRevision: 3
        });
        session.participants = session.participants.slice(0, 1);
        session.participants[0]!.exitDeliveryState = "pending";
        if (terminal) {
          session.status = "won";
          session.state.status = "won";
          session.state.enemies.forEach((enemy) => {
            enemy.hp = 0;
          });
        } else {
          session.state.participants[0]!.fleeAttempts = 1;
          session.state.participants[0]!.fledAtTurn = 2;
        }
        let currentTime = new Date("2026-07-29T10:00:00.000Z");
        const service = mutableCardService(session);
        const published: string[] = [];
        const oldSendStarted = deferred<void>();
        const rejectOldSend = deferred<void>();
        let menuAttempt = 0;
        const sendMessage = vi.fn((
          _chatId: number,
          text: string,
          _options: unknown,
          signal?: AbortSignal
        ) => {
          const isMenu =
            text.includes("Ви відступили з бою") ||
            text.includes("Бій завершено");
          if (isMenu && menuAttempt++ === 0) {
            oldSendStarted.resolve();
            return rejectOldSend.promise.then(() => {
              expect(signal?.aborted).toBe(true);
              throw new Error("old process observes its aborted request");
            });
          }
          published.push(isMenu ? "reclaimed-menu" : "terminal-card");
          return Promise.resolve({ message_id: 900 + published.length });
        });
        const api = {
          sendMessage,
          editMessageText: vi.fn().mockResolvedValue(true),
          deleteMessage: vi.fn().mockResolvedValue(true)
        } as unknown as Api;

        vi.resetModules();
        const firstProcess = await import(
          "../../src/bot/groupCombatCardDelivery"
        );
        const firstDelivery = firstProcess.deliverGroupCombatCards(api, {
          ...service,
          currentTime: () => currentTime,
          finalizeDeliveryAttempt: vi.fn().mockResolvedValue(false)
        } as unknown as GroupCombatService, session);
        await oldSendStarted.promise;
        await vi.advanceTimersByTimeAsync(13_000);

        currentTime = new Date(currentTime.getTime() + 23_001);
        vi.resetModules();
        const restartedProcess = await import(
          "../../src/bot/groupCombatCardDelivery"
        );
        await expect(restartedProcess.deliverGroupCombatCards(api, {
          ...service,
          currentTime: () => currentTime,
          finalizeDeliveryAttempt: vi.fn().mockResolvedValue(true)
        } as unknown as GroupCombatService, session)).resolves.toBe(1);
        published.push("newer-combat-keyboard");

        rejectOldSend.resolve();
        await expect(firstDelivery).resolves.toBe(0);

        expect(published.at(-1)).toBe("newer-combat-keyboard");
        expect(published.filter((entry) => entry === "reclaimed-menu"))
          .toHaveLength(1);
        expect(session.participants[0]!.exitDeliveryState).toBe("completed");
      } finally {
        vi.useRealTimers();
      }
    }
  );

  it("retries acknowledgement on one live claim without resending the menu", async () => {
    const session = makeSession({
      turn: 3,
      deliveryRevision: 3,
      deliveredRevision: 3
    });
    session.participants[0]!.exitDeliveryState = "pending";
    session.state.participants[0]!.fleeAttempts = 1;
    session.state.participants[0]!.fledAtTurn = 1;
    const sendMessage = vi.fn().mockResolvedValue({ message_id: 587 });
    const service = mutableCardService(session);
    const acknowledge = vi.fn()
      .mockRejectedValueOnce(new Error("database acknowledgement failed"))
      .mockResolvedValueOnce(false)
      .mockImplementation((
        input: Parameters<typeof service.markParticipantFleeExitMenuDelivered>[0]
      ) =>
        service.markParticipantFleeExitMenuDelivered(input)
      );

    await deliverGroupCombatCards({
      sendMessage,
      editMessageText: vi.fn().mockResolvedValue(true),
      deleteMessage: vi.fn()
    } as unknown as Api, {
      ...service,
      markParticipantFleeExitMenuDelivered: acknowledge,
      finalizeDeliveryAttempt: vi.fn().mockResolvedValue(true)
    } as unknown as GroupCombatService, session);

    expect(sendMessage.mock.calls.filter((call) =>
      String(call[1]).includes("Ви відступили з бою")
    )).toHaveLength(1);
    expect(acknowledge).toHaveBeenCalledTimes(3);
    expect(session.participants[0]!.exitDeliveryMessageId).toBe(587);
    expect(session.participants[0]!.exitDeliveryState).toBe("completed");
  });

  it("bounds the ambiguous send-ack crash gap to a stale-claim duplicate", async () => {
    const session = makeSession({
      turn: 3,
      deliveryRevision: 3,
      deliveredRevision: 3
    });
    session.participants[0]!.exitDeliveryState = "pending";
    session.state.participants[0]!.fleeAttempts = 1;
    session.state.participants[0]!.fledAtTurn = 1;
    let exitMessageId = 91;
    const sendMessage = vi.fn().mockImplementation((
      _chatId: number,
      text: string
    ) => Promise.resolve({
      message_id: text.includes("Ви відступили з бою")
        ? ++exitMessageId
        : 700
    }));
    const service = mutableCardService(session);
    let currentTime = new Date("2026-07-28T10:00:00.000Z");
    const acknowledge = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockImplementation((
        input: Parameters<typeof service.markParticipantFleeExitMenuDelivered>[0]
      ) =>
        service.markParticipantFleeExitMenuDelivered(input)
      );
    const deliveryService = {
      ...service,
      currentTime: () => currentTime,
      markParticipantFleeExitMenuDelivered: acknowledge,
      finalizeDeliveryAttempt: vi.fn().mockResolvedValue(true)
    } as unknown as GroupCombatService;
    const api = {
      sendMessage,
      editMessageText: vi.fn().mockResolvedValue(true),
      deleteMessage: vi.fn()
    } as unknown as Api;

    await deliverGroupCombatCards(api, deliveryService, session);
    await deliverGroupCombatCards(api, deliveryService, session);
    expect(sendMessage.mock.calls.filter((call) =>
      String(call[1]).includes("Ви відступили з бою")
    )).toHaveLength(1);
    expect(session.participants[0]!.exitDeliveryState).toBe("claimed");

    session.turn = 8;
    session.state.turn = 8;
    session.deliveryRevision = 8;
    currentTime = new Date(currentTime.getTime() + 23_001);
    await deliverGroupCombatCards(api, deliveryService, session);

    expect(sendMessage.mock.calls.filter((call) =>
      String(call[1]).includes("Ви відступили з бою")
    )).toHaveLength(2);
    expect(session.participants[0]!.exitDeliveryMessageId).toBe(93);
    expect(session.participants[0]!.exitDeliveryState).toBe("completed");
  });

  it("uses current free-player navigation and supersedes a newer combat UI", async () => {
    const moved = makeSession({
      turn: 4,
      deliveryRevision: 4,
      deliveredRevision: 4
    });
    moved.participants[0]!.exitDeliveryState = "pending";
    moved.state.participants[0]!.fleeAttempts = 1;
    moved.state.participants[0]!.fledAtTurn = 1;
    const movedSend = vi.fn().mockResolvedValue({ message_id: 94 });
    const movedService = mutableCardService(moved);

    await deliverGroupCombatCards({
      sendMessage: movedSend,
      editMessageText: vi.fn().mockResolvedValue(true),
      deleteMessage: vi.fn()
    } as unknown as Api, {
      ...movedService,
      claimParticipantFleeExitDelivery: vi.fn().mockImplementation((input: {
        claimToken: string;
        claimedAt: Date;
      }) => {
        moved.participants[0]!.exitDeliveryState = "claimed";
        moved.participants[0]!.exitDeliveryClaimToken = input.claimToken;
        moved.participants[0]!.exitDeliveryClaimedAt = input.claimedAt;
        return Promise.resolve({
        state: "claimed",
        locationId: "korchma.bar",
        questMarkers: { fight: { state: "ready" } }
        });
      }),
      finalizeDeliveryAttempt: vi.fn().mockResolvedValue(true)
    } as unknown as GroupCombatService, moved);

    const movedMenuCall = movedSend.mock.calls.find((call) =>
      String(call[1]).includes("Ви відступили з бою")
    );
    const movedKeyboard = JSON.stringify(movedMenuCall?.[2]);
    expect(movedKeyboard).not.toContain("Лівий прохід");
    expect(movedKeyboard).toContain("Квести");

    const newerCombat = makeSession({
      turn: 4,
      deliveryRevision: 4,
      deliveredRevision: 4
    });
    newerCombat.participants[0]!.exitDeliveryState = "pending";
    newerCombat.state.participants[0]!.fleeAttempts = 1;
    newerCombat.state.participants[0]!.fledAtTurn = 1;
    const newerSend = vi.fn();
    const newerService = mutableCardService(newerCombat);
    await deliverGroupCombatCards({
      sendMessage: newerSend,
      editMessageText: vi.fn(),
      deleteMessage: vi.fn()
    } as unknown as Api, {
      ...newerService,
      claimParticipantFleeExitDelivery: vi.fn().mockImplementation(() => {
        newerCombat.participants[0]!.exitDeliveryState = "superseded";
        newerCombat.participants[0]!.messageId = null;
        return Promise.resolve({ state: "superseded" });
      }),
      finalizeDeliveryAttempt: vi.fn().mockResolvedValue(true)
    } as unknown as GroupCombatService, newerCombat);

    expect(newerSend.mock.calls.some((call) =>
      String(call[1]).includes("Ви відступили з бою")
    )).toBe(false);
    expect(newerCombat.participants[0]!.exitDeliveryState).toBe("superseded");
    expect(newerCombat.participants[0]!.messageId).toBeNull();
  });

  it("does not resend a successful flee menu when retiring the old card retries", async () => {
    const session = makeSession({
      turn: 4,
      deliveryRevision: 4,
      deliveredRevision: 4
    });
    session.participants[0]!.exitDeliveryState = "pending";
    session.participants[1]!.deliveredRevision = 4;
    session.state.participants[0]!.fleeAttempts = 1;
    session.state.participants[0]!.fledAtTurn = 1;
    const sendMessage = vi.fn().mockResolvedValue({ message_id: 93 });
    let escapeEditFailed = false;
    const editMessageText = vi.fn((
      _chatId: number,
      messageId: number
    ) => {
      if (messageId === 21 && !escapeEditFailed) {
        escapeEditFailed = true;
        return Promise.reject(new Error("card edit failed"));
      }
      return Promise.resolve(true);
    });
    const service = mutableCardService(session);
    const api = {
      sendMessage,
      editMessageText,
      deleteMessage: vi.fn()
    } as unknown as Api;
    const deliveryService = {
      ...service,
      finalizeDeliveryAttempt: vi.fn().mockResolvedValue(true)
    } as unknown as GroupCombatService;

    await deliverGroupCombatCards(api, deliveryService, session);
    expect(session.participants[0]!.exitDeliveryState).toBe("menu-delivered");
    await deliverGroupCombatCards(api, deliveryService, session);

    expect(sendMessage.mock.calls.filter((call) =>
      String(call[1]).includes("Ви відступили з бою")
    )).toHaveLength(1);
    expect(session.participants[0]!.exitDeliveryState).toBe("completed");
  });

  it("converges concurrent post-restart flee delivery and still completes after terminalization", async () => {
    const session = makeSession({
      turn: 6,
      deliveryRevision: 6,
      deliveredRevision: 6
    });
    session.status = "won";
    session.state.status = "won";
    session.state.enemies.forEach((enemy) => {
      enemy.hp = 0;
    });
    session.participants[0]!.exitDeliveryState = "pending";
    session.state.participants[0]!.fleeAttempts = 1;
    session.state.participants[0]!.fledAtTurn = 1;
    const sendMessage = vi.fn().mockResolvedValue({ message_id: 93 });
    const editMessageText = vi.fn().mockResolvedValue(true);
    const restartedService = mutableCardService(session);
    const deliveryService = {
      ...restartedService,
      finalizeDeliveryAttempt: vi.fn().mockResolvedValue(true)
    } as unknown as GroupCombatService;
    const api = {
      sendMessage,
      editMessageText,
      deleteMessage: vi.fn()
    } as unknown as Api;

    await Promise.all([
      deliverGroupCombatCards(api, deliveryService, session),
      deliverGroupCombatCards(api, deliveryService, session)
    ]);

    expect(sendMessage.mock.calls.filter((call) =>
      String(call[1]).includes("Ви відступили з бою")
    )).toHaveLength(1);
    expect(session.participants[0]!.exitDeliveryState).toBe("completed");
    expect(session.participants[0]!.messageId).toBeNull();
  });

  it("converges an old-turn delivery to the newer authoritative turn before releasing its participant lock", async () => {
    const turnOne = makeSession({ turn: 1, version: 1 });
    const turnTwo = makeSession({ turn: 2, version: 2 });
    turnOne.state.participants[0]!.classId = "class.warrior";
    turnTwo.state.participants[0]!.classId = "class.warrior";
    turnTwo.state.participants[0]!.cooldowns = {
      abilities: {
        "skill.forceful-strike": {
          id: "skill.forceful-strike",
          remainingTurns: 2
        }
      }
    };
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
    expect(edits[0]).toContain("<b>Бій</b>: 1 хід");
    expect(edits.at(-1)).toContain("<b>Бій</b>: 2 хід");
    expect(edits.slice(edits.findIndex((text) => text.includes("<b>Бій</b>: 2 хід")))).not.toEqual(
      expect.arrayContaining([expect.stringContaining("<b>Бій</b>: 1 хід")])
    );
    expect(sendInertMessage).not.toHaveBeenCalled();
  });

  it("publishes only observer controls when authoritative delivery sees a knocked-out participant", async () => {
    const session = makeSession();
    session.state.participants[0]!.hp = 0;
    const replyKeyboards: string[][] = [];
    const transport: GroupCombatDeliveryTransport = {
      editMessage: () => Promise.resolve(),
      sendInertMessage: (_chatId, _text, options) => {
        const markup = options.reply_markup as {
          keyboard?: Array<Array<{ text: string }>>;
        };
        replyKeyboards.push(
          markup.keyboard?.flat().map((button) => button.text) ?? []
        );
        return Promise.resolve(93);
      },
      deleteMessage: () => Promise.resolve()
    };

    await expect(deliverCanonicalGroupCombatParticipantCard({
      service: mutableCardService(session),
      sessionId: session.id,
      participantCharacterId: "character-1",
      transport,
      forceRefresh: true
    })).resolves.toMatchObject({ state: "activated" });

    expect(replyKeyboards).toEqual([["🔎 Оновити"]]);
  });

  it("releases the durable UI claim when Telegram rejects the canonical active card", async () => {
    const session = makeSession();
    const releaseParticipantUiPublicationClaim = vi.fn<(
      input: {
        sessionId: string;
        telegramUserId: bigint;
        claimToken: string;
      }
    ) => Promise<boolean>>().mockResolvedValue(true);
    const service = {
      ...mutableCardService(session),
      claimParticipantUiPublication: vi.fn().mockResolvedValue({
        state: "claimed",
        publishReplyKeyboard: true,
        keyboardGeneration: 0
      }),
      renewParticipantUiPublicationClaim: vi.fn().mockResolvedValue(true),
      acknowledgeParticipantUiPublication: vi.fn(),
      releaseParticipantUiPublicationClaim
    } as unknown as GroupCombatService;
    const transport: GroupCombatDeliveryTransport = {
      editMessage: () => Promise.resolve(),
      sendInertMessage: () => Promise.reject(new Error("telegram unavailable")),
      deleteMessage: () => Promise.resolve()
    };

    await expect(deliverCanonicalGroupCombatParticipantCard({
      service,
      sessionId: session.id,
      participantCharacterId: "character-1",
      transport,
      forceRefresh: true
    })).rejects.toThrow("telegram unavailable");

    expect(releaseParticipantUiPublicationClaim).toHaveBeenCalledOnce();
    const releasedClaim = releaseParticipantUiPublicationClaim.mock.calls[0]?.[0];
    expect(releasedClaim).toMatchObject({
      sessionId: session.id,
      telegramUserId: 1001n
    });
    expect(typeof releasedClaim?.claimToken).toBe("string");
  });

  it.each(["send", "edit", "delete"] as const)(
    "bounds a delayed Telegram %s operation before its durable claim can expire",
    async (operation) => {
      vi.useFakeTimers();
      try {
        const session = makeSession();
        if (operation === "send") {
          session.participants[0]!.chatId = null;
          session.participants[0]!.messageId = null;
        }
        const service = claimedUiService(session);
        let observedSignal: AbortSignal | undefined;
        const operationStarted = deferred<void>();
        const waitForAbort = (signal?: AbortSignal): Promise<never> => {
          observedSignal = signal;
          operationStarted.resolve();
          return new Promise((_resolve, reject) => {
            signal?.addEventListener(
              "abort",
              () => reject(new Error("telegram publication aborted")),
              { once: true }
            );
          });
        };
        let editCount = 0;
        const transport: GroupCombatDeliveryTransport = {
          editMessage: (_reference, _text, _options, signal) => {
            editCount += 1;
            if (
              operation === "edit" ||
              (operation === "delete" && editCount > 0)
            ) {
              return operation === "edit"
                ? waitForAbort(signal)
                : Promise.resolve();
            }
            return Promise.resolve();
          },
          sendInertMessage: (_chatId, _text, _options, signal) =>
            operation === "send"
              ? waitForAbort(signal)
              : Promise.resolve(93),
          deleteMessage: (_reference, signal) =>
            operation === "delete"
              ? waitForAbort(signal)
              : Promise.resolve()
        };

        const delivery = deliverCanonicalGroupCombatParticipantCard({
          service,
          sessionId: session.id,
          participantCharacterId: "character-1",
          transport,
          forceRefresh: true,
          ...(operation === "edit"
            ? { publishReplyKeyboard: false }
            : operation === "delete"
              ? { forceReplacement: true }
              : {})
        });
        const outcome = delivery.then(
          (result) => ({ result }),
          (error: unknown) => ({ error })
        );
        await operationStarted.promise;
        await vi.advanceTimersByTimeAsync(13_000);

        if (operation === "delete") {
          await expect(outcome).resolves.toMatchObject({
            result: { state: "activated" }
          });
        } else if (operation === "edit") {
          await expect(outcome).resolves.toMatchObject({
            result: { state: "retryable-edit-failure" }
          });
        } else {
          const settled = await outcome;
          expect("error" in settled).toBe(true);
          if (!("error" in settled) || !(settled.error instanceof Error)) {
            throw new Error("Expected the delayed Telegram send to abort.");
          }
          expect(settled.error.message).toBe("telegram publication aborted");
        }
        expect(observedSignal?.aborted).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    }
  );

  it("stops a replacement before the next Telegram call after durable ownership is lost", async () => {
    const session = makeSession();
    let renewals = 0;
    const service = claimedUiService(session, {
      renew: () => Promise.resolve((renewals += 1) === 1)
    });
    const editMessage = vi.fn().mockResolvedValue(undefined);
    const transport: GroupCombatDeliveryTransport = {
      editMessage,
      sendInertMessage: vi.fn().mockResolvedValue(93),
      deleteMessage: vi.fn().mockResolvedValue(undefined)
    };

    await expect(deliverCanonicalGroupCombatParticipantCard({
      service,
      sessionId: session.id,
      participantCharacterId: "character-1",
      transport,
      forceReplacement: true
    })).resolves.toMatchObject({ state: "retryable-edit-failure" });

    expect(editMessage).not.toHaveBeenCalled();
  });

  it("keeps an ambiguous publication claim for restart retry when acknowledgement fails", async () => {
    const session = makeSession();
    const release = vi.fn().mockResolvedValue(true);
    const service = claimedUiService(session, {
      acknowledge: () => Promise.reject(new Error("database unavailable")),
      release
    });
    const transport: GroupCombatDeliveryTransport = {
      editMessage: vi.fn().mockResolvedValue(undefined),
      sendInertMessage: vi.fn().mockResolvedValue(93),
      deleteMessage: vi.fn().mockResolvedValue(undefined)
    };

    await expect(deliverCanonicalGroupCombatParticipantCard({
      service,
      sessionId: session.id,
      participantCharacterId: "character-1",
      transport,
      forceReplacement: true
    })).rejects.toThrow("database unavailable");

    expect(release).not.toHaveBeenCalled();
  });

  it("redraws an adopted canonical card instead of sending a new card on every scheduler retry", async () => {
    const session = makeSession({ deliveredRevision: 0 });
    session.participants[1]!.deliveredRevision = session.deliveryRevision;
    for (const participant of session.participants) {
      participant.replyKeyboardFingerprint = JSON.stringify(
        buildGroupCombatReplyKeyboard(session, participant.characterId).keyboard
      );
      participant.replyKeyboardGeneration = 1;
    }
    const sendMessage = vi.fn().mockResolvedValue({ message_id: 93 });
    const editMessageText = vi.fn().mockResolvedValue(true);

    await expect(deliverGroupCombatCards({
      sendMessage,
      editMessageText,
      deleteMessage: vi.fn().mockResolvedValue(true)
    } as unknown as Api, {
      ...mutableCardService(session),
      finalizeDeliveryAttempt: vi.fn().mockResolvedValue(true)
    } as unknown as GroupCombatService, session)).resolves.toBe(2);

    expect(sendMessage).not.toHaveBeenCalled();
    expect(editMessageText).toHaveBeenCalledTimes(1);
    expect(session.participants[0]).toMatchObject({
      messageId: 21,
      referenceVersion: 1,
      deliveredRevision: session.deliveryRevision,
      replyKeyboardGeneration: 1
    });
  });

  it("publishes each participant's current controls after a resolved turn changes availability", async () => {
    const session = makeSession({
      turn: 2,
      deliveryRevision: 2,
      deliveredRevision: 1
    });
    session.participants[1]!.deliveredRevision = 1;
    session.state.participants.forEach((participant) => {
      participant.classId = "class.warrior";
    });
    session.state.participants[1]!.cooldowns = {
      abilities: {
        "skill.forceful-strike": {
          id: "skill.forceful-strike",
          remainingTurns: 2
        }
      }
    };
    const replyKeyboards = new Map<number, string[]>();
    const sendMessage = vi.fn((
      chatId: number,
      _text: string,
      options?: {
        reply_markup?: {
          keyboard?: Array<Array<{ text: string }>>;
        };
      }
    ) => {
      if (options?.reply_markup?.keyboard) {
        replyKeyboards.set(
          chatId,
          options.reply_markup.keyboard.flat().map((button) => button.text)
        );
      }
      return Promise.resolve({ message_id: 93 });
    });

    await expect(deliverGroupCombatCards({
      sendMessage,
      editMessageText: vi.fn().mockResolvedValue(true),
      deleteMessage: vi.fn().mockResolvedValue(true)
    } as unknown as Api, {
      ...mutableCardService(session),
      finalizeDeliveryAttempt: vi.fn().mockResolvedValue(true)
    } as unknown as GroupCombatService, session)).resolves.toBe(2);

    expect(replyKeyboards.get(1001)).toContain("🪓 Силовий замах");
    expect(replyKeyboards.get(1002)).not.toContain("🪓 Силовий замах");
  });

  it("edits unchanged generations and sends exactly one actor card plus one changed ally keyboard-card", async () => {
    const session = makeSession({
      turn: 2,
      deliveryRevision: 2,
      deliveredRevision: 1
    });
    session.participants[1]!.deliveredRevision = 1;
    session.state.participants.forEach((participant) => {
      participant.classId = "class.warrior";
    });
    for (const participant of session.participants) {
      participant.replyKeyboardFingerprint = JSON.stringify(
        buildGroupCombatReplyKeyboard(
          session,
          participant.characterId
        ).keyboard
      );
      participant.replyKeyboardGeneration = 1;
    }
    session.state.participants[1]!.cooldowns = {
      abilities: {
        "skill.forceful-strike": {
          id: "skill.forceful-strike",
          remainingTurns: 2
        }
      }
    };
    const sends: Array<{ chatId: number; hasReplyKeyboard: boolean }> = [];
    let nextMessageId = 93;
    const sendMessage = vi.fn((
      chatId: number,
      _text: string,
      options?: { reply_markup?: { keyboard?: unknown } }
    ) => {
      sends.push({
        chatId,
        hasReplyKeyboard: Boolean(options?.reply_markup?.keyboard)
      });
      return Promise.resolve({ message_id: nextMessageId++ });
    });
    const editMessageText = vi.fn().mockResolvedValue(true);

    await expect(deliverGroupCombatCards({
      sendMessage,
      editMessageText,
      deleteMessage: vi.fn().mockResolvedValue(true)
    } as unknown as Api, {
      ...mutableCardService(session),
      finalizeDeliveryAttempt: vi.fn().mockResolvedValue(true)
    } as unknown as GroupCombatService, session, {
      forceReplacementCharacterId: "character-1"
    })).resolves.toBe(2);

    expect(sends).toEqual([
      { chatId: 1001, hasReplyKeyboard: false },
      { chatId: 1002, hasReplyKeyboard: true }
    ]);
    expect(editMessageText.mock.calls.filter((call) => call[0] === 1001))
      .toHaveLength(2);
    expect(editMessageText.mock.calls.filter((call) => call[0] === 1002))
      .toHaveLength(2);
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
    expect(sentOptions).toHaveLength(1);
    expect(hasReplyKeyboard(readReplyMarkup(sentOptions[0]))).toBe(true);
    expect(deleteMessage).toHaveBeenCalledWith({ chatId: 1001n, messageId: 31 });
    expect(edits).toEqual([77]);
    expect(edits).not.toContain(31);
  });

  it("promotes a replacement card to the latest message and retires the previous canonical reference", async () => {
    const session = makeSession();
    const oldReference = { chatId: 1001n, messageId: 21 };
    const edits: Array<{ messageId: number; buttons: string[] }> = [];
    const deleteMessage = vi.fn().mockResolvedValue(undefined);
    const sentOptions: Array<
      Parameters<GroupCombatDeliveryTransport["sendInertMessage"]>[2]
    > = [];
    const sendInertMessage = vi.fn((
      _chatId: bigint,
      _text: string,
      options: Parameters<GroupCombatDeliveryTransport["sendInertMessage"]>[2]
    ) => {
      sentOptions.push(options);
      return Promise.resolve(93);
    });
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
    expect(sendInertMessage).toHaveBeenCalledOnce();
    expect(hasReplyKeyboard(readReplyMarkup(sentOptions[0]))).toBe(true);
    expect(edits).toHaveLength(2);
    expect(edits[0]).toEqual({ messageId: 21, buttons: [] });
    expect(edits[1]?.messageId).toBe(93);
    expect(edits[1]?.buttons).toEqual([]);
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
    expect(actionable).toEqual(new Set());
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
        if (reference.messageId === 93) {
          candidateAttempts += 1;
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
    expect(actionable).toEqual(new Set());
    expect(session.participants[0]).toMatchObject({ chatId: 1001n, messageId: 93, deliveredRevision: 0 });
    expect(deleteMessage).not.toHaveBeenCalled();

    const retried = await deliverCanonicalGroupCombatParticipantCard({
      service,
      sessionId: session.id,
      participantCharacterId: "character-1",
      transport
    });

    expect(actionable).toEqual(new Set());
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
        if (reference.messageId === 93) {
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
    expect(actionable).toEqual(new Set());
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
        if (reference.messageId === 93) {
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
      { messageId: 93, hasButtons: false },
      { messageId: 21, hasButtons: false }
    ]);
    expect(actionable).toEqual(new Set());
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
    expect(keyboards[0]).toEqual([]);
    expect(keyboards.at(-1)).toEqual([]);
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

    expect(texts.at(-1)).toContain("⏳ На хід є 6 с. Потім Корчма поставить вас у захист.");
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
    exitDeliveryState?: GroupCombatSessionRecord["participants"][number]["exitDeliveryState"];
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
    deliveredRevision: overrides.deliveredRevision ?? 0,
    replyKeyboardFingerprint: null,
    replyKeyboardGeneration: 0,
    exitDeliveryState: overrides.exitDeliveryState ?? "none",
    exitDeliveryClaimToken: null,
    exitDeliveryClaimedAt: null,
    exitDeliveryMessageId: null
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
      telegramUserId?: bigint;
      expectedReferenceVersion: number;
      chatId: bigint;
      messageId: number;
      publishedKeyboardFingerprint?: string | null;
    }) => {
      const participant = session.participants.find(
        (candidate) => candidate.telegramUserId === input.telegramUserId
      ) ?? session.participants[0]!;
      if (participant.referenceVersion !== input.expectedReferenceVersion) {
        return Promise.resolve({ state: "busy" });
      }
      participant.chatId = input.chatId;
      participant.messageId = input.messageId;
      participant.referenceVersion += 1;
      participant.deliveredRevision = 0;
      if (input.publishedKeyboardFingerprint) {
        participant.replyKeyboardFingerprint = input.publishedKeyboardFingerprint;
        participant.replyKeyboardGeneration += 1;
      }
      return Promise.resolve(true);
    }),
    markParticipantCardDelivered: vi.fn().mockImplementation((input: {
      telegramUserId?: bigint;
    }) => {
      const participant = session.participants.find(
        (candidate) => candidate.telegramUserId === input.telegramUserId
      ) ?? session.participants[0]!;
      participant.deliveredRevision = session.deliveryRevision;
      return Promise.resolve(true);
    }),
    claimParticipantFleeExitDelivery: vi.fn().mockImplementation((input: {
      telegramUserId: bigint;
      claimToken: string;
      claimedAt: Date;
      staleBefore: Date;
    }) => {
      const participant = session.participants.find(
        (candidate) => candidate.telegramUserId === input.telegramUserId
      );
      if (
        !participant ||
        (
          participant.exitDeliveryState !== "pending" &&
          (
            participant.exitDeliveryState !== "claimed" ||
            !participant.exitDeliveryClaimedAt ||
            participant.exitDeliveryClaimedAt > input.staleBefore
          )
        )
      ) {
        return Promise.resolve(false);
      }
      participant.exitDeliveryState = "claimed";
      participant.exitDeliveryClaimToken = input.claimToken;
      participant.exitDeliveryClaimedAt = input.claimedAt;
      return Promise.resolve({
        state: "claimed",
      locationId: "korchma.hall",
      questMarkers: null
      });
    }),
    releaseParticipantFleeExitDeliveryClaim: vi.fn().mockImplementation((input: {
      telegramUserId: bigint;
      claimToken: string;
    }) => {
      const participant = session.participants.find(
        (candidate) =>
          candidate.telegramUserId === input.telegramUserId &&
          candidate.exitDeliveryClaimToken === input.claimToken
      );
      if (!participant) {
        return Promise.resolve(false);
      }
      participant.exitDeliveryState = "pending";
      participant.exitDeliveryClaimToken = null;
      participant.exitDeliveryClaimedAt = null;
      return Promise.resolve(true);
    }),
    renewParticipantFleeExitDeliveryClaim: vi.fn().mockImplementation((input: {
      telegramUserId: bigint;
      claimToken: string;
      claimedAt: Date;
    }) => {
      const participant = session.participants.find(
        (candidate) =>
          candidate.telegramUserId === input.telegramUserId &&
          candidate.exitDeliveryState === "claimed" &&
          candidate.exitDeliveryClaimToken === input.claimToken
      );
      if (!participant) {
        return Promise.resolve(false);
      }
      participant.exitDeliveryClaimedAt = input.claimedAt;
      return Promise.resolve(true);
    }),
    markParticipantFleeExitMenuDelivered: vi.fn().mockImplementation((input: {
      telegramUserId: bigint;
      claimToken: string;
      messageId: number;
    }) => {
      const participant = session.participants.find(
        (candidate) =>
          candidate.telegramUserId === input.telegramUserId &&
          candidate.exitDeliveryClaimToken === input.claimToken
      );
      if (!participant) {
        return Promise.resolve(false);
      }
      participant.exitDeliveryState = "menu-delivered";
      participant.exitDeliveryClaimToken = null;
      participant.exitDeliveryClaimedAt = null;
      participant.exitDeliveryMessageId = input.messageId;
      return Promise.resolve(true);
    }),
    completeParticipantFleeExitDelivery: vi.fn().mockImplementation((input: {
      telegramUserId: bigint;
      expectedReferenceVersion: number;
      terminalCard?: {
        chatId: bigint;
        messageId: number;
        deliveryRevision: number;
      };
    }) => {
      const participant = session.participants.find(
        (candidate) =>
          candidate.telegramUserId === input.telegramUserId &&
          candidate.referenceVersion === input.expectedReferenceVersion &&
          candidate.exitDeliveryState === "menu-delivered"
      );
      if (!participant) {
        return Promise.resolve(false);
      }
      participant.exitDeliveryState = "completed";
      participant.chatId = input.terminalCard?.chatId ?? null;
      participant.messageId = input.terminalCard?.messageId ?? null;
      if (input.terminalCard) {
        participant.deliveredRevision = input.terminalCard.deliveryRevision;
      }
      participant.referenceVersion += 1;
      return Promise.resolve(true);
    })
  } as unknown as GroupCombatService;
}

function claimedUiService(
  session: GroupCombatSessionRecord,
  overrides: {
    renew?: () => Promise<boolean>;
    acknowledge?: () => Promise<"acknowledged" | "stale" | "not-owner">;
    release?: ReturnType<typeof vi.fn>;
  } = {}
): GroupCombatService {
  return {
    ...mutableCardService(session),
    claimParticipantUiPublication: vi.fn().mockResolvedValue({
      state: "claimed",
      publishReplyKeyboard: true,
      keyboardGeneration: 0
    }),
    renewParticipantUiPublicationClaim:
      overrides.renew ?? vi.fn().mockResolvedValue(true),
    acknowledgeParticipantUiPublication:
      overrides.acknowledge ?? vi.fn().mockResolvedValue("acknowledged"),
    releaseParticipantUiPublicationClaim:
      overrides.release ?? vi.fn().mockResolvedValue(true)
  } as unknown as GroupCombatService;
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

function hasReplyKeyboard(value: unknown): boolean {
  return Boolean(
    value &&
    typeof value === "object" &&
    "keyboard" in value &&
    Array.isArray(value.keyboard)
  );
}

function inlineButtonLabels(value: unknown): string[] {
  if (
    !value ||
    typeof value !== "object" ||
    !("inline_keyboard" in value) ||
    !Array.isArray(value.inline_keyboard)
  ) {
    return [];
  }
  const labels: string[] = [];
  const rows: unknown[] = value.inline_keyboard;
  for (const row of rows) {
    if (!Array.isArray(row)) {
      continue;
    }
    const buttons: unknown[] = row;
    for (const button of buttons) {
      if (
        button &&
        typeof button === "object" &&
        "text" in button &&
        typeof button.text === "string"
      ) {
        labels.push(button.text);
      }
    }
  }
  return labels;
}

function readReplyMarkup(value: unknown): unknown {
  return value && typeof value === "object" && "reply_markup" in value
    ? value.reply_markup
    : undefined;
}
