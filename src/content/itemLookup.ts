import { items } from "./items";
import type { ItemContent } from "./schema";

export const itemContentById: ReadonlyMap<string, ItemContent> = new Map(
  items.map((item) => [item.id, item])
);

export function findItemContent(itemId: string): ItemContent | null {
  return itemContentById.get(itemId) ?? items.find((item) => item.id === itemId) ?? null;
}
