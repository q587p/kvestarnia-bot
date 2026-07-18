import type { Bot } from "grammy";
import { describe, expect, it, vi } from "vitest";
import { createPassageSearchCompletionScheduler } from "../../src/bot/passageSearchCompletionScheduler";
import type { PassageSearchActionRecord } from "../../src/db/repositories/passageSearchRepository";
import type { SoloCombatSessionRecord } from "../../src/db/repositories/soloCombatSessionRepository";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";
import type { PassageSearchCheckResult } from "../../src/services/passageSearchService";

describe("passage search completion scheduler", () => {
  it("sends one completion message for a due running search with a chat target", async () => {
    const action = makeAction({ chatId: "42" });
    const result = completedResult(action);
    const passageSearch = {
      listDueRunningSearches: vi.fn()
        .mockResolvedValueOnce([{ telegramUserId: 42587n, action }])
        .mockResolvedValue([]),
      resolveDueSearch: vi.fn().mockResolvedValue(result)
    };
    const { bot, sendMessage } = fakeBot();
    const scheduler = createPassageSearchCompletionScheduler(
      { passageSearch: passageSearch as never, fight: {} as never },
      bot,
      { intervalMs: 60_000 }
    );

    scheduler.start();

    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
    scheduler.stop();

    expect(passageSearch.resolveDueSearch).toHaveBeenCalledWith(42587n, "tok1");
    expect(sendMessage.mock.calls[0]?.[0]).toBe("42");
    expect(sendMessage.mock.calls[0]?.[1]).toContain("Щось знайшлося");
    expect(sendMessage.mock.calls[0]?.[2]).toEqual({ parse_mode: "HTML" });
  });

  it("sends Passage Search achievement unlocks after the scheduled completion card", async () => {
    const action = makeAction({ chatId: "42" });
    const result = completedResult(action, [{
      id: "achievement.iskrokamin.first-owned",
      title: "Іскра в кишені",
      cosmeticTitleGrantId: null,
      unlockedAt: new Date("2026-06-27T09:00:42.000Z")
    }]);
    const passageSearch = {
      listDueRunningSearches: vi.fn()
        .mockResolvedValueOnce([{ telegramUserId: 42587n, action }])
        .mockResolvedValue([]),
      resolveDueSearch: vi.fn().mockResolvedValue(result)
    };
    const { bot, sendMessage } = fakeBot();
    const scheduler = createPassageSearchCompletionScheduler(
      { passageSearch: passageSearch as never, fight: {} as never },
      bot,
      { intervalMs: 60_000 }
    );

    scheduler.start();

    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(2));
    scheduler.stop();

    expect(sendMessage.mock.calls[0]?.[1]).toContain("Щось знайшлося");
    expect(sendMessage.mock.calls[1]?.[1]).toContain("Іскра в кишені");
    expect(sendMessage.mock.calls[1]?.[2]).toEqual({ parse_mode: "HTML" });
  });

  it("does not resolve a due search without a chat target", async () => {
    const action = makeAction();
    const passageSearch = {
      listDueRunningSearches: vi.fn().mockResolvedValue([{ telegramUserId: 42587n, action }]),
      resolveDueSearch: vi.fn()
    };
    const { bot, sendMessage } = fakeBot();
    const scheduler = createPassageSearchCompletionScheduler(
      { passageSearch: passageSearch as never, fight: {} as never },
      bot,
      { intervalMs: 60_000 }
    );

    scheduler.start();

    await vi.waitFor(() => expect(passageSearch.listDueRunningSearches).toHaveBeenCalled());
    scheduler.stop();

    expect(passageSearch.resolveDueSearch).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("sends the fight intro before a monster-attack fight card", async () => {
    const action = makeAction({ chatId: "42" });
    const result = monsterAttackResult(action);
    const passageSearch = {
      listDueRunningSearches: vi.fn()
        .mockResolvedValueOnce([{ telegramUserId: 42587n, action }])
        .mockResolvedValue([]),
      resolveDueSearch: vi.fn().mockResolvedValue(result)
    };
    const fight = {
      recordPersistentFightMessageReference: vi.fn().mockResolvedValue(undefined)
    };
    const { bot, sendMessage } = fakeBot();
    const scheduler = createPassageSearchCompletionScheduler(
      { passageSearch: passageSearch as never, fight: fight as never },
      bot,
      { intervalMs: 60_000 }
    );

    scheduler.start();

    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(3));
    scheduler.stop();

    expect(sendMessage.mock.calls[0]?.[1]).toContain("Пошук образив місцевого мешканця");
    expect(sendMessage.mock.calls[1]?.[1]).toContain("Хтось у Низу сказав «та він один»");
    expect(sendMessage.mock.calls[1]?.[1]).toContain("Натиск Низу:");
    expect(sendMessage.mock.calls[1]?.[1]).toContain("Перший Довжелезний Мешканець");
    expect(sendMessage.mock.calls[1]?.[1]).toContain("Другий Капосний Мешканець");
    expect(sendMessage.mock.calls[1]?.[1]).toContain("<i>Порада дня:");
    expect(sendMessage.mock.calls[2]?.[1]).toContain("що робимо?");
    expect(sendMessage.mock.calls[2]?.[2] as { parse_mode?: string }).toMatchObject({ parse_mode: "HTML" });
    expect(sendMessage.mock.calls[2]?.[2]).toHaveProperty("reply_markup");
    expect(fight.recordPersistentFightMessageReference).toHaveBeenCalledWith(
      42587n,
      "session-danger",
      { chatId: "42", messageId: 587 }
    );
  });
});

function fakeBot(): { bot: Bot; sendMessage: ReturnType<typeof vi.fn> } {
  const sendMessage = vi.fn(() => Promise.resolve({ message_id: 587 }));

  return {
    bot: {
      api: { sendMessage }
    } as unknown as Bot,
    sendMessage
  };
}

function completedResult(
  action: PassageSearchActionRecord,
  achievementUnlocks: Extract<PassageSearchCheckResult, { state: "completed" }>["achievementUnlocks"] = []
): PassageSearchCheckResult {
  return {
    state: "completed",
    character,
    action,
    achievementUnlocks,
    loot: {
      gold: 1,
      itemGrants: []
    }
  };
}

function monsterAttackResult(action: PassageSearchActionRecord): PassageSearchCheckResult {
  return {
    state: "monster-attack",
    character,
    action,
    fight: {
      state: "persistent-active",
      started: true,
      character,
      session: persistentSession(),
      monster: {
        id: "monster.first",
        name: "Перший Довжелезний Мешканець",
        description: "Тестовий мешканець Низу.",
        level: 4,
        tags: ["test"]
      },
      questProgress: null
    }
  };
}

function persistentSession(): SoloCombatSessionRecord {
  return {
    id: "session-danger",
    characterId: "character-1",
    monsterId: "monster.first",
    status: "active",
    turn: 2,
    state: {
      id: "session-danger",
      turn: 2,
      status: "active",
      hero: {
        hp: 21,
        hpMax: 23,
        mana: 10,
        manaMax: 10
      },
      monster: {
        id: "monster.first",
        name: "Перший Довжелезний Мешканець",
        level: 4,
        hp: 18,
        hpMax: 18
      },
      enemies: [
        {
          enemyId: "enemy:1",
          monsterId: "monster.first",
          name: "Перший Довжелезний Мешканець",
          level: 4,
          hp: 18,
          hpMax: 18
        },
        {
          enemyId: "enemy:2",
          monsterId: "monster.second",
          name: "Другий Капосний Мешканець",
          level: 6,
          hp: 20,
          hpMax: 20
        }
      ],
      threat: {
        version: 1,
        enemyCount: 2,
        reason: "ordinary-win-streak",
        eligibleWins: 3,
        lineId: "one-hero-invitation",
        lineVersion: "threat-escalation-v1",
        pressure: {
          version: 1,
          consecutiveWonEscalatedFights: 1,
          requestedSecondEnemyLevelBonus: 2,
          appliedSecondEnemyLevelBonus: 2,
          boostedEnemyId: "enemy:2",
          boostedEnemyEffectiveLevel: 6,
          levelCap: 23
        }
      }
    },
    reward: null,
    createdAt: new Date("2026-06-27T09:00:42.000Z"),
    updatedAt: new Date("2026-06-27T09:00:42.000Z"),
    expiresAt: new Date("2026-06-27T09:23:42.000Z")
  };
}

function makeAction(input: { chatId?: string } = {}): PassageSearchActionRecord {
  const payload = {
    nodeKey: "passage:deep-left",
    nodeKind: "passage" as const,
    originLocationId: "location.korchma.deep.level1.left",
    passage: "deep-left" as const,
    durationMs: 42_000,
    safeAtStart: true,
    dangerTier: 0,
    searchTier: 3,
    playerLuckSnapshot: 0,
    ...(input.chatId ? { notification: { chatId: input.chatId } } : {}),
    startedAt: "2026-06-27T09:00:00.000Z",
    endsAt: "2026-06-27T09:00:42.000Z"
  };

  return {
    id: "action-1",
    token: "tok1",
    characterId: "character-1",
    nodeKey: payload.nodeKey,
    nodeKind: payload.nodeKind,
    status: "running",
    startedAt: new Date(payload.startedAt),
    endsAt: new Date(payload.endsAt),
    payload,
    result: null,
    createdAt: new Date(payload.startedAt),
    updatedAt: new Date(payload.startedAt)
  };
}

const character: CharacterSummary = {
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
