import { describe, expect, it, vi } from "vitest";
import type {
  CharacterRecord,
  CharacterRepository,
  CreateCharacterResult
} from "../../src/db/repositories/characterRepository";
import type {
  CharacterEquipmentRecord,
  CharacterEquipmentSnapshot,
  EquipForCharacterResult,
  EquipmentRepository,
  EquipmentSlot
} from "../../src/db/repositories/equipmentRepository";
import type {
  CharacterItemRecord,
  InventoryRepository
} from "../../src/db/repositories/inventoryRepository";
import { items } from "../../src/content";
import { normalizeEquipmentSlot } from "../../src/content/equipmentSlots";
import type { ItemContent } from "../../src/content/schema";
import type { AchievementService } from "../../src/services/achievementService";
import {
  EquipmentService,
  isItemCompatibleWithEquipmentSlot
} from "../../src/services/equipmentService";

const telegramUserId = 42n;
const characterId = "character-42";

describe("EquipmentService", () => {
  it("returns empty slots for a new character", async () => {
    const service = createService({ inventoryRows: [] });

    await expect(service.getEquipmentForTelegramUser(telegramUserId)).resolves.toEqual({
      state: "ready",
      slots: [
        { slot: "weapon", item: null },
        { slot: "offhand", item: null },
        { slot: "head", item: null },
        { slot: "chest", item: null },
        { slot: "legs", item: null },
        { slot: "accessory", item: null },
        { slot: "tool", item: null }
      ]
    });
  });

  it("equips an owned weapon into the weapon slot", async () => {
    const service = createService({
      inventoryRows: [buildItem({ itemId: "item.stamp-of-minor-authority" })]
    });

    const result = await service.equipItemForTelegramUser(
      telegramUserId,
      "item.stamp-of-minor-authority"
    );

    expect(result).toMatchObject({
      state: "equipped",
      slot: "weapon",
      item: {
        itemId: "item.stamp-of-minor-authority",
        content: {
          name: "Печатка дрібної переваги"
        }
      }
    });
  });

  it("maps owned armor into the chest slot", async () => {
    const service = createService({
      inventoryRows: [buildItem({ itemId: "item.apron-of-foam-resistance" })]
    });

    await expect(
      service.equipItemForTelegramUser(telegramUserId, "item.apron-of-foam-resistance")
    ).resolves.toMatchObject({
      state: "equipped",
      slot: "chest"
    });
  });

  it("uses explicit equipment slot metadata when present", async () => {
    const service = createService({
      inventoryRows: [buildItem({ itemId: "item.pot-helmet-of-early-access" })]
    });

    await expect(
      service.equipItemForTelegramUser(telegramUserId, "item.pot-helmet-of-early-access")
    ).resolves.toMatchObject({
      state: "equipped",
      slot: "head"
    });
  });

  it("equips generated foot gear into the legs slot", async () => {
    const service = createService({
      inventoryRows: [buildItem({ itemId: "item.loot-v1-a013" })]
    });

    await expect(
      service.equipItemForTelegramUser(telegramUserId, "item.loot-v1-a013")
    ).resolves.toMatchObject({
      state: "equipped",
      slot: "legs",
      item: {
        content: {
          name: "Шкарпетки Невразливого Комфорту"
        }
      }
    });
  });

  it("maps owned accessories into the accessory slot", async () => {
    const service = createService({
      inventoryRows: [buildItem({ itemId: "item.cork-ring-of-serious-business" })]
    });

    await expect(
      service.equipItemForTelegramUser(telegramUserId, "item.cork-ring-of-serious-business")
    ).resolves.toMatchObject({
      state: "equipped",
      slot: "accessory"
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

  it("rejects expansion equipment when hard requirements do not match the character", async () => {
    const service = createService({
      inventoryRows: [buildItem({ itemId: "item.loot-v1-w027" })],
      character: buildCharacter({ level: 8, classId: "class.warrior" })
    });

    await expect(service.equipItemForTelegramUser(telegramUserId, "item.loot-v1-w027")).resolves.toMatchObject({
      state: "requirements-not-met",
      reasons: ["class"]
    });
  });

  it("previews canonical class requirements for former orphan title gates", async () => {
    const service = createService({
      inventoryRows: [buildItem({ itemId: "item.loot-v1-x022-plus-2" })],
      character: buildCharacter({ level: 8, classId: "class.warrior" })
    });

    await expect(
      service.previewItemEquipForTelegramUser(telegramUserId, "item.loot-v1-x022-plus-2")
    ).resolves.toMatchObject({
      state: "requirements-not-met",
      reasons: ["class"],
      requirements: {
        minLevel: 6,
        classes: ["Бюрокромант"],
        titles: []
      },
      slot: "accessory",
      item: {
        content: {
          name: "Жетон Боргоманта +2"
        }
      }
    });
  });

  it("includes canonical class requirements when equip is denied", async () => {
    const service = createService({
      inventoryRows: [buildItem({ itemId: "item.loot-v1-x022-plus-2" })],
      character: buildCharacter({ level: 8, classId: "class.warrior" })
    });

    await expect(
      service.equipItemForTelegramUser(telegramUserId, "item.loot-v1-x022-plus-2")
    ).resolves.toMatchObject({
      state: "requirements-not-met",
      reasons: ["class"],
      requirements: {
        minLevel: 6,
        classes: ["Бюрокромант"],
        titles: []
      },
      item: {
        content: {
          name: "Жетон Боргоманта +2"
        }
      }
    });
  });

  it("allows expansion equipment when hard requirements match the character", async () => {
    const service = createService({
      inventoryRows: [buildItem({ itemId: "item.loot-v1-w027" })],
      character: buildCharacter({ level: 8, classId: "class.bureaucramancer" })
    });

    await expect(service.equipItemForTelegramUser(telegramUserId, "item.loot-v1-w027")).resolves.toMatchObject({
      state: "equipped",
      slot: "weapon"
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

    const result = await service.equipItemForTelegramUser(telegramUserId, "item.pan-of-persuasion");

    expect(equipment.rows).toHaveLength(1);
    expect(equipment.rows[0]).toMatchObject({
      slot: "weapon",
      itemId: "item.pan-of-persuasion"
    });
    expect(result).toMatchObject({
      state: "equipped",
      replacedItem: {
        itemId: "item.old-pan"
      }
    });
    expect(inventoryRows.find((row) => row.itemId === "item.pan-of-persuasion")?.quantity).toBe(2);
  });

  it("previews deterministic same-slot replacement", async () => {
    const service = createService({
      snapshot: {
        characterId,
        equipment: [buildEquipment({ slot: "weapon", itemId: "item.pan-of-persuasion" })]
      },
      inventoryRows: [buildItem({ itemId: "item.stamp-of-minor-authority" })]
    });

    await expect(
      service.previewItemEquipForTelegramUser(telegramUserId, "item.stamp-of-minor-authority")
    ).resolves.toMatchObject({
      state: "can-equip",
      slot: "weapon",
      currentItem: {
        itemId: "item.pan-of-persuasion"
      }
    });
  });

  it("lets warriors equip a second weapon into the offhand slot", async () => {
    const service = createService({
      snapshot: {
        characterId,
        equipment: [buildEquipment({ slot: "weapon", itemId: "item.pan-of-persuasion" })]
      },
      inventoryRows: [
        buildItem({ itemId: "item.pan-of-persuasion" }),
        buildItem({
          id: "character-item-2",
          itemId: "item.stamp-of-minor-authority"
        })
      ],
      character: buildCharacter({ classId: "class.warrior" })
    });

    await expect(
      service.equipItemForTelegramUser(telegramUserId, "item.stamp-of-minor-authority", "offhand")
    ).resolves.toMatchObject({
      state: "equipped",
      slot: "offhand",
      item: {
        itemId: "item.stamp-of-minor-authority"
      },
      replacedItem: null
    });
  });

  it("blocks non-warriors from using ordinary weapons in the offhand slot", async () => {
    const service = createService({
      snapshot: {
        characterId,
        equipment: [buildEquipment({ slot: "weapon", itemId: "item.pan-of-persuasion" })]
      },
      inventoryRows: [
        buildItem({ itemId: "item.pan-of-persuasion" }),
        buildItem({
          id: "character-item-2",
          itemId: "item.stamp-of-minor-authority"
        })
      ],
      character: buildCharacter({ classId: "class.mage" })
    });

    await expect(
      service.equipItemForTelegramUser(telegramUserId, "item.stamp-of-minor-authority", "offhand")
    ).resolves.toMatchObject({
      state: "slot-not-allowed",
      slot: "offhand",
      reason: "offhand-restricted"
    });
  });

  it("allows explicitly offhand-tagged items for any class", () => {
    expect(isItemCompatibleWithEquipmentSlot({
      id: "item.test-offhand-charm",
      name: "Тестова друга рука",
      description: "Проситься в другу руку і має про це папірець.",
      rarity: "common",
      slot: "weapon",
      tags: ["offhand"],
      goldValue: 13
    }, "offhand", "class.mage")).toBe(true);
  });

  it("does not treat twohand-tagged items as offhand-compatible", () => {
    expect(isItemCompatibleWithEquipmentSlot({
      id: "item.test-twohand-stick",
      name: "Тестова дворучна палиця",
      description: "Просить обидві руки і ще одну довідку.",
      rarity: "common",
      slot: "weapon",
      tags: ["twohand"],
      goldValue: 13
    }, "offhand", "class.warrior")).toBe(false);
  });

  it("does not let one owned copy occupy both hand slots", async () => {
    const service = createService({
      snapshot: {
        characterId,
        equipment: [buildEquipment({ slot: "weapon", itemId: "item.pan-of-persuasion" })]
      },
      inventoryRows: [buildItem({ itemId: "item.pan-of-persuasion", quantity: 1 })],
      character: buildCharacter({ classId: "class.warrior" })
    });

    await expect(
      service.previewItemEquipForTelegramUser(telegramUserId, "item.pan-of-persuasion", "offhand")
    ).resolves.toMatchObject({
      state: "slot-not-allowed",
      slot: "offhand",
      reason: "not-enough-copies"
    });
  });

  it("prompts before equipping an offhand item over a twohand main-hand item", async () => {
    const cleanup = addTemporaryItem({
      id: "item.test-twohand-broom",
      name: "Дворучна мітла протоколу",
      description: "Мете так переконливо, що друга рука теж мусить підписатися.",
      rarity: "rare",
      slot: "weapon",
      equipmentSlot: "weapon",
      tags: ["twohand"],
      goldValue: 93,
      effect: {
        weaponDamage: 3
      }
    });

    try {
      const equipment = new FakeEquipmentRepository({
        characterId,
        equipment: [buildEquipment({ slot: "weapon", itemId: "item.test-twohand-broom" })]
      });
      const service = new EquipmentService(
        equipment,
        new FakeInventoryRepository([buildItem({ itemId: "item.stamp-of-minor-authority" })]),
        new FakeCharacterRepository(buildCharacter({ classId: "class.warrior" }))
      );

      await expect(
        service.previewItemEquipForTelegramUser(telegramUserId, "item.stamp-of-minor-authority", "offhand")
      ).resolves.toMatchObject({
        state: "twohand-confirm-required",
        slot: "offhand",
        clearedHandItem: {
          itemId: "item.test-twohand-broom"
        }
      });
      await expect(
        service.getCompatibleItemIdsForSlotForTelegramUser(telegramUserId, "offhand")
      ).resolves.toEqual(new Set(["item.stamp-of-minor-authority"]));

      const result = await service.equipItemForTelegramUser(
        telegramUserId,
        "item.stamp-of-minor-authority",
        "offhand",
        { confirmTwohand: true }
      );

      expect(result).toMatchObject({
        state: "equipped",
        slot: "offhand",
        clearedHandItem: {
          itemId: "item.test-twohand-broom"
        }
      });
      expect(equipment.rows).toHaveLength(1);
      expect(equipment.rows[0]).toMatchObject({
        slot: "offhand",
        itemId: "item.stamp-of-minor-authority"
      });
    } finally {
      cleanup();
    }
  });

  it("shows a twohand main-hand item as occupying both hand slots", async () => {
    const cleanup = addTemporaryItem({
      id: "item.test-twohand-spoon",
      name: "Дворучна ложка ревізії",
      description: "Її тримають двома руками, бо документи слизькі.",
      rarity: "rare",
      slot: "weapon",
      equipmentSlot: "weapon",
      tags: ["twohand"],
      goldValue: 93,
      effect: {
        weaponDamage: 3
      }
    });

    try {
      const service = createService({
        snapshot: {
          characterId,
          equipment: [buildEquipment({ slot: "weapon", itemId: "item.test-twohand-spoon" })]
        },
        inventoryRows: [],
        character: buildCharacter({ classId: "class.warrior" })
      });
      const result = await service.getEquipmentForTelegramUser(telegramUserId);

      expect(result.state).toBe("ready");
      if (result.state !== "ready") {
        return;
      }
      expect(result.slots.find((slot) => slot.slot === "weapon")).toMatchObject({
        item: {
          itemId: "item.test-twohand-spoon"
        }
      });
      expect(result.slots.find((slot) => slot.slot === "offhand")).toMatchObject({
        occupiedByTwohand: true,
        item: {
          itemId: "item.test-twohand-spoon"
        }
      });
    } finally {
      cleanup();
    }
  });

  it("unequips a twohand main-hand item when clearing its virtual offhand slot", async () => {
    const cleanup = addTemporaryItem({
      id: "item.test-twohand-bucket",
      name: "Дворучне відро відповідальности",
      description: "Його не несуть. Його погоджують.",
      rarity: "rare",
      slot: "weapon",
      equipmentSlot: "weapon",
      tags: ["twohand"],
      goldValue: 93
    });

    try {
      const equipment = new FakeEquipmentRepository({
        characterId,
        equipment: [buildEquipment({ slot: "weapon", itemId: "item.test-twohand-bucket" })]
      });
      const service = new EquipmentService(equipment, new FakeInventoryRepository([]));

      const result = await service.unequipSlotForTelegramUser(telegramUserId, "offhand");

      expect(result).toMatchObject({
        state: "unequipped",
        slot: "offhand"
      });
      expect(result.state).toBe("unequipped");
      if (result.state !== "unequipped") {
        return;
      }
      expect(result.slots.find((slot) => slot.slot === "weapon")).toMatchObject({ item: null });
      expect(result.slots.find((slot) => slot.slot === "offhand")).toMatchObject({ item: null });
      expect(equipment.rows).toHaveLength(0);
    } finally {
      cleanup();
    }
  });

  it("prompts before equipping a twohand weapon over an occupied offhand slot", async () => {
    const cleanup = addTemporaryItem({
      id: "item.test-twohand-ladle",
      name: "Дворучний ополоник аргументів",
      description: "Після нього суп сам просить вибачення.",
      rarity: "rare",
      slot: "weapon",
      equipmentSlot: "weapon",
      tags: ["twohand"],
      goldValue: 93,
      effect: {
        weaponDamage: 3
      }
    });

    try {
      const equipment = new FakeEquipmentRepository({
        characterId,
        equipment: [buildEquipment({ slot: "offhand", itemId: "item.stamp-of-minor-authority" })]
      });
      const service = new EquipmentService(
        equipment,
        new FakeInventoryRepository([buildItem({ itemId: "item.test-twohand-ladle" })]),
        new FakeCharacterRepository(buildCharacter({ classId: "class.warrior" }))
      );

      await expect(
        service.equipItemForTelegramUser(telegramUserId, "item.test-twohand-ladle")
      ).resolves.toMatchObject({
        state: "twohand-confirm-required",
        slot: "weapon",
        clearedHandItem: {
          itemId: "item.stamp-of-minor-authority"
        }
      });

      const result = await service.equipItemForTelegramUser(
        telegramUserId,
        "item.test-twohand-ladle",
        "weapon",
        { confirmTwohand: true }
      );

      expect(result).toMatchObject({
        state: "equipped",
        slot: "weapon",
        clearedHandItem: {
          itemId: "item.stamp-of-minor-authority"
        }
      });
      expect(result.state).toBe("equipped");
      if (result.state !== "equipped") {
        return;
      }
      expect(result.slots.find((slot) => slot.slot === "offhand")).toMatchObject({
        occupiedByTwohand: true,
        item: {
          itemId: "item.test-twohand-ladle"
        }
      });
      expect(equipment.rows).toHaveLength(1);
      expect(equipment.rows[0]).toMatchObject({
        slot: "weapon",
        itemId: "item.test-twohand-ladle"
      });
    } finally {
      cleanup();
    }
  });

  it("filters compatible offhand item ids through class and copy-count rules", async () => {
    const warriorService = createService({
      snapshot: {
        characterId,
        equipment: [buildEquipment({ slot: "weapon", itemId: "item.pan-of-persuasion" })]
      },
      inventoryRows: [
        buildItem({ itemId: "item.pan-of-persuasion", quantity: 1 }),
        buildItem({
          id: "character-item-2",
          itemId: "item.stamp-of-minor-authority",
          quantity: 1
        })
      ],
      character: buildCharacter({ classId: "class.warrior" })
    });
    const mageService = createService({
      snapshot: {
        characterId,
        equipment: [buildEquipment({ slot: "weapon", itemId: "item.pan-of-persuasion" })]
      },
      inventoryRows: [
        buildItem({ itemId: "item.pan-of-persuasion", quantity: 1 }),
        buildItem({
          id: "character-item-2",
          itemId: "item.stamp-of-minor-authority",
          quantity: 1
        })
      ],
      character: buildCharacter({ classId: "class.mage" })
    });

    await expect(
      warriorService.getCompatibleItemIdsForSlotForTelegramUser(telegramUserId, "offhand")
    ).resolves.toEqual(new Set(["item.stamp-of-minor-authority"]));
    await expect(
      mageService.getCompatibleItemIdsForSlotForTelegramUser(telegramUserId, "offhand")
    ).resolves.toEqual(new Set());
  });

  it("keeps repeated same-item equip callbacks on one stable slot row", async () => {
    const inventoryRows = [buildItem({ itemId: "item.pan-of-persuasion", quantity: 1 })];
    const equipment = new FakeEquipmentRepository({
      characterId,
      equipment: []
    });
    const achievements = {
      trackEventSafely: () => Promise.resolve([])
    } as Pick<AchievementService, "trackEventSafely">;
    const track = vi.spyOn(achievements, "trackEventSafely");
    const service = new EquipmentService(
      equipment,
      new FakeInventoryRepository(inventoryRows),
      undefined,
      achievements as AchievementService
    );

    const first = await service.equipItemForTelegramUser(telegramUserId, "item.pan-of-persuasion");
    const second = await service.equipItemForTelegramUser(telegramUserId, "item.pan-of-persuasion");

    expect(first).toMatchObject({
      state: "equipped",
      slot: "weapon",
      replacedItem: null
    });
    expect(second).toMatchObject({
      state: "equipped",
      slot: "weapon",
      replacedItem: null
    });
    expect(equipment.rows).toHaveLength(1);
    expect(equipment.rows[0]).toMatchObject({
      slot: "weapon",
      itemId: "item.pan-of-persuasion"
    });
    expect(track).toHaveBeenCalledTimes(1);
  });

  it("tracks one achievement event for concurrent duplicate same-item equip callbacks", async () => {
    const inventoryRows = [buildItem({ itemId: "item.pan-of-persuasion", quantity: 1 })];
    const equipment = new FakeEquipmentRepository({
      characterId,
      equipment: []
    });
    const achievements = {
      trackEventSafely: () => Promise.resolve([])
    } as Pick<AchievementService, "trackEventSafely">;
    const track = vi.spyOn(achievements, "trackEventSafely");
    const service = new EquipmentService(
      equipment,
      new FakeInventoryRepository(inventoryRows),
      undefined,
      achievements as AchievementService
    );

    const [first, second] = await Promise.all([
      service.equipItemForTelegramUser(telegramUserId, "item.pan-of-persuasion"),
      service.equipItemForTelegramUser(telegramUserId, "item.pan-of-persuasion")
    ]);

    expect(first).toMatchObject({
      state: "equipped",
      slot: "weapon"
    });
    expect(second).toMatchObject({
      state: "equipped",
      slot: "weapon"
    });
    expect(equipment.rows).toHaveLength(1);
    expect(track).toHaveBeenCalledTimes(1);
  });

  it("reads legacy armor equipment rows through the chest slot", async () => {
    const service = createService({
      snapshot: {
        characterId,
        equipment: [
          buildEquipment({
            slot: "armor" as EquipmentSlot,
            itemId: "item.apron-of-foam-resistance"
          })
        ]
      },
      inventoryRows: []
    });

    const result = await service.getEquipmentForTelegramUser(telegramUserId);

    expect(result.state).toBe("ready");
    if (result.state !== "ready") {
      return;
    }
    expect(result.slots.find((slot) => slot.slot === "chest")).toMatchObject({
      item: {
        itemId: "item.apron-of-foam-resistance"
      }
    });
  });

  it("removes legacy armor rows from the immediate chest unequip response", async () => {
    const equipment = new FakeEquipmentRepository({
      characterId,
      equipment: [buildEquipment({ slot: "armor" as EquipmentSlot, itemId: "item.apron-of-foam-resistance" })]
    });
    const service = new EquipmentService(equipment, new FakeInventoryRepository([]));

    const result = await service.unequipSlotForTelegramUser(telegramUserId, "chest");

    expect(result.state).toBe("unequipped");
    if (result.state !== "unequipped") {
      return;
    }
    expect(result.slots.find((slot) => slot.slot === "chest")).toMatchObject({
      item: null
    });
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
  inventoryRows,
  character
}: {
  snapshot?: CharacterEquipmentSnapshot | null;
  inventoryRows: CharacterItemRecord[] | null;
  character?: CharacterRecord | null;
}): EquipmentService {
  return new EquipmentService(
    new FakeEquipmentRepository(snapshot),
    new FakeInventoryRepository(inventoryRows),
    character === undefined ? undefined : new FakeCharacterRepository(character)
  );
}

function buildCharacter(overrides: Partial<CharacterRecord> = {}): CharacterRecord {
  return {
    id: characterId,
    userId: "user-42",
    name: "Test Hero",
    pronoun: "they",
    path: "boundary",
    raceId: "race.human-ish",
    classId: "class.warrior",
    level: 1,
    xp: 0,
    gold: 0,
    hpCurrent: 10,
    hpMax: 10,
    manaCurrent: 5,
    manaMax: 5,
    statsJson: {
      strength: 6,
      dexterity: 6,
      intelligence: 6,
      charisma: 6,
      luck: 6
    },
    ...overrides
  };
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

function addTemporaryItem(item: ItemContent): () => void {
  (items as ItemContent[]).push(item);

  return () => {
    const index = items.findIndex((candidate) => candidate.id === item.id);

    if (index >= 0) {
      (items as ItemContent[]).splice(index, 1);
    }
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
    const existing = this.rows.find((row) => normalizeEquipmentSlot(row.slot) === slot);
    const row = {
      ...(existing ?? buildEquipment({ id: `equipment-${this.rows.length + 1}`, slot })),
      characterId: nextCharacterId,
      slot,
      itemId
    };

    this.rows = [
      ...this.rows.filter((candidate) => normalizeEquipmentSlot(candidate.slot) !== slot),
      row
    ];
    return Promise.resolve(row);
  }

  equipForCharacterAtomically(input: {
    characterId: string;
    slot: EquipmentSlot;
    itemId: string;
    clearSlot?: EquipmentSlot;
  }): Promise<EquipForCharacterResult> {
    if (input.clearSlot) {
      this.rows = this.rows.filter((row) => normalizeEquipmentSlot(row.slot) !== input.clearSlot);
    }

    const existing = this.rows.find((row) => normalizeEquipmentSlot(row.slot) === input.slot);
    const changed = existing?.itemId !== input.itemId;
    const row = {
      ...(existing ?? buildEquipment({ id: `equipment-${this.rows.length + 1}`, slot: input.slot })),
      characterId: input.characterId,
      slot: input.slot,
      itemId: input.itemId
    };

    this.rows = [
      ...this.rows.filter((candidate) => normalizeEquipmentSlot(candidate.slot) !== input.slot),
      row
    ];

    return Promise.resolve({
      record: row,
      changed
    });
  }

  unequipForCharacter(_characterId: string, slot: EquipmentSlot): Promise<boolean> {
    const before = this.rows.length;
    this.rows = this.rows.filter((row) => normalizeEquipmentSlot(row.slot) !== slot);
    return Promise.resolve(this.rows.length !== before);
  }
}

class FakeInventoryRepository implements InventoryRepository {
  constructor(private readonly rows: CharacterItemRecord[] | null) {}

  listByTelegramUserId(): Promise<CharacterItemRecord[] | null> {
    return Promise.resolve(this.rows);
  }
}

class FakeCharacterRepository implements CharacterRepository {
  constructor(private readonly character: CharacterRecord | null) {}

  findByUserId(): Promise<CharacterRecord | null> {
    return Promise.resolve(this.character);
  }

  findByTelegramUserId(): Promise<CharacterRecord | null> {
    return Promise.resolve(this.character);
  }

  deleteByTelegramUserId(): Promise<boolean> {
    return Promise.resolve(false);
  }

  createForTelegramUserIfMissing(): Promise<CreateCharacterResult> {
    if (!this.character) {
      throw new Error("FakeCharacterRepository cannot create missing characters.");
    }

    return Promise.resolve({ character: this.character, created: false });
  }
}
