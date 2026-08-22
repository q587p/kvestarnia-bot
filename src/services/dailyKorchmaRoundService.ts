import {
  DAILY_KORCHMA_ROUND_CONTENT_VERSION,
  DAILY_KORCHMA_ROUND_REQUIRED_STEPS,
  dailyKorchmaRoundScenes,
  getDailyKorchmaRoundScene,
  type DailyKorchmaRoundAction,
  type DailyKorchmaRoundScene
} from "../content/dailyKorchmaRoundContent";
import type { CharacterRepository } from "../db/repositories/characterRepository";
import type {
  DailyActionRecord,
  DailyActionRepository,
  RewardLevelChange
} from "../db/repositories/dailyActionRepository";
import { DailyActionPrefixLimitExceededError } from "../db/repositories/dailyActionRepository";
import { summarizeCharacter, type CharacterSummary } from "../domain/characters/characterSummary";
import { selectDailyKorchmaRoundSceneIds } from "../domain/quests/dailyKorchmaRound";
import { getKyivDayKey, getKyivDayToken, kyivDayTokenToKey } from "../shared/kyivDate";
import { SeededRandomSource } from "../shared/random";
import { systemClock, type Clock } from "../shared/time";
import type { AchievementService, AchievementUnlock } from "./achievementService";
import type { PublicActivityEventPublisher } from "./publicActivityEventPublisher";
import {
  DAILY_KORCHMA_ROUND_OFFER_KEY,
  DAILY_KORCHMA_ROUND_DEV_IDENTITY_KEY,
  DAILY_KORCHMA_ROUND_REROLL_KEY,
  DAILY_KORCHMA_ROUND_REWARD_KEY,
  DAILY_KORCHMA_ROUND_STEP_KEY
} from "./dailyActionKeys";
import type { FightLookupResult, FightService } from "./fightService";
import {
  PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
  type PresenceService
} from "./presenceService";
import type { TavernPendingRaidResult, TavernRaidService } from "./tavernRaidService";
import { trackRewardAchievementsSafely } from "./achievementTracking";
import { enrichRewardItemGrants, type RewardItemGrant } from "./itemGrant";
import { ISKROKAMIN_ITEM_ID } from "./itemGrant";
import { DENSE_BANDAGE_ITEM_ID } from "../domain/itemCraft";
import { rollLootExpansionBaseIdentityItem } from "../domain/loot/lootEngine";

export const DAILY_KORCHMA_ROUND_MIN_LEVEL = 3;
export type DailyKorchmaRoundDevIdentityMode = "random" | "hit" | "miss" | "forced-pity";

export interface DailyKorchmaRoundOffer {
  dayKey: string;
  dayToken: string;
  lifeToken: number;
  requiredSteps: number;
  scenes: readonly DailyKorchmaRoundScene[];
  completedSceneIds: readonly string[];
  omittedSceneId: string | null;
}

export type DailyKorchmaRoundLookupResult =
  | { state: "no-character" }
  | { state: "level-locked"; character: CharacterSummary; requiredLevel: number }
  | { state: "hp-blocked"; character: CharacterSummary }
  | { state: "active-fight"; character: CharacterSummary }
  | { state: "pending-barrel"; character: CharacterSummary }
  | { state: "ready" | "turn-in-ready"; character: CharacterSummary; offer: DailyKorchmaRoundOffer }
  | {
      state: "completed";
      character: CharacterSummary;
      offer: DailyKorchmaRoundOffer;
      reward: DailyKorchmaRoundReward;
    };

export type DailyKorchmaRoundExistingLookupResult =
  | DailyKorchmaRoundLookupResult
  | { state: "not-issued"; character: CharacterSummary; dayToken: string };

export type DailyKorchmaRoundMarkerLookupResult =
  | { state: "no-character" }
  | {
      state:
        | "level-locked"
        | "hp-blocked"
        | "active-fight"
        | "pending-barrel"
        | "not-issued"
        | "ready"
        | "turn-in-ready"
        | "completed";
      character: CharacterSummary;
    };

export type DailyKorchmaRoundOverviewResult =
  | DailyKorchmaRoundExistingLookupResult
  | { state: "stale-day"; current: DailyKorchmaRoundExistingLookupResult };

export type DailyKorchmaRoundSceneLookupResult =
  | Exclude<DailyKorchmaRoundLookupResult, { state: "ready" | "turn-in-ready" | "completed" }>
  | { state: "not-issued"; character: CharacterSummary; dayToken: string }
  | { state: "stale-day"; current: DailyKorchmaRoundExistingLookupResult }
  | { state: "unknown-scene"; current: DailyKorchmaRoundExistingLookupResult }
  | {
      state: "scene";
      character: CharacterSummary;
      offer: DailyKorchmaRoundOffer;
      scene: DailyKorchmaRoundScene;
      sceneIndex: number;
      alreadyCompleted: boolean;
      locked: boolean;
    };

export type DailyKorchmaRoundStepResult =
  | Exclude<DailyKorchmaRoundLookupResult, { state: "ready" | "turn-in-ready" | "completed" }>
  | { state: "not-issued"; character: CharacterSummary; dayToken: string }
  | { state: "stale-day"; current: DailyKorchmaRoundExistingLookupResult }
  | { state: "stale-life"; current: DailyKorchmaRoundExistingLookupResult }
  | { state: "unknown-scene"; current: DailyKorchmaRoundExistingLookupResult }
  | { state: "unknown-action"; current: DailyKorchmaRoundExistingLookupResult }
  | {
      state: "wrong-location";
      character: CharacterSummary;
      offer: DailyKorchmaRoundOffer;
      scene: DailyKorchmaRoundScene;
      currentLocationName: string;
    }
  | {
      state: "third-locked";
      character: CharacterSummary;
      offer: DailyKorchmaRoundOffer;
      scene: DailyKorchmaRoundScene;
    }
  | {
      state: "step-completed" | "step-replayed";
      character: CharacterSummary;
      offer: DailyKorchmaRoundOffer;
      scene: DailyKorchmaRoundScene;
      action: DailyKorchmaRoundAction;
      completedCount: number;
    };

export type DailyKorchmaRoundClaimResult =
  | Exclude<DailyKorchmaRoundLookupResult, { state: "ready" | "turn-in-ready" | "completed" }>
  | { state: "not-issued"; character: CharacterSummary; dayToken: string }
  | { state: "stale-day"; current: DailyKorchmaRoundExistingLookupResult }
  | { state: "stale-life"; current: DailyKorchmaRoundExistingLookupResult }
  | { state: "not-ready"; character: CharacterSummary; offer: DailyKorchmaRoundOffer }
  | {
      state: "wrong-location";
      character: CharacterSummary;
      offer: DailyKorchmaRoundOffer;
      currentLocationName: string;
    }
  | {
      state: "reward-claimed" | "reward-replayed";
      character: CharacterSummary;
      offer: DailyKorchmaRoundOffer;
      reward: DailyKorchmaRoundReward;
      levelChange: RewardLevelChange | null;
      achievementUnlocks: AchievementUnlock[];
    };

export interface DailyKorchmaRoundReward {
  xp: number;
  gold: number;
  localDate: string;
  itemGrants: RewardItemGrant[];
}

interface DailyKorchmaIdentityPlan {
  rulesVersion: 1;
  roll: number;
  pityMisses: number;
  forced: boolean;
  itemId: string | null;
  matchedIdentity: {
    axis: "class" | "race" | "title";
    kind: "affinity" | "hard-requirement";
  } | null;
}

interface DailyKorchmaRoundOfferJson {
  version: 1;
  dayKey: string;
  dayToken: string;
  contentVersion: string;
  sceneIds: string[];
  requiredSteps: number;
}

interface DailyKorchmaRoundStepJson {
  version: 1;
  dayToken: string;
  sceneId: string;
  actionId: string;
  locationId: string;
}

export class DailyKorchmaRoundService {
  constructor(
    private readonly characters: CharacterRepository,
    private readonly dailyActions: DailyActionRepository,
    private readonly presence?: Pick<PresenceService, "getCurrentPlaceForTelegramUser">,
    private readonly fight?: Pick<FightService, "getFightOverviewForTelegramUser">,
    private readonly tavern?: Pick<TavernRaidService, "getActivePendingFridayBarrelRaidForTelegramUser">,
    private readonly achievements?: AchievementService,
    private readonly activityEvents?: PublicActivityEventPublisher,
    private readonly clock: Clock = systemClock
  ) {}

  async getForTelegramUser(telegramUserId: bigint): Promise<DailyKorchmaRoundLookupResult> {
    const context = await this.getContext(telegramUserId, { ensureOffer: true });

    if (context.state === "not-issued") {
      return { state: "no-character" };
    }

    if (context.state !== "ready") {
      return context;
    }

    return this.resultFromContext(context);
  }

  async getExistingForTelegramUser(telegramUserId: bigint): Promise<DailyKorchmaRoundExistingLookupResult> {
    const context = await this.getContext(telegramUserId, { ensureOffer: false });

    if (context.state !== "ready") {
      return context;
    }

    return this.resultFromContext(context);
  }

  async findPendingSceneAtLocationForTelegramUser(
    telegramUserId: bigint,
    locationId: string
  ): Promise<{ dayToken: string; sceneIndex: number } | null> {
    const character = await this.characters.findByTelegramUserId(telegramUserId);
    if (!character) {
      return null;
    }

    const dayKey = getKyivDayKey(this.clock());
    const offerRecord = this.dailyActions.listForCharacterByKeys
      ? (await this.dailyActions.listForCharacterByKeys(character.id, {
          keys: [DAILY_KORCHMA_ROUND_OFFER_KEY],
          localDate: dayKey,
          take: 1
        }))[0] ?? null
      : await this.dailyActions.findForTelegramUser(telegramUserId, {
          key: DAILY_KORCHMA_ROUND_OFFER_KEY,
          localDate: dayKey
        });
    const offer = buildOfferFromRecord(offerRecord, Math.max(0, Math.floor(character.remortCount ?? 0)));
    if (!offer) {
      return null;
    }

    const completedSceneIds = new Set(
      (this.dailyActions.listForCharacterByLocalDatePrefix
        ? await this.dailyActions.listForCharacterByLocalDatePrefix(character.id, {
            key: DAILY_KORCHMA_ROUND_STEP_KEY,
            localDatePrefix: `${offer.dayKey}:`,
            take: 13
          })
        : await this.listStepRecords(telegramUserId, offer.dayKey, offer.scenes))
        .map((record) => readStepJson(record)?.sceneId)
        .filter(isString)
    );
    if (completedSceneIds.size >= DAILY_KORCHMA_ROUND_REQUIRED_STEPS) {
      return null;
    }
    const sceneIndex = offer.scenes.findIndex(
      (scene) => scene.locationId === locationId && !completedSceneIds.has(scene.id)
    );

    return sceneIndex < 0 ? null : { dayToken: offer.dayToken, sceneIndex };
  }

  async getQuestMarkerForTelegramUser(
    telegramUserId: bigint,
    sharedFight: Promise<FightLookupResult | null>,
    sharedPendingBarrel?: Promise<TavernPendingRaidResult>
  ): Promise<DailyKorchmaRoundMarkerLookupResult> {
    const characterRecord = await this.characters.findByTelegramUserId(telegramUserId);

    if (!characterRecord) {
      return { state: "no-character" };
    }

    const dayKey = getKyivDayKey(this.clock());
    const character = summarizeCharacter(characterRecord);
    const lifeToken = Math.max(0, Math.floor(characterRecord.remortCount ?? 0));
    const offerRecord = await this.dailyActions.findForTelegramUser(telegramUserId, {
      key: DAILY_KORCHMA_ROUND_OFFER_KEY,
      localDate: dayKey
    });
    const offer = buildOfferFromRecord(offerRecord, lifeToken);

    if (!offer && character.level < DAILY_KORCHMA_ROUND_MIN_LEVEL) {
      return { state: "level-locked", character };
    }

    if (character.hpCurrent <= 0) {
      return { state: "hp-blocked", character };
    }

    const [fight, hasPendingBarrel] = await Promise.all([
      sharedFight,
      this.hasPendingBarrel(telegramUserId, sharedPendingBarrel)
    ]);

    if (!fight) {
      throw new Error("Shared Fight quest marker lookup was unavailable.");
    }

    if (fight.state === "persistent-active" || fight.state === "training-active") {
      return { state: "active-fight", character };
    }

    if (hasPendingBarrel) {
      return { state: "pending-barrel", character };
    }

    if (!offer) {
      return { state: "not-issued", character };
    }

    const [stepRecords, rewardRecord] = await Promise.all([
      this.listStepRecords(telegramUserId, offer.dayKey, offer.scenes),
      this.dailyActions.findForTelegramUser(telegramUserId, {
        key: DAILY_KORCHMA_ROUND_REWARD_KEY,
        localDate: offer.dayKey
      })
    ]);

    if (rewardRecord) {
      return { state: "completed", character };
    }

    const completedSceneIds = new Set(
      stepRecords.map((record) => readStepJson(record)?.sceneId).filter(isString)
    );

    return completedSceneIds.size >= DAILY_KORCHMA_ROUND_REQUIRED_STEPS
      ? { state: "turn-in-ready", character }
      : { state: "ready", character };
  }

  async startForTelegramUser(
    telegramUserId: bigint,
    input: { dayToken: string }
  ): Promise<DailyKorchmaRoundOverviewResult> {
    if (!this.isCurrentDay(input.dayToken)) {
      return { state: "stale-day", current: await this.getExistingForTelegramUser(telegramUserId) };
    }

    return this.getForTelegramUser(telegramUserId);
  }

  async openScene(
    telegramUserId: bigint,
    input: { dayToken: string; sceneIndex: number }
  ): Promise<DailyKorchmaRoundSceneLookupResult> {
    if (!this.isCurrentDay(input.dayToken)) {
      return { state: "stale-day", current: await this.getExistingForTelegramUser(telegramUserId) };
    }

    const context = await this.getContext(telegramUserId, { ensureOffer: false });

    if (context.state !== "ready") {
      return context;
    }

    const scene = context.offer.scenes[input.sceneIndex];

    if (!scene) {
      return { state: "unknown-scene", current: this.resultFromContext(context) };
    }

    return {
      state: "scene",
      character: context.character,
      offer: context.offer,
      scene,
      sceneIndex: input.sceneIndex,
      alreadyCompleted: context.completedSceneIds.has(scene.id),
      locked: context.completedSceneIds.size >= DAILY_KORCHMA_ROUND_REQUIRED_STEPS &&
        !context.completedSceneIds.has(scene.id)
    };
  }

  async completeStep(
    telegramUserId: bigint,
    input: { dayToken: string; sceneIndex: number; actionId: string; lifeToken: number }
  ): Promise<DailyKorchmaRoundStepResult> {
    if (!this.isCurrentDay(input.dayToken)) {
      return { state: "stale-day", current: await this.getExistingForTelegramUser(telegramUserId) };
    }

    const context = await this.getContext(telegramUserId, { ensureOffer: false });

    if (context.state !== "ready") {
      return context;
    }

    if (input.lifeToken !== context.lifeToken) {
      return { state: "stale-life", current: this.resultFromContext(context) };
    }

    const scene = context.offer.scenes[input.sceneIndex];

    if (!scene) {
      return { state: "unknown-scene", current: this.resultFromContext(context) };
    }

    const action = scene.actions.find((candidate) => candidate.id === input.actionId);

    if (!action) {
      return { state: "unknown-action", current: this.resultFromContext(context) };
    }

    const existing = context.stepRecords.find((record) => readStepJson(record)?.sceneId === scene.id);

    if (existing) {
      return {
        state: "step-replayed",
        character: context.character,
        offer: context.offer,
        scene,
        action: actionFromRecord(existing, scene) ?? action,
        completedCount: context.completedSceneIds.size
      };
    }

    if (context.completedSceneIds.size >= DAILY_KORCHMA_ROUND_REQUIRED_STEPS) {
      return { state: "third-locked", character: context.character, offer: context.offer, scene };
    }

    const place = await this.presence?.getCurrentPlaceForTelegramUser(telegramUserId);

    if (place?.state !== "ready" || place.locationId !== scene.locationId) {
      return {
        state: "wrong-location",
        character: context.character,
        offer: context.offer,
        scene,
        currentLocationName: place?.state === "ready" ? place.locationName : "невідома місцина"
      };
    }

    const claim = await this.claimStep(telegramUserId, context, scene, action);

    if (!claim) {
      return { state: "stale-life", current: await this.getExistingForTelegramUser(telegramUserId) };
    }

    if (claim === "limit-exceeded") {
      return { state: "third-locked", character: context.character, offer: context.offer, scene };
    }

    const nextCompletedCount = context.completedSceneIds.size + (claim.state === "created" ? 1 : 0);
    const completedSceneIds =
      claim.state === "created"
        ? [...context.completedSceneIds, scene.id]
        : [...context.completedSceneIds];
    const offer = {
      ...context.offer,
      completedSceneIds,
      omittedSceneId:
        completedSceneIds.length >= DAILY_KORCHMA_ROUND_REQUIRED_STEPS
          ? context.offer.scenes.find((candidate) => !completedSceneIds.includes(candidate.id))?.id ?? null
          : null
    };

    return {
      state: claim.state === "created" ? "step-completed" : "step-replayed",
      character: context.character,
      offer,
      scene,
      action,
      completedCount: Math.min(DAILY_KORCHMA_ROUND_REQUIRED_STEPS, nextCompletedCount)
    };
  }

  private async claimStep(
    telegramUserId: bigint,
    context: DailyKorchmaRoundContext,
    scene: DailyKorchmaRoundScene,
    action: DailyKorchmaRoundAction
  ) {
    try {
      return await this.dailyActions.claimForTelegramUser(telegramUserId, {
        key: DAILY_KORCHMA_ROUND_STEP_KEY,
        localDate: stepLocalDate(context.dayKey, scene.id),
        rewardXp: 0,
        rewardGold: 0,
        resultJson: {
          version: 1,
          dayToken: context.dayToken,
          sceneId: scene.id,
          actionId: action.id,
          locationId: scene.locationId
        } satisfies DailyKorchmaRoundStepJson,
        expectedLife: { remortCount: context.lifeToken },
        localDatePrefixLimit: {
          key: DAILY_KORCHMA_ROUND_STEP_KEY,
          localDatePrefix: `${context.dayKey}:`,
          maxRows: DAILY_KORCHMA_ROUND_REQUIRED_STEPS
        }
      });
    } catch (error) {
      if (error instanceof DailyActionPrefixLimitExceededError) {
        return "limit-exceeded" as const;
      }

      throw error;
    }
  }

  async claimReward(
    telegramUserId: bigint,
    input: { dayToken: string; lifeToken: number }
  ): Promise<DailyKorchmaRoundClaimResult> {
    if (!this.isCurrentDay(input.dayToken)) {
      return { state: "stale-day", current: await this.getExistingForTelegramUser(telegramUserId) };
    }

    const context = await this.getContext(telegramUserId, { ensureOffer: false });

    if (context.state !== "ready") {
      return context;
    }

    if (input.lifeToken !== context.lifeToken) {
      return { state: "stale-life", current: this.resultFromContext(context) };
    }

    if (context.completedSceneIds.size < DAILY_KORCHMA_ROUND_REQUIRED_STEPS) {
      return { state: "not-ready", character: context.character, offer: context.offer };
    }

    const place = await this.presence?.getCurrentPlaceForTelegramUser(telegramUserId);

    if (place?.state !== "ready" || place.locationId !== PRESENCE_LOCATION_KORCHMA_QUEST_TABLE) {
      return {
        state: "wrong-location",
        character: context.character,
        offer: context.offer,
        currentLocationName: place?.state === "ready" ? place.locationName : "невідома місцина"
      };
    }

    const existingReward = await this.dailyActions.findForTelegramUser(telegramUserId, {
      key: DAILY_KORCHMA_ROUND_REWARD_KEY,
      localDate: context.dayKey
    });

    if (existingReward) {
      return {
        state: "reward-replayed",
        character: context.character,
        offer: context.offer,
        reward: buildRewardFromRecord(existingReward),
        levelChange: null,
        achievementUnlocks: []
      };
    }

    const reward = calculateDailyKorchmaRoundReward({
      characterId: context.characterId,
      characterLevel: context.character.level,
      dayKey: context.dayKey,
      sceneIds: context.offer.scenes.map((scene) => scene.id),
      completedSceneIds: [...context.completedSceneIds]
    });
    const identityPlan = await this.buildIdentityPlan(telegramUserId, context);
    if (identityPlan.itemId) {
      reward.itemGrants.push(...enrichRewardItemGrants([{ itemId: identityPlan.itemId, quantity: 1 }]));
    }
    const claim = await this.dailyActions.claimForTelegramUser(telegramUserId, {
      key: DAILY_KORCHMA_ROUND_REWARD_KEY,
      localDate: context.dayKey,
      rewardXp: reward.xp,
      rewardGold: reward.gold,
      resultJson: {
        version: 2,
        dayToken: context.dayToken,
        completedSceneIds: [...context.completedSceneIds],
        omittedSceneId: context.offer.omittedSceneId,
        reward,
        identityPlan
      },
      itemGrants: reward.itemGrants,
      expectedLife: { remortCount: context.lifeToken },
      questIskrokaminBonus: false
    });

    if (!claim) {
      return { state: "stale-life", current: await this.getExistingForTelegramUser(telegramUserId) };
    }

    if (claim.state === "insufficient-gold") {
      throw new Error("Daily Korchma round reward claim unexpectedly required gold.");
    }

    const achievementUnlocks = claim.state === "created"
      ? await trackRewardAchievementsSafely(this.achievements, {
          characterId: claim.character.id,
          actorDisplayName: claim.character.name,
          sourceId: claim.action.id,
          sourceType: "daily-action",
          occurredAt: claim.action.createdAt,
          levelChange: claim.levelChange,
          remortCount: claim.character.remortCount ?? 0,
          itemGrants: claim.itemGrants,
          events: ["daily.korchma-round.completed"],
          activityEvents: this.activityEvents
        })
      : [];

    return {
      state: claim.state === "created" ? "reward-claimed" : "reward-replayed",
      character: summarizeCharacter(claim.character),
      offer: context.offer,
      reward: claim.state === "created"
        ? buildRewardFromClaim(claim.action, claim.itemGrants)
        : buildRewardFromRecord(claim.action),
      levelChange: claim.state === "created" ? claim.levelChange : null,
      achievementUnlocks
    };
  }

  private async buildIdentityPlan(
    telegramUserId: bigint,
    context: DailyKorchmaRoundContext
  ): Promise<DailyKorchmaIdentityPlan> {
    const recent = this.dailyActions.listLatestForTelegramUser
      ? await this.dailyActions.listLatestForTelegramUser(telegramUserId, {
          key: DAILY_KORCHMA_ROUND_REWARD_KEY,
          take: 6
        })
      : (await this.dailyActions.listForTelegramUser?.(telegramUserId, {
          key: DAILY_KORCHMA_ROUND_REWARD_KEY
        }))?.slice(-6).reverse() ?? [];
    const pityMisses = (recent ?? []).filter((record) => !readIdentityItemId(record.resultJson)).length;
    const random = new SeededRandomSource([
      "daily-korchma-identity:v1",
      context.characterId,
      context.dayKey,
      context.offer.scenes.map((scene) => scene.id).join(","),
      [...context.completedSceneIds].sort().join(",")
    ].join("|"));
    const devIdentityRecord = await this.dailyActions.findForTelegramUser(telegramUserId, {
      key: DAILY_KORCHMA_ROUND_DEV_IDENTITY_KEY,
      localDate: context.dayKey
    });
    const devMode = readDevIdentityMode(devIdentityRecord?.resultJson);
    const roll = devMode === "hit" ? 1 : devMode === "miss" || devMode === "forced-pity"
      ? 100
      : random.nextInt(1, 100);
    const forced = devMode === "forced-pity" || ((recent?.length ?? 0) >= 6 && pityMisses >= 6);
    if (!forced && roll > 13) {
      return { rulesVersion: 1, roll, pityMisses, forced: false, itemId: null, matchedIdentity: null };
    }

    const record = await this.characters.findByTelegramUserId(telegramUserId);
    if (!record) {
      return { rulesVersion: 1, roll, pityMisses, forced, itemId: null, matchedIdentity: null };
    }
    const profile = {
      level: record.level,
      classId: record.classId,
      raceId: record.raceId,
      title: context.character.title
    };
    const selected = rollLootExpansionBaseIdentityItem({
      profile,
      sourceId: "tavern_event",
      sourceTags: ["authored_quest", "daily_korchma_round"],
      rng: random
    });
    if (!selected) {
      console.warn("Kvestarnia: daily Korchma identity roll had no eligible affinity manatka.", {
        characterId: context.characterId,
        classId: record.classId,
        raceId: record.raceId
      });
      return { rulesVersion: 1, roll, pityMisses, forced, itemId: null, matchedIdentity: null };
    }
    return {
      rulesVersion: 1,
      roll,
      pityMisses,
      forced,
      itemId: selected.item.id,
      matchedIdentity: selected.match
    };
  }

  async resetTodayForDev(
    telegramUserId: bigint,
    mode: DailyKorchmaRoundDevIdentityMode = "random"
  ): Promise<"reset" | "no-character" | "unavailable"> {
    if (!this.dailyActions.deleteForTelegramUser) {
      return "unavailable";
    }

    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character) {
      return "no-character";
    }

    const dayKey = getKyivDayKey(this.clock());
    const currentOffer = await this.dailyActions.findForTelegramUser(telegramUserId, {
      key: DAILY_KORCHMA_ROUND_OFFER_KEY,
      localDate: dayKey
    });
    const currentSceneIds = currentOffer ? readOfferJson(currentOffer)?.sceneIds ?? null : null;

    await this.dailyActions.deleteForTelegramUser(telegramUserId, {
      key: DAILY_KORCHMA_ROUND_OFFER_KEY,
      localDate: dayKey
    });
    await this.dailyActions.deleteForTelegramUser(telegramUserId, {
      key: DAILY_KORCHMA_ROUND_REWARD_KEY,
      localDate: dayKey
    });
    await this.dailyActions.deleteForTelegramUser(telegramUserId, {
      key: DAILY_KORCHMA_ROUND_DEV_IDENTITY_KEY,
      localDate: dayKey
    });

    for (const scene of dailyKorchmaRoundScenes) {
      await this.dailyActions.deleteForTelegramUser(telegramUserId, {
        key: DAILY_KORCHMA_ROUND_STEP_KEY,
        localDate: stepLocalDate(dayKey, scene.id)
      });
    }

    const rerollIndex = await this.recordDevRerollUntilChanged(
      telegramUserId,
      character.id,
      dayKey,
      currentSceneIds
    );

    if (rerollIndex === null) {
      return "no-character";
    }

    if (mode !== "random") {
      const claim = await this.dailyActions.claimForTelegramUser(telegramUserId, {
        key: DAILY_KORCHMA_ROUND_DEV_IDENTITY_KEY,
        localDate: dayKey,
        rewardXp: 0,
        rewardGold: 0,
        resultJson: { version: 1, mode }
      });
      if (!claim) return "no-character";
    }

    return "reset";
  }

  private async getContext(
    telegramUserId: bigint,
    options: { ensureOffer: boolean }
  ): Promise<
    | { state: "no-character" }
    | { state: "level-locked"; character: CharacterSummary; requiredLevel: number }
    | { state: "hp-blocked"; character: CharacterSummary }
    | { state: "active-fight"; character: CharacterSummary }
    | { state: "pending-barrel"; character: CharacterSummary }
    | { state: "not-issued"; character: CharacterSummary; dayToken: string }
    | DailyKorchmaRoundContext
  > {
    const characterRecord = await this.characters.findByTelegramUserId(telegramUserId);

    if (!characterRecord) {
      return { state: "no-character" };
    }

    const character = summarizeCharacter(characterRecord);
    const lifeToken = Math.max(0, Math.floor(characterRecord.remortCount ?? 0));
    let offer = await this.loadOffer(telegramUserId, characterRecord.id, lifeToken, false);

    if (!offer && character.level < DAILY_KORCHMA_ROUND_MIN_LEVEL) {
      return { state: "level-locked", character, requiredLevel: DAILY_KORCHMA_ROUND_MIN_LEVEL };
    }

    if (character.hpCurrent <= 0) {
      return { state: "hp-blocked", character };
    }

    if (await this.hasActiveFight(telegramUserId)) {
      return { state: "active-fight", character };
    }

    if (await this.hasPendingBarrel(telegramUserId)) {
      return { state: "pending-barrel", character };
    }

    if (!offer && options.ensureOffer) {
      offer = await this.loadOffer(telegramUserId, characterRecord.id, lifeToken, true);
    }

    if (!offer) {
      return options.ensureOffer
        ? { state: "no-character" }
        : { state: "not-issued", character, dayToken: getKyivDayToken(this.clock()) };
    }

    const stepRecords = await this.listStepRecords(telegramUserId, offer.dayKey, offer.scenes);
    const completedSceneIds = new Set(stepRecords.map((record) => readStepJson(record)?.sceneId).filter(isString));
    const rewardRecord = await this.dailyActions.findForTelegramUser(telegramUserId, {
      key: DAILY_KORCHMA_ROUND_REWARD_KEY,
      localDate: offer.dayKey
    });
    const omittedSceneId =
      completedSceneIds.size >= DAILY_KORCHMA_ROUND_REQUIRED_STEPS
        ? offer.scenes.find((scene) => !completedSceneIds.has(scene.id))?.id ?? null
        : null;

    return {
      state: "ready",
      character,
      characterId: characterRecord.id,
      dayKey: offer.dayKey,
      dayToken: offer.dayToken,
      lifeToken,
      offer: {
        ...offer,
        completedSceneIds: [...completedSceneIds],
        omittedSceneId
      },
      stepRecords,
      completedSceneIds,
      rewardRecord
    };
  }

  private resultFromContext(context: DailyKorchmaRoundContext): DailyKorchmaRoundLookupResult {
    if (context.rewardRecord) {
      return {
        state: "completed",
        character: context.character,
        offer: context.offer,
        reward: buildRewardFromRecord(context.rewardRecord)
      };
    }

    if (context.completedSceneIds.size >= DAILY_KORCHMA_ROUND_REQUIRED_STEPS) {
      return { state: "turn-in-ready", character: context.character, offer: context.offer };
    }

    return { state: "ready", character: context.character, offer: context.offer };
  }

  private async loadOffer(
    telegramUserId: bigint,
    characterId: string,
    lifeToken: number,
    ensure: boolean
  ): Promise<Omit<DailyKorchmaRoundOffer, "completedSceneIds" | "omittedSceneId"> | null> {
    const now = this.clock();
    const dayKey = getKyivDayKey(now);
    const dayToken = getKyivDayToken(now);
    let record = await this.dailyActions.findForTelegramUser(telegramUserId, {
      key: DAILY_KORCHMA_ROUND_OFFER_KEY,
      localDate: dayKey
    });

    if (!record && ensure) {
      const rerollIndex = await this.getDevRerollIndex(telegramUserId, dayKey);
      const sceneIds = selectDailyKorchmaRoundSceneIds({
        characterId,
        dayKey,
        rerollIndex,
        scenes: dailyKorchmaRoundScenes
      });
      const claim = await this.dailyActions.claimForTelegramUser(telegramUserId, {
        key: DAILY_KORCHMA_ROUND_OFFER_KEY,
        localDate: dayKey,
        rewardXp: 0,
        rewardGold: 0,
        resultJson: {
          version: 1,
          dayKey,
          dayToken,
          contentVersion: DAILY_KORCHMA_ROUND_CONTENT_VERSION,
          sceneIds,
          requiredSteps: DAILY_KORCHMA_ROUND_REQUIRED_STEPS
        } satisfies DailyKorchmaRoundOfferJson,
        expectedLife: { remortCount: lifeToken }
      });

      record = claim && claim.state !== "insufficient-gold" ? claim.action : null;
    }

    return buildOfferFromRecord(record, lifeToken);
  }

  private async listStepRecords(
    telegramUserId: bigint,
    dayKey: string,
    scenes: readonly DailyKorchmaRoundScene[]
  ): Promise<DailyActionRecord[]> {
    const sceneIds = new Set(scenes.map((scene) => scene.id));
    const rows = this.dailyActions.listForTelegramUserByLocalDatePrefix
      ? await this.dailyActions.listForTelegramUserByLocalDatePrefix(telegramUserId, {
          key: DAILY_KORCHMA_ROUND_STEP_KEY,
          localDatePrefix: `${dayKey}:`,
          take: 13
        })
      : this.dailyActions.listForTelegramUser
      ? await this.dailyActions.listForTelegramUser(telegramUserId, {
          key: DAILY_KORCHMA_ROUND_STEP_KEY
        })
      : await Promise.all(
          scenes.map((scene) =>
            this.dailyActions.findForTelegramUser(telegramUserId, {
              key: DAILY_KORCHMA_ROUND_STEP_KEY,
              localDate: stepLocalDate(dayKey, scene.id)
            })
          )
        );

    return (rows ?? [])
      .filter(isDailyActionRecord)
      .filter((record) => record.localDate.startsWith(`${dayKey}:`))
      .filter((record) => {
        const json = readStepJson(record);

        return json !== null && sceneIds.has(json.sceneId);
      });
  }

  private async getDevRerollIndex(telegramUserId: bigint, dayKey: string): Promise<number> {
    const count = await this.dailyActions.countForTelegramUser?.(telegramUserId, {
      key: DAILY_KORCHMA_ROUND_REROLL_KEY,
      localDatePrefix: devRerollLocalDatePrefix(dayKey)
    });

    if (count !== undefined) {
      return count ?? 0;
    }

    const rows = await this.dailyActions.listForTelegramUser?.(telegramUserId, {
      key: DAILY_KORCHMA_ROUND_REROLL_KEY
    });

    return (rows ?? []).filter((record) => record.localDate.startsWith(devRerollLocalDatePrefix(dayKey))).length;
  }

  private async recordDevRerollUntilChanged(
    telegramUserId: bigint,
    characterId: string,
    dayKey: string,
    currentSceneIds: readonly string[] | null
  ): Promise<number | null> {
    const currentIndex = await this.getDevRerollIndex(telegramUserId, dayKey);

    for (let rerollIndex = currentIndex + 1; rerollIndex <= currentIndex + 23; rerollIndex += 1) {
      const claim = await this.dailyActions.claimForTelegramUser(telegramUserId, {
        key: DAILY_KORCHMA_ROUND_REROLL_KEY,
        localDate: devRerollLocalDate(dayKey, rerollIndex),
        rewardXp: 0,
        rewardGold: 0,
        resultJson: {
          version: 1,
          dayKey,
          rerollIndex
        }
      });

      if (!claim) {
        return null;
      }

      if (claim.state === "insufficient-gold") {
        throw new Error("Daily Korchma round reroll unexpectedly required gold.");
      }

      if (!currentSceneIds) {
        return rerollIndex;
      }

      const nextSceneIds = selectDailyKorchmaRoundSceneIds({
        characterId,
        dayKey,
        rerollIndex,
        scenes: dailyKorchmaRoundScenes
      });

      if (!sameSceneIds(currentSceneIds, nextSceneIds)) {
        return rerollIndex;
      }
    }

    return currentIndex + 23;
  }

  private isCurrentDay(dayToken: string): boolean {
    return kyivDayTokenToKey(dayToken) === getKyivDayKey(this.clock());
  }

  private async hasActiveFight(telegramUserId: bigint): Promise<boolean> {
    if (!this.fight) {
      return false;
    }

    const fight = await this.fight.getFightOverviewForTelegramUser(telegramUserId);

    return fight.state === "persistent-active" || fight.state === "training-active";
  }

  private async hasPendingBarrel(
    telegramUserId: bigint,
    sharedPending?: Promise<TavernPendingRaidResult>
  ): Promise<boolean> {
    if (!this.tavern) {
      return false;
    }

    const pending = sharedPending
      ? await sharedPending
      : await this.tavern.getActivePendingFridayBarrelRaidForTelegramUser(telegramUserId);

    return pending.state === "pending";
  }
}

function buildOfferFromRecord(
  record: DailyActionRecord | null,
  lifeToken: number
): Omit<DailyKorchmaRoundOffer, "completedSceneIds" | "omittedSceneId"> | null {
  const json = record ? readOfferJson(record) : null;
  const sceneIds = json?.sceneIds ?? [];
  const scenes = sceneIds.map(getDailyKorchmaRoundScene).filter(isScene);

  if (!json || scenes.length !== 3) {
    return null;
  }

  return {
    dayKey: json.dayKey,
    dayToken: json.dayToken,
    lifeToken,
    requiredSteps: json.requiredSteps,
    scenes
  };
}

interface DailyKorchmaRoundContext {
  state: "ready";
  character: CharacterSummary;
  characterId: string;
  dayKey: string;
  dayToken: string;
  lifeToken: number;
  offer: DailyKorchmaRoundOffer;
  stepRecords: DailyActionRecord[];
  completedSceneIds: Set<string>;
  rewardRecord: DailyActionRecord | null;
}

function readOfferJson(action: DailyActionRecord): DailyKorchmaRoundOfferJson | null {
  const value = action.resultJson;

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const maybe = value as Partial<DailyKorchmaRoundOfferJson>;

  if (
    maybe.version !== 1 ||
    maybe.contentVersion !== DAILY_KORCHMA_ROUND_CONTENT_VERSION ||
    maybe.dayKey !== action.localDate ||
    typeof maybe.dayToken !== "string" ||
    !Array.isArray(maybe.sceneIds) ||
    maybe.requiredSteps !== DAILY_KORCHMA_ROUND_REQUIRED_STEPS
  ) {
    return null;
  }

  return {
    version: 1,
    dayKey: maybe.dayKey,
    dayToken: maybe.dayToken,
    contentVersion: maybe.contentVersion,
    sceneIds: maybe.sceneIds.filter(isString),
    requiredSteps: maybe.requiredSteps
  };
}

function readStepJson(action: DailyActionRecord): DailyKorchmaRoundStepJson | null {
  const value = action.resultJson;

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const maybe = value as Partial<DailyKorchmaRoundStepJson>;

  if (
    maybe.version !== 1 ||
    typeof maybe.dayToken !== "string" ||
    typeof maybe.sceneId !== "string" ||
    typeof maybe.actionId !== "string" ||
    typeof maybe.locationId !== "string"
  ) {
    return null;
  }

  return {
    version: 1,
    dayToken: maybe.dayToken,
    sceneId: maybe.sceneId,
    actionId: maybe.actionId,
    locationId: maybe.locationId
  };
}

function actionFromRecord(
  record: DailyActionRecord,
  scene: DailyKorchmaRoundScene
): DailyKorchmaRoundAction | null {
  const actionId = readStepJson(record)?.actionId;

  return scene.actions.find((action) => action.id === actionId) ?? null;
}

export function calculateDailyKorchmaRoundReward(input: {
  characterId: string;
  characterLevel: number;
  dayKey: string;
  sceneIds: readonly string[];
  completedSceneIds: readonly string[];
}): DailyKorchmaRoundReward {
  const level = Math.max(DAILY_KORCHMA_ROUND_MIN_LEVEL, Math.floor(input.characterLevel));
  const random = new SeededRandomSource([
    "daily-korchma-round-reward:v2",
    input.characterId,
    input.dayKey,
    input.sceneIds.join(","),
    [...input.completedSceneIds].sort().join(",")
  ].join("|"));

  return {
    xp: level * 2 + random.nextInt(1, level),
    gold: 13 + level + random.nextInt(1, level),
    localDate: input.dayKey,
    itemGrants: enrichRewardItemGrants([
      { itemId: ISKROKAMIN_ITEM_ID, quantity: 13 },
      { itemId: DENSE_BANDAGE_ITEM_ID, quantity: 1 }
    ])
  };
}

function buildRewardFromRecord(record: DailyActionRecord): DailyKorchmaRoundReward {
  return {
    xp: record.rewardXp,
    gold: record.rewardGold,
    localDate: record.localDate,
    itemGrants: enrichRewardItemGrants(readAppliedItemGrants(record.resultJson))
  };
}

function buildRewardFromClaim(
  record: DailyActionRecord,
  itemGrants: Array<{ itemId: string; quantity: number }>
): DailyKorchmaRoundReward {
  return {
    xp: record.rewardXp,
    gold: record.rewardGold,
    localDate: record.localDate,
    itemGrants: enrichRewardItemGrants(itemGrants)
  };
}

function readAppliedItemGrants(value: unknown): Array<{ itemId: string; quantity: number }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  const reward = (value as { reward?: unknown }).reward;
  if (!reward || typeof reward !== "object" || Array.isArray(reward)) {
    return [];
  }

  const grants = (reward as { appliedItemGrants?: unknown }).appliedItemGrants;
  if (!Array.isArray(grants)) {
    return [];
  }

  return grants.flatMap((grant) => {
    if (!grant || typeof grant !== "object" || Array.isArray(grant)) {
      return [];
    }

    const itemId = (grant as { itemId?: unknown }).itemId;
    const quantity = (grant as { quantity?: unknown }).quantity;

    return typeof itemId === "string" && typeof quantity === "number"
      ? [{ itemId, quantity }]
      : [];
  });
}

function readIdentityItemId(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const plan = (value as { identityPlan?: unknown }).identityPlan;
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) return null;
  const itemId = (plan as { itemId?: unknown }).itemId;
  return typeof itemId === "string" && itemId.length > 0 &&
    readAppliedItemGrants(value).some((grant) => grant.itemId === itemId && grant.quantity > 0)
    ? itemId
    : null;
}

function readDevIdentityMode(value: unknown): DailyKorchmaRoundDevIdentityMode | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const mode = (value as { mode?: unknown }).mode;
  return mode === "hit" || mode === "miss" || mode === "forced-pity" || mode === "random"
    ? mode
    : null;
}

function stepLocalDate(dayKey: string, sceneId: string): string {
  return `${dayKey}:${sceneId}`;
}

function devRerollLocalDatePrefix(dayKey: string): string {
  return `${dayKey}:reroll:`;
}

function devRerollLocalDate(dayKey: string, rerollIndex: number): string {
  return `${devRerollLocalDatePrefix(dayKey)}${rerollIndex.toString(36)}`;
}

function sameSceneIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isScene(value: DailyKorchmaRoundScene | null): value is DailyKorchmaRoundScene {
  return value !== null;
}

function isDailyActionRecord(value: DailyActionRecord | null): value is DailyActionRecord {
  return value !== null;
}
