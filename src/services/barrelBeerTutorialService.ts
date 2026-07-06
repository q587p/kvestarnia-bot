import type { CharacterRecord, CharacterRepository } from "../db/repositories/characterRepository";
import type {
  DailyActionRecord,
  DailyActionRepository,
  RewardLevelChange
} from "../db/repositories/dailyActionRepository";
import type { ShynokRepository } from "../db/repositories/shynokRepository";
import { summarizeCharacter, type CharacterSummary } from "../domain/characters/characterSummary";
import { getLevelStartXp } from "../domain/progression/level";
import type { ShynokDrinkKey } from "../domain/shynokDrinks";
import { systemClock, type Clock } from "../shared/time";
import {
  PRESENCE_LOCATION_KORCHMA_BARREL,
  PRESENCE_LOCATION_KORCHMA_QUEST_TABLE
} from "./presenceService";
import {
  enrichRewardItemGrants,
  PERSTEN_PYVOVLADDIA_ITEM_ID,
  starterEquipmentGrant,
  type RewardItemGrant
} from "./itemGrant";
import type { AchievementService, AchievementUnlock } from "./achievementService";

export const BARREL_BEER_TUTORIAL_ID = "barrel_or_there_and_back";
export const BARREL_BEER_TUTORIAL_TITLE = "Бочка, або Туди і звідти";
export const BARREL_BEER_TUTORIAL_REQUIRED_LEVEL = 2;
export const BARREL_BEER_TUTORIAL_MAX_LEVEL = 5;
export const BARREL_BEER_TUTORIAL_STIPEND_GOLD = 39;

const ACCEPTED_KEY = "quest.barrel-beer-tutorial.accepted";
const VISITED_BARREL_KEY = "quest.barrel-beer-tutorial.visited-barrel";
const RAID_COMPLETED_KEY = "quest.barrel-beer-tutorial.raid-completed";
const BEER_ROUND_OFFERED_KEY = "quest.barrel-beer-tutorial.beer-action";
const BEER_DRUNK_KEY = "quest.barrel-beer-tutorial.beer-drunk";
const COMPLETED_KEY = "quest.barrel-beer-tutorial.completed";

const BEER_DRINK_KEYS = new Set<ShynokDrinkKey>([
  "drink.simple-beer",
  "drink.fine-beer"
]);

export interface BarrelBeerTutorialProgress {
  accepted: boolean;
  stipendGranted: boolean;
  visitedBarrel: boolean;
  raidCompleted: boolean;
  beerRoundOffered: boolean;
  beerDrunk: boolean;
  activeBeer: boolean;
  currentLocationId: string | null;
}

export type BarrelBeerTutorialLookupResult =
  | { state: "no-character" }
  | { state: "level-locked"; character: CharacterSummary; requiredLevel: number }
  | { state: "level-retired"; character: CharacterSummary; maxLevel: number; progress: BarrelBeerTutorialProgress }
  | { state: "available"; character: CharacterSummary; progress: BarrelBeerTutorialProgress }
  | {
      state: "in-progress" | "turn-in-ready";
      character: CharacterSummary;
      progress: BarrelBeerTutorialProgress;
    }
  | {
      state: "completed";
      character: CharacterSummary;
      progress: BarrelBeerTutorialProgress;
      reward: BarrelBeerTutorialReward;
    };

export type BarrelBeerTutorialAcceptResult =
  | { state: "no-character" }
  | { state: "level-locked"; character: CharacterSummary; requiredLevel: number }
  | { state: "level-retired"; character: CharacterSummary; maxLevel: number; progress: BarrelBeerTutorialProgress }
  | {
      state: "accepted" | "already-accepted";
      character: CharacterSummary;
      progress: BarrelBeerTutorialProgress;
      stipendGold: number;
    }
  | {
      state: "already-completed";
      character: CharacterSummary;
      progress: BarrelBeerTutorialProgress;
      reward: BarrelBeerTutorialReward;
    };

export type BarrelBeerTutorialTurnInResult =
  | { state: "no-character" }
  | { state: "level-locked"; character: CharacterSummary; requiredLevel: number }
  | { state: "level-retired"; character: CharacterSummary; maxLevel: number; progress: BarrelBeerTutorialProgress }
  | { state: "not-started"; character: CharacterSummary; progress: BarrelBeerTutorialProgress }
  | { state: "missing-progress"; character: CharacterSummary; progress: BarrelBeerTutorialProgress }
  | { state: "beer-expired"; character: CharacterSummary; progress: BarrelBeerTutorialProgress }
  | { state: "wrong-location"; character: CharacterSummary; progress: BarrelBeerTutorialProgress }
  | {
      state: "completed";
      character: CharacterSummary;
      progress: BarrelBeerTutorialProgress;
      reward: BarrelBeerTutorialReward;
      levelChange: RewardLevelChange | null;
      achievementUnlocks: AchievementUnlock[];
    }
  | {
      state: "already-completed";
      character: CharacterSummary;
      progress: BarrelBeerTutorialProgress;
      reward: BarrelBeerTutorialReward;
      levelChange: RewardLevelChange | null;
      achievementUnlocks: AchievementUnlock[];
    };

export interface BarrelBeerTutorialReward {
  xp: number;
  gold: number;
  itemGrants: RewardItemGrant[];
}

export class BarrelBeerTutorialService {
  constructor(
    private readonly characters: CharacterRepository,
    private readonly dailyActions: DailyActionRepository,
    private readonly shynok: Pick<ShynokRepository, "getActiveDrinkForTelegramUser">,
    private readonly clock: Clock = systemClock,
    private readonly achievements?: AchievementService
  ) {}

  async getForTelegramUser(
    telegramUserId: bigint
  ): Promise<BarrelBeerTutorialLookupResult> {
    const context = await this.getContext(telegramUserId);

    if (!context) {
      return { state: "no-character" };
    }

    const character = summarizeCharacter(context.character);

    if (context.completed) {
      return {
        state: "completed",
        character,
        progress: context.progress,
        reward: buildReward(context.character, enrichRewardItemGrants([
          starterEquipmentGrant(PERSTEN_PYVOVLADDIA_ITEM_ID)
        ]), context.completed)
      };
    }

    if (character.level < BARREL_BEER_TUTORIAL_REQUIRED_LEVEL) {
      return {
        state: "level-locked",
        character,
        requiredLevel: BARREL_BEER_TUTORIAL_REQUIRED_LEVEL
      };
    }

    if (!context.accepted && character.level > BARREL_BEER_TUTORIAL_MAX_LEVEL) {
      return {
        state: "level-retired",
        character,
        maxLevel: BARREL_BEER_TUTORIAL_MAX_LEVEL,
        progress: context.progress
      };
    }

    if (!context.accepted) {
      return { state: "available", character, progress: context.progress };
    }

    return {
      state: canTurnIn(context.progress) ? "turn-in-ready" : "in-progress",
      character,
      progress: context.progress
    };
  }

  async acceptForTelegramUser(
    telegramUserId: bigint
  ): Promise<BarrelBeerTutorialAcceptResult> {
    const context = await this.getContext(telegramUserId);

    if (!context) {
      return { state: "no-character" };
    }

    if (context.completed) {
      return {
        state: "already-completed",
        character: summarizeCharacter(context.character),
        progress: context.progress,
        reward: buildReward(context.character, enrichRewardItemGrants([
          starterEquipmentGrant(PERSTEN_PYVOVLADDIA_ITEM_ID)
        ]), context.completed)
      };
    }

    if (context.character.level < BARREL_BEER_TUTORIAL_REQUIRED_LEVEL) {
      return {
        state: "level-locked",
        character: summarizeCharacter(context.character),
        requiredLevel: BARREL_BEER_TUTORIAL_REQUIRED_LEVEL
      };
    }

    if (!context.accepted && context.character.level > BARREL_BEER_TUTORIAL_MAX_LEVEL) {
      return {
        state: "level-retired",
        character: summarizeCharacter(context.character),
        maxLevel: BARREL_BEER_TUTORIAL_MAX_LEVEL,
        progress: context.progress
      };
    }

    const claim = await this.dailyActions.claimForTelegramUser(telegramUserId, {
      key: ACCEPTED_KEY,
      localDate: context.lifeToken,
      rewardXp: 0,
      rewardGold: BARREL_BEER_TUTORIAL_STIPEND_GOLD,
      expectedLife: {
        remortCount: context.character.remortCount ?? 0
      },
      resultJson: {
        kind: "barrel-beer-tutorial-accepted",
        version: 1,
        questId: BARREL_BEER_TUTORIAL_ID
      }
    });

    if (!claim) {
      return { state: "no-character" };
    }

    if (claim.state === "insufficient-gold") {
      throw new Error("Barrel beer tutorial accept unexpectedly required gold.");
    }

    const nextContext = await this.getContext(telegramUserId);
    const progress = nextContext?.progress ?? {
      ...context.progress,
      accepted: true,
      stipendGranted: true
    };

    return {
      state: claim.state === "created" ? "accepted" : "already-accepted",
      character: summarizeCharacter(claim.character),
      progress,
      stipendGold: claim.state === "created" ? BARREL_BEER_TUTORIAL_STIPEND_GOLD : 0
    };
  }

  async turnInForTelegramUser(
    telegramUserId: bigint
  ): Promise<BarrelBeerTutorialTurnInResult> {
    const context = await this.getContext(telegramUserId);

    if (!context) {
      return { state: "no-character" };
    }

    const character = summarizeCharacter(context.character);

    if (context.completed) {
      return {
        state: "already-completed",
        character,
        progress: context.progress,
        reward: buildReward(context.character, enrichRewardItemGrants([
          starterEquipmentGrant(PERSTEN_PYVOVLADDIA_ITEM_ID)
        ]), context.completed),
        levelChange: null,
        achievementUnlocks: []
      };
    }

    if (character.level < BARREL_BEER_TUTORIAL_REQUIRED_LEVEL) {
      return {
        state: "level-locked",
        character,
        requiredLevel: BARREL_BEER_TUTORIAL_REQUIRED_LEVEL
      };
    }

    if (!context.accepted && character.level > BARREL_BEER_TUTORIAL_MAX_LEVEL) {
      return {
        state: "level-retired",
        character,
        maxLevel: BARREL_BEER_TUTORIAL_MAX_LEVEL,
        progress: context.progress
      };
    }

    if (!context.accepted) {
      return { state: "not-started", character, progress: context.progress };
    }

    if (!hasRequiredProgress(context.progress)) {
      return { state: "missing-progress", character, progress: context.progress };
    }

    if (!context.progress.activeBeer) {
      return { state: "beer-expired", character, progress: context.progress };
    }

    if (context.progress.currentLocationId !== PRESENCE_LOCATION_KORCHMA_QUEST_TABLE) {
      return { state: "wrong-location", character, progress: context.progress };
    }

    const rewardXp = getBarrelBeerTutorialRewardXp(context.character);
    const claim = await this.dailyActions.claimForTelegramUser(telegramUserId, {
      key: COMPLETED_KEY,
      localDate: context.lifeToken,
      rewardXp,
      rewardGold: 0,
      itemGrants: [starterEquipmentGrant(PERSTEN_PYVOVLADDIA_ITEM_ID)],
      expectedLife: {
        remortCount: context.character.remortCount ?? 0
      },
      resultJson: {
        kind: "barrel-beer-tutorial-completed",
        version: 1,
        questId: BARREL_BEER_TUTORIAL_ID
      }
    });

    if (!claim) {
      return { state: "no-character" };
    }

    if (claim.state === "insufficient-gold") {
      throw new Error("Barrel beer tutorial completion unexpectedly required gold.");
    }

    const achievementUnlocks = claim.state === "created"
      ? await this.achievements?.trackEventSafely({
          type: "quest.barrel-beer-tutorial.completed",
          characterId: claim.character.id,
          occurredAt: this.clock(),
          sourceId: claim.action.id
        }) ?? []
      : [];

    return {
      state: claim.state === "created" ? "completed" : "already-completed",
      character: summarizeCharacter(claim.character),
      progress: {
        ...context.progress,
        accepted: true,
        stipendGranted: true
      },
      reward: buildReward(claim.character, enrichRewardItemGrants(claim.itemGrants), claim.action),
      levelChange: claim.state === "created" ? claim.levelChange : null,
      achievementUnlocks
    };
  }

  async markVisitedBarrelForTelegramUser(telegramUserId: bigint): Promise<void> {
    await this.markProgress(telegramUserId, VISITED_BARREL_KEY, {
      flag: "visited-barrel",
      locationId: PRESENCE_LOCATION_KORCHMA_BARREL
    });
  }

  async markBarrelRaidCompletedForTelegramUser(telegramUserId: bigint): Promise<void> {
    await this.markProgress(telegramUserId, RAID_COMPLETED_KEY, {
      flag: "barrel-raid-completed"
    });
  }

  async markBeerRoundOfferedForTelegramUser(telegramUserId: bigint): Promise<void> {
    const context = await this.getContext(telegramUserId);

    if (!context?.accepted || context.completed || !context.progress.visitedBarrel || !context.progress.raidCompleted) {
      return;
    }

    await this.claimProgress(telegramUserId, context, BEER_ROUND_OFFERED_KEY, {
      flag: "beer-round-offered"
    });
  }

  async markBeerDrunkForTelegramUser(telegramUserId: bigint): Promise<void> {
    await this.markProgress(telegramUserId, BEER_DRUNK_KEY, {
      flag: "beer-drunk"
    });
  }

  private async markProgress(
    telegramUserId: bigint,
    key: string,
    resultJson: unknown
  ): Promise<void> {
    const context = await this.getContext(telegramUserId);

    if (!context?.accepted || context.completed) {
      return;
    }

    await this.claimProgress(telegramUserId, context, key, resultJson);
  }

  private async claimProgress(
    telegramUserId: bigint,
    context: BarrelBeerTutorialContext,
    key: string,
    resultJson: unknown
  ): Promise<void> {
    await this.dailyActions.claimForTelegramUser(telegramUserId, {
      key,
      localDate: context.lifeToken,
      rewardXp: 0,
      rewardGold: 0,
      expectedLife: {
        remortCount: context.character.remortCount ?? 0
      },
      resultJson: {
        kind: "barrel-beer-tutorial-progress",
        version: 1,
        questId: BARREL_BEER_TUTORIAL_ID,
        ...asRecord(resultJson)
      }
    });
  }

  private async getContext(telegramUserId: bigint): Promise<BarrelBeerTutorialContext | null> {
    const now = this.clock();
    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character) {
      return null;
    }

    const lifeToken = buildLifeToken(character.remortCount ?? 0);
    const [
      accepted,
      visitedBarrel,
      raidCompleted,
      beerRoundOffered,
      beerDrunk,
      completed,
      activeDrink
    ] = await Promise.all([
      this.dailyActions.findForTelegramUser(telegramUserId, {
        key: ACCEPTED_KEY,
        localDate: lifeToken
      }),
      this.dailyActions.findForTelegramUser(telegramUserId, {
        key: VISITED_BARREL_KEY,
        localDate: lifeToken
      }),
      this.dailyActions.findForTelegramUser(telegramUserId, {
        key: RAID_COMPLETED_KEY,
        localDate: lifeToken
      }),
      this.dailyActions.findForTelegramUser(telegramUserId, {
        key: BEER_ROUND_OFFERED_KEY,
        localDate: lifeToken
      }),
      this.dailyActions.findForTelegramUser(telegramUserId, {
        key: BEER_DRUNK_KEY,
        localDate: lifeToken
      }),
      this.dailyActions.findForTelegramUser(telegramUserId, {
        key: COMPLETED_KEY,
        localDate: lifeToken
      }),
      this.shynok.getActiveDrinkForTelegramUser(telegramUserId, now)
    ]);

    return {
      character,
      lifeToken,
      accepted,
      completed,
      progress: {
        accepted: Boolean(accepted),
        stipendGranted: Boolean(accepted),
        visitedBarrel: Boolean(visitedBarrel),
        raidCompleted: Boolean(raidCompleted),
        beerRoundOffered: Boolean(beerRoundOffered),
        beerDrunk: Boolean(beerDrunk),
        activeBeer: Boolean(
          activeDrink &&
            BEER_DRINK_KEYS.has(activeDrink.drinkKey) &&
            activeDrink.phase === "timed" &&
            activeDrink.expiresAt > now
        ),
        currentLocationId: character.currentLocationId ?? null
      }
    };
  }
}

interface BarrelBeerTutorialContext {
  character: CharacterRecord;
  lifeToken: string;
  accepted: DailyActionRecord | null;
  completed: DailyActionRecord | null;
  progress: BarrelBeerTutorialProgress;
}

function buildLifeToken(remortCount: number): string {
  return `life:${remortCount}`;
}

function canTurnIn(progress: BarrelBeerTutorialProgress): boolean {
  return hasRequiredProgress(progress) &&
    progress.activeBeer &&
    progress.currentLocationId === PRESENCE_LOCATION_KORCHMA_QUEST_TABLE;
}

function hasRequiredProgress(progress: BarrelBeerTutorialProgress): boolean {
  return progress.accepted &&
    progress.visitedBarrel &&
    progress.raidCompleted &&
    progress.beerRoundOffered &&
    progress.beerDrunk;
}

export function getBarrelBeerTutorialRewardXp(
  character: Pick<CharacterRecord, "level" | "xp" | "remortCount">
): number {
  const remortCount = character.remortCount ?? 0;
  const rewardBaseLevel = Math.min(
    BARREL_BEER_TUTORIAL_MAX_LEVEL,
    Math.max(BARREL_BEER_TUTORIAL_REQUIRED_LEVEL, Math.floor(character.level))
  );
  const levelStart = getLevelStartXp(rewardBaseLevel, { remortCount });
  const nextLevelStart = getLevelStartXp(rewardBaseLevel + 1, { remortCount });
  const levelWidth = Math.max(1, nextLevelStart - levelStart);
  const rawReward = Math.max(5, Math.ceil(levelWidth * 0.4));
  const currentLevel = Math.max(1, Math.floor(character.level));
  const nextNextLevelStart = getLevelStartXp(currentLevel + 2, { remortCount });
  const maxRewardWithoutDoubleLevel = Math.max(1, nextNextLevelStart - 1 - Math.floor(character.xp));

  return Math.max(1, Math.min(rawReward, maxRewardWithoutDoubleLevel));
}

function buildReward(
  character: Pick<CharacterRecord, "level" | "xp" | "remortCount">,
  itemGrants: RewardItemGrant[],
  action?: Pick<DailyActionRecord, "rewardXp"> | null
): BarrelBeerTutorialReward {
  return {
    xp: action?.rewardXp ?? getBarrelBeerTutorialRewardXp(character),
    gold: 0,
    itemGrants
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
