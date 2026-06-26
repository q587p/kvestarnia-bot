import { describe, expect, it } from "vitest";
import { presentItemUseConfirm, presentItemUseRestoreToFull } from "../../src/bot/presenters/itemUsePresenter";
import type {
  ItemUseConfirmRepositoryResult,
  ItemUseOrderRecord,
  ItemUseRestoreToFullRepositoryResult
} from "../../src/db/repositories/itemUseRepository";
import type { CharacterRecord } from "../../src/db/repositories/characterRepository";
import { ITEM_USE_RULES_VERSION } from "../../src/domain/itemUse";

describe("itemUsePresenter", () => {
  it("renders the stored full-HP terminal result instead of the stale preview", () => {
    const result: ItemUseConfirmRepositoryResult = {
      state: "full-hp",
      character: makeCharacter(),
      order: makeOrder()
    };

    expect(presentItemUseConfirm(result)).toContain("HP уже повні: <b>41/41</b>.");
    expect(presentItemUseConfirm(result)).not.toContain("10/41");
  });

  it("renders restore-to-full quantity and final HP", () => {
    const result: ItemUseRestoreToFullRepositoryResult = {
      state: "restored",
      character: makeCharacter(),
      result: {
        rulesVersion: ITEM_USE_RULES_VERSION,
        itemId: "item.responsible-panic-bandage",
        itemName: "Бинт відповідальної паніки",
        quantity: 2,
        hpBefore: 30,
        hpMax: 44,
        healAmount: 14,
        hpAfter: 44
      }
    };

    const text = presentItemUseRestoreToFull(result);

    expect(text).toContain("Використано бинтів: <b>2</b>.");
    expect(text).toContain("HP: <b>30/44</b> → <b>44/44</b>.");
  });

  it("renders restore-to-full preview quantity before spending", () => {
    const result: ItemUseRestoreToFullRepositoryResult = {
      state: "preview-created",
      character: makeCharacter(),
      neededQuantity: 2,
      availableQuantity: 3,
      order: {
        ...makeOrder(),
        quantity: 2,
        status: "pending",
        preview: {
          rulesVersion: ITEM_USE_RULES_VERSION,
          mode: "restore-to-full",
          hpBefore: 30,
          hpMax: 44,
          healAmount: 14,
          hpAfter: 44
        },
        result: null
      }
    };

    const text = presentItemUseRestoreToFull(result);

    expect(text).toContain("Відновитися до повного HP?");
    expect(text).toContain("Бракує HP: <b>14</b>.");
    expect(text).toContain("Буде витрачено бинтів: <b>2</b>.");
    expect(text).toContain("У торбі зараз: <b>3</b>.");
  });

  it("renders canonical bulk restore confirmation result", () => {
    const result: ItemUseConfirmRepositoryResult = {
      state: "replayed",
      character: makeCharacter(),
      order: {
        ...makeOrder(),
        quantity: 2,
        preview: {
          rulesVersion: ITEM_USE_RULES_VERSION,
          mode: "restore-to-full",
          hpBefore: 30,
          hpMax: 44,
          healAmount: 14,
          hpAfter: 44
        },
        result: {
          rulesVersion: ITEM_USE_RULES_VERSION,
          mode: "restore-to-full",
          kind: "heal-hp",
          itemId: "item.responsible-panic-bandage",
          itemName: "Бинт відповідальної паніки",
          hpBefore: 30,
          hpMax: 44,
          healAmount: 14,
          hpAfter: 44
        }
      }
    };

    const text = presentItemUseConfirm(result);

    expect(text).toContain("Відновлення завершено");
    expect(text).toContain("Результат уже записано раніше.");
    expect(text).toContain("Використано бинтів: <b>2</b>.");
    expect(text).toContain("HP: <b>30/44</b> → <b>44/44</b>.");
  });
});

function makeCharacter(): CharacterRecord {
  return {
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
  };
}

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
