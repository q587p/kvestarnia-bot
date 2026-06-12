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

  it("builds a short Telegram side menu without aliases or reset commands", () => {
    const commands = getTelegramMenuCommands(false);

    expect(commands.map((entry) => entry.command)).toEqual([
      "start",
      "hero",
      "tavern",
      "adventure",
      "fight",
      "inventory",
      "guild",
      "news",
      "help"
    ]);
    expect(commands.find((entry) => entry.command === "hero")?.description).toBe(
      "👤 герой і прогрес"
    );
    expect(commands.find((entry) => entry.command === "help")?.description).toBe("❔ допомога");
    expect(commands).toHaveLength(9);
    expect(commands.some((entry) => entry.command === "profile")).toBe(false);
    expect(commands.some((entry) => entry.command === "me")).toBe(false);
    expect(commands.some((entry) => entry.command === "raid")).toBe(false);
    expect(commands.some((entry) => entry.command === "quest")).toBe(false);
    expect(commands.some((entry) => entry.command === "hunt")).toBe(false);
    expect(commands.some((entry) => entry.command === "items")).toBe(false);
    expect(commands.some((entry) => entry.command === "bag")).toBe(false);
    expect(commands.some((entry) => entry.command === "restart")).toBe(false);
    expect(commands.some((entry) => entry.command === "version")).toBe(false);
    expect(commands.some((entry) => entry.command === "dev_reset_me")).toBe(false);
  });

  it("keeps the local reset command in help but not in the side menu", () => {
    expect(getHelpCommandEntries(false).some((entry) => entry.command === "dev_reset_me")).toBe(
      false
    );
    expect(getHelpCommandEntries(true).some((entry) => entry.command === "dev_reset_me")).toBe(
      true
    );
    expect(getTelegramMenuCommands(true).some((entry) => entry.command === "dev_reset_me")).toBe(
      false
    );
  });
});
