import type { InventoryResult } from "../../services/inventoryService";
import { presentItemStackLine } from "./itemStackPresenter";
import { escapeHtml } from "./telegramHtml";

export function presentInventory(result: InventoryResult): string {
  if (result.state === "no-character") {
    return "Спершу створіть героя через /start. Манатки не люблять порожніх біографій.";
  }

  if (result.state === "empty") {
    return [
      "🎒 Манатки",
      "Манатки ще не завелися.",
      "",
      "Спробуйте /tavern, /adventure або /fight. Щось точно прилипне."
    ].join("\n");
  }

  return [
    "🎒 <b>Манатки</b>",
    "Герой розклав здобич на столі. Стіл попросив надбавку.",
    "",
    ...result.items.flatMap((item) => [
      presentItemStackLine({
        name: `<b>${escapeHtml(item.content.name)}</b>`,
        quantity: item.quantity
      }),
      `  <i>${escapeHtml(item.content.description)}</i>`
    ])
  ].join("\n");
}
