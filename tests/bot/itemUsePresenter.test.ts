import { describe, expect, it } from "vitest";
import { presentItemUseConfirm } from "../../src/bot/presenters/itemUsePresenter";
import type { ItemUseConfirmRepositoryResult, ItemUseOrderRecord } from "../../src/db/repositories/itemUseRepository";
import { ITEM_USE_RULES_VERSION } from "../../src/domain/itemUse";

describe("itemUsePresenter", () => {
  it("renders the stored full-HP terminal result instead of the stale preview", () => {
    const result: ItemUseConfirmRepositoryResult = {
      state: "full-hp",
      character: {
        id: "character-1",
        userId: "user-1",
        name: "Мандрівник",
        pronoun: "they",
        path: "boundary",
        raceId: "race.human-ish",
        classId: "class.warrior",
        level: 4,
        xp: 0,
        gold: 0,
        hpCurrent: 41,
        hpMax: 25,
        manaCurrent: 10,
        manaMax: 10,
        statsJson: {}
      },
      order: makeOrder()
    };

    expect(presentItemUseConfirm(result)).toContain("HP уже повні: <b>41/41</b>.");
    expect(presentItemUseConfirm(result)).not.toContain("10/41");
  });
});

function makeOrder(): ItemUseOrderRecord {
  const now = new Date("2026-06-25T09:00:00.000Z");

  return {
    id: "order-1",
    token: "token-1",
    characterId: "character-1",
    telegramUserId: 42n,
    remortCount: 0,
    itemId: "item.responsible-panic-bandage",
    itemName: "Бинт відповідальної паніки",
    itemFingerprint: "fingerprint",
    quantity: 1,
    effectKind: "heal-hp",
    status: "completed",
    preview: {
      rulesVersion: ITEM_USE_RULES_VERSION,
      hpBefore: 10,
      hpMax: 41,
      healAmount: 7,
      hpAfter: 17
    },
    result: {
      rulesVersion: ITEM_USE_RULES_VERSION,
      kind: "full-hp",
      itemId: "item.responsible-panic-bandage",
      itemName: "Бинт відповідальної паніки",
      hpBefore: 41,
      hpMax: 41,
      healAmount: 0,
      hpAfter: 41
    },
    expiresAt: new Date("2026-06-25T09:23:00.000Z"),
    completedAt: now,
    cancelledAt: null,
    createdAt: now,
    updatedAt: now
  };
}
