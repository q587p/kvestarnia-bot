import { describe, expect, it } from "vitest";
import {
  botCommandCatalog,
  getHelpCommandEntries,
  getTelegramMenuCommands
} from "../../src/bot/botCommandCatalog";

describe("bot command catalog", () => {
  it("uses a unique icon for player-facing commands", () => {
    const icons = botCommandCatalog
      .filter((entry) => !entry.devOnly)
      .map((entry) => entry.icon);

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
      "help",
      "support"
    ]);
    expect(commands.find((entry) => entry.command === "hero")?.description).toBe(
      "👤 персонаж і прогрес"
    );
    expect(commands.find((entry) => entry.command === "help")?.description).toBe("📖 допомога");
    expect(commands.find((entry) => entry.command === "support")?.description).toBe(
      "🫙 добровільна підтримка без бонусів"
    );
    expect(commands).toHaveLength(7);
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
    expect(commands.some((entry) => entry.command === "games")).toBe(false);
    expect(commands.some((entry) => entry.command === "look")).toBe(false);
    expect(commands.some((entry) => entry.command === "guild")).toBe(false);
    expect(commands.some((entry) => entry.command === "restart")).toBe(false);
    expect(commands.some((entry) => entry.command === "version")).toBe(false);
    expect(commands.some((entry) => entry.command === "lore")).toBe(false);
    expect(commands.some((entry) => entry.command === "chronicles")).toBe(false);
    expect(commands.some((entry) => entry.command === "dev_help")).toBe(false);
    expect(commands.some((entry) => entry.command === "dev_party")).toBe(false);
    expect(commands.some((entry) => entry.command === "dev_reset_me")).toBe(false);
    expect(commands.some((entry) => entry.command === "dev_adventure_reset")).toBe(false);
    expect(commands.some((entry) => entry.command === "dev_reset_korchma_round")).toBe(false);
    expect(commands.some((entry) => entry.command === "dev_raid_stop")).toBe(false);
    expect(commands.some((entry) => entry.command === "dev_raid_reset")).toBe(false);
    expect(commands.some((entry) => entry.command === "dev_raid_win")).toBe(false);
    expect(commands.some((entry) => entry.command === "dev_reset_monster_rest")).toBe(false);
    expect(commands.some((entry) => entry.command === "dev_add_level")).toBe(false);
    expect(commands.some((entry) => entry.command === "dev_add_xp")).toBe(false);
    expect(commands.some((entry) => entry.command === "dev_add_gold")).toBe(false);
    expect(commands.some((entry) => entry.command === "dev_heal")).toBe(false);
    expect(commands.some((entry) => entry.command === "dev_restore_mana")).toBe(false);
    expect(commands.some((entry) => entry.command === "dev_add_random_item")).toBe(false);
    expect(commands.some((entry) => entry.command === "dev_add_item")).toBe(false);
    expect(commands.some((entry) => entry.command === "dev_add_bandage")).toBe(false);
    expect(commands.some((entry) => entry.command === "dev_add_dense_bandage")).toBe(false);
    expect(commands.some((entry) => entry.command === "dev_add_field_kit")).toBe(false);
    expect(commands.some((entry) => entry.command === "dev_add_yeger_line")).toBe(false);
    expect(commands.some((entry) => entry.command === "dev_reset_yeger_bandage")).toBe(false);
    expect(commands.some((entry) => entry.command === "dev_reset_yeger_bandage_day")).toBe(false);
    expect(commands.some((entry) => entry.command === "dev_reset_yeger_trail")).toBe(false);
    expect(commands.some((entry) => entry.command === "dev_reset_priest_blessing")).toBe(false);
    expect(commands.some((entry) => entry.command === "dev_reset_quiet_pocket")).toBe(false);
    expect(commands.some((entry) => entry.command === "dev_reset_rogue")).toBe(false);
    expect(commands.some((entry) => entry.command === "dev_yeger_first_done")).toBe(false);
    expect(commands.some((entry) => entry.command === "dev_yeger_second_done")).toBe(false);
    expect(commands.some((entry) => entry.command === "dev_reset_bard_performance")).toBe(false);
    expect(commands.some((entry) => entry.command === "dev_reset_tavern_games")).toBe(false);
  });

  it("lists /lore and /chronicles in help without adding them to the side menu", () => {
    expect(getHelpCommandEntries(false).find((entry) => entry.command === "lore"))
      .toMatchObject({
        icon: "🗂️",
        description: "Перекази Квестарні",
        includeInMenu: false
      });
    expect(getHelpCommandEntries(false).find((entry) => entry.command === "chronicles"))
      .toMatchObject({
        icon: "📣",
        description: "останні події",
        includeInMenu: false
      });
    expect(getTelegramMenuCommands(false).some((entry) => entry.command === "lore")).toBe(
      false
    );
    expect(getTelegramMenuCommands(false).some((entry) => entry.command === "chronicles")).toBe(
      false
    );
  });

  it("shows tavern games commands only when their player surface is enabled", () => {
    const hidden = getHelpCommandEntries({ includeDevReset: false, includeTavernGames: false });
    const visible = getHelpCommandEntries({ includeDevReset: false, includeTavernGames: true });
    const menu = getTelegramMenuCommands({ includeDevReset: false, includeTavernGames: true });

    expect(hidden.some((entry) => entry.command === "games")).toBe(false);
    expect(visible.find((entry) => entry.command === "games")).toMatchObject({
      icon: "♟️",
      description: "ігри за столом"
    });
    expect(menu.map((entry) => entry.command)).toContain("games");
  });

  it("keeps local dev commands available for dev help but not in the side menu", () => {
    for (const command of [
      "dev_help",
      "dev_party",
      "dev_reset_me",
      "dev_adventure_reset",
      "dev_reset_korchma_round",
      "dev_raid_stop",
      "dev_raid_reset",
      "dev_raid_win",
      "dev_reset_monster_rest"
    ]) {
      expect(getHelpCommandEntries(false).some((entry) => entry.command === command)).toBe(false);
      expect(getHelpCommandEntries(true).some((entry) => entry.command === command)).toBe(true);
      expect(getTelegramMenuCommands(true).some((entry) => entry.command === command)).toBe(false);
    }

    const resetOnly = getHelpCommandEntries({ includeDevReset: true, includeDevGrant: false });
    const grantsOnly = getHelpCommandEntries({ includeDevReset: false, includeDevGrant: true });
    const partyOnly = getHelpCommandEntries({
      includeDevReset: false,
      includeDevGrant: false,
      includePartySessions: true
    });

    expect(resetOnly.some((entry) => entry.command === "dev_help")).toBe(true);
    expect(resetOnly.some((entry) => entry.command === "dev_party")).toBe(false);
    expect(resetOnly.some((entry) => entry.command === "dev_reset_me")).toBe(true);
    expect(resetOnly.some((entry) => entry.command === "dev_adventure_reset")).toBe(true);
    expect(resetOnly.some((entry) => entry.command === "dev_reset_korchma_round")).toBe(true);
    expect(resetOnly.some((entry) => entry.command === "dev_raid_stop")).toBe(true);
    expect(resetOnly.some((entry) => entry.command === "dev_raid_reset")).toBe(true);
    expect(resetOnly.some((entry) => entry.command === "dev_raid_win")).toBe(true);
    expect(resetOnly.some((entry) => entry.command === "dev_reset_monster_rest")).toBe(true);
    expect(resetOnly.some((entry) => entry.command === "dev_add_level")).toBe(false);
    expect(grantsOnly.some((entry) => entry.command === "dev_help")).toBe(false);
    expect(grantsOnly.some((entry) => entry.command === "dev_party")).toBe(false);
    expect(grantsOnly.some((entry) => entry.command === "dev_reset_me")).toBe(false);
    expect(grantsOnly.some((entry) => entry.command === "dev_adventure_reset")).toBe(false);
    expect(grantsOnly.some((entry) => entry.command === "dev_reset_korchma_round")).toBe(false);
    expect(grantsOnly.some((entry) => entry.command === "dev_raid_stop")).toBe(false);
    expect(grantsOnly.some((entry) => entry.command === "dev_raid_reset")).toBe(false);
    expect(grantsOnly.some((entry) => entry.command === "dev_raid_win")).toBe(false);
    expect(grantsOnly.some((entry) => entry.command === "dev_reset_monster_rest")).toBe(false);
    expect(grantsOnly.some((entry) => entry.command === "dev_add_level")).toBe(true);
    expect(partyOnly.some((entry) => entry.command === "dev_party")).toBe(true);
    expect(getTelegramMenuCommands({
      includeDevReset: true,
      includeDevGrant: true,
      includePartySessions: true
    }).some((entry) => entry.command === "dev_party")).toBe(false);

    for (const command of [
      "dev_add_level",
      "dev_add_xp",
      "dev_add_gold",
      "dev_heal",
      "dev_restore_mana",
      "dev_add_random_item",
      "dev_add_item",
      "dev_add_bandage",
      "dev_add_dense_bandage",
      "dev_add_field_kit",
      "dev_add_yeger_line",
      "dev_reset_yeger_bandage",
      "dev_reset_yeger_bandage_day",
      "dev_reset_yeger_trail",
      "dev_reset_priest_blessing",
      "dev_reset_quiet_pocket",
      "dev_reset_rogue",
      "dev_yeger_first_done",
      "dev_yeger_second_done",
      "dev_reset_bard_performance",
      "dev_reset_tavern_games"
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
