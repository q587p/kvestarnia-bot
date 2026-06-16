import { describe, expect, it, vi } from "vitest";
import { createBot, type BotServices } from "../../src/bot/createBot";
import type { DevGrantItemsResult, DevGrantResult } from "../../src/services/devGrantService";

describe("dev grant commands", () => {
  it("passes explicit and default amounts to the dev grant service", async () => {
    const devGrant = fakeDevGrantService();
    const xpCalls = await captureMessageCalls("/dev_add_xp 7", devGrant);
    const itemCalls = await captureMessageCalls("/dev_add_random_item", devGrant);

    expect(devGrant.addXp).toHaveBeenCalledWith(42n, 7);
    expect(devGrant.addRandomItems).toHaveBeenCalledWith(42n, 1);
    expect(String(xpCalls.at(-1)?.payload.text)).toContain("додано 7 XP");
    expect(String(itemCalls.at(-1)?.payload.text)).toContain("додано 1 манатку");
  });

  it("rejects invalid amounts before mutating", async () => {
    const devGrant = fakeDevGrantService();
    const calls = await captureMessageCalls("/dev_add_gold nope", devGrant);

    expect(devGrant.addGold).not.toHaveBeenCalled();
    expect(String(calls.at(-1)?.payload.text)).toContain(
      "Формат: /dev_add_gold [додатне ціле число]."
    );
  });
});

interface ApiCall {
  method: string;
  payload: Record<string, unknown>;
}

async function captureMessageCalls(
  text: string,
  devGrant: ReturnType<typeof fakeDevGrantService>
): Promise<ApiCall[]> {
  const bot = createBot("123456:test-token", servicesWith(devGrant));
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

function fakeDevGrantService(): {
  isEnabled: ReturnType<typeof vi.fn<() => boolean>>;
  addLevel: ReturnType<typeof vi.fn<(telegramUserId: bigint, amount: number) => Promise<DevGrantResult>>>;
  addXp: ReturnType<typeof vi.fn<(telegramUserId: bigint, amount: number) => Promise<DevGrantResult>>>;
  addGold: ReturnType<typeof vi.fn<(telegramUserId: bigint, amount: number) => Promise<DevGrantResult>>>;
  addRandomItems: ReturnType<
    typeof vi.fn<(telegramUserId: bigint, amount: number) => Promise<DevGrantItemsResult>>
  >;
} {
  const character = {
    id: "character-42",
    userId: "user-42",
    name: "Тестовий пригодник",
    pronoun: "they",
    path: "boundary",
    raceId: "race.human-ish",
    classId: "class.warrior",
    level: 1,
    xp: 7,
    gold: 3,
    hpCurrent: 20,
    hpMax: 20,
    manaCurrent: 10,
    manaMax: 10,
    statsJson: {}
  };

  return {
    isEnabled: vi.fn(() => true),
    addLevel: vi.fn((_telegramUserId, amount) => Promise.resolve({
      state: "updated",
      kind: "level",
      amount,
      character,
      levelChange: {
        oldLevel: 1,
        newLevel: 2,
        leveledUp: true
      }
    })),
    addXp: vi.fn((_telegramUserId, amount) => Promise.resolve({
      state: "updated",
      kind: "xp",
      amount,
      character
    })),
    addGold: vi.fn((_telegramUserId, amount) => Promise.resolve({
      state: "updated",
      kind: "gold",
      amount,
      character
    })),
    addRandomItems: vi.fn((_telegramUserId, amount) => Promise.resolve({
      state: "updated",
      kind: "items",
      amount,
      character,
      itemGrants: [
        {
          itemId: "item.pan-of-persuasion",
          name: "Пательня переконання",
          quantity: amount
        }
      ]
    }))
  };
}

function servicesWith(devGrant: ReturnType<typeof fakeDevGrantService>): BotServices {
  return {
    adventure: {},
    cellarErrand: {},
    fight: {},
    hunt: {},
    yeger: {},
    onboarding: {},
    hero: {},
    equipment: {},
    inventory: {},
    levelBarter: {},
    mantokChest: {},
    presence: {
      markAction: () => Promise.resolve()
    },
    devGrant,
    devReset: {
      isEnabled: () => true
    },
    restart: {},
    tavern: {}
  } as unknown as BotServices;
}
