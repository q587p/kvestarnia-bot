import type { InventoryResult } from "../../services/inventoryService";
import { presentItemStackLine } from "./itemStackPresenter";
import { escapeHtml } from "./telegramHtml";

export function presentInventory(result: InventoryResult): string {
  if (result.state === "no-character") {
    return "Спершу створіть пригодника через /start. Манатки не люблять порожніх біографій.";
  }

  if (result.state === "empty") {
    return [
      "🎒 Манатки",
      "Манатки ще не завелися.",
      "",
      "Спробуйте /tavern, /quest або /fight. Щось точно прилипне."
    ].join("\n");
  }

  return [
    "🎒 <b>Манатки</b>",
    "Пригодник розклав здобич на столі. Стіл попросив надбавку.",
    `Оціночна вартість столу: <b>${result.totalGoldValue} золота</b>. Стіл уже поводиться як фінансовий радник.`,
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
