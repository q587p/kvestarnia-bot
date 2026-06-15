import type { TelegramUserProfile } from "./userRepository";

export interface CharacterRecord {
  id: string;
  userId: string;
  currentLocationId?: string | null;
  name: string;
  pronoun: string;
  path: string;
  raceId: string;
  classId: string;
  level: number;
  xp: number;
  gold: number;
  hpCurrent: number;
  hpMax: number;
  manaCurrent: number;
  manaMax: number;
  hpRegenAt?: Date | null;
  manaRegenAt?: Date | null;
  statsJson: unknown;
}

export interface CreateCharacterInput {
  name: string;
  pronoun: string;
  path: string;
  raceId: string;
  classId: string;
  level: number;
  xp: number;
  gold: number;
  hpCurrent: number;
  hpMax: number;
  manaCurrent: number;
  manaMax: number;
  statsJson: unknown;
}

export interface UpdateCharacterResourcesInput {
  hpCurrent: number;
  manaCurrent: number;
  hpRegenAt: Date;
  manaRegenAt: Date;
}

export interface CreateCharacterResult {
  character: CharacterRecord;
  created: boolean;
}

export interface CharacterRepository {
  findByUserId(userId: string): Promise<CharacterRecord | null>;
  findByTelegramUserId(telegramUserId: bigint): Promise<CharacterRecord | null>;
  updateResourcesForTelegramUser?(
    telegramUserId: bigint,
    input: UpdateCharacterResourcesInput
  ): Promise<CharacterRecord | null>;
  deleteByTelegramUserId(telegramUserId: bigint): Promise<boolean>;
  createForTelegramUserIfMissing(
    user: TelegramUserProfile,
    input: CreateCharacterInput
  ): Promise<CreateCharacterResult>;
}
