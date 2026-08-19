import { Bot } from "grammy";
import { describe, expect, it, vi } from "vitest";
import { registerReferralMiddleware } from "../../src/bot/middleware/registerReferralMiddleware";
import { registerPresenceMiddleware } from "../../src/bot/middleware/registerPresenceMiddleware";
import type { ReferralService } from "../../src/services/referralService";
import type { PresenceService } from "../../src/services/presenceService";

describe("referral capture middleware", () => {
  it("fails a valid unresolved capture closed before presence and start routing", async () => {
    const captureFromStart = vi.fn().mockResolvedValue({ state: "retry" });
    const markAction = vi.fn();
    const start = vi.fn();
    const calls = apiCalls();
    const bot = testBot(calls.middleware);
    registerReferralMiddleware(bot, referralService({ captureFromStart }));
    registerPresenceMiddleware(bot, { markAction } as unknown as PresenceService);
    bot.command("start", start);

    await bot.handleUpdate(startUpdate("ref1_abCD_123-xyZ7890"));

    expect(captureFromStart).toHaveBeenCalledOnce();
    expect(markAction).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
    expect(calls.sends).toEqual([expect.stringContaining("Спробуй відкрити те саме посилання ще раз")]);
  });

  it.each([
    ["disabled", "ref1_abCD_123-xyZ7890"],
    ["malformed", "ref1_bad"]
  ])("continues ordinary presence and start routing for %s referral input", async (kind, payload) => {
    const captureFromStart = vi.fn().mockResolvedValue({ state: "disabled" });
    const markAction = vi.fn().mockResolvedValue(undefined);
    const start = vi.fn();
    const calls = apiCalls();
    const bot = testBot(calls.middleware);
    registerReferralMiddleware(bot, referralService({ captureFromStart }));
    registerPresenceMiddleware(bot, { markAction } as unknown as PresenceService);
    bot.command("start", start);

    await bot.handleUpdate(startUpdate(payload));

    expect(markAction).toHaveBeenCalledOnce();
    expect(start).toHaveBeenCalledOnce();
    expect(captureFromStart).toHaveBeenCalledTimes(kind === "disabled" ? 1 : 0);
  });
});

function referralService(overrides: { captureFromStart: ReturnType<typeof vi.fn> }): ReferralService {
  return {
    ...overrides,
    arePayoutsEnabled: () => false
  } as unknown as ReferralService;
}

function testBot(middleware: Parameters<Bot["api"]["config"]["use"]>[0]): Bot {
  const bot = new Bot("test-token", {
    botInfo: { id: 123, is_bot: true, first_name: "Квестарня", username: "kvestarnia_bot" }
  });
  bot.api.config.use(middleware);
  return bot;
}

function apiCalls() {
  const sends: string[] = [];
  return {
    sends,
    middleware: ((_prev, method, payload) => {
      if (method === "sendMessage") {
        sends.push(String(payload.text));
        return Promise.resolve({
          ok: true,
          result: { message_id: 93, date: 0, chat: { id: Number(payload.chat_id), type: "private" } }
        });
      }
      return Promise.resolve({ ok: true, result: true });
    }) as Parameters<Bot["api"]["config"]["use"]>[0]
  };
}

function startUpdate(payload: string) {
  const text = `/start ${payload}`;
  return {
    update_id: 587,
    message: {
      message_id: 587,
      date: 1,
      chat: { id: 64_002, type: "private" as const },
      from: { id: 64_002, is_bot: false, first_name: "Нова" },
      text,
      entities: [{ type: "bot_command" as const, offset: 0, length: 6 }]
    }
  };
}
