export interface TelegramUserProfile {
  telegramUserId: bigint;
  username?: string | undefined;
  displayName?: string | undefined;
  languageCode?: string | undefined;
}

export interface UserRecord {
  id: string;
  telegramUserId: bigint;
  username?: string | null;
  displayName?: string | null;
  languageCode?: string | null;
}

export interface UserRepository {
  upsertTelegramUser(input: TelegramUserProfile): Promise<UserRecord>;
  listTelegramUserIds(): Promise<bigint[]>;
}
