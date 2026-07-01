import { describe, expect, it } from "vitest";
import type {
  CharacterRecord,
  CharacterRepository,
  CreateCharacterInput,
  CreateCharacterResult
} from "../../src/db/repositories/characterRepository";
import type {
  ClaimDailyActionInput,
  ClaimDailyActionResult,
  DailyActionRecord,
  DailyActionRepository
} from "../../src/db/repositories/dailyActionRepository";
import type {
  CompleteHuntContractInput,
  HuntContractRecord,
  HuntContractRepository,
  PostedHuntContractInput
} from "../../src/db/repositories/huntContractRepository";
import type { TelegramUserProfile } from "../../src/db/repositories/userRepository";
import { items, monsterLoot, monsters } from "../../src/content";
import { getMonsterLootEntryItemId } from "../../src/domain/loot/lootEngine";
import { getLevelForXp } from "../../src/domain/progression/level";
import type { MonsterContent } from "../../src/content/schema";
import {
  buildHuntRewardAmounts,
  buildHuntContractToken,
  HUNT_BOARD_CONTRACT_KEY,
  HuntService,
  selectHuntMonster,
  toKyivHourPeriodId
} from "../../src/services/huntService";

const telegramUserId = 42n;

describe("HuntService", () => {
  it("returns no-character when user has no character", async () => {
    const characters = new FakeCharacterRepository();
    const dailyActions = new FakeDailyActionRepository(characters);
    const huntContracts = new FakeHuntContractRepository(characters);
    const service = new HuntService(characters, dailyActions, huntContracts, fixedClock);

    await expect(service.getHuntBoardForTelegramUser(telegramUserId)).resolves.toEqual({
      state: "no-character"
    });
    await expect(
      service.completeHuntContract(telegramUserId, "2026-06-14T00", "missing0", "strike")
    ).resolves.toEqual({
      state: "no-character"
    });
  });

  it("selects the same non-boss monster for the same Kyiv hour and character", () => {
    const first = selectHuntMonster("2026-06-14T00", "character-42");
    const second = selectHuntMonster("2026-06-14T00", "character-42");

    expect(first).toEqual(second);
    expect(first.id).not.toBe("monster.mimic-shawarma");
    expect(first.tags).not.toContain("starter");
    expect(first.tags).not.toContain("boss");
    expect(first.level).toBeLessThanOrEqual(3);
  });

  it("selects hunt monsters close to the current character level", () => {
    const levelEight = selectHuntMonster("2026-06-14T00", "character-42", 8);
    const levelThirteen = selectHuntMonster("2026-06-14T00", "character-42", 13);

    expect(levelEight.tags).not.toContain("starter");
    expect(levelEight.tags).not.toContain("boss");
    expect(levelEight.level).toBeGreaterThanOrEqual(6);
    expect(levelEight.level).toBeLessThanOrEqual(8);
    expect(levelThirteen.tags).not.toContain("starter");
    expect(levelThirteen.tags).not.toContain("boss");
    expect(levelThirteen.level).toBeGreaterThanOrEqual(11);
    expect(levelThirteen.level).toBeLessThanOrEqual(13);
  });

  it("locks hunt contracts until level three without creating a ledger row", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId, { xp: 10 });
    const dailyActions = new FakeDailyActionRepository(characters);
    const huntContracts = new FakeHuntContractRepository(characters);
    const service = new HuntService(characters, dailyActions, huntContracts, fixedClock);

    await expect(service.getHuntBoardForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "level-locked",
      requiredLevel: 3
    });
    await expect(
      service.completeHuntContract(telegramUserId, "2026-06-14T00", "missing0", "strike")
    ).resolves.toMatchObject({
      state: "level-locked",
      requiredLevel: 3
    });
    expect(huntContracts.createCount).toBe(0);
    expect(dailyActions.createCount).toBe(0);
  });

  it("keeps eligible hunt monsters across the current level range in content", () => {
    const eligible = monsters.filter((monster) => {
      const tags = new Set(monster.tags);

      return (
        monster.id !== "monster.mimic-shawarma" &&
        !tags.has("starter") &&
        !tags.has("boss") &&
        monster.level >= 3 &&
        monster.level <= 13
      );
    });
    const eligibleLevels = new Set(eligible.map((monster) => monster.level));

    expect(eligible.length).toBeGreaterThan(0);
    expect(eligible.every((monster) => monster.id !== "monster.mimic-shawarma")).toBe(true);
    expect(eligible.every((monster) => !monster.tags.includes("starter"))).toBe(true);
    expect(eligible.every((monster) => !monster.tags.includes("boss"))).toBe(true);
    expect(eligibleLevels.has(3)).toBe(true);
    expect(eligibleLevels.has(8)).toBe(true);
    expect(eligibleLevels.has(13)).toBe(true);
  });

  it("keeps hunt reward amounts bounded by action and monster level", () => {
    const levelOne = { level: 1 } as MonsterContent;
    const levelThree = { level: 3 } as MonsterContent;
    const levelThirteen = { level: 13 } as MonsterContent;

    expect(buildHuntRewardAmounts(levelOne, "strike")).toEqual({ xp: 5, gold: 0 });
    expect(buildHuntRewardAmounts(levelOne, "trick")).toEqual({ xp: 4, gold: 1 });
    expect(buildHuntRewardAmounts(levelOne, "retreat")).toEqual({ xp: 3, gold: 0 });
    expect(buildHuntRewardAmounts(levelThree, "strike")).toEqual({ xp: 7, gold: 1 });
    expect(buildHuntRewardAmounts(levelThree, "trick")).toEqual({ xp: 6, gold: 2 });
    expect(buildHuntRewardAmounts(levelThree, "retreat")).toEqual({ xp: 5, gold: 1 });
    expect(buildHuntRewardAmounts(levelThirteen, "strike", 13)).toEqual({ xp: 14, gold: 6 });
    expect(buildHuntRewardAmounts(levelThirteen, "trick", 13)).toEqual({ xp: 14, gold: 7 });
    expect(buildHuntRewardAmounts(levelThirteen, "retreat", 13)).toEqual({ xp: 14, gold: 6 });
    expect(buildHuntRewardAmounts(levelThree, "strike", 6)).toEqual({ xp: 1, gold: 1 });
  });

  it("uses Kyiv-local hour periods for hunt contracts", () => {
    expect(toKyivHourPeriodId(new Date("2026-06-13T21:30:00.000Z"))).toBe("2026-06-14T00");
    expect(toKyivHourPeriodId(new Date("2026-06-14T04:59:00.000Z"))).toBe("2026-06-14T07");
    expect(toKyivHourPeriodId(new Date("2026-06-14T05:00:00.000Z"))).toBe("2026-06-14T08");
  });

  it("grants one deterministic hunt reward per hour", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId);
    const dailyActions = new FakeDailyActionRepository(characters);
    const huntContracts = new FakeHuntContractRepository(characters);
    const service = new HuntService(characters, dailyActions, huntContracts, fixedClock);
    const board = await service.getHuntBoardForTelegramUser(telegramUserId);

    if (board.state !== "ready") {
      throw new Error("Expected ready hunt board.");
    }

    const result = await service.completeHuntContract(
      telegramUserId,
      "2026-06-14T00",
      board.contract.contractToken,
      "strike"
    );
    const repeated = await service.completeHuntContract(
      telegramUserId,
      "2026-06-14T00",
      board.contract.contractToken,
      "trick"
    );

    expect(result.state).toBe("completed");
    expect(repeated.state).toBe("already-completed");
    expect(dailyActions.createCount).toBe(1);
    expect(dailyActions.records[0]).toMatchObject({
      key: HUNT_BOARD_CONTRACT_KEY,
      localDate: "2026-06-14T00"
    });
    if (result.state === "completed") {
      expect(result.reward.xp).toBeGreaterThanOrEqual(3);
      expect(result.reward.xp).toBeLessThanOrEqual(7);
      expect(result.reward.gold).toBeGreaterThanOrEqual(0);
      expect(result.reward.gold).toBeLessThanOrEqual(3);
      expect(result.reward.itemGrants.length).toBeLessThanOrEqual(1);
    }
    await expect(characters.findByTelegramUserId(telegramUserId)).resolves.toMatchObject({
      xp: 25 + (result.state === "completed" ? result.reward.xp : 0),
      gold: result.state === "completed" ? result.reward.gold : 0
    });
  });

  it("creates one posted contract row when the hunt board opens", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId);
    const dailyActions = new FakeDailyActionRepository(characters);
    const huntContracts = new FakeHuntContractRepository(characters);
    const service = new HuntService(characters, dailyActions, huntContracts, fixedClock);

    const first = await service.getHuntBoardForTelegramUser(telegramUserId);
    const second = await service.getHuntBoardForTelegramUser(telegramUserId);

    expect(first.state).toBe("ready");
    expect(second.state).toBe("ready");
    expect(huntContracts.createCount).toBe(1);
    expect(huntContracts.allRecords[0]).toMatchObject({
      localPeriodId: "2026-06-14T00",
      status: "posted"
    });
  });

  it("reuses a persisted contract row even when deterministic selection would pick another monster", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId);
    const dailyActions = new FakeDailyActionRepository(characters);
    const huntContracts = new FakeHuntContractRepository(characters);
    const persistedMonster = pickDifferentHuntMonster("2026-06-14T00", "character-42");
    await huntContracts.putRecord(telegramUserId, {
      localPeriodId: "2026-06-14T00",
      monsterId: persistedMonster.id,
      contractToken: buildHuntContractToken("2026-06-14T00", "character-42", persistedMonster)
    });
    const service = new HuntService(characters, dailyActions, huntContracts, fixedClock);

    const board = await service.getHuntBoardForTelegramUser(telegramUserId);

    expect(board.state).toBe("ready");
    if (board.state === "ready") {
      expect(board.contract.monster.id).toBe(persistedMonster.id);
      expect(board.contract.contractToken).toBe(
        buildHuntContractToken("2026-06-14T00", "character-42", persistedMonster)
      );
    }
    expect(huntContracts.createCount).toBe(0);
  });

  it("marks the contract ledger completed and replays the original reward on repeated callbacks", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId);
    const dailyActions = new FakeDailyActionRepository(characters);
    const huntContracts = new FakeHuntContractRepository(characters);
    const service = new HuntService(characters, dailyActions, huntContracts, fixedClock);
    const board = await service.getHuntBoardForTelegramUser(telegramUserId);

    if (board.state !== "ready") {
      throw new Error("Expected ready hunt board.");
    }

    const completed = await service.completeHuntContract(
      telegramUserId,
      "2026-06-14T00",
      board.contract.contractToken,
      "strike"
    );
    const repeated = await service.completeHuntContract(
      telegramUserId,
      "2026-06-14T00",
      board.contract.contractToken,
      "trick"
    );

    expect(completed.state).toBe("completed");
    expect(repeated.state).toBe("already-completed");
    expect(dailyActions.createCount).toBe(1);
    expect(huntContracts.allRecords[0]).toMatchObject({
      status: "completed",
      completedAction: "strike"
    });
    if (completed.state === "completed" && repeated.state === "already-completed") {
      expect(repeated.reward).toMatchObject({
        xp: completed.reward.xp,
        gold: completed.reward.gold,
        localPeriodId: completed.reward.localPeriodId,
        action: "strike"
      });
      expect(repeated.reward?.itemGrants).toEqual(completed.reward.itemGrants);
    }
  });

  it("does not complete the current hunt from a stale hour callback", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId);
    const dailyActions = new FakeDailyActionRepository(characters);
    const huntContracts = new FakeHuntContractRepository(characters);
    const service = new HuntService(characters, dailyActions, huntContracts, fixedClock);

    const result = await service.completeHuntContract(
      telegramUserId,
      "2026-06-13T23",
      "missing0",
      "strike"
    );

    expect(result).toEqual({
      state: "stale-period",
      currentLocalPeriodId: "2026-06-14T00",
      requestedLocalPeriodId: "2026-06-13T23"
    });
    expect(dailyActions.createCount).toBe(0);
    await expect(characters.findByTelegramUserId(telegramUserId)).resolves.toMatchObject({
      xp: 25,
      gold: 0
    });
  });

  it("does not claim the current hunt when the contract token changed or is missing", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId);
    const dailyActions = new FakeDailyActionRepository(characters);
    const huntContracts = new FakeHuntContractRepository(characters);
    const service = new HuntService(characters, dailyActions, huntContracts, fixedClock);
    const board = await service.getHuntBoardForTelegramUser(telegramUserId);
    expect(board.state).toBe("ready");
    const token = board.state === "ready" ? board.contract.contractToken : "";

    const mismatch = await service.completeHuntContract(
      telegramUserId,
      "2026-06-14T00",
      "wrong00",
      "strike"
    );
    const legacyTokenless = await service.completeHuntContract(
      telegramUserId,
      "2026-06-14T00",
      null,
      "strike"
    );

    expect(mismatch.state).toBe("stale-contract");
    expect(legacyTokenless.state).toBe("stale-contract");
    expect(dailyActions.createCount).toBe(0);
    expect(huntContracts.allRecords[0]).toMatchObject({
      status: "posted",
      contractToken: token
    });
    await expect(characters.findByTelegramUserId(telegramUserId)).resolves.toMatchObject({
      xp: 25,
      gold: 0
    });
  });

  it("fails safe when a persisted contract references a missing monster id", async () => {
    const characters = new FakeCharacterRepository();
    characters.add(telegramUserId);
    const dailyActions = new FakeDailyActionRepository(characters);
    const huntContracts = new FakeHuntContractRepository(characters);
    await huntContracts.putRecord(telegramUserId, {
      localPeriodId: "2026-06-14T00",
      monsterId: "monster.missing-from-bestiary",
      contractToken: "missing0"
    });
    const service = new HuntService(characters, dailyActions, huntContracts, fixedClock);

    await expect(service.getHuntBoardForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "missing-contract-monster",
      monsterId: "monster.missing-from-bestiary"
    });
    await expect(
      service.completeHuntContract(telegramUserId, "2026-06-14T00", "missing0", "strike")
    ).resolves.toMatchObject({
      state: "missing-contract-monster",
      monsterId: "monster.missing-from-bestiary"
    });
    expect(dailyActions.createCount).toBe(0);
  });

  it("builds stable short contract tokens from period, character, and reward-relevant monster content", () => {
    const skeleton = {
      id: "monster.stamp-doorkeeper-skeleton",
      level: 2,
      tags: ["undead", "bureaucracy", "gatekeeper"]
    };
    const first = buildHuntContractToken(
      "2026-06-14T00",
      "character-42",
      skeleton
    );
    const second = buildHuntContractToken(
      "2026-06-14T00",
      "character-42",
      { ...skeleton, tags: [...skeleton.tags].reverse() }
    );
    const changedMonster = buildHuntContractToken(
      "2026-06-14T00",
      "character-42",
      {
        id: "monster.deadline-spider",
        level: 2,
        tags: ["beast", "time", "web"]
      }
    );
    const changedLevel = buildHuntContractToken(
      "2026-06-14T00",
      "character-42",
      { ...skeleton, level: 3 }
    );
    const skeletonLoot = monsterLoot["monster.stamp-doorkeeper-skeleton"] as string[];
    const originalLoot = [...skeletonLoot];
    let changedLootList = "";

    try {
      skeletonLoot.push("item.test-only-paperclip");
      changedLootList = buildHuntContractToken(
        "2026-06-14T00",
        "character-42",
        skeleton
      );
    } finally {
      skeletonLoot.splice(0, skeletonLoot.length, ...originalLoot);
    }

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-z0-9]{6,10}$/);
    expect(changedMonster).not.toBe(first);
    expect(changedLevel).not.toBe(first);
    expect(changedLootList).not.toBe(first);
  });

  it("keeps monster loot references valid and value-bearing", () => {
    const itemIds = new Set(items.map((item) => item.id));
    const monsterIds = new Set(monsters.map((monster) => monster.id));

    for (const [monsterId, lootIds] of Object.entries(monsterLoot)) {
      expect(monsterIds.has(monsterId)).toBe(true);

      for (const lootEntry of lootIds) {
        const itemId = getMonsterLootEntryItemId(lootEntry);
        const item = items.find((candidate) => candidate.id === itemId);

        expect(itemIds.has(itemId)).toBe(true);
        expect(item?.goldValue !== undefined || item?.priceless === true).toBe(true);
        if (item?.effect) {
          expect(["weapon", "armor", "accessory"]).toContain(item.slot);
        }
        expect(item).not.toHaveProperty("statBonus");
      }
    }
  });
});

function fixedClock(): Date {
  return new Date("2026-06-13T21:30:00.000Z");
}

function pickDifferentHuntMonster(localPeriodId: string, characterId: string): MonsterContent {
  const deterministic = selectHuntMonster(localPeriodId, characterId);
  const alternative = monsters.find(
    (monster) =>
      monster.id !== deterministic.id &&
      monster.id !== "monster.mimic-shawarma" &&
      !monster.tags.includes("boss") &&
      monster.level <= 3
  );

  if (!alternative) {
    throw new Error("Expected at least two eligible hunt monsters.");
  }

  return alternative;
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

  findByUserId(userId: string): Promise<CharacterRecord | null> {
    return Promise.resolve(
      [...this.charactersByTelegramUserId.values()].find((character) => character.userId === userId) ?? null
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

    const updatedCharacter = this.characters.updateReward(
      userTelegramId,
      input.rewardXp,
      input.rewardGold
    );

    return {
      state: "created",
      action,
      character: updatedCharacter,
      itemGrants: input.itemGrants ?? [],
      levelChange: {
        oldLevel: getLevelForXp(character.xp),
        newLevel: updatedCharacter.level,
        leveledUp: updatedCharacter.level > getLevelForXp(character.xp)
      }
    };
  }
}

class FakeHuntContractRepository implements HuntContractRepository {
  private readonly records = new Map<string, HuntContractRecord>();
  createCount = 0;

  constructor(private readonly characters: FakeCharacterRepository) {}

  get allRecords(): HuntContractRecord[] {
    return [...this.records.values()];
  }

  async findByTelegramUserIdAndPeriod(
    telegramUserIdInput: bigint,
    localPeriodId: string
  ): Promise<HuntContractRecord | null> {
    const character = await this.characters.findByTelegramUserId(telegramUserIdInput);

    if (!character) {
      return null;
    }

    return this.records.get(`${character.id}:${localPeriodId}`) ?? null;
  }

  async upsertPostedContractForTelegramUser(
    telegramUserIdInput: bigint,
    input: PostedHuntContractInput
  ): Promise<HuntContractRecord | null> {
    const character = await this.characters.findByTelegramUserId(telegramUserIdInput);

    if (!character) {
      return null;
    }

    const key = `${character.id}:${input.localPeriodId}`;
    const existing = this.records.get(key);

    if (existing) {
      return existing;
    }

    this.createCount += 1;
    const record: HuntContractRecord = {
      id: `hunt-contract-${this.createCount}`,
      characterId: character.id,
      localPeriodId: input.localPeriodId,
      monsterId: input.monsterId,
      contractToken: input.contractToken,
      status: "posted",
      completedAction: null,
      rewardXp: null,
      rewardGold: null,
      rewardItems: null,
      createdAt: fixedClock(),
      completedAt: null,
      updatedAt: fixedClock()
    };
    this.records.set(key, record);

    return record;
  }

  async putRecord(
    telegramUserIdInput: bigint,
    input: PostedHuntContractInput
  ): Promise<HuntContractRecord> {
    const character = await this.characters.findByTelegramUserId(telegramUserIdInput);

    if (!character) {
      throw new Error("Character not found.");
    }

    const key = `${character.id}:${input.localPeriodId}`;
    const record: HuntContractRecord = {
      id: `hunt-contract-seeded-${input.localPeriodId}`,
      characterId: character.id,
      localPeriodId: input.localPeriodId,
      monsterId: input.monsterId,
      contractToken: input.contractToken,
      status: "posted",
      completedAction: null,
      rewardXp: null,
      rewardGold: null,
      rewardItems: null,
      createdAt: fixedClock(),
      completedAt: null,
      updatedAt: fixedClock()
    };
    this.records.set(key, record);

    return record;
  }

  async markCompletedForTelegramUser(
    telegramUserIdInput: bigint,
    input: CompleteHuntContractInput
  ): Promise<HuntContractRecord | null> {
    const character = await this.characters.findByTelegramUserId(telegramUserIdInput);

    if (!character) {
      return null;
    }

    const key = `${character.id}:${input.localPeriodId}`;
    const existing = this.records.get(key);

    if (!existing) {
      return null;
    }

    const completed: HuntContractRecord = {
      ...existing,
      status: "completed",
      completedAction: input.action,
      rewardXp: input.rewardXp,
      rewardGold: input.rewardGold,
      rewardItems: input.itemGrants,
      completedAt: fixedClock(),
      updatedAt: fixedClock()
    };
    this.records.set(key, completed);

    return completed;
  }
}
