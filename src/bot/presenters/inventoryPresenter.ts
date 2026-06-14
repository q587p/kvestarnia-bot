import type { InventoryResult } from "../../services/inventoryService";
import { presentItemStackLine } from "./itemStackPresenter";
import { escapeHtml } from "./telegramHtml";

export const INVENTORY_PAGE_SIZE = 8;

export function presentInventory(result: InventoryResult, page = 0): string {
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

  const safePage = clampInventoryPage(result, page);
  const totalPages = getInventoryTotalPages(result);
  const pageItems = getInventoryPageItems(result, safePage);

  return [
    "🎒 <b>Манатки</b>",
    "Пригодник розклав здобич на столі. Стіл попросив надбавку.",
    "",
    `Оціночна вартість столу: <b>${result.totalGoldValue} золота</b>. Стіл уже поводиться як фінансовий радник.`,
    ...(totalPages > 1 ? [`Сторінка <b>${safePage + 1}/${totalPages}</b>. Усе інше стіл поки тримає під ліктем.`] : []),
    "",
    ...pageItems.flatMap((item) => [
      presentItemStackLine({
        name: `<b>${escapeHtml(item.content.name)}</b>`,
        quantity: item.quantity
      }),
      `  <i>${escapeHtml(item.content.description)}</i>`
    ])
  ].join("\n");
}

export function getInventoryTotalPages(result: InventoryResult): number {
  if (result.state !== "found") {
    return 1;
  }

  return Math.max(1, Math.ceil(result.items.length / INVENTORY_PAGE_SIZE));
}

export function clampInventoryPage(result: InventoryResult, page: number): number {
  const totalPages = getInventoryTotalPages(result);
  const safePage = Math.max(0, Math.floor(Number.isFinite(page) ? page : 0));

  return Math.min(safePage, totalPages - 1);
}

export function getInventoryPageItems(result: InventoryResult, page: number) {
  if (result.state !== "found") {
    return [];
  }

  const safePage = clampInventoryPage(result, page);
  const start = safePage * INVENTORY_PAGE_SIZE;

  return result.items.slice(start, start + INVENTORY_PAGE_SIZE);
}
