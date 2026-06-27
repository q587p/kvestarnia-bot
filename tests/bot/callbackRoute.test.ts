import type { Bot, Context } from "grammy";
import { describe, expect, it, vi } from "vitest";
import { registerParsedCallbackRoute } from "../../src/bot/callbackRoute";
import { presentInvalidCallback } from "../../src/bot/presenters/onboardingPresenter";

describe("registerParsedCallbackRoute", () => {
  it("answers invalid callbacks with the shared invalid alert and stops", async () => {
    const { bot, run } = createRouteHarness();
    const handle = vi.fn();

    registerParsedCallbackRoute(
      bot,
      /^v1:test:/,
      () => ({ ok: false }),
      handle
    );

    const { ctx, answerCallbackQuery } = createCallbackContext("v1:test:bad");
    await run(ctx);

    expect(answerCallbackQuery).toHaveBeenCalledWith({
      text: presentInvalidCallback(),
      show_alert: true
    });
    expect(handle).not.toHaveBeenCalled();
  });

  it("passes parsed valid callbacks to the route handler", async () => {
    const { bot, run } = createRouteHarness();
    const handle = vi.fn().mockResolvedValue(undefined);

    registerParsedCallbackRoute(
      bot,
      /^v1:test:/,
      () => ({ ok: true, value: { token: "abc123" } }),
      handle
    );

    const { ctx, answerCallbackQuery } = createCallbackContext("v1:test:ok");
    await run(ctx);

    expect(answerCallbackQuery).not.toHaveBeenCalled();
    expect(handle).toHaveBeenCalledWith(ctx, { token: "abc123" });
  });
});

function createRouteHarness(): {
  bot: Bot;
  run: (ctx: Context) => Promise<void>;
} {
  let handler: ((ctx: Context) => Promise<void>) | null = null;
  const bot = {
    callbackQuery: vi.fn((_trigger: RegExp, next: (ctx: Context) => Promise<void>) => {
      handler = next;
    })
  } as unknown as Bot;

  return {
    bot,
    run: async (ctx) => {
      if (!handler) {
        throw new Error("callback route was not registered");
      }

      await handler(ctx);
    }
  };
}

function createCallbackContext(data: string): {
  ctx: Context;
  answerCallbackQuery: ReturnType<typeof vi.fn>;
} {
  const answerCallbackQuery = vi.fn().mockResolvedValue(true);
  const ctx = {
    callbackQuery: {
      id: "callback-id",
      data
    },
    answerCallbackQuery
  } as unknown as Context;

  return { ctx, answerCallbackQuery };
}
