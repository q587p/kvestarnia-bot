import type { Bot, Context, NextFunction } from "grammy";
import { describe, expect, it, vi } from "vitest";
import {
  formatPartyRaidChatWait,
  registerPartyRaidChatInput
} from "../../src/bot/commands/partyRaidChatCommand";
import type { PartyRaidChatService } from "../../src/services/partyRaidChatService";

describe("party raid chat input routing", () => {
  it("does not register the dev helper when production isolation disables it", () => {
    const command = vi.fn();
    const on = vi.fn();
    registerPartyRaidChatInput({ command, on } as unknown as Bot, makeService({ dev: false }));

    expect(command).toHaveBeenCalledTimes(1);
    expect(command).toHaveBeenCalledWith("cancel_raid_chat", expect.any(Function));
  });

  it("registers the dev helper only when its combined non-production gate is enabled", () => {
    const command = vi.fn();
    registerPartyRaidChatInput({ command, on: vi.fn() } as unknown as Bot, makeService({ dev: true }));

    expect(command).toHaveBeenCalledTimes(2);
    expect(command).toHaveBeenNthCalledWith(1, "cancel_raid_chat", expect.any(Function));
    expect(command).toHaveBeenNthCalledWith(2, "dev_raid_chat", expect.any(Function));
  });

  it("passes commands and replies to any other prompt through unchanged", async () => {
    const { handler, service } = registerForTest();
    const next = vi.fn<NextFunction>().mockResolvedValue(undefined);

    await handler(makeContext({ text: "/help", command: true, replyMessageId: 13 }), next);
    await handler(makeContext({ text: "Не той бланк", replyMessageId: 14 }), next);

    expect(next).toHaveBeenCalledTimes(2);
    expect(service.findBoundIntent).toHaveBeenCalledTimes(1);
    expect(service.submitInput).not.toHaveBeenCalled();
  });

  it("consumes only the exact bot-authored private ForceReply once", async () => {
    const { handler, service } = registerForTest({ boundPromptId: 13 });
    const next = vi.fn<NextFunction>().mockResolvedValue(undefined);
    const ctx = makeContext({ text: "Хало & привіт", replyMessageId: 13 });

    await handler(ctx, next);

    expect(next).not.toHaveBeenCalled();
    expect(service.submitInput).toHaveBeenCalledWith(expect.objectContaining({
      telegramUserId: 42n,
      privateChatId: 42n,
      promptMessageId: 13,
      sourceMessageId: 93,
      text: "Хало & привіт"
    }));
    expect(ctx.api.editMessageText).toHaveBeenCalledWith(42, 13, "✅ Додано до рейд-чату.");
  });

  it("passes media, captions and forwarded replies through without touching the composer", async () => {
    const { handler, service } = registerForTest({ boundPromptId: 13 });
    const next = vi.fn<NextFunction>().mockResolvedValue(undefined);

    await handler(makeContext({ replyMessageId: 13, attachment: true, chatId: 44 }), next);
    await handler(makeContext({ replyMessageId: 13, attachment: true, caption: "Підпис", chatId: 44 }), next);
    await handler(makeContext({ replyMessageId: 13, text: "Переслане", forwarded: true, chatId: 44 }), next);

    expect(next).toHaveBeenCalledTimes(3);
    expect(service.findBoundIntent).not.toHaveBeenCalled();
    expect(service.submitInput).not.toHaveBeenCalled();
    expect(service.beginComposeMock).not.toHaveBeenCalled();
    expect(service.bindComposePromptMock).not.toHaveBeenCalled();
  });

  it("formats the canonical 93-second wait without rounding it to two minutes", () => {
    const now = new Date("2026-07-20T12:00:00.000Z");
    expect(formatPartyRaidChatWait(new Date(now.getTime() + 59_001), now)).toBe("1 хв");
    expect(formatPartyRaidChatWait(new Date(now.getTime() + 93_000), now)).toBe("1 хв 33 с");
  });

  it("offers a newly bound composer after a transient repository failure without logging private text", async () => {
    const { handler, service } = registerForTest({ boundPromptId: 13 });
    service.submitInput.mockRejectedValue(Object.assign(new Error("private-body"), { code: "P1008" }));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const ctx = makeContext({ text: "Таємний рядок", replyMessageId: 13, chatId: 45 });

    await handler(ctx, vi.fn<NextFunction>().mockResolvedValue(undefined));

    expect(service.beginComposeMock).toHaveBeenCalledWith(42n, "raid-token-1", 45n);
    expect(service.bindComposePromptMock).toHaveBeenCalledWith("intent-2", 3, 94);
    expect(error).toHaveBeenCalledWith("Квестарня: тимчасовий збій рейд-чату.", { code: "P1008" });
    expect(JSON.stringify(error.mock.calls)).not.toContain("Таємний рядок");
    error.mockRestore();
  });
});

function registerForTest(options: { boundPromptId?: number } = {}) {
  let handler: ((ctx: Context, next: NextFunction) => Promise<void>) | undefined;
  const service = makeService({ boundPromptId: options.boundPromptId });
  registerPartyRaidChatInput({
    command: vi.fn(),
    on: vi.fn((_filter: string, registered: (ctx: Context, next: NextFunction) => Promise<void>) => {
      handler = registered;
    })
  } as unknown as Bot, service as unknown as PartyRaidChatService);
  if (!handler) {
    throw new Error("Message handler was not registered.");
  }
  return { handler, service };
}

function makeService(options: { dev?: boolean; boundPromptId?: number } = {}) {
  const beginComposeMock = vi.fn().mockResolvedValue({ state: "created", intentId: "intent-2", version: 3 });
  const bindComposePromptMock = vi.fn().mockResolvedValue({ state: "bound" });
  return {
    areDevHelpersEnabled: () => options.dev ?? false,
    cancelCompose: vi.fn().mockResolvedValue(false),
    findBoundIntent: vi.fn((_userId: bigint, _chatId: bigint, promptMessageId: number) =>
      Promise.resolve(promptMessageId === options.boundPromptId
        ? {
            intentId: "intent-1",
            partySessionId: "party-1",
            inviteToken: "raid-token-1",
            characterId: "character-1",
            remortCount: 0,
            version: 2,
            expiresAt: new Date("2026-07-20T12:13:00.000Z")
          }
        : null)
    ),
    submitInput: vi.fn().mockResolvedValue({
      state: "accepted",
      inviteToken: "raid-token-1",
      revision: 1
    }),
    beginCompose: beginComposeMock,
    bindComposePrompt: bindComposePromptMock,
    beginComposeMock,
    bindComposePromptMock,
    devFill: vi.fn(),
    devClear: vi.fn(),
    devExpire: vi.fn()
  };
}

function makeContext(input: {
  text?: string;
  replyMessageId: number;
  command?: boolean;
  attachment?: boolean;
  caption?: string;
  forwarded?: boolean;
  chatId?: number;
}) {
  const chatId = input.chatId ?? 42;
  return {
    from: { id: 42 },
    chat: { id: chatId, type: "private" },
    message: {
      message_id: 93,
      ...(input.text === undefined ? {} : { text: input.text }),
      ...(input.attachment ? { photo: [{ file_id: "photo-1" }] } : {}),
      ...(input.caption === undefined ? {} : { caption: input.caption }),
      ...(input.forwarded ? { forward_origin: { type: "user", sender_user: { id: 91 } } } : {}),
      entities: input.command && input.text
        ? [{ type: "bot_command", offset: 0, length: input.text.length }]
        : undefined,
      reply_to_message: {
        message_id: input.replyMessageId,
        from: { id: 587, is_bot: true }
      }
    },
    api: { editMessageText: vi.fn().mockResolvedValue(true) },
    reply: vi.fn().mockResolvedValue({ message_id: 94 })
  } as unknown as Context & { api: { editMessageText: ReturnType<typeof vi.fn> } };
}
