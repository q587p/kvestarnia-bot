import { describe, expect, it } from "vitest";
import {
  buildItemPostalDraftKeyboard,
  buildItemPostalRecipientsKeyboard
} from "../../src/bot/keyboards/itemPostalKeyboard";
import type { ItemPostalDraftViewResult, ItemPostalRecipientsListResult } from "../../src/services/itemTransferService";

describe("item postal keyboard", () => {
  it("removes a single selected line instead of showing dead x1 or max buttons", () => {
    const keyboard = buildItemPostalDraftKeyboard(draft({
      quantity: 1,
      observedQuantity: 1
    }));
    const texts = flatTexts(keyboard);

    expect(texts).toContain("➖");
    expect(texts).not.toContain("×1");
    expect(texts).not.toContain("93");
    expect(texts).not.toContain("+1");
  });

  it("shows only available quantity steps for larger selected stacks", () => {
    const keyboard = buildItemPostalDraftKeyboard(draft({
      quantity: 12,
      observedQuantity: 70
    }));
    const texts = flatTexts(keyboard);

    expect(texts).toEqual(expect.arrayContaining(["-1", "-5", "-10", "+1", "+5", "+10", "+50"]));
    expect(texts).not.toContain("-50");
    expect(texts).not.toContain("×12");
    expect(texts).not.toContain("93");
  });

  it("shows bulk add steps only when the owned stack can support them", () => {
    const keyboard = buildItemPostalDraftKeyboard(draft({
      quantity: 1,
      observedQuantity: 3
    }));
    const texts = flatTexts(keyboard);

    expect(texts).toContain("+1");
    expect(texts).not.toContain("+5");
  });

  it("adds pagination callbacks for in-transit and history sections", () => {
    const keyboard = buildItemPostalRecipientsKeyboard({
      state: "ready",
      page: 0,
      pageSize: 5,
      total: 0,
      totalPages: 1,
      visible: [],
      inTransit: {
        page: 0,
        pageSize: 5,
        total: 6,
        totalPages: 2,
        visible: []
      },
      history: {
        page: 0,
        pageSize: 5,
        total: 6,
        totalPages: 2,
        visible: []
      }
    } satisfies ItemPostalRecipientsListResult);
    const callbacks = flatCallbacks(keyboard);

    expect(callbacks).toContain("v1:post:t:1");
    expect(callbacks).toContain("v1:post:h:1");
  });
});

function draft(input: { quantity: number; observedQuantity: number }): ItemPostalDraftViewResult {
  const line = {
    itemId: "item.test-postal",
    itemName: "Поштова ложка",
    quantity: input.quantity,
    itemFingerprint: "fingerprint",
    unitGoldValue: 13,
    observedQuantity: input.observedQuantity,
    tags: []
  };

  return {
    state: "draft",
    transfer: {
      id: "postal-1",
      token: "abcDEF12_3456789012",
      transferKind: "postal",
      senderCharacterId: "sender",
      receiverCharacterId: "receiver",
      senderTelegramUserId: 1n,
      receiverTelegramUserId: 2n,
      senderName: "Дарувальник",
      receiverName: "Отримувач",
      senderRemortCount: 0,
      receiverRemortCount: 0,
      locationId: null,
      itemId: "item.test-postal",
      itemName: "Поштова ложка",
      itemFingerprint: "fingerprint",
      quantity: input.quantity,
      packageLines: [line],
      deliveryFeeGold: 6,
      status: "draft",
      result: null,
      expiresAt: new Date("2026-07-01T10:00:00.000Z"),
      completedAt: null,
      respondedAt: null,
      createdAt: new Date("2026-06-24T10:00:00.000Z"),
      updatedAt: new Date("2026-06-24T10:00:00.000Z")
    },
    sender: character("Дарувальник"),
    receiver: character("Отримувач"),
    items: [],
    page: 0,
    pageCount: 1,
    packageLines: [line],
    deliveryFeeGold: 6
  };
}

function character(name: string) {
  return {
    name,
    title: "Тестер",
    pronoun: "they" as const,
    path: "boundary" as const,
    raceId: "race.human",
    raceName: "Людина",
    classId: "class.ranger",
    className: "Рейнджер",
    level: 4,
    xp: 0,
    nextLevelXp: 100,
    gold: 10,
    hpCurrent: 20,
    hpMax: 20,
    manaCurrent: 10,
    manaMax: 10,
    stats: { strength: 1, dexterity: 1, intelligence: 1, charisma: 1, luck: 1 },
    effectiveStats: { strength: 1, dexterity: 1, intelligence: 1, charisma: 1, luck: 1 },
    remortCount: 0
  };
}

function flatTexts(keyboard: { inline_keyboard: Array<Array<{ text: string }>> }): string[] {
  return keyboard.inline_keyboard.flat().map((button) => button.text);
}

function flatCallbacks(keyboard: { inline_keyboard: Array<Array<{ callback_data?: string }>> }): string[] {
  return keyboard.inline_keyboard.flat().map((button) => button.callback_data ?? "");
}
