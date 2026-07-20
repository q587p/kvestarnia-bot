import { describe, expect, it, vi } from "vitest";
import type { PartyRaidChatRepository } from "../../src/db/repositories/partyRaidChatRepository";
import { PartyRaidChatService } from "../../src/services/partyRaidChatService";

const now = new Date("2026-07-20T10:00:00.000Z");

type RepositoryMocks = {
  beginCompose: ReturnType<typeof vi.fn>;
  bindComposePrompt: ReturnType<typeof vi.fn>;
  acceptReply: ReturnType<typeof vi.fn>;
  devFillForTelegramUser: ReturnType<typeof vi.fn>;
  requestRecruitingRefresh: ReturnType<typeof vi.fn>;
  cancelDisabledComposeIntents: ReturnType<typeof vi.fn>;
  markDisabledReferencesForRedaction: ReturnType<typeof vi.fn>;
};

describe("PartyRaidChatService", () => {
  it("keeps runtime and dev mutations blocked when disabled", async () => {
    const repository = makeRepository();
    const mocks = repository as unknown as RepositoryMocks;
    const service = new PartyRaidChatService(repository, { enabled: false, devHelpersEnabled: true }, () => now);

    await expect(service.beginCompose(1n, "raid-token", 1n)).resolves.toEqual({ state: "disabled" });
    await expect(service.bindComposePrompt("intent-1", 1, 13)).resolves.toEqual({ state: "stale" });
    await expect(service.getAuthorizedView(1n, "raid-token")).resolves.toBeNull();
    await expect(service.requestRecruitingRefresh(1n, "raid-token")).resolves.toBe(false);
    await expect(service.devFill(1n, 14)).resolves.toBe(0);
    await expect(service.devClear(1n)).resolves.toBe(false);
    expect(mocks.beginCompose).not.toHaveBeenCalled();
    expect(mocks.bindComposePrompt).not.toHaveBeenCalled();
    expect(mocks.requestRecruitingRefresh).not.toHaveBeenCalled();
    expect(mocks.devFillForTelegramUser).not.toHaveBeenCalled();
  });

  it("cancels durable composers during a disabled startup pass", async () => {
    const repository = makeRepository();
    const mocks = repository as unknown as RepositoryMocks;
    mocks.cancelDisabledComposeIntents.mockResolvedValue(2);
    mocks.markDisabledReferencesForRedaction.mockResolvedValue(1);
    const service = new PartyRaidChatService(repository, { enabled: false, devHelpersEnabled: false }, () => now);

    await expect(service.prepareDisabledRedactions()).resolves.toBe(3);
    expect(mocks.cancelDisabledComposeIntents).toHaveBeenCalledWith(now);
    expect(mocks.markDisabledReferencesForRedaction).toHaveBeenCalledWith(now, 23);
  });

  it("normalizes valid text before accepting it", async () => {
    const repository = makeRepository();
    const mocks = repository as unknown as RepositoryMocks;
    mocks.acceptReply.mockResolvedValue({ state: "accepted", inviteToken: "raid-token", revision: 2 });
    const service = new PartyRaidChatService(repository, { enabled: true, devHelpersEnabled: false }, () => now);

    await expect(service.submitInput({
      telegramUserId: 1n,
      privateChatId: 1n,
      promptMessageId: 10,
      sourceMessageId: 11,
      text: "  Хало\n  ватагo  "
    })).resolves.toMatchObject({ state: "accepted" });
    expect(mocks.acceptReply).toHaveBeenCalledWith(expect.objectContaining({ normalizedBody: "Хало ватагo" }));
  });

  it("defensively rejects private entities, direct attachment calls, forwarding and overlong content before the repository", async () => {
    const repository = makeRepository();
    const mocks = repository as unknown as RepositoryMocks;
    const service = new PartyRaidChatService(repository, { enabled: true, devHelpersEnabled: false }, () => now);

    await expect(service.submitInput({
      telegramUserId: 1n,
      privateChatId: 1n,
      promptMessageId: 10,
      sourceMessageId: 11,
      text: "example.com",
      entityTypes: ["url"]
    })).resolves.toEqual({ state: "invalid", reason: "entity" });
    for (const entityType of ["text_link", "email", "phone_number", "mention", "text_mention"]) {
      await expect(service.submitInput({
        telegramUserId: 1n,
        privateChatId: 1n,
        promptMessageId: 10,
        sourceMessageId: 11,
        text: "рядок",
        entityTypes: [entityType]
      })).resolves.toEqual({ state: "invalid", reason: "entity" });
    }
    await expect(service.submitInput({
      telegramUserId: 1n,
      privateChatId: 1n,
      promptMessageId: 10,
      sourceMessageId: 11,
      hasAttachment: true
    })).resolves.toEqual({ state: "invalid", reason: "attachment" });
    await expect(service.submitInput({
      telegramUserId: 1n,
      privateChatId: 1n,
      promptMessageId: 10,
      sourceMessageId: 11,
      text: "переслане",
      isForwarded: true
    })).resolves.toEqual({ state: "invalid", reason: "attachment" });
    await expect(service.submitInput({
      telegramUserId: 1n,
      privateChatId: 1n,
      promptMessageId: 10,
      sourceMessageId: 12,
      text: "а".repeat(94)
    })).resolves.toEqual({ state: "invalid", reason: "too-long" });
    expect(mocks.acceptReply).not.toHaveBeenCalled();
  });
});

function makeRepository(): PartyRaidChatRepository {
  return {
    beginCompose: vi.fn(),
    bindComposePrompt: vi.fn(),
    findBoundIntent: vi.fn(),
    cancelCompose: vi.fn(),
    cancelDisabledComposeIntents: vi.fn(),
    acceptReply: vi.fn(),
    getAuthorizedView: vi.fn(),
    requestRecruitingRefresh: vi.fn(),
    listDueDeliveries: vi.fn(),
    isDeliveryClaimCurrent: vi.fn(),
    recordDeliveryReference: vi.fn(),
    markDeliveryRendered: vi.fn(),
    markDeliveryFailure: vi.fn(),
    markDeliveryRedacted: vi.fn(),
    markDisabledReferencesForRedaction: vi.fn(),
    cleanupExpired: vi.fn(),
    devFillForTelegramUser: vi.fn(),
    devClearForTelegramUser: vi.fn(),
    devExpireForTelegramUser: vi.fn()
  };
}
