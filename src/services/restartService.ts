import type { RestartRepository } from "../db/repositories/restartRepository";

export type RestartResult =
  | { state: "deleted" }
  | { state: "no-character" }
  | { state: "active-combat" }
  | { state: "active-party" };

export class RestartService {
  constructor(private readonly characters: RestartRepository) {}

  async restartCurrentUser(telegramUserId: bigint): Promise<RestartResult> {
    const result = await this.characters.restartByTelegramUserId(telegramUserId);

    return { state: result };
  }
}
