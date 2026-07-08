import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getYegerFieldKitHelpStateForTelegramUser,
  shouldShowYegerFieldKitHelp
} from "../../src/bot/commands/yegerFieldKitHelp";
import type { BotServices } from "../../src/bot/botServices";

describe("Yeger field-kit help", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hides the optional help button when the unlock lookup times out", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const previewForTelegramUser = vi.fn();
    const services = {
      itemUpgrades: {
        getUnlockQuestForTelegramUser: vi.fn().mockRejectedValue(new Error("P1008"))
      },
      itemCraft: {
        previewForTelegramUser
      }
    } as unknown as Pick<BotServices, "itemCraft" | "itemUpgrades">;

    await expect(getYegerFieldKitHelpStateForTelegramUser(42n, services)).resolves.toEqual({
      state: "hidden"
    });
    await expect(shouldShowYegerFieldKitHelp(42n, services)).resolves.toBe(false);
    expect(previewForTelegramUser).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("yeger field-kit help"), expect.any(Error));
  });

  it("shows craft guidance when the Charkokovalnia quest needs a kit and kit crafting is available", async () => {
    const services = {
      itemUpgrades: {
        getUnlockQuestForTelegramUser: vi.fn().mockResolvedValue({
          state: "unlock-required",
          character: { level: 13 },
          fieldKitQuantity: 0,
          rewardXp: 42
        })
      },
      itemCraft: {
        previewForTelegramUser: vi.fn().mockResolvedValue({ state: "not-enough" })
      }
    } as unknown as Pick<BotServices, "itemCraft" | "itemUpgrades">;

    await expect(getYegerFieldKitHelpStateForTelegramUser(42n, services)).resolves.toEqual({
      state: "can-craft-kit"
    });
    await expect(shouldShowYegerFieldKitHelp(42n, services)).resolves.toBe(true);
  });
});
