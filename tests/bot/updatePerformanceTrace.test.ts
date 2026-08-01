import { Bot, type Context } from "grammy";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  beginUpdateComponent,
  installUpdatePerformanceTracing,
  invalidateUpdateReads,
  memoizeUpdateRead,
  registerUpdateRouteBoundary
} from "../../src/bot/updatePerformanceTrace";

describe("update performance tracing", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("includes pre-route middleware and records first ack/presentation once without raw callback data", async () => {
    vi.stubEnv("KVESTARNIA_PERF_SAMPLE_RATE", "1");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const loader = vi.fn(() => Promise.resolve("pending"));
    const bot = new Bot("123456:test-token");
    installApiStub(bot);
    installUpdatePerformanceTracing(bot);
    bot.use(async (_ctx, next) => {
      await Promise.all([
        memoizeUpdateRead("pending-friday:42", loader, "pendingRaid"),
        memoizeUpdateRead("pending-friday:42", loader, "pendingRaid")
      ]);
      const combat = beginUpdateComponent("combatLock");
      combat.end();
      await next();
    });
    registerUpdateRouteBoundary(bot);
    bot.callbackQuery(/^v1:sh:gpr:/, async (ctx) => {
      await ctx.answerCallbackQuery();
      await ctx.answerCallbackQuery();
      await ctx.editMessageText("правила");
      await ctx.editMessageText("правила ще раз");
    });
    await bot.init();

    await bot.handleUpdate(callbackUpdate("v1:sh:gpr:secret-token-42587"));

    expect(loader).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0]?.[0]).toBe("Kvestarnia sampled perf timing");
    const unknownPayload: unknown = info.mock.calls[0]?.[1];
    expect(unknownPayload).toEqual(expect.objectContaining({
      route: "callback.shynok.dice-rules",
      outcome: "success",
      presenceMs: 0,
      firstPresentationMethod: "edit"
    }));
    if (!unknownPayload || typeof unknownPayload !== "object") {
      throw new Error("Expected a performance timing payload.");
    }
    const payload = unknownPayload as Record<string, unknown>;
    for (const key of [
      "preRouteMs",
      "pendingRaidMs",
      "combatLockMs",
      "ackMs",
      "firstPresentationMs",
      "interactiveMs",
      "postPresentationMs",
      "totalMs"
    ]) {
      expect(typeof payload[key]).toBe("number");
    }
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("secret-token");
    expect(serialized).not.toContain("42587");
    for (const value of Object.values(payload)) {
      if (typeof value === "number") {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
      }
    }
    expect(payload.interactiveMs).toBe(payload.firstPresentationMs);
    expect(
      Number(payload.interactiveMs) + Number(payload.postPresentationMs)
    ).toBeCloseTo(Number(payload.totalMs), 0);
  });

  it("emits one sanitized terminal record and classifies a pre-route failure as middleware", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const bot = new Bot("123456:test-token");
    installApiStub(bot);
    installUpdatePerformanceTracing(bot);
    bot.use(() => Promise.reject(new Error("private SQL https://secret.invalid token=42587")));
    registerUpdateRouteBoundary(bot);
    await bot.init();

    await expect(bot.handleUpdate(callbackUpdate("raw-private-callback-42587"))).rejects.toThrow();

    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalledWith(
      "Kvestarnia failed perf timing",
      expect.objectContaining({
        route: "callback.unknown",
        outcome: "error",
        errorCategory: "unknown",
        errorComponent: "middleware"
      })
    );
    const serialized = JSON.stringify(logged.mock.calls[0]?.[1]);
    expect(serialized).not.toContain("private SQL");
    expect(serialized).not.toContain("secret.invalid");
    expect(serialized).not.toContain("42587");
    expect(serialized).not.toContain("raw-private-callback");
  });

  it.each([
    "v1:gc:v:proof-token-13",
    "v2:gc:a:proof-token-13:1:a:0:0",
    "v3:gc:a:proof-token-13:1:a:0:0"
  ])("classifies retained and current GroupCombat callbacks without exposing data: %s", async (data) => {
    vi.stubEnv("KVESTARNIA_PERF_SAMPLE_RATE", "1");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const bot = new Bot("123456:test-token");
    installApiStub(bot);
    installUpdatePerformanceTracing(bot);
    registerUpdateRouteBoundary(bot);
    bot.callbackQuery(/^v[123]:gc:/, async (ctx) => {
      await ctx.answerCallbackQuery();
      await ctx.editMessageText("ватага");
    });
    await bot.init();

    await bot.handleUpdate(callbackUpdate(data));

    expect(info).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith(
      "Kvestarnia sampled perf timing",
      expect.objectContaining({
        route: "callback.group-combat",
        outcome: "success",
        resultState: "handled"
      })
    );
    expect(JSON.stringify(info.mock.calls[0]?.[1])).not.toContain(data);
  });

  it("keeps memoized reads update-local and supports explicit post-mutation invalidation", async () => {
    const loader = vi.fn(() => Promise.resolve(loader.mock.calls.length));
    const results: number[] = [];
    const bot = new Bot("123456:test-token");
    installApiStub(bot);
    installUpdatePerformanceTracing(bot);
    bot.on("message", async () => {
      results.push(await memoizeUpdateRead("mutable", loader));
      results.push(await memoizeUpdateRead("mutable", loader));
      invalidateUpdateReads("mutable");
      results.push(await memoizeUpdateRead("mutable", loader));
    });
    await bot.init();

    await bot.handleUpdate(messageUpdate(1));
    await bot.handleUpdate(messageUpdate(2));

    expect(loader).toHaveBeenCalledTimes(4);
    expect(results).toEqual([1, 1, 2, 3, 3, 4]);
  });
});

function installApiStub(bot: Bot): void {
  bot.api.config.use((_prev, method) => {
    if (method === "getMe") {
      return Promise.resolve({
        ok: true,
        result: {
          id: 123456,
          is_bot: true,
          first_name: "Квестарня",
          username: "kvestarnia_bot"
        }
      });
    }
    return Promise.resolve({ ok: true, result: true });
  });
}

function callbackUpdate(data: string): Parameters<Bot<Context>["handleUpdate"]>[0] {
  return {
    update_id: 1,
    callback_query: {
      id: "callback-private-id",
      from: { id: 42, is_bot: false, first_name: "Тест" },
      chat_instance: "private-chat-instance",
      data,
      message: {
        message_id: 13,
        date: 0,
        chat: { id: 42, type: "private", first_name: "Тест" },
        text: "старе"
      }
    }
  };
}

function messageUpdate(updateId: number): Parameters<Bot<Context>["handleUpdate"]>[0] {
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: 0,
      chat: { id: 42, type: "private", first_name: "Тест" },
      from: { id: 42, is_bot: false, first_name: "Тест" },
      text: "привіт"
    }
  };
}
