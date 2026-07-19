import { randomUUID } from "node:crypto";
import { items } from "../content";
import type {
  BardPerformanceAudienceNotice,
  BardPerformanceReactionRecord,
  BardPerformanceRecord,
  BardPerformanceRepository,
  BardPerformanceRespondResult as RepositoryRespondResult,
  BardPerformanceStartResult as RepositoryStartResult
} from "../db/repositories/bardPerformanceRepository";
import {
  BARD_PERFORMANCE_COOLDOWN_MINUTES,
  BARD_PERFORMANCE_MIN_LEVEL,
  BARD_PERFORMANCE_RULES_VERSION,
  BARD_PERFORMANCE_TECHNIQUE_ID,
  BARD_PERFORMANCE_TIP_OPTIONS,
  BARD_PERFORMANCE_WINDOW_MINUTES,
  isBardPerformanceTipAmount,
  rollBardPerformanceCheck,
  type BardPerformanceGrade,
  type BardPerformanceTipAmount
} from "../domain/noncombat/bardPerformance";
import { summarizeCharacter, type CharacterSummary } from "../domain/characters/characterSummary";
import { CryptoRandomSource, type RandomSource } from "../shared/random";
import { systemClock, type Clock } from "../shared/time";
import {
  normalizePresenceLocationId,
  PRESENCE_ACTIVE_MS,
  PRESENCE_LOCATION_KORCHMA_BAR
} from "./presenceService";
import { toKorchmaLocalDate } from "./tavernRaidService";

export type BardPerformanceGateState =
  | "no-character"
  | "wrong-place"
  | "active-combat"
  | "pending-raid"
  | "not-bard"
  | "level-locked";

export type BardPerformanceStartResult =
  | { state: BardPerformanceGateState; character?: CharacterSummary; requiredLevel?: number }
  | { state: "no-audience"; character: CharacterSummary }
  | { state: "cooldown"; character: CharacterSummary; availableAt: Date }
  | { state: "live"; character: CharacterSummary; performance: PresentedBardPerformance }
  | {
      state: "started";
      character: CharacterSummary;
      performance: PresentedBardPerformance;
      audience: PresentedBardPerformanceAudienceNotice[];
    };

export type BardPerformanceRespondResult =
  | { state: "no-character" | "invalid-reaction" }
  | {
      state:
        | "expired"
        | "declined"
        | "replayed"
        | "wrong-place"
        | "active-combat"
        | "pending-raid"
        | "remort-mismatch"
        | "performer-missing"
        | "performer-remorted"
        | "performer-wrong-place"
        | "performer-active-combat"
        | "performer-pending-raid";
      reaction: PresentedBardPerformanceReaction;
      performance: PresentedBardPerformance;
    }
  | {
      state: "insufficient-gold";
      reaction: PresentedBardPerformanceReaction;
      performance: PresentedBardPerformance;
      character: CharacterSummary;
      attemptedTipGold: number;
    }
  | {
      state: "applauded" | "tipped";
      reaction: PresentedBardPerformanceReaction;
      performance: PresentedBardPerformance;
      character: CharacterSummary;
      performerTelegramUserId: bigint;
    };

export interface PresentedBardPerformance {
  id: string;
  token: string;
  performerName: string;
  grade: BardPerformanceGrade;
  housePayoutGold: number;
  audienceCount: number;
  locationId: string;
  startedAt: Date;
  expiresAt: Date;
  cooldownAvailableAt: Date;
}

export interface PresentedBardPerformanceReaction {
  id: string;
  audienceName: string;
  status: string;
  tipGold: number;
  expiresAt: Date;
}

export interface PresentedBardPerformanceAudienceNotice {
  telegramUserId: bigint;
  name: string;
  gold: number;
  reaction: PresentedBardPerformanceReaction;
  inspiration?: {
    mutation: import("../domain/noncombat/bardSupport").BardInspirationMutation;
    accuracyBonusPp: number;
    expiresAt: Date;
    now: Date;
  };
}

export interface PresentedLiveBardPerformance {
  expiresAt: Date;
  now: Date;
}

export class BardPerformanceService {
  constructor(
    private readonly performances: BardPerformanceRepository,
    private readonly clock: Clock = systemClock,
    private readonly rng: RandomSource = new CryptoRandomSource(),
    private readonly options: { devHelpersEnabled?: boolean } = {}
  ) {}

  areDevHelpersEnabled(): boolean {
    return this.options.devHelpersEnabled === true;
  }

  async getLiveForTelegramUser(telegramUserId: bigint): Promise<PresentedLiveBardPerformance | null> {
    const now = this.clock();
    const performance = await this.performances.getLivePerformanceForTelegramUser(telegramUserId, now);

    return performance ? { expiresAt: performance.expiresAt, now } : null;
  }

  async startForTelegramUser(telegramUserId: bigint): Promise<BardPerformanceStartResult> {
    const snapshot = await this.performances.getStartSnapshotForTelegramUser(telegramUserId);
    if (!snapshot) {
      return { state: "no-character" };
    }

    const equippedItems = snapshot.equippedItemIds.flatMap((itemId) => {
      const item = items.find((candidate) => candidate.id === itemId);
      return item ? [item] : [];
    });
    const character = summarizeCharacter(snapshot.character, { equippedItems });

    if (snapshot.activeCombatLease) {
      return { state: "active-combat", character };
    }
    if (snapshot.currentRaidId) {
      return { state: "pending-raid", character };
    }
    if (character.classId !== "class.bard") {
      return { state: "not-bard", character };
    }
    if (character.level < BARD_PERFORMANCE_MIN_LEVEL) {
      return { state: "level-locked", character, requiredLevel: BARD_PERFORMANCE_MIN_LEVEL };
    }

    const now = this.clock();
    const locationId = normalizePresenceLocationId(snapshot.character.currentLocationId);
    const isShynok = locationId === PRESENCE_LOCATION_KORCHMA_BAR;
    const plan = rollBardPerformanceCheck({
      charisma: character.stats.charisma,
      luck: character.stats.luck,
      level: character.level
    }, this.rng);
    const result = await this.performances.startPerformanceForTelegramUser(telegramUserId, {
      token: randomUUID(),
      techniqueId: BARD_PERFORMANCE_TECHNIQUE_ID,
      rulesVersion: BARD_PERFORMANCE_RULES_VERSION,
      locationId,
      localDate: toKorchmaLocalDate(now),
      grade: plan.grade,
      power: plan.power,
      rawHousePayoutGold: isShynok ? plan.rawHousePayoutGold : 0,
      roleActionXp: plan.roleActionXp,
      statSnapshot: {
        level: character.level,
        charisma: character.stats.charisma,
        luck: character.stats.luck,
        equipmentItemIds: snapshot.equippedItemIds
      },
      result: {
        techniqueId: plan.techniqueId,
        rulesVersion: plan.rulesVersion,
        grade: plan.grade,
        power: plan.power,
        rawHousePayoutGold: isShynok ? plan.rawHousePayoutGold : 0,
        roleActionXp: 0
      },
      now,
      expiresAt: new Date(now.getTime() + BARD_PERFORMANCE_WINDOW_MINUTES * 60_000),
      cooldownAvailableAt: new Date(now.getTime() + BARD_PERFORMANCE_COOLDOWN_MINUTES * 60_000),
      activeAudienceSince: new Date(now.getTime() - PRESENCE_ACTIVE_MS),
      allowNoAudience: isShynok,
      requiredLevel: BARD_PERFORMANCE_MIN_LEVEL
    });

    return presentStartResult(result);
  }

  async respondForTelegramUser(
    telegramUserId: bigint,
    input: { reactionId: string; action: "applaud" | "decline" | "tip"; tipGold?: number }
  ): Promise<BardPerformanceRespondResult> {
    if (input.action === "tip" && !isBardPerformanceTipAmount(input.tipGold ?? 0)) {
      return { state: "invalid-reaction" };
    }

    const result = await this.performances.respondToPerformanceForTelegramUser(telegramUserId, {
      reactionId: input.reactionId,
      action: input.action,
      ...(input.action === "tip" ? { tipGold: input.tipGold } : {}),
      now: this.clock(),
      result: {
        action: input.action,
        tipGold: input.action === "tip" ? input.tipGold : 0
      }
    });

    return presentRespondResult(result);
  }

  async resetForDev(telegramUserId: bigint): Promise<
    | { state: "disabled" }
    | { state: "no-character" }
    | { state: "reset"; character: CharacterSummary; deleted: number }
  > {
    if (!this.areDevHelpersEnabled()) {
      return { state: "disabled" };
    }
    const result = await this.performances.resetForTelegramUser(telegramUserId, this.clock());

    return result
      ? { state: "reset", character: summarizeCharacter(result.character), deleted: result.deleted }
      : { state: "no-character" };
  }

  async getInspirationForTelegramUser(
    telegramUserId: bigint
  ): Promise<PresentedBardInspiration | null> {
    const result = await this.performances.getInspirationForTelegramUser(
      telegramUserId,
      this.clock()
    );
    const inspiration = result?.inspiration;

    return inspiration
      ? {
          activationId: inspiration.activationId,
          grade: inspiration.grade,
          accuracyBonusPp: inspiration.accuracyBonusPp,
          expiresAt: new Date(inspiration.expiresAt)
        }
      : null;
  }

  async setInspirationForDev(
    telegramUserId: bigint,
    accuracyBonusPp: 0 | 1 | 2 | 3 | 5
  ): Promise<
    | { state: "disabled" | "no-character" }
    | { state: "updated"; inspiration: PresentedBardInspiration | null }
  > {
    if (!this.areDevHelpersEnabled()) {
      return { state: "disabled" };
    }
    const grade = accuracyBonusPp === 5
      ? "legendary"
      : accuracyBonusPp === 3
        ? "memorable"
        : accuracyBonusPp === 2
          ? "pleasant"
          : accuracyBonusPp === 1
            ? "rough"
            : null;
    const result = await this.performances.setInspirationForDev(
      telegramUserId,
      grade,
      this.clock()
    );
    if (!result) {
      return { state: "no-character" };
    }

    return {
      state: "updated",
      inspiration: result.inspiration
        ? {
            activationId: result.inspiration.activationId,
            grade: result.inspiration.grade,
            accuracyBonusPp: result.inspiration.accuracyBonusPp,
            expiresAt: new Date(result.inspiration.expiresAt)
          }
        : null
    };
  }
}

export function listBardPerformanceTipOptions(): readonly BardPerformanceTipAmount[] {
  return BARD_PERFORMANCE_TIP_OPTIONS;
}

function presentStartResult(result: RepositoryStartResult): BardPerformanceStartResult {
  switch (result.state) {
    case "no-character":
      return { state: "no-character" };
    case "wrong-place":
    case "active-combat":
    case "pending-raid":
    case "not-bard":
    case "no-audience":
      return { state: result.state, character: summarizeCharacter(result.character) };
    case "level-locked":
      return {
        state: "level-locked",
        character: summarizeCharacter(result.character),
        requiredLevel: result.requiredLevel
      };
    case "cooldown":
      return {
        state: "cooldown",
        character: summarizeCharacter(result.character),
        availableAt: result.availableAt
      };
    case "live":
      return {
        state: "live",
        character: summarizeCharacter(result.character),
        performance: presentPerformance(result.performance)
      };
    case "started":
      return {
        state: "started",
        character: summarizeCharacter(result.character),
        performance: presentPerformance(result.performance),
        audience: result.audience.map(presentAudienceNotice)
      };
  }
}

function presentRespondResult(result: RepositoryRespondResult): BardPerformanceRespondResult {
  switch (result.state) {
    case "no-character":
    case "invalid-reaction":
      return { state: result.state };
    case "insufficient-gold":
      return {
        state: "insufficient-gold",
        reaction: presentReaction(result.reaction),
        performance: presentPerformance(result.performance),
        character: summarizeCharacter(result.character),
        attemptedTipGold: result.attemptedTipGold
      };
    case "applauded":
    case "tipped":
      return {
        state: result.state,
        reaction: presentReaction(result.reaction),
        performance: presentPerformance(result.performance),
        character: summarizeCharacter(result.character),
        performerTelegramUserId: result.performerTelegramUserId
      };
    default:
      return {
        state: result.state,
        reaction: presentReaction(result.reaction),
        performance: presentPerformance(result.performance)
      };
  }
}

function presentAudienceNotice(notice: BardPerformanceAudienceNotice): PresentedBardPerformanceAudienceNotice {
  return {
    telegramUserId: notice.telegramUserId,
    name: notice.name,
    gold: notice.gold,
    reaction: presentReaction(notice.reaction),
    ...(notice.inspiration ? { inspiration: { ...notice.inspiration } } : {})
  };
}

export interface PresentedBardInspiration {
  activationId: string;
  grade: BardPerformanceGrade;
  accuracyBonusPp: number;
  expiresAt: Date;
}

function presentPerformance(performance: BardPerformanceRecord): PresentedBardPerformance {
  return {
    id: performance.id,
    token: performance.token,
    performerName: performance.performerName,
    grade: performance.grade as BardPerformanceGrade,
    housePayoutGold: performance.housePayoutGold,
    audienceCount: performance.audienceCount,
    locationId: performance.locationId,
    startedAt: performance.startedAt,
    expiresAt: performance.expiresAt,
    cooldownAvailableAt: performance.cooldownAvailableAt
  };
}

function presentReaction(reaction: BardPerformanceReactionRecord): PresentedBardPerformanceReaction {
  return {
    id: reaction.id,
    audienceName: reaction.audienceName,
    status: reaction.status,
    tipGold: reaction.tipGold,
    expiresAt: reaction.expiresAt
  };
}
