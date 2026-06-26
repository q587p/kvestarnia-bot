import type { Bot } from "grammy";
import { describe, expect, it, vi } from "vitest";
import { createPassageSearchCompletionScheduler } from "../../src/bot/passageSearchCompletionScheduler";
import type { PassageSearchActionRecord } from "../../src/db/repositories/passageSearchRepository";
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

function completedResult(action: PassageSearchActionRecord): PassageSearchCheckResult {
  return {
    state: "completed",
    character,
    action,
    loot: {
      gold: 1,
      itemGrants: []
    }
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
