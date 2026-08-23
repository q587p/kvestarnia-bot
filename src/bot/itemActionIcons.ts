export const PLAYER_FACING_EXCLUSIVE_ACTION_ICONS = {
  "friendly-chest": {
    icon: "♻️",
    symbol: "FRIENDLY_CHEST_ICON",
    allowedBotFiles: [
      "src/bot/keyboards/inventoryKeyboard.ts",
      "src/bot/keyboards/mantokChestKeyboard.ts",
      "src/bot/presenters/mantokChestPresenter.ts"
    ]
  },
  "item-dismantle": {
    icon: "🔩",
    symbol: "ITEM_DISMANTLE_ICON",
    allowedBotFiles: [
      "src/bot/keyboards/itemUpgradeKeyboard.ts",
      "src/bot/presenters/itemUpgradePresenter.ts"
    ]
  },
  "superseded-group-combat-card": {
    icon: "🗃️",
    symbol: "SUPERSEDED_GROUP_COMBAT_CARD_ICON",
    allowedBotFiles: ["src/bot/groupCombatCardDelivery.ts"]
  },
  "guild-weekly-goal": {
    icon: "🎚️",
    symbol: "GUILD_WEEKLY_GOAL_ICON",
    allowedBotFiles: [
      "src/bot/keyboards/guildKeyboard.ts",
      "src/bot/presenters/guildPresenter.ts",
      "src/bot/presenters/latestEventsPresenter.ts",
      "src/bot/botCommandCatalog.ts"
    ]
  }
} as const;

export const PLAYER_FACING_ADMIN_ICON_EXCEPTIONS: ReadonlyArray<{
  icon: string;
  file: string;
  reason: string;
}> = [];

export const FRIENDLY_CHEST_ICON = PLAYER_FACING_EXCLUSIVE_ACTION_ICONS["friendly-chest"].icon;
export const ITEM_DISMANTLE_ICON = PLAYER_FACING_EXCLUSIVE_ACTION_ICONS["item-dismantle"].icon;
export const SUPERSEDED_GROUP_COMBAT_CARD_ICON =
  PLAYER_FACING_EXCLUSIVE_ACTION_ICONS["superseded-group-combat-card"].icon;
export const GUILD_WEEKLY_GOAL_ICON = PLAYER_FACING_EXCLUSIVE_ACTION_ICONS["guild-weekly-goal"].icon;
