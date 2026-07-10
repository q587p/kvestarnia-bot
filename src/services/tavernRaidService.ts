import type { CharacterRecord, CharacterRepository } from "../db/repositories/characterRepository";
import type { CooldownRepository } from "../db/repositories/cooldownRepository";
import type {
  DailyActionRecord,
  DailyActionRepository,
  RewardLevelChange
} from "../db/repositories/dailyActionRepository";
import type {
  KorchmaRoundLeaderboard,
  KorchmaRoundLeaderboardEntry,
  KorchmaRoundPurchaseRepository,
  KorchmaRoundTier
} from "../db/repositories/korchmaRoundPurchaseRepository";
import { summarizeCharacter, type CharacterSummary } from "../domain/characters/characterSummary";
import { rollLootExpansionItem } from "../domain/loot";
import { CryptoRandomSource, SeededRandomSource, type RandomSource } from "../shared/random";
import { systemClock, type Clock } from "../shared/time";
import { BIG_BARREL_BROTHER_LOSS_RETRY_COOLDOWN_KEY } from "../domain/partyBoss/partyBoss";
import {
  APRON_OF_FOAM_RESISTANCE_ITEM_ID,
  BARREL_SPLINTER_OF_OPTIMISM_ITEM_ID,
  enrichRewardItemGrants,
  FOAM_CORK_OF_ACCOUNTING_ITEM_ID,
  MIRAGE_FOAM_SAMPLE_ITEM_ID,
  starterEquipmentGrant,
  WET_HERO_TICKET_ITEM_ID,
  type RewardItemGrant
} from "./itemGrant";
import type { PublicActivityEventPublisher } from "./publicActivityEventPublisher";

export const BARREL_RAID_KEY = "tavern.friday-barrel-raid";
export const BARREL_RAID_PENDING_KEY = "tavern.friday-barrel-raid.pending";
export const FRIDAY_BARREL_RAID_KEY = BARREL_RAID_KEY;
export const FRIDAY_BARREL_RAID_PENDING_KEY = BARREL_RAID_PENDING_KEY;
export const FRIDAY_BARREL_RAID_REWARD_XP_MIN = 18;
export const FRIDAY_BARREL_RAID_REWARD_XP_MAX = 26;
export const FRIDAY_BARREL_RAID_REWARD_GOLD_MIN = 8;
export const FRIDAY_BARREL_RAID_REWARD_GOLD_MAX = 14;
export const FRIDAY_BARREL_RAID_MIN_WAIT_MINUTES = 5;
export const FRIDAY_BARREL_RAID_MAX_WAIT_MINUTES = 8;
export const FRIDAY_BARREL_RAID_LEVEL_WAIT_BONUS_SECONDS = 30;
export const FRIDAY_BARREL_RAID_REPEAT_ITEM_DROP_CHANCE = 0.23;
export const BARREL_RAID_PERIOD_START_MINUTE = 23;
export const BARREL_RAID_AUDIT_BREAK_START_HOUR = 3;
export const BARREL_RAID_AUDIT_BREAK_END_HOUR = 7;
export const BARREL_RAID_TIME_ZONE = "Europe/Kyiv";
export const KORCHMA_SIMPLE_ROUND_COST = 10;
export const KORCHMA_FINE_ROUND_COST = 100;

const HOUR_MS = 60 * 60_000;

export interface BarrelRaidPeriod {
  id: string;
  startsAt: Date;
  endsAt: Date;
}

export type TavernLookupResult =
  | { state: "no-character" }
  | { state: "ready"; character: CharacterSummary }
  | { state: "pending"; character: CharacterSummary; availableAt: Date; now: Date; periodId: string }
  | {
      state: "pending-complete";
      character: CharacterSummary;
      availableAt: Date;
      now: Date;
      periodId: string;
    }
  | { state: "already-completed"; character: CharacterSummary }
  | { state: "audit-break"; character: CharacterSummary; now: Date; nextAvailableAt: Date };

export type TavernRaidResult =
  | { state: "no-character" }
  | {
      state: "pending-started";
      character: CharacterSummary;
      availableAt: Date;
      now: Date;
      periodId: string;
    }
  | { state: "pending"; character: CharacterSummary; availableAt: Date; now: Date; periodId: string }
  | { state: "audit-break"; character: CharacterSummary; now: Date; nextAvailableAt: Date }
  | {
      state: "completed";
      character: CharacterSummary;
      reward: TavernRaidReward;
      levelChange: RewardLevelChange;
    }
  | {
      state: "already-completed";
      character: CharacterSummary;
      reward: TavernRaidReward;
      levelChange: null;
    };

export type TavernRoundResult =
  | { state: "no-character" }
  | { state: "raid-required"; character: CharacterSummary; leaderboard: KorchmaRoundLeaderboard }
  | { state: "not-enough-gold"; character: CharacterSummary; gold: number; leaderboard: KorchmaRoundLeaderboard }
  | {
      state: "simple-round" | "fine-round";
      character: CharacterSummary;
      spentGold: number;
      remainingGold: number;
      leaderboard: KorchmaRoundLeaderboard;
      becameLeader: KorchmaRoundLeaderboardPeriod[];
    };

export type TavernRoundOfferResult =
  | { state: "no-character" }
  | { state: "raid-required"; character: CharacterSummary; leaderboard: KorchmaRoundLeaderboard }
  | { state: "not-enough-gold"; character: CharacterSummary; gold: number; leaderboard: KorchmaRoundLeaderboard }
  | {
      state: "ready";
      character: CharacterSummary;
      gold: number;
      canBuySimple: boolean;
      canBuyFine: boolean;
      leaderboard: KorchmaRoundLeaderboard;
    };

export type KorchmaRoundLeaderboardPeriod = "day" | "week" | "month";

export type TavernPendingRaidResult =
  | { state: "no-character" }
  | { state: "none" }
  | { state: "pending"; character: CharacterSummary; availableAt: Date; now: Date; periodId: string };

export type TavernRoundLeaderboardResult =
  | { state: "no-character" }
  | { state: "ready"; character: CharacterSummary; leaderboard: KorchmaRoundLeaderboard };

export type TavernDevRaidStopResult =
  | { state: "no-character" }
  | { state: "unavailable" }
  | { state: "no-pending"; character: CharacterSummary }
  | { state: "completed"; result: Extract<TavernRaidResult, { state: "completed" }> }
  | { state: "already-completed"; result: Extract<TavernRaidResult, { state: "already-completed" }> };

export type TavernDevRaidResetResult =
  | { state: "no-character" }
  | { state: "unavailable" }
  | {
      state: "reset";
      character: CharacterSummary;
      periodId: string;
      clearedPending: boolean;
      clearedCompletion: boolean;
      clearedLossCooldown: boolean;
    }
  | { state: "nothing-to-reset"; character: CharacterSummary; periodId: string };

interface PendingFridayBarrelRaid {
  availableAt: Date | null;
  startedAt: Date | null;
  character: CharacterRecord;
  periodId: string;
}

export interface TavernRaidReward {
  xp: number;
  gold: number;
  localDate: string;
  itemGrants: RewardItemGrant[];
}

export class TavernRaidService {
  constructor(
    private readonly characters: CharacterRepository,
    private readonly dailyActions: DailyActionRepository,
    private readonly roundPurchases: KorchmaRoundPurchaseRepository,
    private readonly pendingRaids?: CooldownRepository,
    private readonly clock: Clock = systemClock,
    private readonly random: RandomSource = new CryptoRandomSource(),
    private readonly activityEvents?: PublicActivityEventPublisher
  ) {}

  async getTavernForTelegramUser(telegramUserId: bigint): Promise<TavernLookupResult> {
    const now = this.clock();
    const period = getBarrelRaidPeriod(now);
    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character) {
      return { state: "no-character" };
    }

    const pending = await this.findRelevantPendingFridayBarrelRaid(telegramUserId, period);

    if (pending?.availableAt && pending.availableAt > now) {
      return {
        state: "pending",
        character: summarizeCharacter(character),
        availableAt: pending.availableAt,
        now,
        periodId: pending.periodId
      };
    }

    if (pending?.availableAt && pending.availableAt <= now) {
      return {
        state: "pending-complete",
        character: summarizeCharacter(character),
        availableAt: pending.availableAt,
        now,
        periodId: pending.periodId
      };
    }

    const existingRaid = await this.dailyActions.findForTelegramUser(telegramUserId, {
      key: FRIDAY_BARREL_RAID_KEY,
      localDate: period.id
    });

    if (existingRaid) {
      return {
        state: "already-completed",
        character: summarizeCharacter(character)
      };
    }

    if (isBarrelRaidAuditBreak(now)) {
      return {
        state: "audit-break",
        character: summarizeCharacter(character),
        now,
        nextAvailableAt: getNextBarrelRaidAvailableAt(now)
      };
    }

    return {
      state: "ready",
      character: summarizeCharacter(character)
    };
  }

  async getActivePendingFridayBarrelRaidForTelegramUser(
    telegramUserId: bigint
  ): Promise<TavernPendingRaidResult> {
    const now = this.clock();
    const current = await this.findRelevantPendingFridayBarrelRaid(
      telegramUserId,
      getBarrelRaidPeriod(now)
    );

    if (!current) {
      return { state: "no-character" };
    }

    if (!current.availableAt || current.availableAt <= now) {
      return { state: "none" };
    }

    return {
      state: "pending",
      character: summarizeCharacter(current.character),
      availableAt: current.availableAt,
      now,
      periodId: current.periodId
    };
  }

  async advanceFridayBarrelRaid(telegramUserId: bigint): Promise<TavernRaidResult> {
    const now = this.clock();
    const period = getBarrelRaidPeriod(now);
    const pending = await this.findRelevantPendingFridayBarrelRaid(telegramUserId, period);

    if (!pending) {
      return { state: "no-character" };
    }

    if (pending.availableAt && pending.availableAt > now) {
      return {
        state: "pending",
        character: summarizeCharacter(pending.character),
        availableAt: pending.availableAt,
        now,
        periodId: pending.periodId
      };
    }

    if (pending.availableAt && pending.availableAt <= now) {
      return this.completeFridayBarrelRaid(telegramUserId, pending.periodId);
    }

    const existingRaid = await this.dailyActions.findForTelegramUser(telegramUserId, {
      key: FRIDAY_BARREL_RAID_KEY,
      localDate: period.id
    });

    if (existingRaid) {
      return this.completeFridayBarrelRaid(telegramUserId, period.id);
    }

    if (isBarrelRaidAuditBreak(now)) {
      return {
        state: "audit-break",
        character: summarizeCharacter(pending.character),
        now,
        nextAvailableAt: getNextBarrelRaidAvailableAt(now)
      };
    }

    return this.startFridayBarrelRaid(telegramUserId, period, pending.character);
  }

  async completeFridayBarrelRaid(
    telegramUserId: bigint,
    periodId = getBarrelRaidPeriod(this.clock()).id
  ): Promise<TavernRaidResult> {
    const now = this.clock();
    const pending = await this.findPendingFridayBarrelRaidByPeriod(telegramUserId, periodId);

    if (!pending) {
      return { state: "no-character" };
    }

    const rewardAmounts = buildBarrelRaidRewardAmounts({
      characterLevel: summarizeCharacter(pending.character).level,
      waitDurationMs: getBarrelRaidWaitDurationMs(pending)
    });
    const hasPriorSoloRaid = await this.dailyActions.existsAnyForTelegramUser?.(telegramUserId, {
      key: FRIDAY_BARREL_RAID_KEY,
      localDateNot: periodId
    });
    const soloRaidHistory = hasPriorSoloRaid === undefined
      ? await this.dailyActions.listForTelegramUser?.(telegramUserId, {
          key: FRIDAY_BARREL_RAID_KEY
        })
      : null;
    const character = summarizeCharacter(pending.character);
    const claim = await this.dailyActions.claimForTelegramUser(telegramUserId, {
      key: FRIDAY_BARREL_RAID_KEY,
      localDate: periodId,
      rewardXp: rewardAmounts.xp,
      rewardGold: rewardAmounts.gold,
      itemGrants: buildBarrelRaidItemGrants({
        periodId,
        characterId: pending.character.id,
        level: character.level,
        luck: character.stats.luck,
        ...(pending.character.classId ? { classId: pending.character.classId } : {}),
        ...(pending.character.raceId ? { raceId: pending.character.raceId } : {}),
        isFirstSoloRaid: hasPriorSoloRaid !== undefined
          ? !hasPriorSoloRaid
          : soloRaidHistory
          ? soloRaidHistory.every((action) => action.localDate === periodId)
          : false
      })
    });

    if (!claim) {
      return { state: "no-character" };
    }

    if (claim.state === "insufficient-gold") {
      throw new Error("Friday barrel daily claim unexpectedly required gold.");
    }

    if (claim.state === "existing") {
      return {
        state: "already-completed",
        character: summarizeCharacter(claim.character),
        reward: buildReward(claim.action, claim.itemGrants),
        levelChange: null
      };
    }

    await this.activityEvents?.recordSoloRaidCompletedSafely({
      characterId: claim.character.id,
      actorDisplayName: claim.character.name,
      raidId: periodId,
      raidName: "Бочка Пінного Міражу",
      outcome: "won",
      occurredAt: now
    });

    return {
      state: "completed",
      character: summarizeCharacter(claim.character),
      reward: buildReward(claim.action, claim.itemGrants),
      levelChange: claim.levelChange
    };
  }

  async stopPendingFridayBarrelRaidForDev(
    telegramUserId: bigint
  ): Promise<TavernDevRaidStopResult> {
    if (!this.pendingRaids?.setAvailableAtForTelegramUser) {
      return { state: "unavailable" };
    }

    const now = this.clock();
    const pending = await this.findRelevantPendingFridayBarrelRaid(
      telegramUserId,
      getBarrelRaidPeriod(now)
    );

    if (!pending) {
      return { state: "no-character" };
    }

    if (!pending.availableAt) {
      return {
        state: "no-pending",
        character: summarizeCharacter(pending.character)
      };
    }

    if (pending.availableAt > now) {
      const stopped = await this.pendingRaids.setAvailableAtForTelegramUser(telegramUserId, {
        key: buildFridayBarrelRaidPendingKey(pending.periodId),
        availableAt: now
      });

      if (!stopped) {
        return { state: "no-character" };
      }

      if (stopped.state === "not-found") {
        return {
          state: "no-pending",
          character: summarizeCharacter(stopped.character)
        };
      }
    }

    const result = await this.completeFridayBarrelRaid(telegramUserId, pending.periodId);

    if (result.state === "completed") {
      return { state: "completed", result };
    }

    if (result.state === "already-completed") {
      return { state: "already-completed", result };
    }

    return { state: "no-character" };
  }

  async resetFridayBarrelRaidForDev(
    telegramUserId: bigint
  ): Promise<TavernDevRaidResetResult> {
    if (!this.dailyActions.deleteForTelegramUser || !this.pendingRaids?.deleteForTelegramUser) {
      return { state: "unavailable" };
    }

    const now = this.clock();
    const period = getBarrelRaidPeriod(now);
    const pending = await this.findRelevantPendingFridayBarrelRaid(telegramUserId, period);

    if (!pending) {
      return { state: "no-character" };
    }

    const pendingDeleted = await this.pendingRaids.deleteForTelegramUser(telegramUserId, {
      key: buildFridayBarrelRaidPendingKey(pending.periodId)
    });
    const completionDeleted = await this.dailyActions.deleteForTelegramUser(telegramUserId, {
      key: FRIDAY_BARREL_RAID_KEY,
      localDate: period.id
    });
    const lossCooldownDeleted = await this.pendingRaids.deleteForTelegramUser(telegramUserId, {
      key: BIG_BARREL_BROTHER_LOSS_RETRY_COOLDOWN_KEY
    });

    if (
      pendingDeleted === "no-character" ||
      completionDeleted === "no-character" ||
      lossCooldownDeleted === "no-character"
    ) {
      return { state: "no-character" };
    }

    if (
      pendingDeleted === "missing" &&
      completionDeleted === "missing" &&
      lossCooldownDeleted === "missing"
    ) {
      return {
        state: "nothing-to-reset",
        character: summarizeCharacter(pending.character),
        periodId: period.id
      };
    }

    return {
      state: "reset",
      character: summarizeCharacter(pending.character),
      periodId: period.id,
      clearedPending: pendingDeleted === "deleted",
      clearedCompletion: completionDeleted === "deleted",
      clearedLossCooldown: lossCooldownDeleted === "deleted"
    };
  }

  private async startFridayBarrelRaid(
    telegramUserId: bigint,
    period: BarrelRaidPeriod,
    character: CharacterRecord
  ): Promise<TavernRaidResult> {
    if (!this.pendingRaids) {
      return this.completeFridayBarrelRaid(telegramUserId, period.id);
    }

    const now = this.clock();
    const waitBounds = getBarrelRaidWaitBounds(summarizeCharacter(character).level);
    const waitSeconds = this.random.nextInt(waitBounds.minSeconds, waitBounds.maxSeconds);
    const availableAt = new Date(now.getTime() + waitSeconds * 1000);
    const claim = await this.pendingRaids.claimRewardForTelegramUser(telegramUserId, {
      key: buildFridayBarrelRaidPendingKey(period.id),
      now,
      availableAt,
      rewardXp: 0,
      rewardGold: 0
    });

    if (!claim) {
      return { state: "no-character" };
    }

    if (claim.state === "on-cooldown") {
      return {
        state: "pending",
        character: summarizeCharacter(claim.character),
        availableAt: claim.cooldown.availableAt,
        now,
        periodId: period.id
      };
    }

    if (claim.state === "insufficient-gold") {
      throw new Error("Friday Barrel raid pending claim does not spend gold.");
    }

    return {
      state: "pending-started",
      character: summarizeCharacter(claim.character),
      availableAt: claim.cooldown.availableAt,
      now,
      periodId: period.id
    };
  }

  private async findRelevantPendingFridayBarrelRaid(
    telegramUserId: bigint,
    period: BarrelRaidPeriod
  ): Promise<PendingFridayBarrelRaid | null> {
    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character) {
      return null;
    }

    if (!this.pendingRaids) {
      return {
        availableAt: null,
        startedAt: null,
        character,
        periodId: period.id
      };
    }

    for (const candidate of getRecentBarrelRaidPeriods(period, 24)) {
      const current = await this.pendingRaids.findForTelegramUser(
        telegramUserId,
        buildFridayBarrelRaidPendingKey(candidate.id)
      );

      if (!current?.cooldown) {
        continue;
      }

      const existingRaid = await this.dailyActions.findForTelegramUser(telegramUserId, {
        key: FRIDAY_BARREL_RAID_KEY,
        localDate: candidate.id
      });

      if (existingRaid) {
        continue;
      }

      return {
        availableAt: current.cooldown.availableAt,
        startedAt: current.cooldown.updatedAt,
        character: current.character,
        periodId: candidate.id
      };
    }

    return {
      availableAt: null,
      startedAt: null,
      character,
      periodId: period.id
    };
  }

  private async findPendingFridayBarrelRaidByPeriod(
    telegramUserId: bigint,
    periodId: string
  ): Promise<PendingFridayBarrelRaid | null> {
    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character) {
      return null;
    }

    if (!this.pendingRaids) {
      return {
        availableAt: null,
        startedAt: null,
        character,
        periodId
      };
    }

    const current = await this.pendingRaids.findForTelegramUser(
      telegramUserId,
      buildFridayBarrelRaidPendingKey(periodId)
    );

    return {
      availableAt: current?.cooldown?.availableAt ?? null,
      startedAt: current?.cooldown?.updatedAt ?? null,
      character,
      periodId
    };
  }

  async getRoundOfferForTelegramUser(telegramUserId: bigint): Promise<TavernRoundOfferResult> {
    const now = this.clock();
    const localDate = toKorchmaLocalDate(now);
    const raidPeriodId = getBarrelRaidPeriod(now).id;
    const character = await this.characters.findByTelegramUserId(telegramUserId);
    const leaderboard = await this.roundPurchases.getLeaderboard(localDate);

    if (!character) {
      return { state: "no-character" };
    }

    const existingRaid = await this.dailyActions.findForTelegramUser(telegramUserId, {
      key: FRIDAY_BARREL_RAID_KEY,
      localDate: raidPeriodId
    });

    if (!existingRaid) {
      return {
        state: "raid-required",
        character: summarizeCharacter(character),
        leaderboard
      };
    }

    if (character.gold < KORCHMA_SIMPLE_ROUND_COST) {
      return {
        state: "not-enough-gold",
        character: summarizeCharacter(character),
        gold: character.gold,
        leaderboard
      };
    }

    return {
      state: "ready",
      character: summarizeCharacter(character),
      gold: character.gold,
      canBuySimple: character.gold >= KORCHMA_SIMPLE_ROUND_COST,
      canBuyFine: character.gold >= KORCHMA_FINE_ROUND_COST,
      leaderboard
    };
  }

  async getRoundLeaderboardForTelegramUser(telegramUserId: bigint): Promise<TavernRoundLeaderboardResult> {
    const now = this.clock();
    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character) {
      return { state: "no-character" };
    }

    return {
      state: "ready",
      character: summarizeCharacter(character),
      leaderboard: await this.roundPurchases.getLeaderboard(toKorchmaLocalDate(now))
    };
  }

  async buyRoundForTelegramUser(
    telegramUserId: bigint,
    tier: KorchmaRoundTier
  ): Promise<TavernRoundResult> {
    const now = this.clock();
    const localDate = toKorchmaLocalDate(now);
    const raidPeriodId = getBarrelRaidPeriod(now).id;
    const character = await this.characters.findByTelegramUserId(telegramUserId);
    const beforeLeaderboard = await this.roundPurchases.getLeaderboard(localDate);

    if (!character) {
      return { state: "no-character" };
    }

    const existingRaid = await this.dailyActions.findForTelegramUser(telegramUserId, {
      key: FRIDAY_BARREL_RAID_KEY,
      localDate: raidPeriodId
    });

    if (!existingRaid) {
      return {
        state: "raid-required",
        character: summarizeCharacter(character),
        leaderboard: beforeLeaderboard
      };
    }

    const cost = tier === "fine" ? KORCHMA_FINE_ROUND_COST : KORCHMA_SIMPLE_ROUND_COST;
    const spend = await this.roundPurchases.spendGoldAndCreate({
      telegramUserId,
      tier,
      spentGold: cost,
      localDate
    });

    if (!spend) {
      return { state: "no-character" };
    }

    if (spend.state === "insufficient") {
      const leaderboard = await this.roundPurchases.getLeaderboard(localDate);

      return {
        state: "not-enough-gold",
        character: summarizeCharacter(spend.character),
        gold: spend.character.gold,
        leaderboard
      };
    }

    const leaderboard = await this.roundPurchases.getLeaderboard(localDate);

    return {
      state: tier === "fine" ? "fine-round" : "simple-round",
      character: summarizeCharacter(spend.character),
      spentGold: cost,
      remainingGold: spend.character.gold,
      leaderboard,
      becameLeader: getNewLeaderPeriods(spend.character.id, beforeLeaderboard, leaderboard)
    };
  }
}

function buildFridayBarrelRaidPendingKey(localDate: string): string {
  return `${FRIDAY_BARREL_RAID_PENDING_KEY}:${localDate}`;
}

export function getBarrelRaidPeriod(now: Date): BarrelRaidPeriod {
  const wall = getKorchmaWallParts(now);
  let startsAt = getDateFromKorchmaWallParts({
    ...wall,
    minute: BARREL_RAID_PERIOD_START_MINUTE,
    second: 0
  });

  if (wall.minute < BARREL_RAID_PERIOD_START_MINUTE) {
    startsAt = new Date(startsAt.getTime() - HOUR_MS);
  }

  const endsAt = new Date(startsAt.getTime() + HOUR_MS);

  return {
    id: formatKorchmaPeriodId(getKorchmaWallParts(startsAt)),
    startsAt,
    endsAt
  };
}

export function toKorchmaLocalDate(now: Date): string {
  const parts = getKorchmaWallParts(now);
  return `${parts.year.toString().padStart(4, "0")}-${parts.month
    .toString()
    .padStart(2, "0")}-${parts.day.toString().padStart(2, "0")}`;
}

function getPreviousBarrelRaidPeriod(period: BarrelRaidPeriod): BarrelRaidPeriod {
  return getBarrelRaidPeriod(new Date(period.startsAt.getTime() - 1));
}

function getRecentBarrelRaidPeriods(period: BarrelRaidPeriod, count: number): BarrelRaidPeriod[] {
  const periods = [period];
  let current = period;

  for (let index = 1; index < count; index += 1) {
    current = getPreviousBarrelRaidPeriod(current);
    periods.push(current);
  }

  return periods;
}

export function isBarrelRaidAuditBreak(now: Date): boolean {
  const { hour } = getKorchmaWallParts(now);
  return hour >= BARREL_RAID_AUDIT_BREAK_START_HOUR && hour < BARREL_RAID_AUDIT_BREAK_END_HOUR;
}

export function getNextBarrelRaidAvailableAt(now: Date): Date {
  if (isBarrelRaidAuditBreak(now)) {
    return getDateFromKorchmaWallParts({
      ...getKorchmaWallParts(now),
      hour: BARREL_RAID_AUDIT_BREAK_END_HOUR,
      minute: 0,
      second: 0
    });
  }

  const current = getBarrelRaidPeriod(now);
  return current.endsAt;
}

export function buildBarrelRaidItemGrants(input: {
  periodId: string;
  characterId: string;
  level: number;
  luck?: number;
  classId?: string;
  raceId?: string;
  isFirstSoloRaid: boolean;
}): Array<{ itemId: string; quantity: number }> {
  if (!input.isFirstSoloRaid) {
    return buildRepeatBarrelRaidItemGrants(input);
  }

  const rotatingLoot = [
    BARREL_SPLINTER_OF_OPTIMISM_ITEM_ID,
    FOAM_CORK_OF_ACCOUNTING_ITEM_ID,
    MIRAGE_FOAM_SAMPLE_ITEM_ID
  ];
  const rotatingItemId =
    rotatingLoot[stableHash(input.periodId) % rotatingLoot.length] ??
    BARREL_SPLINTER_OF_OPTIMISM_ITEM_ID;

  return [
    starterEquipmentGrant(APRON_OF_FOAM_RESISTANCE_ITEM_ID),
    {
      itemId: WET_HERO_TICKET_ITEM_ID,
      quantity: 1
    },
    {
      itemId: rotatingItemId,
      quantity: 1
    }
  ];
}

function buildRepeatBarrelRaidItemGrants(input: {
  periodId: string;
  characterId: string;
  level: number;
  luck?: number;
  classId?: string;
  raceId?: string;
}): Array<{ itemId: string; quantity: number }> {
  const level = Math.max(1, Math.floor(input.level));
  const seed = [
    "friday-barrel-raid-repeat",
    input.periodId,
    input.characterId,
    level,
    input.classId ?? "unknown-class",
    input.raceId ?? "unknown-race"
  ].join(":");
  const rng = new SeededRandomSource(seed);

  if (rng.nextFloat() >= FRIDAY_BARREL_RAID_REPEAT_ITEM_DROP_CHANCE) {
    return [];
  }

  const item = rollLootExpansionItem({
    profile: {
      level,
      ...(input.classId ? { classId: input.classId } : {}),
      ...(input.raceId ? { raceId: input.raceId } : {})
    },
    sourceId: "tavern_event",
    sourceTags: ["barrel", "raid"],
    ...(input.luck === undefined ? {} : { luck: input.luck }),
    rng
  });

  return item ? [{ itemId: item.id, quantity: 1 }] : [];
}

export function buildBigBarrelBrotherItemGrants(input: {
  periodId: string;
  characterId: string;
  level: number;
  luck?: number;
  classId?: string;
  raceId?: string;
}): Array<{ itemId: string; quantity: number }> {
  const level = Math.max(1, Math.floor(input.level));
  const seed = [
    "big-barrel-brother",
    input.periodId,
    input.characterId,
    level,
    input.classId ?? "unknown-class",
    input.raceId ?? "unknown-race"
  ].join(":");
  const item = rollLootExpansionItem({
    profile: {
      level,
      ...(input.classId ? { classId: input.classId } : {}),
      ...(input.raceId ? { raceId: input.raceId } : {})
    },
    sourceId: "boss_chest",
    ...(input.luck === undefined ? {} : { luck: input.luck }),
    rng: new SeededRandomSource(seed)
  });

  return [{
    itemId: item?.id ?? getFallbackBigBarrelGeneratedItemId(seed),
    quantity: 1
  }];
}

export function getBarrelRaidWaitBounds(characterLevel: number): {
  minSeconds: number;
  maxSeconds: number;
} {
  const level = Math.max(1, Math.floor(characterLevel));
  const levelBonusSeconds = (level - 1) * FRIDAY_BARREL_RAID_LEVEL_WAIT_BONUS_SECONDS;

  return {
    minSeconds: FRIDAY_BARREL_RAID_MIN_WAIT_MINUTES * 60,
    maxSeconds: FRIDAY_BARREL_RAID_MAX_WAIT_MINUTES * 60 + levelBonusSeconds
  };
}

export function buildBarrelRaidRewardAmounts(input: {
  characterLevel: number;
  waitDurationMs: number;
}): { xp: number; gold: number } {
  const waitBounds = getBarrelRaidWaitBounds(input.characterLevel);
  const waitSeconds = clamp(
    Math.round(input.waitDurationMs / 1000),
    waitBounds.minSeconds,
    waitBounds.maxSeconds
  );
  const progress =
    waitBounds.maxSeconds === waitBounds.minSeconds
      ? 0
      : (waitSeconds - waitBounds.minSeconds) / (waitBounds.maxSeconds - waitBounds.minSeconds);
  const xpMax = scaleBarrelRaidRewardMax(
    FRIDAY_BARREL_RAID_REWARD_XP_MIN,
    FRIDAY_BARREL_RAID_REWARD_XP_MAX,
    waitBounds
  );
  const goldMax = scaleBarrelRaidRewardMax(
    FRIDAY_BARREL_RAID_REWARD_GOLD_MIN,
    FRIDAY_BARREL_RAID_REWARD_GOLD_MAX,
    waitBounds
  );

  return {
    xp: interpolateReward(FRIDAY_BARREL_RAID_REWARD_XP_MIN, xpMax, progress),
    gold: interpolateReward(FRIDAY_BARREL_RAID_REWARD_GOLD_MIN, goldMax, progress)
  };
}

interface KorchmaLocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function getKorchmaWallParts(date: Date): KorchmaLocalParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BARREL_RAID_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );

  return {
    year: values.year ?? 0,
    month: values.month ?? 0,
    day: values.day ?? 0,
    hour: values.hour ?? 0,
    minute: values.minute ?? 0,
    second: values.second ?? 0
  };
}

function getDateFromKorchmaWallParts(parts: KorchmaLocalParts): Date {
  const targetWallMs = wallPartsToUtcMs(parts);
  let instant = new Date(targetWallMs);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const actualWallMs = wallPartsToUtcMs(getKorchmaWallParts(instant));
    const offset = targetWallMs - actualWallMs;

    if (offset === 0) {
      return instant;
    }

    instant = new Date(instant.getTime() + offset);
  }

  return instant;
}

function wallPartsToUtcMs(parts: KorchmaLocalParts): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, 0);
}

function formatKorchmaPeriodId(parts: KorchmaLocalParts): string {
  return `${parts.year.toString().padStart(4, "0")}-${parts.month
    .toString()
    .padStart(2, "0")}-${parts.day.toString().padStart(2, "0")}T${parts.hour
    .toString()
    .padStart(2, "0")}:${parts.minute.toString().padStart(2, "0")}`;
}

function stableHash(value: string): number {
  let hash = 0;

  for (const character of value) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  return hash;
}

function getFallbackBigBarrelGeneratedItemId(seed: string): string {
  const fallbackLoot = [
    "item.loot-v1-w001",
    "item.loot-v1-a001",
    "item.loot-v1-t001"
  ];

  return fallbackLoot[stableHash(seed) % fallbackLoot.length] ?? "item.loot-v1-w001";
}

function getBarrelRaidWaitDurationMs(pending: PendingFridayBarrelRaid): number {
  if (!pending.availableAt || !pending.startedAt) {
    return getBarrelRaidWaitBounds(summarizeCharacter(pending.character).level).minSeconds * 1000;
  }

  return Math.max(0, pending.availableAt.getTime() - pending.startedAt.getTime());
}

function scaleBarrelRaidRewardMax(
  minReward: number,
  baseMaxReward: number,
  waitBounds: { minSeconds: number; maxSeconds: number }
): number {
  const baseBounds = getBarrelRaidWaitBounds(1);
  const baseSpan = baseBounds.maxSeconds - baseBounds.minSeconds;
  const currentSpan = waitBounds.maxSeconds - waitBounds.minSeconds;

  if (baseSpan <= 0) {
    return baseMaxReward;
  }

  return minReward + Math.round((baseMaxReward - minReward) * (currentSpan / baseSpan));
}

function interpolateReward(minReward: number, maxReward: number, progress: number): number {
  return minReward + Math.round((maxReward - minReward) * progress);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getNewLeaderPeriods(
  characterId: string,
  before: KorchmaRoundLeaderboard,
  after: KorchmaRoundLeaderboard
): KorchmaRoundLeaderboardPeriod[] {
  return (["day", "week", "month"] as const).filter(
    (period) =>
      getLeader(before[period])?.characterId !== characterId &&
      getLeader(after[period])?.characterId === characterId
  );
}

function getLeader(entries: KorchmaRoundLeaderboardEntry[]): KorchmaRoundLeaderboardEntry | null {
  return entries[0] ?? null;
}

function buildReward(
  action: DailyActionRecord,
  itemGrants: Array<{ itemId: string; quantity: number }>
): TavernRaidReward {
  return {
    xp: action.rewardXp,
    gold: action.rewardGold,
    localDate: action.localDate,
    itemGrants: enrichRewardItemGrants(itemGrants)
  };
}
