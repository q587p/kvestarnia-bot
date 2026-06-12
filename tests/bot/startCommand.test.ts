import { describe, expect, it } from "vitest";
import { buildExistingCharacterReplyOptions } from "../../src/bot/commands/startCommand";

describe("start command", () => {
  it("uses Telegram HTML parse mode for existing hero summary", () => {
    const options = buildExistingCharacterReplyOptions();

    expect(options.parse_mode).toBe("HTML");
    expect(options.reply_markup).toBeDefined();
  });
});
