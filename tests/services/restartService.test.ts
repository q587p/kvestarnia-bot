import { describe, expect, it } from "vitest";
import type { RestartCharacterResult, RestartRepository } from "../../src/db/repositories/restartRepository";
import { RestartService } from "../../src/services/restartService";

describe("RestartService", () => {
  it("deletes only the current user's character", async () => {
    const characters = new FakeRestartRepository();
    characters.add(42n, "character-current");
    characters.add(77n, "character-other");
    const service = new RestartService(characters);

    await expect(service.restartCurrentUser(42n)).resolves.toEqual({ state: "deleted" });

    expect(characters.has(42n)).toBe(false);
    expect(characters.has(77n)).toBe(true);
  });

  it("returns no-character when there is nothing to delete", async () => {
    const service = new RestartService(new FakeRestartRepository());

    await expect(service.restartCurrentUser(42n)).resolves.toEqual({ state: "no-character" });
  });

  it("returns active-combat without deleting the character", async () => {
    const characters = new FakeRestartRepository();
    characters.add(42n, "character-current");
    characters.block(42n);
    const service = new RestartService(characters);

    await expect(service.restartCurrentUser(42n)).resolves.toEqual({ state: "active-combat" });
    expect(characters.has(42n)).toBe(true);
  });
});

class FakeRestartRepository implements RestartRepository {
  private readonly characterIdsByTelegramUserId = new Map<bigint, string>();
  private readonly blockedTelegramUserIds = new Set<bigint>();

  add(telegramUserId: bigint, characterId: string): void {
    this.characterIdsByTelegramUserId.set(telegramUserId, characterId);
  }

  block(telegramUserId: bigint): void {
    this.blockedTelegramUserIds.add(telegramUserId);
  }

  has(telegramUserId: bigint): boolean {
    return this.characterIdsByTelegramUserId.has(telegramUserId);
  }

  restartByTelegramUserId(telegramUserId: bigint): Promise<RestartCharacterResult> {
    if (!this.characterIdsByTelegramUserId.has(telegramUserId)) {
      return Promise.resolve("no-character");
    }
    if (this.blockedTelegramUserIds.has(telegramUserId)) {
      return Promise.resolve("active-combat");
    }
    this.characterIdsByTelegramUserId.delete(telegramUserId);
    return Promise.resolve("deleted");
  }
}
