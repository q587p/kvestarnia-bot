import { describe, expect, it } from "vitest";
import type {
  CharacterRecord,
  CharacterRepository,
  CreateCharacterInput,
  CreateCharacterResult
} from "../../src/db/repositories/characterRepository";
import type { TelegramUserProfile } from "../../src/db/repositories/userRepository";
import { RestartService } from "../../src/services/restartService";

describe("RestartService", () => {
  it("deletes only the current user's character", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(42n, "character-current");
    characters.add(77n, "character-other");
    const service = new RestartService(characters);

    await expect(service.restartCurrentUser(42n)).resolves.toEqual({ state: "deleted" });

    await expect(characters.findByTelegramUserId(42n)).resolves.toBeNull();
    await expect(characters.findByTelegramUserId(77n)).resolves.toMatchObject({
      id: "character-other"
    });
  });

  it("returns no-character when there is nothing to delete", async () => {
    const characters = new FakeCharacterRepository();
    const service = new RestartService(characters);

    await expect(service.restartCurrentUser(42n)).resolves.toEqual({ state: "no-character" });
  });
});

class FakeCharacterRepository implements CharacterRepository {
  private readonly charactersByTelegramUserId = new Map<bigint, CharacterRecord>();

  add(telegramUserId: bigint, characterId: string): void {
    this.charactersByTelegramUserId.set(telegramUserId, {
      id: characterId,
      userId: `user-${telegramUserId.toString()}`,
      name: "Мандрівник",
      pronoun: "they",
      raceId: "race.human-ish",
      classId: "class.warrior",
      level: 1,
      xp: 0,
      gold: 0,
      hpCurrent: 20,
      hpMax: 20,
      manaCurrent: 10,
      manaMax: 10,
      statsJson: {
        strength: 6,
        dexterity: 6,
        intelligence: 6,
        charisma: 6,
        luck: 6
      }
    });
  }

  findByUserId(userId: string): Promise<CharacterRecord | null> {
    return Promise.resolve(
      [...this.charactersByTelegramUserId.values()].find((character) => character.userId === userId) ??
        null
    );
  }

  findByTelegramUserId(telegramUserId: bigint): Promise<CharacterRecord | null> {
    return Promise.resolve(this.charactersByTelegramUserId.get(telegramUserId) ?? null);
  }

  deleteByTelegramUserId(telegramUserId: bigint): Promise<boolean> {
    return Promise.resolve(this.charactersByTelegramUserId.delete(telegramUserId));
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
