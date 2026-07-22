import type { Bot } from "grammy";
import { describe, expect, it, vi } from "vitest";
import { createGroupCombatTimeoutScheduler } from "../../src/bot/groupCombatTimeoutScheduler";
import type { GroupCombatService } from "../../src/services/groupCombatService";

describe("group combat timeout scheduler", () => {
  it("does no scans or delivery while the proof gate is disabled", async () => {
    const repair = vi.fn();
    const resolveDue = vi.fn();
    const scheduler = createGroupCombatTimeoutScheduler({
      isEnabled: () => false,
      repair,
      resolveDue
    } as unknown as GroupCombatService, { api: {} } as Bot);

    await expect(scheduler.tick()).resolves.toBe(0);
    expect(repair).not.toHaveBeenCalled();
    expect(resolveDue).not.toHaveBeenCalled();
  });

  it("runs bounded repair before the lean due-session pass", async () => {
    const order: string[] = [];
    const repair = vi.fn(() => {
      order.push("repair");
      return Promise.resolve(2);
    });
    const resolveDue = vi.fn(() => {
      order.push("due");
      return Promise.resolve([]);
    });
    const scheduler = createGroupCombatTimeoutScheduler({
      isEnabled: () => true,
      repair,
      resolveDue
    } as unknown as GroupCombatService, { api: {} } as Bot);

    await expect(scheduler.tick()).resolves.toBe(2);
    expect(order).toEqual(["repair", "due"]);
    expect(repair).toHaveBeenCalledWith(13);
    expect(resolveDue).toHaveBeenCalledWith(13);
  });

  it("waits for an in-flight pass during shutdown", async () => {
    let releaseRepair: (() => void) | undefined;
    const repair = vi.fn(() => new Promise<number>((resolve) => {
      releaseRepair = () => resolve(1);
    }));
    const resolveDue = vi.fn().mockResolvedValue([]);
    const scheduler = createGroupCombatTimeoutScheduler({
      isEnabled: () => true,
      repair,
      resolveDue
    } as unknown as GroupCombatService, { api: {} } as Bot);

    const tick = scheduler.tick();
    await Promise.resolve();
    let stopped = false;
    const stop = scheduler.stop().then(() => {
      stopped = true;
    });
    await Promise.resolve();

    expect(stopped).toBe(false);
    releaseRepair?.();
    await expect(tick).resolves.toBe(1);
    await expect(stop).resolves.toBeUndefined();
    expect(stopped).toBe(true);
  });
});
