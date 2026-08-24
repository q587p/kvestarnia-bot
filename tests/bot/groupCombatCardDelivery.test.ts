import type { Api } from "grammy";
import { describe, expect, it, vi } from "vitest";
import {
  deliverCanonicalGroupCombatParticipantCard,
  deliverGroupCombatCards,
  deliverGroupCombatParticipantCard,
  deliverGroupCombatSettlementNotifications,
  type GroupCombatDeliveryTransport
} from "../../src/bot/groupCombatCardDelivery";
import type { GroupCombatSessionRecord } from "../../src/db/repositories/groupCombatRepository";
import type { GroupCombatService } from "../../src/services/groupCombatService";
import { buildGroupCombatKeyboard } from "../../src/bot/keyboards/groupCombatKeyboard";

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

  it.each([
    { label: "acknowledges", fails: false },
    { label: "releases", fails: true }
  ])("$label a durable weekly achievement claim only after Telegram delivery", async ({ fails }) => {
    const sendMessage = fails
      ? vi.fn().mockRejectedValue(new Error("Telegram unavailable"))
      : vi.fn().mockResolvedValue({ message_id: 93 });
    const markWeeklyAchievementNoticeSent = vi.fn().mockResolvedValue(true);
    const releaseWeeklyAchievementNotice = vi.fn().mockResolvedValue(true);
    const claim = { entitlementId: "weekly-entitlement-1", claimToken: "claim-1" };

    await expect(deliverGroupCombatSettlementNotifications(
      { sendMessage } as unknown as Api,
      [{
        telegramUserId: 1001n,
        characterId: "character-1",
        characterName: "Лідерка",
        classId: "class.priest",
        raceId: "race.human-ish",
        levelChange: null,
        achievementUnlocks: [{
          id: "achievement.guild.weekly-goal-completed",
          title: "Тринадцять печаток, жодної зайвої",
          cosmeticTitleGrantId: null,
          unlockedAt: new Date("2026-08-24T18:00:00.000Z")
        }],
        weeklyAchievementClaims: [claim]
      }],
      {
        markWeeklyAchievementNoticeSent,
        releaseWeeklyAchievementNotice
      } as unknown as GroupCombatService
    )).resolves.toBe(fails ? 0 : 1);

    expect(markWeeklyAchievementNoticeSent).toHaveBeenCalledTimes(fails ? 0 : 1);
    expect(releaseWeeklyAchievementNotice).toHaveBeenCalledTimes(fails ? 1 : 0);
    expect((fails ? releaseWeeklyAchievementNotice : markWeeklyAchievementNoticeSent))
      .toHaveBeenCalledWith(claim);
  });

  it("orders each production intro before that participant's keyboard-bearing canonical card", async () => {
    const session = makeSession();
    session.state.rulesVersion = "group-combat.v3";
    session.state.encounterKey = "nyz-left-passage-party.v1";
    let nextMessageId = 90;
    const sends: Array<{
      chatId: number;
      text: string;
      hasReplyKeyboard: boolean;
      inlineLabels: string[];
    }> = [];
    const api = {
      sendMessage: vi.fn((chatId: number, text: string, options?: {
        reply_markup?: { keyboard?: unknown; inline_keyboard?: unknown };
      }) => {
        sends.push({
          chatId,
          text,
          hasReplyKeyboard: Boolean(options?.reply_markup?.keyboard),
          inlineLabels: inlineButtonLabels(options?.reply_markup)
        });
        return Promise.resolve({ message_id: nextMessageId++ });
      }),
      editMessageText: vi.fn().mockResolvedValue(true),
      deleteMessage: vi.fn().mockResolvedValue(true)
    } as unknown as Api;
    const service = {
      ...mutableCardService(session),
      finalizeDeliveryAttempt: vi.fn().mockResolvedValue(true)
    } as unknown as GroupCombatService;

    await expect(deliverGroupCombatCards(api, service, session)).resolves.toBe(2);

    for (const chatId of [1001, 1002]) {
      const participantSends = sends.filter((entry) => entry.chatId === chatId);
      expect(participantSends).toHaveLength(2);
      expect(participantSends[0]?.text).toContain(
        "Бій починається. Корчма відкриває журнал ходів"
      );
      expect(participantSends[0]?.text).toContain("<i>Порада дня:");
      expect(participantSends[0]?.hasReplyKeyboard).toBe(true);
      expect(participantSends[0]?.inlineLabels).toEqual([]);
      expect(participantSends[1]?.text).toContain("<b>Бій</b>: 1 хід");
      expect(participantSends[1]?.hasReplyKeyboard).toBe(false);
      expect(participantSends[1]?.inlineLabels).toContain("🔎 Оновити");
      expect(participantSends[1]?.inlineLabels.length).toBeGreaterThan(1);
    }
  });

  it("delivers the last-ready actor first and never fans participant claims out in parallel", async () => {
    const session = makeSession();
    session.state.rulesVersion = "group-combat.v3";
    session.state.encounterKey = "nyz-left-passage-party.v1";
    session.participants.push(participantRecord("character-3", 1003n, "Остання готова", 2));
    session.state.participants.push(actor("character-3", "1003", "Остання готова", 2));
    session.state.contributions.push({
      characterId: "character-3",
      damage: 0,
      healing: 0,
      guardedTurns: 0
    });
    const firstClaimEntered = deferred<void>();
    const releaseFirstClaim = deferred<void>();
    const claimOrder: bigint[] = [];
    const claimParticipantUiPublication = vi.fn(async (input: { telegramUserId: bigint }) => {
      claimOrder.push(input.telegramUserId);
      if (claimOrder.length === 1) {
        firstClaimEntered.resolve(undefined);
        await releaseFirstClaim.promise;
      }
      return {
        state: "claimed" as const,
        publishReplyKeyboard: true,
        keyboardGeneration: 0
      };
    });
    const canonicalEdits: number[] = [];
    const api = {
      sendMessage: vi.fn().mockResolvedValue({ message_id: 93 }),
      editMessageText: vi.fn((chatId: number, _messageId: number, text: string) => {
        if (text.includes("<b>Бій</b>: 1 хід")) {
          canonicalEdits.push(chatId);
        }
        return Promise.resolve(true);
      }),
      deleteMessage: vi.fn().mockResolvedValue(true)
    } as unknown as Api;
    const service = {
      ...claimedUiService(session),
      claimParticipantUiPublication,
      finalizeDeliveryAttempt: vi.fn().mockResolvedValue(true)
    } as unknown as GroupCombatService;

    const delivery = deliverGroupCombatCards(api, service, session, {
      priorityCharacterId: "character-3"
    });
    await firstClaimEntered.promise;
    await Promise.resolve();

    expect(claimOrder).toEqual([1003n]);
    releaseFirstClaim.resolve(undefined);
    await expect(delivery).resolves.toBe(3);
    expect(claimOrder).toEqual([1003n, 1001n, 1002n]);
    expect(canonicalEdits).toEqual([1003, 1001, 1002]);
  });

  it("returns after the actor card while the serial ally tail keeps draining", async () => {
    const session = makeSession();
    session.state.rulesVersion = "group-combat.v3";
    session.state.encounterKey = "nyz-left-passage-party.v1";
    session.participants.push(participantRecord("character-3", 1003n, "Остання готова", 2));
    session.state.participants.push(actor("character-3", "1003", "Остання готова", 2));
    session.state.contributions.push({
      characterId: "character-3",
      damage: 0,
      healing: 0,
      guardedTurns: 0
    });
    const firstAllyClaimEntered = deferred<void>();
    const releaseFirstAllyClaim = deferred<void>();
    const finalized = deferred<void>();
    const claimOrder: bigint[] = [];
    const claimParticipantUiPublication = vi.fn(async (input: { telegramUserId: bigint }) => {
      claimOrder.push(input.telegramUserId);
      if (input.telegramUserId === 1001n) {
        firstAllyClaimEntered.resolve(undefined);
        await releaseFirstAllyClaim.promise;
      }
      return {
        state: "claimed" as const,
        publishReplyKeyboard: true,
        keyboardGeneration: 0
      };
    });
    const finalizeDeliveryAttempt = vi.fn().mockImplementation(() => {
      finalized.resolve(undefined);
      return Promise.resolve(true);
    });
    const service = {
      ...claimedUiService(session),
      claimParticipantUiPublication,
      finalizeDeliveryAttempt
    } as unknown as GroupCombatService;

    const actorDelivery = deliverGroupCombatCards({
      sendMessage: vi.fn().mockResolvedValue({ message_id: 93 }),
      editMessageText: vi.fn().mockResolvedValue(true),
      deleteMessage: vi.fn().mockResolvedValue(true)
    } as unknown as Api, service, session, {
      priorityCharacterId: "character-3",
      deferRemaining: true
    });
    await firstAllyClaimEntered.promise;

    await expect(actorDelivery).resolves.toBe(1);
    expect(claimOrder).toEqual([1003n, 1001n]);
    expect(finalizeDeliveryAttempt).not.toHaveBeenCalled();

    releaseFirstAllyClaim.resolve(undefined);
    await finalized.promise;
    expect(claimOrder).toEqual([1003n, 1001n, 1002n]);
    expect(finalizeDeliveryAttempt).toHaveBeenCalledWith(
      session.id,
      session.deliveryRevision
    );
  });

  it("serializes queued turns and finalizes only each operation's owned revision", async () => {
    const session = makeSession({ deliveryRevision: 1 });
    session.id = "group-session-revision-queue";
    session.state.sessionId = session.id;
    session.participants.push(participantRecord("character-3", 1003n, "Третя", 2));
    session.state.participants.push(actor("character-3", "1003", "Третя", 2));
    session.state.contributions.push({
      characterId: "character-3",
      damage: 0,
      healing: 0,
      guardedTurns: 0
    });
    const firstTailEntered = deferred<void>();
    const releaseFirstTail = deferred<void>();
    const secondTailEntered = deferred<void>();
    const releaseSecondTail = deferred<void>();
    const secondRevisionFinalized = deferred<void>();
    let activeEdits = 0;
    let maximumActiveEdits = 0;
    let firstTailBlocked = false;
    let secondTailBlocked = false;
    const editMessageText = vi.fn(async (chatId: number, _messageId: number, text: string) => {
      activeEdits += 1;
      maximumActiveEdits = Math.max(maximumActiveEdits, activeEdits);
      try {
        if (chatId === 1001 && text.includes("<b>Бій</b>: 1 хід") && !firstTailBlocked) {
          firstTailBlocked = true;
          firstTailEntered.resolve(undefined);
          await releaseFirstTail.promise;
          throw new Error("simulated revision-one participant timeout");
        }
        if (chatId === 1001 && text.includes("<b>Бій</b>: 2 хід") && !secondTailBlocked) {
          secondTailBlocked = true;
          secondTailEntered.resolve(undefined);
          await releaseSecondTail.promise;
        }
        return true;
      } finally {
        activeEdits -= 1;
      }
    });
    const finalizedRevisions: number[] = [];
    const service = {
      findById: vi.fn().mockImplementation(() => Promise.resolve(session)),
      markParticipantCardDelivered: vi.fn().mockImplementation((input: {
        telegramUserId: bigint;
        expectedDeliveryRevision: number;
      }) => {
        if (input.expectedDeliveryRevision !== session.deliveryRevision) {
          return Promise.resolve(false);
        }
        const participant = session.participants.find(
          (candidate) => candidate.telegramUserId === input.telegramUserId
        );
        if (!participant) {
          return Promise.resolve(false);
        }
        participant.deliveredRevision = input.expectedDeliveryRevision;
        return Promise.resolve(true);
      }),
      finalizeDeliveryAttempt: vi.fn().mockImplementation((
        _sessionId: string,
        expectedDeliveryRevision: number
      ) => {
        finalizedRevisions.push(expectedDeliveryRevision);
        if (expectedDeliveryRevision !== session.deliveryRevision) {
          return Promise.resolve(false);
        }
        if (session.participants.every(
          (participant) => participant.deliveredRevision >= expectedDeliveryRevision
        )) {
          session.deliveryPending = false;
        }
        if (expectedDeliveryRevision === 2) {
          secondRevisionFinalized.resolve(undefined);
        }
        return Promise.resolve(true);
      })
    } as unknown as GroupCombatService;
    const api = {
      editMessageText,
      sendMessage: vi.fn().mockResolvedValue({ message_id: 93 }),
      deleteMessage: vi.fn().mockResolvedValue(true)
    } as unknown as Api;

    const revisionOneActor = deliverGroupCombatCards(api, service, session, {
      priorityCharacterId: "character-3",
      deferRemaining: true
    });
    await firstTailEntered.promise;
    await expect(revisionOneActor).resolves.toBe(1);

    session.deliveryRevision = 2;
    session.deliveryPending = true;
    session.turn = 2;
    session.state.turn = 2;
    const revisionTwoActor = deliverGroupCombatCards(api, service, session, {
      priorityCharacterId: "character-2",
      deferRemaining: true
    });
    await Promise.resolve();
    expect(secondTailBlocked).toBe(false);

    releaseFirstTail.resolve(undefined);
    await secondTailEntered.promise;
    await expect(revisionTwoActor).resolves.toBe(1);
    expect(finalizedRevisions).toEqual([1]);
    expect(session.deliveryPending).toBe(true);
    expect(maximumActiveEdits).toBe(1);

    releaseSecondTail.resolve(undefined);
    await secondRevisionFinalized.promise;
    expect(finalizedRevisions).toEqual([1, 2]);
    expect(session.deliveryPending).toBe(false);
  });

  it("does not globally serialize delivery tails for different sessions", async () => {
    const first = makeSession();
    first.id = "group-session-independent-a";
    first.state.sessionId = first.id;
    const second = makeSession();
    second.id = "group-session-independent-b";
    second.state.sessionId = second.id;
    second.participants = second.participants.map((participant, index) => ({
      ...participant,
      characterId: `independent-character-${index + 1}`,
      telegramUserId: 2001n + BigInt(index),
      chatId: 2001n + BigInt(index)
    }));
    second.state.participants = second.state.participants.map((participant, index) => ({
      ...participant,
      characterId: `independent-character-${index + 1}`,
      telegramUserId: String(2001 + index)
    }));
    second.state.contributions = second.state.contributions.map((contribution, index) => ({
      ...contribution,
      characterId: `independent-character-${index + 1}`
    }));
    const firstTailEntered = deferred<void>();
    const releaseFirstTail = deferred<void>();
    const firstFinalized = deferred<void>();
    const firstApi = {
      editMessageText: vi.fn(async (chatId: number) => {
        if (chatId === 1002) {
          firstTailEntered.resolve(undefined);
          await releaseFirstTail.promise;
        }
        return true;
      }),
      sendMessage: vi.fn().mockResolvedValue({ message_id: 93 }),
      deleteMessage: vi.fn().mockResolvedValue(true)
    } as unknown as Api;
    const finalizeFirstDelivery = vi.fn().mockImplementation(() => {
      firstFinalized.resolve(undefined);
      return Promise.resolve(true);
    });
    const firstService = {
      ...mutableCardService(first),
      finalizeDeliveryAttempt: finalizeFirstDelivery
    } as unknown as GroupCombatService;
    const secondService = {
      ...mutableCardService(second),
      finalizeDeliveryAttempt: vi.fn().mockResolvedValue(true)
    } as unknown as GroupCombatService;

    await expect(deliverGroupCombatCards(firstApi, firstService, first, {
      priorityCharacterId: "character-1",
      deferRemaining: true
    })).resolves.toBe(1);
    await firstTailEntered.promise;

    await expect(deliverGroupCombatCards({
      editMessageText: vi.fn().mockResolvedValue(true),
      sendMessage: vi.fn().mockResolvedValue({ message_id: 94 }),
      deleteMessage: vi.fn().mockResolvedValue(true)
    } as unknown as Api, secondService, second)).resolves.toBe(2);
    expect(finalizeFirstDelivery).not.toHaveBeenCalled();

    releaseFirstTail.resolve(undefined);
    await firstFinalized.promise;
  });

  it("continues serial delivery after one participant hits a database timeout", async () => {
    const session = makeSession();
    session.state.rulesVersion = "group-combat.v3";
    session.state.encounterKey = "nyz-left-passage-party.v1";
    const claimOrder: bigint[] = [];
    const claimParticipantUiPublication = vi.fn((input: { telegramUserId: bigint }) => {
      claimOrder.push(input.telegramUserId);
      if (input.telegramUserId === 1001n) {
        throw new Error("P1008: database failed to respond within the configured timeout");
      }
      return Promise.resolve({
        state: "claimed" as const,
        publishReplyKeyboard: true,
        keyboardGeneration: 0
      });
    });
    const finalizeDeliveryAttempt = vi.fn().mockResolvedValue(true);
    const service = {
      ...claimedUiService(session),
      claimParticipantUiPublication,
      finalizeDeliveryAttempt
    } as unknown as GroupCombatService;

    await expect(deliverGroupCombatCards({
      sendMessage: vi.fn().mockResolvedValue({ message_id: 93 }),
      editMessageText: vi.fn().mockResolvedValue(true),
      deleteMessage: vi.fn().mockResolvedValue(true)
    } as unknown as Api, service, session)).resolves.toBe(1);

    expect(claimOrder).toEqual([1001n, 1002n]);
    expect(finalizeDeliveryAttempt).toHaveBeenCalledWith(
      session.id,
      session.deliveryRevision
    );
  });

  it("keeps an active battle keyboard on the intro when the first canonical-card send fails", async () => {
    const session = makeSession();
    session.state.rulesVersion = "group-combat.v3";
    session.state.encounterKey = "nyz-left-passage-party.v1";
    session.participants = session.participants.slice(0, 1);
    session.state.participants = session.state.participants.slice(0, 1);
    session.state.contributions = session.state.contributions.slice(0, 1);
    const sendMessage = vi.fn()
      .mockResolvedValueOnce({ message_id: 90 })
      .mockRejectedValueOnce(new Error("card rejected"));
    const api = {
      sendMessage,
      editMessageText: vi.fn().mockResolvedValue(true),
      deleteMessage: vi.fn().mockResolvedValue(true)
    } as unknown as Api;
    const service = {
      ...mutableCardService(session),
      finalizeDeliveryAttempt: vi.fn().mockResolvedValue(true)
    } as unknown as GroupCombatService;

    await expect(deliverGroupCombatCards(api, service, session)).resolves.toBe(0);

    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(String(sendMessage.mock.calls[0]?.[1])).toContain("Бій починається.");
    expect((sendMessage.mock.calls[0]?.[2] as {
      reply_markup?: { keyboard?: unknown };
    })?.reply_markup?.keyboard).toBeDefined();
  });

  it("does not let a retried starter publish an intro after an acknowledged canonical keyboard", async () => {
    const session = makeSession();
    session.state.rulesVersion = "group-combat.v3";
    session.state.encounterKey = "nyz-left-passage-party.v1";
    let nextMessageId = 90;
    const sends: Array<{
      chatId: number;
      text: string;
      hasReplyKeyboard: boolean;
      inlineLabels: string[];
    }> = [];
    const sendMessage = vi.fn((chatId: number, text: string, options?: {
      reply_markup?: { keyboard?: unknown; inline_keyboard?: unknown };
    }) => {
      sends.push({
        chatId,
        text,
        hasReplyKeyboard: Boolean(options?.reply_markup?.keyboard),
        inlineLabels: inlineButtonLabels(options?.reply_markup)
      });
      return Promise.resolve({ message_id: nextMessageId++ });
    });
    const service = {
      ...mutableCardService(session),
      finalizeDeliveryAttempt: vi.fn().mockResolvedValue(true)
    } as unknown as GroupCombatService;
    const api = {
      sendMessage,
      editMessageText: vi.fn().mockResolvedValue(true),
      deleteMessage: vi.fn().mockResolvedValue(true)
    } as unknown as Api;

    await deliverGroupCombatCards(api, service, session);
    await deliverGroupCombatCards(api, service, session);

    expect(sends.filter((entry) => entry.text.includes("Бій починається.")))
      .toHaveLength(2);
    for (const chatId of [1001, 1002]) {
      const participantSends = sends.filter((entry) => entry.chatId === chatId);
      expect(participantSends.filter((entry) => entry.hasReplyKeyboard)).toHaveLength(1);
      expect(participantSends.at(-1)?.text).toContain("<b>Бій</b>: 1 хід");
      expect(participantSends.at(-1)?.inlineLabels).toContain("🔎 Оновити");
    }
  });

  it("does not resend an intro for proof, replay or later-turn delivery", async () => {
    const proof = makeSession();
    const productionReplay = makeSession({ turn: 2 });
    productionReplay.state.rulesVersion = "group-combat.v3";
    productionReplay.state.encounterKey = "nyz-left-passage-party.v1";
    const sends: string[] = [];
    let nextMessageId = 90;
    const api = {
      sendMessage: vi.fn((_chatId: number, text: string) => {
        sends.push(text);
        return Promise.resolve({ message_id: nextMessageId++ });
      }),
      editMessageText: vi.fn().mockResolvedValue(true),
      deleteMessage: vi.fn().mockResolvedValue(true)
    } as unknown as Api;

    await deliverGroupCombatCards(api, {
      ...mutableCardService(proof),
      finalizeDeliveryAttempt: vi.fn().mockResolvedValue(true)
    } as unknown as GroupCombatService, proof);
    await deliverGroupCombatCards(api, {
      ...mutableCardService(productionReplay),
      finalizeDeliveryAttempt: vi.fn().mockResolvedValue(true)
    } as unknown as GroupCombatService, productionReplay);
    expect(sends.every((text) => !text.includes("Бій починається."))).toBe(true);
  });

  it("publishes one terminal result with Journal/Statistics while leaving the persistent main keyboard untouched", async () => {
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
    const edits: Array<{
      chatId: number;
      messageId: number;
      text: string;
      labels: string[];
    }> = [];
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
      text: string,
      options?: { reply_markup?: { inline_keyboard?: Array<Array<{ text: string }>> } }
    ) => {
      edits.push({
        chatId,
        messageId,
        text,
        labels: options?.reply_markup?.inline_keyboard?.flat().map((button) => button.text) ?? []
      });
      return Promise.resolve(true);
    });
    const service = mutableCardService(session);
    const deleteMessage = vi.fn().mockResolvedValue(true);

    await expect(deliverGroupCombatCards({
      sendMessage,
      editMessageText,
      deleteMessage
    } as unknown as Api, {
      ...service,
      finalizeDeliveryAttempt: vi.fn().mockResolvedValue(true)
    } as unknown as GroupCombatService, session)).resolves.toBe(2);

    for (const participant of session.participants) {
      const participantSends = sends.filter(
        (entry) => entry.chatId === Number(participant.telegramUserId)
      );
      expect(participantSends).toHaveLength(1);
      expect(participantSends[0]?.text).toContain("Доказову сутичку виграно");
      expect(participantSends[0]?.text).not.toContain("Головне меню знову на місці");
      expect(hasReplyKeyboard(participantSends[0]?.replyMarkup)).toBe(false);
      expect(inlineButtonLabels(participantSends[0]?.replyMarkup)).toEqual([
        "📜 Журнал",
        "📊 Статистика"
      ]);
      expect(edits.some((entry) =>
        entry.chatId === Number(participant.telegramUserId) &&
        entry.messageId === participantSends[0]?.messageId
      )).toBe(false);
      expect(participant.exitDeliveryState).toBe("completed");
      expect(participant.chatId).toBe(participant.telegramUserId);
      expect(participant.messageId).toBe(participantSends[0]?.messageId);
      expect(participant.deliveredRevision).toBe(session.deliveryRevision);
    }
    expect(edits.filter((entry) =>
      entry.text === "🗃️ Цю бойову картку замінено актуальною нижче."
    )).toEqual(expect.arrayContaining([
      expect.objectContaining({ chatId: 1001, messageId: 21, labels: [] }),
      expect.objectContaining({ chatId: 1002, messageId: 22, labels: [] })
    ]));
    expect(deleteMessage).toHaveBeenCalledWith(1001, 21, expect.any(AbortSignal));
    expect(deleteMessage).toHaveBeenCalledWith(1002, 22, expect.any(AbortSignal));
  });

  it("reopens a completed terminal result from its deep link as the newest canonical card", async () => {
    const session = makeSession({ deliveryRevision: 13, deliveredRevision: 13 });
    session.status = "won";
    session.state.status = "won";
    session.participants = session.participants.slice(0, 1);
    session.state.participants = session.state.participants.slice(0, 1);
    session.state.enemies.forEach((enemy) => {
      enemy.hp = 0;
    });
    session.state.recap = [{
      turn: 1,
      lines: ["Лідерка завершує доказову сутичку."]
    }];
    const participant = session.participants[0]!;
    participant.exitDeliveryState = "completed";
    participant.settlementStatus = "completed";
    participant.referenceVersion = 3;
    participant.messageId = 90;
    const sendMessage = vi.fn().mockResolvedValue({ message_id: 91 });
    const editMessageText = vi.fn().mockResolvedValue(true);
    const deleteMessage = vi.fn().mockResolvedValue(true);
    const service = mutableCardService(session);

    await expect(deliverGroupCombatParticipantCard({
      sendMessage,
      editMessageText,
      deleteMessage
    } as unknown as Api, service, session.id, participant.characterId, {
      forceRefresh: true,
      forceReplacement: true
    })).resolves.toEqual({
      state: "activated",
      reference: { chatId: 1001n, messageId: 91 }
    });

    expect(sendMessage).toHaveBeenCalledOnce();
    expect(String(sendMessage.mock.calls[0]?.[1])).toContain("Доказову сутичку виграно");
    expect(inlineButtonLabels((sendMessage.mock.calls[0]?.[2] as {
      reply_markup?: unknown;
    } | undefined)?.reply_markup)).toEqual(["📜 Журнал", "📊 Статистика"]);
    expect(editMessageText).toHaveBeenCalledWith(
      1001,
      90,
      "🗃️ Цю бойову картку замінено актуальною нижче.",
      expect.objectContaining({ reply_markup: { inline_keyboard: [] } })
    );
    expect(deleteMessage).toHaveBeenCalledWith(1001, 90);
    expect(participant).toMatchObject({
      exitDeliveryState: "completed",
      settlementStatus: "completed",
      chatId: 1001n,
      messageId: 91,
      referenceVersion: 4,
      deliveredRevision: 13
    });
  });

  it("cannot leave the previous full terminal result when Telegram refuses its deletion", async () => {
    const session = makeSession();
    session.status = "lost";
    session.state.status = "lost";
    session.participants = session.participants.slice(0, 1);
    session.participants[0]!.exitDeliveryState = "pending";
    session.state.participants = session.state.participants.slice(0, 1);
    session.state.participants[0]!.hp = 0;
    const edits: Array<{ messageId: number; text: string }> = [];
    const sends: Array<{ messageId: number; text: string }> = [];
    let nextMessageId = 90;
    const deleteMessage = vi.fn().mockRejectedValue(
      new Error("Telegram refused terminal-card deletion")
    );

    await expect(deliverGroupCombatCards({
      sendMessage: vi.fn((
        _chatId: number,
        text: string
      ) => {
        const messageId = nextMessageId++;
        sends.push({ messageId, text });
        return Promise.resolve({ message_id: messageId });
      }),
      editMessageText: vi.fn((
        _chatId: number,
        messageId: number,
        text: string
      ) => {
        edits.push({ messageId, text });
        return Promise.resolve(true);
      }),
      deleteMessage
    } as unknown as Api, {
      ...mutableCardService(session),
      finalizeDeliveryAttempt: vi.fn().mockResolvedValue(true)
    } as unknown as GroupCombatService, session)).resolves.toBe(1);

    expect(sends).toHaveLength(1);
    expect(sends[0]?.text).toContain("Доказову сутичку програно");
    expect(sends[0]?.text).not.toContain("Головне меню знову на місці");
    expect(edits).toContainEqual({
      messageId: 21,
      text: "🗃️ Цю бойову картку замінено актуальною нижче."
    });
    expect(edits.find((entry) => entry.messageId === 21)?.text)
      .not.toContain("Доказову сутичку програно");
    expect(deleteMessage).toHaveBeenCalledWith(1001, 21, expect.any(AbortSignal));
    expect(session.participants[0]).toMatchObject({
      chatId: 1001n,
      messageId: 90,
      exitDeliveryState: "completed"
    });
  });

  it("replaces one legacy terminal result that Telegram cannot edit and releases navigation", async () => {
    const session = makeSession();
    session.status = "lost";
    session.state.status = "lost";
    session.participants = session.participants.slice(0, 1);
    session.participants[0]!.exitDeliveryState = "menu-delivered";
    session.participants[0]!.exitDeliveryMessageId = 90;
    session.state.participants = session.state.participants.slice(0, 1);
    session.state.participants[0]!.hp = 0;
    session.state.recap = [{ turn: 1, lines: ["Лідерка атакує Шурхіт: 12 шкоди."] }];
    const sendMessage = vi.fn().mockResolvedValueOnce({ message_id: 91 });
    const editMessageText = vi.fn((
      _chatId: number,
      messageId: number
    ) => {
      if (messageId === 90) {
        return Promise.reject(new Error("Bad Request: message can't be edited"));
      }
      return Promise.resolve(true);
    });
    const deleteMessage = vi.fn();
    const service = mutableCardService(session);
    const api = {
      sendMessage,
      editMessageText,
      deleteMessage
    } as unknown as Api;
    const deliveryService = {
      ...service,
      finalizeDeliveryAttempt: vi.fn().mockResolvedValue(false)
    } as unknown as GroupCombatService;

    await expect(deliverGroupCombatCards(api, deliveryService, session)).resolves.toBe(1);

    expect(sendMessage).toHaveBeenCalledOnce();
    expect(String(sendMessage.mock.calls[0]?.[1])).toContain("Доказову сутичку програно");
    const recoveredOptions = sendMessage.mock.calls[0]?.[2] as {
      reply_markup?: { inline_keyboard?: Array<Array<{ text: string }>> };
    } | undefined;
    expect(recoveredOptions?.reply_markup?.inline_keyboard?.flat().map((button) => button.text))
      .toEqual(["📜 Журнал", "📊 Статистика"]);
    expect(session.participants[0]).toMatchObject({
      chatId: 1001n,
      messageId: 91,
      exitDeliveryState: "completed"
    });
    expect(deleteMessage).toHaveBeenCalledWith(1001, 90, expect.any(AbortSignal));

    await expect(deliverGroupCombatCards(api, deliveryService, session)).resolves.toBe(1);
    expect(sendMessage).toHaveBeenCalledOnce();
  });

  it("releases terminal navigation when Telegram refuses both legacy edit and deletion", async () => {
    const session = makeSession({ deliveryRevision: 5, deliveredRevision: 4 });
    session.status = "lost";
    session.state.status = "lost";
    session.participants = session.participants.slice(0, 1);
    session.state.participants = session.state.participants.slice(0, 1);
    session.state.participants[0]!.hp = 0;
    session.state.recap = [{ turn: 4, lines: ["Старий підсумок уже доставлено."] }];
    const participant = session.participants[0]!;
    participant.settlementStatus = "completed";
    participant.exitDeliveryState = "menu-delivered";
    participant.exitDeliveryMessageId = 90;
    const sendMessage = vi.fn();
    const deleteMessage = vi.fn().mockRejectedValue(
      new Error("Bad Request: message can't be deleted")
    );
    const service = mutableCardService(session);
    const api = {
      sendMessage,
      editMessageText: vi.fn().mockRejectedValue(
        new Error("Bad Request: message can't be edited")
      ),
      deleteMessage
    } as unknown as Api;

    await expect(deliverGroupCombatCards(api, {
      ...service,
      finalizeDeliveryAttempt: vi.fn().mockResolvedValue(true)
    } as unknown as GroupCombatService, session)).resolves.toBe(1);

    expect(deleteMessage).toHaveBeenCalledTimes(3);
    expect(sendMessage).not.toHaveBeenCalled();
    expect(participant).toMatchObject({
      exitDeliveryState: "completed",
      messageId: 90,
      deliveredRevision: 5
    });
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

    expect(sendMessage).toHaveBeenCalledOnce();
    expect(String(sendMessage.mock.calls[0]?.[1])).toContain("Доказову сутичку виграно");
    expect(deleteMessage).toHaveBeenCalledWith(1001, 21, expect.any(AbortSignal));
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
      inlineButtonLabels(readReplyMarkup(call[2])).includes("🔎 Оновити")
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
    expect(session.participants[0]!.messageId).toBe(91);
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
            text.includes("Доказову сутичку")
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
            text.includes("Доказову сутичку");
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

  it("finishes a restarted terminal delivery when Telegram already has the exact controls", async () => {
    const session = makeSession({
      turn: 4,
      deliveryRevision: 5,
      deliveredRevision: 4
    });
    session.status = "lost";
    session.state.status = "lost";
    session.participants = session.participants.slice(0, 1);
    session.state.participants = session.state.participants.slice(0, 1);
    session.state.participants[0]!.hp = 0;
    session.state.recap = [{
      turn: 4,
      lines: ["Попередній worker уже домалював журнал."]
    }];
    const participant = session.participants[0]!;
    participant.settlementStatus = "completed";
    participant.exitDeliveryState = "menu-delivered";
    participant.exitDeliveryClaimToken = null;
    participant.exitDeliveryClaimedAt = null;
    participant.exitDeliveryMessageId = 93;
    const sendMessage = vi.fn();
    const editMessageText = vi.fn().mockRejectedValue(
      new Error("Bad Request: message is not modified")
    );
    const service = mutableCardService(session);
    const api = {
      sendMessage,
      editMessageText,
      deleteMessage: vi.fn()
    } as unknown as Api;

    await deliverGroupCombatCards(api, {
      ...service,
      finalizeDeliveryAttempt: vi.fn().mockResolvedValue(true)
    } as unknown as GroupCombatService, session);

    expect(sendMessage).not.toHaveBeenCalled();
    expect(editMessageText).toHaveBeenCalledTimes(2);
    expect(editMessageText.mock.calls[0]?.[1]).toBe(93);
    expect(editMessageText.mock.calls[1]?.[1]).toBe(21);
    expect(participant.exitDeliveryState).toBe("completed");
    expect(participant.deliveredRevision).toBe(5);
    expect(participant.messageId).toBe(93);
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
    const inlineKeyboards: string[][] = [];
    const transport: GroupCombatDeliveryTransport = {
      editMessage: () => Promise.resolve(),
      sendInertMessage: (_chatId, _text, options) => {
        inlineKeyboards.push(inlineButtonLabels(options.reply_markup));
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

    expect(inlineKeyboards).toEqual([["🔎 Оновити"]]);
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

  it("publishes one refreshed keyboard after a busy durable claim becomes available", async () => {
    const session = makeSession();
    session.deliveryPending = true;
    session.participants[0]!.replyKeyboardFingerprint = null;
    const claimParticipantUiPublication = vi.fn()
      .mockResolvedValueOnce({ state: "busy" })
      .mockResolvedValueOnce({
        state: "claimed",
        publishReplyKeyboard: true,
        keyboardGeneration: 1
      });
    const service = {
      ...mutableCardService(session),
      claimParticipantUiPublication,
      renewParticipantUiPublicationClaim: vi.fn().mockResolvedValue(true),
      acknowledgeParticipantUiPublication: vi.fn().mockResolvedValue("acknowledged"),
      releaseParticipantUiPublicationClaim: vi.fn().mockResolvedValue(true)
    } as unknown as GroupCombatService;
    const sentKeyboards: string[][] = [];
    const transport: GroupCombatDeliveryTransport = {
      editMessage: () => Promise.resolve(),
      sendInertMessage: (_chatId, _text, options) => {
        sentKeyboards.push(inlineButtonLabels(options.reply_markup));
        return Promise.resolve(93);
      },
      deleteMessage: () => Promise.resolve()
    };

    await expect(deliverCanonicalGroupCombatParticipantCard({
      service,
      sessionId: session.id,
      participantCharacterId: "character-1",
      transport,
      forceRefresh: true,
      forceReplacement: true
    })).resolves.toMatchObject({ state: "retryable-edit-failure" });
    expect(sentKeyboards).toHaveLength(0);

    await expect(deliverCanonicalGroupCombatParticipantCard({
      service,
      sessionId: session.id,
      participantCharacterId: "character-1",
      transport,
      forceRefresh: true
    })).resolves.toMatchObject({ state: "activated" });
    expect(sentKeyboards).toHaveLength(1);
    expect(sentKeyboards[0]).toContain("🔎 Оновити");
    expect(sentKeyboards[0]).toContain("🗡️ Вдарити");
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
        buildGroupCombatKeyboard(session, participant.characterId).inline_keyboard
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

  it("edits the canonical card without hiding an unchanged reply keyboard on the new turn", async () => {
    const session = makeSession({
      turn: 2,
      deliveryRevision: 2,
      deliveredRevision: 1
    });
    session.participants[1]!.deliveredRevision = 1;
    for (const participant of session.participants) {
      participant.replyKeyboardFingerprint = JSON.stringify(
        buildGroupCombatKeyboard(session, participant.characterId).inline_keyboard
      );
      participant.replyKeyboardGeneration = 1;
    }
    const sendMessage = vi.fn();
    const activeEditOptions: unknown[] = [];
    const editMessageText = vi.fn((
      _chatId: number,
      _messageId: number,
      text: string,
      options: { reply_markup?: unknown }
    ) => {
      if (text.includes("<b>Бій</b>: 2 хід")) {
        activeEditOptions.push(options);
      }
      return Promise.resolve(true);
    });

    await expect(deliverGroupCombatCards({
      sendMessage,
      editMessageText,
      deleteMessage: vi.fn().mockResolvedValue(true)
    } as unknown as Api, {
      ...mutableCardService(session),
      finalizeDeliveryAttempt: vi.fn().mockResolvedValue(true)
    } as unknown as GroupCombatService, session)).resolves.toBe(2);

    expect(sendMessage).not.toHaveBeenCalled();
    expect(activeEditOptions).toHaveLength(2);
    for (const options of activeEditOptions) {
      expect(inlineButtonLabels((options as { reply_markup?: unknown }).reply_markup))
        .toContain("🔎 Оновити");
    }
    expect(session.participants.map((participant) => participant.replyKeyboardGeneration))
      .toEqual([1, 1]);
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
    const inlineKeyboards = new Map<number, string[]>();
    const sendMessage = vi.fn((
      chatId: number,
      _text: string,
      options?: {
        reply_markup?: {
          inline_keyboard?: Array<Array<{ text: string }>>;
        };
      }
    ) => {
      if (options?.reply_markup?.inline_keyboard) {
        inlineKeyboards.set(
          chatId,
          options.reply_markup.inline_keyboard.flat().map((button) => button.text)
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

    expect(inlineKeyboards.get(1001)).toContain("🪓 Силовий замах");
    expect(inlineKeyboards.get(1002)).not.toContain("🪓 Силовий замах");
  });

  it("publishes one actor keyboard-card plus one changed ally keyboard-card", async () => {
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
        buildGroupCombatKeyboard(session, participant.characterId).inline_keyboard
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
    const sends: Array<{ chatId: number; inlineLabels: string[] }> = [];
    let nextMessageId = 93;
    const sendMessage = vi.fn((
      chatId: number,
      _text: string,
      options?: { reply_markup?: { inline_keyboard?: Array<Array<{ text: string }>> } }
    ) => {
      sends.push({
        chatId,
        inlineLabels: options?.reply_markup?.inline_keyboard?.flat().map((button) => button.text) ?? []
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

    expect(sends.map((entry) => entry.chatId)).toEqual([1001, 1002]);
    expect(sends[0]?.inlineLabels).toContain("🪓 Силовий замах");
    expect(sends[1]?.inlineLabels).not.toContain("🪓 Силовий замах");
    expect(editMessageText.mock.calls.filter((call) => call[0] === 1001))
      .toHaveLength(2);
    expect(editMessageText.mock.calls.filter((call) => call[0] === 1002))
      .toHaveLength(2);
  });

  it("replaces a losing repair candidate with a compact inert note when deletion keeps failing", async () => {
    const withoutReference = makeSession({ chatId: null, messageId: null, referenceVersion: 0 });
    const winner = makeSession({ chatId: 1001n, messageId: 77, referenceVersion: 1 });
    const findById = vi.fn()
      .mockResolvedValueOnce(withoutReference)
      .mockResolvedValue(winner);
    const edits: Array<{ messageId: number; text: string }> = [];
    const sentOptions: unknown[] = [];
    const deleteMessage = vi.fn((
      _reference: Parameters<GroupCombatDeliveryTransport["deleteMessage"]>[0]
    ): Promise<void> => {
      void _reference;
      return Promise.reject(new Error("Telegram delete failed"));
    });
    const transport: GroupCombatDeliveryTransport = {
      editMessage: (reference, text) => {
        edits.push({ messageId: reference.messageId, text });
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
    expect(inlineButtonLabels(readReplyMarkup(sentOptions[0]))).toContain("🔎 Оновити");
    expect(deleteMessage).toHaveBeenCalledTimes(3);
    expect(deleteMessage).toHaveBeenCalledWith({ chatId: 1001n, messageId: 31 });
    expect(edits[0]).toEqual({
      messageId: 31,
      text: "🗃️ Цю бойову картку замінено актуальною нижче."
    });
    expect(edits[1]?.messageId).toBe(77);
    expect(edits[1]?.text).toContain("<b>Бій</b>:");
    expect(edits[0]?.text).not.toContain("<b>Бій</b>:");
  });

  it("retries deletion of a losing candidate instead of leaving a duplicate battle card", async () => {
    const withoutReference = makeSession({ chatId: null, messageId: null, referenceVersion: 0 });
    const winner = makeSession({ chatId: 1001n, messageId: 77, referenceVersion: 1 });
    const findById = vi.fn()
      .mockResolvedValueOnce(withoutReference)
      .mockResolvedValue(winner);
    const deleteMessage = vi.fn()
      .mockRejectedValueOnce(new Error("transient Telegram delete failure"))
      .mockResolvedValue(undefined);
    const editMessage = vi.fn().mockResolvedValue(undefined);
    const transport: GroupCombatDeliveryTransport = {
      editMessage,
      sendInertMessage: () => Promise.resolve(31),
      deleteMessage
    };

    await expect(deliverCanonicalGroupCombatParticipantCard({
      service: {
        findById,
        compareAndSetParticipantCard: vi.fn().mockResolvedValue(false),
        markParticipantCardDelivered: vi.fn().mockResolvedValue(true)
      } as unknown as GroupCombatService,
      sessionId: withoutReference.id,
      participantCharacterId: "character-1",
      transport
    })).resolves.toMatchObject({
      state: "edited",
      reference: { chatId: 1001n, messageId: 77 }
    });

    expect(deleteMessage).toHaveBeenCalledTimes(2);
    expect(editMessage).toHaveBeenCalledOnce();
    expect(editMessage).toHaveBeenCalledWith(
      { chatId: 1001n, messageId: 77 },
      expect.any(String),
      expect.any(Object)
    );
  });

  it("retires a sent candidate when its durable card claim fails before commit", async () => {
    const session = makeSession({ chatId: null, messageId: null, referenceVersion: 0 });
    const deleteMessage = vi.fn().mockResolvedValue(undefined);

    await expect(deliverCanonicalGroupCombatParticipantCard({
      service: {
        findById: vi.fn().mockResolvedValue(session),
        compareAndSetParticipantCard: vi.fn()
          .mockRejectedValue(new Error("durable card claim failed")),
        markParticipantCardDelivered: vi.fn()
      } as unknown as GroupCombatService,
      sessionId: session.id,
      participantCharacterId: "character-1",
      transport: {
        editMessage: vi.fn(),
        sendInertMessage: vi.fn().mockResolvedValue(31),
        deleteMessage
      }
    })).rejects.toThrow("durable card claim failed");

    expect(deleteMessage).toHaveBeenCalledOnce();
    expect(deleteMessage).toHaveBeenCalledWith({
      chatId: 1001n,
      messageId: 31
    });
  });

  it("promotes a replacement card to the latest message and retires the previous canonical reference", async () => {
    const session = makeSession();
    const oldReference = { chatId: 1001n, messageId: 21 };
    const edits: Array<{ messageId: number; text: string; buttons: string[] }> = [];
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
      editMessage: (reference, text, options) => {
        edits.push({
          messageId: reference.messageId,
          text,
          buttons: inlineButtonLabels(readReplyMarkup(options))
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
    expect(inlineButtonLabels(readReplyMarkup(sentOptions[0]))).toContain("🔎 Оновити");
    expect(edits).toHaveLength(2);
    expect(edits[0]).toEqual({
      messageId: 21,
      text: "🗃️ Цю бойову картку замінено актуальною нижче.",
      buttons: []
    });
    expect(edits[1]?.messageId).toBe(93);
    expect(edits[1]?.text).toContain("<b>Бій</b>: 1 хід");
    expect(edits[1]?.buttons).toContain("🔎 Оновити");
    expect(deleteMessage).toHaveBeenCalledWith(oldReference);
  });

  it("leaves only a compact superseded note when previous-card deletion fails after activation", async () => {
    const session = makeSession();
    const actionable = new Set([21]);
    const rendered = new Map<number, string>();
    const deleteMessage = vi.fn(() => Promise.reject(new Error("Telegram delete failed")));
    const transport: GroupCombatDeliveryTransport = {
      editMessage: (reference, text, options) => {
        rendered.set(reference.messageId, text);
        const hasButtons = inlineButtonLabels(readReplyMarkup(options)).length > 0;
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
    expect(rendered.get(21)).toBe("🗃️ Цю бойову картку замінено актуальною нижче.");
    expect(rendered.get(21)).not.toContain("<b>Бій</b>:");
    expect(rendered.get(93)).toContain("<b>Бій</b>: 1 хід");
    expect(deleteMessage).toHaveBeenCalledWith({ chatId: 1001n, messageId: 21 });
  });

  it("keeps an ambiguously activated candidate canonical and converges without rearming the previous card", async () => {
    const session = makeSession();
    const actionable = new Set([21]);
    let candidateAttempts = 0;
    const deleteMessage = vi.fn(() => Promise.reject(new Error("Telegram delete failed")));
    const transport: GroupCombatDeliveryTransport = {
      editMessage: (reference, _text, options) => {
        const hasButtons = inlineButtonLabels(readReplyMarkup(options)).length > 0;
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
        const hasButtons = inlineButtonLabels(readReplyMarkup(options)).length > 0;
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
    expect(actionable).toEqual(new Set([93]));
    expect(candidateAttempts).toBe(2);
  });

  it("restores the previous canonical card when the promoted candidate is unavailable", async () => {
    const session = makeSession();
    const actionable = new Set([21]);
    const edits: Array<{ messageId: number; hasButtons: boolean }> = [];
    const transport: GroupCombatDeliveryTransport = {
      editMessage: (reference, _text, options) => {
        const hasButtons = inlineButtonLabels(readReplyMarkup(options)).length > 0;
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
        const hasButtons = inlineButtonLabels(readReplyMarkup(options)).length > 0;
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
        keyboards.push(inlineButtonLabels(readReplyMarkup(options)));
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
    expect(keyboards[0]).toContain("🔎 Оновити");
    expect(keyboards.at(-1)).toContain("🔎 Оновити");
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
    replaceCompletedParticipantTerminalCard: vi.fn((input: {
      telegramUserId: bigint;
      expectedDeliveryRevision: number;
      expectedReferenceVersion: number;
      previousChatId: bigint | null;
      previousMessageId: number | null;
      terminalCard: { chatId: bigint; messageId: number };
    }) => {
      const participant = session.participants.find(
        (candidate) => candidate.telegramUserId === input.telegramUserId
      );
      if (
        !participant ||
        session.status === "active" ||
        participant.exitDeliveryState !== "completed" ||
        participant.referenceVersion !== input.expectedReferenceVersion ||
        participant.chatId !== input.previousChatId ||
        participant.messageId !== input.previousMessageId ||
        session.deliveryRevision !== input.expectedDeliveryRevision
      ) {
        return Promise.resolve(false);
      }
      participant.chatId = input.terminalCard.chatId;
      participant.messageId = input.terminalCard.messageId;
      participant.referenceVersion += 1;
      participant.deliveredRevision = input.expectedDeliveryRevision;
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
            (
              participant.exitDeliveryState !== "claimed" &&
              participant.exitDeliveryState !== "menu-delivered"
            ) ||
            (
              participant.exitDeliveryClaimToken !== null &&
              (
                !participant.exitDeliveryClaimedAt ||
                participant.exitDeliveryClaimedAt > input.staleBefore
              )
            )
          )
        )
      ) {
        return Promise.resolve(false);
      }
      const menuDelivered = participant.exitDeliveryState === "menu-delivered";
      if (!menuDelivered) {
        participant.exitDeliveryState = "claimed";
      }
      participant.exitDeliveryClaimToken = input.claimToken;
      participant.exitDeliveryClaimedAt = input.claimedAt;
      return Promise.resolve({
        state: "claimed",
        locationId: "korchma.hall",
        questMarkers: null,
        menuDelivered
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
      if (participant.exitDeliveryState === "claimed") {
        participant.exitDeliveryState = "pending";
        participant.exitDeliveryMessageId = null;
      }
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
          (
            candidate.exitDeliveryState === "claimed" ||
            candidate.exitDeliveryState === "menu-delivered"
          ) &&
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
      participant.exitDeliveryMessageId = input.messageId;
      return Promise.resolve(true);
    }),
    adoptParticipantFleeExitTerminalCard: vi.fn().mockImplementation((input: {
      telegramUserId: bigint;
      claimToken: string;
      expectedReferenceVersion: number;
      terminalCard: {
        chatId: bigint;
        messageId: number;
        deliveryRevision: number;
      };
    }) => {
      const participant = session.participants.find(
        (candidate) =>
          candidate.telegramUserId === input.telegramUserId &&
          candidate.exitDeliveryState === "menu-delivered" &&
          candidate.exitDeliveryClaimToken === input.claimToken &&
          candidate.referenceVersion === input.expectedReferenceVersion
      );
      if (!participant) {
        return Promise.resolve(false);
      }
      participant.chatId = input.terminalCard.chatId;
      participant.messageId = input.terminalCard.messageId;
      participant.deliveredRevision = input.terminalCard.deliveryRevision;
      participant.referenceVersion += 1;
      return Promise.resolve(true);
    }),
    completeParticipantFleeExitDelivery: vi.fn().mockImplementation((input: {
      telegramUserId: bigint;
      claimToken: string;
      expectedReferenceVersion: number;
      retainReference: boolean;
    }) => {
      const participant = session.participants.find(
        (candidate) =>
          candidate.telegramUserId === input.telegramUserId &&
          candidate.referenceVersion === input.expectedReferenceVersion &&
          candidate.exitDeliveryState === "menu-delivered" &&
          candidate.exitDeliveryClaimToken === input.claimToken
      );
      if (!participant) {
        return Promise.resolve(false);
      }
      participant.exitDeliveryState = "completed";
      participant.exitDeliveryClaimToken = null;
      participant.exitDeliveryClaimedAt = null;
      if (!input.retainReference) {
        participant.chatId = null;
        participant.messageId = null;
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
