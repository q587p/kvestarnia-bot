import { describe, expect, it } from "vitest";
import { classes } from "../../src/content/classes";
import { getKnownComboTitleValues } from "../../src/content/characterOptions";
import { activeRaces } from "../../src/content/races";
import type {
  CharacterRecord,
  CharacterRepository,
  CreateCharacterInput,
  CreateCharacterResult
} from "../../src/db/repositories/characterRepository";
import type {
  ClaimDailyActionInput,
  ClaimDailyActionResult,
  DailyActionClaimIdentity,
  DailyActionRollbackInput,
  DailyActionRecord,
  DailyActionRepository
} from "../../src/db/repositories/dailyActionRepository";
import type {
  CharacterEquipmentRecord,
  CharacterEquipmentSnapshot,
  EquipmentRepository
} from "../../src/db/repositories/equipmentRepository";
import type { SoloCombatSessionRecord } from "../../src/db/repositories/soloCombatSessionRepository";
import type { TelegramUserProfile } from "../../src/db/repositories/userRepository";
import { getLevelForXp } from "../../src/domain/progression/level";
import { buildStarterLevelTwoXpReward } from "../../src/domain/progression/starterRewards";
import {
  ADVENTURE_CHOICE_KEY,
  ADVENTURE_CHOICE_REROLL_KEY,
  ADVENTURE_PROBLEM_IDS,
  AdventureService,
  MIMIC_SHAWARMA_ADVENTURE_KEY,
  buildAdventureOffer,
  buildAdventureMethodOptions,
  buildAdventurePeriod,
  buildStarterMethodOptions,
  getAdventureProblemPoolForProfile,
  getAdventureProblemIcon,
  type AdventureResult
} from "../../src/services/adventureService";
import { buildAdventureResolutionScene } from "../../src/content/adventureResolutionContent";
import { buildStarterQuestResolutionScene } from "../../src/content/starterQuestResolutionContent";

const telegramUserId = 42n;

describe("AdventureService", () => {
  it("returns no-character when user has no character", async () => {
    const { service } = setup();

    await expect(service.getAdventureOfferForTelegramUser(telegramUserId)).resolves.toEqual({
      state: "no-character"
    });
    await expect(
      service.completeAdventureApproach(telegramUserId, {
        periodToken: "20260612",
        problemId: "stew",
        methodId: "lower-fire"
      })
    ).resolves.toEqual({
      state: "no-character"
    });
  });

  it("generates three distinct deterministic choices for a 93-minute period", () => {
    const period = buildAdventurePeriod(fixedClock());
    const first = buildAdventureOffer("character-42", period);
    const second = buildAdventureOffer("character-42", period);
    const samePeriod = buildAdventureOffer(
      "character-42",
      buildAdventurePeriod(new Date(period.expiresAt.getTime() - 1_000))
    );
    const nextPeriod = buildAdventureOffer(
      "character-42",
      buildAdventurePeriod(new Date(period.expiresAt.getTime() + 1_000))
    );

    expect(first).toEqual(second);
    expect(first).toEqual(samePeriod);
    expect(first.periodToken).toBe(period.token);
    expect(first.choices).toHaveLength(3);
    expect(new Set(first.choices.map((choice) => choice.id)).size).toBe(3);
    expect(ADVENTURE_PROBLEM_IDS.length).toBeGreaterThanOrEqual(
      24 + activeRaces.length * 3 + classes.length * 3 + getKnownComboTitleValues().length
    );
    expect(new Set(ADVENTURE_PROBLEM_IDS).size).toBe(ADVENTURE_PROBLEM_IDS.length);
    expect(nextPeriod.choices.map((choice) => choice.id)).not.toEqual(
      first.choices.map((choice) => choice.id)
    );
    expect(
      (first.expiresAt.getTime() - buildAdventurePeriod(fixedClock()).expiresAt.getTime()) / 60_000
    ).toBe(0);
    expect(first.choices.every((choice) => getAdventureProblemIcon(choice.id).length > 0)).toBe(true);
    expect(ADVENTURE_PROBLEM_IDS.every((problemId) => getAdventureProblemIcon(problemId).length > 0)).toBe(true);
  });

  it("adds race, class, and title-specific problems to matching offers", async () => {
    const { service, characters } = setup();
    characters.add(telegramUserId, {
      xp: 25,
      raceId: "race.human-ish",
      classId: "class.warrior",
      pronoun: "he"
    });
    const offer = await readyOffer(service);

    expect(
      offer.choices.some(
        (choice) =>
          choice.id.startsWith("race-human-ish-") ||
          choice.id.startsWith("class-warrior-") ||
          choice.id.startsWith("title-")
      )
    ).toBe(true);
  });

  it("keeps personalized adventure coverage for every active race, class, and title", () => {
    for (const race of activeRaces) {
      const pool = getAdventureProblemPoolForProfile({ raceId: race.id });

      expect(pool.filter((problem) => problem.audience?.raceId === race.id)).toHaveLength(3);
    }

    for (const characterClass of classes) {
      const pool = getAdventureProblemPoolForProfile({ classId: characterClass.id });

      expect(pool.filter((problem) => problem.audience?.classId === characterClass.id)).toHaveLength(3);
    }

    for (const title of getKnownComboTitleValues()) {
      const pool = getAdventureProblemPoolForProfile({ title });

      expect(pool.filter((problem) => problem.audience?.title === title)).toHaveLength(1);
    }
  });

  it("declines race and class names in personalized adventure copy", () => {
    const rogueExam = getAdventureProblemPoolForProfile({ classId: "class.rogue" }).find(
      (problem) => problem.id === "class-rogue-exam"
    );
    const dwarfMug = getAdventureProblemPoolForProfile({ raceId: "race.dwarf" }).find(
      (problem) => problem.id === "race-dwarf-mug"
    );

    expect(rogueExam).toMatchObject({
      title: "Іспит для «Злодія» здає викладача",
      hook:
        "Тест для «Злодія» так довго чекав героя, що сам почав ставити питання викладачеві й вимагати перездачу."
    });
    expect(dwarfMug?.title).toBe("Кухоль для «Гнома» не проходить інструктаж");
  });

  it("selects a problem and exposes authored, character-aware methods", async () => {
    const { service, characters } = setup();
    characters.add(telegramUserId, { xp: 25, classId: "class.bureaucramancer" });
    const offer = await readyOffer(service);
    const result = await service.selectAdventureProblem(telegramUserId, {
      periodToken: offer.periodToken,
      problemId: offer.choices[0].id
    });

    expect(result.state).toBe("selected");
    if (result.state === "selected") {
      expect(result.approaches.length).toBeGreaterThanOrEqual(3);
      expect(new Set(result.approaches.map((approach) => approach.id)).size).toBe(
        result.approaches.length
      );
      expect(result.approaches.some((approach) => approach.source === "scene")).toBe(true);
      expect(result.approaches.some((approach) => approach.source === "class")).toBe(true);
      expect(result.approaches.every((approach) => !/%|\d{2,}/u.test(approach.chanceHint))).toBe(true);
    }
  });

  it("claims one non-fight reward through the daily action path", async () => {
    const found = await findResolvedAdventure((result) => !result.fightHandoff);

    expect(found.result.state).toBe("completed");
    if (found.result.state === "completed") {
      expect(found.result.reward.localDate).toBe(buildAdventurePeriod(fixedClock()).storageKey);
      expect(found.result.reward.xp).toBeGreaterThan(0);
      expect(found.result.reward.xp).toBeLessThanOrEqual(found.result.approach.reward.xp + 2);
      expect(found.result.reward.gold).toBeGreaterThanOrEqual(0);
      expect(found.result.reward.gold).toBeLessThanOrEqual(found.result.approach.reward.gold + 2);
      expect(found.result.fightHandoff).toBe(false);
    }
    expect(found.dailyActions.createCount).toBe(1);
    expect(found.dailyActions.records[0]).toMatchObject({
      key: ADVENTURE_CHOICE_KEY,
      localDate: buildAdventurePeriod(fixedClock()).storageKey,
      rewardXp: found.result.state === "completed" ? found.result.reward.xp : -1,
      rewardGold: found.result.state === "completed" ? found.result.reward.gold : -1
    });
    expect(found.dailyActions.records[0]?.resultJson).toMatchObject({
      version: 1,
      sceneId: found.input.problemId,
      methodId: found.result.state === "completed" ? found.result.approach.id : ""
    });
  });

  it("stores deterministic post-resolution reward variance", async () => {
    const found = await findResolvedAdventure(
      (result) =>
        !result.fightHandoff &&
        result.consequence === "full-reward" &&
        (result.reward.xp !== result.approach.reward.xp ||
          result.reward.gold !== result.approach.reward.gold)
    );
    const repeatedSetup = setup();
    repeatedSetup.characters.add(found.userId, { xp: 25, gold: 10 });
    const repeated = await repeatedSetup.service.completeAdventureApproach(found.userId, found.input);

    expect(repeated.state).toBe("completed");
    if (repeated.state === "completed" && found.result.state === "completed") {
      expect(repeated.reward).toEqual(found.result.reward);
    }
  });

  it("does not return gold from paid authored methods", async () => {
    const found = await findResolvedAdventure(
      (result) => !result.fightHandoff && result.spentGold > 0 && result.reward.xp > 0
    );

    expect(found.result.state).toBe("completed");
    if (found.result.state === "completed") {
      expect(found.result.spentGold).toBeGreaterThan(0);
      expect(found.result.approach.reward.gold).toBe(0);
      expect(found.result.reward.gold).toBe(0);
      expect(found.dailyActions.records[0]).toMatchObject({
        spentGold: found.result.spentGold,
        rewardGold: 0
      });
    }
  });

  it("can grant a low-chance authored quest mantok through the daily claim", async () => {
    const found = await findResolvedAdventure(
      (result) => !result.fightHandoff && result.reward.itemGrants.length > 0
    );

    expect(found.result.state).toBe("completed");
    if (found.result.state === "completed") {
      expect(found.result.reward.itemGrants).toHaveLength(1);
      expect(found.result.reward.itemGrants[0]?.itemId).toMatch(/^item\.loot-v1-/);
      expect(found.dailyActions.records[0]?.resultJson).toMatchObject({
        reward: {
          itemGrants: [
            {
              itemId: found.result.reward.itemGrants[0]?.itemId,
              quantity: 1
            }
          ]
        }
      });
    }
  });

  it("can grant a mantok from a paid authored quest without adding gold reward", async () => {
    const found = await findResolvedAdventure(
      (result) =>
        !result.fightHandoff &&
        result.spentGold > 0 &&
        result.reward.gold === 0 &&
        result.reward.itemGrants.length > 0
    );

    expect(found.result.state).toBe("completed");
    if (found.result.state === "completed") {
      expect(found.result.reward.itemGrants).toHaveLength(1);
      expect(found.result.reward.gold).toBe(0);
      expect(found.dailyActions.records[0]).toMatchObject({
        rewardGold: 0
      });
    }
  });

  it("uses equipped item effects in the actual quest check snapshot", async () => {
    const equipment = new FakeEquipmentRepository({
      characterId: `character-${telegramUserId.toString()}`,
      equipment: [buildEquipment({ itemId: "item.cork-ring-of-serious-business", slot: "accessory" })]
    });
    const { service, characters } = setup(null, equipment);
    characters.add(telegramUserId, { xp: 25, gold: 10 });
    const offer = await readyOffer(service);
    const selected = await service.selectAdventureProblem(telegramUserId, {
      periodToken: offer.periodToken,
      problemId: offer.choices[0].id
    });

    expect(selected.state).toBe("selected");
    if (selected.state !== "selected") {
      return;
    }

    const result = await service.completeAdventureApproach(telegramUserId, {
      periodToken: offer.periodToken,
      problemId: selected.choice.id,
      methodId: selected.approaches[0]?.callbackKey ?? selected.approaches[0]?.id ?? ""
    });

    expect(result.state).toBe("completed");
    if (result.state === "completed") {
      expect(result.check.effectiveStatsSnapshot.luck).toBe(8);
    }
  });

  it("records a fight handoff complication as the daily claim without granting reward", async () => {
    const found = await findResolvedAdventure((result) => result.fightHandoff);

    expect(found.result.state).toBe("completed");
    if (found.result.state === "completed") {
      expect(found.result.complication).toBe(true);
      expect(found.result.fightHandoff).toBe(true);
      expect(found.result.reward).toMatchObject({
        xp: 0,
        gold: 0
      });
    }
    expect(found.dailyActions.createCount).toBe(1);
    expect(found.dailyActions.records[0]).toMatchObject({
      key: ADVENTURE_CHOICE_KEY,
      rewardXp: 0,
      rewardGold: 0
    });
  });

  it("rolls back a failed fight handoff through the stored claim identity", async () => {
    const found = await findResolvedAdventure((result) => result.fightHandoff);

    expect(found.result.state).toBe("completed");
    if (found.result.state !== "completed") {
      throw new Error("Expected completed adventure.");
    }

    await expect(
      found.service.rollbackCurrentAdventureClaimForTelegramUser(found.userId, found.result.claim)
    ).resolves.toBe("deleted");
    expect(found.dailyActions.lastRollbackInput).toMatchObject(found.result.claim);
    expect(found.dailyActions.lastRollbackInput?.currentEffectiveHpMax).toEqual(expect.any(Number));
    expect(found.dailyActions.lastDeleteInput).toBeNull();
    expect(found.dailyActions.records).toHaveLength(0);
  });

  it("passes the current effective HP max into rollback instead of claim-time state", async () => {
    const equipment = new FakeEquipmentRepository({
      characterId: `character-${telegramUserId.toString()}`,
      equipment: [buildEquipment({ itemId: "item.apron-of-foam-resistance", slot: "armor" })]
    });
    const { service, characters, dailyActions } = setup(null, equipment);
    characters.add(telegramUserId, { xp: 25, gold: 10, hpMax: 25 });
    const offer = await readyOffer(service);
    const selected = await service.selectAdventureProblem(telegramUserId, {
      periodToken: offer.periodToken,
      problemId: offer.choices[0]!.id
    });

    expect(selected.state).toBe("selected");
    if (selected.state !== "selected") {
      throw new Error(`Expected selected problem, got ${selected.state}.`);
    }

    const result = await service.completeAdventureApproach(telegramUserId, {
      periodToken: offer.periodToken,
      problemId: selected.choice.id,
      methodId: selected.approaches[0]!.callbackKey ?? selected.approaches[0]!.id
    });

    expect(result.state).toBe("completed");
    if (result.state !== "completed") {
      throw new Error(`Expected completed adventure, got ${result.state}.`);
    }

    await expect(service.rollbackCurrentAdventureClaimForTelegramUser(telegramUserId, result.claim)).resolves.toBe("deleted");
    expect(dailyActions.lastRollbackInput).toMatchObject({
      key: result.claim.key,
      localDate: result.claim.localDate,
      currentEffectiveHpMax: result.character.hpMax
    });
    expect(dailyActions.lastRollbackInput).not.toHaveProperty("effectiveHpMax");
  });

  it("rolls back the original adventure claim identity across a 93-minute boundary", async () => {
    let now = fixedClock();
    const oldPeriod = buildAdventurePeriod(now);
    const userId = 2_588n;
    const characters = new FakeCharacterRepository();
    const dailyActions = new FakeDailyActionRepository(characters);
    const service = new AdventureService(
      characters,
      dailyActions,
      () => now,
      { findActiveByTelegramUserId: () => Promise.resolve(null) }
    );
    characters.add(userId, { xp: 25, gold: 10 });
    const lookup = await service.getAdventureOfferForTelegramUser(userId);

    if (lookup.state !== "ready") {
      throw new Error(`Expected ready offer, got ${lookup.state}.`);
    }

    const selected = await service.selectAdventureProblem(userId, {
      periodToken: lookup.offer.periodToken,
      problemId: lookup.offer.choices[0]!.id
    });

    if (selected.state !== "selected") {
      throw new Error(`Expected selected problem, got ${selected.state}.`);
    }

    const result = await service.completeAdventureApproach(userId, {
      periodToken: lookup.offer.periodToken,
      problemId: selected.choice.id,
      methodId: selected.approaches[0]!.callbackKey ?? selected.approaches[0]!.id
    });

    expect(result.state).toBe("completed");
    if (result.state !== "completed") {
      throw new Error(`Expected completed adventure, got ${result.state}.`);
    }

    now = new Date(oldPeriod.expiresAt.getTime() + 1);

    await expect(service.rollbackCurrentAdventureClaimForTelegramUser(userId, result.claim)).resolves.toBe("deleted");
    expect(dailyActions.lastRollbackInput).toMatchObject({
      key: ADVENTURE_CHOICE_KEY,
      localDate: oldPeriod.storageKey
    });
    expect(dailyActions.lastDeleteInput).toBeNull();
    expect(dailyActions.records).toHaveLength(0);
  });

  it.each([
    {
      name: "level-3 barrel",
      problemId: "barrel",
      character: { xp: 25, level: 3 }
    },
    {
      name: "level-3 bell",
      problemId: "bell",
      character: { xp: 25, level: 3 }
    },
    {
      name: "generated portrait",
      problemId: "race-human-ish-portrait",
      character: { xp: 25, level: 3, raceId: "race.human-ish" }
    },
    {
      name: "higher-level handoff",
      problemId: "barrel",
      character: { xp: 250, level: 8 }
    }
  ])("stores the actual eligible fight handoff target for $name", async ({ problemId, character }) => {
    const found = await findResolvedAdventureForProblem(problemId, character, (result) => result.fightHandoff);

    expect(found.result.state).toBe("completed");
    if (found.result.state !== "completed") {
      return;
    }

    const monsterId = found.result.fightEncounter?.monsterId;
    const audit = found.dailyActions.records[0]?.resultJson as
      | { fightHandoff?: { monsterId?: string } }
      | null
      | undefined;
    const monster = monsters.find((candidate) => candidate.id === monsterId);

    expect(monsterId).toBeDefined();
    expect(audit?.fightHandoff?.monsterId).toBe(monsterId);
    expect(monster?.level).toBeLessThanOrEqual(Math.max(3, character.level ?? 3));
    expect(monster?.tags ?? []).not.toEqual(expect.arrayContaining(["starter", "boss"]));
  });

  it("does not duplicate rewards when callback is replayed", async () => {
    const found = await findResolvedAdventure((result) => !result.fightHandoff);
    const repeated = await found.service.completeAdventureApproach(found.userId, found.input);

    expect(repeated.state).toBe("already-completed");
    expect(found.dailyActions.createCount).toBe(1);
  });

  it("resets the current 93-minute adventure claim for dev testing", async () => {
    const found = await findResolvedAdventure((result) => !result.fightHandoff);
    const oldOffer = found.offer;

    const reset = await found.service.resetCurrentPeriodForTelegramUser(found.userId);
    expect(reset).toMatchObject({ state: "reset" });
    const rerolledOffer = await readyOffer(found.service, found.userId);

    expect(rerolledOffer.periodToken).not.toBe(oldOffer.periodToken);
    expect(rerolledOffer.choices.map((choice) => choice.id)).not.toEqual(
      oldOffer.choices.map((choice) => choice.id)
    );
    await expect(found.service.resetCurrentPeriodForTelegramUser(found.userId)).resolves.toMatchObject({
      state: "rerolled"
    });
    const replay = await found.service.completeAdventureApproach(found.userId, found.input);

    expect(replay.state).toBe("stale");
    const nextOffer = await readyOffer(found.service, found.userId);
    const nextSelected = await found.service.selectAdventureProblem(found.userId, {
      periodToken: nextOffer.periodToken,
      problemId: nextOffer.choices[0].id
    });

    expect(nextSelected.state).toBe("selected");
    if (nextSelected.state !== "selected") {
      throw new Error(`Expected selected next offer, got ${nextSelected.state}.`);
    }

    const completed = await found.service.completeAdventureApproach(found.userId, {
      periodToken: nextOffer.periodToken,
      problemId: nextOffer.choices[0].id,
      methodId: nextSelected.approaches[0].callbackKey ?? nextSelected.approaches[0].id
    });

    expect(completed.state).toBe("completed");
    expect(found.dailyActions.records.filter((record) => record.key === ADVENTURE_CHOICE_KEY)).toHaveLength(1);
    expect(found.dailyActions.records.filter((record) => record.key === ADVENTURE_CHOICE_REROLL_KEY)).toHaveLength(2);
  });

  it("rejects stale period and stale problem callbacks without claiming", async () => {
    const { service, characters, dailyActions } = setup();
    characters.add(telegramUserId, { xp: 25 });
    const offer = await readyOffer(service);
    const staleProblem = ADVENTURE_PROBLEM_IDS
      .find((problemId) => !offer.choices.some((choice) => choice.id === problemId));

    await expect(
      service.selectAdventureProblem(telegramUserId, {
        periodToken: "20260611",
        problemId: offer.choices[0].id
      })
    ).resolves.toMatchObject({ state: "stale" });
    await expect(
      service.completeAdventureApproach(telegramUserId, {
        periodToken: offer.periodToken,
        problemId: staleProblem ?? "spoon",
        methodId: "lower-fire"
      })
    ).resolves.toMatchObject({ state: "stale" });
    expect(dailyActions.createCount).toBe(0);
  });

  it("rejects authored methods that exist in content but were not rendered visible", async () => {
    const { service, characters, dailyActions } = setup();
    characters.add(telegramUserId, { xp: 25, gold: 10 });
    const offer = await readyOffer(service);
    const choice = offer.choices[0];
    const selected = await service.selectAdventureProblem(telegramUserId, {
      periodToken: offer.periodToken,
      problemId: choice.id
    });

    expect(selected.state).toBe("selected");
    if (selected.state !== "selected") {
      return;
    }

    const visible = selected.approaches.map((method) => method.id);
    const scene = buildAdventureResolutionScene({
      problemId: choice.id,
      title: choice.title,
      character: selected.character
    });
    const hidden = scene.methods.find((method) => !visible.includes(method.id));

    expect(hidden).toBeDefined();
    await expect(
      service.completeAdventureApproach(telegramUserId, {
        periodToken: offer.periodToken,
        problemId: choice.id,
        methodId: hidden?.id ?? "missing"
      })
    ).resolves.toMatchObject({ state: "stale" });
    expect(dailyActions.createCount).toBe(0);
  });

  it("level-gates the adventure choice loop", async () => {
    const { service, characters, dailyActions } = setup();
    characters.add(telegramUserId, { xp: 15 });

    await expect(service.getAdventureOfferForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "level-locked",
      requiredLevel: 3
    });
    await expect(
      service.completeAdventureApproach(telegramUserId, {
        periodToken: "20260612",
        problemId: "stew",
        methodId: "lower-fire"
      })
    ).resolves.toMatchObject({
      state: "level-locked",
      requiredLevel: 3
    });
    expect(dailyActions.createCount).toBe(0);
  });

  it("keeps the starter shawarma adventure available before the choice loop opens", async () => {
    const { service, characters, dailyActions } = setup();
    characters.add(telegramUserId, { xp: 0 });

    await expect(service.getAdventureOfferForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "level-locked",
      requiredLevel: 3
    });
    await expect(service.getMimicShawarmaForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "ready"
    });

    const result = await service.completeMimicShawarma(telegramUserId, "poke");

    expect(result.state).toBe("completed");
    if (result.state === "completed") {
      expect(result.reward).toMatchObject({
        localDate: "2026-06-12"
      });
      expect(result.reward.xp).toBeGreaterThan(0);
      expect(result.reward.gold).toBeGreaterThanOrEqual(0);
    }
    expect(dailyActions.records[0]).toMatchObject({
      key: MIMIC_SHAWARMA_ADVENTURE_KEY,
      localDate: "2026-06-12",
      rewardXp: result.state === "completed" ? result.reward.xp : -1,
      rewardGold: result.state === "completed" ? result.reward.gold : -1
    });
  });

  it("scales starter shawarma XP to most of the level-two gap after remort", async () => {
    const { service, characters } = setup();
    characters.add(telegramUserId, { level: 1, xp: 0, remortCount: 1 });

    const result = await service.completeMimicShawarma(telegramUserId, "flee");

    expect(result.state).toBe("completed");
    if (result.state === "completed") {
      expect(result.reward.xp).toBe(buildStarterLevelTwoXpReward({ remortCount: 1 }));
    }
    await expect(characters.findByTelegramUserId(telegramUserId)).resolves.toMatchObject({
      xp: buildStarterLevelTwoXpReward({ remortCount: 1 }),
      level: 1,
      remortCount: 1
    });
  });

  it("does not duplicate starter shawarma rewards when legacy callbacks replay", async () => {
    const { service, characters, dailyActions } = setup();
    characters.add(telegramUserId, { xp: 0 });

    const first = await service.completeMimicShawarma(telegramUserId, "receipt");
    const replay = await service.completeMimicShawarma(telegramUserId, "receipt");

    expect(first.state).toBe("completed");
    expect(replay.state).toBe("already-completed");
    expect(dailyActions.createCount).toBe(1);
  });

  it("rejects hidden starter shawarma method ids without claiming", async () => {
    const { service, characters, dailyActions } = setup();
    characters.add(telegramUserId, { xp: 0 });
    const summary = {
      ...characterSummary(),
      level: 1,
      xp: 0,
      classId: "class.bard",
      className: "Бард"
    };
    const visible = buildStarterMethodOptions("shawarma", summary).map((method) => method.id);
    const scene = buildStarterQuestResolutionScene("shawarma", summary);
    const hidden = scene.methods.find((method) => !visible.includes(method.id));

    expect(hidden).toBeDefined();
    await expect(service.completeMimicShawarma(telegramUserId, {
      type: "method",
      methodId: hidden?.id ?? "missing"
    })).resolves.toMatchObject({
      state: "stale"
    });
    expect(dailyActions.createCount).toBe(0);
  });

  it.each(["receipt", "poke", "flee"] as const)(
    "does not let v2 starter method %s fall through to legacy actions",
    async (methodId) => {
      const { service, characters, dailyActions } = setup();
      characters.add(telegramUserId, { xp: 0 });

      await expect(service.completeMimicShawarma(telegramUserId, {
        type: "method",
        methodId
      })).resolves.toMatchObject({ state: "stale" });
      expect(dailyActions.createCount).toBe(0);
    }
  );

  it("blocks fresh offers and claims while a live fight is active", async () => {
    const activeFight = fakeSession();
    const { service, characters, dailyActions } = setup(activeFight);
    characters.add(telegramUserId, { xp: 25 });
    const offer = buildAdventureOffer(
      `character-${telegramUserId.toString()}`,
      buildAdventurePeriod(fixedClock())
    );

    await expect(service.getAdventureOfferForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "active-fight",
      session: activeFight
    });
    await expect(
      service.completeAdventureApproach(telegramUserId, {
        periodToken: offer.periodToken,
        problemId: offer.choices[0].id,
        methodId: "lower-fire"
      })
    ).resolves.toMatchObject({
      state: "active-fight",
      session: activeFight
    });
    expect(dailyActions.createCount).toBe(0);
  });

  it("keeps a live complication fight visible after the period has an adventure claim", async () => {
    const activeFight = fakeSession();
    const { service, characters, dailyActions } = setup(activeFight);
    characters.add(telegramUserId, { xp: 25 });
    dailyActions.add(telegramUserId, {
      key: ADVENTURE_CHOICE_KEY,
      localDate: buildAdventurePeriod(fixedClock()).storageKey
    });

    await expect(service.getAdventureOfferForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "active-fight",
      session: activeFight
    });
  });

  it("keeps authored method rewards conservative and qualitative", () => {
    const options = buildAdventureMethodOptions(
      {
        id: "barrel",
        title: "Бочка уклала угоду з порожнечею",
        hook: "",
        client: ""
      },
      characterSummary()
    );

    expect(options.length).toBeGreaterThanOrEqual(3);
    expect(new Set(options.map((option) => option.label)).size).toBe(options.length);
    expect(options.map((option) => option.reward)).toEqual(
      expect.arrayContaining([
        { xp: 4, gold: 2 },
        { xp: 7, gold: 4 }
      ])
    );
    expect(options.every((option) => [4, 7, 10].includes(option.reward.xp))).toBe(true);
    expect(options.every((option) => [0, 2, 4, 7].includes(option.reward.gold))).toBe(true);
    expect(options.filter((option) => option.goldCost).every((option) => option.reward.gold === 0)).toBe(true);
    expect(options.some((option) => option.source === "scene")).toBe(true);
    expect(options.some((option) => option.source === "race")).toBe(true);
    expect(options.some((option) => option.source === "class")).toBe(true);
    expect(options.every((option) => !/%|\d{2,}/u.test(option.chanceHint))).toBe(true);
  });
});

function fixedClock(): Date {
  return new Date("2026-06-12T10:30:00.000Z");
}

function setup(
  activeFight: SoloCombatSessionRecord | null = null,
  equipment: EquipmentRepository | undefined = undefined
): {
  characters: FakeCharacterRepository;
  dailyActions: FakeDailyActionRepository;
  service: AdventureService;
} {
  const characters = new FakeCharacterRepository();
  const dailyActions = new FakeDailyActionRepository(characters);
  const fights = {
    findActiveByTelegramUserId: () => Promise.resolve(activeFight)
  };

  return {
    characters,
    dailyActions,
    service: new AdventureService(characters, dailyActions, fixedClock, fights, equipment)
  };
}

async function readyOffer(service: AdventureService, userId = telegramUserId) {
  const result = await service.getAdventureOfferForTelegramUser(userId);

  if (result.state !== "ready") {
    throw new Error(`Expected ready offer, got ${result.state}.`);
  }

  return result.offer;
}

async function findResolvedAdventure(
  matches: (result: Extract<AdventureResult, { state: "completed" }>) => boolean
) {
  for (let user = 40n; user < 1_200n; user += 1n) {
    const probe = setup();
    probe.characters.add(user, { xp: 25, gold: 10 });
    const lookup = await probe.service.getAdventureOfferForTelegramUser(user);

    if (lookup.state !== "ready") {
      continue;
    }

    for (const choice of lookup.offer.choices) {
      const selected = await probe.service.selectAdventureProblem(user, {
        periodToken: lookup.offer.periodToken,
        problemId: choice.id
      });

      if (selected.state !== "selected") {
        continue;
      }

      for (const approach of selected.approaches) {
        const { service, characters, dailyActions } = setup();
        characters.add(user, { xp: 25, gold: 10 });
        const freshLookup = await service.getAdventureOfferForTelegramUser(user);

        if (freshLookup.state !== "ready") {
          continue;
        }

        const freshChoice = freshLookup.offer.choices.find((candidate) => candidate.id === choice.id);

        if (!freshChoice) {
          continue;
        }

        const input = {
          periodToken: freshLookup.offer.periodToken,
          problemId: freshChoice.id,
          methodId: approach.callbackKey ?? approach.id
        };
        const result = await service.completeAdventureApproach(user, input);

        if (result.state === "completed" && matches(result)) {
          return { service, dailyActions, result, input, userId: user, offer: freshLookup.offer };
        }
      }
    }
  }

  throw new Error("Could not find matching resolved adventure.");
}

function characterSummary() {
  return {
    name: "Мандрівник",
    pronoun: "they",
    pronounLabel: "Вони",
    path: "boundary",
    raceId: "race.human-ish",
    raceName: "Людисько",
    classId: "class.warrior",
    className: "Воїн",
    title: "Пересічний Пригодник",
    level: 3,
    xp: 25,
    nextLevelXp: 50,
    xpToNextLevel: 25,
    gold: 0,
    hpCurrent: 28,
    hpMax: 28,
    manaCurrent: 14,
    manaMax: 14,
    stats: {
      strength: 9,
      dexterity: 6,
      intelligence: 6,
      charisma: 6,
      luck: 6
    },
    levelBonus: {
      hpMax: 8,
      manaMax: 4,
      primaryStat: {
        stat: "strength" as const,
        bonus: 2
      }
    }
  };
}

function fakeSession(): SoloCombatSessionRecord {
  return {
    id: "session-1",
    characterId: `character-${telegramUserId.toString()}`,
    monsterId: "monster.deadline-spider",
    status: "active",
    turn: 1,
    state: null,
    reward: null,
    createdAt: fixedClock(),
    updatedAt: fixedClock(),
    expiresAt: new Date("2026-06-12T10:45:00.000Z")
  };
}

class FakeCharacterRepository implements CharacterRepository {
  private readonly charactersByTelegramUserId = new Map<bigint, CharacterRecord>();

  add(userTelegramId: bigint, overrides: Partial<CharacterRecord> = {}): void {
    const xp = overrides.xp ?? 25;
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
      hpCurrent: 28,
      hpMax: 28,
      manaCurrent: 14,
      manaMax: 14,
      statsJson: {
        strength: 9,
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
      level: getLevelForXp(nextXp, { remortCount: character.remortCount ?? 0 })
    };
    this.charactersByTelegramUserId.set(userTelegramId, updated);
    return updated;
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
}

class FakeDailyActionRepository implements DailyActionRepository {
  private readonly actions = new Map<string, DailyActionRecord>();
  createCount = 0;
  lastDeleteInput: DailyActionClaimIdentity | null = null;
  lastRollbackInput: DailyActionRollbackInput | null = null;

  constructor(private readonly characters: FakeCharacterRepository) {}

  get records(): DailyActionRecord[] {
    return [...this.actions.values()];
  }

  add(
    userTelegramId: bigint,
    input: {
      key: string;
      localDate: string;
      rewardXp?: number;
      rewardGold?: number;
      spentGold?: number;
      resultJson?: DailyActionRecord["resultJson"];
    }
  ): void {
    const characterId = `character-${userTelegramId.toString()}`;
    const action = {
      id: `daily-action-${this.actions.size + 1}`,
      characterId,
      key: input.key,
      localDate: input.localDate,
      rewardXp: input.rewardXp ?? 0,
      rewardGold: input.rewardGold ?? 0,
      spentGold: input.spentGold ?? 0,
      resultJson: input.resultJson ?? null,
      createdAt: fixedClock()
    };
    this.actions.set(`${characterId}:${input.key}:${input.localDate}`, action);
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

    const spentGold = Math.max(0, Math.floor(input.spentGold ?? 0));

    if (spentGold > character.gold) {
      return {
        state: "insufficient-gold",
        character,
        requiredGold: spentGold
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
      spentGold,
      resultJson: input.resultJson ?? null,
      createdAt: fixedClock()
    };
    this.actions.set(claimKey, action);

    const updatedCharacter = this.characters.updateReward(
      userTelegramId,
      input.rewardXp,
      input.rewardGold - spentGold
    );

    return {
      state: "created",
      action,
      character: updatedCharacter,
      itemGrants: input.itemGrants ?? [],
      hpLoss: null,
      levelChange: {
        oldLevel: getLevelForXp(character.xp, { remortCount: character.remortCount ?? 0 }),
        newLevel: updatedCharacter.level,
        leveledUp:
          updatedCharacter.level > getLevelForXp(character.xp, { remortCount: character.remortCount ?? 0 })
      }
    };
  }

  async deleteForTelegramUser(
    userTelegramId: bigint,
    input: DailyActionClaimIdentity
  ): Promise<"deleted" | "missing" | "no-character"> {
    this.lastDeleteInput = input;
    const character = await this.characters.findByTelegramUserId(userTelegramId);

    if (!character) {
      return "no-character";
    }

    return this.actions.delete(`${character.id}:${input.key}:${input.localDate}`)
      ? "deleted"
      : "missing";
  }

  async rollbackForTelegramUser(
    userTelegramId: bigint,
    input: DailyActionRollbackInput
  ): Promise<"rolled-back" | "missing" | "no-character"> {
    this.lastRollbackInput = input;
    const character = await this.characters.findByTelegramUserId(userTelegramId);

    if (!character) {
      return "no-character";
    }

    return this.actions.delete(`${character.id}:${input.key}:${input.localDate}`)
      ? "rolled-back"
      : "missing";
  }

  async countForTelegramUser(
    userTelegramId: bigint,
    input: { key: string; localDatePrefix: string }
  ): Promise<number | null> {
    const character = await this.characters.findByTelegramUserId(userTelegramId);

    if (!character) {
      return null;
    }

    return [...this.actions.values()].filter(
      (action) =>
        action.characterId === character.id &&
        action.key === input.key &&
        action.localDate.startsWith(input.localDatePrefix)
    ).length;
  }
}

class FakeEquipmentRepository implements EquipmentRepository {
  constructor(private snapshot: CharacterEquipmentSnapshot | null) {}

  listByTelegramUserId(): Promise<CharacterEquipmentSnapshot | null> {
    return Promise.resolve(this.snapshot);
  }

  equipForCharacter(): Promise<CharacterEquipmentRecord> {
    throw new Error("Not implemented in adventure service tests.");
  }

  unequipForCharacter(): Promise<boolean> {
    throw new Error("Not implemented in adventure service tests.");
  }
}

function buildEquipment(overrides: Partial<CharacterEquipmentRecord>): CharacterEquipmentRecord {
  return {
    id: "equipment-1",
    characterId: `character-${telegramUserId.toString()}`,
    slot: "accessory",
    itemId: "item.cork-ring-of-serious-business",
    createdAt: fixedClock(),
    updatedAt: fixedClock(),
    ...overrides
  };
}
