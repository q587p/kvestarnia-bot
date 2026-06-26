import type { TelegramUserProfile } from "./userRepository";

export interface PresenceRecord {
  telegramUserId: bigint;
  displayName?: string | null;
  characterName?: string | null;
  characterClassId?: string | null;
  characterLevel?: number | null;
  lastActionAt?: Date | null;
  lastSeenLocationId?: string | null;
  currentRaidId?: string | null;
  currentAdventureId?: string | null;
  showInPublicPresence?: boolean | null;
}

export interface MarkPresenceInput {
  user: TelegramUserProfile;
  at: Date;
  locationId?: string;
  currentRaidId?: string | null;
  currentAdventureId?: string | null;
}

export interface PresenceRepository {
  markAction(input: MarkPresenceInput): Promise<void>;
  findByTelegramUserId(telegramUserId: bigint): Promise<PresenceRecord | null>;
  listSeenSince(since: Date): Promise<PresenceRecord[]>;
  listKorchmaVisitors(limit: number): Promise<PresenceRecord[]>;
  listByLocationSeenSince(locationId: string, since: Date): Promise<PresenceRecord[]>;
  listByRaidSeenSince(currentRaidId: string, since: Date): Promise<PresenceRecord[]>;
  listByAdventureSeenSince(currentAdventureId: string, since: Date): Promise<PresenceRecord[]>;
}
