export type RestartCharacterResult = "deleted" | "no-character" | "active-combat" | "active-party";

export interface RestartRepository {
  restartByTelegramUserId(telegramUserId: bigint): Promise<RestartCharacterResult>;
}
