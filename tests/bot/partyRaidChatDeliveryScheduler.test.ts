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
    expect(raidChat.markDeliveryRedacted).toHaveBeenCalledWith("redact", "no-reference");
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

  it("replaces a missing active card and persists the new reference before acknowledging revision", async () => {
    const delivery = makeDelivery({ id: "replace", chatId: null, messageId: null, desiredRevision: 7 });
    const { services, raidChat } = makeServices(delivery);
    const bot = makeBot({ sentChatId: 83, sentMessageId: 93 });

    await runPartyRaidChatDeliveryTick(services, bot, {}, () => NOW);

    expect(raidChat.recordDeliveryReference).toHaveBeenCalledWith("replace", 83n, 93);
    expect(raidChat.markDeliveryRendered).toHaveBeenCalledWith("replace", 7);
    expect(raidChat.recordDeliveryReference.mock.invocationCallOrder[0]).toBeLessThan(
      raidChat.markDeliveryRendered.mock.invocationCallOrder[0]!
    );
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

function makeView() {
  return {
    partySessionId: "party-1",
    inviteToken: "raid-token-1",
    chatRevision: 1,
    lifecycle: "active" as const,
    writable: true,
    retentionUntil: null,
    viewerCharacterId: "character-1",
    entries: []
  };
}

function makeBot(options: {
  editError?: unknown;
  sentChatId?: number;
  sentMessageId?: number;
} = {}): Bot {
  return {
    api: {
      editMessageText: options.editError
        ? vi.fn().mockRejectedValue(options.editError)
        : vi.fn().mockResolvedValue(true),
      sendMessage: vi.fn().mockResolvedValue({
        chat: { id: options.sentChatId ?? 82 },
        message_id: options.sentMessageId ?? 42
      })
    }
  } as unknown as Bot;
}
