import { describe, expect, it } from "vitest";
import type {
  CharacterRecord,
  CharacterRepository,
  CreateCharacterInput,
  CreateCharacterResult
} from "../../src/db/repositories/characterRepository";
import type {
  CharacterCooldownRecord,
  ClaimCooldownRewardInput,
  ClaimCooldownRewardResult,
  CooldownRepository
} from "../../src/db/repositories/cooldownRepository";
import type {
  ClaimDailyActionInput,
  ClaimDailyActionResult,
  DailyActionRecord,
  DailyActionRepository
} from "../../src/db/repositories/dailyActionRepository";
import type {
  KorchmaRoundLeaderboard,
  KorchmaRoundPurchaseInput,
  KorchmaRoundPurchaseRepository
} from "../../src/db/repositories/korchmaRoundPurchaseRepository";
import type { TelegramUserProfile } from "../../src/db/repositories/userRepository";
import { getLevelForXp } from "../../src/domain/progression/level";
import { FakeRandomSource } from "../../src/shared/random";
import {
  buildBarrelRaidItemGrants,
  buildBarrelRaidRewardAmounts,
  FRIDAY_BARREL_RAID_KEY,
  FRIDAY_BARREL_RAID_PENDING_KEY,
  getBarrelRaidPeriod,
  getBarrelRaidWaitBounds,
  getNextBarrelRaidAvailableAt,
  isBarrelRaidAuditBreak,
  KORCHMA_FINE_ROUND_COST,
  KORCHMA_SIMPLE_ROUND_COST,
  TavernRaidService
} from "../../src/services/tavernRaidService";

const telegramUserId = 42n;
const fixedRaidReward = buildBarrelRaidRewardAmounts({
  characterLevel: 1,
  waitDurationMs: 5 * 60_000
});

describe("TavernRaidService", () => {
  it("builds hourly barrel raid periods from Kyiv korchma time", () => {
    expect(getBarrelRaidPeriod(new Date("2026-06-12T10:22:59.000Z"))).toMatchObject({
      id: "2026-06-12T12:23",
      startsAt: new Date("2026-06-12T09:23:00.000Z"),
      endsAt: new Date("2026-06-12T10:23:00.000Z")
    });
    expect(getBarrelRaidPeriod(new Date("2026-06-12T10:23:00.000Z"))).toMatchObject({
      id: "2026-06-12T13:23",
      startsAt: new Date("2026-06-12T10:23:00.000Z"),
      endsAt: new Date("2026-06-12T11:23:00.000Z")
    });
  });

  it("keeps barrel raid period ids stable across seasonal local offsets", () => {
    expect(getBarrelRaidPeriod(new Date("2026-01-12T10:23:00.000Z"))).toMatchObject({
      id: "2026-01-12T12:23",
      startsAt: new Date("2026-01-12T10:23:00.000Z"),
      endsAt: new Date("2026-01-12T11:23:00.000Z")
    });
  });

  it("uses Kyiv korchma time for the barrel audit break boundaries", () => {
    expect(isBarrelRaidAuditBreak(new Date("2026-06-11T23:59:59.000Z"))).toBe(false);
    expect(isBarrelRaidAuditBreak(new Date("2026-06-12T00:00:00.000Z"))).toBe(true);
    expect(isBarrelRaidAuditBreak(new Date("2026-06-12T03:59:59.000Z"))).toBe(true);
    expect(isBarrelRaidAuditBreak(new Date("2026-06-12T04:00:00.000Z"))).toBe(false);

    expect(isBarrelRaidAuditBreak(new Date("2026-01-11T00:59:59.000Z"))).toBe(false);
    expect(isBarrelRaidAuditBreak(new Date("2026-01-11T01:00:00.000Z"))).toBe(true);
    expect(isBarrelRaidAuditBreak(new Date("2026-01-11T04:59:59.000Z"))).toBe(true);
    expect(isBarrelRaidAuditBreak(new Date("2026-01-11T05:00:00.000Z"))).toBe(false);
  });

  it("returns the next available barrel raid time after the audit break", () => {
    expect(getNextBarrelRaidAvailableAt(new Date("2026-06-12T00:30:00.000Z"))).toEqual(
      new Date("2026-06-12T04:00:00.000Z")
    );
    expect(getNextBarrelRaidAvailableAt(new Date("2026-01-11T01:30:00.000Z"))).toEqual(
      new Date("2026-01-11T05:00:00.000Z")
    );
    expect(getNextBarrelRaidAvailableAt(new Date("2026-06-12T04:00:00.000Z"))).toEqual(
      new Date("2026-06-12T04:23:00.000Z")
    );
  });

  it("builds deterministic barrel raid starter and rotating loot for each period", () => {
    expect(buildBarrelRaidItemGrants("2026-06-12T13:23")).toEqual([
      { itemId: "item.apron-of-foam-resistance", quantity: 1 },
      { itemId: "item.wet-hero-ticket", quantity: 1 },
      { itemId: "item.barrel-splinter-of-optimism", quantity: 1 }
    ]);
    expect(buildBarrelRaidItemGrants("2026-06-12T13:23")).toEqual(
      buildBarrelRaidItemGrants("2026-06-12T13:23")
    );
    expect(buildBarrelRaidItemGrants("2026-06-12T14:23")).not.toEqual(
      buildBarrelRaidItemGrants("2026-06-12T13:23")
    );
  });

  it("scales barrel raid wait bounds by level", () => {
    expect(getBarrelRaidWaitBounds(1)).toEqual({
      minSeconds: 300,
      maxSeconds: 480
    });
    expect(getBarrelRaidWaitBounds(3)).toEqual({
      minSeconds: 300,
      maxSeconds: 540
    });
    expect(getBarrelRaidWaitBounds(10)).toEqual({
      minSeconds: 300,
      maxSeconds: 750
    });
  });

  it("builds deterministic barrel raid XP and gold from wait duration", () => {
    expect(fixedRaidReward).toEqual({
      xp: 18,
      gold: 8
    });
    expect(
      buildBarrelRaidRewardAmounts({
        characterLevel: 1,
        waitDurationMs: 8 * 60_000
      })
    ).toEqual({
      xp: 26,
      gold: 14
    });
    expect(
      buildBarrelRaidRewardAmounts({
        characterLevel: 10,
        waitDurationMs: 12.5 * 60_000
      })
    ).toEqual({
      xp: 38,
      gold: 23
    });
    expect(
      buildBarrelRaidRewardAmounts({
        characterLevel: 10,
        waitDurationMs: 8 * 60_000
      })
    ).toEqual({
      xp: 26,
      gold: 14
    });
  });

  it("prompts /start path when no character exists", async () => {
    const characters = new FakeCharacterRepository();
    const dailyActions = new FakeDailyActionRepository(characters);
    const service = createTavernRaidService(characters, dailyActions);

    await expect(service.getTavernForTelegramUser(telegramUserId)).resolves.toEqual({
      state: "no-character"
    });
    await expect(service.completeFridayBarrelRaid(telegramUserId)).resolves.toEqual({
      state: "no-character"
    });
  });

  it("creates one daily action and increments XP/gold once", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId);
    const dailyActions = new FakeDailyActionRepository(characters);
    const service = createTavernRaidService(characters, dailyActions);

    const first = await service.completeFridayBarrelRaid(telegramUserId);

    expect(first.state).toBe("completed");
    expect(dailyActions.createCount).toBe(1);
    expect(dailyActions.records).toHaveLength(1);
    expect(dailyActions.records[0]).toMatchObject({
      key: FRIDAY_BARREL_RAID_KEY,
      localDate: "2026-06-12T13:23",
      rewardXp: fixedRaidReward.xp,
      rewardGold: fixedRaidReward.gold
    });
    await expect(characters.findByTelegramUserId(telegramUserId)).resolves.toMatchObject({
      xp: fixedRaidReward.xp,
      gold: fixedRaidReward.gold
    });
    if (first.state === "completed") {
      expect(first.character.xp).toBe(fixedRaidReward.xp);
      expect(first.character.gold).toBe(fixedRaidReward.gold);
      expect(first.reward.itemGrants).toEqual([
        {
          itemId: "item.apron-of-foam-resistance",
          name: "Фартух піностійкого пригодника",
          quantity: 1
        },
        {
          itemId: "item.wet-hero-ticket",
          name: "Квиток мокрого пригодника",
          quantity: 1
        },
        {
          itemId: "item.barrel-splinter-of-optimism",
          name: "Скіпка бочкового оптимізму",
          quantity: 1
        }
      ]);
      expect(first.levelChange).toMatchObject({
        oldLevel: 1,
        newLevel: 2,
        leveledUp: true
      });
    }
  });

  it("updates character level when tavern XP crosses a threshold", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 7 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const service = createTavernRaidService(characters, dailyActions);

    const result = await service.completeFridayBarrelRaid(telegramUserId);

    expect(result.state).toBe("completed");
    await expect(characters.findByTelegramUserId(telegramUserId)).resolves.toMatchObject({
      xp: 25,
      level: 3
    });
    if (result.state === "completed") {
      expect(result.levelChange).toMatchObject({
        oldLevel: 1,
        newLevel: 3,
        leveledUp: true
      });
    }
  });

  it("does not duplicate rewards for repeated completion on the same day", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId);
    const dailyActions = new FakeDailyActionRepository(characters);
    const service = createTavernRaidService(characters, dailyActions);

    await service.completeFridayBarrelRaid(telegramUserId);
    const repeated = await service.completeFridayBarrelRaid(telegramUserId);

    expect(repeated.state).toBe("already-completed");
    expect(dailyActions.createCount).toBe(1);
    await expect(characters.findByTelegramUserId(telegramUserId)).resolves.toMatchObject({
      xp: fixedRaidReward.xp,
      gold: fixedRaidReward.gold
    });
    if (repeated.state === "already-completed") {
      expect(repeated.reward).toMatchObject({
        xp: fixedRaidReward.xp,
        gold: fixedRaidReward.gold,
        localDate: "2026-06-12T13:23",
        itemGrants: []
      });
      expect(repeated.character.xp).toBe(fixedRaidReward.xp);
      expect(repeated.character.gold).toBe(fixedRaidReward.gold);
    }
  });

  it("marks tavern lookup as already completed after today's raid", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId);
    const dailyActions = new FakeDailyActionRepository(characters);
    const service = createTavernRaidService(characters, dailyActions);

    await expect(service.getTavernForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "ready"
    });

    await service.completeFridayBarrelRaid(telegramUserId);

    await expect(service.getTavernForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "already-completed",
      character: {
        xp: fixedRaidReward.xp,
        gold: fixedRaidReward.gold
      }
    });
  });

  it("starts the barrel raid as a pending action before awarding rewards", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId);
    const dailyActions = new FakeDailyActionRepository(characters);
    const pendingRaids = new FakeCooldownRepository(characters);
    const service = createTavernRaidService(
      characters,
      dailyActions,
      new FakeKorchmaRoundPurchaseRepository(characters),
      pendingRaids,
      new FakeRandomSource([0])
    );

    const result = await service.advanceFridayBarrelRaid(telegramUserId);

    expect(result).toMatchObject({
      state: "pending-started",
      availableAt: new Date("2026-06-12T10:35:00.000Z"),
      now: fixedClock()
    });
    expect(pendingRaids.records[0]).toMatchObject({
      key: `${FRIDAY_BARREL_RAID_PENDING_KEY}:2026-06-12T13:23`,
      availableAt: new Date("2026-06-12T10:35:00.000Z")
    });
    expect(dailyActions.records).toHaveLength(0);
    await expect(characters.findByTelegramUserId(telegramUserId)).resolves.toMatchObject({
      xp: 0,
      gold: 0
    });
  });

  it("keeps the barrel raid pending until the wait ends", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId);
    const dailyActions = new FakeDailyActionRepository(characters);
    const pendingRaids = new FakeCooldownRepository(characters);
    const service = createTavernRaidService(
      characters,
      dailyActions,
      new FakeKorchmaRoundPurchaseRepository(characters),
      pendingRaids,
      new FakeRandomSource([0.999])
    );

    await service.advanceFridayBarrelRaid(telegramUserId);
    const repeated = await service.advanceFridayBarrelRaid(telegramUserId);

    expect(repeated).toMatchObject({
      state: "pending",
      availableAt: new Date("2026-06-12T10:38:00.000Z")
    });
    expect(dailyActions.records).toHaveLength(0);
  });

  it("raises the possible barrel raid wait ceiling for higher-level heroes", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const pendingRaids = new FakeCooldownRepository(characters);
    const service = createTavernRaidService(
      characters,
      dailyActions,
      new FakeKorchmaRoundPurchaseRepository(characters),
      pendingRaids,
      new FakeRandomSource([0.999])
    );

    const result = await service.advanceFridayBarrelRaid(telegramUserId);

    expect(result).toMatchObject({
      state: "pending-started",
      availableAt: new Date("2026-06-12T10:39:00.000Z")
    });
    expect(dailyActions.records).toHaveLength(0);
  });

  it("completes the barrel raid after the pending wait and keeps rewards idempotent", async () => {
    let now = new Date("2026-06-12T10:30:00.000Z");
    const clock = () => now;
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId);
    const dailyActions = new FakeDailyActionRepository(characters);
    const pendingRaids = new FakeCooldownRepository(characters);
    const service = new TavernRaidService(
      characters,
      dailyActions,
      new FakeKorchmaRoundPurchaseRepository(characters),
      pendingRaids,
      clock,
      new FakeRandomSource([0])
    );

    await service.advanceFridayBarrelRaid(telegramUserId);
    now = new Date("2026-06-12T10:35:01.000Z");
    const completed = await service.advanceFridayBarrelRaid(telegramUserId);
    const repeated = await service.advanceFridayBarrelRaid(telegramUserId);

    expect(completed).toMatchObject({
      state: "completed",
      reward: {
        xp: fixedRaidReward.xp,
        gold: fixedRaidReward.gold
      }
    });
    expect(repeated).toMatchObject({
      state: "already-completed"
    });
    expect(dailyActions.createCount).toBe(1);
    await expect(characters.findByTelegramUserId(telegramUserId)).resolves.toMatchObject({
      xp: fixedRaidReward.xp,
      gold: fixedRaidReward.gold
    });
  });

  it("awards more XP and gold when a higher-level barrel raid takes longer", async () => {
    let now = new Date("2026-06-12T10:30:00.000Z");
    const clock = () => now;
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 25 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const pendingRaids = new FakeCooldownRepository(characters);
    const service = new TavernRaidService(
      characters,
      dailyActions,
      new FakeKorchmaRoundPurchaseRepository(characters),
      pendingRaids,
      clock,
      new FakeRandomSource([0.999])
    );

    await service.advanceFridayBarrelRaid(telegramUserId);
    now = new Date("2026-06-12T10:39:01.000Z");
    const completed = await service.advanceFridayBarrelRaid(telegramUserId);

    expect(completed).toMatchObject({
      state: "completed",
      reward: {
        xp: 29,
        gold: 16
      }
    });
    expect(dailyActions.records[0]).toMatchObject({
      rewardXp: 29,
      rewardGold: 16
    });
    await expect(characters.findByTelegramUserId(telegramUserId)).resolves.toMatchObject({
      xp: 54,
      gold: 16
    });
  });

  it("can complete an older pending raid when the player returns after later periods opened", async () => {
    let now = new Date("2026-06-12T10:30:00.000Z");
    const clock = () => now;
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId);
    const dailyActions = new FakeDailyActionRepository(characters);
    const pendingRaids = new FakeCooldownRepository(characters);
    const service = new TavernRaidService(
      characters,
      dailyActions,
      new FakeKorchmaRoundPurchaseRepository(characters),
      pendingRaids,
      clock,
      new FakeRandomSource([0])
    );

    await service.advanceFridayBarrelRaid(telegramUserId);
    now = new Date("2026-06-12T13:00:00.000Z");
    const completed = await service.advanceFridayBarrelRaid(telegramUserId);

    expect(completed).toMatchObject({
      state: "completed",
      reward: {
        localDate: "2026-06-12T13:23"
      }
    });
    expect(dailyActions.records[0]?.localDate).toBe("2026-06-12T13:23");

    const next = await service.advanceFridayBarrelRaid(telegramUserId);

    expect(next).toMatchObject({
      state: "pending-started",
      periodId: "2026-06-12T15:23",
      availableAt: new Date("2026-06-12T13:05:00.000Z")
    });
    expect(dailyActions.records.map((record) => record.localDate)).toEqual([
      "2026-06-12T13:23"
    ]);
  });

  it("completes an already pending raid during the audit break", async () => {
    let now = new Date("2026-06-11T23:55:00.000Z");
    const clock = () => now;
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId);
    const dailyActions = new FakeDailyActionRepository(characters);
    const pendingRaids = new FakeCooldownRepository(characters);
    const service = new TavernRaidService(
      characters,
      dailyActions,
      new FakeKorchmaRoundPurchaseRepository(characters),
      pendingRaids,
      clock,
      new FakeRandomSource([0])
    );

    await service.advanceFridayBarrelRaid(telegramUserId);
    now = new Date("2026-06-12T00:01:00.000Z");
    const completed = await service.advanceFridayBarrelRaid(telegramUserId);

    expect(completed).toMatchObject({
      state: "completed",
      reward: {
        localDate: "2026-06-12T02:23"
      }
    });
    expect(dailyActions.records).toHaveLength(1);
    expect(dailyActions.records[0]?.localDate).toBe("2026-06-12T02:23");
  });

  it("ignores stale pending rows outside the recent lookup window", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId);
    const dailyActions = new FakeDailyActionRepository(characters);
    const pendingRaids = new FakeCooldownRepository(characters);
    pendingRaids.seed(telegramUserId, {
      key: `${FRIDAY_BARREL_RAID_PENDING_KEY}:2026-06-11T08:23`,
      availableAt: new Date("2026-06-20T10:00:00.000Z")
    });
    const service = createTavernRaidService(
      characters,
      dailyActions,
      new FakeKorchmaRoundPurchaseRepository(characters),
      pendingRaids,
      new FakeRandomSource([0])
    );

    const result = await service.advanceFridayBarrelRaid(telegramUserId);

    expect(result).toMatchObject({
      state: "pending-started",
      periodId: "2026-06-12T13:23"
    });
    expect(pendingRaids.records.map((record) => record.key)).toContain(
      `${FRIDAY_BARREL_RAID_PENDING_KEY}:2026-06-12T13:23`
    );
    expect(dailyActions.records).toHaveLength(0);
  });

  it("starts a fresh pending raid after the next hourly period opens at minute 23", async () => {
    let now = new Date("2026-06-12T10:30:00.000Z");
    const clock = () => now;
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId);
    const dailyActions = new FakeDailyActionRepository(characters);
    const pendingRaids = new FakeCooldownRepository(characters);
    const service = new TavernRaidService(
      characters,
      dailyActions,
      new FakeKorchmaRoundPurchaseRepository(characters),
      pendingRaids,
      clock,
      new FakeRandomSource([0])
    );

    await service.advanceFridayBarrelRaid(telegramUserId);
    now = new Date("2026-06-12T10:35:01.000Z");
    await service.advanceFridayBarrelRaid(telegramUserId);

    now = new Date("2026-06-12T11:22:59.000Z");
    const stillSamePeriod = await service.advanceFridayBarrelRaid(telegramUserId);

    expect(stillSamePeriod).toMatchObject({
      state: "already-completed"
    });

    now = new Date("2026-06-12T11:23:00.000Z");
    const nextPeriod = await service.advanceFridayBarrelRaid(telegramUserId);

    expect(nextPeriod).toMatchObject({
      state: "pending-started",
      availableAt: new Date("2026-06-12T11:28:00.000Z")
    });
    expect(dailyActions.createCount).toBe(1);
    expect(pendingRaids.records.map((record) => record.key)).toEqual([
      `${FRIDAY_BARREL_RAID_PENDING_KEY}:2026-06-12T13:23`,
      `${FRIDAY_BARREL_RAID_PENDING_KEY}:2026-06-12T14:23`
    ]);
  });

  it("pauses new barrel raids during the early-morning accounting break", async () => {
    const clock = () => new Date("2026-06-12T00:30:00.000Z");
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId);
    const dailyActions = new FakeDailyActionRepository(characters);
    const pendingRaids = new FakeCooldownRepository(characters);
    const service = new TavernRaidService(
      characters,
      dailyActions,
      new FakeKorchmaRoundPurchaseRepository(characters),
      pendingRaids,
      clock,
      new FakeRandomSource([0])
    );

    await expect(service.getTavernForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "audit-break",
      nextAvailableAt: new Date("2026-06-12T04:00:00.000Z")
    });
    await expect(service.advanceFridayBarrelRaid(telegramUserId)).resolves.toMatchObject({
      state: "audit-break",
      nextAvailableAt: new Date("2026-06-12T04:00:00.000Z")
    });
    expect(pendingRaids.records).toHaveLength(0);
    expect(dailyActions.records).toHaveLength(0);
  });

  it("opens new barrel raids at 07:00 Kyiv after the accounting break", async () => {
    let now = new Date("2026-06-12T03:59:59.000Z");
    const clock = () => now;
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId);
    const dailyActions = new FakeDailyActionRepository(characters);
    const pendingRaids = new FakeCooldownRepository(characters);
    const service = new TavernRaidService(
      characters,
      dailyActions,
      new FakeKorchmaRoundPurchaseRepository(characters),
      pendingRaids,
      clock,
      new FakeRandomSource([0])
    );

    await expect(service.advanceFridayBarrelRaid(telegramUserId)).resolves.toMatchObject({
      state: "audit-break",
      nextAvailableAt: new Date("2026-06-12T04:00:00.000Z")
    });

    now = new Date("2026-06-12T04:00:00.000Z");

    await expect(service.advanceFridayBarrelRaid(telegramUserId)).resolves.toMatchObject({
      state: "pending-started",
      availableAt: new Date("2026-06-12T04:05:00.000Z"),
      periodId: "2026-06-12T06:23"
    });
  });

  it("reports active pending raid for blocking other actions", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId);
    const dailyActions = new FakeDailyActionRepository(characters);
    const service = createTavernRaidService(characters, dailyActions);

    await service.advanceFridayBarrelRaid(telegramUserId);

    await expect(
      service.getActivePendingFridayBarrelRaidForTelegramUser(telegramUserId)
    ).resolves.toMatchObject({
      state: "pending",
      availableAt: new Date("2026-06-12T10:35:00.000Z")
    });
  });

  it("blocks buying a round until today's barrel raid is done", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { gold: 100 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const service = createTavernRaidService(characters, dailyActions);

    const result = await service.getRoundOfferForTelegramUser(telegramUserId);

    expect(result.state).toBe("raid-required");
    await expect(characters.findByTelegramUserId(telegramUserId)).resolves.toMatchObject({
      gold: 100
    });
  });

  it("shows round options after the barrel raid without spending gold", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { gold: 125 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const roundPurchases = new FakeKorchmaRoundPurchaseRepository(characters);
    const service = createTavernRaidService(characters, dailyActions, roundPurchases);

    await service.completeFridayBarrelRaid(telegramUserId);
    const result = await service.getRoundOfferForTelegramUser(telegramUserId);

    expect(result).toMatchObject({
      state: "ready",
      gold: 133,
      canBuySimple: true,
      canBuyFine: true
    });
    expect(roundPurchases.purchases).toHaveLength(0);
    await expect(characters.findByTelegramUserId(telegramUserId)).resolves.toMatchObject({
      gold: 133
    });
  });

  it("requires the current raid period before offering beer rounds in a later period", async () => {
    let now = new Date("2026-06-12T10:30:00.000Z");
    const clock = () => now;
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { gold: 125 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const service = new TavernRaidService(
      characters,
      dailyActions,
      new FakeKorchmaRoundPurchaseRepository(characters),
      new FakeCooldownRepository(characters),
      clock,
      new FakeRandomSource([0])
    );

    await service.completeFridayBarrelRaid(telegramUserId);
    await expect(service.getRoundOfferForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "ready",
      gold: 133
    });

    now = new Date("2026-06-12T11:23:00.000Z");

    await expect(service.getRoundOfferForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "raid-required"
    });
  });

  it("spends 100 gold on a fine round after the barrel raid", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { gold: 125 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const roundPurchases = new FakeKorchmaRoundPurchaseRepository(characters);
    const service = createTavernRaidService(characters, dailyActions, roundPurchases);

    await service.completeFridayBarrelRaid(telegramUserId);
    const result = await service.buyRoundForTelegramUser(telegramUserId, "fine");

    expect(result).toMatchObject({
      state: "fine-round",
      spentGold: KORCHMA_FINE_ROUND_COST,
      remainingGold: 33
    });
    expect(roundPurchases.purchases).toMatchObject([
      {
        characterId: "character-42",
        tier: "fine",
        spentGold: KORCHMA_FINE_ROUND_COST,
        localDate: "2026-06-12"
      }
    ]);
    if (result.state === "fine-round") {
      expect(result.leaderboard.day[0]).toMatchObject({
        name: "Мандрівник",
        roundCount: 1,
        spentGold: KORCHMA_FINE_ROUND_COST
      });
      expect(result.becameLeader).toEqual(["day", "week", "month"]);
    }
    await expect(characters.findByTelegramUserId(telegramUserId)).resolves.toMatchObject({
      gold: 33
    });
  });

  it("marks a hero as new leader only when they overtake the previous top patron", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { gold: 125 });
    characters.add(99n, { gold: 0, name: "Дара" });
    const dailyActions = new FakeDailyActionRepository(characters);
    const roundPurchases = new FakeKorchmaRoundPurchaseRepository(characters);
    roundPurchases.seed({
      characterId: "character-99",
      tier: "simple",
      spentGold: KORCHMA_SIMPLE_ROUND_COST,
      localDate: "2026-06-12"
    });
    const service = createTavernRaidService(characters, dailyActions, roundPurchases);

    await service.completeFridayBarrelRaid(telegramUserId);
    const result = await service.buyRoundForTelegramUser(telegramUserId, "fine");

    expect(result).toMatchObject({
      state: "fine-round",
      becameLeader: ["day", "week", "month"]
    });
    if (result.state === "fine-round") {
      expect(result.leaderboard.day.map((entry) => entry.name)).toEqual(["Мандрівник", "Дара"]);
    }

    const repeatedLeader = await service.buyRoundForTelegramUser(telegramUserId, "simple");

    expect(repeatedLeader).toMatchObject({
      state: "simple-round",
      becameLeader: []
    });
  });

  it("spends 10 gold on a simple round when the hero cannot afford a fine one", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { gold: 12 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const service = createTavernRaidService(characters, dailyActions);

    await service.completeFridayBarrelRaid(telegramUserId);
    const result = await service.buyRoundForTelegramUser(telegramUserId, "simple");

    expect(result).toMatchObject({
      state: "simple-round",
      spentGold: KORCHMA_SIMPLE_ROUND_COST,
      remainingGold: 10
    });
  });

  it("does not spend gold when the hero cannot afford even a simple round", async () => {
    const poorTelegramUserId = 43n;
    const characters = new FakeCharacterRepository();
    characters.add(poorTelegramUserId, { gold: 0 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const service = createTavernRaidService(characters, dailyActions);

    await service.completeFridayBarrelRaid(poorTelegramUserId);
    const result = await service.getRoundOfferForTelegramUser(poorTelegramUserId);

    expect(result).toMatchObject({
      state: "not-enough-gold",
      gold: 8
    });
    await expect(characters.findByTelegramUserId(poorTelegramUserId)).resolves.toMatchObject({
      gold: 8
    });
  });
});

function createTavernRaidService(
  characters: FakeCharacterRepository,
  dailyActions: FakeDailyActionRepository,
  roundPurchases = new FakeKorchmaRoundPurchaseRepository(characters),
  pendingRaids = new FakeCooldownRepository(characters),
  random = new FakeRandomSource([0])
): TavernRaidService {
  return new TavernRaidService(
    characters,
    dailyActions,
    roundPurchases,
    pendingRaids,
    fixedClock,
    random
  );
}

function fixedClock(): Date {
  return new Date("2026-06-12T10:30:00.000Z");
}

class FakeCharacterRepository implements CharacterRepository {
  private readonly charactersByTelegramUserId = new Map<bigint, CharacterRecord>();

  add(userTelegramId: bigint, overrides: Partial<CharacterRecord> = {}): void {
    const xp = overrides.xp ?? 0;
    this.charactersByTelegramUserId.set(userTelegramId, {
      id: `character-${userTelegramId.toString()}`,
      userId: `user-${userTelegramId.toString()}`,
      name: "Мандрівник",
      pronoun: "they",
      path: "boundary",
      raceId: "race.human-ish",
      classId: "class.warrior",
      level: getLevelForXp(xp),
      xp,
      gold: 0,
      hpCurrent: 22,
      hpMax: 22,
      manaCurrent: 10,
      manaMax: 10,
      statsJson: {
        strength: 8,
        dexterity: 6,
        intelligence: 6,
        charisma: 6,
        luck: 6
      },
      ...overrides
    });
  }

  updateReward(userTelegramId: bigint, xp: number, gold: number): CharacterRecord {
    const character = this.charactersByTelegramUserId.get(userTelegramId);

    if (!character) {
      throw new Error("Character not found.");
    }

    const nextXp = character.xp + xp;
    const updated = {
      ...character,
      xp: nextXp,
      gold: character.gold + gold,
      level: getLevelForXp(nextXp)
    };
    this.charactersByTelegramUserId.set(userTelegramId, updated);
    return updated;
  }

  spendGoldForTelegramUser(
    userTelegramId: bigint,
    amount: number
  ): Promise<
    | { state: "spent"; character: CharacterRecord }
    | { state: "insufficient"; character: CharacterRecord }
    | null
  > {
    const character = this.charactersByTelegramUserId.get(userTelegramId);

    if (!character) {
      return Promise.resolve(null);
    }

    if (character.gold < amount) {
      return Promise.resolve({
        state: "insufficient",
        character
      });
    }

    const updated = {
      ...character,
      gold: character.gold - amount
    };
    this.charactersByTelegramUserId.set(userTelegramId, updated);

    return Promise.resolve({
      state: "spent",
      character: updated
    });
  }

  findByUserId(userId: string): Promise<CharacterRecord | null> {
    return Promise.resolve(
      [...this.charactersByTelegramUserId.values()].find((character) => character.userId === userId) ??
        null
    );
  }

  findByTelegramUserId(userTelegramId: bigint): Promise<CharacterRecord | null> {
    return Promise.resolve(this.charactersByTelegramUserId.get(userTelegramId) ?? null);
  }

  deleteByTelegramUserId(userTelegramId: bigint): Promise<boolean> {
    return Promise.resolve(this.charactersByTelegramUserId.delete(userTelegramId));
  }

  createForTelegramUserIfMissing(
    user: TelegramUserProfile,
    input: CreateCharacterInput
  ): Promise<CreateCharacterResult> {
    const existing = this.charactersByTelegramUserId.get(user.telegramUserId);

    if (existing) {
      return Promise.resolve({ character: existing, created: false });
    }

    const character: CharacterRecord = {
      id: `character-${user.telegramUserId.toString()}`,
      userId: `user-${user.telegramUserId.toString()}`,
      ...input
    };
    this.charactersByTelegramUserId.set(user.telegramUserId, character);

    return Promise.resolve({ character, created: true });
  }

  findByCharacterId(characterId: string): CharacterRecord | null {
    return (
      [...this.charactersByTelegramUserId.values()].find(
        (character) => character.id === characterId
      ) ?? null
    );
  }
}

class FakeKorchmaRoundPurchaseRepository implements KorchmaRoundPurchaseRepository {
  readonly purchases: FakeKorchmaRoundPurchase[] = [];

  constructor(private readonly characters: FakeCharacterRepository) {}

  async spendGoldAndCreate(input: KorchmaRoundPurchaseInput) {
    const spend = await this.characters.spendGoldForTelegramUser(
      input.telegramUserId,
      input.spentGold
    );

    if (!spend || spend.state === "insufficient") {
      return spend;
    }

    this.seed({
      ...input,
      characterId: spend.character.id
    });

    return spend;
  }

  seed(input: FakeKorchmaRoundPurchase): void {
    this.purchases.push(input);
  }

  getLeaderboard(): Promise<KorchmaRoundLeaderboard> {
    const entries = new Map<string, { roundCount: number; spentGold: number }>();

    for (const purchase of this.purchases) {
      const current = entries.get(purchase.characterId) ?? {
        roundCount: 0,
        spentGold: 0
      };
      entries.set(purchase.characterId, {
        roundCount: current.roundCount + 1,
        spentGold: current.spentGold + purchase.spentGold
      });
    }

    const rows = [...entries.entries()]
      .map(([characterId, stats]) => ({
        characterId,
        name: this.characters.findByCharacterId(characterId)?.name ?? "Хтось щедрий",
        ...stats
      }))
      .sort((left, right) => right.spentGold - left.spentGold || right.roundCount - left.roundCount)
      .slice(0, 5);

    return Promise.resolve({
      day: rows,
      week: rows,
      month: rows
    });
  }
}

interface FakeKorchmaRoundPurchase {
  characterId: string;
  tier: "simple" | "fine";
  spentGold: number;
  localDate: string;
}

class FakeCooldownRepository implements CooldownRepository {
  private readonly cooldowns = new Map<string, CharacterCooldownRecord>();
  private cursor = 0;

  constructor(private readonly characters: FakeCharacterRepository) {}

  get records(): CharacterCooldownRecord[] {
    return [...this.cooldowns.values()];
  }

  seed(
    userTelegramId: bigint,
    input: {
      key: string;
      availableAt: Date;
    }
  ): void {
    const character = this.characters.findByCharacterId(`character-${userTelegramId.toString()}`);

    if (!character) {
      throw new Error("Character not found.");
    }

    this.cooldowns.set(`${character.id}:${input.key}`, {
      id: `cooldown-seed-${++this.cursor}`,
      characterId: character.id,
      key: input.key,
      availableAt: input.availableAt,
      updatedAt: input.availableAt
    });
  }

  async findForTelegramUser(
    userTelegramId: bigint,
    key: string
  ): Promise<{ cooldown: CharacterCooldownRecord | null; character: CharacterRecord } | null> {
    const character = await this.characters.findByTelegramUserId(userTelegramId);

    if (!character) {
      return null;
    }

    return {
      character,
      cooldown: this.cooldowns.get(`${character.id}:${key}`) ?? null
    };
  }

  async claimRewardForTelegramUser(
    userTelegramId: bigint,
    input: ClaimCooldownRewardInput
  ): Promise<ClaimCooldownRewardResult | null> {
    const character = await this.characters.findByTelegramUserId(userTelegramId);

    if (!character) {
      return null;
    }

    const key = `${character.id}:${input.key}`;
    const existing = this.cooldowns.get(key);

    if (existing && existing.availableAt > input.now) {
      return {
        state: "on-cooldown",
        cooldown: existing,
        character
      };
    }

    const cooldown = {
      id: existing?.id ?? `cooldown-${++this.cursor}`,
      characterId: character.id,
      key: input.key,
      availableAt: input.availableAt,
      updatedAt: input.now
    };
    this.cooldowns.set(key, cooldown);

    const updated = this.characters.updateReward(
      userTelegramId,
      input.rewardXp,
      input.rewardGold
    );

    return {
      state: "completed",
      cooldown,
      character: updated,
      itemGrants: input.itemGrants ?? [],
      levelChange: {
        oldLevel: getLevelForXp(character.xp),
        newLevel: getLevelForXp(character.xp + input.rewardXp),
        leveledUp:
          getLevelForXp(character.xp + input.rewardXp) > getLevelForXp(character.xp)
      }
    };
  }
}

class FakeDailyActionRepository implements DailyActionRepository {
  private readonly actions = new Map<string, DailyActionRecord>();
  createCount = 0;

  constructor(private readonly characters: FakeCharacterRepository) {}

  get records(): DailyActionRecord[] {
    return [...this.actions.values()];
  }

  async findForTelegramUser(
    userTelegramId: bigint,
    input: { key: string; localDate: string }
  ): Promise<DailyActionRecord | null> {
    const character = await this.characters.findByTelegramUserId(userTelegramId);

    if (!character) {
      return null;
    }

    return this.actions.get(`${character.id}:${input.key}:${input.localDate}`) ?? null;
  }

  async claimForTelegramUser(
    userTelegramId: bigint,
    input: ClaimDailyActionInput
  ): Promise<ClaimDailyActionResult | null> {
    const character = await this.characters.findByTelegramUserId(userTelegramId);

    if (!character) {
      return null;
    }

    const claimKey = `${character.id}:${input.key}:${input.localDate}`;
    const existing = this.actions.get(claimKey);

    if (existing) {
      return {
        state: "existing",
        action: existing,
        character,
        levelChange: null,
        itemGrants: []
      };
    }

    this.createCount += 1;
    const action = {
      id: `daily-action-${this.createCount}`,
      characterId: character.id,
      key: input.key,
      localDate: input.localDate,
      rewardXp: input.rewardXp,
      rewardGold: input.rewardGold,
      createdAt: fixedClock()
    };
    this.actions.set(claimKey, action);

    return {
      state: "created",
      action,
      character: this.characters.updateReward(userTelegramId, input.rewardXp, input.rewardGold),
      itemGrants: input.itemGrants ?? [],
      levelChange: {
        oldLevel: getLevelForXp(character.xp),
        newLevel: getLevelForXp(character.xp + input.rewardXp),
        leveledUp: getLevelForXp(character.xp + input.rewardXp) > getLevelForXp(character.xp)
      }
    };
  }
}
