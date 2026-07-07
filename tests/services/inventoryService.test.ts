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
        createdAt: new Date("2026-06-12T10:30:00.000Z"),
        content: {
          name: "Квиток мокрого пригодника"
        }
      });
      expect(result.totalGoldValue).toBe(0);
    }
  });

  it("lists one-use consumables before other inventory items", async () => {
    const service = new InventoryService(
      new FakeInventoryRepository([
        buildItem({
          id: "character-item-1",
          itemId: "item.wet-hero-ticket",
          quantity: 1
        }),
        buildItem({
          id: "character-item-2",
          itemId: "item.responsible-panic-bandage",
          quantity: 2
        }),
        buildItem({
          id: "character-item-3",
          itemId: "item.pan-of-persuasion",
          quantity: 1
        })
      ])
    );

    const result = await service.listForTelegramUser(telegramUserId);

    expect(result.state).toBe("found");

    if (result.state === "found") {
      expect(result.items.map((item) => item.itemId)).toEqual([
        "item.responsible-panic-bandage",
        "item.wet-hero-ticket",
        "item.pan-of-persuasion"
      ]);
    }
  });

  it("sums gold values for all priced inventory stacks", async () => {
    const service = new InventoryService(
      new FakeInventoryRepository([
        buildItem({
          itemId: "item.suspicious-shawarma-wrapper",
          quantity: 3
        }),
        buildItem({
          id: "character-item-2",
          itemId: "item.pan-of-persuasion",
          quantity: 2
        }),
        buildItem({
          id: "character-item-3",
          itemId: "item.cork-ring-of-serious-business",
          quantity: 2
        }),
        buildItem({
          id: "character-item-4",
          itemId: "item.wet-hero-ticket",
          quantity: 4
        })
      ])
    );

    const result = await service.listForTelegramUser(telegramUserId);

    expect(result).toMatchObject({
      state: "found",
      totalGoldValue: 65
    });
  });

  it("returns owned item details only for rows in the character inventory", async () => {
    const service = new InventoryService(
      new FakeInventoryRepository([
        buildItem({
          itemId: "item.wet-hero-ticket",
          quantity: 1
        })
      ])
    );

    await expect(
      service.getItemForTelegramUser(telegramUserId, "item.wet-hero-ticket")
    ).resolves.toMatchObject({
      state: "found",
      item: {
        itemId: "item.wet-hero-ticket",
        content: {
          name: "Квиток мокрого пригодника"
        }
      }
    });
    await expect(
      service.getItemForTelegramUser(telegramUserId, "item.pan-of-persuasion")
    ).resolves.toEqual({
      state: "not-owned"
    });
  });

  it("returns no-character for item details without a character", async () => {
    const service = new InventoryService(new FakeInventoryRepository(null));

    await expect(
      service.getItemForTelegramUser(telegramUserId, "item.wet-hero-ticket")
    ).resolves.toEqual({
      state: "no-character"
    });
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
