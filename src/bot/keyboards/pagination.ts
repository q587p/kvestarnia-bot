import type { InlineKeyboard } from "grammy";

export interface PaginationState {
  page: number;
  totalPages: number;
}

export function clampPaginationPage(page: number, totalPages: number): number {
  if (!Number.isFinite(page)) {
    return 0;
  }

  return Math.min(Math.max(0, Math.floor(page)), Math.max(0, Math.floor(totalPages) - 1));
}

export function addPaginationControls(
  keyboard: InlineKeyboard,
  input: PaginationState & { makeCallbackData: (page: number) => string }
): InlineKeyboard {
  const totalPages = Number.isFinite(input.totalPages) ? Math.max(1, Math.floor(input.totalPages)) : 1;
  if (totalPages <= 1) {
    return keyboard;
  }

  const page = clampPaginationPage(input.page, totalPages);
  if (page > 0) {
    keyboard.text("⬅️", input.makeCallbackData(page - 1));
  }

  keyboard.text(`${page + 1}/${totalPages}`, input.makeCallbackData(page));

  if (page + 1 < totalPages) {
    keyboard.text("➡️", input.makeCallbackData(page + 1));
  }

  keyboard.row();
  return keyboard;
}
