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
  }
} as const;

export const PLAYER_FACING_ADMIN_ICON_EXCEPTIONS: ReadonlyArray<{
  icon: string;
  file: string;
  reason: string;
}> = [];

export const FRIENDLY_CHEST_ICON = PLAYER_FACING_EXCLUSIVE_ACTION_ICONS["friendly-chest"].icon;
export const ITEM_DISMANTLE_ICON = PLAYER_FACING_EXCLUSIVE_ACTION_ICONS["item-dismantle"].icon;
