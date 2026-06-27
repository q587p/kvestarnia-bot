import type { Prisma } from "@prisma/client";

export interface AchievementUnlockSource {
  type: string;
  id?: string | null;
  payload?: unknown;
  occurredAt: Date;
}

export interface CharacterAchievementRecord {
  id: string;
  characterId: string;
  achievementId: string;
  sourceType: string;
  sourceId: string | null;
  sourceJson: Prisma.JsonValue | null;
  unlockedAt: Date;
  notifiedAt: Date | null;
  createdAt: Date;
}

export interface CharacterAchievementProgressRecord {
  id: string;
  characterId: string;
  achievementId: string;
  current: number;
  target: number | null;
  updatedAt: Date;
  createdAt: Date;
}

export interface CharacterCosmeticTitleGrantRecord {
  id: string;
  characterId: string;
  titleGrantId: string;
  achievementId: string;
  sourceType: string;
  sourceId: string | null;
  grantedAt: Date;
  createdAt: Date;
}

export interface CharacterAchievementSnapshot {
  achievements: CharacterAchievementRecord[];
  progress: CharacterAchievementProgressRecord[];
  titleGrants: CharacterCosmeticTitleGrantRecord[];
}

export interface UnlockAchievementInput {
  characterId: string;
  achievementId: string;
  source: AchievementUnlockSource;
  cosmeticTitleGrantId?: string;
}

export interface UnlockAchievementResult {
  created: boolean;
  achievement: CharacterAchievementRecord;
  titleGrant: CharacterCosmeticTitleGrantRecord | null;
}

export interface AchievementRepository {
  listForCharacter(characterId: string): Promise<CharacterAchievementSnapshot>;
  unlockAchievement(input: UnlockAchievementInput): Promise<UnlockAchievementResult>;
  updateProgressMax(input: {
    characterId: string;
    achievementId: string;
    current: number;
    target?: number;
  }): Promise<CharacterAchievementProgressRecord>;
}
