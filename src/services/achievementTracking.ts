import type { ItemGrant, RewardLevelChange } from "../db/repositories/dailyActionRepository";
import type {
  AchievementService,
  AchievementSimpleEventType,
  AchievementUnlock
} from "./achievementService";

export interface TrackRewardAchievementInput {
  characterId: string;
  sourceId: string;
  occurredAt: Date;
  levelChange?: RewardLevelChange | null;
  itemGrants?: readonly ItemGrant[];
  itemIds?: readonly string[];
  events?: readonly AchievementSimpleEventType[];
}

export async function trackRewardAchievementsSafely(
  achievements: AchievementService | undefined,
  input: TrackRewardAchievementInput
): Promise<AchievementUnlock[]> {
  if (!achievements) {
    return [];
  }

  const unlocks: AchievementUnlock[] = [];

  if (input.levelChange) {
    unlocks.push(
      ...(await achievements.trackEventSafely({
        type: "level.reached",
        characterId: input.characterId,
        level: input.levelChange.newLevel,
        occurredAt: input.occurredAt,
        sourceId: input.sourceId
      }))
    );
  }

  const itemIds = [
    ...(input.itemIds ?? []),
    ...(input.itemGrants ? expandItemGrantIds(input.itemGrants) : [])
  ];

  if (itemIds.length > 0) {
    unlocks.push(
      ...(await achievements.trackEventSafely({
        type: "item.received",
        characterId: input.characterId,
        itemIds,
        occurredAt: input.occurredAt,
        sourceId: input.sourceId
      }))
    );
  }

  for (const type of input.events ?? []) {
    unlocks.push(
      ...(await achievements.trackEventSafely({
        type,
        characterId: input.characterId,
        occurredAt: input.occurredAt,
        sourceId: input.sourceId
      }))
    );
  }

  return unlocks;
}

function expandItemGrantIds(grants: readonly ItemGrant[]): string[] {
  return grants.flatMap((grant) =>
    Array.from({ length: Math.max(0, Math.floor(grant.quantity)) }, () => grant.itemId)
  );
}
