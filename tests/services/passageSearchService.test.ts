import { describe, expect, it } from "vitest";
import type {
  PassageSearchActionRecord,
  PassageSearchLookupResult,
  PassageSearchRepository,
  PassageSearchResolutionResult,
  PassageSearchStartResult,
  PassageSearchStoredResult
} from "../../src/db/repositories/passageSearchRepository";
import type { CharacterRecord } from "../../src/db/repositories/characterRepository";
import type { PassageSearchLoot, PassageSearchSnapshot } from "../../src/domain/passageSearch";
import { PassageSearchService } from "../../src/services/passageSearchService";
import {
  PRESENCE_LOCATION_KORCHMA_DEEP,
  PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1,
  PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT,
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
  startCalls = 0;

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
    return Promise.resolve(this.action
      ? { state: "found", character: this.character, action: this.action }
      : { state: "not-found", character: this.character });
  }

  findRunningForTelegramUser(): Promise<PassageSearchLookupResult> {
    return Promise.resolve(this.action?.status === "running"
      ? { state: "found", character: this.character, action: this.action }
      : { state: "not-found", character: this.character });
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

    this.action = {
      ...this.action,
      status: input.result.outcome === "cancelled" ? "cancelled" : "resolved",
      result: input.result,
      updatedAt: input.now
    };

    return Promise.resolve({
      state: "resolved",
      character: this.character,
      action: this.action,
      levelChange: null
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

  async getPassageSearchRestWindowForTelegramUser() {
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
