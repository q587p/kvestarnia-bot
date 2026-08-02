import { describe, expect, it, vi } from "vitest";
import type { Bot } from "grammy";
import { registerPlannedCommands } from "../../src/bot/commands/plannedCommand";

describe("planned command registration", () => {
  it("does not shadow the real guild command when the foundation is enabled", () => {
    const command = vi.fn();
    const bot = { command } as unknown as Bot;

    registerPlannedCommands(bot, { guildEnabled: true });

    expect(command).not.toHaveBeenCalledWith("guild", expect.any(Function));
  });

  it("retains the guild placeholder while the rollout is disabled", () => {
    const command = vi.fn();
    const bot = { command } as unknown as Bot;

    registerPlannedCommands(bot);

    expect(command).toHaveBeenCalledWith("guild", expect.any(Function));
  });
});
