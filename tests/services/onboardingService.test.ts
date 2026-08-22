import { describe, expect, it, vi } from "vitest";
import type {
  CharacterRecord,
  CharacterRepository,
  CreateCharacterInput,
  CreateCharacterResult
} from "../../src/db/repositories/characterRepository";
import { PendingReferralConsentError } from "../../src/db/repositories/characterRepository";
import type {
  TelegramUserProfile,
  UserRecord,
  UserRepository
} from "../../src/db/repositories/userRepository";
import type { PublicActivityEventPublisher } from "../../src/services/publicActivityEventPublisher";
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

    const result = await service.complete(player, "he", "race.human-ish", "class.warrior");

    expect(result.ok).toBe(true);
    expect(characters.createCount).toBe(1);
    if (result.ok) {
      expect(result.value.created).toBe(true);
      expect(result.value.character.pronoun).toBe("he");
      expect(result.value.character.pronounLabel).toBe("Він");
      expect(result.value.character.path).toBe("sun");
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

    await service.complete(player, "they", "race.human-ish", "class.warrior");
    const repeated = await service.complete(player, "they", "race.human-ish", "class.warrior");

    expect(repeated.ok).toBe(true);
    expect(characters.createCount).toBe(1);
    if (repeated.ok) {
      expect(repeated.value.created).toBe(false);
      expect(repeated.value.character.classId).toBe("class.warrior");
    }
  });

  it("emits one public activity event when a character is created", async () => {
    const users = new FakeUserRepository();
    const characters = new FakeCharacterRepository(users);
    const recordCharacterCreatedSafely =
      vi.fn<PublicActivityEventPublisher["recordCharacterCreatedSafely"]>().mockResolvedValue(null);
    const service = new OnboardingService(
      users,
      characters,
      undefined,
      { recordCharacterCreatedSafely } as unknown as PublicActivityEventPublisher
    );

    await service.complete(player, "he", "race.human-ish", "class.warrior");
    await service.complete(player, "he", "race.human-ish", "class.warrior");

    expect(recordCharacterCreatedSafely).toHaveBeenCalledTimes(1);
    expect(recordCharacterCreatedSafely).toHaveBeenCalledWith(expect.objectContaining({
      characterId: "character-1",
      actorDisplayName: "Тестовий Герой із надто довгим і"
    }));
  });

  it("blocks direct character completion while referral consent is pending", async () => {
    const users = new FakeUserRepository();
    const characters = new FakeCharacterRepository(users);
    vi.spyOn(characters, "createForTelegramUserIfMissing")
      .mockRejectedValue(new PendingReferralConsentError());
    const service = new OnboardingService(users, characters);

    await expect(service.complete(player, "he", "race.human-ish", "class.warrior"))
      .resolves.toEqual({ ok: false, error: { type: "pending-referral-consent" } });
  });

  it("publishes one referral arrival instead of the generic character arrival", async () => {
    const users = new FakeUserRepository();
    const characters = new FakeCharacterRepository(users);
    const created = await characters.createForTelegramUserIfMissing(player, {
      name: "Прибула",
      pronoun: "they",
      path: "boundary",
      raceId: "race.human-ish",
      classId: "class.warrior",
      level: 1,
      xp: 0,
      gold: 0,
      hpCurrent: 25,
      hpMax: 25,
      manaCurrent: 10,
      manaMax: 10,
      statsJson: { strength: 5, dexterity: 5, intelligence: 5, charisma: 5, luck: 5 }
    });
    vi.spyOn(characters, "createForTelegramUserIfMissing").mockResolvedValue({
      ...created,
      created: true,
      referralArrival: {
        attributionId: "attribution-1",
        inviterUserId: "inviter-user",
        inviterNameSnapshot: "Кличко",
        inviteeNameSnapshot: "Прибула",
        arrivedAt: new Date("2026-08-19T09:00:00.000Z")
      }
    });
    const recordCharacterCreatedSafely = vi.fn().mockResolvedValue(null);
    const recordReferralArrivedSafely = vi.fn().mockResolvedValue(null);
    const service = new OnboardingService(users, characters, undefined, {
      recordCharacterCreatedSafely,
      recordReferralArrivedSafely
    } as unknown as PublicActivityEventPublisher);

    await service.complete(player, "they", "race.human-ish", "class.warrior");

    expect(recordReferralArrivedSafely).toHaveBeenCalledWith({
      characterId: created.character.id,
      inviteeDisplayName: "Прибула",
      inviterUserId: "inviter-user",
      inviterDisplayName: "Кличко",
      attributionId: "attribution-1",
      occurredAt: new Date("2026-08-19T09:00:00.000Z")
    });
    expect(recordCharacterCreatedSafely).not.toHaveBeenCalled();
  });

  it("returns hero summary path for /start when character exists", async () => {
    const users = new FakeUserRepository();
    const characters = new FakeCharacterRepository(users);
    const service = new OnboardingService(users, characters);

    await service.complete(player, "she", "race.dwarf", "class.bureaucramancer");
    const start = await service.start(player);

    expect(start.state).toBe("existing-character");
    if (start.state === "existing-character") {
      expect(start.character.raceName).toBe("Гном");
      expect(start.character.className).toBe("Бюрокромант");
      expect(start.character.path).toBe("moon");
    }
  });

  it("supports the full gender, race, class, and confirm happy path", async () => {
    const service = new OnboardingService(
      new FakeUserRepository(),
      new FakeCharacterRepository(new FakeUserRepository())
    );

    expect(service.selectRace("they", "race.molfar-soul")).toEqual({
      ok: true,
      value: {
        pronoun: "they",
        raceId: "race.molfar-soul"
      }
    });
    expect(service.selectClass("they", "race.molfar-soul", "class.bureaucramancer")).toEqual({
      ok: true,
      value: {
        pronoun: "they",
        raceId: "race.molfar-soul",
        classId: "class.bureaucramancer"
      }
    });

    const created = await service.complete(
      player,
      "they",
      "race.molfar-soul",
      "class.bureaucramancer"
    );

    expect(created.ok).toBe(true);
    if (created.ok) {
      expect(created.value.character.title).toBe("Писарі Оберегових Справ");
      expect(created.value.character.path).toBe("boundary");
    }
  });

  it("returns an error for invalid race, class, or pronoun", async () => {
    const service = new OnboardingService(
      new FakeUserRepository(),
      new FakeCharacterRepository(new FakeUserRepository())
    );

    expect(service.selectRace("dragon", "race.human-ish")).toEqual({
      ok: false,
      error: { type: "invalid-pronoun" }
    });
    expect(service.selectRace("they", "race.nope")).toEqual({
      ok: false,
      error: { type: "invalid-race" }
    });
    await expect(service.complete(player, "they", "race.nope", "class.warrior")).resolves.toEqual({
      ok: false,
      error: { type: "invalid-race" }
    });
    await expect(
      service.complete(player, "they", "race.human-ish", "class.nope")
    ).resolves.toEqual({
      ok: false,
      error: { type: "invalid-class" }
    });
  });

  it("rejects unavailable race and class selections, including direct callback bypass", async () => {
    const service = new OnboardingService(
      new FakeUserRepository(),
      new FakeCharacterRepository(new FakeUserRepository())
    );

    expect(service.selectRace("she", "race.not-a-race")).toEqual({
      ok: false,
      error: { type: "invalid-race" }
    });
    const unavailableDrantohor = service.selectRace("he", "race.drantohor");
    expect(unavailableDrantohor.ok).toBe(false);
    if (!unavailableDrantohor.ok) {
      expect(unavailableDrantohor.error.type).toBe("unavailable-race");
      expect(unavailableDrantohor.error.reason).toContain("стежками Межі");
    }

    const unavailableClass = service.selectClass(
      "they",
      "race.molfar-soul",
      "class.varenyk-mancer"
    );
    expect(unavailableClass.ok).toBe(false);
    if (!unavailableClass.ok) {
      expect(unavailableClass.error.type).toBe("unavailable-class");
      expect(unavailableClass.error.reason).toContain("Обереги");
    }

    const bypass = await service.complete(
      player,
      "they",
      "race.molfar-soul",
      "class.varenyk-mancer"
    );
    expect(bypass.ok).toBe(false);
    if (!bypass.ok) {
      expect(bypass.error.type).toBe("unavailable-class");
    }
  });

  it("creates the new kharakternyk class without exposing a path name", async () => {
    const service = new OnboardingService(
      new FakeUserRepository(),
      new FakeCharacterRepository(new FakeUserRepository())
    );

    const created = await service.complete(
      player,
      "they",
      "race.drantohor",
      "class.kharakternyk"
    );

    expect(created.ok).toBe(true);
    if (created.ok) {
      expect(created.value.character.raceName).toBe("Дрантогор");
      expect(created.value.character.className).toBe("Козак-характерник");
      expect(created.value.character.title).toBe("Межові Заблуканці");
      expect(created.value.character.path).toBe("boundary");
    }
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
