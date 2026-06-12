import type { CharacterRepository } from "../db/repositories/characterRepository";

export type RestartResult = { state: "deleted" } | { state: "no-character" };

export class RestartService {
  constructor(private readonly characters: CharacterRepository) {}

  async restartCurrentUser(telegramUserId: bigint): Promise<RestartResult> {
    const deleted = await this.characters.deleteByTelegramUserId(telegramUserId);

    return deleted ? { state: "deleted" } : { state: "no-character" };
  }
}
