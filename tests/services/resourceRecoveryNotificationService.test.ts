import { describe, expect, it } from "vitest";
import type {
  CharacterRecord,
  CharacterRepository,
  CreateCharacterResult,
  RecoverableHpCharacterRecord,
  UpdateCharacterResourcesInput
} from "../../src/db/repositories/characterRepository";
import { ResourceRecoveryNotificationService } from "../../src/services/resourceRecoveryNotificationService";

describe("ResourceRecoveryNotificationService", () => {
  it("syncs due HP recovery and returns a one-shot full-health notification", async () => {
    const now = new Date("2026-06-21T10:00:00.000Z");
    const marker = new Date("2026-06-21T09:40:00.000Z");
    const repository = new FakeCharacterRepository([
      {
        telegramUserId: 42n,
        character: createCharacter({
          hpCurrent: 1,
          manaCurrent: 10,
          hpRegenAt: marker,
          manaRegenAt: marker
        })
      }
    ]);
    const service = new ResourceRecoveryNotificationService(repository, undefined, () => now);

    const first = await service.resolveDueHpFullNotifications();
    const second = await service.resolveDueHpFullNotifications();

    expect(first).toEqual([
      {
        telegramUserId: 42n,
        notice: {
          type: "hp-full",
          hpCurrent: 40,
          hpMax: 40
        }
      }
    ]);
    expect(second).toEqual([]);
    expect(repository.resourceUpdates).toHaveLength(1);
    expect(repository.resourceUpdates[0]?.expected).toMatchObject({
      hpCurrent: 1,
      manaCurrent: 10,
      hpRegenAt: marker,
      manaRegenAt: marker
    });
  });

  it("stays inert when a repository cannot list proactive recovery candidates", async () => {
    const repository = new MinimalCharacterRepository(createCharacter());
    const service = new ResourceRecoveryNotificationService(repository, undefined, () => {
      return new Date("2026-06-21T10:00:00.000Z");
    });

    await expect(service.resolveDueHpFullNotifications()).resolves.toEqual([]);
  });
});

class FakeCharacterRepository implements CharacterRepository {
  resourceUpdates: UpdateCharacterResourcesInput[] = [];
  private readonly characters = new Map<bigint, CharacterRecord>();

  constructor(candidates: RecoverableHpCharacterRecord[]) {
    for (const candidate of candidates) {
      this.characters.set(candidate.telegramUserId, candidate.character);
    }
  }

  listRecoverableHpCharacters(): Promise<RecoverableHpCharacterRecord[]> {
    return Promise.resolve(
      [...this.characters.entries()]
        .filter(([, character]) => character.hpCurrent < character.hpMax)
        .map(([telegramUserId, character]) => ({ telegramUserId, character }))
    );
  }

  findByUserId(): Promise<CharacterRecord | null> {
    return Promise.resolve(this.characters.values().next().value ?? null);
  }

  findByTelegramUserId(telegramUserId: bigint): Promise<CharacterRecord | null> {
    return Promise.resolve(this.characters.get(telegramUserId) ?? null);
  }

  updateResourcesForTelegramUser(
    telegramUserId: bigint,
    input: UpdateCharacterResourcesInput
  ): Promise<CharacterRecord | null> {
    this.resourceUpdates.push(input);
    const character = this.characters.get(telegramUserId);

    if (!character) {
      return Promise.resolve(null);
    }

    const updated = {
      ...character,
      hpCurrent: input.hpCurrent,
      manaCurrent: input.manaCurrent,
      hpRegenAt: input.hpRegenAt,
      manaRegenAt: input.manaRegenAt
    };
    this.characters.set(telegramUserId, updated);

    return Promise.resolve(updated);
  }

  deleteByTelegramUserId(): Promise<boolean> {
    return Promise.resolve(false);
  }

  createForTelegramUserIfMissing(): Promise<CreateCharacterResult> {
    return Promise.resolve({
      character: createCharacter(),
      created: false
    });
  }
}

class MinimalCharacterRepository implements CharacterRepository {
  constructor(private readonly character: CharacterRecord) {}

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
