import type { Bot } from "grammy";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildBarrelRaidCompletionKey,
  createBarrelRaidCompletionScheduler
} from "../../src/bot/barrelRaidCompletionNotifier";
import type {
  BarrelRaidNotificationRecord,
  BarrelRaidNotificationRepository
} from "../../src/db/repositories/barrelRaidNotificationRepository";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";
import type { BarrelBeerTutorialService } from "../../src/services/barrelBeerTutorialService";
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
    const barrelBeerTutorialService = barrelTutorialProgressService();
    const scheduler = createBarrelRaidCompletionScheduler();
    const input = {
      ...scheduleInput(sendMessage, completeFridayBarrelRaid),
      barrelBeerTutorialService
    };

    expect(scheduler.schedule(input)).toBe(true);
    expect(scheduler.schedule(input)).toBe(false);
    expect(scheduler.pendingCount()).toBe(1);
    expect(scheduler.has(input)).toBe(true);

    await vi.advanceTimersByTimeAsync(60_000);

    expect(completeFridayBarrelRaid).toHaveBeenCalledTimes(1);
    expect(completeFridayBarrelRaid).toHaveBeenCalledWith(42n, "2026-06-13T10:23");
    expect(barrelBeerTutorialService.markVisitedBarrelForTelegramUser).toHaveBeenCalledWith(42n);
    expect(barrelBeerTutorialService.markBarrelRaidCompletedForTelegramUser).toHaveBeenCalledWith(42n);
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
        now: new Date("2026-06-13T00:30:00.000Z"),
        nextAvailableAt: new Date("2026-06-13T04:00:00.000Z")
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
    const barrelBeerTutorialService = barrelTutorialProgressService();
    const scheduler = createBarrelRaidCompletionScheduler();

    scheduler.schedule({
      ...scheduleInput(sendMessage, completeFridayBarrelRaid),
      barrelBeerTutorialService
    });
    await vi.advanceTimersByTimeAsync(60_000);

    expect(completeFridayBarrelRaid).toHaveBeenCalledTimes(1);
    expect(barrelBeerTutorialService.markVisitedBarrelForTelegramUser).not.toHaveBeenCalled();
    expect(barrelBeerTutorialService.markBarrelRaidCompletedForTelegramUser).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
    expect(scheduler.pendingCount()).toBe(0);
  });

  it("keeps the pending key and retries when Telegram send fails after completion", async () => {
    vi.useFakeTimers();
    const logger = { error: vi.fn() };
    const sendMessage = vi
      .fn()
      .mockRejectedValueOnce(new Error("telegram down"))
      .mockResolvedValueOnce(true);
    const completeFridayBarrelRaid = vi.fn(() => Promise.resolve(completedResult()));
    const scheduler = createBarrelRaidCompletionScheduler({
      retryDelayMs: 100,
      maxAttempts: 2,
      logger
    });
    const input = scheduleInput(sendMessage, completeFridayBarrelRaid);

    expect(scheduler.schedule(input)).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(scheduler.pendingCount()).toBe(1);
    expect(scheduler.has(input)).toBe(true);
    expect(completeFridayBarrelRaid).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(100);

    expect(completeFridayBarrelRaid).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(scheduler.pendingCount()).toBe(0);
    expect(scheduler.has(input)).toBe(false);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it("retries the completion path when the service throws before returning a result", async () => {
    vi.useFakeTimers();
    const logger = { error: vi.fn() };
    const sendMessage = vi.fn(() => Promise.resolve(true));
    const completeFridayBarrelRaid = vi
      .fn()
      .mockRejectedValueOnce(new Error("db blink"))
      .mockResolvedValueOnce(completedResult());
    const scheduler = createBarrelRaidCompletionScheduler({
      retryDelayMs: 100,
      maxAttempts: 2,
      logger
    });

    scheduler.schedule(scheduleInput(sendMessage, completeFridayBarrelRaid));
    await vi.advanceTimersByTimeAsync(60_000);

    expect(scheduler.pendingCount()).toBe(1);
    expect(completeFridayBarrelRaid).toHaveBeenCalledTimes(1);
    expect(sendMessage).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(100);

    expect(completeFridayBarrelRaid).toHaveBeenCalledTimes(2);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(scheduler.pendingCount()).toBe(0);
    expect(logger.error).toHaveBeenCalledTimes(1);
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

  it("resumes future durable pending notifications on startup", async () => {
    vi.useFakeTimers();
    const notifications = new FakeBarrelRaidNotificationRepository([
      notificationRecord({
        availableAt: new Date("2026-06-13T10:31:00.000Z")
      })
    ]);
    const scheduler = createBarrelRaidCompletionScheduler();

    await expect(scheduler.resumePending({
      bot: botWithSendMessage(vi.fn()),
      now: new Date("2026-06-13T10:30:00.000Z"),
      tavernRaidService: {
        completeFridayBarrelRaid: vi.fn()
      },
      notifications
    })).resolves.toBe(1);

    expect(scheduler.pendingCount()).toBe(1);
  });

  it("claims a due durable notification and marks it sent after one completion message", async () => {
    vi.useFakeTimers();
    const sendMessage = vi.fn(() => Promise.resolve(true));
    const completeFridayBarrelRaid = vi.fn(() => Promise.resolve(completedResult()));
    const notifications = new FakeBarrelRaidNotificationRepository([
      notificationRecord({
        availableAt: new Date("2026-06-13T10:30:00.000Z")
      })
    ]);
    const scheduler = createBarrelRaidCompletionScheduler();

    await scheduler.resumePending({
      bot: botWithSendMessage(sendMessage),
      now: new Date("2026-06-13T10:30:00.000Z"),
      tavernRaidService: {
        completeFridayBarrelRaid
      },
      notifications
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(completeFridayBarrelRaid).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(notifications.get("notification-1")?.status).toBe("sent");

    const duplicate = createBarrelRaidCompletionScheduler();
    await duplicate.resumePending({
      bot: botWithSendMessage(sendMessage),
      now: new Date("2026-06-13T10:32:00.000Z"),
      tavernRaidService: {
        completeFridayBarrelRaid
      },
      notifications
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("recovers stale processing notifications on startup", async () => {
    vi.useFakeTimers();
    const sendMessage = vi.fn(() => Promise.resolve(true));
    const completeFridayBarrelRaid = vi.fn(() => Promise.resolve(completedResult()));
    const notifications = new FakeBarrelRaidNotificationRepository([
      notificationRecord({
        status: "processing",
        processingStartedAt: new Date("2026-06-13T10:00:00.000Z"),
        availableAt: new Date("2026-06-13T10:30:00.000Z")
      })
    ]);
    const scheduler = createBarrelRaidCompletionScheduler({
      processingLeaseMs: 10 * 60_000
    });

    await expect(scheduler.resumePending({
      bot: botWithSendMessage(sendMessage),
      now: new Date("2026-06-13T10:30:00.000Z"),
      tavernRaidService: {
        completeFridayBarrelRaid
      },
      notifications
    })).resolves.toBe(1);
    await vi.advanceTimersByTimeAsync(0);

    expect(completeFridayBarrelRaid).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(notifications.get("notification-1")?.status).toBe("sent");
  });

  it("recovers stale processing delivery after notification-owned reward claim", async () => {
    vi.useFakeTimers();
    const sendMessage = vi.fn(() => Promise.resolve(true));
    const completeFridayBarrelRaid = vi.fn(() =>
      Promise.resolve({
        state: "already-completed",
        character,
        reward: {
          xp: 7,
          gold: 5,
          localDate: "2026-06-13T10:23",
          itemGrants: []
        },
        levelChange: null
      } satisfies TavernRaidResult)
    );
    const notifications = new FakeBarrelRaidNotificationRepository([
      notificationRecord({
        status: "processing",
        processingStartedAt: new Date("2026-06-13T10:00:00.000Z"),
        rewardClaimedAt: new Date("2026-06-13T10:01:00.000Z"),
        availableAt: new Date("2026-06-13T10:30:00.000Z")
      })
    ]);
    const scheduler = createBarrelRaidCompletionScheduler({
      processingLeaseMs: 10 * 60_000
    });

    await scheduler.resumePending({
      bot: botWithSendMessage(sendMessage),
      now: new Date("2026-06-13T10:30:00.000Z"),
      tavernRaidService: {
        completeFridayBarrelRaid
      },
      notifications
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(completeFridayBarrelRaid).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0]?.[1]).toContain("Рейд завершено");
    expect(notifications.get("notification-1")?.status).toBe("sent");
  });

  it("does not steal fresh processing notifications on startup", async () => {
    vi.useFakeTimers();
    const sendMessage = vi.fn(() => Promise.resolve(true));
    const completeFridayBarrelRaid = vi.fn(() => Promise.resolve(completedResult()));
    const notifications = new FakeBarrelRaidNotificationRepository([
      notificationRecord({
        status: "processing",
        processingStartedAt: new Date("2026-06-13T10:29:00.000Z"),
        availableAt: new Date("2026-06-13T10:30:00.000Z")
      })
    ]);
    const scheduler = createBarrelRaidCompletionScheduler({
      processingLeaseMs: 10 * 60_000
    });

    await expect(scheduler.resumePending({
      bot: botWithSendMessage(sendMessage),
      now: new Date("2026-06-13T10:30:00.000Z"),
      tavernRaidService: {
        completeFridayBarrelRaid
      },
      notifications
    })).resolves.toBe(0);
    await vi.advanceTimersByTimeAsync(0);

    expect(completeFridayBarrelRaid).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
    expect(notifications.get("notification-1")?.status).toBe("processing");
  });

  it("does not let duplicate schedulers send the same durable notification twice", async () => {
    vi.useFakeTimers();
    const sendMessage = vi.fn(() => Promise.resolve(true));
    const completeFridayBarrelRaid = vi.fn(() => Promise.resolve(completedResult()));
    const notifications = new FakeBarrelRaidNotificationRepository([
      notificationRecord({
        availableAt: new Date("2026-06-13T10:30:00.000Z")
      })
    ]);
    const first = createBarrelRaidCompletionScheduler();
    const second = createBarrelRaidCompletionScheduler();
    const resumeInput = {
      bot: botWithSendMessage(sendMessage),
      now: new Date("2026-06-13T10:30:00.000Z"),
      tavernRaidService: {
        completeFridayBarrelRaid
      },
      notifications
    };

    await expect(first.resumePending(resumeInput)).resolves.toBe(1);
    await expect(second.resumePending(resumeInput)).resolves.toBe(1);
    await vi.advanceTimersByTimeAsync(0);

    expect(completeFridayBarrelRaid).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(notifications.get("notification-1")?.status).toBe("sent");
  });

  it("skips durable notification when manual completion already claimed the raid", async () => {
    vi.useFakeTimers();
    const sendMessage = vi.fn(() => Promise.resolve(true));
    const completeFridayBarrelRaid = vi.fn(() => Promise.resolve({
      state: "already-completed",
      character,
      reward: {
        xp: 7,
        gold: 5,
        localDate: "2026-06-13T10:23",
        itemGrants: []
      },
      levelChange: null
    } satisfies TavernRaidResult));
    const notifications = new FakeBarrelRaidNotificationRepository([
      notificationRecord({
        availableAt: new Date("2026-06-13T10:30:00.000Z")
      })
    ]);
    const scheduler = createBarrelRaidCompletionScheduler();

    await scheduler.resumePending({
      bot: botWithSendMessage(sendMessage),
      now: new Date("2026-06-13T10:30:00.000Z"),
      tavernRaidService: {
        completeFridayBarrelRaid
      },
      notifications
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(sendMessage).not.toHaveBeenCalled();
    expect(notifications.get("notification-1")?.status).toBe("skipped");
  });

  it("retries delivery after Telegram send fails following a fresh reward claim", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-13T10:30:00.000Z"));
    const sendMessage = vi
      .fn()
      .mockRejectedValueOnce(new Error("telegram down"))
      .mockResolvedValueOnce(true);
    const completeFridayBarrelRaid = vi
      .fn()
      .mockResolvedValueOnce(completedResult())
      .mockResolvedValueOnce({
        state: "already-completed",
        character,
        reward: {
          xp: 7,
          gold: 5,
          localDate: "2026-06-13T10:23",
          itemGrants: []
        },
        levelChange: null
      } satisfies TavernRaidResult);
    const notifications = new FakeBarrelRaidNotificationRepository([
      notificationRecord({
        availableAt: new Date("2026-06-13T10:30:00.000Z")
      })
    ]);
    const barrelBeerTutorialService = barrelTutorialProgressService();
    const scheduler = createBarrelRaidCompletionScheduler({
      maxAttempts: 1,
      logger: { error: vi.fn() }
    });

    await scheduler.resumePending({
      bot: botWithSendMessage(sendMessage),
      now: new Date("2026-06-13T10:30:00.000Z"),
      tavernRaidService: {
        completeFridayBarrelRaid
      },
      barrelBeerTutorialService,
      notifications
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(barrelBeerTutorialService.markVisitedBarrelForTelegramUser).toHaveBeenCalledTimes(1);
    expect(barrelBeerTutorialService.markBarrelRaidCompletedForTelegramUser).toHaveBeenCalledTimes(1);
    expect(notifications.get("notification-1")?.status).toBe("pending");
    expect(notifications.get("notification-1")?.rewardClaimedAt).toEqual(
      new Date("2026-06-13T10:30:00.000Z")
    );
    expect(notifications.get("notification-1")?.lastError).toBe("telegram down");

    const retryScheduler = createBarrelRaidCompletionScheduler({
      maxAttempts: 1,
      logger: { error: vi.fn() }
    });
    await retryScheduler.resumePending({
      bot: botWithSendMessage(sendMessage),
      now: new Date("2026-06-13T10:31:00.000Z"),
      tavernRaidService: {
        completeFridayBarrelRaid
      },
      barrelBeerTutorialService,
      notifications
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(completeFridayBarrelRaid).toHaveBeenCalledTimes(2);
    expect(barrelBeerTutorialService.markVisitedBarrelForTelegramUser).toHaveBeenCalledTimes(2);
    expect(barrelBeerTutorialService.markBarrelRaidCompletedForTelegramUser).toHaveBeenCalledTimes(2);
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage.mock.calls[1]?.[1]).toContain("Рейд завершено");
    expect(notifications.get("notification-1")?.status).toBe("sent");
  });

  it("keeps level-up celebration failure non-blocking for durable notification delivery", async () => {
    vi.useFakeTimers();
    const sendMessage = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error("celebration down"));
    const completeFridayBarrelRaid = vi.fn(() =>
      Promise.resolve({
        ...completedResult(),
        levelChange: {
          oldLevel: 1,
          newLevel: 2,
          leveledUp: true
        }
      } satisfies Extract<TavernRaidResult, { state: "completed" }>)
    );
    const notifications = new FakeBarrelRaidNotificationRepository([
      notificationRecord({
        availableAt: new Date("2026-06-13T10:30:00.000Z")
      })
    ]);
    const scheduler = createBarrelRaidCompletionScheduler({
      logger: { error: vi.fn() }
    });

    await scheduler.resumePending({
      bot: botWithSendMessage(sendMessage),
      now: new Date("2026-06-13T10:30:00.000Z"),
      tavernRaidService: {
        completeFridayBarrelRaid
      },
      notifications
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(notifications.get("notification-1")?.status).toBe("sent");
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

function botWithSendMessage(sendMessage: ReturnType<typeof vi.fn>): Bot {
  return {
    api: {
      sendMessage
    }
  } as unknown as Bot;
}

function barrelTutorialProgressService(): Pick<
  BarrelBeerTutorialService,
  "markVisitedBarrelForTelegramUser" | "markBarrelRaidCompletedForTelegramUser"
> {
  return {
    markVisitedBarrelForTelegramUser: vi.fn(() => Promise.resolve()),
    markBarrelRaidCompletedForTelegramUser: vi.fn(() => Promise.resolve())
  };
}

function notificationRecord(
  overrides: Partial<BarrelRaidNotificationRecord> = {}
): BarrelRaidNotificationRecord {
  const now = new Date("2026-06-13T10:30:00.000Z");

  return {
    id: "notification-1",
    characterId: "character-42",
    telegramUserId: 42n,
    chatId: 42n,
    periodId: "2026-06-13T10:23",
    availableAt: now,
    status: "pending",
    processingStartedAt: null,
    rewardClaimedAt: null,
    sentAt: null,
    skippedAt: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

class FakeBarrelRaidNotificationRepository implements BarrelRaidNotificationRepository {
  private readonly records = new Map<string, BarrelRaidNotificationRecord>();

  constructor(records: BarrelRaidNotificationRecord[]) {
    for (const record of records) {
      this.records.set(record.id, structuredCloneNotification(record));
    }
  }

  upsertPendingForTelegramUser(): Promise<BarrelRaidNotificationRecord | null> {
    throw new Error("Not used by these tests.");
  }

  listResumable(input: {
    now: Date;
    processingStaleBefore: Date;
  }): Promise<BarrelRaidNotificationRecord[]> {
    return Promise.resolve(
      Array.from(this.records.values())
        .filter(
          (record) =>
            record.status === "pending" ||
            (record.status === "processing" &&
              record.processingStartedAt !== null &&
              record.processingStartedAt <= input.processingStaleBefore)
        )
        .map(structuredCloneNotification)
    );
  }

  claimForProcessing(
    id: string,
    input: {
      now: Date;
      processingStaleBefore: Date;
    }
  ): Promise<BarrelRaidNotificationRecord | null> {
    const record = this.records.get(id);

    const canClaimPending =
      record?.status === "pending" && record.availableAt <= input.now;
    const canClaimStaleProcessing =
      record?.status === "processing" &&
      record.processingStartedAt !== null &&
      record.processingStartedAt <= input.processingStaleBefore;

    if (!record || (!canClaimPending && !canClaimStaleProcessing)) {
      return Promise.resolve(null);
    }

    const claimed = {
      ...record,
      status: "processing" as const,
      processingStartedAt: input.now,
      updatedAt: input.now
    };
    this.records.set(id, claimed);

    return Promise.resolve(structuredCloneNotification(claimed));
  }

  markRewardClaimed(id: string, now: Date): Promise<BarrelRaidNotificationRecord | null> {
    return this.update(id, now, {
      rewardClaimedAt: now,
      lastError: null
    });
  }

  markSent(id: string, now: Date): Promise<BarrelRaidNotificationRecord | null> {
    return this.update(id, now, {
      status: "sent",
      sentAt: now,
      processingStartedAt: null,
      lastError: null
    });
  }

  markSkipped(id: string, now: Date, reason?: string): Promise<BarrelRaidNotificationRecord | null> {
    return this.update(id, now, {
      status: "skipped",
      skippedAt: now,
      processingStartedAt: null,
      lastError: reason ?? null
    });
  }

  markPendingAfterFailure(
    id: string,
    now: Date,
    error: string
  ): Promise<BarrelRaidNotificationRecord | null> {
    return this.update(id, now, {
      status: "pending",
      processingStartedAt: null,
      lastError: error
    });
  }

  get(id: string): BarrelRaidNotificationRecord | null {
    const record = this.records.get(id);

    return record ? structuredCloneNotification(record) : null;
  }

  private update(
    id: string,
    now: Date,
    patch: Partial<BarrelRaidNotificationRecord>
  ): Promise<BarrelRaidNotificationRecord | null> {
    const record = this.records.get(id);

    if (!record) {
      return Promise.resolve(null);
    }

    const updated = {
      ...record,
      ...patch,
      updatedAt: now
    };
    this.records.set(id, updated);

    return Promise.resolve(structuredCloneNotification(updated));
  }
}

function structuredCloneNotification(
  record: BarrelRaidNotificationRecord
): BarrelRaidNotificationRecord {
  return {
    ...record
  };
}
