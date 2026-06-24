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
    const servicesFixture = makeServices();
    const services = servicesFixture.services;
    const runtime = createRuntime({
      config: makeConfig({ botToken: "token", botUsername: "kvestarnia_bot" }),
      prisma: { $disconnect: disconnect },
      services,
      dependencies: {
        createBot: vi.fn(() => bot),
        createDuelTurnTimeoutScheduler: vi.fn(() => duelScheduler),
        createCombatTurnTimeoutScheduler: vi.fn(() => combatScheduler),
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
    expect(combatScheduler.stop).toHaveBeenCalledTimes(1);
    expect(duelScheduler.stop).toHaveBeenCalledTimes(1);
    expect(botFixture.stop).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
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

function makeServices(): {
  services: ApplicationServices;
  cleanupExpiredPendingRuns: ReturnType<typeof vi.fn>;
  announceIfNeeded: ReturnType<typeof vi.fn>;
} {
  const cleanupExpiredPendingRuns = vi.fn().mockResolvedValue(undefined);
  const announceIfNeeded = vi.fn().mockResolvedValue(undefined);
  const services = {
    devGrant: { isEnabled: vi.fn(() => false) },
    devReset: { isEnabled: vi.fn(() => false) },
    duel: {},
    fight: {},
    mantokChest: { cleanupExpiredPendingRuns },
    presence: {},
    trainingDoppelganger: {},
    deployNotifications: { announceIfNeeded }
  } as unknown as ApplicationServices;

  return { services, cleanupExpiredPendingRuns, announceIfNeeded };
}

function makeBot(): {
  bot: Bot;
  setMyCommands: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
} {
  const setMyCommands = vi.fn().mockResolvedValue(undefined);
  const start = vi.fn().mockResolvedValue(undefined);
  const stop = vi.fn().mockResolvedValue(undefined);
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
