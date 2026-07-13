import type { Bot } from "grammy";
import { describe, expect, it, vi } from "vitest";
import type { BotServices } from "../../src/bot/botServices";
import { registerFightingCornerQuestDevHelper } from "../../src/bot/modules/quest";
import { presentDevHelp } from "../../src/bot/presenters/helpPresenter";

describe("Fighting Corner quest dev helper", () => {
  it("does not register or show the helper when the production-safe service gate is closed", () => {
    const command = vi.fn();
    registerFightingCornerQuestDevHelper({ command } as unknown as Bot, services(false));

    expect(command).not.toHaveBeenCalled();
    expect(presentDevHelp({
      includeDevReset: false,
      includeDevGrant: false,
      includeFightingCornerQuest: false
    })).not.toContain("dev_reset_fighting_corner_quest");
  });

  it("registers and lists the helper only when its non-production gate is open", () => {
    const command = vi.fn();
    registerFightingCornerQuestDevHelper({ command } as unknown as Bot, services(true));

    expect(command).toHaveBeenCalledWith("dev_reset_fighting_corner_quest", expect.any(Function));
    expect(presentDevHelp({
      includeDevReset: false,
      includeDevGrant: false,
      includeFightingCornerQuest: true
    })).toContain("📜 /dev_reset_fighting_corner_quest");
  });
});

function services(enabled: boolean): BotServices {
  return {
    fightingCornerQuest: {
      isDevHelperEnabled: () => enabled
    }
  } as unknown as BotServices;
}
