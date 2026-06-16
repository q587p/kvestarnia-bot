import { describe, expect, it, vi } from "vitest";
import { createBot, type BotServices } from "../../src/bot/createBot";

describe("support command and start deep links", () => {
  it("renders /support with configured URL", async () => {
    const calls = await captureMessageCalls("/support", servicesWith(), {
      supportBarrelUrl: "https://send.monobank.ua/jar/test-placeholder"
    });
    const message = calls.find((call) => call.method === "sendMessage");

    expect(String(message?.payload.text)).toContain("Бочка підтримки Квестарні");
    expect(String(message?.payload.text)).toContain("https://send.monobank.ua/jar/test-placeholder");
    expect(String(message?.payload.text)).toContain(
      "Підтримка не дає XP, золота, луту, манаток, рівнів, бойової сили, прогресу або доступу до фіч."
    );
    expectNoUnsafeRewardClaims(String(message?.payload.text));
    expect(String(message?.payload.text)).not.toContain("undefined");
  });

  it("renders /support fallback without a broken URL", async () => {
    const calls = await captureMessageCalls("/support", servicesWith());
    const message = calls.find((call) => call.method === "sendMessage");

    expect(String(message?.payload.text)).toContain("посилання ще прибивають");
    expect(String(message?.payload.text)).toContain(
      "Підтримка не дає XP, золота, луту, манаток, рівнів, бойової сили, прогресу або доступу до фіч."
    );
    expectNoUnsafeRewardClaims(String(message?.payload.text));
    expect(String(message?.payload.text)).not.toContain("undefined");
    expect(String(message?.payload.text)).not.toContain("https://");
  });

  it("renders /start barrel_thanks without starting onboarding", async () => {
    const onboardingStart = vi.fn();
    const calls = await captureMessageCalls(
      "/start barrel_thanks",
      servicesWith({
        onboarding: {
          start: onboardingStart
        }
      } as Partial<BotServices>),
      {
        supportBarrelUrl: "https://send.monobank.ua/jar/test-placeholder"
      }
    );
    const message = calls.find((call) => call.method === "sendMessage");

    expect(onboardingStart).not.toHaveBeenCalled();
    expect(String(message?.payload.text)).toContain("Бочка вдячно булькнула");
    expect(String(message?.payload.text)).toContain("Ефект косметичний");
    expect(String(message?.payload.text)).toContain(
      "Підтримка не дає XP, золота, луту, манаток, рівнів, бойової сили, прогресу або доступу до фіч."
    );
    expectNoUnsafeRewardClaims(String(message?.payload.text));
    expect(String(message?.payload.text)).not.toContain("https://send.monobank.ua");
  });

  it("keeps regular /start and unknown payloads on the onboarding path", async () => {
    const onboardingStart = vi.fn().mockResolvedValue({ state: "new-character" });
    await captureMessageCalls(
      "/start",
      servicesWith({
        onboarding: {
          start: onboardingStart
        }
      } as Partial<BotServices>)
    );
    await captureMessageCalls(
      "/start duel_future_token",
      servicesWith({
        onboarding: {
          start: onboardingStart
        }
      } as Partial<BotServices>)
    );

    expect(onboardingStart).toHaveBeenCalledTimes(2);
  });
});

interface ApiCall {
  method: string;
  payload: Record<string, unknown>;
}

async function captureMessageCalls(
  text: string,
  services: BotServices,
  options: { supportBarrelUrl?: string } = {}
): Promise<ApiCall[]> {
  const bot = createBot("123456:test-token", services, options);
  const calls: ApiCall[] = [];

  bot.api.config.use((_prev, method, payload) => {
    calls.push({
      method,
      payload
    });

    if (method === "getMe") {
      return Promise.resolve({
        ok: true,
        result: {
          id: 123456,
          is_bot: true,
          first_name: "Квестарня",
          username: "kvestarnia_bot"
        }
      });
    }

    return Promise.resolve({
      ok: true,
      result: true
    });
  });

  await bot.init();
  await bot.handleUpdate({
    update_id: 1,
    message: {
      message_id: 10,
      date: 0,
      text,
      entities: [
        {
          type: "bot_command",
          offset: 0,
          length: text.split(/\s/, 1)[0]?.length ?? text.length
        }
      ],
      chat: {
        id: 42,
        type: "private"
      },
      from: {
        id: 42,
        is_bot: false,
        first_name: "Тест"
      }
    }
  });

  return calls;
}

function servicesWith(overrides: Partial<BotServices> = {}): BotServices {
  return {
    adventure: {},
    cellarErrand: {},
    fight: {},
    hunt: {},
    yeger: {},
    onboarding: {
      start: () => Promise.resolve({ state: "new-character" })
    },
    hero: {},
    equipment: {},
    inventory: {},
    levelBarter: {},
    mantokChest: {},
    presence: {
      markAction: () => Promise.resolve()
    },
    devReset: {
      isEnabled: () => false
    },
    restart: {},
    tavern: {},
    ...overrides
  } as unknown as BotServices;
}

function expectNoUnsafeRewardClaims(text: string): void {
  expect(text).not.toContain("платіж підтверджено");
  expect(text).not.toContain("отримано XP");
  expect(text).not.toContain("видано золото");
  expect(text).not.toContain("манатку додано");
}
