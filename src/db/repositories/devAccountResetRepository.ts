export interface DevAccountResetRepository {
  deleteEverythingByTelegramUserId(telegramUserId: bigint): Promise<boolean>;
}
