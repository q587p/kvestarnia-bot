import {
  getHelpCommandEntries,
  type BotCommandCatalogEntry,
  type DevCommandVisibility
} from "./botCommandCatalog";
import type { DevHelpPage } from "./callbacks/devHelpCallbackData";

export interface DevHelpSection {
  page: Exclude<DevHelpPage, "menu">;
  title: string;
  summary: string;
  commands: BotCommandCatalogEntry[];
}

export function getDevHelpSections(
  visibility: boolean | DevCommandVisibility
): DevHelpSection[] {
  const commands = getHelpCommandEntries(visibility).filter((entry) => entry.devOnly);
  const sections: DevHelpSection[] = [
    {
      page: "general",
      title: "🧰 Загальне",
      summary: "персонаж і довідка",
      commands: commands.filter((entry) => ["dev_help", "dev_reset_me"].includes(entry.command))
    },
    {
      page: "combat",
      title: "⚔️ Бої й ватага",
      summary: "сутички, рейди й гурт",
      commands: commands.filter((entry) =>
        entry.devOnly === "party"
        || entry.devOnly === "group-combat"
        || entry.devOnly === "raid-chat"
        || entry.devOnly === "hp-recovery"
        || [
          "dev_raid_stop",
          "dev_raid_reset",
          "dev_raid_win",
          "dev_reset_monster_rest",
          "dev_two_enemies",
          "dev_reset_doppelganger"
        ].includes(entry.command)
      )
    },
    {
      page: "resources",
      title: "🎒 Ресурси й манатки",
      summary: "рівні, HP, мана й речі",
      commands: commands.filter((entry) =>
        entry.command.startsWith("dev_add_")
        || ["dev_heal", "dev_restore_mana", "dev_finish_attunements", "dev_guild_gold"].includes(entry.command)
      )
    }
  ];
  const assigned = new Set(sections.flatMap((section) => section.commands.map((entry) => entry.command)));
  sections.push({
    page: "quests",
    title: "🗺️ Справи й очікування",
    summary: "квести, кулдауни й повтори",
    commands: commands.filter((entry) => !assigned.has(entry.command))
  });

  return sections.filter((section) => section.commands.length > 0);
}
