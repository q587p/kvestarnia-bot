import { describe, expect, it } from "vitest";
import type {
  CharacterRecord,
  CharacterRepository,
  CreateCharacterResult,
  UpdateCharacterResourcesInput
} from "../../src/db/repositories/characterRepository";
import { summarizeAndSyncCharacterResources } from "../../src/services/characterResourceService";

describe("summarizeAndSyncCharacterResources", () => {
  it("uses an expected resource snapshot when persisting passive regeneration", async () => {
    const now = new Date("2026-06-15T12:00:00.000Z");
    const marker = new Date("2026-06-15T11:50:00.000Z");
    const character = createCharacter({
      hpCurrent: 10,
      manaCurrent: 5,
      hpRegenAt: marker,
      manaRegenAt: marker
    });
    const repository = new FakeCharacterRepository(character);

    await summarizeAndSyncCharacterResources({
      characters: repository,
      telegramUserId: 42n,
      character,
      now
    });

    expect(repository.resourceUpdates).toHaveLength(1);
    expect(repository.resourceUpdates[0]?.expected).toEqual({
      hpCurrent: 10,
      manaCurrent: 5,
      hpRegenAt: marker,
      manaRegenAt: marker
    });
  });

  it("does not overwrite a fresher resource row when passive regeneration loses the update race", async () => {
    const now = new Date("2026-06-15T12:00:00.000Z");
    const marker = new Date("2026-06-15T11:50:00.000Z");
    const staleCharacter = createCharacter({
      hpCurrent: 10,
      manaCurrent: 5,
      hpRegenAt: marker,
      manaRegenAt: marker
    });
    const latestCharacter = createCharacter({
      hpCurrent: 3,
      manaCurrent: 1,
      hpRegenAt: now,
      manaRegenAt: now
    });
    const repository = new FakeCharacterRepository(latestCharacter, {
      rejectResourceUpdates: true
    });

    const result = await summarizeAndSyncCharacterResources({
      characters: repository,
      telegramUserId: 42n,
      character: staleCharacter,
      now
    });

    expect(repository.resourceUpdates).toHaveLength(1);
    expect(repository.refetchCount).toBe(1);
    expect(result.character.hpCurrent).toBe(3);
    expect(result.character.manaCurrent).toBe(1);
  });
});

class FakeCharacterRepository implements CharacterRepository {
  resourceUpdates: UpdateCharacterResourcesInput[] = [];
  refetchCount = 0;

  constructor(
    private readonly character: CharacterRecord,
    private readonly options: { rejectResourceUpdates?: boolean } = {}
  ) {}

  findByUserId(): Promise<CharacterRecord | null> {
    return Promise.resolve(this.character);
  }

  findByTelegramUserId(): Promise<CharacterRecord | null> {
    this.refetchCount += 1;

    return Promise.resolve(this.character);
  }

  updateResourcesForTelegramUser(
    _telegramUserId: bigint,
    input: UpdateCharacterResourcesInput
  ): Promise<CharacterRecord | null> {
    this.resourceUpdates.push(input);

    return Promise.resolve(this.options.rejectResourceUpdates ? null : this.character);
  }

  deleteByTelegramUserId(): Promise<boolean> {
    return Promise.resolve(false);
  }

  createForTelegramUserIfMissing(): Promise<CreateCharacterResult> {
    return Promise.resolve({
      character: this.character,
      created: false
    });
  }
}

function createCharacter(overrides: Partial<CharacterRecord> = {}): CharacterRecord {
  return {
    id: "character-1",
    userId: "user-1",
    currentLocationId: "place.korchma.hall",
    name: "Тестовий Пригодник",
    pronoun: "they",
    path: "boundary",
    raceId: "race.human-ish",
    classId: "class.bureaucramancer",
    level: 4,
    xp: 120,
    gold: 30,
    hpCurrent: 10,
    hpMax: 20,
    manaCurrent: 5,
    manaMax: 10,
    hpRegenAt: null,
    manaRegenAt: null,
    statsJson: {
      strength: 6,
      agility: 6,
      intelligence: 6,
      charisma: 6,
      luck: 6
    },
    ...overrides
  };
}
