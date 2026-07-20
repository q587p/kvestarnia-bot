import type { Bot } from "grammy";
import { describe, expect, it, vi } from "vitest";
import { runPartyRaidChatDeliveryTick } from "../../src/bot/partyRaidChatDeliveryScheduler";
import type { PartyRaidChatDeliveryRecord } from "../../src/db/repositories/partyRaidChatRepository";
import type { PartyRaidChatService } from "../../src/services/partyRaidChatService";
import type { PartySessionService } from "../../src/services/partySessionService";

const NOW = new Date("2026-07-20T12:00:00.000Z");

describe("party raid chat delivery recovery", () => {
  it("redacts a durable reference request even while rollout is disabled", async () => {
    const delivery = makeDelivery({ id: "redact", redactionRequired: true, chatId: null, messageId: null });
    const { services, raidChat } = makeServices(delivery, { enabled: false, view: null });

    await runPartyRaidChatDeliveryTick(services, makeBot(), {}, () => NOW);

    expect(raidChat.prepareDisabledRedactions).toHaveBeenCalledOnce();
    expect(raidChat.markDeliveryRedacted).toHaveBeenCalledWith("redact", "no-reference", {
      desiredRevision: 1,
      chatId: null,
      messageId: null
    });
    expect(raidChat.getAuthorizedView).not.toHaveBeenCalled();
  });

  it("persists Telegram retry_after from the failure observation time", async () => {
    const delivery = makeDelivery({ id: "retry", chatId: 81n, messageId: 13 });
    const { services, raidChat } = makeServices(delivery);
    const bot = makeBot({ editError: { error_code: 429, parameters: { retry_after: 42 } } });

    await runPartyRaidChatDeliveryTick(services, bot, {}, () => NOW);

    expect(raidChat.markDeliveryFailure).toHaveBeenCalledWith(
      "retry",
      new Date(NOW.getTime() + 42_000),
      "telegram-429"
    );
    expect(raidChat.markDeliveryRendered).not.toHaveBeenCalled();
  });

  it("replaces a missing active card and acknowledges the revision actually rendered", async () => {
    const delivery = makeDelivery({ id: "replace", chatId: null, messageId: null, desiredRevision: 7 });
    const { services, raidChat } = makeServices(delivery, { view: makeView({ chatRevision: 8 }) });
    const bot = makeBot({ sentChatId: 83, sentMessageId: 93 });

    await runPartyRaidChatDeliveryTick(services, bot, {}, () => NOW);

    expect(raidChat.recordDeliveryReference).toHaveBeenCalledWith("replace", 83n, 93);
    expect(raidChat.markDeliveryRendered).toHaveBeenCalledWith("replace", 8);
    expect(raidChat.recordDeliveryReference.mock.invocationCallOrder[0]).toBeLessThan(
      raidChat.markDeliveryRendered.mock.invocationCallOrder[0]!
    );
  });

  it("acknowledges message-not-modified without replacement or retry", async () => {
    const delivery = makeDelivery({ id: "same", chatId: 82n, messageId: 42, desiredRevision: 9 });
    const bot = makeBot({ editError: new Error("400: Bad Request: message is not modified") });
    const { services, raidChat } = makeServices(delivery, { view: makeView({ chatRevision: 9 }) });

    await runPartyRaidChatDeliveryTick(services, bot, {}, () => NOW);

    expect(bot.sendMessageMock).not.toHaveBeenCalled();
    expect(raidChat.markDeliveryRendered).toHaveBeenCalledWith("same", 9);
    expect(raidChat.markDeliveryFailure).not.toHaveBeenCalled();
  });

  it("parks a permanent send failure as unavailable instead of retrying", async () => {
    const delivery = makeDelivery({ id: "blocked", chatId: null, messageId: null, desiredRevision: 4 });
    const bot = makeBot({
      sendError: { error_code: 400, description: "Bad Request: PEER_ID_INVALID" }
    });
    const { services, raidChat } = makeServices(delivery, { view: makeView({ chatRevision: 4 }) });

    await runPartyRaidChatDeliveryTick(services, bot, {}, () => NOW);

    expect(raidChat.markDeliveryRedacted).toHaveBeenCalledWith("blocked", "permanent-unavailable", {
      desiredRevision: 4,
      chatId: null,
      messageId: null
    });
    expect(raidChat.markDeliveryFailure).not.toHaveBeenCalled();
    expect(raidChat.markDeliveryRendered).not.toHaveBeenCalled();
  });

  it("parks an edit-side blocked target without attempting replacement delivery", async () => {
    const delivery = makeDelivery({ id: "edit-blocked", chatId: 82n, messageId: 42, desiredRevision: 5 });
    const bot = makeBot({
      editError: { error_code: 403, description: "Forbidden: bot was blocked by the user" }
    });
    const { services, raidChat } = makeServices(delivery, { view: makeView({ chatRevision: 5 }) });

    await runPartyRaidChatDeliveryTick(services, bot, {}, () => NOW);

    expect(bot.sendMessageMock).not.toHaveBeenCalled();
    expect(raidChat.markDeliveryRedacted).toHaveBeenCalledWith("edit-blocked", "permanent-unavailable", {
      desiredRevision: 5,
      chatId: 82n,
      messageId: 42
    });
    expect(raidChat.markDeliveryFailure).not.toHaveBeenCalled();
  });

  it("parks an edit-side blocked target during redaction", async () => {
    const delivery = makeDelivery({
      id: "redact-blocked",
      chatId: 82n,
      messageId: 42,
      redactionRequired: true
    });
    const bot = makeBot({
      editError: { error_code: 403, description: "Forbidden: chat not found" }
    });
    const { services, raidChat } = makeServices(delivery);

    await runPartyRaidChatDeliveryTick(services, bot, {}, () => NOW);

    expect(raidChat.markDeliveryRedacted).toHaveBeenCalledWith("redact-blocked", "permanent-unavailable", {
      desiredRevision: 1,
      chatId: 82n,
      messageId: 42
    });
    expect(raidChat.markDeliveryFailure).not.toHaveBeenCalled();
  });

  it("keeps bounded retry for a transient send failure", async () => {
    const delivery = makeDelivery({ id: "transient", chatId: null, messageId: null, attemptCount: 1 });
    const bot = makeBot({ sendError: { error_code: 500, description: "Internal Server Error" } });
    const { services, raidChat } = makeServices(delivery);

    await runPartyRaidChatDeliveryTick(services, bot, {}, () => NOW);

    expect(raidChat.markDeliveryFailure).toHaveBeenCalledWith(
      "transient",
      new Date(NOW.getTime() + 2_200),
      "telegram-retryable"
    );
    expect(raidChat.markDeliveryRedacted).not.toHaveBeenCalled();
  });
});

function makeDelivery(overrides: Partial<PartyRaidChatDeliveryRecord> = {}): PartyRaidChatDeliveryRecord {
  return {
    id: "delivery-1",
    participantId: "participant-1",
    partySessionId: "party-1",
    inviteToken: "raid-token-1",
    participantCharacterId: "character-1",
    telegramUserId: 82n,
    surfaceMode: "active_card",
    chatId: null,
    messageId: null,
    desiredRevision: 1,
    renderedRevision: 0,
    redactionRequired: false,
    attemptCount: 0,
    ...overrides
  };
}

function makeServices(
  delivery: PartyRaidChatDeliveryRecord,
  options: { enabled?: boolean; view?: ReturnType<typeof makeView> | null } = {}
) {
  const raidChat = {
    prepareDisabledRedactions: vi.fn().mockResolvedValue(0),
    cleanupExpired: vi.fn().mockResolvedValue(0),
    listDueDeliveries: vi.fn().mockResolvedValue([delivery]),
    isEnabled: vi.fn().mockReturnValue(options.enabled ?? true),
    getAuthorizedView: vi.fn().mockResolvedValue(options.view === undefined ? makeView() : options.view),
    markDeliveryFailure: vi.fn().mockResolvedValue(undefined),
    markDeliveryRedacted: vi.fn().mockResolvedValue(undefined),
    markDeliveryRendered: vi.fn().mockResolvedValue(undefined),
    recordDeliveryReference: vi.fn().mockResolvedValue(undefined)
  };
  return {
    raidChat,
    services: {
      partyRaidChat: raidChat as unknown as PartyRaidChatService,
      partySessions: { areDevHelpersEnabled: () => false } as unknown as PartySessionService
    }
  };
}

function makeView(overrides: { chatRevision?: number } = {}) {
  return {
    partySessionId: "party-1",
    inviteToken: "raid-token-1",
    chatRevision: overrides.chatRevision ?? 1,
    lifecycle: "active" as const,
    writable: true,
    retentionUntil: null,
    viewerCharacterId: "character-1",
    entries: []
  };
}

type TestBot = Bot & { sendMessageMock: ReturnType<typeof vi.fn> };

function makeBot(options: {
  editError?: unknown;
  sendError?: unknown;
  sentChatId?: number;
  sentMessageId?: number;
} = {}): TestBot {
  const sendMessageMock = options.sendError
    ? vi.fn().mockRejectedValue(options.sendError)
    : vi.fn().mockResolvedValue({
        chat: { id: options.sentChatId ?? 82 },
        message_id: options.sentMessageId ?? 42
      });
  return {
    api: {
      editMessageText: options.editError
        ? vi.fn().mockRejectedValue(options.editError)
        : vi.fn().mockResolvedValue(true),
      sendMessage: sendMessageMock
    },
    sendMessageMock
  } as unknown as TestBot;
}
