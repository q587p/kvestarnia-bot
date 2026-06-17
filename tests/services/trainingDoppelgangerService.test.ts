import { describe, expect, it } from "vitest";
import type {
  CharacterRecord,
  CharacterRepository,
  CreateCharacterInput,
  CreateCharacterResult
} from "../../src/db/repositories/characterRepository";
import type {
  CharacterEquipmentRecord,
  CharacterEquipmentSnapshot,
  EquipmentRepository
} from "../../src/db/repositories/equipmentRepository";
import type { TelegramUserProfile } from "../../src/db/repositories/userRepository";
import { TrainingDoppelgangerService } from "../../src/services/trainingDoppelgangerService";

const telegramUserId = 42n;
const fixedNow = () => new Date("2026-06-17T09:30:00.000Z");

describe("TrainingDoppelgangerService", () => {
  it("returns no-character without mutating anything", async () => {
    const service = new TrainingDoppelgangerService(new FakeCharacterRepository(), undefined, fixedNow);

    await expect(service.getForTelegramUser(telegramUserId)).resolves.toEqual({
      state: "no-character"
    });
  });

  it("does not start training at zero HP", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { hpCurrent: 0 });
    const service = new TrainingDoppelgangerService(characters, undefined, fixedNow);

    const result = await service.getForTelegramUser(telegramUserId);

    expect(result).toMatchObject({
      state: "needs-rest",
      character: {
        hpCurrent: 0
      }
    });
  });

  it("returns a deterministic replay-safe training card without rewards", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId);
    const equipment = new FakeEquipmentRepository({
      characterId: "character-42",
      equipment: [
        buildEquipment({
          slot: "weapon",
          itemId: "item.pan-of-persuasion"
        })
      ]
    });
    const service = new TrainingDoppelgangerService(characters, equipment, fixedNow);

    const first = await service.getForTelegramUser(telegramUserId);
    const second = await service.getForTelegramUser(telegramUserId);

    expect(first).toMatchObject({
      state: "ready",
      character: {
        name: "Мандрівник",
        level: 3
      },
      doppelganger: {
        name: "Сумлінний Допельґанґер",
        raceName: "Людисько",
        className: "Воїн",
        level: 3
      }
    });
    expect(second).toEqual(first);
    expect(characters.rewardMutations).toBe(0);
    expect(characters.resourceMutations).toBe(0);
  });
});

function buildEquipment(overrides: Partial<CharacterEquipmentRecord>): CharacterEquipmentRecord {
  return {
    id: "equipment-1",
    characterId: "character-42",
    slot: "weapon",
    itemId: "item.pan-of-persuasion",
    createdAt: fixedNow(),
    updatedAt: fixedNow(),
    ...overrides
  };
}

class FakeCharacterRepository implements CharacterRepository {
  private readonly charactersByTelegramUserId = new Map<bigint, CharacterRecord>();
  rewardMutations = 0;
  resourceMutations = 0;

  add(userTelegramId: bigint, overrides: Partial<CharacterRecord> = {}): void {
    this.charactersByTelegramUserId.set(userTelegramId, {
      id: `character-${userTelegramId.toString()}`,
      userId: `user-${userTelegramId.toString()}`,
      name: "Мандрівник",
      pronoun: "they",
      path: "path.sun",
      raceId: "race.human-ish",
      classId: "class.warrior",
      level: 3,
      xp: 25,
      gold: 7,
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
    });
  }

  findByUserId(userId: string): Promise<CharacterRecord | null> {
    return Promise.resolve(
      [...this.charactersByTelegramUserId.values()].find((character) => character.userId === userId) ??
        null
    );
  }

  findByTelegramUserId(userTelegramId: bigint): Promise<CharacterRecord | null> {
    return Promise.resolve(this.charactersByTelegramUserId.get(userTelegramId) ?? null);
  }

  updateResourcesForTelegramUser(): Promise<CharacterRecord | null> {
    this.resourceMutations += 1;
    return Promise.resolve(null);
  }

  deleteByTelegramUserId(userTelegramId: bigint): Promise<boolean> {
    return Promise.resolve(this.charactersByTelegramUserId.delete(userTelegramId));
  }

  createForTelegramUserIfMissing(
    user: TelegramUserProfile,
    input: CreateCharacterInput
  ): Promise<CreateCharacterResult> {
    const existing = this.charactersByTelegramUserId.get(user.telegramUserId);

    if (existing) {
      return Promise.resolve({ character: existing, created: false });
    }

    const character: CharacterRecord = {
      id: `character-${user.telegramUserId.toString()}`,
      userId: `user-${user.telegramUserId.toString()}`,
      ...input
    };
    this.charactersByTelegramUserId.set(user.telegramUserId, character);

    return Promise.resolve({ character, created: true });
  }
}

class FakeEquipmentRepository implements EquipmentRepository {
  constructor(private snapshot: CharacterEquipmentSnapshot | null) {}

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
