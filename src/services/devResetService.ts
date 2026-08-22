import type { CharacterRepository } from "../db/repositories/characterRepository";
import type { DevAccountResetRepository } from "../db/repositories/devAccountResetRepository";

export type DevResetResult =
  | { state: "disabled" }
  | { state: "deleted" }
  | { state: "no-character" };

export type DevAccountResetResult =
  | { state: "disabled" }
  | { state: "deleted" }
  | { state: "no-account" }
  | { state: "unavailable" };

export class DevResetService {
  constructor(
    private readonly characters: CharacterRepository,
    private readonly nodeEnv: string,
    private readonly accounts?: DevAccountResetRepository
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

  async resetEntireAccount(telegramUserId: bigint): Promise<DevAccountResetResult> {
    if (!this.isEnabled()) {
      return { state: "disabled" };
    }
    if (!this.accounts) {
      return { state: "unavailable" };
    }

    const deleted = await this.accounts.deleteEverythingByTelegramUserId(telegramUserId);
    return deleted ? { state: "deleted" } : { state: "no-account" };
  }
}
