import type { Context } from "grammy";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sendItemUpgradeList } from "../../src/bot/commands/itemUpgradeCommand";
import type { ItemUpgradeService } from "../../src/services/itemUpgradeService";

describe("item upgrade command", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("ignores unchanged-message errors when editing the Charkokovalnia list", async () => {
    const editMessageText = vi.fn(() =>
      Promise.reject(
        new Error(
          "Call to 'editMessageText' failed! (400: Bad Request: message is not modified)"
        )
      )
    );
    const ctx = {
      editMessageText
    } as unknown as Context;

    await expect(
      sendItemUpgradeList(ctx, {} as ItemUpgradeService, "edit")
    ).resolves.toBeUndefined();
    expect(editMessageText).toHaveBeenCalledTimes(1);
  });

  it("rethrows a list failure after one sanitized terminal timing record", async () => {
    vi.stubEnv("KVESTARNIA_PERF_SAMPLE_RATE", "0");
    vi.stubEnv("KVESTARNIA_PERF_SLOW_MS", "999999");
    const failure = Object.assign(new Error("private item-upgrade database value"), { code: "P2028" });
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const ctx = {
      from: { id: 42, is_bot: false, first_name: "Test" },
      reply: vi.fn()
    } as unknown as Context;
    const itemUpgrades = {
      listForTelegramUser: vi.fn(() => Promise.reject(failure))
    } as unknown as ItemUpgradeService;

    await expect(sendItemUpgradeList(ctx, itemUpgrades)).rejects.toBe(failure);

    const perfCalls = errorLog.mock.calls.filter(([message]) => message === "Kvestarnia failed perf timing");
    expect(perfCalls).toHaveLength(1);
    expect(perfCalls[0]?.[1]).toEqual(expect.objectContaining({
      route: "item-upgrade.list",
      outcome: "error",
      errorCategory: "database",
      errorComponent: "db",
      thresholdMs: 999999
    }));
    const payload = perfCalls[0]?.[1] as Record<string, unknown> | undefined;
    expect(payload?.dbMs).toEqual(expect.any(Number));
    expect(perfCalls[0]?.[1]).not.toHaveProperty("telegramUserId");
    expect(JSON.stringify(perfCalls[0]?.[1])).not.toContain(failure.message);
    expect(JSON.stringify(perfCalls[0]?.[1])).not.toContain("42");
  });
});
