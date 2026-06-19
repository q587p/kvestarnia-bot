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
      "quest",
      "inventory",
      "news",
      "help"
    ]);
    expect(commands.find((entry) => entry.command === "hero")?.description).toBe(
      "👤 персонаж і прогрес"
    );
    expect(commands.find((entry) => entry.command === "help")?.description).toBe("📖 допомога");
    expect(commands).toHaveLength(6);
    expect(commands.some((entry) => entry.command === "profile")).toBe(false);
    expect(commands.some((entry) => entry.command === "me")).toBe(false);
    expect(commands.some((entry) => entry.command === "tavern")).toBe(false);
    expect(commands.some((entry) => entry.command === "raid")).toBe(false);
    expect(commands.some((entry) => entry.command === "adventure")).toBe(false);
    expect(commands.some((entry) => entry.command === "fight")).toBe(false);
    expect(commands.some((entry) => entry.command === "spar")).toBe(false);
    expect(commands.some((entry) => entry.command === "hunt")).toBe(false);
    expect(commands.some((entry) => entry.command === "bestiary")).toBe(false);
    expect(commands.some((entry) => entry.command === "monsters")).toBe(false);
    expect(commands.some((entry) => entry.command === "cellar")).toBe(false);
    expect(commands.some((entry) => entry.command === "items")).toBe(false);
    expect(commands.some((entry) => entry.command === "bag")).toBe(false);
    expect(commands.some((entry) => entry.command === "equipment")).toBe(false);
    expect(commands.some((entry) => entry.command === "gear")).toBe(false);
    expect(commands.some((entry) => entry.command === "equip")).toBe(false);
    expect(commands.some((entry) => entry.command === "online")).toBe(false);
    expect(commands.some((entry) => entry.command === "look")).toBe(false);
    expect(commands.some((entry) => entry.command === "guild")).toBe(false);
    expect(commands.some((entry) => entry.command === "restart")).toBe(false);
    expect(commands.some((entry) => entry.command === "version")).toBe(false);
    expect(commands.some((entry) => entry.command === "support")).toBe(false);
    expect(commands.some((entry) => entry.command === "dev_reset_me")).toBe(false);
    expect(commands.some((entry) => entry.command === "dev_adventure_reset")).toBe(false);
    expect(commands.some((entry) => entry.command === "dev_raid_stop")).toBe(false);
    expect(commands.some((entry) => entry.command === "dev_add_level")).toBe(false);
    expect(commands.some((entry) => entry.command === "dev_add_xp")).toBe(false);
    expect(commands.some((entry) => entry.command === "dev_add_gold")).toBe(false);
    expect(commands.some((entry) => entry.command === "dev_heal")).toBe(false);
    expect(commands.some((entry) => entry.command === "dev_restore_mana")).toBe(false);
    expect(commands.some((entry) => entry.command === "dev_add_random_item")).toBe(false);
  });

  it("keeps local dev commands in help but not in the side menu", () => {
    for (const command of ["dev_reset_me", "dev_adventure_reset", "dev_raid_stop"]) {
      expect(getHelpCommandEntries(false).some((entry) => entry.command === command)).toBe(false);
      expect(getHelpCommandEntries(true).some((entry) => entry.command === command)).toBe(true);
      expect(getTelegramMenuCommands(true).some((entry) => entry.command === command)).toBe(false);
    }

    const resetOnly = getHelpCommandEntries({ includeDevReset: true, includeDevGrant: false });
    const grantsOnly = getHelpCommandEntries({ includeDevReset: false, includeDevGrant: true });

    expect(resetOnly.some((entry) => entry.command === "dev_reset_me")).toBe(true);
    expect(resetOnly.some((entry) => entry.command === "dev_adventure_reset")).toBe(true);
    expect(resetOnly.some((entry) => entry.command === "dev_raid_stop")).toBe(true);
    expect(resetOnly.some((entry) => entry.command === "dev_add_level")).toBe(false);
    expect(grantsOnly.some((entry) => entry.command === "dev_reset_me")).toBe(false);
    expect(grantsOnly.some((entry) => entry.command === "dev_adventure_reset")).toBe(false);
    expect(grantsOnly.some((entry) => entry.command === "dev_raid_stop")).toBe(false);
    expect(grantsOnly.some((entry) => entry.command === "dev_add_level")).toBe(true);

    for (const command of [
      "dev_add_level",
      "dev_add_xp",
      "dev_add_gold",
      "dev_heal",
      "dev_restore_mana",
      "dev_add_random_item"
    ]) {
      expect(
        getHelpCommandEntries({ includeDevReset: true, includeDevGrant: false })
          .some((entry) => entry.command === command)
      ).toBe(false);
      expect(
        getHelpCommandEntries({ includeDevReset: true, includeDevGrant: true })
          .some((entry) => entry.command === command)
      ).toBe(true);
      expect(
        getTelegramMenuCommands({ includeDevReset: true, includeDevGrant: true })
          .some((entry) => entry.command === command)
      ).toBe(false);
    }
  });
});
