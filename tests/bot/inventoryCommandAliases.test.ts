import { Bot } from "grammy";
import { describe, expect, it } from "vitest";
import { registerEquipmentCommand } from "../../src/bot/commands/equipmentCommand";
import { registerInventoryCommand } from "../../src/bot/commands/inventoryCommand";
import type { EquipmentService } from "../../src/services/equipmentService";
import type { InventoryService } from "../../src/services/inventoryService";

describe("inventory command aliases", () => {
  it("opens compact equipment for /equipment and slot controls for /equip", async () => {
    const replies: ReplyPayload[] = [];
    const bot = createTestBot(replies);
    const equipment = {
      getEquipmentForTelegramUser: () => Promise.resolve({ state: "ready" as const, slots: [] })
    } as unknown as EquipmentService;
    registerEquipmentCommand(bot, equipment);

    await bot.handleUpdate(commandUpdate("/equipment", 1));
    await bot.handleUpdate(commandUpdate("/equip", 2));

    expect(flatButtonTexts(replies[0])).toEqual(["🔄 Змінити спорядження"]);
    expect(flatButtonTexts(replies[1])).toEqual([
      "🎩 Показати голову",
      "🧥 Показати тулуб",
      "🥾 Показати ноги",
      "💍 Показати аксесуари",
      "🧰 Показати інструменти",
      "🗡️ Показати основну руку",
      "✋ Показати другу руку",
      "⬅️ До спорядження"
    ]);
  });

  it("shows A ahead of B in /bag after A, B, full depletion, and A reacquisition", async () => {
    const replies: ReplyPayload[] = [];
    const bot = createTestBot(replies);
    const bagItems: TestItem[] = [];
    acquire(bagItems, "item.abetka", "Абетка", "2026-07-18T10:00:00.000Z");
    acquire(bagItems, "item.yakir", "Якір", "2026-07-19T10:00:00.000Z");
    acquire(bagItems, "item.bochka", "Бочка", "2026-07-20T10:00:00.000Z");
    deplete(bagItems, "item.yakir");
    acquire(bagItems, "item.yakir", "Якір", "2026-07-21T10:00:00.000Z");
    const inventory = {
      listForTelegramUser: () => Promise.resolve({
        state: "found" as const,
        totalGoldValue: 0,
        items: bagItems
      })
    } as unknown as InventoryService;
    registerInventoryCommand(bot, inventory);

    await bot.handleUpdate(commandUpdate("/items", 1));
    await bot.handleUpdate(commandUpdate("/bag", 2));

    expect(itemButtonTexts(replies[0])).toEqual(["🔎 Абетка", "🔎 Бочка", "🔎 Якір"]);
    expect(flatButtonTexts(replies[0])).toContain("🔤 Я-А");
    expect(itemButtonTexts(replies[1])).toEqual(["🔎 Якір", "🔎 Бочка", "🔎 Абетка"]);
    expect(flatButtonTexts(replies[1])).toContain("🕒 Нові в кінці");
  });
});

interface ReplyPayload {
  text?: unknown;
  reply_markup?: unknown;
}

function createTestBot(replies: ReplyPayload[]): Bot {
  const bot = new Bot("test-token", {
    botInfo: {
      id: 123,
      is_bot: true,
      first_name: "Квестарня",
      username: "kvestarnia_bot"
    }
  });
  bot.api.config.use((_prev, method, payload) => {
    if (method === "sendMessage") {
      replies.push(payload);
    }

    return Promise.resolve({
      ok: true,
      result: { message_id: replies.length }
    });
  });

  return bot;
}

function commandUpdate(text: string, updateId: number) {
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: 1,
      chat: { id: 42, type: "private" },
      from: { id: 42, is_bot: false, first_name: "Тест" },
      text,
      entities: [{ offset: 0, length: text.length, type: "bot_command" }]
    }
  };
}

function item(itemId: string, name: string, createdAt: string, quantity = 1) {
  return {
    id: `character-${itemId}`,
    itemId,
    quantity,
    createdAt: new Date(createdAt),
    content: {
      id: itemId,
      name,
      description: "Тестова манатка.",
      rarity: "common" as const,
      slot: "junk",
      priceless: true
    }
  };
}

type TestItem = ReturnType<typeof item>;

function acquire(items: TestItem[], itemId: string, name: string, acquiredAt: string): void {
  const existing = items.find((entry) => entry.itemId === itemId);
  if (existing) {
    existing.quantity += 1;
    return;
  }

  items.push(item(itemId, name, acquiredAt));
}

function deplete(items: TestItem[], itemId: string): void {
  const index = items.findIndex((entry) => entry.itemId === itemId);
  if (index >= 0) items.splice(index, 1);
}

function itemButtonTexts(payload: ReplyPayload | undefined): string[] {
  return flatButtonTexts(payload).filter((text) => text.startsWith("🔎 "));
}

function flatButtonTexts(payload: ReplyPayload | undefined): string[] {
  const markup = typeof payload?.reply_markup === "string"
    ? JSON.parse(payload.reply_markup) as { inline_keyboard?: Array<Array<{ text: string }>> }
    : payload?.reply_markup as { inline_keyboard?: Array<Array<{ text: string }>> } | undefined;

  return markup?.inline_keyboard?.flat().map((button) => button.text) ?? [];
}
