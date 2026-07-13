import type { Bot, Context } from "grammy";
import { describe, expect, it, vi } from "vitest";
import { getTelegramMenuCommands } from "../../src/bot/botCommandCatalog";
import { registerDevHpRecoveryCommand } from "../../src/bot/commands/devHpRecoveryCommand";

describe("dev_hp_recovery_due", () => {
  it("cannot register or mutate when production disables dev helpers", () => {
    const command = vi.fn();
    const prepareDueForTelegramUser = vi.fn();

    registerDevHpRecoveryCommand({ command } as unknown as Bot, {
      areDevHelpersEnabled: () => false,
      prepareDueForTelegramUser
    });

    expect(command).not.toHaveBeenCalled();
    expect(prepareDueForTelegramUser).not.toHaveBeenCalled();
    expect(getTelegramMenuCommands({ includeDevGrant: true }).some(
      (entry) => entry.command === "dev_hp_recovery_due"
    )).toBe(false);
  });

  it("prepares a due state without sending the recovery notice directly", async () => {
    let handler: ((ctx: Context) => Promise<void>) | undefined;
    const command = vi.fn<(
      name: string,
      registered: (ctx: Context) => Promise<void>
    ) => void>((_name, registered) => { handler = registered; });
    const prepareDueForTelegramUser = vi.fn().mockResolvedValue(true);
    const reply = vi.fn().mockResolvedValue(true);

    registerDevHpRecoveryCommand({ command } as unknown as Bot, {
      areDevHelpersEnabled: () => true,
      prepareDueForTelegramUser
    });
    await handler?.({ from: { id: 42 }, reply } as unknown as Context);

    expect(prepareDueForTelegramUser).toHaveBeenCalledWith(42n);
    expect(reply).toHaveBeenCalledTimes(1);
    expect(reply.mock.calls[0]?.[0]).not.toContain("Життя відновилося повністю");
  });
});
