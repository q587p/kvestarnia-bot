import { describe, expect, it } from "vitest";
import type {
  CharacterRecord,
  CharacterRepository,
  CreateCharacterInput,
  CreateCharacterResult
} from "../../src/db/repositories/characterRepository";
import type {
  TelegramUserProfile,
  UserRecord,
  UserRepository
} from "../../src/db/repositories/userRepository";
import { OnboardingService } from "../../src/services/onboardingService";

const player: TelegramUserProfile = {
  telegramUserId: 42n,
  username: "tester",
  displayName: " Тестовий   Герой із надто довгим іменем ",
  languageCode: "uk"
};

describe("OnboardingService", () => {
  it("creates exactly one character for a new user class choice", async () => {
    const users = new FakeUserRepository();
    const characters = new FakeCharacterRepository(users);
    const service = new OnboardingService(users, characters);

    const result = await service.complete(player, "race.human-ish", "class.warrior");

    expect(result.ok).toBe(true);
    expect(characters.createCount).toBe(1);
    if (result.ok) {
      expect(result.value.created).toBe(true);
      expect(result.value.character.raceId).toBe("race.human-ish");
      expect(result.value.character.classId).toBe("class.warrior");
      expect(result.value.character.name).toBe("Тестовий Герой із надто довгим і");
      expect(result.value.character.name).toHaveLength(32);
    }
  });

  it("returns existing character for repeated class callbacks", async () => {
    const users = new FakeUserRepository();
    const characters = new FakeCharacterRepository(users);
    const service = new OnboardingService(users, characters);

    await service.complete(player, "race.human-ish", "class.warrior");
    const repeated = await service.complete(player, "race.human-ish", "class.warrior");

    expect(repeated.ok).toBe(true);
    expect(characters.createCount).toBe(1);
    if (repeated.ok) {
      expect(repeated.value.created).toBe(false);
      expect(repeated.value.character.classId).toBe("class.warrior");
    }
  });

  it("returns hero summary path for /start when character exists", async () => {
    const users = new FakeUserRepository();
    const characters = new FakeCharacterRepository(users);
    const service = new OnboardingService(users, characters);

    await service.complete(player, "race.dwarf", "class.priest");
    const start = await service.start(player);

    expect(start.state).toBe("existing-character");
    if (start.state === "existing-character") {
      expect(start.character.raceName).toBe("Гном");
      expect(start.character.className).toBe("Жрець");
    }
  });

  it("returns an error for invalid race or class", async () => {
    const service = new OnboardingService(
      new FakeUserRepository(),
      new FakeCharacterRepository(new FakeUserRepository())
    );

    expect(service.selectRace("race.nope")).toEqual({ ok: false, error: "invalid-race" });
    await expect(service.complete(player, "race.nope", "class.warrior")).resolves.toEqual({
      ok: false,
      error: "invalid-race"
    });
    await expect(service.complete(player, "race.human-ish", "class.nope")).resolves.toEqual({
      ok: false,
      error: "invalid-class"
    });
  });
});

class FakeUserRepository implements UserRepository {
  private readonly usersByTelegramId = new Map<bigint, UserRecord>();

  upsertTelegramUser(input: TelegramUserProfile): Promise<UserRecord> {
    const existing = this.usersByTelegramId.get(input.telegramUserId);

    if (existing) {
      const updated = {
        ...existing,
        username: input.username ?? null,
        displayName: input.displayName ?? null,
        languageCode: input.languageCode ?? null
      };
      this.usersByTelegramId.set(input.telegramUserId, updated);
      return Promise.resolve(updated);
    }

    const user = {
      id: `user-${this.usersByTelegramId.size + 1}`,
      telegramUserId: input.telegramUserId,
      username: input.username ?? null,
      displayName: input.displayName ?? null,
      languageCode: input.languageCode ?? null
    };
    this.usersByTelegramId.set(input.telegramUserId, user);
    return Promise.resolve(user);
  }
}

class FakeCharacterRepository implements CharacterRepository {
  private readonly charactersByUserId = new Map<string, CharacterRecord>();
  createCount = 0;

  constructor(private readonly users: UserRepository) {}

  findByUserId(userId: string): Promise<CharacterRecord | null> {
    return Promise.resolve(this.charactersByUserId.get(userId) ?? null);
  }

  findByTelegramUserId(telegramUserId: bigint): Promise<CharacterRecord | null> {
    void telegramUserId;
    return Promise.resolve(null);
  }

  deleteByTelegramUserId(telegramUserId: bigint): Promise<boolean> {
    void telegramUserId;
    return Promise.resolve(false);
  }

  async createForTelegramUserIfMissing(
    userInput: TelegramUserProfile,
    input: CreateCharacterInput
  ): Promise<CreateCharacterResult> {
    const user = await this.users.upsertTelegramUser(userInput);
    const existing = await this.findByUserId(user.id);

    if (existing) {
      return {
        character: existing,
        created: false
      };
    }

    this.createCount += 1;
    const character: CharacterRecord = {
      id: `character-${this.createCount}`,
      userId: user.id,
      ...input
    };
    this.charactersByUserId.set(user.id, character);

    return {
      character,
      created: true
    };
  }
}
