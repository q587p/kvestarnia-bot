import { describe, expect, it } from "vitest";
import type {
  CharacterEquipmentRecord,
  CharacterEquipmentSnapshot,
  EquipmentRepository,
  EquipmentSlot
} from "../../src/db/repositories/equipmentRepository";
import type {
  CharacterItemRecord,
  InventoryRepository
} from "../../src/db/repositories/inventoryRepository";
import { EquipmentService } from "../../src/services/equipmentService";

const telegramUserId = 42n;
const characterId = "character-42";

describe("EquipmentService", () => {
  it("returns empty slots for a new character", async () => {
    const service = createService({ inventoryRows: [] });

    await expect(service.getEquipmentForTelegramUser(telegramUserId)).resolves.toEqual({
      state: "ready",
      slots: [
        { slot: "weapon", item: null },
        { slot: "head", item: null },
        { slot: "chest", item: null },
        { slot: "legs", item: null },
        { slot: "accessory", item: null }
      ]
    });
  });

  it("equips an owned weapon into the weapon slot", async () => {
    const service = createService({
      inventoryRows: [buildItem({ itemId: "item.pan-of-persuasion" })]
    });

    const result = await service.equipItemForTelegramUser(
      telegramUserId,
      "item.pan-of-persuasion"
    );

    expect(result).toMatchObject({
      state: "equipped",
      slot: "weapon",
      item: {
        itemId: "item.pan-of-persuasion",
        content: {
          name: "Пательня переконання"
        }
      }
    });
  });

  it("maps owned armor into the chest slot", async () => {
    const service = createService({
      inventoryRows: [buildItem({ itemId: "item.pot-helmet-of-early-access" })]
    });

    await expect(
      service.equipItemForTelegramUser(telegramUserId, "item.pot-helmet-of-early-access")
    ).resolves.toMatchObject({
      state: "equipped",
      slot: "chest"
    });
  });

  it("rejects junk and priceless trophies as not equippable", async () => {
    const service = createService({
      inventoryRows: [buildItem({ itemId: "item.wet-hero-ticket" })]
    });

    await expect(
      service.equipItemForTelegramUser(telegramUserId, "item.wet-hero-ticket")
    ).resolves.toEqual({
      state: "not-equippable"
    });
  });

  it("rejects unowned items", async () => {
    const service = createService({
      inventoryRows: [buildItem({ itemId: "item.wet-hero-ticket" })]
    });

    await expect(
      service.equipItemForTelegramUser(telegramUserId, "item.pan-of-persuasion")
    ).resolves.toEqual({
      state: "not-owned"
    });
  });

  it("re-equips by replacing the slot without changing inventory quantity", async () => {
    const inventoryRows = [
      buildItem({ itemId: "item.pan-of-persuasion", quantity: 2 }),
      buildItem({
        id: "character-item-2",
        itemId: "item.pot-helmet-of-early-access",
        quantity: 1
      })
    ];
    const equipment = new FakeEquipmentRepository({
      characterId,
      equipment: [buildEquipment({ slot: "weapon", itemId: "item.old-pan" })]
    });
    const service = new EquipmentService(equipment, new FakeInventoryRepository(inventoryRows));

    await service.equipItemForTelegramUser(telegramUserId, "item.pan-of-persuasion");

    expect(equipment.rows).toHaveLength(1);
    expect(equipment.rows[0]).toMatchObject({
      slot: "weapon",
      itemId: "item.pan-of-persuasion"
    });
    expect(inventoryRows.find((row) => row.itemId === "item.pan-of-persuasion")?.quantity).toBe(2);
  });

  it("unequips an occupied slot and treats an empty slot kindly", async () => {
    const equipment = new FakeEquipmentRepository({
      characterId,
      equipment: [buildEquipment({ slot: "weapon", itemId: "item.pan-of-persuasion" })]
    });
    const service = new EquipmentService(equipment, new FakeInventoryRepository([]));

    await expect(service.unequipSlotForTelegramUser(telegramUserId, "weapon")).resolves.toMatchObject({
      state: "unequipped",
      slot: "weapon"
    });
    await expect(service.unequipSlotForTelegramUser(telegramUserId, "weapon")).resolves.toMatchObject({
      state: "empty-slot",
      slot: "weapon"
    });
  });

  it("returns no-character when repositories cannot find a character", async () => {
    const service = createService({ snapshot: null, inventoryRows: null });

    await expect(service.getEquipmentForTelegramUser(telegramUserId)).resolves.toEqual({
      state: "no-character"
    });
    await expect(
      service.equipItemForTelegramUser(telegramUserId, "item.pan-of-persuasion")
    ).resolves.toEqual({
      state: "no-character"
    });
    await expect(service.unequipSlotForTelegramUser(telegramUserId, "weapon")).resolves.toEqual({
      state: "no-character"
    });
  });
});

function createService({
  snapshot = { characterId, equipment: [] },
  inventoryRows
}: {
  snapshot?: CharacterEquipmentSnapshot | null;
  inventoryRows: CharacterItemRecord[] | null;
}): EquipmentService {
  return new EquipmentService(
    new FakeEquipmentRepository(snapshot),
    new FakeInventoryRepository(inventoryRows)
  );
}

function buildEquipment(overrides: Partial<CharacterEquipmentRecord>): CharacterEquipmentRecord {
  return {
    id: "equipment-1",
    characterId,
    slot: "weapon",
    itemId: "item.pan-of-persuasion",
    createdAt: new Date("2026-06-13T12:00:00.000Z"),
    updatedAt: new Date("2026-06-13T12:00:00.000Z"),
    ...overrides
  };
}

function buildItem(overrides: Partial<CharacterItemRecord>): CharacterItemRecord {
  return {
    id: "character-item-1",
    characterId,
    itemId: "item.pan-of-persuasion",
    quantity: 1,
    createdAt: new Date("2026-06-13T12:00:00.000Z"),
    updatedAt: new Date("2026-06-13T12:00:00.000Z"),
    ...overrides
  };
}

class FakeEquipmentRepository implements EquipmentRepository {
  rows: CharacterEquipmentRecord[];

  constructor(private readonly snapshot: CharacterEquipmentSnapshot | null) {
    this.rows = snapshot?.equipment ?? [];
  }

  listByTelegramUserId(): Promise<CharacterEquipmentSnapshot | null> {
    if (!this.snapshot) {
      return Promise.resolve(null);
    }

    return Promise.resolve({
      characterId: this.snapshot.characterId,
      equipment: this.rows
    });
  }

  equipForCharacter(
    nextCharacterId: string,
    slot: EquipmentSlot,
    itemId: string
  ): Promise<CharacterEquipmentRecord> {
    const existing = this.rows.find((row) => row.slot === slot);
    const row = {
      ...(existing ?? buildEquipment({ id: `equipment-${this.rows.length + 1}`, slot })),
      characterId: nextCharacterId,
      slot,
      itemId
    };

    this.rows = [...this.rows.filter((candidate) => candidate.slot !== slot), row];
    return Promise.resolve(row);
  }

  unequipForCharacter(_characterId: string, slot: EquipmentSlot): Promise<boolean> {
    const before = this.rows.length;
    this.rows = this.rows.filter((row) => row.slot !== slot);
    return Promise.resolve(this.rows.length !== before);
  }
}

class FakeInventoryRepository implements InventoryRepository {
  constructor(private readonly rows: CharacterItemRecord[] | null) {}

  listByTelegramUserId(): Promise<CharacterItemRecord[] | null> {
    return Promise.resolve(this.rows);
  }
}
