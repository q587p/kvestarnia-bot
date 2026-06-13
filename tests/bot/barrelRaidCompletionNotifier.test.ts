import type { Bot } from "grammy";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildBarrelRaidCompletionKey,
  createBarrelRaidCompletionScheduler
} from "../../src/bot/barrelRaidCompletionNotifier";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";
import type { TavernRaidResult, TavernRaidService } from "../../src/services/tavernRaidService";

interface SendMessageOptions {
  parse_mode?: string;
  reply_markup?: {
    inline_keyboard?: unknown;
  };
}

describe("barrel raid completion notifier", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("schedules at most one completion notification per chat, user, and period", async () => {
    vi.useFakeTimers();
    const sendMessage = vi.fn(() => Promise.resolve(true));
    const completeFridayBarrelRaid = vi.fn(() => Promise.resolve(completedResult()));
    const scheduler = createBarrelRaidCompletionScheduler();
    const input = scheduleInput(sendMessage, completeFridayBarrelRaid);

    expect(scheduler.schedule(input)).toBe(true);
    expect(scheduler.schedule(input)).toBe(false);
    expect(scheduler.pendingCount()).toBe(1);
    expect(scheduler.has(input)).toBe(true);

    await vi.advanceTimersByTimeAsync(60_000);

    expect(completeFridayBarrelRaid).toHaveBeenCalledTimes(1);
    expect(completeFridayBarrelRaid).toHaveBeenCalledWith(42n, "2026-06-13T10:23");
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0]?.[0]).toBe(42);
    expect(sendMessage.mock.calls[0]?.[1]).toContain("Рейд завершено");
    expect((sendMessage.mock.calls[0]?.[2] as SendMessageOptions | undefined)?.parse_mode).toBe(
      "HTML"
    );
    expect(
      Array.isArray(
        (sendMessage.mock.calls[0]?.[2] as SendMessageOptions | undefined)?.reply_markup
          ?.inline_keyboard
      )
    ).toBe(true);
    expect(scheduler.pendingCount()).toBe(0);
    expect(scheduler.has(input)).toBe(false);
  });

  it.each([
    {
      name: "already-completed",
      result: {
        state: "already-completed",
        character,
        reward: {
          xp: 7,
          gold: 5,
          localDate: "2026-06-13T10:23",
          itemGrants: []
        },
        levelChange: null
      } satisfies TavernRaidResult
    },
    {
      name: "pending",
      result: {
        state: "pending",
        character,
        availableAt: new Date("2026-06-13T10:40:00.000Z"),
        now: new Date("2026-06-13T10:31:00.000Z"),
        periodId: "2026-06-13T10:23"
      } satisfies TavernRaidResult
    },
    {
      name: "audit-break",
      result: {
        state: "audit-break",
        character,
        now: new Date("2026-06-13T04:30:00.000Z"),
        nextAvailableAt: new Date("2026-06-13T08:23:00.000Z")
      } satisfies TavernRaidResult
    },
    {
      name: "no-character",
      result: {
        state: "no-character"
      } satisfies TavernRaidResult
    }
  ])("does not send a misleading completion message for $name", async ({ result }) => {
    vi.useFakeTimers();
    const sendMessage = vi.fn(() => Promise.resolve(true));
    const completeFridayBarrelRaid = vi.fn(() => Promise.resolve(result));
    const scheduler = createBarrelRaidCompletionScheduler();

    scheduler.schedule(scheduleInput(sendMessage, completeFridayBarrelRaid));
    await vi.advanceTimersByTimeAsync(60_000);

    expect(completeFridayBarrelRaid).toHaveBeenCalledTimes(1);
    expect(sendMessage).not.toHaveBeenCalled();
    expect(scheduler.pendingCount()).toBe(0);
  });

  it("does not schedule without a chat id", () => {
    const scheduler = createBarrelRaidCompletionScheduler();

    expect(
      scheduler.schedule({
        ...scheduleInput(vi.fn(), vi.fn()),
        chatId: undefined
      })
    ).toBe(false);
    expect(scheduler.pendingCount()).toBe(0);
  });

  it("builds a stable notification scope key", () => {
    expect(
      buildBarrelRaidCompletionKey({
        chatId: 42,
        telegramUserId: 42n,
        periodId: "2026-06-13T10:23"
      })
    ).toBe("42:42:2026-06-13T10:23");
  });
});

const character: CharacterSummary = {
  name: "Мандрівник",
  pronoun: "they",
  pronounLabel: "Вони",
  path: "boundary",
  raceId: "race.human-ish",
  raceName: "Людисько",
  classId: "class.warrior",
  className: "Воїн",
  title: "Пересічні Пригодники",
  level: 1,
  xp: 0,
  nextLevelXp: 10,
  xpToNextLevel: 10,
  gold: 0,
  hpCurrent: 20,
  hpMax: 20,
  manaCurrent: 10,
  manaMax: 10,
  stats: {
    strength: 8,
    dexterity: 6,
    intelligence: 6,
    charisma: 6,
    luck: 6
  },
  levelBonus: {
    hpMax: 0,
    manaMax: 0,
    primaryStat: {
      stat: "strength",
      bonus: 0
    }
  }
};

function completedResult(): Extract<TavernRaidResult, { state: "completed" }> {
  return {
    state: "completed",
    character,
    reward: {
      xp: 7,
      gold: 5,
      localDate: "2026-06-13T10:23",
      itemGrants: []
    },
    levelChange: {
      oldLevel: 1,
      newLevel: 1,
      leveledUp: false
    }
  };
}

function scheduleInput(
  sendMessage: ReturnType<typeof vi.fn>,
  completeFridayBarrelRaid: ReturnType<typeof vi.fn>
) {
  return {
    bot: {
      api: {
        sendMessage
      }
    } as unknown as Bot,
    chatId: 42,
    telegramUserId: 42n,
    periodId: "2026-06-13T10:23",
    availableAt: new Date("2026-06-13T10:31:00.000Z"),
    now: new Date("2026-06-13T10:30:00.000Z"),
    tavernRaidService: {
      completeFridayBarrelRaid
    } as unknown as Pick<TavernRaidService, "completeFridayBarrelRaid">
  };
}
