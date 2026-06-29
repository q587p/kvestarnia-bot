import { describe, expect, it } from "vitest";
import {
  presentItemPostalDraft,
  presentItemPostalNotification,
  presentItemPostalRecipients,
  presentItemPostalRespond
} from "../../src/bot/presenters/itemPostalPresenter";
import type { ItemPostalConfirmServiceResult, ItemPostalDraftViewResult } from "../../src/services/itemTransferService";

describe("item postal presenter", () => {
  it("lists known recipients without location or online status details", () => {
    const text = presentItemPostalRecipients({
      state: "ready",
      page: 0,
      pageSize: 5,
      total: 1,
      totalPages: 1,
      visible: [{ telegramUserId: 2n, name: "Дара", level: 4 }]
    });

    expect(text).toContain("📮 <b>Пошта Квестарні</b>");
    expect(text).toContain("Дара");
    expect(text).not.toContain("location.");
    expect(text).not.toContain("актив");
    expect(text).not.toContain("поруч");
  });

  it("explains empty postal recipients as known by gifts, duels or Bard reactions", () => {
    const text = presentItemPostalRecipients({
      state: "ready",
      page: 0,
      pageSize: 5,
      total: 0,
      totalPages: 0,
      visible: []
    });

    expect(text).toContain("подарунок манатки, дуель або реакція на виступ");
    expect(text).not.toContain("передача манатки");
    expect(presentItemPostalDraft({ state: "target-not-found" })).toContain("прийнятим подарунком манатки");
  });

  it("renders draft, notification and replay package summaries with fee", () => {
    const draft: ItemPostalDraftViewResult = {
      state: "draft",
      transfer: transfer("draft"),
      sender: character("Дарувальник"),
      receiver: character("Отримувач"),
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
        },
        selectionGuard: "guardABC1234"
      }],
      page: 0,
      pageCount: 1,
      packageLines: transfer("draft").packageLines,
      deliveryFeeGold: 18
    };
    const confirmed: ItemPostalConfirmServiceResult = {
      state: "created",
      transfer: transfer("pending"),
      sender: character("Дарувальник <&>"),
      receiver: character("Отримувач")
    };

    expect(presentItemPostalDraft(draft)).toContain("Ложка &lt;бантом&gt;");
    expect(presentItemPostalDraft(draft)).toContain("Плата за дорогу: <b>18 золота</b>");
    expect(presentItemPostalNotification(confirmed)).toContain("Дарувальник &lt;&amp;&gt;");
    expect(presentItemPostalRespond({ state: "replayed", transfer: transfer("completed"), sender: null, receiver: null }))
      .toContain("Пакунок уже записано");
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

function transfer(status: "draft" | "pending" | "completed") {
  return {
    id: "postal-1",
    token: "abcDEF12_3456789012",
    transferKind: "postal" as const,
    senderCharacterId: "sender",
    receiverCharacterId: "receiver",
    senderTelegramUserId: 1n,
    receiverTelegramUserId: 2n,
    senderName: "Дарувальник",
    receiverName: "Отримувач",
    senderRemortCount: 0,
    receiverRemortCount: 0,
    locationId: null,
    itemId: "item.ribbon-spoon",
    itemName: "Ложка <бантом>",
    itemFingerprint: "fingerprint",
    quantity: 2,
    packageLines: [{
      itemId: "item.ribbon-spoon",
      itemName: "Ложка <бантом>",
      quantity: 2,
      itemFingerprint: "fingerprint",
      unitGoldValue: 13,
      observedQuantity: 2,
      tags: []
    }],
    deliveryFeeGold: 18,
    status,
    result: null,
    expiresAt: new Date("2026-06-24T10:23:00.000Z"),
    completedAt: status === "completed" ? new Date("2026-06-24T10:00:00.000Z") : null,
    respondedAt: null,
    createdAt: new Date("2026-06-24T10:00:00.000Z"),
    updatedAt: new Date("2026-06-24T10:00:00.000Z")
  };
}
