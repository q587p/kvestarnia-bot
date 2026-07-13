import type { Bot } from "grammy";
import type { PrismaClient } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRuntime } from "../../src/app/createRuntime";
import type { ApplicationServices } from "../../src/app/createServices";
import type { AppConfig } from "../../src/config/env";
import type { HealthServerOptions } from "../../src/health/server";

describe("createRuntime", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts health only when BOT_TOKEN is missing and stops once", async () => {
    const close = vi.fn();
    const disconnect = vi.fn().mockResolvedValue(undefined);
    const createBot = vi.fn();
    const createHealthRecoveryNotificationScheduler = vi.fn(() => makeScheduler());
    const servicesFixture = makeServices();
    const runtime = createRuntime({
      config: makeConfig({ botToken: undefined, hpRecoveryNotificationsEnabled: true }),
      prisma: makePrisma(disconnect),
      services: servicesFixture.services,
      dependencies: {
        createBot,
        createHealthRecoveryNotificationScheduler,
        startHealthServer: vi.fn(() => ({ close }) as never)
      }
    });

    await runtime.start();
    await runtime.start();
    await runtime.stop();
    await runtime.stop();

    expect(createBot).not.toHaveBeenCalled();
    expect(createHealthRecoveryNotificationScheduler).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("starts and stops bot schedulers explicitly", async () => {
    const close = vi.fn();
    const disconnect = vi.fn().mockResolvedValue(undefined);
    const botFixture = makeBot();
    const bot = botFixture.bot;
    const duelScheduler = makeScheduler();
    const combatScheduler = makeScheduler();
    const healthRecoveryScheduler = makeScheduler();
    const passageSearchScheduler = makeScheduler();
    const servicesFixture = makeServices({ passageSearch: true });
    const services = servicesFixture.services;
    let readiness: { isReady(): boolean } | undefined;
    const runtime = createRuntime({
      config: makeConfig({
        botToken: "token",
        botUsername: "kvestarnia_bot",
        hpRecoveryNotificationsEnabled: true
      }),
      prisma: makePrisma(disconnect),
      services,
      dependencies: {
        createBot: vi.fn(() => bot),
        createDuelTurnTimeoutScheduler: vi.fn(() => duelScheduler),
        createCombatTurnTimeoutScheduler: vi.fn(() => combatScheduler),
        createHealthRecoveryNotificationScheduler: vi.fn(() => healthRecoveryScheduler),
        createPassageSearchCompletionScheduler: vi.fn(() => passageSearchScheduler),
        getTelegramMenuCommands: vi.fn(() => [{ command: "start", description: "start" }]),
        startHealthServer: vi.fn((options: HealthServerOptions) => {
          readiness = options.readiness;
          return { close } as never;
        })
      }
    });

    await runtime.start();
    expect(readiness?.isReady()).toBe(true);
    await runtime.stop();
    expect(readiness?.isReady()).toBe(false);

    expect(botFixture.start).toHaveBeenCalledTimes(1);
    expect(botFixture.setMyCommands).toHaveBeenCalledTimes(1);
    expect(servicesFixture.cleanupExpiredPendingRuns).toHaveBeenCalledTimes(1);
    expect(servicesFixture.announceIfNeeded).toHaveBeenCalledWith(bot);
    expect(duelScheduler.start).toHaveBeenCalledTimes(1);
    expect(combatScheduler.start).toHaveBeenCalledTimes(1);
    expect(healthRecoveryScheduler.start).toHaveBeenCalledTimes(1);
    expect(passageSearchScheduler.start).toHaveBeenCalledTimes(1);
    expect(combatScheduler.stop).toHaveBeenCalledTimes(1);
    expect(healthRecoveryScheduler.stop).toHaveBeenCalledTimes(1);
    expect(duelScheduler.stop).toHaveBeenCalledTimes(1);
    expect(passageSearchScheduler.stop).toHaveBeenCalledTimes(1);
    expect(botFixture.stop).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("shares concurrent stop work across callers", async () => {
    const close = vi.fn();
    const disconnect = vi.fn().mockResolvedValue(undefined);
    const botFixture = makeBot();
    const duelScheduler = makeScheduler();
    const combatScheduler = makeScheduler();
    const healthRecoveryScheduler = makeScheduler();
    const runtime = createRuntime({
      config: makeConfig({ botToken: "token", hpRecoveryNotificationsEnabled: true }),
      prisma: makePrisma(disconnect),
      services: makeServices().services,
      dependencies: {
        createBot: vi.fn(() => botFixture.bot),
        createDuelTurnTimeoutScheduler: vi.fn(() => duelScheduler),
        createCombatTurnTimeoutScheduler: vi.fn(() => combatScheduler),
        createHealthRecoveryNotificationScheduler: vi.fn(() => healthRecoveryScheduler),
        getTelegramMenuCommands: vi.fn(() => []),
        startHealthServer: vi.fn(() => ({ close }) as never)
      }
    });

    await runtime.start();
    await Promise.all([runtime.stop(), runtime.stop()]);

    expect(combatScheduler.stop).toHaveBeenCalledTimes(1);
    expect(healthRecoveryScheduler.stop).toHaveBeenCalledTimes(1);
    expect(duelScheduler.stop).toHaveBeenCalledTimes(1);
    expect(botFixture.stop).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("does not let a delayed grammY onStart restart schedulers after shutdown", async () => {
    const disconnect = vi.fn().mockResolvedValue(undefined);
    const scheduler = makeScheduler();
    let pollingOptions: Parameters<Bot["start"]>[0] | undefined;
    const bot = {
      api: { setMyCommands: vi.fn().mockResolvedValue(undefined) },
      start: vi.fn((options: Parameters<Bot["start"]>[0]) => {
        pollingOptions = options;
        return new Promise<void>(() => undefined);
      }),
      stop: vi.fn().mockResolvedValue(undefined)
    } as unknown as Bot;
    const runtime = createRuntime({
      config: makeConfig({ botToken: "token", hpRecoveryNotificationsEnabled: true }),
      prisma: makePrisma(disconnect),
      services: makeServices().services,
      dependencies: {
        createBot: vi.fn(() => bot),
        createCombatTurnTimeoutScheduler: vi.fn(() => scheduler),
        createHealthRecoveryNotificationScheduler: vi.fn(() => scheduler),
        getTelegramMenuCommands: vi.fn(() => []),
        startHealthServer: vi.fn(() => ({ close: vi.fn() }) as never)
      }
    });

    await runtime.start();
    await runtime.stop();
    await pollingOptions?.onStart?.({} as never);

    expect(scheduler.start).not.toHaveBeenCalled();
    expect(scheduler.stop).not.toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("does not start resources after stop before start", async () => {
    const close = vi.fn();
    const disconnect = vi.fn().mockResolvedValue(undefined);
    const createBot = vi.fn();
    const startHealthServer = vi.fn(() => ({ close }) as never);
    const runtime = createRuntime({
      config: makeConfig({ botToken: "token", hpRecoveryNotificationsEnabled: true }),
      prisma: makePrisma(disconnect),
      services: makeServices().services,
      dependencies: {
        createBot,
        startHealthServer
      }
    });

    await runtime.stop();
    await runtime.start();

    expect(startHealthServer).not.toHaveBeenCalled();
    expect(createBot).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("closes health and disconnects Prisma when bot stop rejects", async () => {
    const close = vi.fn();
    const disconnect = vi.fn().mockResolvedValue(undefined);
    const stopError = new Error("telegram stop failed");
    const botFixture = makeBot({ stopError });
    const runtime = createRuntime({
      config: makeConfig({ botToken: "token" }),
      prisma: makePrisma(disconnect),
      services: makeServices().services,
      dependencies: {
        createBot: vi.fn(() => botFixture.bot),
        createDuelTurnTimeoutScheduler: vi.fn(() => makeScheduler()),
        createCombatTurnTimeoutScheduler: vi.fn(() => makeScheduler()),
        getTelegramMenuCommands: vi.fn(() => []),
        startHealthServer: vi.fn(() => ({ close }) as never)
      }
    });

    await runtime.start();
    await expect(runtime.stop()).rejects.toThrow(stopError);

    expect(close).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("keeps duel scheduler optional", async () => {
    const close = vi.fn();
    const disconnect = vi.fn().mockResolvedValue(undefined);
    const createDuelTurnTimeoutScheduler = vi.fn(() => makeScheduler());
    const createCombatTurnTimeoutScheduler = vi.fn(() => makeScheduler());
    const createHealthRecoveryNotificationScheduler = vi.fn(() => makeScheduler());
    const runtime = createRuntime({
      config: makeConfig({ botToken: "token", hpRecoveryNotificationsEnabled: true }),
      prisma: makePrisma(disconnect),
      services: makeServices({ duel: false }).services,
      dependencies: {
        createBot: vi.fn(() => makeBot().bot),
        createDuelTurnTimeoutScheduler,
        createCombatTurnTimeoutScheduler,
        createHealthRecoveryNotificationScheduler,
        getTelegramMenuCommands: vi.fn(() => []),
        startHealthServer: vi.fn(() => ({ close }) as never)
      }
    });

    await runtime.start();
    await runtime.stop();

    expect(createDuelTurnTimeoutScheduler).not.toHaveBeenCalled();
    expect(createCombatTurnTimeoutScheduler).toHaveBeenCalledTimes(1);
    expect(createHealthRecoveryNotificationScheduler).toHaveBeenCalledTimes(1);
  });

  it("does not construct or start HP recovery work when the rollout flag is off", async () => {
    const createHealthRecoveryNotificationScheduler = vi.fn(() => makeScheduler());
    const runtime = createRuntime({
      config: makeConfig({ botToken: "token", hpRecoveryNotificationsEnabled: false }),
      prisma: makePrisma(vi.fn().mockResolvedValue(undefined)),
      services: makeServices().services,
      dependencies: {
        createBot: vi.fn(() => makeBot().bot),
        createDuelTurnTimeoutScheduler: vi.fn(() => makeScheduler()),
        createCombatTurnTimeoutScheduler: vi.fn(() => makeScheduler()),
        createHealthRecoveryNotificationScheduler,
        getTelegramMenuCommands: vi.fn(() => []),
        startHealthServer: vi.fn(() => ({ close: vi.fn() }) as never)
      }
    });

    await runtime.start();
    await runtime.stop();

    expect(createHealthRecoveryNotificationScheduler).not.toHaveBeenCalled();
  });

  it("fails readiness closed when the database probe rejects", async () => {
    const close = vi.fn();
    const disconnect = vi.fn().mockResolvedValue(undefined);
    const queryError = Object.assign(new Error("private database path"), { code: "SQLITE_BUSY" });
    const queryRawUnsafe = vi.fn().mockRejectedValue(queryError);
    const createBot = vi.fn();
    const createHealthRecoveryNotificationScheduler = vi.fn(() => makeScheduler());
    let readiness: { isReady(): boolean } | undefined;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const runtime = createRuntime({
      config: makeConfig({ botToken: "token", hpRecoveryNotificationsEnabled: true }),
      prisma: makePrisma(disconnect, queryRawUnsafe),
      services: makeServices().services,
      dependencies: {
        createBot,
        createHealthRecoveryNotificationScheduler,
        startHealthServer: vi.fn((options: HealthServerOptions) => {
          readiness = options.readiness;
          return { close } as never;
        })
      }
    });

    await runtime.start();

    expect(createBot).not.toHaveBeenCalled();
    expect(createHealthRecoveryNotificationScheduler).not.toHaveBeenCalled();
    expect(readiness?.isReady()).toBe(false);
    expect(console.error).toHaveBeenCalledWith(
      "Квестарня: база не пройшла перевірку готовності.",
      { errorCategory: "database-locked" }
    );
    await runtime.stop();
  });

  it("fails readiness closed when Telegram polling startup rejects", async () => {
    const close = vi.fn();
    const disconnect = vi.fn().mockResolvedValue(undefined);
    const startError = Object.assign(new Error("private Telegram URL"), { name: "HttpError" });
    const botFixture = makeBot({ startError });
    const duelScheduler = makeScheduler();
    const combatScheduler = makeScheduler();
    const healthRecoveryScheduler = makeScheduler();
    let readiness: { isReady(): boolean } | undefined;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const runtime = createRuntime({
      config: makeConfig({ botToken: "token", hpRecoveryNotificationsEnabled: true }),
      prisma: makePrisma(disconnect),
      services: makeServices().services,
      dependencies: {
        createBot: vi.fn(() => botFixture.bot),
        createDuelTurnTimeoutScheduler: vi.fn(() => duelScheduler),
        createCombatTurnTimeoutScheduler: vi.fn(() => combatScheduler),
        createHealthRecoveryNotificationScheduler: vi.fn(() => healthRecoveryScheduler),
        getTelegramMenuCommands: vi.fn(() => []),
        startHealthServer: vi.fn((options: HealthServerOptions) => {
          readiness = options.readiness;
          return { close } as never;
        })
      }
    });

    await runtime.start();
    await vi.waitFor(() => expect(console.error).toHaveBeenCalledWith(
      "Квестарня: Telegram polling не запустився або аварійно завершився.",
      { errorCategory: "telegram-api" }
    ));

    expect(readiness?.isReady()).toBe(false);
    expect(duelScheduler.start).not.toHaveBeenCalled();
    expect(combatScheduler.start).not.toHaveBeenCalled();
    expect(healthRecoveryScheduler.start).not.toHaveBeenCalled();
    await runtime.stop();
    expect(duelScheduler.stop).not.toHaveBeenCalled();
    expect(combatScheduler.stop).not.toHaveBeenCalled();
    expect(healthRecoveryScheduler.stop).not.toHaveBeenCalled();
  });

  it("stops started schedulers once when polling rejects after onStart", async () => {
    const close = vi.fn();
    const disconnect = vi.fn().mockResolvedValue(undefined);
    const startError = Object.assign(new Error("private Telegram URL"), { name: "HttpError" });
    const botFixture = makeBot({ startErrorAfterOnStart: startError });
    const duelScheduler = makeScheduler();
    const combatScheduler = makeScheduler();
    const healthRecoveryScheduler = makeScheduler();
    let readiness: { isReady(): boolean } | undefined;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const runtime = createRuntime({
      config: makeConfig({ botToken: "token", hpRecoveryNotificationsEnabled: true }),
      prisma: makePrisma(disconnect),
      services: makeServices().services,
      dependencies: {
        createBot: vi.fn(() => botFixture.bot),
        createDuelTurnTimeoutScheduler: vi.fn(() => duelScheduler),
        createCombatTurnTimeoutScheduler: vi.fn(() => combatScheduler),
        createHealthRecoveryNotificationScheduler: vi.fn(() => healthRecoveryScheduler),
        getTelegramMenuCommands: vi.fn(() => []),
        startHealthServer: vi.fn((options: HealthServerOptions) => {
          readiness = options.readiness;
          return { close } as never;
        })
      }
    });

    await runtime.start();
    await vi.waitFor(() => expect(readiness?.isReady()).toBe(false));

    expect(duelScheduler.start).toHaveBeenCalledTimes(1);
    expect(combatScheduler.start).toHaveBeenCalledTimes(1);
    expect(healthRecoveryScheduler.start).toHaveBeenCalledTimes(1);
    expect(duelScheduler.stop).toHaveBeenCalledTimes(1);
    expect(combatScheduler.stop).toHaveBeenCalledTimes(1);
    expect(healthRecoveryScheduler.stop).toHaveBeenCalledTimes(1);
    await runtime.stop();
    expect(duelScheduler.stop).toHaveBeenCalledTimes(1);
    expect(combatScheduler.stop).toHaveBeenCalledTimes(1);
    expect(healthRecoveryScheduler.stop).toHaveBeenCalledTimes(1);
  });

  it("does not report a polling abort caused by shutdown as an emergency", async () => {
    const close = vi.fn();
    const disconnect = vi.fn().mockResolvedValue(undefined);
    const pollingAbort = Object.assign(new Error("expected stop abort"), { name: "AbortError" });
    const botFixture = makeBot({ rejectPendingStartOnStop: pollingAbort });
    const duelScheduler = makeScheduler();
    const combatScheduler = makeScheduler();
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const runtime = createRuntime({
      config: makeConfig({ botToken: "token" }),
      prisma: makePrisma(disconnect),
      services: makeServices().services,
      dependencies: {
        createBot: vi.fn(() => botFixture.bot),
        createDuelTurnTimeoutScheduler: vi.fn(() => duelScheduler),
        createCombatTurnTimeoutScheduler: vi.fn(() => combatScheduler),
        getTelegramMenuCommands: vi.fn(() => []),
        startHealthServer: vi.fn(() => ({ close }) as never)
      }
    });

    await runtime.start();
    await runtime.stop();
    await Promise.resolve();

    expect(errorLog).not.toHaveBeenCalledWith(
      "Квестарня: Telegram polling не запустився або аварійно завершився.",
      expect.anything()
    );
    expect(duelScheduler.start).not.toHaveBeenCalled();
    expect(combatScheduler.start).not.toHaveBeenCalled();
    expect(duelScheduler.stop).not.toHaveBeenCalled();
    expect(combatScheduler.stop).not.toHaveBeenCalled();
  });
});

function makeConfig(overrides: Partial<AppConfig>): AppConfig {
  return {
    nodeEnv: "test",
    databaseUrl: "file:./test.db",
    deployNotificationsEnabled: false,
    devGrantCommandsEnabled: false,
    combatBalanceAnalyticsEnabled: false,
    hpRecoveryNotificationsEnabled: false,
    ...overrides
  };
}

function makeServices(options: { duel?: boolean; passageSearch?: boolean; trainingDoppelganger?: boolean } = {}): {
  services: ApplicationServices;
  cleanupExpiredPendingRuns: ReturnType<typeof vi.fn>;
  announceIfNeeded: ReturnType<typeof vi.fn>;
} {
  const cleanupExpiredPendingRuns = vi.fn().mockResolvedValue(undefined);
  const announceIfNeeded = vi.fn().mockResolvedValue(undefined);
  const services = {
    devGrant: { isEnabled: vi.fn(() => false) },
    devReset: { isEnabled: vi.fn(() => false) },
    ...(options.duel === false ? {} : { duel: {} }),
    fight: {},
    equipment: {
      listDueAttunementNotifications: vi.fn(() => Promise.resolve([])),
      markAttunementNotified: vi.fn(() => Promise.resolve(false))
    },
    healthRecoveryNotifications: {
      runBatch: vi.fn(() => Promise.resolve({
        due: 0,
        claimed: 0,
        sent: 0,
        retried: 0,
        suppressed: 0,
        errors: 0
      }))
    },
    mantokChest: { cleanupExpiredPendingRuns },
    ...(options.passageSearch ? { passageSearch: {} } : {}),
    presence: {},
    ...(options.trainingDoppelganger === false ? {} : { trainingDoppelganger: {} }),
    deployNotifications: { announceIfNeeded }
  } as unknown as ApplicationServices;

  return { services, cleanupExpiredPendingRuns, announceIfNeeded };
}

function makeBot(options: {
  startError?: Error;
  startErrorAfterOnStart?: Error;
  rejectPendingStartOnStop?: Error;
  stopError?: Error;
} = {}): {
  bot: Bot;
  setMyCommands: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
} {
  const setMyCommands = vi.fn().mockResolvedValue(undefined);
  let rejectPendingStart: ((error: Error) => void) | undefined;
  const start = vi.fn(async (pollingOptions?: Parameters<Bot["start"]>[0]) => {
    if (options.startError) {
      throw options.startError;
    }
    if (options.rejectPendingStartOnStop) {
      await new Promise<void>((_resolve, reject) => {
        rejectPendingStart = reject;
      });
      return;
    }

    await pollingOptions?.onStart?.({} as never);
    if (options.startErrorAfterOnStart) {
      throw options.startErrorAfterOnStart;
    }

    await new Promise<void>(() => undefined);
  });
  const stop = vi.fn(() => {
    if (options.rejectPendingStartOnStop) {
      rejectPendingStart?.(options.rejectPendingStartOnStop);
    }
    if (options.stopError) {
      return Promise.reject(options.stopError);
    }
    return Promise.resolve();
  });
  const bot = {
    api: {
      setMyCommands
    },
    start,
    stop
  } as unknown as Bot;

  return { bot, setMyCommands, start, stop };
}

function makePrisma(
  disconnect: ReturnType<typeof vi.fn>,
  queryRawUnsafe: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue([{ ready: 1 }])
): Pick<PrismaClient, "$disconnect" | "$queryRawUnsafe"> {
  return {
    $disconnect: disconnect,
    $queryRawUnsafe: queryRawUnsafe
  };
}

function makeScheduler(): { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> } {
  return {
    start: vi.fn(),
    stop: vi.fn()
  };
}
