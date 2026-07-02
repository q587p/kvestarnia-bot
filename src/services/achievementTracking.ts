import type { ItemGrant, RewardLevelChange } from "../db/repositories/dailyActionRepository";
import type {
  AchievementService,
  AchievementSimpleEventType,
  AchievementUnlock
} from "./achievementService";
import type { PublicActivityEventPublisher } from "./publicActivityEventPublisher";

export interface TrackRewardAchievementInput {
  characterId: string;
  sourceId: string;
  sourceType?: string | undefined;
  actorDisplayName?: string | undefined;
  occurredAt: Date;
  levelChange?: RewardLevelChange | null | undefined;
  itemGrants?: readonly ItemGrant[] | undefined;
  itemIds?: readonly string[] | undefined;
  events?: readonly AchievementSimpleEventType[] | undefined;
  activityEvents?: PublicActivityEventPublisher | undefined;
}

export async function trackRewardAchievementsSafely(
  achievements: AchievementService | undefined,
  input: TrackRewardAchievementInput
): Promise<AchievementUnlock[]> {
  const itemIds = [
    ...(input.itemIds ?? []),
    ...(input.itemGrants ? expandItemGrantIds(input.itemGrants) : [])
  ];

  await input.activityEvents?.recordRewardEventsSafely({
    characterId: input.characterId,
    actorDisplayName: input.actorDisplayName,
    sourceId: input.sourceId,
    sourceType: input.sourceType ?? "reward",
    occurredAt: input.occurredAt,
    levelChange: input.levelChange,
    itemIds
  });

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
