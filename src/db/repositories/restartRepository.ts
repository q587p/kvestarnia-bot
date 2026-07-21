export type RestartCharacterResult = "deleted" | "no-character" | "active-combat";

export interface RestartRepository {
  restartByTelegramUserId(telegramUserId: bigint): Promise<RestartCharacterResult>;
}
