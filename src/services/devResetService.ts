import type { CharacterRepository } from "../db/repositories/characterRepository";

export type DevResetResult =
  | { state: "disabled" }
  | { state: "deleted" }
  | { state: "no-character" };

export class DevResetService {
  constructor(
    private readonly characters: CharacterRepository,
    private readonly nodeEnv: string
  ) {}

  isEnabled(): boolean {
    return this.nodeEnv !== "production";
  }

  async resetCurrentUser(telegramUserId: bigint): Promise<DevResetResult> {
    if (!this.isEnabled()) {
      return { state: "disabled" };
    }

    const deleted = await this.characters.deleteByTelegramUserId(telegramUserId);

    return deleted ? { state: "deleted" } : { state: "no-character" };
  }
}
