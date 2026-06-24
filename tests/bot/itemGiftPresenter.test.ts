import { describe, expect, it } from "vitest";
import {
  presentItemGiftCreate,
  presentItemGiftNotification,
  presentItemGiftRespond,
  presentItemGiftSelection
} from "../../src/bot/presenters/itemGiftPresenter";
import type { ItemGiftCreateResult, ItemGiftSelectionResult } from "../../src/services/itemTransferService";

describe("item gift presenter", () => {
  it("escapes recipient and item names in the selection and offer cards", () => {
    const selection: ItemGiftSelectionResult = {
      state: "selection",
      target: { telegramUserId: 2n, name: "Друг <&>", level: 4, status: "active" },
      character: character("Дарувальник"),
      items: [{
        index: 0,
        itemId: "item.ribbon-spoon",
        quantity: 2,
        content: {
          id: "item.ribbon-spoon",
          name: "Ложка <бантом>",
          description: "Тест.",
          rarity: "common",
          slot: "junk",
          goldValue: 13
        }
      }],
      page: 0,
      pageCount: 1
    };

    expect(presentItemGiftSelection(selection)).toContain("Друг &lt;&amp;&gt;");
    expect(presentItemGiftSelection(selection)).toContain("Ложка &lt;бантом&gt;");
  });

  it("renders completed and replayed gift states from frozen audit data", () => {
    const created: ItemGiftCreateResult = {
      state: "created",
      sender: character("Дарувальник <&>"),
      receiver: character("Отримувач"),
      transfer: transfer()
    };

    expect(presentItemGiftCreate(created)).toContain("Манатка: <b>Ложка &lt;бантом&gt;</b> ×1");
    expect(presentItemGiftNotification(created)).toContain("Дарувальник &lt;&amp;&gt;");
    expect(presentItemGiftRespond({ state: "replayed", transfer: transfer(), sender: null, receiver: null }))
      .toContain("Подарунок уже записано");
  });
});

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

function transfer() {
  return {
    id: "gift-1",
    token: "abcDEF12",
    senderCharacterId: "sender",
    receiverCharacterId: "receiver",
    senderTelegramUserId: 1n,
    receiverTelegramUserId: 2n,
    senderName: "Дарувальник",
    receiverName: "Отримувач",
    senderRemortCount: 0,
    receiverRemortCount: 0,
    locationId: "location.korchma.bar",
    itemId: "item.ribbon-spoon",
    itemName: "Ложка <бантом>",
    itemFingerprint: "fingerprint",
    quantity: 1,
    status: "completed" as const,
    result: null,
    expiresAt: new Date("2026-06-24T10:23:00.000Z"),
    completedAt: new Date("2026-06-24T10:00:00.000Z"),
    respondedAt: null,
    createdAt: new Date("2026-06-24T10:00:00.000Z"),
    updatedAt: new Date("2026-06-24T10:00:00.000Z")
  };
}
