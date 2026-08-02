import { describe, expect, it, vi } from "vitest";
import type { DailyActionRecord } from "../../src/db/repositories/dailyActionRepository";
import { isQuestConsumableUseUnlocked } from "../../src/services/questConsumableUse";

describe("quest consumable use", () => {
  it("does not query quest state for ordinary consumables", async () => {
    const findForTelegramUser = vi.fn();

    await expect(isQuestConsumableUseUnlocked(
      { findForTelegramUser },
      42n,
      "item.loot-v1-c001"
    )).resolves.toBe(true);
    expect(findForTelegramUser).not.toHaveBeenCalled();
  });

  it("protects a current-life cellar bottle until the keep ending", async () => {
    const acquisition = action("cellar.grownup.bottle", null);
    const findForTelegramUser = vi.fn()
      .mockResolvedValueOnce(acquisition)
      .mockResolvedValueOnce(null);

    await expect(isQuestConsumableUseUnlocked(
      { findForTelegramUser },
      42n,
      "item.cellar.foamy-mirage-bottle"
    )).resolves.toBe(false);
  });

  it("unlocks the kept bottle but not an impossible leftover after turn-in", async () => {
    const acquisition = action("cellar.grownup.bottle", null);
    const findKept = vi.fn()
      .mockResolvedValueOnce(acquisition)
      .mockResolvedValueOnce(action("cellar.grownup.completed", { ending: "keep" }));
    const findTurnedIn = vi.fn()
      .mockResolvedValueOnce(acquisition)
      .mockResolvedValueOnce(action("cellar.grownup.completed", { ending: "turn-in" }));

    await expect(isQuestConsumableUseUnlocked(
      { findForTelegramUser: findKept },
      42n,
      "item.cellar.foamy-mirage-bottle"
    )).resolves.toBe(true);
    await expect(isQuestConsumableUseUnlocked(
      { findForTelegramUser: findTurnedIn },
      42n,
      "item.cellar.foamy-mirage-bottle"
    )).resolves.toBe(false);
  });

  it("does not permanently lock a legacy or remort-carried bottle after current-life ledgers reset", async () => {
    const findForTelegramUser = vi.fn().mockResolvedValue(null);

    await expect(isQuestConsumableUseUnlocked(
      { findForTelegramUser },
      42n,
      "item.cellar.foamy-mirage-bottle"
    )).resolves.toBe(true);
  });
});

function action(key: string, resultJson: unknown): DailyActionRecord {
  return {
    id: `action-${key}`,
    characterId: "character-42",
    key,
    localDate: "once",
    rewardXp: 0,
    rewardGold: 0,
    spentGold: 0,
    resultJson: resultJson as DailyActionRecord["resultJson"],
    createdAt: new Date("2026-08-01T12:00:00.000Z")
  };
}
