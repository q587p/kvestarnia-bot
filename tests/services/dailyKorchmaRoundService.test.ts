import { describe, expect, it } from "vitest";
import type { CharacterRecord, CharacterRepository } from "../../src/db/repositories/characterRepository";
import { DailyActionPrefixLimitExceededError } from "../../src/db/repositories/dailyActionRepository";
import type {
  ClaimDailyActionInput,
  ClaimDailyActionResult,
  DailyActionRecord,
  DailyActionRepository
} from "../../src/db/repositories/dailyActionRepository";
import { DAILY_KORCHMA_ROUND_REQUIRED_STEPS } from "../../src/content/dailyKorchmaRoundContent";
import {
  DAILY_KORCHMA_ROUND_OFFER_KEY,
  DAILY_KORCHMA_ROUND_REROLL_KEY,
  DAILY_KORCHMA_ROUND_REWARD_KEY,
  DAILY_KORCHMA_ROUND_STEP_KEY
} from "../../src/services/dailyActionKeys";
import {
  DailyKorchmaRoundService,
  calculateDailyKorchmaRoundReward
} from "../../src/services/dailyKorchmaRoundService";
import {
  PRESENCE_LOCATION_KORCHMA_HALL,
  PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
  getLocationName
} from "../../src/services/presenceService";
import { ISKROKAMIN_ITEM_ID } from "../../src/services/itemGrant";

const telegramUserId = 587n;
const now = new Date("2026-06-28T09:00:00.000Z");

describe("DailyKorchmaRoundService", () => {
  it("locks level 1 without an existing offer and creates a stable level 3 offer with one yard and two interiors", async () => {
    const world = new FakeWorld(makeCharacter({ level: 1 }));
    let result = await world.service.getForTelegramUser(telegramUserId);

    expect(result.state).toBe("level-locked");
    expect((await world.service.getExistingForTelegramUser(telegramUserId)).state).toBe("level-locked");
    expect(world.daily.records.filter((record) => record.key === DAILY_KORCHMA_ROUND_OFFER_KEY)).toHaveLength(0);

    world.character = makeCharacter({ level: 3 });
    result = await world.service.getForTelegramUser(telegramUserId);

    expect(result.state).toBe("ready");
    if (result.state !== "ready") {
      return;
    }
    expect(result.offer.scenes).toHaveLength(3);
    expect(result.offer.scenes.filter((scene) => scene.zone === "yard")).toHaveLength(1);
    expect(new Set(result.offer.scenes.filter((scene) => scene.zone === "interior").map((scene) => scene.locationId)).size).toBe(2);
    expect(world.daily.records.filter((record) => record.key === DAILY_KORCHMA_ROUND_OFFER_KEY)).toHaveLength(1);

    const replay = await world.service.getForTelegramUser(telegramUserId);
    expect(replay.state).toBe("ready");
    if (replay.state === "ready") {
      expect(replay.offer.scenes.map((scene) => scene.id)).toEqual(result.offer.scenes.map((scene) => scene.id));
    }
  });

  it("can inspect an existing daily offer without creating one from location navigation", async () => {
    const world = new FakeWorld(makeCharacter({ level: 3 }));
    const notIssued = await world.service.getExistingForTelegramUser(telegramUserId);

    expect(notIssued.state).toBe("not-issued");
    expect(notIssued.state === "not-issued" ? notIssued.dayToken : null).toBe("20260628");
    expect(world.daily.records.filter((record) => record.key === DAILY_KORCHMA_ROUND_OFFER_KEY)).toHaveLength(0);

    const issued = await world.service.getForTelegramUser(telegramUserId);

    expect(issued.state).toBe("ready");
    expect(world.daily.records.filter((record) => record.key === DAILY_KORCHMA_ROUND_OFFER_KEY)).toHaveLength(1);

    const existing = await world.service.getExistingForTelegramUser(telegramUserId);

    expect(existing.state).toBe("ready");
    if (issued.state === "ready" && existing.state === "ready") {
      expect(existing.offer.scenes.map((scene) => scene.id)).toEqual(issued.offer.scenes.map((scene) => scene.id));
    }
    expect(world.daily.records.filter((record) => record.key === DAILY_KORCHMA_ROUND_OFFER_KEY)).toHaveLength(1);
  });

  it("uses bounded marker reads for every marker state without invoking the Fight service", async () => {
    const noCharacter = new FakeWorld(null);
    await expect(markerLookup(noCharacter)).resolves.toEqual({ state: "no-character" });
    expectMarkerCalls(noCharacter, { character: 1, offer: 0, barrel: 0, steps: 0, reward: 0, fight: 0 });

    const levelLocked = new FakeWorld(makeCharacter({ level: 1 }));
    await expect(markerLookup(levelLocked)).resolves.toMatchObject({ state: "level-locked" });
    expectMarkerCalls(levelLocked, { character: 1, offer: 1, barrel: 0, steps: 0, reward: 0, fight: 0 });

    const hpBlocked = new FakeWorld(makeCharacter({ level: 3, hpCurrent: 0 }));
    await expect(markerLookup(hpBlocked)).resolves.toMatchObject({ state: "hp-blocked" });
    expectMarkerCalls(hpBlocked, { character: 1, offer: 1, barrel: 0, steps: 0, reward: 0, fight: 0 });

    const activeFight = new FakeWorld(makeCharacter({ level: 3 }));
    await expect(markerLookup(activeFight, "persistent-active")).resolves.toMatchObject({ state: "active-fight" });
    expectMarkerCalls(activeFight, { character: 1, offer: 1, barrel: 1, steps: 0, reward: 0, fight: 0 });

    const pendingBarrel = new FakeWorld(makeCharacter({ level: 3 }));
    pendingBarrel.pendingBarrel = true;
    await expect(markerLookup(pendingBarrel)).resolves.toMatchObject({ state: "pending-barrel" });
    expectMarkerCalls(pendingBarrel, { character: 1, offer: 1, barrel: 1, steps: 0, reward: 0, fight: 0 });

    const notIssued = new FakeWorld(makeCharacter({ level: 3 }));
    await expect(markerLookup(notIssued)).resolves.toMatchObject({ state: "not-issued" });
    expectMarkerCalls(notIssued, { character: 1, offer: 1, barrel: 1, steps: 0, reward: 0, fight: 0 });

    const ready = new FakeWorld(makeCharacter({ level: 3 }));
    await readyOffer(ready);
    ready.resetMarkerCalls();
    await expect(markerLookup(ready)).resolves.toMatchObject({ state: "ready" });
    expectMarkerCalls(ready, { character: 1, offer: 1, barrel: 1, steps: 1, reward: 1, fight: 0 });

    const turnInReady = new FakeWorld(makeCharacter({ level: 3 }));
    const turnInOffer = await readyOffer(turnInReady);
    await recordMarkerStep(turnInReady, turnInOffer, 0);
    await recordMarkerStep(turnInReady, turnInOffer, 1);
    turnInReady.resetMarkerCalls();
    await expect(markerLookup(turnInReady)).resolves.toMatchObject({ state: "turn-in-ready" });
    expectMarkerCalls(turnInReady, { character: 1, offer: 1, barrel: 1, steps: 1, reward: 1, fight: 0 });

    const completed = new FakeWorld(makeCharacter({ level: 3 }));
    const completedOffer = await readyOffer(completed);
    await completed.daily.claimForTelegramUser(telegramUserId, {
      key: DAILY_KORCHMA_ROUND_REWARD_KEY,
      localDate: completedOffer.dayKey,
      rewardXp: 1,
      rewardGold: 1,
      resultJson: { version: 1 }
    });
    completed.resetMarkerCalls();
    await expect(markerLookup(completed)).resolves.toMatchObject({ state: "completed" });
    expectMarkerCalls(completed, { character: 1, offer: 1, barrel: 1, steps: 1, reward: 1, fight: 0 });
  });

  it("starts independent marker reads before the shared Fight result settles", async () => {
    const world = new FakeWorld(makeCharacter({ level: 3 }));
    let resolveFight: ((value: never) => void) | undefined;
    const sharedFight = new Promise<never>((resolve) => {
      resolveFight = resolve;
    });
    const marker = world.service.getQuestMarkerForTelegramUser(telegramUserId, sharedFight);

    await Promise.resolve();
    await Promise.resolve();

    expect(world.characterReads).toBe(1);
    expect(world.daily.findCalls).toContainEqual({
      key: DAILY_KORCHMA_ROUND_OFFER_KEY,
      localDate: "2026-06-28"
    });
    expect(world.barrelReads).toBe(1);

    resolveFight?.({ state: "ready", character: world.character! } as never);
    await expect(marker).resolves.toMatchObject({ state: "not-issued" });
  });

  it("linearizes the marker day after a deferred character read crossing Kyiv midnight", async () => {
    const beforeKyivMidnight = new Date("2026-06-28T20:59:59.900Z");
    const afterKyivMidnight = new Date("2026-06-28T21:00:00.100Z");
    let clockNow = afterKyivMidnight;
    const world = new FakeWorld(makeCharacter({ level: 3 }), () => clockNow);
    await expect(world.service.getForTelegramUser(telegramUserId)).resolves.toMatchObject({ state: "ready" });
    world.resetMarkerCalls();

    let resolveCharacter: ((character: CharacterRecord | null) => void) | undefined;
    world.characterLookup = () => new Promise((resolve) => {
      resolveCharacter = resolve;
    });
    clockNow = beforeKyivMidnight;
    const marker = markerLookup(world);

    await Promise.resolve();
    clockNow = afterKyivMidnight;
    resolveCharacter?.(world.character);

    await expect(marker).resolves.toMatchObject({ state: "ready" });
    expect(world.daily.findCalls).toContainEqual({
      key: DAILY_KORCHMA_ROUND_OFFER_KEY,
      localDate: "2026-06-29"
    });
    expect(world.daily.findCalls).not.toContainEqual({
      key: DAILY_KORCHMA_ROUND_OFFER_KEY,
      localDate: "2026-06-28"
    });
  });

  it("loads step rows through the current-day prefix only", async () => {
    const world = new FakeWorld(makeCharacter({ level: 3 }));
    const offer = await readyOffer(world);
    const first = offer.scenes[0]!;
    await world.daily.claimForTelegramUser(telegramUserId, {
      key: DAILY_KORCHMA_ROUND_STEP_KEY,
      localDate: `2026-06-27:${first.id}`,
      rewardXp: 0,
      rewardGold: 0,
      resultJson: {
        version: 1,
        dayToken: "20260627",
        sceneId: first.id,
        actionId: first.actions[0]!.id,
        locationId: first.locationId
      }
    });
    world.daily.prefixListCalls = [];

    const scene = await world.service.openScene(telegramUserId, {
      dayToken: offer.dayToken,
      sceneIndex: 0
    });

    expect(scene).toMatchObject({ state: "scene", alreadyCompleted: false });
    expect(world.daily.prefixListCalls).toEqual([
      {
        key: DAILY_KORCHMA_ROUND_STEP_KEY,
        localDatePrefix: "2026-06-28:",
        take: 13
      }
    ]);
    expect(world.daily.broadListCalls).toBe(0);
  });

  it("does not issue a daily offer from overview inspection, scene, action or claim callbacks", async () => {
    const world = new FakeWorld(makeCharacter({ level: 3 }));

    await expect(world.service.getExistingForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "not-issued",
      dayToken: "20260628"
    });
    await expect(
      world.service.openScene(telegramUserId, {
        dayToken: "20260628",
        sceneIndex: 0
      })
    ).resolves.toMatchObject({ state: "not-issued", dayToken: "20260628" });
    await expect(
      world.service.completeStep(telegramUserId, {
        dayToken: "20260628",
        sceneIndex: 0,
        actionId: "repeat-last",
        lifeToken: 0
      })
    ).resolves.toMatchObject({ state: "not-issued", dayToken: "20260628" });
    await expect(
      world.service.claimReward(telegramUserId, {
        dayToken: "20260628",
        lifeToken: 0
      })
    ).resolves.toMatchObject({ state: "not-issued", dayToken: "20260628" });

    expect(world.daily.records.filter((record) => record.key === DAILY_KORCHMA_ROUND_OFFER_KEY)).toHaveLength(0);

    await expect(
      world.service.completeStep(telegramUserId, {
        dayToken: "20260627",
        sceneIndex: 0,
        actionId: "repeat-last",
        lifeToken: 0
      })
    ).resolves.toMatchObject({
      state: "stale-day",
      current: { state: "not-issued", dayToken: "20260628" }
    });
    expect(world.daily.records.filter((record) => record.key === DAILY_KORCHMA_ROUND_OFFER_KEY)).toHaveLength(0);

    const started = await world.service.startForTelegramUser(telegramUserId, { dayToken: "20260628" });

    expect(started.state).toBe("ready");
    expect(world.daily.records.filter((record) => record.key === DAILY_KORCHMA_ROUND_OFFER_KEY)).toHaveLength(1);
  });

  it("keeps an existing same-day offer visible after remort resets the character below level 3", async () => {
    const world = new FakeWorld(makeCharacter({ level: 3 }));
    const offer = await readyOffer(world);
    const first = offer.scenes[0]!;

    world.locationId = first.locationId;
    await expect(
      world.service.completeStep(telegramUserId, {
        dayToken: offer.dayToken,
        sceneIndex: 0,
        actionId: first.actions[0]!.id,
        lifeToken: offer.lifeToken
      })
    ).resolves.toMatchObject({ state: "step-completed" });

    world.character = { ...world.character!, level: 1, remortCount: offer.lifeToken + 1 };

    const afterRemort = await world.service.getForTelegramUser(telegramUserId);
    const existingAfterRemort = await world.service.getExistingForTelegramUser(telegramUserId);

    expect(afterRemort.state).toBe("ready");
    expect(existingAfterRemort.state).toBe("ready");
    if (afterRemort.state === "ready" && existingAfterRemort.state === "ready") {
      expect(afterRemort.offer.lifeToken).toBe(offer.lifeToken + 1);
      expect(afterRemort.offer.scenes.map((scene) => scene.id)).toEqual(offer.scenes.map((scene) => scene.id));
      expect(afterRemort.offer.completedSceneIds).toEqual([first.id]);
      expect(existingAfterRemort.offer.completedSceneIds).toEqual([first.id]);
    }
    expect(world.daily.records.filter((record) => record.key === DAILY_KORCHMA_ROUND_OFFER_KEY)).toHaveLength(1);
  });

  it("requires current scene presence, rejects duplicate and stale callbacks, then locks the third scene", async () => {
    const world = new FakeWorld(makeCharacter({ level: 3 }));
    const offer = await readyOffer(world);
    const first = offer.scenes[0]!;
    const second = offer.scenes[1]!;
    const third = offer.scenes[2]!;

    world.locationId = PRESENCE_LOCATION_KORCHMA_HALL;
    let step = await world.service.completeStep(telegramUserId, {
      dayToken: offer.dayToken,
      sceneIndex: 0,
      actionId: first.actions[0]!.id,
      lifeToken: offer.lifeToken
    });

    expect(step.state).toBe(first.locationId === PRESENCE_LOCATION_KORCHMA_HALL ? "step-completed" : "wrong-location");

    if (step.state === "wrong-location") {
      world.locationId = first.locationId;
      step = await world.service.completeStep(telegramUserId, {
        dayToken: offer.dayToken,
        sceneIndex: 0,
        actionId: first.actions[0]!.id,
        lifeToken: offer.lifeToken
      });
    }

    expect(step.state).toBe("step-completed");

    const duplicate = await world.service.completeStep(telegramUserId, {
      dayToken: offer.dayToken,
      sceneIndex: 0,
      actionId: first.actions[1]!.id,
      lifeToken: offer.lifeToken
    });
    expect(duplicate.state).toBe("step-replayed");
    expect(world.daily.records.filter((record) => record.key === DAILY_KORCHMA_ROUND_STEP_KEY)).toHaveLength(1);

    const staleDay = await world.service.completeStep(telegramUserId, {
      dayToken: "20260627",
      sceneIndex: 0,
      actionId: first.actions[0]!.id,
      lifeToken: offer.lifeToken
    });
    expect(staleDay.state).toBe("stale-day");

    const staleLife = await world.service.completeStep(telegramUserId, {
      dayToken: offer.dayToken,
      sceneIndex: 1,
      actionId: second.actions[0]!.id,
      lifeToken: offer.lifeToken + 1
    });
    expect(staleLife.state).toBe("stale-life");

    world.locationId = second.locationId;
    const secondStep = await world.service.completeStep(telegramUserId, {
      dayToken: offer.dayToken,
      sceneIndex: 1,
      actionId: second.actions[0]!.id,
      lifeToken: offer.lifeToken
    });
    expect(secondStep.state).toBe("step-completed");
    expect(secondStep.state === "step-completed" ? secondStep.completedCount : 0).toBe(DAILY_KORCHMA_ROUND_REQUIRED_STEPS);

    world.locationId = third.locationId;
    const thirdStep = await world.service.completeStep(telegramUserId, {
      dayToken: offer.dayToken,
      sceneIndex: 2,
      actionId: third.actions[0]!.id,
      lifeToken: offer.lifeToken
    });
    expect(thirdStep.state).toBe("third-locked");
  });

  it("claims a persisted level-scaled reward once from the Quest Table and survives restart/remort", async () => {
    const world = new FakeWorld(makeCharacter({ level: 3, xp: 13, gold: 23 }));
    const offer = await readyOffer(world);
    const [first, second] = offer.scenes;

    world.locationId = first!.locationId;
    await world.service.completeStep(telegramUserId, {
      dayToken: offer.dayToken,
      sceneIndex: 0,
      actionId: first!.actions[0]!.id,
      lifeToken: offer.lifeToken
    });
    world.locationId = second!.locationId;
    await world.service.completeStep(telegramUserId, {
      dayToken: offer.dayToken,
      sceneIndex: 1,
      actionId: second!.actions[0]!.id,
      lifeToken: offer.lifeToken
    });

    world.locationId = PRESENCE_LOCATION_KORCHMA_HALL;
    const wrongPlace = await world.service.claimReward(telegramUserId, {
      dayToken: offer.dayToken,
      lifeToken: offer.lifeToken
    });
    expect(wrongPlace.state).toBe("wrong-location");

    world.locationId = PRESENCE_LOCATION_KORCHMA_QUEST_TABLE;
    const claimed = await world.service.claimReward(telegramUserId, {
      dayToken: offer.dayToken,
      lifeToken: offer.lifeToken
    });
    const expectedReward = calculateDailyKorchmaRoundReward({
      characterId: "character-1",
      characterLevel: 3,
      dayKey: offer.dayKey,
      sceneIds: offer.scenes.map((scene) => scene.id),
      completedSceneIds: [first!.id, second!.id]
    });
    expect(claimed.state).toBe("reward-claimed");
    expect(claimed.state === "reward-claimed" ? claimed.reward : null).toEqual(expectedReward);
    expect(world.character?.xp).toBe(13 + expectedReward.xp);
    expect(world.character?.gold).toBe(23 + expectedReward.gold);
    expect(world.daily.records.filter((record) => record.key === DAILY_KORCHMA_ROUND_REWARD_KEY)).toHaveLength(1);

    const restarted = new DailyKorchmaRoundService(world, world.daily, world, world, world, undefined, undefined, () => now);
    const replay = await restarted.claimReward(telegramUserId, {
      dayToken: offer.dayToken,
      lifeToken: offer.lifeToken
    });
    expect(replay.state).toBe("reward-replayed");
    expect(replay.state === "reward-replayed" ? replay.reward : null).toEqual(expectedReward);
    expect(world.character?.xp).toBe(13 + expectedReward.xp);
    expect(world.character?.gold).toBe(23 + expectedReward.gold);

    world.character = { ...world.character!, level: 1, remortCount: 1 };
    const afterRemort = await world.service.getForTelegramUser(telegramUserId);
    expect(afterRemort.state).toBe("completed");

    const oldLife = await world.service.completeStep(telegramUserId, {
      dayToken: offer.dayToken,
      sceneIndex: 0,
      actionId: first!.actions[0]!.id,
      lifeToken: offer.lifeToken
    });
    expect(oldLife.state).toBe("stale-life");
  });

  it("allows fresh current-life turn-in after remort but stales old-life claim buttons", async () => {
    const world = new FakeWorld(makeCharacter({ level: 3, xp: 13, gold: 23 }));
    const offer = await readyOffer(world);
    const [first, second] = offer.scenes;

    world.locationId = first!.locationId;
    await world.service.completeStep(telegramUserId, {
      dayToken: offer.dayToken,
      sceneIndex: 0,
      actionId: first!.actions[0]!.id,
      lifeToken: offer.lifeToken
    });
    world.locationId = second!.locationId;
    await world.service.completeStep(telegramUserId, {
      dayToken: offer.dayToken,
      sceneIndex: 1,
      actionId: second!.actions[0]!.id,
      lifeToken: offer.lifeToken
    });

    world.character = { ...world.character!, level: 1, remortCount: offer.lifeToken + 1 };
    world.locationId = PRESENCE_LOCATION_KORCHMA_QUEST_TABLE;

    const oldLifeClaim = await world.service.claimReward(telegramUserId, {
      dayToken: offer.dayToken,
      lifeToken: offer.lifeToken
    });
    expect(oldLifeClaim.state).toBe("stale-life");

    const afterRemort = await world.service.getForTelegramUser(telegramUserId);
    expect(afterRemort.state).toBe("turn-in-ready");
    if (afterRemort.state !== "turn-in-ready") {
      return;
    }

    const claimed = await world.service.claimReward(telegramUserId, {
      dayToken: afterRemort.offer.dayToken,
      lifeToken: afterRemort.offer.lifeToken
    });
    const expectedReward = calculateDailyKorchmaRoundReward({
      characterId: "character-1",
      characterLevel: 1,
      dayKey: offer.dayKey,
      sceneIds: offer.scenes.map((scene) => scene.id),
      completedSceneIds: [first!.id, second!.id]
    });

    expect(claimed.state).toBe("reward-claimed");
    expect(claimed.state === "reward-claimed" ? claimed.reward : null).toEqual(expectedReward);
    expect(world.character?.xp).toBe(13 + expectedReward.xp);
    expect(world.character?.gold).toBe(23 + expectedReward.gold);
    expect(world.daily.records.filter((record) => record.key === DAILY_KORCHMA_ROUND_REWARD_KEY)).toHaveLength(1);

    const replay = await world.service.claimReward(telegramUserId, {
      dayToken: afterRemort.offer.dayToken,
      lifeToken: afterRemort.offer.lifeToken
    });
    expect(replay.state).toBe("reward-replayed");
    expect(world.daily.records.filter((record) => record.key === DAILY_KORCHMA_ROUND_REWARD_KEY)).toHaveLength(1);
    expect((await world.service.getForTelegramUser(telegramUserId)).state).toBe("completed");
  });

  it("shows fresh and replayed quest Iskrokamin grants without duplicate reward rows", async () => {
    const world = new FakeWorld(makeCharacter({ level: 4, xp: 13, gold: 23 }));
    const offer = await readyOffer(world);
    const [first, second] = offer.scenes;

    world.locationId = first!.locationId;
    await world.service.completeStep(telegramUserId, {
      dayToken: offer.dayToken,
      sceneIndex: 0,
      actionId: first!.actions[0]!.id,
      lifeToken: offer.lifeToken
    });
    world.locationId = second!.locationId;
    await world.service.completeStep(telegramUserId, {
      dayToken: offer.dayToken,
      sceneIndex: 1,
      actionId: second!.actions[0]!.id,
      lifeToken: offer.lifeToken
    });

    world.locationId = PRESENCE_LOCATION_KORCHMA_QUEST_TABLE;
    const claimed = await world.service.claimReward(telegramUserId, {
      dayToken: offer.dayToken,
      lifeToken: offer.lifeToken
    });

    expect(claimed.state).toBe("reward-claimed");
    expect(claimed.state === "reward-claimed" ? claimed.reward.itemGrants : []).toEqual([
      expect.objectContaining({
        itemId: ISKROKAMIN_ITEM_ID,
        quantity: 1
      })
    ]);
    expect(world.daily.records.filter((record) => record.key === DAILY_KORCHMA_ROUND_REWARD_KEY)).toHaveLength(1);

    const replay = await world.service.claimReward(telegramUserId, {
      dayToken: offer.dayToken,
      lifeToken: offer.lifeToken
    });

    expect(replay.state).toBe("reward-replayed");
    expect(replay.state === "reward-replayed" ? replay.reward.itemGrants : []).toEqual([
      expect.objectContaining({
        itemId: ISKROKAMIN_ITEM_ID,
        quantity: 1
      })
    ]);
    expect(world.daily.records.filter((record) => record.key === DAILY_KORCHMA_ROUND_REWARD_KEY)).toHaveLength(1);
  });

  it("keeps daily reward spread bounded and deterministic by level", () => {
    const base = {
      characterId: "character-1",
      dayKey: "2026-06-28",
      sceneIds: ["yard-rope-philosophy", "cellar-inventory-bottle", "ranger-map-sneeze"],
      completedSceneIds: ["yard-rope-philosophy", "ranger-map-sneeze"]
    };

    const level3 = calculateDailyKorchmaRoundReward({ ...base, characterLevel: 3 });
    const level13 = calculateDailyKorchmaRoundReward({ ...base, characterLevel: 13 });

    expect(calculateDailyKorchmaRoundReward({ ...base, characterLevel: 3 })).toEqual(level3);
    expect(level3.xp).toBeGreaterThanOrEqual(7);
    expect(level3.xp).toBeLessThanOrEqual(9);
    expect(level3.gold).toBeGreaterThanOrEqual(4);
    expect(level3.gold).toBeLessThanOrEqual(6);
    expect(level13.xp).toBeGreaterThanOrEqual(27);
    expect(level13.xp).toBeLessThanOrEqual(39);
    expect(level13.gold).toBeGreaterThanOrEqual(14);
    expect(level13.gold).toBeLessThanOrEqual(26);
  });

  it("does not create a third step row when another callback completes a second scene inside the claim boundary", async () => {
    const world = new FakeWorld(makeCharacter({ level: 3 }));
    const offer = await readyOffer(world);
    const [first, second, third] = offer.scenes;

    world.locationId = first!.locationId;
    await expect(
      world.service.completeStep(telegramUserId, {
        dayToken: offer.dayToken,
        sceneIndex: 0,
        actionId: first!.actions[0]!.id,
        lifeToken: offer.lifeToken
      })
    ).resolves.toMatchObject({ state: "step-completed" });

    world.daily.beforeCreate = (input) => {
      if (input.key !== DAILY_KORCHMA_ROUND_STEP_KEY || !input.localDate.endsWith(`:${second!.id}`)) {
        return;
      }

      world.daily.addStepRecord(offer.dayKey, third!, third!.actions[0]!.id);
    };

    world.locationId = second!.locationId;
    const raced = await world.service.completeStep(telegramUserId, {
      dayToken: offer.dayToken,
      sceneIndex: 1,
      actionId: second!.actions[0]!.id,
      lifeToken: offer.lifeToken
    });

    expect(raced.state).toBe("third-locked");
    expect(world.daily.records.filter((record) => record.key === DAILY_KORCHMA_ROUND_STEP_KEY)).toHaveLength(2);
    expect(
      world.daily.records
        .filter((record) => record.key === DAILY_KORCHMA_ROUND_STEP_KEY)
        .map((record) => record.localDate)
    ).toEqual(expect.arrayContaining([`${offer.dayKey}:${first!.id}`, `${offer.dayKey}:${third!.id}`]));
  });

  it("resets today's daily Korchma round rows for local QA", async () => {
    const world = new FakeWorld(makeCharacter({ level: 3 }));
    const offer = await readyOffer(world);
    const [first, second] = offer.scenes;

    world.locationId = first!.locationId;
    await world.service.completeStep(telegramUserId, {
      dayToken: offer.dayToken,
      sceneIndex: 0,
      actionId: first!.actions[0]!.id,
      lifeToken: offer.lifeToken
    });
    world.locationId = second!.locationId;
    await world.service.completeStep(telegramUserId, {
      dayToken: offer.dayToken,
      sceneIndex: 1,
      actionId: second!.actions[0]!.id,
      lifeToken: offer.lifeToken
    });
    world.locationId = PRESENCE_LOCATION_KORCHMA_QUEST_TABLE;
    await world.service.claimReward(telegramUserId, {
      dayToken: offer.dayToken,
      lifeToken: offer.lifeToken
    });

    expect(world.daily.records.filter((record) => record.key === DAILY_KORCHMA_ROUND_OFFER_KEY)).toHaveLength(1);
    expect(world.daily.records.filter((record) => record.key === DAILY_KORCHMA_ROUND_STEP_KEY)).toHaveLength(2);
    expect(world.daily.records.filter((record) => record.key === DAILY_KORCHMA_ROUND_REWARD_KEY)).toHaveLength(1);

    await expect(world.service.resetTodayForDev(telegramUserId)).resolves.toBe("reset");
    expect(world.daily.records.filter((record) => record.key === DAILY_KORCHMA_ROUND_OFFER_KEY)).toHaveLength(0);
    expect(world.daily.records.filter((record) => record.key === DAILY_KORCHMA_ROUND_STEP_KEY)).toHaveLength(0);
    expect(world.daily.records.filter((record) => record.key === DAILY_KORCHMA_ROUND_REWARD_KEY)).toHaveLength(0);
    expect(world.daily.records.filter((record) => record.key === DAILY_KORCHMA_ROUND_REROLL_KEY).length).toBeGreaterThan(0);

    const reopened = await world.service.getForTelegramUser(telegramUserId);
    expect(reopened.state).toBe("ready");
    if (reopened.state === "ready") {
      expect(reopened.offer.scenes.map((scene) => scene.id)).not.toEqual(offer.scenes.map((scene) => scene.id));
      expect(reopened.offer.completedSceneIds).toEqual([]);
    }
  });

  it("blocks mutation during active combat or pending Barrel", async () => {
    const fightWorld = new FakeWorld(makeCharacter({ level: 3 }));
    fightWorld.fightState = "persistent-active";
    expect((await fightWorld.service.getForTelegramUser(telegramUserId)).state).toBe("active-fight");

    const barrelWorld = new FakeWorld(makeCharacter({ level: 3 }));
    barrelWorld.pendingBarrel = true;
    expect((await barrelWorld.service.getForTelegramUser(telegramUserId)).state).toBe("pending-barrel");
  });
});

async function readyOffer(world: FakeWorld) {
  const result = await world.service.getForTelegramUser(telegramUserId);
  expect(result.state).toBe("ready");

  if (result.state !== "ready") {
    throw new Error("Expected daily Korchma round offer.");
  }

  return result.offer;
}

async function markerLookup(
  world: FakeWorld,
  state: "ready" | "persistent-active" | "training-active" = "ready"
) {
  return world.service.getQuestMarkerForTelegramUser(
    telegramUserId,
    Promise.resolve({ state, character: world.character! } as never)
  );
}

async function recordMarkerStep(
  world: FakeWorld,
  offer: Awaited<ReturnType<typeof readyOffer>>,
  sceneIndex: number
) {
  const scene = offer.scenes[sceneIndex]!;
  await world.daily.claimForTelegramUser(telegramUserId, {
    key: DAILY_KORCHMA_ROUND_STEP_KEY,
    localDate: `${offer.dayKey}:${scene.id}`,
    rewardXp: 0,
    rewardGold: 0,
    resultJson: {
      version: 1,
      dayToken: offer.dayToken,
      sceneId: scene.id,
      actionId: scene.actions[0]!.id,
      locationId: scene.locationId
    }
  });
}

function expectMarkerCalls(
  world: FakeWorld,
  expected: { character: number; offer: number; barrel: number; steps: number; reward: number; fight: number }
) {
  expect(world.characterReads).toBe(expected.character);
  expect(world.daily.findCalls.filter((call) => call.key === DAILY_KORCHMA_ROUND_OFFER_KEY)).toHaveLength(expected.offer);
  expect(world.barrelReads).toBe(expected.barrel);
  expect(world.daily.prefixListCalls).toHaveLength(expected.steps);
  expect(world.daily.findCalls.filter((call) => call.key === DAILY_KORCHMA_ROUND_REWARD_KEY)).toHaveLength(expected.reward);
  expect(world.fightReads).toBe(expected.fight);
  expect(world.daily.broadListCalls).toBe(0);
}

class FakeWorld implements CharacterRepository, DailyActionRepository {
  readonly daily = new FakeDailyActionRepository(this);
  readonly service: DailyKorchmaRoundService;
  locationId = PRESENCE_LOCATION_KORCHMA_QUEST_TABLE;
  fightState: "ready" | "persistent-active" | "training-active" = "ready";
  pendingBarrel = false;
  characterReads = 0;
  fightReads = 0;
  barrelReads = 0;
  characterLookup: (() => Promise<CharacterRecord | null>) | null = null;

  constructor(
    public character: CharacterRecord | null,
    clock: () => Date = () => now
  ) {
    this.service = new DailyKorchmaRoundService(
      this,
      this.daily,
      this,
      this,
      this,
      undefined,
      undefined,
      clock
    );
  }

  findByUserId(): Promise<CharacterRecord | null> {
    return Promise.resolve(this.character);
  }

  findByTelegramUserId(id: bigint): Promise<CharacterRecord | null> {
    this.characterReads += 1;
    if (id !== telegramUserId) {
      return Promise.resolve(null);
    }
    return this.characterLookup?.() ?? Promise.resolve(this.character);
  }

  deleteByTelegramUserId(): Promise<boolean> {
    this.character = null;
    return Promise.resolve(true);
  }

  createForTelegramUserIfMissing(): never {
    throw new Error("Not implemented");
  }

  getCurrentPlaceForTelegramUser(id: bigint) {
    if (id !== telegramUserId || !this.character) {
      return Promise.resolve({ state: "no-character" as const });
    }

    return Promise.resolve({
      state: "ready" as const,
      locationId: this.locationId,
      locationName: getLocationName(this.locationId),
      insideKorchma: true
    });
  }

  getFightOverviewForTelegramUser() {
    this.fightReads += 1;
    return Promise.resolve({
      state: this.fightState,
      character: this.character!
    } as never);
  }

  getActivePendingFridayBarrelRaidForTelegramUser() {
    this.barrelReads += 1;
    return Promise.resolve(
      this.pendingBarrel
        ? {
            state: "pending" as const,
            character: this.character!,
            availableAt: new Date("2026-06-28T09:05:00.000Z"),
            now,
            periodId: "2026-06-28T09"
          }
        : { state: "none" as const }
    );
  }

  resetMarkerCalls(): void {
    this.characterReads = 0;
    this.fightReads = 0;
    this.barrelReads = 0;
    this.daily.findCalls = [];
    this.daily.prefixListCalls = [];
    this.daily.broadListCalls = 0;
  }
}

class FakeDailyActionRepository implements DailyActionRepository {
  private readonly actions = new Map<string, DailyActionRecord>();
  beforeCreate: ((input: ClaimDailyActionInput) => void) | null = null;
  broadListCalls = 0;
  findCalls: Array<{ key: string; localDate: string }> = [];
  prefixListCalls: Array<{ key: string; localDatePrefix: string; take: number }> = [];

  constructor(private readonly world: FakeWorld) {}

  get records(): DailyActionRecord[] {
    return [...this.actions.values()];
  }

  findForTelegramUser(
    id: bigint,
    input: { key: string; localDate: string }
  ): Promise<DailyActionRecord | null> {
    this.findCalls.push(input);
    if (id !== telegramUserId || !this.world.character) {
      return Promise.resolve(null);
    }

    return Promise.resolve(this.actions.get(keyFor(input)) ?? null);
  }

  listForTelegramUser(id: bigint, input: { key: string }): Promise<DailyActionRecord[] | null> {
    this.broadListCalls += 1;
    if (id !== telegramUserId || !this.world.character) {
      return Promise.resolve(null);
    }

    return Promise.resolve(this.records.filter((record) => record.key === input.key));
  }

  listForTelegramUserByLocalDatePrefix(
    id: bigint,
    input: { key: string; localDatePrefix: string; take: number }
  ): Promise<DailyActionRecord[] | null> {
    this.prefixListCalls.push(input);
    if (id !== telegramUserId || !this.world.character) {
      return Promise.resolve(null);
    }

    return Promise.resolve(
      this.records
        .filter((record) => record.key === input.key && record.localDate.startsWith(input.localDatePrefix))
        .slice(0, input.take)
    );
  }

  countForTelegramUser(
    id: bigint,
    input: { key: string; localDatePrefix: string }
  ): Promise<number | null> {
    if (id !== telegramUserId || !this.world.character) {
      return Promise.resolve(null);
    }

    return Promise.resolve(
      this.records.filter(
        (record) => record.key === input.key && record.localDate.startsWith(input.localDatePrefix)
      ).length
    );
  }

  addStepRecord(dayKey: string, scene: { id: string; locationId: string }, actionId: string): void {
    if (!this.world.character) {
      return;
    }

    const localDate = `${dayKey}:${scene.id}`;
    const action: DailyActionRecord = {
      id: `daily-action-${this.actions.size + 1}`,
      characterId: this.world.character.id,
      key: DAILY_KORCHMA_ROUND_STEP_KEY,
      localDate,
      rewardXp: 0,
      rewardGold: 0,
      spentGold: 0,
      resultJson: {
        version: 1,
        dayToken: dayKey.split("-").join(""),
        sceneId: scene.id,
        actionId,
        locationId: scene.locationId
      },
      createdAt: now
    };

    this.actions.set(keyFor(action), action);
  }

  claimForTelegramUser(
    id: bigint,
    input: ClaimDailyActionInput
  ): Promise<ClaimDailyActionResult | null> {
    if (id !== telegramUserId || !this.world.character) {
      return Promise.resolve(null);
    }

    if (
      input.expectedLife &&
      (this.world.character.remortCount ?? 0) !== input.expectedLife.remortCount
    ) {
      return Promise.resolve(null);
    }

    const key = keyFor(input);
    const existing = this.actions.get(key);

    if (existing) {
      return Promise.resolve({
        state: "existing",
        action: existing,
        character: this.world.character,
        levelChange: null,
        itemGrants: []
      });
    }

    this.beforeCreate?.(input);
    this.beforeCreate = null;

    const prefixLimit = input.localDatePrefixLimit;

    if (prefixLimit) {
      const currentRows = this.records.filter(
        (record) =>
          record.key === prefixLimit.key &&
          record.localDate.startsWith(prefixLimit.localDatePrefix)
      ).length;

      if (currentRows >= prefixLimit.maxRows) {
        return Promise.reject(
          new DailyActionPrefixLimitExceededError(currentRows, prefixLimit.maxRows)
        );
      }
    }

    const oldLevel = this.world.character.level;
    this.world.character = {
      ...this.world.character,
      xp: this.world.character.xp + input.rewardXp,
      gold: this.world.character.gold + input.rewardGold
    };
    const appliedItemGrants =
      input.questIskrokaminBonus === true && this.world.character.level >= 4
        ? [{ itemId: ISKROKAMIN_ITEM_ID, quantity: 1 }]
        : [];
    const action: DailyActionRecord = {
      id: `daily-action-${this.actions.size + 1}`,
      characterId: this.world.character.id,
      key: input.key,
      localDate: input.localDate,
      rewardXp: input.rewardXp,
      rewardGold: input.rewardGold,
      spentGold: input.spentGold ?? 0,
      resultJson: withAppliedItemGrants(input.resultJson ?? null, appliedItemGrants),
      createdAt: now
    };
    this.actions.set(key, action);

    return Promise.resolve({
      state: "created",
      action,
      character: this.world.character,
      levelChange: {
        oldLevel,
        newLevel: this.world.character.level,
        leveledUp: this.world.character.level > oldLevel
      },
      itemGrants: appliedItemGrants,
      hpLoss: null
    });
  }

  deleteForTelegramUser(
    id: bigint,
    input: { key: string; localDate: string }
  ): Promise<"deleted" | "missing" | "no-character"> {
    if (id !== telegramUserId || !this.world.character) {
      return Promise.resolve("no-character");
    }

    return Promise.resolve(this.actions.delete(keyFor(input)) ? "deleted" : "missing");
  }
}

function withAppliedItemGrants(
  resultJson: DailyActionRecord["resultJson"],
  appliedItemGrants: Array<{ itemId: string; quantity: number }>
): DailyActionRecord["resultJson"] {
  if (appliedItemGrants.length === 0) {
    return resultJson;
  }

  const base = resultJson && typeof resultJson === "object" && !Array.isArray(resultJson)
    ? resultJson
    : {};
  const reward = (base as { reward?: unknown }).reward;
  const rewardObject = reward && typeof reward === "object" && !Array.isArray(reward)
    ? reward
    : {};

  return {
    ...base,
    reward: {
      ...rewardObject,
      appliedItemGrants
    }
  };
}

function keyFor(input: { key: string; localDate: string }): string {
  return `${input.key}:${input.localDate}`;
}

function makeCharacter(overrides: Partial<CharacterRecord> = {}): CharacterRecord {
  return {
    id: "character-1",
    userId: "user-1",
    name: "Тестун",
    pronoun: "they",
    path: "sun",
    raceId: "race.domovyk",
    classId: "class.ranger",
    level: 3,
    xp: 0,
    gold: 0,
    hpCurrent: 10,
    hpMax: 10,
    manaCurrent: 3,
    manaMax: 3,
    statsJson: {
      strength: 1,
      dexterity: 1,
      intelligence: 1,
      charisma: 1,
      luck: 1
    },
    remortCount: 0,
    ...overrides
  };
}
