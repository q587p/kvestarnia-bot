import { describe, expect, it } from "vitest";
import type {
  ClassNoncombatRepository,
  PriestBlessingRecord
} from "../../src/db/repositories/classNoncombatRepository";
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
import type { ShynokDrinkStateRecord } from "../../src/db/repositories/shynokRepository";
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

  it("offers restore-to-full from hero lookup only when bandages cover the missing HP", async () => {
    const enough = new HeroService(
      new FakeCharacterRepository(buildCharacter({ hpCurrent: 8, hpMax: 22 })),
      new FakeInventoryRepository([
        buildItem({ itemId: "item.responsible-panic-bandage", quantity: 2 })
      ])
    );
    const notEnough = new HeroService(
      new FakeCharacterRepository(buildCharacter({ hpCurrent: 8, hpMax: 22 })),
      new FakeInventoryRepository([
        buildItem({ itemId: "item.responsible-panic-bandage", quantity: 1 })
      ])
    );

    await expect(enough.findByTelegramUserId(telegramUserId)).resolves.toMatchObject({
      state: "existing-character",
      restoreToFullItemId: "item.responsible-panic-bandage"
    });
    await expect(notEnough.findByTelegramUserId(telegramUserId)).resolves.toMatchObject({
      state: "existing-character",
      restoreToFullItemId: null
    });
  });

  it("returns the current Shynok drink for hero presentation", async () => {
    const activeDrink = buildDrinkState({
      drinkKey: "drink.pepper-vodka",
      phase: "queued",
      expiresAt: new Date("2026-06-23T10:23:00.000Z")
    });
    const historicalDrink = buildDrinkState({
      drinkKey: "drink.fine-beer",
      phase: "timed",
      startedAt: new Date("2026-06-23T09:00:00.000Z"),
      expiresAt: new Date("2026-06-23T09:42:00.000Z")
    });
    const service = new HeroService(
      new FakeCharacterRepository(buildCharacter()),
      new FakeInventoryRepository([]),
      undefined,
      undefined,
      new FakeShynokRepository(activeDrink, historicalDrink),
      () => new Date("2026-06-23T10:05:00.000Z")
    );

    const result = await service.findByTelegramUserId(telegramUserId);

    expect(result).toMatchObject({
      state: "existing-character",
      activeDrink: {
        key: "drink.pepper-vodka",
        name: "Горілка з перцем",
        emoji: "🥃",
        phase: "queued",
        outgoingDamageMultiplierBp: 11300,
        incomingDamageMultiplierBp: 11300
      }
    });
  });

  it("returns the active Priest blessing for hero presentation", async () => {
    const service = new HeroService(
      new FakeCharacterRepository(buildCharacter()),
      new FakeInventoryRepository([]),
      undefined,
      undefined,
      undefined,
      () => new Date("2026-07-03T09:00:00.000Z"),
      undefined,
      new FakeClassNoncombatRepository({
        id: "blessing-1",
        actorName: "Мандрівник",
        targetName: "Мандрівник",
        expiresAt: new Date("2026-07-03T09:13:00.000Z"),
        bonusStat: null,
        bonusAmount: 0
      })
    );

    const result = await service.findByTelegramUserId(telegramUserId);

    expect(result).toMatchObject({
      state: "existing-character",
      character: {
        stats: {
          luck: 8
        }
      },
      activePriestBlessing: {
        actorName: "Мандрівник",
        targetName: "Мандрівник",
        expiresAt: new Date("2026-07-03T09:13:00.000Z"),
        bonusStat: "luck",
        bonusAmount: 1
      }
    });
  });

  it("does not apply an expired Priest blessing bonus to the hero summary", async () => {
    const service = new HeroService(
      new FakeCharacterRepository(buildCharacter()),
      new FakeInventoryRepository([]),
      undefined,
      undefined,
      undefined,
      () => new Date("2026-07-03T09:14:00.000Z"),
      undefined,
      new FakeClassNoncombatRepository({
        id: "blessing-1",
        actorName: "Мандрівник",
        targetName: "Мандрівник",
        expiresAt: new Date("2026-07-03T09:13:00.000Z"),
        bonusStat: "luck",
        bonusAmount: 5
      })
    );

    const result = await service.findByTelegramUserId(telegramUserId);

    expect(result).toMatchObject({
      state: "existing-character",
      character: {
        stats: {
          luck: 7
        }
      }
    });
  });

  it("reports when class noncombat shortcuts are blocked by an active flow", async () => {
    const service = new HeroService(
      new FakeCharacterRepository(buildCharacter()),
      new FakeInventoryRepository([]),
      undefined,
      undefined,
      undefined,
      () => new Date("2026-07-03T09:00:00.000Z"),
      undefined,
      new FakeClassNoncombatRepository(null, true)
    );

    await expect(service.findByTelegramUserId(telegramUserId)).resolves.toMatchObject({
      state: "existing-character",
      classNoncombatBlocked: true
    });
  });

  it("returns Priest self-blessing wait for hero shortcuts", async () => {
    const availableAt = new Date("2026-07-03T10:33:00.000Z");
    const service = new HeroService(
      new FakeCharacterRepository(buildCharacter({ classId: "class.priest", level: 3 })),
      new FakeInventoryRepository([]),
      undefined,
      undefined,
      undefined,
      () => new Date("2026-07-03T09:00:00.000Z"),
      undefined,
      new FakeClassNoncombatRepository(null, false, availableAt)
    );

    await expect(service.findByTelegramUserId(telegramUserId)).resolves.toMatchObject({
      state: "existing-character",
      priestSelfBlessAvailableAt: availableAt
    });
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

function buildDrinkState(overrides: Partial<ShynokDrinkStateRecord> = {}): ShynokDrinkStateRecord {
  return {
    id: "drink-state-1",
    activationId: "activation-1",
    characterId: "character-42",
    remortCount: 0,
    drinkKey: "drink.simple-beer",
    phase: "timed",
    startedAt: new Date("2026-06-23T10:00:00.000Z"),
    expiresAt: new Date("2026-06-23T10:23:00.000Z"),
    sourceType: "self_purchase",
    sourceId: "order-1",
    metadata: null,
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

class FakeShynokRepository {
  constructor(
    private readonly activeDrink: ShynokDrinkStateRecord | null,
    private readonly recoveryDrink: ShynokDrinkStateRecord | null
  ) {}

  getActiveDrinkForTelegramUser(): Promise<ShynokDrinkStateRecord | null> {
    return Promise.resolve(this.activeDrink);
  }

  getRecoveryDrinkForTelegramUser(): Promise<ShynokDrinkStateRecord | null> {
    return Promise.resolve(this.recoveryDrink);
  }
}

class FakeClassNoncombatRepository implements Pick<
  ClassNoncombatRepository,
  "getActivePriestBlessingForTelegramUser" | "getPriestSelfBlessAvailableAtForTelegramUser" | "isActorBlockedForTelegramUser"
> {
  constructor(
    private readonly blessing: PriestBlessingRecord | null,
    private readonly actorBlocked = false,
    private readonly selfBlessAvailableAt: Date | null = null
  ) {}

  getActivePriestBlessingForTelegramUser(): Promise<PriestBlessingRecord | null> {
    return Promise.resolve(this.blessing);
  }

  getPriestSelfBlessAvailableAtForTelegramUser(): Promise<Date | null> {
    return Promise.resolve(this.selfBlessAvailableAt);
  }

  isActorBlockedForTelegramUser(): Promise<boolean> {
    return Promise.resolve(this.actorBlocked);
  }
}
