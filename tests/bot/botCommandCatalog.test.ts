import { describe, expect, it } from "vitest";
import {
  botCommandCatalog,
  getHelpCommandEntries,
  getTelegramMenuCommands
} from "../../src/bot/botCommandCatalog";

describe("bot command catalog", () => {
  it("uses a unique icon for every command", () => {
    const icons = botCommandCatalog.map((entry) => entry.icon);

    expect(new Set(icons).size).toBe(icons.length);
  });

  it("builds a broad Telegram side menu without dev commands by default", () => {
    const commands = getTelegramMenuCommands(false);

    expect(commands.map((entry) => entry.command)).toEqual([
      "start",
      "hero",
      "profile",
      "me",
      "tavern",
      "raid",
      "adventure",
      "quest",
      "fight",
      "hunt",
      "inventory",
      "items",
      "bag",
      "guild",
      "restart",
      "version",
      "news",
      "help"
    ]);
    expect(commands.find((entry) => entry.command === "hero")?.description).toBe(
      "👤 герой і прогрес"
    );
    expect(commands.find((entry) => entry.command === "help")?.description).toBe("❔ допомога");
    expect(commands.some((entry) => entry.command === "dev_reset_me")).toBe(false);
  });

  it("includes the local reset command only when requested", () => {
    expect(getHelpCommandEntries(false).some((entry) => entry.command === "dev_reset_me")).toBe(
      false
    );
    expect(getTelegramMenuCommands(true).some((entry) => entry.command === "dev_reset_me")).toBe(
      true
    );
  });
});
