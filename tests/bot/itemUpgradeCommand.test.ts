import type { Context } from "grammy";
import { describe, expect, it, vi } from "vitest";
import { sendItemUpgradeList } from "../../src/bot/commands/itemUpgradeCommand";
import type { ItemUpgradeService } from "../../src/services/itemUpgradeService";

describe("item upgrade command", () => {
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
});
