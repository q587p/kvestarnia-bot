import { describe, expect, it } from "vitest";
import type {
  CharacterItemRecord,
  InventoryRepository
} from "../../src/db/repositories/inventoryRepository";
import { InventoryService } from "../../src/services/inventoryService";

const telegramUserId = 42n;

describe("InventoryService", () => {
  it("returns no-character when user has no character", async () => {
    const service = new InventoryService(new FakeInventoryRepository(null));

    await expect(service.listForTelegramUser(telegramUserId)).resolves.toEqual({
      state: "no-character"
    });
  });

  it("returns empty when character has no items", async () => {
    const service = new InventoryService(new FakeInventoryRepository([]));

    await expect(service.listForTelegramUser(telegramUserId)).resolves.toEqual({
      state: "empty"
    });
  });

  it("enriches inventory rows with content names and quantities", async () => {
    const service = new InventoryService(
      new FakeInventoryRepository([
        buildItem({
          itemId: "item.wet-hero-ticket",
          quantity: 2
        })
      ])
    );

    const result = await service.listForTelegramUser(telegramUserId);

    expect(result.state).toBe("found");

    if (result.state === "found") {
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        itemId: "item.wet-hero-ticket",
        quantity: 2,
        content: {
          name: "Квиток мокрого героя"
        }
      });
    }
  });
});

function buildItem(overrides: Partial<CharacterItemRecord>): CharacterItemRecord {
  return {
    id: "character-item-1",
    characterId: "character-42",
    itemId: "item.wet-hero-ticket",
    quantity: 1,
    createdAt: new Date("2026-06-12T10:30:00.000Z"),
    updatedAt: new Date("2026-06-12T10:30:00.000Z"),
    ...overrides
  };
}

class FakeInventoryRepository implements InventoryRepository {
  constructor(private readonly rows: CharacterItemRecord[] | null) {}

  listByTelegramUserId(): Promise<CharacterItemRecord[] | null> {
    return Promise.resolve(this.rows);
  }
}
