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
import { CryptoRandomSource, type RandomSource } from "../shared/random";
import { systemClock, toIsoDate, type Clock } from "../shared/time";
import {
  APRON_OF_FOAM_RESISTANCE_ITEM_ID,
  BARREL_SPLINTER_OF_OPTIMISM_ITEM_ID,
  enrichRewardItemGrants,
  FOAM_CORK_OF_ACCOUNTING_ITEM_ID,
  MIRAGE_FOAM_SAMPLE_ITEM_ID,
  WET_HERO_TICKET_ITEM_ID,
  type RewardItemGrant
} from "./itemGrant";

export const BARREL_RAID_KEY = "tavern.friday-barrel-raid";
export const BARREL_RAID_PENDING_KEY = "tavern.friday-barrel-raid.pending";
export const FRIDAY_BARREL_RAID_KEY = BARREL_RAID_KEY;
export const FRIDAY_BARREL_RAID_PENDING_KEY = BARREL_RAID_PENDING_KEY;
export const FRIDAY_BARREL_RAID_REWARD_XP = 7;
export const FRIDAY_BARREL_RAID_REWARD_GOLD = 5;
export const FRIDAY_BARREL_RAID_MIN_WAIT_MINUTES = 5;
export const FRIDAY_BARREL_RAID_MAX_WAIT_MINUTES = 8;
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

interface PendingFridayBarrelRaid {
  availableAt: Date | null;
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
    private readonly random: RandomSource = new CryptoRandomSource()
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

    return this.startFridayBarrelRaid(telegramUserId, period);
  }

  async completeFridayBarrelRaid(
    telegramUserId: bigint,
    periodId = getBarrelRaidPeriod(this.clock()).id
  ): Promise<TavernRaidResult> {
    const claim = await this.dailyActions.claimForTelegramUser(telegramUserId, {
      key: FRIDAY_BARREL_RAID_KEY,
      localDate: periodId,
      rewardXp: FRIDAY_BARREL_RAID_REWARD_XP,
      rewardGold: FRIDAY_BARREL_RAID_REWARD_GOLD,
      itemGrants: buildBarrelRaidItemGrants(periodId)
    });

    if (!claim) {
      return { state: "no-character" };
    }

    if (claim.state === "existing") {
      return {
        state: "already-completed",
        character: summarizeCharacter(claim.character),
        reward: buildReward(claim.action, claim.itemGrants),
        levelChange: null
      };
    }

    return {
      state: "completed",
      character: summarizeCharacter(claim.character),
      reward: buildReward(claim.action, claim.itemGrants),
      levelChange: claim.levelChange
    };
  }

  private async startFridayBarrelRaid(
    telegramUserId: bigint,
    period: BarrelRaidPeriod
  ): Promise<TavernRaidResult> {
    if (!this.pendingRaids) {
      return this.completeFridayBarrelRaid(telegramUserId, period.id);
    }

    const now = this.clock();
    const availableAt = new Date(
      now.getTime() +
        this.random.nextInt(
          FRIDAY_BARREL_RAID_MIN_WAIT_MINUTES,
          FRIDAY_BARREL_RAID_MAX_WAIT_MINUTES
        ) *
          60_000
    );
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
        character: current.character,
        periodId: candidate.id
      };
    }

    return {
      availableAt: null,
      character,
      periodId: period.id
    };
  }

  async getRoundOfferForTelegramUser(telegramUserId: bigint): Promise<TavernRoundOfferResult> {
    const localDate = toIsoDate(this.clock());
    const raidPeriodId = getBarrelRaidPeriod(this.clock()).id;
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

  async buyRoundForTelegramUser(
    telegramUserId: bigint,
    tier: KorchmaRoundTier
  ): Promise<TavernRoundResult> {
    const localDate = toIsoDate(this.clock());
    const raidPeriodId = getBarrelRaidPeriod(this.clock()).id;
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

export function buildBarrelRaidItemGrants(
  periodId: string
): Array<{ itemId: string; quantity: number }> {
  const rotatingLoot = [
    BARREL_SPLINTER_OF_OPTIMISM_ITEM_ID,
    FOAM_CORK_OF_ACCOUNTING_ITEM_ID,
    MIRAGE_FOAM_SAMPLE_ITEM_ID
  ];
  const rotatingItemId =
    rotatingLoot[stableHash(periodId) % rotatingLoot.length] ?? BARREL_SPLINTER_OF_OPTIMISM_ITEM_ID;

  return [
    {
      itemId: APRON_OF_FOAM_RESISTANCE_ITEM_ID,
      quantity: 1
    },
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
