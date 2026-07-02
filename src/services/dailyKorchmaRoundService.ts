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
  DAILY_KORCHMA_ROUND_REROLL_KEY,
  DAILY_KORCHMA_ROUND_REWARD_KEY,
  DAILY_KORCHMA_ROUND_STEP_KEY
} from "./dailyActionKeys";
import type { FightService } from "./fightService";
import {
  PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
  type PresenceService
} from "./presenceService";
import type { TavernRaidService } from "./tavernRaidService";
import { trackRewardAchievementsSafely } from "./achievementTracking";

export const DAILY_KORCHMA_ROUND_MIN_LEVEL = 3;

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
    const claim = await this.dailyActions.claimForTelegramUser(telegramUserId, {
      key: DAILY_KORCHMA_ROUND_REWARD_KEY,
      localDate: context.dayKey,
      rewardXp: reward.xp,
      rewardGold: reward.gold,
      resultJson: {
        version: 1,
        dayToken: context.dayToken,
        completedSceneIds: [...context.completedSceneIds],
        omittedSceneId: context.offer.omittedSceneId,
        reward
      },
      expectedLife: { remortCount: context.lifeToken }
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
          events: ["daily.korchma-round.completed"],
          activityEvents: this.activityEvents
        })
      : [];

    return {
      state: claim.state === "created" ? "reward-claimed" : "reward-replayed",
      character: summarizeCharacter(claim.character),
      offer: context.offer,
      reward: buildRewardFromRecord(claim.action),
      levelChange: claim.state === "created" ? claim.levelChange : null,
      achievementUnlocks
    };
  }

  async resetTodayForDev(telegramUserId: bigint): Promise<"reset" | "no-character" | "unavailable"> {
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

  private async listStepRecords(
    telegramUserId: bigint,
    dayKey: string,
    scenes: readonly DailyKorchmaRoundScene[]
  ): Promise<DailyActionRecord[]> {
    const sceneIds = new Set(scenes.map((scene) => scene.id));
    const rows = this.dailyActions.listForTelegramUser
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

  private async hasPendingBarrel(telegramUserId: bigint): Promise<boolean> {
    if (!this.tavern) {
      return false;
    }

    const pending = await this.tavern.getActivePendingFridayBarrelRaidForTelegramUser(telegramUserId);

    return pending.state === "pending";
  }
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
    gold: level + random.nextInt(1, level),
    localDate: input.dayKey
  };
}

function buildRewardFromRecord(record: DailyActionRecord): DailyKorchmaRoundReward {
  return {
    xp: record.rewardXp,
    gold: record.rewardGold,
    localDate: record.localDate
  };
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
