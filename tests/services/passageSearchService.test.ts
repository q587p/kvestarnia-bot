import { describe, expect, it, vi } from "vitest";
import type {
  PassageSearchActionRecord,
  DuePassageSearchActionRecord,
  PassageSearchLookupResult,
  PassageSearchRepository,
  PassageSearchResolutionResult,
  PassageSearchStartResult,
  PassageSearchStoredResult
} from "../../src/db/repositories/passageSearchRepository";
import type { CharacterRecord } from "../../src/db/repositories/characterRepository";
import type { PassageSearchLoot, PassageSearchSnapshot } from "../../src/domain/passageSearch";
import {
  getCooldownKey,
  PASSAGE_SEARCH_NODE_DEEP_LEVEL1,
  PassageSearchService
} from "../../src/services/passageSearchService";
import {
  PRESENCE_LOCATION_KORCHMA_DEEP,
  PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1,
  PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT,
  PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_RIGHT,
  PRESENCE_LOCATION_KORCHMA_HALL
} from "../../src/services/presenceService";

const telegramUserId = 42587n;
const now = new Date("2026-06-27T09:00:00.000Z");

describe("PassageSearchService", () => {
  it("rejects stale descent starts before cooldown or action mutation", async () => {
    const repo = new FakePassageSearchRepository();
    const fight = new FakeFightService();
    const service = new PassageSearchService(repo, fight as never, () => now);

    await expect(service.startDescentSearch(telegramUserId, {
      currentLocationId: PRESENCE_LOCATION_KORCHMA_HALL
    })).resolves.toEqual({ state: "blocked", reason: "stale-location" });
    expect(repo.startCalls).toBe(0);
    expect(fight.overviewCalls).toBe(0);
  });

  it("rejects stale deep level choice searches before cooldown or action mutation", async () => {
    const repo = new FakePassageSearchRepository();
    const fight = new FakeFightService();
    const service = new PassageSearchService(repo, fight as never, () => now);

    await expect(service.startDeepLevelOneSearch(telegramUserId, {
      currentLocationId: PRESENCE_LOCATION_KORCHMA_DEEP
    })).resolves.toEqual({ state: "blocked", reason: "stale-location" });
    expect(repo.startCalls).toBe(0);
    expect(fight.overviewCalls).toBe(0);
  });

  it("starts safe deep level choice search without creating or refreshing a monster preview", async () => {
    const repo = new FakePassageSearchRepository();
    const fight = new FakeFightService();
    const service = new PassageSearchService(repo, fight as never, () => now);

    const result = await service.startDeepLevelOneSearch(telegramUserId, {
      currentLocationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1
    });

    expect(result.state).toBe("started");
    expect(repo.startCalls).toBe(1);
    expect(fight.overviewCalls).toBe(1);
    expect(fight.previewCalls).toBe(0);
    expect(repo.action?.payload).toMatchObject({
      nodeKey: "location:deep-level1",
      nodeKind: "location",
      originLocationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1,
      safeAtStart: true,
      dangerTier: 0,
      searchTier: 0
    });
    expect(repo.action?.payload.encounterToken).toBeUndefined();
    expect(repo.action?.payload.passage).toBeUndefined();
    expect(repo.action?.endsAt.getTime() - repo.action!.startedAt.getTime()).toBe(23_000);
  });

  it("rejects stale passage starts before previewing or spending cooldown", async () => {
    const repo = new FakePassageSearchRepository();
    const fight = new FakeFightService();
    const service = new PassageSearchService(repo, fight as never, () => now);

    await expect(service.startPassageSearch(telegramUserId, {
      passage: "deep-left",
      encounterToken: "encounter13",
      currentLocationId: PRESENCE_LOCATION_KORCHMA_HALL
    })).resolves.toEqual({ state: "blocked", reason: "stale-location" });
    expect(repo.startCalls).toBe(0);
    expect(fight.previewCalls).toBe(0);
  });

  it("short-circuits passage starts for an already running search before previewing", async () => {
    const repo = new FakePassageSearchRepository();
    repo.runningAction = makeAction({
      token: "run13",
      status: "running",
      endsAt: new Date(now.getTime() + 42_000),
      payload: {
        ...makeSnapshot(),
        nodeKey: "passage:deep-left",
        nodeKind: "passage",
        originLocationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT,
        passage: "deep-left",
        encounterToken: "encounter13",
        safeAtStart: false,
        dangerTier: 4,
        searchTier: 3,
        monsterIdAtStart: "monster.deadline-spider",
        monsterNameAtStart: "Павук дедлайнів",
        monsterLevelAtStart: 3
      }
    });
    const fight = new FakeFightService();
    const service = new PassageSearchService(repo, fight as never, () => now);

    const result = await service.startPassageSearch(telegramUserId, {
      passage: "deep-left",
      encounterToken: "encounter13",
      currentLocationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT
    });

    expect(result.state).toBe("running");
    expect(repo.findRunningCalls).toBe(1);
    expect(repo.startCalls).toBe(0);
    expect(fight.previewCalls).toBe(0);
  });

  it("starts safe passage-rest search without creating or refreshing a monster preview", async () => {
    const repo = new FakePassageSearchRepository();
    const fight = new FakeFightService();
    fight.restWindowState = "monster-rest";
    const service = new PassageSearchService(repo, fight as never, () => now);

    const result = await service.startSafePassageRestSearch(telegramUserId, {
      passage: "deep-left",
      currentLocationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT
    });

    expect(result.state).toBe("started");
    expect(repo.startCalls).toBe(1);
    expect(fight.restWindowCalls).toEqual([
      { originLocationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT }
    ]);
    expect(fight.previewCalls).toBe(0);
    expect(repo.action?.payload).toMatchObject({
      nodeKey: "passage:deep-left",
      nodeKind: "passage",
      originLocationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT,
      passage: "deep-left",
      safeAtStart: true,
      dangerTier: 0,
      searchTier: 3
    });
    expect(repo.action?.payload.encounterToken).toBeUndefined();
    expect(repo.action?.payload.monsterIdAtStart).toBeUndefined();
    expect(repo.action?.endsAt.getTime() - repo.action!.startedAt.getTime()).toBe(42_000);
  });

  it("short-circuits safe passage-rest starts for an already running search before rest lookup", async () => {
    const repo = new FakePassageSearchRepository();
    repo.runningAction = makeAction({
      token: "run13",
      status: "running",
      endsAt: new Date(now.getTime() + 42_000),
      payload: {
        ...makeSnapshot(),
        nodeKey: "passage:deep-left",
        nodeKind: "passage",
        originLocationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT,
        passage: "deep-left",
        safeAtStart: true,
        dangerTier: 0,
        searchTier: 3
      }
    });
    const fight = new FakeFightService();
    fight.restWindowState = "monster-rest";
    const service = new PassageSearchService(repo, fight as never, () => now);

    const result = await service.startSafePassageRestSearch(telegramUserId, {
      passage: "deep-left",
      currentLocationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT
    });

    expect(result.state).toBe("running");
    expect(repo.findRunningCalls).toBe(1);
    expect(repo.startCalls).toBe(0);
    expect(fight.restWindowCalls).toEqual([]);
    expect(fight.previewCalls).toBe(0);
  });

  it("rejects stale passage-rest starts before rest-window lookup or action mutation", async () => {
    const repo = new FakePassageSearchRepository();
    const fight = new FakeFightService();
    fight.restWindowState = "monster-rest";
    const service = new PassageSearchService(repo, fight as never, () => now);

    await expect(service.startSafePassageRestSearch(telegramUserId, {
      passage: "deep-left",
      currentLocationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_RIGHT
    })).resolves.toEqual({ state: "blocked", reason: "stale-location" });
    expect(repo.startCalls).toBe(0);
    expect(fight.restWindowCalls).toEqual([]);
    expect(fight.previewCalls).toBe(0);
  });

  it("reports node search availability from cooldown state", async () => {
    const repo = new FakePassageSearchRepository();
    const fight = new FakeFightService();
    const service = new PassageSearchService(repo, fight as never, () => now);
    repo.cooldowns.set(
      getCooldownKey(PASSAGE_SEARCH_NODE_DEEP_LEVEL1),
      new Date(now.getTime() + 60_000)
    );
    repo.cooldowns.set("passage-search:passage:deep-left", new Date(now.getTime() - 1));

    await expect(service.getNodeAvailability(telegramUserId, [
      PASSAGE_SEARCH_NODE_DEEP_LEVEL1,
      "passage:deep-left"
    ])).resolves.toMatchObject({
      [PASSAGE_SEARCH_NODE_DEEP_LEVEL1]: { searchAvailable: false },
      "passage:deep-left": { searchAvailable: true }
    });
  });

  it("keeps a safe passage-rest search safe even when the danger seed would hit", async () => {
    const repo = new FakePassageSearchRepository();
    const fight = new FakeFightService();
    const service = new PassageSearchService(repo, fight as never, () => now);
    repo.action = makeAction({
      token: "tok1",
      status: "running",
      endsAt: new Date(now.getTime() - 1),
      payload: {
        ...makeSnapshot(),
        nodeKey: "passage:deep-left",
        nodeKind: "passage",
        originLocationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT,
        passage: "deep-left",
        safeAtStart: true,
        dangerTier: 10,
        searchTier: 3
      }
    });

    const result = await service.checkSearch(telegramUserId, "tok1");

    expect(result.state).not.toBe("monster-attack");
    expect(fight.attackCalls).toHaveLength(0);
    expect(repo.action.result?.outcome).not.toBe("monster-attack");
  });

  it("replays stored Iskrokamin search loot with its canonical item name", async () => {
    const repo = new FakePassageSearchRepository();
    const fight = new FakeFightService();
    const service = new PassageSearchService(repo, fight as never, () => now);
    repo.action = makeAction({
      token: "iskro1",
      status: "resolved",
      endsAt: new Date(now.getTime() - 1),
      payload: makeSnapshot()
    });
    repo.action.result = {
      outcome: "loot",
      loot: {
        gold: 1,
        itemGrants: [{ itemId: "item.iskrokamin", quantity: 1 }]
      }
    };

    await expect(service.checkSearch(telegramUserId, "iskro1")).resolves.toMatchObject({
      state: "completed",
      achievementUnlocks: [],
      loot: {
        gold: 1,
        itemGrants: [{
          itemId: "item.iskrokamin",
          name: "Іскрокамінь",
          quantity: 1
        }]
      }
    });
  });

  it("tracks a natural fixture Iskrokamin only for the winning resolution and exposes its unlock", async () => {
    const repo = new FakePassageSearchRepository();
    const fight = new FakeFightService();
    const unlock = {
      id: "achievement.iskrokamin.first-owned",
      title: "Іскра в кишені",
      cosmeticTitleGrantId: null,
      unlockedAt: now
    };
    const trackEventSafely = vi.fn().mockResolvedValue([unlock]);
    const service = new PassageSearchService(
      repo,
      fight as never,
      () => now,
      { trackEventSafely } as never
    );

    await expect(service.devReset(telegramUserId, { nextLoot: "iskrokamin" })).resolves.toMatchObject({
      state: "cleared",
      nextLootFixture: "iskrokamin"
    });
    await expect(service.startDeepLevelOneSearch(telegramUserId, {
      currentLocationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1
    })).resolves.toMatchObject({ state: "started" });
    repo.action!.endsAt = new Date(now.getTime() - 1);

    const winner = await service.checkSearch(telegramUserId, repo.action!.token);
    const replay = await service.checkSearch(telegramUserId, repo.action!.token);

    expect(winner).toMatchObject({
      state: "completed",
      achievementUnlocks: [unlock],
      loot: {
        itemGrants: [{ itemId: "item.iskrokamin", quantity: 1 }]
      }
    });
    expect(replay).toMatchObject({ state: "completed", achievementUnlocks: [] });
    expect(trackEventSafely).toHaveBeenCalledTimes(1);
    expect(trackEventSafely).toHaveBeenCalledWith(expect.objectContaining({
      type: "item.received",
      characterId: "character-1",
      itemIds: ["item.iskrokamin"],
      sourceId: expect.any(String) as string
    }));
  });

  it("expands ordinary bandage quantities once and never tracks a concurrent loser", async () => {
    const repo = new FakePassageSearchRepository();
    const fight = new FakeFightService();
    const trackEventSafely = vi.fn().mockResolvedValue([]);
    const service = new PassageSearchService(
      repo,
      fight as never,
      () => now,
      { trackEventSafely } as never
    );
    repo.resolvedResultOverride = {
      outcome: "loot",
      loot: {
        gold: 0,
        itemGrants: [{ itemId: "item.responsible-panic-bandage", quantity: 2 }]
      }
    };
    repo.action = makeAction({
      token: "bandage1",
      status: "running",
      endsAt: new Date(now.getTime() - 1),
      payload: makeSnapshot()
    });

    await expect(service.checkSearch(telegramUserId, "bandage1")).resolves.toMatchObject({
      state: "completed",
      achievementUnlocks: []
    });
    expect(trackEventSafely).toHaveBeenCalledWith(expect.objectContaining({
      type: "item.received",
      itemIds: [
        "item.responsible-panic-bandage",
        "item.responsible-panic-bandage"
      ]
    }));

    trackEventSafely.mockClear();
    repo.action = makeAction({
      token: "iskroloser",
      status: "running",
      endsAt: new Date(now.getTime() - 1),
      payload: makeSnapshot()
    });
    repo.resolvedResultOverride = {
      outcome: "loot",
      loot: {
        gold: 0,
        itemGrants: [{ itemId: "item.iskrokamin", quantity: 1 }]
      }
    };
    repo.resolutionState = "already-handled";

    await expect(service.checkSearch(telegramUserId, "iskroloser")).resolves.toMatchObject({
      state: "completed",
      achievementUnlocks: []
    });
    expect(trackEventSafely).not.toHaveBeenCalled();
  });

  it("keeps risky danger tied to the frozen encounter and skips the first hero turn", async () => {
    const repo = new FakePassageSearchRepository();
    const fight = new FakeFightService();
    const service = new PassageSearchService(repo, fight as never, () => now);
    repo.action = makeAction({
      token: "tok1",
      status: "running",
      endsAt: new Date(now.getTime() - 1),
      payload: {
        ...makeSnapshot(),
        nodeKey: "passage:deep-left",
        nodeKind: "passage",
        originLocationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT,
        passage: "deep-left",
        encounterToken: "encounter13",
        safeAtStart: false,
        dangerTier: 10,
        searchTier: 3,
        monsterIdAtStart: "monster.deadline-spider",
        monsterNameAtStart: "Павук дедлайнів",
        monsterLevelAtStart: 3
      }
    });

    const result = await service.checkSearch(telegramUserId, "tok1");

    expect(result.state).toBe("monster-attack");
    expect(fight.attackCalls).toEqual([{
      token: "encounter13",
      callbackOriginLocationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT,
      currentLocationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT
    }]);
    expect(fight.turnCalls).toEqual([{ sessionId: "session-danger", turn: 1, action: "skip" }]);
    expect(repo.action.result).toEqual({
      outcome: "monster-attack",
      encounterToken: "encounter13",
      passage: "deep-left"
    });
  });
});

class FakePassageSearchRepository implements PassageSearchRepository {
  character = makeCharacter();
  action: PassageSearchActionRecord | null = null;
  runningAction: PassageSearchActionRecord | null = null;
  cooldowns = new Map<string, Date>();
  startCalls = 0;
  findRunningCalls = 0;
  resolutionState: "resolved" | "already-handled" = "resolved";
  resolvedResultOverride: PassageSearchStoredResult | null = null;

  startForTelegramUser(
    _telegramUserId: bigint,
    input: {
      now: Date;
      token: string;
      nodeKey: string;
      nodeKind: "passage" | "location";
      cooldownKey: string;
      cooldownAvailableAt: Date;
      snapshot: PassageSearchSnapshot;
    }
  ): Promise<PassageSearchStartResult> {
    this.startCalls += 1;
    this.action = makeAction({
      token: input.token,
      status: "running",
      endsAt: new Date(input.snapshot.endsAt),
      payload: input.snapshot
    });

    return Promise.resolve({ state: "started", character: this.character, action: this.action });
  }

  findByTokenForTelegramUser(): Promise<PassageSearchLookupResult> {
    const action = this.action ?? this.runningAction;

    return Promise.resolve(action
      ? { state: "found", character: this.character, action }
      : { state: "not-found", character: this.character });
  }

  findRunningForTelegramUser(): Promise<PassageSearchLookupResult> {
    this.findRunningCalls += 1;
    const action = this.runningAction ?? (this.action?.status === "running" ? this.action : null);

    return Promise.resolve(action
      ? { state: "found", character: this.character, action }
      : { state: "not-found", character: this.character });
  }

  listDueRunning(): Promise<DuePassageSearchActionRecord[]> {
    return Promise.resolve(this.action?.status === "running" && this.action.endsAt <= now
      ? [{ telegramUserId, action: this.action }]
      : []);
  }

  findCooldownsForTelegramUser(
    _telegramUserId: bigint,
    keys: readonly string[]
  ): Promise<Awaited<ReturnType<PassageSearchRepository["findCooldownsForTelegramUser"]>>> {
    return Promise.resolve({
      state: "found",
      character: this.character,
      cooldowns: keys
        .filter((key) => this.cooldowns.has(key))
        .map((key) => ({ key, availableAt: this.cooldowns.get(key)! }))
    });
  }

  recordNotificationTargetForTelegramUser(
    _telegramUserId: bigint,
    _token: string,
    input: { chatId: string }
  ): Promise<PassageSearchLookupResult> {
    if (!this.action) {
      return Promise.resolve({ state: "not-found", character: this.character });
    }

    this.action = {
      ...this.action,
      payload: {
        ...this.action.payload,
        notification: { chatId: input.chatId }
      }
    };

    return Promise.resolve({ state: "found", character: this.character, action: this.action });
  }

  clearSearchStateForTelegramUser(): Promise<{
    state: "cleared";
    character: CharacterRecord;
    actions: number;
    cooldowns: number;
  }> {
    const actions = this.action || this.runningAction ? 1 : 0;
    const cooldowns = this.cooldowns.size;
    this.action = null;
    this.runningAction = null;
    this.cooldowns.clear();

    return Promise.resolve({ state: "cleared", character: this.character, actions, cooldowns });
  }

  async cancelByTokenForTelegramUser(): Promise<PassageSearchResolutionResult> {
    return this.resolveByTokenForTelegramUser(telegramUserId, "token", {
      now,
      result: { outcome: "cancelled" }
    });
  }

  resolveByTokenForTelegramUser(
    _telegramUserId: bigint,
    _token: string,
    input: {
      now: Date;
      result: PassageSearchStoredResult;
      loot?: PassageSearchLoot;
    }
  ): Promise<PassageSearchResolutionResult> {
    if (!this.action) {
      return Promise.resolve({ state: "not-found", character: this.character });
    }

    const storedResult = this.resolvedResultOverride ?? input.result;
    this.action = {
      ...this.action,
      status: storedResult.outcome === "cancelled" ? "cancelled" : "resolved",
      result: storedResult,
      updatedAt: input.now
    };

    return Promise.resolve({
      state: this.resolutionState,
      character: this.character,
      action: this.action,
      ...(this.resolutionState === "resolved" ? { levelChange: null } : {})
    });
  }
}

class FakeFightService {
  overviewCalls = 0;
  previewCalls = 0;
  attackCalls: Array<{
    token: string;
    callbackOriginLocationId?: string;
    currentLocationId?: string;
  }> = [];
  turnCalls: Array<{ sessionId: string; turn: number; action: string }> = [];
  restWindowCalls: Array<{ originLocationId?: string }> = [];
  restWindowState: "persistent-ready" | "monster-rest" = "persistent-ready";

  getFightOverviewForTelegramUser() {
    this.overviewCalls += 1;
    return Promise.resolve({
      state: "persistent-ready",
      character: makeCharacterSummary(),
      questProgress: makeQuestProgress()
    });
  }

  previewPersistentFightForTelegramUser() {
    this.previewCalls += 1;
    return Promise.resolve({
      state: "persistent-preview",
      character: makeCharacterSummary(),
      questProgress: makeQuestProgress(),
      monster: {
        id: "monster.deadline-spider",
        name: "Павук дедлайнів",
        description: "",
        level: 3,
        tags: []
      },
      difficulty: "hard",
      originLocationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT,
      encounterToken: "encounter13",
      expiresAt: new Date(now.getTime() + 60_000)
    });
  }

  async getPassageSearchRestWindowForTelegramUser(
    _telegramUserId: bigint,
    options: { originLocationId?: string } = {}
  ) {
    this.restWindowCalls.push(options);
    if (this.restWindowState === "monster-rest") {
      return {
        state: "monster-rest",
        character: makeCharacterSummary(),
        questProgress: makeQuestProgress(),
        availableAt: new Date(now.getTime() + 60_000),
        now
      };
    }

    return this.getFightOverviewForTelegramUser();
  }

  attackPersistentPassageEncounterForTelegramUser(
    _telegramUserId: bigint,
    token: string,
    options: { callbackOriginLocationId?: string; currentLocationId?: string }
  ) {
    this.attackCalls.push({
      token,
      ...options
    });
    return Promise.resolve({
      state: "persistent-active",
      character: makeCharacterSummary(),
      questProgress: makeQuestProgress(),
      monster: { id: "monster.deadline-spider", name: "Павук дедлайнів", description: "", level: 3, tags: [] },
      session: {
        id: "session-danger",
        state: { turn: 1, status: "active" }
      },
      started: true
    });
  }

  resolvePersistentFightTurn(
    _telegramUserId: bigint,
    input: { sessionId: string; turn: number; action: string }
  ) {
    this.turnCalls.push(input);
    return Promise.resolve({ state: "updated" });
  }
}

function makeAction(input: {
  token: string;
  status: PassageSearchActionRecord["status"];
  endsAt: Date;
  payload: PassageSearchSnapshot;
}): PassageSearchActionRecord {
  return {
    id: `action-${input.token}`,
    token: input.token,
    characterId: "character-1",
    nodeKey: input.payload.nodeKey,
    nodeKind: input.payload.nodeKind,
    status: input.status,
    startedAt: new Date(input.payload.startedAt),
    endsAt: input.endsAt,
    payload: input.payload,
    result: null,
    createdAt: new Date(input.payload.startedAt),
    updatedAt: new Date(input.payload.startedAt)
  };
}

function makeSnapshot(): PassageSearchSnapshot {
  return {
    nodeKey: "location:descent-to-nyz",
    nodeKind: "location",
    originLocationId: PRESENCE_LOCATION_KORCHMA_DEEP,
    durationMs: 23_000,
    safeAtStart: true,
    dangerTier: 0,
    searchTier: 0,
    playerLuckSnapshot: 0,
    startedAt: new Date(now.getTime() - 60_000).toISOString(),
    endsAt: new Date(now.getTime() - 1).toISOString()
  };
}

function makeCharacter(): CharacterRecord {
  return {
    id: "character-1",
    userId: "user-1",
    name: "Тестик",
    pronoun: "they",
    path: "boundary",
    raceId: "race.human",
    classId: "class.warrior",
    level: 4,
    xp: 120,
    gold: 13,
    hpCurrent: 23,
    hpMax: 23,
    manaCurrent: 10,
    manaMax: 10,
    statsJson: { strength: 3, dexterity: 2, intelligence: 1, charisma: 1, luck: 0 },
    remortCount: 0
  };
}

function makeCharacterSummary() {
  return {
    name: "Тестик",
    pronoun: "they",
    pronounLabel: "вони",
    path: { id: "boundary", name: "Межа" },
    raceId: "race.human",
    raceName: "Людисько",
    classId: "class.warrior",
    className: "Вояка",
    title: "Тестовий пригодник",
    level: 4,
    xp: 120,
    nextLevelXp: 200,
    xpToNextLevel: 80,
    gold: 13,
    hpCurrent: 23,
    hpMax: 23,
    manaCurrent: 10,
    manaMax: 10,
    stats: { strength: 3, dexterity: 2, intelligence: 1, charisma: 1, luck: 0 },
    levelBonus: { stats: { strength: 0, dexterity: 0, intelligence: 0, charisma: 0, luck: 0 }, hpMax: 0, manaMax: 0 }
  };
}

function makeQuestProgress() {
  return {
    stageId: "13",
    title: "Тринадцять дрібних проблем",
    wins: 0,
    target: 13,
    completed: false,
    rewardClaimed: false,
    issued: true,
    branchComplete: false
  };
}
