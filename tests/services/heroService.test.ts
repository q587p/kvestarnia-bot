import { describe, expect, it } from "vitest";
import type {
  CharacterRecord,
  CharacterRepository,
  CreateCharacterInput,
  CreateCharacterResult
} from "../../src/db/repositories/characterRepository";
import type {
  CharacterItemRecord,
  InventoryRepository
} from "../../src/db/repositories/inventoryRepository";
import type {
  CharacterEquipmentRecord,
  CharacterEquipmentSnapshot,
  EquipmentRepository
} from "../../src/db/repositories/equipmentRepository";
import type { TelegramUserProfile } from "../../src/db/repositories/userRepository";
import { HeroService } from "../../src/services/heroService";

const telegramUserId = 42n;

describe("HeroService", () => {
  it("adds inventory value to the hero lookup without changing carried gold", async () => {
    const service = new HeroService(
      new FakeCharacterRepository(buildCharacter({ gold: 9 })),
      new FakeInventoryRepository([
        buildItem({ itemId: "item.pan-of-persuasion", quantity: 1 }),
        buildItem({
          id: "character-item-2",
          itemId: "item.suspicious-shawarma-wrapper",
          quantity: 4
        }),
        buildItem({
          id: "character-item-3",
          itemId: "item.wet-hero-ticket",
          quantity: 8
        })
      ]),
      new FakeEquipmentRepository({
        characterId: "character-42",
        equipment: [
          buildEquipment({ slot: "weapon", itemId: "item.pan-of-persuasion" }),
          buildEquipment({ id: "equipment-2", slot: "chest", itemId: "item.apron-of-foam-resistance" })
        ]
      })
    );

    await expect(service.findByTelegramUserId(telegramUserId)).resolves.toMatchObject({
      state: "existing-character",
      character: {
        gold: 9,
        hpMax: 24,
        equipmentEffects: {
          hpMax: 2,
          armor: 1,
          weaponDamage: 2
        }
      },
      inventoryGoldValue: 29
    });
  });

  it("returns no-character without reading inventory", async () => {
    const inventory = new FakeInventoryRepository([]);
    const service = new HeroService(new FakeCharacterRepository(null), inventory);

    await expect(service.findByTelegramUserId(telegramUserId)).resolves.toEqual({
      state: "no-character"
    });
    expect(inventory.listCount).toBe(0);
  });

  it("reports a recovery notice when hero lookup fills HP", async () => {
    const marker = new Date("2026-06-13T11:40:00.000Z");
    const characters = new FakeCharacterRepository(
      buildCharacter({
        hpCurrent: 1,
        hpMax: 22,
        hpRegenAt: marker,
        manaRegenAt: marker
      })
    );
    const service = new HeroService(
      characters,
      new FakeInventoryRepository([]),
      undefined,
      undefined,
      () => new Date("2026-06-13T12:00:00.000Z")
    );

    const result = await service.findByTelegramUserId(telegramUserId);

    expect(result).toMatchObject({
      state: "existing-character",
      recoveryNotice: {
        type: "hp-full",
        hpCurrent: 22,
        hpMax: 22
      }
    });
    expect(characters.resourceUpdateCount).toBe(1);
  });
});

function buildCharacter(overrides: Partial<CharacterRecord> = {}): CharacterRecord {
  return {
    id: "character-42",
    userId: "user-42",
    name: "Мандрівник",
    pronoun: "they",
    path: "boundary",
    raceId: "race.human-ish",
    classId: "class.warrior",
    level: 1,
    xp: 0,
    gold: 0,
    hpCurrent: 22,
    hpMax: 22,
    manaCurrent: 10,
    manaMax: 10,
    statsJson: {
      strength: 8,
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
    characterId: "character-42",
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
    characterId: "character-42",
    itemId: "item.pan-of-persuasion",
    quantity: 1,
    createdAt: new Date("2026-06-13T12:00:00.000Z"),
    updatedAt: new Date("2026-06-13T12:00:00.000Z"),
    ...overrides
  };
}

class FakeCharacterRepository implements CharacterRepository {
  resourceUpdateCount = 0;

  constructor(private readonly character: CharacterRecord | null) {}

  findByTelegramUserId(): Promise<CharacterRecord | null> {
    return Promise.resolve(this.character);
  }

  findByUserId(): Promise<CharacterRecord | null> {
    return Promise.resolve(this.character);
  }

  deleteByTelegramUserId(): Promise<boolean> {
    return Promise.resolve(false);
  }

  updateResourcesForTelegramUser(
    _telegramUserId: bigint,
    input: {
      hpCurrent: number;
      manaCurrent: number;
      hpRegenAt: Date;
      manaRegenAt: Date;
    }
  ): Promise<CharacterRecord | null> {
    if (!this.character) {
      return Promise.resolve(null);
    }

    this.resourceUpdateCount += 1;
    Object.assign(this.character, {
      hpCurrent: input.hpCurrent,
      manaCurrent: input.manaCurrent,
      hpRegenAt: input.hpRegenAt,
      manaRegenAt: input.manaRegenAt
    });

    return Promise.resolve(this.character);
  }

  updateReward(): CharacterRecord {
    throw new Error("Not needed in this test.");
  }

  createForTelegramUserIfMissing(
    _user: TelegramUserProfile,
    input: CreateCharacterInput
  ): Promise<CreateCharacterResult> {
    return Promise.resolve({ character: { ...buildCharacter(), ...input }, created: true });
  }
}

class FakeInventoryRepository implements InventoryRepository {
  listCount = 0;

  constructor(private readonly rows: CharacterItemRecord[] | null) {}

  listByTelegramUserId(): Promise<CharacterItemRecord[] | null> {
    this.listCount += 1;
    return Promise.resolve(this.rows);
  }
}

class FakeEquipmentRepository implements EquipmentRepository {
  constructor(private readonly snapshot: CharacterEquipmentSnapshot | null) {}

  listByTelegramUserId(): Promise<CharacterEquipmentSnapshot | null> {
    return Promise.resolve(this.snapshot);
  }

  equipForCharacter(): Promise<CharacterEquipmentRecord> {
    throw new Error("Not needed in this test.");
  }

  unequipForCharacter(): Promise<boolean> {
    throw new Error("Not needed in this test.");
  }
}
