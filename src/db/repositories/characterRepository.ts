import type { TelegramUserProfile } from "./userRepository";

export interface CharacterRecord {
  id: string;
  userId: string;
  name: string;
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

export interface CreateCharacterInput {
  name: string;
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

export interface CreateCharacterResult {
  character: CharacterRecord;
  created: boolean;
}

export interface CharacterRepository {
  findByUserId(userId: string): Promise<CharacterRecord | null>;
  createForTelegramUserIfMissing(
    user: TelegramUserProfile,
    input: CreateCharacterInput
  ): Promise<CreateCharacterResult>;
}
