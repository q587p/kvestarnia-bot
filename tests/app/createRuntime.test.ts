import type { Bot } from "grammy";
import { describe, expect, it, vi } from "vitest";
import { createRuntime } from "../../src/app/createRuntime";
import type { ApplicationServices } from "../../src/app/createServices";
import type { AppConfig } from "../../src/config/env";

describe("createRuntime", () => {
  it("starts health only when BOT_TOKEN is missing and stops once", async () => {
    const close = vi.fn();
    const disconnect = vi.fn().mockResolvedValue(undefined);
    const createBot = vi.fn();
    const servicesFixture = makeServices();
    const runtime = createRuntime({
      config: makeConfig({ botToken: undefined }),
      prisma: { $disconnect: disconnect },
      services: servicesFixture.services,
      dependencies: {
        createBot,
        startHealthServer: vi.fn(() => ({ close }) as never)
      }
    });

    runtime.start();
    runtime.start();
    await runtime.stop();
    await runtime.stop();

    expect(createBot).not.toHaveBeenCalled();
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
    const passageSearchScheduler = makeScheduler();
    const servicesFixture = makeServices({ passageSearch: true });
    const services = servicesFixture.services;
    const runtime = createRuntime({
      config: makeConfig({ botToken: "token", botUsername: "kvestarnia_bot" }),
      prisma: { $disconnect: disconnect },
      services,
      dependencies: {
        createBot: vi.fn(() => bot),
        createDuelTurnTimeoutScheduler: vi.fn(() => duelScheduler),
        createCombatTurnTimeoutScheduler: vi.fn(() => combatScheduler),
        createPassageSearchCompletionScheduler: vi.fn(() => passageSearchScheduler),
        getTelegramMenuCommands: vi.fn(() => [{ command: "start", description: "start" }]),
        startHealthServer: vi.fn(() => ({ close }) as never)
      }
    });

    runtime.start();
    await runtime.stop();

    expect(botFixture.start).toHaveBeenCalledTimes(1);
    expect(botFixture.setMyCommands).toHaveBeenCalledTimes(1);
    expect(servicesFixture.cleanupExpiredPendingRuns).toHaveBeenCalledTimes(1);
    expect(servicesFixture.announceIfNeeded).toHaveBeenCalledWith(bot);
    expect(duelScheduler.start).toHaveBeenCalledTimes(1);
    expect(combatScheduler.start).toHaveBeenCalledTimes(1);
    expect(passageSearchScheduler.start).toHaveBeenCalledTimes(1);
    expect(combatScheduler.stop).toHaveBeenCalledTimes(1);
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
    const runtime = createRuntime({
      config: makeConfig({ botToken: "token" }),
      prisma: { $disconnect: disconnect },
      services: makeServices().services,
      dependencies: {
        createBot: vi.fn(() => botFixture.bot),
        createDuelTurnTimeoutScheduler: vi.fn(() => duelScheduler),
        createCombatTurnTimeoutScheduler: vi.fn(() => combatScheduler),
        getTelegramMenuCommands: vi.fn(() => []),
        startHealthServer: vi.fn(() => ({ close }) as never)
      }
    });

    runtime.start();
    await Promise.all([runtime.stop(), runtime.stop()]);

    expect(combatScheduler.stop).toHaveBeenCalledTimes(1);
    expect(duelScheduler.stop).toHaveBeenCalledTimes(1);
    expect(botFixture.stop).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("does not start resources after stop before start", async () => {
    const close = vi.fn();
    const disconnect = vi.fn().mockResolvedValue(undefined);
    const createBot = vi.fn();
    const startHealthServer = vi.fn(() => ({ close }) as never);
    const runtime = createRuntime({
      config: makeConfig({ botToken: "token" }),
      prisma: { $disconnect: disconnect },
      services: makeServices().services,
      dependencies: {
        createBot,
        startHealthServer
      }
    });

    await runtime.stop();
    runtime.start();

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
      prisma: { $disconnect: disconnect },
      services: makeServices().services,
      dependencies: {
        createBot: vi.fn(() => botFixture.bot),
        createDuelTurnTimeoutScheduler: vi.fn(() => makeScheduler()),
        createCombatTurnTimeoutScheduler: vi.fn(() => makeScheduler()),
        getTelegramMenuCommands: vi.fn(() => []),
        startHealthServer: vi.fn(() => ({ close }) as never)
      }
    });

    runtime.start();
    await expect(runtime.stop()).rejects.toThrow(stopError);

    expect(close).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("keeps duel scheduler optional", async () => {
    const close = vi.fn();
    const disconnect = vi.fn().mockResolvedValue(undefined);
    const createDuelTurnTimeoutScheduler = vi.fn(() => makeScheduler());
    const createCombatTurnTimeoutScheduler = vi.fn(() => makeScheduler());
    const runtime = createRuntime({
      config: makeConfig({ botToken: "token" }),
      prisma: { $disconnect: disconnect },
      services: makeServices({ duel: false }).services,
      dependencies: {
        createBot: vi.fn(() => makeBot().bot),
        createDuelTurnTimeoutScheduler,
        createCombatTurnTimeoutScheduler,
        getTelegramMenuCommands: vi.fn(() => []),
        startHealthServer: vi.fn(() => ({ close }) as never)
      }
    });

    runtime.start();
    await runtime.stop();

    expect(createDuelTurnTimeoutScheduler).not.toHaveBeenCalled();
    expect(createCombatTurnTimeoutScheduler).toHaveBeenCalledTimes(1);
  });
});

function makeConfig(overrides: Partial<AppConfig>): AppConfig {
  return {
    nodeEnv: "test",
    databaseUrl: "file:./test.db",
    deployNotificationsEnabled: false,
    devGrantCommandsEnabled: false,
    combatBalanceAnalyticsEnabled: false,
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
    mantokChest: { cleanupExpiredPendingRuns },
    ...(options.passageSearch ? { passageSearch: {} } : {}),
    presence: {},
    ...(options.trainingDoppelganger === false ? {} : { trainingDoppelganger: {} }),
    deployNotifications: { announceIfNeeded }
  } as unknown as ApplicationServices;

  return { services, cleanupExpiredPendingRuns, announceIfNeeded };
}

function makeBot(options: { stopError?: Error } = {}): {
  bot: Bot;
  setMyCommands: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
} {
  const setMyCommands = vi.fn().mockResolvedValue(undefined);
  const start = vi.fn().mockResolvedValue(undefined);
  const stop = options.stopError
    ? vi.fn().mockRejectedValue(options.stopError)
    : vi.fn().mockResolvedValue(undefined);
  const bot = {
    api: {
      setMyCommands
    },
    start,
    stop
  } as unknown as Bot;

  return { bot, setMyCommands, start, stop };
}

function makeScheduler(): { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> } {
  return {
    start: vi.fn(),
    stop: vi.fn()
  };
}
