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

export interface CharacterCosmeticTitleSnapshot {
  characterId: string;
  activeTitleGrantId: string | null;
  remortCount: number;
  titleGrants: CharacterCosmeticTitleGrantRecord[];
}

export interface AchievementRecalculationSnapshot {
  characterId: string;
  level: number;
  raceId: string;
  classId: string;
  createdAt: Date;
  historicalIdentities: ReadonlyArray<{
    raceId: string;
    classId: string;
    occurredAt: Date;
  }>;
  levelReachedAt: Readonly<Record<number, Date>>;
  combat: {
    won: number;
    lost: number;
    fled: number;
    expired: number;
  };
  combatFinishedAt: {
    won: Date[];
    lost: Date[];
    fled: Date[];
    expired: Date[];
  };
  completedProblemQuestStages: number;
  problemQuestCompletedAt: Date[];
  inventoryItemQuantity: number;
  inventoryItemQuantities: Readonly<Record<string, number>>;
  inventoryItemRows: Readonly<Record<string, {
    quantity: number;
    createdAt: Date;
    updatedAt: Date;
  }>>;
  firstInventoryItemReceivedAt: Date | null;
  inventoryObservedAt: Date | null;
  equippedItemCount: number;
  firstEquippedItemAt: Date | null;
  equipmentObservedAt: Date | null;
  activeCosmeticTitleGrantId: string | null;
  activityDates: Readonly<Record<string, readonly Date[]>>;
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
  listCosmeticTitlesForCharacter(characterId: string): Promise<CharacterCosmeticTitleSnapshot | null>;
  setActiveCosmeticTitle(input: {
    characterId: string;
    titleGrantRowId: string;
    expectedRemortCount?: number;
  }): Promise<"selected" | "already-active" | "not-owned" | "stale-life" | "no-character">;
  clearActiveCosmeticTitle(input: {
    characterId: string;
    expectedRemortCount?: number;
  }): Promise<"cleared" | "already-clear" | "stale-life" | "no-character">;
  getRecalculationSnapshot(characterId: string): Promise<AchievementRecalculationSnapshot | null>;
  unlockAchievement(input: UnlockAchievementInput): Promise<UnlockAchievementResult>;
  updateProgressMax(input: {
    characterId: string;
    achievementId: string;
    current: number;
    target?: number;
  }): Promise<CharacterAchievementProgressRecord>;
}
