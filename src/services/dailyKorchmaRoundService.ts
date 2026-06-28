import {
  DAILY_KORCHMA_ROUND_CONTENT_VERSION,
  DAILY_KORCHMA_ROUND_REQUIRED_STEPS,
  DAILY_KORCHMA_ROUND_REWARD,
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
import { summarizeCharacter, type CharacterSummary } from "../domain/characters/characterSummary";
import { selectDailyKorchmaRoundSceneIds } from "../domain/quests/dailyKorchmaRound";
import { getKyivDayKey, getKyivDayToken, kyivDayTokenToKey } from "../shared/kyivDate";
import { systemClock, type Clock } from "../shared/time";
import type { AchievementService, AchievementUnlock } from "./achievementService";
import {
  DAILY_KORCHMA_ROUND_OFFER_KEY,
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

export type DailyKorchmaRoundSceneLookupResult =
  | Exclude<DailyKorchmaRoundLookupResult, { state: "ready" | "turn-in-ready" | "completed" }>
  | { state: "stale-day"; current: DailyKorchmaRoundLookupResult }
  | { state: "unknown-scene"; current: DailyKorchmaRoundLookupResult }
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
  | { state: "stale-day"; current: DailyKorchmaRoundLookupResult }
  | { state: "stale-life"; current: DailyKorchmaRoundLookupResult }
  | { state: "unknown-scene"; current: DailyKorchmaRoundLookupResult }
  | { state: "unknown-action"; current: DailyKorchmaRoundLookupResult }
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
  | { state: "stale-day"; current: DailyKorchmaRoundLookupResult }
  | { state: "stale-life"; current: DailyKorchmaRoundLookupResult }
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
    private readonly clock: Clock = systemClock
  ) {}

  async getForTelegramUser(telegramUserId: bigint): Promise<DailyKorchmaRoundLookupResult> {
    const context = await this.getContext(telegramUserId, { ensureOffer: true });

    if (context.state !== "ready") {
      return context;
    }

    return this.resultFromContext(context);
  }

  async openScene(
    telegramUserId: bigint,
    input: { dayToken: string; sceneIndex: number }
  ): Promise<DailyKorchmaRoundSceneLookupResult> {
    if (!this.isCurrentDay(input.dayToken)) {
      return { state: "stale-day", current: await this.getForTelegramUser(telegramUserId) };
    }

    const context = await this.getContext(telegramUserId, { ensureOffer: true });

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
      return { state: "stale-day", current: await this.getForTelegramUser(telegramUserId) };
    }

    const context = await this.getContext(telegramUserId, { ensureOffer: true });

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

    const claim = await this.dailyActions.claimForTelegramUser(telegramUserId, {
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
      expectedLife: { remortCount: context.lifeToken }
    });

    if (!claim) {
      return { state: "stale-life", current: await this.getForTelegramUser(telegramUserId) };
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

  async claimReward(
    telegramUserId: bigint,
    input: { dayToken: string; lifeToken: number }
  ): Promise<DailyKorchmaRoundClaimResult> {
    if (!this.isCurrentDay(input.dayToken)) {
      return { state: "stale-day", current: await this.getForTelegramUser(telegramUserId) };
    }

    const context = await this.getContext(telegramUserId, { ensureOffer: true });

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
        reward: buildReward(context.dayKey),
        levelChange: null,
        achievementUnlocks: []
      };
    }

    const claim = await this.dailyActions.claimForTelegramUser(telegramUserId, {
      key: DAILY_KORCHMA_ROUND_REWARD_KEY,
      localDate: context.dayKey,
      rewardXp: DAILY_KORCHMA_ROUND_REWARD.xp,
      rewardGold: DAILY_KORCHMA_ROUND_REWARD.gold,
      resultJson: {
        version: 1,
        dayToken: context.dayToken,
        completedSceneIds: [...context.completedSceneIds],
        omittedSceneId: context.offer.omittedSceneId,
        reward: DAILY_KORCHMA_ROUND_REWARD
      },
      expectedLife: { remortCount: context.lifeToken }
    });

    if (!claim) {
      return { state: "stale-life", current: await this.getForTelegramUser(telegramUserId) };
    }

    const achievementUnlocks = claim.state === "created"
      ? await trackRewardAchievementsSafely(this.achievements, {
          characterId: claim.character.id,
          sourceId: claim.action.id,
          occurredAt: claim.action.createdAt,
          levelChange: claim.levelChange,
          events: ["daily.korchma-round.completed"]
        })
      : [];

    return {
      state: claim.state === "created" ? "reward-claimed" : "reward-replayed",
      character: summarizeCharacter(claim.character),
      offer: context.offer,
      reward: buildReward(context.dayKey),
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
    | DailyKorchmaRoundContext
  > {
    const characterRecord = await this.characters.findByTelegramUserId(telegramUserId);

    if (!characterRecord) {
      return { state: "no-character" };
    }

    const character = summarizeCharacter(characterRecord);

    if (character.level < DAILY_KORCHMA_ROUND_MIN_LEVEL) {
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

    const lifeToken = Math.max(0, Math.floor(characterRecord.remortCount ?? 0));
    const offer = await this.loadOffer(telegramUserId, characterRecord.id, lifeToken, options.ensureOffer);

    if (!offer) {
      return { state: "no-character" };
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
        reward: buildReward(context.dayKey)
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
      const sceneIds = selectDailyKorchmaRoundSceneIds({
        characterId,
        dayKey,
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

function buildReward(dayKey: string): DailyKorchmaRoundReward {
  return {
    xp: DAILY_KORCHMA_ROUND_REWARD.xp,
    gold: DAILY_KORCHMA_ROUND_REWARD.gold,
    localDate: dayKey
  };
}

function stepLocalDate(dayKey: string, sceneId: string): string {
  return `${dayKey}:${sceneId}`;
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
